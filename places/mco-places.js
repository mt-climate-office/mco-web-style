/* ============================================================================
   mco-web-style · places/mco-places.js · v0.1.0
   Place search for Montana Climate Office apps: a typed county, reservation,
   tribe, town or ZIP code resolves to a point, and a point to the Mesonet
   stations nearest it, with great-circle distances. "Near me" asks the
   browser for a position only when the visitor presses a button.

   Classic script, zero dependencies, no build. Lands on window.MCO.places.
   Load it AFTER core/mco-core.js: initPlaceSearch is MCO.initSearchBox with
   places added (its `section` and `queryOnly` items, 0.16.0), and the
   loaders use MCO.promiseCache and MCO.announce. The pure helpers need
   nothing from core.

   A port of mesonet-dashboard's tested web/src/core/places/index.ts and
   web/src/core/stations/nearest.ts (website DECISIONS D9, extraction #2).

   The data ships with the kit, at the same pinned tag as this file:
     places/mt-places.json                     the gazetteer (47 KB, 15 KB gzipped)
     map/data/mt_reservations_simple.geojson   reservation boundaries (106 KB),
                                               fetched only when a reservation is picked
   Both are fetched with `integrity` set to the hashes below, so the bytes are
   pinned by this file's own SRI. The page's connect-src needs
   https://cdn.jsdelivr.net (most consumers already allow it).

   The gazetteer is the US Census Bureau 2026 Gazetteer Files (public
   domain), Montana only: 56 counties, 7 reservations, the incorporated
   places and CDPs, the 59xxx ZIP codes (ZCTAs), each at its Census internal
   point, and one tribe with no Census reservation (Little Shell, listed at
   Great Falls). tools/vendor-places.mjs regenerates it. Rows:
     [id, kind, name, lat, lon, keywords?, at?]
   ids are c/r/p/z + the Census GEOID ("c30031", "r1110", "p3008950",
   "z59715"), or t + a slug for a hand-added tribe ("tlittleshell").

   Station rows are the API's /stations/ objects: {station, name,
   sub_network, latitude, longitude, county}. Distances are on the WGS84
   mean sphere (6371.0088 km).
   ========================================================================== */
