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
     --text-*, and --accent-line ≥ 3:1, on every --band-* (0.19.0)
     --prairie-line, --sage-line, --rust-line ≥ 4.5:1 on deep, surface,
                                          raised and every band (0.19.0)
     --text-on-prairie                 ≥ 4.5:1 on --prairie (0.19.0)

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
  // Landscape tones (0.19.0): body text, muted text and --accent-line hold on
  // every band; the -line tones read as text on every surface and band.
  ...['--band-sky', '--band-prairie', '--band-sage'].flatMap((b) => [
    ['--text-primary', b, 4.5], ['--text-secondary', b, 4.5],
    ['--text-muted', b, 4.5], ['--text-dim', b, 4.5], ['--accent-line', b, 3.0],
  ]),
  ...['--prairie-line', '--sage-line', '--rust-line'].flatMap((t) =>
    ['--bg-deep', '--bg-surface', '--bg-raised', '--band-sky', '--band-prairie', '--band-sage']
      .map((b) => [t, b, 4.5])),
  ['--text-on-prairie', '--prairie', 4.5],
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
/* Map category sets (0.21.0): palette CATEGORY_SETS, the station and cell
   categories of mesonet-status, -maintenance and -umrb-build. Gates, per set
   and theme (HOUSE-STYLE §6):
     - all three themes present, with the same keys and labels in order
     - no color in RESERVED_HUE (the tribal fill's orange/brown family), and
       the tribal fill itself IS in it (so the band means what it says)
     - ≥ 3:1 (WCAG 1.4.11) against every ground in grounds(): --bg-deep and
       --bg-surface from tokens.json, the CARTO land and water below, and the
       tribal fill composited over land at its opacity, read from
       map/mco-map.js overlayPaints() for that theme. A cell set
       (fillOpacity) is measured as its fill composited over land, against
       land, the tribal fill and the surfaces (a cell covers the water in it).
     - every pair ≥ CAT_MIN_DE apart in OKLab (ΔE × 100), for normal vision
       and simulated protan/deutan/tritan (Machado et al. 2009, severity 1,
       applied in linear sRGB); and every color ≥ CAT_MIN_DE from the raw
       tribal fill and tribal line colors, in each vision
     - ordered sets (*-age) are OKLab-lightness-monotonic
   `--report` prints every measured ratio and the worst pair per vision,
   for these sets and for the BEFORE sets in demo/palette-proposal.html. */
