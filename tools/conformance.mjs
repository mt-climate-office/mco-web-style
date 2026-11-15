#!/usr/bin/env node
/* Consumer conformance check — the automatable half of CONFORMANCE.md.
   Static: reads a consumer's entry HTML and the scripts it loads from the
   same repo; never runs the app or fetches anything. Run from this repo:

     node tools/conformance.mjs ../mesonet-status            # index.html
     node tools/conformance.mjs ../mesonet-photo-explorer    # docs/index.html when there is no index.html
     node tools/conformance.mjs ../mesonet-status --readme ../mesonet-status/README.md

   --readme <path> picks the README the Help checks read; the default is the
   repo's README.md, when there is one. --readme none skips them (the kit's
   own demo and exemplar, whose README is the kit's).

   Prints one line per check (✓ / ✗ / – not applicable) and "N/M automatic",
   the number CONSUMERS.md records per app. The code-style checks print ⚠
   when they fail and are not in that number. Manual items are listed after;
   they are CONFORMANCE.md's job. Exit code is always 0: this measures, the
   verify pass gates. Zero dependencies. */
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

const argv = process.argv.slice(2);
const ri = argv.indexOf('--readme');
const readmeArg = ri >= 0 ? argv.splice(ri, 2)[1] : null;
const [repo, pageArg] = argv;
if (!repo) { console.error('usage: node tools/conformance.mjs <consumer-repo> [entry.html]'); process.exit(2); }
// The entry page: index.html, or docs/index.html for a Pages site served from docs/.
const page = pageArg || (existsSync(join(repo, 'index.html')) || !existsSync(join(repo, 'docs/index.html')) ? 'index.html' : 'docs/index.html');
const htmlPath = join(repo, page);
const html = readFileSync(htmlPath, 'utf8');
// App scripts: local <script src> files (not CDN), read alongside the page.
const scripts = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1])
  .filter((s) => !/^https?:/.test(s))
  .map((s) => join(dirname(htmlPath), s.split('?')[0]))
  .filter((p) => existsSync(p));
