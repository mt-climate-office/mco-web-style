#!/usr/bin/env node
/* Unit tests for summary/mco-summary.js (MCO.summary). Zero dependencies:
   node:test + node:assert, with the module loaded as a classic script in a
   node:vm context over a stub DOM, as tools/check-photos.mjs does (with
   core/mco-core.js before it, and once without core to show the pure part
   needs nothing from it).

   Ported from mesonet-dashboard web/src/core/overview/summary.test.ts
   (every case), with the summary cases of hero.test.ts and nowPage.test.ts,
   then the kit's own: epoch-ms rows across Mountain midnight and DST, units,
   the input assembly, and the optional fetcher over a stubbed fetch.

   Run it under more than one TZ: nothing may depend on the machine's zone.
     node tools/check-summary.mjs
     TZ=Pacific/Kiritimati node tools/check-summary.mjs
     TZ=Etc/GMT+12 node tools/check-summary.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');

/* ── Load the kit into a sandbox ─────────────────────────────────────────── */

function el(tag) {
  return {
    tagName: String(tag).toUpperCase(), className: '', style: {}, dataset: {}, children: [],
    attributes: {}, textContent: '',
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; },
    removeAttribute(k) { delete this.attributes[k]; },
    appendChild(c) { this.children.push(c); return c; },
    append(...c) { this.children.push(...c); },
    addEventListener() {}, removeEventListener() {},
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    querySelector() { return null; }, querySelectorAll() { return []; },
  };
}
function kit(files) {
  const sandbox = {
    console, setTimeout, clearTimeout, AbortSignal, Response, URLSearchParams, Map, Set, Promise, Intl,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    location: { search: '', pathname: '/', hash: '', href: 'http://localhost/' },
    history: { state: null, replaceState() {}, pushState() {} },
    addEventListener() {}, removeEventListener() {},
    fetch: (...a) => sandbox.fetchImpl(...a),
    fetchImpl: () => { throw new Error('fetch not stubbed'); },
  };
  sandbox.document = {
    documentElement: el('html'), body: el('body'), head: el('head'),
    createElement: el, addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const [name, src] of files) vm.runInContext(src, sandbox, { filename: name });
  return sandbox;
}
const CORE = ['core/mco-core.js', read('core/mco-core.js')];
const SUMMARY = ['summary/mco-summary.js', read('summary/mco-summary.js')];
const sandbox = kit([CORE, SUMMARY]);
const S = sandbox.MCO.summary;
const plain = (x) => JSON.parse(JSON.stringify(x));
const eq = (a, b, ...msg) => assert.deepStrictEqual(plain(a), plain(b), ...msg);
const stub = (fn) => { sandbox.fetchImpl = fn; };

/* ── Fixtures (the dashboard's) ──────────────────────────────────────────── */

const P = { sinceMidnight: null, last24h: null, last7d: null, ytd: null };
const NOON = Date.UTC(2026, 9, 2, 12);
const NIGHT = Date.UTC(2026, 9, 2, 21);
// Hourly rows as the dashboard reads them: Mountain wall-clock strings.
const rows = (byDate) => Object.entries(byDate).map(([d, v]) => ({ station: 'x', datetime: `${d} 12:00:00-06:00`, 'Precipitation [in]': v }));
const DRY = rows({ '2026-09-30': 0, '2026-10-01': 0, '2026-10-02': 0 });
// An instant from a Mountain wall-clock reading (MDT, UTC−6, for these dates).
const mdt = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h + 6, mi);

/* ── Loading ─────────────────────────────────────────────────────────────── */

test('load: lands on MCO.summary; the pure part runs without core', () => {
  assert.equal(sandbox.MCO.versions.summary, '0.1.0');
  const bare = kit([SUMMARY]).MCO.summary;
  assert.equal(bare.summarize({ shortForecast: 'Sunny', windMph: 3, windDeg: 0, precipTodayIn: 0, daysSincePrecip: 2, nowWallMs: NOON }),
    'Clear, light N wind, no precipitation in 2 days.');
});

/* ── skyPhrase (ported) ──────────────────────────────────────────────────── */

