/* ============================================================================
   mco-web-style · map/mco-map.js · v0.1.0
   MapLibre GL helpers for Montana Climate Office map apps.

   Classic script, zero dependencies, no build. Lands on window.MCO.map.
   Requires MapLibre GL 5.x (the house map library — see HOUSE-STYLE.md §7)
   loaded first; does NOT require mco-core.js (deliberately standalone: the
   one shared concern, reading the current theme, is inlined).

   API keys NEVER belong in this file or any shared code. themedStyleUrl()
   takes fully-formed style URLs so keys stay in the consuming app.
   ========================================================================== */
(function () {
  'use strict';

  var MCO = window.MCO = window.MCO || {};
  MCO.versions = Object.assign(MCO.versions || {}, { map: '0.1.0' });
  var M = MCO.map = MCO.map || {};

  // Theme read, inlined (no mco-core dependency). High-contrast counts as
  // dark: it wants the dark basemap under brightened chrome.
  function isDark() { return document.documentElement.dataset.theme !== 'light'; }

  // Live reduced-motion gate for camera animations (WCAG 2.3.3).
  var _rmMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var _rm = _rmMq.matches;
  _rmMq.addEventListener('change', function (e) { _rm = e.matches; });

  /* ── Montana framing ───────────────────────────────────────────────────── */

  M.MT_FIT_BOUNDS = [[-116.10, 44.30], [-104.00, 49.05]];
  M.FIT_OPTS = { padding: 24, animate: false };

  /* ── Basemap style URLs (theme read at call time) ──────────────────────── */

  // Generic picker: pass fully-formed style URLs for each theme. Keys stay in
  // the consumer:
  //   MCO.map.themedStyleUrl({ dark:  `https://…/stamen_toner.json?api_key=${KEY}`,
  //                            light: `https://…/stamen_toner_lite.json?api_key=${KEY}` })
  M.themedStyleUrl = function (urls) {
    return isDark() ? urls.dark : urls.light;
  };

  // House default: CARTO Dark Matter / Positron. Neutral data-vis backdrops
  // with no public-lands tinting or saturated landform shading — data layers
  // stay the primary read. No API key required.
  M.cartoStyleUrl = function () {
    var variant = isDark() ? 'dark-matter-gl-style' : 'positron-gl-style';
    return 'https://basemaps.cartocdn.com/gl/' + variant + '/style.json';
  };

  /* ── Initial camera from the shared URL convention ─────────────────────────
     Returns an object to spread into new maplibregl.Map({container, style,
     ...MCO.map.initialCamera(params)}). Uses ?lng&lat&zoom when all three
     parse; falls back to fitting the given bounds. */
  M.initialCamera = function (searchParams, opts) {
    opts = opts || {};
    var bounds = opts.bounds || M.MT_FIT_BOUNDS;
    var fitOpts = opts.fitOpts || M.FIT_OPTS;
    var lng = parseFloat(searchParams.get('lng'));
    var lat = parseFloat(searchParams.get('lat'));
    var zoom = parseFloat(searchParams.get('zoom'));
    if (Number.isFinite(lng) && Number.isFinite(lat) && Number.isFinite(zoom)) {
      return { center: [lng, lat], zoom: zoom };
    }
    return { bounds: bounds, fitBoundsOptions: fitOpts };
  };

  // Camera → URL params at the canonical precision (4 dp position, 2 dp zoom).
  // Merge into your app params and pass to MCO.replaceUrlState().
  M.cameraParams = function (map) {
    var c = map.getCenter();
    return {
      lng: c.lng.toFixed(4),
      lat: c.lat.toFixed(4),
      zoom: map.getZoom().toFixed(2),
    };
  };

  /* ── Controls ──────────────────────────────────────────────────────────── */

  // House default: zoom buttons, no compass (rotation is off in these apps;
  // a compass that never turns is noise).
  M.addNavigation = function (map, opts) {
    opts = opts || {};
    var control = new maplibregl.NavigationControl({
      showCompass: opts.showCompass === true,
    });
    map.addControl(control, opts.position || 'top-right');
    return control;
  };

  // "Zoom to full extent" button, appended into an existing control group so
  // it fuses with the zoom buttons. NavigationControl renders its DOM
  // synchronously inside addControl, so the group is queryable immediately
  // after M.addNavigation(). Icon comes from .maplibregl-ctrl-fit in
  // mco-theme.css (flipped for dark themes by --ctrl-icon-filter).
  M.addFitControl = function (map, opts) {
    opts = opts || {};
    var bounds = opts.bounds || M.MT_FIT_BOUNDS;
    var fitOpts = opts.fitOpts || M.FIT_OPTS;
    var title = opts.title || 'Zoom to full extent';
    var group = opts.container ||
      map.getContainer().querySelector('.maplibregl-ctrl-group');
    if (!group) return null;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'maplibregl-ctrl-fit';
    btn.title = title;
    btn.setAttribute('aria-label', title);
    // Match the built-in zoom buttons: an empty icon span; the glyph is a
    // CSS background-image.
    btn.innerHTML = '<span class="maplibregl-ctrl-icon" aria-hidden="true"></span>';
    btn.addEventListener('click', function () {
      if (opts.onBeforeFit) opts.onBeforeFit();
      var fo = typeof fitOpts === 'function' ? fitOpts() : fitOpts;
      map.fitBounds(bounds, Object.assign({}, fo, { animate: !_rm }));
    });
    group.appendChild(btn);
    return btn;
  };

  /* ── Zoom floor ────────────────────────────────────────────────────────────
     Keeps the region filling the viewport: snaps back when the user zooms out
     below the zoom that fits `bounds`, and recomputes that zoom after resizes
     (debounced — `resize` fires continuously during a window drag). Call
     refresh() inside map.on('load'); returns {refresh, fitZoom, dispose}. */
  M.installZoomFloor = function (map, opts) {
    opts = opts || {};
    var bounds = opts.bounds || M.MT_FIT_BOUNDS;
    var fitOpts = opts.fitOpts || M.FIT_OPTS;
    var debounceMs = opts.resizeDebounceMs || 200;
    var fitZoom;
    var timer = null;

    function compute() {
      var fo = typeof fitOpts === 'function' ? fitOpts() : fitOpts;
      fitZoom = map.cameraForBounds(bounds, fo).zoom;
    }
    function snapBack() {
      var fo = typeof fitOpts === 'function' ? fitOpts() : fitOpts;
      map.fitBounds(bounds, Object.assign({}, fo, { animate: !_rm }));
    }
    function onZoomEnd() {
      if (fitZoom !== undefined && map.getZoom() < fitZoom) snapBack();
    }
    function onResize() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        compute();
        if (map.getZoom() < fitZoom) snapBack();
      }, debounceMs);
    }
    map.on('zoomend', onZoomEnd);
    map.on('resize', onResize);

    return {
      refresh: compute,
      fitZoom: function () { return fitZoom; },
      dispose: function () {
        clearTimeout(timer);
        map.off('zoomend', onZoomEnd);
        map.off('resize', onResize);
      },
    };
  };

  /* ── Montana overlay paints ────────────────────────────────────────────────
     Theme-aware paint objects for the shared boundary layers (state, county,
     tribal — GeoJSON in map/data/). Call AFTER mco-theme.css has loaded (the
     county line reads a token via getComputedStyle) and re-apply after theme
     switches. Consumers spread-override per context, e.g. photos strengthens
     tribal fill over its photo mosaic:
       { ...MCO.map.overlayPaints().tribalFill, 'fill-opacity': 0.25 } */
  M.overlayPaints = function () {
    var dark = isDark();
    var textMuted = getComputedStyle(document.documentElement)
      .getPropertyValue('--text-muted').trim() || (dark ? '#8a99b0' : '#5a6070');
    return {
      // Neutral boundary (near-white on dark, near-black on light), not the
      // accent blue — the state line frames the data, it isn't data.
      stateLine: { 'line-color': dark ? '#e8ecf0' : '#1a1a2e', 'line-width': 2, 'line-opacity': 0.55 },
      countiesLine: { 'line-color': textMuted, 'line-width': 0.6, 'line-opacity': 0.5 },
      tribalFill: { 'fill-color': dark ? '#b88a5e' : '#9b6b3e', 'fill-opacity': dark ? 0.18 : 0.15 },
      tribalLine: { 'line-color': dark ? '#d6a06f' : '#7a4f24', 'line-width': 1, 'line-opacity': dark ? 0.65 : 0.55 },
      tribalLabelPaint: {
        'text-color': dark ? '#d6a06f' : '#6a4520',
        'text-halo-color': dark ? '#161b22' : '#ffffff',
        'text-halo-width': 1.4, 'text-halo-blur': 0.3,
      },
    };
  };

  // Symbol layout for tribal-nation labels: Census names shortened to common
  // usage. Font stack exists in the CARTO basemap glyph set.
  M.TRIBAL_LABEL_LAYOUT = {
    'text-field': ['match', ['get', 'NAME'],
      'Blackfeet Indian Reservation', 'Blackfeet',
      'Crow Reservation', 'Crow',
      'Flathead Reservation', 'Flathead',
      'Fort Belknap Reservation', 'Fort Belknap',
      'Fort Peck Indian Reservation', 'Fort Peck',
      'Northern Cheyenne Indian Reservation', 'Northern Cheyenne',
      "Rocky Boy's Reservation", "Rocky Boy's",
      ['get', 'NAME'],
    ],
    'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
    'text-size': ['interpolate', ['linear'], ['zoom'], 7, 10, 10, 13, 13, 16],
    'text-letter-spacing': 0.05, 'text-max-width': 8, 'text-padding': 2,
    'text-allow-overlap': false, 'symbol-placement': 'point',
  };
})();
