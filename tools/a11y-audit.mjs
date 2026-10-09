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
     npm init -y && npm i --no-save playwright @axe-core/playwright
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
  const pages = ['/demo/', '/exemplar/'];
  // Wide: everything shown. Narrow: past every shed in the ladder (labels, brand,
  // search) — where a display:none'd label silently costs an input its name.
  const viewports = [
    { name: 'wide', width: 1440, height: 900 },
    { name: 'narrow', width: 390, height: 800, touch: true },
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
  }


  await browser.close();
}
server.close();
process.exit(failed ? 1 : 0);