test('skyPhrase: NWS shortForecast → a few words', () => {
  for (const [input, out] of [
    ['Sunny', 'clear'],
    ['Clear', 'clear'],
    ['Mostly Clear', 'mostly clear'],
    ['Mostly Sunny', 'mostly clear'],
    ['Partly Sunny', 'partly cloudy'],
    ['Partly Cloudy', 'partly cloudy'],
    ['Mostly Cloudy', 'mostly cloudy'],
    ['Cloudy', 'cloudy'],
    ['Rain Showers', 'rain'],
    ['Slight Chance Rain Showers', 'chance of rain'],
    ['Snow Showers Likely', 'snow likely'],
    ['Chance Rain And Snow', 'chance of rain and snow'],
    ['Showers And Thunderstorms Likely then Mostly Sunny', 'thunderstorms likely'],
    ['Mostly Sunny then Chance Showers', 'mostly clear'],
    ['Patchy Fog', 'fog'],
    ['Areas Of Smoke', 'smoke'],
    ['Freezing Drizzle', 'freezing rain'],
    ['Frost', null],
    ['', null],
    [null, null],
  ]) assert.equal(S.skyPhrase(input), out, String(input));
  // Kit edges: undefined, haze, dust, blizzard, overcast, fair.
  assert.equal(S.skyPhrase(undefined), null);
  assert.equal(S.skyPhrase('Haze'), 'haze');
  assert.equal(S.skyPhrase('Blowing Dust'), 'dust');
  assert.equal(S.skyPhrase('Blizzard'), 'snow');
  assert.equal(S.skyPhrase('Overcast'), 'cloudy');
  assert.equal(S.skyPhrase('Fair'), 'clear');
  assert.equal(S.skyPhrase('Chance Sleet'), 'chance of freezing rain');
});

/* ── wind (ported) ───────────────────────────────────────────────────────── */

test('windClass: calm < 1 ≤ light < 10 ≤ breezy < 20 ≤ windy', () => {
  for (const [mph, c] of [[0, 'calm'], [0.9, 'calm'], [1, 'light'], [2.9, 'light'], [9.9, 'light'], [10, 'breezy'], [19.9, 'breezy'], [20, 'windy']]) {
    assert.equal(S.windClass(mph), c, String(mph));
  }
  // Each edge from below and at it.
  assert.equal(S.windClass(S.CALM_MPH - 0.01), 'calm');
  assert.equal(S.windClass(S.CALM_MPH), 'light');
  assert.equal(S.windClass(9.999), 'light');
  assert.equal(S.windClass(19.999), 'breezy');
  assert.equal(S.CALM_MPH, 1);
});

test('windPhrase: class, compass word, "strong" for windy', () => {
  for (const [mph, deg, out] of [
    [0.5, 160, 'calm'],
    [2, 157.5, 'light SSE wind'],
    [5, 157.5, 'light SSE wind'],
    [12, 270, 'breezy W wind'],
    [25, 0, 'strong N wind'],
    [12, null, 'breezy wind'],
  ]) assert.equal(S.windPhrase(mph, deg), out);
  assert.equal(S.windPhrase(12, undefined), 'breezy wind');
});

test('compassWord: 16 points, the legacy rounding, wrapped degrees', () => {
  assert.equal(S.compassWord(0), 'N');
  assert.equal(S.compassWord(11.24), 'N');
  assert.equal(S.compassWord(11.25), 'NNE');
  assert.equal(S.compassWord(348.75), 'N');
  assert.equal(S.compassWord(348.74), 'NNW');
  assert.equal(S.compassWord(360), 'N');
  assert.equal(S.compassWord(-90), 'W');
  assert.equal(S.compassWord(450), 'E');
  assert.equal(S.compassWord(null), '—');
  assert.equal(S.compassWord(NaN), '—');
});

/* ── daysSincePrecip (ported) ────────────────────────────────────────────── */

