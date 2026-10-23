#!/usr/bin/env node
/* Unit tests for places/mco-places.js (MCO.places) and the 0.16.0 sections
   in core's MCO.searchModel. Zero dependencies: node:test + node:assert, with
   core/mco-core.js and the places module loaded as classic scripts in a
   node:vm context over a stub DOM, as tools/check-photos.mjs does.

   Ported from mesonet-dashboard web/src/core/places/places.test.ts,
   web/src/core/stations/nearest.test.ts and the "sections" block of
   web/src/core/controls/comboboxModel.test.ts (vitest).
   tools/fixtures/stations.json is the dashboard's station-catalog fixture
   (web/src/core/ag/__fixtures__/stations.csv, the /stations/ API as of
   2026-10-12), cut to the fields this module reads.

     node tools/check-places.mjs           # the suite (CI)
     node tools/check-places.mjs --live    # also check against the live
                                           # station catalog on mesonet2, and,
                                           # with KIT_TAG=X.Y.Z, the files
                                           # jsDelivr serves for that tag */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = process.argv.includes('--live');
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
function kit(files, extra = {}) {
  const sandbox = {
    console, setTimeout, clearTimeout, AbortSignal, Response, URLSearchParams, Map, Set, Promise,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    location: { search: '', pathname: '/', hash: '', href: 'http://localhost/' },
    history: { state: null, replaceState() {}, pushState() {} },
    addEventListener() {}, removeEventListener() {},
    fetch: (...a) => sandbox.fetchImpl(...a),
    fetchImpl: () => { throw new Error('fetch not stubbed'); },
    ...extra,
  };
  sandbox.document = {
    documentElement: el('html'), body: el('body'), head: el('head'),
    createElement: el, addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    ...(extra.document || {}),
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const [name, src] of files) vm.runInContext(src, sandbox, { filename: name });
  return sandbox;
}
const CORE = ['core/mco-core.js', read('core/mco-core.js')];
const PLACES = ['places/mco-places.js', read('places/mco-places.js')];
const sandbox = kit([CORE, PLACES]);
const MCO = sandbox.MCO;
const P = MCO.places;
const SM = MCO.searchModel;
// Values cross a realm boundary; compare them as plain JSON.
const plain = (x) => JSON.parse(JSON.stringify(x));
const eq = (a, b, ...msg) => assert.deepStrictEqual(plain(a), plain(b), ...msg);
const stub = (fn) => { sandbox.fetchImpl = fn; };
const sri = (buf) => `sha384-${createHash('sha384').update(buf).digest('base64')}`;

/* ── Fixtures ────────────────────────────────────────────────────────────── */

const PLACES_JSON = read('places/mt-places.json');
const AREAS_JSON = read('map/data/mt_reservations_simple.geojson');
const places = P.parse(JSON.parse(PLACES_JSON));
const stations = JSON.parse(read('tools/fixtures/stations.json'));
const areas = P.areaIndex(JSON.parse(AREAS_JSON));
const byName = (name, kind) => places.find((p) => p.name === name && (!kind || p.kind === kind));
// The dashboard's station items: network groups, a "Stations" section, NWSLI ids as keywords.
const stationItems = stations
  .slice().sort((a, b) => a.sub_network.localeCompare(b.sub_network) || a.name.localeCompare(b.name))
  .map((s) => ({ id: s.station, label: s.name, group: s.sub_network, section: 'Stations', keywords: s.nwsli_id ? [s.nwsli_id] : [] }));

/* ── Published bytes ─────────────────────────────────────────────────────── */

test('data: the hashes in mco-places.js match the files at this tag', () => {
  assert.equal(P.DATA_INTEGRITY, sri(readFileSync(join(root, P.DATA_PATH))));
  assert.equal(P.AREAS_INTEGRITY, sri(readFileSync(join(root, P.AREAS_PATH))));
});

