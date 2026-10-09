#!/usr/bin/env node
/* Consumer conformance check — the automatable half of CONFORMANCE.md.
   Static: reads a consumer's entry HTML and the scripts it loads from the
   same repo; never runs the app or fetches anything. Run from this repo:

     node tools/conformance.mjs ../mesonet-status            # index.html
     node tools/conformance.mjs ../mesonet-photo-explorer docs/index.html

   Prints one line per check (✓ / ✗ / – not applicable) and "N/M automatic",
   the number CONSUMERS.md records per app. Manual items are listed after;
   they are CONFORMANCE.md's job. Exit code is always 0: this measures, the
   verify pass gates. Zero dependencies. */
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

const [repo, page = 'index.html'] = process.argv.slice(2);
if (!repo) { console.error('usage: node tools/conformance.mjs <consumer-repo> [entry.html]'); process.exit(2); }
const htmlPath = join(repo, page);
const html = readFileSync(htmlPath, 'utf8');
// App scripts: local <script src> files (not CDN), read alongside the page.
const scripts = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1])
  .filter((s) => !/^https?:/.test(s))
  .map((s) => join(dirname(htmlPath), s.split('?')[0]))
  .filter((p) => existsSync(p));
const js = scripts.map((p) => readFileSync(p, 'utf8')).join('\n');
const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const all = html + '\n' + js;
const isMap = /maplibre/i.test(all);

const results = [];
const check = (section, label, ok, detail = '') => results.push({ section, label, ok, detail });
const na = (section, label, why) => results.push({ section, label, ok: null, detail: why });

/* 1. Head */
const kitTags = [...html.matchAll(/<(script|link)\b[^>]*mco-web-style@[^>]*>/g)].map((m) => m[0])
  .filter((t) => !/rel="preload"|rel="icon"|rel="apple-touch-icon"/.test(t));