test('daysSincePrecip: the dashboard cases', () => {
  for (const [name, p, hourly, days] of [
    ['rain today (summary)', { ...P, sinceMidnight: 0.2 }, undefined, 0],
    ['rain today (hourly only)', P, rows({ '2026-10-01': 0, '2026-10-02': 0.05 }), 0],
    ['last rain yesterday', { ...P, sinceMidnight: 0 }, rows({ '2026-09-30': 0.3, '2026-10-01': 0.01, '2026-10-02': 0 }), 1],
    ['last rain 2 days ago; a trace is not rain', P, rows({ '2026-09-30': 0.02, '2026-10-01': 0.005, '2026-10-02': 0 }), 2],
    ['dry rows, wet week: the dry days covered', { ...P, last7d: 0.4 }, DRY, 3],
    ['dry rows, no 7 d total: still the dry days covered', P, DRY, 3],
    ['dry week', { ...P, last7d: 0 }, DRY, Infinity],
    ['dry week, no rows', { ...P, sinceMidnight: 0, last7d: 0 }, undefined, Infinity],
    ['24 h only (rain before midnight)', { ...P, sinceMidnight: 0, last24h: 0.1 }, undefined, 1],
    ['nothing known', P, undefined, null],
    ['rows after today are ignored', P, rows({ '2026-10-01': 0, '2026-10-03': 1 }), 2],
  ]) assert.equal(S.daysSincePrecip(p, hourly, '2026-10-02'), days, name);
});

test('daysSincePrecip: epoch-ms rows count by the Mountain date, across midnight', () => {
  const at = (ms, v) => ({ station: 'x', datetime: ms, 'Precipitation [in]': v });
  // 0.3 in at 23:30 MDT on 30 Sep is 05:30 UTC on 1 Oct: it is 30 Sep's rain.
  const late = [at(mdt(2026, 9, 30, 23, 30), 0.3), at(mdt(2026, 10, 1, 0, 30), 0), at(mdt(2026, 10, 2, 9), 0)];
  assert.equal(S.daysSincePrecip(P, late, '2026-10-02'), 2);
  // The same amount half an hour later, 00:30 MDT on 1 Oct: yesterday.
  const early = [at(mdt(2026, 9, 30, 23, 30), 0), at(mdt(2026, 10, 1, 0, 30), 0.3), at(mdt(2026, 10, 2, 9), 0)];
  assert.equal(S.daysSincePrecip(P, early, '2026-10-02'), 1);
  // Today's first hour: 00:10 MDT on the 2nd.
  assert.equal(S.daysSincePrecip(P, [at(mdt(2026, 10, 2, 0, 10), 0.02)], '2026-10-02'), 0);
  // Hours that sum past the threshold on one Mountain date count; split across midnight they do not.
  const split = [at(mdt(2026, 10, 1, 23, 30), 0.005), at(mdt(2026, 10, 2, 0, 30), 0.005)];
  assert.equal(S.daysSincePrecip(P, split, '2026-10-02'), 2);   // dry rows from 1 Oct: 2 days covered
  const same = [at(mdt(2026, 10, 1, 22), 0.005), at(mdt(2026, 10, 1, 23), 0.005), at(mdt(2026, 10, 2, 9), 0)];
  assert.equal(S.daysSincePrecip(P, same, '2026-10-02'), 1);
  // Epoch and wall-clock rows for the same hours agree.
  const wall = rows({ '2026-09-30': 0.3, '2026-10-01': 0, '2026-10-02': 0 });
  const epoch = [at(mdt(2026, 9, 30, 12), 0.3), at(mdt(2026, 10, 1, 12), 0), at(mdt(2026, 10, 2, 12), 0)];
  assert.equal(S.daysSincePrecip(P, epoch, '2026-10-02'), S.daysSincePrecip(P, wall, '2026-10-02'));
});

test('daysSincePrecip: across the DST change (MST after 1 Nov 2026)', () => {
  // 23:30 MST on 1 Nov is 06:30 UTC on 2 Nov.
  const r = [{ datetime: Date.UTC(2026, 10, 2, 6, 30), 'Precipitation [in]': 0.2 }, { datetime: Date.UTC(2026, 10, 3, 18), 'Precipitation [in]': 0 }];
  assert.equal(S.daysSincePrecip(P, r, '2026-11-03'), 2);
});

/* ── precipPhrase (ported) ───────────────────────────────────────────────── */

test('precipPhrase: amount today, days, the week cap', () => {
  for (const [today, days, out] of [
    [0.123, 0, '0.12 in of precipitation today'],
    [null, 0, 'precipitation today'],
    [0, 1, 'no precipitation since yesterday'],
    [0, 5, 'no precipitation in 5 days'],
    [0, 7, 'no precipitation in 7 days'],
    [0, 8, 'no precipitation in over a week'],
    [0, Infinity, 'no precipitation in over a week'],
    [null, null, null],
  ]) assert.equal(S.precipPhrase(today, days), out);
  // A trace today with the day counted wet by the rows: no amount.
  assert.equal(S.precipPhrase(0.005, 0), 'precipitation today');
  assert.equal(S.precipPhrase(1234.5, 0), '1,234.50 in of precipitation today');
});