test('data: KIT_BASE is the tag the script came from; null when unknown', () => {
  assert.equal(P.KIT_BASE, null);   // node:vm: no currentScript
  const tag = 'https://cdn.jsdelivr.net/gh/mt-climate-office/mco-web-style@0.16.0/';
  const s = kit([CORE, PLACES], { document: { currentScript: { src: tag + 'places/mco-places.js' } } });
  assert.equal(s.MCO.places.KIT_BASE, tag);
  const local = kit([CORE, PLACES], { document: { currentScript: { src: 'http://127.0.0.1:8000/places/mco-places.js?v=1' } } });
  assert.equal(local.MCO.places.KIT_BASE, 'http://127.0.0.1:8000/');
  const other = kit([CORE, PLACES], { document: { currentScript: { src: 'https://example.test/bundle.js' } } });
  assert.equal(other.MCO.places.KIT_BASE, null);
});

/* ── The gazetteer (ported) ──────────────────────────────────────────────── */

test('gazetteer: every county and reservation, the towns and ZIP codes, each inside Montana', () => {
  const count = (k) => places.filter((p) => p.kind === k).length;
  assert.equal(count('county'), 56);
  assert.equal(count('reservation'), 7);
  assert.equal(count('tribe'), 1);
  assert.ok(count('zip') > 300);
  assert.ok(count('city') + count('town') + count('community') > 450);
  for (const p of places) {
    assert.ok(p.lat > 44.3 && p.lat < 49.1, p.name);
    assert.ok(p.lon > -116.1 && p.lon < -104, p.name);
    assert.ok(P.KINDS[p.kind], `${p.name}: kind ${p.kind}`);
  }
  assert.equal(new Set(places.map((p) => p.id)).size, places.length);
});

test('gazetteer: places are named the way people search them', () => {
  assert.ok(byName('Butte').keywords.includes('Butte-Silver Bow'));
  assert.equal(byName('Anaconda').kind, 'city');
  assert.equal(byName('Bozeman').kind, 'city');
  eq(byName('Gallatin County').keywords, ['Gallatin']);
  assert.ok(byName('Flathead Reservation').keywords.includes('Salish'));
  assert.ok(!places.some((p) => / (city|town|CDP)$/.test(p.name)));
  assert.equal(byName('Little Shell Tribe').at, 'Great Falls');
  assert.equal(byName('Bozeman').at, undefined);
});

test('gazetteer: every catalog county is a place; every reservation has a boundary', () => {
  const counties = new Set(places.filter((p) => p.kind === 'county').map((p) => p.keywords[0]));
  for (const s of stations) assert.ok(counties.has(s.county), s.county);
  for (const p of places.filter((x) => x.kind === 'reservation')) assert.ok(areas.has(p.id), p.name);
});

test('gazetteer: parse rejects anything without rows', () => {
  assert.throws(() => P.parse({}), /unexpected shape/);
  assert.throws(() => P.parse(null), /unexpected shape/);
  eq(P.parse({ rows: [['z59715', 'zip', '59715', 45.6, -111]] }), [{ id: 'z59715', kind: 'zip', name: '59715', lat: 45.6, lon: -111, keywords: [] }]);
});

/* ── Search items (ported) ───────────────────────────────────────────────── */

const items = [...stationItems, ...P.items(places)];
const search = (q) => SM.filter(items, q, 200, { Places: P.RESULTS });
const top = (q) => { const r = search(q); return r.flat[r.best]; };

test('items: query-only, in the Places section, the kind as meta', () => {
  const it0 = P.items([byName('59715', 'zip')])[0];
  eq(it0, { id: 'place:z59715', label: '59715', meta: 'ZIP code', section: 'Places', queryOnly: true, keywords: [] });
  assert.equal(P.isPlaceItem(it0.id) && P.placeIdOf(it0.id), 'z59715');
  assert.equal(P.isPlaceItem('acebozem'), false);
  assert.ok(search('').flat.every((i) => !P.isPlaceItem(i.id)));
  assert.equal(P.find(places, 'c30031').name, 'Gallatin County');
  assert.equal(P.find(places, 'nope'), null);
  assert.equal(P.find(null, 'c30031'), null);
});

for (const [q, label, meta] of [
  ['59715', '59715', 'ZIP code'],
  ['gallatin', 'Gallatin County', 'County'],
  ['salish', 'Flathead Reservation', 'Reservation'],
  ['rocky boys', 'Rocky Boy’s Reservation', 'Reservation'],
  ['billings', 'Billings', 'City'],
  ['lame deer', 'Lame Deer', 'Community'],
  ['little shell', 'Little Shell Tribe', 'Tribe · Great Falls'],
  ['metis', 'Little Shell Tribe', 'Tribe · Great Falls'],
]) {
  test(`items: "${q}" → ${label} (${meta})`, () => {
    const t = top(q);
    assert.equal(t.label, label);
    assert.equal(t.meta, meta);
  });
}

