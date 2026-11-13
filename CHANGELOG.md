# Changelog

All notable changes to mco-web-style. Format follows
[Keep a Changelog](https://keepachangelog.com); versioning follows the SemVer
policy in README.md.

## [Unreleased]

(Nothing yet.)

## [1.0.0] — 2026-11-13

MAJOR: the phone layout. Theme, core, map and photos change; cog,
palette, places, summary and the anti-flash snippet are byte-identical to
0.21.2, so their SRI hashes and every consumer's CSP hashes are unchanged.
From the 12 Nov 2026 phone audit and Kyle's rulings that day (the station
panel, the right rail, the bottom control bar, the legend in the drawer)
and on 13 Nov (← / → on every date stepper). A consumer on 0.21.2 markup
keeps working: every renamed call has a shim, and what each app must change
is in MIGRATING.md, *0.21.2 → 1.0.0*.

### Migration list (breaking changes)
1. **The landscape rail is at the RIGHT edge.** At `RAIL_MQ` the bar is a
   56 px column at `right: 0`, clear of the right safe area, and the body is
   padded on the right (`padding-right: var(--rail-inset)`), not the left.
   Top to bottom: badge, ☰, the search button (new in the rail), the hot
   controls, then a `.mco-controlbar` at its foot. Rail buttons are 44 px on
   touch. App CSS that assumed a left rail (`padding-left` /
   `left: var(--rail-inset)`, left-edge offsets in landscape) must go.
2. **`--rail-inset` is a right-hand inset.** The end-side `.mco-drawer`
   (`right`), the compact station panel (`right`) and the toast's centre
   read it; the start-side `.mco-drawer` no longer does. MapLibre's right
   corners sit left of the rail through the body padding and no longer pad
   for the right safe area in rail mode.
3. **The ☰ drawer opens from the right, beside the rail** (it opened to the
   rail's right, from the left edge). In the folded bar it now stops above
   the bottom control bar and an on-screen keyboard
   (`bottom: max(--tabbar-h, --kb-inset)`), and the control bar stays live
   while it is open, in both modes.
4. **The station panel (`MCO.initSheet`) has one state.** On compact it is
   full height under the bar (`--sheet-top`, measured; 0 beside the rail)
   down to the bottom control bar (`--tabbar-h`) or the screen's bottom, the
   whole width left of the rail. No peek detent, no drag, no grip. It is
   modal there: everything is inert except `.mco-navbar` and
   `.mco-controlbar`, which the kit removes from the inert set even when the
   app passes `inertRoots`. `state()` returns `'full'` or `'closed'`;
   `onState` never receives `'peek'`. `--sheet-h` stays 0, so autolift never
   lifts the toast or a legend for it. Above compact nothing changes
   (end-docked, map live). Removed: drag on the head, the grip's keyboard
   twin (ArrowUp/ArrowDown on it), `syncPeek`, `--sheet-peek-h` and the
   `[data-peek]` measurement; app CSS on `[data-state="peek"]` or a
   compact `max-height` override now fights the full-height panel.
5. **A close button is required** in `.mco-sheet-head`: a visible
   `[data-close-sheet]` at the top right, styled 44×44 px at every width
   (it was 34 px with a mouse). `initSheet` warns in the console without
   one. `.mco-sheet-grip` is hidden at every width.
6. **K7: the bar no longer flips into the rail while someone types.** With a
   text field focused on a touch screen, or `MCO.keyboard` reporting a
   keyboard, a resize into `RAIL_MQ` keeps the folded bar
   (`html.mco-bar-hold`), and `MCO.viewport.isRail()` reports the bar as
   shown (false while held). `initNavRail`'s mode change no longer closes an
   open drawer while typing; it re-anchors it. The fold is not re-measured
   while typing, and is measured again when typing ends.
7. **`MCO.keyboard` starts in `MCO.ready()`** and writes `--kb-inset`,
   `--vv-h` and `.kb-open` on `<html>` (the dashboard's names, so its own
   copy and the kit's write the same values until it switches).
8. **Under `.kb-open`**: the nav drawer and off-canvas drawers stop above
   the keyboard, `.mco-search-list` keeps to the room above it
   (`--list-room`), `.mco-sheet-body` pads for it, and the control bar
   hides.
9. **The toast centres in the area left of the rail** (`left: calc(50% -
   var(--rail-inset) / 2)`), and with a control bar it clears `--tabbar-h`
   (autolift).
10. **Autolift caps at a MapLibre control group above** (G): a lifted
    bottom corner or `[data-autolift]` panel stops 8 px under a top corner
    (zoom, fit) that overlaps it across, not only at its container's top.
    mesonet-explorer's `--attrib-lift-max` override is no longer needed.
11. **The rail drawer undoes the bar's stamp sheds** (`.refresh-word`,
    `.refresh-status`) as the folded drawer already did.
12. **The end-docked panel stops above a docked control bar** too
    (`.mco-sheet { bottom: var(--tabbar-h) }` at every width; a tablet whose
    bar folds docks the control bar under it).
13. **The rail badge is 44 px on touch**, as ☰ and search are.
14. **`MCO.keyboard` also starts at load**, not only in `MCO.ready()`.
15. **Zoom moves to the top-left corner** (Kyle, 2026-11-13: "I don't like
    how they sit right next to the rail"). `MCO.map.addNavigation(map)`
    defaults to `'top-left'` (it was `'top-right'`), at every width;
    `addFitControl` fuses into that group and moves with it. Pass
    `{position: 'top-right'}` to keep the old corner.

### Changed
- `MCO.map.addNavigation` default position `'top-right'` → `'top-left'`
  (map/mco-map.js changes for the first time since 0.21.2; its
  `markerPaint` comment now says "until 2.0"). The 0.21.2 legend cap and
  the autolift clamp treat a top-corner control group on the same side as
  a ceiling, so a tall bottom-left legend stops under the zoom group
  (mco-snowpack-explorer at 1200×600: legend 89–564 over zoom 64–153,
  two zoom buttons unreachable; now capped at 161). The right-corner
  `--sheet-end` shift and the rail's right-corner padding stay: the
  attribution is bottom right, and an app may keep zoom top right.
- An over-the-map notice or empty state (`[data-place="over"]`) keeps
  clear of both top corners: `max-width: min(34rem, calc(100% - 7.5rem))`
  (was `- 1.5rem`). On a phone-width map it covered whichever top corner
  held zoom (mesonet-maintenance carried an override for the right one);
  it now wraps between them.

### Fixed in the release candidate (review of the seven consumer PRs)
- **The panel ran under the control bar above compact.** At 768×1024 the
  end-docked panel ended at 1024 while the control bar covered 966–1024
  (mesonet-photo-explorer); it now ends at 966.
- **The Legend button covered the attribution** on portrait phones: its
  corner was taken once, before MapLibre's attribution existed (18 px over
  it at 390×844 in maintenance and umrb). It now tracks the map's
  bottom-corner controls (attribution, scale, anything MapLibre or an app
  puts there) as they appear, wrap, resize or lift, and its insets don't
  animate. It lifts with autolift over a control bar.
- **A search list ran under the keyboard** in short landscape (the room had
  a 96 px floor: 194 px vs a 162 px keyboard line at 750×342). The list now
  keeps to the room under its field, at least one 44 px option, and opens
  upward (`.is-above`) when there is less room under the field than over
  it. A keyboard that opened before the app called `MCO.ready()` went
  unseen; `MCO.keyboard` now starts at load.
- **The rail's control bar could cover its top group** (photos at 568×320:
  the search button half under a 192 px bar). Core measures the top group
  into `--rail-top-h`; the bar takes at most the rest of the screen. Short
  of room the readouts go first (`.is-tight`, visually hidden, still read),
  then the bar scrolls (`.is-scroll`, with shadows at the scrolled edges).
  The bar's content sits at its foot with `safe` alignment, so its first
  control never scrolls out of reach. A readout written in parts (spans)
  breaks between them, never inside one, and stacks them in the rail in
  the UI face (from mesonet-photo-explorer).
