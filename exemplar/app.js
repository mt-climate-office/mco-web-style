// ── Header ───────────────────────────────────────────────────────────────────
// mco-web-style exemplar: the reference MCO map app, written to CODE-STYLE.md.
// Every Montana Mesonet station on a map, filtered by network, with a panel
// per station. Data: the Mesonet stations API and the kit's boundary files.
// The kit's core, palette and map scripts load before this module.

// ── Config ───────────────────────────────────────────────────────────────────

// The Mesonet host for the dashboard and the API. At the cutover this becomes
// 'https://mesonet.climate.umt.edu'. Change it here, and in the CSP and README.
const MESONET_ORIGIN = 'https://mesonet2.climate.umt.edu';
const API_BASE = `${MESONET_ORIGIN}/api`;
const STATIONS_URL = `${API_BASE}/stations/?type=json`;
const API_DOCS_URL = `${MESONET_ORIGIN}/api/v2/docs`;
const DASH_URL = (id) => `${MESONET_ORIGIN}/dash/?s=${encodeURIComponent(id)}`;

// Montana boundaries, served from the kit beside this page.
const OVERLAY_URL = {
  state: '../map/data/mt_state_simple.geojson',
  counties: '../map/data/mt_counties_simple.geojson',
  tribal: '../map/data/mt_reservations_simple.geojson',
};

// Networks are filters and words, never a marker style (HOUSE-STYLE §7).
const NETWORKS = ['HydroMet', 'AgriMet'];
const NETWORK_BY_LOWER = new Map(NETWORKS.map((n) => [n.toLowerCase(), n]));

// A link carrying any of these is a shared view: the first-visit help stays shut.
const DEEP_LINK_PARAMS = ['station', 'net', 'lng'];

const SOURCE = { stations: 'stations', counties: 'counties', tribal: 'tribal', state: 'state' };
const LAYER = {
  basemapCounties: 'boundary_county',
  counties: 'counties-line',
  tribalFill: 'tribal-fill',
  tribalLine: 'tribal-line',
  tribalLabel: 'tribal-label',
  state: 'state-line',
  stations: 'stations',
  hit: 'stations-hit',
  selected: 'stations-selected',
};

const STORAGE = {
  networks: 'mco-exemplar-networks',
  legend: 'mco-exemplar-legend',
  intro: 'mco-exemplar-seen-intro',
};

const STATIONS_TIMEOUT_MS = 30000;
const ERROR_TOAST_MS = 4000;
const SEARCH_FLY_ZOOM = 8;
const TRIBAL_LABEL_MINZOOM = 6;

// ── State ────────────────────────────────────────────────────────────────────

// What the visitor has chosen. readUrl() fills it at boot.
const state = {
  networks: new Set(NETWORKS), // networks shown on the map
  selected: null, // id of the station in the panel; a deep link's id until data confirms it
  hasDeepLink: false, // the page opened from a shared view
  hasCameraInUrl: false, // the URL placed the camera, so a deep-linked station does not fly
  isClosingFromHistory: false, // Back or Forward is closing the panel: leave the URL alone
};

// What was loaded. loadData() fills it.
const data = {
  stations: [], // stations with coordinates, as the API sends them
  stationById: new Map(), // the same stations by id, for links, clicks and the URL
  overlays: {}, // boundary GeoJSON, keyed like OVERLAY_URL
};

// Page elements, named for what they are, and the kit handles made at boot.
const els = {
  main: document.getElementById('main'),
  map: document.getElementById('map'),
  stamp: document.getElementById('count-stamp'),
  picker: document.getElementById('station-select'),
  tooltip: document.getElementById('tooltip'),
  legend: document.getElementById('legend-panel'),
  legendToggle: document.getElementById('legend-toggle'),
  legendBody: document.getElementById('legend-body'),
  panel: document.getElementById('station-panel'),
  panelTitle: document.getElementById('panel-title'),
  panelId: document.getElementById('panel-id'),
  panelNetwork: document.getElementById('panel-network'),
  panelCounty: document.getElementById('panel-county'),
  panelElevation: document.getElementById('panel-elevation'),
  panelInstalled: document.getElementById('panel-installed'),
  panelDash: document.getElementById('panel-dash'),
  help: document.getElementById('info-modal'),
  apiDocs: document.getElementById('api-docs'),
  credit: document.getElementById('info-credit'),
  table: null, // MCO.srTable
  sheet: null, // MCO.initSheet: opens and closes the panel
  rail: null, // MCO.initNavRail: the bar and its drawer
  zoomFloor: null, // MCO.map.installZoomFloor
  load: null, // MCO.loading over the map
};

