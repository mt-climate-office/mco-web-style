# Changelog

All notable changes to mco-web-style. Format follows
[Keep a Changelog](https://keepachangelog.com); versioning follows the SemVer
policy in README.md.

## [Unreleased]

### Added
- `exemplar/` — a complete single-page Mesonet station map built as the
  reference implementation of HOUSE-STYLE.md (live API data, three themes,
  URL state, keyboard station picker, live region + sr-table twin, CSP with
  pinned inline-script hash, compact-viewport detail dock). Repo content
  only — no published css/js changed, so v0.1.0 SRI hashes are unaffected.
  CI now validates and axe-audits it alongside the demo.

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
