#!/usr/bin/env node
/* WCAG contrast gate for the design tokens (CI; run locally before release).

   The contract (documented in mco-theme.css §1 and HOUSE-STYLE.md §2):
     --text-primary, --text-secondary  ≥ 4.5:1 on deep, surface, raised
     --text-muted,  --text-dim         ≥ 4.5:1 on deep, surface (NOT raised —
                                          that pair fails by design; don't use it)
     --accent-line                     ≥ 3:1  on deep, surface, raised (1.4.11)
     --text-on-accent                  ≥ 4.5:1 on --accent

   Only hex tokens participate; rgba()/gradients are out of scope here.
   Zero dependencies. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const json = JSON.parse(readFileSync(join(root, 'tokens/tokens.json'), 'utf8'));

function luminance(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(fg, bg) {
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

const MATRIX = [
  // [foreground token, background token, minimum ratio]
  ['--text-primary', '--bg-deep', 4.5], ['--text-primary', '--bg-surface', 4.5], ['--text-primary', '--bg-raised', 4.5],
  ['--text-secondary', '--bg-deep', 4.5], ['--text-secondary', '--bg-surface', 4.5], ['--text-secondary', '--bg-raised', 4.5],
  ['--text-muted', '--bg-deep', 4.5], ['--text-muted', '--bg-surface', 4.5],
  ['--text-dim', '--bg-deep', 4.5], ['--text-dim', '--bg-surface', 4.5],
  ['--accent-line', '--bg-deep', 3.0], ['--accent-line', '--bg-surface', 3.0], ['--accent-line', '--bg-raised', 3.0],
  ['--text-on-accent', '--accent', 4.5],
];

const errors = [];
let checked = 0;
for (const [themeName, tokens] of Object.entries(json.themes)) {
  for (const [fgKey, bgKey, min] of MATRIX) {
    const fg = tokens[fgKey], bg = tokens[bgKey];
    if (!/^#[0-9a-fA-F]{6}$/.test(fg || '') || !/^#[0-9a-fA-F]{6}$/.test(bg || '')) {
      errors.push(`${themeName}: ${fgKey} or ${bgKey} is missing or not a 6-digit hex`);
      continue;
    }
    const r = ratio(fg, bg);
    checked++;
    if (r < min) {
      errors.push(`${themeName}: ${fgKey} (${fg}) on ${bgKey} (${bg}) = ` +
        `${r.toFixed(2)}:1, needs ≥ ${min}:1`);
    }
  }
}

if (errors.length) {
  console.error(`check-contrast: ${errors.length} failure(s)\n  - ` + errors.join('\n  - '));
  process.exit(1);
}
console.log(`check-contrast: OK (${checked} pairs across ${Object.keys(json.themes).length} themes)`);