// The MapLibre map. initMap() makes it.
let map;

// ── Utilities ────────────────────────────────────────────────────────────────

function stationLabel(s) {
  return `${s.name} (${s.station})`;
}

function formatElevation(s) {
  return `${Math.round(s.elevation)} m`;
}

// The install date in Mountain time, or `none` when the API has no date.
function formatInstalled(s, none) {
  return s.date_installed ? MCO.formatDateMT(s.date_installed) : none;
}

// Network names from URL or storage tokens, in any case; unknown ones dropped.
function toNetworks(tokens) {
  return tokens.map((t) => NETWORK_BY_LOWER.get(String(t).toLowerCase())).filter(Boolean);
}

// ── URL ──────────────────────────────────────────────────────────────────────

// Reads the view from the address. Returns the params for the first camera.
function readUrl() {
  const params = MCO.urlParams();
  state.networks = readNetworks(params);
  state.selected = MCO.getParamLower('station', params) || null;
  state.hasDeepLink = DEEP_LINK_PARAMS.some((k) => params.has(k));
  state.hasCameraInUrl = params.has('lng');
  return params;
}

// URL, then storage, then every network. Storage is checked like the URL:
// any page on this origin can write to it.
function readNetworks(params) {
  const fromUrl = MCO.splitTokens(MCO.getParamLower('net', params));
  if (fromUrl) {
    const valid = toNetworks(fromUrl);
    if (valid.length) return new Set(valid);
  }
  try {
    const saved = JSON.parse(MCO.lsGet(STORAGE.networks) || 'null');
    if (Array.isArray(saved)) {
      const valid = toNetworks(saved);
      if (valid.length) return new Set(valid);
    }
  } catch {
    // Unreadable storage: fall through to the default.
  }
  return new Set(NETWORKS);
}

// Mirrors the view into the address, leaving defaults out so the default view
// has no query string. push gives the first station opened its own history
// entry, so Back closes the panel.
function writeUrl({ push = false } = {}) {
  const p = {};
  if (state.networks.size !== NETWORKS.length) {
    p.net = [...state.networks].map((n) => n.toLowerCase()).join(' ');
  }
  if (state.selected) p.station = state.selected;
  const theme = MCO.getTheme();
  if (theme !== MCO.defaultTheme()) p.theme = theme;
  Object.assign(p, MCO.map.cameraParamsIfDefault(map));
  if (push) MCO.pushUrlState(p, { state: { mcoDetail: state.selected } });
  else MCO.replaceUrlState(p);
}

// Back or Forward. The station is the only drill-down state.
function onUrlChange(params) {
  const id = params.get('station');
  if (id && data.stationById.has(id)) {
    if (id !== state.selected) openStation(id, { url: 'none' });
  } else {
    closeStation({ fromHistory: true });
  }
}

// ── Data ─────────────────────────────────────────────────────────────────────

// Loads the stations and the boundaries, then draws them. Retry reruns it.
async function loadData() {
  els.load.start();
  let loaded;
  try {
    loaded = await Promise.all([
      MCO.fetchJSON(STATIONS_URL, { timeoutMs: STATIONS_TIMEOUT_MS }),
      ...Object.values(OVERLAY_URL).map((url) => MCO.fetchJSON(url)),
    ]);
  } catch {
    els.load.fail('Failed to load station data.', { retry: loadData });
    return;
  }
  els.load.done();
  const [stations, ...overlays] = loaded;
  Object.keys(OVERLAY_URL).forEach((key, i) => {
    data.overlays[key] = overlays[i];
  });
  setStations(stations);

  fillSearch();
  addCustomLayers();
  applyFilters();
  renderLegend();
  MCO.ready();
  openDeepLink();
}

// Keeps the stations that can be drawn.
function setStations(stations) {
  data.stations = stations.filter(
    (s) => Number.isFinite(s.longitude) && Number.isFinite(s.latitude),
  );
  data.stationById = new Map(data.stations.map((s) => [s.station, s]));
}

function visibleStations() {
  return data.stations.filter((s) => state.networks.has(s.sub_network));
}

function stationsGeoJSON(stations) {
  return {
    type: 'FeatureCollection',
    features: stations.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] },
      properties: { id: s.station, name: s.name, net: s.sub_network },
    })),
  };
}

