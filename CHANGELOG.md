# Changelog

All notable changes to mco-web-style. Format follows
[Keep a Changelog](https://keepachangelog.com); versioning follows the SemVer
policy in README.md.

## [Unreleased]

### Fixed
- `tools/consumer-verify.mjs` wrote a 200 header before `readFile` could throw,
  so any request that 404s **by design** — an app whose API isn't running
  locally, a probe for an optional asset — killed the whole harness with
  `ERR_HTTP_HEADERS_SENT`. It reads first now. Found running the harness
  against the mesonet_app maps, whose station feed lives on a backend the
  static server doesn't have.

### Notes
- MIGRATING gained four gotchas from the mesonet_app migration, three of which
  share one root cause worth naming: **kit-owned is a per-selector fact, not a
  per-section one.** Deleting a whole CSS block on the assumption the kit
  replaced it silently dropped app-owned palette tokens, the `.tooltip-line` /
  `.tooltip-rel` classes, and (via a missing `mco-modal` class) the modal's
  entire positioning. The fourth: `img-src` cannot be enumerated from the
  markup, because image URLs that arrive in an API response never appear in
  the HTML.

### Planned for 0.7.0 — absorptions approved 2026-08-16
Agreed after auditing the two mesonet_app maps; each is code that now exists
byte-identically in two or more consumers. **Consumers land on @0.6.0 first**,
then re-point as a separate reviewed pass.

- **`MCO.osTheme()` + `MCO.map.cameraParamsIfDefault(map)`** — the clean-URL
  default-elision pair, currently identical in mesonet-status's UMRB map, the
  maintenance map, and mesonet-explorer (3 consumers). Shipping it as
  `cameraParamsIfDefault` rather than lifting `atDefaultExtent` verbatim
  collapses the check and the emit into one call, and retires the
  `MT_FIT_BOUNDS`/`FIT_OPTS` aliases that now exist only to feed it.
- **`MCO.map.initCursorTooltip({layers, render})`** — element, cursor+14
  positioning, `.visible` toggle, the mousemove→`queryRenderedFeatures`
  dispatcher, `cursor: pointer` and mouseleave cleanup. `render(feature)`
  returns `{name, sub, line}`. Also puts the `.tooltip-*` classes under the
  same owner as the CSS that styles them.
- **`MCO.initSearchBox({input, dropdown, items, renderRow, onSelect})`** —
  takes the search combobox **off** the kit-deferred list below. The two maps'
  keyboard handling differs only in whitespace; `showSearchDropdown` differs in
  exactly two lines, both of which are `renderRow`.
- **`MCO.initLegendToggles({rows, visible, onChange})`** — click-to-toggle,
  double-click-to-isolate, the click/dblclick timer, and the Shift+Enter
  keyboard equivalent. `renderLegend` stays app-specific.
- **`MCO.srTable({tbody, columns, rows})`** — the screen-reader twin of a
  WebGL canvas. Thin, and the point is codifying the pattern (one row per
  drawn feature, rebuilt from the same features, never wired to a live region)
  so the next map neither reinvents nor skips it.

## [0.6.0] — 2026-08-04

### Changed
- **Search now collapses at ≤640px, not ≤460px** (breaking default).
  `MCO.SEARCH_COLLAPSE_MQ` and the matching CSS block both move to the ladder's
  existing compact edge, rather than the collapse owning a fifth responsive
  number. Compact is exactly where an inline navbar field stops paying for
  itself.

  Why: at 460px a control-dense bar still wrapped to a third row. mesonet-status
  needed 514px of the 516px available at 532px — a 2px margin — so it broke to
  three rows across roughly 461–527px. Worse, its chip labels carry live station
  counts, so a count gaining a digit moved the wrap point: the bug drifted with
  the data. Collapsing at 640px frees the 160px field and leaves ~100px of slack
  instead of 2px, which removes the drift as well as the extra row.

  Deliberately width-only — unlike `MCO.viewport.COMPACT_MQ` there is no
  `max-height` clause, because a short landscape window is still wide enough for
  an inline field.

  **Consumer action:** none in markup or JS, but a consumer that documented
  "collapses below 460px" should update that copy, and any test asserting the
  inline field between 461–640px needs its expectation moved.

### Notes
- Recorded in HOUSE-STYLE §3: a control-dense bar still wraps on a phone even
  with search collapsed, and the sanctioned next step is relocating `.controls`
  into an off-canvas drawer (`.mco-scrim`, `--z-drawer`). mesonet-status is the
  natural first consumer; deferred as its own design pass.

## [0.5.1] — 2026-08-04

### Fixed
- **`.control-label` no longer strips its input's accessible name below 1400px.**
  The label shed at ≤1400px used `display: none`, which removes the element from
  the accessibility tree — so any control named only by a `.control-label`
  `<label for>` had **no accessible name at all** from 1400px down. It is now
  hidden visually (the `.sr-only` treatment) instead, so the name survives.
  Found on mesonet-photos in production: its date input and time select
  failed axe `label` / `select-name` at every width below 1400px, a bug that
  predated the kit and that a desktop-only axe run cannot see. `.btn-label` is
  unchanged — it sits inside its button, and the house rule already requires a
  permanent `aria-label` there.

  Lesson recorded in HOUSE-STYLE §3: **run axe at a narrow viewport too.**

## [0.5.0] — 2026-08-04

### Added
- **Collapsible search** — `.mco-search-collapse` / `.mco-search-toggle` +
  `MCO.initSearchCollapse({wrap, toggle, input, onClose})`. Below 460px
  (`MCO.SEARCH_COLLAPSE_MQ`) a navbar search field collapses into a disclosure
  button grouped with the other nav buttons and reopens as a full-width overlay
  bar under the navbar: focus moves into the field on open and back to the
  button on close, pointerdown outside dismisses, and widening past the
  breakpoint clears the state so `aria-expanded` can't go stale on a hidden
  toggle. The app keeps control of Esc precedence and of its own `/` shortcut.
  Admitted under the ≥2-property rule (mesonet-photos built it first;
  mesonet-status is the second consumer). The kit owns only the collapse — the
  search field and its combobox stay app-owned, and the inner selectors are
  generic (`input[type="search"]`, `kbd`) so app naming doesn't matter.

### Fixed
- **Brand lockup no longer squeezes at ≤1060px.** The divider's negative margin
  was hard-coded to `-0.35rem` to compose with the navbar's `0.75rem` gap
  (giving 0.4rem), but §6 tightens that gap to `0.5rem` at ≤1060px without
  adjusting the margin — collapsing logo ↔ divider ↔ title to 0.15rem. The gap
  is now a `--nav-gap` custom property and the margin derives from it
  (`calc(0.4rem - var(--nav-gap))`), so the 0.4rem rhythm holds at any gap.
  **Tighten navbar spacing via `--nav-gap`, not `gap`.**

## [0.4.0] — 2026-08-04

### Changed
- **Mobile brand collapse (breaking default).** At ≤750px the navbar now sheds
  the *whole* brand lockup — title, subtitle, and the lockup divider — leaving
  only the 40×40 logo badge. Previously only `.brand-subtitle` was hidden.
  At phone widths the controls need the room and the badge alone carries the
  identity.
  - The lockup is **visually** hidden (`position: absolute` + clip), not
    `display: none`, because `.brand-title` is often the page's `<h1>`: the
    document outline and the screen-reader app name survive the breakpoint.
  - **Consumer action:** apps that keep branding at all widths need a two-rule
    override now (restore `.brand`'s static position *and* the divider) — the
    snippet is in HOUSE-STYLE §3. A one-rule
    `.brand-subtitle { display: inline }` override no longer suffices;
    mesonet-status has exactly that and must extend it when it bumps.

  Bumped MINOR rather than MAJOR under pre-1.0 convention (0.x minors carry
  breaking changes). By the letter of the README policy table a default change
  is MAJOR — call it if you'd rather this be 1.0.0.

### Fixed
- Label-shed nav buttons are now square. Below 1400px `.btn-label` is hidden but
  `.nav-btn` kept its label-sized `padding: 6px 12px`, leaving the icon in a
  ~38×34 box that read as inconsistent beside the 34×34 `.icon-only` buttons in
  the same bar. A `.nav-btn` containing a `.btn-label` now collapses to the same
  square geometry (34px, 40px under `hover: none`). `.mco-btn-info` is
  deliberately untouched — its circle distinguishes it, and it carries no
  `.btn-label`. Uses `:has()`, so no consumer markup change is needed.
- `MCO.shiftDate` returned a date one day off for viewers at UTC+13/+14 and
  UTC−12. The noon anchor was right, but the result was formatted with
  `toISOString()`, re-projecting it to UTC; it now formats from local getters.
  At UTC+13 the error could also *swallow* a shift entirely
  (`shiftDate('2026-03-08', +1)` → `'2026-03-08'`), which in a consumer's date
  stepper reads as a button that does nothing. `MCO.lastCompleteHourMT`
  inherited the same bug and is fixed with it. No fielded consumer was
  affected — both migrated apps are used from Mountain Time, where the old
  code was correct. Found during the mesonet-photos migration.

`theme/mco-theme.css` and `core/mco-core.js` both changed; both SRI hashes are
new.

## [0.3.1] — 2026-08-03

### Changed
- Navbar brand lockup: the divider pulls in so logo ↔ divider ↔ title sit on
  the same 0.4rem rhythm as the squared logo edge margins (review feedback
  from the mesonet-status migration). Only `theme/mco-theme.css` changed.

## [0.3.0] — 2026-08-03

Back-ports from the mesonet-status migration review — the first
adopt/override/back-port pass with a real consumer.

### Added
- Animated panel collapse: `.mco-panel-body` slides + fades (ported from
  mesonet-status), then `MCO.initCollapsible` sets `[hidden]` so collapsed
  content leaves the tab order — fixing the latent focusable-while-collapsed
  bug the original implementation had. API unchanged.
- `MCO.fetchJSON(url, {timeoutMs, cache})` — cache-mode passthrough for
  polling loops (`'no-store'`).
- `snippets/head.html`: commented OG/Twitter social-card block (explorer +
  status precedent).

### Changed
- `MCO.createLiveRegion()` regions are now `aria-atomic="true"`
  (mesonet-status's improvement).
- `overlayPaints().tribalFill` light-theme opacity corrected 0.15 → **0.10**
  (mesonet-status was the design source; 0.15 was a transcription error).
- HOUSE-STYLE §3: subtitle-shed documented as a default with an opt-out;
  `<h1 class="brand-title">` blessed; panel-animation behavior noted.

## [0.2.0] — 2026-08-03

### Added
- **Hillshade** (`map/mco-map.js`): `MCO.map.addHillshade(map, opts)`,
  `MCO.map.hillshadePaints(opts)`, `MCO.map.TERRARIUM_DEM` (keyless AWS
  terrain tiles), and `MCO.map.firstSymbolLayerId(map)`. Live-shaded
  topography with the `igor` method and per-theme treatments — cool
  highlights carry the relief on dark (exaggeration 0.70), soft neutral
  shadows on light (0.50), brighter highlights on high-contrast (0.80).
  Inserts beneath the basemap's labels by default. Chosen over Esri World
  Hillshade/Dark (grays out the dark basemap) and USGS 3DEP (light-only,
  US-only) in a side-by-side lab.
- HOUSE-STYLE §7: the map layer-order convention (basemap → hillshade →
  basemap labels → boundaries → data).
- The exemplar now renders topography via `addHillshade` (its CSP gains
  `https://s3.amazonaws.com` in `connect-src`).

Only `map/mco-map.js` changed among published files; its SRI hash is new.

## [0.1.2] — 2026-08-03

### Changed
- Navbar left padding now matches its vertical padding so the logo badge
  sits with square margins (the ≤1060px rule no longer re-widens it).
- Segmented buttons (`.seg-btn`) returned to the compact 30px style — a
  deliberate step shorter than the 34px nav buttons; touch targets are
  unaffected (`hover: none` still enforces 40px).
- Collapsible-panel carets now show the **action**, not the state: down to
  collapse while expanded, up to expand while collapsed (bottom-docked
  panel semantics).

Only `theme/mco-theme.css` changed; JS hashes are unchanged.

## [0.1.1] — 2026-08-03

### Added
- `exemplar/` — a complete single-page Mesonet station map built as the
  reference implementation of HOUSE-STYLE.md (live API data, three themes,
  URL state, keyboard station picker, live region + sr-table twin, CSP with
  pinned inline-script hash, compact-viewport detail dock). CI validates and
  axe-audits it alongside the demo.

### Fixed
- `.info-section` prose links are now underlined instead of color-only
  (WCAG 1.4.1 `link-in-text-block`) — caught by the kit's own axe workflow
  auditing the exemplar. The hover-underline-only style was inherited from
  mesonet-status, so the fielded apps share this defect until they migrate.
  Only `theme/mco-theme.css` changed; its SRI hash is new, the JS hashes are
  unchanged.

## [0.1.0] — 2026-08-03

Initial release. Extracted from the MCO web app family (mesonet-explorer,
mesonet-status, mesonet-photos, mco-snowpack-explorer, the mesonet_app
maintenance map, mco-data-cdn storage browser, mco-drought-dashboard).

### Added
- `theme/mco-theme.css` — design tokens in three themes (dark, light,
  **high-contrast** — promoted from mco-drought-dashboard with re-derived
  accent tints), z-index ladder, reset + a11y utilities (`.sr-only`, universal
  `:focus-visible`, reduced-motion blanket, `.mco-skip-link`, touch targets),
  MapLibre control polish, and component shells (navbar, toast, tooltip,
  modal, collapsible panel, scrim) with the responsive shedding ladder.
- `tokens/tokens.json` — machine-readable token mirror for React/Mantine,
  Tailwind, Quarto, and email consumers.
- `core/mco-core.js` — `window.MCO`: throw-safe storage, HTML/regex escaping,
  Mountain-time helpers, `fetchJSON` + promise cache, live `reducedMotion()`,
  `viewport` compact/touch pub-sub, toast, theme management +
  `initThemeToggle`, `createLiveRegion`, `initInfoModal` (opener-captured
  focus restore), `initCollapsible`, URL-state helpers.
- `map/mco-map.js` — `window.MCO.map`: Montana bounds, `cartoStyleUrl` /
  `themedStyleUrl` (keys stay in consumers), `initialCamera` / `cameraParams`,
  `addNavigation` / `addFitControl`, `installZoomFloor`, `overlayPaints` +
  `TRIBAL_LABEL_LAYOUT`.
- `map/cog-protocol.js` — byte-identical move of the snowpack explorer's COG
  raster protocol (`window.CogProtocol`).
- `map/data/` — Montana state/county/tribal boundary GeoJSONs + `data.R`
  provenance; `assets/` — vendored MCO logo, favicon set, OG card.
- `snippets/` — anti-flash theme boot (now accepts `high-contrast`), canonical
  `<head>`, skip link.
- `demo/` — living component demo (axe target) and CDN + SRI self-test page.
- CI: token parity, WCAG contrast matrix, SRI freshness, html-validate, and an
  axe audit across all three themes.

### Canonical reconciliations of prior app drift
- Toast default duration 2800 ms; `NavigationControl({showCompass: false})`;
  `--text-dim: #8494ab` dark / `#5f6675` light (AA-passing); theme toggles set
  `aria-label`; new `--accent-line`, `--selection-ring`, `--text-on-accent`
  tokens; `--accent` documented as fill-only.