const js = scripts.map((p) => readFileSync(p, 'utf8')).join('\n');
// The app's own scripts: a page served from the kit repo loads the kit locally.
const KIT_SCRIPT = /(?:^|\/)(?:mco-(?:core|map|palette|photos|places|summary)|cog-protocol)\.js$/;
const appScripts = scripts.filter((p) => !KIT_SCRIPT.test(p));
const appJs = appScripts.map((p) => readFileSync(p, 'utf8')).join('\n');
// App CSS: inline <style>, plus local stylesheets other than the kit theme.
const cssFiles = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)]
  .map((m) => (m[0].match(/\bhref="([^"]+)"/) || [])[1])
  .filter((h) => h && !/^https?:/.test(h) && !/mco-theme\.css/.test(h))
  .map((h) => join(dirname(htmlPath), h.split('?')[0]))
  .filter((p) => existsSync(p));
const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1])
  .concat(cssFiles.map((p) => readFileSync(p, 'utf8'))).join('\n');
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
const shortcuts = /kbd=off|'kbd'|"kbd"/.test(appJs);
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
      !/mco-sheet-grip|data-peek|\.open\(\s*['"]peek['"]|setState\(\s*['"]peek['"]/.test(html + appJs));
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
// Keys held in one STORAGE object (CODE-STYLE.md) count too.
const storageObj = (js.match(/\bSTORAGE\s*=\s*\{([^}]*)\}/) || [])[1] || '';
keys.push(...[...storageObj.matchAll(/:\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1]));
const badKeys = keys.filter((k) => k !== 'mco-theme' && !/^mco-[a-z0-9]+(-[a-z0-9]+)*-/.test(k));
check('URL', 'storage keys app-prefixed (mco-<app>-*)', badKeys.length === 0, badKeys.join(', '));

/* 6b. One Mesonet origin (HOUSE-STYLE §4, 2026-11-14). An app that reaches a
   Mesonet host declares MESONET_ORIGIN, and no shipped code links the old
   forms on mesonet.climate.umt.edu. The app's own canonical and og:/twitter:
   address is allowed; comments are not code. */
const noComments = (t) => t.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/.*$/gm, '$1');
const shipped = noComments(html.replace(/<(link|meta)\b[^>]*(?:rel="canonical"|property="og:|name="twitter:)[^>]*>/gi, ' ')) + '\n' + noComments(js);
const usesMesonet = /mesonet2?\.climate\.umt\.edu/.test(shipped) || /\bMESONET_ORIGIN\b/.test(js);
if (usesMesonet) {
  check('URL', 'one MESONET_ORIGIN constant in the app script — HOUSE-STYLE §4', /\b(?:const|let|var)\s+MESONET_ORIGIN\s*=/.test(js));
  const old = [...new Set(shipped.match(/mesonet\.climate\.umt\.edu\/(?:dash|api)[^\s'"`<)]*/g) || [])];
  check('URL', 'no mesonet.climate.umt.edu/dash or /api links in shipped code — HOUSE-STYLE §4', old.length === 0, old.slice(0, 3).join(', '));
} else {
  na('URL', 'MESONET_ORIGIN checks', 'no Mesonet host in the app');
}

/* 7. Code style (CODE-STYLE.md). Advisory: shown as ⚠ and left out of the
   score until the apps are refactored to the style. */
const advise = (label, ok, detail = '') => results.push({ section: 'Code style (advisory)', label, ok, detail, advisory: true });
const STYLE_SECTIONS = ['Header', 'Config', 'State', 'Utilities', 'URL', 'Data', 'Map', 'Legend',
  'Panel', 'Search', 'Controls', 'Export', 'Table', 'Refresh', 'Boot'];

// Comment text of JS source. Strings, templates and regex literals are
// skipped, so a URL's "//" is not a comment.
function jsComments(src) {
  const out = [];
  let i = 0;
  let prev = '';
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      const end = src.indexOf('\n', i);
      const stop = end < 0 ? src.length : end;
      out.push(src.slice(i + 2, stop));
      i = stop;
    } else if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end;
      out.push(src.slice(i + 2, stop));
      i = stop + 2;
    } else if (c === '"' || c === "'" || c === '`' || (c === '/' && /^$|[(,=:[!&|?{};+\-*%<>~^]$/.test(prev))) {
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === '\\') i++;
        else if (c !== '`' && src[i] === '\n') break;
        i++;
      }
      i++;
      prev = c;
    } else {
      if (!/\s/.test(c)) prev = c;
      i++;
    }
  }
  return out;
}
const cssComments = (src) => [...src.matchAll(/\/\*([\s\S]*?)\*\//g)].map((m) => m[1]);

if (appScripts.length) {
  const banners = [...appJs.matchAll(/^[ \t]*\/\/ ── (.+?) ─/gm)].map((m) => m[1].trim());
  const idx = banners.map((b) => STYLE_SECTIONS.indexOf(b));
  const unknown = banners.filter((b, i) => idx[i] < 0);
  const outOfOrder = banners.filter((b, i) => idx[i] >= 0 && i > 0 && idx[i] <= Math.max(...idx.slice(0, i)));
  advise('section banners: the fixed names, in the fixed order (missing ones allowed)',
    banners.length > 0 && unknown.length === 0 && outOfOrder.length === 0,
    !banners.length ? 'no "// ── Name ──" banners'
      : [unknown.length && `not a section: ${unknown.slice(0, 4).join(', ')}`, outOfOrder.length && `out of order: ${outOfOrder.slice(0, 4).join(', ')}`].filter(Boolean).join('; '));
}
// History belongs in git and the changelog. A WCAG criterion or a § number is
// not a version.
const HISTORY = [
  [/(?<!WCAG |SC |§|\d\.|[\w@-])v?\d+\.\d+\.\d+(?![\d.])/, 'version'],
  [/\b20\d\d-\d\d(?:-\d\d)?\b/, 'date'],
  [/\bno longer\b/i, '"no longer"'],
  [/\bused to\b/i, '"used to"'],
];
const comments = [...jsComments(appJs), ...cssComments(css)];
const hits = [];
for (const text of comments) {
  for (const [re, what] of HISTORY) {
    const m = text.match(re);
    if (m) hits.push(`${what}: "${text.slice(Math.max(0, m.index - 20), m.index + 30).replace(/\s+/g, ' ').trim()}"`);
  }
}
advise('no history in comments (versions, dates, "no longer", "used to")', hits.length === 0,
  hits.length ? `${hits.length}: ${hits.slice(0, 3).join(' · ')}` : '');
advise('app CSS in app.css beside the page', existsSync(join(dirname(htmlPath), 'app.css')));

/* Report */
let section = '';
for (const r of results) {
  if (r.section !== section) { section = r.section; console.log(`\n${section}`); }
  const mark = r.ok === null ? '–' : r.ok ? (r.warn ? '⚠' : '✓') : r.advisory ? '⚠' : '✗';
  console.log(`  ${mark} ${r.label}${r.detail && (r.ok !== true || r.warn || r.show) ? ` (${r.detail})` : ''}`);
}
const scored = results.filter((r) => r.ok !== null && !r.advisory);
const pass = scored.filter((r) => r.ok).length;
const advisory = results.filter((r) => r.advisory);
console.log(`\nconformance: ${pass}/${scored.length} automatic — ${htmlPath}`);
console.log(`code style: ${advisory.filter((r) => r.ok).length}/${advisory.length} (advisory, not scored)`);
console.log('Manual (CONFORMANCE.md): touch targets · steppers keyboard-operable · layer order · ' +
  'replace-vs-push behavior · axe 1440 + 390 in 3 themes · keyboard probes');
