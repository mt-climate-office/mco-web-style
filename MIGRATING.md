# Migrating an app to mco-web-style

The playbook for converting an existing MCO web app into a kit consumer,
written for a session starting **fresh in the consumer's repo** with no other
context. Proven end-to-end on mesonet-status (2026-08;
<https://github.com/mt-climate-office/mesonet-status> — read its `index.html`
+ `app.js` as the completed reference, and its migration commit message for
the decision-record format).

Read order: this file → [HOUSE-STYLE.md](HOUSE-STYLE.md) (the rules) →
[CONSUMERS.md](CONSUMERS.md) (your app's row — per-app intel lives there) →
`exemplar/` (a from-scratch consumer; migrations look like it when done).

Every bare path in this file (`snippets/…`, `tools/…`) lives in the
**mco-web-style repo** — clone it as a sibling of the app
(`git clone git@github.com:mt-climate-office/mco-web-style.git`), or read the
files on GitHub at the current tag. The current release version and its SRI
hash table are in the kit README (§ "SRI hashes"); pin exactly that version.

## The process

1. **Build a conflict matrix.** For every element the app and the kit both
   have (tokens, CSS blocks, JS utilities, head boilerplate, conventions),
   record app-value vs kit-value and classify: `IDENTICAL` (delete the app
   copy), `DRIFT` (decision needed), `KIT-NEW` (adoption decision),
   `APP-SPECIFIC` (keep, untouched). Be exhaustive — the matrix is the
   migration.
2. **Resolve every DRIFT / KIT-NEW with Kyle** using the three-way framework
   he designed: **(1) adopt kit · (2) app overrides** (mark it
   `/* kit-override: <why> */`) **· (3) back-port to kit**. He expects to be
   asked; batch the questions (≈4 per round), each shaped like:
   > *Legend blur: app 12px vs kit 16px. Recommend adopt kit (consistency).
   > (1) adopt kit · (2) app overrides · (3) back-port 12px to kit?*
   Include a recommendation on every question. The precedents below are
   already settled — don't re-ask those. Pure-WCAG fixes and byte-identical
   deletions need no questions at all.
3. **Kit changes ship first.** Any option-3 back-ports land in the kit,
   released per the AGENTS.md checklist (SemVer; new SRI hashes), **before**
   the app pins the new tag. Never point an app at unreleased kit code.
4. **Migrate** (technical steps below).
5. **Verify** (recipe below) — all of it, before any push.
6. **Deploy gate.** Check how the repo deploys before touching git: most MCO
   apps publish GitHub Pages from `main` (root or `/docs`), some behind a
   reverse proxy on climate.umt.edu domains — **pushing main IS a production
   deploy**. Present verification results and get an explicit OK first.
7. **Close out**: move the app's row to “Migrated” in CONSUMERS.md (kit repo
   commit), and put the full decision table in the app's migration commit
   message.

## Settled precedents (2026-08, mesonet-status review — don't re-litigate)

- **Mountain Time** for all user-facing stamps (`MCO.formatStampMT`,
  `formatDateMT`, `hhmmNowMT`) — never viewer-local.
- Adopt the kit token semantics: `--ctrl-border` for interactive edges,
  `--accent-line` for borders/lines/text-on-surface, `--text-on-accent` for
  text over accent fills, kit `--text-dim`. Kit values win over drifted app
  copies.
- Adopt **high-contrast** (URL/localStorage only — no new UI) and the kit
  anti-flash snippet (validated, throw-safe, HC-aware).
- Add the **meta CSP** (explorer pattern) with the app's JS extracted to an
  external `app.js` (classic script; the kit globals need no modules).
- Map apps: adopt **hillshade** (`MCO.map.addHillshade`, first in
  `addCustomLayers`) and the **county layer** where they fit the app's
  purpose (ask if unclear), and always hide the CARTO basemap's own
  `boundary_county` (HOUSE-STYLE §7).
