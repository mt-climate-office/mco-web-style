#!/usr/bin/env node
/* ============================================================================
   mco-web-style · tools/replay/replay.mjs
   Record an app's network once, then load two versions of the app against
   that recording and compare what each shows, step by step.

     node tools/replay/replay.mjs record  <app-dir> [--rec dir]
     node tools/replay/replay.mjs compare <dir-A> <dir-B> [--rec dir] [--browser webkit]

   Read README.md beside this file. Ephemeral tooling: Playwright, pngjs and
   pixelmatch resolve as in tools/verify (AGENTS rule 1).
   ========================================================================== */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { args, browsers, launchBrowser, load, THEMES } from '../verify/lib.mjs';
import { openRecording, saveRecording, startServer } from './server.mjs';
import { REGIONS, act, defaultSteps, pageInit, pageRead, pageSettled } from './steps.mjs';

const VIEWS = [
  { name: '390', width: 390, height: 844, touch: true },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 },
];
// A map tile (z/x/y) or a glyph range.
const TILE = /\/\d+\/\d+\/\d+(@2x)?\.(mvt|pbf|png|jpe?g|webp)(\?|$)|\/\d+-\d+\.pbf(\?|$)/;
const SIGNALS = ['action', 'legend', 'panel', 'table', 'search', 'stamp', 'controls', 'href', 'history', 'layers', 'errors', 'requests', 'misses', 'pixels'];

const [cmd, ...rest] = process.argv.slice(2);
// Directories first, then options (args() reads the word after a flag as its value).
const firstOpt = rest.findIndex((a) => a.startsWith('--'));
const pos = firstOpt === -1 ? rest : rest.slice(0, firstOpt);
const opt = args(rest);
if (!['record', 'compare'].includes(cmd) || pos.length < (cmd === 'record' ? 1 : 2)) {
  console.error('usage: replay.mjs record <app-dir> [--rec dir] [--browsers chromium,webkit]\n' +
    '       replay.mjs compare <dir-A> <dir-B> [--rec dir] [--browser chromium|webkit] [--out dir] [--quick]');
  process.exit(2);
}
const dirA = resolve(pos[0]);
const dirB = cmd === 'compare' ? resolve(pos[1]) : null;
const recDir = resolve(opt.rec || join(dirA, '.replay'));
const port = Number(opt.port || 8790);

// The app's facts: replay.config.mjs in A (or --config).
const cfgPath = resolve(opt.config || join(dirA, 'replay.config.mjs'));
const cfg = existsSync(cfgPath) ? (await import(pathToFileURL(cfgPath).href)).default : {};
const steps = typeof cfg.steps === 'function' ? cfg.steps(defaultSteps(cfg)) : cfg.steps || defaultSteps(cfg);
const regions = { ...REGIONS, ...(cfg.regions || {}) };
const page = cfg.page || 'index.html';
const pageDir = page.includes('/') ? page.slice(0, page.lastIndexOf('/') + 1) : '';
const combos = [];
for (const v of VIEWS) for (const t of THEMES) combos.push({ view: v, theme: t, name: `${v.name}-${t}` });
const only = opt.quick ? combos.filter((c) => c.name === '1440-light') : combos;

const pw = await load('playwright');

const unique = (list) => [...new Set(list)].sort().join('\n');

/**
 * Wait, capped at 20 s, until the network has been quiet for 700 ms, the
 * maps are idle and the DOM has not changed for 700 ms: longer than the
 * apps' debounces (500 ms) and the legend's double-click window.
 */
async function settle(server, pg) {
  const t0 = Date.now();
  let last = -1, since = Date.now();
  while (Date.now() - t0 < 20000) {
    const n = await pg.evaluate(pageSettled).catch(() => -1);
    if (n !== last || n < 0) { last = n; since = Date.now(); }
    if (n >= 0 && server.quiet(700) && Date.now() - since >= 700) break;
    await pg.waitForTimeout(100);
  }
  // Two frames so the last tiles and labels are on the canvas.
  await pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {});
  return Date.now() - t0 >= 20000 ? 'timeout' : 'ok';
}