/* ── summarize (ported) ──────────────────────────────────────────────────── */

const base = { shortForecast: 'Partly Cloudy', windMph: 6, windDeg: 157.5, precipTodayIn: 0, daysSincePrecip: 5, nowWallMs: NOON };

test('summarize: the dashboard cases', () => {
  for (const [name, input, out] of [
    ['all parts by day', base, 'Partly cloudy, light SSE wind, no precipitation in 5 days.'],
    ['tonight', { ...base, shortForecast: 'Mostly Clear', nowWallMs: NIGHT }, 'Mostly clear tonight, light SSE wind, no precipitation in 5 days.'],
    ['no forecast', { ...base, shortForecast: null }, 'Light SSE wind, no precipitation in 5 days.'],
    ['raining, windy', { ...base, shortForecast: 'Rain', windMph: 24, windDeg: 270, precipTodayIn: 0.42, daysSincePrecip: 0 }, 'Rain, strong W wind, 0.42 in of precipitation today.'],
    ['calm, dry week', { ...base, windMph: 0.5, daysSincePrecip: Infinity }, 'Partly cloudy, calm, no precipitation in over a week.'],
    ['calm after a windy day', { ...base, windMph: 0.4, peakGustMph: 43.24 }, 'Partly cloudy, calm after gusts to 43 mph earlier, no precipitation in 5 days.'],
    ['calm after light gusts', { ...base, windMph: 0.4, peakGustMph: 24 }, 'Partly cloudy, calm, no precipitation in 5 days.'],
    ['nothing known', { ...base, shortForecast: null, windMph: null, daysSincePrecip: null }, ''],
  ]) assert.equal(S.summarize(input), out, name);
});

test('summarize: VOICE.md model sentence, and the hero cases', () => {
  assert.equal(S.summarize({ shortForecast: 'Partly Cloudy', windMph: 0.3, windDeg: 200, precipTodayIn: 0, daysSincePrecip: 3, nowWallMs: NIGHT }),
    'Partly cloudy tonight, calm, no precipitation in 3 days.');
  // hero.test.ts: a breezy ESE evening two days after rain, with and without the forecast.
  const hero = { shortForecast: 'Mostly Clear', windMph: 12, windDeg: 112.5, precipTodayIn: 0, daysSincePrecip: 2, nowWallMs: NIGHT };
  assert.equal(S.summarize(hero), 'Mostly clear tonight, breezy ESE wind, no precipitation in 2 days.');
  assert.equal(S.summarize({ ...hero, shortForecast: null }), 'Breezy ESE wind, no precipitation in 2 days.');
});

test('summarize: one calm threshold either side of CALM_MPH; gust note only when calm and ≥ 25 mph', () => {
  assert.match(S.summarize({ ...base, windMph: S.CALM_MPH - 0.01 }), /\bcalm\b/);
  assert.match(S.summarize({ ...base, windMph: S.CALM_MPH }), /light SSE wind/);
  assert.match(S.summarize({ ...base, windMph: 0, peakGustMph: 25 }), /calm after gusts to 25 mph earlier/);
  assert.match(S.summarize({ ...base, windMph: 0, peakGustMph: 24.99 }), /, calm, /);
  assert.match(S.summarize({ ...base, windMph: 5, peakGustMph: 60 }), /light SSE wind/);   // not calm: no gust note
  assert.match(S.summarize({ ...base, windMph: 0, peakGustMph: null }), /, calm, /);
  assert.match(S.summarize({ ...base, windMph: 9.9 }), /light/);
  assert.match(S.summarize({ ...base, windMph: 10 }), /breezy/);
  assert.match(S.summarize({ ...base, windMph: 20 }), /strong/);
});

test('summarize: no forecast, no wind, only one part', () => {
  assert.equal(S.summarize({ ...base, shortForecast: null, windMph: null }), 'No precipitation in 5 days.');
  assert.equal(S.summarize({ ...base, windMph: null, daysSincePrecip: null }), 'Partly cloudy.');
  assert.equal(S.summarize({ ...base, shortForecast: 'Frost', daysSincePrecip: null }), 'Light SSE wind.');
  assert.equal(S.summarize({ ...base, shortForecast: undefined, windMph: undefined, daysSincePrecip: undefined }), '');
});

