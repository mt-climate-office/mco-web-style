#!/usr/bin/env node
/* ============================================================================
   mco-web-style · tools/verify/head.mjs — static <head> + shell conformance
   App-agnostic: reads the entry page, its inline <style>, its local
   stylesheets and local scripts. No browser, no network, no dependencies.
   (Lifted from mesonet-dashboard's scripts/verify/consumer.mjs.)

     node tools/verify/head.mjs --root ../mesonet-status
     node tools/verify/head.mjs --root ../mesonet-photo-explorer --page docs/index.html

   Exits non-zero on any failed check. tools/conformance.mjs overlaps on
   purpose: it SCORES a consumer against the checklist; this GATES a deploy.
   ========================================================================== */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
// lib.mjs loads Playwright only in start(), so this runs with no node_modules.
import { args, check, finish } from './lib.mjs';

const a = args();
const root = resolve(a.root || '.');
const pagePath = join(root, a.page || 'index.html');
if (!existsSync(pagePath)) { console.error(`head: no ${pagePath}`); process.exit(2); }
const html = readFileSync(pagePath, 'utf8');
const pageDir = dirname(pagePath);
const head = html.slice(0, html.indexOf('</head>') === -1 ? html.length : html.indexOf('</head>'));
const tags = (re, src = html) => [...src.matchAll(re)].map((m) => m[0]);
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ??
  (new RegExp(`\\s${name}(\\s|>|/)`).test(tag) ? '' : null);
