# mco-web-style

The shared web house style of the [Montana Climate Office](https://climate.umt.edu):
design tokens, accessibility-first CSS, and framework-free JS helpers used across
the MCO web app family (Mesonet Explorer, Station Status, Photo Explorer, Snowpack
Explorer, and friends).

**Zero build. Zero runtime dependencies. Consumed as pinned, integrity-hashed CDN
files — the same way the apps already load MapLibre.**

- 📐 **[HOUSE-STYLE.md](HOUSE-STYLE.md)** — brand, UX, accessibility, and dev conventions (the rules)
- 🤖 **[AGENTS.md](AGENTS.md)** — guardrails for developers, human or AI (the sideboards)
- 🗺 **[CONSUMERS.md](CONSUMERS.md)** — which MCO properties use the kit, per-app migration intel
- 🚚 **[MIGRATING.md](MIGRATING.md)** — the migration playbook (start here when converting an existing app)
- ✅ **[CONFORMANCE.md](CONFORMANCE.md)** — the per-app checklist; `node tools/conformance.mjs <repo>` scores the automatic half
- 🧪 **demo/** — a [living demo](demo/index.html) exercising every component (also a CI axe target)
- 🧭 **exemplar/** — a [complete single-page station map](exemplar/index.html) built the house way; **copy this directory to start a new MCO map app** — but swap its relative kit paths for the pinned + SRI CDN tags from `snippets/head.html` (and add `https://cdn.jsdelivr.net` to its CSP), since the exemplar deliberately loads the kit locally for in-repo development

## Quickstart

Copy from [`snippets/head.html`](snippets/head.html) (canonical `<head>` + script
tags), inline [`snippets/anti-flash.html`](snippets/anti-flash.html), and add
[`snippets/skip-link.html`](snippets/skip-link.html) as the first element in
`<body>`. Minimal form:

```html
<link rel="stylesheet"
      href="https://cdn.jsdelivr.net/gh/mt-climate-office/mco-web-style@0.11.2/theme/mco-theme.css"
      integrity="sha384-22H/4uZb4dmkrTZlLp4NJ4J+Wg39RNRIVIKO0x1HPYfyUWj81FA0fyM/uoRqbqme" crossorigin="anonymous">
<script src="https://cdn.jsdelivr.net/gh/mt-climate-office/mco-web-style@0.11.2/core/mco-core.js"
        integrity="sha384-b4r3+tK/yiZ4TNEllSsbDX3qW0NhcHDsF2iPzUWunUc2vNf1qlq9t9qo2YWgoZiK" crossorigin="anonymous"></script>
```

Everything lands on `window.MCO` (classic scripts — no bundler, no imports).
Map apps add `map/mco-map.js` (targets MapLibre GL 6.x, which it imports for
you — `MCO.map.loadMapLibre()`; the import map in `snippets/head.html` carries
MapLibre's SRI hashes) and, for COG rasters,
`map/cog-protocol.js` (exposes `window.CogProtocol`). The API surface is
documented in the source headers and JSDoc-style comments of
`core/mco-core.js` and `map/mco-map.js` — read them for argument shapes
rather than guessing.

Non-vanilla consumers (React/Mantine, Tailwind, Quarto, email) read
[`tokens/tokens.json`](tokens/tokens.json) — the machine-readable mirror of the
CSS custom properties, kept in lockstep by CI.

## Files

| File | What | Who needs it |
|---|---|---|
| `theme/mco-theme.css` | Tokens (dark / light / high-contrast), z-index ladder, reset + a11y utilities, MapLibre control polish, component shells | every page |
| `core/mco-core.js` | `window.MCO`: storage, Mountain-time, fetch + promise cache, viewport, announcer (`announce`) + toast, notice, theme, modal, collapsible, sr-table twin, legend toggles, search combobox + model, URL state (replace / push / restore) | every page |
| `map/mco-map.js` | `window.MCO.map`: MapLibre 6 loader, Montana bounds, basemap URLs + failure watch, controls, zoom floor, DOM popups, cursor tooltip, hillshade, overlay paints | MapLibre apps |
| `map/cog-protocol.js` | `cog://` raster protocol (`window.CogProtocol`) | COG raster apps |
| `palette/mco-palette.js` | `window.MCO.palette`: approved data ramps (OKLab sampling, per-theme 3:1 spans), Tol categoricals, the station-network registry | apps that color data |
| `map/data/*.geojson` | Montana state / county / tribal boundaries (+ `data.R` provenance) — **vendor these into the app repo** (both migrated consumers do); cross-origin fetching just adds `cdn.jsdelivr.net` to `connect-src` for no benefit | map apps |
| `tokens/tokens.json` | Design tokens as JSON | non-vanilla consumers |
| `fonts/` | Outfit + Space Mono woff2 (latin + latin-ext; SIL OFL, license texts alongside), declared by `mco-theme.css` | every page (preload the two latin files — `snippets/head.html`) |
| `assets/` | The brand: badge (PNG, vendored in navbars; SVG), wordmark (`currentColor` + on-dark / on-light), favicon set, OG card. Source of truth (HOUSE-STYLE §1) | every page |
| `snippets/` | Copy-paste blocks: anti-flash boot, `<head>`, skip link | every page |
| `exemplar/` | Reference station-map app — every HOUSE-STYLE convention composed, with §-cited comments | new-app template |
| `tools/` | CI gates (tokens, contrast, SRI, axe + keyboard probes), `conformance.mjs` (score a consumer), `consumer-verify.mjs` (verify-harness skeleton) | kit maintainers, migrators |

## SRI hashes — v0.11.2

```
theme/mco-theme.css      sha384-22H/4uZb4dmkrTZlLp4NJ4J+Wg39RNRIVIKO0x1HPYfyUWj81FA0fyM/uoRqbqme
core/mco-core.js         sha384-b4r3+tK/yiZ4TNEllSsbDX3qW0NhcHDsF2iPzUWunUc2vNf1qlq9t9qo2YWgoZiK
map/mco-map.js           sha384-tmDqtqi4yYiDHOxkZikwzXF3Lpkb63b0Tu6K7jeCpU9gJkPB2GbpFHLasGHka6zP
map/cog-protocol.js      sha384-9hkbnrwnT71VgTqMFjTM8g3GFmvQH1z24Z9gvSAeCxF4YeuTS3lL3PMQTjWelFZm
palette/mco-palette.js   sha384-P+8vdCR12oZ388lO/orPRnm6Tcz69x6mhN32l7AWP7j8S7KCNijXDZrmYjWuXm8J
```

Recompute with `tools/sri.sh`. CI (`tools/check-sri.mjs`) fails if this table,
`snippets/head.html`, or `demo/cdn.html` ever drifts from the actual file bytes.

## Versioning

Semantic versioning, pinned URLs only:

- **PATCH** — visual/bug fix; no selector, token, signature, or observable-default change
- **MINOR** — additive (new token, class, or API)
- **MAJOR** — any rename, removal, or behavior-default change (a toast-duration change is MAJOR)

Rules that keep consumers safe:

- **Never use `@latest`** (or `@0.1`-style ranges). They float on a ~12 h CDN
  edge cache and SRI will hard-fail nondeterministically when content moves.
  Pin `@X.Y.Z` + hash, exactly like the apps pin `maplibre-gl@6.11.2`.
- **Never re-point a tag.** jsDelivr caches tag content permanently; a re-pointed
  tag produces split-brain edges forever. A bad release gets a new patch tag.
- Because SRI pins bytes, no consumer ever silently upgrades — version numbers
  exist for humans planning migrations. Every tag gets a [CHANGELOG](CHANGELOG.md) entry.

## Releasing

1. Make changes; keep `tokens/tokens.json` in sync with the CSS.
2. Run the gates locally:
   `node --check core/mco-core.js map/mco-map.js map/cog-protocol.js palette/mco-palette.js` ·
   `node tools/check-tokens.mjs` · `node tools/check-contrast.mjs`
3. Eyeball `demo/` in all three themes: `python3 -m http.server 8000` from the
   repo root → `http://localhost:8000/demo/`.
4. **Freeze** the four published css/js files. Bump the `@version` in
   `snippets/head.html`, `demo/cdn.html`, and this README.
5. `tools/sri.sh` → paste the hashes into the same three files.
   `node tools/check-sri.mjs` must pass. Any byte change after this restarts at 4.
6. Update `CHANGELOG.md`. Commit. Push. Confirm both Actions workflows are green.
7. `git tag vX.Y.Z && git push origin vX.Y.Z`.
8. After a few minutes (tag propagation), open `demo/cdn.html` locally — every
   row must be green; the browser's SRI enforcement is the definitive test.

## CSP notes for consumers

Pages that ship a `Content-Security-Policy` (see mesonet-explorer for the
GitHub-Pages meta-tag pattern) need:

- `style-src` and `script-src`: add `https://cdn.jsdelivr.net`
- `font-src`: `https://cdn.jsdelivr.net` — the house fonts are kit-hosted
  since 0.7.0. Google Fonts is no longer used: drop
  `https://fonts.googleapis.com` from `style-src` and
  `https://fonts.gstatic.com` from `font-src`.
- `img-src`: add `https://cdn.jsdelivr.net` if you hot-link kit assets
- **map apps** (MapLibre 6, since kit 0.8.0):
  - `script-src`: `https://unpkg.com` and the MapLibre import map's hash,
    `'sha256-NgHBdw+Nl6S2kTHNyvv5uFwHfytmfDJR39Y9qVPt/UI='`. An import map is
    an inline script as far as CSP is concerned. Because the snippet's map is
    one line, this hash is the same on every page that copies it byte for
    byte; `tools/check-sri.mjs` re-derives it, so a MapLibre bump that
    forgets to update it fails CI.
  - `worker-src`: `blob: https://unpkg.com`. **Both.** MapLibre 6 starts its
    worker from a `blob:` URL that then `import`s the worker chunk from
    unpkg, and a module worker's imports are checked against `worker-src`,
    not `script-src`. MapLibre's migration guide lists only `blob:`. With
    `blob:` alone the map draws its basemap and then nothing else, and the
    only console line is "Worker failed to load", with no mention of CSP.
- the inline anti-flash script's **sha256** in `script-src` — recompute it
  whenever that snippet changes (it did in 0.7.0, gaining the
  `.is-compact`/`.is-touch` stamp):

```sh
# ONLY for the standalone snippet file — see the warning below.
awk '/<script>/{f=1;next}/<\/script>/{f=0}f' snippets/anti-flash.html \
  | openssl dgst -sha256 -binary | openssl base64 -A
```

⚠️ **The hash is per-page, indentation included.** The `awk` recipe above only
works on the standalone snippet file; on a real `index.html` it drops bytes
and yields the wrong value. Never copy another app's `sha256-…` — recompute
from your own page with the python recipe in MIGRATING.md § Gotchas, and
treat a CSP console error on load as the telltale.

Why jsDelivr and not `data.climate.umt.edu`: the MCO data CDN resolves to a
private IP on the UMT campus network, and Chrome's Local Network Access policy
blocks public→private subresource fetches. jsDelivr serves the tagged GitHub
content globally with immutable caching.

## Development

No install. Edit, then serve the repo root (`python3 -m http.server 8000`) and
open `/demo/`. The a11y audit runs in CI; to run it locally:

```sh
npm init -y && npm i --no-save playwright @axe-core/playwright
npx playwright install chromium
node tools/a11y-audit.mjs   # package.json / node_modules are gitignored
```

## License

MIT © Montana Climate Office. The MCO logo and name identify the Montana
Climate Office — use them only for MCO properties.
