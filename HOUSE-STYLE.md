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

**Typography.** `--font-ui` — **Outfit** (400/500/600/700) for UI text.
`--font-mono` — **Space Mono** for numerals, station IDs, timestamps, scale
labels, `<kbd>`. Loaded from Google Fonts (see `snippets/head.html`); the tokens
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
| `--text-on-accent` | `--accent` fills | ≥ 4.5:1 |

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
| ≤ 640px | `.refresh-status`; **compact mode** begins |
| ≤ 460px | a navbar search field collapses to a disclosure (`.mco-search-collapse` + `MCO.initSearchCollapse`) and reopens as an overlay bar |

Because `.btn-label` sheds below 1400 px, **any button that relies on it for
its name must carry a permanent `aria-label`** — otherwise the button becomes
nameless at laptop widths (the kit's axe audit fails exactly this).

`.control-label` is different: it is normally a `<label for>` naming a real
control, so the kit hides it **visually** below 1400 px rather than removing it.
`display: none` would strip the name from the input it labels — mco-mesonet-photos
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
- A navbar **search field collapses to a disclosure** below 460 px rather than
  being hidden: `MCO.initSearchCollapse` moves focus into the field on open and
  back to the button on close, and the app keeps control of Esc precedence and
  of its own `/` shortcut. Hiding search outright strands the only keyboard
  route to a named feature — don't.

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
with `MCO.replaceUrlState()` on every mutation and on map `moveend`
(`MCO.map.cameraParams` for the canonical precision). All-defaults views emit a
clean URL. Share buttons copy `location.href` — the URL must already be the
complete view.

**localStorage namespace.** `mco-theme` is deliberately shared org-wide on an
origin — a theme choice follows the user between apps. Everything else is
app-prefixed (`mco-<app>-*`). Persisted values are re-validated on read exactly
like URL params: another app, or last year's version of yours, may have written
them.

**Theme switching** re-styles the map (`map.setStyle(...)` wipes custom
sources/layers — re-add them in `map.once('style.load', …)`). Use
`MCO.initThemeToggle`; it maintains the icon swap and the button's
`aria-label`.

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
   map/canvas re-render (“42 stations shown”, “Station X opened”) is announced
   via `MCO.createLiveRegion()`. *(mesonet-status `#sr-announce`)*
2. **Hidden-table twin.** Every canvas/WebGL data layer has an `.sr-only`
   `<table>` rebuilt per render, with `scope`d headers and textual state
   (“no data”, “(stale)”). *(mesonet-explorer `#sr-station-table` — best in family)*
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

- **MapLibre GL 5.x is the house map library**, pinned + SRI'd from CDN
  (currently `5.18.0`). Leaflet pages adopt the theme/core layers now and
  migrate opportunistically; the kit will not ship Leaflet support.
- Basemaps: `MCO.map.cartoStyleUrl()` (CARTO Dark Matter / Positron — neutral,
  keyless, data stays the primary read). Other providers via
  `MCO.map.themedStyleUrl({dark, light})` — **API keys live in the consuming
  app, never in shared code**, and must be domain-restricted at the provider.
- Controls: `MCO.map.addNavigation` (no compass — rotation is off in these
  apps), `MCO.map.addFitControl` fused into the same group,
  `MCO.map.installZoomFloor` so the region always fills the viewport.
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
