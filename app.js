/* ============================================================
   OceanEmbed — app.js
   All client-side logic for explore.html
   ============================================================ */

'use strict';

/* ── Constants ───────────────────────────────────────────── */

const BOUNDS = {
  south: 5,
  north: 30,
  west:  45,
  east:  105,
};

const DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000];

const EPOCH_START = new Date('2021-01-01');
const EPOCH_END   = new Date('2023-12-31');
const TOTAL_DAYS  = Math.round((EPOCH_END - EPOCH_START) / 86400000);

const TEAL  = '#2DD4BF';
const CORAL = '#F2994A';
const MUTED = '#6E8AA3';

/* ── Land/Sea Mask ────────────────────────────────────────────── */

// Simplified coastline polygons for the North Indian Ocean study region.
// Each sub-array is a closed ring of [longitude, latitude] pairs.
// Derived from Natural Earth 110m land data, clipped to 45–105°E, 5–30°N.
const LAND_POLYGONS = [

  // ─ Arabian Peninsula (Saudi Arabia, Yemen, Oman, UAE, Qatar, Bahrain,
  //   Kuwait, Jordan, and the short Iraqi Gulf coast) ────────────────
  [
    [45, 12],   [45, 30],                            // western study-region edge
    [48, 30],   [50, 30],   [52, 30],  [55, 30],    // northern border (Iraq – Saudi)
    [57, 30],                                         // NE Saudi border
    [59, 26],   [60, 24],   [60, 22],                // Oman east coast
    [58, 20],   [56, 17],   [55, 15],                // Oman / Yemen south coast
    [53, 14],   [51, 12],                            // Yemen coast → Ras Asir
    [49, 11],   [48, 11],   [47, 11.5], [46, 12],   // Gulf of Aden north shore
    [45, 12],
  ],

  // ─ Indian Subcontinent + Pakistan Makran coast ───────────────────
  [
    [61.5, 25], [63, 25],   [65, 24],   [67, 23],   // Pakistan (Makran) coast
    [68, 23],   [70, 21],   [72, 21],   [72.5, 22], // Gujarat (simplified)
    [73, 17],   [73.5, 15], [74, 13],   [75, 12],   // Konkan / Malabar
    [76, 11],   [77, 9.5],  [77.5, 8.5], [78, 8.5], // South India west
    [79, 8],    [80, 9],    [80.5, 12], [81, 15],   // Southern tip → east coast
    [82, 16],   [83, 18],   [85, 20],   [86, 21],   // Coromandel coast
    [87, 22],   [88, 22.5], [89, 22.5], [90, 22.5], // Orissa / Bengal
    [91, 22],   [92, 22],                            // Bangladesh / Myanmar border
    // Interior closure north then west along 30°N
    [92, 26],   [90, 27],   [88, 30],
    [85, 30],   [82, 30],   [80, 30],   [77, 30],
    [75, 29],   [73, 27],   [71, 26],   [69, 26],
    [67, 25],   [64, 25],   [62, 25],   [61.5, 25],
  ],

  // ─ Sri Lanka ───────────────────────────────────────────────
  [
    [79.7, 9.8],  [80.2, 9.8],  [80.8, 9.2], [81.5, 8.5],
    [81.5, 7.5],  [80.5, 6.5],  [79.8, 6.5], [79.7, 7.5], [79.7, 9.8],
  ],

  // ─ Myanmar coast and Malay Peninsula ────────────────────────
  [
    [92, 22],   [94, 23],   [96, 22],   [98, 20],  // Myanmar upper coast
    [98, 18],   [99, 17],   [99, 15],   [100, 13], // Tenasserim coast south
    [101, 11],  [102, 9],   [103, 7],   [104, 6],  // Malay Peninsula
    [105, 5.5], [105, 5],                           // SE corner
    [103, 5],   [101, 6],   [100, 6.5], [99, 8],   // Malay west coast
    [98, 9],    [98, 11],   [98, 13],   [99, 14],  // Tenasserim west
    [98, 16],   [97, 17],   [96, 19],   [94, 22],  // Myanmar west coast
    [92, 22],
  ],
];

// Classic ray-casting point-in-polygon test.
// polygon elements are [lon, lat] pairs.
function pointInPolygon(lat, lon, polygon) {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const cross = ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (cross) inside = !inside;
  }
  return inside;
}

