# MCO code style

How code is written in the MCO map apps and the kit. [HOUSE-STYLE.md](HOUSE-STYLE.md)
covers design and behaviour. The [exemplar](exemplar/) follows this file exactly: copy it.

## Principles

- A stranger opens any app and finds the same things in the same places under the same names.
- Code says what. Comments say why. History lives in git and the changelog.
- If the kit has it, use it. If three apps need it, it goes in the kit.
- Anything a maintainer might tune is a named constant at the top. Fixed facts stay inline.

## Shape of a map app

- `app.js` is a plain ES module (`<script type="module">`), with no wrapper function.
- App CSS lives in `app.css`, not in `index.html`.
- State lives in three objects, declared once in the State section, every field commented:
  `state` (what the visitor chose), `data` (what was loaded), `els` (DOM elements and kit
  handles). The MapLibre `map` is the one other module-level variable.

`app.js` has these sections, in this order. Each starts with a banner filled to column 80:
`// ── Name ───…`. A subsection uses `// ─ Name`.

| # | Section | Holds |
|---|---|---|
| 1 | Header | Six lines at most: what the app is, where its data comes from. |
| 2 | Config | Every constant. Origins and URLs, intervals, zooms, sizes, `LAYER` ids, `STORAGE` keys. |
| 3 | State | `state`, `data`, `els`, `map`. |
| 4 | Utilities | Small pure helpers and formatters this app alone needs. |
| 5 | URL | `readUrl()` and `writeUrl()`, together. The only code that touches the address. |
| 6 | Data | `loadData()`, then shaping and classification. |
| 7 | Map | `initMap()`, `addCustomLayers()`, paint and filter updates. |
| 8 | Legend | `renderLegend()`. |
| 9 | Panel | `openStation(id)`, `closeStation()`, panel content. |
| 10 | Search | `initSearch()`. |
| 11 | Controls | `initControls()`: every listener, theme and keyboard included. |
| 12 | Export | `exportPNG()`, `copyShareLink()`. |
| 13 | Table | The screen-reader table. |
| 14 | Refresh | `refresh()` and its timer. |
| 15 | Boot | `boot()`: the one place that says what happens in what order. |

- Leave out a section the app does not need. Never rename or reorder one.
- State is declared before anything reads it.
- Listeners are attached in `initControls()`, after the map and state exist. A kit widget
  that owns its listeners (the search box, the station picker) is wired in its own section.

## Names

| Thing | Name |
|---|---|
| Host, API, dashboard link | `MESONET_ORIGIN`, `API_BASE`, `DASH_URL(id)` |
| Layer ids, storage keys | `LAYER.stations`, `STORAGE.intro` (one object each) |
| Loaded stations | `data.stations`, `data.stationById` |
| Selected station | `state.selected` |
| The side or full-screen station view | **panel**. Never popup, sheet, detail, card or dialog. |
| URL | `readUrl`, `writeUrl` |
| Start-up | `boot`, `initMap`, `loadData`, `initSearch`, `initControls` |
| Map | `map`, `addCustomLayers`, `applyFilters`, `paintSelection` |

- Constants are `UPPER_SNAKE` with a unit suffix: `REFRESH_MS`, `SEARCH_FLY_ZOOM`, `EXPORT_W_PX`.
- Functions are verbs. Booleans start `is` or `has`. DOM handles live in `els` and need no suffix.
- No leading underscore. Module scope is already private.

## Comments

- One line above a function says what it is for, when the name does not.
- Comment the why: a constraint, a unit, a browser quirk, an order that matters.
- Never: version numbers, dates, people, "was", "used to", "no longer". Never restate the
  code. Never describe how a kit function works; name it.
- A comment that is not true is a bug. Reviewers check comments against code.
- A kit override keeps the form `/* kit-override: <why> */`.

From the exemplar, shortened:

```js
// ── Map ──────────────────────────────────────────────────────────────────────

// CARTO draws its own dashed counties from z9. The kit's counties are the one
// treatment at every zoom.
function hideBasemapCounties() {
```

## Functions and errors

- One job per function. About 60 lines is the ceiling. `addCustomLayers` calls one function
  per layer group.
- `async`/`await`, not `.then` chains.
- A `try` wraps one concern. A failure tells the visitor what failed, in the kit's loading
  line or notice, with a way to retry. A render bug is never reported as a data failure.
- No local copy of a kit export. A helper three apps need goes into the kit.

## Files, HTML and CSS

- `index.html` blocks in one order. Head: CSP, meta, anti-flash, kit, app. Body: bar,
  drawer, map, legend, panel, dialogs, scripts.
- `app.css` in sections that mirror the page order, each with a banner. Tokens only.

## Kit and dashboard

- Kit modules keep their current syntax and public names; changing either is a major
  release. Their comments follow this file.
- The dashboard keeps its layout and `ARCHITECTURE.md`. It follows Names, Comments and
  Functions where the ideas overlap.

## Tools

The kit holds the shared config in [`tools/style/`](tools/style/) and runs it from one
workflow, [`app-check.yml`](.github/workflows/app-check.yml). An app copies
[`tools/style/check.yml`](tools/style/check.yml) into `.github/workflows/` and sets the tag:

```yaml
jobs:
  check:
    uses: mt-climate-office/mco-web-style/.github/workflows/app-check.yml@vX.Y.Z
```

- The tag is a kit release, never a branch. The config, the tool versions and the
  conformance tool all come from that tag. Bump it to take a new one.
- An app in a subfolder adds `with: directory: docs`.
- An app holds no `package.json` and no config copy. A `.prettierrc.json` copied for
  format-on-save in an editor is allowed; the check does not read it.
- To run the same tools before a push, from the app, with the kit beside it:

```sh
S=../mco-web-style/tools/style
npm ci --prefix $S
$S/node_modules/.bin/prettier --config $S/.prettierrc.json --ignore-path $S/.prettierignore --check .
$S/node_modules/.bin/eslint --config $S/eslint.config.mjs .
```

- Prettier formats JS, CSS and JSON. HTML is not formatted: the CSP pins inline scripts.
- ESLint enforces what it can: no `var`, `prefer-const`, no unused names, `===`, no leading
  underscore, no `.then`.
- `node tools/conformance.mjs <app>` warns on section order, history in comments, a
  missing `app.css`, and a check workflow that does not call `app-check.yml` at a tag.
