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
  // The theme a visitor with no saved or URL choice gets: the OS preference,
  // as the anti-flash snippet resolves it. Compare against it to keep a
  // default theme out of the URL — write ?theme= only when the current theme
  // differs (0.8.0; was identical copies in three consumers).
  MCO.osTheme = function () {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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