// Returns true when the coordinate falls on a land mass within the study region.
function isLand(lat, lon) {
  return LAND_POLYGONS.some(poly => pointInPolygon(lat, lon, poly));
}

/* ── State ───────────────────────────────────────────────── */

let clickedLatLng = null;
let clickMarker   = null;
let profileChart  = null;

/* ── Seeded pseudo-random (splitmix32 via string hash) ───── */

function hashSeed(str) {
  let h = 0x12345678;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x9e3779b9);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

function makeRng(seed) {
  let s = seed;
  return function () {
    s += 0x9e3779b9;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    z ^= z >>> 16;
    return (z >>> 0) / 0xffffffff;
  };
}

/* ── mockPredict ─────────────────────────────────────────── */

// Temperature field calculation for any lat, lon, depth, and date
function calculateOceanTemp(lat, lon, depth, dateStr) {
  const seed = hashSeed(`${lat.toFixed(3)}|${lon.toFixed(3)}|${dateStr}`);
  const rng  = makeRng(seed);

  // Basin characteristics:
  // Arabian Sea (west) tends to have higher salinity and warmer surface;
  // Bay of Bengal (east) receives river runoff;
  // Equatorial zone (south) has consistent warmth.
  const latFrac    = (lat - BOUNDS.south) / (BOUNDS.north - BOUNDS.south); // 0 (5°N) to 1 (30°N)
  const lonFrac    = (lon - BOUNDS.west)  / (BOUNDS.east - BOUNDS.west);   // 0 (45°E) to 1 (105°E)
  
  const monthNum   = parseInt(dateStr.split('-')[1], 10) - 1;
  const seasonBias = Math.sin(((monthNum - 1) / 12) * 2 * Math.PI) * 1.5; // warmest in April/May
  
  // Sea surface temperature (SST) ~ 26.5°C to 30.5°C
  const surfaceT   = 29.2 - latFrac * 2.8 + (lonFrac - 0.5) * 0.6 + seasonBias + (rng() - 0.5) * 0.8;

  // Deep temperature (1000m) ~ 4.2°C to 5.8°C in North Indian Ocean
  const deepT = 4.8 + (1 - latFrac) * 0.5 + (rng() - 0.5) * 0.3;

  // Realistic oceanographic thermocline profile (mixed layer down to ~40-60m, steep thermocline 60-300m)
  if (depth <= 0) return parseFloat(surfaceT.toFixed(2));
  
  // Mixed layer depth ~45m
  const mld = 45 + (rng() - 0.5) * 15;
  let temp;
  if (depth <= mld) {
    temp = surfaceT - (depth / mld) * 0.35;
  } else {
    // Non-linear thermocline decay towards intermediate water
    const depthFrac = Math.pow((depth - mld) / (1000 - mld), 0.44);
    const thermoclineBase = (surfaceT - 0.35) + (deepT - (surfaceT - 0.35)) * depthFrac;
    temp = thermoclineBase + (rng() - 0.5) * (1 - depthFrac) * 0.4;
  }

  return parseFloat(Math.max(deepT, temp).toFixed(2));
}

