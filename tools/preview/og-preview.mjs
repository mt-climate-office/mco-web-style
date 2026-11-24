#!/usr/bin/env node
// Live social preview for an MCO map app: screenshot the deployed page,
// prove the picture is real, write a JPEG, and stamp the og:image URL.
// Run by .github/workflows/og-preview.yml. Dev tooling only (AGENTS rule 1).
//
//   node og-preview.mjs shoot   # env below → OG_OUT (JPEG)
//   node og-preview.mjs stamp   # rewrite og:image URLs in OG_HTML files
//
// shoot reads:
//   OG_URL            page to load, query included
//   OG_OUT            JPEG to write
//   OG_MODE           screenshot (default) | download (the app's own export)
//   OG_WIDTH/HEIGHT   CSS viewport (1200×630)       OG_SCALE  DPR (2)
//   OG_READY_SELECTOR wait for this element…        OG_READY_TEXT  …whose text matches this regex
//   OG_FAIL_SELECTOR  visible → invalid (a kit danger notice always is)
//   OG_SEEN_KEYS      comma list of localStorage keys set to '1' (intro dialogs)
//   OG_SETTLE_MS      wait after ready for tiles to paint (3000)
//   OG_FALLBACKS      newline list of image URLs tried in order when invalid
// Exit 0: a fresh, valid image. Exit 3: invalid, fallback written.
// Exit 1: invalid and no fallback worked; nothing written.
//
// stamp reads OG_HTML (newline list of files), OG_IMAGE (basename, e.g.
// og-card.jpg) and OG_STAMP (e.g. 2026112406). Only meta tags whose URL ends
// in OG_IMAGE are touched, so a kit card URL is left alone.

import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const env = (k, d) => (process.env[k] ?? '').trim() || d;
const QUALITY = 85;
const MIN_BYTES = 30_000;
const MAX_BYTES = 5_000_000;
const MIN_STDDEV = 12;     // luma; a blank or single-colour page sits near 0

function log(msg) { console.log(`[og-preview] ${msg}`); }

async function capture(browser) {
  const url = env('OG_URL');
  const mode = env('OG_MODE', 'screenshot');
  const width = Number(env('OG_WIDTH', '1200'));
  const height = Number(env('OG_HEIGHT', '630'));
  const scale = Number(env('OG_SCALE', '2'));
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    colorScheme: 'light',
    timezoneId: 'America/Denver',
    acceptDownloads: mode === 'download',
  });
  const keys = env('OG_SEEN_KEYS', '').split(',').map((s) => s.trim()).filter(Boolean);
  if (keys.length) {
    await ctx.addInitScript((ks) => {
      try { for (const k of ks) localStorage.setItem(k, '1'); } catch { /* storage blocked */ }
    }, keys);
  }
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') log(`console error: ${m.text()}`); });

  if (mode === 'download') {
    const dl = page.waitForEvent('download', { timeout: 90_000 });
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (!resp || resp.status() !== 200) throw new Error(`page status ${resp?.status()}`);
    const file = await (await dl).path();
    if (!file) throw new Error('download finished with no file');
    const buf = await readFile(file);
    await ctx.close();
    return { buf, expect: null };
  }

  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if (!resp || resp.status() !== 200) throw new Error(`page status ${resp?.status()}`);
  // Locators, never waitForFunction: an app CSP without 'unsafe-eval' makes a
  // polled predicate throw (mesonet-status, 2026-10).
  const sel = env('OG_READY_SELECTOR', '');
  if (sel) {
    const text = env('OG_READY_TEXT', '');
    const loc = text ? page.locator(sel, { hasText: new RegExp(text) }) : page.locator(sel);
    await loc.first().waitFor({ state: 'attached', timeout: 90_000 });
  }
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => log('networkidle not reached; continuing'));
  // MCO.loading sets aria-busy while a load is in flight.
  await page.locator('[aria-busy="true"]').first().waitFor({ state: 'detached', timeout: 60_000 });
  const fail = ['.mco-notice[data-tone="danger"]', env('OG_FAIL_SELECTOR', '')].filter(Boolean).join(', ');
  if (await page.locator(fail).first().isVisible().catch(() => false)) {
    throw new Error(`failure marker visible (${fail})`);
  }
  await page.waitForTimeout(Number(env('OG_SETTLE_MS', '3000')));
  const buf = await page.screenshot({ type: 'png' });
  await ctx.close();
  return { buf, expect: { w: Math.round(width * scale), h: Math.round(height * scale) } };
}

