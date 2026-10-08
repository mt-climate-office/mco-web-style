/* ============================================================================
   mco-web-style · core/mco-core.js · v0.1.0
   Framework-free shared utilities for Montana Climate Office web apps.

   Classic script (no ESM, no build, zero dependencies) — load it with a
   pinned, SRI-hashed <script> tag BEFORE your app script; everything lands
   on window.MCO. Extracted from the mesonet-explorer / mesonet-status /
   mco-mesonet-photos / mco-snowpack-explorer family; canonical behaviors
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
     KEEP THE QUERY IN SYNC in three places: here, the breakpoint comment in
     mco-theme.css §6, and snippets/anti-flash.html.
     Stamps .is-compact / .is-touch on <html> for CSS hooks. The inline
     anti-flash snippet stamps them first (0.7.0), so CSS keyed on them is
     right from first paint; this script — loaded at the end of <body> —
     re-stamps on load and keeps them live across resizes. */
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
  _emitViewport(); // re-stamp (the snippet did first paint) and notify

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
       polite otherwise) rather than by giving the element a live role: a
       role=status inserted together with its message is often not read.
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
    p.append(word, document.createTextNode(String(opts.text || '')));
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
      { politeness: tone === 'danger' ? 'assertive' : 'polite' });

    return { element: el, close: close };
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