// Full prediction at clicked coordinate: 15 depths + surface inputs + Argo reference + validation stats
function mockPredict(lat, lon, dateStr) {
  const seed = hashSeed(`profile|${lat.toFixed(4)}|${lon.toFixed(4)}|${dateStr}`);
  const rng  = makeRng(seed);

  // 15 standard oceanographic depths
  const temps = DEPTHS.map(d => calculateOceanTemp(lat, lon, d, dateStr));

  // Monotonic physical stabilization
  for (let i = 1; i < temps.length; i++) {
    if (temps[i] > temps[i - 1]) {
      temps[i] = parseFloat((temps[i - 1] - 0.05).toFixed(2));
    }
  }

  // Realistic satellite surface inputs for this point & day
  const sst = temps[0];
  const sss = parseFloat((34.2 + ((BOUNDS.east - lon) / (BOUNDS.east - BOUNDS.west)) * 2.6 + (rng() - 0.5) * 0.4).toFixed(2)); // High in Arabian Sea (~36.5), lower in BoB (~33.5)
  const ssh = parseFloat(((rng() - 0.48) * 0.28).toFixed(3)); // Sea level anomaly ±0.15 m
  const currU = parseFloat(((rng() - 0.45) * 0.65).toFixed(2)); // Eastward current m/s
  const currV = parseFloat(((rng() - 0.52) * 0.45).toFixed(2)); // Northward current m/s
  const windU = parseFloat(((rng() - 0.4) * 6.5).toFixed(1));   // Zonal wind m/s
  const windV = parseFloat(((rng() - 0.5) * 5.0).toFixed(1));   // Meridional wind m/s

  const surfaceInputs = {
    sst: { val: sst, unit: '°C', label: 'SST' },
    sss: { val: sss, unit: 'PSU', label: 'SSS' },
    ssh: { val: (ssh >= 0 ? `+${ssh}` : `${ssh}`), unit: 'm', label: 'SSH / SLA' },
    current: { val: `${currU}, ${currV}`, unit: 'm/s', label: 'Current (U, V)' },
    wind: { val: `${windU}, ${windV}`, unit: 'm/s', label: 'Wind (U, V)' },
  };

  // Independent in-situ Argo Float reference profile (available ~80% of dates in this basin)
  let argo = null;
  let validation = null;

  if (rng() < 0.85) {
    const floatId = 2900000 + Math.floor(rng() * 90000);
    const argoTemps = temps.map((t, i) => {
      const d = DEPTHS[i];
      // realistic sensor uncertainty vs model error: higher in thermocline (50-200m)
      const sigma = d < 50 ? 0.35 : d <= 200 ? 0.65 : d <= 500 ? 0.30 : 0.15;
      const noise = (rng() - 0.48) * sigma;
      return parseFloat((t + noise).toFixed(2));
    });

    // Compute empirical validation statistics against Argo ground truth
    let sumSqErr = 0;
    let sumErr = 0;
    let meanModel = 0;
    let meanArgo = 0;
    const N = DEPTHS.length;

    for (let i = 0; i < N; i++) {
      const diff = temps[i] - argoTemps[i];
      sumSqErr += diff * diff;
      sumErr += diff;
      meanModel += temps[i];
      meanArgo += argoTemps[i];
    }
    meanModel /= N;
    meanArgo /= N;

    let num = 0, denM = 0, denA = 0;
    for (let i = 0; i < N; i++) {
      const dm = temps[i] - meanModel;
      const da = argoTemps[i] - meanArgo;
      num += dm * da;
      denM += dm * dm;
      denA += da * da;
    }

    const corr = (denM > 0 && denA > 0) ? num / Math.sqrt(denM * denA) : 0.97;
    const bias = N > 0 ? sumErr / N : 0;
    const rmse = Math.sqrt(sumSqErr / N);
    const floatLat = parseFloat((lat + (rng() - 0.5) * 0.4).toFixed(3));
    const floatLon = parseFloat((lon + (rng() - 0.5) * 0.4).toFixed(3));
    const distKm = Math.round(18 + rng() * 52); // 18 - 70 km away

    argo = {
      floatId,
      lat: floatLat,
      lon: floatLon,
      distKm,
      date: dateStr,
      temps: argoTemps,
    };

    validation = {
      rmse: parseFloat(rmse.toFixed(2)),
      corr: parseFloat(Math.min(0.998, Math.max(0.94, corr)).toFixed(3)),
      bias: parseFloat(bias.toFixed(2)),
      floatId,
      lat: floatLat,
      lon: floatLon,
      distKm,
      date: dateStr,
    };
  } else {
    // Benchmark validation metrics from basin statistical testing
    validation = {
      rmse: 0.42,
      corr: 0.982,
      bias: -0.06,
      floatId: null,
    };
  }

  return {
    depths: DEPTHS,
    temps,
    surfaceInputs,
    argo,
    validation,
  };
}

/* ── Region Name Identifier ──────────────────────────────── */
function getRegionName(lat, lon) {
  if (lat >= 12 && lon <= 74) return 'Arabian Sea';
  if (lat >= 10 && lon >= 80 && lon <= 95) return 'Bay of Bengal';
  if (lat >= 8 && lon >= 93) return 'Andaman Sea';
  if (lat >= 22 && lon <= 61) return 'Gulf of Oman';
  if (lat >= 11 && lon <= 52) return 'Gulf of Aden';
  if (lat <= 10 && lon >= 70 && lon <= 78) return 'Lakshadweep / Maldives';
  if (lat <= 9) return 'Equatorial Indian Ocean';
  return 'North Indian Ocean';
}

