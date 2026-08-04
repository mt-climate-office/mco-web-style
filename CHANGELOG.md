# Changelog

All notable changes to mco-web-style. Format follows
[Keep a Changelog](https://keepachangelog.com); versioning follows the SemVer
policy in README.md.

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
mesonet-status, mco-mesonet-photos, mco-snowpack-explorer, the mesonet_app
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