test('items: typos find stations and places alike (a tie goes to the station)', () => {
  const r = search('billigns');
  assert.match(r.flat[r.best].label, /^Billings/);
  assert.ok(r.groups.find((g) => g.name === 'Places').items.map((i) => i.label).includes('Billings'));
  assert.ok(search('misoula').flat.map((i) => i.label).includes('Missoula'));
});

test('items: a station name still leads its own search; the town is listed under it', () => {
  const r = search('bozeman');
  assert.equal(r.flat[r.best].id, 'acebozem');
  eq(r.groups.map((g) => g.name), ['Stations', 'Places']);
  assert.ok(r.groups[1].items.map((i) => i.label).includes('Bozeman'));
});

test('items: numbers never match by typo (no 59071 for "5971")', () => {
  assert.ok(search('5971').flat.map((i) => i.label).every((l) => l.startsWith('5971')));
});

test('items: places capped at P.RESULTS', () => {
  assert.equal(search('59').flat.filter((i) => P.isPlaceItem(i.id)).length, P.RESULTS);
});

/* ── searchModel sections (core, 0.16.0; ported) ─────────────────────────── */

const mixed = [
  { id: 'acebozem', label: 'Bozeman', group: 'HydroMet', section: 'Stations' },
  { id: 'acebozm4', label: 'Bozeman 4th', group: 'HydroMet', section: 'Stations' },
  { id: 'place:p3008950', label: 'Bozeman', meta: 'City', section: 'Places', queryOnly: true },
  { id: 'place:c30031', label: 'Gallatin County', meta: 'County', section: 'Places', queryOnly: true, keywords: ['Gallatin'] },
  { id: 'place:z59715', label: '59715', meta: 'ZIP code', section: 'Places', queryOnly: true },
];

test('sections: query-only items stay out of the full list', () => {
  eq(SM.filter(mixed, '').flat.map((i) => i.id), ['acebozem', 'acebozm4']);
  eq(SM.filter(mixed, '').groups.map((g) => g.name), ['HydroMet']);
});

test('sections: each headed when more than one matches; stations first; a tie goes to the earlier section', () => {
  const r = SM.filter(mixed, 'bozeman');
  eq(r.groups.map((g) => [g.name, g.items.map((i) => i.id)]), [
    ['Stations', ['acebozem', 'acebozm4']],
    ['Places', ['place:p3008950']],
  ]);
  assert.equal(r.best, 0);
});

test('sections: one section is not headed; best is the top rank even in a later section', () => {
  eq(SM.filter(mixed, '59715').groups, [{ name: null, items: [mixed[4]] }]);
  const g = SM.filter([{ id: 'acegalla', label: 'Gallatin Gateway', section: 'Stations' }, ...mixed.slice(2)], 'gallatin');
  eq(g.flat.map((i) => i.id), ['acegalla', 'place:c30031']);
  assert.equal(g.best, 1);   // the county's keyword is exact (0); the station a prefix (1)
});

test('sections: sectionLimits caps a section; total counts every match', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `place:p${i}`, label: `Town ${i}`, section: 'Places', queryOnly: true }));
  const r = SM.filter([...mixed.slice(0, 2), ...many], 'town', 200, { Places: 8 });
  assert.equal(r.flat.length, 8);
  assert.equal(r.total, 12);
});

