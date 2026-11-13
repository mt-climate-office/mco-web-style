#!/usr/bin/env node
// family-audit.mjs — measure the family's chrome across consumers, and check
// the conformance rules HOUSE-STYLE sets for every map tool.
//
// Tooling only (never a runtime dependency). Install Playwright ephemerally as
// in tools/verify/README.md, then:
//
//   node tools/verify/family-audit.mjs                       # every consumer, production
//   node tools/verify/family-audit.mjs --only status,umrb
//   node tools/verify/family-audit.mjs --url status=http://127.0.0.1:8000/
//   node tools/verify/family-audit.mjs --out /tmp/audit --no-sheets
//   node tools/verify/family-audit.mjs --fold-repeats 10      # fold determinism (0 skips)
//
// For each site and view it writes a screenshot and a metrics row, then a
// contact sheet per view. Each acceptance check prints PASS, FAIL, or INVALID
// (the page did not load or the element under test is missing — never a value).

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const SITES = {
  explorer:    { url: 'https://mesonet.climate.umt.edu/explorer/',    station: 'station', map: true },
  // bar: not a map tool, but its navbar keeps the control-height rule (0.21.1);
  // the section track is the control (its links sit inside it, as .seg-btn do).
  dashboard:   { url: 'https://mesonet.climate.umt.edu/dash/next/',   station: 's',       map: false, bar: '.dash-sections' },
  // allow404: the documented photo-slot probing (a camera with no photo at the slot).
  photos:      { url: 'https://mesonet.climate.umt.edu/photos/',      station: 'station', map: true, allow404: true },
  status:      { url: 'https://mesonet.climate.umt.edu/status/',      station: 'station', map: true },
  maintenance: { url: 'https://mesonet.climate.umt.edu/maintenance/', station: 'station', map: true },
  umrb:        { url: 'https://mesonet.climate.umt.edu/umrb/',        station: 'station', map: true },
  snowpack:    { url: 'https://snow.climate.umt.edu/',                station: null,      map: true },
  aq:          { url: 'https://mesonet2.climate.umt.edu/air/',        station: null,      map: true },
  website:     { url: 'https://next.climate.umt.edu/',                station: null,      map: false },
};
const VIEWS = [
  { id: 'd-dark',  w: 1440, h: 900, scheme: 'dark' },
  { id: 'd-light', w: 1440, h: 900, scheme: 'light' },
  { id: 'd-hc',    w: 1440, h: 900, scheme: 'dark', q: 'theme=high-contrast' },
  { id: 't-dark',  w: 1024, h: 768, scheme: 'dark' },
  { id: 'm-dark',  w: 390,  h: 844, scheme: 'dark', mobile: true },
  { id: 'm-light', w: 390,  h: 844, scheme: 'light', mobile: true },
  // 0.21.2: the smallest phone, and a portrait tablet with touch, where the
  // bar folds above 640px.
  { id: 's-dark',  w: 320,  h: 568, scheme: 'dark', mobile: true },
  { id: 'tt-dark', w: 768,  h: 1024, scheme: 'dark', mobile: true },
];

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const only = opt('--only')?.split(',') ?? null;
const out = path.resolve(opt('--out') ?? 'family-audit-out');
const station = opt('--station') ?? 'aceabsar';
// Fresh loads per width for the fold determinism check (0.21.2); 0 skips it.
const foldRepeats = Number(opt('--fold-repeats') ?? 3);
for (let i = 0; i < args.length; i++) if (args[i] === '--url') {
  const [k, ...v] = args[i + 1].split('='); if (!SITES[k]) { console.error('unknown site', k); process.exit(2); }
  SITES[k].url = v.join('=');
}
fs.mkdirSync(path.join(out, 'shots'), { recursive: true });