- **A dialog opened from inside the ☰ drawer was inert** (snowpack's
  "About this data" in the legend, once the legend moved into the drawer):
  the drawer had inerted the page around it, dialog included. While a modal
  `<dialog>` is open, the overlay's inert roots on its ancestor chain are
  lifted (a modal dialog inerts the rest itself), focus goes into it, and
  they return when it closes; focus goes back into the drawer.
  Only a modal dialog (`:modal`, i.e. `showModal()`) lifts them: a
  non-modal one (`show()`, an `open` attribute) leaves the page inert behind
  the drawer, and an engine without `:modal` lifts nothing.

### Added
- **The bottom control bar** (`.mco-controlbar`, `MCO.initControlBar`):
  the time controls on a phone (Kyle: "time controls only"). App markup, a
  direct child of `<body>`; the kit docks it at the bottom wherever the
  compact bar folds (portrait phones by CSS from first paint, any folded
  width by `.is-folded`), clear of the bottom safe area; at the foot of the
  rail in short landscape; hidden above that and under `.kb-open`. It
  publishes `--tabbar-h` (bottom-docked) and `--controlbar-h` (in the
  rail), turns on `html.mco-autolift`, stays live under the station panel
  and beside an open drawer. Core wires every one present at load.
  `.mco-controlbar-readout` styles a date readout. 44 px buttons on touch.
- **`MCO.keyboard`**: `start()`, `stop()`, `isOpen()`, `inset()`,
  `keyboardInset(layoutH, vvH, vvOffsetTop)` (pure), `KEYBOARD_MIN_PX`
  (80), and `'mco:keyboard'` on document. A port of mesonet-dashboard's
  `keyboard.ts` and `keyboardInset.ts`, plus one guard: while the page is
  pinch-zoomed (`visualViewport.scale` > 1.05) nothing reads as a keyboard.
- **← / → step the date** (`MCO.initStepper({…, arrowKeys: true, unit})`,
  Kyle 2026-11-13), from Kyle's snowpack work. One stepper takes the keys:
  the finest `unit` among the arrowKeys steppers showing (an hour beside a
  day), then the first made. Fields, keyboard-reached radio groups,
  sliders, spinbuttons, listboxes, tablists, menus, menubars, grids, trees,
  toolbars, open dialogs and blocking overlays keep their arrows; on a map
  a pointer focused ← / → step until ↑ / ↓ / + / − / Tab, and on a map
  reached by Tab they pan; any modifier, a handler that already called
  `preventDefault`, `canStep` saying no, or `?kbd=off` leaves them alone.
  Prev/next get `aria-keyshortcuts`. `initStepper` returns `destroy()`.
  `MCO.photos.initPhotoControls` passes `arrowKeys` through (for all
  steppers, or per pair).
- **`MCO.initLegendDrawer({panel, rail})`**: on compact a floating legend
  `.mco-panel` moves into a "Legend" group at the end of the ☰ drawer
  (`.mco-legend-slot`, `.is-in-drawer`), and a `.mco-legend-btn` takes its
  corner on the map and opens the drawer at it (expanded, focus on its
  title, focus back to the button on close). Above compact it floats as
  before; the 0.21.2 height cap stays.
- `html.is-rail` and `html.mco-bar-hold` (core) for CSS hooks.
- Metrics `--controlbar-h`, `--kb-inset`, `--vv-h` (tokens.json `metrics`).
- `.mco-sheet-head [data-close-sheet]` styles (44 px).

### Deprecated (shims, kept until 2.0)
- `sheet.open('peek', o)` and `sheet.open('full', o)`: the state argument is
  ignored; use `sheet.open(o)`.
- `sheet.setState('peek')` (and `'full'`): opens a closed panel; use
  `open()`.
- `initSheet({peekHeight})` and `initSheet({dismissible})`: ignored (there
  is no drag or grip to dismiss with; Esc and the close button close).
- `.mco-sheet-grip` markup and `[data-peek]`: hidden / ignored.
- `MCO.palette.categorySet`, `CATEGORY_SETS`, `RESERVED_HUE`,
  `isReservedHue` (0.21.1) and `MCO.map.markerPaint` /
  `colocatedHaloPaint` (0.21.0) stay deprecated and working until 2.0
  (palette's source comment still says "until 1.0.0": palette is
  byte-identical to 0.21.2 on purpose; map's now says 2.0).
- Not deprecated: `MCO.viewport.isRail()`, `RAIL_MQ` and
  `initNavRail().isRail` are real APIs (the rail stays, at the right).

### Not in 1.0.0
Three changes earlier notes promised "in 1.0.0" are left for a later
MAJOR, so this one stays the phone layout Kyle checks on a real phone: the
kit's own rules moving onto the type scale, `{keepHash: true}` as the URL
writers' default, and `mco-autolift` on by default (it turns on with a
control bar).

