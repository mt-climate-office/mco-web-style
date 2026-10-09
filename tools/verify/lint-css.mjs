#!/usr/bin/env node
/* ============================================================================
   mco-web-style · tools/verify/lint-css.mjs — house-style CSS lint
   Reads a consumer's inline <style> blocks and its local stylesheets and
   counts drift by category. Measures by default (exit 0); --strict fails on
   any finding. Zero dependencies.

     node tools/verify/lint-css.mjs --root ../mesonet-status
     node tools/verify/lint-css.mjs --root ../mesonet-photo-explorer --page docs/index.html --verbose

   Categories:
     hex           raw #hex outside a line (or the line above) with a
                   contrast / data / palette / WCAG comment (§2, §5.10)
     z-index       a raw integer z-index instead of var(--z-…) (§3 ladder)
     font-literal  font-family naming 'Outfit' / 'Space Mono' instead of the
                   tokens, which skips the metric-matched fallbacks (0.7.1)
     outline-kill  outline: none / 0 outside a focus TARGET (§5.4)
     shed-display  display: none on .brand or .control-label, the 0.5.1
                   nameless-input regression (§3)
     untagged-override
                   an app rule whose selector names a class the kit styles,
                   with no `kit-override` comment in the 3 lines above it or
                   inside it. The admission rule (AGENTS 5) can't see an
                   override nobody tagged.
   ========================================================================== */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { args } from './lib.mjs';

const a = args();
const root = resolve(a.root || '.');
const pagePath = join(root, a.page || 'index.html');
if (!existsSync(pagePath)) { console.error(`lint-css: no ${pagePath}`); process.exit(2); }
const html = readFileSync(pagePath, 'utf8');

// Kit classes: every .class the kit stylesheet styles. Vendor .maplibregl-*
// classes count too: restyling them is an override of the kit's polish.
const kitCss = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'theme', 'mco-theme.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const kitClasses = new Set();
for (const m of kitCss.matchAll(/([^{}]+)\{/g)) {
  if (m[1].trim().startsWith('@')) continue;
  for (const c of m[1].matchAll(/\.([a-zA-Z][\w-]*)/g)) kitClasses.add(c[1]);
}
// Classes the kit uses only as state/modifiers on its own components; an app
// rule keyed only on these isn't an override of a kit component.
for (const c of ['visible', 'is-open', 'is-collapsing', 'is-current', 'is-compact', 'is-touch', 'static', 'dot']) kitClasses.delete(c);

// Sources: inline <style> blocks and local <link rel=stylesheet>.
const sources = [];
for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
  const startLine = html.slice(0, m.index).split('\n').length;
  sources.push({ name: `${a.page || 'index.html'}:<style>`, text: m[1], offset: startLine });
}
for (const t of html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>|<link\b[^>]*href="([^"]+)"[^>]*rel="stylesheet"[^>]*>/g)) {
  const href = t[1] || t[2];
  if (/^(https?:|\/\/|data:)/.test(href)) continue;
  const p = join(dirname(pagePath), href.split(/[?#]/)[0]);
  if (existsSync(p)) sources.push({ name: href, text: readFileSync(p, 'utf8'), offset: 1 });
}

const findings = { hex: [], 'z-index': [], 'font-literal': [], 'outline-kill': [], 'shed-display': [], 'untagged-override': [] };
const COMMENTED = /contrast|data|palette|ramp|cvd|wcag|\d(\.\d+)?:1|kit-override/i;
const TARGET = /^(main|#main|[\w.#-]*\[tabindex="?-1"?\]|[\w.#-]*\[tabindex="?-1"?\]:focus|main:focus|#main:focus)$/;

for (const src of sources) {
  const lines = src.text.split('\n');
  const at = (i) => `${src.name}:${src.offset + i}`;
  // Line-level checks (comments kept, so a contrast note on the line counts).
  lines.forEach((l, i) => {
    const code = l.replace(/\/\*.*?\*\//g, '');
    if (/#[0-9a-fA-F]{3,8}\b/.test(code) && !/^\s*--[\w-]+\s*:\s*#/.test(code) && !COMMENTED.test(l) && !COMMENTED.test(lines[i - 1] || '')) {
      findings.hex.push(`${at(i)} ${l.trim().slice(0, 70)}`);
    } else if (/^\s*--[\w-]+\s*:\s*#/.test(code) && !COMMENTED.test(l) && !COMMENTED.test(lines[i - 1] || '')) {
      // A locally DEFINED color custom property: the forked-token smell.
      findings.hex.push(`${at(i)} ${l.trim().slice(0, 70)}`);
    }
    if (/z-index\s*:\s*-?\d+\s*[;}]?/.test(code)) findings['z-index'].push(`${at(i)} ${l.trim().slice(0, 70)}`);
    if (/font(-family)?\s*:[^;]*['"](Outfit|Space Mono)['"]/.test(code)) findings['font-literal'].push(`${at(i)} ${l.trim().slice(0, 70)}`);
  });
  // Rule-level checks.
  const text = src.text;
  for (const m of text.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const rawSel = m[1];
    const sel = rawSel.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (!sel || sel.startsWith('@') || /^(from|to|\d+%)/.test(sel)) continue;
    const body = m[2];
    const line = text.slice(0, m.index + m[0].indexOf(sel)).split('\n').length - 1;
    if (/outline\s*:\s*(none|0)\b/.test(body) && !sel.split(',').every((p) => TARGET.test(p.trim()))) {
      findings['outline-kill'].push(`${at(line)} ${sel.slice(0, 60)}`);
    }
    // Classes inside :not()/:has() condition a rule; they aren't its target.
    let subj = sel;
    for (let k = 0; k < 3; k++) subj = subj.replace(/:(not|has|is|where)\([^()]*\)/g, '');
    if (/display\s*:\s*none/.test(body) && /\.(brand|control-label)(?![\w-])/.test(subj)) {
      findings['shed-display'].push(`${at(line)} ${sel.replace(/\s+/g, ' ').slice(0, 60)}`);
    }
    const hits = [...subj.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((c) => c[1]).filter((c) => kitClasses.has(c));
    if (hits.length) {
      const context = lines.slice(Math.max(0, line - 3), line + 1).join('\n') + rawSel + body;
      if (!/kit-override/i.test(context)) {
        findings['untagged-override'].push(`${at(line)} ${sel.replace(/\s+/g, ' ').slice(0, 60)} [.${[...new Set(hits)].join(' .')}]`);
      }
    }
  }
}

console.log(`lint-css: ${pagePath} (${sources.length} source(s), ${kitClasses.size} kit classes)`);
let total = 0;
for (const [k, v] of Object.entries(findings)) {
  total += v.length;
  console.log(`  ${String(v.length).padStart(4)}  ${k}`);
  if (a.verbose) for (const f of v.slice(0, 40)) console.log(`          ${f}`);
}
console.log(`lint-css: ${total} finding(s)${a.strict ? '' : ' (measuring; --strict to gate)'}`);
process.exit(a.strict && total ? 1 : 0);
