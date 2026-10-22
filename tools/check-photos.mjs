#!/usr/bin/env node
/* Unit tests for photos/mco-photos.js (MCO.photos). Zero dependencies:
   node:test + node:assert, with core/mco-core.js and the photos module loaded
   as classic scripts in a node:vm context over a stub DOM, the way
   check-contrast.mjs loads the palette.

   Ported from mesonet-dashboard web/src/core/photos/photos.test.ts (vitest),
   plus the Photo Explorer's slot rules and the website's D7/D8 rules.

     node tools/check-photos.mjs           # the suite (CI)
     node tools/check-photos.mjs --live    # also sanity-check the live data2 files

   Run it under more than one TZ: the module must not depend on the machine's
   zone (TZ=Pacific/Kiritimati and TZ=Etc/GMT+12 are the edges that broke
   shiftDate once). CI runs three. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = process.argv.includes('--live');

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
const mq = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const sandbox = {
  console, setTimeout, clearTimeout, AbortSignal, Response, URLSearchParams,
  matchMedia: mq,
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
for (const f of ['core/mco-core.js', 'photos/mco-photos.js']) {
  vm.runInContext(readFileSync(join(root, f), 'utf8'), sandbox, { filename: f });
}
const MCO = sandbox.MCO;
const P = MCO.photos;
// Values cross a realm boundary; compare them as plain JSON.
const plain = (x) => JSON.parse(JSON.stringify(x));
const eq = (a, b, ...msg) => assert.deepStrictEqual(plain(a), plain(b), ...msg);
const stub = (fn) => { sandbox.fetchImpl = fn; };

/* ── Fixtures ────────────────────────────────────────────────────────────── */

const B = 'https://data2.climate.umt.edu/mesonet/';
const view = (name, slots) => ({ view: name, slots_local: slots });
const S915 = ['09:00', '15:00'], S3 = ['09:00', '12:00', '15:00'], S9 = ['09:00'];