test('isEvening: 18:00–05:59 wall clock', () => {
  assert.equal(S.isEvening(Date.UTC(2026, 9, 2, 17, 59)), false);
  assert.equal(S.isEvening(Date.UTC(2026, 9, 2, 18)), true);
  assert.equal(S.isEvening(Date.UTC(2026, 9, 2, 5, 59)), true);
  assert.equal(S.isEvening(Date.UTC(2026, 9, 2, 6)), false);
});

/* ── Units ───────────────────────────────────────────────────────────────── */

test('units: SI prints mm and m/s; thresholds stay US', () => {
  assert.equal(S.precipPhrase(0.123, 0, 'si'), '3.1 mm of precipitation today');   // ported
  assert.equal(S.windClass(9.9), 'light');                                         // ported
  assert.equal(S.precipPhrase(0.123, 0, 'us'), '0.12 in of precipitation today');
  assert.equal(S.precipPhrase(0.123, 0, 'bogus'), '0.12 in of precipitation today');
  const calm = { ...base, windMph: 0.4, peakGustMph: 43.24 };
  assert.equal(S.summarize({ ...calm, units: 'si' }), 'Partly cloudy, calm after gusts to 19.3 m/s earlier, no precipitation in 5 days.');
  assert.equal(S.summarize({ ...calm, units: 'us' }), 'Partly cloudy, calm after gusts to 43 mph earlier, no precipitation in 5 days.');
  assert.equal(S.summarize({ ...base, precipTodayIn: 0.42, daysSincePrecip: 0, units: 'si' }), 'Partly cloudy, light SSE wind, 10.7 mm of precipitation today.');
  // The gust threshold is 25 mph in either system (11.2 m/s).
  assert.match(S.summarize({ ...base, windMph: 0, peakGustMph: 24.99, units: 'si' }), /, calm, /);
  assert.equal(S.formatAmount('ppt', 0.001, 'si'), '0.0 mm');
  assert.equal(S.formatAmount('gust', -0.1, 'us'), '0 mph');
});

/* ── Rows → input ────────────────────────────────────────────────────────── */

test('wall clock: strings read as written; instants in Mountain time, DST-aware', () => {
  assert.equal(S.parseWallClock('2026-10-02 12:00:00-06:00'), Date.UTC(2026, 9, 2, 12));
  assert.equal(S.parseWallClock('2026-10-02T18:00:00-06:00'), Date.UTC(2026, 9, 2, 18));
  assert.equal(S.parseWallClock('2026-10-02'), Date.UTC(2026, 9, 2));
  assert.equal(S.parseWallClock('None'), null);
  assert.equal(S.parseWallClock(''), null);
  assert.equal(S.parseWallClock(5), null);
  assert.equal(S.wallClockMs(mdt(2026, 10, 2, 12, 5)), Date.UTC(2026, 9, 2, 12, 5));      // MDT
  assert.equal(S.wallClockMs(Date.UTC(2026, 11, 2, 19)), Date.UTC(2026, 11, 2, 12));       // MST
  assert.equal(S.wallClockMs(Date.UTC(2026, 9, 3, 6)), Date.UTC(2026, 9, 3, 0));           // midnight, not 24:00
  assert.equal(S.wallClockMs(null), null);
  assert.equal(S.rowWallClock(mdt(2026, 10, 2, 9)), Date.UTC(2026, 9, 2, 9));
  assert.equal(S.wallDate(Date.UTC(2026, 9, 2, 23, 59)), '2026-10-02');
});

test('peakGust: the hours overlapping the window, and the latest gust (series.ts)', () => {
  const now = Date.UTC(2026, 9, 2, 12);
  const g = (h, v) => ({ datetime: `2026-10-02 ${String(h).padStart(2, '0')}:00:00-06:00`, 'Gust Speed @ 10 m [mi/h]': v });
  assert.equal(S.peakGust([g(10, 20), g(11, 31), g(12, 18)], 12, now), 31);
  assert.equal(S.peakGust([g(10, 20)], 40, now), 40);
  assert.equal(S.peakGust([], 40, now), null);                 // no hourly gusts: unknown
  assert.equal(S.peakGust(undefined, 40, now), null);
  assert.equal(S.peakGust([g(10, null)], 40, now), null);
  // The window is (now − 25 h, now]: the hour stamped 12:00 yesterday is in it, 11:00 is not.
  const y = (h, v) => ({ datetime: `2026-10-01 ${h}:00:00-06:00`, 'Gust Speed [mi/hr]': v });
  assert.equal(S.peakGust([y(12, 50), g(9, 5)], null, now), 50);
  assert.equal(S.peakGust([y(11, 50), g(9, 5)], null, now), 5);
  assert.equal(S.peakGust([g(13, 99), g(9, 5)], null, now), 5);   // after now: ignored
  // Epoch rows.
  assert.equal(S.peakGust([{ datetime: mdt(2026, 10, 2, 11), 'Gust Speed @ 10 m [mi/h]': 33 }], null, now), 33);
});