const METRICS = (extra) => {
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const rect = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
  const nav = document.querySelector('.mco-navbar');
  const logo = nav?.querySelector('img');
  const controls = nav ? [...nav.querySelectorAll('button, a.nav-btn, select, input:not([type=radio]):not([type=checkbox]), label.seg-btn' + (extra ? ', ' + extra : ''))].filter(vis)
    .filter(el => !el.closest('.mco-nav-drawer:not(.is-open)') || getComputedStyle(el.closest('.mco-nav-drawer')).display === 'contents')
    .map(el => ({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 40), id: el.id, h: rect(el)[3], w: rect(el)[2] })) : [];
  const stamp = document.querySelector('.refresh-status');
  const offChip = nav ? [...nav.querySelectorAll('button[aria-pressed]')].filter(vis).filter(b => !b.classList.contains('mco-chip') && !b.classList.contains('seg-btn') && !b.closest('.seg-btns'))
    // An icon-only view toggle (station labels, units) stays .nav-btn[aria-pressed],
    // which the kit sanctions; the chip rule covers labelled filters and layers.
    .filter(b => !b.classList.contains('icon-only'))
    .map(b => b.id || b.textContent.trim().slice(0, 20)) : [];
  return {
    title: document.title,
    navH: nav ? rect(nav)[3] : null,
    logoVisible: vis(logo),
    controls,
    stamp: stamp && vis(stamp) ? stamp.textContent.replace(/\s+/g, ' ').trim() : null,
    offChipToggles: offChip,
    sheetOpen: [...document.querySelectorAll('.mco-sheet')].some(s => vis(s) && s.dataset.state !== 'closed'),
    dialogOpen: !!document.querySelector('dialog[open]'),
  };
};

const browser = await chromium.launch();
const results = {};
const check = (site, view, name, ok, detail = '') => {
  const verdict = ok === null ? 'INVALID' : ok ? 'PASS   ' : 'FAIL   ';
  console.log(`${verdict} ${site.padEnd(11)} ${view.padEnd(8)} ${name}${detail ? '  ' + detail : ''}`);
  (results[site].checks ??= []).push({ view, name, verdict: verdict.trim(), detail });
};

async function load(url, v) {
  const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, colorScheme: v.scheme, isMobile: !!v.mobile, hasTouch: !!v.mobile, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  let status = null;
  try { status = (await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }))?.status() ?? null; }
  catch { try { status = (await page.goto(url, { waitUntil: 'load', timeout: 45000 }))?.status() ?? null; } catch (e) { errors.push('NAV ' + e.message.slice(0, 100)); } }
  await page.waitForTimeout(3500);
  return { ctx, page, status, errors };
}