### Tooling
- `tools/a11y-audit.mjs`: 1.0.0 probes in both engines, touch contexts
  (`PROBE_ONLY=v1` runs just them): the rail at the right edge at 750×342
  and 844×390 (order badge → ☰ → search → time controls, every button
  ≥ 44 px on screen, ☰ drawer beside it, the control bar live, axe with it
  open); the station panel at 320×568, 390×844, 750×342, 844×390, 768×1024
  and 1440×900 (rect = the viewport less the bar(s) on compact, the bar and
  control bar live and the rest inert, close button 44 px top right and
  hittable, focus, axe open, the shims); the control bar (`--tabbar-h`,
  safe-area padding, the drawer and toast clearing it, hidden with a
  simulated keyboard); K7 (390×664 → 390×374 → 844×390 with the search
  field focused, then the hold lifting, then back to portrait) and a
  deterministic fold after a hold; the legend in the drawer and floating;
  ← / → with every exemption.
- `tools/verify/family-audit.mjs`: 750×342 and 844×390 touch views; the
  rail at the right edge, its buttons ≥ 44 px, its search button and ☰
  opening the drawer beside it; on compact the station panel = the
  viewport less the bar(s) and the navbar not inert; the panel header (44
  px close top right, no grip) at 1440, 768, 390 and 750×342, identical
  across 1440, 768 and 390; a control bar's `--tabbar-h` and its hiding
  under a keyboard; the drawer at 390 holding the desktop bar's control
  labels in the same order (a segmented group counts by its name, matching
  its fallback select).
- Round 2 probes (both engines): the end-docked panel against the control
  bar at 768×1024; the Legend button against the map's bottom-corner
  controls at 320×568, 390×844 and 844×390; a search list above a 180 /
  260 px keyboard at 750×342, 844×390 and 320×568; the rail with 2-, 3- and
  4-button control bars at 568×320, 667×375, 750×342 and 844×390 (top group
  whole, hittable, above the bar; every control shown or reachable by
  scrolling); the rail's 44 px badge; a modal dialog opened from the
  drawer is live, and a non-modal one leaves the page inert. The search
  list probe waits for the demo's counties before typing.
  family-audit: the same panel, Legend-button and rail top-group checks on
  every consumer; the label check skips `.mco-legend-slot`, reads a
  declared `sidebar` (explorer) at 1440 and counts a phone's hot controls
  in the folded bar as present; the control-bar check runs only where a
  bar is displayed.
- Round 4: a11y-audit checks the zoom group in the map's top-left corner,
  hittable and overlapping nothing, at 320×568, 390×844, 568×320,
  844×390, 768×1024 and 1440×900, and that an over-the-map notice clears
  it; family-audit checks "zoom group in the top-left corner, overlapping
  nothing, hittable" at 390×844, 844×390, 768×1024 and 1440×900, counts
  controls in a collapsed drawer group as present (and skips the group's
  own toggle), treats a button inside a scrolling kit control bar as
  reachable, and skips the control-height check where the bar has no
  controls of its own.
- `tools/conformance.mjs`: a close button in `.mco-sheet-head`, no grip /
  `data-peek` / `open('peek')`, no left-rail app CSS.
- `tools/check-tokens.mjs`: the three new metrics.
- `tools/verify/canary-accept.json`: the 1.0.0 entries (each with its
  measured reason).
- Demo: the control bar, the one-state panel, a keyboard section, the
  legend in the drawer, ← / → on both day steppers; 320 px no longer
  scrolls sideways. Exemplar: the compact bar with its drawer, the kit's
  station panel, the legend in the drawer.

## [0.21.2] — 2026-11-13

PATCH: theme and core. Map, cog, palette, photos, places, summary and the
anti-flash snippet are byte-identical to 0.21.1, so their SRI hashes and
every consumer's CSP hashes are unchanged. Four fixes from the 12 Nov 2026
phone audit of production (findings K1, D1, K5 and K6), a fold that
varied between loads, which the release canary found, and a legend cap.

### Fixed
- **☰ no longer focuses the search field** (K1). `MCO.initNavRail` opened
  its drawer on the first focusable inside, which in every map tool is the
  search field, so on a phone ☰ raised the keyboard over the drawer the
  visitor had opened to browse. ☰, and `open()` with no element, now focus
  the drawer itself (`tabindex="-1"`; while open it is `role="group"` named
  after ☰, unless the markup gives it a role or name). The search button
  and `open(input)` still focus the field, and an `initialFocus` option is
  still honoured.
- **Arrowing through a search list no longer moves the page** (D1).
  `MCO.initSearchBox` kept the active option in view with
  `scrollIntoView`, which also scrolls the page and every scrolling
  ancestor: the field slid away from under the finger, or under the
  keyboard. It now scrolls the listbox alone.
- **Phone text fields are 16 px** (K5). iOS Safari zooms the page into a
  field with text under 16 px when it takes focus, and the family's fields
  ran 0.78–0.85rem. On a touch phone, `(hover: none)` and compact (≤ 640 px
  wide or ≤ 560 px tall, the `COMPACT_MQ` rule), text, search, number,
  date and time inputs, selects and textareas are 16 px, at a specificity
  (0,2,2) that outranks the apps' own inline rules such as
  `input[type="date"], select.time-select` and `.mode-select`. Phones
  only: on a touch tablet or laptop the wider fields can fold a full bar
  that fits today (mco-snowpack-explorer at 1440 px with touch in macOS
  WebKit), so above compact nothing changes. Checkboxes, radios and ranges are unchanged,
  and so is everything with a mouse.
- **The folded bar above 640 px** (K6). `.mco-search-toggle` was shown only
  ≤ 640 px, so a bar folded wider (a tablet, a narrow window) lost its
  search button, and with it the auto margin that holds ☰ at the right
  edge: at 768 px ☰ sat mid-bar. The search button now shows wherever the
  bar is `.is-folded`; its field stays in the closed drawer.
- **The fold is deterministic.** Fold-to-fit measures the bar unfolded on
  every check, but folded, the bar's text sits in the closed drawer, and a
  browser loads a web font only for text it renders. A bar measured before
  its fonts arrived folded on the fallback font's widths, the faces it
  needed never loaded, and every later check measured the fallback again:
  the same page and width folded on some loads and not others
  (mco-snowpack-explorer at 1440 px, mesonet-photo-explorer at 1024 px).
  Core now loads the faces the bar's text uses (only those) and measures
  again when they land or fail, so the state follows the bar's content
  and width alone. Checks also run on a 100 ms timer beside the animation
  frame (WebKit runs no frames while a page loads), on window load, and on
  changes inside the bar (`hidden`, `class`, children, text; not while its
  drawer is open), so a fold taken before an app's sheds runs again.
