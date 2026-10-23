#!/usr/bin/env node
/**
 * Regenerates `places/mt-places.json`, the Montana gazetteer MCO.places
 * searches (places/mco-places.js): counties, American Indian reservations,
 * incorporated places and CDPs, and ZIP codes (ZCTAs), each with its Census
 * internal point, plus tribes with no Census reservation (TRIBES). Ported
 * from mesonet-dashboard web/src/core/places/vendor-places.mjs (0.16.0).
 *
 * Source: US Census Bureau Gazetteer Files (public domain),
 * https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html
 *
 * Usage (from the repo root), with the four files unzipped into one directory:
 *   B=https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer
 *   for f in 2026_Gaz_counties_national 2026_Gaz_aiannh_national 2026_Gaz_zcta_national; do
 *     curl -sO $B/$f.zip && unzip -o $f.zip; done
 *   curl -sO $B/2026_gaz_place_30.txt
 *   node tools/vendor-places.mjs --dir <that directory> --year 2026
 *
 * It prints the file's sha384. A changed file is a release: paste the hash
 * into P.DATA_INTEGRITY in places/mco-places.js (tools/check-places.mjs
 * fails until you do), and say so in the CHANGELOG.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '..', 'places', 'mt-places.json')

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const dir = resolve(arg('dir', '.'))
const year = arg('year', '2026')

/** Pipe-delimited Gazetteer file → row objects (2026 files use `|`; older ones tabs). */
function read(name) {
  const lines = readFileSync(join(dir, name), 'utf8').trim().split(/\r?\n/)
  const sep = lines[0].includes('|') ? '|' : '\t'
  const head = lines[0].split(sep).map((h) => h.trim())
  return lines.slice(1).map((l) => Object.fromEntries(l.split(sep).map((v, i) => [head[i], v.trim()])))
}

const MT = { s: 44.3, n: 49.1, w: -116.1, e: -104.0 }
const inMt = (lat, lon) => lat >= MT.s && lat <= MT.n && lon >= MT.w && lon <= MT.e
const ll = (r) => [Number(Number(r.INTPTLAT).toFixed(4)), Number(Number(r.INTPTLONG).toFixed(4))]

/** Short reservation names (the map's boundary file uses the same) and the nations' names as search keywords. */
const RESERVATIONS = {
  '0305': ['Blackfeet Indian Reservation', ['Blackfeet', 'Amskapi Piikani']],
  '0845': ['Crow Reservation', ['Crow', 'Apsáalooke', 'Apsaalooke']],
  1110: ['Flathead Reservation', ['Salish', 'Kootenai', 'Pend d’Oreille', 'CSKT']],
  1150: ['Fort Belknap Reservation', ['Gros Ventre', 'Aaniiih', 'Assiniboine', 'Nakoda']],
  1250: ['Fort Peck Indian Reservation', ['Assiniboine', 'Sioux', 'Nakoda', 'Dakota', 'Lakota']],
  2490: ['Northern Cheyenne Indian Reservation', ['Northern Cheyenne', 'Tsitsistas', 'Lame Deer']],
  3205: ['Rocky Boy’s Reservation', ['Rocky Boy', "Rocky Boy's", 'Chippewa Cree']],
}

/** Consolidated city-counties: the Census place name → the name people search. */
const PLACE_NAMES = {
  'Anaconda-Deer Lodge County': ['Anaconda', ['Anaconda-Deer Lodge']],
  'Butte-Silver Bow (balance)': ['Butte', ['Butte-Silver Bow', 'Silver Bow']],
}
const PLACE_KIND = { 25: 'city', 43: 'town', 57: 'community', '00': 'city' }

/** Tribal nations with no Census reservation, listed at the town of their headquarters: [id, name, keywords, town]. */
const TRIBES = [['tlittleshell', 'Little Shell Tribe', ['Little Shell', 'Chippewa', 'Métis', 'Metis'], 'Great Falls']]

/** [id, kind, name, lat, lon, keywords?, at?] */
const rows = []
const push = (id, kind, name, [lat, lon], keywords = [], at) =>
  rows.push(at ? [id, kind, name, lat, lon, keywords, at] : keywords.length ? [id, kind, name, lat, lon, keywords] : [id, kind, name, lat, lon])

for (const r of read(`${year}_Gaz_counties_national.txt`).filter((r) => r.USPS === 'MT')) {
  // The station catalog's `county` is the bare name ("Gallatin"), matched in core/places.
  push(`c${r.GEOID}`, 'county', r.NAME, ll(r), [r.NAME.replace(/ County$/, '')])
}
for (const r of read(`${year}_Gaz_aiannh_national.txt`)) {
  const res = RESERVATIONS[r.GEOID]
  if (!res) {
    if (inMt(...ll(r))) throw new Error(`unmapped Montana AIANNH area ${r.GEOID} ${r.NAME}`)
    continue
  }
  push(`r${r.GEOID}`, 'reservation', res[0], ll(r), res[1])
}
for (const r of read(`${year}_gaz_place_30.txt`)) {
  const kind = PLACE_KIND[r.LSAD]
  if (!kind) throw new Error(`unknown place LSAD ${r.LSAD} (${r.NAME})`)
  const [name, keywords] = PLACE_NAMES[r.NAME] ?? [r.NAME.replace(/ (city|town|CDP)$/, ''), []]
  push(`p${r.GEOID}`, kind, name, ll(r), keywords)
}
for (const [id, name, keywords, town] of TRIBES) {
  const at = rows.find((r) => r[0].startsWith('p') && r[2] === town)
  if (!at) throw new Error(`no place ${town} for ${name}`)
  push(id, 'tribe', name, [at[3], at[4]], keywords, town)
}
for (const r of read(`${year}_Gaz_zcta_national.txt`).filter((r) => /^59\d{3}$/.test(r.GEOID))) {
  push(`z${r.GEOID}`, 'zip', r.GEOID, ll(r))
}

const json = {
  source: `US Census Bureau ${year} Gazetteer Files`,
  release: year,
  columns: ['id', 'kind', 'name', 'lat', 'lon', 'keywords', 'at'],
  rows,
}
const text = JSON.stringify(json) + '\n'
writeFileSync(out, text)
const count = (k) => rows.filter((r) => r[1] === k).length
console.log(
  `places: ${rows.length} (${['county', 'reservation', 'tribe', 'city', 'town', 'community', 'zip'].map((k) => `${k} ${count(k)}`).join(', ')})`,
)
console.log(`sha384-${createHash('sha384').update(text).digest('base64')}  places/mt-places.json`)
