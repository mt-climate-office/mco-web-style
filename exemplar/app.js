/* ============================================================================
   mco-web-style exemplar · app.js
   Reference implementation of an MCO map app on the house kit. Section
   references (§) are to HOUSE-STYLE.md. Classic script, external file so the
   page's CSP can pin script-src 'self'.
   ========================================================================== */
(function () {
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
  const srTable = document.getElementById('sr-station-table');
  let _cardOpener = null;

  // Live region for everything a sighted user learns from the canvas — §5.1
  const live = MCO.createLiveRegion();

  /* ── Map init (§7) ─────────────────────────────────────────────────────── */

  const map = new maplibregl.Map({
    container: 'map',
    style: MCO.map.cartoStyleUrl(),
    ...MCO.map.initialCamera(params),
  });
  MCO.map.addNavigation(map);                    // house default: no compass
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

    renderSRTable(visible);
    // Announce what the canvas now shows — §5.1
    live.announce(`${visible.length} stations shown: ${[...activeNets].join(' and ') || 'none'}.`);
  }

  // Hidden-table twin of the WebGL layer, rebuilt each render — §5.2
  function renderSRTable(visible) {
    const rows = visible.map((s) =>
      `<tr><th scope="row">${MCO.escapeHTML(s.name)} (${MCO.escapeHTML(s.station)})</th>` +
      `<td>${MCO.escapeHTML(s.sub_network)}</td>` +
      `<td>${MCO.escapeHTML(s.county || '—')}</td>` +
      `<td>${Math.round(s.elevation)} m</td>` +
      `<td>${s.date_installed ? MCO.formatDateMT(s.date_installed) : '—'}</td></tr>`).join('');
    srTable.innerHTML =
      '<caption>Montana Mesonet stations currently shown on the map</caption>' +
      '<thead><tr><th scope="col">Station</th><th scope="col">Network</th>' +
      '<th scope="col">County</th><th scope="col">Elevation</th>' +
      '<th scope="col">Installed</th></tr></thead>' +
      `<tbody>${rows}</tbody>`;
  }

  /* ── Station detail card (docked panel, not <dialog> — see index.html) ─── */

  function openStation(id, { fly = false } = {}) {
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
    if (fly) {
      // Camera animation gated on the LIVE reduced-motion flag — §5.3
      map.flyTo({ center: [s.longitude, s.latitude], zoom: Math.max(map.getZoom(), 8),
                  animate: !MCO.reducedMotion() });
    }
    pushState();
  }

  function closeCard() {
    if (card.hidden) return;
    card.hidden = true;
    selectedId = null;
    map.getLayer('stations-selected') &&
      map.setFilter('stations-selected', ['==', ['get', 'id'], '']);
    if (_cardOpener && _cardOpener.focus) _cardOpener.focus();  // restore — §5.12
    _cardOpener = null;
    pushState();
  }
  document.getElementById('card-close').addEventListener('click', closeCard);
  document.addEventListener('keydown', (e) => {
    // Esc is always live (no opt-out needed: it's not a printable-key
    // shortcut, so WCAG 2.1.4 / §5.9 doesn't apply).
    if (e.key === 'Escape' && !card.hidden) closeCard();
  });

  /* ── URL state (§4): mirror every mutation; clean URL at defaults ──────── */

  function pushState() {
    const p = {};
    if (activeNets.size !== NETS.length) {
      p.net = [...activeNets].map((n) => n.toLowerCase()).join(' ');
    }
    if (selectedId) p.station = selectedId;
    const theme = MCO.getTheme();
    if (theme) p.theme = theme;
    Object.assign(p, MCO.map.cameraParams(map));
    MCO.replaceUrlState(p);
  }
  map.on('moveend', pushState);

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
      pushState();
    });
  });

  /* ── Keyboard path to every station (§5.8) ─────────────────────────────── */

  selectEl.addEventListener('change', () => {
    if (selectEl.value) openStation(selectEl.value, { fly: true });
  });

  /* ── Map pointer interactions ──────────────────────────────────────────── */

  map.on('mousemove', 'stations-dots', (e) => {
    map.getCanvas().style.cursor = 'pointer';
    const f = e.features && e.features[0];
    if (!f) return;
    tooltip.innerHTML =
      `<span class="tooltip-name">${MCO.escapeHTML(f.properties.name)}</span>` +
      `<span class="tooltip-sub">${MCO.escapeHTML(f.properties.id)} · ${MCO.escapeHTML(f.properties.net)}</span>`;
    // .mco-tooltip is position:fixed — use viewport coordinates.
    tooltip.style.left = (e.originalEvent.clientX + 14) + 'px';
    tooltip.style.top = (e.originalEvent.clientY + 14) + 'px';
    tooltip.classList.add('visible');
  });
  map.on('mouseleave', 'stations-dots', () => {
    map.getCanvas().style.cursor = '';
    tooltip.classList.remove('visible');
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
      map.setStyle(MCO.map.cartoStyleUrl());
      map.once('style.load', () => { addCustomLayers(); render(); });
      pushState();
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
        openStation(selectedId, { fly: !params.has('lng') });
      } else {
        selectedId = null;
      }
    }).catch(() => {
      note('Failed to load station data. <button type="button" class="nav-btn" id="btn-retry">Retry</button>');
      document.getElementById('btn-retry')?.addEventListener('click', loadAll);
      MCO.showToast('Failed to load station data.', 4000);
    });
  }

  map.on('load', () => {
    zoomFloor.refresh();
    loadAll();
  });
})();
