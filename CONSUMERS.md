# Consumers

Adoption status of every MCO web property, from the 2026-08 org-wide census.
Update this file as apps migrate. **Returning to this after a break? Read
"Pick up here" below first.** Migration mechanics are at the bottom.

Consumer repos move without this file noticing — the 2026-08-16 audit found two
mesonet_app maps and mesonet-explorer already wearing the house style by hand,
none of it recorded here (all three have since migrated). **Before trusting a
row, check the repo.** "Looks like the house style" and "consumes the kit" are
different states, and the first one silently forks the tokens.

---

## Pick up here (state as of 2026-10-09)

**All six consumers are on @0.11.2 with MapLibre 6.11.2, deployed and verified
live 2026-10-09** (Chromium and WebKit, every production URL: kit 0.11.2,
MapLibre 6.11.2, the map paints, 0 CSP violations, 0 console errors). That
closes GHSA-jrc7-96c5-q579 everywhere except **mesonet-dashboard**. Its
web-next (CDN-pinned 5.18.0) and the live frozen `web/` (npm `^5.24.0`)
are both exposed; the session working in that repo has the brief, and
Kyle sequences it.

- **Each app had two PRs.** The security re-point (PR A) is merged. The
  cleanup PR (PR B) deletes local copies of what the kit now owns, one item
  per commit, plus the 0.10/0.11 opt-ins: the landscape rail in all six,
  the 3-state theme, and the export wordmark (snow, photos, explorer). PR B
  is retargeted to `main` and open for review: status #2, explorer #2,
  maintenance #2, umrb #2, snow #2, photos #8.
- **Follow-ups decided 2026-10-09, in progress on PR B:**
  - status and umrb shed at the 1400 rung (HOUSE-STYLE §3);
  - explorer and photos adopt clean-URL defaults and `pushUrlState`, so
    Back closes the drill-down.
- **Decided 2026-10-09:**
  - **Status ramps stay on Crameri roma** (Kyle: "I like it the best"). A
    Crameri/ColorBrewer study (lajolla, batlow; YlGnBu, Purples for umrb's
    stages) is on record, and roma's known costs were accepted with it:
    lightness isn't monotonic across status's time-since bins, and the
    fills alone fall under 3:1 on the light map. The dot strokes carry the
    edge. No kit recency ramp.
  - Apps with a nightly preview bot keep their live `og:image` (HOUSE-STYLE
    §1).
