#!/usr/bin/env node
/* Axe accessibility audit of the demo page in all three themes AND at two
   viewport widths. Fails on any serious/critical violation. The demo exercises
   every kit component, so axe coverage here approximates kit coverage.

   The narrow pass is not optional: the responsive ladder sheds labels (1400),
   collapses the brand (750) and collapses search (460), and each shed can strip
   an accessible name. A desktop-only audit is blind to all of it — that is
   exactly how the .control-label display:none bug reached production in
   mesonet-photos (fixed in v0.5.1).

   Requires (installed ephemerally — NOT kit dependencies; see .gitignore):
     npm init -y && npm i --no-save playwright@1.64.0 @axe-core/playwright@4.13.0
     npx playwright install --with-deps chromium webkit
   Then: node tools/a11y-audit.mjs */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { smallTargets } from './verify/lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json',
  '.geojson': 'application/geo+json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

  /* ── 1.0.0 probes ─────────────────────────────────────────────────────────
     The phone layout of 1.0.0, on the demo, in touch contexts: the rail at
     the RIGHT edge (badge, ☰, search, the control bar's time controls, all
     ≥ 44px) with its drawer beside it; the full-height station panel with
     the bar and the control bar live and its 44px close button at every
     width; the bottom control bar (--tabbar-h, safe area, hidden under a
     keyboard); MCO.keyboard and the K7 hold; the legend in the drawer; and
     ← / → date stepping with every exemption. A keyboard is modelled by
     overriding visualViewport.height (emulation has no on-screen keyboard).
     PROBE_ONLY=v1 runs just these. */
  async function v1Probes(engine, probe) {
    const launch = () => ENGINES[engine].launch(engine === 'chromium'
      ? { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] } : {});
    let vb = await launch();
    let visits = 0;
    const open = async (w, h, o = {}) => {
      // WebKit stops loading pages after enough visits in one browser.
      if (++visits % 12 === 0) { await vb.close(); vb = await launch(); }
      const touch = o.touch !== false;
      const ctx = await vb.newContext({ viewport: { width: w, height: h }, hasTouch: touch,
        isMobile: touch && engine === 'chromium', reducedMotion: 'reduce' });
      const p = await ctx.newPage();
      const errs = [];
      p.on('pageerror', (e) => errs.push(String(e)));
      await p.goto(`http://127.0.0.1:${port}${o.path || '/demo/'}?theme=dark${o.qs || ''}`, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(o.wait || 900);
      return { ctx, p, errs };
    };
    // Shared measurements: rects as [x, y, w, h], rounded.
    const R = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); })()`;
    const hits = (p, sel) => p.evaluate((s) => {
      const e = document.querySelector(s); if (!e) return false;
      const r = e.getBoundingClientRect();
      const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!h && (h === e || e.contains(h));
    }, sel);
    // A simulated keyboard: the visual viewport shrinks, the layout one doesn't.
    const keyboard = (p, px) => p.evaluate((kb) => {
      const vv = window.visualViewport;
      const h = document.documentElement.clientHeight - kb;
      Object.defineProperty(vv, 'height', { configurable: true, get: () => h });
      vv.dispatchEvent(new Event('resize'));
    }, px);

    // 1. The rail at the right edge, in both short-landscape sizes.
    for (const [w, h] of [[750, 342], [844, 390]]) {
      const { ctx, p, errs } = await open(w, h);
      const at = `${w}×${h}`;
      const r = await p.evaluate(() => {
        const nav = document.querySelector('.mco-navbar'), cb = document.querySelector('.mco-controlbar');
        const nr = nav.getBoundingClientRect(), cr = cb.getBoundingClientRect();
        const btns = [...nav.querySelectorAll('.mco-rail .nav-btn'), ...cb.querySelectorAll('.nav-btn')]
          .filter((b) => b.getClientRects().length).map((b) => { const q = b.getBoundingClientRect(); return [b.id || b.className, Math.round(q.width), Math.round(q.height), Math.round(q.top), Math.round(q.bottom)]; });
        const order = [document.querySelector('.logo-link'), document.getElementById('btn-rail-menu'), document.getElementById('btn-search-toggle'), document.getElementById('rail-step-prev')]
          .map((e) => Math.round(e.getBoundingClientRect().top));
        return { rail: MCO.viewport.isRail(), right: Math.round(innerWidth - nr.right), x: Math.round(nr.left), w: Math.round(nr.width),
          cbar: [Math.round(cr.left), Math.round(cr.top), Math.round(cr.width), Math.round(cr.bottom)], btns, order,
          vh: innerHeight, inset: getComputedStyle(document.body).getPropertyValue('--rail-inset').trim(),
          padR: getComputedStyle(document.body).paddingRight, tabbar: getComputedStyle(document.documentElement).getPropertyValue('--tabbar-h').trim() };
      });
      const allBig = r.btns.length >= 4 && r.btns.every((b) => b[1] >= 44 && b[2] >= 44 && b[3] >= 0 && b[4] <= r.vh);
      const ordered = r.order.every((y, i) => i === 0 || y > r.order[i - 1]);
      probe(`v1 ${at}: rail at the right edge (x ${r.x}, gap ${r.right}px), control bar at its foot, body padded ${r.padR}, --tabbar-h ${r.tabbar}`,
        r.rail && r.right === 0 && r.x > w / 2 && r.cbar[0] === r.x && r.cbar[3] === h && r.padR === r.w + 'px' && r.tabbar === '0px', JSON.stringify(r));
      probe(`v1 ${at}: rail order badge → ☰ → search → time controls; every rail button ≥ 44px and on screen`,
        allBig && ordered, JSON.stringify({ btns: r.btns, order: r.order }));
      await p.click('#btn-rail-menu');
      await p.waitForTimeout(300);
      const d = await p.evaluate(() => {
        const dr = document.getElementById('nav-drawer').getBoundingClientRect(), nr = document.querySelector('.mco-navbar').getBoundingClientRect();
        return { focus: document.activeElement.id, left: Math.round(dr.left), right: Math.round(dr.right), railLeft: Math.round(nr.left),
          top: Math.round(dr.top), bottom: Math.round(dr.bottom), mainInert: document.getElementById('main').inert,
          cbarInert: document.querySelector('.mco-controlbar').inert || !!document.querySelector('.mco-controlbar').closest('[inert]') };
      });
      probe(`v1 ${at}: ☰ opens the drawer beside the rail (drawer ${d.left}–${d.right}, rail at ${d.railLeft}), focus on the drawer, page inert, control bar live`,
        Math.abs(d.right - d.railLeft) <= 1 && d.top === 0 && d.bottom === h && d.focus === 'nav-drawer' && d.mainInert && !d.cbarInert, JSON.stringify(d));
      const ab = (await new AxeBuilder({ page: p }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      probe(`v1 ${at}: axe with the rail drawer open: no serious/critical`, ab.length === 0, ab.map((v) => v.id).join(', '));
      await p.keyboard.press('Escape');
      await p.waitForTimeout(200);
      await p.click('#btn-search-toggle');
      await p.waitForTimeout(300);
      const sf = await p.evaluate(() => document.activeElement.id);
      probe(`v1 ${at}: the rail's search button opens the drawer on the field`, sf === 'demo-search', sf);
      await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
      probe(`v1 ${at}: no page errors`, errs.length === 0, errs.join(' | '));
      await ctx.close();
    }

    // 2. The station panel at every width: full height under the bar on
    //    compact, end-docked above; close button 44px, top right, hittable.
    for (const [w, h, touch] of [[320, 568, true], [390, 844, true], [750, 342, true], [844, 390, true], [768, 1024, true], [1440, 900, false]]) {
      const { ctx, p } = await open(w, h, { touch });
      const at = `${w}×${h}`;
      await p.evaluate(() => { scrollTo(0, 0); document.getElementById('btn-sheet').click(); });
      await p.waitForTimeout(400);
      const s = await p.evaluate(() => {
        const sh = document.getElementById('demo-sheet'), nav = document.querySelector('.mco-navbar'), cb = document.querySelector('.mco-controlbar');
        const sr = sh.getBoundingClientRect(), nr = nav.getBoundingClientRect(), cr = cb.getBoundingClientRect();
        const x = sh.querySelector('[data-close-sheet]'), xr = x.getBoundingClientRect(), tr = sh.querySelector('.mco-sheet-title').getBoundingClientRect();
        const inert = (e) => !!e.closest('[inert]');
        return { compact: MCO.viewport.isCompact(), rail: MCO.viewport.isRail(), state: sh.dataset.state,
          rect: [sr.left, sr.top, sr.right, sr.bottom].map(Math.round), vw: document.documentElement.clientWidth, vh: innerHeight,
          navBottom: Math.round(nr.bottom), navLeft: Math.round(nr.left), cbarTop: cr.height ? Math.round(cr.top) : null,
          close: [Math.round(xr.width), Math.round(xr.height), Math.round(sr.right - xr.right), Math.round(xr.top - sr.top)],
          closeRightOfTitle: xr.left >= tr.right - 1,
          navInert: inert(nav), cbarInert: inert(cb), mainInert: inert(document.getElementById('main')),
          grip: !!sh.querySelector('.mco-sheet-grip'), sheetH: getComputedStyle(document.documentElement).getPropertyValue('--sheet-h').trim(),
          focus: document.activeElement.id };
      });
      const hit = await hits(p, '#demo-sheet [data-close-sheet]');
      const closeOk = s.close[0] >= 44 && s.close[1] >= 44 && s.close[2] <= 16 && s.close[3] <= 16 && s.closeRightOfTitle && hit;
      if (s.compact) {
        const top = s.rail ? 0 : s.navBottom, bottom = s.cbarTop != null && !s.rail ? s.cbarTop : s.vh, right = s.rail ? s.navLeft : s.vw;
        probe(`v1 ${at}: panel = viewport minus the bar(s): [${s.rect}] vs [0,${top},${right},${bottom}]; one state; bar and control bar live; rest inert; --sheet-h ${s.sheetH}`,
          s.state === 'full' && Math.abs(s.rect[0]) <= 1 && Math.abs(s.rect[1] - top) <= 1 && Math.abs(s.rect[2] - right) <= 1 && Math.abs(s.rect[3] - bottom) <= 1 &&
          !s.navInert && !s.cbarInert && s.mainInert && s.sheetH === '0px' && s.focus === 'demo-sheet-title', JSON.stringify(s));
      } else {
        probe(`v1 ${at}: panel end-docked under the bar, page live: [${s.rect}]`,
          s.state === 'full' && s.rect[2] === s.vw && Math.abs(s.rect[1] - s.navBottom) <= 1 && !s.mainInert, JSON.stringify(s));
      }
      probe(`v1 ${at}: panel close button ${s.close[0]}×${s.close[1]}, top right, hittable; no grip`, closeOk, JSON.stringify({ close: s.close, hit, right: s.closeRightOfTitle }));
      const sb = (await new AxeBuilder({ page: p }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      probe(`v1 ${at}: axe with the panel open: no serious/critical`, sb.length === 0, sb.map((v) => v.id).join(', '));
      if (s.compact) {
        // The bar stays live: ☰ opens over the panel and closes again.
        await p.click('#btn-rail-menu');
        await p.waitForTimeout(250);
        const o = await p.evaluate(() => document.getElementById('nav-drawer').classList.contains('is-open'));
        await p.keyboard.press('Escape');
        await p.waitForTimeout(200);
        probe(`v1 ${at}: ☰ in the live bar opens over the panel`, o, String(o));
      }
      await p.click('#demo-sheet [data-close-sheet]');
      await p.waitForTimeout(300);
      const c = await p.evaluate(() => ({ state: document.getElementById('demo-sheet').dataset.state, focus: document.activeElement.id,
        mainInert: !!document.getElementById('main').closest('[inert]') }));
      probe(`v1 ${at}: the close button closes, focus back, nothing left inert`, c.state === 'closed' && c.focus === 'btn-sheet' && !c.mainInert, JSON.stringify(c));
      await ctx.close();
    }
    // The deprecated shims still open the one state.
    {
      const { ctx, p } = await open(390, 844);
      const sh = await p.evaluate(() => {
        const out = [];
        const s = MCO.initSheet({ sheet: document.getElementById('demo-sheet'), onState: (st) => out.push(st) });
        s.open('peek'); const a = s.state(); s.setState('peek'); const b = s.state(); s.close(); s.setState('peek'); const c = s.state(); s.close();
        return { a, b, c, out };
      });
      probe(`v1 shims: open('peek') / setState('peek') open the one state; state() ${sh.a}; onState never 'peek'`,
        sh.a === 'full' && sh.b === 'full' && sh.c === 'full' && !sh.out.includes('peek'), JSON.stringify(sh));
      await ctx.close();
    }

    // 3. The bottom control bar: docked, publishes --tabbar-h, clears the
    //    safe area, hides under a keyboard; the drawer and toast clear it.
    for (const [w, h] of [[320, 568], [390, 844], [768, 1024]]) {
      const { ctx, p } = await open(w, h);
      const at = `${w}×${h}`;
      const b = await p.evaluate(() => {
        const cb = document.querySelector('.mco-controlbar'), r = cb.getBoundingClientRect(), cs = getComputedStyle(cb);
        return { rect: [r.left, r.top, r.width, r.bottom].map(Math.round), vh: innerHeight, vw: document.documentElement.clientWidth,
          tabbar: getComputedStyle(document.documentElement).getPropertyValue('--tabbar-h').trim(),
          padB: cs.paddingBottom, autolift: document.documentElement.classList.contains('mco-autolift'),
          btns: [...cb.querySelectorAll('.nav-btn')].map((x) => [Math.round(x.getBoundingClientRect().width), Math.round(x.getBoundingClientRect().height)]) };
      });
      probe(`v1 ${at}: bottom control bar docked [${b.rect}], --tabbar-h ${b.tabbar} = its height, buttons ≥ 44px, autolift on`,
        b.rect[3] === b.vh && b.rect[0] === 0 && b.tabbar === Math.round(b.rect[3] - b.rect[1]) + 'px' &&
          b.btns.every(([x, y]) => x >= 44 && y >= 44) && b.autolift, JSON.stringify(b));
      // The safe area: the bar's bottom padding is max(0.4rem, env(safe-area-inset-bottom)).
      const safe = await p.evaluate(() => {
        const cb = document.querySelector('.mco-controlbar');
        const probeEl = document.createElement('div');
        probeEl.style.cssText = 'position:fixed;padding-bottom:env(safe-area-inset-bottom, 0px)';
        document.body.appendChild(probeEl);
        const env = parseFloat(getComputedStyle(probeEl).paddingBottom); probeEl.remove();
        return { env, pad: parseFloat(getComputedStyle(cb).paddingBottom), rule: [...document.styleSheets].some((ss) => { try { return [...ss.cssRules].some((r) => /mco-controlbar/.test(r.cssText) && /safe-area-inset-bottom/.test(r.cssText)); } catch { return false; } }) };
      });
      probe(`v1 ${at}: control bar pads for the bottom safe area (env ${safe.env}px here, padding ${safe.pad}px)`, safe.rule && safe.pad >= safe.env, JSON.stringify(safe));
      await p.click('#btn-rail-menu');
      await p.waitForTimeout(250);
      const dd = await p.evaluate(() => ({ bottom: Math.round(document.getElementById('nav-drawer').getBoundingClientRect().bottom),
        cbTop: Math.round(document.querySelector('.mco-controlbar').getBoundingClientRect().top),
        cbInert: !!document.querySelector('.mco-controlbar').closest('[inert]') }));
      probe(`v1 ${at}: the ☰ drawer stops at the control bar (${dd.bottom} vs ${dd.cbTop}) and the bar stays live`, Math.abs(dd.bottom - dd.cbTop) <= 1 && !dd.cbInert, JSON.stringify(dd));
      await p.keyboard.press('Escape');
      await p.waitForTimeout(200);
      await p.evaluate(() => MCO.showToast('probe', 5000, { announce: false }));
      await p.waitForTimeout(300);
      const t = await p.evaluate(() => ({ toast: Math.round(document.querySelector('.mco-toast').getBoundingClientRect().bottom),
        cbTop: Math.round(document.querySelector('.mco-controlbar').getBoundingClientRect().top) }));
      probe(`v1 ${at}: the toast clears the control bar (bottom ${t.toast} ≤ ${t.cbTop})`, t.toast <= t.cbTop, JSON.stringify(t));
      // The keyboard: .kb-open, the bar hides, --tabbar-h drops to 0.
      await p.focus('#kb-field');
      await keyboard(p, 300);
      await p.waitForTimeout(250);
      const k = await p.evaluate(() => ({ open: document.documentElement.classList.contains('kb-open'), inset: getComputedStyle(document.documentElement).getPropertyValue('--kb-inset').trim(),
        vvh: getComputedStyle(document.documentElement).getPropertyValue('--vv-h').trim(),
        shown: document.querySelector('.mco-controlbar').getClientRects().length > 0, tabbar: getComputedStyle(document.documentElement).getPropertyValue('--tabbar-h').trim() }));
      probe(`v1 ${at}: keyboard up (vv −300px): .kb-open, --kb-inset ${k.inset}, --vv-h ${k.vvh}, control bar hidden, --tabbar-h ${k.tabbar}`,
        k.open && k.inset === '300px' && !k.shown && k.tabbar === '0px', JSON.stringify(k));
      await ctx.close();
    }

    // 4. K7: focus the drawer's search field at 390×664, the keyboard
    //    resizes the window to 390×374 (now "landscape"), then a real
    //    landscape size: the drawer stays open, the bar doesn't flip, the
    //    field stays above the keyboard line. Then the hold lifts.
    {
      const { ctx, p } = await open(390, 664);
      await p.click('#btn-search-toggle');
      await p.waitForTimeout(300);
      const before = await p.evaluate(() => ({ focus: document.activeElement.id, folded: document.querySelector('.mco-navbar').classList.contains('is-folded') }));
      await p.setViewportSize({ width: 390, height: 374 });
      await p.waitForTimeout(500);
      const k1 = await p.evaluate(() => {
        const i = document.getElementById('demo-search').getBoundingClientRect(), nav = document.querySelector('.mco-navbar').getBoundingClientRect();
        return { focus: document.activeElement.id, open: document.getElementById('nav-drawer').classList.contains('is-open'),
          folded: document.querySelector('.mco-navbar').classList.contains('is-folded'), rail: MCO.viewport.isRail(),
          hold: document.documentElement.classList.contains('mco-bar-hold'), navW: Math.round(nav.width), navH: Math.round(nav.height),
          field: [Math.round(i.top), Math.round(i.bottom)], vh: innerHeight };
      });
      probe(`v1 K7 390×664→390×374 with the search field focused: drawer open, bar still folded (${k1.navW}×${k1.navH}), not the rail, field at ${k1.field} within ${k1.vh}`,
        before.focus === 'demo-search' && k1.focus === 'demo-search' && k1.open && k1.folded && !k1.rail && k1.hold && k1.navH <= 64 && k1.field[1] <= k1.vh, JSON.stringify({ before, k1 }));
      await p.setViewportSize({ width: 844, height: 390 });
      await p.waitForTimeout(500);
      const k2 = await p.evaluate(() => {
        const i = document.getElementById('demo-search').getBoundingClientRect();
        return { focus: document.activeElement.id, open: document.getElementById('nav-drawer').classList.contains('is-open'),
          folded: document.querySelector('.mco-navbar').classList.contains('is-folded'), rail: MCO.viewport.isRail(), field: [Math.round(i.top), Math.round(i.bottom)], vh: innerHeight };
      });
      probe(`v1 K7 then 844×390, still typing: drawer open, bar held folded, field at ${k2.field} within ${k2.vh}`,
        k2.focus === 'demo-search' && k2.open && k2.folded && !k2.rail && k2.field[1] <= k2.vh, JSON.stringify(k2));
      // Typing ends: the hold lifts, the rail takes over, the fold re-measures.
      await p.keyboard.press('Escape');   // drawer closes, focus to the search button
      await p.waitForTimeout(400);
      const k3 = await p.evaluate(() => ({ rail: MCO.viewport.isRail(), hold: document.documentElement.classList.contains('mco-bar-hold'),
        folded: document.querySelector('.mco-navbar').classList.contains('is-folded'),
        x: Math.round(document.querySelector('.mco-navbar').getBoundingClientRect().left) }));
      probe(`v1 K7 typing over: the hold lifts, the rail takes the right edge (x ${k3.x}), not folded`, k3.rail && !k3.hold && !k3.folded && k3.x > 400, JSON.stringify(k3));
      await p.setViewportSize({ width: 390, height: 664 });
      await p.waitForTimeout(500);
      const k4 = await p.evaluate(() => ({ rail: MCO.viewport.isRail(), folded: document.querySelector('.mco-navbar').classList.contains('is-folded'),
        h: Math.round(document.querySelector('.mco-navbar').getBoundingClientRect().height) }));
      probe(`v1 K7 back to portrait: folded one row (${k4.h}px)`, !k4.rail && k4.folded && k4.h <= 64, JSON.stringify(k4));
      // The keyboard alone (no resize: iOS) holds too, and a search list keeps above it.
      await p.click('#btn-search-toggle');
      await p.waitForTimeout(250);
      await keyboard(p, 330);
      await p.keyboard.type('a');
      await p.waitForTimeout(300);
      const k5 = await p.evaluate(() => {
        const l = document.getElementById('demo-search-list').getBoundingClientRect(), vv = window.visualViewport;
        const d = document.getElementById('nav-drawer').getBoundingClientRect();
        return { listBottom: Math.round(l.bottom), line: Math.round(vv.offsetTop + vv.height), drawerBottom: Math.round(d.bottom), kb: document.documentElement.classList.contains('kb-open') };
      });
      probe(`v1 keyboard up: the search list ends above the keyboard line (${k5.listBottom} ≤ ${k5.line}), the drawer stops at it (${k5.drawerBottom})`,
        k5.kb && k5.listBottom <= k5.line && Math.abs(k5.drawerBottom - k5.line) <= 1, JSON.stringify(k5));
      await ctx.close();
    }
    // The fold is still deterministic after a hold: 1440 fresh vs 1440 after typing at 390.
    {
      const { ctx, p } = await open(1440, 900, { touch: false });
      const fresh = await p.evaluate(() => document.querySelector('.mco-navbar').classList.contains('is-folded'));
      await ctx.close();
      const t = await open(390, 664);
      await t.p.click('#btn-search-toggle');
      await t.p.waitForTimeout(200);
      await t.p.setViewportSize({ width: 390, height: 374 });
      await t.p.waitForTimeout(300);
      await t.p.keyboard.press('Escape');
      await t.p.setViewportSize({ width: 1440, height: 900 });
      await t.p.waitForTimeout(600);
      const after = await t.p.evaluate(() => ({ folded: document.querySelector('.mco-navbar').classList.contains('is-folded'),
        h: Math.round(document.querySelector('.mco-navbar').getBoundingClientRect().height) }));
      probe(`v1 fold after a hold matches a fresh load at 1440 (fresh ${fresh}, after ${after.folded}, ${after.h}px)`, after.folded === fresh && after.h <= 64, JSON.stringify({ fresh, after }));
      await t.ctx.close();
    }

    // 5. The legend: in the drawer on compact with a Legend button on the
    //    map, floating above compact.
    for (const [w, h, touch] of [[390, 844, true], [750, 342, true], [1440, 900, false]]) {
      const { ctx, p } = await open(w, h, { touch });
      const at = `${w}×${h}`;
      const l = await p.evaluate(() => {
        const panel = document.getElementById('legend-panel'), btn = document.querySelector('.mco-legend-btn');
        const wrap = document.getElementById('map-wrap').getBoundingClientRect(), br = btn.getBoundingClientRect();
        return { inDrawer: !!panel.closest('.mco-nav-drawer'), btnShown: !btn.hidden && br.width > 0, btnInMap: br.left >= wrap.left && br.right <= wrap.right && br.top >= wrap.top && br.bottom <= wrap.bottom,
          btnName: btn.textContent.trim(), btnSize: [Math.round(br.width), Math.round(br.height)], floating: getComputedStyle(panel).position };
      });
      if (w <= 640 || h <= 560) {
        await p.evaluate(() => document.getElementById('map-wrap').scrollIntoView({ block: 'center' }));
        await p.waitForTimeout(200);
        await p.click('.mco-legend-btn');
        await p.waitForTimeout(300);
        const o = await p.evaluate(() => {
          const panel = document.getElementById('legend-panel'), dr = document.getElementById('nav-drawer').getBoundingClientRect(), pr = panel.getBoundingClientRect();
          return { open: document.getElementById('nav-drawer').classList.contains('is-open'), focusIn: panel.contains(document.activeElement),
            expanded: document.getElementById('legend-toggle').getAttribute('aria-expanded'), visible: pr.top >= dr.top - 1 && pr.top < dr.bottom };
        });
        probe(`v1 ${at}: legend in the ☰ drawer; a "${l.btnName}" button (${l.btnSize}) on the map opens the drawer at it, expanded, focus in it`,
          l.inDrawer && l.btnShown && l.btnInMap && l.btnName === 'Legend' && l.btnSize[1] >= 40 && o.open && o.focusIn && o.expanded === 'true' && o.visible, JSON.stringify({ l, o }));
        const lb = (await new AxeBuilder({ page: p }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        probe(`v1 ${at}: axe with the legend open in the drawer: no serious/critical`, lb.length === 0, lb.map((v) => v.id).join(', '));
        await p.keyboard.press('Escape');
        await p.waitForTimeout(200);
        const back = await p.evaluate(() => document.activeElement.classList.contains('mco-legend-btn'));
        probe(`v1 ${at}: closing returns focus to the Legend button`, back, String(back));
      } else {
        probe(`v1 ${at}: legend floats on the map, no Legend button`, !l.inDrawer && !l.btnShown && l.floating === 'absolute', JSON.stringify(l));
      }
      await ctx.close();
    }

    // 6. ← / → step the date, with every exemption.
    {
      const { ctx, p } = await open(1440, 900, { touch: false });
      const day = () => p.textContent('#date-readout');
      const press = async (key, mods) => { if (mods) await p.keyboard.press(`${mods}+${key}`); else await p.keyboard.press(key); await p.waitForTimeout(60); return day(); };
      const kbd = await p.evaluate(() => [document.getElementById('step-prev').getAttribute('aria-keyshortcuts'), document.getElementById('step-next').getAttribute('aria-keyshortcuts')]);
      probe(`v1 arrows: prev/next carry aria-keyshortcuts (${kbd})`, kbd[0] === 'ArrowLeft' && kbd[1] === 'ArrowRight', JSON.stringify(kbd));
      await p.evaluate(() => { document.activeElement.blur(); });
      const d0 = await day();
      const d1 = await press('ArrowLeft');
      const d2 = await press('ArrowRight');
      probe(`v1 arrows: ← steps back (${d0} → ${d1}), → forward (${d2})`, d1 !== d0 && d2 === d0, JSON.stringify([d0, d1, d2]));
      const atToday = await press('ArrowRight');
      probe('v1 arrows: → at today does nothing (canStep)', atToday === d0, atToday);
      await press('ArrowLeft');
      const base = await day();
      const cases = [];
      // Modifiers as dispatched events: a real Meta+← is the browser's Back in WebKit.
      for (const m of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey']) {
        await p.evaluate((k) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true, [k]: true })), m);
        await p.waitForTimeout(60);
        cases.push([`${m.replace('Key', '')}+←`, await day()]);
      }
      await p.focus('#kb-field'); cases.push(['text field', await press('ArrowLeft')]);
      await p.focus('#units-select').catch(() => {});
      await p.evaluate(() => { const r = document.querySelector('#units-seg input:checked'); if (r && r.getClientRects().length) r.focus(); });
      const radioBefore = await p.evaluate(() => (document.querySelector('#units-seg input:checked') || {}).value);
      cases.push(['radio (keyboard)', await press('ArrowRight')]);
      const radioAfter = await p.evaluate(() => (document.querySelector('#units-seg input:checked') || {}).value);
      await p.evaluate(() => {
        const s = document.createElement('div'); s.id = 'probe-slider'; s.setAttribute('role', 'slider'); s.tabIndex = 0;
        s.setAttribute('aria-label', 'Probe slider'); s.setAttribute('aria-valuenow', '1'); document.getElementById('main').appendChild(s);
        const r = document.createElement('input'); r.type = 'range'; r.id = 'probe-range'; r.setAttribute('aria-label', 'Probe range'); document.getElementById('main').appendChild(r);
      });
      await p.focus('#probe-slider'); cases.push(['role=slider', await press('ArrowLeft')]);
      await p.focus('#probe-range'); cases.push(['input range', await press('ArrowLeft')]);
      await p.click('#btn-modal'); await p.waitForTimeout(200);
      cases.push(['open dialog', await press('ArrowLeft')]);
      await p.keyboard.press('Escape'); await p.waitForTimeout(200);
      await p.click('#btn-drawer'); await p.waitForTimeout(350);
      cases.push(['blocking drawer', await press('ArrowLeft')]);
      await p.keyboard.press('Escape'); await p.waitForTimeout(350);
      const unchanged = cases.filter(([, d]) => d !== base);
      probe(`v1 arrows keep their meaning: ${cases.map(([k]) => k).join(', ')}`, unchanged.length === 0 && radioAfter !== radioBefore,
        JSON.stringify({ base, unchanged, radioBefore, radioAfter }));
      // The map: Tab-reached focus pans, pointer focus steps until ↑/↓.
      await p.waitForFunction(() => !!document.querySelector('#map .maplibregl-canvas'), null, { timeout: 20000 }).catch(() => {});
      await p.evaluate(() => document.getElementById('map-wrap').scrollIntoView({ block: 'center' }));
      await p.evaluate(() => { document.getElementById('legend-toggle').focus(); });
      await p.keyboard.press('Shift+Tab');   // back onto the map canvas, by keyboard
      const onMap = await p.evaluate(() => !!document.activeElement.closest('.maplibregl-map'));
      const m0 = await day();
      const m1 = await press('ArrowLeft');
      probe(`v1 arrows: on a map reached by Tab, ← pans (date ${m0} → ${m1})`, onMap && m1 === m0, JSON.stringify({ onMap, m0, m1 }));
      const box = await p.locator('#map .maplibregl-canvas').boundingBox();
      if (box) await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await p.waitForTimeout(100);
      const m2 = await day();
      const m3 = await press('ArrowLeft');
      await press('ArrowUp');
      const m4 = await press('ArrowLeft');
      probe(`v1 arrows: on a map focused by a click, ← steps (${m2} → ${m3}); after ↑ it pans again (${m4})`,
        !!box && m3 !== m2 && m4 === m3, JSON.stringify({ box: !!box, m2, m3, m4 }));
      // A radio a pointer focused steps the date.
      const rv = p.locator('#units-seg label.seg-btn').first();
      let rp = null;
      if (await rv.isVisible()) {
        await rv.click();
        const r0 = await day(); const r1 = await press('ArrowLeft');
        rp = [r0, r1];
      }
      probe('v1 arrows: a radio focused by a click steps the date', !rp || rp[0] !== rp[1], JSON.stringify(rp));
      // The finer visible stepper wins: an hour stepper made beside the day ones.
      const fine = await p.evaluate(() => {
        let hours = 0;
        const box = document.createElement('div');
        box.innerHTML = '<button type="button" class="nav-btn mco-step" id="probe-hp" aria-label="Previous hour">‹</button><button type="button" class="nav-btn mco-step" id="probe-hn" aria-label="Next hour">›</button>';
        document.getElementById('main').prepend(box);
        const st = MCO.initStepper({ prev: box.children[0], next: box.children[1], onStep: (d) => { hours += d; }, arrowKeys: true, unit: 'hour' });
        document.activeElement.blur();
        window.__probeHours = () => hours;
        window.__probeHourStep = st;
        return true;
      });
      const f0 = await day();
      await press('ArrowLeft');
      const f1 = await day();
      const hrs = await p.evaluate(() => window.__probeHours());
      await p.evaluate(() => { window.__probeHourStep.destroy(); });
      await press('ArrowLeft');
      const f2 = await day();
      probe(`v1 arrows: the finer visible stepper (hour) takes ← (${hrs} h, day ${f0} → ${f1}); destroyed, the day takes it (${f2})`,
        fine && hrs === -1 && f1 === f0 && f2 !== f1, JSON.stringify({ hrs, f0, f1, f2 }));
      await ctx.close();
      // ?kbd=off: no stepping, no aria-keyshortcuts.
      const off = await open(1440, 900, { touch: false, qs: '&kbd=off' });
      const o0 = await off.p.textContent('#date-readout');
      await off.p.keyboard.press('ArrowLeft');
      const o1 = await off.p.textContent('#date-readout');
      const ok = await off.p.evaluate(() => document.getElementById('step-prev').hasAttribute('aria-keyshortcuts'));
      probe('v1 arrows: ?kbd=off turns them off (no step, no aria-keyshortcuts)', o0 === o1 && !ok, JSON.stringify({ o0, o1, ok }));
      await off.ctx.close();
    }

    // ── Round 2 (1.0.0 RC review): the defects the consumer PRs found. ──
    // R1. Above compact a docked control bar sits under the end-docked panel.
    {
      const { ctx, p } = await open(768, 1024);
      await p.evaluate(() => { scrollTo(0, 0); document.getElementById('btn-sheet').click(); });
      await p.waitForTimeout(400);
      const r = await p.evaluate(() => { const s = document.getElementById('demo-sheet').getBoundingClientRect(), c = document.querySelector('.mco-controlbar').getBoundingClientRect();
        return { compact: MCO.viewport.isCompact(), sheetBottom: Math.round(s.bottom), cbarTop: Math.round(c.top), cbarH: Math.round(c.height),
          live: !document.querySelector('.mco-controlbar').closest('[inert]') }; });
      probe(`r2 768×1024: the end-docked panel ends at the control bar (${r.sheetBottom} vs ${r.cbarTop}), the bar live`,
        !r.compact && r.cbarH > 0 && Math.abs(r.sheetBottom - r.cbarTop) <= 1 && r.live, JSON.stringify(r));
      await ctx.close();
    }
    // R2. The Legend button never overlaps the map's bottom-corner controls.
    for (const [w, h] of [[320, 568], [390, 844], [844, 390]]) {
      const { ctx, p } = await open(w, h, { wait: 2500 });
      await p.evaluate(() => document.getElementById('map-wrap').scrollIntoView({ block: 'center' }));
      await p.waitForFunction(() => !!document.querySelector('#map .maplibregl-ctrl-attrib'), null, { timeout: 20000 }).catch(() => {});
      await p.waitForTimeout(600);
      const r = await p.evaluate(() => {
        const b = document.querySelector('.mco-legend-btn').getBoundingClientRect();
        const hits = [...document.querySelectorAll('#map .maplibregl-ctrl-bottom-left > *, #map .maplibregl-ctrl-bottom-right > *')].map((c) => c.getBoundingClientRect())
          .filter((c) => c.height && c.left < b.right && c.right > b.left && c.top < b.bottom && c.bottom > b.top).length;
        return { btn: [b.left, b.top, b.right, b.bottom].map(Math.round), hits, ctrls: document.querySelectorAll('#map .maplibregl-ctrl-bottom-right > *').length };
      });
      probe(`r2 ${w}×${h}: the Legend button clears the map's bottom-corner controls (${r.hits} overlaps)`, r.ctrls > 0 && r.hits === 0, JSON.stringify(r));
      await ctx.close();
    }
    // R3. A search list never runs under the keyboard; one 44px option shows.
    for (const [w, h, kb] of [[750, 342, 180], [844, 390, 180], [320, 568, 260]]) {
      const { ctx, p } = await open(w, h);
      // The counties arrive with the map overlays: type once they are there.
      await p.waitForFunction(() => /loaded from/.test(document.getElementById('map-note')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
      await p.click('#btn-search-toggle'); await p.waitForTimeout(200);
      await keyboard(p, kb);
      await p.keyboard.type('a'); await p.waitForTimeout(300);
      const r = await p.evaluate(() => { const l = document.getElementById('demo-search-list').getBoundingClientRect(); const o = document.querySelector('#demo-search-list .mco-search-option');
        return { top: Math.round(l.top), bottom: Math.round(l.bottom), line: Math.round(visualViewport.offsetTop + visualViewport.height), h: Math.round(l.height), opt: o ? Math.round(o.getBoundingClientRect().height) : 0 }; });
      probe(`r2 ${w}×${h}, ${kb}px keyboard: the search list ends above the keyboard line (${r.bottom} ≤ ${r.line}) and shows an option (${r.h}px)`,
        r.bottom <= r.line && r.top >= 0 && r.h >= 44, JSON.stringify(r));
      await ctx.close();
    }
    // R4. The rail never lets its control bar cover the top group, with 2, 3
    //     and 4 control-bar buttons; what doesn't fit scrolls in the bar.
    for (const [w, h] of [[568, 320], [667, 375], [750, 342], [844, 390]]) {
      for (const n of [2, 3, 4]) {
        const { ctx, p } = await open(w, h);
        await p.evaluate((n) => {
          const cb = document.querySelector('.mco-controlbar');
          for (let i = 2; i < n; i++) {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'nav-btn mco-step'; b.setAttribute('aria-label', 'Probe ' + i); b.textContent = '·';
            cb.appendChild(b);
          }
          window.dispatchEvent(new Event('resize'));
        }, n);
        await p.waitForTimeout(400);
        const r = await p.evaluate(() => {
          const nav = document.querySelector('.mco-navbar'), cb = document.querySelector('.mco-controlbar'), cr = cb.getBoundingClientRect();
          const top = [nav.querySelector('.logo-link'), document.getElementById('btn-rail-menu'), document.getElementById('btn-search-toggle')].map((e) => {
            const q = e.getBoundingClientRect(), hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
            return { b: Math.round(q.bottom), w: Math.round(q.width), h: Math.round(q.height), hit: !!hit && (hit === e || e.contains(hit)) }; });
          const btns = [...cb.querySelectorAll('.nav-btn')].map((b) => b.getBoundingClientRect());
          const allShown = btns.every((q) => q.top >= cr.top - 1 && q.bottom <= cr.bottom + 1);
          return { top, cbarTop: Math.round(cr.top), cbarBottom: Math.round(cr.bottom), vh: innerHeight, scrolls: cb.scrollHeight > cb.clientHeight + 1,
            cls: cb.className, allShown, btnH: btns.map((q) => Math.round(q.height)) };
        });
        const topOk = r.top.every((t) => t.hit && t.b <= r.cbarTop && t.w >= 44 && t.h >= 44);
        const reach = r.allShown || (r.scrolls && /is-scroll/.test(r.cls));
        probe(`r2 ${w}×${h}, ${n}-button control bar: rail top group whole and hittable (bottom ${Math.max(...r.top.map((t) => t.b))} ≤ bar ${r.cbarTop}), every control ${r.allShown ? 'shown' : 'reachable by scrolling'} (${r.cls.replace('mco-controlbar', '').trim() || 'fits'})`,
          topOk && reach && r.cbarBottom === r.vh && r.btnH.every((x) => x >= 44), JSON.stringify(r));
        await ctx.close();
      }
    }
    // R5 is in the rail probe above (every rail item, the badge included, 44px);
    // checked here on the badge alone, at both landscape sizes.
    for (const [w, h] of [[750, 342], [844, 390]]) {
      const { ctx, p } = await open(w, h);
      const r = await p.evaluate(() => [...document.querySelectorAll('.mco-navbar > .logo-link, .mco-navbar .mco-rail > *')].filter((e) => e.getClientRects().length)
        .map((e) => [Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)]));
      probe(`r2 ${w}×${h}: rail badge, ☰ and search all 44×44 (${r.map((x) => x.join('×')).join(' ')})`, r.length >= 3 && r.every(([a, b]) => a === 44 && b === 44), JSON.stringify(r));
      await ctx.close();
    }
    // R6. A dialog opened from inside the open ☰ drawer is usable, and focus
    //     comes back into the drawer when it closes.
    for (const [w, h] of [[390, 844], [750, 342]]) {
      const { ctx, p } = await open(w, h);
      await p.evaluate(() => { const bt = document.createElement('button'); bt.type = 'button'; bt.id = 'probe-dlg'; bt.className = 'nav-btn'; bt.textContent = 'About (probe)';
        document.getElementById('nav-drawer').appendChild(bt); bt.addEventListener('click', () => document.getElementById('info-modal').showModal()); });
      await p.click('#btn-rail-menu'); await p.waitForTimeout(300);
      await p.click('#probe-dlg'); await p.waitForTimeout(300);
      const a = await p.evaluate(() => { const d = document.getElementById('info-modal'); return { open: d.open, inert: !!d.closest('[inert]'), focusIn: d.contains(document.activeElement) }; });
      const x = await p.locator('#info-modal [data-close-modal]').boundingBox();
      if (x) await p.mouse.click(x.x + x.width / 2, x.y + x.height / 2);
      await p.waitForTimeout(300);
      const b = await p.evaluate(() => ({ open: document.getElementById('info-modal').open, drawerOpen: document.getElementById('nav-drawer').classList.contains('is-open'),
        focusInDrawer: document.getElementById('nav-drawer').contains(document.activeElement), mainInert: document.getElementById('main').inert }));
      probe(`r2 ${w}×${h}: a dialog opened from the ☰ drawer is live (not inert, focus in it), its close button closes it, focus back in the drawer, the page still inert behind the drawer`,
        a.open && !a.inert && a.focusIn && !b.open && b.drawerOpen && b.focusInDrawer && b.mainInert, JSON.stringify({ a, b }));
      await ctx.close();
    }
    // R6b. A NON-modal dialog (show()) opened from the drawer leaves the
    //      page inert behind the drawer: only a modal dialog lifts the roots.
    for (const [w, h] of [[390, 844], [750, 342]]) {
      const { ctx, p } = await open(w, h);
      await p.evaluate(() => {
        const d = document.createElement('dialog'); d.id = 'probe-nm'; d.setAttribute('aria-label', 'Probe non-modal');
        d.innerHTML = '<button type="button" id="probe-nm-x">Close</button>'; document.body.appendChild(d);
        const bt = document.createElement('button'); bt.type = 'button'; bt.id = 'probe-nm-open'; bt.className = 'nav-btn'; bt.textContent = 'Note (probe)';
        document.getElementById('nav-drawer').appendChild(bt); bt.addEventListener('click', () => d.show());
      });
      await p.click('#btn-rail-menu'); await p.waitForTimeout(300);
      await p.click('#probe-nm-open'); await p.waitForTimeout(300);
      const r = await p.evaluate(() => { const d = document.getElementById('probe-nm');
        return { open: d.open, modal: d.matches(':modal'), dialogInert: !!d.closest('[inert]'), mainInert: document.getElementById('main').inert,
          drawerOpen: document.getElementById('nav-drawer').classList.contains('is-open') }; });
      probe(`r3 ${w}×${h}: a non-modal dialog opened from the ☰ drawer leaves the page inert behind the drawer (main inert ${r.mainInert}, dialog not lifted)`,
        r.open && !r.modal && r.mainInert && r.dialogInert && r.drawerOpen, JSON.stringify(r));
      await ctx.close();
    }
    // R4 (Kyle, 2026-11-13): zoom sits in the map's TOP-LEFT corner at every
    //    width, padded for the left safe area, hittable, overlapping nothing;
    //    the phone's Legend button (bottom-left) never meets it.
    for (const [w, h, touch] of [[320, 568, true], [390, 844, true], [568, 320, true], [844, 390, true], [768, 1024, true], [1440, 900, false]]) {
      const { ctx, p } = await open(w, h, { touch, wait: 1500 });
      // The map's top (where zoom is) just under the bar: the demo map is
      // taller than a landscape phone, so centring it hides its top.
      await p.evaluate(() => {
        const bar = document.querySelector('.mco-navbar').getBoundingClientRect();
        const under = bar.height > innerHeight / 2 ? 0 : bar.bottom;
        scrollTo(0, scrollY + document.getElementById('map-wrap').getBoundingClientRect().top - under - 8);
      });
      await p.waitForFunction(() => !!document.querySelector('#map .maplibregl-ctrl-group'), null, { timeout: 20000 }).catch(() => {});
      await p.waitForTimeout(500);
      const r = await p.evaluate(() => {
        const g = document.querySelector('#map .maplibregl-ctrl-group'); if (!g) return null;
        const gr = g.getBoundingClientRect(), mr = document.getElementById('map').getBoundingClientRect();
        const corner = g.closest('.maplibregl-ctrl-top-left') ? 'top-left' : 'other';
        const pad = getComputedStyle(g.closest('.maplibregl-ctrl-top-left') || g).paddingLeft;
        const others = [...document.querySelectorAll('#map-wrap .mco-panel, #map-wrap .mco-legend-btn, #map .maplibregl-ctrl-bottom-left > *, #map .maplibregl-ctrl-bottom-right > *, #map .maplibregl-ctrl-top-right > *')]
          .filter((x) => x.getClientRects().length && !x.hidden).map((x) => [x.className.split(' ')[0] || x.id, x.getBoundingClientRect()])
          .filter(([, q]) => q.left < gr.right && q.right > gr.left && q.top < gr.bottom && q.bottom > gr.top).map(([n]) => n);
        const hit = [...g.querySelectorAll('button')].every((b) => { const q = b.getBoundingClientRect(), e = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !!e && (e === b || b.contains(e)); });
        const lb = document.querySelector('.mco-legend-btn:not([hidden])');
        return { corner, pad, dx: Math.round(gr.left - mr.left), dy: Math.round(gr.top - mr.top), others, hit, legendBtn: !!lb };
      });
      probe(`r4 ${w}×${h}: zoom group in the map's top-left corner (${r && r.dx},${r && r.dy} in), padded for the left safe area, hittable, overlapping nothing${r && r.legendBtn ? ' (Legend button shown)' : ''}`,
        !!r && r.corner === 'top-left' && r.dx <= 16 && r.dy <= 16 && r.others.length === 0 && r.hit, JSON.stringify(r));
      // A long over-the-map notice keeps clear of the zoom group.
      const n = await p.evaluate(() => {
        const nt = MCO.notice({ tone: 'warning', place: 'over', container: document.getElementById('map-wrap'),
          text: 'Station data is delayed; the map shows the last values received, which may be several hours old.' });
        const q = document.querySelector('#map-wrap .mco-notice').getBoundingClientRect(), g = document.querySelector('#map .maplibregl-ctrl-group').getBoundingClientRect();
        const ov = q.left < g.right && q.right > g.left && q.top < g.bottom && q.bottom > g.top;
        nt.close();
        return { notice: [q.left, q.right].map(Math.round), zoomRight: Math.round(g.right), ov };
      });
      probe(`r4 ${w}×${h}: an over-the-map notice clears the zoom group (notice ${n.notice}, zoom right edge ${n.zoomRight})`, !n.ov, JSON.stringify(n));
      await ctx.close();
    }
    await vb.close();
  }

/* Every engine in BROWSERS (default: chromium,webkit). WebKit is Safari's
   engine — the family's iPhone and iPad users — and differs in exactly the
   places this kit leans on: import maps, inert, :has(), Pointer Events. */
const ENGINES = { chromium, webkit };
let failed = false;
const BROWSERS = (process.env.BROWSERS || 'chromium,webkit').split(',').map((b) => b.trim()).filter(Boolean);
for (const engine of BROWSERS) {
  if (!ENGINES[engine]) throw new Error(`unknown browser ${engine}`);
  // Chromium: software WebGL so MapLibre draws headless. WebKit needs no flags.
  const browser = await ENGINES[engine].launch(engine === 'chromium'
    ? { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] } : {});
  if (process.env.PROBE_ONLY === 'v1') {
    await v1Probes(engine, (label, ok, detail) => {
      if (!ok) failed = true;
      console[ok ? 'log' : 'error'](`[${engine} 1.0.0] ${ok ? 'OK' : 'FAIL'} — ${label}${ok ? '' : ' ' + detail}`);
    });
    await browser.close();
    continue;
  }
  const themes = ['dark', 'light', 'high-contrast'];
  const pages = ['/demo/', '/demo/colocation.html', '/exemplar/'];
  // Wide: everything shown. Narrow: past every shed in the ladder (labels, brand,
  // search) — where a display:none'd label silently costs an input its name.
  const viewports = [
    { name: 'wide', width: 1440, height: 900 },
    { name: 'narrow', width: 390, height: 800, touch: true },
    // Short landscape phone (0.10.0): the demo's navbar is a rail here.
    { name: 'landscape', width: 750, height: 342, touch: true },
  ];

  for (const path of pages) {
    for (const theme of themes) {
      for (const vp of viewports) {
        // @axe-core/playwright requires pages created from an explicit context.
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height },
          // WebKit: hasTouch alone already matches (hover: none). isMobile there
        // turns on its iOS emulation, where getComputedStyle(<body>) reports
        // unstyled defaults on a long page (painting is correct) and axe then
        // reads a white background behind every element: false contrast
        // failures. Chromium needs isMobile for (hover: none).
        hasTouch: !!vp.touch, isMobile: !!vp.touch && engine === 'chromium' });
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${port}${path}?theme=${theme}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500); // let fonts/controls settle; map isn't awaited
        const results = await new AxeBuilder({ page }).analyze();
        const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        const label = `${engine} ${path} ${theme} ${vp.name}(${vp.width}px)`;
        // Touch targets (§5.5, 0.9.0): 40px, 44px for close buttons, on the
        // touch pass. The verify harness found kit controls under it in 0.8.0.
        const small = vp.touch ? await smallTargets(page) : [];
        if (small.length) {
          failed = true;
          console.error(`\n[${label}] ${small.length} touch target(s) under 40px:\n    → ` + small.slice(0, 8).join('\n    → '));
        }
        if (bad.length) {
          failed = true;
          console.error(`\n[${label}] ${bad.length} serious/critical violation(s):`);
          for (const v of bad) {
            console.error(`  ${v.id} (${v.impact}): ${v.help}`);
            for (const n of v.nodes.slice(0, 5)) console.error(`    → ${n.target.join(' ')}`);
          }
        } else {
          console.log(`[${label}] OK — 0 serious/critical (${results.violations.length} minor advisories)`);
        }
        await context.close();
      }
    }
  }

  /* ── Keyboard probes (0.8.0) ──────────────────────────────────────────────
     Behavior axe can't see. The search combobox, after the dashboard's
     keyboard check: the kit's version replaced five hand-rolled ones, so
     drift here would ship to all of them. axe also runs with the list OPEN,
     where listbox/option roles actually exist. */
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/demo/?theme=dark`, { waitUntil: 'domcontentloaded' });
    const probe = (label, ok, detail) => {
      if (!ok) failed = true;
      console[ok ? 'log' : 'error'](`[${engine} keyboard] ${ok ? 'OK' : 'FAIL'} — ${label}${ok ? '' : ' ' + detail}`);
    };
    const cb = () => page.evaluate(() => {
      const i = document.getElementById('demo-search');
      const ad = i.getAttribute('aria-activedescendant');
      const a = ad && document.getElementById(ad);
      return {
        expanded: i.getAttribute('aria-expanded'), value: i.value,
        active: a ? a.textContent : null, selected: a ? a.getAttribute('aria-selected') : null,
        options: document.querySelectorAll('#demo-search-list [role="option"]').length,
        disabled: [...document.querySelectorAll('#demo-search-list [role="option"][aria-disabled="true"]')].map((o) => o.textContent),
      };
    });
    // Counties arrive with the map overlays; wait for them, but don't fail the
    // probe on a slow map — an empty list still exercises the empty state.
    await page.waitForFunction(() => /loaded from/.test(document.getElementById('map-note')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
    await page.focus('#demo-search');
    await page.keyboard.type('gal');
    const s1 = await cb();
    probe('typing opens the list and makes the best match active (aria-activedescendant + aria-selected)',
      s1.expanded === 'true' && /^Gallatin/.test(s1.active || '') && s1.selected === 'true', JSON.stringify(s1));
    // 0.16.1: the default row's name reads label, then meta, with a
    // separator ("Gallatin, 30031", not "Gallatin30031"), and the separator
    // is visually hidden. rowName is the option's name from Playwright's
    // ARIA tree.
    const rowName = (await page.locator('#demo-search-list [role="option"][aria-selected="true"]').ariaSnapshot().catch(() => '')).trim();
    const sepHidden = await page.evaluate(() => {
      const s = document.querySelector('#demo-search-list .mco-search-option .sr-only');
      return !!s && s.getBoundingClientRect().width <= 1 && getComputedStyle(s).position === 'absolute';
    });
    probe('default search row: the name separates label and meta ("Gallatin, 30031"); the separator is sr-only',
      /^Gallatin, 30031$/.test(s1.active || '') && /option "Gallatin\s*,\s*30031"/.test(rowName) && sepHidden,
      JSON.stringify({ textContent: s1.active, rowName, sepHidden }));
    const results = await new AxeBuilder({ page }).include('#search-wrap').analyze();
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    probe('axe: open listbox has no serious/critical violations', bad.length === 0, bad.map((v) => v.id).join(', '));
    await page.keyboard.press('Escape');
    const s2 = await cb();
    probe('Esc closes the list and restores the text from before it opened', s2.expanded === 'false' && s2.value === '', JSON.stringify(s2));
    await page.keyboard.type('qqqzz');
    const s3 = await cb();
    probe('no match → one disabled role=option ("No matches"), nothing active',
      s3.disabled.length === 1 && /No matches/.test(s3.disabled[0]) && s3.active === null, JSON.stringify(s3));
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    const s4 = await cb();
    await page.keyboard.press('ArrowDown');
    const s5 = await cb();
    probe('Down opens on the first option; Up wraps to the last; Down wraps back',
      s4.expanded === 'true' && s4.options > 1 && s5.active !== s4.active, JSON.stringify([s4.active, s5.active]));
    await page.keyboard.press('Enter');
    const s6 = await cb();
    const announced = await page.evaluate(() => document.querySelector('.sr-only[aria-live="polite"]').textContent);
    await page.waitForTimeout(150);
    const announcedLater = await page.evaluate(() => document.querySelector('.sr-only[aria-live="polite"]').textContent);
    probe('Enter selects: list closes, onSelect ran', s6.expanded === 'false' && /selected/.test(announced + announcedLater), JSON.stringify(s6));

    /* 0.16.0: MCO.places.initPlaceSearch. Stations first, places under
       them while typing, each section headed; a picked place lists its
       stations and says how many. */
    await page.keyboard.press('Escape');
    const pl = () => page.evaluate(() => {
      const i = document.getElementById('place-search');
      const ad = i.getAttribute('aria-activedescendant');
      const a = ad && document.getElementById(ad);
      return {
        expanded: i.getAttribute('aria-expanded'), active: a ? a.textContent : null,
        heads: [...document.querySelectorAll('#place-search-list .mco-search-group')].map((g) => g.textContent),
        title: document.getElementById('place-results-title').textContent,
        rows: document.querySelectorAll('#place-list li').length,
        live: document.querySelector('.sr-only[aria-live="polite"]').textContent,
      };
    });
    await page.focus('#place-search');
    await page.keyboard.type('bozeman');
    await page.waitForFunction(() => [...document.querySelectorAll('#place-search-list .mco-search-group')].length === 2, null, { timeout: 10000 }).catch(() => {});
    const p1 = await pl();
    probe('places: "bozeman" heads Stations then Places, the station active',
      p1.expanded === 'true' && p1.heads.join('|') === 'Stations|Places' && /^Bozeman(?!.*City)/.test(p1.active || ''), JSON.stringify(p1));
    const pbad = (await new AxeBuilder({ page }).include('.demo-place-search').analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    probe('axe: open place list (two headed groups) has no serious/critical violations', pbad.length === 0, pbad.map((v) => v.id).join(', '));
    await page.keyboard.press('Escape');
    await page.keyboard.type('59715');
    await page.keyboard.press('Enter');
    // MCO.announce writes on the next tick; under load that can take longer than a fixed pause.
    await page.waitForFunction(() => /stations near/.test(document.querySelector('.sr-only[aria-live="polite"]').textContent), null, { timeout: 5000 }).catch(() => {});
    const p2 = await pl();
    probe('places: a ZIP code lists the 5 nearest stations and says so',
      p2.expanded === 'false' && p2.title === 'Near 59715' && p2.rows === 5 && /5 stations near 59715/.test(p2.live), JSON.stringify(p2));
    await page.keyboard.type('salish');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('#place-list li').length > 0, null, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(150);   // MCO.announce writes on the next tick
    const p3 = await pl();
    probe('places: a reservation lists the stations inside its boundary (loaded on the pick)',
      p3.title === 'Flathead Reservation' && p3.rows >= 1 && /on the Flathead Reservation/.test(p3.live), JSON.stringify(p3));

    /* 0.21.2: arrowing through a long list scrolls the listbox only. It used
       scrollIntoView, which also scrolled the page and every scrolling
       ancestor, dragging the field away (on a phone, under the keyboard).
       The page case puts the field low in the viewport so the list runs off
       it; the ancestor case is a 200px scroller injected around a box. */
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    const listScroll = async (inputSel, listSel, scrollerSel) => {
      const snap = () => page.evaluate(([i, l, s]) => {
        const inp = document.querySelector(i), list = document.querySelector(l);
        const a = document.getElementById(inp.getAttribute('aria-activedescendant') || '');
        const ir = inp.getBoundingClientRect(), lr = list.getBoundingClientRect(), ar = a && a.getBoundingClientRect();
        return { y: Math.round(scrollY), top: Math.round(ir.top), left: Math.round(ir.left),
          sc: s ? Math.round(document.querySelector(s).scrollTop) : null, listTop: Math.round(list.scrollTop),
          options: list.querySelectorAll('[role="option"]').length, shown: !!ar && ar.top >= lr.top - 1 && ar.bottom <= lr.bottom + 1 };
      }, [inputSel, listSel, scrollerSel]);
      const before = await snap();
      for (let k = 0; k < 10; k++) await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);
      const after = await snap();
      return { ok: after.options > 10 && after.y === before.y && after.top === before.top && after.left === before.left &&
        after.sc === before.sc && after.listTop > 0 && after.shown, before, after };
    };
    await page.evaluate(() => { document.getElementById('place-search').scrollIntoView({ block: 'end' }); scrollBy(0, 60); });
    await page.focus('#place-search');
    await page.keyboard.type('a');
    await page.waitForTimeout(300);
    const ls1 = await listScroll('#place-search', '#place-search-list', null);
    probe('search list: ArrowDown ×10 scrolls the list only (page scrollY and the field stay put)', ls1.ok, JSON.stringify(ls1));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const box = document.createElement('div');
      box.id = 'probe-scroller';
      box.style.cssText = 'position:fixed;left:8px;top:80px;width:280px;height:200px;overflow:auto;z-index:9999';
      box.innerHTML = '<div style="height:120px"></div><div class="mco-search"><input id="probe-in" type="search" class="mco-search-input" aria-label="Probe">' +
        '<div class="mco-search-list" id="probe-list" hidden></div></div><div style="height:800px"></div>';
      document.body.appendChild(box);
      MCO.initSearchBox({ input: document.getElementById('probe-in'), listbox: document.getElementById('probe-list'), label: 'Probe', announce: false,
        items: Array.from({ length: 40 }, (_, i) => ({ id: 'p' + i, label: 'Probe ' + String(i).padStart(2, '0') })) });
      box.scrollTop = 60;
    });
    await page.focus('#probe-in');
    await page.keyboard.type('probe');
    await page.waitForTimeout(200);
    const ls2 = await listScroll('#probe-in', '#probe-list', '#probe-scroller');
    probe('search list in a scrolling ancestor: ArrowDown ×10 leaves the ancestor and the field put', ls2.ok, JSON.stringify(ls2));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.evaluate(() => { document.getElementById('probe-scroller').remove(); scrollTo(0, 0); });

    /* 0.17.0: MCO.summary.summarize. The sentence follows the readings and
       the units, and a change is announced once. */
    await page.keyboard.press('Escape');
    const su = () => page.evaluate(() => ({
      text: document.getElementById('summary-out').textContent,
      live: document.querySelector('.sr-only[aria-live="polite"]').textContent,
    }));
    const q1 = await su();
    probe('summary: the VOICE model sentence on load',
      q1.text === 'Partly cloudy tonight, calm, no precipitation in 3 days.', JSON.stringify(q1));
    await page.selectOption('#summary-case', 'rain');
    await page.evaluate(() => {   // the radios, or the select that replaces them below 1060 px
      const sel = document.getElementById('summary-units-select');
      if (!sel.hidden) { sel.value = 'si'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      else document.querySelector('input[name="demo-summary-units"][value="si"]').click();
    });
    await page.waitForTimeout(150);
    const q2 = await su();
    probe('summary: SI amounts, and the change is announced',
      q2.text === 'Rain likely, strong WNW wind, 10.7 mm of precipitation today.' && q2.live === q2.text, JSON.stringify(q2));
    await page.evaluate(() => {
      const sel = document.getElementById('summary-units-select');
      if (!sel.hidden) { sel.value = 'us'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      else document.querySelector('input[name="demo-summary-units"][value="us"]').click();
    });

    /* 0.9.0: drawer, sheet, stepper, radio segmented. */
    await page.keyboard.press('Escape');
    await page.focus('#btn-drawer');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    const d1 = await page.evaluate(() => ({
      inDrawer: document.getElementById('demo-drawer').contains(document.activeElement),
      mainInert: document.getElementById('main').inert,
      expanded: document.getElementById('btn-drawer').getAttribute('aria-expanded'),
    }));
    probe('drawer: open moves focus in, the rest is inert, aria-expanded', d1.inDrawer && d1.mainInert && d1.expanded === 'true', JSON.stringify(d1));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const d2 = await page.evaluate(() => ({
      focus: document.activeElement.id, hidden: document.getElementById('demo-drawer').hidden,
      mainInert: document.getElementById('main').inert,
    }));
    probe('drawer: Esc closes, focus returns, inert released, [hidden] after the slide', d2.focus === 'btn-drawer' && d2.hidden && !d2.mainInert, JSON.stringify(d2));
    await page.focus('#btn-sheet');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    const k1 = await page.evaluate(() => document.activeElement.id);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const k2 = await page.evaluate(() => ({ focus: document.activeElement.id, state: document.getElementById('demo-sheet').dataset.state }));
    probe('sheet: open focuses its title; Esc closes and returns focus', k1 === 'demo-sheet-title' && k2.focus === 'btn-sheet' && k2.state === 'closed', JSON.stringify([k1, k2]));
    const before = await page.textContent('#date-readout');
    await page.focus('#step-prev');
    await page.keyboard.press('Enter');
    const after = await page.textContent('#date-readout');
    const nextDisabled = await page.evaluate(() => document.getElementById('step-next').disabled);
    probe('stepper: Enter steps once; next is disabled at today', before !== after && nextDisabled === false, JSON.stringify([before, after]));
    await page.focus('#units-seg input:checked');
    await page.keyboard.press('ArrowRight');
    const radio = await page.evaluate(() => ({
      checked: document.querySelector('#units-seg input:checked').value, select: document.getElementById('units-select').value,
    }));
    probe('radio segmented: arrows move the choice; the fallback select mirrors it', radio.checked === 'metric' && radio.select === 'metric', JSON.stringify(radio));
    await context.close();

    // Nav rail (0.10.0) on a short landscape viewport.
    const rctx = await browser.newContext({ viewport: { width: 750, height: 342 } });
    const rp = await rctx.newPage();
    await rp.goto(`http://127.0.0.1:${port}/demo/?theme=dark`, { waitUntil: 'domcontentloaded' });
    await rp.waitForTimeout(1000);
    await rp.click('#btn-rail-menu');
    await rp.waitForTimeout(400);   // past the 180ms fade-in, or axe reads mid-transition text
    const r1 = await rp.evaluate(() => ({
      inDrawer: document.getElementById('nav-drawer').contains(document.activeElement),
      mainInert: document.getElementById('main').inert,
      expanded: document.getElementById('btn-rail-menu').getAttribute('aria-expanded'),
    }));
    probe('rail: the menu opens the drawer, moves focus in, the page is inert', r1.inDrawer && r1.mainInert && r1.expanded === 'true', JSON.stringify(r1));
    const rbad = (await new AxeBuilder({ page: rp }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    probe('axe: open rail drawer has no serious/critical violations', rbad.length === 0, rbad.map((v) => v.id).join(', '));
    await rp.keyboard.press('Escape');
    const r2 = await rp.evaluate(() => ({
      focus: document.activeElement.id, mainInert: document.getElementById('main').inert,
      shown: getComputedStyle(document.getElementById('nav-drawer')).display !== 'none',
    }));
    probe('rail: Esc closes, focus returns to the menu, inert released', r2.focus === 'btn-rail-menu' && !r2.mainInert && !r2.shown, JSON.stringify(r2));
    await rctx.close();

    // A fresh browser for the probes below: Playwright WebKit stops loading
    // pages after enough visits in one browser (axe-matrix.mjs relaunches
    // for the same reason).
    const pb = await ENGINES[engine].launch(engine === 'chromium'
      ? { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] } : {});
    /* 0.21.2: the folded bar on touch. ☰ focuses the drawer, not the search
       field (which would raise a phone keyboard); 🔍 focuses the field.
       Above 640px the folded bar still shows 🔍 with ☰ at the right edge.
       Text fields are 16px on a touch phone (no iOS focus zoom), and only
       there: a touch tablet keeps the desktop size, so its bar can't fold
       on wider fields. */
    for (const fv of [{ w: 320, h: 568 }, { w: 390, h: 844 }, { w: 768, h: 1024 }, { w: 750, h: 342 }]) {
      const fctx = await pb.newContext({ viewport: { width: fv.w, height: fv.h }, hasTouch: true, isMobile: engine === 'chromium' });
      const fp = await fctx.newPage();
      await fp.goto(`http://127.0.0.1:${port}/demo/?theme=dark`, { waitUntil: 'domcontentloaded' });
      await fp.waitForTimeout(1000);
      const at = `${fv.w}×${fv.h}`;
      const bar = await fp.evaluate(() => {
        const nav = document.querySelector('.mco-navbar'), menu = document.getElementById('btn-rail-menu');
        const st = document.getElementById('btn-search-toggle');
        const small = [...document.querySelectorAll('input, select, textarea')]
          .filter((e) => !/^(hidden|checkbox|radio|range|button|submit|reset|color|file|image)$/.test(e.type))
          .filter((e) => getComputedStyle(e).fontSize !== '16px').map((e) => e.id || e.tagName);
        const sixteen = [...document.querySelectorAll('input, select, textarea')]
          .filter((e) => !/^(hidden|checkbox|radio|range|button|submit|reset|color|file|image)$/.test(e.type))
          .filter((e) => getComputedStyle(e).fontSize === '16px').map((e) => e.id || e.tagName);
        return { folded: nav.classList.contains('is-folded'), h: Math.round(nav.getBoundingClientRect().height),
          gap: Math.round(document.documentElement.clientWidth - menu.getBoundingClientRect().right),
          toggle: st.getClientRects().length > 0, small, sixteen };
      });
      const phone = fv.w <= 640 || fv.h <= 560;
      if (phone) probe(`${at} touch: text fields and selects are 16px`, bar.small.length === 0, JSON.stringify(bar.small));
      else probe(`${at} touch (tablet): text fields keep their desktop size`, bar.sixteen.length === 0, JSON.stringify(bar.sixteen));
      if (fv.h > 560) {
        probe(`${at}: folded bar, one row ≤ 64px, ☰ within 16px of the right edge, 🔍 visible`,
          bar.folded && bar.h <= 64 && bar.gap <= 16 && bar.toggle, JSON.stringify(bar));
      }
      await fp.click('#btn-rail-menu');
      await fp.waitForTimeout(300);
      const m1 = await fp.evaluate(() => ({ focus: document.activeElement.id, tag: document.activeElement.tagName,
        name: document.getElementById('nav-drawer').getAttribute('aria-label') }));
      probe(`${at}: ☰ focuses the named drawer, not a field`, m1.focus === 'nav-drawer' && !!m1.name, JSON.stringify(m1));
      await fp.keyboard.press('Escape');
      await fp.waitForTimeout(300);
      if (bar.toggle) {
        await fp.click('#btn-search-toggle');
        await fp.waitForTimeout(300);
        const m2 = await fp.evaluate(() => document.activeElement.id);
        probe(`${at}: 🔍 opens the drawer on the search field`, m2 === 'demo-search', m2);
        await fp.keyboard.press('Escape');
      }
      await fctx.close();
    }
    /* 0.21.2: a legend taller than its map is capped to the room over it,
       its toggle stays reachable, and a click on it collapses the panel. The
       demo's own legend fits and must stay untouched. */
    for (const lv of [{ w: 1440, h: 900, touch: false }, { w: 390, h: 844, touch: true }]) {
      const lctx = await pb.newContext({ viewport: { width: lv.w, height: lv.h }, hasTouch: lv.touch, isMobile: lv.touch && engine === 'chromium' });
      const lp = await lctx.newPage();
      await lp.goto(`http://127.0.0.1:${port}/demo/?theme=dark`, { waitUntil: 'domcontentloaded' });
      await lp.evaluate(() => document.getElementById('tall-frame').scrollIntoView({ block: 'center' }));
      await lp.waitForTimeout(600);
      const at = `${lv.w}×${lv.h}`;
      const t1 = await lp.evaluate(() => {
        const p = document.getElementById('tall-panel'), f = document.getElementById('tall-frame'), t = document.getElementById('tall-toggle');
        const pr = p.getBoundingClientRect(), fr = f.getBoundingClientRect(), tr = t.getBoundingClientRect();
        const hit = document.elementFromPoint(tr.left + tr.width / 2, tr.top + tr.height / 2);
        return { capped: p.classList.contains('is-capped'), inFrame: pr.top >= fr.top - 1 && pr.bottom <= fr.bottom + 1,
          hit: !!hit && (hit === t || t.contains(hit)), scrolls: p.scrollHeight > p.clientHeight,
          headPinned: getComputedStyle(p.querySelector('.mco-panel-head')).position === 'sticky',
          demoLegendUntouched: !document.getElementById('legend-panel').classList.contains('is-capped') };
      });
      probe(`${at}: a legend taller than its map is capped inside it, scrolls, head pinned, toggle hittable; a legend that fits is untouched`,
        t1.capped && t1.inFrame && t1.hit && t1.scrolls && t1.headPinned && t1.demoLegendUntouched, JSON.stringify(t1));
      const lbad = (await new AxeBuilder({ page: lp }).include('#tall-frame').analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      probe(`${at}: axe: the capped legend has no serious/critical violations`, lbad.length === 0, lbad.map((v) => v.id).join(', '));
      await lp.click('#tall-toggle');
      // The collapse animates, then the panel shrinks and the cap lifts.
      await lp.waitForFunction(() => !document.getElementById('tall-panel').classList.contains('is-capped'), null, { timeout: 3000 }).catch(() => {});
      const t2 = await lp.evaluate(() => ({ expanded: document.getElementById('tall-toggle').getAttribute('aria-expanded'),
        capped: document.getElementById('tall-panel').classList.contains('is-capped') }));
      probe(`${at}: the pinned toggle collapses the capped legend, and the cap lifts`, t2.expanded === 'false' && !t2.capped, JSON.stringify(t2));
      await lctx.close();
    }
    {
      const mctx = await pb.newContext({ viewport: { width: 390, height: 844 } });
      const mp = await mctx.newPage();
      await mp.goto(`http://127.0.0.1:${port}/demo/?theme=dark`, { waitUntil: 'domcontentloaded' });
      await mp.waitForTimeout(500);
      const fs = await mp.evaluate(() => getComputedStyle(document.getElementById('demo-search')).fontSize);
      probe('390×844 without touch: the search field keeps its desktop size', fs !== '16px', fs);
      await mctx.close();
    }
    await pb.close();
  }

  await v1Probes(engine, (label, ok, detail) => {
    if (!ok) failed = true;
    console[ok ? 'log' : 'error'](`[${engine} 1.0.0] ${ok ? 'OK' : 'FAIL'} — ${label}${ok ? '' : ' ' + detail}`);
  });

  await browser.close();
}
server.close();
process.exit(failed ? 1 : 0);
