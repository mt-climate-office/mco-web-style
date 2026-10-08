# The MCO House Style

Brand, UX, accessibility, and engineering conventions for Montana Climate Office
web properties — one document, because in this family they are not separable:
the accent color is also a WCAG contract, the breakpoint is also a JS constant,
and the legend is also a screen-reader surface.

Operational guardrails (the do/don't list for contributors, human or AI) live in
[AGENTS.md](AGENTS.md). Per-app adoption status lives in [CONSUMERS.md](CONSUMERS.md).

---

## 1. Identity

**Accent.** The MCO web accent is **`#1a6faf`** (with light/dark/high-contrast
companions in the tokens). This was decided in 2026-08 over two competitors
still in the wild: the climate.umt.edu Jekyll skin ships `#08729e` (one SCSS
variable, to be migrated), and the mailing-list templates ship `#52adc8`
(a drift to be corrected — its own README claims it matches the website, and it
doesn't). New work uses the tokens; never introduce a fourth blue.

**Logo.** `assets/mco-logo.png` (vendored copy of the canonical
`MCO_logo_icon_only.png`). In a navbar it is 40×40, wrapped in a link to
`https://climate.umt.edu`, with `aria-label="Montana Climate Office"` on the
link and empty `alt` on the image. Do not hot-link the logo from
`climate.umt.edu` in new work — one property already links a path that 404s.

**Naming.** App title in the navbar brand block, uppercase, `--text-muted`;
beneath it the subtitle line, italic, `--text-dim`:
**“A service of the Montana Climate Office.”** Every public MCO app carries this.

**Page title.** `<Short name> · <Family>` — one middot, spaces either side.
Decided 2026-08 across a family that had drifted to four separators (`·`, `—`,
`|`, none) and two orderings.

- **Short name** is the *shortest distinctive* word or phrase — the thing that
  tells this app apart from its siblings, not a description of it. “Explorer”,
  not “Mesonet Explorer”; “Photos”, not “Photo Explorer”. Keep a qualifier only
  where it carries meaning rather than repeating the family: **“UMRB Build”**
  keeps UMRB because that is a distinct project; nothing keeps “Mesonet”,
  because the family half already says it.
- **Family** has a short and a long form, and *which one you use depends on
  where the text lands*:

  | | Family form | Used in |
  |---|---|---|
  | **Tab** | `MT Mesonet` · `MCO` | `<title>` |
  | **Card** | `Montana Mesonet` · `Montana Climate Office` | `og:title`, `twitter:title`, `og:site_name` |

  A tab is read at a glance by someone who already knows what they opened, and
  truncates at ~fifteen characters — so the family half is abbreviated there.
  A link card is read in Slack or on social by someone who may never have heard
  of the office, has room for the full name, and is the one surface where an
  initialism costs you. The **short app name is the same in both**; only the
  family half changes.

- `og:site_name` takes the **long family alone**, not the app name — that is
  what the field means, and every app currently gets it wrong by repeating its
  own title.

Why so short: a tab bar truncates to roughly fifteen characters, and the old
titles collapsed to near-identical prefixes there (“Station Stat…” vs “Station
Main…”). The distinctive word has to come first to survive — and with the tab's
family half abbreviated too, most titles now fit whole.

Target titles per app live in CONSUMERS.md; apply on migration.
⛔ `mco-drought-dashboard` is excluded from this and every other family-wide
sweep — see its CONSUMERS.md row.

**Typography.** `--font-ui` — **Outfit** (400/500/600/700) for UI text.
`--font-mono` — **Space Mono** for numerals, station IDs, timestamps, scale
labels, `<kbd>`. Kit-hosted in `fonts/` and declared by `mco-theme.css` with
`font-display: block`; pages preload the two latin files (`snippets/head.html`)
so the first frame is already in Outfit — no system-font flash, no swap. The tokens
carry system fallbacks. Don't add other families — the drought dashboard's Inter
is drift, not precedent.

**Voice.** Plain, confident, unhedged. Info modals explain what the colors mean
and where the data comes from; footers and exports credit
`Montana Climate Office · climate.umt.edu`.

---

## 2. Tokens

The tokens in `theme/mco-theme.css` (mirrored in `tokens/tokens.json`) are the
only place colors live. **A hard-coded hex in app code is a review-blocker**
unless it is data-encoding (a color ramp) or carries a contrast comment (§5.10).

The contrast contract, enforced by CI (`tools/check-contrast.mjs`):

| Foreground | Permitted on | Guarantee |
|---|---|---|
| `--text-primary`, `--text-secondary` | deep, surface, raised | ≥ 4.5:1 |
| `--text-muted`, `--text-dim` | deep, surface **only** | ≥ 4.5:1 |
| `--accent-line` | deep, surface, raised | ≥ 3:1 |
| `--text-on-accent` | `--accent` and `--accent-fill-hover` fills | ≥ 4.5:1 |
| `--danger`, `--warning`, `--success` | deep, surface, raised, and their own `--*-fill` | ≥ 4.5:1 (so ≥ 3:1 as lines) |
| `--text-on-danger`, `-warning`, `-success` | the matching `--*-fill` | ≥ 4.5:1 |

Hard-won rules encoded here:

- **`--accent` is a fill color.** Against dark surfaces it only reaches
  ~2.3–2.9:1. Use it behind `--text-on-accent`; for borders, icons, or text use
  `--accent-line`. (All four original apps shipped accent borders that failed
  WCAG 1.4.11 — the kit's `.nav-btn` fixes this.)
- **`--text-muted` on `--bg-raised` fails (~4.2:1).** That pair is excluded from
  the contract on purpose; use `--text-secondary` there. (An older in-code
  comment cites “~4.4:1 on --bg-surface” — that number doesn't reproduce;
  surface pairs pass. Raised is the real trap.)
- **`--text-dim` is `#8494ab`** (dark). mesonet-status drifted to `#6b7a90`,
  which fails AA at subtitle size — the single clearest argument for these
  tokens being shared. Fix on migration.
- `--selection-ring` tokenizes the map selection-halo color that apps hard-coded.
- **Status tones are chrome, not data** (0.8.0). `--danger` / `--warning` /
  `--success` and their `-fill` / `text-on-` companions are for form errors,
  notices (`.mco-notice`) and failure banners. They replace the per-app
  `--c-warn` / `--warn-bg` copies (maint, umrb) and explorer's uncommented
  `.scale-hint` hexes. A station's "dead" or "stale" **category is data**: it
  takes a data palette under §6, never a status token. Tone never stands
  alone. Always pair it with a word ("Error", "Warning") or an icon.

**Theming.** Three themes: `dark` (default), `light`, `high-contrast`, switched
by `data-theme` on `<html>`. The high-contrast theme is a first-class citizen
(promoted from the drought dashboard): pure-black surfaces, brightened accent,
`--text-on-accent` flips to black. Any new token must be defined in **all
three** blocks — CI enforces parity.

---

## 3. Layout, chrome & responsive

**Navbar** (`.mco-navbar`): glass bar, 52 px min-height, brand-gradient
underline via `::after`. Order: logo → divider → brand → `.controls` →
`.nav-meta` (right-aligned). Buttons are `.nav-btn` (34 px, `.icon-only`
variant), segmented groups `.seg-btns > .seg-btn`, info button `.mco-btn-info`.
**One primary action per view** is `.nav-btn.is-primary` (0.8.0): a filled
`--accent` with `--text-on-accent`. Never hand-roll `color: #fff` on the
accent, which is 2.2:1 in high contrast.

**Glass panels** (`.mco-panel`): floating surfaces over the map (legend,
filters). Head + collapsible body; wire with `MCO.initCollapsible`.

**Z-index ladder**: add to a tier, never invent a number. Tiers (from
`--z-map-ctrl: 2` to `--z-toast: 400`) are documented in the CSS. MapLibre's
vendor controls are z-index 2; map popups ship with none — anything above the
controls must use a tier.

**Breakpoint ladder** — layout in real `@media` rules, behavior via
`MCO.viewport`:

| Width | What sheds |
|---|---|
| ≤ 1400px | button/control text labels (`.btn-label`, `.control-label`) — the buttons then square to 34px (40px on touch) so they match `.icon-only` neighbours; `.mco-btn-info` keeps its circle |
| ≤ 1060px | chrome padding and gaps tighten |
| ≤ 750px | the whole brand lockup — title, subtitle, and divider; the logo badge remains |
| ≤ 640px | `.refresh-status`; a navbar search field collapses to a disclosure (`.mco-search-collapse` + `MCO.initSearchCollapse`) and reopens as an overlay bar; **compact mode** begins |

Because `.btn-label` sheds below 1400 px, **any button that relies on it for
its name must carry a permanent `aria-label`** — otherwise the button becomes
nameless at laptop widths (the kit's axe audit fails exactly this).

`.control-label` is different: it is normally a `<label for>` naming a real
control, so the kit hides it **visually** below 1400 px rather than removing it.
`display: none` would strip the name from the input it labels — mesonet-photos
shipped exactly that, with a nameless date input and time select at every width
below 1400 px, until v0.5.1. **Run axe at a narrow viewport, not just at desktop:**
a shed label is invisible to a 1440 px-only audit.

The brand collapse at ≤750 px is a default, not a mandate: an app whose navbar
wraps to extra rows instead (mesonet-status) may opt out — note the choice in a
comment. Opting out takes **two** rules, because the kit hides the lockup and
the divider separately:

```css
/* kit-override: branding at all widths */
@media (max-width: 750px) {
  .mco-navbar .brand { position: static; width: auto; height: auto;
                       margin: 0; clip: auto; overflow: visible; }
  .mco-navbar > .nav-divider { display: block; }
}
```

The lockup is *visually* hidden, not removed, so the brand title may be the
page's `<h1>` (status does this; good for document outline) as long as it
carries `.brand-title` — the outline survives the mobile collapse, and screen
readers keep the app name at every width. Panel collapse (`.mco-panel-body` + `MCO.initCollapsible`)
animates by default and then removes collapsed content from the tab order.

**Compact** is `(max-width: 640px), (max-height: 560px)` — note the height
clause: a short landscape phone is compact too. This string exists in exactly
two places (CSS §6 comment and `MCO.viewport.COMPACT_MQ`) and they must stay in
sync. Compact drives JS decisions: bottom sheet instead of anchored popup,
panel auto-collapse, control relocation into a drawer.

**Mobile patterns** (reference implementations in mesonet-explorer):
- Off-canvas drawer + `.mco-scrim`, panel at `--z-drawer`.
- Bottom sheet for detail panels on compact — peek state, drag-up, and it must
  lift bottom-corner map controls and the toast (`--sheet-h` custom property).
- Full-viewport apps use `100dvh` (never `100vh`) and `overflow: hidden` on body.
- **`viewport-fit=cover` is required** for the safe-area insets in the kit CSS
  to be live — without the meta, `env()` silently resolves to 0 (two apps
  shipped exactly this bug). Use `max(1rem, env(safe-area-inset-*))` padding on
  edge-hugging chrome.
- Segmented button groups that don't fit under 1060 px get a `<select>`
  fallback (photo explorer pattern).
- A navbar **search field collapses to a disclosure** at compact widths (≤640 px)
  rather than being hidden: `MCO.initSearchCollapse` moves focus into the field on open and
  back to the button on close, and the app keeps control of Esc precedence and
  of its own `/` shortcut. Hiding search outright strands the only keyboard
  route to a named feature — don't.
- **A control-dense bar still wraps on a phone even with search collapsed.** The
  sanctioned next step is relocating `.controls` into an off-canvas drawer
  (`.mco-scrim`, `--z-drawer`). mesonet-status is the natural first kit consumer
  of that — deferred 2026-08-04 as its own design pass rather than riding along
  on a breakpoint change.

  mesonet-explorer is the working reference for the *pattern*. A scrim that
  should dim the map but not the navbar above it is
  `<div class="mco-scrim" data-scope="container" aria-hidden="true">` inside
  the positioned map frame (0.8.0). It replaces explorer's hand-rolled
  `absolute` `#sidebar-scrim`; the dashboard's compact drawer was the second
  consumer that brought the option into the kit. The default stays
  viewport-`fixed`.

**Navbar gap.** Tighten `.mco-navbar` spacing through its `--nav-gap` custom
property, never `gap` directly: the brand lockup's divider margin is derived
from it (`calc(0.4rem - var(--nav-gap))`), so setting `gap` alone desynchronises
them and squeezes logo/divider/title together. That was a real bug at ≤1060 px,
fixed in v0.5.0.

---

## 4. Interaction conventions

**URL is the primary state.** Read once at boot with precedence
**URL param > localStorage > default**, validating every value against a
whitelist (helpers: `MCO.getParamLower`, `MCO.splitTokens`). Mirror state back
on every mutation and on map `moveend`. Share buttons copy `location.href`, so
the URL must already be the complete view.

**Replace vs push** (0.8.0):
- **`MCO.replaceUrlState(params)`** is for *view adjustments*: camera,
  filters, theme, variable, date scrubbing.
- **`MCO.pushUrlState(params, {state})`** is for *drill-down*, where a user
  expects Back to undo it: opening a station detail or sheet, switching a
  top-level section, opening a shareable gallery item. Push only on the
  **first** step from a "no detail" state, and replace while the detail stays
  open. Pushing on every station click floods the history.
- **Back closes the detail.** It does not re-open the previous station's
  camera. A close button on a pushed detail calls `history.back()` (mark the
  entry with `{state: {mcoDetail: id}}` so it can tell), and
  `MCO.onUrlState(fn)` applies the result. On Back/Forward the app announces
  the restored view (“Station closed”, “Ag tab”, §5.1) and moves focus to the
  restored surface's heading, or to `#main`.
- Name app wrappers for what they do (`writeUrl`). Three apps called a
  `replaceUrlState` wrapper `pushState`, which is now a different thing.
- **Clean URLs:** an all-defaults view has no query string. Write the camera
  with `MCO.map.cameraParamsIfDefault(map)` (it returns `{}` at the default
  extent) and `theme` only when it differs from `MCO.osTheme()`.
- Write the URL at most once per task. A hash that carries state (a tab) needs
  `{keepHash: true}` on both writers until 1.0.0 makes it the default.
- `?kbd=off` is re-emitted by both writers and stays out of share links
  (§5.9).

**localStorage namespace.** `mco-theme` is deliberately shared org-wide on an
origin — a theme choice follows the user between apps. Everything else is
app-prefixed (`mco-<app>-*`). Persisted values are re-validated on read exactly
like URL params: another app, or last year's version of yours, may have written
them.

**Theme switching** re-styles the map (`map.setStyle(...)` wipes custom
sources/layers — re-add them in `map.once('style.load', …)`). Use
`MCO.initThemeToggle`; it maintains the icon swap and the button's
`aria-label`.

**Notices** (`MCO.notice`, `.mco-notice`, 0.8.0) for anything that must
persist or offer an action: a failed load with Retry, a data caveat, an
outage. `data-tone` is info, warning, danger or success, built on the status
tokens (§2), and the tone word is always visible text. Over a map, use
`place: 'over'` (`data-place="over"`), which sits on the `--z-map-notice` tier.
Never invent a `calc(var(--z-map-notice) + 1)`. `.mco-empty` is the same shell
for an empty state. `role=alert` semantics (an assertive announcement) are for
failures only. Dismissal keys are app-prefixed and session-scoped.

**Toasts** (`MCO.showToast`) for transient status, 2800 ms default (canonical —
three apps had drifted to 2200/2400/2800). Longer explicit per-call durations
for errors (e.g. 6000 ms) are fine; don't change the default. **Dialogs** are native `<dialog>`
via `MCO.initInfoModal`: backdrop click closes, focus returns to the opener.
First-visit info modals auto-open once, gated by an app-prefixed localStorage
key. **`?export=` convention**: a URL param that forces a theme and triggers
the app's export path — keeps branded-PNG generation headless-scriptable.

---

## 5. Accessibility standards

These are mandates, not suggestions. Each has a working reference
implementation in the family; CI runs axe over the kit demo in all three
themes.

1. **Live region for canvas changes.** Anything a sighted user learns from the
   map/canvas re-render is announced through **`MCO.announce(text)`**, the
   page's one announcer (0.8.0). Don't hand-make an `#sr-announce`: the kit's
   regions exist from script load (a region created with its first message is
   often not read), clear before setting (so a repeat is re-read), and drop
   duplicates within 500 ms. **What must be announced:**
   - filter or count changes (“42 stations shown: HydroMet”)
   - a selection opened or closed (“Bozeman opened”, “Station closed”)
   - load failures (`{politeness: 'assertive'}`; the only assertive case)
   - tab, section or view changes, including Back/Forward (“Ag tab”)

   A toast is itself `role=status`. When the same words already went through
   `MCO.announce`, show the toast with `MCO.showToast(msg, ms, {announce:
   false})` or screen readers hear it twice.
2. **Hidden-table twin.** Every canvas/WebGL data layer has a hidden table
   rebuilt per render from the same features the canvas drew, with a caption,
   `scope`d headers, a row-header column and textual state (“no data”,
   “(stale)”). Build it with **`MCO.srTable`** (0.8.0). It puts `.sr-only` on a
   wrapping `div` (a `<table>` ignores `height: 1px`), uses textContent
   only, caps at 500 rows with a closing “…and N more” row, and rebuilds only
   when the rows change. `selectable: true` makes the twin the map's keyboard
   route: one Tab stop, arrows/Home/End, Enter selects, `aria-current` on the
   selection *(the dashboard's map twin)*. Give the canvas an `aria-label`
   ending “The data is in the table that follows.” Never wire the table to a
   live region: announcements say what changed (rule 1), and the table is
   what is there.
3. **Reduced motion, two layers.** The CSS blanket comes with the kit; JS
   camera moves and paced reveals gate on `MCO.reducedMotion()` — which is
   live, not a boot snapshot.
4. **One universal focus ring.** `:focus-visible` ships in the kit. Never
   write per-selector focus rules; a control added later would ship without one.
5. **Touch targets** ≥ 40 px (44 px for close buttons) under
   `@media (hover: none)` — kit components comply; match them in app CSS.
6. **Skip link** (`snippets/skip-link.html`) on every page; target container
   gets `id="main" tabindex="-1"`.
7. **`aria-pressed` is the styling source of truth** for toggles — CSS keys off
   `[aria-pressed="true"]`, so the accessible state can never drift from the
   visual state. Pair with swapped `aria-label`s where the action inverts.
8. **Keyboard twin for every pointer gesture.** Double-click-to-isolate gets
   Shift+Enter; hover-only reads get a click/focus path. A hover tooltip over
   canvas is `aria-hidden` decoration — the same content must reach AT another
   way (rule 1 or 2).
9. **Single-character shortcuts require an opt-out** (WCAG 2.1.4): support
   `?kbd=off`, disclose it in the info modal, and re-emit it on pushState so a
   user who needs it doesn't re-add it every visit — but exclude it from shared
   links (it's the sharer's input preference, not part of the view).
   *(mesonet-explorer)*
10. **Contrast comments.** Any color that can't be a token (map strokes over a
    basemap) carries a one-line comment naming the surface it was measured
    against and the WCAG criterion. *(mesonet-explorer `mutedStrokeColor()`)*
11. **Decorative elements are `aria-hidden`** — legend swatches, icon SVGs,
    dividers. The adjacent text carries the meaning.
12. **Dialogs**: `aria-labelledby`, Esc closes, focus restores to the opener
    (handled by `MCO.initInfoModal`).

---

## 6. Color & CVD policy

Brand tokens are for chrome. **Data always gets its own palette**, chosen under
these rules:

- **Approved ramps**: Crameri scientific colour maps (CVD-safe by
  construction; `batlow` is the default sequential) and the
  colorblind-safe ColorBrewer set (`RdBu`, `BrBG`, `YlGnBu`, `YlOrRd`,
  `Blues`, `PuRd`). **`Spectral` is banned** — it traverses red→green and is
  explicitly not colorblind-safe (it survives in one ramp picker as legacy;
  remove on migration).
- **Diverging ramps require a labeled midpoint** (freezing, 0, 50%). Cyclic
  ramps (`romaO`) only for cyclic quantities (wind direction), labeled N…S…N.
- **Color is never the sole channel** (WCAG 1.4.1). Redundancy options, in
  preference order: text labels in the legend, numeric readouts in
  tooltip/popup, shape (mesonet-explorer's filled/hollow dot forms survive
  grayscale entirely), position, live-region announcements.
- **Prefer lightness-monotonic sequential ramps** — they survive grayscale and
  every CVD type.

Known issues in fielded palettes (fix on migration, tracked in CONSUMERS.md):
the status map's roma-sampled bins put its two semantic extremes at nearly the
same lightness (fresh teal L≈0.20 vs dead red L≈0.14 — indistinguishable in
grayscale); the snowpack/drought USDM ramp is hue-only by design (D4 drought
and W4 wet are the same gray in print — always pair it with the D/W category
names in the legend, as the drought dashboard does), and its yellow/white
boundary needs an outline on light basemaps.

---

## 7. Maps

- **MapLibre GL 6.x is the house map library**, pinned + SRI'd from CDN
  (currently `6.11.2`; moved from 5.18.0 in kit 0.8.0 for the critical
  attribution-control XSS GHSA-jrc7-96c5-q579, fixed only in 6.4.1+). 6.x is
  ES-modules only, so pages no longer load it with `<script src>`:
  `MCO.map.loadMapLibre()` imports the pin and resolves with the namespace
  (also published as `window.maplibregl`), and the page's import map
  (`snippets/head.html`) carries the SRI hashes for the entry and shared
  chunks. **Known gap:** MapLibre re-imports the worker and shared chunks
  inside its web worker from a `blob:` URL, where no import map reaches, so
  those two fetches are pinned by the exact version in the URL (unpkg
  serves version paths immutably) but not by hash. It is the one place in the
  family where CDN code runs without SRI; revisit if MapLibre ships a way to
  pass integrity to its worker. WebGL2 is required (MapLibre 6 dropped
  WebGL1; the `Map` constructor throws `GPUInitializationError` without it).
  Leaflet pages adopt the theme/core layers now and migrate opportunistically;
  the kit will not ship Leaflet support.
- Basemaps: `MCO.map.cartoStyleUrl()` (CARTO Dark Matter / Positron — neutral,
  keyless, data stays the primary read). Other providers via
  `MCO.map.themedStyleUrl({dark, light})` — **API keys live in the consuming
  app, never in shared code**, and must be domain-restricted at the provider.
- Controls: `MCO.map.addNavigation` (no compass — rotation is off in these
  apps), `MCO.map.addFitControl` fused into the same group,
  `MCO.map.installZoomFloor` so the region always fills the viewport. Since
  0.8.0 the floor ignores chrome-only resizes (a phone URL bar) and takes
  `onBeforeSnap` for app policy ("not while a detail is open").
- **Basemap failure is handled, not hoped away** (0.8.0). Every map calls
  `MCO.map.watchBasemap(map)`. If the style 404s or hangs, the watch retries
  once after 5 s and then falls back to `MCO.map.blankStyle()`, a background in
  `--bg-deep`. That style does load, so `style.load` adds the data and
  boundaries and the map is useful without streets. A notice with Retry stays
  over the map. Start data loading from `style.load` (or from `load`, which
  the fallback also fires), never from a basemap-specific signal.
- **Popup, tooltip, sheet and table content is DOM-built** (0.8.0, M4). Use DOM
  APIs and `textContent`: `MCO.map.popupContent({title, subtitle, facts,
  actions})` with `popup.setDOMContent(…)`, `MCO.map.initCursorTooltip` for
  hover, `MCO.srTable` for the twin. `setHTML` and `innerHTML` take only
  static, author-written strings, never one with an API value in it, escaped
  or not. A URL from an API goes through `MCO.map.safeUrl(u)` (`https:` only)
  and is set as `img.src`/`a.href`, or as
  `` el.style.backgroundImage = `url(${JSON.stringify(u)})` ``. Never build it
  into a `style="…"` string: that is attribute and CSS injection (maint's
  `p.thumb`). The kit styles the popup shell from tokens on the `--z-detail`
  tier, so apps delete their local popup CSS.
- **Topography**: `MCO.map.addHillshade(map)` — live-shaded from the keyless
  AWS terrain DEM, `igor` method, themed paints (highlights carry the relief
  on dark; exaggeration 0.70 dark / 0.50 light / 0.80 high-contrast). Chosen
  2026-08 over Esri World Hillshade Dark and USGS 3DEP.
- **Map layer order** (the WebGL counterpart of the z-index ladder): basemap
  → hillshade → **basemap labels** → app boundaries → data. Full-coverage
  layers (hillshade, rasters, fills) insert beneath the basemap's first
  symbol layer — `addHillshade` does this by default;
  `MCO.map.firstSymbolLayerId(map)` exposes the hook for anything else.
  Thin boundary/data layers may sit above labels (family convention).
- Montana framing: `MCO.map.MT_FIT_BOUNDS` / `FIT_OPTS`. Overlays: the shared
  boundary GeoJSONs (`map/data/`) painted by `MCO.map.overlayPaints()` +
  `TRIBAL_LABEL_LAYOUT`; re-apply after every `setStyle`. Apps that draw the
  county layer must hide the CARTO basemap's own `boundary_county` layer
  (dashed, appears at z9 — pale orange on Positron) in `addCustomLayers()`:
  `map.setLayoutProperty('boundary_county', 'visibility', 'none')` — otherwise
  the map shows two county treatments above zoom 9.
- The map container gets `role="application"` and an `aria-label`.
- Vendoring exception: `data.climate.umt.edu` resolves to a private IP on
  campus (Chrome LNA blocks public→private fetches) — vendor data files into
  the app repo when they must come from that host.

---

## 8. Process

- **Kit-first.** Style fixes land in mco-web-style, get a version, and flow to
  apps by tag bump — never patch a copy in one app. If an app needs something
  the kit doesn't have, it becomes a kit proposal when a second property wants
  it (**admission rule: ≥ 2 MCO properties**), and stays app-local until then.
- **SemVer + pinned URLs + SRI** (see README). Never `@latest`, never retag.
- **CI is the constitution**: token parity, contrast matrix, SRI freshness,
  HTML validity, axe (serious/critical = failure) — all must be green to merge.
- Canonical reconciliations of past drift (do not re-litigate): toast 2800 ms ·
  `NavigationControl({showCompass: false})` · `--text-dim: #8494ab` · theme
  buttons set `aria-label` · explorer token superset wins.
- Email flavor: use the token hexes inlined (no custom properties, no
  webfonts) — accent `#1a6faf` on white, `--accent-dk` `#114f80` for links.
  A full email template lands in a future minor.
