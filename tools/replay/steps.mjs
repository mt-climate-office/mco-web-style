/* ============================================================================
   mco-web-style · tools/replay/steps.mjs
   The default steps, the step runner and what is read from the page after
   each step. An app's replay.config.mjs names a few facts (a station, a
   search term, its legend and bar controls); the steps are built from them.
   ========================================================================== */

/** Where each text signal is read from; an app may override any of them. */
export const REGIONS = {
  legend: '#legend',
  panel: '.mco-sheet',
  table: '#sr-twin, .sr-only table, table.sr-only, [id^="sr-"] table',
  search: '.mco-search-list',
  stamp: '#refresh-stamp, #sheet-stamp, .mco-stamp',
  controls: '#navbar button, #navbar select, #navbar input, #nav-drawer button, #nav-drawer select, #nav-drawer input',
};

/** The default walk through an app, from its replay.config.mjs. */
export function defaultSteps(c) {
  const close = c.close || '.mco-sheet:not([hidden]) [data-close-sheet]';
  const s = [{ name: 'load', go: '' }];
  if (c.station) {
    s.push({ name: 'station by click', clickStation: c.station });
    s.push({ name: 'close', click: close });
    s.push({ name: 'station by link', go: `?station=${c.station}` });
    s.push({ name: 'close link', click: close });
  }
  if (c.search) {
    s.push({ name: 'search', fill: [c.searchInput || '#search-input', c.search] });
    s.push({ name: 'search pick', press: 'Enter' });
    s.push({ name: 'close search pick', click: close });
  }
  if (c.legend) s.push({ name: 'legend toggle', click: c.legend });
  for (const ctl of c.controls || []) {
    s.push(Array.isArray(ctl) ? { name: `control ${ctl[0]}`, select: ctl } : { name: `control ${ctl}`, click: ctl });
  }
  s.push({ name: 'theme', click: c.theme || '#btn-theme' });
  s.push({ name: 'back', back: true });
  s.push({ name: 'forward', forward: true });
  return s;
}

/**
 * Run in the page before any app code: a fixed Math.random (so random ids and
 * cache busters repeat) and a handle on every MapLibre map. The kit assigns
 * window.maplibregl once its import resolves; patching Map.prototype.on then
 * catches each map at construction without editing the app.
 */
export function pageInit() {
  let seed = 0x2f6b9a1d;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // A count of DOM changes, so a debounced rebuild (a table redrawn 500 ms
  // after the last batch of data) is waited for like the network is.
  let changes = 0;
  Object.defineProperty(window, '__replayChanges', { get: () => changes });
  new MutationObserver(() => { changes++; })
    .observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  const maps = [];
  Object.defineProperty(window, '__replayMaps', { value: maps });
  let ml;
  Object.defineProperty(window, 'maplibregl', {
    configurable: true,
    get: () => ml,
    set(v) {
      ml = v;
      const P = v && v.Map && v.Map.prototype;
      if (!P || P.__replay) return;
      const on = P.on;
      P.on = function (...a) {
        if (!maps.includes(this)) {
          maps.push(this);
          // 'idle' comes only once tiles, camera moves and label fades are
          // done; any later frame means the map is drawing again.
          this.__replayIdle = false;
          on.call(this, 'render', () => { this.__replayIdle = false; });
          on.call(this, 'idle', () => { this.__replayIdle = true; });
        }
        return on.apply(this, a);
      };
      P.__replay = true;
    },
  });
}

/**
 * The DOM change count once fonts are in and every map has drawn all its
 * tiles and stopped; -1 before that.
 */
export function pageSettled() {
  if (document.fonts.status !== 'loaded') return -1;
  for (const m of window.__replayMaps || []) {
    try {
      if (!m.getCanvas().isConnected) continue;
      if (!m.__replayIdle || !m.loaded() || !m.areTilesLoaded() || m.isMoving()) return -1;
    } catch {
      return -1;
    }
  }
  return window.__replayChanges;
}

