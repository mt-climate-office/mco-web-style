/* ============================================================================
   mco-web-style · summary/mco-summary.js · v0.1.0
   The plain-language conditions line for Montana Climate Office apps:
   "Partly cloudy tonight, calm, no precipitation in 3 days." One sentence
   from the NWS forecast's current period (the sky), the station's latest
   wind, its 24 h peak gust and its precipitation record.

   Classic script, zero dependencies, no build. Lands on window.MCO.summary.
   The pure core (every function above "Fetching") needs nothing from
   core/mco-core.js and touches nothing at load but window.MCO. The optional
   fetcher (load, forStation) uses MCO.promiseCache when core is present, so
   load this AFTER core/mco-core.js if you use it.

   A port of mesonet-dashboard's tested web/src/core/overview/summary.ts, with
   the pieces of hero.ts (currentPeriod), series.ts (peakGust, hourlyPrecip),
   precip.ts (precipSummary) and conditions.ts (the wind columns) that feed
   it (website DECISIONS D9, extraction #3). The sentence is the same, word
   for word, for the same inputs.

   Times. The dashboard reads Mountain wall-clock strings
   ("2026-10-02 12:00:00-06:00", the API's CSV); the API's JSON sends epoch
   ms. Every row reader here takes either: a string is read as its wall
   clock (any offset ignored, as the dashboard does), a number is an instant
   and is converted to Mountain wall clock with Intl, never the viewer's
   zone. "Wall-clock ms" means Date.UTC of the Mountain wall-clock fields, so
   new Date(ms).getUTCHours() is the Mountain hour.

   Units. Data is US throughout (in, mph), as the API sends it with
   units=us, and every threshold is tested in US units. Only the two amounts
   the sentence prints convert: `units: 'si'` shows precipitation in mm and a
   gust in m/s.
   ========================================================================== */