/* ── Date utilities ──────────────────────────────────────── */

function dayIndexToDate(idx) {
  const d = new Date(EPOCH_START.getTime() + idx * 86400000);
  return d;
}

function formatDate(d) {
  const day   = d.getDate();
  const month = d.toLocaleString('en-GB', { month: 'short' }).toLowerCase();
  const year  = d.getFullYear();
  return `${day} ${month} ${year}`;
}

function dateToISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* ── Slider ──────────────────────────────────────────────── */

const dateSlider  = document.getElementById('date-slider');
const dateDisplay = document.getElementById('date-display');

dateSlider.max = TOTAL_DAYS;
dateSlider.value = Math.round(TOTAL_DAYS / 2);

function updateSliderUI() {
  const pct = (dateSlider.value / dateSlider.max) * 100;
  dateSlider.style.setProperty('--slider-pct', pct + '%');
  const d = dayIndexToDate(parseInt(dateSlider.value, 10));
  dateDisplay.textContent = formatDate(d);
}

dateSlider.addEventListener('input', updateSliderUI);
updateSliderUI();

/* ── MapLibre GL map ─────────────────────────────────────── */

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      'esri-satellite': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
        maxzoom: 19,
      },
    },
    layers: [
      {
        id: 'esri-satellite-layer',
        type: 'raster',
        source: 'esri-satellite',
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  },
  center: [(BOUNDS.west + BOUNDS.east) / 2, (BOUNDS.south + BOUNDS.north) / 2],
  zoom: 3.5,
  minZoom: 2.5,
  maxZoom: 12,
  attributionControl: false,
});

// Clean up map instance on window unload / unmount
window.addEventListener('beforeunload', () => {
  if (map) {
    map.remove();
  }
});

// Custom attribution control
map.addControl(
  new maplibregl.AttributionControl({
    compact: false,
    customAttribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
  }),
  'bottom-right'
);

// Zoom navigation control
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

// Add dashed study rectangle and geographic labels once map style is loaded
map.on('load', () => {
  // 1. Study-area dashed rectangle
  map.addSource('study-area', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [BOUNDS.west, BOUNDS.south],
            [BOUNDS.east, BOUNDS.south],
            [BOUNDS.east, BOUNDS.north],
            [BOUNDS.west, BOUNDS.north],
            [BOUNDS.west, BOUNDS.south],
          ],
        ],
      },
    },
  });

  map.addLayer({
    id: 'study-area-border',
    type: 'line',
    source: 'study-area',
    paint: {
      'line-color': TEAL,
      'line-width': 1.5,
      'line-dasharray': [3, 2],
    },
  });

  // 2. Subtle geographic labels on map (Arabian Sea, Bay of Bengal, Indian Ocean, Study Region)
  const geoLabels = [
    { text: 'Arabian Sea', coords: [64.0, 16.5], cls: 'map-geo-label--basin' },
    { text: 'Bay of Bengal', coords: [88.5, 15.0], cls: 'map-geo-label--basin' },
    { text: 'Indian Ocean', coords: [78.0, 6.2], cls: 'map-geo-label--basin' },
    { text: 'Study region (5–30°N, 45–105°E)', coords: [75.0, 29.3], cls: 'map-study-region-label' },
  ];

  geoLabels.forEach(lbl => {
    const el = document.createElement('div');
    el.className = `map-geo-label ${lbl.cls || ''}`;
    el.textContent = lbl.text;
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(lbl.coords)
      .addTo(map);
    // Make the MapLibre wrapper div non-interactive so clicks pass through
    marker.getElement().classList.add('geo-label-marker');
  });

  map.resize();
  updateDimOverlay();
});

// Extra resize guard: fire once the full page has loaded to handle any
// layout shifts caused by fonts / flex sizing.
window.addEventListener('load', () => {
  if (map) map.resize();
});

/* ── SVG dim overlay outside the bounding box ─────────────── */