// CARTO basemap colors (data reference, not tokens): Dark Matter and Positron
// style.json, `background`/`landcover` and `water` paint, read 2026-11-03.
// High contrast loads Dark Matter (mco-map.js isDark()).
const CARTO = { dark: { land: '#0e0e0e', water: '#2c353c' }, light: { land: '#fafaf8', water: '#d4dadc' } };
const CAT_MIN_DE = 8;
const MACHADO = {
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};
const VISIONS = ['normal', 'protan', 'deutan', 'tritan'];
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const unlin = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const over = (fg, a, bg) => { const f = rgb(fg), b = rgb(bg); return toHex(f.map((v, i) => v * a + b[i] * (1 - a))); };
function simulate(hex, vision) {
  if (vision === 'normal') return hex;
  const v = rgb(hex).map(lin), M = MACHADO[vision];
  return toHex([0, 1, 2].map((r) => unlin(Math.min(1, Math.max(0, M[3 * r] * v[0] + M[3 * r + 1] * v[1] + M[3 * r + 2] * v[2])))));
}
const deltaE = (a, b, vision) => {
  const x = P.toOklab(simulate(a, vision)), y = P.toOklab(simulate(b, vision));
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

// overlayPaints() per theme, from map/mco-map.js in a stub DOM.
const tribalCache = {};
function tribalPaint(theme) {
  return (tribalCache[theme] ||= readTribalPaint(theme));
}
function readTribalPaint(theme) {
  const doc = { documentElement: { dataset: { theme } } };
  const mctx = {
    document: doc, getComputedStyle: () => ({ getPropertyValue: () => '' }),
    window: { matchMedia: () => ({ matches: false, addEventListener() {} }) },
  };
  mctx.window.document = doc;
  vm.createContext(mctx);
  vm.runInContext(readFileSync(join(root, 'map/mco-map.js'), 'utf8'), mctx, { filename: 'mco-map.js' });
  const o = mctx.window.MCO.map.overlayPaints();
  return { color: o.tribalFill['fill-color'], opacity: o.tribalFill['fill-opacity'], line: o.tribalLine['line-color'] };
}
function grounds(theme) {
  const tokens = json.themes[THEME_KEY[theme]];
  const base = CARTO[theme === 'light' ? 'light' : 'dark'];
  const tribal = tribalPaint(theme);
  return {
    '--bg-deep': tokens['--bg-deep'], '--bg-surface': tokens['--bg-surface'],
    'basemap land': base.land, 'basemap water': base.water,
    'tribal fill': over(tribal.color, tribal.opacity, base.land),
    _tribalRaw: [tribal.color, tribal.line],
  };
}
// Measure one set (rows [{key,label,color}], optional fillOpacity) in a theme.
function measureSet(rows, theme, fillOpacity) {
  const g = grounds(theme);
  const shown = (c) => (fillOpacity ? over(c, fillOpacity, g['basemap land']) : c);
  const out = rows.map((r) => {
    const ratios = {};
    for (const [k, bg] of Object.entries(g)) {
      if (k.startsWith('_') || (fillOpacity && k === 'basemap water')) continue;
      ratios[k] = P.contrast(fillOpacity ? shown(r.color) : r.color, bg);
    }
    return { ...r, ratios, reserved: P.isReservedHue(r.color), lch: P.toOklch(r.color) };
  });
  const worst = {};
  for (const v of VISIONS) {
    worst[v] = { de: Infinity, a: null, b: null };
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const d = deltaE(shown(rows[i].color), shown(rows[j].color), v);
      if (d < worst[v].de) worst[v] = { de: d, a: rows[i].key, b: rows[j].key };
    }
  }
  // Closest any color comes to the tribal fill / line hexes, per vision.
  const nearTribal = {};
  for (const v of VISIONS) {
    nearTribal[v] = { de: Infinity, a: null, b: null };
    for (const r of rows) for (const t of g._tribalRaw) {
      const d = deltaE(r.color, t, v);
      if (d < nearTribal[v].de) nearTribal[v] = { de: d, a: r.key, b: t };
    }
  }
  return { rows: out, worst, nearTribal };
}