test('precipTotals: /derived/ppt/ first, else hourly sums (precip.ts, series.ts)', () => {
  const ppt = { station: 'x', 'Precipitation Since Midnight [in]': 0.1, '24-hour Precipitation [in]': '0.2', '7-day Precipitation [in]': 0.5, 'Year to Date Precipitation [in]': 9.1 };
  eq(S.precipTotals(ppt, null, '2026-10-02'), { sinceMidnight: 0.1, last24h: 0.2, last7d: 0.5, ytd: 9.1 });
  eq(S.precipTotals({ 'Precipitation Since Midnight [in]': '' }, null, '2026-10-02'), { sinceMidnight: null, last24h: null, last7d: null, ytd: null });
  const h = (d, hh, v) => ({ datetime: `${d} ${hh}:00:00-06:00`, 'Precipitation [in]': v });
  const hr = [h('2026-10-01', '10', 0.3), h('2026-10-01', '23', 0.05), h('2026-10-02', '01', 0.02), h('2026-10-02', '09', 0.01)];
  const t = S.precipTotals(null, hr, '2026-10-02');
  assert.ok(Math.abs(t.sinceMidnight - 0.03) < 1e-9);
  assert.ok(Math.abs(t.last24h - 0.38) < 1e-9);   // rows after 09:00 yesterday (the newest row − 24 h)
  assert.equal(t.last7d, null);
  eq(S.precipTotals(null, null, '2026-10-02'), { sinceMidnight: null, last24h: null, last7d: null, ytd: null });
  eq(S.precipTotals(null, [{ datetime: '2026-10-02 01:00', 'Precipitation [in]': null }], '2026-10-02'), { sinceMidnight: null, last24h: null, last7d: null, ytd: null });
});

test('readWind and currentPeriod', () => {
  const row = { station: 'x', datetime: mdt(2026, 10, 2, 21, 5), 'Wind Speed @ 10 m [mi/h]': null, 'Wind Speed @ 8 ft [mi/h]': 4, 'Wind Direction @ 10 m [deg]': 200, 'Gust Speed @ 10 m [mi/h]': 9 };
  eq(S.readWind(row), { wallMs: Date.UTC(2026, 9, 2, 21, 5), windMph: 4, windDeg: 200, gustMph: 9 });
  eq(S.readWind({ datetime: 'x' }), { wallMs: null, windMph: null, windDeg: null, gustMph: null });
  const periods = [
    { name: 'This Afternoon', startTime: '2026-10-02T12:00:00-06:00', endTime: '2026-10-02T18:00:00-06:00', shortForecast: 'Sunny' },
    { name: 'Tonight', startTime: '2026-10-02T18:00:00-06:00', endTime: '2026-10-03T06:00:00-06:00', shortForecast: 'Mostly Clear' },
  ];
  assert.equal(S.currentPeriod(periods, Date.UTC(2026, 9, 2, 21)).name, 'Tonight');
  assert.equal(S.currentPeriod(periods, Date.UTC(2026, 9, 2, 18)).name, 'Tonight');
  assert.equal(S.currentPeriod(periods, Date.UTC(2026, 9, 2, 17, 59)).name, 'This Afternoon');
  assert.equal(S.currentPeriod(periods, Date.UTC(2026, 9, 4)).name, 'This Afternoon');   // none covers: the first
  assert.equal(S.currentPeriod([], 0), null);
  assert.equal(S.currentPeriod(undefined, 0), null);
});

