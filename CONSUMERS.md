# Consumers

Adoption status of every MCO web property, from the 2026-08 org-wide census.
Update this file as apps migrate. Migration mechanics are at the bottom.

Consumer repos move without this file noticing — the 2026-08-16 audit found two
mesonet_app maps and mesonet-explorer already wearing the house style by hand,
none of it recorded here. **Before trusting a row, check the repo.** "Looks
like the house style" and "consumes the kit" are different states, and the
first one silently forks the tokens; the § below tracks that middle ground.

## Migrated

| Property | Kit version | Notes |
|---|---|---|
| **mesonet-status** | **@0.6.0** (2026-08-04) | First consumer; the proof-of-concept migration. All checklist WCAG fixes applied; adopted hillshade, counties, high-contrast, MT time, CSP; back-ported the animated collapse, aria-atomic regions, fetchJSON cache option, tribal 0.10 fill, and the lockup-divider rhythm into the kit (v0.3.0/v0.3.1). **Header now mirrors mesonet-photos (2026-08-04):** dropped its "branding at all widths" override for the kit brand collapse (safe now that the kit hides the lockup visually, so its `<h1>` survives), and adopted the collapsible search — becoming the second consumer is what admitted that component to the kit in v0.5.0. Keeps its controls break at 1200px, not photos' 1060px: this bar needs ~1120px for one row. Its three-row band at 461-527px is what moved the kit's search collapse to the 640px compact edge in v0.6.0 — the wrap point had been drifting with its live chip counts. ⚠️ Its data path is **not verifiable from the UMT campus network** — github.io is a public origin and the API resolves to a private IP, so Chrome LNA blocks it (it degrades gracefully with an error toast). Decision record in its migration commits. |
| **mesonet-photos** | **@0.6.0** (2026-08-04) | Second consumer; first migration run straight from MIGRATING.md with no kit release needed. App code extracted to `docs/app.js` under a meta CSP; adopted kit tokens/shells/selectors, high-contrast, MT stamps, `?kbd=off`, skip link + `<main>`, a live region, an sr-table twin (one row per grid cell), 30px `.seg-btn`, and the kit's subtitle-only 750px shed. **Kit-overrides: no hillshade** (opaque photo rasters are the figure; relief would only show in the untiled west) and a ≤750px navbar that wraps + lifts `.nav-meta` beside the brand instead of shedding it. Kept app-local per § kit-deferred: photo mosaic, gallery/lightbox, date stepper, direction `<select>` fallback, `updateSocialMeta`, branded PNG export. Fixed in flight: focus-restore `.focus();.blur()`, unprefixed `mco-info-seen` (shimmed), mouse-only photo enlarge (now a real button), untappable 15px date steppers, `src=""` re-requesting the page, and the stale D3 docs. Later same day: prototyped the collapsible search that became kit v0.5.0, then refactored onto the shared component; added a landing-slot fallback (the newest timestep is often unmirrored, so it probes and steps back rather than showing a blank mosaic). Its nameless date/time controls below 1400px drove the v0.5.1 `.control-label` fix. On the v0.6.0 bump its width ladder caught a mis-bounded edit from its own 0.5.0 refactor that had duplicated ~84 CSS lines and left a local `#btn-search-toggle { display: none }` — an ID selector outbidding the kit class, which would have stranded search between 461-640px. Decision record in its migration commits. |

| **mesonet_app — UMRB Build Status** (`static/status/`) | **@0.6.0** (2026-08-16) | Third consumer, first FastAPI-served one — `StaticFiles` at `/api/v2/map/status/`, not GitHub Pages, so **pushing does not deploy**: the image bakes the files in and someone runs `docker-compose up -d --build`. Renamed from "UMRB Station Status" at migration. Inline module → `app.js` under a meta CSP; adopted kit tokens/shells/selectors, high-contrast (new to this page), hillshade, the kit tribal treatment + `TRIBAL_LABEL_LAYOUT`, shared `mco-theme`, MT stamps, `?kbd=off`, skip link + `<main>`, sr-table twin (one row per grid cell), collapsible search, and clean-URL default elision. **Fixed in flight:** `--text-dim: #6b7a90` (AA fail), `--c-warn` at 2.2:1 on the light navbar → `#7d5a0e`, two `outline: none` focus kills, the `=== 'dark'` basemap bug, and the intro modal writing its seen-key on *close* (so anyone who navigated away without closing saw it every visit). **Station dots became first-class:** click and hover resolved through `cellById` and dead-ended for any station whose `ace_grid` names no drawn cell — `?station=` now opens a station popup, and the one orphan (`acesfork`, tagged `E-9`; the E row stops at E-6 and its point falls outside the grid entirely) says so explicitly. That is a **registry/geometry data defect, not a display one** — worth fixing at source. Kept app-local per § kit-deferred: cell-status ramp, search combobox, legend rendering. Verified: 33 checks, axe 0 serious/critical in all three themes, against a capture of the live 311-record feed. |
| **mesonet_app — Station Maintenance** (`static/maintenance/`) | **@0.6.0** (2026-08-16) | Fourth consumer; near-identical twin of the build-status map, migrated in the same pass — 524 of that map's 571 CSS lines had been byte-identical to this file's. Same adoptions. Its tribal paints and `TRIBAL_LABEL_LAYOUT` were **byte-identical to the kit's already** (this page is where those values came from), so consuming them back was pure deletion. **Fixed in flight:** three popup pills failed WCAG 1.4.3 — `new` at 2.43:1, `as_needed` 3.46:1, `visited` 4.14:1, all white-on-light; text color is now per-pill with the measured ratio recorded. An axe scan never caught them because the popup only exists after a click. Also `src=""` on the lightbox image (re-requests the page), and a `map(escapeHTML)` reference the migration's own sweep missed because it had no paren. ⚠️ **Visit photos are AirTable attachments on `*.airtableusercontent.com`** — those URLs appear only in the API response, never in the HTML, so the first CSP cut allowed `'self' data: blob:` and every thumbnail died silently (a blocked CSS `background-image` renders as an empty box, not an error). `img-src` now carries the wildcarded attachment host. Kept app-local: compliance model, colocation/spider, photo gallery + lightbox, trip-type chips. Verified: 33 checks, axe 0 serious/critical in all three themes, against captures of the live 231-station / 179-record feeds. |
## House-styled, not kit-consuming