(function () {
  'use strict';

  var MCO = window.MCO = window.MCO || {};
  MCO.versions = Object.assign(MCO.versions || {}, { summary: '0.1.0' });
  var S = MCO.summary = MCO.summary || {};

  /* ── Constants ─────────────────────────────────────────────────────────── */

  // Smallest amount (in) counted as precipitation; the gauges resolve 0.01 in.
  S.PRECIP_MIN_IN = 0.01;
  // Dry spells longer than this read "no precipitation in over a week".
  S.DRY_CAP_DAYS = 7;
  // A calm reading after a 24 h peak gust at least this strong (mph) says so.
  S.NOTABLE_GUST_MPH = 25;
  // Below this (mph) the wind is calm (Beaufort 0).
  S.CALM_MPH = 1;
  // Mountain time, for epoch-ms rows. Same value as MCO.TZ.
  S.ZONE = 'America/Denver';
  // The precipitation column of /latest/ and /observations/hourly/ rows.
  S.PRECIP_KEY = 'Precipitation [in]';

  var HOUR = 3600000;
  var DAY = 86400000;
  var COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  // A number, or a numeric string (the /derived/ppt/ row may send either).
  function numLoose(v) {
    var n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
    return isFinite(n) ? n : null;
  }
  function unitsOf(u) { return u === 'si' ? 'si' : 'us'; }

  /* ── Mountain wall clock ───────────────────────────────────────────────── */

  var WALL_RE = /^\s*(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?/;

  // A date or datetime string → wall-clock ms, ignoring any trailing offset;
  // null for blanks, "None", "NaN" and anything unparseable.
  S.parseWallClock = function (value) {
    if (typeof value !== 'string') return null;
    var v = value.trim();
    if (!v || /^(none|nan|null|nat)$/i.test(v)) return null;
    var m = WALL_RE.exec(v);
    if (!m) return null;
    var ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return isFinite(ms) ? ms : null;
  };

  var PARTS_FMT = null;
  // An instant (epoch ms) → its Mountain wall-clock ms; null for non-finite.
  S.wallClockMs = function (epochMs) {
    if (typeof epochMs !== 'number' || !isFinite(epochMs)) return null;
    if (!PARTS_FMT) {
      PARTS_FMT = new Intl.DateTimeFormat('en-US', {
        timeZone: S.ZONE, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    }
    var p = {};
    PARTS_FMT.formatToParts(new Date(epochMs)).forEach(function (x) {
      if (x.type !== 'literal') p[x.type] = +x.value;
    });
    // Some engines write midnight as 24 under h23.
    return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) + (epochMs % 1000 + 1000) % 1000;
  };

  // A row's datetime (wall-clock string or epoch ms) → wall-clock ms, or null.
  S.rowWallClock = function (datetime) {
    return typeof datetime === 'number' ? S.wallClockMs(datetime) : S.parseWallClock(datetime);
  };

  // Wall-clock ms → 'YYYY-MM-DD', the Mountain date.
  S.wallDate = function (wallMs) { return new Date(wallMs).toISOString().slice(0, 10); };

  // A row's Mountain date: a string's first ten characters (as the dashboard
  // reads it), an instant's Mountain calendar day. '' when neither.
  function rowDate(datetime) {
    if (typeof datetime === 'number') {
      var w = S.wallClockMs(datetime);
      return w === null ? '' : S.wallDate(w);
    }
    return String(datetime).slice(0, 10);
  }

  /* ── Phrases ───────────────────────────────────────────────────────────── */

  // calm < 1 mph (CALM_MPH) ≤ light < 10 ≤ breezy < 20 ≤ windy.
  S.windClass = function (mph) {
    return mph < S.CALM_MPH ? 'calm' : mph < 10 ? 'light' : mph < 20 ? 'breezy' : 'windy';
  };

  // [pattern, phrase, is precipitation], first match wins: precipitation
  // before cloud cover.
  var SKY = [
    [/thunder/i, 'thunderstorms', true],
    [/freezing|sleet/i, 'freezing rain', true],
    [/rain.*snow|snow.*rain/i, 'rain and snow', true],
    [/snow|flurr|blizzard/i, 'snow', true],
    [/drizzle/i, 'drizzle', true],
    [/rain|shower/i, 'rain', true],
    [/fog/i, 'fog', false],
    [/smoke/i, 'smoke', false],
    [/haze/i, 'haze', false],
    [/dust/i, 'dust', false],
    [/mostly (sunny|clear)/i, 'mostly clear', false],
    [/partly (cloudy|sunny)/i, 'partly cloudy', false],
    [/mostly cloudy/i, 'mostly cloudy', false],
    [/cloudy|overcast/i, 'cloudy', false],
    [/sunny|clear|fair/i, 'clear', false],
  ];

  // NWS shortForecast → a few lowercase words ("partly cloudy", "chance of
  // rain", "snow likely"), or null when unknown or empty. Only the first
  // clause of "X then Y" counts (it is the part happening now).
  S.skyPhrase = function (shortForecast) {
    var first = String(shortForecast == null ? '' : shortForecast).split(/\bthen\b/i)[0].trim();
    var hit = null;
    for (var i = 0; i < SKY.length; i++) if (SKY[i][0].test(first)) { hit = SKY[i]; break; }
    if (!hit) return null;
    var phrase = hit[1];
    if (hit[2] && /chance/i.test(first)) return 'chance of ' + phrase;
    if (hit[2] && /likely/i.test(first)) return phrase + ' likely';
    return phrase;
  };

  // Degrees → one of the 16 compass points ("SSE"); '—' when not finite.
  // The legacy int(deg / 22.5 + 0.5), so boundary values land as they always did.
  S.compassWord = function (deg) {
    if (deg === null || deg === undefined || !isFinite(deg)) return '—';
    var d = ((deg % 360) + 360) % 360;
    return COMPASS[Math.trunc(d / 22.5 + 0.5) % 16];
  };

  // "calm", "light SSE wind", "breezy W wind", "strong N wind"; a missing
  // direction drops the compass word.
  S.windPhrase = function (mph, deg) {
    var c = S.windClass(mph);
    if (c === 'calm') return 'calm';
    var dir = deg === null || deg === undefined ? '' : S.compassWord(deg) + ' ';
    return (c === 'windy' ? 'strong' : c) + ' ' + dir + 'wind';
  };

  // The two amounts the sentence prints, at the dashboard's display
  // precision: precipitation 0.12 in / 3.1 mm, a gust 43 mph / 19.3 m/s.
  var AMOUNTS = {
    ppt: { us: [2, 'in', 1], si: [1, 'mm', 25.4] },
    gust: { us: [0, 'mph', 1], si: [1, 'm/s', 0.44704] },
  };
  S.formatAmount = function (kind, value, units) {
    var spec = AMOUNTS[kind][unitsOf(units)];
    var n = (value * spec[2]).toLocaleString('en-US', { minimumFractionDigits: spec[0], maximumFractionDigits: spec[0] });
    if (/^-0(\.0+)?$/.test(n)) n = n.slice(1);   // no "-0" after rounding
    return n + ' ' + spec[1];
  };

  var dayNumber = function (date) {
    return Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / DAY;
  };

  // Whole days since the last day with ≥ PRECIP_MIN_IN (0 = precipitation
  // today), as a lower bound; Infinity for none in the last week; null when
  // unknown. `p` is {sinceMidnight, last24h, last7d} (in; precipTotals),
  // `hourly` the hourly rows, `today` the Mountain date 'YYYY-MM-DD'.
  // Sources, best first: today's total (p.sinceMidnight), the daily totals of
  // the hourly rows (Mountain dates ≤ today), then the 7 d total. With no
  // precipitation in the hourly rows but some in the 7 d total, the answer is
  // the number of dry days the rows cover (true, if conservative).
  S.daysSincePrecip = function (p, hourly, today) {
    if (p.sinceMidnight !== null && p.sinceMidnight !== undefined && p.sinceMidnight >= S.PRECIP_MIN_IN) return 0;
    var totals = new Map();
    (hourly || []).forEach(function (r) {
      var v = r[S.PRECIP_KEY];
      var date = rowDate(r.datetime);
      if (typeof v === 'number' && isFinite(v) && date <= today) totals.set(date, (totals.get(date) || 0) + v);
    });
    var wet = [];
    totals.forEach(function (v, d) { if (v >= S.PRECIP_MIN_IN) wet.push(d); });
    wet.sort();
    if (wet.length) return dayNumber(today) - dayNumber(wet[wet.length - 1]);
    if (p.last7d !== null && p.last7d !== undefined && p.last7d < S.PRECIP_MIN_IN) return Infinity;
    if (totals.size) return dayNumber(today) - dayNumber(Array.from(totals.keys()).sort()[0]) + 1;
    if (p.last24h !== null && p.last24h !== undefined && p.last24h >= S.PRECIP_MIN_IN) return 1;
    return null;
  };

  // "0.12 in of precipitation today" ("3.1 mm …" in SI; "precipitation today"
  // without an amount), "no precipitation since yesterday", "no
  // precipitation in 4 days", "no precipitation in over a week", or null.
  S.precipPhrase = function (todayIn, days, units) {
    if (days === null || days === undefined) return null;
    if (days === 0) {
      return todayIn !== null && todayIn !== undefined && todayIn >= S.PRECIP_MIN_IN
        ? S.formatAmount('ppt', todayIn, units) + ' of precipitation today'
        : 'precipitation today';
    }
    if (days > S.DRY_CAP_DAYS) return 'no precipitation in over a week';
    return days === 1 ? 'no precipitation since yesterday' : 'no precipitation in ' + days + ' days';
  };

  // True from 18:00 to 05:59 Mountain: the sky phrase reads "… tonight".
  S.isEvening = function (nowWallMs) {
    var h = new Date(nowWallMs).getUTCHours();
    return h >= 18 || h < 6;
  };

  // One sentence from the parts that are known; '' when none are.
  // input: {shortForecast, windMph, windDeg, peakGustMph?, precipTodayIn,
  //         daysSincePrecip, nowWallMs, units?}. US values; `units` ('us',
  // the default, or 'si') sets only how the amounts print.
  S.summarize = function (input) {
    var sky = S.skyPhrase(input.shortForecast);
    var wind = input.windMph === null || input.windMph === undefined ? null : S.windPhrase(input.windMph, input.windDeg == null ? null : input.windDeg);
    var gust = input.peakGustMph == null ? null : input.peakGustMph;
    var parts = [
      sky && (S.isEvening(input.nowWallMs) ? sky + ' tonight' : sky),
      // A calm reading after a windy day says so: "calm after gusts to 43 mph earlier".
      wind === 'calm' && gust !== null && gust >= S.NOTABLE_GUST_MPH
        ? 'calm after gusts to ' + S.formatAmount('gust', gust, input.units) + ' earlier'
        : wind,
      S.precipPhrase(input.precipTodayIn, input.daysSincePrecip, input.units),
    ].filter(function (x) { return !!x; });
    if (!parts.length) return '';
    var s = parts.join(', ');
    return s[0].toUpperCase() + s.slice(1) + '.';
  };

  /* ── The inputs, from API rows ─────────────────────────────────────────── */

  // Rows with their wall-clock ms and Mountain date, ascending; unparseable
  // stamps dropped.
  function timed(rows) {
    var out = [];
    (rows || []).forEach(function (row) {
      var t = S.rowWallClock(row.datetime);
      if (t !== null) out.push({ t: t, date: typeof row.datetime === 'number' ? S.wallDate(t) : String(row.datetime).slice(0, 10), row: row });
    });
    return out.sort(function (a, b) { return a.t - b.t; });
  }

  // Peak gust (mph) in the `hours` (default 24) before `nowWallMs`: the
  // hourly maxima ("Gust Speed …" columns) of the hours that overlap that
  // window, and `latest` (/latest/'s gust). Null when no hourly row there
  // has a gust (not loaded yet, or no gust sensor).
  S.peakGust = function (rows, latest, nowWallMs, hours) {
    var h = hours === undefined ? 24 : hours;
    var gusts = [];
    timed(rows).forEach(function (r) {
      if (!(r.t > nowWallMs - (h + 1) * HOUR && r.t <= nowWallMs)) return;
      Object.keys(r.row).forEach(function (c) {
        if (c.indexOf('Gust Speed') === 0) { var v = num(r.row[c]); if (v !== null) gusts.push(v); }
      });
    });
    return gusts.length ? Math.max.apply(null, gusts.concat([latest == null ? -Infinity : latest])) : null;
  };

  // Hourly sums: since Mountain midnight of `today`, and the last 24 rows'
  // hours. Null without precipitation in the rows.
  S.hourlyPrecip = function (rows, today) {
    var all = timed(rows).filter(function (r) { return num(r.row[S.PRECIP_KEY]) !== null; });
    if (!all.length) return null;
    var end = all[all.length - 1].t;
    var sum = function (xs) { return xs.reduce(function (a, r) { return a + r.row[S.PRECIP_KEY]; }, 0); };
    return {
      sinceMidnight: sum(all.filter(function (r) { return r.date === today; })),
      last24h: sum(all.filter(function (r) { return r.t > end - 24 * HOUR; })),
    };
  };

  // {sinceMidnight, last24h, last7d, ytd} in inches: from the /derived/ppt/
  // row when there is one (HydroMet stations), else since midnight and 24 h
  // from the hourly rows, else all null.
  S.precipTotals = function (pptRow, hourly, today) {
    if (pptRow) {
      return {
        sinceMidnight: numLoose(pptRow['Precipitation Since Midnight [in]']),
        last24h: numLoose(pptRow['24-hour Precipitation [in]']),
        last7d: numLoose(pptRow['7-day Precipitation [in]']),
        ytd: numLoose(pptRow['Year to Date Precipitation [in]']),
      };
    }
    var h = hourly ? S.hourlyPrecip(hourly, today) : null;
    return { sinceMidnight: h ? h.sinceMidnight : null, last24h: h ? h.last24h : null, last7d: null, ytd: null };
  };

  // First finite value among a row's columns that start with `prefix`.
  function pick(row, prefix) {
    var keys = Object.keys(row);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf(prefix) === 0 && num(row[keys[i]]) !== null) return row[keys[i]];
    }
    return null;
  }

  // A /latest/ row → {wallMs, windMph, windDeg, gustMph}: the observation's
  // wall-clock ms (null if unparseable) and the first finite "Wind Speed",
  // "Wind Direction" and "Gust Speed" columns (any height), US units.
  S.readWind = function (row) {
    return {
      wallMs: S.rowWallClock(row.datetime),
      windMph: pick(row, 'Wind Speed'),
      windDeg: pick(row, 'Wind Direction'),
      gustMph: pick(row, 'Gust Speed'),
    };
  };

  // The NWS forecast period covering wall-clock `nowWallMs`, else the first;
  // null without periods. Period stamps carry the point's offset (Mountain
  // for Montana) and are read as wall clock.
  S.currentPeriod = function (periods, nowWallMs) {
    var list = periods || [];
    for (var i = 0; i < list.length; i++) {
      var s = S.parseWallClock(list[i].startTime), e = S.parseWallClock(list[i].endTime);
      if (s !== null && e !== null && s <= nowWallMs && nowWallMs < e) return list[i];
    }
    return list[0] || null;
  };

  // The summary's input from what an app already holds:
  //   latest   the station's /latest/ row (US units); the rest are optional
  //   hourly   its hourly rows, ≥ 24 h, ideally from Mountain midnight two
  //            days back (elements ppt and windgust, US units)
  //   ppt      its /derived/ppt/ row (HydroMet only)
  //   periods  the NWS forecast's periods
  //   today    the Mountain date 'YYYY-MM-DD' (default: from `now`)
  //   now      epoch ms (default Date.now()); only for `today`
  //   units    'us' | 'si', how the amounts print
  // Null without a /latest/ row whose time parses: as on the dashboard, no
  // observation, no sentence. "Now" for "tonight" and the 24 h gust window is
  // the observation's time, not the page clock.
  S.inputFrom = function (o) {
    var nowMs = o.now === undefined ? Date.now() : o.now;
    var today = o.today || S.wallDate(S.wallClockMs(nowMs));
    var w = o.latest ? S.readWind(o.latest) : null;
    if (!w || w.wallMs === null) return null;
    var at = w.wallMs;
    var p = S.precipTotals(o.ppt || null, o.hourly || null, today);
    var period = o.periods ? S.currentPeriod(o.periods, at) : null;
    return {
      shortForecast: period && typeof period.shortForecast === 'string' ? period.shortForecast : null,
      windMph: w.windMph,
      windDeg: w.windDeg,
      peakGustMph: S.peakGust(o.hourly, w.gustMph, at),
      precipTodayIn: p.sinceMidnight,
      daysSincePrecip: S.daysSincePrecip(p, o.hourly, today),
      nowWallMs: at,
      units: unitsOf(o.units),
    };
  };

  /* ── Fetching (optional) ───────────────────────────────────────────────────
     For an app that holds only a station and its coordinates. Up to four requests,
     in parallel; each that fails (network, HTTP status, timeout, a shape it
     does not expect) is null, and the sentence is made from the rest. Nothing
     here rejects or returns an error string.
       mesonet2 /latest/, /observations/hourly/ (ppt, windgust; from Mountain
       midnight two days back), /derived/ppt/ (HydroMet only)
       api.weather.gov /points/{lat},{lon} → its `forecast` URL
     CSP connect-src: https://mesonet2.climate.umt.edu https://api.weather.gov
     A forecast URL that is not on api.weather.gov is never fetched. */

  S.API = 'https://mesonet2.climate.umt.edu/api/v2/';
  S.NWS = 'https://api.weather.gov/';
  S.TIMEOUT_MS = 20000;   // under the API gateway's 30 s

  function getJson(url, timeoutMs, headers) {
    var init = { headers: headers || {} };
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) init.signal = AbortSignal.timeout(timeoutMs);
    // A fetch that throws (a CSP block in some engines) rejects instead.
    return Promise.resolve().then(function () { return fetch(url, init); }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  // A promise that resolves with null instead of rejecting.
  function soft(p) { return p.then(function (v) { return v === undefined ? null : v; }, function () { return null; }); }

  var _nws = null;   // points → forecast URL, per point, for the page's life
  function forecastUrl(lat, lon, timeoutMs) {
    var key = (+lat).toFixed(4) + ',' + (+lon).toFixed(4);
    var make = function () {
      // NWS answers ≤ 4 decimals; more redirects.
      return getJson(S.NWS + 'points/' + (+(+lat).toFixed(4)) + ',' + (+(+lon).toFixed(4)), timeoutMs, { Accept: 'application/geo+json' })
        .then(function (j) {
          var u = j && j.properties && j.properties.forecast;
          if (typeof u !== 'string' || u.indexOf(S.NWS) !== 0) throw new Error('no forecast URL on api.weather.gov');
          return u;
        });
    };
    if (!MCO.promiseCache) return make();
    if (!_nws) _nws = MCO.promiseCache();
    return _nws.cached(key, make);
  }

  // Fetch the parts for one station. opts:
  //   station   id (required for the Mesonet parts)
  //   lat, lon  decimal degrees (required for the forecast)
  //   derivedPpt  false to skip /derived/ppt/ (it answers 422 for
  //             non-HydroMet stations; pass sub_network === 'HydroMet')
  //   latest    the station's /latest/ row when the app already has it
  //             (US units); then /latest/ is not fetched again
  //   now       epoch ms (default Date.now()), for the hourly start date
  //   api, timeoutMs
  // → Promise<{latest, hourly, ppt, periods}>, each null when it failed.
  S.load = function (opts) {
    var o = opts || {};
    var api = o.api || S.API;
    var t = o.timeoutMs || S.TIMEOUT_MS;
    var nowMs = o.now === undefined ? Date.now() : o.now;
    var id = typeof o.station === 'string' && /^[a-z0-9_]{1,32}$/i.test(o.station) ? o.station : null;
    var today = S.wallDate(S.wallClockMs(nowMs));
    var start = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10) - 2)).toISOString().slice(0, 10);
    var q = function (path, extra) {
      return api + path + '?stations=' + encodeURIComponent(id) + '&type=json&units=us' + (extra || '');
    };
    var rows = function (path, extra) {
      if (!id) return Promise.resolve(null);
      return soft(getJson(q(path, extra), t).then(function (j) { return Array.isArray(j) ? j : null; }));
    };
    var latest = o.latest && typeof o.latest === 'object' ? Promise.resolve(o.latest) : rows('latest/').then(function (r) {
      return r && r.filter(function (x) { return x && x.station === id; })[0] || null;
    });
    var hourly = rows('observations/hourly/', '&elements=ppt,windgust&level=2&start_time=' + start);
    var ppt = o.derivedPpt === false ? Promise.resolve(null) : rows('derived/ppt/').then(function (r) {
      return r && r.filter(function (x) { return x && x.station === id; })[0] || null;
    });
    var periods = num(o.lat) !== null && num(o.lon) !== null
      ? soft(forecastUrl(o.lat, o.lon, t).then(function (u) {
        return getJson(u, t, { Accept: 'application/geo+json' });
      }).then(function (j) {
        var p = j && j.properties && j.properties.periods;
        return Array.isArray(p) ? p : null;
      }))
      : Promise.resolve(null);
    return Promise.all([latest, hourly, ppt, periods]).then(function (r) {
      return { latest: r[0], hourly: r[1], ppt: r[2], periods: r[3] };
    });
  };

  // load() then summarize(): → Promise<{text, input, parts}>. `text` is ''
  // when nothing is known; it never rejects. opts as load(), plus `units`.
  S.forStation = function (opts) {
    var o = opts || {};
    return S.load(o).then(function (parts) {
      var input = S.inputFrom({
        latest: parts.latest, hourly: parts.hourly, ppt: parts.ppt, periods: parts.periods,
        now: o.now, units: o.units,
      });
      return { text: input ? S.summarize(input) : '', input: input, parts: parts };
    }).catch(function () {
      return { text: '', input: null, parts: { latest: null, hourly: null, ppt: null, periods: null } };
    });
  };
})();