/** Walk every step in one browser for one directory; return the signals. */
async function runSide(engine, server, dir, rec, out) {
  server.setRoot(dir);
  const browser = await launchBrowser(pw, engine, { proxy: { server: server.origin, bypass: '<-loopback>' } });
  const base = `${server.origin}/${pageDir}`;
  const result = {};
  try {
    for (const c of only) {
      const ctx = await browser.newContext({
        viewport: { width: c.view.width, height: c.view.height },
        ...(c.view.touch ? { hasTouch: true, isMobile: engine !== 'webkit' } : {}),
        reducedMotion: 'reduce', timezoneId: 'America/Denver', locale: 'en-US',
        ignoreHTTPSErrors: true, serviceWorkers: 'block',
      });
      await ctx.clock.setFixedTime(rec.data.time);
      await ctx.addInitScript(pageInit);
      await ctx.addInitScript((kv) => { try { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); } catch {} },
        { ...(cfg.storage || {}), 'mco-theme': c.theme });
      const pg = await ctx.newPage();
      let bucket = null;
      pg.on('console', (m) => { if (m.type() === 'error' && bucket) bucket.errors.push(`console: ${m.text().slice(0, 200)}`); });
      pg.on('pageerror', (e) => bucket && bucket.errors.push(`pageerror: ${String(e.message || e).slice(0, 200)}`));
      ctx.on('request', (r) => { if (bucket && /^https?:/.test(r.url())) bucket.requests.push(`${r.method()} ${r.url()}`); });
      mkdirSync(join(out, c.name), { recursive: true });
      result[c.name] = [];
      for (const [i, step] of steps.entries()) {
        bucket = { errors: [], requests: [] };
        const missesBefore = server.state.misses.length;
        const t1 = Date.now();
        let action;
        try { action = await act(pg, step, base); } catch (e) { action = `failed: ${String(e.message).split('\n')[0]}`; }
        const settled = await settle(server, pg);
        let read;
        try { read = await pg.evaluate(pageRead, regions); } catch (e) { read = { read: `failed: ${e.message.split('\n')[0]}` }; }
        const shot = join(out, c.name, `${String(i).padStart(2, '0')}.png`);
        await pg.screenshot({ path: shot, animations: 'disabled', caret: 'hide' }).catch(() => {});
        result[c.name].push({
          step: step.name, settled, ms: Date.now() - t1, action, ...read,
          // Concurrent fetches start in a varying order, and a tiled reader
          // (COG, parquet) makes as many range reads as frames ask for, so
          // the compared list is each URL once, sorted; the order is kept
          // beside it. Which tiles and glyphs a camera move passes through
          // depends on frame timing, so they are counted, not compared; the
          // screenshot shows what they drew. Errors are compared the same way.
          errors: unique(bucket.errors), order: bucket.requests,
          requests: unique(bucket.requests.filter((u) => !TILE.test(u))),
          tiles: String(bucket.requests.filter((u) => TILE.test(u)).length),
          misses: server.state.misses.slice(missesBefore).join('\n'), shot,
        });
      }
      bucket = null;
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  return result;
}

if (cmd === 'record') {
  const rec = openRecording(recDir, { create: true });
  const server = await startServer({ root: dirA, rec, mode: 'record', port });
  const t0 = Date.now();
  try {
    for (const engine of browsers(opt)) {
      await runSide(engine, server, dirA, rec, join(recDir, 'shots', engine));
      saveRecording(rec);
    }
  } finally {
    await server.close();
  }
  rmSync(join(recDir, 'shots'), { recursive: true, force: true });
  const entries = Object.values(rec.data.entries);
  const byStatus = {};
  for (const e of entries) byStatus[e.status] = (byStatus[e.status] || 0) + 1;
  const bytes = readdirSync(join(recDir, 'bodies')).reduce((n, f) => n + statSync(join(recDir, 'bodies', f)).size, 0);
  console.log(`recorded ${entries.length} responses (${Object.entries(byStatus).map(([s, n]) => `${s}: ${n}`).join(', ')}), ` +
    `${(bytes / 1e6).toFixed(1)} MB, at ${new Date(rec.data.time).toISOString()}, in ${Math.round((Date.now() - t0) / 1000)} s → ${recDir}`);
  for (const [k, e] of Object.entries(rec.data.entries)) if (e.status >= 400) console.log(`  ${e.status} ${k}`);
  for (const f of server.state.failures) console.log(`  FAILED ${f}`);
  process.exit(server.state.failures.length ? 1 : 0);
}

/* ── compare ─────────────────────────────────────────────────────────────── */

const engine = opt.browser || 'chromium';
const out = resolve(opt.out || join(recDir, `compare-${engine}`));
rmSync(out, { recursive: true, force: true });
const rec = openRecording(recDir);
const server = await startServer({ root: dirA, rec, mode: 'replay', port });
const t0 = Date.now();
let A, B;
try {
  A = await runSide(engine, server, dirA, rec, join(out, 'A'));
  B = await runSide(engine, server, dirB, rec, join(out, 'B'));
} finally {
  await server.close();
}

const { PNG } = await load('pngjs');
const pixelmatch = (await load('pixelmatch')).default || (await load('pixelmatch'));
async function pixels(a, b, file) {
  if (!existsSync(a) || !existsSync(b)) return 'missing screenshot';
  const [pa, pb] = [PNG.sync.read(await readFile(a)), PNG.sync.read(await readFile(b))];
  if (pa.width !== pb.width || pa.height !== pb.height) return 'size differs';
  const diff = new PNG({ width: pa.width, height: pa.height });
  const n = pixelmatch(pa.data, pb.data, diff.data, pa.width, pa.height, { threshold: 0.1 });
  if (n) writeFileSync(file, PNG.sync.write(diff));
  return n ? `${n} px differ` : '';
}

mkdirSync(join(out, 'diff'), { recursive: true });
const counts = Object.fromEntries(SIGNALS.map((s) => [s, { same: 0, differ: 0, first: '' }]));
const differences = [];
for (const c of only) {
  for (const [i, a] of A[c.name].entries()) {
    const b = B[c.name][i];
    const where = `${c.name} #${i} ${a.step}`;
    for (const s of SIGNALS) {
      let d = '';
      if (s === 'pixels') d = await pixels(a.shot, b.shot, join(out, 'diff', `${c.name}-${String(i).padStart(2, '0')}-diff.png`));
      else if (s === 'misses') d = a.misses || b.misses ? `not in the recording: ${(a.misses || b.misses).split('\n')[0]}` : '';
      else if (a[s] !== b[s]) d = firstDiff(a[s], b[s]);
      if (d) {
        counts[s].differ++;
        counts[s].first ||= where;
        differences.push({ where, signal: s, detail: d });
      } else counts[s].same++;
    }
  }
}

/** The first differing line of two signal values, short. */
function firstDiff(a = '', b = '') {
  const la = String(a).split('\n'), lb = String(b).split('\n');
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] === lb[i]) continue;
    const x = la[i] ?? '∅', y = lb[i] ?? '∅';
    let c = 0;
    while (c < x.length && x[c] === y[c]) c++;
    const from = Math.max(0, c - 40);
    return `line ${i + 1}, char ${c + 1}: A «${x.slice(from, c + 80)}» B «${y.slice(from, c + 80)}»`;
  }
  return 'differs';
}