// Items with neither field must filter exactly as 0.15.1 did. Compared
// against the 0.15.1 core when git has the tag (a full clone); skipped in a
// shallow CI checkout.
let oldCore = null;
try { oldCore = execFileSync('git', ['show', 'v0.15.1:core/mco-core.js'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch { /* shallow */ }
test('sections: plain items filter exactly as in 0.15.1', { skip: oldCore ? false : 'no v0.15.1 tag in this clone' }, () => {
  const old = kit([['v0.15.1 core', oldCore]]).MCO.searchModel;
  const plainItems = stationItems.map(({ section, ...rest }) => rest);
  for (const q of ['', 'b', 'bo', 'bozeman', 'bozman', 'KEEM8', 'ace', 'gallatin', 'zzz', 'mt', ' crow ', 'Apsáalooke']) {
    for (const limit of [undefined, 5, 200]) {
      eq(SM.filter(plainItems, q, limit), old.filter(plainItems, q, limit), `q=${JSON.stringify(q)} limit=${limit}`);
    }
  }
});

/* ── Distance (ported) ───────────────────────────────────────────────────── */

test('haversine: zero for the same point, symmetric, Bozeman → Missoula ≈ 265 km, 1° lat ≈ 111.2 km', () => {
  assert.equal(P.haversineKm(45.66, -111.07, 45.66, -111.07), 0);
  assert.ok(Math.abs(P.haversineKm(45.66, -111.07, 46.87, -114) - P.haversineKm(46.87, -114, 45.66, -111.07)) < 1e-9);
  const bm = P.haversineKm(45.677, -111.043, 46.872, -113.994);
  assert.ok(bm > 260 && bm < 270, String(bm));
  assert.ok(Math.abs(P.haversineKm(45, -110, 46, -110) - 111.2) < 0.5);
});

const st = (station, latitude, longitude) => ({ station, name: station, sub_network: 'HydroMet', latitude, longitude });
const list = [st('far', 48.5, -104), st('near', 45.7, -111.1), st('mid', 46.5, -112), st('bad', Number.NaN, -110), st('mid2', 45.9, -111.5), { station: 'none', name: 'none' }];

test('nearest: the n nearest, closest first, with km and miles', () => {
  const r = P.nearest({ lat: 45.66, lon: -111.07 }, list, 3);
  eq(r.map((x) => x.station), ['near', 'mid2', 'mid']);
  assert.ok(Math.abs(r[0].miles - r[0].km / 1.609344) < 1e-9);
  eq(Object.keys(r[0]), ['station', 'name', 'sub_network', 'km', 'miles']);
});

test('nearest: defaults to P.NEAREST (5); skips rows without coordinates; empty in, empty out', () => {
  eq(P.nearest({ lat: 45.66, lon: -111.07 }, list).map((x) => x.station), ['near', 'mid2', 'mid', 'far']);
  eq(P.nearest({ lat: 45.66, lon: -111.07 }, []), []);
  eq(P.nearest({ lat: 45.66, lon: -111.07 }, null), []);
  assert.equal(P.NEAREST, 5);
});

test('formatMiles: one decimal under 10 mi', () => {
  assert.equal(P.formatMiles(0.42), '0.4 mi');
  assert.equal(P.formatMiles(9.96), '10.0 mi');
  assert.equal(P.formatMiles(23.4), '23 mi');
});

/* ── Areas (ported) ──────────────────────────────────────────────────────── */

test('pointInGeometry: a square with a hole; a MultiPolygon', () => {
  const g = { type: 'Polygon', coordinates: [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
    [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
  ] };
  for (const [x, y, inside] of [[1, 1, true], [5, 5, false], [11, 5, false], [9.9, 9.9, true]]) {
    assert.equal(P.pointInGeometry(x, y, g), inside, `(${x}, ${y})`);
  }
  const m = { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]], [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]]] };
  assert.equal(P.pointInGeometry(5.5, 5.5, m), true);
  assert.equal(P.pointInGeometry(3, 3, m), false);
});

test('areaIndex: keyed by place id, GEOID with any trailing R dropped', () => {
  const m = P.areaIndex({ features: [
    { properties: { GEOID: '1110R' }, geometry: { type: 'Polygon', coordinates: [] } },
    { properties: { GEOID: '0305' }, geometry: { type: 'Polygon', coordinates: [] } },
    { properties: {}, geometry: { type: 'Polygon', coordinates: [] } },
  ] });
  eq([...m.keys()], ['r1110', 'r0305']);
  assert.equal(P.areaIndex(null).size, 0);
});

/* ── Stations for a place (ported) ───────────────────────────────────────── */