(function () {
  'use strict';

  var MCO = window.MCO = window.MCO || {};
  MCO.versions = Object.assign(MCO.versions || {}, { places: '0.1.0' });
  var P = MCO.places = MCO.places || {};

  /* ── Constants ─────────────────────────────────────────────────────────── */

  P.KINDS = Object.freeze({
    county: 'County',
    reservation: 'Reservation',
    tribe: 'Tribe',
    city: 'City',
    town: 'Town',
    community: 'Community',
    zip: 'ZIP code',
  });

  // Search items for places carry this prefix on their id; station ids never do.
  P.ID_PREFIX = 'place:';
  // At most this many places list under the stations while typing.
  P.RESULTS = 8;
  // A town, a ZIP code, or an area with no station inside lists this many.
  P.NEAREST = 5;
  P.KM_PER_MI = 1.609344;
  var EARTH_KM = 6371.0088;

  // Published files at this tag, and their bytes. tools/check-places.mjs
  // fails if either hash stops matching the file beside it.
  P.DATA_PATH = 'places/mt-places.json';
  P.DATA_INTEGRITY = 'sha384-evMmznRPGnmbwIOykNYTlqG7sNxHZAoFZRh/ueeFOXbEcsPb9ymVzDq8iucHlnwV';
  P.AREAS_PATH = 'map/data/mt_reservations_simple.geojson';
  P.AREAS_INTEGRITY = 'sha384-6Oi36TjjPc+YzdMhrXk9rWmnmCv4Oz9jD1q2B+VbmguUMx59hHDTHUVzr5vliDsy';

  // The kit root this file was loaded from ("…/mco-web-style@0.16.0/"), so
  // the data comes from the same tag. Null when it cannot be known (a module
  // bundle, node:vm): pass {url} to load() and loadAreas() then.
  P.KIT_BASE = (function () {
    var s = typeof document !== 'undefined' && document.currentScript && document.currentScript.src;
    var m = s && /^(.*\/)places\/mco-places\.js(?:[?#].*)?$/.exec(s);
    return m ? m[1] : null;
  })();

  /* ── The gazetteer ─────────────────────────────────────────────────────── */

  // places.json → [{id, kind, name, lat, lon, keywords, at?}]
  P.parse = function (json) {
    if (!json || !Array.isArray(json.rows)) throw new Error('mt-places.json: unexpected shape');
    return json.rows.map(function (r) {
      var p = { id: r[0], kind: r[1], name: r[2], lat: r[3], lon: r[4], keywords: r[5] || [] };
      if (r[6]) p.at = r[6];
      return p;
    });
  };

  function dataUrl(path, opts) {
    if (opts.url) return opts.url;
    var base = opts.base || P.KIT_BASE;
    if (!base) throw new Error('MCO.places: cannot tell where the kit was loaded from; pass {url}');
    return base.replace(/\/?$/, '/') + path;
  }

  // fetch with SRI: the default URL is checked against the hash this file
  // carries; an explicit {url} is checked only when {integrity} comes with it.
  function fetchPinned(url, integrity, timeoutMs) {
    var init = { signal: AbortSignal.timeout(timeoutMs || 60000) };
    if (integrity) init.integrity = integrity;
    return fetch(url, init).then(function (res) {
      if (!res.ok) throw new Error('MCO.places: HTTP ' + res.status + ' for ' + url);
      return res.json();
    });
  }

  var _cache = null;
  function cache() { return _cache || (_cache = MCO.promiseCache()); }

  // The places, parsed. Cached per URL; a failure is not cached.
  //   {url, integrity}  another copy (a vendored file); integrity optional
  //   {base}            another kit root (a local checkout)
  //   {fresh: true}     refetch
  P.load = function (opts) {
    opts = opts || {};
    var url = dataUrl(P.DATA_PATH, opts);
    var integrity = opts.url ? opts.integrity : P.DATA_INTEGRITY;
    if (opts.fresh) cache().invalidate('places ' + url);
    return cache().cached('places ' + url, function () {
      return fetchPinned(url, integrity, opts.timeoutMs).then(P.parse);
    });
  };

  P.find = function (places, id) {
    for (var i = 0; i < (places || []).length; i++) if (places[i].id === id) return places[i];
    return null;
  };

  /* ── Search items ──────────────────────────────────────────────────────── */

  P.isPlaceItem = function (id) { return String(id).indexOf(P.ID_PREFIX) === 0; };
  P.placeIdOf = function (itemId) { return String(itemId).slice(P.ID_PREFIX.length); };

  // MCO.searchModel items: listed only while typing, in a "Places" section,
  // the kind (and a tribe's town) beside the name.
  P.items = function (places) {
    return places.map(function (p) {
      return {
        id: P.ID_PREFIX + p.id,
        label: p.name,
        meta: p.at ? P.KINDS[p.kind] + ' · ' + p.at : P.KINDS[p.kind],
        section: 'Places',
        queryOnly: true,
        keywords: p.keywords,
      };
    });
  };

  /* ── Distance ──────────────────────────────────────────────────────────── */

  function rad(d) { return d * Math.PI / 180; }

  // Great-circle distance in km between two points in decimal degrees.
  P.haversineKm = function (lat1, lon1, lat2, lon2) {
    var dLat = rad(lat2 - lat1);
    var dLon = rad(lon2 - lon1);
    var a = Math.pow(Math.sin(dLat / 2), 2) +
      Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.pow(Math.sin(dLon / 2), 2);
    return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
  };

  function located(stations) {
    return (stations || []).filter(function (s) {
      return Number.isFinite(s.latitude) && Number.isFinite(s.longitude);
    });
  }
  function row(point, s) {
    var km = P.haversineKm(point.lat, point.lon, s.latitude, s.longitude);
    return { station: s.station, name: s.name, sub_network: s.sub_network, km: km, miles: km / P.KM_PER_MI };
  }
  function byKm(a, b) { return a.km - b.km; }

  // The n stations nearest {lat, lon}, closest first, as
  // {station, name, sub_network, km, miles}. Rows without finite
  // coordinates are skipped. n defaults to P.NEAREST.
  P.nearest = function (point, stations, n) {
    return located(stations).map(function (s) { return row(point, s); })
      .sort(byKm).slice(0, n == null ? P.NEAREST : n);
  };

  // "0.4 mi" under 10 miles, else "23 mi".
  P.formatMiles = function (mi) {
    return mi < 10 ? mi.toFixed(1) + ' mi' : Math.round(mi) + ' mi';
  };

  /* ── Areas ─────────────────────────────────────────────────────────────── */

  // Even-odd ray casting over every ring (outer rings and holes alike) of a
  // GeoJSON Polygon or MultiPolygon, lon/lat.
  P.pointInGeometry = function (lon, lat, g) {
    var polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    var inside = false;
    polygons.forEach(function (poly) {
      poly.forEach(function (ring) {
        for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
          if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
        }
      });
    });
    return inside;
  };

  // The reservation boundaries (a FeatureCollection with Census GEOIDs, as
  // map/data/mt_reservations_simple.geojson) keyed by place id: "r1110".
  P.areaIndex = function (fc) {
    var m = new Map();
    ((fc && fc.features) || []).forEach(function (f) {
      var geoid = f.properties && f.properties.GEOID;
      if (geoid && f.geometry) m.set('r' + String(geoid).replace(/R$/, ''), f.geometry);
    });
    return m;
  };

  // The boundaries, from the kit's map/data at this tag (or {url}), indexed.
  // Cached like load().
  P.loadAreas = function (opts) {
    opts = opts || {};
    var url = dataUrl(P.AREAS_PATH, opts);
    var integrity = opts.url ? opts.integrity : P.AREAS_INTEGRITY;
    if (opts.fresh) cache().invalidate('areas ' + url);
    return cache().cached('areas ' + url, function () {
      return fetchPinned(url, integrity, opts.timeoutMs).then(P.areaIndex);
    });
  };

  /* ── Stations for a place ──────────────────────────────────────────────── */

  // What to list for a picked place, sorted by distance from its point:
  //   a county       every station whose `county` is it
  //   a reservation  every station inside `area` (its boundary, if given)
  //   anything else, or an area with no station inside: the P.NEAREST nearest
  //                  (a tribe with no reservation: nearest its town's point)
  // → {title, inside, rows}. title: "Gallatin County", "Near Bozeman",
  //   "Near 59715", "Near Great Falls" (Little Shell Tribe).
  P.stationsFor = function (place, stations, area) {
    var ok = located(stations);
    var inside = null;
    if (place.kind === 'county') {
      var county = place.name.replace(/ County$/, '').toLowerCase();
      inside = ok.filter(function (s) { return String(s.county || '').toLowerCase() === county; });
    } else if (place.kind === 'reservation' && area) {
      inside = ok.filter(function (s) { return P.pointInGeometry(s.longitude, s.latitude, area); });
    }
    if (inside && inside.length) {
      return { title: place.name, inside: true, rows: inside.map(function (s) { return row(place, s); }).sort(byKm) };
    }
    return { title: 'Near ' + (place.at || place.name), inside: false, rows: P.nearest(place, ok) };
  };

  // The polite line for a list: "12 stations in Gallatin County",
  // "3 stations on the Flathead Reservation", "5 stations near Bozeman";
  // with no place (Near me), "5 stations near you".
  P.announcement = function (place, result) {
    var n = result.rows.length;
    var where = !place ? 'near you'
      : !result.inside ? 'near ' + (place.at || place.name)
      : place.kind === 'reservation' ? 'on the ' + place.name : 'in ' + place.name;
    return n + ' ' + (n === 1 ? 'station' : 'stations') + ' ' + where;
  };

  /* ── Near me ───────────────────────────────────────────────────────────── */

  P.canLocate = function () {
    return typeof navigator !== 'undefined' && !!navigator.geolocation;
  };

  // The browser's position, once. Call it only from a button the visitor
  // pressed: never on load, never in a retry loop. Resolves {lat, lon,
  // accuracy}; rejects an Error whose `reason` is 'unsupported', 'denied',
  // 'unavailable' or 'timeout', for the app to say in words.
  P.locate = function (opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      function fail(reason) { var e = new Error('MCO.places.locate: ' + reason); e.reason = reason; reject(e); }
      if (!P.canLocate()) return fail('unsupported');
      navigator.geolocation.getCurrentPosition(function (pos) {
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy });
      }, function (err) {
        fail(err && err.code === 1 ? 'denied' : err && err.code === 3 ? 'timeout' : 'unavailable');
      }, {
        enableHighAccuracy: false,
        timeout: opts.timeoutMs || 10000,
        maximumAge: opts.maximumAge == null ? 600000 : opts.maximumAge,
      });
    });
  };

  // locate() then nearest(): {title: 'Near me', inside: false, rows, point}.
  P.nearMe = function (stations, opts) {
    opts = opts || {};
    return P.locate(opts).then(function (point) {
      return { title: 'Near me', inside: false, rows: P.nearest(point, stations, opts.n), point: point };
    });
  };

  /* ── initPlaceSearch ───────────────────────────────────────────────────────
     MCO.initSearchBox over the app's own items (stations) with the places
     added while typing, under a "Places" heading, at most P.RESULTS of them.
     A picked station goes to onSelect; a picked place is resolved here and
     goes to onPlace with its stations.

       <div class="mco-search">
         <span class="mco-search-icon" aria-hidden="true"></span>
         <label for="q" class="sr-only">Search stations and places</label>
         <input id="q" class="mco-search-input" type="search"
                placeholder="Station, town, county or ZIP">
         <div class="mco-search-list" hidden></div>
       </div>

       var ps = MCO.places.initPlaceSearch({
         input: q, listbox: list,
         items: function () { return stations.map(function (s) {
           return { id: s.station, label: s.name, group: s.sub_network }; }); },
         stations: function () { return stations; },     // API rows, for distances
         onSelect: function (id) { openStation(id); },
         onPlace: function (place, result) {             // result null: still finding
           if (result) showList(result.title, result.rows);
         },
         value: function () { return selectedId; },
         label: 'Stations and places',
       });

     The places load the first time the field takes focus or text (from this
     tag, or {load: {url}}); until then, or if they fail, the field still
     finds stations (onError(err) hears about it). Items without a section are
     put in "Stations". A reservation's stations need its boundary: it loads
     on the first reservation pick (onPlace(place, null) first, while it
     does); without it, the nearest stations. {areas: false} skips it. The
     list is announced (P.announcement) unless {announce: false}; result
     counts in the box are announced as initSearchBox does.
     Every other option passes to MCO.initSearchBox. Returns its handle plus
     {places(), pick(placeId), cancel()}. */
  P.initPlaceSearch = function (opts) {
    var input = opts.input;
    var getItems = typeof opts.items === 'function' ? opts.items : function () { return opts.items || []; };
    var getStations = typeof opts.stations === 'function' ? opts.stations : function () { return opts.stations || []; };
    var announce = opts.announce !== false;
    var places = null;
    var placeItems = [];
    var loading = null;
    var gen = 0;
    var sb = null;

    function want() {
      if (loading) return;
      loading = P.load(opts.load).then(function (list) {
        places = list;
        placeItems = P.items(list);
        if (sb) sb.refresh();
      }, function (err) {
        loading = null;                       // a later focus tries again
        if (opts.onError) opts.onError(err);
      });
    }

    function items() {
      var own = getItems().map(function (it) {
        return it.section != null ? it : Object.assign({}, it, { section: 'Stations' });
      });
      return placeItems.length ? own.concat(placeItems) : own;
    }

    function pick(placeId) {
      var place = P.find(places, placeId);
      if (!place) return Promise.resolve(null);
      var mine = ++gen;
      var areaP = Promise.resolve(undefined);
      if (place.kind === 'reservation' && opts.areas !== false) {
        if (opts.onPlace) opts.onPlace(place, null);
        areaP = P.loadAreas(typeof opts.areas === 'object' ? opts.areas : undefined).then(function (m) { return m.get(place.id); },
          function () { return undefined; });
      }
      return areaP.then(function (area) {
        if (mine !== gen) return null;          // a later pick won
        var r = P.stationsFor(place, getStations(), area);
        if (announce) MCO.announce(P.announcement(place, r));
        if (opts.onPlace) opts.onPlace(place, r);
        return r;
      });
    }

    var sbOpts = Object.assign({}, opts, {
      items: items,
      sectionLimits: Object.assign({ Places: P.RESULTS }, opts.sectionLimits),
      onSelect: function (id) {
        if (P.isPlaceItem(id)) pick(P.placeIdOf(id));
        else if (opts.onSelect) opts.onSelect(id);
      },
    });
    sb = MCO.initSearchBox(sbOpts);

    input.addEventListener('focus', want);
    input.addEventListener('input', want);
    if (opts.places) { places = opts.places; placeItems = P.items(places); loading = Promise.resolve(); }

    return Object.assign({}, sb, {
      places: function () { return places; },
      pick: pick,
      // Drop a reservation pick still waiting on its boundary (Near me was
      // pressed meanwhile, say), so its list never lands.
      cancel: function () { gen++; },
      destroy: function () {
        input.removeEventListener('focus', want);
        input.removeEventListener('input', want);
        sb.destroy();
      },
    });
  };
})();
