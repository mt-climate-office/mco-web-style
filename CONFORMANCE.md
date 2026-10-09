# Consumer conformance checklist

One page, checkable, per app. It is the house style reduced to yes/no
questions. **Automatic** items are answered by the static checker, and
`CONSUMERS.md` records its score per app:

```sh
node tools/conformance.mjs ../mesonet-status                    # entry = index.html
node tools/conformance.mjs ../mesonet-photo-explorer docs/index.html
```

**Manual** items (marked ✋) need a person or the verify harness
(`tools/consumer-verify.mjs`). The checker reads files only, so a ✓ there
means the right call exists, not that it behaves. Behavior is the verify
pass's job. Each item cites the rule it checks.

## 1. Head

- [ ] Kit tags pinned `@X.Y.Z` + `integrity` + `crossorigin`, one version throughout (README § Versioning)
- [ ] Both house font preloads, on the same version as the theme CSS (HOUSE-STYLE §1)
- [ ] Anti-flash snippet inline in `<head>`, current body (0.9.0 adds the `mco-booting` hold); with a CSP, **this page's** sha256 in `script-src` (README § CSP)
- [ ] `MCO.ready()` called once the first meaningful state is applied (HOUSE-STYLE §3)
- [ ] `viewport-fit=cover` in the viewport meta (§3)
- [ ] `<title>` is `<Short name> · <MT Mesonet|MCO>` (§1 Page title)
- [ ] `og:title`, `twitter:title`, `og:site_name` (long family alone) and `rel=canonical` (§1)
- [ ] Favicons and `og-card.png` hot-linked from the pinned kit tag (decided 2026-10-08); canonical on the production host (§1)
- [ ] **Map apps:** MapLibre 6 via the one-line import map from `snippets/head.html`; CSP `script-src` carries its hash and `worker-src` is `blob: https://unpkg.com` (§7, README § CSP)

## 2. Shell

- [ ] Skip link first in `<body>`, targeting `#main` (with `tabindex="-1"`). Not `#map-container` (§5.6)
- [ ] The brand title is the page's `<h1 class="brand-title">`, not a `<span>` (§3)
- [ ] Right-hand group is `.nav-meta`, not `.nav-actions` (§3)
- [ ] Info button is `.mco-btn-info` (§3)
- [ ] The ≤750px brand collapse is untouched, or overridden with a `/* kit-override: … */` comment (§3)
- [ ] ✋ Buttons that shed `.btn-label` below 1400px carry a permanent `aria-label` (§3)

## 3. Tokens

- [ ] No raw hex outside data palettes; every exception carries a contrast comment naming the surface and criterion (§2, §5.10)
- [ ] Status colors from `--danger` / `--warning` / `--success` (+ `-fill`, `text-on-`), not local `--c-warn` copies (§2)
- [ ] `--accent` only as a fill; borders, icons and text use `--accent-line` (§2)
- [ ] ✋ `--text-muted` / `--text-dim` never on `--bg-raised` (§2)

## 4. Accessibility

- [ ] Announcements through `MCO.announce`; no hand-made `#sr-announce` (§5.1)
- [ ] ✋ Filter/count changes, selection open/close, load failures and section changes are all announced (§5.1)
- [ ] One `MCO.srTable` twin per canvas/WebGL data layer, and the canvas `aria-label` points to it (§5.2)
- [ ] Legend "off" dims the swatch, never the row; legend rows are `.mco-legend-row` with `aria-pressed` (§5.7)
- [ ] ✋ Touch targets ≥ 40px (44px close buttons) under `hover: none` (§5.5)
- [ ] `?kbd=off` supported **and disclosed in the info modal** wherever single-key shortcuts exist (§5.9)
- [ ] ✋ Steppers and every pointer gesture have a keyboard twin (§5.8)

## 5. Maps

- [ ] `MCO.map.watchBasemap(map)`; data loads from `style.load`/`load`, never from a basemap-specific signal (§7)
- [ ] Popup, tooltip, sheet and table content DOM-built (`popupContent`, `initCursorTooltip`, `srTable`); no `setHTML`/`innerHTML` with API values; API URLs through `MCO.map.safeUrl` (§7)
- [ ] Selection halo colored by `--selection-ring` (§2)
- [ ] `MCO.map.addNavigation` (top-right, no compass) + `addFitControl` (§7)
- [ ] `MCO.map.installZoomFloor`, with app policy in `onBeforeSnap` (§7)
- [ ] ✋ Layer order: basemap → hillshade → basemap labels → boundaries → data (§7)

## 6. URL

- [ ] Clean defaults: camera via `cameraParamsIfDefault`, `theme` only when ≠ `MCO.osTheme()` (§4)
- [ ] ✋ Replace for view adjustments, `MCO.pushUrlState` for drill-down; Back closes the detail; `MCO.onUrlState` restores (§4)
- [ ] Every storage key except `mco-theme` is `mco-<app>-*` and re-validated on read (§4)

## 7. Verify

- [ ] ✋ axe 0 serious/critical at **1440 and 390px** in **all three themes**, including with popups, sheets and the search list open (`tools/consumer-verify.mjs`)
- [ ] ✋ Keyboard probes pass: search combobox, legend, sr-table twin, Esc unwinding one layer at a time
- [ ] ✋ Console clean with the CSP live (any blocked endpoint or stale hash shows up here)

---

The checker is deliberately conservative. A false ✗ costs one look, and a
false ✓ hides a shipped failure. When it is wrong, fix the regex here, not the
app. It reads the entry HTML, its inline `<style>`, and the local scripts the
page loads, so app CSS in separate files is not checked yet.