test('stationsFor: a county lists every catalog station in it, nearest its centre first', () => {
  const county = byName('Gallatin County');
  const r = P.stationsFor(county, stations);
  const expected = stations.filter((s) => s.county === 'Gallatin').map((s) => s.station);
  assert.equal(r.title, 'Gallatin County');
  assert.equal(r.inside, true);
  eq(r.rows.map((x) => x.station).sort(), expected.sort());
  eq(r.rows.map((x) => x.km), [...r.rows.map((x) => x.km)].sort((a, b) => a - b));
  assert.equal(P.announcement(county, r), `${expected.length} stations in Gallatin County`);
});

test('stationsFor: a reservation lists the stations inside its boundary', () => {
  const flathead = byName('Flathead Reservation');
  const r = P.stationsFor(flathead, stations, areas.get(flathead.id));
  assert.equal(r.inside, true);
  assert.ok(r.rows.length > 0);
  for (const row of r.rows) {
    const s = stations.find((x) => x.station === row.station);
    assert.ok(['Lake', 'Sanders', 'Missoula', 'Flathead'].includes(s.county), s.county);
  }
  assert.match(P.announcement(flathead, r), /^\d+ stations? on the Flathead Reservation$/);
});

test('stationsFor: a town or ZIP code lists the 5 nearest', () => {
  const r = P.stationsFor(byName('Bozeman', 'city'), stations);
  assert.equal(r.title, 'Near Bozeman');
  assert.equal(r.inside, false);
  assert.equal(r.rows.length, 5);
  assert.ok(r.rows[0].miles < 10);
  assert.equal(P.stationsFor(byName('59715', 'zip'), stations).title, 'Near 59715');
});

test('stationsFor: a tribe with no reservation lists the 5 nearest its town', () => {
  const tribe = byName('Little Shell Tribe');
  const r = P.stationsFor(tribe, stations);
  assert.equal(r.title, 'Near Great Falls');
  assert.equal(r.inside, false);
  eq(r.rows, P.stationsFor(byName('Great Falls', 'city'), stations).rows);
  assert.equal(P.announcement(tribe, r), '5 stations near Great Falls');
});

test('stationsFor: an area with no station inside, or no boundary, falls back to the nearest', () => {
  const empty = P.stationsFor(byName('Gallatin County'), stations.filter((s) => s.county !== 'Gallatin'));
  assert.equal(empty.title, 'Near Gallatin County');
  assert.equal(empty.inside, false);
  assert.equal(empty.rows.length, 5);
  const noArea = P.stationsFor(byName('Crow Reservation'), stations);
  assert.equal(noArea.inside, false);
  assert.equal(P.announcement(byName('Crow Reservation'), noArea), '5 stations near Crow Reservation');
});

test('announcement: singular, and Near me', () => {
  assert.equal(P.announcement(byName('Bozeman', 'city'), { inside: false, rows: [{}] }), '1 station near Bozeman');
  assert.equal(P.announcement(null, { inside: false, rows: [{}, {}, {}] }), '3 stations near you');
});

/* ── Loaders ─────────────────────────────────────────────────────────────── */

test('load: from the kit root with the pinned integrity; cached; a failure is not', async () => {
  const calls = [];
  let fail = true;
  stub(async (url, init) => {
    calls.push([url, init.integrity]);
    if (fail) return new Response('nope', { status: 503 });
    return new Response(PLACES_JSON);
  });
  const base = 'https://example.test/kit@1/';
  await assert.rejects(P.load({ base }), /HTTP 503/);
  fail = false;
  const a = await P.load({ base });
  const b = await P.load({ base });
  assert.equal(a, b);
  assert.equal(a.length, places.length);
  eq(calls, [[base + 'places/mt-places.json', P.DATA_INTEGRITY], [base + 'places/mt-places.json', P.DATA_INTEGRITY]]);
  const c = await P.load({ base, fresh: true });
  assert.notEqual(c, a);
  assert.equal(calls.length, 3);
});

test('load: {url} is a vendored copy, checked only against an integrity given with it', async () => {
  const calls = [];
  stub(async (url, init) => { calls.push([url, init.integrity]); return new Response(PLACES_JSON); });
  await P.load({ url: '/data/places.json' });
  await P.load({ url: '/data/places2.json', integrity: 'sha384-x' });
  eq(calls, [['/data/places.json', undefined], ['/data/places2.json', 'sha384-x']]);
  // No kit root and no url: say so, don't guess.
  assert.throws(() => P.load(), /pass \{url\}/);
});