// Keep only the screenshots that differ, beside their diff image.
const keep = new Set(differences.filter((d) => d.signal === 'pixels').map((d) => d.where.split(' ').slice(0, 2).join(' ')));
for (const c of only) {
  for (const [i, a] of A[c.name].entries()) {
    const id = `${c.name} #${i}`;
    const stem = `${c.name}-${String(i).padStart(2, '0')}`;
    if (keep.has(id)) {
      for (const [side, r] of [['A', a], ['B', B[c.name][i]]]) {
        if (existsSync(r.shot)) writeFileSync(join(out, 'diff', `${stem}-${side}.png`), await readFile(r.shot));
      }
    }
  }
}
rmSync(join(out, 'A'), { recursive: true, force: true });
rmSync(join(out, 'B'), { recursive: true, force: true });

const secs = Math.round((Date.now() - t0) / 1000);
const timeouts = Object.values(A).concat(Object.values(B)).flat().filter((r) => r.settled !== 'ok').length;
writeFileSync(join(out, 'result.json'), JSON.stringify({
  engine, a: dirA, b: dirB, recording: recDir, recordedAt: new Date(rec.data.time).toISOString(),
  steps: steps.map((s) => s.name), combos: only.map((c) => c.name), seconds: secs, settleTimeouts: timeouts,
  counts, differences, a_signals: A, b_signals: B,
}, null, 1));

console.log(`replay compare · ${engine} · ${steps.length} steps × ${only.length} views · recording of ${new Date(rec.data.time).toISOString()}`);
console.log('signal     same  differ  first difference');
for (const s of SIGNALS) {
  const k = counts[s];
  console.log(`${k.differ ? '✗' : '✓'} ${s.padEnd(9)}${String(k.same).padStart(5)}${String(k.differ).padStart(8)}  ${k.first}`);
}
for (const d of differences.slice(0, 12)) console.log(`  ${d.where} · ${d.signal}: ${d.detail}`);
if (differences.length > 12) console.log(`  … ${differences.length - 12} more in result.json`);
if (timeouts) console.log(`note: ${timeouts} step(s) did not settle within 20 s`);
console.log(`${differences.length ? 'DIFFERENT' : 'SAME'}: ${differences.length} difference(s) in ${secs} s → ${out}`);
process.exit(differences.length ? 1 : 0);