/** Read every signal from the page. */
export function pageRead(regions) {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const shown = (el) => !el.closest('[hidden]') && el.getClientRects().length > 0;
  const text = (sel, visible) => [...document.querySelectorAll(sel)]
    .filter((el) => !visible || shown(el))
    .map((el) => norm(visible ? el.innerText : el.textContent)).filter(Boolean).join(' ¦ ');
  const controls = [...new Set(document.querySelectorAll(regions.controls))].map((el) => {
    const name = norm(el.getAttribute('aria-label') || el.textContent || el.id || el.name).slice(0, 40);
    const st = ['aria-pressed', 'aria-expanded', 'aria-checked', 'aria-selected', 'disabled']
      .filter((a) => el.hasAttribute(a)).map((a) => `${a.replace('aria-', '')}=${el.getAttribute(a) || 'true'}`);
    if (el.matches('select, input:not([type=checkbox]):not([type=radio])')) st.push(`value=${el.value}`);
    if (el.matches('input[type=checkbox], input[type=radio]')) st.push(`checked=${el.checked}`);
    st.push(shown(el) ? 'shown' : 'hidden');
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} "${name}" ${st.join(' ')}`;
  });
  const layers = (window.__replayMaps || []).filter((m) => m.getCanvas().isConnected).map((m) => {
    try { return m.getStyle().layers.map((l) => l.id).join(','); } catch { return 'unreadable'; }
  });
  return {
    legend: text(regions.legend, true),
    panel: text(regions.panel, true),
    table: text(regions.table, false),
    search: text(regions.search, true),
    stamp: text(regions.stamp, false),
    controls: controls.join('\n'),
    href: location.href,
    history: String(history.length),
    layers: layers.length ? layers.join('\n') : 'no map',
  };
}

/**
 * Find a station drawn on the map (a dot, or a cell polygon carrying its id)
 * and return a point on the page where it is the app's topmost feature.
 */
export function pageStationPoint(id) {
  const has = (f) => Object.values(f.properties || {}).includes(id);
  for (const m of window.__replayMaps || []) {
    if (!m.getCanvas().isConnected) continue;
    const r = m.getCanvas().getBoundingClientRect();
    for (const f of m.queryRenderedFeatures()) {
      if (!has(f)) continue;
      const g = f.geometry;
      let ll;
      if (g.type === 'Point') ll = g.coordinates;
      else if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
        const ring = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0];
        const xs = ring.map((c) => c[0]), ys = ring.map((c) => c[1]);
        ll = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
      } else continue;
      const p = m.project(ll);
      if (p.x < 0 || p.y < 0 || p.x > r.width || p.y > r.height) continue;
      // Only the app's own (GeoJSON) features of the same kind count: a
      // basemap label or a transparent hit area over a dot does not.
      const src = m.getStyle().sources;
      const top = m.queryRenderedFeatures([p.x, p.y])
        .find((t) => src[t.source]?.type === 'geojson' && (t.geometry.type === 'Point') === (g.type === 'Point'));
      if (top && has(top)) return { x: r.left + p.x, y: r.top + p.y };
    }
  }
  return null;
}

/** Do one step. Returns how it was done, or why it could not be. */
export async function act(page, step, base) {
  if ('go' in step) {
    await page.goto(base + step.go, { waitUntil: 'load', timeout: 45000 });
    return 'loaded';
  }
  if (step.clickStation) {
    const pt = await page.evaluate(pageStationPoint, step.clickStation);
    if (!pt) return `station ${step.clickStation} not drawn on top anywhere on the map`;
    await page.mouse.click(pt.x, pt.y);
    return 'clicked on the map';
  }
  if (step.click) {
    const el = page.locator(step.click).first();
    if (!(await el.count())) return `no ${step.click}`;
    // A control folded into a closed drawer is pressed the way a script
    // would, so one step list runs at every width.
    if (await el.isVisible()) { await el.click({ timeout: 5000 }); return 'clicked'; }
    await el.evaluate((n) => n.click());
    return 'clicked (hidden, by script)';
  }
  if (step.fill) {
    const el = page.locator(step.fill[0]).first();
    if (!(await el.count())) return `no ${step.fill[0]}`;
    if (!(await el.isVisible())) {
      // A folded bar hides search behind its toggle.
      const t = page.locator('.mco-search-toggle').first();
      if ((await t.count()) && (await t.isVisible())) await t.click();
    }
    await el.fill(step.fill[1], { force: true, timeout: 5000 });
    return 'filled';
  }
  if (step.select) {
    // [selector, value or option index]
    const [sel, want] = step.select;
    const el = page.locator(sel).first();
    if (!(await el.count())) return `no ${sel}`;
    const value = await el.evaluate((n, w) => (typeof w === 'number' ? n.options[w]?.value : w), want);
    if (value == null) return `no option ${want} in ${sel}`;
    if (await el.isVisible()) { await el.selectOption(value, { timeout: 5000 }); return `chose ${value}`; }
    await el.evaluate((n, v) => { n.value = v; n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true })); }, value);
    return `chose ${value} (hidden, by script)`;
  }
  if (step.press) { await page.keyboard.press(step.press); return 'pressed'; }
  if (step.back) { await page.evaluate(() => history.back()); return 'back'; }
  if (step.forward) { await page.evaluate(() => history.forward()); return 'forward'; }
  if (step.run) { await step.run({ page }); return 'ran'; }
  return 'unknown step';
}