- The ≤750px **brand collapse to the logo badge** is the kit default as of
  v0.4.0 (title + subtitle + divider, visually hidden so the `<h1>` outline
  survives). Opting out is per-app and takes two rules — see HOUSE-STYLE §3.
  mesonet-status opted out ("branding at all widths") and must extend its
  override when it bumps past 0.3.1.
- Toast 2800 ms · `showCompass: false` · toast/tooltip/modal/navbar move to
  kit selectors per the CONSUMERS.md selector map.
- WCAG checklist items (skip link + `<main id="main" tabindex="-1">`,
  `?kbd=off` for single-char shortcuts, sr-only table twin for canvas data,
  live `MCO.reducedMotion()` gates, removal of `outline: none` focus kills,
  throw-safe `MCO.lsGet`, persisted-state re-validation) are pre-authorized —
  apply without asking.

## Technical steps

**Head/markup** (`index.html`):
- `viewport-fit=cover` in the viewport meta (or the kit's safe-area padding
  is inert).
- Meta CSP: copy the shape from **mesonet-status** (a real consumer — the
  exemplar's CSP deliberately lacks `cdn.jsdelivr.net` because it loads the
  kit from relative paths, so it is NOT a consumer template); enumerate the
  app's real endpoints (`connect-src`: its APIs + basemap hosts +
  `https://s3.amazonaws.com` for hillshade; `img-src`: any image CDNs).
  ⚠️ **The `sha256-…` in any copied CSP is that page's hash, not yours** — it
  covers the exact bytes of the inline script as pasted, indentation
  included. Always recompute with the recipe below; never ship a copied hash.
- Replace the app's anti-flash block with `snippets/anti-flash.html`.
- Kit tags: theme CSS in `<head>`, `core`/`map` JS before `app.js` — pinned
  URLs + SRI from the README hash table. Add SRI + `crossorigin` to the
  MapLibre tags while you're there (hashes in `snippets/head.html`).
- Delete CSS the kit now owns (tokens, reset/`.sr-only`/focus/reduced-motion,
  control polish, navbar family, toast/tooltip/modal shells, z-index
  literals → ladder vars). Keep app-specific CSS; swap raw hexes/fonts for
  tokens (`--font-mono`, `--text-on-accent`, …) except data-palette colors
  (app-owned per HOUSE-STYLE §6 — with contrast comments per §5.10).
- **Keep element ids; ADD kit classes** (`<header id="navbar"
  class="mco-navbar">`) — app JS and tests hook the ids.
- Skip link first in `<body>`; wrap the app surface in
  `<main id="main" tabindex="-1">`; add the sr-only `<table>` twin.

**JS** (extract inline module → classic-IIFE `app.js`), swapping duplicates
for kit calls:

| App had | Use instead |
|---|---|
| `lsSet` / raw `localStorage.getItem` | `MCO.lsSet` / `MCO.lsGet` (throw-safe) |
| `showToast` + `#toast` element | `MCO.showToast` (drop the element) |
| `escapeHTML` | `MCO.escapeHTML` |
| `basemapStyleUrl()` | `MCO.map.cartoStyleUrl()` (fixes the `=== 'dark'` HC bug) |
| theme button wiring / `syncThemeIcons` | `MCO.initThemeToggle` (restyle map in `onChange`) |
| info-modal wiring | `MCO.initInfoModal`; write the seen-key **at open**; suppress auto-open over deep links |
| camera-from-URL / `MT_FIT_BOUNDS` / fit button / zoom snapback | `MCO.map.initialCamera` / `MT_FIT_BOUNDS` / `addFitControl` / `installZoomFloor` |
| `pushState` camera precision | `MCO.map.cameraParams` + `MCO.replaceUrlState` (elide params at defaults) |
| overlay paint fns + label shortenings | `MCO.map.overlayPaints()` + `TRIBAL_LABEL_LAYOUT` |
| boot-snapshot `reduceMotion` | `MCO.reducedMotion()` at each animation site (live) |
| raw `fetch` polling | `MCO.fetchJSON(url, { cache: 'no-store' })` |
| legend/panel collapse | `MCO.initCollapsible` — see the persistence gotcha below |
| local time formatting | MT helpers (`MCO.formatStampMT` …) |