// Decode in a blank page: measure size and luma spread, re-encode as JPEG.
// No image library needed beyond the browser we already have.
async function toJpeg(browser, buf, mime) {
  const probe = await browser.newPage();
  await probe.setContent(`<img id=i src="data:${mime};base64,${buf.toString('base64')}">`);
  const stats = await probe.evaluate(async () => {
    const img = document.getElementById('i');
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = new OffscreenCanvas(w, h).getContext('2d');
    c.drawImage(img, 0, 0);
    const d = c.getImageData(0, 0, w, h).data;
    let n = 0, sum = 0, sq = 0;
    for (let p = 0; p < d.length; p += 4 * 7) {   // every 7th pixel is plenty
      const y = 0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2];
      sum += y; sq += y * y; n++;
    }
    const mean = sum / n;
    return { w, h, stddev: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
  });
  await probe.setViewportSize({ width: stats.w, height: stats.h });
  await probe.addStyleTag({ content: 'html,body{margin:0}img{display:block}' });
  const jpeg = await probe.screenshot({ type: 'jpeg', quality: QUALITY, clip: { x: 0, y: 0, width: stats.w, height: stats.h } });
  await probe.close();
  return { jpeg, ...stats };
}

function check(s, expect) {
  const why = [];
  if (expect && (s.w !== expect.w || s.h !== expect.h)) why.push(`size ${s.w}×${s.h}, expected ${expect.w}×${expect.h}`);
  if (!expect && (s.w < 1200 || s.w / s.h < 1.5 || s.w / s.h > 2.2)) why.push(`size ${s.w}×${s.h} is not a card shape`);
  if (s.stddev < MIN_STDDEV) why.push(`flat image (luma stddev ${s.stddev.toFixed(1)})`);
  if (s.jpeg.length < MIN_BYTES || s.jpeg.length > MAX_BYTES) why.push(`${s.jpeg.length} bytes`);
  return why;
}

async function fallback(browser, out) {
  for (const url of env('OG_FALLBACKS', '').split('\n').map((s) => s.trim()).filter(Boolean)) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'mco-og-preview' } });
      const type = r.headers.get('content-type') || '';
      const buf = Buffer.from(await r.arrayBuffer());
      if (r.status !== 200 || !type.startsWith('image/') || buf.length < 10_000) {
        log(`fallback ${url}: INVALID (status ${r.status}, ${type || 'no type'}, ${buf.length} bytes)`);
        continue;
      }
      const s = await toJpeg(browser, buf, type.split(';')[0]);
      await writeFile(out, s.jpeg);
      log(`fallback ${url}: used (${s.w}×${s.h}, ${s.jpeg.length} bytes)`);
      return true;
    } catch (e) {
      log(`fallback ${url}: INVALID (${e.message})`);
    }
  }
  return false;
}

async function shoot() {
  const out = env('OG_OUT');
  if (!env('OG_URL') || !out) throw new Error('OG_URL and OG_OUT are required');
  const browser = await chromium.launch();
  try {
    let why;
    try {
      const { buf, expect } = await capture(browser);
      const s = await toJpeg(browser, buf, 'image/png');
      why = check(s, expect);
      if (!why.length) {
        await writeFile(out, s.jpeg);
        log(`VALID ${env('OG_URL')} → ${out}: ${s.w}×${s.h}, ${s.jpeg.length} bytes, luma stddev ${s.stddev.toFixed(1)}`);
        return 0;
      }
    } catch (e) {
      why = [e.message.split('\n')[0]];
    }
    log(`INVALID ${env('OG_URL')}: ${why.join('; ')}`);
    return (await fallback(browser, out)) ? 3 : 1;
  } finally {
    await browser.close();
  }
}

async function stamp() {
  const image = env('OG_IMAGE');
  const v = env('OG_STAMP');
  if (!image || !v) throw new Error('OG_IMAGE and OG_STAMP are required');
  const esc = image.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tag = /<meta\b[^>]*\b(?:property|name)\s*=\s*"(?:og:image|og:image:secure_url|twitter:image)"[^>]*>/gi;
  const content = new RegExp(`(content\\s*=\\s*"[^"]*/${esc})(?:\\?[^"]*)?"`, 'i');
  let total = 0;
  for (const file of env('OG_HTML', 'index.html').split('\n').map((s) => s.trim()).filter(Boolean)) {
    const html = await readFile(file, 'utf8');
    let n = 0;
    const next = html.replace(tag, (m) => m.replace(content, (_, head) => { n++; return `${head}?v=${v}"`; }));
    await writeFile(file, next);
    log(`stamped ${n} tag(s) in ${file} with ?v=${v}`);
    total += n;
  }
  if (!total) { log(`INVALID: no og:image/twitter:image tag ends in ${image}`); return 1; }
  return 0;
}

const cmd = process.argv[2];
const run = cmd === 'shoot' ? shoot : cmd === 'stamp' ? stamp : null;
if (!run) { console.error('usage: og-preview.mjs shoot|stamp'); process.exit(2); }
run().then((code) => process.exit(code), (e) => { console.error(`[og-preview] ${e.stack || e}`); process.exit(1); });