// A ?station= from the URL opens only once the data says the station exists.
function openDeepLink() {
  if (state.selected && data.stationById.has(state.selected)) {
    openStation(state.selected, { fly: !state.hasCameraInUrl, url: 'replace' });
  } else {
    state.selected = null;
  }
}

// ── Map ──────────────────────────────────────────────────────────────────────

function initMap(maplibregl, params) {
  map = new maplibregl.Map({
    container: els.map,
    style: MCO.map.cartoStyleUrl(),
    ...MCO.map.initialCamera(params),
  });
  MCO.map.addNavigation(map);
  // A dead basemap retries once, then falls back to a blank style that still
  // fires 'load', so the stations draw anyway.
  MCO.map.watchBasemap(map);
  MCO.map.addFitControl(map, { onBeforeFit: () => closeStation() });
  els.zoomFloor = MCO.map.installZoomFloor(map);
}

// Everything map.setStyle() wipes goes back on here, after every style load.
// Topography first, so boundaries and stations draw above it.
function addCustomLayers() {
  hideBasemapCounties();
  MCO.map.addHillshade(map);
  addBoundaryLayers();
  addStationLayers();
}

// CARTO draws its own dashed counties from z9. The kit's counties are the one
// treatment at every zoom.
function hideBasemapCounties() {
  if (map.getLayer(LAYER.basemapCounties)) {
    map.setLayoutProperty(LAYER.basemapCounties, 'visibility', 'none');
  }
}

// Paints are read from the current theme on each call.
function addBoundaryLayers() {
  const paints = MCO.map.overlayPaints();
  const { counties, tribal, state: stateLine } = data.overlays;
  if (counties && !map.getSource(SOURCE.counties)) {
    map.addSource(SOURCE.counties, { type: 'geojson', data: counties });
    map.addLayer({
      id: LAYER.counties,
      type: 'line',
      source: SOURCE.counties,
      paint: paints.countiesLine,
    });
  }
  if (tribal && !map.getSource(SOURCE.tribal)) {
    map.addSource(SOURCE.tribal, { type: 'geojson', data: tribal });
    map.addLayer({
      id: LAYER.tribalFill,
      type: 'fill',
      source: SOURCE.tribal,
      paint: paints.tribalFill,
    });
    map.addLayer({
      id: LAYER.tribalLine,
      type: 'line',
      source: SOURCE.tribal,
      paint: paints.tribalLine,
    });
    map.addLayer({
      id: LAYER.tribalLabel,
      type: 'symbol',
      source: SOURCE.tribal,
      minzoom: TRIBAL_LABEL_MINZOOM,
      layout: MCO.map.TRIBAL_LABEL_LAYOUT,
      paint: paints.tribalLabelPaint,
    });
  }
  if (stateLine && !map.getSource(SOURCE.state)) {
    map.addSource(SOURCE.state, { type: 'geojson', data: stateLine });
    map.addLayer({ id: LAYER.state, type: 'line', source: SOURCE.state, paint: paints.stateLine });
  }
}

function addStationLayers() {
  if (map.getSource(SOURCE.stations)) return;
  map.addSource(SOURCE.stations, { type: 'geojson', data: stationsGeoJSON(visibleStations()) });
  map.addLayer({
    id: LAYER.stations,
    type: 'circle',
    source: SOURCE.stations,
    paint: MCO.map.stationPaint(),
  });
  // An invisible target at least 22px across, so a fingertip can hit a station.
  map.addLayer({
    id: LAYER.hit,
    type: 'circle',
    source: SOURCE.stations,
    paint: MCO.map.hitPaint(),
  });
  map.addLayer({
    id: LAYER.selected,
    type: 'circle',
    source: SOURCE.stations,
    filter: selectionFilter(),
    paint: MCO.map.selectionPaint(),
  });
}

function selectionFilter() {
  return ['==', ['get', 'id'], state.selected || ''];
}

// Rings the selected station, or none.
function paintSelection() {
  if (map.getLayer(LAYER.selected)) map.setFilter(LAYER.selected, selectionFilter());
}

// Shows the stations in the chosen networks: on the map, in the bar's count,
// in the table, and to a screen reader.
function applyFilters() {
  const visible = visibleStations();
  map.getSource(SOURCE.stations)?.setData(stationsGeoJSON(visible));
  paintSelection();
  els.stamp.textContent = `${visible.length} stations`;
  renderTable(visible);
  MCO.announce(`${visible.length} stations shown: ${[...state.networks].join(' and ') || 'none'}.`);
}

// ── Legend ───────────────────────────────────────────────────────────────────