// Shaped like the live file (2026-10-21): legacy patrol, the eight-view plan
// from 2026-09-20, and the re-aimed ten-view plan from the cutover.
const RAW = {
  schema: 1,
  patterns: { base: B, ...plain(P.DEFAULT_PATTERNS) },
  snap_max_seconds: 1800,
  stations: {
    acebozem: {
      first_month: '2017-01', name: 'Bozeman',
      periods: [
        { from: '2000-01-01T00:00:00-07:00', until: '2026-09-20T10:06:00-06:00',
          views: { S: view('South', S915), N: view('North', S915), E: view('East', S915),
                   W: view('West', S915), NS: view('NS', S915), SNOW: view('Snow', S915) } },
        { from: '2026-09-20T10:06:00-06:00', until: '2026-10-21T16:00:00-06:00',
          views: { N: view('North', S3), E: view('East', S3), S: view('South', S3),
                   W: view('West', S3), SNOW: view('Snow', S3) } },
        { from: '2026-10-21T16:00:00-06:00', until: null,
          views: { N: view('North', S3), E: view('East', S3), S: view('South', S3), W: view('West', S3),
                   NSNOW: view('North Snow', S9), SSNOW: view('South Snow', S9), PLUVIO: view('Pluvio', S9),
                   SOLAR: view('SolarPanel', S9), SNOW: view('Snow', S9), PARK: view('Park', S3) } },
      ],
    },
    // Two more ordinary stations, so the pilot below is a minority.
    acebrady: {
      first_month: '2023-05', name: 'Brady',
      periods: [
        { from: '2000-01-01T00:00:00-07:00', until: '2026-10-21T16:00:00-06:00',
          views: { N: view('North', S915), E: view('East', S915), W: view('West', S915) } },
        { from: '2026-10-21T16:00:00-06:00', until: null,
          views: { N: view('North', S3), E: view('East', S3), S: view('South', S3), W: view('West', S3) } },
      ],
    },
    acecrowa: {
      first_month: '2024-01', name: 'Crow Agency',
      periods: [
        { from: '2000-01-01T00:00:00-07:00', until: '2026-10-21T16:00:00-06:00',
          views: { E: view('East', S915), W: view('West', S915), NS: view('NS', S915), SS: view('SS', S915) } },
        { from: '2026-10-21T16:00:00-06:00', until: null,
          views: { N: view('North', S3), E: view('East', S3), S: view('South', S3), W: view('West', S3) } },
      ],
    },
    // The Sep 2026 hourly pilot: one camera of four for nine days.
    acepilot: {
      first_month: '2026-09', name: 'Pilot',
      periods: [
        { from: '2026-09-11T00:00:00-06:00', until: '2026-09-20T00:00:00-06:00',
          views: { E: view('East', Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0') + ':00')) } },
      ],
    },
    // A camera with nothing a visitor may see.
    skycam: {
      first_month: '2024-01',
      periods: [{ from: '2024-01-01T00:00:00-07:00', until: null, views: { NS: view('NS', S915), PARK: view('Park', S9) } }],
    },
  },
};
const STAFF = P.parseSchedule(RAW, { internal: true });      // everything but PARK, all history
const PUB = P.parseSchedule(RAW);                             // the D7 default
const PUB_HIST = P.parseSchedule(RAW, { since: null });       // public, with E/W history
const FULL = P.parseSchedule(RAW, { fullHistory: true });     // D16: the tools' full public history

const ms = (iso) => Date.parse(iso);

/* ── Time ────────────────────────────────────────────────────────────────── */

test('time: local slot → UTC is DST-safe', () => {
  const iso = (d, t) => new Date(P.toUtcMs(d, t)).toISOString();
  assert.equal(iso('2026-07-15', '09:00'), '2026-07-15T15:00:00.000Z');
  assert.equal(iso('2026-01-15', '09:00'), '2026-01-15T16:00:00.000Z');
  // Transition days: 2026-03-08 (spring forward), 2026-11-01 (fall back).
  assert.equal(iso('2026-03-08', '12:00'), '2026-03-08T18:00:00.000Z');
  assert.equal(iso('2026-11-01', '12:00'), '2026-11-01T19:00:00.000Z');
  assert.equal(iso('2026-11-01'), '2026-11-01T06:00:00.000Z');
});

test('time: wall clock round-trips; compact UTC; day helpers', () => {
  eq(P.toWallClock(Date.UTC(2026, 9, 1, 21)), { date: '2026-10-01', time: '15:00:00' });
  eq(P.toWallClock(Date.UTC(2026, 9, 2, 6)), { date: '2026-10-02', time: '00:00:00' });
  const t = Date.UTC(2026, 9, 1, 15, 0, 1);
  assert.equal(P.compactUtc(t), '20261001T150001Z');
  assert.equal(P.parseUtc('20261001T150001Z'), t);
  assert.equal(P.parseUtc('2026-10-01T15:00:01Z'), t);
  assert.ok(Number.isNaN(P.parseUtc('')));
  assert.equal(P.localYmd(Date.UTC(2026, 9, 2, 3)), '2026-10-01');
  assert.equal(MCO.shiftDate('2026-03-01', -1), '2026-02-28');
  eq(P.utcDaysOfLocalDay('2026-10-01'), ['20261001', '20261002']);
});

test('time: labels are engine-independent', () => {
  assert.equal(P.stampLabel(Date.UTC(2026, 9, 1, 21)), 'Oct 1, 2026 3:00 PM');
  assert.equal(P.stampLabel(Date.UTC(2026, 0, 15, 7, 5)), 'Jan 15, 2026 12:05 AM');
  assert.equal(P.timeLabel(Date.UTC(2026, 9, 1, 15)), '9:00 AM');
  assert.equal(P.slotLabel('12:00'), '12:00 PM');
  assert.equal(P.slotLabel('00:30:00'), '12:30 AM');
});

test('time: ?time= normalisation and the URL form', () => {
  assert.equal(P.normalizeTime('9'), '09:00');
  assert.equal(P.normalizeTime('09'), '09:00');
  assert.equal(P.normalizeTime('9:30'), '09:30');
  assert.equal(P.normalizeTime('15:00:00'), '15:00');
  assert.equal(P.normalizeTime('24'), null);
  assert.equal(P.normalizeTime('9:75'), null);
  assert.equal(P.normalizeTime('noon'), null);
  assert.equal(P.normalizeTime(null), null);
  assert.equal(P.timeParam('15:00'), '15');
  assert.equal(P.timeParam('09:00'), '9');
  assert.equal(P.timeParam('09:30'), '09:30');
});

/* ── Vocabulary (D7, D8) ─────────────────────────────────────────────────── */

test('vocabulary: public is N/E/S/W only; PARK is never a view', () => {
  for (const t of ['N', 'E', 'S', 'W', 'n']) assert.ok(P.isVisible(t, false), t);
  for (const t of ['SNOW', 'NSNOW', 'SSNOW', 'PLUVIO', 'SOLAR', 'NS', 'SS', 'G', 'NEWVIEW']) {
    assert.ok(!P.isVisible(t, false), `${t} must not be public`);
    assert.ok(P.isVisible(t, true), `${t} is staff-visible`);
  }
  assert.ok(!P.isVisible('PARK', true));
  assert.ok(!P.isVisible('', true));
  assert.ok(!P.isVisible('a/b', true));
});

test('vocabulary: labels, NSNOW and SOLAR registered, 2.5.3 names', () => {
  assert.equal(P.label('NSNOW'), 'North Snow');
  assert.equal(P.label('SOLAR', 'SolarPanel'), 'Solar');
  assert.equal(P.label('SS', 'SS'), 'South Sky');
  assert.equal(P.label('X', 'Weird'), 'Weird');
  assert.equal(P.label('X'), 'X');
  assert.equal(P.viewName('N'), 'North');
  assert.equal(P.viewName('NSNOW'), 'N Snow, North Snow');
  assert.equal(P.viewName('NS'), 'NS, North Sky');
  assert.equal(P.viewName('PLUVIO'), 'Pluvio');
  eq(['W', 'SNOW', 'S', 'ZZ', 'N', 'E', 'SOLAR'].sort(P.compareViews), ['N', 'E', 'S', 'W', 'SNOW', 'SOLAR', 'ZZ']);
});

/* ── Schedule ────────────────────────────────────────────────────────────── */

test('schedule: parse, staff', () => {
  const cam = STAFF.stations.get('acebozem');
  assert.equal(cam.name, 'Bozeman');
  assert.equal(cam.firstMonth, '2017-01');
  eq(cam.currentViews.map((v) => v.token), ['N', 'E', 'S', 'W', 'SNOW', 'NSNOW', 'SSNOW', 'PLUVIO', 'SOLAR']);
  assert.equal(cam.allLabels.SOLAR, 'Solar');
  assert.equal(cam.allLabels.NS, 'North Sky');
  assert.ok(!('PARK' in cam.allLabels));
  assert.equal(STAFF.snapMaxMs, 1_800_000);
  assert.equal(STAFF.base, B);
  assert.ok(STAFF.internal);
  eq(STAFF.tokens, ['N', 'E', 'S', 'W', 'SNOW', 'NSNOW', 'SSNOW', 'PLUVIO', 'SOLAR', 'NS', 'SS']);
});

test('schedule: public default clamps every view to the cutover (D7)', () => {
  const cam = PUB.stations.get('acebozem');
  eq(cam.currentViews, [
    { token: 'N', label: 'North' }, { token: 'E', label: 'East' },
    { token: 'S', label: 'South' }, { token: 'W', label: 'West' },
  ]);
  assert.ok(cam.windows.every((w) => w.fromMs >= ms(P.PUBLIC_SINCE)));
  eq(PUB.tokens, ['N', 'E', 'S', 'W']);
  // The window opens at 16:00 MDT on the 21st, after its last slot.
  assert.equal(PUB.minDate, '2026-10-22');
  eq(P.slotsForDate(PUB, '2026-10-21'), []);
  eq(P.slotsForDate(PUB, '2026-10-22'), ['09:00', '12:00', '15:00']);
  // The pilot never had a public view after the cutover; skycam never had one.
  assert.ok(!PUB.stations.has('acepilot'));
  assert.ok(!PUB.stations.has('skycam'));
});

test('schedule: public with since:null keeps E/W history, never a re-aimed N or S', () => {
  const day = (sch, sta, d, t) => P.viewsForSlot(sch, d, t, { stations: [sta] });
  eq(day(PUB_HIST, 'acebozem', '2025-07-15', '09:00'), ['E', 'W']);
  eq(day(PUB_HIST, 'acebozem', '2026-10-21', '15:00'), ['E', 'W']);
  eq(day(PUB_HIST, 'acebozem', '2026-10-22', '09:00'), ['N', 'E', 'S', 'W']);
  // Staff see what the cameras actually named it.
  eq(day(STAFF, 'acebozem', '2025-07-15', '09:00'), ['N', 'E', 'S', 'W', 'SNOW', 'NS']);
  assert.equal(PUB_HIST.minDate, '2017-01-01');
});

test('schedule: fullHistory is the whole public archive, pre-cutover N and S included (D16)', () => {
  const day = (sch, sta, d, t) => P.viewsForSlot(sch, d, t, { stations: [sta] });
  assert.ok(FULL.fullHistory && !FULL.internal);
  assert.ok(!PUB.fullHistory && !STAFF.fullHistory);
  assert.equal(FULL.sinceMs, -Infinity);
  // Back to the first archived month, in every public direction.
  assert.equal(FULL.minDate, '2017-01-01');
  eq(day(FULL, 'acebozem', '2017-01-01', '09:00'), ['N', 'E', 'S', 'W']);
  eq(day(FULL, 'acebozem', '2025-07-15', '09:00'), ['N', 'E', 'S', 'W']);
  eq(day(FULL, 'acebozem', '2026-10-21', '15:00'), ['N', 'E', 'S', 'W']);
  eq(day(FULL, 'acebozem', '2026-10-22', '09:00'), ['N', 'E', 'S', 'W']);
  assert.ok(P.isShotAt(FULL, 'acebozem', 'N', '2026-09-30', '12:00'));
  assert.ok(P.isShotAt(FULL, 'acebrady', 'N', '2023-05-01', '09:00'));
  assert.ok(!P.isShotAt(FULL, 'acebrady', 'N', '2023-04-30', '09:00'), 'not before the first archived month');
  // Labelled as they always were.
  assert.equal(FULL.stations.get('acebozem').allLabels.N, 'North');
  assert.equal(FULL.stations.get('acebozem').allLabels.S, 'South');
  // Still public: no staff views, no PARK, no retired sky views.
  eq(FULL.tokens, ['N', 'E', 'S', 'W']);
  eq(day(FULL, 'acecrowa', '2025-07-15', '09:00'), ['E', 'W']);
  assert.ok(!FULL.stations.has('skycam'));
  // The pilot's East is public history now (it was clamped away before).
  assert.ok(FULL.stations.has('acepilot'));
  eq(P.slotsForDate(FULL, '2026-09-15'), ['09:00', '15:00'], 'majority rule still holds');
  // Same windows as staff for the public tokens.
  const pubOf = (sch) => sch.stations.get('acebozem').windows
    .filter((w) => P.isPublic(w.token)).map((w) => [w.token, w.fromMs, w.untilMs]);
  eq(pubOf(FULL), pubOf(STAFF));
  // fullHistory with internal changes nothing.
  const both = P.parseSchedule(RAW, { internal: true, fullHistory: true });
  eq(both.tokens, STAFF.tokens);
  assert.equal(both.minDate, STAFF.minDate);
});

test('schedule: an explicit since wins over fullHistory; REAIMED stays lifted', () => {
  const sch = P.parseSchedule(RAW, { fullHistory: true, since: '2026-10-01' });
  assert.equal(sch.sinceMs, P.toUtcMs('2026-10-01'));
  assert.equal(sch.minDate, '2026-10-01');
  eq(P.viewsForSlot(sch, '2026-10-05', '09:00', { stations: ['acebozem'] }), ['N', 'E', 'S', 'W']);
  eq(P.viewsForSlot(sch, '2026-09-30', '09:00', { stations: ['acebozem'] }), []);
  // since: null with fullHistory is the same as fullHistory alone.
  const n = P.parseSchedule(RAW, { fullHistory: true, since: null });
  assert.equal(n.minDate, FULL.minDate);
  eq(n.tokens, FULL.tokens);
});

test('schedule: the default is unchanged by the opt-in (still the D7 clamp)', () => {
  const def = P.parseSchedule(RAW, { fullHistory: false });
  assert.equal(def.sinceMs, PUB.sinceMs);
  assert.equal(def.minDate, '2026-10-22');
  eq(P.viewsForSlot(PUB, '2026-10-21', '15:00'), []);
});

test('schedule: hasCamera needs a current window with a visible view', () => {
  assert.ok(P.hasCamera(PUB, 'acebozem'));
  assert.ok(!P.hasCamera(PUB, 'skycam'));
  assert.ok(P.hasCamera(STAFF, 'skycam'));     // NS is current there, for staff
  assert.ok(!P.hasCamera(STAFF, 'acepilot'));  // only a past window
  assert.ok(!P.hasCamera(PUB, 'nope'));
  assert.ok(!P.hasCamera(undefined, 'acebozem'));
});

test('schedule: viewsBetween picks the windows overlapping a day', () => {
  const cam = STAFF.stations.get('acebozem');
  const day = (d) => P.viewsBetween(cam, P.toUtcMs(d), P.toUtcMs(MCO.shiftDate(d, 1))).map((v) => v.token);
  eq(day('2025-07-15'), ['N', 'E', 'S', 'W', 'SNOW', 'NS']);
  eq(day('2026-09-30'), ['N', 'E', 'S', 'W', 'SNOW']);
  eq(day('2026-10-21'), ['N', 'E', 'S', 'W', 'SNOW', 'NSNOW', 'SSNOW', 'PLUVIO', 'SOLAR']);
});

test('schedule: schema guard; missing schema accepted', () => {
  assert.throws(() => P.parseSchedule({ ...RAW, schema: 2 }), /schema 2/);
  assert.throws(() => P.parseSchedule({}), /no stations/);
  const { schema, ...noSchema } = RAW;
  assert.equal(P.parseSchedule(noSchema, { internal: true }).stations.size, 5);
});

test('schedule: since accepts a date, an instant, or ms', () => {
  assert.equal(P.parseSchedule(RAW, { since: undefined }).sinceMs, PUB.sinceMs, 'undefined = the default');
  const a = P.parseSchedule(RAW, { since: '2026-10-22' });
  const b = P.parseSchedule(RAW, { since: '2026-10-22T00:00:00-06:00' });
  assert.equal(a.sinceMs, b.sinceMs);
  assert.throws(() => P.parseSchedule(RAW, { since: 'soon' }), /not a date/);
});

/* ── Slots (Photo Explorer rules) ────────────────────────────────────────── */

test('slots: majority rule, so a one-camera hourly pilot stays out of the menu', () => {
  // On 2026-09-15 the pilot shoots 24 slots; three cameras shoot 9 and 15.
  eq(P.slotsForDate(STAFF, '2026-09-15'), ['09:00', '15:00']);
  // On 2026-09-25 only acebozem has moved to 9/12/15: one of three, so no noon.
  eq(P.slotsForDate(STAFF, '2026-09-25'), ['09:00', '15:00']);
  eq(P.slotsForDate(STAFF, '2026-10-25'), ['09:00', '12:00', '15:00']);
  eq(P.slotsForDate(STAFF, '2015-01-01'), []);
});

test('slots: no majority → whatever anyone shot', () => {
  const sch = P.parseSchedule({ stations: {
    a: { first_month: '2026-01', periods: [{ from: '2026-01-01T00:00:00-07:00', until: null, views: { E: view('East', ['09:00']) } }] },
    b: { first_month: '2026-01', periods: [{ from: '2026-01-01T00:00:00-07:00', until: null, views: { E: view('East', ['10:00']) } }] },
    c: { first_month: '2026-01', periods: [{ from: '2026-01-01T00:00:00-07:00', until: null, views: { E: view('East', ['11:00']) } }] },
  } }, { internal: true });
  eq(P.slotsForDate(sch, '2026-06-01'), ['09:00', '10:00', '11:00']);
});

test('slots: a wall time that does not exist (spring forward) is skipped', () => {
  const sch = P.parseSchedule({ stations: {
    a: { first_month: '2026-01', periods: [{ from: '2026-01-01T00:00:00-07:00', until: null, views: { E: view('East', ['02:30', '09:00']) } }] },
  } }, { internal: true });
  eq(P.slotsForDate(sch, '2026-03-08'), ['09:00']);
  eq(P.slotsForDate(sch, '2026-03-09'), ['02:30', '09:00']);
});

test('slots: a station shoots only from its first archived month', () => {
  // acebrady's first_month is 2023-05: not counted in April.
  assert.ok(!P.isShotAt(STAFF, 'acebrady', 'E', '2023-04-30', '09:00'));
  assert.ok(P.isShotAt(STAFF, 'acebrady', 'E', '2023-05-01', '09:00'));
});

test('slots: isShotAt is period-aware within a day', () => {
  // The plan changed at 10:06 on 2026-09-20: 09:00 is the legacy patrol (NS
  // still shot), 12:00 is the new plan.
  assert.ok(P.isShotAt(STAFF, 'acebozem', 'NS', '2026-09-20', '09:00'));
  assert.ok(!P.isShotAt(STAFF, 'acebozem', 'NS', '2026-09-20', '15:00'));
  assert.ok(P.isShotAt(STAFF, 'acebozem', 'N', '2026-09-20', '12:00'));
});

test('slots: viewsForSlot, limited to placed stations', () => {
  eq(P.viewsForSlot(STAFF, '2026-09-25', '12:00'), ['N', 'E', 'S', 'W', 'SNOW']);
  eq(P.viewsForSlot(STAFF, '2026-09-25', '09:00', { stations: ['acecrowa'] }), ['E', 'W', 'NS', 'SS']);
  eq(P.viewsForSlot(PUB, '2026-10-23', '12:00'), ['N', 'E', 'S', 'W']);
  eq(P.viewsForSlot(STAFF, '2026-10-23', '12:00', { stations: ['acebozem'] }), ['N', 'E', 'S', 'W']);
  eq(P.viewsForSlot(STAFF, '2026-10-23', '09:00', { stations: ['acebozem'] }),
    ['N', 'E', 'S', 'W', 'SNOW', 'NSNOW', 'SSNOW', 'PLUVIO', 'SOLAR']);
});

test('slots: readySlots honours the processing lag', () => {
  const now = P.toUtcMs('2026-10-23', '12:20');          // 12:00 + 20 min: not in yet
  const r = P.readySlots(PUB, '2026-10-23', { now });
  eq(r.map((s) => [s.time, s.ready]), [['09:00', true], ['12:00', false], ['15:00', false]]);
  assert.equal(r[0].label, '9:00 AM');
  assert.ok(P.readySlots(PUB, '2026-10-22', { now }).every((s) => s.ready));
  assert.ok(P.readySlots(PUB, '2026-10-24', { now }).every((s) => !s.ready));
  assert.ok(P.readySlots(PUB, '2026-10-23', { now, lagMinutes: 0 })[1].ready);
});

test('slots: latestSlot is today\'s newest cleared slot, else yesterday\'s last', () => {
  eq(P.latestSlot(PUB, { now: P.toUtcMs('2026-10-23', '12:31') }), { date: '2026-10-23', time: '12:00' });
  eq(P.latestSlot(PUB, { now: P.toUtcMs('2026-10-23', '09:10') }), { date: '2026-10-22', time: '15:00' });
  // Before the public range there is nothing to show.
  eq(P.latestSlot(PUB, { now: P.toUtcMs('2026-10-22', '08:00') }), null);
  // Evening MT is the next UTC day; still today's 15:00.
  eq(P.latestSlot(PUB, { now: P.toUtcMs('2026-10-23', '19:00') }), { date: '2026-10-23', time: '15:00' });
});

test('slots: previousSlot walks back across days and stops at the start', () => {
  eq(P.previousSlot(PUB, '2026-10-23', '12:00'), { date: '2026-10-23', time: '09:00' });
  eq(P.previousSlot(PUB, '2026-10-23', '09:00'), { date: '2026-10-22', time: '15:00' });
  eq(P.previousSlot(PUB, '2026-10-22', '09:00'), null);
  eq(P.previousSlot(PUB, '2026-10-23', '10:00'), null);
});

test('slots: resolveTime — wanted, next later, last; pending vs unscheduled', () => {
  const day = [
    { time: '09:00', ready: true }, { time: '12:00', ready: true }, { time: '15:00', ready: false },
  ];
  eq(P.resolveTime(day, '12:00'), { time: '12:00', moved: false, reason: null });
  eq(P.resolveTime(day, null), { time: '09:00', moved: false, reason: null });
  eq(P.resolveTime(day, '10:00'), { time: '12:00', moved: true, reason: 'unscheduled' });
  eq(P.resolveTime(day, '15:00'), { time: '12:00', moved: true, reason: 'pending' });
  eq(P.resolveTime(day, '17:00'), { time: '12:00', moved: true, reason: 'unscheduled' });
  eq(P.resolveTime([{ time: '09:00', ready: false }], '09:00'), { time: null, moved: true, reason: 'pending' });
});

test('slots: resolveView — wanted, else North, else first', () => {
  eq(P.resolveView(['N', 'E', 'S', 'W'], 'W'), { view: 'W', moved: false });
  eq(P.resolveView(['N', 'E'], 'W'), { view: 'N', moved: true });
  eq(P.resolveView(['E', 'W'], 'N'), { view: 'E', moved: true });
  eq(P.resolveView([], 'N'), { view: null, moved: true });
});

test('slots: roll messages are plain and carry the limit', () => {
  assert.equal(P.rollMessage({ kind: 'time', reason: 'pending', from: '15:00', to: '12:00' }),
    '3:00 PM is not available yet. Showing 12:00 PM.');
  assert.equal(P.rollMessage({ kind: 'time', reason: 'unscheduled', from: '10:00', to: '12:00', date: '2026-10-23' }),
    'No photos were scheduled at 10:00 AM on October 23, 2026. Showing 12:00 PM.');
  assert.equal(P.rollMessage({ kind: 'view', from: 'N', to: 'E' }), 'No North photos at this time. Showing East.');
  assert.equal(P.rollMessage({ kind: 'date', reason: 'too-early', from: '2026-01-01', to: '2026-10-22' }),
    'Photos start October 22, 2026. Showing that date.');
  for (const m of [P.rollMessage({ kind: 'date', reason: 'too-late', from: '2027-01-01', to: '2026-10-23' })]) {
    assert.ok(!/[—→]/.test(m), 'VOICE: no em-dash asides or arrows');
  }
});

/* ── Paths ───────────────────────────────────────────────────────────────── */

test('paths: patterns, frame URLs, manifest URL', () => {
  const slot = Date.UTC(2026, 9, 1, 15);
  assert.equal(P.fillPattern(P.DEFAULT_PATTERNS.webp_large, { station: 'acebozem', token: 'N', slotUtcMs: slot }),
    'photos/webp/large/acebozem/acebozem_N_20261001T150000Z.webp');
  assert.equal(P.fillPattern(P.DEFAULT_PATTERNS.jpg, { station: 'acebozem', token: 'N', capturedUtcMs: slot + 1000 }),
    'photos/jpg/acebozem/acebozem_N_20261001T150001Z.jpg');
  assert.equal(P.patternPrefix(P.DEFAULT_PATTERNS.webp_large, 'acebozem', 'N'), 'photos/webp/large/acebozem/acebozem_N_');
  assert.equal(P.basename(`${B}photos/webp/large/a/a_N_20261001T150000Z.webp?x=1`), 'a_N_20261001T150000Z.webp');
  assert.equal(P.frameUrl(PUB, 'acebozem', 'n', P.toUtcMs('2026-10-22', '09:00'), 'thumb'),
    `${B}photos/webp/thumb/acebozem/acebozem_N_20261022T150000Z.webp`);
  assert.equal(P.manifestUrl(PUB, 'acebozem', '2026-10'), `${B}photos/manifest/acebozem/acebozem_2026-10.csv`);
  assert.equal(P.scheduleUrl(), `${B}photos/schedule/schedule.json`);
  // A base override carries through, whatever patterns.base said.
  const alt = P.parseSchedule(RAW, { base: 'https://d1s8jav5n0eyyf.cloudfront.net/mesonet/' });
  assert.ok(P.frameUrl(alt, 'acebozem', 'N', 0).startsWith('https://d1s8jav5n0eyyf.cloudfront.net/mesonet/photos/'));
});

/* ── Listing + manifest ──────────────────────────────────────────────────── */

const LISTING = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult><Name>mco-mesonet</Name><KeyCount>2</KeyCount>
<Contents><Key>photos/webp/large/acebozem/acebozem_N_20261001T150000Z.webp</Key><Size>1</Size></Contents>
<Contents><Key>photos/webp/large/acebozem/acebozem_N_20261001T180000Z.webp</Key><Size>1</Size></Contents>
<Contents><Key>photos/webp/large/acebozem/notes.txt</Key></Contents>
</ListBucketResult>`;
const allowAll = P.frameFilter(STAFF);

test('listing: keys and frames', () => {
  assert.equal(P.parseListingKeys(LISTING).length, 3);
  const f = P.framesFromListing(LISTING, 'acebozem', 'N', { base: B, labels: { N: 'North' }, allow: allowAll });
  assert.equal(f.length, 2);
  eq({ token: f[0].token, label: f[0].label, slotUtcMs: f[0].slotUtcMs, webpUrl: f[0].webpUrl, thumbUrl: f[0].thumbUrl }, {
    token: 'N', label: 'North', slotUtcMs: Date.UTC(2026, 9, 1, 15),
    webpUrl: `${B}photos/webp/large/acebozem/acebozem_N_20261001T150000Z.webp`,
    thumbUrl: `${B}photos/webp/thumb/acebozem/acebozem_N_20261001T150000Z.webp`,
  });
  eq(P.framesFromListing('', 'acebozem', 'N'), []);
  // The public default drops a pre-cutover N (it was the rain gauge).
  eq(P.framesFromListing(LISTING, 'acebozem', 'N', { base: B }), []);
});

const HEADER = 'station,view,token,captured_utc,captured_local,date_local,time_local,slot_utc,jpg,webp_large,webp_thumb';
const MANIFEST = [
  HEADER,
  // complete row
  'acebozem,North,N,2026-09-01T15:00:05Z,2026-09-01T09:00:05-06:00,2026-09-01,09:00:05,2026-09-01T15:00:00Z,photos/jpg/acebozem/acebozem_N_20260901T150005Z.jpg,photos/webp/large/acebozem/acebozem_N_20260901T150000Z.webp,photos/webp/thumb/acebozem/acebozem_N_20260901T150000Z.webp',
  // blank webp_large, slot present → derive from slot
  'acebozem,,N,2026-09-01T18:00:30Z,,2026-09-01,,2026-09-01T18:00:00Z,photos/jpg/acebozem/acebozem_N_20260901T180030Z.jpg,,',
  // blank slot + webp → snap capture to nearest hour
  'acebozem,,E,2026-09-01T20:59:40Z,,2026-09-01,,,photos/jpg/acebozem/acebozem_E_20260901T205940Z.jpg,,',
  // a sky view (staff only)
  'acebozem,,NS,2026-09-01T21:00:00Z,,2026-09-01,,2026-09-01T21:00:00Z,photos/jpg/acebozem/acebozem_NS_20260901T210000Z.jpg,,',
  // the rest position: never a view
  'acebozem,,PARK,2026-09-01T21:00:30Z,,2026-09-01,,,photos/jpg/acebozem/acebozem_PARK_20260901T210030Z.jpg,,',
  // > 30 min from its slot → jpg only, skipped
  'acebozem,,N,2026-09-01T18:45:00Z,,2026-09-01,,2026-09-01T18:00:00Z,photos/jpg/acebozem/acebozem_N_20260901T184500Z.jpg,,',
  // duplicate of the first slot (re-shot) → deduplicated
  'acebozem,North,N,2026-09-01T15:02:00Z,,2026-09-01,,2026-09-01T15:00:00Z,photos/jpg/acebozem/acebozem_N_20260901T150200Z.jpg,photos/webp/large/acebozem/acebozem_N_20260901T150000Z.webp,',
  // after the cutover, a horizon North
  'acebozem,North,N,2026-10-22T15:00:03Z,,2026-10-22,,2026-10-22T15:00:00Z,,photos/webp/large/acebozem/acebozem_N_20261022T150000Z.webp,photos/webp/thumb/acebozem/acebozem_N_20261022T150000Z.webp',
  '',
].join('\r\n');

test('manifest: blank-webp quirk, snap limit, staff views', () => {
  const frames = P.parseManifest(MANIFEST, 'acebozem', { base: B, snapMaxMs: 1_800_000, allow: allowAll });
  eq(frames.map((f) => P.basename(f.webpUrl)), [
    'acebozem_N_20260901T150000Z.webp',
    'acebozem_N_20260901T180000Z.webp',
    'acebozem_E_20260901T210000Z.webp',
    'acebozem_NS_20260901T210000Z.webp',
    'acebozem_N_20261022T150000Z.webp',
  ]);
  assert.equal(frames[0].jpgUrl, `${B}photos/jpg/acebozem/acebozem_N_20260901T150005Z.jpg`);
  assert.equal(frames[0].capturedUtcMs, Date.UTC(2026, 8, 1, 15, 0, 5));
  assert.equal(frames[0].label, 'North');
  assert.equal(frames[0].derived, undefined);
  assert.equal(frames[1].derived, true);
  assert.equal(frames[1].thumbUrl, `${B}photos/webp/thumb/acebozem/acebozem_N_20260901T180000Z.webp`);
  assert.equal(frames[3].label, 'North Sky');
});

test('manifest: the public default keeps only post-cutover N/E/S/W', () => {
  eq(P.parseManifest(MANIFEST, 'acebozem', { base: B }).map((f) => P.basename(f.webpUrl)),
    ['acebozem_N_20261022T150000Z.webp']);
  // since:null keeps September's East, never September's North.
  eq(P.parseManifest(MANIFEST, 'acebozem', { base: B, allow: P.frameFilter(PUB_HIST) }).map((f) => P.basename(f.webpUrl)),
    ['acebozem_E_20260901T210000Z.webp', 'acebozem_N_20261022T150000Z.webp']);
});

test('manifest: fullHistory keeps September\'s North; still no sky view or PARK', () => {
  eq(P.parseManifest(MANIFEST, 'acebozem', { base: B, allow: P.frameFilter(FULL) }).map((f) => P.basename(f.webpUrl)), [
    'acebozem_N_20260901T150000Z.webp',
    'acebozem_N_20260901T180000Z.webp',
    'acebozem_E_20260901T210000Z.webp',
    'acebozem_N_20261022T150000Z.webp',
  ]);
  const f = P.framesFromListing(LISTING, 'acebozem', 'N', { base: B, allow: P.frameFilter(FULL) });
  assert.equal(f.length, 2);
  assert.equal(f[0].label, 'North');
  // A schedule-less filter is still the public default.
  eq(P.framesFromListing(LISTING, 'acebozem', 'N', { base: B, allow: P.frameFilter(null) }), []);
});

test('manifest: header only / empty → []', () => {
  eq(P.parseManifest(HEADER, 'acebozem'), []);
  eq(P.parseManifest('', 'acebozem'), []);
});

test('manifest: framesFor selects a Mountain day, newest first; newest; tokensOf', () => {
  const frames = P.parseManifest(MANIFEST, 'acebozem', { base: B, allow: allowAll });
  eq(P.framesFor(frames, '2026-09-01', 'N').map((f) => f.slotUtcMs), [Date.UTC(2026, 8, 1, 18), Date.UTC(2026, 8, 1, 15)]);
  eq(P.framesFor(frames, '2026-09-02'), []);
  assert.equal(P.newest(frames).slotUtcMs, Date.UTC(2026, 9, 22, 15));
  assert.equal(P.newest(frames, 'w'), null);
  eq(P.tokensOf(frames), ['N', 'E', 'NS']);
});

/* ── Fetchers ────────────────────────────────────────────────────────────── */

test('fetchers: latest lists three UTC days per current view; 404/errors → empty', async () => {
  const urls = [];
  stub(async (url) => {
    urls.push(url);
    if (url.includes(encodeURIComponent('acebozem_N_20261023'))) {
      return new Response('<Key>photos/webp/large/acebozem/acebozem_N_20261023T150000Z.webp</Key>');
    }
    if (url.includes('_E_')) return new Response('boom', { status: 500 });
    return new Response('', { status: 404 });
  });
  const frames = await P.fetchLatestFrames(PUB, 'acebozem', { now: Date.UTC(2026, 9, 23, 22) });
  assert.equal(urls.length, 12);   // N, E, S, W × three days
  assert.equal(urls[0], `${B}?list-type=2&prefix=${encodeURIComponent('photos/webp/large/acebozem/acebozem_N_20261021')}`);
  assert.ok(urls.every((u) => !u.includes('/api/')));
  assert.equal(frames.length, 1);
  assert.equal(frames[0].label, 'North');
});

test('fetchers: covers Mountain yesterday in the evening, when UTC is a day ahead', async () => {
  const urls = [];
  stub(async (url) => { urls.push(url); return new Response('', { status: 404 }); });
  await P.fetchLatestFrames(PUB, 'acebozem', { now: Date.UTC(2026, 9, 24, 0, 30) });
  assert.ok(urls.some((u) => u.includes(encodeURIComponent('acebozem_N_20261022'))));
});

test('fetchers: rejects when every listing fails (archive unreachable)', async () => {
  stub(async () => new Response('down', { status: 503 }));
  await assert.rejects(P.fetchLatestFrames(PUB, 'acebozem', { now: Date.UTC(2026, 9, 23, 22) }));
});

test('fetchers: confirmDerived keeps only derived frames the bucket lists', async () => {
  const frames = P.parseManifest(MANIFEST, 'acebozem', { base: B, allow: allowAll });
  const urls = [];
  stub(async (url) => {
    urls.push(url);
    if (url.includes(encodeURIComponent('acebozem_N_20260901'))) {
      return new Response('<Key>photos/webp/large/acebozem/acebozem_N_20260901T180000Z.webp</Key>');
    }
    return new Response('', { status: 404 });
  });
  const kept = await P.confirmDerived(STAFF, 'acebozem', frames);
  eq(kept.map((f) => P.basename(f.webpUrl)), [
    'acebozem_N_20260901T150000Z.webp', 'acebozem_N_20260901T180000Z.webp', 'acebozem_N_20261022T150000Z.webp',
  ]);
  assert.equal(urls.length, 3);   // N, E, NS on 2026-09-01; complete rows need no listing
});

test('fetchers: confirmDerived strict rejects on a failed listing; lenient drops those frames', async () => {
  const frames = P.parseManifest(MANIFEST, 'acebozem', { base: B, allow: allowAll });
  stub(async () => new Response('down', { status: 503 }));
  await assert.rejects(P.confirmDerived(STAFF, 'acebozem', frames, { strict: true }));
  eq((await P.confirmDerived(STAFF, 'acebozem', frames)).map((f) => P.basename(f.webpUrl)),
    ['acebozem_N_20260901T150000Z.webp', 'acebozem_N_20261022T150000Z.webp']);
});

test('fetchers: month manifest URL; 404 → []; schedule filter applies', async () => {
  const urls = [];
  stub(async (url) => {
    urls.push(url);
    return url.endsWith('_2026-09.csv') ? new Response(MANIFEST) : new Response('', { status: 404 });
  });
  assert.equal((await P.fetchMonthFrames(STAFF, 'acebozem', '2026-09')).length, 5);
  assert.equal((await P.fetchMonthFrames(PUB, 'acebozem', '2026-09')).length, 1);
  assert.equal((await P.fetchMonthFrames(FULL, 'acebozem', '2026-09')).length, 4);
  eq(await P.fetchMonthFrames(PUB, 'acebozem', '2016-01'), []);
  assert.equal(urls[0], `${B}photos/manifest/acebozem/acebozem_2026-09.csv`);
});

test('fetchers: load() caches per audience and evicts a failure', async () => {
  let n = 0;
  stub(async () => { n++; return n === 1 ? new Response('x', { status: 503 }) : new Response(JSON.stringify(RAW)); });
  await assert.rejects(P.load({ base: 'https://example.test/m/' }));
  const a = await P.load({ base: 'https://example.test/m/' });
  const b = await P.load({ base: 'https://example.test/m/' });
  assert.equal(a, b);
  assert.equal(n, 2);
  assert.equal(a.base, 'https://example.test/m/');
  const staff = await P.load({ base: 'https://example.test/m/', internal: true });
  assert.ok(staff.internal && !a.internal);
  const c = await P.load({ base: 'https://example.test/m/', fresh: true });
  assert.notEqual(c, a);
  assert.equal(n, 4);
});

test('fetchers: load() keys fullHistory apart from the default and from staff', async () => {
  let n = 0;
  stub(async () => { n++; return new Response(JSON.stringify(RAW)); });
  const base = 'https://example.test/full/';
  const def = await P.load({ base });
  const full = await P.load({ base, fullHistory: true });
  const full2 = await P.load({ base, fullHistory: true });
  const staff = await P.load({ base, internal: true });
  assert.equal(n, 3);
  assert.equal(full, full2);
  assert.notEqual(full, def);
  assert.notEqual(full, staff);
  assert.ok(full.fullHistory && !full.internal);
  assert.ok(!def.fullHistory);
  assert.equal(def.minDate, '2026-10-22');
  assert.equal(full.minDate, '2017-01-01');
  const fullSince = await P.load({ base, fullHistory: true, since: '2026-10-01' });
  assert.notEqual(fullSince, full);
  assert.equal(fullSince.minDate, '2026-10-01');
});

/* ── Live (opt-in) ───────────────────────────────────────────────────────── */

test('live: schedule.json and a manifest parse as expected', { skip: !LIVE }, async () => {
  sandbox.fetchImpl = (...a) => fetch(...a);
  const pub = await P.load({ since: undefined });
  const staff = await P.load({ internal: true });
  assert.ok(pub.stations.size >= 100, `public cameras: ${pub.stations.size}`);
  eq(pub.tokens, ['N', 'E', 'S', 'W']);
  assert.ok(!staff.tokens.includes('PARK'));
  for (const t of ['NSNOW', 'SOLAR']) assert.ok(staff.tokens.includes(t), `staff sees ${t}`);
  assert.ok(pub.minDate >= '2026-10-22', pub.minDate);
  const latest = P.latestSlot(pub);
  assert.ok(latest, 'a latest slot exists');
  const sta = pub.stations.keys().next().value;
  const ym = latest.date.slice(0, 7);
  const frames = await P.fetchMonthFrames(pub, sta, ym);
  assert.ok(frames.every((f) => P.isPublic(f.token) && f.slotUtcMs >= pub.sinceMs));
  console.log(`# live: ${pub.stations.size} public cameras, staff tokens ${staff.tokens.join(' ')}, ` +
    `min ${pub.minDate}, latest ${latest.date} ${latest.time}, slots today ${P.slotsForDate(pub, latest.date).join(' ')}, ` +
    `${sta} ${ym}: ${frames.length} public frames`);
});

