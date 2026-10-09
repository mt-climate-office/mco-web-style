#!/usr/bin/env node
/* WCAG contrast gate for the design tokens (CI; run locally before release).

   The contract (documented in mco-theme.css §1 and HOUSE-STYLE.md §2):
     --text-primary, --text-secondary  ≥ 4.5:1 on deep, surface, raised
     --text-muted,  --text-dim         ≥ 4.5:1 on deep, surface (NOT raised —
                                          that pair fails by design; don't use it)
     --accent-line                     ≥ 3:1  on deep, surface, raised (1.4.11)
     --text-on-accent                  ≥ 4.5:1 on --accent
     --danger, --warning, --success    ≥ 4.5:1 on deep, surface, raised, and
                                          their own --*-fill (0.8.0)
     --text-on-danger/-warning/-success ≥ 4.5:1 on the matching --*-fill

   Only hex tokens participate; rgba()/gradients are out of scope here.
   Zero dependencies. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
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
  ['--text-on-accent', '--accent', 4.5], ['--text-on-accent', '--accent-fill-hover', 4.5],
  // Status tones (0.8.0): readable as text on every surface AND on their own
  // notice fill; the fill's text token likewise.
  ...['--danger', '--warning', '--success'].flatMap((t) => [
    [t, '--bg-deep', 4.5], [t, '--bg-surface', 4.5], [t, '--bg-raised', 4.5],
    [t, `${t}-fill`, 4.5], [`--text-on-${t.slice(2)}`, `${t}-fill`, 4.5],
  ]),
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

/* Data palettes (0.9.0): palette/mco-palette.js, loaded as the classic script
   it is (a vm context with a bare `window`). Gates:
     - every sequential ramp's span(name, theme): 9 samples ≥ 3:1 on that
       theme's --bg-surface (marks, WCAG 1.4.11)
     - diverging/cyclic ramps have no mark span (fills only) and diverging
       ones carry a midpoint the legend must label (§6)
     - NETWORK colors ≥ 3:1 on --bg-deep AND --bg-surface per theme
     - categorical() sets ≥ 3:1 on --bg-surface per theme
     - batlow is OKLab-lightness-monotonic; Spectral is absent
     - the palette's SURFACE copies match tokens.json */
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(readFileSync(join(root, 'palette/mco-palette.js'), 'utf8'), ctx, { filename: 'mco-palette.js' });
const P = ctx.window.MCO.palette;
const THEME_KEY = { dark: 'dark', light: 'light', 'high-contrast': 'highContrast' };
let rampChecks = 0;
for (const theme of P.THEMES) {
  const tokens = json.themes[THEME_KEY[theme]];
  const surface = tokens['--bg-surface'], deep = tokens['--bg-deep'];
  if (P.SURFACE[theme] !== surface) errors.push(`palette: SURFACE.${theme} ${P.SURFACE[theme]} ≠ tokens.json --bg-surface ${surface}`);
  for (const [name, ramp] of Object.entries(P.RAMPS)) {
    if (ramp.kind === 'sequential') {
      const span = P.span(name, theme);
      if (!span) { errors.push(`palette: ${name} has no ${theme} span`); continue; }
      for (const c of P.sample(name, 9, span)) {
        rampChecks++;
        const r = P.contrast(c, surface);
        if (r < 3) errors.push(`palette: ${name} span [${span}] in ${theme}: ${c} = ${r.toFixed(2)}:1 on ${surface}, needs ≥ 3:1`);
      }
    } else if (ramp.kind === 'diverging' || ramp.kind === 'cyclic') {
      rampChecks++;
      if (P.span(name, theme) !== null) errors.push(`palette: ${ramp.kind} ${name} must not offer a mark span`);
      if (ramp.kind === 'diverging' && typeof ramp.midpoint !== 'number') errors.push(`palette: diverging ${name} lacks a midpoint`);
    }
  }
  for (const [k, n] of Object.entries(P.NETWORK[theme])) {
    for (const [label, bg] of [['--bg-deep', deep], ['--bg-surface', surface]]) {
      rampChecks++;
      const r = P.contrast(n.color, bg);
      if (r < 3) errors.push(`palette: NETWORK ${k} ${n.color} in ${theme} = ${r.toFixed(2)}:1 on ${label}, needs ≥ 3:1`);
    }
  }
  for (const c of new Set(P.categorical(20, theme))) {
    rampChecks++;
    const r = P.contrast(c, surface);
    if (r < 3) errors.push(`palette: categorical ${c} in ${theme} = ${r.toFixed(2)}:1, needs ≥ 3:1`);
  }
}
const L = P.sample('batlow', 32).map((c) => P.toOklab(c)[0]);
if (L.some((v, i) => i > 0 && v <= L[i - 1])) errors.push('palette: batlow is not lightness-monotonic');
if (Object.keys(P.RAMPS).some((k) => /spectral/i.test(k)) || !P.isBanned('Spectral')) errors.push('palette: Spectral must be absent and banned');

if (errors.length) {
  console.error(`check-contrast: ${errors.length} failure(s)\n  - ` + errors.join('\n  - '));
  process.exit(1);
}
console.log(`check-contrast: OK (${checked} token pairs across ${Object.keys(json.themes).length} themes; ${rampChecks} palette checks)`);