test('loadAreas: the kit\'s reservation boundaries, indexed, with their integrity', async () => {
  const calls = [];
  stub(async (url, init) => { calls.push([url, init.integrity]); return new Response(AREAS_JSON); });
  const m = await P.loadAreas({ base: 'https://example.test/kit@2' });
  assert.ok(m.has('r1110'));
  eq(calls, [['https://example.test/kit@2/map/data/mt_reservations_simple.geojson', P.AREAS_INTEGRITY]]);
});

/* ── Near me ─────────────────────────────────────────────────────────────── */

function geo(behaviour) {
  const seen = [];
  sandbox.navigator = { geolocation: { getCurrentPosition(ok, err, opts) { seen.push(opts); behaviour(ok, err); } } };
  return seen;
}

test('locate: a position, once, with low accuracy and a 10 s timeout', async () => {
  const seen = geo((ok) => ok({ coords: { latitude: 45.67, longitude: -111.05, accuracy: 30 } }));
  eq(await P.locate(), { lat: 45.67, lon: -111.05, accuracy: 30 });
  eq(seen, [{ enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }]);
  assert.equal(P.canLocate(), true);
});

test('locate: every failure has a reason the app can put in words', async () => {
  for (const [code, reason] of [[1, 'denied'], [2, 'unavailable'], [3, 'timeout']]) {
    geo((ok, err) => err({ code }));
    await assert.rejects(P.locate(), (e) => e.reason === reason);
  }
  delete sandbox.navigator;
  assert.equal(P.canLocate(), false);
  await assert.rejects(P.locate(), (e) => e.reason === 'unsupported');
});

test('nearMe: locate, then the nearest stations', async () => {
  geo((ok) => ok({ coords: { latitude: 45.66, longitude: -111.07, accuracy: 10 } }));
  const r = await P.nearMe(list, { n: 2 });
  eq({ title: r.title, inside: r.inside, rows: r.rows.map((x) => x.station) }, { title: 'Near me', inside: false, rows: ['near', 'mid2'] });
  assert.equal(P.announcement(null, r), '2 stations near you');
  delete sandbox.navigator;
});

/* ── Live (opt-in) ───────────────────────────────────────────────────────── */

test('live: the station catalog on mesonet2 fits the gazetteer', { skip: !LIVE }, async () => {
  const res = await fetch('https://mesonet2.climate.umt.edu/api/v2/stations/?type=json', { signal: AbortSignal.timeout(30000) });
  assert.ok(res.ok, `HTTP ${res.status}`);
  const live = await res.json();
  const counties = new Set(places.filter((p) => p.kind === 'county').map((p) => p.keywords[0].toLowerCase()));
  const located = live.filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
  const missing = located.filter((s) => s.county && !counties.has(String(s.county).toLowerCase()));
  eq(missing.map((s) => `${s.station} ${s.county}`), [], 'every station county is a gazetteer county');
  const boz = P.stationsFor(byName('Bozeman', 'city'), live);
  const gal = P.stationsFor(byName('Gallatin County'), live);
  assert.equal(boz.rows.length, 5);
  assert.ok(gal.inside && gal.rows.length > 0);
  console.log(`# live: ${live.length} stations (${located.length} located); ${boz.title}: ` +
    `${boz.rows.map((r) => `${r.station} ${P.formatMiles(r.miles)}`).join(', ')}; ${P.announcement(byName('Gallatin County'), gal)}`);
});

test('live: jsDelivr serves the data at KIT_TAG with the pinned bytes', { skip: !(LIVE && process.env.KIT_TAG) }, async () => {
  const base = `https://cdn.jsdelivr.net/gh/mt-climate-office/mco-web-style@${process.env.KIT_TAG}/`;
  for (const [path, want] of [[P.DATA_PATH, P.DATA_INTEGRITY], [P.AREAS_PATH, P.AREAS_INTEGRITY]]) {
    const res = await fetch(base + path, { signal: AbortSignal.timeout(30000) });
    assert.ok(res.ok, `${path}: HTTP ${res.status}`);
    assert.equal(sri(Buffer.from(await res.arrayBuffer())), want, path);
  }
  console.log(`# live: ${base} serves both data files with the pinned hashes`);
});