Hand-applied house style that predates or bypassed the kit. It *looks* right,
but carries its own inline copy of the tokens: **zero `MCO.*` calls, no pinned
kit `<link>`.** This is the state mesonet-status was in the day before its
migration — most of the visual work is already done, so adoption here is
largely deletion. Audited 2026-08-16; the two mesonet_app maps that were listed
here migrated the same day and have moved up to **Migrated**.

| Property | Already done | What adoption still buys |
|---|---|---|
| **mesonet-explorer** | The most complete of the three, and entirely pre-kit (last commit 2026-07-27). Tokens match kit canonical **exactly** (`--text-dim: #8494ab` / `#5f6675`), shared `mco-theme` key, `viewport-fit=cover`, `?kbd=off`, sr-only twins, live regions, reduced-motion gates. MapLibre 5.18. Headless check suite in its own package. | Mostly deletion, as the census row said. Still owes a skip link, hillshade, and removing `Spectral` from the ramp picker (2 hits in `app.js` — CVD policy). Its CSP already allows `cdn.jsdelivr.net`; recompute the `script-src` sha256 if the anti-flash snippet changes. |

## Adopt now

| Property | What it is | Notes for migration |
|---|---|---|
| mco-snowpack-explorer | Vanilla MapLibre + COG SPA | `cog-protocol.js` now lives in the kit — consume it from there. Add reduced-motion support (hard-coded `animate: true`), touch targets, favicon (has none), a keyboard/touch path to gridded raster values, and USDM category names in the legend (D4 — Exceptional drought · < 2). Stadia/MapTiler keys stay in-app via `themedStyleUrl`; domain-restrict them. |
| mco-drought-dashboard ⛔ **hands-off** | Vanilla OpenLayers SPA (docs/) | **Do not touch unless Kyle asks for this repo by name** (2026-08-16) — it is deliberately different and must be excluded from every cross-cutting sweep (title standardization, token reconciliation, bulk kit adoption). Read-only surveys are fine. Original notes: Most token-mature, deliberately drifted (bg-deep #10141d etc.) — reconcile to kit tokens or record as sanctioned overrides. Its high-contrast theme is now the kit's (with fixed accent tints — its own lines 121-125 still carry stale rgba values). Replace the 25-selector focus-visible list with the universal rule. Fold in `docs/legacy/` copies and the unbranded `methods.html`. |
| mco-data-cdn (storage browser) | React + Vite | Already drift-free; swap `--mco-*`-prefixed theme.css for kit tokens (or keep the prefix as a local alias of tokens.json values). Natural home stays as-is — the kit ships via jsDelivr because this CDN resolves to a private IP on campus. |
| mesonet-dashboard (`/dash/` rewrite, `web/`) | React 19 + Mantine 8 + MapLibre 5.24 | The most-linked page in the network, mid-rewrite = cheapest adoption moment. Inject `tokens/tokens.json` into `web/src/lib/theme.ts` (currently stock Mantine blue + system fonts). |
| mesonet_app Leaflet pages | FastAPI `StaticFiles` mounts: `latest`, `stations`, `funding` — 3 unstyled Leaflet pages | The two MapLibre maps moved to the section above (`status` converted 2026-08-15). The census's "1 MapLibre + 6 Leaflet" is really **2 MapLibre + 3 Leaflet served**: `main.py:372` has `progress` commented out and `Sensor_Map` is never mounted, so both are dead directories on disk — confirm before styling, and consider deleting them. These three: adopt theme/core now; MapLibre migration opportunistically (house library — HOUSE-STYLE §7). |
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

## Page titles (apply on migration)

`<Short name> · <Family>` — rule and reasoning in HOUSE-STYLE §1 Naming.
Decided 2026-08-16 across a family that had drifted to four separators.

**The family half has two forms and the surface picks one:** the tab gets the
abbreviation (it truncates at ~15 characters and is read by someone who already
knows what they opened); the link card gets the full name (Slack and social,
read by someone who may never have heard of the office). The short app name is
identical in both. `og:site_name` takes the **long family alone**, which every
app currently gets wrong by repeating its own title.

| Property | `<title>` (tab) | `og:title` / `twitter:title` (card) | `og:site_name` |
|---|---|---|---|
| mesonet-explorer | **Explorer · MT Mesonet** | Explorer · Montana Mesonet | Montana Mesonet |
| mesonet-status | **Status · MT Mesonet** | Status · Montana Mesonet | Montana Mesonet |
| mesonet-photos | **Photos · MT Mesonet** | Photos · Montana Mesonet | Montana Mesonet |
| mesonet_app — maintenance | **Maintenance · MT Mesonet** | Maintenance · Montana Mesonet | Montana Mesonet |
| mesonet_app — status | **UMRB Build · MT Mesonet** | UMRB Build · Montana Mesonet | Montana Mesonet |
| mesonet-aq | **Air Quality · MT Mesonet** | Air Quality · Montana Mesonet | Montana Mesonet |
| mesonet-ogc | **Map · MT Mesonet** | Map · Montana Mesonet | Montana Mesonet |
| mco-snowpack-explorer | **Snowpack · MCO** | Snowpack · Montana Climate Office | Montana Climate Office |

⛔ `mco-drought-dashboard` is **excluded** — hands-off, see its row above.

## Migration mechanics

**Start with [MIGRATING.md](MIGRATING.md)** — the full playbook (process,
settled precedents, step-by-step, gotchas, verification recipe), written for
a session starting fresh in the consumer's repo. The tables below are the
quick reference it links back to.

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

- ~~**Security:** `mco-data-cdn` has a TLS private key, CSR/cert and
  `terraform.tfstate`/`tfvars` committed at repo root.~~ **Resolved** (verified
  2026-08-16): nothing matching is tracked, nothing matching appears in history,
  and `137c2e0` moved state to a shared S3 backend. Only
  `terraform/terraform.tfvars.example` remains, which is fine. Re-check before
  trusting this line — it was stale for a while.
- `drought.climate.umt.edu` CNAME collision (see retire table).
- The photos repo has now been renamed twice — `mesonet-photo-explorer` →
  `mco-mesonet-photos` → **`mesonet-photos`** (2026-08-05). Its `terraform.tfvars`
  and `.example` were re-pointed both times. Each rename strands the old absolute
  path in that repo's `.venv` shebangs; harmless, recreate the venv.
- **Deferred to the next kit release (0.7.0):** `core/mco-core.js` still names
  `mco-mesonet-photos` in two comments (lines 8, 71). Left alone deliberately —
  it is one of the four SRI-pinned published files, so changing a byte fails
  `tools/check-sri.mjs` in three documents and would force a version bump for a
  comment. 0.7.0 is now scheduled (see CHANGELOG § Planned), so fold it in there.
- **Not kit work — API issue, Kyle handling separately (2026-08-16):**
  mesonet-explorer's **daily mode returns no data**. On production,
  `?mode=daily` renders zero stations and issues **no `/observations/` request
  at all** after 35s, with no console errors; `latest` mode works (231 rows).
  Reproduced for both `var=ppt` and `var=air_temp`, so it is the mode, not the
  variable. This is what the explorer test suite's single failing check
  (`exports: daily precipitation — NO DOWNLOAD`) is actually reporting: the
  export waits on a first render that never lands. **Do not treat that test
  failure as a migration regression** — it predates the migration.
- **Data defect, not kit work:** station `acesfork` ("S Fork Smith") is tagged
  `ace_grid = E-9`, but the drawn grid's E row stops at **E-6** and the station's
  coordinates fall outside the UMRB grid entirely. The build-status map now
  surfaces this in the station popup instead of rendering an unexplained floating
  dot, but the fix belongs in the registry or the grid geometry.
- **Live bug in mesonet-explorer (fixed by its migration, 2026-08-16):** its
  local `shiftDate` is the pre-v0.4.0 form, ending in `toISOString().slice(0,10)`
  — so the date stepper **does nothing** at UTC+13/+14 (Kiritimati; Auckland
  during NZDT) and **skips two days** at UTC-12. Reproduced before the fix.
  Correct in Mountain Time, which is why it went unnoticed. Its
  `lastCompleteHourMT` calls `shiftDate` and inherited it. This is the third
  place that bug has been found, and the reason the kit owns these helpers.
- **Consumer cleanup:** the `MCO.shiftDate` / `MCO.lastCompleteHourMT` UTC bug
  found in the photos migration was **fixed and shipped in v0.4.0**
  (CHANGELOG § 0.4.0; `core/mco-core.js:72` now formats from local getters).
  mesonet-photos still keeps the local copy it wrote while the kit was broken
  and deliberately does not call the kit helper — it is on @0.6.0, so that
  local copy can be deleted in favor of `MCO.shiftDate` whenever that repo is
  next touched.
