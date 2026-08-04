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

## Verification recipe (all before any push)

The consumer repo has **no CI** — every gate here is manual. Install the
tooling ephemerally and keep it out of git (most MCO app repos do NOT ignore
`node_modules/`): `npm init -y && npm i --no-save playwright
@axe-core/playwright && npx playwright install chromium`, and add
`node_modules/`, `package.json`, `package-lock.json` to the app's
`.gitignore` if absent.

- `node --check app.js` · `npx --yes html-validate@9 index.html`.
- **Copy `tools/consumer-verify.mjs` from the kit into the app repo**
  (untracked), fill in its CONFIG block (page path — note some apps serve
  from `/docs/`, so every URL gets that prefix — render-evidence check,
  app-specific URL-matrix assertions), and run it. It covers the baseline:
  - **Console clean in all three themes** — with the CSP live, any missed
    endpoint or blocked resource shows up here.
  - **axe: 0 serious/critical** in dark, light, high-contrast.
  - A render-evidence wait (e.g. sr-table row count) instead of `networkidle`.
  - URL param matrix: every param honored on load and re-emitted; defaults
    elided; deep links suppress the intro modal; `?kbd=off` gates and sticks.
  - Legacy localStorage shims honored at boot.
  - Compact viewport (390px) and any app-specific overrides.
  - Side-by-side screenshots vs the live production page — enumerate expected
    deltas; anything else is a regression.
- **Run the app's own automation against the migrated page.** If the repo has
  jobs that drive the page headlessly (photo-explorer's preview generator
  clicks `#btn-export` via `?export=`; others may screenshot or scrape),
  their selectors, timing, and URL params are part of the app's contract — a
  CSP or markup change can break them silently in production. Execute them
  locally before the deploy gate.
- Post-deploy: poll until a **file new to this migration** (e.g. `app.js`)
  returns 200 on the live URL, then repeat the console + axe pass against
  production.

## Kit-deferred pieces (keep app-local; do NOT extract)

Branded PNG export, search combobox, and a `charts/` palettes module are
known duplication that the kit has **deliberately not absorbed yet** (each
needs a design pass across its divergent app implementations first). Leave
the app's versions in place, swapping only their internals onto kit helpers
where trivial (e.g. the logo asset, MT time). If a migration makes one of
these converge naturally, propose it as a kit MINOR — that's the intended
path to absorption.