const PERIODS = [
  { name: 'Today', startTime: '2026-10-02T06:00:00-06:00', endTime: '2026-10-02T18:00:00-06:00', shortForecast: 'Sunny' },
  { name: 'Tonight', startTime: '2026-10-02T18:00:00-06:00', endTime: '2026-10-03T06:00:00-06:00', shortForecast: 'Partly Cloudy then Chance Rain Showers' },
];
const LATEST = { station: 'x', datetime: mdt(2026, 10, 2, 21, 5), 'Wind Speed @ 10 m [mi/h]': 0.4, 'Wind Direction @ 10 m [deg]': 200, 'Gust Speed @ 10 m [mi/h]': 2 };
const HOURLY = [
  { datetime: mdt(2026, 9, 30, 12), 'Precipitation [in]': 0.2, 'Gust Speed @ 10 m [mi/h]': 10 },
  { datetime: mdt(2026, 10, 1, 12), 'Precipitation [in]': 0, 'Gust Speed @ 10 m [mi/h]': 12 },
  { datetime: mdt(2026, 10, 2, 15), 'Precipitation [in]': 0, 'Gust Speed @ 10 m [mi/h]': 38.6 },
  { datetime: mdt(2026, 10, 2, 21), 'Precipitation [in]': 0, 'Gust Speed @ 10 m [mi/h]': 3 },
];
const NOW = mdt(2026, 10, 2, 21, 10);

test('inputFrom: API JSON rows → the sentence', () => {
  const input = S.inputFrom({ latest: LATEST, hourly: HOURLY, periods: PERIODS, now: NOW });
  eq(input, { shortForecast: 'Partly Cloudy then Chance Rain Showers', windMph: 0.4, windDeg: 200, peakGustMph: 38.6, precipTodayIn: 0, daysSincePrecip: 2, nowWallMs: Date.UTC(2026, 9, 2, 21, 5), units: 'us' });
  assert.equal(S.summarize(input), 'Partly cloudy tonight, calm after gusts to 39 mph earlier, no precipitation in 2 days.');
  // The /derived/ppt/ row wins over the hourly sums.
  const wet = S.inputFrom({ latest: LATEST, hourly: HOURLY, ppt: { 'Precipitation Since Midnight [in]': 0.07, '7-day Precipitation [in]': 0.27 }, now: NOW, units: 'si' });
  assert.equal(S.summarize(wet), 'Calm after gusts to 17.3 m/s earlier, 1.8 mm of precipitation today.');
  // No forecast, no hourly rows: wind only (the gust is unknown without them).
  assert.equal(S.summarize(S.inputFrom({ latest: LATEST, now: NOW })), 'Calm.');
  // No /latest/ row, or one whose time does not parse: no input, no sentence.
  assert.equal(S.inputFrom({ hourly: HOURLY, periods: PERIODS, now: NOW }), null);
  assert.equal(S.inputFrom({ latest: { datetime: null }, now: NOW }), null);
});

/* ── The optional fetcher ────────────────────────────────────────────────── */

const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
function routes(table, log) {
  return (url, init) => {
    log && log.push(String(url));
    for (const [re, fn] of table) if (re.test(url)) return fn(url, init);
    return json({ detail: 'not found' }, 404);
  };
}
const NWS_POINT = { properties: { forecast: 'https://api.weather.gov/gridpoints/MSO/1,2/forecast' } };

