# Guardrails for working on mco-web-style

Instructions for anyone — human or AI agent — changing this repo or consuming
it from an app. The reasoning behind each rule is in
[HOUSE-STYLE.md](HOUSE-STYLE.md); this file is just the rails.

## The kit's constitution

1. **Zero build, zero runtime dependencies. Ever.** No package.json (it is
   gitignored on purpose), no bundler, no framework, no TypeScript, no
   preprocessor. Published files are hand-written CSS and classic-script JS
   that run as-committed. CI tooling installs ephemerally and is never a
   runtime dependency.
2. **Tokens only.** A hard-coded hex is a review-blocker unless it is
   (a) data-encoding under the CVD policy (HOUSE-STYLE §6), or (b) annotated
   with a contrast comment naming the surface it was measured against and the
   WCAG criterion.
3. **`--accent` is fill-only.** Borders, icons, text → `--accent-line`.
4. **New tokens go in all three theme blocks** (dark, light, high-contrast)
   AND `tokens/tokens.json`. CI enforces parity and sync.
5. **Admission rule:** no NEW feature enters the kit until ≥ 2 MCO properties
   need it — one-app code stays in that app. Migration **back-ports** are
   different: fixing a defect or reconciling drift in code the kit already
   owns needs only the one migrating consumer (MIGRATING.md step 3; the
   mesonet-status migration back-ported five such changes).
6. **A11y gates are non-negotiable** (HOUSE-STYLE §5): universal focus ring,
   live-region + table-twin for canvas data, reduced-motion via the live gate,
   touch targets, skip link, `aria-pressed` idiom, keyboard twins, `?kbd=off`
   for single-char shortcuts. The axe workflow failing on serious/critical is
   a hard stop, not a flake to re-run.
7. **No secrets, no API keys** in this repo — `themedStyleUrl()` exists so keys
   stay in consumers. No credentials, no `.tfstate`, no private keys.
8. **The demo is coverage.** New component or API → exercise it in
   `demo/index.html`, or the a11y/CI gates are auditing nothing.

## Releasing (order matters — SRI)

0. Start from a **clean tree** — land or stash unrelated doc/tool changes
   first; a release commit contains only the release.
1. Gates green locally: `node --check` the three JS files, then
   `tools/check-tokens.mjs`, `tools/check-contrast.mjs`; eyeball `demo/` in all
   three themes.
2. Freeze the four published css/js files. Any byte change after this point
   restarts here.
3. Bump `@version` in `snippets/head.html`, `demo/cdn.html`, `README.md`.
4. `tools/sri.sh` → paste hashes into those same three files →
   `tools/check-sri.mjs` passes.
5. `CHANGELOG.md` entry. Commit, push, wait for green Actions.
6. `git tag vX.Y.Z && git push origin vX.Y.Z`. **Never delete or re-point a
   tag** — jsDelivr caches tag content permanently; a bad release gets a new
   patch tag.
7. Open `demo/cdn.html` after propagation: every row green.

Version bump rules: PATCH = fix with no observable-contract change · MINOR =
additive · MAJOR = any rename/removal/default change (yes, a toast duration).

## When consuming the kit from an app

**Migrating an existing app? Follow [MIGRATING.md](MIGRATING.md)** — process,
settled precedents, gotchas, and the verification recipe. The rules below
apply to any consumer, migrated or new.

- Pin `@X.Y.Z` + `integrity` + `crossorigin` on every kit tag. Never `@latest`.
- Copy `snippets/anti-flash.html` INLINE into `<head>` — never load it from the
  CDN (it must run before first paint). If the app ships a CSP, recompute the
  inline script's sha256 (README § CSP) and add `https://cdn.jsdelivr.net` to
  `style-src`/`script-src`.
- Include `viewport-fit=cover` in the viewport meta or the kit's safe-area
  padding silently does nothing.
- localStorage: `mco-theme` is shared org-wide; everything else must be
  `mco-<app>-*` prefixed, and re-validated on read like a URL param.
- Don't fork kit styles. If the kit's version doesn't fit, override locally
  with a comment `/* kit-override: <why> */` and open a kit issue — if a second
  app wants the same override, it's a kit change.
- Style fixes land in the kit first, then flow to apps by version bump
  (HOUSE-STYLE §8).
- Add this block to the consuming repo's CLAUDE.md / AGENTS.md:

  ```markdown
  ## House style
  This app consumes mco-web-style (pinned + SRI in index.html). Design tokens,
  a11y mandates, and interaction conventions: see HOUSE-STYLE.md in
  https://github.com/mt-climate-office/mco-web-style — tokens only (no raw
  hexes), --accent is fill-only, aria-pressed drives toggle styling, canvas
  data needs a live region + sr-only table twin. To change shared styling,
  change the kit and bump the pinned version here; never patch a local copy.
  ```
