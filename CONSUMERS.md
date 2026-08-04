# Consumers

Adoption status of every MCO web property, from the 2026-08 org-wide census.
Update this file as apps migrate. Migration mechanics are at the bottom.

## Migrated

| Property | Kit version | Notes |
|---|---|---|
| **mesonet-status** | **@0.3.1** (2026-08-03) | First consumer; the proof-of-concept migration. All checklist WCAG fixes applied; adopted hillshade, counties, high-contrast, MT time, CSP; overrides the subtitle shed (branding at all widths); back-ported the animated collapse, aria-atomic regions, fetchJSON cache option, tribal 0.10 fill, and the lockup-divider rhythm into the kit (v0.3.0/v0.3.1). Decision record in its migration commit. |

## Adopt now

| Property | What it is | Notes for migration |
|---|---|---|
| mesonet-explorer | Vanilla MapLibre SPA (index.html + app.js) | Token block is the kit's ancestor — mostly deletions. Remove `Spectral` from the ramp picker (CVD policy). Update CSP for cdn.jsdelivr.net. |
| mco-mesonet-photos | Vanilla MapLibre SPA (docs/) | Fix focus-restore bug (`lastFocusedEl.focus(); …blur()` drops focus); add `?kbd=off`; README still says the app is D3 (it's MapLibre). Delete dead `docs/mco_logo.png` / `Mesonet_Logo.png`. |
| mco-snowpack-explorer | Vanilla MapLibre + COG SPA | `cog-protocol.js` now lives in the kit — consume it from there. Add reduced-motion support (hard-coded `animate: true`), touch targets, favicon (has none), a keyboard/touch path to gridded raster values, and USDM category names in the legend (D4 — Exceptional drought · < 2). Stadia/MapTiler keys stay in-app via `themedStyleUrl`; domain-restrict them. |
| mco-drought-dashboard | Vanilla OpenLayers SPA (docs/) | Most token-mature, deliberately drifted (bg-deep #10141d etc.) — reconcile to kit tokens or record as sanctioned overrides. Its high-contrast theme is now the kit's (with fixed accent tints — its own lines 121-125 still carry stale rgba values). Replace the 25-selector focus-visible list with the universal rule. Fold in `docs/legacy/` copies and the unbranded `methods.html`. |
| mco-data-cdn (storage browser) | React + Vite | Already drift-free; swap `--mco-*`-prefixed theme.css for kit tokens (or keep the prefix as a local alias of tokens.json values). Natural home stays as-is — the kit ships via jsDelivr because this CDN resolves to a private IP on campus. |
| mesonet-dashboard (`/dash/` rewrite, `web/`) | React 19 + Mantine 8 + MapLibre 5.24 | The most-linked page in the network, mid-rewrite = cheapest adoption moment. Inject `tokens/tokens.json` into `web/src/lib/theme.ts` (currently stock Mantine blue + system fonts). |
| mesonet_app static maps | FastAPI-served: 1 MapLibre (maintenance — canonical tokens) + 6 Leaflet pages | Maintenance page: swap inline tokens for kit CSS. Leaflet pages: adopt theme/core now; MapLibre migration opportunistically (house library — HOUSE-STYLE §7). |
| mesonet-db-rds static maps | Active rewrite carrying a stale fork of the same map suite | Adopt the kit here rather than re-forking unstyled pages; its `status/` diverged and `maintenance/` is missing from the copy. |
| mesonet-aq | Vanilla MapLibre 4.7 SPA (docs/) | Copied the *shape* of the house style with none of the tokens (WordPress-admin blue, no custom properties). Mostly mechanical token swap + MapLibre bump. |
| mesonet-ogc | Single MapLibre 3.6 landing map | Smallest file, biggest visual win per line. Bump MapLibre to 5.x while in there. Confirm it's actually deployed (nothing references it from the Docker/pygeoapi config). |
| mco-mailing-lists | Listmonk templates + MJML newsletter | Branding is pending anyway ("NOT yet applied" is its blocking item) — apply the email-safe hex table (HOUSE-STYLE §8): accent #1a6faf, links #114f80, inlined hexes, no webfonts. Corrects the #52adc8 drift. |

## Adopt later

| Property | Why later |
|---|---|
| mco-website (climate.umt.edu) | Flagship, Jekyll + remote theme; highest-effort migration. Its `$primary-color: #08729e` becomes kit `#1a6faf` when it goes (one SCSS variable, but the retheme deserves its own effort). |
| ecorestore | Deliberate, contrast-audited sub-brand (maroon/coral Tailwind) — adopt only the structural layer (footer/logo lockup, a11y utilities); do not overwrite its palette. Its Playwright-a11y setup predates the kit's and is the model it followed. |
| cskt-air-quality | Tiny jQuery DataTables page, stale, likely embedded in mco-website. Cheap win when touched. |
| mt-normals | Leaflet atlas mid-migration to the `normals` repo — restyle once its home settles. |
| pluvio | Observable Framework + Quarto with a deliberate distinct palette; migrate after the operational apps. |
| technical-guides / MCA / mesonet-qc docs | Quarto properties — wait for a kit Quarto/SCSS brand flavor (v0.2+ candidate). |
| mesonet-one-pagers | Trivial static gallery; cheap when touched. |

## Retire instead of styling

| Property | Action |
|---|---|
| mco-drought-indicators | Superseded by mco-drought-dashboard. Real task: resolve the `drought.climate.umt.edu` CNAME collision (this repo holds the CNAME; the dashboard's README claims the domain). |
| mco-drought-conus storage-browser | Pre-refactor Amplify sibling of mco-data-cdn's browser — consolidate, don't style. Also fix/remove its 404ing `climate.umt.edu/img/MCO_logo_white.svg` reference. |
| native-drought-website | Unmodified third-party template from 2019 ("Design studio one page template") with no drought content — archive or delete. |
| mtdrought newsletters, frozen report HTMLs, dormant Sphinx docs | Archival fidelity beats restyling. |

## Migration mechanics

**Selector map** (kit classes replace per-app IDs):

| App selector | Kit selector |
|---|---|
| `#navbar` | `.mco-navbar` |
| `#toast` | `.mco-toast` |
| `#tooltip` | `.mco-tooltip` |
| `#info-modal` | `.mco-modal` |
| `#btn-info` | `.nav-btn.mco-btn-info` |
| legend/panel shells | `.mco-panel` + `MCO.initCollapsible` |
| drawer scrim | `.mco-scrim` |

**Checklist per app:**

1. Replace the inline token block + control-polish + shared component CSS with
   the pinned kit `<link>` (snippets/head.html); delete the local copies.
2. Replace duplicated JS (`showToast`, `lsSet`, `escapeHTML`, time helpers,
   `basemapStyleUrl`, fit control, snapback, `pushState` camera precision…)
   with `MCO.*` / `MCO.map.*` calls.
3. Apply the selector map; keep app-specific layout CSS local.
4. Reconcile canonical values (toast 2800 ms, `showCompass: false`,
   `--text-dim`, accent borders → `--accent-line`).
5. Fix the app's a11y items listed in its row above; verify the six a11y
   quick-checks: skip link, `viewport-fit=cover`, `?kbd=off` where `/` exists,
   live region, reduced-motion gates, touch targets.
6. If the page ships a CSP: add `https://cdn.jsdelivr.net` to `style-src` +
   `script-src`; recompute the anti-flash sha256 if the snippet changed.
7. Add the house-style pointer block (AGENTS.md § consuming) to the app's
   CLAUDE.md, and note the kit version pinned.
8. Diff screenshots in all themes; run the app's tests; update this file's row.

## Flagged during the census (not kit work — do not lose these)

- **Security:** `mco-data-cdn` has a TLS private key (`data2.climate.umt.edu.key`),
  CSR/cert, and `terraform.tfstate`/`tfvars` committed at repo root — rotate the
  key and scrub history, separately and soon.
- `drought.climate.umt.edu` CNAME collision (see retire table).
- `terraform.tfvars.example` in mco-mesonet-photos still points at the repo's
  old name (`mesonet-photo-explorer`).