## Gotchas (each of these cost time on mesonet-status)

- **CSP hash on a full page**: the README's `awk` recipe is ONLY for the
  standalone snippet file — on a real page it drops the leading newline and
  yields a wrong hash. Hash exactly the **first inline `<script>` element's
  contents of your own index.html**:
  ```sh
  python3 -c "
  import base64,hashlib,re,sys
  h=open('index.html').read()
  s=re.search(r'<script>(.*?)</script>',h,re.S).group(1)
  print('sha256-'+base64.b64encode(hashlib.sha256(s.encode()).digest()).decode())"
  ```
- **MapLibre 6 `worker-src` needs `blob:` AND `https://unpkg.com`** (kit
  0.8.0+). The worker starts from a `blob:` URL and then `import`s
  `maplibre-gl-worker.mjs` from unpkg, and a module worker's imports are checked
  against `worker-src`. MapLibre's own migration guide says `blob:` alone.
  Get it wrong and the basemap draws but no GeoJSON layer ever does, and the
  console says only "Worker failed to load. Check that the worker URL is
  correct", with no "Refused to…" line.
- **MapLibre paints can't read CSS variables** — resolve tokens with
  `getComputedStyle(document.documentElement).getPropertyValue('--x')`,
  after the kit stylesheet has loaded.
- **`connect-src` needs every scheme MapLibre *fetches*, not just hosts.**
  MapLibre loads an `image` source's `url` through `fetch()`, so a page that
  feeds canvas-generated photos/rasters to `addSource`/`updateImage` needs
  `data:` (or `blob:`) in **`connect-src`** — `img-src` does not cover it. Get
  this wrong and the layer silently never paints while the console fills with
  "Refused to connect". Cost the photos migration a full verify cycle.
- **Vendor the logo BEFORE writing the CSP.** A hot-linked
  `climate.umt.edu` logo dies the moment `img-src` is enumerated — including
  inside a canvas PNG export, where the failure is a missing card rather than a
  console error.
- **`img-src` cannot be enumerated from the markup alone.** Image URLs that
  arrive in an API *response* never appear in `index.html`, so reading the page
  will not find them — the maintenance map's visit photos are AirTable
  attachments on `*.airtableusercontent.com`, and the first cut of its CSP
  allowed only `'self' data: blob:`. Every thumbnail died silently: a CSS
  `background-image` that is blocked renders as an empty box, not an error.
  **Grep the app's own fetched data for `http` before writing `img-src`**, and
  assert in the verify run that the images actually load (count responses from
  the host; a zero is the bug).
- **The kit's tooltip does not style every line an app emits.** `.mco-tooltip`
  covers `.tooltip-name`, `.tooltip-sub` and `.tooltip-val` — where `-val` is a
  monospace accent *value* ("42°F"). An app with a prose status line
  (`.tooltip-line`) or a relative-time line (`.tooltip-rel`) must keep those
  rules locally, scoped under `.mco-tooltip`. Deleting the app's whole tooltip
  block as "kit-owned" drops their `display: block` and collapses the tooltip
  onto one row. Same trap as the palette tokens above: **kit-owned is a
  per-selector fact, not a per-section one** — diff the class names the app
  actually emits against the ones the kit actually styles.
- **`initCollapsible` persists `'1'`/`'0'`** — if the app previously stored
  other encodings (status used `'collapsed'`/`'expanded'`), map legacy values
  into `startCollapsed` so returning users keep their state.