const R = P.RESERVED_HUE;
if (!R || !(R.from < R.to)) errors.push('palette: RESERVED_HUE missing');
for (const theme of P.THEMES) {
  const raw = tribalPaint(theme).color;
  if (!P.isReservedHue(raw)) errors.push(`palette: tribal fill ${raw} (${theme}) is outside RESERVED_HUE — the band no longer covers it`);
}
const setNames = Object.keys(P.CATEGORY_SETS || {});
if (!setNames.length) errors.push('palette: CATEGORY_SETS is empty');
for (const name of setNames) {
  const set = P.CATEGORY_SETS[name];
  const sig = (t) => JSON.stringify((set[t] || []).map((r) => [r.key, r.label]));
  for (const theme of P.THEMES) {
    const rows = set[theme];
    if (!rows || !rows.length) { errors.push(`palette: ${name} has no ${theme} rows`); continue; }
    if (sig(theme) !== sig('dark')) errors.push(`palette: ${name} ${theme} keys/labels differ from dark`);
    const copy = P.categorySet(name, theme);
    if (JSON.stringify(copy) !== JSON.stringify(rows.map((r) => ({ key: r.key, label: r.label, color: r.color })))) errors.push(`palette: categorySet(${name}, ${theme}) does not match CATEGORY_SETS`);
    if (rows.fillOpacity !== copy.fillOpacity) errors.push(`palette: categorySet(${name}, ${theme}) lost fillOpacity`);
    if (rows.some((r) => !/^#[0-9a-f]{6}$/.test(r.color))) { errors.push(`palette: ${name} ${theme} has a non-#rrggbb color`); continue; }
    const m = measureSet(rows, theme, rows.fillOpacity);
    for (const r of m.rows) {
      rampChecks++;
      if (r.reserved) errors.push(`palette: ${name} ${theme} ${r.key} ${r.color} is in the reserved orange/brown hue (h ${r.lch[2].toFixed(0)}°)`);
      for (const [k, v] of Object.entries(r.ratios)) {
        rampChecks++;
        if (v < 3) errors.push(`palette: ${name} ${theme} ${r.key} ${r.color} = ${v.toFixed(2)}:1 on ${k}, needs ≥ 3:1`);
      }
    }
    for (const v of VISIONS) {
      rampChecks++;
      const w = m.worst[v];
      if (w.de < CAT_MIN_DE) errors.push(`palette: ${name} ${theme} ${w.a}/${w.b} ΔE ${w.de.toFixed(1)} (${v}), needs ≥ ${CAT_MIN_DE}`);
      rampChecks++;
      const n = m.nearTribal[v];
      if (n.de < CAT_MIN_DE) errors.push(`palette: ${name} ${theme} ${n.a} is ΔE ${n.de.toFixed(1)} from tribal ${n.b} (${v}), needs ≥ ${CAT_MIN_DE}`);
    }
    if (/-age$/.test(name)) {
      const Ls = rows.map((r) => P.toOklab(r.color)[0]);
      const up = Ls.every((x, i) => !i || x > Ls[i - 1]), down = Ls.every((x, i) => !i || x < Ls[i - 1]);
      if (!up && !down) errors.push(`palette: ${name} ${theme} is not lightness-monotonic`);
    }
  }
}

if (process.argv.includes('--report')) {
  // BEFORE sets: the JSON block in demo/palette-proposal.html (from each app's main).
  const html = readFileSync(join(root, 'demo/palette-proposal.html'), 'utf8');
  const before = JSON.parse(/<script type="application\/json" id="before-sets">([\s\S]*?)<\/script>/.exec(html)[1]);
  const print = (title, rows, theme, fillOpacity) => {
    const m = measureSet(rows, theme, fillOpacity);
    console.log(`\n${title} [${theme}]${fillOpacity ? ` (cells at ${fillOpacity} over land)` : ''}`);
    console.log('  worst pair ΔE: ' + VISIONS.map((v) => `${v} ${m.worst[v].de.toFixed(1)} (${m.worst[v].a}/${m.worst[v].b})`).join(' · '));
    console.log('  nearest tribal ΔE: ' + VISIONS.map((v) => `${v} ${m.nearTribal[v].de.toFixed(1)} (${m.nearTribal[v].a})`).join(' · '));
    for (const r of m.rows) {
      const min = Math.min(...Object.values(r.ratios));
      console.log(`  ${r.color} h${r.lch[2].toFixed(0).padStart(3)}° ${r.reserved ? 'RESERVED' : '        '} ${r.label.padEnd(28)} ` +
        Object.entries(r.ratios).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ') + `  min ${min.toFixed(2)}${min < 3 ? ' FAIL' : ''}`);
    }
  };
  for (const [name, set] of Object.entries(before)) for (const theme of P.THEMES) {
    const rows = set.keys.map((key, i) => ({ key, label: set.labels[i], color: set[theme][i] }));
    print(`BEFORE ${name} (${set.source})`, rows, theme, set.fillOpacity);
  }
  for (const name of setNames) for (const theme of P.THEMES) print(`AFTER ${name}`, P.CATEGORY_SETS[name][theme], theme, P.CATEGORY_SETS[name][theme].fillOpacity);
}

const L = P.sample('batlow', 32).map((c) => P.toOklab(c)[0]);
if (L.some((v, i) => i > 0 && v <= L[i - 1])) errors.push('palette: batlow is not lightness-monotonic');
if (Object.keys(P.RAMPS).some((k) => /spectral/i.test(k)) || !P.isBanned('Spectral')) errors.push('palette: Spectral must be absent and banned');

if (errors.length) {
  console.error(`check-contrast: ${errors.length} failure(s)\n  - ` + errors.join('\n  - '));
  process.exit(1);
}
console.log(`check-contrast: OK (${checked} token pairs across ${Object.keys(json.themes).length} themes; ${rampChecks} palette checks)`);
