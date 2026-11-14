#!/usr/bin/env node
/* Consumer conformance check — the automatable half of CONFORMANCE.md.
   Static: reads a consumer's entry HTML and the scripts it loads from the
   same repo; never runs the app or fetches anything. Run from this repo:

     node tools/conformance.mjs ../mesonet-status            # index.html
     node tools/conformance.mjs ../mesonet-photo-explorer docs/index.html
     node tools/conformance.mjs ../mesonet-status --readme ../mesonet-status/README.md

   --readme <path> picks the README the Help checks read; the default is the
   repo's README.md, when there is one. --readme none skips them (the kit's
   own demo and exemplar, whose README is the kit's).

   Prints one line per check (✓ / ✗ / – not applicable) and "N/M automatic",
   the number CONSUMERS.md records per app. Manual items are listed after;
   they are CONFORMANCE.md's job. Exit code is always 0: this measures, the
   verify pass gates. Zero dependencies. */
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

const argv = process.argv.slice(2);
const ri = argv.indexOf('--readme');
const readmeArg = ri >= 0 ? argv.splice(ri, 2)[1] : null;
const [repo, page = 'index.html'] = argv;
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
const check = (section, label, ok, detail = '', warn = false, show = false) => results.push({ section, label, ok, detail, warn, show });
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
// Same exemption as tools/verify/lint-css.mjs (0.11.3): a ratio comment
// ("/* 5.08:1 */") anywhere on the line counts, even after a closing brace.
const hexLines = css.split('\n').filter((l) => /#[0-9a-fA-F]{3,8}\b/.test(l) && !/contrast|data|palette|ramp|cvd|wcag|\d(\.\d+)?:1|kit-override/i.test(l));
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

/* 4b. Help and README (HOUSE-STYLE §1 "Help and docs", kit 1.0.0). Static:
   the modal's text as written in the HTML; text a script adds at run time
   (the credit line) is not counted. */
const SECTIONS = ['What this shows', 'How to use it', 'Share or bookmark', 'Data'];
const strip = (h) => h.replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<(\w+)\b[^>]*\b(?:hidden|class="[^"]*\bsr-only\b[^"]*")[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&[#\w]+;/g, ' ');
const words = (t) => (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’.\-/]*/gu) || []).length;
// Comments go first: one that mentions "<details>" or "</dialog>" would
// start or end a match and skew every count below.
const helpHtml = html.replace(/<!--[\s\S]*?-->/g, ' ');
const modal = (helpHtml.match(/<(dialog|div|section)\b[^>]*\bid="info-modal"[^>]*>[\s\S]*?<\/\1>/i) || [])[0];
if (modal) {
  const h3 = [...modal.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)].map((m) => strip(m[1]).replace(/\s+/g, ' ').trim());
  const idx = h3.map((t) => SECTIONS.findIndex((x) => x.toLowerCase() === t.toLowerCase()));
  check('Help', 'help modal: only the four sections, in order — kit 1.0.0',
    h3.length > 0 && idx.every((n, i) => n >= 0 && (i === 0 || n > idx[i - 1])), h3.join(' · '));
  const details = [...modal.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/gi)];
  const visible = modal.replace(/<details\b[^>]*>([\s\S]*?)<\/details>/gi, (m, inner) => (inner.match(/<summary\b[^>]*>[\s\S]*?<\/summary>/i) || [''])[0]);
  const vw = words(strip(visible));
  check('Help', 'help modal ≤ 200 always-visible words (target 150) — kit 1.0.0', vw <= 200, `${vw} words`, vw > 150 && vw <= 200, true);
  const dw = details.map((m) => words(strip(m[1])));
  check('Help', 'help modal: ≤ 2 <details>, ≤ 80 words each — kit 1.0.0', dw.length <= 2 && dw.every((n) => n <= 80),
    dw.length ? `${dw.length} × [${dw.join(', ')}] words` : 'none', false, true);
} else {
  na('Help', 'help modal checks', 'no #info-modal in the page');
}
const readmePath = readmeArg || join(repo, 'README.md');
if (readmeArg === 'none') {
  na('Help', 'README checks', '--readme none');
} else if (existsSync(readmePath)) {
  const md = readFileSync(readmePath, 'utf8');
  const prose = md.replace(/```[\s\S]*?```/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
    .split('\n').filter((l) => !/^\s*\|/.test(l)).join('\n')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, ' ').replace(/^#+\s*/gm, '');
  const pw = words(prose);
  check('Help', 'README ≤ 250 prose words (tables, code not counted) — kit 1.0.0', pw <= 250, `${pw} words`, false, true);
  const README_H2 = ['Run it', 'Deploy', 'URL parameters', 'Data', 'Tests', 'Kit'];
  const h1 = (md.replace(/```[\s\S]*?```/g, '').match(/^#\s+\S.*$/gm) || []).length;
  const h2 = [...md.replace(/```[\s\S]*?```/g, '').matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1]);
  const hi = h2.map((t) => README_H2.findIndex((x) => x.toLowerCase() === t.toLowerCase()));
  const required = ['Run it', 'Data', 'Kit'].every((x) => h2.some((t) => t.toLowerCase() === x.toLowerCase()));
  check('Help', 'README headings: one #, then ## Run it · Deploy · URL parameters · Data · Tests · Kit, in order, none other — kit 1.0.0',
    h1 === 1 && required && hi.every((n, i) => n >= 0 && (i === 0 || n > hi[i - 1])), h2.join(' · ') || 'no ## headings');
} else {
  na('Help', 'README checks', `no ${readmePath}`);
}

/* 5. Maps */
if (isMap) {
  check('Maps', 'basemap failure handled (MCO.map.watchBasemap) — kit 0.8.0', /watchBasemap\(/.test(js));
  const htmlSinks = (js.match(/\.setHTML\(|\.innerHTML\s*=\s*`[^`]*\$\{|\.innerHTML\s*\+?=\s*[^;`'"]*\+/g) || []).length;
  check('Maps', 'no setHTML / innerHTML built from values (DOM popups) — HOUSE-STYLE §7', htmlSinks === 0, `${htmlSinks} sinks`);
  check('Maps', 'selection halo uses --selection-ring', /--selection-ring/.test(all));
  check('Maps', 'MCO.map.addNavigation (no compass; top-left by default, kit 1.0.0)', /MCO\.map\.addNavigation\(/.test(js) && !/showCompass:\s*true/.test(js));
  check('Maps', 'zoom floor installed', /installZoomFloor\(/.test(js));
  // Kit 1.0.0: the one-state station panel and the right-hand rail.
  if (/class="[^"]*\bmco-sheet\b/.test(html)) {
    check('Maps', 'station panel: a [data-close-sheet] button in .mco-sheet-head — kit 1.0.0', /data-close-sheet/.test(html));
    check('Maps', "station panel: no grip, data-peek or open('peek') — kit 1.0.0",
      !/mco-sheet-grip|data-peek|\.open\(\s*['"]peek['"]|setState\(\s*['"]peek['"]/.test(html + js));
  }
  if (/data-rail/.test(html)) {
    check('Maps', 'no app CSS for a left rail (rail-inset on the left) — kit 1.0.0', !/padding-left:\s*var\(--rail-inset|left:\s*var\(--rail-inset/.test(css));
  }
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
  const mark = r.ok === null ? '–' : r.ok ? (r.warn ? '⚠' : '✓') : '✗';
  console.log(`  ${mark} ${r.label}${r.detail && (r.ok !== true || r.warn || r.show) ? ` (${r.detail})` : ''}`);
}
const scored = results.filter((r) => r.ok !== null);
const pass = scored.filter((r) => r.ok).length;
console.log(`\nconformance: ${pass}/${scored.length} automatic — ${htmlPath}`);
console.log('Manual (CONFORMANCE.md): touch targets · steppers keyboard-operable · layer order · ' +
  'replace-vs-push behavior · axe 1440 + 390 in 3 themes · keyboard probes');