const versions = new Set([...html.matchAll(/mco-web-style@([^/"']+)/g)].map((m) => m[1]));
check('Head', 'kit tags pinned @X.Y.Z with integrity + crossorigin',
  kitTags.length > 0 && kitTags.every((t) => /@\d+\.\d+\.\d+\//.test(t) && /integrity="sha384-/.test(t) && /crossorigin/.test(t)) && versions.size === 1,
  `${kitTags.length} tags, versions: ${[...versions].join(', ') || 'none'}`);
check('Head', 'house font preloads (both latin files)',
  /preload[^>]*outfit-latin\.woff2/.test(html) && /preload[^>]*space-mono-latin\.woff2/.test(html));
const anti = (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
const antiOk = /mco-theme/.test(anti) && /data-theme/.test(anti) && /is-compact/.test(anti);
const csp = (html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/) || [])[1];
const antiHash = `sha256-${createHash('sha256').update(anti).digest('base64')}`;
check('Head', 'anti-flash inline (0.7.0 body) and, with a CSP, its sha256 allowed',
  antiOk && (!csp || csp.includes(antiHash)), csp ? (csp.includes(antiHash) ? 'hash ok' : `CSP lacks ${antiHash}`) : 'no CSP');
check('Head', 'anti-flash carries the first-paint hold (mco-booting) — kit 0.9.0', /mco-booting/.test(anti));
check('Head', 'viewport-fit=cover', /name="viewport"[^>]*viewport-fit=cover/.test(html));
const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
check('Head', 'title is "<Short name> · <MT Mesonet|MCO>"', /^[^·]+ · (MT Mesonet|MCO)$/.test(title.trim()), title);
check('Head', 'og:title, twitter:title, canonical',
  /property="og:title"/.test(html) && /name="twitter:title"/.test(html) && /rel="canonical"/.test(html));
// Hot-linked from the pinned kit tag (decided 2026-10-08, kit 0.9.0).
check('Head', 'favicon hot-linked from the pinned kit tag — kit 0.9.0', /rel="icon"[^>]*mco-web-style@\d+\.\d+\.\d+\/assets\/favicon/.test(html));
if (isMap) {
  const im = (html.match(/<script type="importmap">([\s\S]*?)<\/script>/) || [])[1];
  check('Head', 'MapLibre 6 via import map (SRI) — kit 0.8.0', !!im && /maplibre-gl@6\./.test(im) && !/maplibre-gl@5/.test(html));
  if (csp) check('Head', 'CSP worker-src allows blob: and https://unpkg.com', /worker-src[^;]*blob:[^;]*unpkg|worker-src[^;]*unpkg[^;]*blob:/.test(csp));
}

/* 2. Shell */
check('Shell', 'skip link → #main, and #main exists',
  /class="mco-skip-link"[^>]*href="#main"|href="#main"[^>]*class="mco-skip-link"/.test(html) && /id="main"/.test(html));
check('Shell', 'brand title is the <h1>', /<h1[^>]*class="[^"]*brand-title/.test(html));
check('Shell', '.nav-meta (not .nav-actions)', /class="[^"]*\bnav-meta\b/.test(html) && !/\bnav-actions\b/.test(html));
check('Shell', 'info button is .mco-btn-info', /class="[^"]*\bmco-btn-info\b/.test(html));
const brandOverride = /@media[^{]*750px[^{]*\{[^}]*\.brand/.test(css);
check('Shell', '≤750 brand collapse untouched, or a tagged kit-override',
  !brandOverride || /kit-override[^\n]*brand|brand[^\n]*kit-override/i.test(css));

/* 3. Tokens */
const accentLines = [...(css + '\n' + js).matchAll(/(border(?:-[a-z]+)*|outline(?:-color)?|stroke|(?<![-\w])color)\s*:\s*[^;]*var\(--accent\)/g)];
check('Tokens', 'no --accent as a line or text color (use --accent-line)', accentLines.length === 0, `${accentLines.length} uses`);
const hexLines = css.split('\n').filter((l) => /#[0-9a-fA-F]{3,8}\b/.test(l) && !/contrast|data|palette|ramp|cvd|wcag|:\s*#[0-9a-f]+;\s*\/\*/i.test(l));
check('Tokens', 'no raw hex in app CSS without a contrast/data comment', hexLines.length === 0, `${hexLines.length} lines`);
check('Tokens', 'status colors from tokens (no local --c-warn / --warn-bg) — kit 0.8.0', !/--c-warn|--warn-bg/.test(css));

/* 4. A11y */
check('A11y', 'announcements via MCO.announce (no hand-made #sr-announce) — kit 0.8.0',
  /MCO\.announce\(/.test(js) && !/id="sr-announce"/.test(html));
if (isMap) check('A11y', 'canvas twin via MCO.srTable — kit 0.8.0', /MCO\.srTable\(/.test(js));
// Opacity on the ROW (the selector's subject), not on a swatch inside it:
// `.legend-row.off { opacity }` fails, `.legend-row.off .legend-swatch {…}` is
// the correct pattern.
check('A11y', 'legend dims the swatch, never the row (no opacity on a legend row)',
  !/legend-row(?:\.[\w-]+|\[[^\]]+\]|:[\w-]+)*\s*(?:,[^{]*)?\{[^}]*(?:^|[;{\s])opacity\s*:/.test(css));
const shortcuts = /kbd=off|'kbd'|"kbd"/.test(js);
if (shortcuts) check('A11y', '?kbd=off disclosed in the info modal', /kbd=off/.test(html));
else na('A11y', '?kbd=off disclosed in the info modal', 'no single-key shortcuts found');

/* 5. Maps */
if (isMap) {
  check('Maps', 'basemap failure handled (MCO.map.watchBasemap) — kit 0.8.0', /watchBasemap\(/.test(js));
  const htmlSinks = (js.match(/\.setHTML\(|\.innerHTML\s*=\s*`[^`]*\$\{|\.innerHTML\s*\+?=\s*[^;`'"]*\+/g) || []).length;
  check('Maps', 'no setHTML / innerHTML built from values (DOM popups) — HOUSE-STYLE §7', htmlSinks === 0, `${htmlSinks} sinks`);
  check('Maps', 'selection halo uses --selection-ring', /--selection-ring/.test(all));
  check('Maps', 'MCO.map.addNavigation (top-right, no compass)', /MCO\.map\.addNavigation\(/.test(js) && !/showCompass:\s*true/.test(js));
  check('Maps', 'zoom floor installed', /installZoomFloor\(/.test(js));
} else {
  na('Maps', 'map checks', 'no MapLibre on this page');
}

/* 6. URL */
check('URL', 'clean defaults (cameraParamsIfDefault / osTheme) — kit 0.8.0',
  /cameraParamsIfDefault\(|MCO\.osTheme\(/.test(js) || (!isMap && /MCO\.osTheme\(/.test(js)));
check('URL', 'pushUrlState for drill-down — kit 0.8.0', /MCO\.pushUrlState\(/.test(js));
const keys = [...js.matchAll(/(?:localStorage\.setItem|MCO\.lsSet)\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);
const badKeys = keys.filter((k) => k !== 'mco-theme' && !/^mco-[a-z0-9]+(-[a-z0-9]+)*-/.test(k));
check('URL', 'storage keys app-prefixed (mco-<app>-*)', badKeys.length === 0, badKeys.join(', '));

/* Report */
let section = '';
for (const r of results) {
  if (r.section !== section) { section = r.section; console.log(`\n${section}`); }
  const mark = r.ok === null ? '–' : r.ok ? '✓' : '✗';
  console.log(`  ${mark} ${r.label}${r.detail && r.ok !== true ? ` (${r.detail})` : ''}`);
}
const scored = results.filter((r) => r.ok !== null);
const pass = scored.filter((r) => r.ok).length;
console.log(`\nconformance: ${pass}/${scored.length} automatic — ${htmlPath}`);
console.log('Manual (CONFORMANCE.md): touch targets · steppers keyboard-operable · layer order · ' +
  'replace-vs-push behavior · axe 1440 + 390 in 3 themes · keyboard probes');