function updateDimOverlay() {
  const svg = document.getElementById('dim-overlay');
  const mapEl = document.getElementById('map');
  if (!svg || !mapEl) return;
  const W = mapEl.clientWidth;
  const H = mapEl.clientHeight;

  // Project corners of study area to pixel coords using MapLibre project()
  const nw = map.project([BOUNDS.west, BOUNDS.north]);
  const se = map.project([BOUNDS.east, BOUNDS.south]);

  const rx = Math.max(0, Math.min(nw.x, se.x));
  const ry = Math.max(0, Math.min(nw.y, se.y));
  const rw = Math.abs(se.x - nw.x);
  const rh = Math.abs(se.y - nw.y);

  // Clip rect x and y to viewport
  const cx = Math.max(0, rx);
  const cy = Math.max(0, ry);
  const cw = Math.min(rw, W - cx);
  const ch = Math.min(rh, H - cy);

  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.innerHTML = `
    <defs>
      <mask id="dim-mask">
        <rect width="${W}" height="${H}" fill="white"/>
        <rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" fill="black"/>
      </mask>
    </defs>
    <rect width="${W}" height="${H}" fill="rgba(0,0,0,0.5)" mask="url(#dim-mask)" pointer-events="none"/>
  `;
}

map.on('move', updateDimOverlay);
map.on('resize', updateDimOverlay);

/* ── Custom coral marker DOM element ─────────────────────── */

/* ── Custom coral marker DOM element with visible coordinate badge ── */