- **A legend taller than its map can always be closed** (a stopgap until
  1.0.0 moves the legend into the ☰ drawer on phones). A bottom-anchored
  `.mco-panel` grows upward, and one taller than its map pushed its head,
  with the collapse toggle, off the top of the screen or under the bar:
  mco-snowpack-explorer's 549 px legend put its toggle at y = −36 at
  320×568 and −236 at 750×340, and mesonet-umrb-build's 372 px one at −59
  at 750×340. Core now caps such a panel to the room over its map (from
  the container's top, or the bottom of a top bar over it, plus 8 px, to
  the panel's own bottom, so app offsets, autolift and the landscape rail
  are all measured, not assumed). A capped panel (`.is-capped`,
  `--panel-max-h`) scrolls inside with `overscroll-behavior: contain`, and
  its head stays pinned on `--bg-surface`. It takes `tabindex="0"` only if
  nothing inside it can take focus. A panel that fits is not touched, at
  any width. No consumer markup changes.
- **`family-audit.mjs`:** adds 320×568 and 768×1024 touch views. On a
  touch phone it checks text fields ≥ 16 px; at 768×1024 touch and 1440 it
  checks the kit's 16 px rule is inert, so field sizes and the fold are the
  app's own. In a folded touch bar it checks ☰ within 16 px of the right
  edge, the search button shown, and ☰ focusing the drawer rather than a
  text field. Its control count read the drawer's
  `[data-open]`; the kit marks an open drawer `.is-open`.
- **Legend probes.** `a11y-audit.mjs` checks the demo's new
  taller-than-its-map legend at 1440 and 390 (touch): capped inside its
  frame, scrolling, head pinned, toggle hit-testable, axe clean, and a
  click collapses it. `family-audit.mjs` checks every map tool's expanded
  legend the same way in each dark view.
- **Fold determinism check.** `family-audit.mjs` loads each map tool
  `--fold-repeats` times (default 3) at 1024, 1180 and 1440 px and fails
  unless every load ends in the same state, folded exactly when the
  unfolded bar is taller than 64 px.
- **`canary-accept.json` entries can name `consumers`** to accept a move
  in those consumers only. 0.21.2 accepts mco-snowpack-explorer's bar at
  1440 px (`.nav-meta`, `.brand`, `.controls`): 0.21.1 kept that bar
  folded where it fits (Chromium 10/10 loads, WebKit 3/10), and 0.21.2
  shows the full bar on 10/10 loads in both engines.
- `a11y-audit.mjs` runs its 0.21.2 probes in a fresh browser: Playwright
  WebKit stops loading pages after enough visits in one browser (as in
  `axe-matrix.mjs`).
- **`a11y-audit.mjs`:** ArrowDown ×10 in a search list must leave the
  page's `scrollY`, the field's position and any scrolling ancestor where
  they were; the folded bar at 320, 390, 768 (touch) and 750×342 checks ☰
  focus, 🔍 focus and ☰ at the right edge, with 16 px fields on the phone
  sizes and the desktop size kept at 768 touch.

## [0.21.1] — 2026-11-04

PATCH: theme, core, map and palette (comments only). Cog, photos, places,
summary and the anti-flash snippet are byte-identical to 0.21.0, so their
SRI hashes and every consumer's CSP hashes are unchanged. Fixes from the
first seven consumer PRs on 0.21.0, and two owner rulings after Kyle
previewed them (2026-11-04).

### Fixed
- **The compact bar is one row at every width.** Kyle's ruling: the bar
  never wraps, at any width. `data-rail="compact"` now folds to the compact
  layout (badge · hot controls · search · ☰, right drawer) wherever the full
  bar, measured unfolded, would be taller than 64 px, not only at portrait
  compact. The fold is `.is-folded`, set by core for every compact bar at
  load and kept live across resizes, font loads and the bar's own size
  changes. `'mco:fold'` fires on the bar on a change, and
  `initNavRail().isDrawerMode()` follows it. Before this, five of the six
  map tools wrapped to two or three rows from 641 to about 1040 px (to
  1081 px on touch).
- **`MCO.map.flyToAndOpen` under reduced motion.** `jumpTo` fires its
  `moveend` synchronously, before the listener was attached, so the settle
  fallback never started. A map still busy decoding tiles opened the
  detail only at `idle` or `timeoutMs` (about 20 s on mesonet-photos). It
  now opens in 2–6 s across the map tools.
- **The end-docked sheet hangs under the navbar.** It was positioned at
  `--chrome-h`, which core publishes only for a sticky bar, so on the map
  tools' in-flow bars the navbar covered the sheet's title and ×. The sheet
  now measures the bar into its own `--sheet-top`.
- **Map controls step clear of the open sheet.** The open end-docked sheet
  publishes its width as `--sheet-end`, and MapLibre's top-right and
  bottom-right corners move left by it. Zoom, fit and the attribution were
  unreachable under the sheet. A map that stops short of the viewport's
  right edge opts out with `.maplibregl-map { --sheet-end: 0px; }`.
- **The compact drawer slides in from the right**, the side it opens on.
  The rail's left-hand `@starting-style` also matched it.
- `CONFORMANCE.md` §2 said the compact drawer opens from the left.

### Deprecated
- **The map category sets** (`MCO.palette.CATEGORY_SETS`, `categorySet()`,
  `RESERVED_HUE`, `isReservedHue()`). Kyle previewed them on the tools and
  kept each tool's original category colors, orange and brown included
  (HOUSE-STYLE §6). They stay working until 1.0.0, and CI still measures
  them while they ship. `toOklch()` is current. `demo/palette-proposal.html`
  is kept, marked declined.

### Tooling
- **`family-audit.mjs`:**
  - sweeps 641–1440 px (mouse) and the tablet widths (touch) for a one-row
    bar;
  - checks the dashboard's navbar control height (its section track is the
    control);
  - allows mesonet-photos' documented photo-slot 404s;
  - no longer crashes writing a contact sheet before its images decode.
- **`axe-matrix.mjs` relaunches WebKit every 20 visits** (`VERIFY_RELAUNCH`;
  `0` turns it off). Playwright WebKit stops loading pages after about
  30–80 MapLibre visits in one browser; three consumers hit it, and umrb
  reproduced it on unchanged `main`. `lib.mjs` `start()` gains
  `env.relaunch()`.

## [0.21.0] — 2026-11-03