- **CARTO draws its own dashed county boundaries** (`boundary_county`, z9+,
  pale orange on Positron) — hide it in `addCustomLayers()` if you draw
  counties.
- **html-validate flags ARIA comboboxes** (`prefer-native-element`) — for a
  deliberate WAI-ARIA listbox, add a single-line
  `<!-- [html-validate-disable-next prefer-native-element] -->` directly
  above the element (multi-line directives don't parse), with a
  justification comment.
- **jsDelivr tag propagation** takes a few minutes after `git push origin
  vX.Y.Z` — curl-retry the URL, then byte-verify against `tools/sri.sh`.
- Every-30s repaint ticks rebuild the sr-table too — that's fine (silent for
  AT); don't wire announcements to the tick or it gets chatty.
- localStorage keys must be `mco-<app>-*`; fix unprefixed legacy keys with a
  read-old/write-new shim.
- **"Console clean" needs a justified noise allowlist, not a lowered bar.** The
  verify server is static, so an app whose API lives elsewhere (a FastAPI
  backend, a proxied endpoint) will 404 by design and fail the check for the
  wrong reason. Filter those — but **prove each one is pre-existing first**:
  extract the app's pre-migration page (`git archive HEAD <dir> | tar -x -C
  <tmp>`), point the same harness at it, and confirm the message appears there
  too. Anything that appears only after the migration is yours. Never filter a
  CSP violation; that is the check's entire purpose.
- **The theme's own tokens are not the app's data colors.** Deleting the inline
  token block also deletes any app-specific semantic colors that lived in it
  (status ramps, warning tints, marker colors) — the kit deliberately does not
  own those (HOUSE-STYLE §6). Diff the token names the app still *uses* against
  the ones the kit *defines* and re-declare the remainder locally, per theme —
  including **high-contrast**, which the app almost certainly never had values
  for. Two silent regressions on the UMRB status map (an amber banner that lost
  its tint, a station swatch that lost its color) came from exactly this.

## Verification recipe (all before any push)

The consumer repo has **no CI** — every gate here is manual. Install the
tooling ephemerally and keep it out of git (most MCO app repos do NOT ignore
`node_modules/`): `npm init -y && npm i --no-save playwright
@axe-core/playwright && npx playwright install chromium`, and add
`node_modules/`, `package.json`, `package-lock.json` to the app's
`.gitignore` if absent.

- `node --check app.js` · `npx --yes html-validate@9 index.html`.
- **Run `tools/verify/` from a kit checkout against the app** (0.9.0, see
  [tools/verify/README.md](tools/verify/README.md)). Nothing is copied into the
  app; a small `verify.config.mjs` (page path, since some apps serve from
  `/docs/`, plus scenarios with render evidence and storage seeds) is all it
  needs. It covers the baseline:
  - `head.mjs`: pin + SRI, CSP hashes (import map included), anti-flash order,
    skip link, `<main>`, focus kills, storage keys. Static, no browser.
  - `axe-matrix.mjs`: **axe 0 serious/critical** and **console + CSP clean**
    in all three themes at **1440 and 390 touch**, plus touch targets at 390.
    A render-evidence wait (e.g. sr-table row count), never `networkidle`.
  - `keyboard.mjs`: the skip link, a ring on every Tab stop, dialog Esc and
    focus return, `?kbd=off` for each shortcut, plus app probes.
  - `lint-css.mjs`: drift counts, including untagged kit-overrides.

  What stays app-specific, as `probes` in the config or by hand:
  - The URL param matrix: every param honored on load and re-emitted,
    defaults elided, deep links suppress the intro modal, `?kbd=off` sticks.
  - Legacy localStorage shims honored at boot.
  - Side-by-side screenshots vs the live production page. Enumerate the
    expected deltas; anything else is a regression.
- **Run the app's own automation against the migrated page.** If the repo has
  jobs that drive the page headlessly (photo-explorer's preview generator
  clicks `#btn-export` via `?export=`; others may screenshot or scrape),
  their selectors, timing, and URL params are part of the app's contract — a
  CSP or markup change can break them silently in production. Execute them
  locally before the deploy gate.
