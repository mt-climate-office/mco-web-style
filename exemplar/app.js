/* ============================================================================
   mco-web-style exemplar · app.js
   Reference implementation of an MCO map app on the house kit. Section
   references (§) are to HOUSE-STYLE.md. Classic script, external file so the
   page's CSP can pin script-src 'self'.

   MapLibre 6 is ES-modules only, so the app runs once MCO.map.loadMapLibre()
   resolves (§7). A larger app wires its non-map UI before that; this one is
   all map, so it simply waits.
   ========================================================================== */
MCO.map.loadMapLibre().then(function (maplibregl) {
  'use strict';

  /* ── Constants ─────────────────────────────────────────────────────────── */

  const STATIONS_URL = 'https://mesonet.climate.umt.edu/api/stations/?type=json';
  const DASH_URL = (s) => `https://mesonet.climate.umt.edu/dash/${encodeURIComponent(s)}/`;

  // Categorical palette: Paul Tol "bright" blue/orange — a CVD-safe hue pair
  // (§6). Color is never the sole channel: the legend text, tooltip, detail
  // card, and sr-table all carry the network name.
  const NET_COLORS = { HydroMet: '#4477aa', AgriMet: '#ee7733' };
  const NETS = Object.keys(NET_COLORS);
  const netByLower = new Map(NETS.map((n) => [n.toLowerCase(), n]));

  const LS_NETS = 'mco-exemplar-networks';   // app-prefixed key — §4

  /* ── State (URL param > localStorage > default, all validated — §4) ────── */

  const params = MCO.urlParams();

  let activeNets = (() => {
    const fromUrl = MCO.splitTokens(MCO.getParamLower('net', params));
    if (fromUrl) {
      const valid = fromUrl.map((t) => netByLower.get(t)).filter(Boolean);
      if (valid.length) return new Set(valid);
    }
    // Re-validate persisted values like URL params — another app (or an old
    // version of this one) may have written something unexpected. §4
    try {
      const saved = JSON.parse(MCO.lsGet(LS_NETS) || 'null');
      if (Array.isArray(saved)) {
        const valid = saved.map((t) => netByLower.get(String(t).toLowerCase())).filter(Boolean);
        if (valid.length) return new Set(valid);
      }
    } catch (e) {}
    return new Set(NETS);
  })();

  let stations = [];
  let stationById = new Map();
  let selectedId = (MCO.getParamLower('station', params) || '') || null; // validated after data loads

  /* ── DOM refs ──────────────────────────────────────────────────────────── */

  const noteEl = document.getElementById('app-note');
  const countStamp = document.getElementById('count-stamp');
  const selectEl = document.getElementById('station-select');
  const tooltip = document.getElementById('tooltip');
  const card = document.getElementById('station-card');
  // Selectable twin: one Tab stop, arrows move, Enter opens the station —
  // a keyboard route to every dot on the map (§5.2, §5.8).
  const srTable = MCO.srTable({
    container: document.getElementById('sr-twin'),
    caption: 'Montana Mesonet stations currently shown on the map',
    rowKey: (s) => s.station,
    columns: [
      { label: 'Station', rowHeader: true, value: (s) => `${s.name} (${s.station})` },
      { label: 'Network', key: 'sub_network' },
      { label: 'County', key: 'county' },
      { label: 'Elevation', value: (s) => `${Math.round(s.elevation)} m` },
      { label: 'Installed', value: (s) => (s.date_installed ? MCO.formatDateMT(s.date_installed) : '') },
    ],
    selectable: true,
    onSelect: (s) => openStation(s.station, { fly: true }),
  });
  let _cardOpener = null;

  // The page's one announcer, for everything a sighted user learns from the
  // canvas — §5.1
  const live = { announce: (t) => MCO.announce(t) };

  /* ── Map init (§7) ─────────────────────────────────────────────────────── */

  const map = new maplibregl.Map({
    container: 'map',
    style: MCO.map.cartoStyleUrl(),
    ...MCO.map.initialCamera(params),
  });
  MCO.map.addNavigation(map);                    // house default: no compass
  // A dead basemap retries once, then falls back to a blank style that still
  // fires 'load', so the stations draw anyway — §7
  MCO.map.watchBasemap(map);
  MCO.map.addFitControl(map, { onBeforeFit: closeCard });
  const zoomFloor = MCO.map.installZoomFloor(map);

  const overlayData = {};

  function dotStroke() {
    return getComputedStyle(document.documentElement).getPropertyValue('--dot-stroke').trim();
  }
  function selectionRing() {
    return getComputedStyle(document.documentElement).getPropertyValue('--selection-ring').trim();
  }

  // Everything map.setStyle() wipes gets re-added here (theme switch — §4).
  function addCustomLayers() {
    // The CARTO basemaps draw their own dashed county boundaries from z9
    // (layer 'boundary_county') — hide them so the kit-styled counties are
    // the single treatment at every zoom (§7).
    if (map.getLayer('boundary_county')) {
      map.setLayoutProperty('boundary_county', 'visibility', 'none');
    }

    // Topography first so boundaries and data stack above it (§7). Paints
    // re-derive from the current theme on every call.
    MCO.map.addHillshade(map);
    const paints = MCO.map.overlayPaints();
    if (overlayData.counties && !map.getSource('counties')) {
      map.addSource('counties', { type: 'geojson', data: overlayData.counties });
      map.addLayer({ id: 'counties-line', type: 'line', source: 'counties', paint: paints.countiesLine });
    }
    if (overlayData.tribal && !map.getSource('tribal')) {
      map.addSource('tribal', { type: 'geojson', data: overlayData.tribal });
      map.addLayer({ id: 'tribal-fill', type: 'fill', source: 'tribal', paint: paints.tribalFill });
      map.addLayer({ id: 'tribal-line', type: 'line', source: 'tribal', paint: paints.tribalLine });
      map.addLayer({
        id: 'tribal-label', type: 'symbol', source: 'tribal', minzoom: 6,
        layout: MCO.map.TRIBAL_LABEL_LAYOUT, paint: paints.tribalLabelPaint,
      });
    }
    if (overlayData.state && !map.getSource('state')) {
      map.addSource('state', { type: 'geojson', data: overlayData.state });
      map.addLayer({ id: 'state-line', type: 'line', source: 'state', paint: paints.stateLine });
    }
    if (!map.getSource('stations')) {
      map.addSource('stations', { type: 'geojson', data: stationsFC() });
      map.addLayer({
        id: 'stations-dots', type: 'circle', source: 'stations',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3.5, 10, 7],
          'circle-color': ['match', ['get', 'net'],
            'HydroMet', NET_COLORS.HydroMet,
            'AgriMet', NET_COLORS.AgriMet,
            NET_COLORS.HydroMet],
          'circle-opacity': 0.95,
          'circle-stroke-width': 1.2,
          'circle-stroke-color': dotStroke(),
        },
      });
      // Selection halo: a separate layer keyed by feature filter, colored by
      // the --selection-ring token (§2).
      map.addLayer({
        id: 'stations-selected', type: 'circle', source: 'stations',
        filter: ['==', ['get', 'id'], selectedId || ''],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 6.5, 10, 11],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': selectionRing(),
        },
      });
    }
  }

  /* ── Render pipeline ───────────────────────────────────────────────────── */

  function visibleStations() {
    return stations.filter((s) => activeNets.has(s.sub_network));
  }

  function stationsFC() {
    return {
      type: 'FeatureCollection',
      features: visibleStations().map((s) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] },
        properties: { id: s.station, name: s.name, net: s.sub_network },
      })),
    };
  }

  function render() {
    const visible = visibleStations();
    map.getSource('stations')?.setData(stationsFC());
    map.getLayer('stations-selected') &&
      map.setFilter('stations-selected', ['==', ['get', 'id'], selectedId || '']);

    // Counts in the chips, the legend, and the navbar stamp.
    for (const net of NETS) {
      const n = stations.filter((s) => s.sub_network === net).length;
      document.querySelectorAll(`[data-count-for="${net}"]`).forEach((el) => {
        el.textContent = `(${n})`;
      });
    }
    countStamp.textContent = `${visible.length} stations`;

    srTable.render(visible, { selected: selectedId });
    // Announce what the canvas now shows — §5.1
    live.announce(`${visible.length} stations shown: ${[...activeNets].join(' and ') || 'none'}.`);
  }

  /* ── Station detail card (docked panel, not <dialog> — see index.html) ─── */

  // url: 'auto' pushes the first open from "no detail" and replaces after
  // that; 'replace' for a deep link at boot (its entry is the page's own, so
  // closing must never history.back() off the site); 'none' when Back/Forward
  // already moved the URL.
  function openStation(id, { fly = false, url = 'auto' } = {}) {
    const s = stationById.get(id);
    if (!s) return;
    selectedId = id;
    _cardOpener = document.activeElement;

    document.getElementById('card-title').textContent = s.name;
    document.getElementById('card-id').textContent = s.station;
    document.getElementById('card-net').textContent = s.sub_network;
    document.getElementById('card-county').textContent = s.county || '—';
    document.getElementById('card-elev').textContent = `${Math.round(s.elevation)} m`;
    document.getElementById('card-installed').textContent =
      s.date_installed ? MCO.formatDateMT(s.date_installed) : '—';
    document.getElementById('card-dash').href = DASH_URL(s.station);
    card.hidden = false;
    card.focus();                                  // focus lands on the card
    live.announce(`${s.name} (${s.station}), ${s.sub_network}, opened.`);

    map.getLayer('stations-selected') &&
      map.setFilter('stations-selected', ['==', ['get', 'id'], id]);
    srTable.render(visibleStations(), { selected: id });
    // Drill-down: the first open from "no detail" gets its own history entry,
    // so Back closes it; switching stations while one is open replaces — §4.
    if (url === 'auto' && !(history.state && history.state.mcoDetail)) writeUrl({ push: true });
    else if (url !== 'none') writeUrl();
    if (fly) {
      // Camera animation gated on the LIVE reduced-motion flag — §5.3
      map.flyTo({ center: [s.longitude, s.latitude], zoom: Math.max(map.getZoom(), 8),
                  animate: !MCO.reducedMotion() });
    }
  }

  // fromHistory: Back/Forward already moved the URL; just reflect it.
  function closeCard({ fromHistory = false } = {}) {
    if (card.hidden) return;
    card.hidden = true;
    selectedId = null;
    map.getLayer('stations-selected') &&
      map.setFilter('stations-selected', ['==', ['get', 'id'], '']);
    if (_cardOpener && _cardOpener.focus) _cardOpener.focus();  // restore — §5.12
    _cardOpener = null;
    live.announce('Station closed.');
    if (fromHistory) return;
    // Our own pushed entry: step back off it rather than leave a dead entry
    // that would re-open the card on Back — §4.
    if (history.state && history.state.mcoDetail) history.back();
    else writeUrl();
  }
  document.getElementById('card-close').addEventListener('click', () => closeCard());
  document.addEventListener('keydown', (e) => {
    // Esc is always live (no opt-out needed: it's not a printable-key
    // shortcut, so WCAG 2.1.4 / §5.9 doesn't apply).
    if (e.key === 'Escape' && !card.hidden) closeCard();
  });

  /* ── URL state (§4): mirror every mutation; clean URL at defaults ──────── */

  // replaceUrlState for view adjustments; {push: true} for the drill-down
  // that opens the station card. Defaults are elided so the default view has
  // no query string at all.
  function writeUrl({ push = false } = {}) {
    const p = {};
    if (activeNets.size !== NETS.length) {
      p.net = [...activeNets].map((n) => n.toLowerCase()).join(' ');
    }
    if (selectedId) p.station = selectedId;
    const theme = MCO.getTheme();
    if (theme !== MCO.osTheme()) p.theme = theme;
    Object.assign(p, MCO.map.cameraParamsIfDefault(map));
    if (push) MCO.pushUrlState(p, { state: { mcoDetail: selectedId } });
    else MCO.replaceUrlState(p);
  }
  map.on('moveend', () => writeUrl());

  // Back/Forward: the station param is the only drill-down state — §4.
  MCO.onUrlState((p) => {
    const id = p.get('station');
    if (id && stationById.has(id)) {
      if (id !== selectedId) openStation(id, { url: 'none' });
    } else {
      closeCard({ fromHistory: true });
    }
  });

  /* ── Network filter chips (§5.7: aria-pressed drives the styling) ──────── */

  document.querySelectorAll('[data-net]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(activeNets.has(btn.dataset.net)));
    btn.addEventListener('click', () => {
      const net = btn.dataset.net;
      if (activeNets.has(net)) {
        if (activeNets.size === 1) {              // never allow an empty map silently
          MCO.showToast('At least one sub-network stays on.');
          return;
        }
        activeNets.delete(net);
      } else {
        activeNets.add(net);
      }
      btn.setAttribute('aria-pressed', String(activeNets.has(net)));
      MCO.lsSet(LS_NETS, JSON.stringify([...activeNets]));
      if (selectedId && !activeNets.has(stationById.get(selectedId)?.sub_network)) closeCard();
      render();
      writeUrl();
    });
  });

  /* ── Keyboard path to every station (§5.8) ─────────────────────────────── */

  selectEl.addEventListener('change', () => {
    if (selectEl.value) openStation(selectEl.value, { fly: true });
  });

  /* ── Map pointer interactions ──────────────────────────────────────────── */

  // Hover decoration; the same facts reach AT through the sr-table — §5.8
  MCO.map.initCursorTooltip(map, {
    element: tooltip,
    layers: ['stations-dots'],
    render: (f) => ({ name: f.properties.name, sub: `${f.properties.id} · ${f.properties.net}` }),
  });
  map.on('click', 'stations-dots', (e) => {
    const f = e.features && e.features[0];
    if (f) openStation(f.properties.id);
  });

  /* ── Theme (§4): swap style, then re-add everything setStyle wiped ─────── */

  function paintLegendSwatches() {
    document.querySelectorAll('[data-swatch]').forEach((el) => {
      el.style.background = NET_COLORS[el.dataset.swatch];
    });
  }
  MCO.initThemeToggle({
    button: document.getElementById('btn-theme'),
    iconSun: document.getElementById('icon-sun'),
    iconMoon: document.getElementById('icon-moon'),
    onChange: () => {
      map.setStyle(MCO.map.cartoStyleUrl());   // style.load re-adds the layers
      writeUrl();
    },
  });

  /* ── Share: the URL already IS the view (§4) ───────────────────────────── */

  document.getElementById('btn-share').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      MCO.showToast('Link copied — it reproduces exactly this view.');
    } catch (e) {
      MCO.showToast('Copy failed — the address bar URL is the share link.', 4000);
    }
  });

  /* ── Legend + info modal ───────────────────────────────────────────────── */

  MCO.initCollapsible({
    toggle: document.getElementById('legend-toggle'),
    body: document.getElementById('legend-body'),
    storageKey: 'mco-exemplar-legend',
    autoCollapseOnCompact: true,                 // §3 compact behavior
  });
  paintLegendSwatches();

  MCO.initInfoModal({
    dialog: document.getElementById('info-modal'),
    trigger: document.getElementById('btn-info'),
  });
  // First-visit auto-open, suppressed for deep links and later visits — §4
  const hasDeepLink = ['station', 'net', 'lng'].some((k) => params.has(k));
  if (!MCO.lsGet('mco-exemplar-seen-intro') && !hasDeepLink) {
    setTimeout(() => {
      const dlg = document.getElementById('info-modal');
      if (!dlg.open) dlg.showModal();
      MCO.lsSet('mco-exemplar-seen-intro', '1');
    }, 350);
  }

  /* ── Boot ──────────────────────────────────────────────────────────────── */

  function note(html) {
    noteEl.hidden = !html;
    noteEl.innerHTML = html || '';
  }

  function loadAll() {
    note('Loading stations…');
    Promise.all([
      MCO.fetchJSON(STATIONS_URL, { timeoutMs: 30000 }),
      MCO.fetchJSON('../map/data/mt_state_simple.geojson'),
      MCO.fetchJSON('../map/data/mt_counties_simple.geojson'),
      MCO.fetchJSON('../map/data/mt_reservations_simple.geojson'),
    ]).then(([sts, state, counties, tribal]) => {
      stations = sts.filter((s) =>
        Number.isFinite(s.longitude) && Number.isFinite(s.latitude));
      stationById = new Map(stations.map((s) => [s.station, s]));
      overlayData.state = state;
      overlayData.counties = counties;
      overlayData.tribal = tribal;

      // Populate the keyboard picker, alphabetically.
      const opts = [...stations].sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => {
          const o = document.createElement('option');
          o.value = s.station;
          o.textContent = `${s.name} (${s.station})`;
          return o;
        });
      selectEl.append(...opts);

      addCustomLayers();
      note('');
      render();

      // Deep-linked station — validated against real data before use (§4).
      if (selectedId && stationById.has(selectedId)) {
        openStation(selectedId, { fly: !params.has('lng'), url: 'replace' });
      } else {
        selectedId = null;
      }
    }).catch(() => {
      note('Failed to load station data. <button type="button" class="nav-btn" id="btn-retry">Retry</button>');
      document.getElementById('btn-retry')?.addEventListener('click', loadAll);
      MCO.showToast('Failed to load station data.', 4000);
    });
  }

  // Every style load (theme switch, basemap retry, blank fallback) starts
  // from a bare style, so the custom layers go back on each time — §4, §7.
  map.on('style.load', () => {
    if (stations.length) { addCustomLayers(); render(); }
  });
  map.on('load', () => {
    zoomFloor.refresh();
    loadAll();
  });
}, function () {
  const noteEl = document.getElementById('app-note');
  noteEl.hidden = false;
  noteEl.textContent = 'The map library failed to load. Check your connection and reload.';
});
