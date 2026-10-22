/* ============================================================================
   mco-web-style · photos/mco-photos.js · v0.1.0
   Mesonet station photos for Montana Climate Office apps: the camera
   schedule, capture slots, frame URLs, the monthly manifests, and a thin
   date / time / direction control built on the kit's stepper and segmented
   fallback.

   Classic script, zero dependencies, no build. Lands on window.MCO.photos.
   Load it AFTER core/mco-core.js: the fetchers use MCO.fetchJSON and
   MCO.promiseCache, and initPhotoControls uses MCO.initStepper,
   MCO.initSegmentedFallback, MCO.urlParams and MCO.announce. The parsers and
   the time helpers need nothing from core except MCO.shiftDate and
   MCO.formatDateStr (called at use, never at load).

   A port of mesonet-dashboard's tested web/src/core/photos (schedule.ts,
   time.ts, archive.ts, fetch.ts), merged with the slot rules
   mesonet-photo-explorer relies on (docs/app.js slotsForDate,
   resolveTimeForDate, dirsForSlot, computeMaxTimestep). Where the two
   disagreed, the resolution is recorded at the function.

   The data lives on data2, not the API (website DECISIONS D6):
     photos/schedule/schedule.json          what each camera shoots, when, since when
     photos/manifest/{sta}/{sta}_{YYYY-MM}.csv   what actually landed, one row per capture
     photos/webp/{large,thumb}/{sta}/{sta}_{TOKEN}_{slot as UTC}.webp
   The capture schedule is NEVER written into this file. Every slot comes
   from schedule.json.

   Public and staff views (D7, D8):
   - The public sees North, East, South and West only, North by default. It
     is an allowlist, so a token the schedule adds later stays staff-only
     until someone adds it here.
   - Before 2026-10-21 16:00 MDT the token N was preset 1, aimed at the
     pluviometer, and S was preset 2, aimed at the snow stake. By default a
     public view starts at that instant in every direction (PUBLIC_SINCE),
     and a public N or S frame from before it is never offered, even when an
     app widens the range with `since` (REAIMED). This is the website's
     photo hero.
   - {fullHistory: true} (0.15.0, D16) is the public opt-in for tools that
     show the whole archive (the Photo Explorer, the Station Dashboard): no
     date floor and no REAIMED block, so pre-cutover N and S appear as
     "North" and "South", as they always did there. It is still public:
     the allowlist below applies unchanged. An explicit `since` still sets
     the floor.
   - Snow, North Snow, South Snow, Pluvio and Solar are staff-only, behind
     {internal: true}. The sky views (NS, SS) are retired history. PARK is the
     camera's rest position and is never a view.
   ========================================================================== */