const local = (href) => href && !/^(https?:|data:|\/\/)/.test(href);
const readLocal = (href) => {
  const p = join(pageDir, href.split(/[?#]/)[0]);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
};

const css = [
  ...[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]),
  ...tags(/<link\b[^>]*rel="stylesheet"[^>]*>/g).map((t) => attr(t, 'href')).filter(local).map(readLocal),
].join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const js = tags(/<script\b[^>]*\ssrc="[^"]*"[^>]*>/g).map((t) => attr(t, 'src')).filter(local).map(readLocal).join('\n');

console.log(`head: ${pagePath}`);

/* ── Kit pin, SRI ───────────────────────────────────────────────────────── */
const kitVersions = new Set([...html.matchAll(/mco-web-style@([^/"']+)/g)].map((m) => m[1]));
check('kit pinned to exactly one x.y.z version', kitVersions.size === 1 && /^\d+\.\d+\.\d+$/.test([...kitVersions][0]),
  [...kitVersions].join(', ') || 'none');

const external = [
  ...tags(/<script\b[^>]*\ssrc="https?:[^"]*"[^>]*>/g),
  ...tags(/<link\b[^>]*rel="(?:stylesheet|modulepreload)"[^>]*>/g).filter((t) => /href="https?:/.test(t)),
];
const noSri = external.filter((t) => !/^sha(256|384|512)-/.test(attr(t, 'integrity') ?? '') || attr(t, 'crossorigin') === null);
check(`SRI (integrity + crossorigin) on all ${external.length} CDN scripts/stylesheets/modulepreloads`,
  external.length > 0 && noSri.length === 0, noSri.map((t) => attr(t, 'src') || attr(t, 'href')).join(' | '));
const unpinned = external.filter((t) => !/@\d+\.\d+\.\d+\//.test(t));
check('every CDN URL names an exact @x.y.z', unpinned.length === 0, unpinned.map((t) => attr(t, 'src') || attr(t, 'href')).join(' | '));
// Font preloads deliberately carry no integrity (@font-face fetches carry none).
const fonts = tags(/<link\b[^>]*rel="preload"[^>]*as="font"[^>]*>/g);
check('font preloads: both latin files, crossorigin, same kit version',
  fonts.length >= 2 && fonts.every((t) => attr(t, 'crossorigin') !== null && t.includes(`@${[...kitVersions][0]}/`)),
  `${fonts.length} preload(s)`);
const importMap = head.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1];
if (/maplibre-gl/.test(html)) {
  let integ = {};
  try { integ = importMap ? JSON.parse(importMap).integrity || {} : {}; } catch {}
  const ml = Object.keys(integ).filter((u) => /maplibre-gl@6\./.test(u));
  check('MapLibre 6: import map pins the entry + shared chunk (no maplibre-gl.js <script>)',
    ml.length >= 2 && !/maplibre-gl@5|maplibre-gl\.js"/.test(html), importMap ? `${ml.length} hashed` : 'no import map');
}

/* ── CSP ────────────────────────────────────────────────────────────────── */
const csp = head.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1]?.replace(/\s+/g, ' ') ?? '';
check("meta CSP present with default-src 'none'", csp.includes("default-src 'none'"), csp ? 'default-src not none' : 'no CSP');
const inline = [...html.matchAll(/<script(?: type="importmap")?>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const unhashed = inline.filter((body) => !csp.includes(`'sha256-${createHash('sha256').update(body).digest('base64')}'`));
check(`CSP script-src hashes every inline script, import map included (${inline.length})`,
  inline.length > 0 && unhashed.length === 0, `${unhashed.length} unhashed: ` +
  unhashed.map((b) => b.trim().slice(0, 40)).join(' | '));
if (importMap) {
  check('CSP worker-src allows blob: and https://unpkg.com (MapLibre 6 module worker)',
    /worker-src[^;]*blob:/.test(csp) && /worker-src[^;]*https:\/\/unpkg\.com/.test(csp), csp.match(/worker-src[^;]*/)?.[0] || 'no worker-src');
}

/* ── Anti-flash, viewport, title ────────────────────────────────────────── */
const antiFlash = inline.find((b) => /data-theme/.test(b) && /mco-theme/.test(b));
const firstSheet = head.search(/<link\b[^>]*rel="stylesheet"/);
check('anti-flash: inline, before the first stylesheet, reads mco-theme, stamps is-compact',
  !!antiFlash && (firstSheet === -1 || head.indexOf(antiFlash) < firstSheet) && /is-compact/.test(antiFlash));
check('viewport meta has viewport-fit=cover', /<meta name="viewport" content="[^"]*viewport-fit=cover/.test(head));
check('<html lang> and a non-empty <title>', /<html[^>]*\slang="[a-z-]+"/i.test(html) && /<title>[^<]+<\/title>/.test(head));

/* ── Skip link, main ────────────────────────────────────────────────────── */
// Comments, scripts and styles go first (0.11.2): a "<body" in a head
// comment ("the scripts at the end of <body>") was taken for the tag, and
// markup inside a script string would read as the first focusable.
const markup = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
const body = markup.slice(markup.search(/<body(\s[^>]*)?>/i)).replace(/^<body[^>]*>/i, '');
const firstFocusable = body.match(/<(a\s[^>]*href|button|input|select|textarea)[^>]*>/)?.[0] || '';
check('skip link is the first focusable element and targets #main',
  /class="[^"]*mco-skip-link/.test(firstFocusable) && /href="#main"/.test(firstFocusable), firstFocusable.slice(0, 80));
check('<main id="main" tabindex="-1">', tags(/<main\b[^>]*>/g).some((t) => attr(t, 'id') === 'main' && attr(t, 'tabindex') === '-1'));

/* ── Focus rules (HOUSE-STYLE §5.4) ─────────────────────────────────────── */
// Allowed: the skip-link target and tabindex=-1 headings/sections, which are
// focus TARGETS, not controls.
const TARGET = /^(main|#main|[\w.#-]*\[tabindex="?-1"?\]|:is\([^)]*\)\[tabindex="?-1"?\]|[\w.#-]+\[tabindex="?-1"?\]):focus$/;
const isTarget = (sel) => sel.split(/,(?![^(]*\))/).every((p) => TARGET.test(p.trim()));
const kills = [...css.matchAll(/([^{}]*)\{([^}]*)\}/g)]
  .filter((m) => /outline\s*:\s*(none|0)\b/.test(m[2]))
  .map((m) => m[1].trim()).filter((s) => !isTarget(s));
check('app CSS: no outline:none / outline:0 (except focus targets)', kills.length === 0, kills.slice(0, 5).join(' | '));

/* ── Storage namespace ──────────────────────────────────────────────────── */
const keys = [...js.matchAll(/(?:localStorage|sessionStorage)\.setItem\(\s*['"`]([^'"`$]+)['"`]|MCO\.lsSet\(\s*['"`]([^'"`$]+)['"`]/g)]
  .map((m) => m[1] || m[2]);
const bad = [...new Set(keys)].filter((k) => k !== 'mco-theme' && !/^mco-[a-z0-9]+(-[a-z0-9]+)*-/.test(k));
check(`storage keys are mco-<app>-* (${[...new Set(keys)].join(', ') || 'none found statically'})`, bad.length === 0, bad.join(', '));

finish('head');