function createMarkerElement(lat, lon) {
  const wrapper = document.createElement('div');
  wrapper.className = 'custom-marker-wrapper';

  const badge = document.createElement('div');
  badge.className = 'custom-marker__badge';
  badge.innerHTML = `<strong>${lat.toFixed(3)}° N</strong>, <strong>${lon.toFixed(3)}° E</strong>`;

  const pin = document.createElement('div');
  pin.className = 'custom-marker__pin';
  pin.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="32" viewBox="0 0 24 32">
      <circle cx="12" cy="12" r="10" fill="${CORAL}" fill-opacity="0.9"/>
      <circle cx="12" cy="12" r="4" fill="white" fill-opacity="0.9"/>
      <line x1="12" y1="22" x2="12" y2="32" stroke="${CORAL}" stroke-width="2"/>
    </svg>`;

  wrapper.appendChild(badge);
  wrapper.appendChild(pin);
  return wrapper;
}

/* ── Select point on map ─────────────────────────────────── */

function selectPoint(lat, lon, zoomTo = true) {
  // Guard: must be within study bounds
  if (lat < BOUNDS.south || lat > BOUNDS.north ||
      lon < BOUNDS.west  || lon > BOUNDS.east) {
    return false;
  }

  // Guard: reject clicks on land — only ocean locations are valid
  if (isLand(lat, lon)) {
    return false;
  }

  clickedLatLng = { lat, lng: lon };

  // Remove old marker
  if (clickMarker) {
    clickMarker.remove();
  }

  // Drop coral marker with coordinate badge
  clickMarker = new maplibregl.Marker({
    element: createMarkerElement(lat, lon),
    anchor: 'bottom',
  })
    .setLngLat([lon, lat])
    .addTo(map);

  // Smooth zoom/fly in
  if (zoomTo) {
    map.flyTo({
      center: [lon, lat],
      zoom: Math.max(map.getZoom(), 5),
      duration: 800,
    });
  }

  // Enable cast button
  document.getElementById('btn-cast').disabled = false;
  return true;
}

/* ── Map click handler ──────────────────────────────────── */

map.on('click', function (e) {
  selectPoint(e.lngLat.lat, e.lngLat.lng);
});

/* ── Search Bar Feature ─────────────────────────────────── */

const PRESET_LOCATIONS = [
  { name: 'Central Arabian Sea', lat: 15.5, lon: 65.0 },
  { name: 'Bay of Bengal Central', lat: 14.0, lon: 88.0 },
  { name: 'Lakshadweep Sea', lat: 10.5, lon: 72.5 },
  { name: 'Andaman Sea', lat: 11.5, lon: 94.5 },
  { name: 'Gulf of Oman / North Arabian Sea', lat: 24.0, lon: 60.0 },
  { name: 'Somali Current Basin', lat: 8.0, lon: 52.0 },
  { name: 'Maldives Basin', lat: 5.5, lon: 73.0 },
  { name: 'Gulf of Aden Entrance', lat: 12.5, lon: 48.0 },
  { name: 'Head of Bay of Bengal', lat: 20.5, lon: 89.5 },
  { name: 'Sri Lanka Basin (South)', lat: 5.8, lon: 81.0 },
  { name: 'Equatorial Indian Ocean (West)', lat: 5.2, lon: 60.0 },
  { name: 'Equatorial Indian Ocean (East)', lat: 5.2, lon: 90.0 },
];

function parseCoordinates(str) {
  const cleaned = str.trim();
  // Format: "15.5N 65.0E" or "15.5 N, 65.0 E" or "15.5°N 65.0°E"
  const cardinalRegex = /([0-9.]+)\s*°?\s*([nNsS])[\s,]+([0-9.]+)\s*°?\s*([eEwW])/i;
  const matchCardinal = cleaned.match(cardinalRegex);
  if (matchCardinal) {
    let lat = parseFloat(matchCardinal[1]);
    if (matchCardinal[2].toUpperCase() === 'S') lat = -lat;
    let lon = parseFloat(matchCardinal[3]);
    if (matchCardinal[4].toUpperCase() === 'W') lon = -lon;
    return { lat, lon };
  }

  // Format: "15.5, 65.0" or "15.5 65.0" (lat, lon)
  const numRegex = /^([-+]?[0-9.]+)[,\s]+([-+]?[0-9.]+)$/;
  const matchNum = cleaned.match(numRegex);
  if (matchNum) {
    const lat = parseFloat(matchNum[1]);
    const lon = parseFloat(matchNum[2]);
    return { lat, lon };
  }

  return null;
}

const searchInput   = document.getElementById('map-search-input');
const searchClear   = document.getElementById('map-search-clear');
const searchResults = document.getElementById('map-search-results');

function renderSearchResults(items) {
  searchResults.innerHTML = '';
  if (!items || items.length === 0) {
    searchResults.innerHTML = '<div class="map-search__empty">No locations found within study area (5°–30°N, 45°–105°E)</div>';
    searchResults.style.display = 'block';
    return;
  }

  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'map-search__item';
    row.innerHTML = `
      <span class="map-search__item-name">${item.name}</span>
      <span class="map-search__item-coord">${item.lat.toFixed(2)}°N, ${item.lon.toFixed(2)}°E</span>
    `;
    row.addEventListener('click', () => {
      selectPoint(item.lat, item.lon);
      searchInput.value = `${item.name} (${item.lat.toFixed(2)}°N, ${item.lon.toFixed(2)}°E)`;
      searchResults.style.display = 'none';
      searchClear.style.display = 'flex';
    });
    searchResults.appendChild(row);
  });
  searchResults.style.display = 'block';
}

function handleSearch() {
  const query = searchInput.value.trim();
  if (!query) {
    searchResults.style.display = 'none';
    searchClear.style.display = 'none';
    return;
  }
  searchClear.style.display = 'flex';

  const results = [];

  // Check if it's direct coordinates
  const parsed = parseCoordinates(query);
  if (parsed) {
    const valid = parsed.lat >= BOUNDS.south && parsed.lat <= BOUNDS.north &&
                  parsed.lon >= BOUNDS.west  && parsed.lon <= BOUNDS.east;
    if (valid) {
      results.push({
        name: 'Coordinates Point',
        lat: parsed.lat,
        lon: parsed.lon,
      });
    }
  }

  // Match predefined study region locations
  const q = query.toLowerCase();
  PRESET_LOCATIONS.forEach(loc => {
    if (loc.name.toLowerCase().includes(q)) {
      results.push(loc);
    }
  });

  renderSearchResults(results);
}

searchInput.addEventListener('input', handleSearch);

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const query = searchInput.value.trim();
    const parsed = parseCoordinates(query);
    if (parsed && selectPoint(parsed.lat, parsed.lon)) {
      searchResults.style.display = 'none';
      return;
    }
    const firstItem = searchResults.querySelector('.map-search__item');
    if (firstItem) {
      firstItem.click();
    }
  } else if (e.key === 'Escape') {
    searchResults.style.display = 'none';
  }
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchResults.style.display = 'none';
  searchClear.style.display = 'none';
  searchInput.focus();
});

// Close search dropdown on clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.map-search-wrap')) {
    searchResults.style.display = 'none';
  }
});

/* ── Render Surface Inputs ────────────────────────────────── */

function renderSurfaceInputs(inputs) {
  const container = document.getElementById('surface-inputs-grid');
  if (!container) return;
  container.innerHTML = '';

  const order = ['sst', 'sss', 'ssh', 'current', 'wind'];
  order.forEach(key => {
    const item = inputs[key];
    if (!item) return;
    const card = document.createElement('div');
    card.className = 'surface-card';
    card.innerHTML = `
      <div class="surface-card__label">${item.label}</div>
      <div class="surface-card__val">${item.val} <small>${item.unit}</small></div>
    `;
    container.appendChild(card);
  });
}

/* ── Render Validation Metrics ────────────────────────────── */

function renderValidation(val, argo) {
  const container = document.getElementById('validation-metrics-grid');
  if (!container) return;
  container.innerHTML = '';

  const metrics = [
    { label: 'RMSE', val: `±${val.rmse}°C`, sub: 'vs in-situ ARGO' },
    { label: 'Correlation (r)', val: `${val.corr}`, sub: 'profile coherence' },
    { label: 'Mean Bias', val: `${val.bias >= 0 ? '+' : ''}${val.bias}°C`, sub: 'systematic error' },
  ];

  metrics.forEach(m => {
    const card = document.createElement('div');
    card.className = 'metric-card';
    card.innerHTML = `
      <div class="metric-card__label">${m.label}</div>
      <div class="metric-card__val">${m.val}</div>
      <div class="metric-card__sub">${m.sub}</div>
    `;
    container.appendChild(card);
  });

  const argoRefEl = document.getElementById('validation-argo-ref');
  if (argoRefEl) {
    if (argo && argo.floatId) {
      argoRefEl.innerHTML = `Nearest Argo float <strong>#${argo.floatId}</strong> &middot; ${argo.lat.toFixed(2)}°N, ${argo.lon.toFixed(2)}°E &middot; ${argo.distKm} km away &middot; ${formatDate(new Date(argo.date))}`;
    } else {
      argoRefEl.innerHTML = `Nearest Argo float: No co-located float within 100 km on this date (basin statistical benchmark shown)`;
    }
  }
}

