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


  await browser.close();
}
server.close();
process.exit(failed ? 1 : 0);