(function () {
  'use strict';

  var MCO = window.MCO = window.MCO || {};
  MCO.versions = Object.assign(MCO.versions || {}, { photos: '0.1.0' });
  var P = MCO.photos = MCO.photos || {};

  /* ── Constants ─────────────────────────────────────────────────────────── */

  // The archive host. If data2's certificate lapses again, its CloudFront
  // default domain serves the same paths: pass {base} to load(), and allow
  // that host in the page's connect-src and img-src.
  P.BASE = 'https://data2.climate.umt.edu/mesonet/';
  P.SCHEDULE_PATH = 'photos/schedule/schedule.json';
  P.SCHEMA = 1;
  // Camera slots are Mountain wall-clock times. Same value as MCO.TZ.
  P.ZONE = 'America/Denver';

  // Fallback when schedule.json omits `patterns` (the layout as of 2026-10).
  P.DEFAULT_PATTERNS = Object.freeze({
    jpg: 'photos/jpg/{station}/{station}_{token}_{captured_utc}.jpg',
    webp_large: 'photos/webp/large/{station}/{station}_{token}_{slot_utc}.webp',
    webp_thumb: 'photos/webp/thumb/{station}/{station}_{token}_{slot_utc}.webp',
  });

  // A slot's photos are assumed published this long after the wall-clock
  // slot (the Photo Explorer's SLOT_LAG_MINUTES).
  P.LAG_MINUTES = 30;

  // D7. The instant the fleet's N and S were re-aimed at the horizon
  // (schedule.json: every station's current period begins here). Before it,
  // N named the pluviometer and S the snow stake.
  var CUTOVER = '2026-10-21T16:00:00-06:00';
  P.PUBLIC_SINCE = CUTOVER;
  P.REAIMED = Object.freeze({ N: CUTOVER, S: CUTOVER });

  P.DEFAULT_VIEW = 'N';
  P.PUBLIC = Object.freeze(['N', 'E', 'S', 'W']);
  P.HIDDEN = Object.freeze(['PARK']);

  // The vocabulary. `label` is the full name; `short` is segment text, kept
  // inside the accessible name (WCAG 2.5.3) by viewName(). `retired` views
  // exist only in history.
  P.VIEWS = Object.freeze({
    N:      { label: 'North',      short: 'N' },
    E:      { label: 'East',       short: 'E' },
    S:      { label: 'South',      short: 'S' },
    W:      { label: 'West',       short: 'W' },
    SNOW:   { label: 'Snow',       short: 'Snow' },
    NSNOW:  { label: 'North Snow', short: 'N Snow' },
    SSNOW:  { label: 'South Snow', short: 'S Snow' },
    PLUVIO: { label: 'Pluvio',     short: 'Pluvio' },
    SOLAR:  { label: 'Solar',      short: 'Solar' },
    NS:     { label: 'North Sky',  short: 'NS', retired: true },
    SS:     { label: 'South Sky',  short: 'SS', retired: true },
    G:      { label: 'Ground',     short: 'G',  retired: true },
  });
  // Display order: the compass clockwise, then the staff views, then the
  // retired ones. Unknown tokens sort last, alphabetically.
  P.ORDER = Object.freeze(['N', 'E', 'S', 'W', 'SNOW', 'NSNOW', 'SSNOW', 'PLUVIO', 'SOLAR', 'NS', 'SS', 'G']);

  var DAY_MS = 86400000;
  var HOUR_MS = 3600000;
  var MIN_MS = 60000;

  /* ── Vocabulary ────────────────────────────────────────────────────────── */

  function up(token) { return String(token == null ? '' : token).toUpperCase(); }

  P.isPublic = function (token) { return P.PUBLIC.indexOf(up(token)) !== -1; };
  // A view the given audience may see. Staff see everything but PARK.
  P.isVisible = function (token, internal) {
    var t = up(token);
    if (!t || P.HIDDEN.indexOf(t) !== -1) return false;
    return internal ? /^[A-Z0-9]+$/.test(t) : P.isPublic(t);
  };
  // The curated label, else the schedule's `view` name, else the token.
  // Curated wins because the schedule names the sky views literally "NS".
  P.label = function (token, viewName) {
    var v = P.VIEWS[up(token)];
    if (v) return v.label;
    return viewName && viewName !== token ? viewName : String(token);
  };
  P.shortLabel = function (token) {
    var v = P.VIEWS[up(token)];
    return v ? v.short : String(token);
  };
  // The accessible name for a segment: the full label when it starts with
  // the visible text ("North" for "N"), else "N Snow, North Snow" (2.5.3).
  P.viewName = function (token) {
    var s = P.shortLabel(token), full = P.label(token);
    return full.toLowerCase().indexOf(s.toLowerCase()) === 0 ? full : s + ', ' + full;
  };
  P.compareViews = function (a, b) {
    var ra = P.ORDER.indexOf(up(a)), rb = P.ORDER.indexOf(up(b));
    ra = ra < 0 ? 99 : ra; rb = rb < 0 ? 99 : rb;
    return ra - rb || (a < b ? -1 : a > b ? 1 : 0);
  };

  /* ── Mountain wall clock ↔ UTC ─────────────────────────────────────────────
     Archive keys carry UTC instants (YYYYMMDDTHHMMSSZ); the schedule and every
     control carry Mountain wall-clock times, so the offset (−6 h MDT, −7 h
     MST) is read per instant. Intl only. */

  var PARTS_FMT = new Intl.DateTimeFormat('en-US', {
    timeZone: P.ZONE, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  function partsAt(ms) {
    var out = {};
    PARTS_FMT.formatToParts(new Date(ms)).forEach(function (p) {
      if (p.type !== 'literal') out[p.type] = p.value;
    });
    out.hour = pad2(+out.hour % 24);   // some engines write midnight as 24 under h23
    return out;
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  // Zone offset (ms, local − UTC) at instant `ms`.
  function offsetAt(ms) {
    var p = partsAt(ms);
    var asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUtc - ms) / MIN_MS) * MIN_MS;
  }

  // 'YYYY-MM-DD' + 'HH:MM[:SS]' Mountain wall clock → UTC epoch ms. DST-safe:
  // a second pass corrects a guess that straddles the change. A wall time
  // that does not exist that day (02:30 on the spring-forward day) lands an
  // hour off; slotsForDate drops those by round-tripping through toWallClock.
  P.toUtcMs = function (ymd, hhmm) {
    var d = String(ymd).split('-').map(Number);
    var t = String(hhmm || '00:00').split(':').map(Number);
    var wall = Date.UTC(d[0], d[1] - 1, d[2], t[0] || 0, t[1] || 0, t[2] || 0);
    var ms = wall - offsetAt(wall);
    var off2 = offsetAt(ms);
    if (wall - off2 !== ms) ms = wall - off2;
    return ms;
  };
  // UTC epoch ms → its Mountain wall clock, {date: 'YYYY-MM-DD', time: 'HH:MM:SS'}.
  P.toWallClock = function (ms) {
    var p = partsAt(ms);
    return { date: p.year + '-' + p.month + '-' + p.day, time: p.hour + ':' + p.minute + ':' + p.second };
  };
  // Mountain calendar day of an instant.
  P.localYmd = function (ms) { return P.toWallClock(ms).date; };
  // Instant → 'YYYYMMDDTHHMMSSZ', the archive's key stamp.
  P.compactUtc = function (ms) {
    return new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, '');
  };
  // 'YYYYMMDDTHHMMSSZ' (or any ISO string Date.parse accepts) → ms, or NaN.
  P.parseUtc = function (s) {
    var m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s || '');
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return s ? Date.parse(s) : NaN;
  };
  // UTC calendar day of an instant, 'YYYYMMDD' (an S3 listing prefix).
  P.utcYmd = function (ms) { return new Date(ms).toISOString().slice(0, 10).replace(/-/g, ''); };
  // The UTC days ('YYYYMMDD') a Mountain day overlaps.
  P.utcDaysOfLocalDay = function (ymd) {
    var a = P.utcYmd(P.toUtcMs(ymd));
    var b = P.utcYmd(P.toUtcMs(MCO.shiftDate(ymd, 1)) - 1);
    return a === b ? [a] : [a, b];
  };

  // '9', '09', '9:30', '09:30:00' → 'HH:MM'; anything else → null. Slots are
  // on the minute, so seconds are dropped.
  P.normalizeTime = function (v) {
    var m = /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?$/.exec(String(v == null ? '' : v).trim());
    if (!m || +m[1] > 23 || (m[2] && +m[2] > 59)) return null;
    return pad2(+m[1]) + ':' + (m[2] || '00');
  };
  // 'HH:MM' → the URL form the Photo Explorer writes: '15' on the hour,
  // else '09:30'.
  P.timeParam = function (hhmm) {
    if (!hhmm) return null;
    var p = hhmm.split(':');
    return +p[1] ? p[0] + ':' + p[1] : String(+p[0]);
  };
  // 'HH:MM[:SS]' → '9:00 AM'. The same in every engine.
  P.slotLabel = function (hhmm) {
    var p = String(hhmm).split(':').map(Number);
    return (p[0] % 12 || 12) + ':' + pad2(p[1] || 0) + ' ' + (p[0] >= 12 ? 'PM' : 'AM');
  };
  // Instant → '3:00 PM' in Mountain Time.
  P.timeLabel = function (ms) { return P.slotLabel(P.toWallClock(ms).time); };
  // Instant → 'Oct 1, 2026 3:00 PM' in Mountain Time. Built from parts, not
  // format(): WebKit writes "Oct 1, 2026 at 3:00 PM", V8 "Oct 1, 2026, 3:00 PM".
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  P.stampLabel = function (ms) {
    var w = P.toWallClock(ms), d = w.date.split('-');
    return MONTHS[+d[1] - 1] + ' ' + (+d[2]) + ', ' + d[0] + ' ' + P.slotLabel(w.time);
  };

  // 'YYYY-MM-DD', or an ISO instant with an offset, or ms → ms. null → −∞.
  function toInstant(v) {
    if (v == null || v === '') return -Infinity;
    if (typeof v === 'number') return v;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return P.toUtcMs(v);
    var ms = Date.parse(v);
    if (isNaN(ms)) throw new Error('MCO.photos: not a date or instant: ' + v);
    return ms;
  }
  function isYmd(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
    var d = new Date(s + 'T12:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
  }
  P.isDate = isYmd;

  /* ── Schedule ──────────────────────────────────────────────────────────────
     parseSchedule(doc, {internal, fullHistory, since, base}) → a schedule:
       { base, patterns, snapMaxMs, internal, fullHistory, sinceMs, generated,
         stations: Map<id, station>, tokens: [...], candidates: ['HH:MM'…],
         minDate: 'YYYY-MM-DD' | null }
     station: { station, name, firstMonth, windows, currentViews, allLabels }
     window:  { token, label, slots: ['HH:MM'…], fromMs, untilMs }   (untilMs ∞ = current)

     The audience filter is applied here, once, as an allowlist, so nothing
     downstream (slot counts, direction controls, manifests) can leak a staff
     view. A window is a view's dated stretch, clipped to: the station's
     first archived month, `since`, and (public, unless fullHistory)
     REAIMED.

     The floor, in order of precedence:
       1. `since` given (a date, an instant, ms, or null for none): that.
       2. internal or fullHistory: none (the first archived month).
       3. otherwise: PUBLIC_SINCE.
     REAIMED applies to every public schedule except fullHistory, whatever
     `since` says. fullHistory never widens the audience: with internal it
     changes nothing.

     Resolved between the two consumers:
     - The dashboard kept a station with no current views (hasCamera false);
       the Photo Explorer dropped it. Dropped here; hasCamera is still false.
     - The Photo Explorer gated slots on `first_month` by date string; here
       the window starts at that month's first Mountain midnight. Same answer.
     - A missing `schema` is accepted (the dashboard never checked); any
       other schema than 1 throws (the Photo Explorer's guard). */
  P.parseSchedule = function (doc, opts) {
    opts = opts || {};
    if (!doc || typeof doc.stations !== 'object' || doc.stations === null) {
      throw new Error('schedule.json: no stations');
    }
    if (doc.schema != null && doc.schema !== P.SCHEMA) {
      throw new Error('schedule.json: unexpected schema ' + doc.schema);
    }
    var internal = !!opts.internal;
    var full = !!opts.fullHistory;
    // undefined = the default; an explicit since (null included) wins.
    var since = opts.since !== undefined ? opts.since : (internal || full ? null : P.PUBLIC_SINCE);
    var sinceMs = toInstant(since);
    var stations = new Map();
    var tokenSet = {}, candSet = {};

    Object.keys(doc.stations).forEach(function (id) {
      var st = doc.stations[id] || {};
      var firstMs = st.first_month ? P.toUtcMs(st.first_month + '-01') : -Infinity;
      var windows = [], allLabels = {};
      (st.periods || []).forEach(function (p) {
        var from = p.from ? Date.parse(p.from) : -Infinity;
        var until = p.until == null ? Infinity : Date.parse(p.until);
        var views = p.views || {};
        Object.keys(views).forEach(function (raw) {
          var token = up(raw);
          if (!P.isVisible(token, internal)) return;
          var v = views[raw] || {};
          var slots = (v.slots_local || []).map(P.normalizeTime).filter(Boolean);
          if (!slots.length) return;
          var reaimed = !internal && !full && P.REAIMED[token] ? Date.parse(P.REAIMED[token]) : -Infinity;
          var lo = Math.max(from, firstMs, sinceMs, reaimed);
          if (!(lo < until)) return;
          var label = allLabels[token] || P.label(token, v.view);
          allLabels[token] = label;
          tokenSet[token] = true;
          slots.forEach(function (s) { candSet[s] = true; });
          windows.push({ token: token, label: label, slots: slots, fromMs: lo, untilMs: until });
        });
      });
      if (!windows.length) return;
      windows.sort(function (a, b) { return a.fromMs - b.fromMs || P.compareViews(a.token, b.token); });
      var current = {};
      windows.forEach(function (w) { if (w.untilMs === Infinity) current[w.token] = w.label; });
      stations.set(id, {
        station: id,
        name: st.name || id,
        firstMonth: st.first_month || null,
        windows: windows,
        currentViews: Object.keys(current).sort(P.compareViews)
          .map(function (t) { return { token: t, label: current[t] }; }),
        allLabels: allLabels,
      });
    });

    var pats = Object.assign({}, doc.patterns || {});
    var docBase = pats.base;
    delete pats.base;
    var schedule = {
      base: opts.base || docBase || P.BASE,
      patterns: Object.assign({}, P.DEFAULT_PATTERNS, pats),
      snapMaxMs: (doc.snap_max_seconds == null ? 1800 : doc.snap_max_seconds) * 1000,
      internal: internal,
      fullHistory: full,
      sinceMs: sinceMs,
      generated: doc.generated || null,
      stations: stations,
      tokens: Object.keys(tokenSet).sort(P.compareViews),
      candidates: Object.keys(candSet).sort(),
      minDate: null,
      _slots: new Map(),
    };
    schedule.minDate = firstDateWithSlots(schedule);
    return schedule;
  };

  // The first Mountain date any window opens on that actually offers a slot
  // (the public window opens at 16:00 on 2026-10-21, after that day's last
  // slot, so the first public date is the 22nd).
  function firstDateWithSlots(s) {
    var lo = Infinity;
    s.stations.forEach(function (st) { st.windows.forEach(function (w) { if (w.fromMs < lo) lo = w.fromMs; }); });
    if (lo === Infinity) return null;
    var d = P.localYmd(lo);
    for (var i = 0; i < 14; i++, d = MCO.shiftDate(d, 1)) {
      if (P.slotsForDate(s, d).length) return d;
    }
    return P.localYmd(lo);
  }

  P.stationOf = function (schedule, s) {
    if (s && typeof s === 'object') return s;
    return (schedule && schedule.stations.get(s)) || null;
  };
  // True when the station has a current window with a view this audience sees.
  P.hasCamera = function (schedule, station) {
    var st = P.stationOf(schedule, station);
    return !!(st && st.currentViews.length);
  };

  function windowCovers(w, t, hhmm) {
    return t >= w.fromMs && t < w.untilMs && w.slots.indexOf(hhmm) !== -1;
  }
  // Was `station` scheduled to shoot `token` at Mountain `date` + `hhmm`?
  // Period-aware: a camera re-planned mid-day shows its old views at 09:00
  // and its new ones at 15:00 (the Photo Explorer's isValidForSlot).
  P.isShotAt = function (schedule, station, token, date, hhmm) {
    var st = P.stationOf(schedule, station);
    if (!st) return false;
    var t = P.toUtcMs(date, hhmm), T = up(token);
    return st.windows.some(function (w) { return w.token === T && windowCovers(w, t, hhmm); });
  };

  // The slots ('HH:MM') to offer on a Mountain date: those scheduled by at
  // least half the stations shooting anything that day. A majority, not a
  // union, so the Sep 2026 hourly pilot (≈30 cameras for nine days) does not
  // turn the menu into 24 entries. When nothing reaches a majority, whatever
  // anyone shot. Wall times that do not exist that day (DST) are skipped.
  // Memoised per schedule and date. (Photo Explorer slotsForDate.)
  P.slotsForDate = function (schedule, date) {
    var memo = schedule._slots.get(date);
    if (memo) return memo.slice();
    var shooting = {}, nShooting = 0, counts = [];
    schedule.candidates.forEach(function (hhmm) {
      var t = P.toUtcMs(date, hhmm);
      var w = P.toWallClock(t);
      if (w.date !== date || w.time.slice(0, 5) !== hhmm) return;
      var n = 0;
      schedule.stations.forEach(function (st, id) {
        if (st.windows.some(function (win) { return windowCovers(win, t, hhmm); })) {
          n++;
          if (!shooting[id]) { shooting[id] = true; nShooting++; }
        }
      });
      if (n) counts.push([hhmm, n]);
    });
    var need = Math.ceil(nShooting / 2);
    var slots = counts.filter(function (c) { return c[1] >= need; }).map(function (c) { return c[0]; });
    if (!slots.length) slots = counts.map(function (c) { return c[0]; });
    schedule._slots.set(date, slots);
    return slots.slice();
  };

  // The views at least one station shot at `date` + `hhmm`, in display
  // order. {stations}: limit to these ids (the Photo Explorer counts only the
  // stations it placed on the map). May be empty.
  P.viewsForSlot = function (schedule, date, hhmm, opts) {
    var ids = opts && opts.stations;
    var t = P.toUtcMs(date, hhmm), seen = {};
    var visit = function (st) {
      if (!st) return;
      st.windows.forEach(function (w) { if (windowCovers(w, t, hhmm)) seen[w.token] = true; });
    };
    if (ids) ids.forEach(function (id) { visit(schedule.stations.get(id)); });
    else schedule.stations.forEach(visit);
    return Object.keys(seen).sort(P.compareViews);
  };

  // Views of every window overlapping [startMs, endMs), display order.
  // (Dashboard viewsBetween.)
  P.viewsBetween = function (station, startMs, endMs) {
    var seen = {};
    station.windows.forEach(function (w) {
      if (w.fromMs >= endMs || w.untilMs <= startMs) return;
      seen[w.token] = w.label;
    });
    return Object.keys(seen).sort(P.compareViews)
      .map(function (t) { return { token: t, label: seen[t] }; });
  };

  function minutesOf(hhmm) { var p = hhmm.split(':'); return +p[0] * 60 + +p[1]; }

  // The day's slots with whether each has cleared the processing lag:
  // [{time, label, ready}]. A past day is all ready; a future day none; today
  // is ready up to now − lag. Pending slots stay listed (the cadence is worth
  // seeing) and are offered disabled.
  P.readySlots = function (schedule, date, opts) {
    opts = opts || {};
    var now = opts.now == null ? Date.now() : opts.now;
    var lag = opts.lagMinutes == null ? P.LAG_MINUTES : opts.lagMinutes;
    var w = P.toWallClock(now);
    var thresh = date < w.date ? Infinity : date > w.date ? -Infinity
      : minutesOf(w.time) - lag;
    return P.slotsForDate(schedule, date).map(function (t) {
      return { time: t, label: P.slotLabel(t), ready: minutesOf(t) <= thresh };
    });
  };

  // The last slot of the newest day before `date` that offers any, not
  // before {minDate}; walks at most 60 days.
  function lastSlotBefore(schedule, date, minDate) {
    var d = date;
    for (var i = 0; i < 60; i++) {
      d = MCO.shiftDate(d, -1);
      if (minDate && d < minDate) return null;
      var slots = P.slotsForDate(schedule, d);
      if (slots.length) return { date: d, time: slots[slots.length - 1] };
    }
    return null;
  }

  // The newest slot whose photos should be in: today's latest cleared slot,
  // else the last slot of the nearest earlier day. {date, time} or null.
  // The Photo Explorer walks back further from here by probing images, when
  // a slot is only partly published; that stays in the app.
  P.latestSlot = function (schedule, opts) {
    opts = opts || {};
    var now = opts.now == null ? Date.now() : opts.now;
    var minDate = 'minDate' in opts ? opts.minDate : schedule.minDate;
    var today = P.localYmd(now);
    var ready = P.readySlots(schedule, today, { now: now, lagMinutes: opts.lagMinutes })
      .filter(function (s) { return s.ready; });
    if (ready.length && !(minDate && today < minDate)) {
      return { date: today, time: ready[ready.length - 1].time };
    }
    return lastSlotBefore(schedule, today, minDate);
  };

  // The slot before {date, time}: the previous one that day, or the last of
  // the nearest earlier day. null at the start, or for a time the day never
  // offered.
  P.previousSlot = function (schedule, date, time, opts) {
    var minDate = opts && 'minDate' in opts ? opts.minDate : schedule.minDate;
    var times = P.slotsForDate(schedule, date);
    var i = times.indexOf(time);
    if (i > 0) return { date: date, time: times[i - 1] };
    if (i === 0) return lastSlotBefore(schedule, date, minDate);
    return null;
  };

  // Which time to show, given the day's [{time, ready}] and the one wanted:
  // the wanted time if ready; else the next later ready slot; else the last
  // ready one. A null `wanted` (a bare ?date=) means the day's first slot.
  // `reason` says why the time moved: 'pending' (listed, not in yet) or
  // 'unscheduled' (never offered that day). (Photo Explorer
  // resolveTimeForDate.) Returns {time, moved, reason}; time is null when
  // nothing that day is ready.
  P.resolveTime = function (options, wanted) {
    var ready = options.filter(function (o) { return o.ready; }).map(function (o) { return o.time; });
    if (!ready.length) return { time: null, moved: wanted != null, reason: 'pending' };
    if (wanted == null || ready.indexOf(wanted) !== -1) {
      return { time: wanted == null ? ready[0] : wanted, moved: false, reason: null };
    }
    var later = ready.filter(function (t) { return t > wanted; })[0];
    var listed = options.some(function (o) { return o.time === wanted; });
    return {
      time: later || ready[ready.length - 1],
      moved: true,
      reason: listed ? 'pending' : 'unscheduled',
    };
  };

  // Which view to show: the wanted one if offered, else the default (North),
  // else the first offered. {view, moved}.
  P.resolveView = function (offered, wanted, fallback) {
    var def = fallback || P.DEFAULT_VIEW;
    var view = offered.indexOf(wanted) !== -1 ? wanted
      : offered.indexOf(def) !== -1 ? def : (offered[0] || null);
    return { view: view, moved: wanted != null && view !== wanted };
  };

  // Plain words for a move the visitor did not ask for. Apps may toast it,
  // announce it, or write their own from the same fields.
  //   {kind: 'time', reason: 'pending' | 'unscheduled', from, to, date}
  //   {kind: 'date', reason: 'too-early' | 'too-late', from, to}
  //   {kind: 'view', from, to}
  P.rollMessage = function (r) {
    var fmt = function (d) { return MCO.formatDateStr ? MCO.formatDateStr(d) : d; };
    if (r.kind === 'view') {
      return 'No ' + P.label(r.from) + ' photos at this time. Showing ' + P.label(r.to) + '.';
    }
    if (r.kind === 'date') {
      return r.reason === 'too-early'
        ? 'Photos start ' + fmt(r.to) + '. Showing that date.'
        : 'No photos yet for ' + fmt(r.from) + '. Showing ' + fmt(r.to) + '.';
    }
    if (!r.to) return P.slotLabel(r.from) + ' is not available yet.';
    return r.reason === 'pending'
      ? P.slotLabel(r.from) + ' is not available yet. Showing ' + P.slotLabel(r.to) + '.'
      : 'No photos were scheduled at ' + P.slotLabel(r.from) + ' on ' + fmt(r.date) +
        '. Showing ' + P.slotLabel(r.to) + '.';
  };

  /* ── Paths ─────────────────────────────────────────────────────────────── */

  // Fill a schedule pattern: {station}, {token}, {slot_utc}, {captured_utc}.
  P.fillPattern = function (pattern, v) {
    return pattern
      .split('{station}').join(v.station)
      .split('{token}').join(v.token)
      .split('{slot_utc}').join(v.slotUtcMs == null ? '' : P.compactUtc(v.slotUtcMs))
      .split('{captured_utc}').join(v.capturedUtcMs == null ? '' : P.compactUtc(v.capturedUtcMs));
  };
  P.joinUrl = function (base, path) {
    return String(base).replace(/\/+$/, '') + '/' + String(path).replace(/^\/+/, '');
  };
  // A pattern's directory prefix up to the timestamp: 'photos/webp/large/x/x_N_'.
  P.patternPrefix = function (pattern, station, token) {
    return P.fillPattern(pattern.split(/\{(?:slot_utc|captured_utc)\}/)[0], { station: station, token: token });
  };
  P.basename = function (url) {
    var b = String(url).split('?')[0].split('/').pop();
    return b || String(url);
  };
  P.scheduleUrl = function (base) { return P.joinUrl(base || P.BASE, P.SCHEDULE_PATH); };
  // The WebP for a slot. size: 'large' (1920×1080, default) or 'thumb' (320×180).
  P.frameUrl = function (schedule, station, token, slotUtcMs, size) {
    var pat = schedule.patterns[size === 'thumb' ? 'webp_thumb' : 'webp_large'];
    return P.joinUrl(schedule.base, P.fillPattern(pat, { station: station, token: up(token), slotUtcMs: slotUtcMs }));
  };
  // The monthly manifest; `ym` is a MOUNTAIN month, 'YYYY-MM'.
  P.manifestUrl = function (schedule, station, ym) {
    return P.joinUrl(schedule.base, 'photos/manifest/' + station + '/' + station + '_' + ym + '.csv');
  };
  P.listingUrl = function (schedule, prefix) {
    return String(schedule.base).replace(/\/+$/, '') + '/?list-type=2&prefix=' + encodeURIComponent(prefix);
  };

  /* ── Frames: manifest CSV and S3 listings ──────────────────────────────────
     frame: { token, label, slotUtcMs, capturedUtcMs?, webpUrl, thumbUrl,
              jpgUrl?, derived? } */

  // The filter a schedule implies for frames read from the archive: the
  // audience's views, on or after `since`, and (public, unless fullHistory)
  // never a re-aimed token before its cutover. No schedule → the public
  // default.
  P.frameFilter = function (schedule) {
    var internal = !!(schedule && schedule.internal);
    var full = !!(schedule && schedule.fullHistory);
    var sinceMs = schedule && schedule.sinceMs != null ? schedule.sinceMs
      : (internal || full ? -Infinity : Date.parse(P.PUBLIC_SINCE));
    return function (token, slotUtcMs) {
      var T = up(token);
      if (!P.isVisible(T, internal) || slotUtcMs < sinceMs) return false;
      return internal || full || !P.REAIMED[T] || slotUtcMs >= Date.parse(P.REAIMED[T]);
    };
  };

  function frameFor(station, token, slotUtcMs, o, extra) {
    var base = o.base || P.BASE;
    var p = o.patterns || P.DEFAULT_PATTERNS;
    var f = {
      token: token,
      label: (o.labels && o.labels[token]) || P.label(token),
      slotUtcMs: slotUtcMs,
      webpUrl: P.joinUrl(base, P.fillPattern(p.webp_large, { station: station, token: token, slotUtcMs: slotUtcMs })),
      thumbUrl: P.joinUrl(base, P.fillPattern(p.webp_thumb, { station: station, token: token, slotUtcMs: slotUtcMs })),
    };
    return Object.assign(f, extra || {});
  }
  function optsOf(schedule, station) {
    var st = P.stationOf(schedule, station);
    return {
      base: schedule.base, patterns: schedule.patterns, snapMaxMs: schedule.snapMaxMs,
      labels: st ? st.allLabels : {}, allow: P.frameFilter(schedule),
    };
  }

  // S3 ListObjectsV2 XML → keys.
  P.parseListingKeys = function (xml) {
    var out = [], re = /<Key>([^<]+)<\/Key>/g, m;
    while ((m = re.exec(xml || ''))) {
      out.push(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    }
    return out;
  };
  // A WebP listing for one station and token → frames (slot from the key).
  P.framesFromListing = function (xml, station, token, o) {
    o = o || {};
    var allow = o.allow || P.frameFilter(null);
    var frames = [];
    P.parseListingKeys(xml).forEach(function (key) {
      var t = /_(\d{8}T\d{6}Z)\.webp$/.exec(key);
      if (!t) return;
      var ms = P.parseUtc(t[1]);
      if (isNaN(ms) || !allow(token, ms)) return;
      var f = frameFor(station, token, ms, o);
      f.webpUrl = P.joinUrl(o.base || P.BASE, key);
      frames.push(f);
    });
    return frames;
  };

  // Minimal CSV line split (manifest fields carry no commas; quotes honoured).
  function splitCsvLine(line) {
    if (line.indexOf('"') === -1) return line.split(',');
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  // Monthly manifest CSV → frames, one per WebP (a re-shot slot keeps one).
  // Columns are found by header name: station, view, token, captured_utc,
  // captured_local, date_local, time_local, slot_utc, jpg, webp_large,
  // webp_thumb.
  //
  // Quirks (dashboard archive.ts): `webp_large` can be blank for a frame
  // whose WebP exists, so the path is derived from `slot_utc`, or from the
  // capture snapped to the nearest hour, and the frame is flagged `derived`;
  // a capture farther than snapMaxMs from that slot has no WebP and is
  // skipped. As of 2026-10 most blank rows really have no WebP (ad-hoc and
  // instrument captures), so confirm derived frames (confirmDerived) before
  // showing them. o: {base, patterns, snapMaxMs, labels, allow}.
  P.parseManifest = function (csv, station, o) {
    o = o || {};
    var lines = String(csv || '').replace(/\r/g, '').trim().split('\n');
    if (lines.length < 2) return [];
    var header = splitCsvLine(lines[0]).map(function (h) { return h.trim(); });
    var col = function (n) { return header.indexOf(n); };
    var iToken = col('token'), iView = col('view'), iCaptured = col('captured_utc'),
        iSlot = col('slot_utc'), iJpg = col('jpg'), iWebp = col('webp_large'), iThumb = col('webp_thumb');
    var snap = o.snapMaxMs == null ? 30 * MIN_MS : o.snapMaxMs;
    var base = o.base || P.BASE;
    var allow = o.allow || P.frameFilter(null);
    var frames = new Map();
    lines.slice(1).forEach(function (line) {
      if (!line.trim()) return;
      var f = splitCsvLine(line);
      var at = function (i) { return i >= 0 ? (f[i] || '').trim() : ''; };
      var token = up(at(iToken));
      var captured = P.parseUtc(at(iCaptured));
      if (!token || isNaN(captured)) return;
      var slotRaw = at(iSlot);
      var slot = slotRaw ? P.parseUtc(slotRaw) : Math.round(captured / HOUR_MS) * HOUR_MS;
      if (isNaN(slot) || Math.abs(slot - captured) > snap || !allow(token, slot)) return;
      var frame = frameFor(station, token, slot, o, { capturedUtcMs: captured });
      if (!(o.labels && o.labels[token]) && !P.VIEWS[token] && at(iView)) frame.label = at(iView);
      if (at(iWebp)) frame.webpUrl = P.joinUrl(base, at(iWebp));
      else frame.derived = true;
      if (at(iThumb)) frame.thumbUrl = P.joinUrl(base, at(iThumb));
      if (at(iJpg)) frame.jpgUrl = P.joinUrl(base, at(iJpg));
      var prev = frames.get(frame.webpUrl);
      if (!prev || (prev.derived && !frame.derived)) frames.set(frame.webpUrl, frame);
    });
    return Array.from(frames.values());
  };

  // Frames whose slot falls on Mountain day `ymd`, optionally one token,
  // newest first.
  P.framesFor = function (frames, ymd, token) {
    var T = token == null ? null : up(token);
    return frames.filter(function (f) {
      return (T == null || f.token === T) && P.localYmd(f.slotUtcMs) === ymd;
    }).sort(function (a, b) { return b.slotUtcMs - a.slotUtcMs; });
  };
  // Distinct tokens in `frames`, display order.
  P.tokensOf = function (frames) {
    var seen = {};
    frames.forEach(function (f) { seen[f.token] = true; });
    return Object.keys(seen).sort(P.compareViews);
  };
  // The newest frame of one token (default North), or null.
  P.newest = function (frames, token) {
    var T = up(token || P.DEFAULT_VIEW), best = null;
    frames.forEach(function (f) { if (f.token === T && (!best || f.slotUtcMs > best.slotUtcMs)) best = f; });
    return best;
  };

  /* ── Fetchers (data2 is CORS-open; a 404 means "nothing there") ─────────── */

  function fetchText(url, timeoutMs) {
    return fetch(url, { signal: AbortSignal.timeout(timeoutMs || 20000) }).then(function (res) {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('photo archive HTTP ' + res.status + ': ' + url);
      return res.text();
    });
  }
  P.fetchText = fetchText;

  var _cache = null;
  // Fetch and parse schedule.json, once per (base, audience, fullHistory,
  // since). {internal, fullHistory, since} as parseSchedule. Failed
  // loads evict themselves (MCO.promiseCache), so a retry refetches. The
  // parsed `base` is the host fetched from, not the file's own patterns.base,
  // so a base swap carries through to every URL. {fresh: true} refetches
  // (a page left open for hours: the schedule is republished).
  P.load = function (opts) {
    opts = opts || {};
    var base = opts.base || P.BASE;
    var key = [base, !!opts.internal, !!opts.fullHistory,
      opts.since !== undefined ? String(opts.since) : 'default'].join('|');
    if (!_cache) _cache = MCO.promiseCache();
    if (opts.fresh) _cache.invalidate(key);
    return _cache.cached(key, function () {
      return MCO.fetchJSON(P.scheduleUrl(base), { timeoutMs: opts.timeoutMs || 20000 }).then(function (doc) {
        var o = { internal: !!opts.internal, fullHistory: !!opts.fullHistory, base: base };
        if (opts.since !== undefined) o.since = opts.since;
        return P.parseSchedule(doc, o);
      });
    });
  };

  // One UTC day ('YYYYMMDD') of WebP frames for one station and token, via
  // S3 ListObjectsV2 through the CDN. Only `prefix` is forwarded, hence one
  // day per request.
  P.listDay = function (schedule, station, token, ymdUtc) {
    var st = P.stationOf(schedule, station);
    var id = st ? st.station : station;
    var prefix = P.patternPrefix(schedule.patterns.webp_large, id, up(token)) + ymdUtc;
    return fetchText(P.listingUrl(schedule, prefix)).then(function (xml) {
      return P.framesFromListing(xml || '', id, up(token), optsOf(schedule, st || id));
    });
  };

  // Latest frames for every current view, covering Mountain today and
  // yesterday: three UTC days, because in the evening UTC is already a day
  // ahead. A failed day contributes nothing; if every listing fails the
  // archive is unreachable and this rejects. {now} for tests.
  P.fetchLatestFrames = function (schedule, station, opts) {
    var st = P.stationOf(schedule, station);
    if (!st) return Promise.resolve([]);
    var now = opts && opts.now != null ? opts.now : Date.now();
    var days = [P.utcYmd(now - 2 * DAY_MS), P.utcYmd(now - DAY_MS), P.utcYmd(now)];
    var jobs = [];
    st.currentViews.forEach(function (v) {
      days.forEach(function (d) { jobs.push(P.listDay(schedule, st, v.token, d)); });
    });
    return Promise.allSettled(jobs).then(function (results) {
      if (results.length && results.every(function (r) { return r.status === 'rejected'; })) {
        throw results[0].reason;
      }
      var out = [];
      results.forEach(function (r) { if (r.status === 'fulfilled') out = out.concat(r.value); });
      return out;
    });
  };

  // Keep only the derived frames whose WebP the bucket actually lists. One
  // listing per (token, UTC day). A failed listing drops that day's derived
  // frames, or with {strict} rejects, so a cache does not keep a partial
  // answer as final.
  P.confirmDerived = function (schedule, station, frames, opts) {
    var derived = frames.filter(function (f) { return f.derived; });
    if (!derived.length) return Promise.resolve(frames);
    var pairs = {};
    derived.forEach(function (f) { pairs[f.token + '|' + P.utcYmd(f.slotUtcMs)] = true; });
    var strict = !!(opts && opts.strict);
    return Promise.all(Object.keys(pairs).map(function (p) {
      var parts = p.split('|');
      var listing = P.listDay(schedule, station, parts[0], parts[1]);
      return strict ? listing : listing.catch(function () { return []; });
    })).then(function (lists) {
      var exists = {};
      lists.forEach(function (l) { l.forEach(function (f) { exists[f.webpUrl] = true; }); });
      return frames.filter(function (f) { return !f.derived || exists[f.webpUrl]; });
    });
  };

  // One Mountain month's manifest ('YYYY-MM') → frames; a missing month → [].
  P.fetchMonthFrames = function (schedule, station, ym) {
    var st = P.stationOf(schedule, station);
    var id = st ? st.station : station;
    return fetchText(P.manifestUrl(schedule, id, ym), 30000).then(function (csv) {
      return csv ? P.parseManifest(csv, id, optsOf(schedule, st || id)) : [];
    });
  };

  /* ── initPhotoControls ─────────────────────────────────────────────────────
     The date / time / direction group, on the kit's own parts:
       var photos = MCO.photos.initPhotoControls({
         schedule,                       // from MCO.photos.load(); its audience
                                         // ({internal}, {fullHistory}, since)
                                         // sets the views and the first date
         date: dateInput,                // <input type="date"> with a <label>
         time: timeSelect,               // <select> with a <label>
         steppers: [{prev, next}],       // optional day steppers (.nav-btn.mco-step)
         views: {group, select},         // .seg-btns.is-radio <fieldset> with a
                                         // <legend>, and its fallback <select>
         mq,                             // the views' fallback query (default 1060)
         stations,                       // optional ids that limit the views offered
         onChange: function (state, change) { render(state); writeUrl(); },
       });
     state:  {date, time, view, ms}      ms = the slot's UTC instant
     change: {source: 'init'|'date'|'time'|'view'|'step'|'set'|'refresh', rolls}

     Initial state: {initial} > URL (?date= ?time= ?dir=, validated) > the
     latest slot, North. Wanted time and view are sticky: stepping through
     days re-resolves from what was asked for, not from what one day forced.

     Moves the visitor did not ask for (a time that day never offered, a
     slot not in yet, a view nobody shot) come back as `rolls` and, after
     stepping settles (250 ms), are announced through MCO.announce with
     rollMessage(). Pass onRoll to toast instead, or onRoll: false.

     It does not write the URL. The app owns its query string (HOUSE-STYLE
     §4, one write per task): merge controls.params() into it.
     Returns {state, set, refresh, params, views, pinned, destroy}. */
  var _seq = 0;
  P.initPhotoControls = function (opts) {
    if (!MCO.initStepper || !MCO.initSegmentedFallback) {
      throw new Error('MCO.photos.initPhotoControls needs core/mco-core.js loaded first');
    }
    var sch = opts.schedule;
    var dateEl = opts.date, timeEl = opts.time;
    var lag = opts.lagMinutes == null ? P.LAG_MINUTES : opts.lagMinutes;
    var nowFn = opts.now || Date.now;
    var defView = opts.defaultView || P.DEFAULT_VIEW;
    var names = Object.assign({ date: 'date', time: 'time', view: 'dir' }, opts.paramNames || {});
    var minDate = opts.minDate || sch.minDate;
    var limit = opts.stations || null;
    var radioName = 'mco-photo-view-' + (++_seq);
    var onRoll = opts.onRoll === false ? null
      : (opts.onRoll || function (r) { MCO.announce(P.rollMessage(r)); });

    var state = { date: null, time: null, view: null };
    var wantedTime = null, wantedView = defView;
    var shown = [];
    var rollQueue = [], rollTimer = null;
    var cleanup = [];

    function maxDate() {
      var ts = P.latestSlot(sch, { now: nowFn(), lagMinutes: lag, minDate: minDate });
      return ts ? ts.date : P.localYmd(nowFn());
    }
    function bounds() {
      var mx = maxDate();
      if (minDate) dateEl.min = minDate;
      dateEl.max = mx;
      return { min: minDate, max: mx };
    }

    // Rebuild the Time menu only when it would change: iOS's native picker
    // loses its place otherwise. Options only ever become enabled over time.
    function syncTimeOptions(options) {
      var want = options.map(function (o) { return o.time + (o.ready ? '' : '!'); }).join();
      var have = Array.prototype.map.call(timeEl.options, function (o) {
        return o.value + (o.disabled ? '!' : '');
      }).join();
      if (want === have) return;
      var keep = timeEl.value;
      timeEl.replaceChildren.apply(timeEl, options.map(function (o) {
        var el = document.createElement('option');
        el.value = o.time;
        el.disabled = !o.ready;
        el.textContent = o.label;
        return el;
      }));
      timeEl.value = keep;
    }

    // Views: radios inside the fieldset (its <legend> stays), mirrored by the
    // fallback <select>. Rebuilt only when the offered set changes.
    var group = opts.views && opts.views.group;
    var select = opts.views && opts.views.select;
    function buildViews(list) {
      shown = list.slice();
      if (!group) return;
      Array.prototype.slice.call(group.children).forEach(function (c) {
        if (c.tagName !== 'LEGEND') c.remove();
      });
      list.forEach(function (t) {
        var lab = document.createElement('label');
        lab.className = 'nav-btn seg-btn';
        var input = document.createElement('input');
        input.type = 'radio';
        input.name = radioName;
        input.value = t;
        input.setAttribute('aria-label', P.viewName(t));
        lab.append(input, document.createTextNode(P.shortLabel(t)));
        group.append(lab);
      });
      if (select) {
        select.replaceChildren.apply(select, list.map(function (t) {
          var o = document.createElement('option');
          o.value = t;
          o.textContent = P.label(t);
          return o;
        }));
      }
    }

    function queueRoll(r) {
      if (!r || !onRoll) return;
      // A hold-to-repeat run reports one move per kind: first from, last to.
      var same = rollQueue.filter(function (q) { return q.kind === r.kind; })[0];
      if (same) { same.to = r.to; same.reason = r.reason; same.date = r.date; }
      else rollQueue.push(Object.assign({}, r));
      clearTimeout(rollTimer);
      rollTimer = setTimeout(function () {
        var q = rollQueue; rollQueue = [];
        q.forEach(function (x) { if (x.from !== x.to) onRoll(x); });
      }, 250);
    }

    function offeredViews() {
      var list = state.time ? P.viewsForSlot(sch, state.date, state.time, { stations: limit }) : [];
      return list.length ? list : sch.tokens.slice();
    }
    function syncViews(rolls) {
      var list = offeredViews();
      if (list.join() !== shown.join()) buildViews(list);
      var from = state.view;
      var r = P.resolveView(list, wantedView, defView);
      state.view = r.view;
      if (seg) seg.set(r.view || '');
      else if (select) select.value = r.view || '';
      // Leaving the wanted view is reported; returning to it is not.
      if (from != null && from === wantedView && r.view !== from) {
        rolls.push({ kind: 'view', from: from, to: r.view });
      }
    }

    function applyDate(date, rolls, freshWant) {
      var b = bounds();
      if (!isYmd(date)) date = b.max;
      if (b.min && date < b.min) {
        rolls.push({ kind: 'date', reason: 'too-early', from: date, to: b.min });
        date = b.min;
      } else if (date > b.max) {
        rolls.push({ kind: 'date', reason: 'too-late', from: date, to: b.max });
        date = b.max;
      }
      state.date = date;
      dateEl.value = date;
      var options = P.readySlots(sch, date, { now: nowFn(), lagMinutes: lag });
      syncTimeOptions(options);
      var before = state.time;
      var r = P.resolveTime(options, wantedTime);
      state.time = r.time;
      timeEl.value = r.time || '';
      // Only a visible change is worth saying: stepping through a stretch of
      // 9/15 days while wanting noon re-resolves to 3 PM every day, but says
      // so once. A time just asked for (init, set) is always answered.
      if (r.moved && wantedTime != null && (r.time !== before || freshWant)) {
        rolls.push({ kind: 'time', reason: r.reason, from: wantedTime, to: r.time, date: date });
      }
      syncViews(rolls);
    }

    function snapshot() {
      return {
        date: state.date, time: state.time, view: state.view,
        ms: state.time ? P.toUtcMs(state.date, state.time) : null,
      };
    }
    var steppers = [];
    function emit(source, rolls) {
      steppers.forEach(function (s) { s.refresh(); });
      rolls.forEach(queueRoll);
      if (opts.onChange) opts.onChange(snapshot(), { source: source, rolls: rolls });
    }

    function canStep(d) {
      if (!state.date) return false;
      var next = MCO.shiftDate(state.date, d);
      return d < 0 ? !(minDate && next < minDate) : next <= maxDate();
    }

    // ── Initial state ──
    var params = opts.params || MCO.urlParams();
    var init = opts.initial || {};
    var pDate = init.date || params.get(names.date);
    var pTime = P.normalizeTime(init.time != null ? init.time : params.get(names.time));
    var pView = up(init.view || params.get(names.view));
    var pinned = !!(isYmd(pDate) || pTime);
    if (pView && P.isVisible(pView, sch.internal)) wantedView = pView;
    if (isYmd(pDate)) {
      wantedTime = pTime;            // null → that day's first slot
    } else {
      var ts = P.latestSlot(sch, { now: nowFn(), lagMinutes: lag, minDate: minDate });
      pDate = ts ? ts.date : P.localYmd(nowFn());
      wantedTime = pTime || (ts ? ts.time : null);
    }

    var initRolls = [];
    state.date = pDate;
    buildViews(sch.tokens.length ? sch.tokens : [defView]);
    var seg = group && select ? MCO.initSegmentedFallback({
      group: group, select: select, mq: opts.mq,
      onChange: function (v) {
        wantedView = v; state.view = v;
        emit('view', []);
      },
    }) : null;
    if (!seg && select) {
      var onSel = function () { wantedView = state.view = select.value; emit('view', []); };
      select.addEventListener('change', onSel);
      cleanup.push(function () { select.removeEventListener('change', onSel); });
    }
    applyDate(pDate, initRolls);

    // ── Wiring ──
    var onDate = function () {
      var rolls = [];
      applyDate(dateEl.value, rolls);
      emit('date', rolls);
    };
    var onTime = function () {
      var rolls = [];
      wantedTime = timeEl.value || null;
      state.time = wantedTime;
      syncViews(rolls);
      emit('time', rolls);
    };
    dateEl.addEventListener('change', onDate);
    timeEl.addEventListener('change', onTime);
    cleanup.push(function () {
      dateEl.removeEventListener('change', onDate);
      timeEl.removeEventListener('change', onTime);
    });
    var pairs = (opts.steppers || []).slice();
    if (opts.prev || opts.next) pairs.unshift({ prev: opts.prev, next: opts.next });
    steppers = pairs.map(function (p) {
      return MCO.initStepper({
        prev: p.prev, next: p.next, canStep: canStep,
        onStep: function (d) {
          var rolls = [];
          applyDate(MCO.shiftDate(state.date, d), rolls);
          emit('step', rolls);
        },
      });
    });

    emit('init', initRolls);

    return {
      state: snapshot,
      // Programmatic moves (Back/Forward, an app's landing probe). Sets what
      // is wanted, then resolves. {silent: true} skips onChange.
      set: function (next, o) {
        var rolls = [];
        if (next.time !== undefined) wantedTime = P.normalizeTime(next.time);
        if (next.view && P.isVisible(next.view, sch.internal)) wantedView = up(next.view);
        applyDate(next.date || state.date, rolls, next.time !== undefined);
        if (o && o.silent) { steppers.forEach(function (s) { s.refresh(); }); return snapshot(); }
        emit('set', rolls);
        return snapshot();
      },
      // Time passes: re-read the bounds and today's ready slots. Call it on
      // an interval or on visibilitychange; it reports a change only when
      // the selection moved.
      refresh: function () {
        var before = JSON.stringify(snapshot());
        var rolls = [];
        applyDate(state.date, rolls);
        steppers.forEach(function (s) { s.refresh(); });
        if (JSON.stringify(snapshot()) !== before) emit('refresh', rolls);
      },
      // {date, time, dir}: merge into the app's own URL writer. The view is
      // elided at its default (clean URLs, §4); date and time are always
      // given, because their default ("latest") moves.
      params: function () {
        var out = {};
        if (state.date) out[names.date] = state.date;
        if (state.time) out[names.time] = P.timeParam(state.time);
        if (state.view && state.view !== defView) out[names.view] = state.view;
        return out;
      },
      views: function () { return shown.slice(); },
      // True when the URL or {initial} named a date or time: an app's landing
      // probe must not move a slot someone linked to.
      pinned: pinned,
      destroy: function () {
        clearTimeout(rollTimer);
        cleanup.forEach(function (f) { f(); });
        if (seg) seg.destroy();
      },
    };
  };
})();
