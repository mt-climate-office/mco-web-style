/* ============================================================================
   mco-web-style · palette/mco-palette.js · v0.1.0
   Approved data palettes for Montana Climate Office apps (HOUSE-STYLE §6).

   Classic script, zero dependencies, no build, no DOM. Lands on
   window.MCO.palette. A port of mesonet-dashboard's tested
   web-next/src/core/palette (ramps.ts, contrast.ts, the network registry in
   roles.ts): same stops, same OKLab interpolation, so a sample here equals
   the dashboard's byte for byte.

   Brand tokens are for chrome; these are for DATA. Every hex below is
   data-encoding under the CVD policy (HOUSE-STYLE §6), the sanctioned
   exception to "tokens only". Spectral is banned and deliberately absent.

   Roles stay app-local: "air temperature is rose" is domain knowledge. The
   kit ships the ramps, the per-theme spans that clear 3:1 as marks, and the
   one cross-app role set — the station networks (NETWORK).
   ========================================================================== */
(function () {
  'use strict';

  var MCO = window.MCO = window.MCO || {};
  MCO.versions = Object.assign(MCO.versions || {}, { palette: '0.1.0' });
  var P = MCO.palette = MCO.palette || {};

  var THEMES = ['dark', 'light', 'high-contrast'];
  P.THEMES = THEMES;

  // --bg-surface per theme, as in tokens/tokens.json: what a mark must clear
  // 3:1 against (WCAG 1.4.11). Data-reference copies; CI checks they match.
  P.SURFACE = { dark: '#1e2530', light: '#ffffff', 'high-contrast': '#000000' };

  /* ── Ramps (stops low → high) ──────────────────────────────────────────── */

  function ramp(kind, stops, extra) {
    var r = stops.slice();
    r.kind = kind;
    if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; });
    return r;
  }

  P.RAMPS = {
    // Crameri, F. (2018). Scientific colour maps (v8). doi:10.5281/zenodo.1243862.
    // MIT. 11 evenly spaced stops of the 256-step tables. Data-encoding (§6).
    batlow: ramp('sequential', ['#011959', '#103d5f', '#185562', '#30685c', '#577647', '#828231', '#b38e2f', '#e09651', '#fba689', '#fdb9c2', '#faccfa']),
    // roma (0.12.0, a kit addition; the dashboard has no copy): dark red-brown
    // through a pale middle to deep blue. 11 stops at round(i × 25.5) of the
    // v8 table (cmcrameri roma.txt). Diverging, midpoint at the pale middle.
    // MCO's status ramps (status, maintenance time-since; umrb's stages) are
    // drawn from it. Data-encoding (§6).
    roma: ramp('diverging', ['#7e1700', '#984e14', '#ac7726', '#c1a545', '#d2d484', '#c0eac3', '#89dad7', '#4bb2ce', '#2d88be', '#1e5fac', '#033198'], { midpoint: 0.5 }),
    // Cyclic (first stop === last): only for cyclic quantities such as wind
    // direction, labelled N…S…N. Data-encoding (§6).
    romaO: ramp('cyclic', ['#733957', '#823c3d', '#94502e', '#aa752f', '#c3a34b', '#d5ce81', '#cbe1b3', '#a4d8cb', '#74bbcd', '#5495c0', '#516da6', '#62497d', '#733957']),
    // ColorBrewer 2.0 (Brewer, Harrower & Penn State), max-class schemes.
    // Diverging ramps carry `midpoint` (0–1 position of the neutral stop),
    // which a legend must label (§6). Data-encoding (§6).
    RdBu: ramp('diverging', ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#f7f7f7', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac', '#053061'], { midpoint: 0.5 }),
    BrBG: ramp('diverging', ['#543005', '#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#f5f5f5', '#c7eae5', '#80cdc1', '#35978f', '#01665e', '#003c30'], { midpoint: 0.5 }),
    YlGnBu: ramp('sequential', ['#ffffd9', '#edf8b1', '#c7e9b4', '#7fcdbb', '#41b6c4', '#1d91c0', '#225ea8', '#253494', '#081d58']),
    YlOrRd: ramp('sequential', ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#bd0026', '#800026']),
    Blues: ramp('sequential', ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b']),
    PuRd: ramp('sequential', ['#f7f4f9', '#e7e1ef', '#d4b9da', '#c994c7', '#df65b0', '#e7298a', '#ce1256', '#980043', '#67001f']),
    // Paul Tol (2021), "Colour Schemes", SRON/EPS/TN/09-002 issue 3.2, in Tol's
    // published order; "bad data" greys and HC white/black omitted.
    // Data-encoding (§6).
    tolBright: ramp('qualitative', ['#4477AA', '#66CCEE', '#228833', '#CCBB44', '#EE6677', '#AA3377', '#BBBBBB']),
    tolMuted: ramp('qualitative', ['#CC6677', '#332288', '#DDCC77', '#117733', '#88CCEE', '#882255', '#44AA99', '#999933', '#AA4499']),
    tolHC: ramp('qualitative', ['#DDAA33', '#BB5566', '#004488']),
  };

  var BANNED = { spectral: true };
  // Spectral traverses red→green and is not colorblind-safe (§6).
  P.isBanned = function (name) { return !!BANNED[String(name).toLowerCase()]; };

  function getRamp(r) {
    if (typeof r !== 'string') return r;
    if (P.isBanned(r)) throw new Error('MCO.palette: ' + r + ' is banned (HOUSE-STYLE §6)');
    var found = P.RAMPS[r];
    if (!found) throw new Error('MCO.palette: unknown ramp ' + r);
    return found;
  }

  /* ── Contrast (WCAG 2.x) ───────────────────────────────────────────────── */

  function hexToRgb(hex) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) throw new Error('Not a #rrggbb color: ' + hex);
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  }
  P.luminance = function (hex) {
    var c = hexToRgb(hex).map(function (v) {
      var s = v / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  // WCAG contrast ratio, 1–21, order-independent.
  P.contrast = function (a, b) {
    var la = P.luminance(a), lb = P.luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };

  /* ── OKLab (Björn Ottosson, 2020) ──────────────────────────────────────── */

  function toLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function toSrgb(c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }

  // "#rrggbb" → [L, a, b]; L is perceptual lightness, 0–1.
  P.toOklab = function (hex) {
    var rgb = hexToRgb(hex).map(function (c) { return toLinear(c / 255); });
    var r = rgb[0], g = rgb[1], b = rgb[2];
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  };
  function fromOklab(lab) {
    var L = lab[0], A = lab[1], B = lab[2];
    var l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
    var m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
    var s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
    var rgb = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
    return '#' + rgb.map(function (c) {
      var v = Math.round(Math.min(1, Math.max(0, toSrgb(c))) * 255).toString(16);
      return v.length < 2 ? '0' + v : v;
    }).join('');
  }

  /* ── Sampling ──────────────────────────────────────────────────────────── */

  // Color at position t (0–1, clamped), OKLab-interpolated between
  // neighbouring stops, as lowercase #rrggbb.
  P.colorAt = function (r, t) {
    r = getRamp(r);
    var x = Math.min(1, Math.max(0, t)) * (r.length - 1);
    var lo = Math.floor(x);
    var hi = Math.min(r.length - 1, lo + 1);
    var a = P.toOklab(r[lo]);
    var b = P.toOklab(r[hi]);
    var f = x - lo;
    return fromOklab([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
  };

  // n evenly spaced colors from `from` to `to` (0–1; to < from runs
  // backwards), as lowercase #rrggbb. reverse: true flips the result (high →
  // low). n ≤ 0 → []; n = 1 → the color at `from`. `opts` may also be the
  // [from, to] pair span() returns.
  P.sample = function (r, n, opts) {
    r = getRamp(r);
    if (Array.isArray(opts)) opts = { from: opts[0], to: opts[1] };
    opts = opts || {};
    var from = opts.from == null ? 0 : opts.from;
    var to = opts.to == null ? 1 : opts.to;
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push(P.colorAt(r, n === 1 ? from : from + ((to - from) * i) / (n - 1)));
    }
    return opts.reverse ? out.reverse() : out;
  };

  // A ramp's stops high → low, without mutating it (keeps kind/midpoint;
  // a reversed diverging midpoint moves to 1 − midpoint).
  P.reversed = function (r) {
    r = getRamp(r);
    var extra = r.midpoint == null ? null : { midpoint: 1 - r.midpoint };
    return ramp(r.kind, r.slice().reverse(), extra);
  };

  /* ── Spans: where a ramp clears 3:1 as a MARK ──────────────────────────────
     Lines, markers and bars must clear 3:1 against --bg-surface (WCAG
     1.4.11). For a lightness-monotonic sequential ramp that is one
     contiguous part of it: light themes keep the dark end, dark themes the
     light end. span(name, theme) → [from, to] for sample()/colorAt(), widest
     interval whose every point clears 3:1 (CI checks 9 samples per span).
     batlow's spans are the dashboard's (roles.ts BATLOW_SPAN), a little
     inside the widest passing ones (dark 0.40–1, light 0–0.60, HC 0.27–1).
     The ColorBrewer spans are the widest passing interval measured at 101
     points, pulled 0.02 in for margin.

     Diverging and cyclic ramps have no such span: their neutral middle (or
     their light arc) sits at the surface's own lightness in at least one
     theme. span() returns null for them. Use them as FILLS (heatmap cells,
     choropleths, areas), where surface contrast doesn't apply, with the
     midpoint labelled; give marks a sequential ramp or a categorical set. */
  var SPANS = {
    batlow: { dark: [0.45, 1], light: [0, 0.55], 'high-contrast': [0.35, 1] },
    YlGnBu: { dark: [0, 0.68], light: [0.59, 1], 'high-contrast': [0, 0.75] },
    YlOrRd: { dark: [0, 0.76], light: [0.61, 1], 'high-contrast': [0, 0.86] },
    Blues:  { dark: [0, 0.73], light: [0.6, 1],  'high-contrast': [0, 0.82] },
    PuRd:   { dark: [0, 0.7],  light: [0.5, 1],  'high-contrast': [0, 0.79] },
  };

  P.span = function (name, theme) {
    var r = getRamp(name);
    if (r.kind !== 'sequential') return null;
    var s = SPANS[name] && SPANS[name][theme in P.SURFACE ? theme : 'dark'];
    return s ? s.slice() : null;
  };

  /* ── Categorical (qualitative) ─────────────────────────────────────────────
     Tol muted on light, Tol bright on dark, Tol high-contrast (then bright)
     on high-contrast, each filtered to the hues that clear 3:1 on that
     theme's surface. More series than colors cycle: give them a second
     channel (dash, shape, label) — color is never the only one (§6). */
  P.categorical = function (n, theme) {
    theme = theme in P.SURFACE ? theme : 'dark';
    var base = theme === 'light' ? P.RAMPS.tolMuted
      : theme === 'dark' ? P.RAMPS.tolBright
      : P.RAMPS.tolHC.concat(P.RAMPS.tolBright);
    var bg = P.SURFACE[theme];
    var seen = {};
    var pool = base.filter(function (c) {
      var k = c.toLowerCase();
      if (seen[k]) return false;
      seen[k] = true;
      return P.contrast(c, bg) >= 3;
    });
    var out = [];
    for (var i = 0; i < n; i++) out.push(pool[i % pool.length]);
    return out;
  };

  /* ── Station networks (#31) ────────────────────────────────────────────────
     The one cross-app role set: network = shape + color, data value = fill.
     Shape survives grayscale; the legend swatch uses the same data-shape
     (.mco-legend-swatch). From the dashboard's registry (roles.ts
     NETWORK_COLOR / NETWORK_SHAPE): Tol bright blue / vibrant orange /
     vibrant teal. AgriMet's #EE7733 is 2.87:1 on white, so light darkens it to
     #CC6622. Data-encoding (§6). */
  var NETWORK_SHAPE = { hydromet: 'circle', agrimet: 'hollow', cooperator: 'ring' };
  var NETWORK_COLOR = {
    dark: { hydromet: '#4477AA', agrimet: '#EE7733', cooperator: '#009988' },
    light: { hydromet: '#4477AA', agrimet: '#CC6622', cooperator: '#009988' },
    'high-contrast': { hydromet: '#4477AA', agrimet: '#EE7733', cooperator: '#009988' },
  };
  var NETWORK_LABEL = { hydromet: 'HydroMet', agrimet: 'AgriMet', cooperator: 'Cooperator' };
  P.NETWORK = {};
  THEMES.forEach(function (t) {
    P.NETWORK[t] = {};
    Object.keys(NETWORK_SHAPE).forEach(function (k) {
      P.NETWORK[t][k] = { label: NETWORK_LABEL[k], color: NETWORK_COLOR[t][k], shape: NETWORK_SHAPE[k] };
    });
  });

  // network('AgriMet', 'light') → {label, color, shape}; null if unknown.
  // Case-insensitive, so an API's sub_network string can be passed as is.
  P.network = function (name, theme) {
    theme = theme in P.SURFACE ? theme : 'dark';
    var n = P.NETWORK[theme][String(name).toLowerCase()];
    return n ? { label: n.label, color: n.color, shape: n.shape } : null;
  };
})();