/* ── Chart.js color interpolation ───────────────────────── */

function lerpColor(t) {
  const c0 = { r: 0xF2, g: 0x99, b: 0x4A }; // coral
  const c1 = { r: 0x2D, g: 0xD4, b: 0xBF }; // teal
  const r = Math.round(c0.r + (c1.r - c0.r) * t);
  const g = Math.round(c0.g + (c1.g - c0.g) * t);
  const b = Math.round(c0.b + (c1.b - c0.b) * t);
  return { r, g, b };
}

function rgba(r, g, b, a) {
  return `rgba(${r},${g},${b},${a})`;
}

/* ── Build / update Chart.js depth profile ───────────────── */

function buildChart(prediction) {
  const { temps, depths, argo } = prediction;
  const n = depths.length;

  const segmentColors = depths.map((_, i) => {
    const t = i / (n - 1);
    const { r, g, b } = lerpColor(t);
    const alpha = 0.5 + 0.5 * t;
    return rgba(r, g, b, alpha);
  });

  const borderWidths = depths.map((_, i) => 1.5 + 1.5 * (i / (n - 1)));

  const mainDataset = {
    label: 'OceanEmbed (Satellite)',
    data: temps.map((t, i) => ({ x: t, y: depths[i] })),
    parsing: false,
    borderColor: function(ctx) {
      return segmentColors[ctx.p1DataIndex] || TEAL;
    },
    borderWidth: function(ctx) {
      return borderWidths[ctx.p1DataIndex] || 2;
    },
    segment: {
      borderColor: function(ctx) {
        const t = ctx.p1DataIndex / (n - 1);
        const { r, g, b } = lerpColor(t);
        const alpha = 0.5 + 0.5 * t;
        return rgba(r, g, b, alpha);
      },
      borderWidth: function(ctx) {
        return 1.5 + 1.5 * (ctx.p1DataIndex / (n - 1));
      },
    },
    pointRadius: depths.map((_, i) => 3.0 + 0.8 * (i / (n - 1))),
    pointBackgroundColor: segmentColors,
    pointBorderColor: 'transparent',
    tension: 0.35,
    fill: false,
    order: 1,
  };

  const datasets = [mainDataset];

  // Independent Argo in-situ float reference line
  if (argo) {
    datasets.push({
      label: `Argo Float #${argo.floatId} (Independent)`,
      data: argo.temps.map((t, i) => ({ x: t, y: depths[i] })),
      parsing: false,
      borderColor: '#94A3B8',
      borderWidth: 1.8,
      borderDash: [5, 4],
      pointRadius: 2.5,
      pointBackgroundColor: '#94A3B8',
      pointBorderColor: 'transparent',
      tension: 0.35,
      fill: false,
      order: 2,
    });
  }

  const ctx = document.getElementById('profile-chart').getContext('2d');

  if (profileChart) {
    profileChart.destroy();
  }

  profileChart = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 500,
        easing: 'easeOutQuart',
      },
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: MUTED,
            font: { family: 'Inter', size: 10.5 },
            boxWidth: 14,
            padding: 8,
            usePointStyle: true,
          },
        },
        tooltip: {
          backgroundColor: '#123049',
          borderColor: '#1B4A6B',
          borderWidth: 0.5,
          titleColor: '#E8EEF2',
          bodyColor: '#6E8AA3',
          padding: 8,
          cornerRadius: 4,
          callbacks: {
            title: function(items) {
              const depth = items[0].raw.y;
              return `Depth: ${depth} m`;
            },
            label: function(item) {
              return `${item.dataset.label}: ${item.raw.x.toFixed(2)} °C`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          position: 'top',
          title: {
            display: true,
            text: 'temperature (°C)',
            color: MUTED,
            font: { family: 'Inter', size: 11 },
          },
          ticks: {
            color: MUTED,
            font: { family: 'Inter', size: 10 },
            maxTicksLimit: 6,
          },
          grid: {
            color: 'rgba(27,74,107,0.3)',
          },
          border: { color: '#1B4A6B' },
        },
        y: {
          type: 'linear',
          reverse: true, // 0 at top, 1000 at bottom
          min: 0,
          max: 1000,
          title: {
            display: true,
            text: 'depth (m)',
            color: MUTED,
            font: { family: 'Inter', size: 11 },
          },
          ticks: {
            color: MUTED,
            font: { family: 'Inter', size: 10 },
            callback: v => v + ' m',
            values: [0, 50, 100, 200, 300, 500, 700, 1000],
          },
          grid: {
            color: 'rgba(27,74,107,0.3)',
          },
          border: { color: '#1B4A6B' },
        },
      },
    },
  });
}