MINOR: theme, core, map, cog and palette. Photos, places, summary and the
anti-flash snippet are byte-identical to 0.20.0, so their SRI hashes and
every consumer's CSP hashes are unchanged. The family conformance release:
a 2026-11-03 audit of every consumer found the shell uniform but the bars,
station details, toggles, stamps, legends and category colors inconsistent.
The owner settled each rule (HOUSE-STYLE §1, §3, §4, §5.7, §6, §7).

### Changed
- **One control height in the navbar.** `.seg-btn` (30 px), `.mco-chip`
  (28 px) and `.mco-search-input` (32 px) now match `.nav-btn` at
  `--control-h`: 34 px on desktop, 40 px under `hover: none`, inside
  `.mco-navbar` and its drawer only. Outside the bar, sizes are unchanged.
  This changes rendered sizes in every consumer. It ships as a fix rather
  than a MAJOR by owner decision: no markup, API or behavior changes, and the
  touch sizes were already uniform.
- **`.modal-close` inherits the font**, so the × no longer renders in the
  browser's default button font.
- **`MCO.initInfoModal` focuses the close button** on every open.

### Added
- **Compact nav drawer:** `data-rail="compact"` on `.mco-navbar`. At
  portrait compact the bar is one row (badge · hot controls · search · ☰,
  ≤ 64 px; the badge holds the left edge, ☰ the right) and
  `.mco-nav-drawer` opens as a right drawer under it, with the
  drawer contract (inert, Esc, scrim, focus return). `MCO.initNavRail` gains
  a `search: {toggle, input}` option and `isDrawerMode()`. Plain `data-rail`
  is unchanged.
- **`MCO.formatUpdatedMT(ms, {into})`:** "Updated 2:45 PM MST", with the
  date when it is not today in Mountain time. `.refresh-status` hides the
  word visually at ≤ 1400 px and shows it in the drawer.
- **`MCO.initInfoModal({intro: {key, skip, defer}})`:** the first-visit
  auto-open, once per key, never on a deep link or after focus has moved.
- **`MCO.map.colocation(map, opts)`:** groups stations at one location
  (4-decimal buckets), draws a count badge and fans the members out as a
  spider on hover or first tap. Extracted from mesonet-status and
  mesonet-maintenance, and cross-checked with mesonet-explorer.
- **`MCO.map.stationPaint()`:** one uniform station circle; markers carry no
  network encoding.
- **`MCO.map.flyToAndOpen(map, opts)`:** opens a detail once the map is idle
  with the target in view, instead of on the first `moveend`.
- **Map category sets:** `MCO.palette.categorySet(name, theme)`,
  `CATEGORY_SETS`, `RESERVED_HUE`, `isReservedHue()` and `toOklch()`. Status,
  maintenance and umrb sets clear 3:1 on the surfaces, both CARTO basemaps
  and the tribal fill, stay ≥ ΔE 8 apart under protan, deutan and tritan
  simulation, and avoid the orange/brown band reserved for the tribal fill.
  `tools/check-contrast.mjs` gates them; `--report` prints the tables.
- **`demo/colocation.html`** and **`demo/palette-proposal.html`**.
- **`tools/verify/family-audit.mjs`:** measures every consumer's chrome and
  checks the family rules (control height, phone bar, badge, stamp, chips,
  `?station=` opens the sheet), against production or `--url` overrides.

### Fixed
- **`cog-protocol.js`** passes the tile's abort signal to block fetches and
  retries a short read once before giving up.

### Deprecated
- `MCO.map.markerPaint`'s network shapes, `MCO.map.colocatedHaloPaint`, and
  `MCO.palette.NETWORK`'s `shape` and marker `color`. They keep working until
  1.0.0.

## [0.20.0] — 2026-10-26

MINOR: map only. Theme, core, cog, palette, photos, places, summary and the
anti-flash snippet are byte-identical to 0.19.0, so their SRI hashes are
unchanged.

### Added
- **Basemap label corrections.** OpenStreetMap vandalism renamed Townsend
  "Fuck Townsend". OSM reverted it within minutes, but CARTO's tile build
  `20261001-03` still carries it and was showing it on every MCO map.
  `MCO.map.LABEL_CORRECTIONS` maps a bad label to its correct text, exact
  whole-label matches only. `MCO.map.correctBasemapLabels(map, table?)`
  rewrites every symbol layer's `text-field` to apply it, keeping each zoom
  `step` at the top level, and is idempotent.
- **`watchBasemap()` applies the corrections on every `style.load`** (first
  load, theme switch, retry). Pass `correctLabels: false` to opt out. A map
  that loads styles without `watchBasemap` should call
  `correctBasemapLabels(map)` from its own `style.load` handler.

## [0.19.0] — 2026-10-25

MINOR: theme, core and the anti-flash snippet. Map, cog, palette, photos,
places and summary are byte-identical to 0.18.0, so their SRI hashes are
unchanged. Owner decision for climate.umt.edu (website D29), admitted with
one consumer as an explicit exception to AGENTS rule 5.

### Added
- **Landscape tones**, in all three themes and `tokens.json`: section
  grounds `--band-sky`, `--band-prairie`, `--band-sage`; a fill `--prairie`
  with `--text-on-prairie`; and line tones `--prairie-line`, `--sage-line`,
  `--rust-line`. Chrome, not data (HOUSE-STYLE §2). In high contrast the
  bands are black. `tools/check-contrast.mjs` gates every text token on
  every band, `--accent-line` ≥ 3:1 on every band, each line tone ≥ 4.5:1 on
  every surface and band, and `--text-on-prairie` on `--prairie`.
