# tools/verify: the consumer verify harness

Four scripts that check an MCO app against the house style. Run them from a
kit checkout against the app's repo; nothing is copied into the app. They are
lifted from mesonet-dashboard's `scripts/verify/` and made app-agnostic.

| Script | Needs a browser | What it checks |
|---|---|---|
| `head.mjs` | no | Kit pin and SRI (modulepreloads included; font preloads exempt by design), CSP `default-src 'none'` with every inline script hashed (the MapLibre import map too), `worker-src blob: https://unpkg.com`, anti-flash before the first stylesheet, `viewport-fit=cover`, skip link first → `#main`, `<main id=main tabindex=-1>`, no `outline: none`, `mco-` storage keys |
| `axe-matrix.mjs` | yes | Each scenario × 3 themes × 1440 / 390-touch: axe serious/critical, console + page errors + CSP violations, and touch targets ≥ 40 px (44 px close) at 390 |
| `keyboard.mjs` | yes | Skip link first and focusing `#main`, a visible ring on every Tab stop, the info dialog's Esc and focus return, `?kbd=off` per shortcut, plus your own probes |
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
npm init -y >/dev/null && npm i --no-save playwright @axe-core/playwright
npx playwright install chromium
node tools/verify/axe-matrix.mjs --root ../mesonet-status
node tools/verify/keyboard.mjs   --root ../mesonet-status

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