test('forStation: four requests, one sentence', async () => {
  const log = [];
  stub(routes([
    [/\/latest\//, () => json([LATEST])],
    [/\/observations\/hourly\//, () => json(HOURLY)],
    [/\/derived\/ppt\//, () => json([{ station: 'x', 'Precipitation Since Midnight [in]': 0, '7-day Precipitation [in]': 0.2 }])],
    [/\/points\//, () => json(NWS_POINT)],
    [/\/gridpoints\//, () => json({ properties: { periods: PERIODS } })],
  ], log));
  const r = await S.forStation({ station: 'x', lat: 46.123456, lon: -113.98765, now: NOW });
  assert.equal(r.text, 'Partly cloudy tonight, calm after gusts to 39 mph earlier, no precipitation in 2 days.');
  assert.ok(log.some((u) => u === 'https://mesonet2.climate.umt.edu/api/v2/latest/?stations=x&type=json&units=us'));
  assert.ok(log.some((u) => u === 'https://mesonet2.climate.umt.edu/api/v2/observations/hourly/?stations=x&type=json&units=us&elements=ppt,windgust&level=2&start_time=2026-09-30'));
  assert.ok(log.some((u) => u === 'https://api.weather.gov/points/46.1235,-113.9877'));
});

test('forStation: each failed part is null; it never rejects', async () => {
  // NWS down, ppt 422 (an AgriMet station): wind and the hourly rows still speak.
  stub(routes([
    [/\/latest\//, () => json([LATEST])],
    [/\/observations\/hourly\//, () => json(HOURLY)],
    [/\/derived\/ppt\//, () => json({ detail: [] }, 422)],
    [/\/points\//, () => Promise.reject(new TypeError('Failed to fetch'))],
  ]));
  let r = await S.forStation({ station: 'x', lat: 46.5, lon: -114.1, now: NOW });
  eq(r.parts.ppt, null);
  eq(r.parts.periods, null);
  assert.equal(r.text, 'Calm after gusts to 39 mph earlier, no precipitation in 2 days.');
  // Everything fails: '' and null parts.
  stub(() => Promise.reject(new TypeError('offline')));
  r = await S.forStation({ station: 'x', lat: 46.5, lon: -114.1, now: NOW });
  eq(r, { text: '', input: null, parts: { latest: null, hourly: null, ppt: null, periods: null } });
  // fetch itself throws synchronously.
  stub(() => { throw new Error('boom'); });
  r = await S.forStation({ station: 'x', now: NOW });
  assert.equal(r.text, '');
  // Unexpected shapes are null, not errors.
  stub(routes([[/\/latest\//, () => json({ rows: [] })], [/\/observations\//, () => json('nope')]]));
  r = await S.forStation({ station: 'x', now: NOW });
  eq(r.parts, { latest: null, hourly: null, ppt: null, periods: null });
});

test('forStation: options; a forecast URL off api.weather.gov is never fetched', async () => {
  const log = [];
  stub(routes([
    [/\/latest\//, () => json([LATEST, { ...LATEST, station: 'other' }])],
    [/\/points\//, () => json({ properties: { forecast: 'https://evil.example/forecast' } })],
  ], log));
  const r = await S.forStation({ station: 'x', lat: 45.0001, lon: -110.0002, derivedPpt: false, now: NOW, units: 'si' });
  assert.ok(!log.some((u) => /evil|derived/.test(u)), log.join('\n'));
  assert.equal(r.parts.latest.station, 'x');
  assert.equal(r.input.units, 'si');
  assert.equal(r.text, 'Calm.');
  // A /latest/ row the app already holds is used, not fetched again.
  log.length = 0;
  const held = await S.forStation({ station: 'x', latest: { ...LATEST, 'Wind Speed @ 10 m [mi/h]': 12 }, derivedPpt: false, now: NOW });
  assert.ok(!log.some((u) => /\/latest\//.test(u)), log.join('\n'));
  assert.equal(held.text, 'Breezy SSW wind.');
  // No coordinates: no NWS request. A bad station id: no Mesonet request.
  log.length = 0;
  await S.forStation({ station: 'Bad id!', now: NOW });
  assert.equal(log.length, 0);
  // A good NWS point is cached for the page (MCO.promiseCache, with core
  // loaded); the failed one above was not, so it is asked again.
  log.length = 0;
  stub(routes([[/\/points\//, () => json(NWS_POINT)], [/\/gridpoints\//, () => json({ properties: { periods: PERIODS } })]], log));
  await S.load({ station: 'x', lat: 45.0001, lon: -110.0002, derivedPpt: false, now: NOW });
  assert.equal(log.filter((u) => /\/points\//.test(u)).length, 1);
  await S.load({ station: 'x', lat: 45.0001, lon: -110.0002, derivedPpt: false, now: NOW });
  assert.equal(log.filter((u) => /\/points\//.test(u)).length, 1, 'second load reuses the point');
  assert.equal(log.filter((u) => /\/gridpoints\//.test(u)).length, 2, 'the forecast itself is fetched each time');
});

test('load: the hourly start is Mountain midnight two days back, by the Mountain date', async () => {
  const log = [];
  stub(routes([], log));
  // 23:30 MDT on 2 Oct is already 3 Oct in UTC; the start is still 30 Sep.
  await S.load({ station: 'x', derivedPpt: false, now: mdt(2026, 10, 2, 23, 30) });
  assert.ok(log.some((u) => /start_time=2026-09-30$/.test(u)), log.join('\n'));
});
