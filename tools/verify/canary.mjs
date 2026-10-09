#!/usr/bin/env node
/* ============================================================================
   mco-web-style · tools/verify/canary.mjs
   Downstream test: what happens to a REAL consumer if it picks up the kit as
   it is in this working tree, by bumping its tags and nothing else?

   For each consumer page × browser × theme × width it loads the page twice:
     baseline   — exactly as committed: its pinned kit from jsDelivr.
     candidate  — every request for mco-web-style@<any version>/<path> is
                  answered from THIS checkout, and the kit tags' integrity
                  attributes are stripped from the served HTML (the hashes
                  are for the pinned bytes). The origin stays cdn.jsdelivr.net,
                  so the consumer's real CSP is exercised unchanged.
   and reports what the candidate changed:
     - new console errors, page errors, CSP violations
     - new axe serious/critical violations
     - new touch targets under 40px (44 for close), on the touch width
     - geometry of the shared chrome (navbar, brand, controls, panels, map
       controls) moved by more than 2px
     - pixel difference of the page with the map canvas masked (live tiles
       and data are noise), and whether the map still paints at all
   The baseline loads TWICE: anything that differs between two loads of the
   same bytes (live counts, polling, timing) is reported as noise, never as
   a kit change, and pixel diffs are judged against that noise floor.
   Anything new is a regression unless the CHANGELOG says it should change.

     node tools/verify/canary.mjs --consumer ../mesonet-status \
       --consumer ../mesonet-photo-explorer:docs/index.html \
       [--browsers chromium,webkit] [--themes dark,light,high-contrast] \
       [--widths 1440,390] [--settle 6000] [--threshold 0.5] [--out ./canary-out]

   Tooling (ephemeral, never committed — AGENTS rule 1):
     npm i --no-save playwright @axe-core/playwright pngjs pixelmatch
     npx playwright install chromium webkit
   Exit code: 0 when no consumer regressed, 1 otherwise.
   ========================================================================== */
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, smallTargets } from './lib.mjs';

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const KIT_URL = /https:\/\/cdn\.jsdelivr\.net\/gh\/mt-climate-office\/mco-web-style@[^/"']+\//;

/* ── Args ─────────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i === -1 ? d : argv[i + 1]; };
const consumers = argv.flatMap((a, i) => (a === '--consumer' ? [argv[i + 1]] : [])).map((c) => {
  const [root, page = 'index.html'] = c.split(':');
  return { root: resolve(root), page, name: basename(resolve(root)) };
});
if (!consumers.length) { console.error('usage: canary.mjs --consumer <repo>[:page.html] …'); process.exit(2); }
const BROWSERS = opt('browsers', 'chromium,webkit').split(',');
const THEMES = opt('themes', 'dark,light,high-contrast').split(',');
const WIDTHS = opt('widths', '1440,390').split(',').map(Number);
const SETTLE = Number(opt('settle', 2000));
const THRESHOLD = Number(opt('threshold', 0.5));        // % of pixels
const OUT = resolve(opt('out', './canary-out'));
// Changes this release makes ON PURPOSE (CHANGELOG): geometry moves on these
// selectors at these widths are reported as expected, not as regressions.
// [{ "selector": ".mco-panel", "widths": [390], "why": "0.9.0 touch targets" }]
const ACCEPT = opt('accept') ? JSON.parse(readFileSync(resolve(opt('accept')), 'utf8')).accept || [] : [];
const accepted = (sel, width) => ACCEPT.find((x) => x.selector === sel && (!x.widths || x.widths.includes(width)));
mkdirSync(OUT, { recursive: true });

const pw = await load('playwright');
const { AxeBuilder } = await load('@axe-core/playwright');
const { PNG } = await load('pngjs');
const pixelmatch = (await load('pixelmatch')).default || (await load('pixelmatch'));

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.geojson': 'application/geo+json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.parquet': 'application/octet-stream',
  '.fgb': 'application/octet-stream', '.tif': 'image/tiff',
};

/* ── One static server per consumer; ?mco-canary=1 serves the candidate HTML ── */
function serve(root) {
  const srv = createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://x');
      let p = decodeURIComponent(u.pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = normalize(join(root, p));
      if (!f.startsWith(root)) { res.writeHead(403).end(); return; }
      let body = await readFile(f);
      if (extname(f) === '.html' && req.headers['x-mco-canary'] === '1') {
        // Strip integrity from kit tags only: <script|link …mco-web-style@…>.
        body = Buffer.from(body.toString('utf8').replace(/<(script|link)\b[^>]*>/g, (tag) =>
          KIT_URL.test(tag) ? tag.replace(/\s+integrity="[^"]*"/, '') : tag));
      }
      res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

/* ── One run ──────────────────────────────────────────────────────────── */
const CHROME = ['.mco-navbar', '.brand', '.controls', '.nav-meta', '.logo-link', '.mco-panel',
  '.maplibregl-ctrl-top-right', '.maplibregl-ctrl-top-left', '.maplibregl-ctrl-bottom-right', '#main'];

async function run(browser, engine, base, c, theme, width, candidate) {
  const touch = width < 640;
  const ctx = await browser.newContext({
    viewport: { width, height: touch ? 800 : 900 },
    hasTouch: touch, isMobile: touch && engine === 'chromium',   // see a11y-audit.mjs on WebKit isMobile
    reducedMotion: 'reduce', timezoneId: 'America/Denver',
    extraHTTPHeaders: candidate ? { 'x-mco-canary': '1' } : {},
  });
  await ctx.addInitScript(() => {
    window.__mcoCsp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      window.__mcoCsp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  if (candidate) {
    await ctx.route(/https:\/\/cdn\.jsdelivr\.net\/gh\/mt-climate-office\/mco-web-style@[^/]+\/.*/, async (route) => {
      const path = new URL(route.request().url()).pathname.replace(/^\/gh\/mt-climate-office\/mco-web-style@[^/]+\//, '');
      try {
        const body = readFileSync(join(KIT, path));
        await route.fulfill({ status: 200, body, headers: {
          'content-type': MIME[extname(path)] || 'application/octet-stream', 'access-control-allow-origin': '*' } });
      } catch { await route.fulfill({ status: 404, body: 'not in kit checkout' }); }
    });
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
  // Settle on the NETWORK, not a fixed delay: live counts and attribution
  // arrive with the data, and a fixed wait races the API (a 6 s settle gave
  // a 200px "regression" on status that a rerun didn't reproduce). Wait for
  // 1.5 s with nothing in flight (polling apps: capped at 25 s), then SETTLE
  // more for rendering.
  let inflight = 0, lastChange = Date.now();
  page.on('request', () => { inflight++; lastChange = Date.now(); });
  const doneReq = () => { inflight = Math.max(0, inflight - 1); lastChange = Date.now(); };
  page.on('requestfinished', doneReq);
  page.on('requestfailed', doneReq);
  await page.goto(`${base}/${c.page}?theme=${theme}`, { waitUntil: 'load', timeout: 45000 }).catch((e) => errors.push('goto: ' + e.message));
  const t0 = Date.now();
  while (Date.now() - t0 < 25000 && !(inflight === 0 && Date.now() - lastChange > 1500)) await page.waitForTimeout(200);
  await page.waitForTimeout(SETTLE);
  // First-visit info modals open in both runs; close them so they don't hide the page.
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close())).catch(() => {});
  await page.waitForTimeout(300);
  const csp = await page.evaluate(() => window.__mcoCsp || []).catch(() => []);
  let axe = [];
  try {
    const r = await new AxeBuilder({ page }).analyze();
    axe = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(' ')}`));
  } catch (e) { errors.push('axe: ' + e.message.slice(0, 120)); }
  const small = touch ? await smallTargets(page).catch(() => []) : [];
  const geom = await page.evaluate((sels) => {
    const out = {};
    for (const s of sels) {
      const el = document.querySelector(s);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      out[s] = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    }
    return out;
  }, CHROME).catch(() => ({}));
  const canvas = page.locator('.maplibregl-canvas, canvas').first();
  const hasCanvas = await canvas.count() > 0;
  const shot = await page.screenshot({ mask: hasCanvas ? [page.locator('canvas')] : [], animations: 'disabled' });
  const mapShot = hasCanvas ? await canvas.screenshot({ timeout: 5000 }).catch(() => null) : null;
  await ctx.close();
  return { errors, csp, axe, small, geom, shot, mapShot };
}

// A crashed or hung page is a RESULT, not a harness failure: retry once, then
// record it so the comparison can tell "both sides crash" (environment:
// Linux CI's WebKit crashed on two consumers whose macOS runs were clean)
// from "only the candidate crashes" (a regression).
async function runSafe(...a) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await run(...a); } catch (e) {
      if (attempt === 1) {
        return { crashed: String(e.message || e).split('\n')[0].slice(0, 160),
          errors: [], csp: [], axe: [], small: [], geom: {}, shot: null, mapShot: null };
      }
    }
  }
}

// Is a canvas screenshot more than one flat color? (A map that drew nothing
// is a single clear color; one that drew a basemap has thousands.)
function paints(buf) {
  if (!buf) return null;
  const png = PNG.sync.read(buf);
  const seen = new Set();
  for (let i = 0; i < png.data.length && seen.size < 64; i += 4 * 97) {
    seen.add((png.data[i] << 16) | (png.data[i + 1] << 8) | png.data[i + 2]);
  }
  return seen.size > 8;
}
function pixelDiff(a, b, file) {
  const A = PNG.sync.read(a), B = PNG.sync.read(b);
  if (A.width !== B.width || A.height !== B.height) return { pct: 100, note: `size ${A.width}x${A.height} → ${B.width}x${B.height}` };
  const diff = new PNG({ width: A.width, height: A.height });
  const n = pixelmatch(A.data, B.data, diff.data, A.width, A.height, { threshold: 0.12 });
  const pct = (100 * n) / (A.width * A.height);
  if (pct > 0) writeFileSync(file, PNG.sync.write(diff));
  return { pct };
}
const added = (before, after) => after.filter((x) => !before.includes(x));

/* ── Main ─────────────────────────────────────────────────────────────── */
let regressions = 0;
const report = [`# Kit canary — ${new Date().toISOString()}`, '', `Candidate kit: ${KIT}`, ''];
for (const c of consumers) {
  const srv = await serve(c.root);
  const base = `http://127.0.0.1:${srv.address().port}`;
  console.log(`\n=== ${c.name} (${c.page})`);
  report.push(`## ${c.name}`, '', '| browser | theme | width | result |', '|---|---|---|---|');
  for (const engine of BROWSERS) {
    const browser = await pw[engine].launch(engine === 'chromium'
      ? { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] } : {});
    for (const theme of THEMES) for (const width of WIDTHS) {
      const tag = `${engine} ${theme} ${width}`;
      // Baseline TWICE: whatever differs between two loads of the same bytes
      // (live counts, polling, timing) is noise and never blamed on the kit.
      const b = await runSafe(browser, engine, base, c, theme, width, false);
      const b2 = await runSafe(browser, engine, base, c, theme, width, false);
      const k = await runSafe(browser, engine, base, c, theme, width, true);
      const issues = [];
      if (b.crashed || b2.crashed || k.crashed) {
        const tag2 = `${engine} ${theme} ${width}`;
        if (k.crashed && !b.crashed && !b2.crashed) {
          regressions++;
          console.log(`✗ ${tag2} — candidate CRASHED, baseline did not: ${k.crashed}`);
          report.push(`| ${engine} | ${theme} | ${width} | ✗ candidate crashed: ${k.crashed} |`);
        } else {
          console.log(`⚠ ${tag2} — inconclusive, baseline crashed too (environment): ${b.crashed || b2.crashed}`);
          report.push(`| ${engine} | ${theme} | ${width} | ⚠ inconclusive: baseline crashed too (${b.crashed || b2.crashed}) |`);
        }
        continue;
      }
      const noisy = [];
      const both = (key) => [...new Set([...b[key], ...b2[key]])];
      const ne = added(both('errors'), k.errors); if (ne.length) issues.push(`new errors: ${ne.slice(0, 3).join(' | ')}`);
      const nc = added(both('csp'), k.csp); if (nc.length) issues.push(`new CSP violations: ${nc.slice(0, 3).join(' | ')}`);
      const na = added(both('axe'), k.axe); if (na.length) issues.push(`new axe: ${na.slice(0, 4).join(' | ')}`);
      const strip = (l) => l.map((x) => x.replace(/ \d+x\d+$/, ''));
      const ns = added([...strip(b.small), ...strip(b2.small)], strip(k.small));
      if (ns.length) issues.push(`new small targets: ${ns.slice(0, 4).join(' | ')}`);
      const differs = (g1, g2) => g1.some((v, i) => Math.abs(v - g2[i]) > 2);
      const moved = [], gone = [], expected = [];
      for (const sel of Object.keys(b.geom)) {
        if (!b2.geom[sel] || differs(b.geom[sel], b2.geom[sel])) { noisy.push(sel); continue; }
        if (!k.geom[sel]) gone.push(`${sel} missing`);
        else if (differs(b.geom[sel], k.geom[sel])) {
          const msg = `${sel} ${b.geom[sel].join(',')}→${k.geom[sel].join(',')}`;
          const ok = accepted(sel, width);
          if (ok) expected.push(`${msg} (${ok.why})`); else moved.push(msg);
        }
      }
      if (moved.length || gone.length) issues.push(`geometry: ${[...moved, ...gone].slice(0, 5).join(' | ')}`);
      const slug = `${c.name}-${engine}-${theme}-${width}`;
      const floor = pixelDiff(b.shot, b2.shot, join(OUT, `${slug}-noise.png`)).pct;
      const pd = pixelDiff(b.shot, k.shot, join(OUT, `${slug}-diff.png`));
      if (pd.pct > floor + THRESHOLD) {
        writeFileSync(join(OUT, `${slug}-base.png`), b.shot);
        writeFileSync(join(OUT, `${slug}-cand.png`), k.shot);
        issues.push(`pixels: ${pd.pct.toFixed(2)}% differ (noise ${floor.toFixed(2)}%)${pd.note ? ' (' + pd.note + ')' : ''} — ${slug}-{base,cand,diff}.png`);
      }
      const pb = paints(b.mapShot), pk = paints(k.mapShot);
      if (pb && pk === false) issues.push('map: drew in baseline, BLANK in candidate');
      const info = `px ${pd.pct.toFixed(2)}% (noise ${floor.toFixed(2)}%)` + (expected.length ? ` · expected: ${expected.join(' | ')}` : '') + (noisy.length ? ` · noisy: ${noisy.join(' ')}` : '') + (pb === null ? '' : ` · map ${pb ? 'drew' : 'blank'}→${pk ? 'drew' : 'blank'}`) +
        (b.errors.length ? ` · ${b.errors.length} baseline error(s)` : '');
      if (issues.length) regressions++;
      console.log(`${issues.length ? '✗' : '✓'} ${tag} — ${issues.length ? issues.join('; ') : 'no change'} (${info})`);
      report.push(`| ${engine} | ${theme} | ${width} | ${issues.length ? '✗ ' + issues.join('<br>') : '✓ ' + info} |`);
    }
    await browser.close();
  }
  report.push('');
  srv.close();
}
writeFileSync(join(OUT, 'report.md'), report.join('\n') + '\n');
console.log(`\n${regressions ? regressions + ' run(s) changed' : 'no consumer changed'} — report: ${join(OUT, 'report.md')}`);
process.exit(regressions ? 1 : 0);