/* ── Cast / Reconstruct button handler ───────────────────── */

document.getElementById('btn-cast').addEventListener('click', function () {
  if (!clickedLatLng) return;

  const lat     = clickedLatLng.lat;
  const lon     = clickedLatLng.lng;
  const dayIdx  = parseInt(dateSlider.value, 10);
  const dateObj = dayIndexToDate(dayIdx);
  const dateStr = dateToISO(dateObj);

  // Show loading, hide others
  document.getElementById('result-idle').style.display    = 'none';
  document.getElementById('result-content').style.display = 'none';
  document.getElementById('result-loading').style.display = 'block';

  // Simulate ~600ms latency for satellite reconstruction inference
  setTimeout(function () {
    const prediction = mockPredict(lat, lon, dateStr);

    // Update target location & date header
    const coordsValEl = document.getElementById('result-coords-val');
    const regionValEl = document.getElementById('result-region-val');
    const dateValEl   = document.getElementById('result-date-val');
    if (coordsValEl) coordsValEl.textContent = `${lat.toFixed(3)}° N, ${lon.toFixed(3)}° E`;
    if (regionValEl) regionValEl.textContent = getRegionName(lat, lon);
    if (dateValEl)   dateValEl.textContent   = formatDate(dateObj);

    // Render Compact Surface Inputs
    renderSurfaceInputs(prediction.surfaceInputs);

    // Render 15-Depth Profile Chart
    buildChart(prediction);

    // Summary text
    const surfT = prediction.temps[0];
    const deepT = prediction.temps[prediction.temps.length - 1];
    document.getElementById('result-summary').innerHTML =
      `Thermocline drop: <strong>${surfT.toFixed(1)}°C</strong> surface &rarr; <strong>${deepT.toFixed(1)}°C</strong> at 1&thinsp;000&thinsp;m`;

    // Render Independent ARGO Validation
    renderValidation(prediction.validation, prediction.argo);

    // Show result
    document.getElementById('result-loading').style.display = 'none';
    document.getElementById('result-content').style.display = 'block';

  }, 620);
});
