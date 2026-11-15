# tools/replay: same data, two versions, compare

Records everything an app loads once, then runs two versions of the app
against that recording and says whether they show the same thing. Use it to
prove a refactor changed no behaviour.

```sh
# Playwright, pngjs and pixelmatch, installed as in tools/verify/README.md.
git -C ../mesonet-status worktree add ../status-main origin/main
node tools/replay/replay.mjs record  ../status-main
node tools/replay/replay.mjs compare ../status-main ../mesonet-status --rec ../status-main/.replay
node tools/replay/replay.mjs compare ../status-main ../mesonet-status --rec ../status-main/.replay --browser webkit
```

**record** serves the app on 127.0.0.1 and walks its steps at 390, 768 and
1440 wide in dark, light and high contrast, in Chromium and WebKit. Every
response from another origin (API, tiles, fonts, kit, MapLibre) is saved to
`<app>/.replay/` with the time of the recording.

**compare** walks the same steps in A, then B, offline: a request that is not
in the recording fails the run. The clock is frozen at the recording time,
`Math.random` is seeded and motion is reduced. After each step it reads the
legend, station panel, screen-reader table, search list, stamp, bar and
drawer controls (with their pressed, expanded and value states),
`location.href`, `history.length`, the map's layer ids in order, console and
page errors, the URLs requested, and a screenshot. It prints a table, writes
`result.json`, keeps the differing screenshots with a diff image, and exits 1
on any difference. A full compare takes about 6 to 9 minutes; `--quick` runs
1440 light only (about a minute).

A step is read once the network has been quiet for 700 ms, every map has
fired `idle` and the DOM has not changed for 700 ms. Requests and errors are
compared as sets of distinct URLs and messages; map tiles and glyphs are
counted, not compared, because which ones a camera move fetches depends on
frame timing.

## Steps

The app owns `replay.config.mjs`; the steps are built from it:

```js
export default {
  page: 'index.html',
  storage: { 'mco-status-seen-intro': '1' },     // seeded before every load
  station: 'acebozem',                            // a real id from the API
  search: 'Absarokee',
  legend: '#legend-rows .mco-legend-row',         // the first one is toggled
  controls: ['[data-mode="health"]', '#btn-labels', ['#mode-select', 1]],  // pressed, or [select, option]
  // regions: { legend: '#my-legend' },          // where to read text
  // steps: (s) => [...s, { name: 'export', click: '#btn-export' }],
};
```

Default steps: load, open the station by a click on the map, close, open it
by `?station=`, close, search and pick, toggle the legend, press each
control, switch theme, Back, Forward. A step is one of `go` (a query),
`click`, `clickStation`, `fill: [selector, text]`, `select: [selector,
value or index]`, `press`, `back`, `forward`, or `run: async ({ page }) => …`.
A control hidden in a closed drawer is pressed by script, so one list runs at
every width.

## Keep the recording out of git

Record `main` fresh for each PR and compare `main` with the branch. Both sides
then see one moment of live data, and nobody commits megabytes of tiles that
go stale. Add `.replay/` to the app's `.gitignore`.

## How it works, and what it can't see

The server is the app's host and the browser's proxy (https through a
throwaway self-signed certificate). It does not use `page.route()` or
`routeFromHAR`: in WebKit those stop MapLibre's workers. A byte range of a
body recorded whole is cut from it. The map is read by catching each
`maplibregl.Map` as the kit's loader hands MapLibre to the app.

It cannot see: hover tooltips, anything a step does not reach, timing (polling,
retries, debounce), behaviour that depends on the time moving, how many tiles
or range reads were made, a map paint that does not reach the screenshot, and
the export PNG's contents.
