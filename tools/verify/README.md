# tools/verify: the consumer verify harness

Five scripts that check an MCO app against the house style, and one that
checks the **kit** against the apps (`canary.mjs`). Run them from a
kit checkout against the app's repo; nothing is copied into the app. They are
lifted from mesonet-dashboard's `scripts/verify/` and made app-agnostic.

| Script | Needs a browser | What it checks |
|---|---|---|
| `head.mjs` | no | Kit pin and SRI (modulepreloads included; font preloads exempt by design), CSP `default-src 'none'` with every inline script hashed (the MapLibre import map too), `worker-src blob: https://unpkg.com`, anti-flash before the first stylesheet, `viewport-fit=cover`, skip link first → `#main`, `<main id=main tabindex=-1>`, no `outline: none`, `mco-` storage keys |
| `axe-matrix.mjs` | yes | Each scenario × 3 themes × 1440 / 390-touch: axe serious/critical, console + page errors + CSP violations, and touch targets ≥ 40 px (44 px close) at 390 |
| `keyboard.mjs` | yes | Skip link first and focusing `#main`, a visible ring on every Tab stop, the info dialog's Esc and focus return, `?kbd=off` per shortcut, plus your own probes |
| `canary.mjs` | yes | **Downstream effects of the kit working tree.** Loads each consumer as committed (twice, to measure noise) and with its kit tags served from this checkout, per browser × theme × width. Reports new errors / CSP violations / axe failures / small targets, chrome geometry moves, pixel diff against the noise floor (map canvas masked), and a map that stopped painting |
| `lint-css.mjs` | no | Drift counts: raw hex, raw `z-index`, `'Outfit'` literals, `outline` kills, `display: none` on `.brand` / `.control-label`, **untagged overrides of kit selectors** |

`head.mjs` and `axe-matrix.mjs` exit non-zero on a failure, and so does
`keyboard.mjs`. `lint-css.mjs` only measures (exit 0) unless you pass
`--strict`. `tools/conformance.mjs` is the scorecard; these are the gates.

## Run

```sh
# From the kit checkout, with the app checked out beside it:
node tools/verify/head.mjs     --root ../mesonet-status
node tools/verify/lint-css.mjs --root ../mesonet-status --verbose

# Browser scripts need Playwright + axe, installed ephemerally (AGENTS rule 1:
# never a committed package.json):
# Install EVERYTHING in one command: each `npm i --no-save` prunes packages
# that an earlier --no-save install added.
npm init -y >/dev/null && npm i --no-save playwright @axe-core/playwright pngjs pixelmatch
npx playwright install chromium webkit
node tools/verify/axe-matrix.mjs --root ../mesonet-status
node tools/verify/keyboard.mjs   --root ../mesonet-status

# Every browser script runs Chromium AND WebKit (Safari's engine) by default;
# narrow with --browsers chromium (or BROWSERS=webkit).

# Downstream: what would this kit checkout do to the apps? (~10 min per app)
node tools/verify/canary.mjs --consumer ../mesonet-status \
  --consumer ../mesonet-photo-explorer:docs/index.html \
  --accept tools/verify/canary-accept.json --out canary-out

# An app that publishes from docs/:
node tools/verify/axe-matrix.mjs --root ../mesonet-photo-explorer --page docs/index.html
```

The tooling resolves from the nearest `node_modules` above `tools/verify/`. To
use an install elsewhere, set `VERIFY_MODULES=/path/to/node_modules` (ESM
ignores `NODE_PATH`). `VERIFY_CHANNEL=chrome` uses installed Chrome.
Chromium runs with SwiftShader, so MapLibre's WebGL2 works headless.

## Config

Without a config the scripts load the page once and wait for `load`. Real
render evidence needs a config, `verify.config.mjs`. Keep it in the app repo,
committed or not:

```js
export default {
  root: '.', page: 'index.html',
  storage: { 'mco-status-seen-intro': '1' },        // seeded before every load
  scenarios: [
    // ready: a FUNCTION run in the page, or a CSS selector. Never a string
    // of code: a meta CSP without 'unsafe-eval' rejects it.
    { name: 'default', query: '', ready: () => document.querySelectorAll('#sr-twin tbody tr').length > 100 },
    { name: 'station', query: '?station=acebozem', ready: '.mco-sheet[data-state="peek"]' },
  ],
  exemptTargets: '',          // selector of tolerated small targets; say why
  allowProblems: [],          // console substrings to tolerate; say why
  dialogOpener: '.mco-btn-info',
  shortcuts: [{ key: '/', effect: () => document.activeElement?.type === 'search' }],
  probes: async ({ open, check }) => {
    const { page, close } = await open('?net=agrimet');
    check('?net=agrimet re-emits on interaction', /net=agrimet/.test(await page.evaluate(() => location.search)));
    await close();
  },
};
```

```sh
node tools/verify/axe-matrix.mjs --config ../mesonet-status/verify.config.mjs
node tools/verify/keyboard.mjs   --config ../mesonet-status/verify.config.mjs
```

`root` in a config is resolved from the current directory, so from the kit
checkout write `root: '../mesonet-status'`, or pass `--root` to override.

## What it can't do

- It doesn't record fixtures. Live APIs are live, so a page whose API is
  unreachable from the verify machine fails the console check. That's the
  campus-LNA case: mesonet-status from the UMT network. List the expected
  errors in `allowProblems`, or run off-campus.
- The URL-param matrix, legacy-storage shims and production screenshot diffs
  are app knowledge. Put them in `probes` (MIGRATING § Verification recipe).

## The canary (`canary.mjs`)

The candidate run intercepts every `cdn.jsdelivr.net/gh/mt-climate-office/
mco-web-style@<any>/…` request and answers it from this checkout, and strips
`integrity` from the kit tags in the served HTML. The origin stays jsDelivr,
so the consumer's real CSP still applies. It is the "consumer bumps its tags
and nothing else" case, which is also how a consumer still on MapLibre 5
meets a newer kit.

- **Noise:** the baseline loads twice. A selector whose geometry differs
  between the two baselines is listed as `noisy` and never blamed on the
  kit, and the pixel diff must beat the baseline-to-baseline diff by
  `--threshold` (0.5%). Settling waits for 1.5 s of network quiet, then
  `--settle` ms.
- **Expected changes:** list them in `canary-accept.json` with the reason
  (CHANGELOG), and empty it after the release is tagged. Anything else that
  moved is a regression until someone explains it.
- **CI:** `.github/workflows/canary.yml` runs it for all six consumers on every
  PR. Each job's report lands in the job summary and the images in an
  artifact.
- **Calibrated 2026-10-08:** three reruns with no kit change agree; a planted
  navbar regression (52→80px) is caught in WebKit with 3.87% pixels against a
  0.38% noise floor.

## WebKit notes

- WebKit's `isMobile` (iOS emulation) reports an unstyled
  `getComputedStyle(<body>)` on long pages while painting correctly, which
  gives axe false contrast failures. The touch pass uses `hasTouch` alone in
  WebKit, which already matches `(hover: none)`.
- Safari's default Tab reaches only form controls. The keyboard probes press
  ⌥Tab in WebKit, the route a Safari keyboard user takes.
