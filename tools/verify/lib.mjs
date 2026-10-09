/* ============================================================================
   mco-web-style · tools/verify/lib.mjs
   Shared Playwright harness for the verify scripts in this directory (lifted
   from mesonet-dashboard's scripts/verify/lib.mjs, made app-agnostic). Serves a
   consumer's static root, opens pages with the clock's zone pinned to
   America/Denver, and collects console errors, page errors and CSP
   violations. Ephemeral tooling — never a kit or app dependency (AGENTS rule 1).

   Playwright and axe resolve from the nearest node_modules above this file,
   or from $VERIFY_MODULES (a directory that CONTAINS node_modules' packages,
   e.g. VERIFY_MODULES=../mco-web-style/node_modules). ESM ignores NODE_PATH.
   ========================================================================== */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Import a tooling package from beside this file or from $VERIFY_MODULES. */
export async function load(name) {
  const bases = [import.meta.url];
  if (process.env.VERIFY_MODULES) bases.unshift(pathToFileURL(join(resolve(process.env.VERIFY_MODULES), '..', 'x.js')).href);
  for (const base of bases) {
    let mod;
    try { mod = await import(pathToFileURL(createRequire(base).resolve(name)).href); } catch { continue; }
    // require.resolve finds the CommonJS entry, whose exports land on default.
    return { ...(mod.default || {}), ...mod };
  }
  throw new Error(`cannot find '${name}': npm i --no-save playwright @axe-core/playwright ` +
    '(see tools/verify/README.md), or set VERIFY_MODULES to a node_modules directory');
}

export const THEMES = ['dark', 'light', 'high-contrast'];
// 390 is a touch phone, so (hover: none) matches and the touch-target rules apply.
export const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844, touch: true },
];

/** Tiny argv parser: --key value, --flag. */
export function args(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    out[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return out;
}

/** Load a --config module (default export), resolved from the cwd. */
export async function config(path) {
  if (!path) return {};
  return (await import(pathToFileURL(resolve(path)).href)).default || {};
}

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.geojson': 'application/geo+json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.parquet': 'application/octet-stream',
};

/**
 * Serve `root` statically on 127.0.0.1 and launch Chromium. `base` is the URL of
 * `page`'s directory (e.g. …/docs/ for docs/index.html). Call close() when done.
 */
export async function start({ root = '.', page = 'index.html' } = {}) {
  const dir = resolve(root);
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = normalize(join(dir, p));
      if (!f.startsWith(dir)) { res.writeHead(403).end(); return; }
      // Read BEFORE writing headers: the other order commits a 200 and then
      // dies with ERR_HTTP_HEADERS_SENT on the first by-design 404.
      const body = await readFile(f);
      res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { chromium } = await load('playwright');
  const browser = await chromium.launch({
    channel: process.env.VERIFY_CHANNEL || undefined,
    // MapLibre needs WebGL2; GPU-less machines only get it from SwiftShader.
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const pageDir = page.includes('/') ? page.slice(0, page.lastIndexOf('/') + 1) : '';
  const base = `http://127.0.0.1:${server.address().port}/${pageDir}`;
  return {
    base, browser,
    async close() { await browser.close(); await new Promise((r) => server.close(r)); },
  };
}

/**
 * New context + page at `base + query`: zone pinned to America/Denver, touch
 * emulated for touch viewports, `storage` seeded into localStorage before
 * load, and diagnostics collected. `ready` is render evidence — a FUNCTION
 * evaluated in the page (never a string: a meta CSP without 'unsafe-eval'
 * blocks Playwright's string predicates) or a CSS selector to wait for.
 */
export async function open(env, query = '', { viewport = VIEWPORTS[0], storage = {}, reducedMotion = 'no-preference', ready, timeout = 30000, settleMs = 1000 } = {}) {
  const ctx = await env.browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion,
    timezoneId: 'America/Denver',
    locale: 'en-US',
    ...(viewport.touch ? { isMobile: true, hasTouch: true } : {}),
  });
  await ctx.addInitScript((kv) => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__csp.push(`${e.violatedDirective} blocked ${e.blockedURI || 'inline'}`);
    });
    try { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); } catch {}
  }, storage);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 240)}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message || e).slice(0, 240)}`));
  await page.goto(env.base + query, { waitUntil: 'load', timeout: 45000 });
  if (typeof ready === 'function') await page.waitForFunction(ready, null, { timeout });
  else if (typeof ready === 'string') await page.waitForSelector(ready, { timeout });
  if (settleMs) await page.waitForTimeout(settleMs);
  return {
    ctx, page,
    async close() { await ctx.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {}); await ctx.close(); },
    /** Console + page errors and CSP violations so far. */
    async problems() {
      const csp = await page.evaluate(() => window.__csp).catch(() => []);
      return [...errors, ...csp.map((c) => `csp: ${c}`)];
    },
    smallTargets: () => smallTargets(page),
  };
}

/**
 * Visible pointer targets smaller than HOUSE-STYLE §5.5 allows under
 * (hover: none): 40px (44px for close buttons) in each dimension. Inline
 * links in prose are exempt (WCAG 2.5.5 "inline"); a control wrapped by its
 * label is measured by the label. Returns "tag#id.class "name" WxH" strings;
 * empty when (hover: none) doesn't match. `exempt` is a selector the caller
 * has decided to tolerate (record why where you pass it).
 */
export function smallTargets(page, exempt = '') {
  return page.evaluate((exempt) => {
    if (!matchMedia('(hover: none)').matches) return [];
    const sel = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=option], [tabindex]:not([tabindex="-1"])';
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      if (el.closest('.sr-only, [hidden], [inert], [aria-hidden="true"]') || el.matches('.mco-skip-link')) continue;
      if (exempt && el.matches(exempt)) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden') continue;
      // Inline links in running text, incl. MapLibre's attribution credit line.
      if (el.matches('a') && cs.display === 'inline' && el.closest('p, li, td, figcaption, small, dd, .maplibregl-ctrl-attrib-inner')) continue;
      const label = el.closest('label');
      const box = label && label.contains(el) ? label.getBoundingClientRect() : r;
      const min = el.matches('.modal-close, [aria-label^="Close"], [aria-label^="Dismiss"]') ? 44 : 40;
      if (Math.round(box.width) < min || Math.round(box.height) < min) {
        const id = el.id ? '#' + el.id : '';
        const name = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
        out.push(`${el.tagName.toLowerCase()}${id}${[...el.classList].map((c) => '.' + c).join('')} "${name}" ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    }
    return out;
  }, exempt);
}

/* ── Reporting ──────────────────────────────────────────────────────────── */

let failures = 0;
let passes = 0;
/** Print one check result; failures make finish() exit non-zero. */
export function check(label, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ' — ' + detail}`);
  if (ok) passes++; else failures++;
  return ok;
}
/** Print the summary and exit (0 when every check passed). */
export function finish(name) {
  console.log(failures === 0 ? `${name}: ALL ${passes} CHECKS PASSED` : `${name}: ${failures} of ${passes + failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