function initLegend() {
  MCO.initCollapsible({
    toggle: els.legendToggle,
    body: els.legendBody,
    storageKey: STORAGE.legend,
    autoCollapseOnCompact: true,
  });
  renderLegend();
}

// The swatch is the one station marker, in the current theme. Counts per
// network appear in the legend and on the filter buttons, once data is in.
function renderLegend() {
  const fill = MCO.map.stationPaint()['circle-color'];
  document.querySelectorAll('[data-swatch]').forEach((el) => {
    el.style.setProperty('--swatch', fill);
    el.dataset.shape = 'circle';
  });
  if (!data.stations.length) return;
  for (const net of NETWORKS) {
    const n = data.stations.filter((s) => s.sub_network === net).length;
    document.querySelectorAll(`[data-count-for="${net}"]`).forEach((el) => {
      el.textContent = `(${n})`;
    });
  }
}

// ── Panel ────────────────────────────────────────────────────────────────────

// The kit's station panel: focus moves to its title on open and back to the
// opener on close.
function initPanel() {
  els.sheet = MCO.initSheet({
    sheet: els.panel,
    fallbackFocus: els.map,
    onState: (s) => {
      if (s === 'closed') onPanelClosed();
    },
  });
}

// fly: move the map to the station first, then open. url: 'auto' pushes the
// first open and replaces after that; 'replace' for a deep link at boot, whose
// entry is the page's own; 'none' when Back or Forward already moved the URL.
function openStation(id, { fly = false, url = 'auto' } = {}) {
  const s = data.stationById.get(id);
  if (!s) return;
  if (!fly) {
    showStation(s, url);
    return;
  }
  MCO.map.flyToAndOpen(map, {
    center: [s.longitude, s.latitude],
    zoom: SEARCH_FLY_ZOOM,
    open: () => showStation(s, url),
  });
}

function showStation(s, url) {
  state.selected = s.station;
  fillPanel(s);
  els.sheet.open({ opener: document.activeElement });
  MCO.announce(`${stationLabel(s)}, ${s.sub_network}, opened.`);
  paintSelection();
  renderTable(visibleStations());
  if (url === 'auto' && !history.state?.mcoDetail) writeUrl({ push: true });
  else if (url !== 'none') writeUrl();
}

function fillPanel(s) {
  els.panelTitle.textContent = s.name;
  els.panelId.textContent = s.station;
  els.panelNetwork.textContent = s.sub_network;
  els.panelCounty.textContent = s.county || '—';
  els.panelElevation.textContent = formatElevation(s);
  els.panelInstalled.textContent = formatInstalled(s, '—');
  els.panelDash.href = DASH_URL(s.station);
}

// fromHistory: Back or Forward already moved the URL.
function closeStation({ fromHistory = false } = {}) {
  if (els.sheet.state() === 'closed') return;
  state.isClosingFromHistory = fromHistory;
  els.sheet.close();
}

// Every close lands here: the × button, Esc and closeStation().
function onPanelClosed() {
  const fromHistory = state.isClosingFromHistory;
  state.isClosingFromHistory = false;
  state.selected = null;
  paintSelection();
  MCO.announce('Station closed.');
  if (fromHistory) return;
  // Step back off our own pushed entry, or Back would reopen the panel.
  if (history.state?.mcoDetail) history.back();
  else writeUrl();
}

// ── Search ───────────────────────────────────────────────────────────────────

// The station picker: the keyboard path to every station on the map.
function initSearch() {
  els.picker.addEventListener('change', () => {
    if (els.picker.value) openStation(els.picker.value, { fly: true });
  });
}

function fillSearch() {
  const options = [...data.stations]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => {
      const option = document.createElement('option');
      option.value = s.station;
      option.textContent = stationLabel(s);
      return option;
    });
  els.picker.append(...options);
}

// ── Controls ─────────────────────────────────────────────────────────────────

function initControls() {
  initNetworkButtons();
  initMapPointer();
  MCO.initThemeToggle({
    button: document.getElementById('btn-theme'),
    iconSun: document.getElementById('icon-sun'),
    iconMoon: document.getElementById('icon-moon'),
    // The new style's 'style.load' puts the layers back.
    onChange: () => {
      map.setStyle(MCO.map.cartoStyleUrl());
      writeUrl();
    },
  });
  document.getElementById('btn-share').addEventListener('click', copyShareLink);
  initLegend();
  // On a phone the legend moves into the ☰ drawer, with a Legend button on the map.
  els.rail = MCO.initNavRail({
    toggle: document.getElementById('btn-menu'),
    drawer: document.getElementById('nav-drawer'),
    scrim: document.getElementById('nav-scrim'),
  });
  MCO.initLegendDrawer({ panel: els.legend, rail: els.rail });
  document.addEventListener('mco:themechange', renderLegend);
  initHelp();
  map.on('moveend', () => writeUrl());
  MCO.onUrlState(onUrlChange);
}