for (const [name, site] of Object.entries(SITES)) {
  if (only && !only.includes(name)) continue;
  results[name] = { url: site.url, views: {} };
  for (const v of VIEWS) {
    const u = v.q ? site.url + (site.url.includes('?') ? '&' : '?') + v.q : site.url;
    const { ctx, page, status, errors } = await load(u, v);
    if (await page.evaluate(() => !!document.querySelector('dialog[open]'))) { await page.keyboard.press('Escape'); await page.waitForTimeout(800); }
    const m = await page.evaluate(METRICS, site.bar || null).catch(e => ({ err: String(e) }));
    await page.screenshot({ path: path.join(out, 'shots', `${name}_${v.id}.png`) });
    results[name].views[v.id] = { status, errors, ...m };
    const valid = status === 200 && m.navH != null;
    if ((site.map || site.bar) && v.id.endsWith('dark') && v.id !== 'd-hc') {
      const want = v.mobile ? 40 : 34;
      const hs = [...new Set((m.controls ?? []).map(c => c.h))];
      check(name, v.id, `navbar controls all ${want}px`, valid && m.controls.length ? hs.length === 1 && hs[0] === want : null, `heights=${hs.join('/')}`);
    }
    if (site.map && v.id.endsWith('dark') && v.id !== 'd-hc') {
      if (v.mobile) {
        check(name, v.id, 'phone navbar ≤ 64px', valid ? m.navH <= 64 : null, `navH=${m.navH}`);
        check(name, v.id, 'badge visible on phone', valid ? m.logoVisible : null);
      }
      if (!v.mobile && m.stamp != null) check(name, v.id, 'stamp reads "Updated … M[SD]T"', /Updated .*M[SD]T$/.test(m.stamp), `"${m.stamp}"`);
      if (!v.mobile) check(name, v.id, 'on/off toggles are .mco-chip', valid ? m.offChipToggles.length === 0 : null, m.offChipToggles.join(', '));
      const errs = site.allow404 ? errors.filter(e => !/status of 404/.test(e)) : errors;
      check(name, v.id, 'no console errors', status === 200 ? errs.length === 0 : null, errs.slice(0, 2).join(' | '));
    }
    // 0.21.2. On a touch phone: fields at 16px so iOS doesn't zoom. Above
    // phone size (a touch tablet, a desktop) the kit's 16px rule must be
    // inert, so field sizes and the fold come from the app's own CSS. On
    // touch: ☰ at the right edge of a folded bar beside a visible search
    // button, and ☰ focusing the drawer rather than a field (which would
    // raise the keyboard).
    const phone = v.mobile && (v.w <= 640 || v.h <= 560);
    if (site.map && (v.mobile || v.id === 'd-dark') && v.id.endsWith('dark') && valid) {
      const t = await page.evaluate(() => {
        const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
        const small = [...document.querySelectorAll('input, select, textarea')]
          .filter(e => !/^(hidden|checkbox|radio|range|button|submit|reset|color|file|image)$/.test(e.type))
          .filter(e => parseFloat(getComputedStyle(e).fontSize) < 16)
          .map(e => `${e.id || e.tagName.toLowerCase()}=${getComputedStyle(e).fontSize}`);
        // The kit's phone-field rule: its media query must not match here
        // above phone size. null when the kit sheet can't be read.
        let phoneRule = null;
        for (const sh of document.styleSheets) {
          if (!/mco-theme\.css/.test(sh.href || '')) continue;
          try {
            phoneRule = false;
            for (const r of sh.cssRules) if (r.media && /hover: none/.test(r.media.mediaText) && /font-size: 16px/.test(r.cssText)) phoneRule = phoneRule || matchMedia(r.media.mediaText).matches;
          } catch { phoneRule = null; }
        }
        const nav = document.querySelector('.mco-navbar');
        const menu = nav?.querySelector('.mco-rail > :first-child');
        const toggle = nav?.querySelector('.mco-rail > .mco-search-toggle');
        return {
          small, phoneRule, folded: !!nav?.classList.contains('is-folded'), menu: vis(menu),
          // clientWidth, not innerWidth: page overflow widens the layout viewport.
          gap: menu ? Math.round(document.documentElement.clientWidth - menu.getBoundingClientRect().right) : null,
          toggle: toggle ? vis(toggle) : null,
        };
      });
      if (phone) check(name, v.id, 'text fields ≥ 16px on a touch phone', t.small.length === 0, t.small.slice(0, 4).join(' '));
      else check(name, v.id, 'kit 16px field rule inert above phone size', t.phoneRule === null ? null : !t.phoneRule, `folded=${t.folded}`);
      if (v.mobile && t.folded) {
        check(name, v.id, 'folded bar: ☰ within 16px of the right edge', t.menu ? t.gap <= 16 : null, `gap=${t.gap}`);
        if (t.toggle !== null) check(name, v.id, 'folded bar: search button visible', t.toggle);
        if (t.menu) {
          await page.locator('.mco-navbar .mco-rail > :first-child').first().click().catch(() => {});
          await page.waitForTimeout(400);
          const f = await page.evaluate(() => {
            const a = document.activeElement;
            const field = !!a && (a.matches('textarea, select, [contenteditable="true"]') ||
              (a.tagName === 'INPUT' && !/^(checkbox|radio|range|button|submit|reset|color|file|image)$/.test(a.type)));
            return { open: !!document.querySelector('.mco-nav-drawer.is-open'), field, what: a ? (a.id || a.className || a.tagName) : null };
          });
          check(name, v.id, '☰ opens the drawer without focusing a text field', f.open ? !f.field : null, `focus=${f.what}`);
          await page.keyboard.press('Escape');
        }
      }
    }
    // 0.21.2: an expanded over-map legend must keep its collapse toggle
    // reachable: hit-testable, on screen, below a top bar, and the panel
    // inside the map. Then the toggle must collapse it.
    if (site.map && v.id.endsWith('dark') && v.id !== 'd-hc' && valid) {
      await page.keyboard.press('Escape');
      const T = '.mco-panel:has(> .mco-panel-head .mco-panel-toggle) .mco-panel-toggle';
      const pre = await page.evaluate((t) => [...document.querySelectorAll(t)].find((b) => b.closest('.mco-panel').getClientRects().length)?.getAttribute('aria-expanded') ?? null, T);
      if (pre !== null) {
        if (pre === 'false') {
          await page.evaluate((t) => [...document.querySelectorAll(t)].find((b) => b.closest('.mco-panel').getClientRects().length).click(), T);
          await page.waitForTimeout(900);
        }
        const L = await page.evaluate((t) => {
          const tg = [...document.querySelectorAll(t)].find((b) => b.closest('.mco-panel').getClientRects().length);
          const p = tg.closest('.mco-panel'), map = document.querySelector('#map, .maplibregl-map'), bar = document.querySelector('.mco-navbar');
          const pr = p.getBoundingClientRect(), tr = tg.getBoundingClientRect(), mr = map ? map.getBoundingClientRect() : null, br = bar?.getBoundingClientRect();
          const cx = tr.left + tr.width / 2, cy = tr.top + tr.height / 2, hit = document.elementFromPoint(cx, cy);
          return { id: p.id, cx, cy, expanded: tg.getAttribute('aria-expanded'), rect: [pr.left, pr.top, pr.width, pr.height].map(Math.round),
            ok: !!hit && tg.contains(hit) && cx >= 0 && cx <= innerWidth && cy >= 0 && cy <= innerHeight &&
              (!br || br.height >= innerHeight / 2 || tr.top >= br.bottom - 0.5) &&
              (!mr || (pr.top >= mr.top - 1 && pr.bottom <= mr.bottom + 1)) };
        }, T);
        check(name, v.id, 'expanded legend: toggle reachable, panel inside the map', L.expanded === 'true' ? L.ok : null, `#${L.id} ${L.rect.join(',')}`);
        if (L.ok) {
          await page.mouse.click(L.cx, L.cy);   // a real click at the toggle's centre
          await page.waitForTimeout(700);
          const after = await page.evaluate((t) => [...document.querySelectorAll(t)].find((b) => b.closest('.mco-panel').getClientRects().length)?.getAttribute('aria-expanded'), T);
          check(name, v.id, 'legend toggle collapses it', after === 'false', `aria-expanded=${after}`);
        }
      }
    }
    await ctx.close();
  }
  // One row at every width (0.21.1): sweep 641–1440 with a mouse, and the
  // tablet widths with touch, where 40px controls make the bar widest.
  if (site.map) for (const touch of [false, true]) {
    const v = { w: 1440, h: 900, scheme: 'dark', mobile: touch };
    const { ctx, page, status } = await load(site.url, v);
    if (await page.evaluate(() => !!document.querySelector('dialog[open]'))) { await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
    const over = [];
    let measured = 0;
    for (const w of touch ? [768, 820, 1024, 1180, 1366] : [641, 680, 720, 768, 820, 900, 980, 1024, 1061, 1100, 1180, 1280, 1366, 1440]) {
      await page.setViewportSize({ width: w, height: touch && w < 1024 ? 1024 : 800 });
      await page.waitForTimeout(650);     // an app's debounced resize work, then the kit's refold
      const h = await page.evaluate(() => { const n = document.querySelector('.mco-navbar'); return n ? Math.round(n.getBoundingClientRect().height) : null; });
      if (h == null) continue;
      measured++;
      if (h > 64) over.push(`${w}:${h}`);
    }
    check(name, touch ? 'sweep-t' : 'sweep', `navbar one row (≤ 64px) at every ${touch ? 'tablet touch' : '641–1440'} width`, status === 200 && measured ? over.length === 0 : null, over.join(' '));
    await ctx.close();
  }
  // The fold is deterministic (0.21.2): fresh loads of one width end in the
  // same state, and that state is the unfolded bar's (folded exactly when
  // the full bar, measured unfolded, is taller than 64px). It once depended
  // on whether the web fonts had loaded before the first measurement.
  if (site.map && foldRepeats > 0) for (const [w, h] of [[1024, 768], [1180, 900], [1440, 900]]) {
    const states = [], wrong = [];
    let loaded = 0;
    for (let i = 0; i < foldRepeats; i++) {
      const { ctx, page, status } = await load(site.url, { w, h, scheme: 'dark' });
      const r = await page.evaluate(() => {
        const bar = document.querySelector('.mco-navbar[data-rail="compact"]');
        if (!bar) return null;
        const f = bar.classList.contains('is-folded');
        bar.classList.remove('is-folded');
        const uh = Math.round(bar.getBoundingClientRect().height);
        if (f) bar.classList.add('is-folded');
        return { f, uh };
      }).catch(() => null);
      await ctx.close();
      if (status !== 200 || !r) continue;
      loaded++;
      states.push(r.f ? 'F' : 'u');
      if (r.f !== r.uh > 64) wrong.push(`${r.f ? 'folded' : 'full'} at unfolded ${r.uh}px`);
    }
    check(name, `fold-${w}`, `fold state identical on ${foldRepeats} fresh loads and matches the unfolded height`,
      loaded === foldRepeats ? new Set(states).size === 1 && wrong.length === 0 : null, `${states.join('')} ${wrong.join('; ')}`);
  }
  // Deep link: ?<param>=<station> must open the sheet at desktop and phone width.
  if (site.station && site.map) for (const v of [VIEWS[0], VIEWS[4]]) {
    const u = site.url + (site.url.includes('?') ? '&' : '?') + `${site.station}=${station}`;
    const { ctx, page, status } = await load(u, v);
    await page.waitForTimeout(2500);
    const m = await page.evaluate(METRICS).catch(() => ({}));
    await page.screenshot({ path: path.join(out, 'shots', `${name}_${v.id}_station.png`) });
    check(name, v.id, `?${site.station}=${station} opens the sheet`, status === 200 ? !!m.sheetOpen : null);
    await ctx.close();
  }
}

fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(results, null, 1));