- **Found during the re-points and fixed in the kit:**
  - 0.11.1: rail inset; keyboard.mjs timeouts; a canary with no route().
  - 0.11.2: WebKit date focus ring, stepper focus, setSocialMeta canonical,
    harness fixes.
  - 0.11.3: cog `emptyTile` (the "[cog] OffscreenCanvas" errors snow logged
    were the kit's), drawer at compact load, overlay focus fallback,
    stepper hold flag, busy chips, conformance/lint-css agreement.
- Open: #45 (autolift vs app corner panels, before 1.0.0).

**History, 2026-09-30: all six consumers were on @0.7.1 (first paint + metric-matched fallback
fonts), deployed and verified live 2026-09-30.** Each followed the MIGRATING.md § "0.6.x → 0.7.0" checklist (tags
+ SRI, font preloads, CSP `font-src`, new anti-flash body + recomputed
sha256) and was checked against its own pre-change HEAD, then again in
production: theme applied in every theme (hash valid), fonts from
cdn.jsdelivr.net, 0 CSP violations, axe 0 serious/critical at 1440 and 390px.
The CSP error every consumer logged during axe runs (axe fetching the Google
Fonts stylesheet) is gone with the stylesheet.

- mesonet-explorer additionally deleted its self-hosted `assets/fonts/` and
  its `#sb-brand .brand` un-clip (both the kit's now), and keys its
  first-paint hold on `.is-compact` instead of a duplicated media query.
- **0.7.1 (same day) added metric-matched fallback faces**, removing the
  navbar shift when the fonts land after first paint (16.6px → 0.1px;
  maintenance 11.9px → 5.2px, its uppercase title being wider than the
  subtitle). mesonet-explorer (12 rules) and mco-snowpack-explorer (2) had
  hard-coded `'Space Mono', monospace` in their CSS, which skipped the
  fallback; both now use `var(--font-mono)`.
- **Pre-existing, not from 0.7.0:** mco-snowpack-explorer logs ~16
  `[cog] OffscreenCanvas has no rendering context` errors at 390px in both its
  old and new versions. *(2026-10-09: a kit bug in `cog-protocol.js`
  `emptyTile()`, fixed in 0.11.3.)*
- **Drift noted, not fixed:** mco-snowpack-explorer hides `.brand` +
  `.nav-divider` with `display: none` at ≤1060px — earlier than the kit's
  750px collapse and by the method the kit avoids (it would drop an `<h1>`;
  snowpack's title is a `<span>`, so nothing is lost today). Reconcile on its
  next pass.

### 0a. 0.10.0 (2026-10-09)

0.10.0 is the navbar release: the rail (#38), the sticky bar (#4),
`aria-current` and the 3-state toggle (#3), display numerals (#36) and the
legible lockup and glass (#37). Its anti-flash snippet is unchanged from
0.9.0, so an app on 0.9.0 re-points with a tag bump and a check of its
navbar wrap points. The six consumers are being re-pointed to 0.9.0 first,
one PR per app, because the MapLibre 6 fix can't wait on this release.
#27 (logo) shipped in 0.11.0 the same day: Kyle settled that the brand lives
in mco-web-style, so the kit's `assets/` is now the source of truth for the
badge and wordmark.

### 0. 0.9.0 shipped the same day (2026-10-08)

The 0.9.0 set (#5–#7, #9–#11, #13, #14, #17, #18, #22, #23, #25, #26, #28,
#29, #31, #33, #34) is in: drawer, sheet, overlay focus/Esc, loading, cards,
chips, stepper, palette module, chart tokens, title/social helpers, footer,
marker paints, and `tools/verify/`. Consumers can go **straight from 0.7.1 to
0.9.0** by doing both MIGRATING re-point sections' pass 1 together: MapLibre 6
plus a re-copied anti-flash snippet, so one CSP hash change instead of two.
MapLibre 6 stays the urgent part.

### 1. Re-point the six consumers to 0.8.0 (cut 2026-10-08)

0.8.0 shipped everything that was planned for it, plus the dashboard
proposals' 0.8.0 set (#1, #2, #8, #12, #15, #16, #19–#21, #24, #30, #32, #35).
**The urgent half is MapLibre 6**: every map consumer still runs 5.18.0, which
carries the critical attribution-control XSS (GHSA-jrc7-96c5-q579). Exposure
is CARTO's attribution strings, so all of them are affected, not only those
that call `setHTML`. Follow MIGRATING § 0.7.x → 0.8.0: **pass 1** (tags, import
map, CSP `worker-src blob: https://unpkg.com`, `loadMapLibre`) for all six
first, then **pass 2** one deletion at a time.

- **maint first in pass 2**: its raw `p.thumb` in a `style=` string is
  attribute injection from an API response, not a kit-blocked change.
- **status, maint and umrb** fix a shipped WCAG 1.4.3 failure by moving to
  `.mco-legend-row` (their `.legend-row.off { opacity }`).
- **explorer** deletes both 0.8.0-tagged kit-overrides (attribution underline,
  long-modal header/shade), `#sidebar-scrim`, its local zoom-floor guards, and
  `color: #fff` on `--accent` (`#scale-apply` → `.nav-btn.is-primary`).
- Record each app's `tools/conformance.mjs` score before and after.

Still open from the 0.8.x line: **#27 logo assets**, which waits on brand-owner
sign-off for a `currentColor` wordmark.

### 2. Next migrations, in the order I would take them

| Property | Why it is next | Shape of the work |
|---|---|---|
| **mesonet-dashboard** | Most-linked page in the network and mid-rewrite — the cheapest adoption moment there will be | Different: React 19 + Mantine 8. Inject `tokens/tokens.json` into `web/src/lib/theme.ts`. Tests whether the kit works outside vanilla apps, which it has never had to. |
| **mesonet_app Leaflet pages** | Same repo, momentum, and the deploy path is already understood | `latest` (1479 lines, the real one), `stations`, `funding`. All Leaflet 1.9.4, no framework. ⚠️ Settle first whether `progress` and `Sensor_Map` should exist at all — both are unmounted dead directories, and `Sensor_Map` is the Leaflet ancestor of the UMRB build map. |
| **mesonet-aq**, **mesonet-ogc** | Small, mechanical | Token swap + MapLibre bump. mesonet-ogc: confirm it is actually deployed first. |

### 3. Not kit work — owned outside this repo

- 🔑 **Revoke the Stadia and MapTiler keys.** They are out of
  mco-snowpack-explorer's working tree but remain in its **public git history**.
  Removing them from HEAD does not retire them. This is the only item here with
  a security clock on it.
- **`ppt` in daily mode** still fails server-side on the exact call every other
  variable now succeeds with — see the API note below.
- **`acesfork`** is tagged cell `E-9`; the drawn grid stops at `E-6`.
- **`drought.climate.umt.edu`** CNAME collision, open since the census.

### 4. Process lessons worth not relearning

- **Kit-owned is a per-selector fact, not a per-section one.** Deleting a CSS
  section wholesale because "the kit owns this" has now broken three apps —
  palette tokens, tooltip line classes, a modal's positioning, and a navbar that
  went 52px → 150px. Diff the selectors an app *emits* against the ones the kit
  *styles*. An orphan-class scan helps but is not sufficient; it found four of
  six the last time. A computed-layout dump found the rest.
- **Replace a doc section by matching its own boundaries**, never by splicing
  between one heading and whatever heading follows. That deleted three sections
  of this file once already.
- **Establish a baseline before touching anything**, and re-run it against a
  pristine checkout before calling a failure a regression. Two "new" test
  failures on mesonet-explorer turned out to fail *more often* at baseline.
- **Verify by running, not by reading.** Every real defect this month —
  the `escapeRe` deletion, the CSP-blocked DEM, the blocked AirTable photos,
  the 150px navbar — was invisible in the diff and obvious on screen.


## Migrated

**Conformance** is `node tools/conformance.mjs <repo>` (CONFORMANCE.md): the
automatic checks, measured 2026-10-09 by each re-point agent (baseline on
@0.7.1 → after PR A → after PR B; PR B is open). Earlier: 2026-10-08 on @0.7.1. Most
misses are 0.8.0 adoptions waiting on the re-point (announcer, twin, basemap
watch, DOM popups, clean URLs, MapLibre 6). Re-measure after each pass.

| Property | Kit version | Conformance | Notes |
|---|---|---|---|
| **mesonet-status** | **@0.11.2** (2026-10-09; @0.7.1 2026-09-30; @0.6.0 2026-08-04) | 17 → 21/30 (PR A) → 27/30 (PR B) | First consumer; the proof-of-concept migration. All checklist WCAG fixes applied; adopted hillshade, counties, high-contrast, MT time, CSP; back-ported the animated collapse, aria-atomic regions, fetchJSON cache option, tribal 0.10 fill, and the lockup-divider rhythm into the kit (v0.3.0/v0.3.1). **Header now mirrors mesonet-photos (2026-08-04):** dropped its "branding at all widths" override for the kit brand collapse (safe now that the kit hides the lockup visually, so its `<h1>` survives), and adopted the collapsible search — becoming the second consumer is what admitted that component to the kit in v0.5.0. Keeps its controls break at 1200px, not photos' 1060px: this bar needs ~1120px for one row. Its three-row band at 461-527px is what moved the kit's search collapse to the 640px compact edge in v0.6.0 — the wrap point had been drifting with its live chip counts. ⚠️ Its data path is **not verifiable from the UMT campus network** — github.io is a public origin and the API resolves to a private IP, so Chrome LNA blocks it (it degrades gracefully with an error toast). Decision record in its migration commits. |
| **mesonet-photo-explorer** (was mesonet-photos until 2026-09-20) | **@0.11.2** (2026-10-09; @0.7.1 2026-09-30; @0.6.0 2026-08-04) | 19 → 24/30 → 28/30 | Second consumer; first migration run straight from MIGRATING.md with no kit release needed. App code extracted to `docs/app.js` under a meta CSP; adopted kit tokens/shells/selectors, high-contrast, MT stamps, `?kbd=off`, skip link + `<main>`, a live region, an sr-table twin (one row per grid cell), 30px `.seg-btn`, and the kit's subtitle-only 750px shed. **Kit-overrides: no hillshade** (opaque photo rasters are the figure; relief would only show in the untiled west) and a ≤750px navbar that wraps + lifts `.nav-meta` beside the brand instead of shedding it. Kept app-local per § kit-deferred: photo mosaic, gallery/lightbox, date stepper, direction `<select>` fallback, `updateSocialMeta`, branded PNG export. Fixed in flight: focus-restore `.focus();.blur()`, unprefixed `mco-info-seen` (shimmed), mouse-only photo enlarge (now a real button), untappable 15px date steppers, `src=""` re-requesting the page, and the stale D3 docs. Later same day: prototyped the collapsible search that became kit v0.5.0, then refactored onto the shared component; added a landing-slot fallback (the newest timestep is often unmirrored, so it probes and steps back rather than showing a blank mosaic). Its nameless date/time controls below 1400px drove the v0.5.1 `.control-label` fix. On the v0.6.0 bump its width ladder caught a mis-bounded edit from its own 0.5.0 refactor that had duplicated ~84 CSS lines and left a local `#btn-search-toggle { display: none }` — an ID selector outbidding the kit class, which would have stranded search between 461-640px. Decision record in its migration commits. |
| **mesonet-umrb-build** (UMRB Build Status; was `mesonet_app/static/status/`) | **@0.11.2** (2026-10-09; @0.7.1 2026-09-30; @0.6.0 2026-08-16) | 14 → 18/30 → 27/30 | Third consumer. **Moved to its own GitHub Pages repo on 2026-09-29** — `main` root, proxied at `mesonet.climate.umt.edu/umrb/` (Caddy + mesonet-gateway), so pushing `main` now deploys like the other Pages consumers; the frozen copy in `mesonet_app` still serves at `/api/v2/map/status/` for now and the mesonet-db-rds API 301s that path here. Reads its live AirTable feed cross-origin from `mesonet2.climate.umt.edu` (`connect-src` carries the host). Migrated to the kit while still FastAPI-served (`StaticFiles`, image rebuild to deploy). Renamed from "UMRB Station Status" at migration. Inline module → `app.js` under a meta CSP; adopted kit tokens/shells/selectors, high-contrast (new to this page), hillshade, the kit tribal treatment + `TRIBAL_LABEL_LAYOUT`, shared `mco-theme`, MT stamps, `?kbd=off`, skip link + `<main>`, sr-table twin (one row per grid cell), collapsible search, and clean-URL default elision. **Fixed in flight:** `--text-dim: #6b7a90` (AA fail), `--c-warn` at 2.2:1 on the light navbar → `#7d5a0e`, two `outline: none` focus kills, the `=== 'dark'` basemap bug, and the intro modal writing its seen-key on *close* (so anyone who navigated away without closing saw it every visit). **Station dots became first-class:** click and hover resolved through `cellById` and dead-ended for any station whose `ace_grid` names no drawn cell — `?station=` now opens a station popup, and the one orphan (`acesfork`, tagged `E-9`; the E row stops at E-6 and its point falls outside the grid entirely) says so explicitly. That is a **registry/geometry data defect, not a display one** — worth fixing at source. Kept app-local per § kit-deferred: cell-status ramp, search combobox, legend rendering. Verified: 33 checks, axe 0 serious/critical in all three themes, against a capture of the live 311-record feed. |
| **mesonet-maintenance** (Station Maintenance; was `mesonet_app/static/maintenance/`) | **@0.11.2** (2026-10-09; @0.7.1 2026-09-30; @0.6.0 2026-08-16) | 14 → 18/30 → 29/30 | Fourth consumer; near-identical twin of the build-status map, migrated in the same pass. **Moved to its own GitHub Pages repo on 2026-09-29** alongside it — `main` root, proxied at `mesonet.climate.umt.edu/maintenance/`; the frozen `mesonet_app` copy still serves at `/api/v2/map/maintenance/` for now and mesonet-db-rds 301s it here. Live AirTable feed read cross-origin from `mesonet2.climate.umt.edu` — 524 of that map's 571 CSS lines had been byte-identical to this file's. Same adoptions. Its tribal paints and `TRIBAL_LABEL_LAYOUT` were **byte-identical to the kit's already** (this page is where those values came from), so consuming them back was pure deletion. **Fixed in flight:** three popup pills failed WCAG 1.4.3 — `new` at 2.43:1, `as_needed` 3.46:1, `visited` 4.14:1, all white-on-light; text color is now per-pill with the measured ratio recorded. An axe scan never caught them because the popup only exists after a click. Also `src=""` on the lightbox image (re-requests the page), and a `map(escapeHTML)` reference the migration's own sweep missed because it had no paren. ⚠️ **Visit photos are AirTable attachments on `*.airtableusercontent.com`** — those URLs appear only in the API response, never in the HTML, so the first CSP cut allowed `'self' data: blob:` and every thumbnail died silently (a blocked CSS `background-image` renders as an empty box, not an error). `img-src` now carries the wildcarded attachment host. Kept app-local: compliance model, colocation/spider, photo gallery + lightbox, trip-type chips. Verified: 33 checks, axe 0 serious/critical in all three themes, against captures of the live 231-station / 179-record feeds. |
| **mesonet-explorer** | **@0.11.2** (2026-10-09; @0.7.1 2026-09-30; @0.6.0 2026-08-16) | 14 → 19/30 → 26/30 | Fifth consumer and the closest to the house style already: **all 55 tokens it defined that the kit also defines were byte-identical**, so the palette was pure deletion, and 24 CSS rules matched the kit exactly. index.html 1801 → 1588 (CSS 1299 → ~1040). Adopted high-contrast (no values existed here at all), hillshade, `MCO.viewport` — which retires a documented "KEEP THE QUERY IN SYNC" hazard, since the breakpoint was duplicated between its JS and its CSS — the MT time helpers, skip link, and the §1 page-title rule. **Fixed in flight:** `shiftDate` ended in `toISOString()`, so the date stepper did nothing at UTC+13/+14 and skipped two days at UTC−12 (reproduced; correct in MT, which is why it hid); info-modal prose links were colour-only; the dimmed legend row put its label at 2.69:1 — the fix had to move the dim onto the swatch, because parent `opacity` composites the whole subtree and a child cannot undo it; the AgriMet chip hardcoded `#fff` on `--accent` (2.22:1 once high-contrast existed). **Daily mode never rendered at all** — see the API note below; the client half is fixed and uniform. `Spectral` left the ramp picker (HOUSE-STYLE §6) with its ramp data kept so shared links still render. **Kit-overrides, both marked for deletion at 0.7.0:** underlined attribution links, and the long-modal sticky header + scroll shade. Its `#sidebar-scrim` is deliberately NOT `.mco-scrim` (absolute inside the map, not viewport-fixed). Verified against a pristine pre-migration checkout rather than assumption: its own suite 149–152/152 across four runs with every failure traced to two flakes that are **worse at baseline**, plus a separate axe pass clean in all three themes, then re-verified live. ⚠️ Pages deploys from `main` root — a push IS the deploy. |
| **mco-snowpack-explorer** | **@0.11.2** (2026-10-09; @0.7.1 2026-09-30; @0.6.0 2026-08-16) | 10 → 15/29 → 21/29 | Sixth consumer and the least-migrated starting point: no CSP, SRI, favicon, skip link, `<main>`, `.sr-only`, reduced-motion gate or high-contrast, and 894 lines of app JS inline. index.html 1536 → ~460; the JS is now `app.js` (kept an ES module — it imports hyparquet from esm.sh at runtime). Its local `cog-protocol.js` was **byte-identical** to the kit's and is deleted in favour of it. 🔑 **Both API keys are gone**: moving to keyless CARTO and the kit's terrarium hillshade retired `STADIA_API_KEY` and `MAPTILER_KEY`, so this static site ships no credential. ⚠️ **They remain in git history on a public repo and must be revoked at both vendors** — removing them from HEAD does not retire them. **Fixed in flight:** `--text-dim` #6b7a90/#7a8190 (the fourth app carrying that AA failure); the gridded raster was reachable by **hover only** — no touch path and nothing for AT — so a click/tap now pins a reading and announces it through a live region; `role="tooltip"` on a permanently-nameless element (it was *hurting*, promising a name and trigger that do not exist); the SNODAS ramp is hue-only, so **USDM category names are now printed in the legend** as the WCAG 1.4.1 redundant channel — they had lived only in code comments; a hard-coded `animate: true`; and no touch targets. `flatgeobuf@3` was a **floating major** — SRI against a floating version hard-fails the day the CDN moves — pinned to 3.38.0. **Migration defect worth recording:** deleting the navbar CSS section wholesale took four app-owned rules with it (`.control-group`, `.date-stepper`, `.nav-actions`, `.nav-btn.date-step`), which let the kit's 34px `.nav-btn` minimum apply to the date steppers and inflated the navbar 52px → 150px. An orphan-class scan caught only four of six; the computed-layout dump found the rest. Restoring `.nav-btn.date-step` verbatim would have restored a 15px touch target, so the mesonet-photos precedent applies (row of 40px targets on `hover: none`). Verified: 20 checks, axe clean at serious/critical in all three themes, COG raster confirmed painting on a winter date rather than trusted from a summer screenshot. ⚠️ Pages deploys from `main` root to **snow.climate.umt.edu** — a push IS the deploy. |
## House-styled, not kit-consuming

**Empty as of 2026-08-16** — mesonet-explorer was the last one and has migrated.
The category exists because it is a real state and will recur: an app that
*looks* right while carrying its own inline copy of the tokens, with zero
`MCO.*` calls and no pinned kit `<link>`. It silently forks the palette. If a
survey turns up another, add it back here rather than filing it under "Adopt
now" — the distinction is what tells you the work is mostly deletion.

## Adopt now

| Property | What it is | Notes for migration |
|---|---|---|
| mco-drought-dashboard ⛔ **hands-off** | Vanilla OpenLayers SPA (docs/) | **Do not touch unless Kyle asks for this repo by name** (2026-08-16) — it is deliberately different and must be excluded from every cross-cutting sweep (title standardization, token reconciliation, bulk kit adoption). Read-only surveys are fine. Original notes: Most token-mature, deliberately drifted (bg-deep #10141d etc.) — reconcile to kit tokens or record as sanctioned overrides. Its high-contrast theme is now the kit's (with fixed accent tints — its own lines 121-125 still carry stale rgba values). Replace the 25-selector focus-visible list with the universal rule. Fold in `docs/legacy/` copies and the unbranded `methods.html`. |
| mco-data-cdn (storage browser) | React + Vite | Already drift-free; swap `--mco-*`-prefixed theme.css for kit tokens (or keep the prefix as a local alias of tokens.json values). Natural home stays as-is — the kit ships via jsDelivr because this CDN resolves to a private IP on campus. |
| mesonet-dashboard (`/dash/` rewrite, `web/`) | React 19 + Mantine 8 + MapLibre 5.24 | The most-linked page in the network, mid-rewrite = cheapest adoption moment. Inject `tokens/tokens.json` into `web/src/lib/theme.ts` (currently stock Mantine blue + system fonts). |
| mesonet_app Leaflet pages | FastAPI `StaticFiles` mounts: `latest`, `stations`, `funding` — 3 unstyled Leaflet pages | The two MapLibre maps moved to the section above (`status` converted 2026-08-15). The census's "1 MapLibre + 6 Leaflet" is really **2 MapLibre + 3 Leaflet served**: `main.py:372` has `progress` commented out and `Sensor_Map` is never mounted, so both are dead directories on disk — confirm before styling, and consider deleting them. These three: adopt theme/core now; MapLibre migration opportunistically (house library — HOUSE-STYLE §7). |
| mesonet-db-rds static maps | Active rewrite carrying a stale fork of the same map suite | Adopt the kit here rather than re-forking unstyled pages; its `status/` diverged and `maintenance/` is missing from the copy. |
| mesonet-aq | Vanilla MapLibre 4.7 SPA (docs/) | Copied the *shape* of the house style with none of the tokens (WordPress-admin blue, no custom properties). Mostly mechanical token swap + MapLibre bump. |
| mesonet-ogc | Single MapLibre 3.6 landing map | Smallest file, biggest visual win per line. Bump MapLibre to the family pin (6.x, ESM via `MCO.map.loadMapLibre`) while in there. Confirm it's actually deployed (nothing references it from the Docker/pygeoapi config). |
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

## Page titles

`<Short name> · <Family>` — rule and reasoning in HOUSE-STYLE §1 Naming.
Decided 2026-08-16 across a family that had drifted to four separators.
**All six migrated consumers now carry it** (applied 2026-08-16 — the rule
post-dated four of the migrations, so they were swept afterwards). Rows marked
✅ are live-correct; unmarked ones apply it when they migrate.

**The family half has two forms and the surface picks one:** the tab gets the
abbreviation (it truncates at ~15 characters and is read by someone who already
knows what they opened); the link card gets the full name (Slack and social,
read by someone who may never have heard of the office). The short app name is
identical in both. `og:site_name` takes the **long family alone** — every app had been setting it
to its own title, which is what that field is not for.

| Property | `<title>` (tab) | `og:title` / `twitter:title` (card) | `og:site_name` |
|---|---|---|---|
| mesonet-explorer ✅ applied | **Explorer · MT Mesonet** | Explorer · Montana Mesonet | Montana Mesonet |
| mesonet-status ✅ applied | **Status · MT Mesonet** | Status · Montana Mesonet | Montana Mesonet |
| mesonet-photo-explorer ✅ applied | **Photos · MT Mesonet** | Photos · Montana Mesonet | Montana Mesonet |
| mesonet-maintenance ✅ applied | **Maintenance · MT Mesonet** | Maintenance · Montana Mesonet | Montana Mesonet |
| mesonet-umrb-build ✅ applied | **UMRB Build · MT Mesonet** | UMRB Build · Montana Mesonet | Montana Mesonet |
| mesonet-aq | **Air Quality · MT Mesonet** | Air Quality · Montana Mesonet | Montana Mesonet |
| mesonet-ogc | **Map · MT Mesonet** | Map · Montana Mesonet | Montana Mesonet |
| mco-snowpack-explorer ✅ applied | **Snowpack · MCO** | Snowpack · Montana Climate Office | Montana Climate Office |

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
- The photos repo has now been renamed three times — `mesonet-photo-explorer` →
  `mco-mesonet-photos` → `mesonet-photos` (2026-08-05) → back to
  **`mesonet-photo-explorer`** (2026-09-20, once it stopped managing photos; its
  canonical URL is `mesonet.climate.umt.edu/photos/`). Its `terraform.tfvars`
  and `.example` were re-pointed both times. Each rename strands the old absolute
  path in that repo's `.venv` shebangs; harmless, recreate the venv.
- **Deferred to the next kit release (0.7.0):** `core/mco-core.js` still names
  `mco-mesonet-photos` in two comments (lines 8, 71). Left alone deliberately —
  it is one of the four SRI-pinned published files, so changing a byte fails
  `tools/check-sri.mjs` in three documents and would force a version bump for a
  comment. 0.7.0 is now scheduled (see CHANGELOG § Planned), so fold it in there.
- **API issue — Kyle's, not kit work (characterized 2026-08-16):**
  mesonet-explorer's **daily mode never renders**. The client is behaving: it
  issues the request at ~3.4 s and allows 150 s. The endpoint hangs ~90 s and
  the browser gives up with `net::ERR_FAILED`.

  Probed `/observations/daily/` directly. **Any range that includes today
  times out**; past ranges answer, slowly:

  | Query | Result |
  |---|---|
  | `elements=air_temp` (no range) | 200, 0.4–11.7 s |
  | `elements=air_temp&rm_na=true&tz=…` | 200, 0.4 s |
  | `…&start_time=2026-08-10&end_time=2026-08-11` (past) | 200, 30.6 s |
  | `…&start_time=2026-08-10&end_time=2026-08-10` (past, same day) | **404** |
  | `…&start_time=<today>&end_time=<tomorrow>` ← **what the map sends** | **timeout** |
  | `…&start_time=<today>&end_time=<today>` | **timeout** |
  | no `elements=` at all (every element) | **timeout** |

  Two independent triggers, either alone enough: **a range covering today**,
  and **omitting `elements=`**. `fetchObs` does both. Timings are erratic
  run-to-run, so these are indicative, not benchmarks.

  Client-side observation for whoever fixes this: `fetchObs` is the only
  fetcher in the file still on `/observations/grouped/?day=true`; `fetchExtra`
  and `fetchDerived` already use the dedicated `/observations/daily/` and
  `/derived/daily/`. But switching endpoints alone would NOT have fixed it —
  the dedicated one times out on the same parameters. The date range covering
  today is the real trigger, and that is server-side.

  **Client side is fixed and uniform (2026-08-16).** `fetchObs` now sends
  `elements=<the active variable's els>` and omits `start_time`/`end_time` for
  today, for **every** daily variable — no per-variable special-casing. Daily
  air temperature went from never rendering to **3.5 s**; latest and hourly are
  unchanged. `ppt` still fails on the identical call (request at 2.7 s, dead at
  92.9 s), so the remainder is server-side and Kyle is fixing it there.
  Deliberately still `/observations/grouped/`, NOT `/observations/daily/`:
  "grouped" is what merges multi-height sensors into the one column the
  variable registry resolves against (`Wind Speed [mi/h]` vs `@ 10 m` AND
  `@ 8 ft`), so swapping endpoints would silently break every multi-height
  variable.

  This is also what the explorer suite's one failing check
  (`exports: daily precipitation — NO DOWNLOAD`) reports: the export waits on a
  first render that never lands. **Not a migration regression** — it predates
  the migration. (An earlier version of this note said no request was issued at
  all; that was wrong, from counting `response` events, which a hanging request
  never produces.)
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
