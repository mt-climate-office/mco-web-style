#!/usr/bin/env node
/* Token-parity and JSON-sync check (CI gate; run locally before release).
   Asserts:
     1. [data-theme="light"] and [data-theme="high-contrast"] define exactly
        the same custom-property set as each other (a token added to one theme
        but not the other silently falls through to the dark value).
     2. Every property they define exists in :root (dark).
     3. tokens/tokens.json mirrors theme/mco-theme.css exactly — same keys,
        same values (whitespace-normalized) — for all three themes + z-ladder.
     4. A required core-token list is present in all three themes.
   Zero dependencies. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'theme/mco-theme.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ''); // strip comments
const json = JSON.parse(readFileSync(join(root, 'tokens/tokens.json'), 'utf8'));

const norm = (v) => v.replace(/\s+/g, ' ').trim();

// Collect custom properties per selector. `[^{}]+` can't cross braces, so
// @media wrappers never match as blocks — only leaf rule blocks do (with
// clean selectors), and none of the non-target ones declare tokens.
function blocks(selector) {
  const out = {};
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    if (m[1].trim() !== selector) continue;
    const body = m[2];
    const pre = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let p;
    while ((p = pre.exec(body)) !== null) out[p[1]] = norm(p[2]);
  }
  return out;
}

const rootProps = blocks(':root');
const light = blocks('[data-theme="light"]');
const hc = blocks('[data-theme="high-contrast"]');

const dark = {};
const zIndex = {};
for (const [k, v] of Object.entries(rootProps)) {
  (k.startsWith('--z-') ? zIndex : dark)[k] = v;
}

const REQUIRED = [
  '--bg-deep', '--bg-surface', '--bg-raised', '--border',
  '--text-primary', '--text-secondary', '--text-muted', '--text-dim',
  '--accent', '--accent-line', '--accent-hover', '--text-on-accent',
  '--selection-ring', '--brand-gradient', '--glass', '--ctrl-icon-filter',
];

const errors = [];

// 1 + 2: theme parity and containment.
const lightKeys = Object.keys(light).sort();
const hcKeys = Object.keys(hc).sort();
if (JSON.stringify(lightKeys) !== JSON.stringify(hcKeys)) {
  const onlyLight = lightKeys.filter((k) => !hcKeys.includes(k));
  const onlyHc = hcKeys.filter((k) => !lightKeys.includes(k));
  errors.push(`theme parity: light-only [${onlyLight}] vs high-contrast-only [${onlyHc}]`);
}
for (const k of new Set([...lightKeys, ...hcKeys])) {
  if (!(k in dark)) errors.push(`${k} is themed but has no :root (dark) definition`);
}

// 3: JSON sync.
function compare(label, cssMap, jsonMap) {
  const keys = new Set([...Object.keys(cssMap), ...Object.keys(jsonMap || {})]);
  for (const k of keys) {
    const c = cssMap[k], j = jsonMap?.[k] == null ? undefined : norm(String(jsonMap[k]));
    if (c === undefined) errors.push(`${label}: ${k} in tokens.json but not in CSS`);
    else if (j === undefined) errors.push(`${label}: ${k} in CSS but not in tokens.json`);
    else if (c !== j) errors.push(`${label}: ${k} differs — CSS '${c}' vs JSON '${j}'`);
  }
}
compare('dark', dark, json.themes?.dark);
compare('light', light, json.themes?.light);
compare('highContrast', hc, json.themes?.highContrast);
compare('zIndex', zIndex, json.zIndex);

// 4: required tokens everywhere.
for (const k of REQUIRED) {
  for (const [label, map] of [['dark', dark], ['light', light], ['high-contrast', hc]]) {
    if (!(k in map)) errors.push(`required token ${k} missing from ${label} theme`);
  }
}

if (errors.length) {
  console.error(`check-tokens: ${errors.length} problem(s)\n  - ` + errors.join('\n  - '));
  process.exit(1);
}
console.log(`check-tokens: OK (${Object.keys(dark).length} dark tokens, ` +
  `${lightKeys.length} themed, ${Object.keys(zIndex).length} z-index tiers)`);
