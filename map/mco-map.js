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
      clearTimeout(hangTimer);
      left = retries;
      failed = false;
      if (notice) { notice.close(); notice = null; }
    }
    map.on('error', onError);
    map.on('style.load', onStyleLoad);
    if (!map.isStyleLoaded()) armHang();

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

  /* ── Station markers (0.9.0) ───────────────────────────────────────────────
     HOUSE-STYLE §7: network = SHAPE + color, data value = fill. Shape
     survives grayscale and every CVD type. Network colors come from
     MCO.palette.NETWORK (palette/mco-palette.js — load it first), per theme
     and contrast-tested against both basemaps.
       map.addLayer({ id: 'agrimet', type: 'circle', source: 's',
         filter: ['==', ['get', 'net'], 'AgriMet'],
         paint: MCO.map.markerPaint('agrimet', { radius: 6 }) });
     Shapes: circle (filled, --dot-stroke edge) · hollow (--bg-surface fill,
     thick colored ring) · ring (no fill, thin colored ring). Pass `fill` (a
     color or expression) to encode a data value inside a circle. Paints read
     the theme when called: re-call after a theme switch, like every paint.

     selectionPaint() is the selected-station ring, from --selection-ring
     read at paint time (never a literal — explorer's '#5aaee8' is the dark
     value and wrong on light). focusPaint() is the keyboard-focus halo, in
     --accent-line, distinct from selection. hitPaint() is an invisible
     layer at least 22px across on touch, for a tappable target.

     Co-located stations (§7): up to 3 merge into one feature drawn with
     colocatedHaloPaint() — an outer ring in the second network's color —
     and a click cycles through them ("1 of 2: Bozeman AgriMet"), reachable
     by keyboard through the selectable MCO.srTable twin. Dense clusters keep
     the app's badge + spider; the badge is --text-on-accent on --accent,
     and the spider closes on Esc (MCO.overlay). */
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
  M.markerPaint = function (network, opts) {
    opts = opts || {};
    var n = networkOf(network);
    var r = opts.radius != null ? opts.radius : ['interpolate', ['linear'], ['zoom'], 4, 3.5, 10, 7];
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
  // Outer ring in the second network's color; prop names the feature
  // property holding that network's key (e.g. 'net2' = 'agrimet').
  M.colocatedHaloPaint = function (opts) {
    opts = opts || {};
    var prop = opts.prop || 'net2';
    var match = ['match', ['downcase', ['to-string', ['get', prop]]]];
    ['hydromet', 'agrimet', 'cooperator'].forEach(function (k) { match.push(k, networkOf(k).color); });
    match.push('rgba(0,0,0,0)');
    return { 'circle-radius': opts.radius != null ? opts.radius : ['interpolate', ['linear'], ['zoom'], 4, 6, 10, 10.5],
      'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': match, 'circle-stroke-width': 2 };
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