- Post-deploy: poll until a **file new to this migration** (e.g. `app.js`)
  returns 200 on the live URL, then repeat the console + axe pass against
  production.

## Re-pointing an existing consumer: 0.6.x → 0.7.0

0.7.0 is about first paint. Every consumer on 0.6.0 loaded Google Fonts with
`display=swap` (so the title painted in the system font and then jumped), and
`.is-compact` could land after first paint. Per app, in its HTML entry file:

1. Kit tags `@0.6.0` → `@0.7.0`, with the hashes from the README table.
2. Replace the three Google Fonts lines (two `preconnect` + the `css2`
   stylesheet) with the two font `preload` lines from `snippets/head.html`.
3. CSP: drop `https://fonts.googleapis.com` from `style-src`; `font-src`
   becomes `https://cdn.jsdelivr.net` (was `https://fonts.gstatic.com`).
4. Replace the inline anti-flash script with the new
   `snippets/anti-flash.html` body, **then recompute this page's sha256**
   (python recipe under Gotchas) and swap it into `script-src`. A stale hash
   blocks the script: the page renders in the stylesheet's default (dark)
   theme and the only sign is a CSP console error, which the verify pass below
   catches.
5. If the app self-hosted the fonts or carried a local override of the ≤750px
   `.brand` collapse for a lockup outside the navbar, delete them (both are
   the kit's now).

Verify as below, plus: `document.fonts` reports Outfit and Space Mono
`loaded`, their `performance` entries come from `cdn.jsdelivr.net`, and
`document.documentElement.classList` has the right `is-compact`/`is-touch`
before `mco-core.js` runs (block it in the harness to check).

### 0.7.0 → 0.7.1

Tags `@0.7.0` → `@0.7.1` everywhere (the two font preloads too) and the new
`mco-theme.css` hash; nothing else in `<head>` changes. Then grep the app's
own CSS for `'Outfit'` / `'Space Mono'` in `font-family`/`font` and switch
them to `var(--font-ui)` / `var(--font-mono)` — the metric-matched fallback
only reaches text styled through the tokens.

## Re-pointing an existing consumer: 0.7.x → 0.8.0

0.8.0 is the largest release yet. It moves to **MapLibre 6** for the
critical attribution-control XSS (GHSA-jrc7-96c5-q579, fixed only in 6.4.1+),
and absorbs the code six consumers had each hand-rolled. Do it in two passes,
as with 0.7.0. **Pass 1 is required and mechanical**; pass 2 deletes local
copies one feature at a time, each verified on its own. Score the app with
`node tools/conformance.mjs <repo>` before and after, and record the number in
CONSUMERS.md.

**Pass 1 — the bump (map apps: also MapLibre 6)**
1. Kit tags `@0.7.1` → `@0.8.0` everywhere (font preloads too), with the
   README hashes. Non-map apps stop here and go to pass 2.
2. Delete the two MapLibre 5 tags (`maplibre-gl@5.x` css + js). From
   `snippets/head.html` paste the **one-line import map**, the two
   `modulepreload`s and the 6.11.2 CSS link into `<head>`, before any module
   script. Copy the import map byte for byte: its CSP hash depends on it.
3. CSP: add the import map hash
   `'sha256-NgHBdw+Nl6S2kTHNyvv5uFwHfytmfDJR39Y9qVPt/UI='` to `script-src`,
   and make `worker-src` **`blob: https://unpkg.com`** (Gotchas).
4. Map construction waits for the library:
   `MCO.map.loadMapLibre().then(initMap, onLibraryFail)`. Wire the rest of
   the UI before it. Code that ran at the top level and touched `maplibregl`
   moves inside `initMap`. snowpack's `app.js` is an ES module, so it can also
   `await MCO.map.loadMapLibre()`.
5. MapLibre 6 behavior changes to check in the app:
   - WebGL2 is required (`GPUInitializationError` otherwise).
   - Nested GeoJSON properties now arrive as objects, so a `JSON.parse` of
     one now throws.
   - `styleimagemissing` can no longer supply the image; use
     `map.setMissingStyleImageResolver`.
   - The `zoomLevelsToOverscale` default changes rendering and
     `queryRenderedFeatures` results slightly.
   - `GeoJSONSource.setData` no longer returns the source, so don't chain
     on it.
   Grep for each.
6. Verify (below) with the CSP live: the map must draw its **data**, not just
   the basemap. A worker blocked by CSP leaves the basemap up and nothing on
   it.

**Pass 2 — delete what the kit now owns** (each is its own commit + verify)
- `#sr-announce` + its helpers → `MCO.announce`. Where a toast repeats an
  announcement: `MCO.showToast(msg, ms, {announce: false})` (snowpack).
- Hand-built sr tables → `MCO.srTable` (snowpack: its first twin, the HUC
  zones).
- Search comboboxes and their ~90 lines of CSS → `MCO.initSearchBox` +
  `.mco-search` (explorer, status, photos, maint, umrb).
- Legend rows → `.mco-legend-row` + `MCO.initLegendToggles`. This **fixes
  the 1.4.3 legend failure in status, maint and umrb** (`.legend-row.off {
  opacity }`).
- Tooltip dispatchers → `MCO.map.initCursorTooltip`.
- `osTheme` / `atDefaultExtent` → `MCO.osTheme` /
  `MCO.map.cameraParamsIfDefault`. Rename `pushState()` wrappers to what
  they are (`writeUrl`), and use `MCO.pushUrlState` for station-open
  drill-down (HOUSE-STYLE §4).
- Every map: `MCO.map.watchBasemap(map)`, and re-add layers on every
  `style.load`, not once.
- Popup `setHTML` → `popup.setDOMContent(MCO.map.popupContent(…))`. Delete
  the local popup-shell CSS (status's `!important` block; maint and umrb's
  identical blocks). **maint: fix the raw `p.thumb` in a `style=` string
  first.** It is attribute injection from an API response.
- `--c-warn` / `--warn-bg` → `--warning` / `--warning-fill`. `#data-banner` /
  error cards → `MCO.notice` / `.mco-empty` (maint, umrb, explorer).
- `color: #fff` on `--accent` → `.nav-btn.is-primary` (explorer `#scale-apply`).
- explorer: `#sidebar-scrim` → `.mco-scrim[data-scope="container"]`. Also
  delete the two 0.8.0-tagged kit-overrides: attribution underline and
  long-modal header/shade.
- A local copy of `installZoomFloor`'s guards (explorer) → the kit's; app
  policy moves into `onBeforeSnap`.

## Kit-deferred pieces (keep app-local; do NOT extract)

Branded PNG export and a `charts/` palettes module are known duplication that
the kit has **deliberately not absorbed yet** (each needs a design pass across
its divergent app implementations first). Leave the app's versions in place,
swapping only their internals onto kit helpers where trivial (e.g. the logo
asset, MT time). If a migration makes one of these converge naturally, propose
it as a kit MINOR — that's the intended path to absorption.

**The search combobox left this list on 2026-08-16** — the worked example of
that path. Two consumers (the UMRB build-status and station-maintenance maps)
ended up with keyboard handling that differed only in whitespace and a
`showSearchDropdown` that differed in exactly two lines, both of which were
the per-row render. That is what "converged naturally" looks like. It shipped
in **0.8.0** as `MCO.initSearchBox({… renderRow …})`, on the dashboard's
model, with the legend toggles, the table twin, the cursor tooltip and the
clean-URL pair. Delete the local copies when you re-point.
