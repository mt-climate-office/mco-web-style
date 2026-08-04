# mco-web-style

The shared web house style of the [Montana Climate Office](https://climate.umt.edu):
design tokens, accessibility-first CSS, and framework-free JS helpers used across
the MCO web app family (Mesonet Explorer, Station Status, Photo Explorer, Snowpack
Explorer, and friends).

**Zero build. Zero runtime dependencies. Consumed as pinned, integrity-hashed CDN
files — the same way the apps already load MapLibre.**

- 📐 **[HOUSE-STYLE.md](HOUSE-STYLE.md)** — brand, UX, accessibility, and dev conventions (the rules)
- 🤖 **[AGENTS.md](AGENTS.md)** — guardrails for developers, human or AI (the sideboards)
- 🗺 **[CONSUMERS.md](CONSUMERS.md)** — which MCO properties use the kit, and migration checklists
- 🧪 **demo/** — a [living demo](demo/index.html) exercising every component (also a CI axe target)
- 🧭 **exemplar/** — a [complete single-page station map](exemplar/index.html) built the house way; **copy this directory to start a new MCO map app**

## Quickstart

Copy from [`snippets/head.html`](snippets/head.html) (canonical `<head>` + script
tags), inline [`snippets/anti-flash.html`](snippets/anti-flash.html), and add
[`snippets/skip-link.html`](snippets/skip-link.html) as the first element in
`<body>`. Minimal form:

```html
<link rel="stylesheet"
      href="https://cdn.jsdelivr.net/gh/mt-climate-office/mco-web-style@0.3.0/theme/mco-theme.css"
      integrity="sha384-T5zw9zSjTbnnLI46ipOo1H6qBPedKMbAPXu9FdL4FsBYnHxb713zZl0jKzTEGf0X" crossorigin="anonymous">
<script src="https://cdn.jsdelivr.net/gh/mt-climate-office/mco-web-style@0.3.0/core/mco-core.js"
        integrity="sha384-BHWqotPZgNN9VvHA0OfSUux8LD04tIOXhCzfxgCvfy5hmYARIl8ifPU0FHm6VNAD" crossorigin="anonymous"></script>
```

Everything lands on `window.MCO` (classic scripts — no bundler, no imports).
Map apps add `map/mco-map.js` (requires MapLibre GL 5.x) and, for COG rasters,
`map/cog-protocol.js` (exposes `window.CogProtocol`).

Non-vanilla consumers (React/Mantine, Tailwind, Quarto, email) read
[`tokens/tokens.json`](tokens/tokens.json) — the machine-readable mirror of the
CSS custom properties, kept in lockstep by CI.

## Files

| File | What | Who needs it |
|---|---|---|
| `theme/mco-theme.css` | Tokens (dark / light / high-contrast), z-index ladder, reset + a11y utilities, MapLibre control polish, component shells | every page |
| `core/mco-core.js` | `window.MCO`: storage, Mountain-time, fetch + promise cache, viewport, toast, theme, live region, modal, collapsible, URL state | every page |
| `map/mco-map.js` | `window.MCO.map`: Montana bounds, basemap URLs, controls, zoom floor, overlay paints | MapLibre apps |
| `map/cog-protocol.js` | `cog://` raster protocol (`window.CogProtocol`) | COG raster apps |
| `map/data/*.geojson` | Montana state / county / tribal boundaries (+ `data.R` provenance) | map apps |
| `tokens/tokens.json` | Design tokens as JSON | non-vanilla consumers |
| `assets/` | MCO logo (vendored), favicon set, OG card | every page |
| `snippets/` | Copy-paste blocks: anti-flash boot, `<head>`, skip link | every page |
| `exemplar/` | Reference station-map app — every HOUSE-STYLE convention composed, with §-cited comments | new-app template |

## SRI hashes — v0.3.0

```
theme/mco-theme.css      sha384-T5zw9zSjTbnnLI46ipOo1H6qBPedKMbAPXu9FdL4FsBYnHxb713zZl0jKzTEGf0X
core/mco-core.js         sha384-BHWqotPZgNN9VvHA0OfSUux8LD04tIOXhCzfxgCvfy5hmYARIl8ifPU0FHm6VNAD
map/mco-map.js           sha384-0aF67+MSXmcocGs8r3qiehgDNzgXo9F48olS5OX575wO2llw2cuGcqLpd6+L7D76
map/cog-protocol.js      sha384-9hkbnrwnT71VgTqMFjTM8g3GFmvQH1z24Z9gvSAeCxF4YeuTS3lL3PMQTjWelFZm
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
  Pin `@X.Y.Z` + hash, exactly like the apps pin `maplibre-gl@5.18.0`.
- **Never re-point a tag.** jsDelivr caches tag content permanently; a re-pointed
  tag produces split-brain edges forever. A bad release gets a new patch tag.
- Because SRI pins bytes, no consumer ever silently upgrades — version numbers
  exist for humans planning migrations. Every tag gets a [CHANGELOG](CHANGELOG.md) entry.

## Releasing

1. Make changes; keep `tokens/tokens.json` in sync with the CSS.
2. Run the gates locally:
   `node --check core/mco-core.js map/mco-map.js map/cog-protocol.js` ·
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
- `img-src`: add `https://cdn.jsdelivr.net` if you hot-link kit assets
- the inline anti-flash script's **sha256** in `script-src` — recompute it
  whenever that snippet changes:

```sh
# hash exactly the script element's contents (between <script> and </script>)
awk '/<script>/{f=1;next}/<\/script>/{f=0}f' snippets/anti-flash.html \
  | openssl dgst -sha256 -binary | openssl base64 -A
```

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