// aria-pressed is the buttons' state and their styling.
function initNetworkButtons() {
  document.querySelectorAll('[data-net]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(state.networks.has(btn.dataset.net)));
    btn.addEventListener('click', () => toggleNetwork(btn));
  });
}

function toggleNetwork(btn) {
  const net = btn.dataset.net;
  if (state.networks.has(net)) {
    // An empty map would look like a failure.
    if (state.networks.size === 1) {
      MCO.showToast('At least one sub-network stays on.');
      return;
    }
    state.networks.delete(net);
  } else {
    state.networks.add(net);
  }
  btn.setAttribute('aria-pressed', String(state.networks.has(net)));
  MCO.lsSet(STORAGE.networks, JSON.stringify([...state.networks]));
  const selected = data.stationById.get(state.selected);
  if (selected && !state.networks.has(selected.sub_network)) closeStation();
  applyFilters();
  writeUrl();
}

// Hover names a station and a click or tap opens it. The table gives a screen
// reader the same.
function initMapPointer() {
  MCO.map.initCursorTooltip(map, {
    element: els.tooltip,
    layers: [LAYER.stations],
    render: (f) => ({ name: f.properties.name, sub: `${f.properties.id} · ${f.properties.net}` }),
  });
  map.on('click', LAYER.hit, (e) => {
    const f = e.features?.[0];
    if (f) openStation(f.properties.id);
  });
}

// The help dialog, which opens by itself once, on a first visit.
function initHelp() {
  els.apiDocs.href = API_DOCS_URL;
  els.credit.textContent = MCO.credit({ source: 'Montana Mesonet API' });
  MCO.initInfoModal({
    dialog: els.help,
    trigger: document.getElementById('btn-info'),
    intro: { key: STORAGE.intro, skip: state.hasDeepLink },
  });
}

// ── Export ───────────────────────────────────────────────────────────────────

// The address already holds the view, so sharing is copying it.
async function copyShareLink() {
  try {
    await navigator.clipboard.writeText(location.href);
    MCO.showToast('Link copied — it reproduces exactly this view.');
  } catch {
    MCO.showToast('Copy failed — the address bar URL is the share link.', ERROR_TOAST_MS);
  }
}

// ── Table ────────────────────────────────────────────────────────────────────

// The screen-reader twin of the map: one Tab stop, arrows move, Enter opens.
function initTable() {
  els.table = MCO.srTable({
    container: document.getElementById('sr-twin'),
    caption: 'Montana Mesonet stations currently shown on the map',
    rowKey: (s) => s.station,
    columns: [
      { label: 'Station', rowHeader: true, value: stationLabel },
      { label: 'Network', key: 'sub_network' },
      { label: 'County', key: 'county' },
      { label: 'Elevation', value: formatElevation },
      { label: 'Installed', value: (s) => formatInstalled(s, '') },
    ],
    selectable: true,
    onSelect: (s) => openStation(s.station, { fly: true }),
  });
}

function renderTable(stations) {
  els.table.render(stations, { selected: state.selected });
}

// ── Boot ─────────────────────────────────────────────────────────────────────

// MapLibre is an ES module the kit imports. Nothing is wired until it arrives,
// so no control can act on a map that does not exist yet.
async function boot() {
  const params = readUrl();
  let maplibregl;
  try {
    maplibregl = await MCO.map.loadMapLibre();
  } catch {
    MCO.notice({
      tone: 'danger',
      text: 'The map library failed to load. Check your connection and reload.',
      container: els.main,
      place: 'over',
    });
    return;
  }
  initTable();
  initPanel();
  initMap(maplibregl, params);
  initSearch();
  initControls();
  els.load = MCO.loading(els.main, { label: 'Loading stations', place: 'over' });

  // Every style load (theme switch, basemap retry, blank fallback) starts bare.
  map.on('style.load', () => {
    if (!data.stations.length) return;
    addCustomLayers();
    applyFilters();
  });
  map.on('load', () => {
    els.zoomFloor.refresh();
    loadData();
  });
}

boot();