- **`data-theme-default` on `<html>`.** The anti-flash snippet reads it
  after `?theme=` and the saved choice and before the OS preference, so a
  site can open in one theme whatever the OS says. **The snippet's CSP hash
  changed: recompute** (the exemplar's is updated).
- **`MCO.defaultTheme()`**: that default, else `MCO.osTheme()`. Compare
  `?theme=` writes against it.
- Demo: a landscape-tones section, so axe audits the bands in every theme.

## [0.18.0] — 2026-10-24

MINOR: theme only. Core, map, cog, palette, photos, places and summary are
byte-identical to 0.17.0, so their SRI hashes are unchanged. Owner decision
for climate.umt.edu, whose homepage photo hero stays dark (dark scrim, light
text) when the page is light.

### Added
- **Theme islands.** `data-theme="dark"`, `"light"` or `"high-contrast"`
  on any element below `<html>` gives its subtree that theme's tokens,
  whatever the page theme; islands nest. Light and high-contrast islands
  already resolved (their blocks were plain attribute selectors); dark did
  not, because its values lived on `:root` alone. The dark block's selector
  is now `:root, [data-theme="dark"]`. No token value changed.
  - An island also takes its theme's `--text-primary` as `color` and a
    matching `color-scheme`, from a zero-specificity rule that excludes the
    root, so any app or kit rule that sets `color` still wins.
  - Under `prefers-reduced-transparency`, `--glass` goes solid inside an
    island too (`html [data-theme]` beside `html:root`).
  - Still following the page theme, documented in HOUSE-STYLE §2: the
    `.mco-wordmark` pair and any other descendant selector on the root
    theme, `MCO.getTheme()` and `mco:themechange`.
  - Demo: a dark and a light island, so axe audits both inside every page
    theme. `tools/check-tokens.mjs` reads the new selector and fails if the
    dark block loses it.

### Changed
- The theme-invariant tokens that shared the dark block (`--font-*`,
  `--transition`, `--radius-*`) move to their own `:root` block, so a dark
  island does not reset an app's override of them. Same values; `<html>`
  resolves every custom property, `color`, `background-color` and
  `font-family` exactly as 0.17.0 in every theme (178 computed values
  compared in Chromium and WebKit, with and without reduced transparency).

## [0.17.0] — 2026-10-23

MINOR: one new published file. Theme, core, map, cog, palette, photos and
places are byte-identical to 0.16.2, so their SRI hashes are unchanged.
Owner decision: website DECISIONS D9, extraction #3 (the plain-language
conditions summary). Two consumers: the Station Dashboard's Now hero, which
this replaces, and climate.umt.edu's homepage conditions card.

