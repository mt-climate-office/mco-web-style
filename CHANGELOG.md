# Changelog

All notable changes to mco-web-style. Format follows
[Keep a Changelog](https://keepachangelog.com); versioning follows the SemVer
policy in README.md.

## [Unreleased]

(Nothing yet.)

## [0.11.3] — 2026-10-09

Fixes found by the six consumer re-points. PATCH: theme, core and cog
changed; map and palette are the same as 0.11.2.

### Fixed
- **`cog-protocol.js` `emptyTile()`** called `convertToBlob()` on an
  OffscreenCanvas that never had a context, which throws in Chromium. These
  were the ~16 `[cog] OffscreenCanvas has no rendering context` errors snow
  logged on every phone-width load, long recorded as snow's own.
- **`cog-protocol.js` `getBlock()`** reports a failed or truncated range
  response by name, instead of an opaque fzstd "unexpected EOF".
- **`MCO.initDrawer`** hides the drawer at init on a page that loads already
  off-canvas. Before, it stayed tabbable (19 controls in explorer) until it
  was first opened.
- **`MCO.overlay`** returns focus to `fallbackFocus` when the opener is
  `<body>` (a deep-link or programmatic open) or has been hidden (the sheet
  grip).
- **`MCO.initStepper`** clears its hold flag when a press is dragged off the
  button, so the next keyboard activation isn't swallowed.
- **A busy `.mco-chip` with no count** shows an ellipsis.
- `tools/conformance.mjs` accepts the same contrast comments as
  `lint-css.mjs`, including a ratio after the closing brace.

### Added
- `initSheet` / `initDrawer` `inertRoots` may be a function. To keep a
  dialog the sheet opens usable: `() => MCO.overlay.siblingsOf(el, [dialog])`.

### Docs
- HOUSE-STYLE §1: apps with a live preview bot keep their own `og:image`.
- HOUSE-STYLE §3: a bar that can't fit one row at 1060 sheds at 1400. Also,
  focus across the segmented fallback needs the kit's `[hidden]` to be what
  hides the losing side.
- tools/verify: a config's `ready` function is serialized into the page and
  can't call helpers.
- CONSUMERS: all six on 0.11.2 and live, with the new scores.

## [0.11.2] — 2026-10-09

Fixes found by the mesonet-photo-explorer re-point. PATCH: theme and core
changed; map, cog and palette are the same as 0.11.0.

### Fixed
- **Focus ring on date/time inputs in WebKit.** Safari focuses the
  sub-fields, so the input never matched `:focus-visible` and showed no ring.
  Native date, time, datetime-local, month and week inputs now ring on
  `:focus`.
- **`MCO.initStepper` keeps keyboard focus at a bound.** Disabling the
  focused button dropped focus to `<body>`; it now moves to the other
  button.
- **`MCO.setSocialMeta({url})` no longer rewrites the canonical link.**
  Passing the live URL pulled canonical off the production host. `url` sets
  `og:url` only; pass `canonical` to set the link deliberately.
- **The attribution ⓘ icon tiled** in its 40px touch button (no
  `background-repeat: no-repeat`).
- `tools/verify/head.mjs` strips comments, scripts and styles before looking
  for `<body>`. A "<body" in a head comment failed the skip-link check.
- `tools/verify/keyboard.mjs` keeps walking past a native date input. Its
  sub-fields are several Tabs on one element, which read as a wrap-around
  and ended the focus-ring audit after four stops.

## [0.11.1] — 2026-10-09

Fixes found by the first consumer re-point (mesonet-status). PATCH: the
theme file changed, and core, map, cog and palette are the same as 0.11.0.

### Fixed
- **Rail mode: fixed surfaces cleared the rail** (0.10.0 defect). At 750×342,
  the compact `.mco-sheet` sat under the 56px rail and clipped its title. A
  start-side `.mco-drawer` slid in under it, and the toast centred on the
  viewport. Rail mode now sets `--rail-inset` on the body, and all three
  read it.
- The search field's native clear (×) glyph is visible on dark themes.
- `tools/verify/keyboard.mjs` reports a render-evidence timeout as a failed
  check instead of crashing, as `axe-matrix.mjs` does.
- `tools/verify/canary.mjs` no longer intercepts requests. Playwright WebKit
  on macOS breaks every `blob:` worker under any `context.route()`, so
  MapLibre 6 drew nothing in local WebKit candidate runs. The candidate is
  now a second server that rewrites kit URLs to a same-origin path.

### Changed
- The canary is faster. The network-quiet wait is capped at 8 s (was 25 s;
  `--quiet-cap`), and CI runs one job per consumer × browser.

## [0.11.0] — 2026-10-09

The brand release: the MCO logo assets now live in the kit, and this repo is
their source of truth (#27). Additive: new files and one new class.
Re-pointing is a tag bump with no CSP hash change. MIGRATING § 0.10.x →
0.11.0.

### Added
- **`assets/mco-logo.svg`**: the badge as a vector, pixel-identical to
  `mco-logo.png`.
- **`assets/mco-wordmark.svg`** (text in `currentColor`, for inline use), plus
  **`-on-dark.svg`** and **`-on-light.svg`**, fixed-color twins for `<img>`
  and canvas exports. Every kit asset backs the mark with white: the source
  artwork leaves the swoosh unfilled, so it went dark on dark surfaces.
- **`.mco-wordmark`** with `.is-on-dark` / `.is-on-light`: the theme shows
  one of the pair. It is centered in `.mco-footer`.
- HOUSE-STYLE §1 logo rules: badge in the navbar, wordmark in footers and
  exports, exports drawn from the pinned tag with CORS (never
  climate.umt.edu), clear space, and minimum sizes.
- `demo/cdn.html` CORS-decodes the four brand SVGs from the tag.

## [0.10.0] — 2026-10-09

The navbar release: a landscape-phone rail, a sticky bar for scrolling
pages, a legible lockup and glass that reads without blur, plus a 3-state
theme toggle and display numerals. Every open kit issue except #27 (logo
assets, waiting on brand-owner sign-off). **The anti-flash snippet is
unchanged**, so no page's CSP hash moves: re-pointing is a tag bump.
MIGRATING § 0.9.x → 0.10.0.

### Added
- **Short-landscape rail**: `.mco-navbar[data-rail]`, `.mco-rail`,
  `.mco-nav-drawer` and **`MCO.initNavRail`** (#38). At
  `MCO.viewport.RAIL_MQ`, the landscape half of the compact query, the bar
  becomes a fixed 56px left rail and its drawer opens beside it, with the
  drawer focus/inert/Esc contract. Also `MCO.viewport.isRail()`. Adapted
  from mesonet-photo-explorer.
- **`.mco-navbar.is-sticky`** for long-scrolling pages (#4). Core publishes
  its height as `--chrome-h`, so `scroll-padding-top` keeps anchors and focus
  clear of it.
- **`.nav-btn[aria-current="page"]`**: link tabs share the pressed look (#3).
- **`MCO.initThemeToggle({cycle: true, iconContrast})`**: dark → light → high
  contrast, with the label naming the next theme. Also
  `MCO.toggleTheme({cycle})` and `MCO.THEME_CYCLE` (#3).
- **`--font-display-num` + `.mco-num-display`**: hero readings (≥ 1.75rem) in
  Outfit with tabular figures. Space Mono stays for every other numeral
  (#36).
- **`prefers-reduced-transparency: reduce`**: glass surfaces go solid and
  drop the blur (#37).
- The kit's a11y gate adds a 750×342 landscape pass and rail probes.

### Changed (visible defaults: MINOR under the pre-1.0 convention)
- **Brand lockup 12px / 11px**, up from 10.4 / 8.8px (#37). The lockup is
  wider, so an app tuned to a navbar wrap point re-checks it.
- **`--glass` near-opaque**: dark 0.82 → 0.92, light 0.88 → 0.94 (#37).
  The blur is an enhancement, not the thing that makes text legible.
- **`--scrim` stronger**: dark 0.45 → 0.55, light 0.35 → 0.45 (#37).

By the letter of the README policy a default change is MAJOR. As with
0.7.0, call it if you'd rather this be 1.0.0.

### Fixed
- The 2-state theme toggle in high contrast said "Switch to light theme" and
  showed the sun, then switched to dark. It now names and shows dark.

## [0.9.0] — 2026-10-08

The mobile and data release: overlays with one focus and Esc model,
loading/controls/cards, the palette module, and shared verify tooling, all
from the dashboard's kit proposals. Additive (MINOR). The one change every
consumer must make is re-copying the anti-flash snippet (new CSP hash).
MIGRATING § 0.8.x → 0.9.0.

### Added
- **`MCO.overlay`** + **`MCO.escStack`** (#11). Focus in and back, reference-counted
  `inert`, one Esc order in which a native `<dialog>` always wins, and
  `MCO.overlay.isBlocking()` for shortcut suppression.
- **`MCO.initDrawer` + `.mco-drawer`** (#5). A labelled `<aside>` that is
  inert-making while open, docks as a column above compact, and is
  `[hidden]` when closed.
- **`MCO.initSheet` + `.mco-sheet`** (#6). explorer's panel, generalized:
  peek/full detents, head drag with fling and dismiss, and the grip as the
  keyboard twin.
- **`MCO.metrics`** + `--chrome-h` / `--sheet-h` / `--tabbar-h` and opt-in
  `html.mco-autolift` (#9).
- **First-paint hold**: `html.mco-booting` from the anti-flash snippet, plus
  `MCO.ready()` / `MCO.whenReady()` and `[data-hold]` / `[data-skeleton]` (#10).
- **`.mco-card`** (#7). **`MCO.loading`**, **`.mco-progress`** and
  **`.mco-skeleton`** (#13).
- **`.seg-btns.is-radio`** + **`MCO.initSegmentedFallback`** (#14).
- **`MCO.initStepper`** + `.nav-btn.mco-step` (#22). **`.mco-chips` /
  `.mco-chip`** + `MCO.toggleIn` (#23).
- **`palette/mco-palette.js`**, a new published file: `MCO.palette` ramps,
  OKLab `sample`, per-theme 3:1 `span`s, Tol categoricals, and `NETWORK`
  (#17). It is byte-identical to the dashboard's, and CI gains 183 palette
  checks.
- **`MCO.cssVar`**, **`MCO.chartTokens()`**, and a **`mco:themechange`**
  event from `MCO.setTheme` (#18).
- **Type and spacing scale** `--fs-*`, `--lh-*`, `--fw-*` and `--space-*`,
  theme-invariant (#25, #26).
- **`MCO.setPageTitle` / `MCO.setSocialMeta`** with the detail-first title
  rule. Favicons and og-card are hot-linked from the pinned tag, decided
  2026-10-08 (#28).
- **`.mco-footer`** + **`MCO.credit()`** (#29).
- **`MCO.map.markerPaint`** (network = shape + color), `selectionPaint`,
  `focusPaint`, `hitPaint` and `colocatedHaloPaint`, with the HOUSE-STYLE §7
  marker and co-location rules (#31, #33).
- **`tools/verify/`**: a shareable harness (`head`, `axe-matrix` at 1440 and
  390-touch, `keyboard`, `lint-css`) (#34).

### Fixed
- **Touch targets under 40px** on touch, found by the new harness: MapLibre
  zoom/fit (29px), the compact attribution ⓘ (24px), and `.mco-panel-toggle`
  (36px). The kit's own a11y gate now audits touch targets at 390px.

## [0.8.0] — 2026-10-08

MapLibre 6 for a critical XSS, and the absorptions planned since 2026-08-16:
code each consumer had hand-rolled, now built once against the dashboard's
proven versions. Additive throughout for kit APIs (MINOR). For consumers, the
MapLibre move changes how map pages load: see MIGRATING § 0.7.x → 0.8.0.

### Security
- **MapLibre GL 5.18.0 → 6.11.2** (#1). 5.18.0 carries
  [GHSA-jrc7-96c5-q579](https://github.com/advisories/GHSA-jrc7-96c5-q579)
  (critical), a `DOM.sanitize` bypass. Its one caller is the
  **AttributionControl**, so every map loading third-party attribution strings
  (CARTO's style and TileJSON) was exposed, not only pages calling `setHTML`.
  It is fixed in 6.4.1, and there is no 5.x backport. MapLibre 6 is
  ES-modules only:
  - **`MCO.map.loadMapLibre()`** dynamic-imports the family pin
    (`MCO.map.MAPLIBRE_VERSION`) from the classic `mco-map.js` and publishes
    `window.maplibregl`.
  - Pages carry a **one-line import map** whose `integrity` entries pin the
    entry and shared chunks (`snippets/head.html`), plus modulepreloads.
  - CSP gains the import map's hash and **`worker-src blob:
    https://unpkg.com`**. MapLibre's guide lists only `blob:`, which leaves the
    worker blocked with no CSP message.
  - Known gap: the worker's own imports can't be hash-pinned (HOUSE-STYLE §7).
  - `check-sri` now enforces the import map, version, preloads and CSP hash.

### Added
- **`MCO.announce(text, {politeness})`** (#15), the page's one announcer.
  Its regions exist from load, it clears then sets so a repeat is re-read, and
  it drops duplicates within 500 ms. `showToast(msg, ms, {announce: false})`.
- **`MCO.notice()` / `.mco-notice[data-tone]` / `.mco-empty`** (#16, pulled
  forward from 0.9.0). A persistent banner with an action, a visible tone word,
  and `data-place="over"` on the `--z-map-notice` tier.
- **Status tokens** `--danger` / `--warning` / `--success`, each with
  `-fill` and `--text-on-*` (#2). Measured to ≥ 4.5:1 on every surface and
  their fills, and CI-enforced.
- **`.nav-btn.is-primary`** + `--accent-fill-hover` (#24). The spec's
  `--accent-dk` hover was 3.94:1 in high contrast.
- **`.mco-scrim[data-scope="container"]`** (#8).
- **URL state** (#12): `MCO.pushUrlState`, opt-in `{keepHash}`,
  `MCO.onUrlState`, plus the planned clean-URL pair `MCO.osTheme()` and
  `MCO.map.cameraParamsIfDefault(map)`. HOUSE-STYLE §4 gains the
  replace-vs-push rule.
- **`MCO.map.watchBasemap(map)`** + `MCO.map.blankStyle()` (#30). A dead
  basemap no longer hangs the app; the map retries, then falls back to a style
  that still loads, with a Retry notice.
- **`MCO.map.popupContent()`** + `MCO.map.safeUrl()` and a token-styled
  popup shell on `--z-detail` (#32). HOUSE-STYLE §7 gains the DOM-content rule.
- **`MCO.map.initCursorTooltip(map, {layers, render})`** (planned).
- **`MCO.srTable()`** (#19): caption, row headers, a wrapper `.sr-only`,
  a 500-row cap, and an optional selectable roving-tabindex mode.
- **`MCO.initLegendToggles()` + `.mco-legend-row`** (#20). Off dims the
  swatch, never the row (the 2.7:1 label in status, maint and umrb). Swatches
  carry an edge and a `data-shape`.
- **`MCO.initSearchBox()` + `MCO.searchModel` + `.mco-search`** (#21): the
  APG combobox on the dashboard's model, with a mask icon in `currentColor`.
  The axe workflow gains keyboard probes for it.
- **CONFORMANCE.md + `tools/conformance.mjs`** (#35), with per-app scores in
  CONSUMERS.

### Changed
- `createLiveRegion().announce` clears before setting (PATCH-level fix).
- The toast singleton is created at load, not on first use.
- `replaceUrlState` keeps `history.state` instead of nulling it.
- `installZoomFloor` (planned): a re-entrancy latch, chrome-only resizes
  (height < 120 px) no longer move the camera, and `onBeforeSnap` to veto.
- Long info modals (back-ported from explorer): a sticky header, contained
  overscroll, and a bottom scroll shade.

### Fixed
- **Attribution links are underlined** (WCAG 1.4.1; planned).

## [0.7.1] — 2026-09-30

### Fixed
- **Layout shift when the kit fonts land after first paint.** `font-display:
  block` (0.7.0) keeps text invisible rather than wrong, but invisible text is
  still laid out — in plain Arial, which sets the navbar lockup ~6% wider and
  its line boxes shorter than Outfit. On a throttled connection the navbar
  item beside the lockup jumped 16.6px when Outfit arrived. `mco-theme.css`
  now declares metric-matched local fallbacks, **`Outfit Fallback`** (faces
  for 400–500, 600, 700 and italic) and **`Space Mono Fallback`**: Arial /
  Helvetica / Liberation Sans and Courier New / Liberation Mono rescaled with
  `size-adjust` and `ascent-`/`descent-`/`line-gap-override` to Outfit's and
  Space Mono's metrics. Measured across all six consumers under the same
  throttle: 16.6px → 0.1px (mesonet-maintenance, whose uppercase title is
  wider than the subtitle: 11.9px → 5.2px). Line boxes match exactly; the
  italic face is fitted to the house subtitle, the upright faces to a corpus of
  real MCO UI strings measured per weight. The same faces are what a reader
  sees if the webfonts never arrive.

### Changed
- `--font-ui` / `--font-mono` gain the fallback family second in the stack
  (`'Outfit', 'Outfit Fallback', system-ui, …`). A PATCH despite touching a
  token value: nothing renders differently once the webfonts have loaded, and
  the change only narrows what the invisible block-period text reserves.
  `tokens/tokens.json` mirrors it.

### Consumer re-point (0.7.0 → 0.7.1)
- Kit tags `@0.7.0` → `@0.7.1` (font preloads included); only the
  `mco-theme.css` hash changes. The anti-flash script is unchanged — no CSP
  hash to recompute.
- The fallback reaches text styled through the tokens only. CSS that names
  `'Outfit'` or `'Space Mono'` directly (`font-family: 'Space Mono',
  monospace`) skips it: switch those to `var(--font-ui)` / `var(--font-mono)`.
  Canvas `ctx.font` strings can stay — exports draw after the fonts load.

## [0.7.0] — 2026-09-30

First paint. Every consumer painted its text in the system font and re-set it
in Outfit a beat later, and CSS keyed on `.is-compact` could be wrong on the
first frame. Both came from what the kit told apps to do, so the fixes are
the kit's. Found and proven on mesonet-explorer (throttled CDP screencast:
Outfit from the first painted frame; before, system font then swap).

### Added
- **Kit-hosted fonts** in `fonts/`: Outfit (variable, 400–700) and Space Mono,
  latin + latin-ext subsets of the Google Fonts builds, with their SIL OFL
  license texts. `mco-theme.css` declares them (`@font-face`, `url(../fonts/…)`
  — relative to the stylesheet, so a pinned tag gets that tag's fonts) with
  `font-display: block`; latin-ext downloads only when a page uses one of its
  characters.
- `snippets/head.html`: two `rel="preload"` font lines (latin only) replace the
  Google Fonts preconnects + stylesheet. `crossorigin` is required; there is
  deliberately no `integrity` (an `@font-face` fetch carries none, so the
  preload would never match and the font would download twice).
- `snippets/anti-flash.html` now also stamps `.is-compact` / `.is-touch` on
  `<html>`, so CSS keyed on them is right from first paint. `mco-core.js`
  still stamps and tracks them after load; the query is kept in sync in three
  places (core, theme §6 comment, snippet).
- `demo/cdn.html`: a fonts row — `document.fonts.load()` per family against
  the CDN copy, so the release check proves the fonts propagated.
- `tools/check-sri.mjs`: every kit URL in README, head snippet and CDN demo
  must name one version, the same in all three — hashes can't catch a stale
  `@version` on an unhashed file such as a font preload.

### Changed
- **The ≤750px `.brand` collapse is scoped to the navbar**
  (`:where(.mco-navbar) .brand`), so a lockup an app places elsewhere — the top
  of a compact drawer (mesonet-explorer) — is no longer clipped to 1px.
  `:where()` keeps specificity at the old bare `.brand`; no consumer puts a
  `.brand` outside the navbar today, so nothing else moves.
- `demo/` and `exemplar/` load the kit fonts; the exemplar's CSP is
  `font-src 'self'` (a real app: `https://cdn.jsdelivr.net`) and its
  anti-flash hash is recomputed.

### Consumer re-point (0.6.x → 0.7.0) — MIGRATING.md has the checklist
- CSP: drop `https://fonts.googleapis.com` from `style-src`; `font-src`
  becomes `https://cdn.jsdelivr.net`.
- Swap the Google Fonts lines for the two preloads.
- Replace the inline anti-flash script **and recompute its sha256** — the
  script changed, so every consumer's hash changes.

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
