/* ============================================================================
   mco-web-style · core/mco-core.js · v0.1.0
   Framework-free shared utilities for Montana Climate Office web apps.

   Classic script (no ESM, no build, zero dependencies) — load it with a
   pinned, SRI-hashed <script> tag BEFORE your app script; everything lands
   on window.MCO. Extracted from the mesonet-explorer / mesonet-status /
   mco-mesonet-photos / mco-snowpack-explorer family; canonical behaviors
   documented in HOUSE-STYLE.md.

   Contents: constants · storage · strings · Mountain-time helpers · fetch ·
   reduced motion (live) · viewport (compact/touch) · toast · theme ·
   live region · info modal · collapsible · URL state.
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
  // UTC-12 (found in the mco-mesonet-photos migration).
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
     KEEP THE QUERY IN SYNC with the breakpoint comment in mco-theme.css §6.
     Stamps .is-compact / .is-touch on <html> for CSS hooks. */
  var COMPACT_MQ = '(max-width: 640px), (max-height: 560px)';
  var _compactMq = window.matchMedia(COMPACT_MQ);
  var _touchMq = window.matchMedia('(hover: none)');
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
  _emitViewport(); // stamp classes before first paint of JS-built UI

  MCO.viewport = {
    COMPACT_MQ: COMPACT_MQ,
    isCompact: function () { return _compactMq.matches; },
    isTouch: function () { return _touchMq.matches; },
    // Subscribe to compact/touch flips. Returns an unsubscribe function.
    onChange: function (fn) {
      _vpSubs.add(fn);
      return function () { _vpSubs.delete(fn); };
    },
  };

  /* ── Toast ─────────────────────────────────────────────────────────────── */

  // createToast({element?, duration?}) → {show, hide, element}. With no
  // element, one is created and appended to <body> (class .mco-toast, styled
  // by mco-theme.css, announced politely via role="status").
  MCO.createToast = function (opts) {
    opts = opts || {};
    var duration = opts.duration || 2800;
    var el = opts.element;
    if (!el) {
      el = document.createElement('div');
      el.className = 'mco-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    var timer;
    return {
      element: el,
      show: function (msg, ms) {
        clearTimeout(timer);
        el.textContent = msg;
        el.classList.add('visible');
        timer = setTimeout(function () { el.classList.remove('visible'); }, ms || duration);
      },
      hide: function () {
        clearTimeout(timer);
        el.classList.remove('visible');
      },
    };
  };

  // Singleton convenience — most pages want exactly one toast.
  var _toast = null;
  MCO.showToast = function (msg, ms) {
    if (!_toast) _toast = MCO.createToast();
    _toast.show(msg, ms);
  };

  /* ── Theme ─────────────────────────────────────────────────────────────── */

  MCO.getTheme = function () {
    return document.documentElement.dataset.theme || 'dark';
  };
  MCO.setTheme = function (theme, opts) {
    document.documentElement.dataset.theme = theme;
    if (!opts || opts.persist !== false) MCO.lsSet(MCO.THEME_KEY, theme);
  };
  MCO.toggleTheme = function () {
    var next = MCO.getTheme() === 'dark' ? 'light' : 'dark';
    MCO.setTheme(next);
    return next;
  };

  // Wire a theme toggle button. iconSun shows in dark mode ("switch to
  // light"), iconMoon in light mode. Map re-styling, pushState, etc. go in
  // onChange — e.g.:
  //   MCO.initThemeToggle({ button, iconSun, iconMoon, onChange: (t) => {
  //     map.setStyle(MCO.map.cartoStyleUrl());
  //     map.once('style.load', addCustomLayers);   // setStyle wipes sources
  //   }});
  MCO.initThemeToggle = function (opts) {
    var button = opts.button;
    var iconSun = opts.iconSun || null;
    var iconMoon = opts.iconMoon || null;
    var setAriaLabel = opts.setAriaLabel !== false;
    var onChange = opts.onChange || null;

    function sync() {
      var dark = MCO.getTheme() !== 'light';
      if (iconMoon) iconMoon.style.display = dark ? 'none' : '';
      if (iconSun) iconSun.style.display = dark ? '' : 'none';
      if (setAriaLabel) {
        button.setAttribute('aria-label',
          dark ? 'Switch to light theme' : 'Switch to dark theme');
      }
    }
    function toggle() {
      var next = MCO.toggleTheme();
      sync();
      if (onChange) onChange(next);
      return next;
    }
    button.addEventListener('click', toggle);
    sync();
    return { sync: sync, toggle: toggle };
  };

  /* ── Screen-reader live region ─────────────────────────────────────────────
     A polite aria-live region for announcing what just changed on a canvas or
     WebGL surface a screen reader can't see: "42 stations shown", "Station X
     opened". Pair with the hidden-table twin (HOUSE-STYLE.md §5). */
  MCO.createLiveRegion = function () {
    var el = document.createElement('div');
    el.className = 'sr-only';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');   // announce replacements whole
    document.body.appendChild(el);
    return {
      element: el,
      announce: function (text) { el.textContent = text; },
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
     §5). Keep this string in sync with the 460px block there.

       var searchCtl = MCO.initSearchCollapse({
         wrap: document.getElementById('search-wrap'),
         toggle: document.getElementById('btn-search-toggle'),
         input: searchInput,
         onClose: hideSearchDropdown,      // app clears its own suggestions
       });

     The app keeps control of Esc precedence and of its `/` shortcut:
       if (searchCtl.isCollapsed()) searchCtl.open(); else input.focus();
     Returns {isCollapsed, isOpen, open, close, destroy}. */
  MCO.SEARCH_COLLAPSE_MQ = '(max-width: 460px)';

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

  /* ── URL state ─────────────────────────────────────────────────────────────
     Convention (HOUSE-STYLE.md §4): read once at boot with precedence
     URL param > localStorage > default, validating every value; mirror state
     back with replaceUrlState() on every mutation and map moveend. */

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

  // Mirror state into the query string without touching history. Emits a
  // clean pathname (no '?') when params is empty so an all-defaults view has
  // a tidy URL.
  MCO.replaceUrlState = function (params) {
    var qs = new URLSearchParams(params).toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  };
})();
