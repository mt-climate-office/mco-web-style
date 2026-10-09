/* ============================================================================
   mco-web-style · core/mco-core.js · v0.1.0
   Framework-free shared utilities for Montana Climate Office web apps.

   Classic script (no ESM, no build, zero dependencies) — load it with a
   pinned, SRI-hashed <script> tag BEFORE your app script; everything lands
   on window.MCO. Extracted from the mesonet-explorer / mesonet-status /
   mesonet-photo-explorer / mco-snowpack-explorer family; canonical behaviors
   documented in HOUSE-STYLE.md.

   Contents: constants · storage · strings · Mountain-time helpers · fetch ·
   reduced motion (live) · viewport (compact/touch) · announcements + toast ·
   theme · info modal · collapsible · URL state.
   ========================================================================== */
(function () {
  'use strict';

  var MCO = window.MCO = window.MCO || {};
  MCO.versions = Object.assign(MCO.versions || {}, { core: '0.1.0' });

  /* ── Constants ─────────────────────────────────────────────────────────── */

  // Every MCO product reports in Mountain Time regardless of the viewer's zone.
  MCO.TZ = 'America/Denver';

  // Deliberately shared across MCO apps on the same origin: a theme choice in
  // one app follows the user into the others. App-private keys must be
  // app-prefixed ('mco-<app>-*') and re-validated on read like URL params —
  // another app (or an old version) may have written something unexpected.
  MCO.THEME_KEY = 'mco-theme';

  /* ── Storage (throw-safe: Safari private mode, disabled storage, etc.) ─── */

  MCO.lsGet = function (key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  };
  MCO.lsSet = function (key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  };

  /* ── Strings ───────────────────────────────────────────────────────────── */

  MCO.escapeHTML = function (str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  MCO.escapeRe = function (str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  /* ── Mountain-time helpers ─────────────────────────────────────────────── */

  MCO.pad2 = function (n) { return String(n).padStart(2, '0'); };

  // Today's date in MT as 'YYYY-MM-DD' (en-CA locale gives ISO ordering).
  MCO.todayMT = function () {
    return new Date().toLocaleDateString('en-CA', { timeZone: MCO.TZ });
  };
  MCO.currentHourMT = function () {
    return parseInt(new Intl.DateTimeFormat('en-US',
      { timeZone: MCO.TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date()), 10);
  };
  MCO.hhmmNowMT = function () {
    return new Intl.DateTimeFormat('en-GB',
      { timeZone: MCO.TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  };
  // Shift a 'YYYY-MM-DD' string by whole days. The noon anchor sidesteps DST
  // edges; the result is formatted from LOCAL getters, not toISOString(), which
  // would re-project to UTC and land a day off for viewers at UTC+13/+14 and
  // UTC-12 (found in the mesonet-photo-explorer migration, then named
  // mco-mesonet-photos).
  MCO.shiftDate = function (dateStr, deltaDays) {
    var d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + deltaDays);
    return d.getFullYear() + '-' + MCO.pad2(d.getMonth() + 1) + '-' + MCO.pad2(d.getDate());
  };
  MCO.formatStampMT = function (ms) {
    return new Date(ms).toLocaleString('en-US', {
      timeZone: MCO.TZ,
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    });
  };
  MCO.formatDateMT = function (ms) {
    return new Date(ms).toLocaleDateString('en-US', {
      timeZone: MCO.TZ, year: 'numeric', month: 'short', day: 'numeric',
    });
  };
  MCO.formatDateStr = function (dateStr) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
  };
  // The last complete clock hour, as {date, hour} in MT.
  MCO.lastCompleteHourMT = function () {
    var t = MCO.todayMT();
    var h = MCO.currentHourMT() - 1;
    if (h < 0) return { date: MCO.shiftDate(t, -1), hour: 23 };
    return { date: t, hour: h };
  };

  /* ── Fetch ─────────────────────────────────────────────────────────────── */

  MCO.fetchJSON = function (url, opts) {
    var timeoutMs = (opts && opts.timeoutMs) || 60000;
    var init = { signal: AbortSignal.timeout(timeoutMs) };
    // Cache mode passthrough — polling loops want 'no-store'.
    if (opts && opts.cache) init.cache = opts.cache;
    return fetch(url, init).then(function (res) {
      if (!res.ok) throw new Error('API error ' + res.status);
      return res.json();
    });
  };

  // Promise cache: key → Promise. Storing promises dedupes concurrent
  // identical requests; failed promises evict themselves so a retry refetches.
  MCO.promiseCache = function () {
    var cache = new Map();
    return {
      cached: function (key, maker) {
        if (!cache.has(key)) {
          var p = Promise.resolve().then(maker).catch(function (err) {
            cache.delete(key); throw err;
          });
          cache.set(key, p);
        }
        return cache.get(key);
      },
      invalidate: function (substr) {
        Array.from(cache.keys()).forEach(function (key) {
          if (key.includes(substr)) cache.delete(key);
        });
      },
      clear: function () { cache.clear(); },
    };
  };

  /* ── Reduced motion — LIVE, not a boot snapshot ────────────────────────────
     Call MCO.reducedMotion() at animation time so toggling the OS setting
     mid-session takes effect. CSS transitions are clamped by the blanket rule
     in mco-theme.css; this gate is for JS-driven animation (map camera moves,
     timeouts that pace a reveal). */
  var _rmMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var _rm = _rmMq.matches;
  _rmMq.addEventListener('change', function (e) { _rm = e.matches; });
  MCO.reducedMotion = function () { return _rm; };

  /* ── Viewport: compact + touch, as a tiny pub-sub ──────────────────────────
     "Compact" = a viewport where a ~320px anchored popup can't be shown whole
     inside the map: narrow phones AND short/landscape ones. Layout stays in
     real @media rules (no flash before deferred JS runs); these flags drive
     the choices JS has to make — sheet vs. anchored popup, panel auto-collapse.
     KEEP THE QUERY IN SYNC in three places: here, the breakpoint comment in
     mco-theme.css §6, and snippets/anti-flash.html.
     Stamps .is-compact / .is-touch on <html> for CSS hooks. The inline
     anti-flash snippet stamps them first (0.7.0), so CSS keyed on them is
     right from first paint; this script — loaded at the end of <body> —
     re-stamps on load and keeps them live across resizes. */
  var COMPACT_MQ = '(max-width: 640px), (max-height: 560px)';
  var _compactMq = window.matchMedia(COMPACT_MQ);
  var _touchMq = window.matchMedia('(hover: none)');
  // The short-landscape rail (0.10.0): the landscape half of COMPACT_MQ.
  var RAIL_MQ = '(max-height: 560px) and (orientation: landscape)';
  var _railMq = window.matchMedia(RAIL_MQ);
  var _vpSubs = new Set();
  function _emitViewport() {
    document.documentElement.classList.toggle('is-compact', _compactMq.matches);
    document.documentElement.classList.toggle('is-touch', _touchMq.matches);
    _vpSubs.forEach(function (fn) {
      try { fn(); } catch (e) { console.error(e); }
    });
  }
  _compactMq.addEventListener('change', _emitViewport);
  _touchMq.addEventListener('change', _emitViewport);
  _railMq.addEventListener('change', _emitViewport);
  _emitViewport(); // re-stamp (the snippet did first paint) and notify

  MCO.viewport = {
    COMPACT_MQ: COMPACT_MQ,
    isCompact: function () { return _compactMq.matches; },
    isTouch: function () { return _touchMq.matches; },
    RAIL_MQ: RAIL_MQ,
    isRail: function () { return _railMq.matches; },   // also compact
    // Subscribe to compact/touch/rail flips. Returns an unsubscribe function.
    onChange: function (fn) {
      _vpSubs.add(fn);
      return function () { _vpSubs.delete(fn); };
    },
  };

  /* ── Live-region plumbing (0.8.0) ──────────────────────────────────────────
     Two defects every hand-made region shared (found by mesonet-dashboard):
     1. Setting the same text twice is no DOM change, so a repeated message
        ("Link copied", twice) is not re-read. Clear first, then set the text
        a beat later, as a separate mutation.
     2. A region inserted at the moment of its first message is often not
        read at all: screen readers watch regions that already exist. So the
        kit's regions (and the toast) are created when this script loads,
        not on first use. */
  var ANNOUNCE_GAP_MS = 50;      // clear → set; long enough to be two mutations
  function clearThenSet(el, text, state) {
    clearTimeout(state.timer);
    el.textContent = '';
    state.timer = setTimeout(function () { el.textContent = text; }, ANNOUNCE_GAP_MS);
  }
  // Run fn once <body> exists. The kit's scripts load at the end of <body>, so
  // this is normally immediate; a page loading them in <head> waits a tick.
  function onBody(fn) {
    if (document.body) fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  /* ── Toast ─────────────────────────────────────────────────────────────── */

  // createToast({element?, duration?}) → {show, hide, element}. With no
  // element, one is created and appended to <body> (class .mco-toast, styled
  // by mco-theme.css, announced politely via role="status").
  //
  // show(msg, ms?, {announce: false}) keeps the toast out of the
  // accessibility tree for that message — for an app that has already said
  // the same thing through MCO.announce, so screen readers don't hear it
  // twice (snowpack explorer's pinned-reading double announce).
  MCO.createToast = function (opts) {
    opts = opts || {};
    var duration = opts.duration || 2800;
    var el = opts.element;
    if (!el) {
      el = document.createElement('div');
      el.className = 'mco-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'true');
      onBody(function () { document.body.appendChild(el); });
    }
    var timer;
    var live = {};
    return {
      element: el,
      show: function (msg, ms, o) {
        clearTimeout(timer);
        if (o && o.announce === false) {
          clearTimeout(live.timer);
          el.setAttribute('aria-hidden', 'true');
          el.textContent = msg;
        } else {
          el.removeAttribute('aria-hidden');
          clearThenSet(el, msg, live);
        }
        el.classList.add('visible');
        timer = setTimeout(function () { el.classList.remove('visible'); }, ms || duration);
      },
      hide: function () {
        clearTimeout(timer);
        el.classList.remove('visible');
      },
    };
  };

  // Singleton convenience — most pages want exactly one toast. Created at
  // load (0.8.0) so its live region exists before the first message.
  var _toast = MCO.createToast();
  MCO.showToast = function (msg, ms, opts) {
    _toast.show(msg, ms, opts);
  };

  /* ── Theme ─────────────────────────────────────────────────────────────── */

  MCO.getTheme = function () {
    return document.documentElement.dataset.theme || 'dark';
  };
  // The theme a visitor with no saved or URL choice gets: the OS preference,
  // as the anti-flash snippet resolves it. Compare against it to keep a
  // default theme out of the URL — write ?theme= only when the current theme
  // differs (0.8.0; was identical copies in three consumers).
  MCO.osTheme = function () {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };
  // Fires `mco:themechange` on document (0.9.0) with detail {theme,
  // previous}, so a chart, a canvas export or a map re-style listens once
  // instead of every toggle call site remembering it.
  MCO.setTheme = function (theme, opts) {
    var previous = MCO.getTheme();
    document.documentElement.dataset.theme = theme;
    if (!opts || opts.persist !== false) MCO.lsSet(MCO.THEME_KEY, theme);
    if (theme !== previous) {
      document.dispatchEvent(new CustomEvent('mco:themechange', { detail: { theme: theme, previous: previous } }));
    }
  };

  /* ── Tokens from JS (0.9.0) ────────────────────────────────────────────────
     MCO.cssVar('--text-primary') — the trimmed computed value (three apps
     each wrapped this). MCO.chartTokens() — the chrome a chart or a canvas
     export needs, read live from the current theme. CHROME only: data
     colors come from MCO.palette. On a theme change, re-read them; for
     ECharts, dispose and re-init the chart (carrying zoom and legend state)
     rather than setTheme/setOption, which lost state and mis-drew dual-axis
     charts on the dashboard. ECharts' default legend dim (--border, ≈1.6:1)
     fails: use textMuted as inactiveColor. */
  MCO.cssVar = function (name, el) {
    return getComputedStyle(el || document.documentElement).getPropertyValue(name).trim();
  };
  MCO.chartTokens = function () {
    var v = MCO.cssVar;
    return {
      text: v('--text-primary'), textSecondary: v('--text-secondary'), textMuted: v('--text-muted'),
      grid: v('--border'), surface: v('--bg-surface'), background: v('--bg-deep'),
      tooltipBg: v('--glass'), tooltipBorder: v('--border'),
      accentLine: v('--accent-line'), selection: v('--selection-ring'),
      fontUi: v('--font-ui'), fontMono: v('--font-mono'),
    };
  };

  /* ── Page title, social meta, credit (0.9.0) ───────────────────────────────
     HOUSE-STYLE §1. Tab: "<Detail> · <Short> · <Family>" with the short
     family (MT Mesonet | MCO). Card: "<Detail> · <Short> · <Long family>"
     (Montana Mesonet | Montana Climate Office); og:site_name the long family
     alone. Detail is optional plain text — one station or one date. */
  var LONG_FAMILY = { 'MT Mesonet': 'Montana Mesonet', 'MCO': 'Montana Climate Office' };
  function titleParts(o, family) {
    return [o.detail, o.short, family].filter(function (x) { return x != null && String(x).trim() !== ''; }).join(' · ');
  }
  MCO.setPageTitle = function (o) {
    if (!o || !o.short) throw new Error('MCO.setPageTitle: short is required');
    document.title = titleParts(o, o.family || 'MT Mesonet');
    return document.title;
  };
  function upsertMeta(attr, key, content) {
    var el = document.head.querySelector('meta[' + attr + '="' + key + '"]');
    if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
    el.setAttribute('content', content);
  }
  MCO.setSocialMeta = function (o) {
    if (!o || !o.short) throw new Error('MCO.setSocialMeta: short is required');
    var fam = o.family || 'MT Mesonet';
    var long = LONG_FAMILY[fam] || fam;
    var title = titleParts(o, long);
    upsertMeta('property', 'og:title', title);
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('property', 'og:site_name', long);
    if (o.description) { upsertMeta('property', 'og:description', o.description); upsertMeta('name', 'twitter:description', o.description); }
    if (o.url) {
      upsertMeta('property', 'og:url', o.url);
      var c = document.head.querySelector('link[rel="canonical"]');
      if (!c) { c = document.createElement('link'); c.rel = 'canonical'; document.head.appendChild(c); }
      c.href = o.url;
    }
    if (o.image) {
      upsertMeta('property', 'og:image', o.image);
      upsertMeta('name', 'twitter:image', o.image);
      upsertMeta('name', 'twitter:card', 'summary_large_image');
      if (o.imageWidth) upsertMeta('property', 'og:image:width', String(o.imageWidth));
      if (o.imageHeight) upsertMeta('property', 'og:image:height', String(o.imageHeight));
      var alt = o.imageAlt || 'Montana Climate Office';
      upsertMeta('property', 'og:image:alt', alt);
      upsertMeta('name', 'twitter:image:alt', alt);
    }
    return title;
  };
  // The one credit string — info modal Data sections, footers and every
  // export draw from it, so the wording is identical everywhere. Separator
  // is the middot, never a pipe.
  MCO.credit = function (o) {
    var source = o && o.source;
    return (source ? source + ' · ' : '') + 'Montana Climate Office · climate.umt.edu';
  };
  // The order the 3-state toggle steps through (0.10.0).
  MCO.THEME_CYCLE = ['dark', 'light', 'high-contrast'];
  var THEME_NAMES = { dark: 'dark', light: 'light', 'high-contrast': 'high contrast' };
  function nextTheme(cycle) {
    var cur = MCO.getTheme();
    if (!cycle) return cur === 'dark' ? 'light' : 'dark';
    var i = MCO.THEME_CYCLE.indexOf(cur);
    return MCO.THEME_CYCLE[(i + 1) % MCO.THEME_CYCLE.length];
  }
  // dark ↔ light; {cycle: true} steps dark → light → high contrast → dark.
  MCO.toggleTheme = function (opts) {
    var next = nextTheme(opts && opts.cycle);
    MCO.setTheme(next);
    return next;
  };

  // Wire a theme toggle button. The icon shown is the theme a press switches
  // TO: iconSun in dark ("switch to light"), iconMoon in light. Map
  // re-styling, pushState, etc. go in onChange — e.g.:
  //   MCO.initThemeToggle({ button, iconSun, iconMoon, onChange: (t) => {
  //     map.setStyle(MCO.map.cartoStyleUrl());
  //     map.once('style.load', addCustomLayers);   // setStyle wipes sources
  //   }});
  // cycle: true (0.10.0) makes it a 3-state toggle, dark → light → high
  // contrast, so high contrast is reachable from the page and not only from
  // ?theme= or storage. iconContrast shows in light (next: high contrast;
  // the moon is used if it is absent), the moon in high contrast (next:
  // dark). The aria-label always names the next theme.
  MCO.initThemeToggle = function (opts) {
    var button = opts.button;
    var iconSun = opts.iconSun || null;
    var iconMoon = opts.iconMoon || null;
    var cycle = !!opts.cycle;
    var iconContrast = cycle ? (opts.iconContrast || null) : null;
    var setAriaLabel = opts.setAriaLabel !== false;
    var onChange = opts.onChange || null;

    function sync() {
      var next = nextTheme(cycle);
      var show = next === 'light' ? iconSun
        : next === 'high-contrast' ? (iconContrast || iconMoon) : iconMoon;
      [iconSun, iconMoon, iconContrast].forEach(function (ic) {
        if (ic) ic.style.display = ic === show ? '' : 'none';
      });
      if (setAriaLabel) button.setAttribute('aria-label', 'Switch to ' + THEME_NAMES[next] + ' theme');
    }
    function toggle() {
      var next = MCO.toggleTheme({ cycle: cycle });
      sync();
      if (onChange) onChange(next);
      return next;
    }
    button.addEventListener('click', toggle);
    sync();
    return { sync: sync, toggle: toggle };
  };

  /* ── Screen-reader announcements ───────────────────────────────────────────
     MCO.announce(text, {politeness}) is the page's ONE announcer (0.8.0):
     what just changed on a canvas or WebGL surface a screen reader can't see
     ("42 stations shown", "Station X opened"). HOUSE-STYLE §5.1 lists what
     must be announced. Pair with the hidden-table twin (§5.2).

     - Its two regions (polite, assertive) exist from script load.
     - Each message clears the region and is set a beat later, so repeating
       the same text is re-read.
     - The same text at the same politeness within 500 ms is dropped: two
       code paths reporting one change (a filter handler and a render) are
       heard once.
     - 'assertive' interrupts. Reserve it for failures the user must hear
       now; everything else is 'polite' (the default). */
  var ANNOUNCE_DEDUPE_MS = 500;
  function makeRegion(politeness) {
    var el = document.createElement('div');
    el.className = 'sr-only';
    el.setAttribute('aria-live', politeness);
    el.setAttribute('aria-atomic', 'true');   // announce replacements whole
    onBody(function () { document.body.appendChild(el); });
    return el;
  }
  var _regions = { polite: makeRegion('polite'), assertive: makeRegion('assertive') };
  var _regionState = { polite: {}, assertive: {} };
  var _lastAnnounce = { text: null, politeness: null, at: 0 };

  MCO.announce = function (text, opts) {
    var politeness = opts && opts.politeness === 'assertive' ? 'assertive' : 'polite';
    text = String(text);
    var now = Date.now();
    if (text === _lastAnnounce.text && politeness === _lastAnnounce.politeness &&
        now - _lastAnnounce.at < ANNOUNCE_DEDUPE_MS) return;
    _lastAnnounce = { text: text, politeness: politeness, at: now };
    clearThenSet(_regions[politeness], text, _regionState[politeness]);
  };

  // A separate polite region, for the rare page that needs more than one
  // (prefer MCO.announce). Since 0.8.0 its announce() clears before setting,
  // like MCO.announce, so a repeated message is re-read.
  MCO.createLiveRegion = function () {
    var el = makeRegion('polite');
    var state = {};
    return {
      element: el,
      announce: function (text) { clearThenSet(el, String(text), state); },
    };
  };

  /* ── Notice (0.8.0) ────────────────────────────────────────────────────────
     A persistent banner that can hold an action: load failures with Retry,
     data caveats, outages (.mco-notice in mco-theme.css). The toast is for
     transient status; a notice stays until it is resolved or dismissed.

       var n = MCO.notice({
         tone: 'danger',                     // info (default) | warning | danger | success
         text: 'Station data failed to load.',
         action: { label: 'Retry', onClick: function () { n.close(); load(); } },
         container: mapWrap, place: 'over',  // float over a map; omit to stay in flow
         dismissKey: 'mco-explorer-outage-2026-10',  // optional; remembered for the session
       });

     - The tone word ("Error", "Warning", …) is visible text, so color is
       never the only channel. Pass toneLabel to change it.
     - The text is announced through MCO.announce (assertive for danger,
       polite otherwise; opts.politeness overrides, e.g. a warning-toned load
       failure) rather than by giving the element a live role: a role=status
       inserted together with its message is often not read.
     - dismissible (default true) adds a × button. dismissKey remembers a
       dismissal in sessionStorage; it must be app-prefixed (mco-<app>-…). A
       notice already dismissed this session is not shown: the handle's
       element is null.
     - Dismissing moves focus to opts.returnFocus or #main when focus was in
       the notice, so it never falls to <body>.
     Returns {element, close()}. close() runs opts.onClose. */
  var NOTICE_TONES = { info: 'Note', warning: 'Warning', danger: 'Error', success: 'Done' };
  var NOTICE_ICONS = {
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5v.01"/>',
    warning: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17v.01"/>',
    danger: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>',
    success: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.5 2.5L16 9.5"/>',
  };
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function ssGet(key) { try { return sessionStorage.getItem(key); } catch (e) { return null; } }
  function ssSet(key, v) { try { sessionStorage.setItem(key, v); } catch (e) {} }

  MCO.notice = function (opts) {
    opts = opts || {};
    var tone = NOTICE_TONES[opts.tone] ? opts.tone : 'info';
    var dismissKey = opts.dismissKey || null;
    if (dismissKey && !/^mco-[a-z0-9]+(-[a-z0-9]+)*-/.test(dismissKey)) {
      throw new Error('MCO.notice: dismissKey must be app-prefixed, mco-<app>-…');
    }
    if (dismissKey && ssGet(dismissKey) === '1') {
      return { element: null, close: function () {} };
    }

    var el = document.createElement('div');
    el.className = 'mco-notice';
    el.dataset.tone = tone;
    if (opts.place === 'over') el.dataset.place = 'over';

    var icon = document.createElementNS(SVG_NS, 'svg');
    icon.setAttribute('class', 'mco-notice-icon');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '2');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = NOTICE_ICONS[tone];     // static, kit-authored markup

    var p = document.createElement('p');
    p.className = 'mco-notice-text';
    var word = document.createElement('strong');
    word.className = 'mco-notice-tone';
    var toneLabel = opts.toneLabel || NOTICE_TONES[tone];
    word.textContent = toneLabel;
    // A real space, not a margin: AT reads the word and the text as one line.
    p.append(word, ' ', String(opts.text || ''));
    el.append(icon, p);

    if (opts.action) {
      var actions = document.createElement('div');
      actions.className = 'mco-notice-actions';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nav-btn';
      btn.textContent = opts.action.label;
      btn.addEventListener('click', opts.action.onClick);
      actions.appendChild(btn);
      el.appendChild(actions);
    }

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      var hadFocus = el.contains(document.activeElement);
      el.remove();
      if (hadFocus) {
        var to = opts.returnFocus || document.getElementById('main');
        if (to && to.focus) to.focus();
      }
      if (opts.onClose) opts.onClose();
    }

    if (opts.dismissible !== false) {
      var x = document.createElement('button');
      x.type = 'button';
      x.className = 'modal-close';
      x.setAttribute('aria-label', 'Dismiss ' + toneLabel.toLowerCase());
      x.textContent = '×';
      x.addEventListener('click', function () {
        if (dismissKey) ssSet(dismissKey, '1');
        close();
      });
      el.appendChild(x);
    }

    var host = opts.container || document.getElementById('main') || document.body;
    host.insertBefore(el, host.firstChild);
    MCO.announce(toneLabel + ': ' + (opts.text || ''),
      { politeness: opts.politeness || (tone === 'danger' ? 'assertive' : 'polite') });

    return { element: el, close: close };
  };

  /* ── Hidden-table twin (0.8.0) ─────────────────────────────────────────────
     The screen-reader twin of a canvas or WebGL layer (HOUSE-STYLE §5.2): one
     row per drawn feature, rebuilt from the same features the canvas drew,
     never wired to a live region (MCO.announce says what changed; the table
     is what's there).

       var twin = MCO.srTable({
         container: mapFrame,                 // the kit adds <div class="sr-only"><table>
         caption: 'Stations shown on the map',
         columns: [{ key: 'name', label: 'Station', rowHeader: true },
                   { key: 'net', label: 'Network' }],
         maxRows: 500, overflowText: function (n) { return '…and ' + n + ' more rows; download for the full data.'; },
         rowKey: function (row) { return row.id; },   // default row.id
         selectable: false,   // true → each row header is a button: one Tab stop
                              // (roving tabindex), arrows/Home/End move, Enter
                              // selects (onSelect), focus previews (onFocus),
                              // aria-current marks the selection
       });
       twin.render(rows, { selected: id });

     - The wrapper div carries .sr-only, not the <table>: a table ignores
       height: 1px, so .sr-only on it leaks a visible sliver.
     - Cells take textContent only. A column's value is row[key], or
       column.value(row); null or '' reads as "—".
     - render() rebuilds the rows only when the set of row keys (or a
       non-selectable row's content) changes, so focus survives a selection.
     - The caption ends with the row count.
     - Pair the canvas with role="img" (or role="application" for a map) and
       an aria-label ending "…The data is in the table that follows."
     Returns {element, render}. */
  MCO.srTable = function (opts) {
    var columns = opts.columns || [];
    var maxRows = opts.maxRows || 500;
    var overflowText = opts.overflowText || function (n) {
      return '…and ' + n + ' more ' + (n === 1 ? 'row' : 'rows') + '.';
    };
    var rowKey = opts.rowKey || function (r) { return r.id; };
    var selectable = opts.selectable === true;

    var wrap = document.createElement('div');
    wrap.className = 'sr-only';
    var table = document.createElement('table');
    var caption = document.createElement('caption');
    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    columns.forEach(function (c) {
      var th = document.createElement('th');
      th.scope = 'col';
      th.textContent = c.label;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    var tbody = document.createElement('tbody');
    table.append(caption, thead, tbody);
    wrap.appendChild(table);
    (opts.container || document.getElementById('main') || document.body).appendChild(wrap);

    var shown = null;       // signature of the rendered set
    var rowsByKey = new Map();

    function text(c, row) {
      var v = c.value ? c.value(row) : row[c.key];
      return v == null || v === '' ? '—' : String(v);
    }
    function buttons() { return Array.prototype.slice.call(tbody.querySelectorAll('button[data-key]')); }
    function setRoving(selected) {
      var all = buttons();
      var current = all.filter(function (b) { return b.dataset.key === selected; })[0] || all[0];
      all.forEach(function (b) {
        b.tabIndex = b === current ? 0 : -1;
        if (selected != null && b.dataset.key === selected) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      });
    }

    if (selectable) {
      tbody.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-key]');
        if (b && opts.onSelect) opts.onSelect(rowsByKey.get(b.dataset.key));
      });
      tbody.addEventListener('focusin', function (e) {
        var b = e.target.closest('button[data-key]');
        if (b && opts.onFocus) opts.onFocus(rowsByKey.get(b.dataset.key));
      });
      table.addEventListener('focusout', function (e) {
        if (!table.contains(e.relatedTarget) && opts.onFocus) opts.onFocus(null);
      });
      tbody.addEventListener('keydown', function (e) {
        var all = buttons();
        var i = all.indexOf(document.activeElement);
        if (i < 0) return;
        var to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: all.length - 1 }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        var next = all[Math.max(0, Math.min(all.length - 1, to))];
        all.forEach(function (b) { b.tabIndex = b === next ? 0 : -1; });
        next.focus();
      });
    }

    function render(rows, o) {
      rows = rows || [];
      var selected = o && o.selected != null ? String(o.selected) : null;
      caption.textContent = (opts.caption || 'Data shown') + ' (' + rows.length + ')';
      var kept = rows.slice(0, maxRows);
      // Selectable twins key on row identity alone (focus must survive);
      // read-only twins also notice content changes (a value that updated).
      var sig = kept.map(function (r) {
        return selectable ? String(rowKey(r)) : columns.map(function (c) { return text(c, r); }).join('\u0001');
      }).join('\u0002') + '\u0003' + rows.length;
      if (sig !== shown) {
        shown = sig;
        var active = document.activeElement;
        var focusedKey = active && table.contains(active) ? active.dataset.key : undefined;
        rowsByKey = new Map();
        var trs = kept.map(function (r) {
          var key = String(rowKey(r));
          rowsByKey.set(key, r);
          var tr = document.createElement('tr');
          columns.forEach(function (c) {
            var cell = document.createElement(c.rowHeader ? 'th' : 'td');
            if (c.rowHeader) cell.scope = 'row';
            if (selectable && c.rowHeader) {
              var b = document.createElement('button');
              b.type = 'button';
              b.dataset.key = key;
              b.textContent = text(c, r);
              cell.appendChild(b);
            } else {
              cell.textContent = text(c, r);
            }
            tr.appendChild(cell);
          });
          return tr;
        });
        if (rows.length > kept.length) {
          var more = document.createElement('tr');
          var td = document.createElement('td');
          td.colSpan = columns.length;
          td.textContent = overflowText(rows.length - kept.length);
          more.appendChild(td);
          trs.push(more);
        }
        tbody.replaceChildren.apply(tbody, trs);
        if (selectable && focusedKey !== undefined) {
          var again = buttons().filter(function (b) { return b.dataset.key === focusedKey; })[0];
          // Removing the focused button fires no focusout in Chrome.
          if (again) again.focus();
          else if (opts.onFocus) opts.onFocus(null);
        }
      }
      if (selectable) setRoving(selected);
    }

    return { element: wrap, render: render };
  };

  /* ── Legend toggles (0.8.0) ────────────────────────────────────────────────
     Click a legend row to show/hide its category; double-click isolates it
     (double-click the isolated row again to show everything). Shift+Enter is
     the keyboard twin of the double-click (§5.8). Rows are buttons styled by
     .mco-legend-row; aria-pressed is kept in sync and drives the styling.

       var legend = MCO.initLegendToggles({
         rows: legendEl.querySelectorAll('.mco-legend-row'),   // each with data-key
         visible: ['fresh', 'stale'],          // initial; default every row
         onChange: function (visibleSet, change) { render(); },
         noun: 'categories',                   // "Fresh hidden, 3 of 4 categories shown"
         showAll: showAllButton,               // optional; shown while anything is hidden
       });

     A mouse click waits out the double-click window (250 ms) so an isolate
     doesn't flash two toggles first; keyboard activation (click with
     detail 0) applies at once. Each change is announced once through
     MCO.announce. change = {key, action: 'toggle'|'isolate'|'all'}.
     Returns {visible(), set(keys), showAll(), dispose()}. */
  var DBLCLICK_MS = 250;
  MCO.initLegendToggles = function (opts) {
    var rows = Array.prototype.slice.call(opts.rows || []);
    var keys = rows.map(function (r) { return r.dataset.key; });
    var noun = opts.noun || 'categories';
    var showAllBtn = opts.showAll || null;
    var vis = new Set(opts.visible ? Array.from(opts.visible) : keys);
    var timer = null;

    function labelOf(key) {
      var row = rows[keys.indexOf(key)];
      var l = row && row.querySelector('.mco-legend-label');
      return (l ? l.textContent : key).trim();
    }
    function sync() {
      rows.forEach(function (r) { r.setAttribute('aria-pressed', String(vis.has(r.dataset.key))); });
      if (showAllBtn) showAllBtn.hidden = vis.size === keys.length;
    }
    function changed(change, lead) {
      sync();
      MCO.announce(change.action === 'all' ? lead + '.'
        : lead + ', ' + vis.size + ' of ' + keys.length + ' ' + noun + ' shown.');
      if (opts.onChange) opts.onChange(new Set(vis), change);
    }
    function toggle(key) {
      if (vis.has(key)) vis.delete(key); else vis.add(key);
      changed({ key: key, action: 'toggle' }, labelOf(key) + (vis.has(key) ? ' shown' : ' hidden'));
    }
    function isolate(key) {
      if (vis.size === 1 && vis.has(key)) { showAll(); return; }
      vis = new Set([key]);
      changed({ key: key, action: 'isolate' }, 'Only ' + labelOf(key));
    }
    function showAll() {
      vis = new Set(keys);
      changed({ key: null, action: 'all' }, 'All ' + noun + ' shown');
    }

    function onClick(e) {
      var key = e.currentTarget.dataset.key;
      if (e.detail === 0) { toggle(key); return; }        // keyboard: no dblclick to wait for
      if (e.detail > 1) return;                             // the dblclick handler owns it
      clearTimeout(timer);
      timer = setTimeout(function () { timer = null; toggle(key); }, DBLCLICK_MS);
    }
    function onDbl(e) {
      clearTimeout(timer); timer = null;
      isolate(e.currentTarget.dataset.key);
    }
    function onKey(e) {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        isolate(e.currentTarget.dataset.key);
      }
    }
    rows.forEach(function (r) {
      r.addEventListener('click', onClick);
      r.addEventListener('dblclick', onDbl);
      r.addEventListener('keydown', onKey);
    });
    if (showAllBtn) showAllBtn.addEventListener('click', showAll);
    sync();

    return {
      visible: function () { return new Set(vis); },
      // Set the visible keys silently (state restored from the URL): no
      // announcement, no onChange.
      set: function (k) { vis = new Set(Array.from(k).filter(function (x) { return keys.indexOf(x) !== -1; })); sync(); },
      showAll: showAll,
      dispose: function () {
        clearTimeout(timer);
        rows.forEach(function (r) {
          r.removeEventListener('click', onClick);
          r.removeEventListener('dblclick', onDbl);
          r.removeEventListener('keydown', onKey);
        });
        if (showAllBtn) showAllBtn.removeEventListener('click', showAll);
      },
    };
  };

  /* ── First-paint hold (0.9.0) ──────────────────────────────────────────────
     The anti-flash snippet adds html.mco-booting before first paint; while it
     is on, [data-hold] elements keep their layout but don't paint
     (visibility, so nothing shifts), and [data-skeleton] placeholders show.
     Call MCO.ready() once the app's first meaningful state is applied — data
     drawn, URL state restored. The snippet's own 3 s timeout releases the
     hold regardless, so a failed script never strands a page. Returns a
     promise (also MCO.whenReady()) that later code can wait on. Never put
     data-hold on <main> or the skip link. */
  var _readyResolve;
  var _readyP = new Promise(function (r) { _readyResolve = r; });
  MCO.ready = function () {
    document.documentElement.classList.remove('mco-booting');
    _readyResolve();
    return _readyP;
  };
  MCO.whenReady = function () { return _readyP; };

  /* ── Overlay metrics (0.9.0) ───────────────────────────────────────────────
     Layout measurements published as custom properties on <html>, so CSS can
     keep floating things clear of each other: --chrome-h (sticky navbar →
     scroll-padding-top), --sheet-h (the open bottom sheet), --tabbar-h. They
     are layout metrics, not theme tokens (tokens.json lists them under
     `metrics`). html.mco-autolift opts into lifting the toast and MapLibre's
     bottom corners above --sheet-h + --tabbar-h (the default in 1.0.0).
       MCO.metrics.observe('--chrome-h', navbarEl)   // ResizeObserver; returns stop()
       MCO.metrics.set('--sheet-h', 212)             // px
       MCO.metrics.get('--sheet-h')                  // → 212 */
  MCO.metrics = {
    set: function (name, px) {
      document.documentElement.style.setProperty(name, Math.max(0, Math.round(px || 0)) + 'px');
    },
    get: function (name) {
      return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
    },
    observe: function (name, el) {
      var set = function () { MCO.metrics.set(name, el.getBoundingClientRect().height); };
      set();
      if (typeof ResizeObserver === 'undefined') return function () {};
      var ro = new ResizeObserver(set);
      ro.observe(el);
      return function () { ro.disconnect(); };
    },
  };
  // A sticky navbar (0.10.0) publishes its own height, so scroll-padding-top
  // keeps anchor targets and focused elements out from under it (WCAG 2.4.11).
  var _stickyBar = document.querySelector('.mco-navbar.is-sticky');
  if (_stickyBar) MCO.metrics.observe('--chrome-h', _stickyBar);

  /* ── Overlays: focus, inert, Esc (0.9.0) ───────────────────────────────────
     Native <dialog> (MCO.initInfoModal) handles focus itself. Everything else
     that floats — drawers, sheets, popups, flyouts — gets it from here:

       var ov = MCO.overlay({
         el: panel,
         opener: function () { return btn; },  // default: whatever had focus at open()
         initialFocus: '#panel-title',         // element/selector; default: el's
                                               // [tabindex="-1"] heading, else its first
                                               // focusable, else el itself
         inert: [mapEl],                       // made inert while open ([] = non-modal);
                                               // a function is called at open()
         escape: true,                         // joins the shared Esc stack
         onClose: function () {},              // after Esc / close()
       });
       ov.open(); ov.close({ restoreFocus: true });

     ONE Esc order for the family: the topmost registered overlay handles Esc.
     A native <dialog> always wins — an overlay under an open dialog ignores
     Esc unless it lives inside the dialog. A handler that already consumed
     Esc (preventDefault — the search combobox does) stops it here too. So:
     dialog > flyout > sheet full > drawer > sheet peek > popup, by opening
     order. Inert roots are reference-counted, so two overlays sharing a root
     release it symmetrically. Focus returns to the opener, or to
     opts.fallbackFocus / #main when the opener has left the DOM.
     MCO.overlay.isBlocking() is true while an inert-making overlay or a modal
     dialog is open: single-key shortcuts check it and stand down. */
  var _escStack = [];
  MCO.escStack = {
    push: function (fn, el) { MCO.escStack.pop(fn); _escStack.push({ fn: fn, el: el || null }); },
    pop: function (fn) { _escStack = _escStack.filter(function (e) { return e.fn !== fn; }); },
    size: function () { return _escStack.length; },
  };
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || e.defaultPrevented || !_escStack.length) return;
    var top = _escStack[_escStack.length - 1];
    var dlg = document.querySelector('dialog[open]');
    if (dlg && !(top.el && dlg.contains(top.el))) return;   // the dialog owns this Esc
    e.preventDefault();
    top.fn(e);
  });

  var _inertCount = new Map();
  var _blocking = 0;
  function inertOn(el) {
    var n = _inertCount.get(el) || 0;
    if (n === 0) el.dataset.mcoWasInert = el.inert ? '1' : '0';
    _inertCount.set(el, n + 1);
    el.inert = true;
  }
  function inertOff(el) {
    var n = (_inertCount.get(el) || 0) - 1;
    if (n > 0) { _inertCount.set(el, n); return; }
    _inertCount.delete(el);
    el.inert = el.dataset.mcoWasInert === '1';
    delete el.dataset.mcoWasInert;
  }
  // Everything beside el's ancestor chain, up to <body> — the inert scope a
  // modal surface needs without inerting itself (inerting <main> when the
  // drawer lives in <main> would inert the drawer too). Live regions, the
  // toast and anything in `keep` stay live: an inert announcer can't speak.
  MCO.overlay = function (opts) {
    var el = opts.el;
    var isOpen = false;
    var opener = null;
    var roots = [];
    var blocks = false;

    function focusables(root) {
      return Array.prototype.filter.call(root.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
        'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'), function (n) {
        return !n.hidden && n.getClientRects().length > 0;
      });
    }
    function target() {
      var f = opts.initialFocus;
      if (typeof f === 'string') f = el.querySelector(f);
      if (f) return f;
      return el.querySelector('[tabindex="-1"]') || focusables(el)[0] || el;
    }
    function onEsc() { close({ restoreFocus: true, viaEsc: true }); }
    function open(o) {
      if (isOpen) return;
      isOpen = true;
      opener = (o && o.opener) || (opts.opener ? opts.opener() : document.activeElement);
      var r = typeof opts.inert === 'function' ? opts.inert() : (opts.inert || []);
      roots = Array.prototype.slice.call(r).filter(function (n) { return n && !n.contains(el); });
      roots.forEach(inertOn);
      blocks = roots.length > 0;
      if (blocks) _blocking++;
      if (opts.escape !== false) MCO.escStack.push(onEsc, el);
      if (!(o && o.focus === false)) {
        var t = target();
        if (t === el && !el.hasAttribute('tabindex')) el.tabIndex = -1;
        t.focus({ preventScroll: true });
      }
    }
    function close(o) {
      if (!isOpen) return;
      isOpen = false;
      MCO.escStack.pop(onEsc);
      roots.forEach(inertOff);
      roots = [];
      if (blocks) { _blocking--; blocks = false; }
      if (!o || o.restoreFocus !== false) {
        var back = opener && opener.isConnected && !opener.inert ? opener
          : (opts.fallbackFocus || document.getElementById('main'));
        if (back && back.focus) back.focus({ preventScroll: true });
      }
      opener = null;
      if (opts.onClose) opts.onClose(o || {});
    }
    // Retarget inertness when the scope changes (a breakpoint flip).
    function setInert(next) {
      if (!isOpen) return;
      roots.forEach(inertOff);
      if (blocks) { _blocking--; blocks = false; }
      roots = Array.prototype.slice.call(next || []).filter(function (n) { return n && !n.contains(el); });
      roots.forEach(inertOn);
      blocks = roots.length > 0;
      if (blocks) _blocking++;
    }
    return { open: open, close: close, isOpen: function () { return isOpen; }, setInert: setInert };
  };
  MCO.overlay.siblingsOf = function (el, keep) {
    keep = keep || [];
    var out = [];
    for (var node = el; node && node !== document.body && node.parentElement; node = node.parentElement) {
      Array.prototype.forEach.call(node.parentElement.children, function (sib) {
        if (sib === node || /^(SCRIPT|STYLE|TEMPLATE|LINK)$/.test(sib.tagName)) return;
        if (sib.hasAttribute('aria-live') || sib.classList.contains('mco-toast')) return;
        if (keep.some(function (k) { return k && (k === sib || sib.contains(k)); })) return;
        out.push(sib);
      });
    }
    return out;
  };
  MCO.overlay.isBlocking = function () {
    return _blocking > 0 || !!document.querySelector('dialog[open]');
  };

  /* ── Off-canvas drawer (0.9.0) ─────────────────────────────────────────────
     The sanctioned home for a control-dense bar on a phone (HOUSE-STYLE §3).

       <button class="nav-btn icon-only" id="btn-drawer" aria-label="Filters"
               aria-expanded="false" aria-controls="drawer">…</button>
       <aside class="mco-drawer" id="drawer" data-side="start" aria-labelledby="drawer-title" hidden>
         <div class="mco-drawer-head"><h2 id="drawer-title" class="mco-panel-title">Filters</h2>
           <button class="modal-close" data-close-drawer aria-label="Close filters">×</button></div>
         <div class="mco-drawer-body">…</div>
       </aside>
       <div class="mco-scrim" data-scope="container" aria-hidden="true" hidden></div>

       var drawer = MCO.initDrawer({
         drawer: el, toggle: btn, scrim: scrimEl,   // scrim optional
         modal: 'compact',     // 'always' | 'compact' (off-canvas on compact, a docked
                               // column otherwise) | 'never' (off-canvas, non-modal)
         inertRoots: null,     // default: everything beside the drawer's ancestor chain
         initialFocus: null,   // default: first focusable inside
         onChange: function (open, docked) { map.resize(); },
       });
       → {open, close, toggle, isOpen, isDocked, destroy}

     A labelled <aside>, not role=dialog: a disclosure that, while modal-open,
     makes the rest of the page inert — so Tab can only cycle inside it and
     no focus trap is needed. Open moves focus in; close (Esc, ×, scrim, the
     toggle) returns it to the toggle or the shortcut's opener. Closed, it
     carries [hidden] after the slide-out, so nothing off-screen stays in the
     tab order or the accessibility tree. */
  MCO.initDrawer = function (opts) {
    var drawer = opts.drawer;
    var toggle = opts.toggle || null;
    var scrim = opts.scrim || null;
    var mode = opts.modal || 'compact';
    var onChange = opts.onChange || null;
    var openState = false;
    var docked = false;
    var hideTimer = null;
    var SLIDE_MS = 300;

    function modalNow() { return mode === 'always' || (mode === 'compact' && MCO.viewport.isCompact()); }
    function inertRoots() {
      if (!modalNow()) return [];
      return opts.inertRoots || MCO.overlay.siblingsOf(drawer, [scrim, toggle && mode === 'never' ? toggle : null]);
    }
    var ov = MCO.overlay({
      el: drawer,
      opener: function () { return document.activeElement && document.activeElement !== document.body ? document.activeElement : toggle; },
      initialFocus: opts.initialFocus,
      inert: inertRoots,
      fallbackFocus: toggle,
      onClose: function () { hide(); },
    });

    function show() {
      clearTimeout(hideTimer);
      drawer.hidden = false;
      if (scrim && modalNow()) scrim.hidden = false;
      void drawer.offsetWidth;            // reflow so the slide starts from closed
      drawer.classList.add('is-open');
    }
    function hide() {
      if (!openState) return;
      openState = false;
      drawer.classList.remove('is-open');
      if (scrim) scrim.hidden = true;
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () { if (!openState && !docked) drawer.hidden = true; },
        MCO.reducedMotion() ? 0 : SLIDE_MS);
      if (onChange) onChange(false, docked);
    }
    function open() {
      if (docked || openState) return;
      openState = true;
      show();
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
      ov.open();
      if (onChange) onChange(true, docked);
    }
    function close(o) {
      if (!openState) return;
      ov.close({ restoreFocus: !o || o.restoreFocus !== false });
    }
    function toggleIt() { if (openState) close(); else open(); }

    function applyMode() {
      var shouldDock = mode === 'compact' && !MCO.viewport.isCompact();
      if (shouldDock === docked) { if (openState) ov.setInert(inertRoots()); return; }
      if (shouldDock) {
        if (openState) ov.close({ restoreFocus: false });
        docked = true;
        clearTimeout(hideTimer);
        drawer.dataset.docked = '';
        drawer.hidden = false;
        drawer.classList.remove('is-open');
        if (scrim) scrim.hidden = true;
        if (toggle) toggle.hidden = true;
      } else {
        docked = false;
        delete drawer.dataset.docked;
        drawer.hidden = true;
        if (toggle) { toggle.hidden = false; toggle.setAttribute('aria-expanded', 'false'); }
      }
      if (onChange) onChange(openState, docked);
    }

    function onDrawerClick(e) { if (e.target.closest('[data-close-drawer]')) close(); }
    function onScrim() { close(); }
    if (toggle) toggle.addEventListener('click', toggleIt);
    drawer.addEventListener('click', onDrawerClick);
    if (scrim) scrim.addEventListener('click', onScrim);
    var unsub = MCO.viewport.onChange(applyMode);
    applyMode();

    return {
      open: open, close: close, toggle: toggleIt,
      isOpen: function () { return openState; },
      isDocked: function () { return docked; },
      destroy: function () {
        close({ restoreFocus: false });
        unsub();
        if (toggle) toggle.removeEventListener('click', toggleIt);
        drawer.removeEventListener('click', onDrawerClick);
        if (scrim) scrim.removeEventListener('click', onScrim);
      },
    };
  };

  /* ── Short-landscape nav rail (0.10.0) ─────────────────────────────────────
     The bar becomes a left rail on a landscape phone (.mco-navbar[data-rail],
     markup in mco-theme.css §6); this wires its drawer. The same disclosure
     model as MCO.initDrawer: while open, everything beside the drawer and
     the rail is inert, Esc / the scrim / the toggle close it and focus
     returns to the toggle. Closed it is display:none, so nothing off-screen
     is reachable; outside rail mode it is display:contents and this is idle.

       var rail = MCO.initNavRail({
         toggle: menuBtn, drawer: navDrawerEl, scrim: scrimEl,   // scrim optional
         onChange: function (open) {},
       });
       → {open(focusEl?), close({restoreFocus}), toggle, isOpen, isRail, destroy}

     App side: a "/" shortcut checks rail.isRail() first and calls
     rail.open(searchInput); choosing a search result closes with
     {restoreFocus: false} and hands the toggle to whatever opens next; a
     drawer button that opens a dialog closes the drawer first. */
  MCO.initNavRail = function (opts) {
    var drawer = opts.drawer;
    var toggle = opts.toggle;
    var scrim = opts.scrim || null;
    var onChange = opts.onChange || null;
    var openState = false;
    var ov = MCO.overlay({
      el: drawer,
      opener: function () { return toggle; },
      initialFocus: opts.initialFocus,
      inert: function () { return MCO.overlay.siblingsOf(drawer, [toggle, scrim]); },
      fallbackFocus: toggle,
      onClose: function () { hide(); },
    });
    function hide() {
      if (!openState) return;
      openState = false;
      drawer.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      if (scrim) scrim.hidden = true;
      if (onChange) onChange(false);
    }
    function open(focusEl) {
      if (openState || !MCO.viewport.isRail()) return;
      openState = true;
      // display flips with the class, so the target is focusable right away.
      drawer.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      if (scrim) scrim.hidden = false;
      ov.open({ focus: !focusEl });
      if (focusEl) focusEl.focus({ preventScroll: true });
      if (onChange) onChange(true);
    }
    function close(o) {
      if (!openState) return;
      ov.close({ restoreFocus: !o || o.restoreFocus !== false });
    }
    function toggleIt() { if (openState) close(); else open(); }
    function onScrim() { close(); }
    var unsub = MCO.viewport.onChange(function () {
      if (openState && !MCO.viewport.isRail()) close({ restoreFocus: false });
    });
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', toggleIt);
    if (scrim) scrim.addEventListener('click', onScrim);
    return {
      open: open, close: close, toggle: toggleIt,
      isOpen: function () { return openState; },
      isRail: MCO.viewport.isRail,
      destroy: function () {
        close({ restoreFocus: false });
        unsub();
        toggle.removeEventListener('click', toggleIt);
        if (scrim) scrim.removeEventListener('click', onScrim);
      },
    };
  };

  /* ── Bottom sheet (0.9.0) ──────────────────────────────────────────────────
     The detail surface on compact viewports, lifted from mesonet-explorer's
     field-proven panel: below compact it docks at the bottom with peek/full
     detents; above, it docks at the end edge, full height (dock: 'compact').

       <section class="mco-sheet" id="sheet" aria-labelledby="sheet-title" data-state="closed" hidden>
         <div class="mco-sheet-head">
           <button class="mco-sheet-grip" aria-label="Expand details" aria-expanded="false"></button>
           <h2 class="mco-sheet-title" id="sheet-title" tabindex="-1">…</h2>
           <button class="modal-close" data-close-sheet aria-label="Close">×</button>
         </div>
         <div class="mco-sheet-body">…</div>
       </section>

       var sheet = MCO.initSheet({
         sheet: el,
         peekHeight: 'auto',   // 'auto' = head + the body's [data-peek] block, measured; or px
         dismissible: true,    // drag below peek / Esc closes
         publishMetric: true,  // --sheet-h on <html> (MCO.metrics) while bottom-docked
         inertRoots: null,     // made inert in the FULL detent on compact (modal there);
                               // default: everything beside the sheet's ancestor chain
         onState: function (state) {},   // 'closed' | 'peek' | 'full'
       });
       sheet.open('peek', { opener: dotButton });   // → {open, close, setState, state, destroy}

     - Drag: Pointer Events on the head only (the body scrolls). Release snaps
       to the nearest detent; a fling over 0.5 px/ms goes to the next one; a
       drag below peek dismisses. Instant under reduced motion.
     - Keyboard twin of the drag (§5.8): the grip is a button — Enter/Space
       steps peek ↔ full, ArrowUp/ArrowDown move between detents; aria-expanded
       says which.
     - Focus: open moves it to the title (tabindex=-1); close returns it to the
       opener, else the fallback (opts.fallbackFocus, e.g. the map canvas).
     - Not modal at peek — the map stays usable; modal in full on compact.
     - Height math uses 100dvh, never 100vh. --z-detail tier. */
  MCO.initSheet = function (opts) {
    var sheet = opts.sheet;
    var head = sheet.querySelector('.mco-sheet-head');
    var body = sheet.querySelector('.mco-sheet-body');
    var grip = sheet.querySelector('.mco-sheet-grip');
    var dismissible = opts.dismissible !== false;
    var publish = opts.publishMetric !== false;
    var state = 'closed';
    var hideTimer = null;
    var MS = 220;

    function bottomDocked() { return MCO.viewport.isCompact(); }
    function inertRoots() {
      if (!(bottomDocked() && state === 'full')) return [];
      return opts.inertRoots || MCO.overlay.siblingsOf(sheet);
    }
    var ov = MCO.overlay({
      el: sheet,
      initialFocus: opts.initialFocus || '.mco-sheet-title',
      inert: [],
      fallbackFocus: opts.fallbackFocus || null,
      onClose: function () { finishClose(); },
    });

    function metric() {
      if (!publish) return;
      MCO.metrics.set('--sheet-h', state !== 'closed' && bottomDocked() ? sheet.getBoundingClientRect().height : 0);
    }
    function syncPeek() {
      if (opts.peekHeight != null && opts.peekHeight !== 'auto') {
        sheet.style.setProperty('--sheet-peek-h', opts.peekHeight + 'px');
        return;
      }
      var mark = body && body.querySelector('[data-peek]');
      var need = mark ? mark.getBoundingClientRect().bottom - body.getBoundingClientRect().top : 0;
      sheet.style.setProperty('--sheet-peek-h', Math.round(head.offsetHeight + Math.max(0, need) + 12) + 'px');
    }
    function apply(next) {
      state = next;
      sheet.dataset.state = next;
      if (grip) {
        grip.setAttribute('aria-expanded', String(next === 'full'));
        grip.setAttribute('aria-label', next === 'full' ? 'Collapse details' : 'Expand details');
      }
      if (next === 'peek') syncPeek();
      if (ov.isOpen()) ov.setInert(inertRoots());
      metric();
      setTimeout(metric, MCO.reducedMotion() ? 0 : MS + 20);   // max-height animates
      if (opts.onState) opts.onState(next);
    }
    function open(st, o) {
      st = st === 'full' || !bottomDocked() ? 'full' : 'peek';
      clearTimeout(hideTimer);
      var wasOpen = state !== 'closed';
      sheet.hidden = false;
      if (!wasOpen) {
        sheet.classList.add('is-entering');
        void sheet.offsetWidth;
        requestAnimationFrame(function () { sheet.classList.remove('is-entering'); });
      }
      apply(st);
      if (!wasOpen) { ov.open({ opener: o && o.opener }); ov.setInert(inertRoots()); }
      else if (o && o.focus !== false) {
        var t = sheet.querySelector('.mco-sheet-title');
        if (t) t.focus({ preventScroll: true });
      }
      if (body) body.scrollTop = 0;
    }
    function finishClose() {
      sheet.classList.add('is-leaving');
      state = 'closed';
      sheet.dataset.state = 'closed';
      if (grip) grip.setAttribute('aria-expanded', 'false');
      metric();
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () {
        if (state !== 'closed') return;
        sheet.hidden = true;
        sheet.classList.remove('is-leaving');
      }, MCO.reducedMotion() ? 0 : MS);
      if (opts.onState) opts.onState('closed');
    }
    function close(o) {
      if (state === 'closed') return;
      ov.close({ restoreFocus: !o || o.restoreFocus !== false });
    }
    function setState(s) {
      if (s === 'closed') { close(); return; }
      if (state === 'closed') { open(s); return; }
      apply(s === 'full' || !bottomDocked() ? 'full' : 'peek');
    }

    // Grip: the keyboard twin of the drag.
    function onGrip() { setState(state === 'full' ? 'peek' : 'full'); }
    function onGripKey(e) {
      if (e.key === 'ArrowUp') { e.preventDefault(); setState('full'); }
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (state === 'full') setState('peek');
        else if (dismissible) close();
      }
    }
    function onClick(e) { if (e.target.closest('[data-close-sheet]')) close(); }

    // Drag on the head; the body keeps its own scrolling.
    var drag = null;
    function onDown(e) {
      if (!bottomDocked() || e.target.closest('[data-close-sheet]')) return;
      // No pointer capture yet: capturing on pointerdown retargets a TAP's
      // click away from the grip button. Capture once it is really a drag.
      drag = { y0: e.clientY, t0: performance.now(), h: sheet.offsetHeight, moved: false, id: e.pointerId };
    }
    function onMove(e) {
      if (!drag) return;
      var dy = e.clientY - drag.y0;
      if (!drag.moved && Math.abs(dy) > 3) {
        drag.moved = true;
        try { head.setPointerCapture(drag.id); } catch (err) {}
        sheet.style.transition = 'none';
      }
      if (!drag.moved) return;
      if (dy < -24 && state === 'peek') { apply('full'); drag.y0 = e.clientY; }
      sheet.style.transform = 'translateY(' + Math.max(0, dy) + 'px)';
    }
    function onUp(e) {
      if (!drag) return;
      var d = drag; drag = null;
      var dy = e.clientY - d.y0;
      var v = dy / Math.max(1, performance.now() - d.t0);    // px/ms
      sheet.style.transition = '';
      sheet.style.transform = '';
      if (!d.moved) return;                                  // a tap: the grip's click handles it
      if (dy > Math.min(96, d.h * 0.3) || v > 0.5) {
        if (state === 'full' && dy < d.h * 0.6 && v <= 1.2) apply('peek');
        else if (dismissible) close();
        else apply('peek');
      } else if (v < -0.5) {
        apply('full');
      }
    }

    if (grip) { grip.addEventListener('click', onGrip); grip.addEventListener('keydown', onGripKey); }
    sheet.addEventListener('click', onClick);
    head.addEventListener('pointerdown', onDown);
    head.addEventListener('pointermove', onMove);
    head.addEventListener('pointerup', onUp);
    head.addEventListener('pointercancel', onUp);
    sheet.addEventListener('transitionend', function (e) { if (e.target === sheet) metric(); });
    var unsub = MCO.viewport.onChange(function () {
      if (state === 'closed') { metric(); return; }
      if (!bottomDocked()) apply('full'); else apply(state);
    });

    return {
      open: open, close: close, setState: setState,
      state: function () { return state; },
      destroy: function () {
        close({ restoreFocus: false });
        unsub();
        if (grip) { grip.removeEventListener('click', onGrip); grip.removeEventListener('keydown', onGripKey); }
        sheet.removeEventListener('click', onClick);
        head.removeEventListener('pointerdown', onDown);
        head.removeEventListener('pointermove', onMove);
        head.removeEventListener('pointerup', onUp);
        head.removeEventListener('pointercancel', onUp);
      },
    };
  };

  /* ── Loading (0.9.0) ───────────────────────────────────────────────────────
     var load = MCO.loading(mapWrap, { label: 'Loading stations', place: 'over' });
     load.start();  … load.done();  or  load.fail('Station data failed to load.', { retry: boot });
     - aria-busy on the container while loading.
     - The .mco-progress bar appears only after 300 ms, so a fast load never
       flashes it. The container must be positioned (the bar pins to its top).
     - Starting is never announced (noise). A load past 8 s announces "Still
       loading…" once; fail() announces through its danger notice, with a
       Retry button when you pass retry. */
  MCO.loading = function (container, opts) {
    opts = opts || {};
    var label = opts.label || 'Loading';
    var bar = document.createElement('div');
    bar.className = 'mco-progress';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', label);
    bar.hidden = true;
    container.appendChild(bar);
    var showTimer = null, slowTimer = null, notice = null;
    function clear() { clearTimeout(showTimer); clearTimeout(slowTimer); bar.hidden = true; container.removeAttribute('aria-busy'); }
    return {
      element: bar,
      start: function () {
        clear();
        if (notice) { notice.close(); notice = null; }
        container.setAttribute('aria-busy', 'true');
        showTimer = setTimeout(function () { bar.hidden = false; }, opts.delayMs != null ? opts.delayMs : 300);
        slowTimer = setTimeout(function () { MCO.announce('Still loading. ' + label + '…'); }, opts.slowMs || 8000);
      },
      progress: function (pct) {
        bar.setAttribute('aria-valuenow', String(Math.round(pct)));
        bar.style.setProperty('--progress', String(Math.max(0, Math.min(100, pct))));
      },
      done: function () { clear(); if (notice) { notice.close(); notice = null; } },
      fail: function (msg, o) {
        clear();
        var retry = o && o.retry;
        notice = MCO.notice({
          tone: 'danger', text: msg, container: container, place: opts.place,
          action: retry ? { label: 'Retry', onClick: function () { notice.close(); notice = null; retry(); } } : null,
        });
        return notice;
      },
    };
  };

  /* ── Stepper (0.9.0) ───────────────────────────────────────────────────────
     Prev/next buttons for a date or hour:
       var step = MCO.initStepper({ prev, next,
         onStep: function (d) { date = MCO.shiftDate(date, d); render(); },
         canStep: function (d) { return d < 0 ? date > MIN : date < MAX; } });
     Click and Enter/Space step once; a held pointer repeats (400 ms, then
     every 80 ms — a steady rate, no acceleration). Buttons are disabled at
     the bounds (refresh() after outside changes). Pair with a role=status
     readout of the new value. Buttons: .nav-btn.mco-step. */
  MCO.initStepper = function (opts) {
    var canStep = opts.canStep || function () { return true; };
    var repeat = opts.repeat !== false;
    var holdTimer = null, held = false;
    function refresh() {
      if (opts.prev) opts.prev.disabled = !canStep(-1);
      if (opts.next) opts.next.disabled = !canStep(1);
    }
    function step(d) {
      if (!canStep(d)) { stop(); return; }
      opts.onStep(d);
      refresh();
    }
    function stop() { clearTimeout(holdTimer); holdTimer = null; }
    function wire(btn, d) {
      if (!btn) return;
      btn.addEventListener('click', function () {
        if (held) { held = false; return; }   // the pointer hold already stepped
        step(d);
      });
      if (!repeat) return;
      btn.addEventListener('pointerdown', function (e) {
        if (e.button !== 0 || btn.disabled) return;
        held = true;
        step(d);
        var tick = function () { if (btn.disabled) { stop(); return; } step(d); holdTimer = setTimeout(tick, 80); };
        holdTimer = setTimeout(tick, 400);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { btn.addEventListener(ev, stop); });
    }
    wire(opts.prev, -1);
    wire(opts.next, 1);
    refresh();
    return { refresh: refresh };
  };

  // Chips and other multi-selects: a copy of arr with v added or removed.
  MCO.toggleIn = function (arr, v) {
    var i = arr.indexOf(v);
    return i === -1 ? arr.concat([v]) : arr.slice(0, i).concat(arr.slice(i + 1));
  };

  /* ── Segmented fallback (0.9.0) ────────────────────────────────────────────
     A segmented group that doesn't fit below 1060px becomes a <select>
     (photo explorer's pattern), with one source of truth:
       MCO.initSegmentedFallback({ group, select, onChange: function (v) {} });
     group: a .seg-btns.is-radio fieldset (radios) or .seg-btns of
     [data-value][aria-pressed] buttons. Each mirrors the other, [hidden] goes
     on whichever isn't in use, and focus moves across when a breakpoint flip
     hides the focused one. Breakpoints come from the ladder only (§3).
     Returns {value, set, destroy}. */
  MCO.initSegmentedFallback = function (opts) {
    var group = opts.group, select = opts.select;
    var mq = window.matchMedia(opts.mq || '(max-width: 1060px)');
    function radios() { return Array.prototype.slice.call(group.querySelectorAll('input[type="radio"]')); }
    function buttons() { return Array.prototype.slice.call(group.querySelectorAll('[data-value]')); }
    function value() {
      var r = radios().filter(function (x) { return x.checked; })[0];
      if (r) return r.value;
      var b = buttons().filter(function (x) { return x.getAttribute('aria-pressed') === 'true'; })[0];
      return b ? b.dataset.value : select.value;
    }
    function set(v, notify) {
      radios().forEach(function (x) { x.checked = x.value === v; });
      buttons().forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.value === v)); });
      select.value = v;
      if (notify && opts.onChange) opts.onChange(v);
    }
    function onGroup(e) {
      var t = e.target.closest('input[type="radio"], [data-value]');
      if (!t) return;
      set(t.value || t.dataset.value, true);
    }
    function onSelect() { set(select.value, true); }
    function layout() {
      var narrow = mq.matches;
      var hadFocus = (narrow ? group : select).contains(document.activeElement);
      group.hidden = narrow;
      select.hidden = !narrow;
      if (hadFocus) {
        if (narrow) select.focus();
        else {
          var v = value();
          var to = radios().filter(function (x) { return x.value === v; })[0] ||
                   buttons().filter(function (x) { return x.dataset.value === v; })[0];
          if (to) to.focus();
        }
      }
    }
    group.addEventListener(radios().length ? 'change' : 'click', onGroup);
    select.addEventListener('change', onSelect);
    mq.addEventListener('change', layout);
    set(value(), false);
    layout();
    return {
      value: value,
      set: function (v) { set(v, false); },
      destroy: function () {
        group.removeEventListener('change', onGroup);
        group.removeEventListener('click', onGroup);
        select.removeEventListener('change', onSelect);
        mq.removeEventListener('change', layout);
      },
    };
  };

  /* ── Info modal (native <dialog>) ──────────────────────────────────────────
     Opener-captured focus restore (works with multiple openers), backdrop
     click to close, [data-close-modal] delegation for close buttons. */
  MCO.initInfoModal = function (opts) {
    var dialog = opts.dialog;
    var trigger = opts.trigger;
    var opener = null;

    function open() {
      opener = document.activeElement;
      dialog.showModal();
    }
    if (trigger) trigger.addEventListener('click', open);
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog || e.target.dataset.closeModal !== undefined) dialog.close();
    });
    dialog.addEventListener('close', function () {
      if (opener && opener.focus) opener.focus();  // a11y: return focus to the opener
      opener = null;
    });
    return { open: open, close: function () { dialog.close(); } };
  };

  /* ── Collapsible panel ─────────────────────────────────────────────────────
     Wires a toggle button (gets aria-expanded) to a body element (gets
     [hidden]). Optional persistence and compact-viewport auto-collapse: on a
     phone the panel starts collapsed unless the user has expressed a
     preference — persisted or URL-driven state should win, so pass
     startCollapsed explicitly when you have one. */
  MCO.initCollapsible = function (opts) {
    var toggle = opts.toggle;
    var body = opts.body;
    var storageKey = opts.storageKey || null;
    var onChange = opts.onChange || null;

    var collapsed = false;
    if (typeof opts.startCollapsed === 'boolean') {
      collapsed = opts.startCollapsed;
    } else if (storageKey && MCO.lsGet(storageKey) != null) {
      collapsed = MCO.lsGet(storageKey) === '1';
    } else if (opts.autoCollapseOnCompact && MCO.viewport.isCompact()) {
      collapsed = true;
    }

    // Collapse animates (slide + fade via .is-collapsing in mco-theme.css),
    // THEN sets [hidden] so collapsed content leaves the tab order and the
    // accessibility tree. The timeout is a fallback in case transitionend
    // never fires (display flips, interrupted transitions).
    var ANIM_FALLBACK_MS = 300;
    function apply(persist, animate) {
      toggle.setAttribute('aria-expanded', String(!collapsed));
      if (persist && storageKey) MCO.lsSet(storageKey, collapsed ? '1' : '0');
      if (collapsed) {
        body.classList.add('is-collapsing');
        if (animate) {
          var done = false;
          var finish = function () {
            if (done) return;
            done = true;
            if (collapsed) body.hidden = true;   // unless re-expanded mid-animation
          };
          body.addEventListener('transitionend', function h(e) {
            if (e.target !== body) return;
            body.removeEventListener('transitionend', h);
            finish();
          });
          setTimeout(finish, ANIM_FALLBACK_MS);
        } else {
          body.hidden = true;
        }
      } else {
        body.hidden = false;
        if (animate) {
          body.classList.add('is-collapsing');
          void body.offsetHeight;                // reflow: start from collapsed
        }
        body.classList.remove('is-collapsing');
      }
      if (onChange) onChange(collapsed);
    }
    toggle.addEventListener('click', function () {
      collapsed = !collapsed;
      apply(true, true);
    });
    apply(false, false);

    return {
      isCollapsed: function () { return collapsed; },
      collapse: function () { collapsed = true; apply(true, true); },
      expand: function () { collapsed = false; apply(true, true); },
    };
  };

  /* ── Collapsible search ────────────────────────────────────────────────────
     Below MCO.SEARCH_COLLAPSE_MQ a navbar search field collapses into a
     disclosure button and expands as an overlay bar (styling in mco-theme.css
     §5). Keep this string in sync with the 640px block there. It matches the
     ladder's compact edge but is width-only: MCO.viewport.COMPACT_MQ also fires
     on short landscape windows, which are still wide enough for the field.

       var searchCtl = MCO.initSearchCollapse({
         wrap: document.getElementById('search-wrap'),
         toggle: document.getElementById('btn-search-toggle'),
         input: searchInput,
         onClose: hideSearchDropdown,      // app clears its own suggestions
       });

     The app keeps control of Esc precedence and of its `/` shortcut:
       if (searchCtl.isCollapsed()) searchCtl.open(); else input.focus();
     Returns {isCollapsed, isOpen, open, close, destroy}. */
  MCO.SEARCH_COLLAPSE_MQ = '(max-width: 640px)';

  MCO.initSearchCollapse = function (opts) {
    var wrap = opts.wrap;
    var toggle = opts.toggle;
    var input = opts.input;
    var onClose = opts.onClose || null;
    var mq = window.matchMedia(opts.mq || MCO.SEARCH_COLLAPSE_MQ);

    function isOpen() { return wrap.classList.contains('is-open'); }

    function open() {
      wrap.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      if (input) { input.focus(); if (input.select) input.select(); }
    }

    // restoreFocus: false when something else is about to take focus (a dialog
    // opening), so we don't yank it back to the toggle first.
    function close(o) {
      if (!isOpen()) return;
      wrap.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      if (onClose) onClose();
      if (input) input.value = '';
      if (!o || o.restoreFocus !== false) toggle.focus();
    }

    function onToggle() { if (isOpen()) close(); else open(); }
    // Pointerdown outside the overlay dismisses it (map, another control).
    function onDocDown(e) {
      if (!isOpen()) return;
      if (wrap.contains(e.target) || toggle.contains(e.target)) return;
      close({ restoreFocus: false });
    }
    // Widening past the breakpoint puts the field back in the bar — drop the
    // overlay state so aria-expanded can't go stale on a now-hidden toggle.
    function onMq() { close({ restoreFocus: false }); }

    toggle.addEventListener('click', onToggle);
    document.addEventListener('pointerdown', onDocDown);
    mq.addEventListener('change', onMq);

    return {
      isCollapsed: function () { return mq.matches; },
      isOpen: isOpen,
      open: open,
      close: close,
      destroy: function () {
        toggle.removeEventListener('click', onToggle);
        document.removeEventListener('pointerdown', onDocDown);
        mq.removeEventListener('change', onMq);
      },
    };
  };

  /* ── Search model (0.8.0) ──────────────────────────────────────────────────
     Pure filtering + ranking for MCO.initSearchBox, ported from the
     mesonet-dashboard's comboboxModel (unit-tested there). No DOM.
       items: [{id, label, group?, keywords?, meta?}]
       MCO.searchModel.filter(items, q, limit) → {groups, flat, total, best}
     Matching is case-, accent- and apostrophe-blind ("Apsáalooke", "Rocky
     Boy's" match plain typing). Rank, best first: exact label/id/keyword ·
     label starts with the query as a whole word · label prefix · a later
     word starts with it · id/keyword prefix · label substring · id/keyword
     substring · a typo (1 edit from 5 letters, 2 from 8; numbers never).
     With no query, every item in its group, groups in first-appearance
     order; with a query, one ranked list (shorter label, then alphabetical,
     breaks ties). `best` indexes the top match in `flat`. */
  var SM = MCO.searchModel = {};
  SM.normalize = function (s) {
    return String(s).normalize('NFD').replace(/\p{M}/gu, '').replace(/['’`]/g, '').toLowerCase();
  };
  // Optimal-string-alignment distance, or max + 1 as soon as it must exceed max.
  SM.typoDistance = function (a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev2 = [];
    var prev = [];
    for (var j = 0; j <= b.length; j++) prev.push(j);
    for (var i = 1; i <= a.length; i++) {
      var cur = [i];
      var rowMin = i;
      for (j = 1; j <= b.length; j++) {
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur.push(v);
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev;
      prev = cur;
    }
    return prev[b.length];
  };
  function typoMatch(q, texts) {
    if (q.length < 4 || /^[\d\s]+$/.test(q)) return false;
    var max = q.length >= 8 ? 2 : 1;
    var prefixes = q.length >= 5;
    return texts.some(function (t) {
      if (SM.typoDistance(q, t, max) <= max) return true;
      return prefixes && t.length > q.length && SM.typoDistance(q, t.slice(0, q.length), max) <= max;
    });
  }
  SM.matchRank = function (item, q) {
    if (q === '') return 0;
    var label = SM.normalize(item.label);
    var codes = [item.id].concat(item.keywords || []).map(SM.normalize);
    if (label === q || codes.indexOf(q) !== -1) return 0;
    if (label.indexOf(q) === 0) return /[\p{L}\p{N}]/u.test(label.charAt(q.length)) ? 2 : 1;
    var words = label.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (words.some(function (w) { return w.indexOf(q) === 0; })) return 3;
    if (codes.some(function (c) { return c.indexOf(q) === 0; })) return 4;
    if (label.indexOf(q) !== -1) return 5;
    if (codes.some(function (c) { return c.indexOf(q) !== -1; })) return 6;
    if (typoMatch(q, words.concat([label], codes))) return 7;
    return Infinity;
  };
  SM.filter = function (items, query, limit) {
    limit = limit == null ? 200 : limit;
    var q = SM.normalize(String(query || '').trim());
    var groupIndex = new Map();
    items.forEach(function (it) { if (!groupIndex.has(it.group)) groupIndex.set(it.group, groupIndex.size); });
    var matches = items.map(function (item, index) {
      return { item: item, index: index, rank: SM.matchRank(item, q), group: groupIndex.get(item.group) };
    }).filter(function (m) { return m.rank !== Infinity; });
    matches.sort(function (a, b) {
      if (q === '') return a.group - b.group || a.index - b.index;
      return a.rank - b.rank || a.item.label.length - b.item.label.length ||
        a.item.label.localeCompare(b.item.label) || a.index - b.index;
    });
    var kept = matches.slice(0, Math.max(0, limit));
    var flat = kept.map(function (m) { return m.item; });
    var best = kept.length ? 0 : -1;
    kept.forEach(function (m, i) { if (m.rank < kept[best].rank) best = i; });
    var groups = [];
    flat.forEach(function (item) {
      var name = q === '' && item.group != null ? item.group : null;
      var last = groups[groups.length - 1];
      if (last && last.name === name) last.items.push(item);
      else groups.push({ name: name, items: [item] });
    });
    return { groups: groups, flat: flat, total: matches.length, best: best };
  };
  // Next active index for a navigation key over `length` options.
  SM.stepIndex = function (current, key, length) {
    if (length <= 0) return -1;
    if (key === 'ArrowDown') return current < 0 || current >= length - 1 ? 0 : current + 1;
    if (key === 'ArrowUp') return current <= 0 ? length - 1 : current - 1;
    if (key === 'Home') return 0;
    if (key === 'End') return length - 1;
    return current;
  };
  SM.summary = function (shown, total) {
    if (total === 0) return 'No results';
    if (shown < total) return 'Showing ' + shown + ' of ' + total + ' results; type to narrow';
    return total === 1 ? '1 result' : total + ' results';
  };

  /* ── Search combobox (0.8.0) ───────────────────────────────────────────────
     The APG editable combobox with list autocomplete, on the dashboard's
     model. Five map apps hand-rolled this; their defects differed (a "no
     match" row with no role, aria-selected missing, no count announcement).

       <div class="mco-search">
         <span class="mco-search-icon" aria-hidden="true"></span>
         <label for="q" class="sr-only">Search stations</label>
         <input id="q" class="mco-search-input" type="search" placeholder="Search…">
         <div class="mco-search-list" hidden></div>
       </div>

       var sb = MCO.initSearchBox({
         input: q, listbox: list,             // the kit wires role/aria-* on both
         items: function () { return stations.map(function (s) {
           return { id: s.station, label: s.name, group: s.network }; }); },
         onSelect: function (id) { openStation(id); },
         value: function () { return selectedId; },   // marks the current item ✓
         label: 'Stations', limit: 200, announce: true,
       });

     Keys: Down/Up open the list and wrap (Alt+Down opens in place);
     Home/End move only while navigating; Enter selects the active option;
     Esc closes and restores the text from before the list opened, or clears
     the text when the list is already closed, and stops propagation so an
     enclosing dialog or detail doesn't close too — a third Esc passes
     through. Typing makes the best match active. Focus leaving closes it.
     renderRow(item, el) customizes an option; use textContent only (the
     default is the label plus a mono item.meta || item.id). Counts are
     announced politely, debounced. After a selection the field empties
     (fillOnSelect: true leaves the label in it).
     Returns {open, close, refresh, destroy}. Composes with
     MCO.initSearchCollapse unchanged: pass sb.close as its onClose. */
  var _sbSeq = 0;
  MCO.initSearchBox = function (opts) {
    var input = opts.input;
    var list = opts.listbox;
    var limit = opts.limit || 200;
    var label = opts.label || 'Search';
    var announce = opts.announce !== false;
    var getItems = typeof opts.items === 'function' ? opts.items : function () { return opts.items || []; };
    var value = opts.value || function () { return null; };
    var base = list.id || ('mco-search-' + (++_sbSeq));
    list.id = base;

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', base);
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    list.setAttribute('role', 'listbox');
    if (!list.hasAttribute('aria-label') && !list.hasAttribute('aria-labelledby')) list.setAttribute('aria-label', label);
    list.hidden = true;

    var isOpen = false;
    var active = -1;
    var result = { groups: [], flat: [], total: 0, best: -1 };
    var textBeforeOpen = '';
    var announceTimer = null;

    function optionId(i) { return base + '-opt-' + i; }
    function compute() { result = SM.filter(getItems(), input.value, limit); }

    function render() {
      list.textContent = '';
      var cur = value();
      var idx = 0;
      result.groups.forEach(function (g, gi) {
        var host = list;
        if (g.name != null) {
          host = document.createElement('div');
          host.setAttribute('role', 'group');
          var head = document.createElement('div');
          head.className = 'mco-search-group';
          head.id = base + '-g-' + gi;
          head.setAttribute('role', 'presentation');
          head.textContent = g.name;
          host.setAttribute('aria-labelledby', head.id);
          host.appendChild(head);
          list.appendChild(host);
        }
        g.items.forEach(function (item) {
          var el = document.createElement('div');
          el.className = 'mco-search-option';
          el.id = optionId(idx);
          el.setAttribute('role', 'option');
          el.setAttribute('aria-selected', String(idx === active));
          el.dataset.index = String(idx);
          if (cur != null && item.id === cur) el.classList.add('is-current');
          if (opts.renderRow) {
            opts.renderRow(item, el);
          } else {
            var l = document.createElement('span');
            l.className = 'mco-search-label';
            l.textContent = item.label;
            var m = document.createElement('span');
            m.className = 'mco-search-meta';
            m.textContent = item.meta != null ? item.meta : item.id;
            el.append(l, m);
          }
          host.appendChild(el);
          idx++;
        });
      });
      // The empty row and the truncation note are disabled OPTIONS, not bare
      // rows: a listbox may only own options and groups.
      var note = result.total === 0 ? 'No matches'
        : result.flat.length < result.total ? 'Showing ' + result.flat.length + ' of ' + result.total + '; type to narrow' : '';
      if (note) {
        var n = document.createElement('div');
        n.className = 'mco-search-note';
        n.setAttribute('role', 'option');
        n.setAttribute('aria-disabled', 'true');
        n.setAttribute('aria-selected', 'false');
        n.textContent = note;
        list.appendChild(n);
      }
      syncActive();
    }
    function syncActive() {
      var opts_ = list.querySelectorAll('.mco-search-option');
      Array.prototype.forEach.call(opts_, function (el) {
        el.setAttribute('aria-selected', String(Number(el.dataset.index) === active));
      });
      var el = active >= 0 ? document.getElementById(optionId(active)) : null;
      if (isOpen && el) {
        input.setAttribute('aria-activedescendant', el.id);
        el.scrollIntoView({ block: 'nearest' });
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }
    function say() {
      if (!announce) return;
      clearTimeout(announceTimer);
      announceTimer = setTimeout(function () {
        if (isOpen) MCO.announce(SM.summary(result.flat.length, result.total));
      }, 400);
    }
    function open(at) {
      if (!isOpen) textBeforeOpen = input.value;
      isOpen = true;
      compute();
      var cur = value();
      var curIdx = -1;
      result.flat.forEach(function (it, i) { if (curIdx < 0 && it.id === cur) curIdx = i; });
      var n = result.flat.length;
      // Typed text: the best match. Empty field: the current item, else the first.
      active = !n || at === 'none' ? -1 : at === 'last' ? n - 1 : input.value ? result.best : Math.max(0, curIdx);
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      render();
      say();
    }
    function close() {
      if (!isOpen) return;
      isOpen = false;
      active = -1;
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      clearTimeout(announceTimer);
    }
    function select(i) {
      var item = result.flat[i];
      if (!item) return;
      close();
      input.value = opts.fillOnSelect ? item.label : '';
      if (opts.onSelect) opts.onSelect(item.id);
    }

    function onInput() {
      if (!isOpen) { textBeforeOpen = ''; isOpen = true; list.hidden = false; input.setAttribute('aria-expanded', 'true'); }
      compute();
      active = result.best;
      render();
      say();
    }
    function onKeydown(e) {
      var n = result.flat.length;
      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowUp':
          e.preventDefault();
          if (!isOpen) open(e.altKey ? 'none' : e.key === 'ArrowUp' ? 'last' : 'current');
          else if (!e.altKey) { active = SM.stepIndex(active, e.key, n); syncActive(); }
          return;
        case 'Home':
        case 'End':
          if (!isOpen || active < 0) return;      // leave the text caret alone
          e.preventDefault();
          active = SM.stepIndex(active, e.key, n);
          syncActive();
          return;
        case 'Enter':
          if (!isOpen || active < 0) return;
          e.preventDefault();
          select(active);
          return;
        case 'Escape':
          if (isOpen) {
            input.value = textBeforeOpen;
            close();
          } else if (input.value !== '') {
            input.value = '';
          } else {
            return;                               // pass: the enclosing surface closes
          }
          e.preventDefault();
          e.stopPropagation();
          return;
        default:
      }
    }
    function onListDown(e) { e.preventDefault(); }   // keep focus in the field
    function onListClick(e) {
      var el = e.target.closest('.mco-search-option');
      if (el) select(Number(el.dataset.index));
    }
    function onFocusOut(e) {
      var to = e.relatedTarget;
      if (to && (to === input || list.contains(to))) return;
      close();
    }

    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeydown);
    input.addEventListener('focusout', onFocusOut);
    list.addEventListener('mousedown', onListDown);
    list.addEventListener('click', onListClick);

    return {
      open: function () { input.focus(); open('current'); },
      close: close,
      // Items changed while the list is open (data arrived): re-filter.
      refresh: function () { if (isOpen) { compute(); active = Math.min(active, result.flat.length - 1); render(); } },
      destroy: function () {
        close();
        input.removeEventListener('input', onInput);
        input.removeEventListener('keydown', onKeydown);
        input.removeEventListener('focusout', onFocusOut);
        list.removeEventListener('mousedown', onListDown);
        list.removeEventListener('click', onListClick);
      },
    };
  };

  /* ── URL state ─────────────────────────────────────────────────────────────
     Convention (HOUSE-STYLE.md §4): read once at boot with precedence
     URL param > localStorage > default, validating every value; mirror state
     back on every mutation and map moveend. Two writers (0.8.0):
       replaceUrlState — view adjustments: camera, filters, theme, date.
       pushUrlState    — drill-down, where Back should undo: a station detail
                         opening from a "no detail" state, a section switch.
     onUrlState(fn) is the read side for Back/Forward. */

  MCO.urlParams = function () { return new URLSearchParams(location.search); };

  MCO.getParamLower = function (key, params) {
    var v = (params || MCO.urlParams()).get(key);
    return v == null ? null : v.toLowerCase();
  };

  // Split a list param on commas/whitespace ('+' arrives as a space).
  MCO.splitTokens = function (raw) {
    return raw == null ? null
      : raw.split(/[,\s]+/).filter(Boolean).map(function (s) { return s.toLowerCase(); });
  };

  // The URL for params: a clean pathname (no '?') when params is empty, so an
  // all-defaults view has a tidy URL. keepHash carries the current #fragment
  // over (a tab kept in the hash); without it the hash is dropped, as before
  // 0.8.0 — the default flips to keeping it in 1.0.0.
  function urlFor(params, opts) {
    var qs = new URLSearchParams(params).toString();
    return location.pathname + (qs ? '?' + qs : '') + (opts && opts.keepHash ? location.hash : '');
  }

  // Mirror state into the query string without adding a history entry.
  // history.state is kept (0.8.0; it used to be nulled), so a replace while a
  // pushed detail is open doesn't erase what pushUrlState stored. Pass
  // {state} to set it.
  MCO.replaceUrlState = function (params, opts) {
    var state = opts && 'state' in opts ? opts.state : history.state;
    history.replaceState(state, '', urlFor(params, opts));
  };

  // A new history entry, so Back undoes it (0.8.0). For drill-down only: push
  // on the FIRST step from a "no detail" state and replace while the detail
  // stays open, or every station click floods the history (§4). {state} is
  // stored on the entry — mark it ({mcoDetail: id}) so a close button can
  // tell it may history.back() instead of leaving a dead entry behind.
  MCO.pushUrlState = function (params, opts) {
    history.pushState(opts && 'state' in opts ? opts.state : null, '', urlFor(params, opts));
  };

  // Back/Forward: fn(URLSearchParams, hash, state) whenever the URL changes
  // under the app — popstate, and hashchange for a hand-edited fragment. One
  // navigation fires both events in some browsers; fn runs once per distinct
  // URL. The app re-applies its state from the params, closes or opens its
  // detail, and announces the restored view (§5.1). Note the skip link
  // changes the hash to #main: ignore hashes that aren't yours. Returns an
  // unsubscribe function.
  MCO.onUrlState = function (fn) {
    // A fragment navigation fires popstate, then hashchange, for one URL:
    // remember what popstate delivered and skip only that paired hashchange.
    var popped = null;
    function deliver() {
      fn(new URLSearchParams(location.search), location.hash, history.state);
    }
    function onPop() { popped = location.href; deliver(); }
    function onHash() {
      var paired = popped === location.href;
      popped = null;
      if (!paired) deliver();
    }
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onHash);
    return function () {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onHash);
    };
  };
})();
