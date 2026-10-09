#!/usr/bin/env node
/* SRI-freshness gate (CI; run locally at release).
   Recomputes the sha384 of every published css/js file and asserts the hash
   appears in each document that embeds SRI hashes (README table, head
   snippet, CDN demo). A stale hash means someone edited a published file
   without re-running tools/sri.sh — the exact drift SRI exists to catch.
   Zero dependencies. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const FILES = [
  'theme/mco-theme.css',
  'core/mco-core.js',
  'map/mco-map.js',
  'map/cog-protocol.js',
  'palette/mco-palette.js',
];
const DOCS = ['README.md', 'snippets/head.html', 'demo/cdn.html'];

const errors = [];
for (const file of FILES) {
  const digest = createHash('sha384').update(readFileSync(join(root, file))).digest('base64');
  const sri = `sha384-${digest}`;
  for (const doc of DOCS) {
    const text = readFileSync(join(root, doc), 'utf8');
    if (!text.includes(sri)) {
      errors.push(`${doc} lacks the current hash for ${file} (${sri})`);
    }
  }
}

// Every kit URL in a document must name ONE version, the same in all three.
// Hashes can't catch a stale @version on a file that isn't hashed — the font
// preloads (0.7.0) — and a preload on a different tag from the theme CSS
// fetches a file @font-face never asks for, downloading the font twice.
const versions = new Map();
for (const doc of DOCS) {
  const text = readFileSync(join(root, doc), 'utf8');
  const found = new Set([...text.matchAll(/mco-web-style@(\d+\.\d+\.\d+)/g)].map(m => m[1]));
  if (found.size !== 1) errors.push(`${doc} pins ${found.size ? [...found].join(' and ') : 'no'} kit version(s); expected exactly one`);
  for (const v of found) versions.set(v, [...(versions.get(v) || []), doc]);
}
if (versions.size > 1) {
  errors.push('documents disagree on the kit version: ' +
    [...versions].map(([v, docs]) => `${v} in ${docs.join(', ')}`).join('; '));
}

// MapLibre (0.8.0): the family pin lives in mco-map.js (MAPLIBRE_VERSION);
// pages pin its bytes with a one-line import map. Every page carrying one must
// carry the SAME map, naming that version, with its modulepreloads agreeing;
// the README must publish the map's CSP sha256 and the exemplar's CSP must
// allow it. A MapLibre bump that misses any of these fails here, not in a
// consumer's console.
const mapJs = readFileSync(join(root, 'map/mco-map.js'), 'utf8');
const mlVersion = (mapJs.match(/M\.MAPLIBRE_VERSION = '([^']+)'/) || [])[1];
if (!mlVersion) errors.push('map/mco-map.js: no MAPLIBRE_VERSION found');
const ML_PAGES = ['snippets/head.html', 'demo/index.html', 'exemplar/index.html'];
let importMap = null;
for (const page of ML_PAGES) {
  const text = readFileSync(join(root, page), 'utf8');
  const m = text.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  if (!m) { errors.push(`${page}: no MapLibre import map`); continue; }
  if (importMap === null) importMap = m[1];
  else if (m[1] !== importMap) errors.push(`${page}: import map differs from ${ML_PAGES[0]}'s (keep it one identical line)`);
  for (const v of new Set([...text.matchAll(/maplibre-gl@(\d+\.\d+\.\d+)/g)].map(x => x[1]))) {
    if (v !== mlVersion) errors.push(`${page}: names maplibre-gl@${v}, but mco-map.js pins ${mlVersion}`);
  }
  let integrity = {};
  try { integrity = JSON.parse(m[1]).integrity || {}; } catch { errors.push(`${page}: import map is not valid JSON`); }
  for (const pre of text.matchAll(/<link rel="modulepreload" href="([^"]+)"\s+integrity="([^"]+)"/g)) {
    if (integrity[pre[1]] !== pre[2]) errors.push(`${page}: modulepreload of ${pre[1]} disagrees with the import map's hash`);
  }
}
if (importMap !== null) {
  const integrity = JSON.parse(importMap).integrity || {};
  const want = ['maplibre-gl.mjs', 'maplibre-gl-shared.mjs']
    .map(f => `https://unpkg.com/maplibre-gl@${mlVersion}/dist/${f}`);
  for (const url of want) if (!integrity[url]) errors.push(`import map lacks a hash for ${url}`);
  const cspHash = `'sha256-${createHash('sha256').update(importMap).digest('base64')}'`;
  for (const doc of ['README.md', 'exemplar/index.html']) {
    if (!readFileSync(join(root, doc), 'utf8').includes(cspHash)) {
      errors.push(`${doc} lacks the import map's CSP hash ${cspHash}`);
    }
  }
}

if (errors.length) {
  console.error(`check-sri: ${errors.length} stale/missing hash(es)\n  - ` + errors.join('\n  - ') +
    '\n  Re-run tools/sri.sh and update README.md, snippets/head.html, demo/cdn.html.');
  process.exit(1);
}
console.log(`check-sri: OK (${FILES.length} files × ${DOCS.length} documents, one kit version: ${[...versions.keys()][0]})`);
