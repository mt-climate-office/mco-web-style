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
// 1.0.0 checks (the phone layout; a consumer still on 0.21.x markup fails
// them by design): the rail at the right edge in short landscape, its
// buttons ≥ 44px and ☰ opening the drawer beside it; the station panel on
// compact = the viewport less the bar(s), with the bar not inert; its
// header (title, 44px close button top right) identical at 390, 768 and
// 1440; a bottom control bar publishing --tabbar-h and hiding under a
// (simulated) keyboard; and the drawer at 390 holding the desktop bar's
// control labels in the same order.
//
// For each site and view it writes a screenshot and a metrics row, then a
// contact sheet per view. Each acceptance check prints PASS, FAIL, or INVALID
// (the page did not load or the element under test is missing — never a value).

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const SITES = {
  // sidebar: where the desktop controls live when not in the bar (the label
  // consistency check reads it at 1440 instead of the bar, 1.0.0).
  explorer:    { url: 'https://mesonet.climate.umt.edu/explorer/',    station: 'station', map: true, sidebar: '#sidebar' },
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
  // 1.0.0: short landscape phones, where the bar is the rail at the RIGHT edge.
  { id: 'l-dark',  w: 750,  h: 342, scheme: 'dark', mobile: true },
  { id: 'lx-dark', w: 844,  h: 390, scheme: 'dark', mobile: true },
];
const VIEW = Object.fromEntries(VIEWS.map((v) => [v.id, v]));

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
    // The rail (short landscape, 1.0.0) is a column of 44px buttons, not a row.
    const railView = v.mobile && v.h <= 560 && v.w > v.h;
    if ((site.map || site.bar) && v.id.endsWith('dark') && v.id !== 'd-hc' && !railView) {
      const want = v.mobile ? 40 : 34;
      const hs = [...new Set((m.controls ?? []).map(c => c.h))];
      check(name, v.id, `navbar controls all ${want}px`, valid && m.controls.length ? hs.length === 1 && hs[0] === want : null, `heights=${hs.join('/')}`);
    }
    if (site.map && v.id.endsWith('dark') && v.id !== 'd-hc') {
      if (v.mobile && !railView) check(name, v.id, 'phone navbar ≤ 64px', valid ? m.navH <= 64 : null, `navH=${m.navH}`);
      if (v.mobile) check(name, v.id, 'badge visible on phone', valid ? m.logoVisible : null);
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
    // 1.0.0: the rail at the RIGHT edge in short landscape. Its buttons are
    // ≥ 44px on touch and on screen; ☰ opens the drawer beside it (its right
    // edge at the rail's left), with focus on the drawer, not a field.
    if (site.map && v.mobile && v.h <= 560 && v.w > v.h && valid) {
      const r = await page.evaluate(() => {
        const nav = document.querySelector('.mco-navbar[data-rail]');
        if (!nav) return null;
        const nr = nav.getBoundingClientRect();
        const cb = document.querySelector('body > .mco-controlbar');
        const btns = [nav.querySelector(':scope > .logo-link'), ...nav.querySelectorAll('.mco-rail button'), ...(cb ? cb.querySelectorAll('button') : [])].filter(Boolean)
          .filter((b) => b.getClientRects().length).map((b) => b.getBoundingClientRect())
          .map((q) => [Math.round(q.width), Math.round(q.height), Math.round(q.top), Math.round(q.bottom)]);
        // The top group (badge, ☰, search) whole, hittable, and above the control bar (1.0.0 round 2).
        const cbTop = cb && cb.getClientRects().length ? cb.getBoundingClientRect().top : innerHeight;
        const top = [nav.querySelector(':scope > .logo-link'), nav.querySelector('.mco-rail > :first-child'), nav.querySelector('.mco-rail > .mco-search-toggle')].filter(Boolean).map((e) => {
          const q = e.getBoundingClientRect(), hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
          return { ok: !!hit && (hit === e || e.contains(hit)) && q.bottom <= cbTop + 0.5 && q.top >= 0, b: Math.round(q.bottom) }; });
        return { top, cbTop: Math.round(cbTop), rail: !!window.MCO && MCO.viewport.isRail(), x: Math.round(nr.left), w: Math.round(nr.width),
          gap: Math.round(document.documentElement.clientWidth - nr.right), vh: innerHeight, btns,
          search: !!nav.querySelector('.mco-rail > .mco-search-toggle') && nav.querySelector('.mco-rail > .mco-search-toggle').getClientRects().length > 0 };
      });
      check(name, v.id, 'rail at the right edge', r ? r.rail && r.gap === 0 && r.x > v.w / 2 : null, r ? `x=${r.x} gap=${r.gap}` : 'no data-rail bar');
      if (r) {
        check(name, v.id, 'rail buttons ≥ 44px and on screen', r.btns.length ? r.btns.every(([w, h, t, b]) => w >= 44 && h >= 44 && t >= 0 && b <= r.vh) : null, r.btns.map((b) => b.slice(0, 2).join('×')).join(' '));
        check(name, v.id, 'rail shows the search button', r.search);
        check(name, v.id, 'rail top group (badge, ☰, search) whole, hittable, above the control bar', r.top.length >= 2 ? r.top.every((t) => t.ok) : null,
          `bottoms=${r.top.map((t) => t.b)} bar=${r.cbTop}`);
        await page.locator('.mco-navbar .mco-rail > :first-child').first().click().catch(() => {});
        await page.waitForTimeout(400);
        const d = await page.evaluate(() => {
          const dr = document.querySelector('.mco-nav-drawer.is-open'), nr = document.querySelector('.mco-navbar').getBoundingClientRect();
          const a = document.activeElement;
          const field = !!a && (a.matches('textarea, select, [contenteditable="true"]') || (a.tagName === 'INPUT' && !/^(checkbox|radio|range|button|submit|reset|color|file|image)$/.test(a.type)));
          return dr ? { right: Math.round(dr.getBoundingClientRect().right), railLeft: Math.round(nr.left), field, what: a ? (a.id || a.tagName) : null } : null;
        });
        check(name, v.id, '☰ opens the drawer beside the rail, focus not a field', d ? Math.abs(d.right - d.railLeft) <= 1 && !d.field : null, d ? `drawer right=${d.right} rail=${d.railLeft} focus=${d.what}` : 'no open drawer');
        await page.keyboard.press('Escape');
      }
    }
    // 1.0.0 round 2: on compact, a Legend button (MCO.initLegendDrawer) never
    // overlaps the map's bottom-corner controls (attribution, scale).
    if (site.map && phone && valid) {
      const lb = await page.evaluate(() => {
        const b = document.querySelector('.mco-legend-btn');
        if (!b || !b.getClientRects().length) return null;
        const r = b.getBoundingClientRect();
        return [...document.querySelectorAll('.maplibregl-ctrl-bottom-left > *, .maplibregl-ctrl-bottom-right > *')].map((c) => c.getBoundingClientRect())
          .filter((c) => c.height && c.left < r.right && c.right > r.left && c.top < r.bottom && c.bottom > r.top).length;
      });
      if (lb !== null) check(name, v.id, 'Legend button clear of the map\'s bottom-corner controls', lb === 0, `${lb} overlap(s)`);
    }
    // 1.0.0: the bottom control bar (where an app has one), on a portrait
    // phone: docked at the bottom, --tabbar-h = its height, hidden under a
    // keyboard (visualViewport.height reduced by 300px).
    if (site.map && phone && v.h > v.w && valid) {
      const b = await page.evaluate(() => {
        const cb = document.querySelector('body > .mco-controlbar');
        // An app may hide its bar by design in a mode (explorer's Latest).
        if (!cb || !cb.getClientRects().length) return null;
        const r = cb.getBoundingClientRect();
        return { bottom: Math.round(r.bottom), h: Math.round(r.height), vh: innerHeight,
          tabbar: getComputedStyle(document.documentElement).getPropertyValue('--tabbar-h').trim() };
      });
      if (b) {
        check(name, v.id, 'control bar docked at the bottom, --tabbar-h = its height', b.bottom === b.vh && b.tabbar === b.h + 'px', JSON.stringify(b));
        const k = await page.evaluate(() => new Promise((res) => {
          const vv = window.visualViewport; if (!vv) { res(null); return; }
          const h = document.documentElement.clientHeight - 300;
          Object.defineProperty(vv, 'height', { configurable: true, get: () => h });
          vv.dispatchEvent(new Event('resize'));
          setTimeout(() => {
            const cb = document.querySelector('body > .mco-controlbar');
            res({ kb: document.documentElement.classList.contains('kb-open'), shown: cb.getClientRects().length > 0,
              tabbar: getComputedStyle(document.documentElement).getPropertyValue('--tabbar-h').trim() });
            delete vv.height; vv.dispatchEvent(new Event('resize'));
          }, 300);
        }));
        check(name, v.id, 'control bar hides under a keyboard', k ? k.kb && !k.shown && k.tabbar === '0px' : null, JSON.stringify(k));
      }
    }
    // 1.0.0: the drawer holds the desktop bar's controls, same labels, same
    // order (Kyle: consistency across widths). Names are read from the open
    // drawer at 390 and from the full bar's .mco-nav-drawer (display:
    // contents) at 1440; results are compared after both views ran.
    if (site.map && (v.id === 'm-dark' || v.id === 'd-dark') && valid) {
      if (v.id === 'm-dark') {
        await page.locator('.mco-navbar .mco-rail > :first-child').first().click().catch(() => {});
        await page.waitForTimeout(400);
      }
      const labels = await page.evaluate((side) => {
        const dr = (side && document.querySelector(side) && document.querySelector(side).getClientRects().length && innerWidth > 1000
          ? document.querySelector(side) : null) || document.querySelector('.mco-nav-drawer');
        if (!dr) return null;
        const vis = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
        const nameOf = (el) => (el.getAttribute('aria-label') || (el.labels && el.labels[0] && el.labels[0].textContent) ||
          (el.getAttribute('aria-labelledby') || '').split(' ').map((id) => document.getElementById(id)?.textContent || '').join(' ') || el.textContent || '').replace(/\s+/g, ' ').trim();
        // A segmented group counts once, by its own name, so it matches the
        // <select> that replaces it below 1060px (MCO.initSegmentedFallback).
        const groupName = (g) => (g.getAttribute('aria-label') || g.querySelector('legend')?.textContent ||
          (g.getAttribute('aria-labelledby') || '').split(' ').map((id) => document.getElementById(id)?.textContent || '').join(' ') || '').replace(/\s+/g, ' ').trim();
        const out = [];
        for (const el of dr.querySelectorAll('button, a[href], select, input:not([type=hidden])')) {
          // The legend group MCO.initLegendDrawer adds on a phone is the map's
          // legend, not the bar's controls (1.0.0 round 2).
          if (el.closest('.mco-legend-slot')) continue;
          const g = el.closest('.seg-btns');
          if (!(g ? vis(g) : vis(el))) continue;
          if (!g && el.type === 'radio') continue;
          const n = g ? groupName(g) || nameOf(el) : nameOf(el);
          if (n && out[out.length - 1] !== n) out.push(n);
        }
        // A phone's hot controls live in the folded bar (HOUSE-STYLE §3), not
        // necessarily in the drawer: they count as present, not in the order.
        const hot = innerWidth <= 640 ? [...document.querySelectorAll('.mco-navbar .mco-rail > *')]
          .filter((e) => vis(e) && e !== e.parentElement.firstElementChild && !e.classList.contains('mco-search-toggle'))
          .flatMap((e) => (e.matches('button, select, input') ? [e] : [...e.querySelectorAll('button, select, input')])).map(nameOf).filter(Boolean) : [];
        return { out, hot };
      }, site.sidebar || null);
      (results[name].labels ??= {})[v.id] = labels;
      if (v.id === 'm-dark') await page.keyboard.press('Escape');
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
  // 1.0.0: drawer at 390 vs desktop bar at 1440, same labels, same order.
  if (site.map) {
    const L = results[name].labels || {};
    const a = L['d-dark'] && L['d-dark'].out, b = L['m-dark'] && L['m-dark'].out, hot = (L['m-dark'] && L['m-dark'].hot) || [];
    if (a && b && a.length >= 2) {
      const missing = a.filter((x) => !b.includes(x) && !hot.includes(x)), extra = b.filter((x) => !a.includes(x));
      const ca = a.filter((x) => b.includes(x)), cbb = b.filter((x) => a.includes(x));
      const ordered = ca.join('|') === cbb.join('|');
      check(name, 'x-width', 'drawer (390) holds the desktop bar\'s control labels in the same order',
        missing.length === 0 && extra.length === 0 && ordered, `missing=[${missing.join(', ')}] extra=[${extra.join(', ')}]${ordered ? '' : ' order differs'}`);
    }
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
  // Deep link: ?<param>=<station> must open the sheet at every width. 1.0.0:
  // on compact the panel is the viewport less the bar(s) (the bar's bottom,
  // or 0 beside the rail, to the control bar's top or the bottom; 0 to the
  // rail's left), the bar is not inert, and the header (title, a 44px close
  // button top right) is the same at 390, 768 and 1440.
  const heads = {};
  if (site.station && site.map) for (const v of [VIEW['d-dark'], VIEW['tt-dark'], VIEW['m-dark'], VIEW['l-dark']]) {
    const u = site.url + (site.url.includes('?') ? '&' : '?') + `${site.station}=${station}`;
    const { ctx, page, status } = await load(u, v);
    await page.waitForTimeout(2500);
    const m = await page.evaluate(METRICS).catch(() => ({}));
    await page.screenshot({ path: path.join(out, 'shots', `${name}_${v.id}_station.png`) });
    check(name, v.id, `?${site.station}=${station} opens the sheet`, status === 200 ? !!m.sheetOpen : null);
    if (status === 200 && m.sheetOpen) {
      const s = await page.evaluate(() => {
        const sh = [...document.querySelectorAll('.mco-sheet')].find((x) => x.dataset.state !== 'closed' && x.getClientRects().length);
        const nav = document.querySelector('.mco-navbar'), cb = document.querySelector('body > .mco-controlbar');
        const sr = sh.getBoundingClientRect(), nr = nav.getBoundingClientRect(), cr = cb && cb.getClientRects().length ? cb.getBoundingClientRect() : null;
        const x = sh.querySelector('.mco-sheet-head [data-close-sheet]'), t = sh.querySelector('.mco-sheet-title');
        const xr = x && x.getBoundingClientRect();
        const rail = !!window.MCO && MCO.viewport.isRail() && nav.hasAttribute('data-rail');
        return { compact: !!window.MCO && MCO.viewport.isCompact(), rail, state: sh.dataset.state,
          rect: [sr.left, sr.top, sr.right, sr.bottom].map(Math.round),
          want: [0, rail ? 0 : Math.round(nr.bottom), rail ? Math.round(nr.left) : document.documentElement.clientWidth, cr && !rail ? Math.round(cr.top) : innerHeight],
          barTop: cr && !rail ? Math.round(cr.top) : null,
          navInert: !!nav.closest('[inert]'), grip: !!sh.querySelector('.mco-sheet-grip') && sh.querySelector('.mco-sheet-grip').getClientRects().length > 0,
          close: xr ? [Math.round(xr.width), Math.round(xr.height), Math.round(sr.right - xr.right), Math.round(xr.top - sr.top)] : null,
          title: !!t && (!xr || t.getBoundingClientRect().right <= xr.left + 1) };
      });
      if (!s.compact && s.barTop != null) {
        check(name, v.id, 'end-docked panel ends at the control bar', Math.abs(s.rect[3] - s.barTop) <= 1, `panel bottom=${s.rect[3]} bar top=${s.barTop}`);
      }
      if (s.compact) {
        check(name, v.id, 'station panel = viewport less the bar(s), one state', s.rect.every((n, i) => Math.abs(n - s.want[i]) <= 1) && s.state !== 'peek',
          `rect=${s.rect} want=${s.want} state=${s.state}`);
        check(name, v.id, 'navbar not inert over the station panel', !s.navInert);
      }
      check(name, v.id, 'panel header: 44px close button top right, no grip', s.close ? s.close[0] >= 44 && s.close[1] >= 44 && s.close[2] <= 16 && s.close[3] <= 16 && s.title && !s.grip : null,
        `close=${s.close} grip=${s.grip}`);
      heads[v.id] = s.close;
    }
    await ctx.close();
  }
  if (heads['d-dark'] && heads['tt-dark'] && heads['m-dark']) {
    const hs = ['d-dark', 'tt-dark', 'm-dark'].map((k) => heads[k]);
    check(name, 'x-width', 'station panel header identical at 1440, 768 and 390 (±2px)',
      hs.every((h) => h.every((n, i) => Math.abs(n - hs[0][i]) <= 2)), hs.map((h) => h.join(',')).join(' | '));
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