if (!args.includes('--no-sheets')) {
  const names = Object.keys(results);
  for (const v of VIEWS) {
    const cw = v.mobile ? 300 : 640, cols = v.mobile ? names.length : 3;
    const cells = names.map(n => {
      const f = path.join(out, 'shots', `${n}_${v.id}.png`);
      if (!fs.existsSync(f)) return '';
      return `<figure style="margin:0"><figcaption style="font:600 15px system-ui;padding:4px 0">${n}</figcaption><img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}" style="width:${cw}px;display:block;border:1px solid #888"></figure>`;
    }).join('');
    const page = await browser.newPage({ viewport: { width: cols * (cw + 10) + 16, height: 400 } });
    await page.setContent(`<body style="margin:8px;background:#fff"><div style="display:grid;grid-template-columns:repeat(${cols},${cw}px);gap:10px">${cells}</div></body>`);
    // Capture only once every image has decoded: a full-page capture taken
    // while the big data: PNGs still measure 0 high failed outright (0.21.1).
    await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalHeight > 0), null, { timeout: 30000 }).catch(() => {});
    try { await page.screenshot({ path: path.join(out, `sheet-${v.id}.png`), fullPage: true }); }
    catch (e) { console.log(`INVALID contact sheet ${v.id}: ${e.message.split('\n')[0]}`); }
    await page.close();
  }
}
await browser.close();
const all = Object.values(results).flatMap(r => r.checks ?? []);
const tally = v => all.filter(c => c.verdict === v).length;
console.log(`\n${tally('PASS')} pass · ${tally('FAIL')} fail · ${tally('INVALID')} invalid — ${out}`);
process.exit(tally('FAIL') || tally('INVALID') ? 1 : 0);
