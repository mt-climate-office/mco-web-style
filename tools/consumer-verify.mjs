#!/usr/bin/env node
/* Consumer-app verification skeleton (MIGRATING.md § Verification recipe).
   COPY this file into the app repo being migrated (keep it untracked), fill
   in CONFIG, extend the app-specific section, and run it before the deploy
   gate. It is a starting point, not a complete gate — the URL-param matrix
   and any app automation are yours to add.

   Ephemeral tooling (in the app repo; keep out of git):
     npm init -y && npm i --no-save playwright @axe-core/playwright
     npx playwright install chromium
   Then: node consumer-verify.mjs
*/
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';

/* ── CONFIG — edit per app ────────────────────────────────────────────── */
const CONFIG = {
  root: process.cwd(),          // directory to serve (the repo root)
  pagePath: '/',                // '/docs/' when GitHub Pages publishes /docs
  themes: ['dark', 'light', 'high-contrast'],
  // localStorage seeded before load — suppress first-visit modals etc.
  initLocalStorage: { 'mco-<app>-seen-intro': '1' },
  // Render evidence: a predicate evaluated in-page; the page counts as
  // rendered when it returns true (NEVER rely on networkidle). Keep it a
  // FUNCTION, not a string — Playwright eval()s a string predicate in-page,
  // and the meta CSP this playbook adds has no 'unsafe-eval', so a string
  // fails with "Evaluating a string as JavaScript violates the following
  // Content Security Policy directive". Example for an app with an sr-table:
  renderEvidence: () => document.querySelectorAll('#sr-station-table tbody tr').length > 100,
  settleMs: 4000,               // extra time for tiles/hillshade after evidence
  screenshotDir: './verify-out',
};
/* ─────────────────────────────────────────────────────────────────────── */

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json',
  '.geojson': 'application/geo+json', '.png': 'image/png', '.svg': 'image/svg+xml',
};
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = normalize(join(CONFIG.root, p));
    if (!f.startsWith(CONFIG.root)) { res.writeHead(403).end(); return; }
    // Read BEFORE writing headers. The other order commits a 200 and only then
    // discovers the file is missing, so the catch tries to write 404 headers
    // onto an already-sent response and the whole harness dies with
    // ERR_HTTP_HEADERS_SENT. Any request that 404s BY DESIGN trips it — an app
    // whose API isn't running locally, a probe for an optional asset — which
    // is exactly the degradation a verify run wants to exercise.
    const body = await readFile(f);
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}${CONFIG.pagePath}`;

const browser = await chromium.launch();
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ' — ' + detail}`);
  if (!ok) failures++;
};

async function open({ query = '', viewport = { width: 1440, height: 900 } } = {}) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript((kv) => {
    for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
  }, CONFIG.initLocalStorage);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + query, { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction(CONFIG.renderEvidence, null, { timeout: 30000 });
  await page.waitForTimeout(CONFIG.settleMs);
  return { ctx, page, errors };
}

/* ── Baseline: three themes — console (CSP!), axe, screenshot ──────────── */
for (const theme of CONFIG.themes) {
  const { ctx, page, errors } = await open({ query: `?theme=${theme}` });
  // With the meta CSP live, ANY blocked endpoint or stale inline-script hash
  // surfaces here — a non-empty list usually means the CSP is wrong.
  check(`[${theme}] console clean`, errors.length === 0, errors.slice(0, 3).join(' | '));
  const r = await new AxeBuilder({ page }).analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  check(`[${theme}] axe 0 serious/critical`, bad.length === 0,
    bad.map((v) => `${v.id}:${v.nodes[0]?.target.join(' ')}`).join(' | '));
  await page.screenshot({ path: `${CONFIG.screenshotDir}/${theme}.png` });
  await ctx.close();
}

/* ── Baseline: compact viewport ────────────────────────────────────────── */
{
  const { ctx, page, errors } = await open({ viewport: { width: 390, height: 720 }, query: '?theme=dark' });
  check('[compact] console clean', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.screenshot({ path: `${CONFIG.screenshotDir}/compact.png` });
  await ctx.close();
}

/* ── App-specific (REQUIRED — extend for your app) ─────────────────────────
   Assert, at minimum (see mesonet-status's migration for worked examples):
   - every URL param honored on load AND re-emitted after interaction;
     defaults elided; deep links suppress the intro modal
   - ?kbd=off gates single-key shortcuts and sticks across pushState
   - legacy localStorage encodings honored at boot (collapse state, etc.)
   - side-by-side screenshots vs the LIVE production page — list expected
     deltas; anything else is a regression
   - the repo's own page-driving automation (export/preview jobs) still works
*/
// TODO: add app-specific checks here, using check(label, ok, detail).

await browser.close();
server.close();
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