### Added
- **`summary/mco-summary.js` → `MCO.summary`.** One sentence for a
  station's current conditions: "Partly cloudy tonight, calm, no
  precipitation in 3 days." A port of mesonet-dashboard's tested
  `web/src/core/overview/summary.ts`, with the pieces of `hero.ts`
  (`currentPeriod`), `series.ts` (`peakGust`, `hourlyPrecip`), `precip.ts`
  and `conditions.ts` that feed it. The same sentence, word for word, for
  the same inputs: every dashboard case is ported, and 40,000 random inputs
  (US and metric) plus 5,000 random hourly row sets matched the TypeScript
  on every one.
  - **Pure core**, needing nothing from core: `summarize(input)` and its
    rules (`skyPhrase`, `windClass`, `windPhrase`, `compassWord`,
    `daysSincePrecip`, `precipPhrase`, `isEvening`), with the thresholds as
    constants (`CALM_MPH` 1, `NOTABLE_GUST_MPH` 25, `PRECIP_MIN_IN` 0.01,
    `DRY_CAP_DAYS` 7). The time of day comes in as Mountain wall-clock ms,
    never from the system clock. Data and thresholds are US; `units: 'si'`
    prints the two amounts in mm and m/s.
  - **Rows:** `inputFrom({latest, hourly, ppt, periods, units})` builds the
    input from API rows; `peakGust()`, `hourlyPrecip()`, `precipTotals()`,
    `readWind()`, `currentPeriod()`. A row's `datetime` may be a Mountain
    wall-clock string (the API's CSV, as the dashboard reads it) or epoch ms
    (the API's JSON), converted with Intl in America/Denver, never the
    viewer's zone. No `/latest/` row, no sentence (as on the dashboard).
  - **Optional fetcher:** `load()` / `forStation({station, lat, lon,
    derivedPpt, latest, units})` reads mesonet2 `/latest/`,
    `/observations/hourly/` (ppt and windgust from Mountain midnight two days
    back, level 2) and `/derived/ppt/`, and the NWS forecast for the point.
    Each part that fails is null and left out of the sentence; it never
    rejects and never returns an error string. A forecast URL off
    api.weather.gov is never fetched. CSP `connect-src`:
    `https://mesonet2.climate.umt.edu https://api.weather.gov`.
- `tools/check-summary.mjs` (node:test, vm; run in CI under three time
  zones), a demo Summary card and two a11y probes, a `cdn.html` row, CI
  wiring, and README / HOUSE-STYLE §4 notes.

### Changed
- `tools/a11y-audit.mjs`: the places ZIP-code probe waits for the
  announcement instead of a fixed 150 ms, which raced under load.

## [0.16.2] — 2026-10-23

PATCH: tooling only. Every published file (theme, core, map, cog, palette,
photos, places, fonts, assets, tokens) is byte-identical to 0.16.1, so the
SRI hashes are unchanged; only the version in the pinned URLs moves.

### Tooling
- **The verify harness retries a failed scenario once.** A website deploy
  failed on 2026-10-23 because one WebKit page visit logged `Failed to load
  resource: HTTP/2 Error: NO_ERROR`, a connection reset fetching a
  third-party file; every other scenario passed and a re-run passed.
  `tools/verify/lib.mjs` gains `scenario()`: `axe-matrix.mjs` re-runs a
  page visit (engine × scenario × theme × width) in a fresh context when
  any of its checks fails, and `keyboard.mjs` does the same per probe block
  (the app's `probes` function counts as one block). Exactly one retry; a
  retry prints `↻ retried <scenario>, passed|failed again (first attempt:
  <reason>)`, and when it fails too its results are what count. The checks
  are unchanged: a console error, page error or CSP violation passes only if
  it does not recur. `VERIFY_RETRIES=0` disables it (default 1). `head.mjs`
  and `lint-css.mjs` read files and have nothing to retry; the canary keeps
  its own crash retry.
- `tools/check-verify.mjs`: unit tests for the retry with fake scenarios
  (fails once then passes; fails twice; throws; `VERIFY_RETRIES`). Runs in
  CI.

## [0.16.1] — 2026-10-23

PATCH: core only. Theme, map, cog, palette, photos and places are
byte-identical to 0.16.0, so their SRI hashes are unchanged; core's hash
changes.

### Fixed
- **Default search rows read "label, meta" to screen readers.**
  `MCO.initSearchBox`'s default row put the label and the mono meta in two
  adjacent spans with nothing between them, so the option's text ran
  together ("Gallatin30031", "BozemanHydroMet"): axe's accessible-name
  computation and `textContent` both read it that way, and Chromium's AX
  tree read "Gallatin 30031" with no pause. A visually hidden `", "`
  (`.sr-only`, absolutely positioned, so not a flex item) now sits between
  them: the name is "Gallatin, 30031". The row looks the same (screenshots
  of the open demo list are pixel-identical to 0.16.0 in all three themes,
  Chromium and WebKit). Affected every `initSearchBox` consumer using the
  default row since 0.8.0, including `MCO.places.initPlaceSearch`. Rows
  drawn by an app's `renderRow`, group headings, and the "No matches" and
  truncation notes are unchanged. An app that reads an option's
  `textContent` now gets the separator in it.
- Demo: the Places card's result list gets the same separator.
- `tools/a11y-audit.mjs`: a keyboard probe asserts the default row's name
  separates label and meta and that the separator is visually hidden.

## [0.16.0] — 2026-10-22

MINOR: one new published file, and two additive options in core. Theme,
map, cog, palette and photos are byte-identical to 0.15.1, so their SRI
hashes are unchanged; core's hash changes. Owner decision: website
DECISIONS D9, extraction #2 (place search). Two consumers: the Station
Dashboard, which this replaces, and climate.umt.edu's station search.

### Added
- **`places/mco-places.js` → `MCO.places`.** A typed county, reservation,
  tribe, town or ZIP code resolves to a point, and a point to the nearest
  stations with great-circle distances. A port of mesonet-dashboard's
  tested `web/src/core/places` and `web/src/core/stations/nearest.ts`.
  Loads after `core/mco-core.js`.
  - **Gazetteer:** `places/mt-places.json`, the US Census 2026 Gazetteer
    Files for Montana (public domain): 56 counties, 7 reservations, 497
    towns and CDPs, 369 ZIP codes, and the Little Shell Tribe at Great
    Falls; 930 places, 47 KB (15 KB gzipped). Byte-identical to the
    dashboard's copy, and regenerated from Census by
    `tools/vendor-places.mjs`. `load()` fetches it from the tag the script
    came from with `integrity` set to a hash the module carries, so the
    data is pinned by the script's own SRI. `{url}` loads a vendored copy.
  - **Stations for a place:** `stationsFor()` lists a county's stations
    (by the catalog's `county`), a reservation's (inside its boundary,
    `pointInGeometry()`, from the kit's `map/data` file via `loadAreas()`),
    else the five nearest; `announcement()` says it ("5 stations near
    Bozeman"). `nearest({lat, lon}, stations, n)`, `haversineKm()`,
    `formatMiles()`.
  - **Search:** `items()` makes places into search items (query-only, in a
    "Places" section, the kind as meta). **`initPlaceSearch()`** is
    `MCO.initSearchBox` over the app's stations with the places added: they
    load on first focus, a station pick goes to `onSelect`, a place pick is
    resolved and goes to `onPlace` (reservations load their boundary on the
    first pick), and the count is announced. Not a second combobox.
  - **Near me:** `locate()` / `nearMe()`, for a button press only. A
    failure rejects with a `reason`: `denied`, `unavailable`, `timeout` or
    `unsupported`. Nothing asks for a position on its own.
- **`MCO.searchModel` sections** (core): items may carry `section` and
  `queryOnly`, and `filter(items, q, limit, sectionLimits)` takes a fourth
  argument. With a query, matches sort by section before rank, each
  section is headed when more than one matches, and `sectionLimits` caps
  one; queryOnly items stay out of the no-query list. The dashboard's model,
  where it was tested. **`MCO.initSearchBox({sectionLimits})`** passes it
  through. Items with neither field filter exactly as in 0.15.1
  (`tools/check-places.mjs` compares the two cores on the station catalog).
- `tools/check-places.mjs`: the dashboard's place, nearest and section tests
  ported to `node:test`, the data hashes, `KIT_BASE`, the loaders and
  geolocation failure reasons; `--live` checks the mesonet2 station catalog
  against the gazetteer, and with `KIT_TAG` the files jsDelivr serves.
- Demo: a Places card (`initPlaceSearch` over a fixture of 24 stations, and
  Near me). The a11y audit probes it in both engines: sections headed,
  the station active, axe on the open list, a ZIP and a reservation pick.
  `demo/cdn.html` loads the published file and its data with integrity.
- HOUSE-STYLE §4: place search conventions. README: usage, CSP
  (`connect-src https://cdn.jsdelivr.net`).

### Notes
- `MCO.versions.places` reports `'0.1.0'`, like its siblings. Not a version
  check.

## [0.15.1] — 2026-10-22

PATCH: one fix in `map/mco-map.js`. Theme, core, cog, palette and photos
are byte-identical to 0.15.0, so their SRI hashes are unchanged.

### Fixed
- **Tribal-label font stack.** `MCO.map.TRIBAL_LABEL_LAYOUT` asked CARTO's
  glyph endpoint for `Open Sans Semibold, Arial Unicode MS Bold`, which CARTO
  no longer serves (404, alone or in that stack). Every map drawing tribal
  labels logged a 404 per page, and the label face was not the one
  specified. The stack is now `Montserrat SemiBold, Open Sans Bold`, the bold
  label face CARTO's own dark-matter, positron and voyager styles use; the
  stack URL MapLibre requests returns 200. Owner decision. No selector,
  token, signature or default changes.

## [0.15.0] — 2026-10-22

MINOR: one additive option in `photos/mco-photos.js`. Theme, core, map,
cog and palette are byte-identical to 0.14.0, so their SRI hashes are
unchanged. Owner decision: website DECISIONS D16, which corrects D15's
reading of D7. The 2026-10-22 public start is for the website's photo hero
only; the Photo Explorer and the Station Dashboard keep the full public
history.

### Added
- **`{fullHistory: true}`** on `MCO.photos.parseSchedule()` and
  `MCO.photos.load()`: a public schedule with no date floor and no `REAIMED`
  block. Pre-cutover North and South (aimed at the pluviometer and the snow
  stake until 2026-10-21 16:00 MDT) are offered and labelled "North" and
  "South", as the tools showed them before 0.14.0. The audience is still
  public: Snow, North Snow, South Snow, Pluvio and Solar stay behind
  `{internal: true}`, the retired sky views (NS, SS) stay staff-only, PARK
  is never a view.
  - Precedence for the first date: an explicit `since` (null included),
    else none for `internal` or `fullHistory`, else `PUBLIC_SINCE`. An
    explicit `since` never brings `REAIMED` back under `fullHistory`.
  - The parsed schedule carries `fullHistory`; `frameFilter()`,
    `fetchMonthFrames()`, `fetchLatestFrames()`, `listDay()`,
    `confirmDerived()` and `initPhotoControls()` follow it through the
    schedule. `frameFilter(null)` is still the public default.
  - `load()` caches `fullHistory` under its own key.
  - `fullHistory` with `internal` is the same as `internal`.
- `tools/check-photos.mjs`: full-history cases (pre-cutover N/S back to the
  first archived month, the default still clamped, staff unchanged, `since`
  precedence, the cache key) and a `--live` check against data2.

### Unchanged
- **The default.** A caller passing nothing still gets the 2026-10-22
  public start in every direction. The website does not pass `fullHistory`.

## [0.14.0] — 2026-10-22

MINOR: one new published file, additive API. Theme, core, map, cog and
palette are byte-identical to 0.13.1, so their SRI hashes are unchanged.
Owner decisions for this release are website DECISIONS D7, D8, D9 and D15:
the D7 clamp covers every public surface and every direction (first public
date 2026-10-22); public order is N, E, S, W; staff labels for pre-cutover
N and S stay "North" and "South".

### Added
- **`photos/mco-photos.js` → `MCO.photos`** (website D9, extraction #1).
  Mesonet station photos from the data2 archive, for any app that shows
  them. A port of mesonet-dashboard's tested `web/src/core/photos` merged
  with the slot rules mesonet-photo-explorer relies on. Loads after
  `core/mco-core.js`. Two consumers today (dashboard, Photo Explorer), three
  with climate.umt.edu, so it passes the admission rule.
  - **Schedule:** `load()` (cached; `{fresh: true}` refetches) / `parseSchedule()` read `schedule.json` into
    per-station view windows. The capture schedule is never written into the
    kit. `slotsForDate()` offers the slots at least half the shooting
    stations were scheduled for (so a one-camera hourly pilot stays out of
    the menu); `viewsForSlot()`, `isShotAt()`, `viewsBetween()`,
    `hasCamera()`.
  - **Time:** `readySlots()` (the processing lag), `latestSlot()`,
    `previousSlot()`, `resolveTime()` (the wanted time, else the next later
    one, with a `reason`: `pending` or `unscheduled`), `resolveView()`,
    `rollMessage()`.
  - **Mountain wall clock ↔ UTC**, which the kit did not have:
    `toUtcMs()`, `toWallClock()`, `localYmd()`, `compactUtc()`, `parseUtc()`,
    `utcDaysOfLocalDay()`, and engine-stable `slotLabel()`, `timeLabel()`,
    `stampLabel()`. DST-safe; tested under three process time zones.
  - **Archive:** `frameUrl()`, `manifestUrl()`, `parseManifest()` (the
    blank-`webp_large` quirk and the snap limit), `parseListingKeys()`,
    `framesFromListing()`, `fetchMonthFrames()`, `fetchLatestFrames()`,
    `confirmDerived()`, `framesFor()`, `newest()`.
  - **Vocabulary:** `VIEWS`, `ORDER`, `label()`, `shortLabel()`,
    `viewName()` (keeps the visible text inside the accessible name, WCAG
    2.5.3), `isPublic()`, `isVisible()`. NSNOW and SOLAR are registered.
  - **`MCO.photos.initPhotoControls()`**: the date / time / direction group
    on `MCO.initStepper` and `MCO.initSegmentedFallback`. Reads `?date`,
    `?time`, `?dir`; keeps the wanted time and view sticky across days;
    reports moves the visitor did not ask for as `rolls` and announces them
    once stepping settles. It does not write the URL: `params()` gives the
    app its part.
- **Public and staff views are decided here, once** (website D7, D8). The
  public sees N, E, S, W, North by default. That is an allowlist, so a view
  the schedule adds later is staff-only until it is added to the kit. Staff
  views need `{internal: true}`. PARK is never a view. Before 2026-10-21
  16:00 MDT, N was aimed at the pluviometer and S at the snow stake, so the
  public default starts there (`PUBLIC_SINCE`), and a public N or S frame
  from before it is never offered even when an app widens the range
  (`REAIMED`).
- `tools/check-photos.mjs`: the dashboard's tests ported to `node:test`,
  plus the Photo Explorer's slot rules and the D7/D8 rules. Zero
  dependencies: the kit loads in `node:vm` as `check-contrast.mjs` loads the
  palette. CI runs it under `America/Denver`, `Pacific/Kiritimati` and
  `Etc/GMT+12`. `--live` also checks the live data2 files.
- Demo: a Photos card exercises `initPhotoControls` over a fixture schedule.
  `demo/cdn.html` checks the published file; `snippets/head.html` carries
  its tag.
- README: how a consumer's Node tests load the pinned kit files in
  `node:vm` (the dashboard's vitest suite does this, D15).

### Notes
- `MCO.versions.photos` reports `'0.1.0'`, like `core`, `map` and
  `palette`. The field is still not a version check; the pinned URL is.

## [0.13.1] — 2026-10-10

PATCH: theme and core. Map, cog and palette are the same as 0.13.0.

### Fixed
- **Autolift no longer lifts anything off the top of the map.** With
  `html.mco-autolift`, a tall `[data-autolift]` panel (or a MapLibre
  corner) rode past the top of its container when the sheet was taller
  than the room above it. In the 750×342 rail, status's 234px legend went
  to −153px with the sheet at peek. `MCO.metrics` now gives each lifted
  element its own `--lift`: the overlay height, capped at the room between
  its resting top and its container's top, less 8px. It updates when the
  sheet or tab bar height changes, on resize, and when a lifted element
  resizes (a legend collapsing). Without JS the CSS falls back to the old
  uncapped lift.
  - Verified on status (with `data-autolift` on its legend) in Chromium and
    WebKit: at 390×844 with the sheet at 212px the legend lifts the full
    amount; with the sheet at 600px, and in the 750×342 rail at 150 and
    300px, the legend and the corners stop 8px below the map's top.

## [0.13.0] — 2026-10-10

MINOR: theme only. Core, map, cog and palette are the same as 0.12.0.

### Added
- **`[data-autolift]`** (#45): with `html.mco-autolift`, an app's own
  bottom-corner panel lifts by `--overlay-bottom` together with MapLibre's
  bottom corners, so the attribution no longer rides up over a legend when
  the sheet opens. It uses the `translate` property, so it composes with a
  panel's own `transform`. Opt-in, like autolift itself. Verified on status
  at 390 in Chromium and WebKit: the legend keeps its offset to the corner,
  clears the sheet, and returns when it closes.

## [0.12.0] — 2026-10-10

MINOR: palette only. Theme, core, map and cog are the same as 0.11.3.

### Added
- **`MCO.palette` `roma`**: Crameri's roma (v8), 11 stops, diverging with
  `midpoint: 0.5`. It is the house ramp for status-style data (HOUSE-STYLE
  §6), which status, maintenance and umrb had each pasted by hand. Like every diverging ramp it has no mark
  `span()`: use it as fills with an outline (`--dot-stroke`), which is how
  all three draw it.

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