test('live: fullHistory reaches back to the first archived month, with pre-cutover N', { skip: !LIVE }, async () => {
  sandbox.fetchImpl = (...a) => fetch(...a);
  const full = await P.load({ fullHistory: true });
  const pub = await P.load();
  eq(full.tokens, ['N', 'E', 'S', 'W']);
  assert.ok(full.stations.size >= pub.stations.size, `${full.stations.size} >= ${pub.stations.size}`);
  // The earliest first_month in the schedule bounds minDate from below.
  let first = null;
  full.stations.forEach((st) => { if (st.firstMonth && (!first || st.firstMonth < first)) first = st.firstMonth; });
  assert.ok(first, 'some station has a first_month');
  assert.ok(full.minDate < '2026-10-21', full.minDate);
  assert.ok(full.minDate >= first + '-01', `${full.minDate} >= ${first}-01`);
  // A pre-cutover North exists publicly somewhere, a month before the cutover.
  const before = '2026-09-30';
  const offered = P.viewsForSlot(full, before, P.slotsForDate(full, before)[0]);
  assert.ok(offered.includes('N'), `N on ${before}: ${offered.join(' ')}`);
  // And the manifest agrees for some station with a North that month.
  const sta = [...full.stations.values()].find((st) => P.isShotAt(full, st, 'N', before, '09:00'));
  assert.ok(sta, 'a station shot N at 09:00 on ' + before);
  const frames = await P.fetchMonthFrames(full, sta.station, before.slice(0, 7));
  const oldN = frames.filter((f) => f.token === 'N' && f.slotUtcMs < Date.parse(P.PUBLIC_SINCE));
  assert.ok(frames.every((f) => P.isPublic(f.token)));
  console.log(`# live fullHistory: ${full.stations.size} cameras, min ${full.minDate} (first_month ${first}), ` +
    `${sta.station} ${before.slice(0, 7)}: ${frames.length} frames, ${oldN.length} pre-cutover N`);
  assert.ok(oldN.length > 0, 'pre-cutover North frames are public under fullHistory');
});
