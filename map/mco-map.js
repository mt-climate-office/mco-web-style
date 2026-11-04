/* ============================================================================
   mco-web-style · map/mco-map.js · v0.1.0
   MapLibre GL helpers for Montana Climate Office map apps.

   Classic script, zero dependencies, no build. Lands on window.MCO.map.
   Targets MapLibre GL 6.x (the house map library — see HOUSE-STYLE.md §7),
   which ships as ES modules only: MCO.map.loadMapLibre() below imports the
   family pin and resolves once window.maplibregl exists. Nothing here touches
   maplibregl at load time, so this file may load before MapLibre does. Does
   NOT require mco-core.js (deliberately standalone: the one shared concern,
   reading the current theme, is inlined).

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

  /* ── Loading MapLibre (0.8.0) ──────────────────────────────────────────────
     MapLibre 6 dropped the UMD build: there is no <script src> that defines a
     maplibregl global any more. loadMapLibre() dynamic-imports the family pin
     from this classic script, publishes the module namespace as
     window.maplibregl (so every maplibregl.* call keeps working), and returns
     a promise of it. Idempotent: every call shares one import.

       MCO.map.loadMapLibre().then(function (maplibregl) {
         var map = new maplibregl.Map({ … });
       });

     SRI: an import() takes no integrity attribute. The hashes live in the
     page's import map instead (snippets/head.html), which the browser applies
     to the entry AND its shared chunk however they are imported. MapLibre's
     web worker loads the worker + shared chunks again from a blob: URL, where
     no import map reaches — those two fetches are pinned by the exact version
     in the URL only (HOUSE-STYLE §7).

     A page that already has MapLibre (a bundler, or its own import) sets
     window.maplibregl first; the loader then resolves with that instead of
     importing a second copy. opts.url overrides the pinned URL for testing a
     newer release — the import map must carry its hashes too. */
  M.MAPLIBRE_VERSION = '6.11.2';
  M.MAPLIBRE_URL = 'https://unpkg.com/maplibre-gl@' + M.MAPLIBRE_VERSION + '/dist/maplibre-gl.mjs';

  var _mlLoad = null;
  M.loadMapLibre = function (opts) {
    if (_mlLoad) return _mlLoad;
    if (window.maplibregl && window.maplibregl.Map) {
      _mlLoad = Promise.resolve(window.maplibregl);
    } else {
      _mlLoad = import((opts && opts.url) || M.MAPLIBRE_URL).then(function (ns) {
        window.maplibregl = ns;
        return ns;
      }, function (err) {
        _mlLoad = null;   // let a later call (a Retry button) try again
        throw err;
      });
    }
    return _mlLoad;
  };

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

  /* ── Basemap label corrections (0.20.0) ────────────────────────────────────
     CARTO builds its tiles from OpenStreetMap and serves one dated build for
     weeks, so vandalism that OSM reverts in minutes can sit on every MCO map
     until CARTO rebuilds. On 2026-10-26 build 20261001-03 labelled Townsend
     "Fuck Townsend". correctBasemapLabels() rewrites the text-field of every
     symbol layer so a label that matches a key here exactly shows its value
     instead. watchBasemap() applies it on every style.load, so theme switches
     and retries keep it; a map that loads styles without watchBasemap calls it
     from its own style.load handler.

     Exact whole-label matches only: no patterns and no word filter, so a real
     place name can never be rewritten. When it happens again, add the entry
     here and ship a patch. Idempotent: an already-corrected layer is rebuilt
     from its original expression, not wrapped twice. Legacy "{field}" string
     text-fields are left alone (CARTO's styles use expressions throughout).
     Returns the number of layers rewritten. */
  M.LABEL_CORRECTIONS = {
    'Fuck Townsend': 'Townsend',
  };

  var LABEL_VAR = 'mco_label';

  function correctLabel(expr, table) {
    // A zoom step must stay the top-level expression; correct each output.
    if (Array.isArray(expr) && expr[0] === 'step') {
      var out = expr.slice();
      for (var i = 2; i < out.length; i += 2) out[i] = correctLabel(out[i], table);
      return out;
    }
    if (Array.isArray(expr) && expr[0] === 'let' && expr[1] === LABEL_VAR) expr = expr[2];
    var match = ['match', ['to-string', ['var', LABEL_VAR]]];
    Object.keys(table).forEach(function (k) { match.push(k, table[k]); });
    match.push(['var', LABEL_VAR]);
    return ['let', LABEL_VAR, expr, match];
  }

  M.correctBasemapLabels = function (map, table) {
    table = table || M.LABEL_CORRECTIONS;
    if (!Object.keys(table).length) return 0;
    var style = map.getStyle();
    if (!style || !style.layers) return 0;
    var n = 0;
    style.layers.forEach(function (layer) {
      var field = layer.type === 'symbol' && layer.layout && layer.layout['text-field'];
      if (!Array.isArray(field)) return;
      try {
        map.setLayoutProperty(layer.id, 'text-field', correctLabel(field, table));
        n++;
      } catch (e) {}   // an expression we can't wrap keeps its own label
    });
    return n;
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

  // The clean-URL half (0.8.0): cameraParams(map), or {} when the camera is
  // where a fresh load would put it — so a default view writes no lng/lat/zoom
  // at all. "Where a fresh load would put it" is cameraForBounds(bounds,
  // fitOpts): the same answer fitBounds acts on, so it stays right as the
  // container resizes (a collapsed sidebar means a wider map and a different
  // fit). Pass the SAME bounds/fitOpts as initialCamera and the fit control.
  // Tolerance: 0.02 zoom, 0.01° — under the URL's own precision.
  // Was atDefaultExtent(), copied into three consumers.
  M.cameraParamsIfDefault = function (map, opts) {
    opts = opts || {};
    var bounds = opts.bounds || M.MT_FIT_BOUNDS;
    var fitOpts = opts.fitOpts || M.FIT_OPTS;
    var fo = typeof fitOpts === 'function' ? fitOpts() : fitOpts;
    var want = null;
    try { want = map.cameraForBounds(bounds, fo); } catch (e) {}
    if (want) {
      var wc = maplibregl.LngLat.convert(want.center);
      var c = map.getCenter();
      if (Math.abs(map.getZoom() - want.zoom) < 0.02 &&
          Math.abs(c.lng - wc.lng) < 0.01 && Math.abs(c.lat - wc.lat) < 0.01) {
        return {};
      }
    }
    return M.cameraParams(map);
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
     refresh() inside map.on('load'); returns {refresh, fitZoom, dispose}.

     Hardened in 0.8.0 against two defects mesonet-explorer's local copy
     already guarded:
     - Re-entrancy. An animated fitBounds raises more zoomend events while
       still in flight, each still below fitZoom, so the snap re-fired and
       stuttered. A latch holds from the snap to the next moveend, and a
       0.01 tolerance keeps a settled fit from counting as "below".
     - Chrome-only resizes. A phone's URL bar showing or hiding changes the
       container's HEIGHT only (by well under 120px). fitZoom is recomputed
       but the camera is left alone.
     opts.onBeforeSnap({reason: 'zoom'|'resize'}) returning false vetoes a
     snap: "don't yank the camera while a station detail is open" is app
     policy, not the kit's. */
  var SPRING_EPS = 0.01;
  var CHROME_RESIZE_PX = 120;
  M.installZoomFloor = function (map, opts) {
    opts = opts || {};
    var bounds = opts.bounds || M.MT_FIT_BOUNDS;
    var fitOpts = opts.fitOpts || M.FIT_OPTS;
    var debounceMs = opts.resizeDebounceMs || 200;
    var onBeforeSnap = opts.onBeforeSnap || null;
    var fitZoom;
    var timer = null;
    var springing = false;
    var lastSize = null;

    function compute() {
      var fo = typeof fitOpts === 'function' ? fitOpts() : fitOpts;
      fitZoom = map.cameraForBounds(bounds, fo).zoom;
      var c = map.getContainer();
      lastSize = { w: c.clientWidth, h: c.clientHeight };
    }
    function snapBack(reason) {
      if (onBeforeSnap && onBeforeSnap({ reason: reason }) === false) return;
      var fo = typeof fitOpts === 'function' ? fitOpts() : fitOpts;
      springing = true;
      map.once('moveend', function () { springing = false; });
      map.fitBounds(bounds, Object.assign({}, fo, { animate: !_rm }));
    }
    function below() { return fitZoom !== undefined && map.getZoom() < fitZoom - SPRING_EPS; }
    function onZoomEnd() {
      if (!springing && below()) snapBack('zoom');
    }
    function onResize() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        var c = map.getContainer();
        var chromeOnly = lastSize && c.clientWidth === lastSize.w &&
          Math.abs(c.clientHeight - lastSize.h) < CHROME_RESIZE_PX;
        compute();
        if (!chromeOnly && !springing && below()) snapBack('resize');
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

  /* ── Basemap failure (0.8.0) ───────────────────────────────────────────────
     Every MCO map started its data load from map.on('load'), which never
     fires if the basemap style 404s or hangs: the loading bar spun forever.
     watchBasemap() retries the style, then falls back to blankStyle() (a
     background in --bg-deep, which DOES load, so data layers and boundaries
     still draw on 'style.load'), and shows a persistent notice with Retry.

       MCO.map.watchBasemap(map, {
         styleUrl: MCO.map.cartoStyleUrl,   // what to (re)load; read at retry time
         retries: 1, retryDelayMs: 5000,    // house defaults
         timeoutMs: 15000,                  // a style that never answers counts as failed
         correctLabels: true,               // correctBasemapLabels() on each style.load (0.20.0)
         onFail: function () {},            // after the fallback is in place
       });

     Only errors for the style document itself count (its URL, or any
     …/style.json); a missing tile is not a basemap failure. A good style.load
     re-arms the retries, so a later theme switch gets its own. The notice
     needs mco-core.js (MCO.notice; falls back to MCO.showToast, then to
     nothing — this file stays standalone). Announced once, assertively.
     Returns {retry, dispose}. */
  var CARTO_GLYPHS = 'https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf';

  // A style with nothing but a background in --bg-deep. Keeps CARTO's glyph
  // endpoint so the apps' own label layers (tribal names) don't throw for want
  // of `glyphs`; if that host is down too, labels fail quietly and the rest
  // still draws.
  M.blankStyle = function () {
    var bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-deep').trim() ||
      (isDark() ? '#161b22' : '#f0f2f5');
    return {
      version: 8,
      name: 'mco-blank',
      glyphs: CARTO_GLYPHS,
      sources: {},
      layers: [{ id: 'mco-blank-bg', type: 'background', paint: { 'background-color': bg } }],
    };
  };

  M.watchBasemap = function (map, opts) {
    opts = opts || {};
    var styleUrl = opts.styleUrl || M.cartoStyleUrl;
    var retries = opts.retries != null ? opts.retries : 1;
    var retryDelayMs = opts.retryDelayMs != null ? opts.retryDelayMs : 5000;
    var timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : 15000;
    var left = retries;
    var retryTimer = null;
    var hangTimer = null;
    var notice = null;
    var failed = false;   // on the blank fallback
    var disposed = false;

    function currentUrl() { return typeof styleUrl === 'function' ? styleUrl() : styleUrl; }
    function stripQuery(u) { return String(u || '').split(/[?#]/)[0]; }
    function isStyleError(e) {
      var u = e && e.error && e.error.url;
      if (!u) return false;
      return stripQuery(u) === stripQuery(currentUrl()) || /\/style\.json$/.test(stripQuery(u));
    }
    function armHang() {
      clearTimeout(hangTimer);
      if (timeoutMs > 0) hangTimer = setTimeout(function () { fail(); }, timeoutMs);
    }
    function load() {
      if (disposed) return;
      armHang();
      map.setStyle(currentUrl());
    }
    function fail() {
      clearTimeout(hangTimer);
      if (disposed || failed) return;
      if (left > 0) {
        left--;
        clearTimeout(retryTimer);
        retryTimer = setTimeout(load, retryDelayMs);
        return;
      }
      failed = true;
      map.setStyle(M.blankStyle());
      var text = 'The basemap failed to load, so the map shows data without streets or labels.';
      if (MCO.notice) {
        notice = MCO.notice({
          tone: 'warning', toneLabel: 'Basemap unavailable', text: text,
          container: opts.container || map.getContainer(), place: 'over',
          politeness: 'assertive',   // a load failure (HOUSE-STYLE §5.1)
          action: { label: 'Retry', onClick: retry },
        });
      } else if (MCO.showToast) {
        MCO.showToast(text, 6000);
      }
      if (opts.onFail) opts.onFail();
    }
    function retry() {
      if (notice) { notice.close(); notice = null; }
      failed = false;
      left = retries;
      load();
    }
    function onError(e) { if (isStyleError(e)) fail(); }
    function onStyleLoad() {
      var s = map.getStyle();
      if (s && s.name === 'mco-blank') return;   // our fallback, not a recovery
      if (opts.correctLabels !== false) M.correctBasemapLabels(map);
      clearTimeout(hangTimer);
      left = retries;
      failed = false;
      if (notice) { notice.close(); notice = null; }
    }
    map.on('error', onError);
    map.on('style.load', onStyleLoad);
    if (!map.isStyleLoaded()) armHang();
    else if (opts.correctLabels !== false) M.correctBasemapLabels(map);

    return {
      retry: retry,
      dispose: function () {
        disposed = true;
        clearTimeout(retryTimer);
        clearTimeout(hangTimer);
        map.off('error', onError);
        map.off('style.load', onStyleLoad);
      },
    };
  };

  /* ── Popups & safe content (0.8.0) ─────────────────────────────────────────
     House rule (HOUSE-STYLE §7): popup, tooltip, sheet and table content is
     built with DOM APIs and textContent. setHTML / innerHTML only ever take
     static, author-written strings — never a string with an API value in it,
     escaped or not. popupContent() is the builder:

       popup.setDOMContent(MCO.map.popupContent({
         title: s.name, subtitle: s.station,
         facts: [['Network', s.sub_network], ['Elevation', s.elevation + ' m']],
         actions: [{ label: 'Open dashboard', href: dashUrl }],
       })).addTo(map);

     Values are strings, numbers, or DOM nodes; strings go in as text. An
     href passes through safeUrl() (https only by default) and an action with
     an unsafe URL is dropped rather than rendered. Styled by .mco-popup /
     .mco-facts in mco-theme.css. */
  M.safeUrl = function (u, opts) {
    var schemes = (opts && opts.schemes) || ['https:'];
    try {
      var url = new URL(String(u), location.href);
      return schemes.indexOf(url.protocol) !== -1 ? url.href : null;
    } catch (e) { return null; }
  };

  function appendValue(el, v) {
    if (v == null || v === '') el.textContent = '—';
    else if (typeof v === 'object' && v.nodeType) el.appendChild(v);
    else el.textContent = String(v);
  }

  M.popupContent = function (o) {
    o = o || {};
    var frag = document.createDocumentFragment();
    var root = document.createElement('div');
    root.className = 'mco-popup';
    if (o.title != null) {
      var t = document.createElement('p');
      t.className = 'mco-popup-title';
      appendValue(t, o.title);
      root.appendChild(t);
    }
    if (o.subtitle != null) {
      var st = document.createElement('p');
      st.className = 'mco-popup-sub';
      appendValue(st, o.subtitle);
      root.appendChild(st);
    }
    if (o.facts && o.facts.length) {
      var dl = document.createElement('dl');
      dl.className = 'mco-facts';
      o.facts.forEach(function (f) {
        var row = document.createElement('div');
        var dt = document.createElement('dt');
        var dd = document.createElement('dd');
        appendValue(dt, f[0]);
        appendValue(dd, f[1]);
        row.append(dt, dd);
        dl.appendChild(row);
      });
      root.appendChild(dl);
    }
    var actions = (o.actions || []).map(function (a) {
      var el;
      if (a.href != null) {
        var href = M.safeUrl(a.href);
        if (!href) return null;
        el = document.createElement('a');
        el.href = href;
        if (a.newTab !== false) { el.target = '_blank'; el.rel = 'noopener noreferrer'; }
      } else {
        el = document.createElement('button');
        el.type = 'button';
        if (a.onClick) el.addEventListener('click', a.onClick);
      }
      el.className = 'nav-btn' + (a.primary ? ' is-primary' : '');
      el.textContent = a.label;
      return el;
    }).filter(Boolean);
    if (actions.length) {
      var bar = document.createElement('div');
      bar.className = 'mco-popup-actions';
      actions.forEach(function (el) { bar.appendChild(el); });
      root.appendChild(bar);
    }
    frag.appendChild(root);
    return frag;
  };

  /* ── Cursor tooltip (0.8.0) ────────────────────────────────────────────────
     The pointer-following .mco-tooltip over map features: the element, the
     mousemove → queryRenderedFeatures dispatcher, cursor+14 positioning
     (flipped at the viewport edge), cursor: pointer, and mouseleave cleanup.
     Was the same ~30 lines in every map app.

       MCO.map.initCursorTooltip(map, {
         layers: ['stations-dots'],          // queried in order; missing layers skipped
         render: function (f) {              // null/undefined → hide
           return { name: f.properties.name, sub: f.properties.id, line: '42 °F' };
         },
       });

     `line` may be a string or an array of strings. Everything is set with
     textContent. The tooltip is aria-hidden decoration (HOUSE-STYLE §5.8):
     its content must also reach AT through the sr-table twin or a popup.
     Hover-only by nature — a touch tap gets nothing here; route taps to a
     popup or sheet. Returns {element, hide, dispose}. */
  M.initCursorTooltip = function (map, opts) {
    opts = opts || {};
    var layers = opts.layers || [];
    var render = opts.render;
    var el = opts.element;
    var made = false;
    if (!el) {
      el = document.createElement('div');
      el.className = 'mco-tooltip';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
      made = true;
    }
    var PAD = 14;
    var shownFor = null;

    function hide() {
      el.classList.remove('visible');
      shownFor = null;
      map.getCanvas().style.cursor = '';
    }
    function fill(r) {
      el.textContent = '';
      var add = function (cls, text) {
        if (text == null || text === '') return;
        var s = document.createElement('span');
        s.className = cls;
        s.textContent = String(text);
        el.appendChild(s);
      };
      add('tooltip-name', r.name);
      add('tooltip-sub', r.sub);
      [].concat(r.line == null ? [] : r.line).forEach(function (l) { add('tooltip-val', l); });
    }
    function onMove(e) {
      var present = layers.filter(function (id) { return map.getLayer(id); });
      var f = present.length ? map.queryRenderedFeatures(e.point, { layers: present })[0] : null;
      var r = f ? render(f) : null;
      if (!r) { hide(); return; }
      map.getCanvas().style.cursor = 'pointer';
      var key = f.layer.id + ':' + (f.id != null ? f.id : JSON.stringify(f.properties));
      if (key !== shownFor) { fill(r); shownFor = key; }
      el.classList.add('visible');
      var cx = e.originalEvent.clientX, cy = e.originalEvent.clientY;
      var x = cx + PAD, y = cy + PAD;
      if (x + el.offsetWidth > window.innerWidth - 8) x = cx - el.offsetWidth - PAD;
      if (y + el.offsetHeight > window.innerHeight - 8) y = cy - el.offsetHeight - PAD;
      el.style.left = Math.max(4, x) + 'px';
      el.style.top = Math.max(4, y) + 'px';
    }
    map.on('mousemove', onMove);
    map.on('mouseout', hide);     // the pointer left the canvas

    return {
      element: el,
      hide: hide,
      dispose: function () {
        map.off('mousemove', onMove);
        map.off('mouseout', hide);
        hide();
        if (made) el.remove();
      },
    };
  };

  /* ── Station markers (0.9.0; network shapes deprecated 0.21.0) ─────────────
     HOUSE-STYLE §7 (0.21.0): station markers carry NO network encoding.
     HydroMet and AgriMet draw the same; networks are filters (chips) and
     detail text. stationPaint() is the one circle paint for every station:
       map.addLayer({ id: 'stations', type: 'circle', source: 's',
         filter: MCO.map.colocation.ANCHOR_ONLY,
         paint: MCO.map.stationPaint({ fill: ['get', 'color'] }) });
     Its defaults are markerPaint('hydromet')'s: the radius ramp, the
     HydroMet color, and a 1.2px --dot-stroke edge. Pass `fill` (a color or
     expression) to encode a data value. Paints read the theme when called:
     re-call after a theme switch, like every paint.

     DEPRECATED (0.21.0, kept working until 1.0.0): markerPaint(network)'s
     per-network shapes (circle / hollow / ring in MCO.palette.NETWORK
     colors) and colocatedHaloPaint()'s second-network ring. New code uses
     stationPaint(); colocated sites are one marker with a count badge and a
     spider (MCO.map.colocation, below), not a halo with click-cycling.

     selectionPaint() is the selected-station ring, from --selection-ring
     read at paint time (never a literal — explorer's '#5aaee8' is the dark
     value and wrong on light). focusPaint() is the keyboard-focus halo, in
     --accent-line, distinct from selection. hitPaint() is an invisible
     layer at least 22px across on touch, for a tappable target. */
  function token(name, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }
  function themeName() { return document.documentElement.dataset.theme || 'dark'; }
  function networkOf(key) {
    if (!MCO.palette || !MCO.palette.network) throw new Error('MCO.map.markerPaint needs palette/mco-palette.js');
    var n = MCO.palette.network(key, themeName());
    if (!n) throw new Error('MCO.map.markerPaint: unknown network ' + key);
    return n;
  }
  var STATION_RADIUS = ['interpolate', ['linear'], ['zoom'], 4, 3.5, 10, 7];
  M.stationPaint = function (opts) {
    opts = opts || {};
    var hm = MCO.palette && MCO.palette.network && MCO.palette.network('hydromet', themeName());
    return {
      'circle-radius': opts.radius != null ? opts.radius : STATION_RADIUS,
      // Tol bright blue, MCO.palette.NETWORK.hydromet: data-encoding (§6),
      // the fallback for a page that has not loaded the palette.
      'circle-color': opts.fill != null ? opts.fill : (hm ? hm.color : '#4477AA'),
      'circle-stroke-color': opts.stroke != null ? opts.stroke : token('--dot-stroke', '#ffffff'),
      'circle-stroke-width': opts.strokeWidth != null ? opts.strokeWidth : 1.2,
    };
  };
  // Deprecated shapes (0.21.0): use stationPaint(). Kept so existing layers draw.
  M.markerPaint = function (network, opts) {
    opts = opts || {};
    var n = networkOf(network);
    var r = opts.radius != null ? opts.radius : STATION_RADIUS;
    if (n.shape === 'hollow') {
      return { 'circle-radius': r, 'circle-color': opts.fill || token('--bg-surface', '#1e2530'),
        'circle-stroke-color': n.color, 'circle-stroke-width': 2.5 };
    }
    if (n.shape === 'ring') {
      return { 'circle-radius': r, 'circle-color': opts.fill || 'rgba(0,0,0,0)',
        'circle-stroke-color': n.color, 'circle-stroke-width': 1.5 };
    }
    return { 'circle-radius': r, 'circle-color': opts.fill || n.color,
      'circle-stroke-color': token('--dot-stroke', '#ffffff'), 'circle-stroke-width': 1.2 };
  };
  function ringPaint(color, opts) {
    opts = opts || {};
    return { 'circle-radius': opts.radius != null ? opts.radius : ['interpolate', ['linear'], ['zoom'], 4, 6.5, 10, 11],
      'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': color, 'circle-stroke-width': opts.width || 2.5 };
  }
  M.selectionPaint = function (opts) { return ringPaint(token('--selection-ring', '#5aaee8'), opts); };
  M.focusPaint = function (opts) {
    opts = opts || {};
    return ringPaint(token('--accent-line', '#5aaee8'), { radius: opts.radius != null ? opts.radius
      : ['interpolate', ['linear'], ['zoom'], 4, 9, 10, 14], width: opts.width || 2 });
  };
  M.hitPaint = function (opts) {
    opts = opts || {};
    return { 'circle-radius': opts.radius != null ? opts.radius : 11, 'circle-color': 'rgba(0,0,0,0)' };
  };
  // DEPRECATED (0.21.0): colocated sites are a count badge + spider
  // (MCO.map.colocation). Outer ring in the second network's color; prop
  // names the feature property holding that network's key ('net2' = 'agrimet').
  M.colocatedHaloPaint = function (opts) {
    opts = opts || {};
    var prop = opts.prop || 'net2';
    var match = ['match', ['downcase', ['to-string', ['get', prop]]]];
    ['hydromet', 'agrimet', 'cooperator'].forEach(function (k) { match.push(k, networkOf(k).color); });
    match.push('rgba(0,0,0,0)');
    return { 'circle-radius': opts.radius != null ? opts.radius : ['interpolate', ['linear'], ['zoom'], 4, 6, 10, 10.5],
      'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': match, 'circle-stroke-width': 2 };
  };

  /* ── Colocated stations: count badge + spider (0.21.0) ─────────────────────
     An AgriMet and a HydroMet at one site are ONE marker with a count badge
     ("2"); hovering it (or tapping, on touch) fans the members out around it
     as a "spider". Extracted from mesonet-status, whose copy maintenance and
     explorer share near-verbatim. The app keeps its own GeoJSON source,
     feature properties, layers and paints, popups and sheets; this module
     groups, writes the source, owns the two spider sources, and runs the
     hover / click / Esc behaviour.

       var coloc = MCO.map.colocation(map, {
         source: 'stations',                      // the app's GeoJSON source id
         id: function (s) { return s.station; },  // default
         lngLat: function (s) { return [s.longitude, s.latitude]; },  // default
         rank: function (s) { return s.sub_network === 'HydroMet' ? 0 : 1; },  // lower = anchor
         visible: function (s) { return activeNetworks.has(s.sub_network); },
         properties: function (s) { return { station: s.station, name: s.name, color: … }; },
         anchorLayers: ['stations', 'stations-badge', 'stations-badge-disc'],
         spiderLayers: ['spider'],
         onSelect: function (id, info) { openSheet(id); },   // a station was clicked or tapped
         onEmpty: function () { closeSheet(); },             // a click hit no station
       });
       // In style.load, before the app adds its layers:
       coloc.addSources();                 // 'mco-spider' + 'mco-spider-lines'
       map.addLayer({ id: 'spider-lines', type: 'line', source: coloc.spiderLinesSource,
                      paint: MCO.map.colocation.spiderLinePaint() });
       map.addLayer({ id: 'stations', type: 'circle', source: 'stations',
                      filter: MCO.map.colocation.ANCHOR_ONLY, paint: MCO.map.stationPaint() });
       MCO.map.colocation.badgeLayers({ id: 'stations-badge', source: 'stations' })
         .forEach(function (l) { map.addLayer(l); });
       map.addLayer({ id: 'spider', type: 'circle', source: coloc.spiderSource,
                      paint: MCO.map.stationPaint() });
       coloc.setData(stations);            // or coloc.refresh() to re-group the same list
       → {setData, refresh, addSources, open, close, isOpen, openBucket,
          members, siblings, info, collection, spiderSource, spiderLinesSource, dispose}

     Grouping: stations whose lat/lon agree to PRECISION (4) decimals (~11 m
     in Montana) share a bucket. Only visible() stations are members, so
     hiding a network turns a pair into a plain dot and promotes the other
     to anchor. Members sort by rank(), then id. Every emitted feature gets
     colocationCount, colocationIndex (0 = anchor), bucket and colocationId
     on top of the app's properties; app layers show anchors only
     (ANCHOR_ONLY). Hidden stations are left out of the source unless
     includeHidden: true, which emits them as singles (count 1, index 0) for
     an app that hides them by layer filter instead (explorer).

     Spider: the members other than the anchor sit on a circle radiusPx (26)
     from the anchor in screen pixels, first at the top, rebuilt on every
     frame the camera moves. Feet carry the app's properties with
     colocationCount 1 and colocationIndex 0, as status's did.

     Interaction (interactive: false turns it off and leaves open/close):
     - Hover (mouse only): an anchor opens its spider; leaving every station
       layer closes it after graceMs (250), so the cursor can travel to a foot.
     - Click/tap: a foot → onSelect(foot). A stacked anchor → open the spider
       AND onSelect(anchor), as status does: on touch the first tap both fans
       the site out and opens the anchor's detail, so nothing needs hover.
       anchorClick: 'spider' makes a first click only fan it out. A plain dot
       closes any spider and → onSelect. Empty map → close + onEmpty.
     - Esc closes the spider (MCO.escStack when mco-core is loaded, so it
       takes its turn with sheets and dialogs).
     A11y: the canvas spider is pointer-only. The keyboard and screen-reader
     path is the app's selectable MCO.srTable twin (every station, colocated
     or not, is a row) and an "Also at this site" list in the station sheet,
     built from coloc.siblings(id). */
  var C = {};
  C.PRECISION = 4;
  C.RADIUS_PX = 26;
  C.GRACE_MS = 250;
  C.bucketKey = function (lat, lon, precision) {
    var p = precision != null ? precision : C.PRECISION;
    return Number(lat).toFixed(p) + ',' + Number(lon).toFixed(p);
  };
  C.ANCHOR_ONLY = ['==', ['get', 'colocationIndex'], 0];
  C.STACKED = ['>', ['get', 'colocationCount'], 1];

  function defaultId(s) { return s.station; }
  function defaultLngLat(s) { return [s.longitude, s.latitude]; }
  function validLngLat(ll) {
    return ll && typeof ll[0] === 'number' && typeof ll[1] === 'number' && isFinite(ll[0]) && isFinite(ll[1]);
  }

  // Pure grouping, for an app that builds its own features:
  //   var g = MCO.map.colocation.group(stations, {rank, visible});
  //   g.buckets: Map bucket → members (anchor first); g.byId: Map id → {bucket, index, count}
  C.group = function (items, opts) {
    opts = opts || {};
    var id = opts.id || defaultId;
    var lngLat = opts.lngLat || defaultLngLat;
    var rank = opts.rank || function () { return 0; };
    var visible = opts.visible || function () { return true; };
    var buckets = new Map();
    var byId = new Map();
    (items || []).forEach(function (s) {
      var ll = lngLat(s);
      if (!validLngLat(ll) || !visible(s)) return;
      var k = C.bucketKey(ll[1], ll[0], opts.precision);
      var arr = buckets.get(k);
      if (!arr) { arr = []; buckets.set(k, arr); }
      arr.push(s);
    });
    buckets.forEach(function (members, k) {
      members.sort(function (a, b) {
        return (rank(a) - rank(b)) || String(id(a)).localeCompare(String(id(b)));
      });
      members.forEach(function (s, i) {
        byId.set(String(id(s)), { bucket: k, index: i, count: members.length });
      });
    });
    return { buckets: buckets, byId: byId };
  };

  // Badge filter: stacked anchors only, AND-ed with an app filter if given.
  C.badgeFilter = function (extra) {
    var f = ['all', C.ANCHOR_ONLY, C.STACKED];
    if (extra) f.push(extra);
    return f;
  };

  // The count badge: a disc in --accent (fill-only) edged in --dot-stroke,
  // and the count in --text-on-accent, which CI holds at >= 4.5:1 on --accent
  // in every theme (tools/check-contrast.mjs). Both are offset `offset` px
  // (default up-right of the dot) and never collide away. Returns two layer
  // specs, disc first: add both, in order, above the station layer, and list
  // both ids in anchorLayers so a click on the badge opens the site. Tokens
  // are read at call time: re-add on style.load, like every paint. The font
  // stack is the one TRIBAL_LABEL_LAYOUT uses (served by CARTO's glyphs).
  C.badgeLayers = function (opts) {
    opts = opts || {};
    var id = opts.id || 'stations-badge';
    var off = opts.offset || [8, -8];
    var filter = C.badgeFilter(opts.filter);
    var disc = {
      id: id + '-disc', type: 'circle', source: opts.source, filter: filter,
      paint: {
        'circle-radius': opts.radius != null ? opts.radius : 7,
        'circle-color': token('--accent', '#1a6faf'),
        'circle-stroke-color': token('--dot-stroke', '#ffffff'),
        'circle-stroke-width': 1,
        'circle-translate': off,
      },
    };
    var text = {
      id: id, type: 'symbol', source: opts.source, filter: filter,
      layout: {
        'text-field': ['to-string', ['get', 'colocationCount']],
        'text-font': ['Montserrat SemiBold', 'Open Sans Bold'],
        'text-size': opts.textSize || 10,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': token('--text-on-accent', '#ffffff'),
        'text-translate': off,
      },
    };
    if (opts.minzoom != null) { disc.minzoom = opts.minzoom; text.minzoom = opts.minzoom; }
    return [disc, text];
  };

  // Connector lines from anchor to feet, in --dot-stroke (the markers' edge).
  C.spiderLinePaint = function () {
    return { 'line-color': token('--dot-stroke', '#ffffff'), 'line-width': 1.2, 'line-opacity': 0.65 };
  };

  function emptyFC() { return { type: 'FeatureCollection', features: [] }; }

  M.colocation = function (map, opts) {
    opts = opts || {};
    var id = opts.id || defaultId;
    var lngLat = opts.lngLat || defaultLngLat;
    var props = opts.properties || function (s) { return Object.assign({}, s); };
    var spiderSource = opts.spiderSource || 'mco-spider';
    var linesSource = opts.spiderLinesSource || 'mco-spider-lines';
    var radiusPx = opts.radiusPx != null ? opts.radiusPx : C.RADIUS_PX;
    var graceMs = opts.graceMs != null ? opts.graceMs : C.GRACE_MS;
    var anchorLayers = opts.anchorLayers || [];
    var spiderLayers = opts.spiderLayers || [];
    var touchMq = window.matchMedia('(hover: none)');

    var items = [];
    var itemById = new Map();
    var grouped = { buckets: new Map(), byId: new Map() };
    var lastFC = emptyFC();
    var openKey = null;
    var closeTimer = null;
    var raf = 0;
    var hovered = false;
    var disposed = false;

    function isTouch() { return MCO.viewport ? MCO.viewport.isTouch() : touchMq.matches; }
    function sid(s) { return String(id(s)); }

    function feature(s, coords, extra) {
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: coords },
        properties: Object.assign({}, props(s), extra),
      };
    }
    function collection() {
      var features = [];
      items.forEach(function (s) {
        var ll = lngLat(s);
        if (!validLngLat(ll)) return;
        var key = sid(s);
        var g = grouped.byId.get(key);
        if (g) {
          features.push(feature(s, [ll[0], ll[1]], {
            colocationCount: g.count, colocationIndex: g.index, bucket: g.bucket, colocationId: key,
          }));
        } else if (opts.includeHidden) {
          features.push(feature(s, [ll[0], ll[1]], {
            colocationCount: 1, colocationIndex: 0,
            bucket: C.bucketKey(ll[1], ll[0], opts.precision), colocationId: key,
          }));
        }
      });
      return { type: 'FeatureCollection', features: features };
    }

    function addSources() {
      if (!map.getSource(spiderSource)) map.addSource(spiderSource, { type: 'geojson', data: emptyFC() });
      if (!map.getSource(linesSource)) map.addSource(linesSource, { type: 'geojson', data: emptyFC() });
    }
    function setData(next) {
      if (next) {
        items = Array.prototype.slice.call(next);
        itemById = new Map();
        items.forEach(function (s) { itemById.set(sid(s), s); });
      }
      grouped = C.group(items, {
        id: id, lngLat: lngLat, rank: opts.rank, visible: opts.visible, precision: opts.precision,
      });
      lastFC = collection();
      var src = opts.source && map.getSource(opts.source);
      if (src) src.setData(lastFC);
      if (openKey != null) rebuild();   // the open site's membership may have changed
      return lastFC;
    }

    function rebuild() {
      if (openKey == null) return;
      var members = grouped.buckets.get(openKey) || [];
      if (members.length <= 1) { close(); return; }
      var feetSrc = map.getSource(spiderSource);
      var lineSrc = map.getSource(linesSource);
      if (!feetSrc || !lineSrc) return;   // style mid-swap; addSources() + refresh() restore it
      var all = lngLat(members[0]);
      var a = map.project(all);
      var others = members.slice(1);
      var feet = [];
      var lines = [];
      others.forEach(function (s, i) {
        var theta = (i / others.length) * 2 * Math.PI - Math.PI / 2;   // first foot at the top
        var ll = map.unproject([a.x + radiusPx * Math.cos(theta), a.y + radiusPx * Math.sin(theta)]);
        feet.push(feature(s, [ll.lng, ll.lat], {
          colocationCount: 1, colocationIndex: 0, bucket: openKey, colocationId: sid(s),
        }));
        lines.push({
          type: 'Feature', properties: {},
          geometry: { type: 'LineString', coordinates: [[all[0], all[1]], [ll.lng, ll.lat]] },
        });
      });
      feetSrc.setData({ type: 'FeatureCollection', features: feet });
      lineSrc.setData({ type: 'FeatureCollection', features: lines });
    }

    function onEsc() { close(); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    // open(bucketOrId): a bucket key, or a station id whose site to fan out.
    function open(k) {
      if (k == null) return false;
      k = String(k);
      if (!grouped.buckets.has(k) && grouped.byId.has(k)) k = grouped.byId.get(k).bucket;
      var members = grouped.buckets.get(k);
      if (!members || members.length <= 1) return false;
      cancelClose();
      var was = openKey;
      openKey = k;
      rebuild();
      if (MCO.escStack) MCO.escStack.push(onEsc, map.getContainer());
      else if (was == null) document.addEventListener('keydown', onKey);
      if (opts.onSpider) opts.onSpider(true, members.slice());
      return true;
    }
    function close() {
      cancelClose();
      if (openKey == null) return;
      openKey = null;
      if (MCO.escStack) MCO.escStack.pop(onEsc);
      else document.removeEventListener('keydown', onKey);
      var f = map.getSource(spiderSource);
      var l = map.getSource(linesSource);
      if (f) f.setData(emptyFC());
      if (l) l.setData(emptyFC());
      if (opts.onSpider) opts.onSpider(false, []);
    }
    function scheduleClose() {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(function () { closeTimer = null; close(); }, graceMs);
    }
    function cancelClose() { clearTimeout(closeTimer); closeTimer = null; }

    // Interaction.
    function present(ids) { return ids.filter(function (l) { return map.getLayer(l); }); }
    function isFootLayer(lid) { return spiderLayers.indexOf(lid) !== -1; }
    function isAnchorLayer(lid) { return anchorLayers.indexOf(lid) !== -1; }
    function hit(point) {
      var layers = present(spiderLayers.concat(anchorLayers));
      if (!layers.length) return null;
      var feats = map.queryRenderedFeatures(point, { layers: layers });
      if (!feats.length) return null;
      // A foot wins over the anchor it sits beside.
      return feats.filter(function (f) { return isFootLayer(f.layer.id); })[0] || feats[0];
    }
    function select(f, e, foot) {
      var key = f.properties.colocationId;
      if (opts.onSelect) {
        opts.onSelect(key, {
          item: itemById.get(key), feature: f, foot: foot,
          lngLat: f.geometry.coordinates.slice(), originalEvent: e && e.originalEvent,
        });
      }
    }
    function onClick(e) {
      var f = hit(e.point);
      if (!f) { close(); if (opts.onEmpty) opts.onEmpty(e); return; }
      var p = f.properties;
      if (isFootLayer(f.layer.id)) { cancelClose(); select(f, e, true); return; }
      if (p.colocationCount > 1) {
        var was = openKey === p.bucket;
        if (!was) open(p.bucket);
        else cancelClose();
        if (opts.anchorClick === 'spider' && !was) return;
        select(f, e, false);
        return;
      }
      close();
      select(f, e, false);
    }
    // Touch browsers synthesize a mousemove on tap: hover stays mouse-only.
    function onMove(e) {
      if (opts.hover === false || isTouch()) return;
      var f = hit(e.point);
      if (f) {
        cancelClose();
        hovered = true;
        var p = f.properties;
        if (isAnchorLayer(f.layer.id) && p.colocationCount > 1 && openKey !== p.bucket) open(p.bucket);
      } else if (hovered) {
        hovered = false;
        if (openKey != null) scheduleClose();
      }
    }
    function onLeave() {
      if (isTouch()) return;
      hovered = false;
      if (openKey != null) scheduleClose();
    }
    function onCamera() {
      if (openKey == null || raf) return;
      raf = requestAnimationFrame(function () { raf = 0; rebuild(); });
    }

    var interactive = opts.interactive !== false;
    if (interactive) {
      map.on('click', onClick);
      map.on('mousemove', onMove);
      map.getCanvas().addEventListener('mouseleave', onLeave);
    }
    map.on('move', onCamera);

    function resolveKey(k) {
      k = String(k);
      if (!grouped.buckets.has(k) && grouped.byId.has(k)) k = grouped.byId.get(k).bucket;
      return k;
    }
    return {
      setData: setData,
      refresh: function () { return setData(); },
      addSources: addSources,
      open: open,
      close: close,
      isOpen: function () { return openKey != null; },
      openBucket: function () { return openKey; },
      // members(bucketOrId) → the site's visible members, anchor first.
      members: function (k) { return (grouped.buckets.get(resolveKey(k)) || []).slice(); },
      // siblings(id) → the other visible stations at that station's site.
      siblings: function (key) {
        var g = grouped.byId.get(String(key));
        if (!g) return [];
        return grouped.buckets.get(g.bucket).filter(function (s) { return sid(s) !== String(key); });
      },
      // info(id) → {bucket, index, count} or null (hidden or unknown).
      info: function (key) {
        var g = grouped.byId.get(String(key));
        return g ? { bucket: g.bucket, index: g.index, count: g.count } : null;
      },
      collection: function () { return lastFC; },
      spiderSource: spiderSource,
      spiderLinesSource: linesSource,
      dispose: function () {
        if (disposed) return;
        disposed = true;
        close();
        cancelAnimationFrame(raf);
        if (interactive) {
          map.off('click', onClick);
          map.off('mousemove', onMove);
          map.getCanvas().removeEventListener('mouseleave', onLeave);
        }
        map.off('move', onCamera);
      },
    };
  };
  Object.keys(C).forEach(function (k) { M.colocation[k] = C[k]; });

  /* ── Fly to a station, then open its detail (0.21.0) ───────────────────────
     The ?station= deep link, search pick and sr-table row all do this. The
     apps' copies flew and opened on the first moveend, which can fire before
     the camera arrives (another camera move ending, a zoom-floor snap): the
     audit saw deep links that zoomed but opened nothing.

       MCO.map.flyToAndOpen(map, {
         center: [s.longitude, s.latitude],
         zoom: 11,                       // never zooms OUT: max(zoom, current)
         ensureVisible: function () {},  // first: e.g. re-enable a hidden network chip
         open: function () { openSheet(s.station); },
         signal: ac.signal,              // optional AbortSignal: no open() once aborted
         // speed (1.4), padding (passed to flyTo), inset (16px viewport margin
         // for "in view"), settleMs (2000), timeoutMs (10000)
       }).then(function (opened) { … });   // false when aborted or superseded

     1. ensureVisible().
     2. If center is already in view at >= zoom, open() now and don't move.
     3. Otherwise flyTo, or jumpTo under reduced motion (the live gate).
     4. open() once the map is idle (or its tiles are loaded at moveend) with
        center inside the viewport. Fallbacks, so a deep link always opens:
        settleMs after the flight ends, timeoutMs overall.
     A newer call on the same map supersedes a pending one. */
  var _flights = new WeakMap();
  M.flyToAndOpen = function (map, o) {
    o = o || {};
    var prev = _flights.get(map);
    if (prev) prev.cancel();
    return new Promise(function (resolve) {
      var done = false;
      var settleTimer = null;
      var hardTimer = null;
      var inset = o.inset != null ? o.inset : 16;
      var flight = { cancel: function () { finish(false); } };
      _flights.set(map, flight);

      function inView() {
        var p = map.project(o.center);
        var c = map.getContainer();
        return p.x >= inset && p.y >= inset && p.x <= c.clientWidth - inset && p.y <= c.clientHeight - inset;
      }
      function cleanup() {
        clearTimeout(settleTimer);
        clearTimeout(hardTimer);
        map.off('idle', onIdle);
        map.off('moveend', onMoveEnd);
        if (o.signal) o.signal.removeEventListener('abort', onAbort);
        if (_flights.get(map) === flight) _flights.delete(map);
      }
      function finish(ok) {
        if (done) return;
        done = true;
        cleanup();
        if (ok && o.open) {
          try { o.open(); } catch (e) { console.error(e); }
        }
        resolve(ok);
      }
      function onAbort() { finish(false); }
      function onIdle() { if (!map.isMoving() && inView()) finish(true); }
      function onMoveEnd() {
        if (map.isMoving()) return;
        if (map.loaded() && inView()) { finish(true); return; }
        clearTimeout(settleTimer);
        settleTimer = setTimeout(function () { finish(true); }, o.settleMs != null ? o.settleMs : 2000);
      }

      if (o.signal) {
        if (o.signal.aborted) { finish(false); return; }
        o.signal.addEventListener('abort', onAbort);
      }
      if (o.ensureVisible) {
        try { o.ensureVisible(); } catch (e) { console.error(e); }
      }
      if (done) return;   // ensureVisible may have started another flight
      var target = o.zoom != null ? o.zoom : map.getZoom();
      if (inView() && map.getZoom() >= target - 0.01) { finish(true); return; }

      var cam = { center: o.center, zoom: Math.max(target, map.getZoom()) };
      if (o.padding != null) cam.padding = o.padding;
      hardTimer = setTimeout(function () { finish(true); }, o.timeoutMs != null ? o.timeoutMs : 10000);
      if (_rm) {
        map.jumpTo(cam);                // its move events fire synchronously
        if (map.loaded() && inView()) { finish(true); return; }
        map.on('idle', onIdle);
        map.on('moveend', onMoveEnd);
        map.triggerRepaint();           // make sure an 'idle' follows
      } else {
        map.flyTo(Object.assign({ speed: o.speed || 1.4 }, cam));
        map.on('idle', onIdle);
        map.on('moveend', onMoveEnd);
      }
    });
  };

  /* ── Hillshade ─────────────────────────────────────────────────────────────
     Live-shaded topography from elevation data — the treatment that finally
     works in every theme, because the colors are derived per theme rather
     than baked into a raster. Chosen 2026-08 over Esri World Hillshade
     (dark variant grays out the dark basemap) and USGS 3DEP (light-only,
     US-only). House shading method: 'igor' (subtle, overlay-friendly).
     Layer order: basemap → hillshade → boundaries → data. */

  // Keyless global DEM: AWS Terrain Tiles (Mapzen), terrarium encoding.
  M.TERRARIUM_DEM = {
    type: 'raster-dem', tileSize: 256, maxzoom: 15, encoding: 'terrarium',
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    attribution: 'Terrain: Mapzen/AWS Open Data',
  };

  // Themed hillshade paint. On dark themes the basemap is already dark, so
  // the HIGHLIGHTS carry the relief (cool-tinted to sit with the tokens) and
  // exaggeration runs higher; light themes use soft neutral shadows + white
  // highlights at lower exaggeration. House defaults: 0.70 dark / 0.50 light
  // / 0.80 high-contrast.
  M.hillshadePaints = function (opts) {
    opts = opts || {};
    var theme = document.documentElement.dataset.theme;
    var hc = theme === 'high-contrast';
    var dark = theme !== 'light';
    var exag = opts.exaggeration != null ? opts.exaggeration
      : (hc ? 0.8 : dark ? 0.7 : 0.5);
    var p = dark ? {
      'hillshade-exaggeration': exag,
      'hillshade-shadow-color': hc ? 'rgba(0,0,0,0.95)' : 'rgba(0,0,0,0.9)',
      'hillshade-highlight-color': hc ? 'rgba(215,235,255,0.55)' : 'rgba(165,195,230,0.42)',
      'hillshade-accent-color': hc ? 'rgba(140,190,240,0.30)' : 'rgba(100,150,200,0.22)',
    } : {
      'hillshade-exaggeration': exag,
      'hillshade-shadow-color': 'rgba(55,65,80,0.55)',
      'hillshade-highlight-color': 'rgba(255,255,255,0.78)',
      'hillshade-accent-color': 'rgba(90,100,120,0.22)',
    };
    var method = 'method' in opts ? opts.method : 'igor';
    if (method) p['hillshade-method'] = method;
    return p;
  };

  // First symbol (label) layer of the current basemap style. Anything that
  // should sit UNDER the place labels — hillshade, rasters, fills — gets
  // inserted before this layer; custom layers otherwise land on top of the
  // whole basemap, labels included.
  M.firstSymbolLayerId = function (map) {
    var layers = (map.getStyle() || {}).layers || [];
    for (var i = 0; i < layers.length; i++) {
      if (layers[i].type === 'symbol') return layers[i].id;
    }
    return undefined;
  };

  // One-line topography. By default it slots BENEATH the basemap's labels
  // (firstSymbolLayerId) so place names stay legible; pass beforeId to
  // override. Add it in your addCustomLayers() so boundaries and data stack
  // above it; like every custom layer, re-add after map.setStyle() — the
  // paints re-derive from the current theme automatically.
  M.addHillshade = function (map, opts) {
    opts = opts || {};
    var sourceId = opts.sourceId || 'mco-dem';
    var layerId = opts.layerId || 'mco-hillshade';
    var before = 'beforeId' in opts ? opts.beforeId : M.firstSymbolLayerId(map);
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, opts.source || M.TERRARIUM_DEM);
    }
    var layer = {
      id: layerId, type: 'hillshade', source: sourceId,
      paint: M.hillshadePaints(opts),
    };
    try {
      map.addLayer(layer, before);
    } catch (e) {
      // hillshade-method needs MapLibre ≥ 5.2 — fall back to default shading.
      delete layer.paint['hillshade-method'];
      map.addLayer(layer, before);
    }
    return layerId;
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
      tribalFill: { 'fill-color': dark ? '#b88a5e' : '#9b6b3e', 'fill-opacity': dark ? 0.18 : 0.10 },
      tribalLine: { 'line-color': dark ? '#d6a06f' : '#7a4f24', 'line-width': 1, 'line-opacity': dark ? 0.65 : 0.55 },
      tribalLabelPaint: {
        'text-color': dark ? '#d6a06f' : '#6a4520',
        'text-halo-color': dark ? '#161b22' : '#ffffff',
        'text-halo-width': 1.4, 'text-halo-blur': 0.3,
      },
    };
  };

  // Symbol layout for tribal-nation labels: Census names shortened to common
  // usage. Font stack exists in the CARTO basemap glyph set: CARTO stopped
  // serving 'Open Sans Semibold' (404, 2026-10-22), so this matches the bold
  // label face CARTO's own dark-matter/positron/voyager styles use.
  // MapLibre requests the whole stack as one URL; check it returns 200.
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
    'text-font': ['Montserrat SemiBold', 'Open Sans Bold'],
    'text-size': ['interpolate', ['linear'], ['zoom'], 7, 10, 10, 13, 13, 16],
    'text-letter-spacing': 0.05, 'text-max-width': 8, 'text-padding': 2,
    'text-allow-overlap': false, 'symbol-placement': 'point',
  };
})();
