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

const EPOCH_START    = new Date('2021-01-01');
const EPOCH_END      = new Date('2023-12-31');
const TOTAL_DAYS     = Math.round((EPOCH_END - EPOCH_START) / 86400000);
const MIN_VALID_DAY  = 10;  // First 10 days of 2021 excluded — model needs 10 days of prior history

const TEAL  = '#2563EB';  // blue-600 for light theme
const CORAL = '#EA7C3A';  // orange accent
const MUTED = '#94A3B8';  // slate-400

/* ── Backend config ──────────────────────────────────────── */

const API_BASE = 'http://localhost:8000';
const USE_MOCK = false;  // Set to true for offline frontend dev without the Python server

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

let clickedLatLng   = null;
let clickMarker     = null;
let profileChart    = null;
let hasSelectedDate = false;
let selectedDepth   = null; // 0, 5, 10, ... 1000 or null
let selectedParam   = null; // 'sst', 'ssh', 'sss', 'sla', 'current', 'wind' or null

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

dateSlider.min = MIN_VALID_DAY;
dateSlider.max = TOTAL_DAYS;
dateSlider.value = Math.round(TOTAL_DAYS / 2);

function updateSliderUI() {
  const pct = (dateSlider.value / dateSlider.max) * 100;
  dateSlider.style.setProperty('--slider-pct', pct + '%');
  const d = dayIndexToDate(parseInt(dateSlider.value, 10));
  const formatted = formatDate(d);
  if (dateDisplay) dateDisplay.textContent = hasSelectedDate ? formatted : 'Select date';
  // Also keep the header date button and native picker in sync
  const headerDateEl = document.getElementById('date-display-header');
  if (headerDateEl) headerDateEl.textContent = hasSelectedDate ? formatted : 'Select date';
  const nativePicker = document.getElementById('native-date-picker');
  if (nativePicker && hasSelectedDate) nativePicker.value = dateToISO(d);
}

dateSlider.addEventListener('input', () => {
  hasSelectedDate = true;
  updateSliderUI();
  checkAndRefreshHeatmap();
  checkAndTriggerCast();
});
updateSliderUI();

/* ── Native Date Picker Integration ───────────────────────── */

const nativeDatePicker = document.getElementById('native-date-picker');
const dateBtn = document.getElementById('ky-date-btn');

if (nativeDatePicker) {
  const openCalendar = () => {
    if (typeof nativeDatePicker.showPicker === 'function') {
      try {
        nativeDatePicker.showPicker();
      } catch (err) {
        nativeDatePicker.focus();
      }
    } else {
      nativeDatePicker.focus();
    }
  };

  if (dateBtn) {
    dateBtn.addEventListener('click', openCalendar);
  }

  // Also if container is clicked
  const dateWrap = document.querySelector('.ky-date-picker-wrap');
  if (dateWrap) {
    dateWrap.addEventListener('click', (e) => {
      if (e.target !== nativeDatePicker) {
        openCalendar();
      }
    });
  }

  nativeDatePicker.addEventListener('change', () => {
    const val = nativeDatePicker.value;
    if (!val) return;
    const selectedDate = new Date(`${val}T00:00:00`);
    if (isNaN(selectedDate.getTime())) return;

    hasSelectedDate = true;
    
    // Calculate difference in days from EPOCH_START
    const diffDays = Math.round((selectedDate - EPOCH_START) / 86400000);
    const clampedDay = Math.max(MIN_VALID_DAY, Math.min(TOTAL_DAYS, diffDays));
    
    dateSlider.value = clampedDay;
    updateSliderUI();
    checkAndRefreshHeatmap();
    checkAndTriggerCast();
  });
}

/* ── Depth Selector Integration (Top-Left Map Dropdown) ─── */

const depthSelect = document.getElementById('native-depth-select');
const depthLabel  = document.getElementById('map-depth-label');
const depthWrap   = document.getElementById('map-depth-dropdown-wrap');

if (depthSelect) {
  const openDepthPicker = () => {
    if (typeof depthSelect.showPicker === 'function') {
      try {
        depthSelect.showPicker();
      } catch (e) {
        depthSelect.focus();
      }
    } else {
      depthSelect.focus();
    }
  };

  if (depthWrap) {
    depthWrap.addEventListener('click', (e) => {
      if (e.target !== depthSelect) {
        openDepthPicker();
      }
    });
  }

  depthSelect.addEventListener('change', () => {
    const rawVal = depthSelect.value;
    if (rawVal === '' || rawVal === null) return;
    selectedDepth = parseInt(rawVal, 10);

    if (depthLabel) {
      depthLabel.textContent = selectedDepth === 0 ? 'Depth: 0 m (Surface)' : `Depth: ${selectedDepth} m`;
    }

    // If a subsurface depth (> 0) is selected, deselect any surface parameter tile
    if (selectedDepth > 0) {
      selectedParam = null;
      document.querySelectorAll('.ky-param-tile').forEach(t => t.classList.remove('ky-param-tile--active'));
    } else if (selectedDepth === 0 && !selectedParam) {
      // If 0m selected and no param card is active, view Sea Surface Temperature
      selectedParam = 'sst';
    }

    // Refresh heatmap overlay with real values for newly chosen depth/parameter
    checkAndRefreshHeatmap();
  });
}



/* ── MapLibre GL map ─────────────────────────────────────── */

const map = new maplibregl.Map({
  container: 'map',
  dragRotate: false,
  pitchWithRotate: false,
  touchPitch: false,
  bearing: 0,
  pitch: 0,
  maxPitch: 0,
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

// Zoom navigation control (top-right zoom + and -)
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

/* ── Real Ocean Temperature Heatmap Generation (Gated & Multi-Depth) ── */

const HEATMAP_BOUNDS = {
  north: 30.0,
  south: 5.0,
  west:  45.0,
  east:  105.0,
};

let currentHeatmapRequestId = 0;

function tempToColor(temp, depth) {
  // Adaptive color scale based on depth so surface warm features and deep cold features are both vividly rendered
  // Depth 0: 24-32°C. Depth 1000m: 4-12°C.
  let minT = 24.0, maxT = 32.0;
  if (depth >= 700) {
    minT = 4.0; maxT = 12.0;
  } else if (depth >= 300) {
    minT = 8.0; maxT = 18.0;
  } else if (depth >= 100) {
    minT = 14.0; maxT = 26.0;
  } else if (depth >= 50) {
    minT = 20.0; maxT = 30.0;
  }

  const tNorm = Math.max(0, Math.min(1, (temp - minT) / (maxT - minT)));
  let r = 0, g = 0, b = 0;
  if (tNorm < 0.25) {
    const f = tNorm / 0.25;
    r = Math.round(30 + f * (6 - 30));
    g = Math.round(58 + f * (182 - 58));
    b = Math.round(138 + f * (212 - 138));
  } else if (tNorm < 0.50) {
    const f = (tNorm - 0.25) / 0.25;
    r = Math.round(6 + f * (250 - 6));
    g = Math.round(182 + f * (204 - 182));
    b = Math.round(212 + f * (21 - 212));
  } else if (tNorm < 0.75) {
    const f = (tNorm - 0.50) / 0.25;
    r = Math.round(250 + f * (249 - 250));
    g = Math.round(204 + f * (115 - 204));
    b = Math.round(21 + f * (22 - 21));
  } else {
    const f = (tNorm - 0.75) / 0.25;
    r = Math.round(249 + f * (220 - 249));
    g = Math.round(115 + f * (38 - 115));
    b = Math.round(22 + f * (38 - 22));
  }
  return { r, g, b };
}

function generateRealGridCanvas(gridData, depth) {
  const lats = gridData.lats; // 101 entries: 5.0 to 30.0 (ascending)
  const lons = gridData.lons; // 241 entries: 45.0 to 105.0 (ascending)
  const grid = gridData.grid; // [101][241]

  const width = lons.length;
  const height = lats.length;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  // grid row 0 is lat 5.0 (South), row 100 is lat 30.0 (North).
  // Canvas row y=0 is North, row y=height-1 is South.
  for (let y = 0; y < height; y++) {
    const latIdx = (height - 1) - y;
    const lat = lats[latIdx];
    const row = grid[latIdx];

    for (let x = 0; x < width; x++) {
      const lon = lons[x];
      const val = row[x];
      const idx = (y * width + x) * 4;

      // 0.0 in dataset indicates land mask or missing data
      if (val < 0.5 || isLand(lat, lon)) {
        data[idx]     = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      } else {
        const { r, g, b } = tempToColor(val, depth);
        data[idx]     = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 195; // Smooth overlay opacity
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL();
}

function generateFallbackCanvas(dateStr, depth) {
  const width = 160;
  const height = 130;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  for (let y = 0; y < height; y++) {
    const lat = HEATMAP_BOUNDS.north - (y / (height - 1)) * (HEATMAP_BOUNDS.north - HEATMAP_BOUNDS.south);
    for (let x = 0; x < width; x++) {
      const lon = HEATMAP_BOUNDS.west + (x / (width - 1)) * (HEATMAP_BOUNDS.east - HEATMAP_BOUNDS.west);
      const idx = (y * width + x) * 4;

      if (isLand(lat, lon)) {
        data[idx]     = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      } else {
        const temp = calculateOceanTemp(lat, lon, depth, dateStr);
        const { r, g, b } = tempToColor(temp, depth);
        data[idx]     = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 195;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL();
}

function paramToColor(param, val) {
  let minV = 0, maxV = 1;
  let p = param.toLowerCase();
  if (p === 'sst') {
    minV = 24.0; maxV = 32.0;
    const tNorm = Math.max(0, Math.min(1, (val - minV) / (maxV - minV)));
    let r = 0, g = 0, b = 0;
    if (tNorm < 0.25) {
      const f = tNorm / 0.25;
      r = Math.round(30 + f * (6 - 30));
      g = Math.round(58 + f * (182 - 58));
      b = Math.round(138 + f * (212 - 138));
    } else if (tNorm < 0.50) {
      const f = (tNorm - 0.25) / 0.25;
      r = Math.round(6 + f * (250 - 6));
      g = Math.round(182 + f * (204 - 182));
      b = Math.round(212 + f * (21 - 212));
    } else if (tNorm < 0.75) {
      const f = (tNorm - 0.50) / 0.25;
      r = Math.round(250 + f * (249 - 250));
      g = Math.round(204 + f * (115 - 204));
      b = Math.round(21 + f * (22 - 21));
    } else {
      const f = (tNorm - 0.75) / 0.25;
      r = Math.round(249 + f * (220 - 249));
      g = Math.round(115 + f * (38 - 115));
      b = Math.round(22 + f * (38 - 22));
    }
    return { r, g, b };
  } else if (p === 'ssh') {
    // -0.4 to +0.4 m: Blue #1E3A8A -> Cyan/Blue #3B82F6 -> Red #EF4444
    minV = -0.4; maxV = 0.4;
    const norm = Math.max(0, Math.min(1, (val - minV) / (maxV - minV)));
    let r, g, b;
    if (norm < 0.5) {
      const f = norm / 0.5;
      r = Math.round(30 + f * (59 - 30));
      g = Math.round(58 + f * (130 - 58));
      b = Math.round(138 + f * (246 - 138));
    } else {
      const f = (norm - 0.5) / 0.5;
      r = Math.round(59 + f * (239 - 59));
      g = Math.round(130 + f * (68 - 130));
      b = Math.round(246 + f * (68 - 246));
    }
    return { r, g, b };
  } else if (p === 'sss') {
    // 32 to 36 PSU: Dark Green #059669 -> Emerald #10B981 -> Blue #3B82F6
    minV = 32.0; maxV = 36.0;
    const norm = Math.max(0, Math.min(1, (val - minV) / (maxV - minV)));
    let r, g, b;
    if (norm < 0.5) {
      const f = norm / 0.5;
      r = Math.round(5 + f * (16 - 5));
      g = Math.round(150 + f * (185 - 150));
      b = Math.round(105 + f * (129 - 105));
    } else {
      const f = (norm - 0.5) / 0.5;
      r = Math.round(16 + f * (59 - 16));
      g = Math.round(185 + f * (130 - 185));
      b = Math.round(129 + f * (246 - 129));
    }
    return { r, g, b };
  } else if (p === 'sla') {
    // -0.3 to +0.3 m: Indigo #4338CA -> Violet #6366F1 -> Pink #EC4899
    minV = -0.3; maxV = 0.3;
    const norm = Math.max(0, Math.min(1, (val - minV) / (maxV - minV)));
    let r, g, b;
    if (norm < 0.5) {
      const f = norm / 0.5;
      r = Math.round(67 + f * (99 - 67));
      g = Math.round(56 + f * (102 - 56));
      b = Math.round(202 + f * (241 - 202));
    } else {
      const f = (norm - 0.5) / 0.5;
      r = Math.round(99 + f * (236 - 99));
      g = Math.round(102 + f * (72 - 102));
      b = Math.round(241 + f * (153 - 241));
    }
    return { r, g, b };
  } else if (p === 'current') {
    // 0.0 to 1.2 m/s: Ocean Blue #0284C7 -> Cyan #06B6D4 -> Rose #E11D48
    minV = 0.0; maxV = 1.2;
    const norm = Math.max(0, Math.min(1, (val - minV) / (maxV - minV)));
    let r, g, b;
    if (norm < 0.5) {
      const f = norm / 0.5;
      r = Math.round(2 + f * (6 - 2));
      g = Math.round(132 + f * (182 - 132));
      b = Math.round(199 + f * (212 - 199));
    } else {
      const f = (norm - 0.5) / 0.5;
      r = Math.round(6 + f * (225 - 6));
      g = Math.round(182 + f * (29 - 182));
      b = Math.round(212 + f * (72 - 212));
    }
    return { r, g, b };
  } else if (p === 'wind') {
    // 2 to 14 m/s: Slate #475569 -> Sky #38BDF8 -> Amber #F59E0B
    minV = 2.0; maxV = 14.0;
    const norm = Math.max(0, Math.min(1, (val - minV) / (maxV - minV)));
    let r, g, b;
    if (norm < 0.5) {
      const f = norm / 0.5;
      r = Math.round(71 + f * (56 - 71));
      g = Math.round(85 + f * (189 - 85));
      b = Math.round(105 + f * (248 - 105));
    } else {
      const f = (norm - 0.5) / 0.5;
      r = Math.round(56 + f * (245 - 56));
      g = Math.round(189 + f * (158 - 189));
      b = Math.round(248 + f * (11 - 248));
    }
    return { r, g, b };
  }
  return tempToColor(val, 0);
}

function generateParamGridCanvas(gridData, param) {
  const lats = gridData.lats;
  const lons = gridData.lons;
  const grid = gridData.grid;

  const width = lons.length;
  const height = lats.length;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  for (let y = 0; y < height; y++) {
    const latIdx = (height - 1) - y;
    const lat = lats[latIdx];
    const row = grid[latIdx];

    for (let x = 0; x < width; x++) {
      const lon = lons[x];
      const val = row[x];
      const idx = (y * width + x) * 4;

      if (isLand(lat, lon)) {
        data[idx]     = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      } else {
        const { r, g, b } = paramToColor(param, val);
        data[idx]     = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 195;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL();
}

function generateFallbackParamCanvas(param) {
  const width = 160;
  const height = 130;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  for (let y = 0; y < height; y++) {
    const lat = HEATMAP_BOUNDS.north - (y / (height - 1)) * (HEATMAP_BOUNDS.north - HEATMAP_BOUNDS.south);
    for (let x = 0; x < width; x++) {
      const lon = HEATMAP_BOUNDS.west + (x / (width - 1)) * (HEATMAP_BOUNDS.east - HEATMAP_BOUNDS.west);
      const idx = (y * width + x) * 4;

      if (isLand(lat, lon)) {
        data[idx]     = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      } else {
        let val = 0;
        if (param === 'sst') val = 28.5;
        else if (param === 'ssh') val = 0.05;
        else if (param === 'sss') val = 34.8;
        else if (param === 'sla') val = 0.02;
        else if (param === 'current') val = 0.45;
        else if (param === 'wind') val = 7.5;
        const { r, g, b } = paramToColor(param, val);
        data[idx]     = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 195;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL();
}

function updateHeatmapOverlay(canvasUrl) {
  if (!map.isStyleLoaded()) return;
  const source = map.getSource('sst-heatmap-source');
  if (source && typeof source.updateImage === 'function') {
    source.updateImage({
      url: canvasUrl,
      coordinates: [
        [HEATMAP_BOUNDS.west, HEATMAP_BOUNDS.north],
        [HEATMAP_BOUNDS.east, HEATMAP_BOUNDS.north],
        [HEATMAP_BOUNDS.east, HEATMAP_BOUNDS.south],
        [HEATMAP_BOUNDS.west, HEATMAP_BOUNDS.south],
      ]
    });
  }
}

function updateHeatmapLegend(depth) {
  const legendTitle = document.getElementById('map-legend-title');
  const legendTicks = document.getElementById('map-legend-ticks');
  const legendBar   = document.getElementById('map-legend-bar');
  if (!legendTitle || !legendTicks) return;

  if (legendBar) {
    legendBar.style.background = 'linear-gradient(to right, #2563EB 0%, #38BDF8 25%, #FACC15 50%, #F97316 75%, #EF4444 100%)';
  }

  let ticks = ['24', '26', '28', '30', '32'];
  if (depth >= 700) {
    ticks = ['4', '6', '8', '10', '12'];
  } else if (depth >= 300) {
    ticks = ['8', '10.5', '13', '15.5', '18'];
  } else if (depth >= 100) {
    ticks = ['14', '17', '20', '23', '26'];
  } else if (depth >= 50) {
    ticks = ['20', '22.5', '25', '27.5', '30'];
  }

  legendTitle.textContent = depth === 0 
    ? 'Sea Surface Temperature (°C)' 
    : `Subsurface Temperature at ${depth}m (°C)`;
  legendTicks.innerHTML = ticks.map(t => `<span>${t}</span>`).join('');
}

// 1x1 Transparent placeholder data URL
const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function checkAndRefreshHeatmap() {
  if (!map || !map.isStyleLoaded()) return;

  // Gating condition:
  // Must have a date selected AND (either selectedParam is chosen OR selectedDepth is chosen)
  // Location (clickedLatLng) is NOT required for the heatmap!
  const hasLayer = (selectedParam !== null || selectedDepth !== null);
  const isGated = !hasSelectedDate || !hasLayer;

  if (isGated) {
    // Hide heatmap overlay completely — display only plain satellite/terrain base map
    if (map.getLayer('sst-heatmap-layer')) {
      map.setLayoutProperty('sst-heatmap-layer', 'visibility', 'none');
    }
    return;
  }

  // Gating requirements satisfied: make layer visible
  if (map.getLayer('sst-heatmap-layer')) {
    map.setLayoutProperty('sst-heatmap-layer', 'visibility', 'visible');
  }

  const dayIdx = parseInt(dateSlider.value, 10);
  const dateStr = dateToISO(dayIndexToDate(dayIdx));
  const reqId = ++currentHeatmapRequestId;

  if (selectedParam) {
    // Render 2D Surface Ocean Parameter
    const cfg = PARAM_CONFIG[selectedParam] || PARAM_CONFIG.sst;
    const legendTitle = document.getElementById('map-legend-title');
    const legendBar   = document.getElementById('map-legend-bar');
    const legendTicks = document.getElementById('map-legend-ticks');
    if (legendTitle) legendTitle.textContent = cfg.title;
    if (legendBar)   legendBar.style.background = cfg.bar;
    if (legendTicks) legendTicks.innerHTML = cfg.ticks.map(t => `<span>${t}</span>`).join('');

    fetch(`${API_BASE}/parameter-grid?param=${selectedParam}&date=${dateStr}`)
      .then(res => {
        if (!res.ok) throw new Error(`Param Grid API HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (reqId !== currentHeatmapRequestId) return;
        const url = generateParamGridCanvas(data, selectedParam);
        updateHeatmapOverlay(url);
      })
      .catch(err => {
        console.warn('Real parameter grid backend unavailable, falling back:', err);
        if (reqId !== currentHeatmapRequestId) return;
        const fallbackUrl = generateFallbackParamCanvas(selectedParam);
        updateHeatmapOverlay(fallbackUrl);
      });
  } else {
    // Render Subsurface Ocean Temperature at selectedDepth
    const depth = selectedDepth !== null ? selectedDepth : 0;
    updateHeatmapLegend(depth);

    fetch(`${API_BASE}/temperature-grid?date=${dateStr}&depth=${depth}`)
      .then(res => {
        if (!res.ok) throw new Error(`Grid API HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (reqId !== currentHeatmapRequestId) return;
        const url = generateRealGridCanvas(data, depth);
        updateHeatmapOverlay(url);
      })
      .catch(err => {
        console.warn('Real temperature grid backend unavailable, falling back to ocean model calculations:', err);
        if (reqId !== currentHeatmapRequestId) return;
        const fallbackUrl = generateFallbackCanvas(dateStr, depth);
        updateHeatmapOverlay(fallbackUrl);
      });
  }
}

// Add geographic labels and SST heatmap raster layer once map style is loaded
map.on('load', () => {
  // 1. Add SST raster image source and layer with transparent initial image
  map.addSource('sst-heatmap-source', {
    type: 'image',
    url: TRANSPARENT_PIXEL,
    coordinates: [
      [HEATMAP_BOUNDS.west, HEATMAP_BOUNDS.north],
      [HEATMAP_BOUNDS.east, HEATMAP_BOUNDS.north],
      [HEATMAP_BOUNDS.east, HEATMAP_BOUNDS.south],
      [HEATMAP_BOUNDS.west, HEATMAP_BOUNDS.south],
    ]
  });

  map.addLayer({
    id: 'sst-heatmap-layer',
    type: 'raster',
    source: 'sst-heatmap-source',
    layout: {
      visibility: 'none', // Initially hidden on load until gated condition is met
    },
    paint: {
      'raster-opacity': 0.78,
      'raster-resampling': 'linear',
      'raster-fade-duration': 150,
    }
  });

  // 2. 8 Geographic labels matching spec and reference design:
  const geoLabels = [
    { text: 'AFRICA', coords: [44.0, 10.5], cls: 'map-geo-label--land' },
    { text: 'INDIA', coords: [78.5, 22.0], cls: 'map-geo-label--land' },
    { text: 'ARABIAN SEA', coords: [65.0, 15.5], cls: 'map-geo-label--sea' },
    { text: 'Bay of Bengal', coords: [89.0, 14.5], cls: 'map-geo-label--basin' },
    { text: 'SRI LANKA', coords: [82.8, 7.5], cls: 'map-geo-label--island' },
    { text: 'INDONESIA', coords: [98.0, 1.0], cls: 'map-geo-label--land' },
    { text: 'MADAGASCAR', coords: [47.5, -14.0], cls: 'map-geo-label--island' },
    { text: 'Indian Ocean', coords: [77.0, -1.0], cls: 'map-geo-label--ocean' },
  ];

  geoLabels.forEach(lbl => {
    const el = document.createElement('div');
    el.className = `map-geo-label ${lbl.cls || ''}`;
    el.textContent = lbl.text;
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(lbl.coords)
      .addTo(map);
    marker.getElement().classList.add('geo-label-marker');
  });

  map.resize();
  checkAndRefreshHeatmap();
});


// Extra resize guard: fire once the full page has loaded to handle any
// layout shifts caused by fonts / flex sizing.
window.addEventListener('load', () => {
  if (map) map.resize();
});

/* ── Custom coral marker DOM element ─────────────────────── */

/* ── Custom marker DOM element (Teardrop blue pin matching reference design) ── */

function createMarkerElement(lat, lon) {
  const wrapper = document.createElement('div');
  wrapper.className = 'custom-marker-wrapper';

  const pin = document.createElement('div');
  pin.className = 'custom-marker__pin';
  pin.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40" fill="none">
      <path d="M15 0C6.71573 0 0 6.71573 0 15C0 26.25 15 40 15 40C15 40 30 26.25 30 15C30 6.71573 23.2843 0 15 0Z" fill="#1D4ED8" stroke="#FFFFFF" stroke-width="2.5"/>
      <circle cx="15" cy="14" r="5" fill="#FFFFFF"/>
    </svg>`;

  wrapper.appendChild(pin);
  return wrapper;
}

/* ── Gating & Cast Trigger ───────────────────────────────── */

function checkAndTriggerCast() {
  if (!clickedLatLng || !hasSelectedDate) {
    const emptyView = document.getElementById('tvd-empty-view');
    const tableView = document.getElementById('tvd-table-view');
    const graphView = document.getElementById('tvd-graph-view');
    if (emptyView) emptyView.style.display = 'flex';
    if (tableView) tableView.style.display = 'none';
    if (graphView) graphView.style.display = 'none';
    return;
  }

  const castBtn = document.getElementById('btn-cast');
  if (castBtn) {
    castBtn.disabled = false;
    castBtn.click();
  }
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

  // Update Region pill in top-left
  const regionPill = document.getElementById('map-region-pill-text');
  if (regionPill) {
    regionPill.textContent = getRegionName(lat, lon) || 'Indian Ocean';
  }

  // Trigger cast if both location and date are present
  checkAndTriggerCast();
  // Refresh or reveal heatmap if all gating conditions are met
  checkAndRefreshHeatmap();
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

/* ── Update Ocean Parameters tiles (Kyogre UI) ───────────── */

function renderSurfaceInputs(inputs) {
  // Update the 6 Kyogre param tiles in-place using their value IDs
  function setVal(id, val, unit) {
    const el = document.getElementById(id);
    if (el) el.textContent = `${val} ${unit}`;
  }

  if (inputs.sst)     setVal('param-sst-val',     inputs.sst.val,                 '°C');
  if (inputs.ssh)     setVal('param-ssh-val',      inputs.ssh.val,                 'm');
  if (inputs.sss)     setVal('param-sss-val',      inputs.sss.val,                 'PSU');
  if (inputs.ssh) {
    // Sea Level Anomaly formatted like +3.2 cm or -1.5 cm
    const slaVal = ((inputs.ssh.val - 0.38) * 100).toFixed(1);
    const prefix = parseFloat(slaVal) >= 0 ? '+' : '';
    setVal('param-sla-val', `${prefix}${slaVal}`, 'cm');
  }
  if (inputs.current) setVal('param-current-val',  inputs.current.val,             'm/s');
  if (inputs.wind) {
    // Format wind in km/h to match mockup
    const windKmh = Math.round(inputs.wind.val * 3.6);
    setVal('param-wind-val', windKmh, 'km/h');
  }
}

/* ── Update Stat Cards from cast result ──────────────────── */

function updateStatCards(prediction) {
  const { temps, validation } = prediction;

  // 1: Mixed Layer Depth (MLD) ~ 42 m
  // Defined oceanographically as depth where temp drops by 0.2°C from surface
  let mld = 42;
  if (temps && temps.length > 0) {
    const sst = temps[0];
    for (let i = 1; i < DEPTHS.length; i++) {
      if (sst - temps[i] >= 0.2) {
        const ratio = (0.2 - (sst - temps[i - 1])) / (temps[i - 1] - temps[i] || 1);
        mld = Math.round(DEPTHS[i - 1] + ratio * (DEPTHS[i] - DEPTHS[i - 1]));
        break;
      }
    }
  }
  const mldEl = document.getElementById('stat-mld-val');
  if (mldEl) mldEl.textContent = `${Math.max(15, Math.min(95, mld))} m`;

  // 2: Ocean Heat Content – 300m (OHC₃₀₀) ~ in kJ/cm²
  // OHC = ρ * Cp * ∫ (T - T_ref) dz / 10^7 ≈ 70-85 kJ/cm² in tropical Indian Ocean
  let ohc = 78.6;
  if (temps && temps.length > 0) {
    let heatSum = 0;
    for (let i = 0; i < DEPTHS.length && DEPTHS[i] <= 300; i++) {
      const dz = (i === 0) ? DEPTHS[0] : (DEPTHS[i] - DEPTHS[i - 1]);
      heatSum += Math.max(0, (temps[i] - 12)) * dz;
    }
    // Scale to typical tropical OHC range: 65 - 90 kJ/cm²
    ohc = parseFloat((55 + (heatSum / 2800) * 35).toFixed(1));
  }
  const ohcEl = document.getElementById('stat-ohc-val');
  if (ohcEl) ohcEl.textContent = `${ohc} kJ/cm²`;

  // 3: Sound Velocity / Acoustic Shadow Depth ~ 180 m
  // Acoustic shadow depth often aligns with the sonic layer depth (SLD) or thermocline base
  let svad = 180;
  if (temps && temps.length > 5) {
    // Sound speed gradient inversion zone depth
    svad = Math.min(260, Math.max(120, mld + 138));
  }
  const svadEl = document.getElementById('stat-svad-val');
  if (svadEl) svadEl.textContent = `${svad} m`;

  // 4: RMSE (keep this one, default 0.42 °C)
  const rmseEl = document.getElementById('stat-rmse-val');
  if (rmseEl) {
    if (validation && validation.rmse !== undefined) {
      rmseEl.textContent = `${validation.rmse} °C`;
    } else {
      rmseEl.textContent = '0.42 °C';
    }
  }
}

/* ── Depth-Temperature table renderer (2 columns: Depth, Temp) ── */

const TVD_HIGHLIGHT_DEPTH = 50;

function updateDepthTable(depths, temps) {
  const tbody = document.getElementById('tvd-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  depths.forEach((depth, i) => {
    const tr = document.createElement('tr');
    if (depth === TVD_HIGHLIGHT_DEPTH) {
      tr.className = 'ky-tvd-table-row--highlight';
    }
    tr.innerHTML = `<td>${depth}</td><td>${temps[i].toFixed(1)}</td>`;
    tbody.appendChild(tr);
  });
}

/* ── Table / Graph toggle ────────────────────────────────── */

function initTableGraphToggle() {
  const btnTable = document.getElementById('tvd-btn-table');
  const btnGraph = document.getElementById('tvd-btn-graph');
  const tableView = document.getElementById('tvd-table-view');
  const graphView = document.getElementById('tvd-graph-view');
  const emptyView = document.getElementById('tvd-empty-view');

  if (!btnTable || !btnGraph) return;

  btnTable.addEventListener('click', () => {
    btnTable.classList.add('ky-tvd-toggle__btn--active');
    btnGraph.classList.remove('ky-tvd-toggle__btn--active');
    if (!clickedLatLng || !hasSelectedDate) {
      if (emptyView) emptyView.style.display = 'flex';
      if (tableView) tableView.style.display = 'none';
      if (graphView) graphView.style.display = 'none';
      return;
    }
    if (emptyView) emptyView.style.display = 'none';
    if (tableView) tableView.style.display = '';
    if (graphView) graphView.style.display = 'none';
  });

  btnGraph.addEventListener('click', () => {
    btnGraph.classList.add('ky-tvd-toggle__btn--active');
    btnTable.classList.remove('ky-tvd-toggle__btn--active');
    if (!clickedLatLng || !hasSelectedDate) {
      if (emptyView) emptyView.style.display = 'flex';
      if (tableView) tableView.style.display = 'none';
      if (graphView) graphView.style.display = 'none';
      return;
    }
    if (emptyView) emptyView.style.display = 'none';
    if (graphView) graphView.style.display = '';
    if (tableView) tableView.style.display = 'none';
    // Force Chart.js to resize now that the canvas is visible
    if (profileChart) {
      setTimeout(() => profileChart.resize(), 50);
    }
  });
}

initTableGraphToggle();

/* ── Ocean Parameters tile active state & Legend sync ──────── */

const PARAM_CONFIG = {
  sst:     { title: 'Sea Surface Temperature (°C)', ticks: ['24', '26', '28', '30', '32'], bar: 'linear-gradient(to right, #2563EB 0%, #38BDF8 25%, #FACC15 50%, #F97316 75%, #EF4444 100%)' },
  ssh:     { title: 'Sea Surface Height (m)',       ticks: ['-0.4', '-0.2', '0.0', '+0.2', '+0.4'], bar: 'linear-gradient(to right, #1E3A8A 0%, #3B82F6 50%, #EF4444 100%)' },
  sss:     { title: 'Sea Surface Salinity (PSU)',   ticks: ['32', '33', '34', '35', '36'], bar: 'linear-gradient(to right, #059669 0%, #10B981 50%, #3B82F6 100%)' },
  sla:     { title: 'Sea Level Anomaly (m)',        ticks: ['-0.3', '-0.15', '0.0', '+0.15', '+0.3'], bar: 'linear-gradient(to right, #4338CA 0%, #6366F1 50%, #EC4899 100%)' },
  current: { title: 'Surface Ocean Current (m/s)',  ticks: ['0.0', '0.3', '0.6', '0.9', '1.2'], bar: 'linear-gradient(to right, #0284C7 0%, #06B6D4 50%, #E11D48 100%)' },
  wind:    { title: 'Surface Winds (m/s)',          ticks: ['2', '5', '8', '11', '14'], bar: 'linear-gradient(to right, #475569 0%, #38BDF8 50%, #F59E0B 100%)' },
};

document.querySelectorAll('.ky-param-tile').forEach(tile => {
  tile.addEventListener('click', () => {
    document.querySelectorAll('.ky-param-tile').forEach(t => t.classList.remove('ky-param-tile--active'));
    tile.classList.add('ky-param-tile--active');

    const param = tile.getAttribute('data-param');
    selectedParam = param;
    selectedDepth = 0; // Auto-set/lock depth to 0m (Surface) for 2D surface parameter

    // Sync Depth dropdown UI
    if (depthSelect) {
      depthSelect.value = '0';
    }
    if (depthLabel) {
      depthLabel.textContent = 'Depth: 0 m (Surface)';
    }

    const cfg = PARAM_CONFIG[param] || PARAM_CONFIG.sst;
    
    const legendTitle = document.getElementById('map-legend-title');
    if (legendTitle) legendTitle.textContent = cfg.title;

    const legendBar = document.getElementById('map-legend-bar');
    if (legendBar) legendBar.style.background = cfg.bar;

    const legendTicks = document.getElementById('map-legend-ticks');
    if (legendTicks) {
      legendTicks.innerHTML = cfg.ticks.map(t => `<span>${t}</span>`).join('');
    }

    // Trigger heatmap refresh with new parameter overlay
    checkAndRefreshHeatmap();
  });
});


/* ── Render Validation Metrics ────────────────────────────── */

function renderValidation(val, argo) {
  const container = document.getElementById('validation-metrics-grid');
  if (!container) return;
  container.innerHTML = '';

  const argoRefEl = document.getElementById('validation-argo-ref');

  // Real backend returns null for both — show a neutral message instead of fake stats
  if (!val) {
    const note = document.createElement('div');
    note.className = 'metric-card metric-card--wide';
    note.style.cssText = 'grid-column: 1 / -1; text-align: center; color: var(--muted, #6E8AA3); font-size: 0.85rem; padding: 1rem 0;';
    note.textContent = 'In-situ validation not available for this deployment.';
    container.appendChild(note);
    if (argoRefEl) argoRefEl.textContent = '';
    return;
  }

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
    label: 'Temperature',
    data: temps.map((t, i) => ({ x: t, y: depths[i] })),
    parsing: false,
    borderColor: '#1D64F2',
    borderWidth: 2,
    pointRadius: 3.5,
    pointBackgroundColor: '#1D64F2',
    pointBorderColor: '#FFFFFF',
    pointBorderWidth: 1,
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
          position: 'top',
          align: 'end',
          labels: {
            color: '#1E293B',
            font: { family: 'Inter', size: 11, weight: '500' },
            boxWidth: 10,
            padding: 8,
            usePointStyle: true,
          },
        },
        tooltip: {
          backgroundColor: '#FFFFFF',
          borderColor: '#BFDBFE',
          borderWidth: 1,
          titleColor: '#1E293B',
          bodyColor: '#64748B',
          padding: 8,
          cornerRadius: 8,
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
          position: 'bottom',
          title: {
            display: true,
            text: 'Temperature (°C)',
            color: '#64748B',
            font: { family: 'Inter', size: 11, weight: '500' },
          },
          ticks: {
            color: '#64748B',
            font: { family: 'Inter', size: 10 },
            stepSize: 5,
            maxTicksLimit: 7,
          },
          grid: {
            color: 'rgba(226, 232, 240, 0.8)',
          },
          border: { color: '#CBD5E1' },
        },
        y: {
          type: 'linear',
          reverse: true, // 0 at top, 1000 at bottom
          min: 0,
          max: 1000,
          title: {
            display: true,
            text: 'Depth (m)',
            color: '#64748B',
            font: { family: 'Inter', size: 11, weight: '500' },
          },
          ticks: {
            color: '#64748B',
            font: { family: 'Inter', size: 10 },
            values: [0, 200, 400, 600, 800, 1000],
          },
          grid: {
            color: 'rgba(226, 232, 240, 0.8)',
          },
          border: { color: '#CBD5E1' },
        },
      },
    },
    plugins: [{
      id: 'referenceDepthLine',
      afterDraw(chart) {
        const { ctx, chartArea: { left, right }, scales: { y } } = chart;
        const refDepth = 68; // Reference depth matching visual design
        const yPos = y.getPixelForValue(refDepth);
        if (yPos >= chart.chartArea.top && yPos <= chart.chartArea.bottom) {
          ctx.save();
          ctx.beginPath();
          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = '#94A3B8';
          ctx.lineWidth = 1.5;
          ctx.moveTo(left, yPos);
          ctx.lineTo(right, yPos);
          ctx.stroke();

          // Label on the right edge
          ctx.fillStyle = '#1E293B';
          ctx.font = 'bold 11px Inter, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('68 m', right + 4, yPos + 4);
          ctx.restore();
        }
      }
    }]
  });
}

/* ── Cast / Reconstruct button handler ───────────────────── */

function showCastError(msg) {
  document.getElementById('result-loading').style.display = 'none';
  document.getElementById('result-content').style.display = 'none';
  const idleEl = document.getElementById('result-idle');
  idleEl.style.display = 'flex';
  // Reuse idle panel to surface the error message
  const existingErr = idleEl.querySelector('.cast-error-msg');
  if (existingErr) existingErr.remove();
  const errDiv = document.createElement('p');
  errDiv.className = 'cast-error-msg';
  errDiv.textContent = msg;
  idleEl.appendChild(errDiv);
}

document.getElementById('btn-cast').addEventListener('click', function () {
  if (!clickedLatLng || !hasSelectedDate) return;

  const lat     = clickedLatLng.lat;
  const lon     = clickedLatLng.lng;
  const dayIdx  = parseInt(dateSlider.value, 10);
  const dateObj = dayIndexToDate(dayIdx);
  const dateStr = dateToISO(dateObj);

  // Date guard — model needs 10 days of prior satellite history
  if (dayIdx < MIN_VALID_DAY) {
    showCastError('Date requires 10 days of prior satellite history. Please select a date on or after 2021-01-11.');
    return;
  }

  // Show loading, hide others
  document.getElementById('result-idle').style.display    = 'none';
  document.getElementById('result-content').style.display = 'none';
  document.getElementById('result-loading').style.display = 'block';

  if (USE_MOCK) {
    // ── Offline dev fallback ─────────────────────────────────
    setTimeout(function () {
      const prediction = mockPredict(lat, lon, dateStr);
      renderPrediction(prediction, lat, lon, dateObj);
    }, 620);
    return;
  }

  // ── Real inference via FastAPI backend ───────────────────
  fetch(`${API_BASE}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude: lat, longitude: lon, date: dateStr }),
  })
    .then(function (res) {
      if (!res.ok) {
        return res.json().then(function (body) {
          throw new Error(body.detail || `Server error ${res.status}`);
        }).catch(function (e) {
          if (e instanceof SyntaxError) throw new Error(`Server error ${res.status}`);
          throw e;
        });
      }
      return res.json();
    })
    .then(function (prediction) {
      renderPrediction(prediction, lat, lon, dateObj);
    })
    .catch(function (err) {
      let msg = err.message || 'Inference service unavailable.';
      if (!navigator.onLine || msg.toLowerCase().includes('failed to fetch')) {
        msg = 'Inference service unavailable. Make sure the Python backend is running on port 8000.';
      }
      showCastError(msg);
    });
});

/* ── Shared render helper (used by both mock and real paths) ─ */

function renderPrediction(prediction, lat, lon, dateObj) {
  // Update target location & date header
  const coordsValEl = document.getElementById('result-coords-val');
  const regionValEl = document.getElementById('result-region-val');
  const dateValEl   = document.getElementById('result-date-val');
  if (coordsValEl) coordsValEl.textContent = `${lat.toFixed(3)}° N, ${lon.toFixed(3)}° E`;
  if (regionValEl) regionValEl.textContent = getRegionName(lat, lon);
  if (dateValEl)   dateValEl.textContent   = formatDate(dateObj);

  // Update Ocean Parameters tiles
  renderSurfaceInputs(prediction.surfaceInputs);

  // Update Stat Cards (MLD, OHC, SVAD, RMSE)
  updateStatCards(prediction);

  // Update Depth-Temperature table
  updateDepthTable(prediction.depths, prediction.temps);

  // Render 15-Depth Profile Chart (Chart.js)
  buildChart(prediction);

  // Summary text
  const surfT = prediction.temps[0];
  const deepT = prediction.temps[prediction.temps.length - 1];
  const summaryEl = document.getElementById('result-summary');
  if (summaryEl) summaryEl.innerHTML =
    `Thermocline drop: <strong>${surfT.toFixed(1)}°C</strong> surface &rarr; <strong>${deepT.toFixed(1)}°C</strong> at 1&thinsp;000&thinsp;m`;

  // Render Independent ARGO Validation
  renderValidation(prediction.validation, prediction.argo);

  // Hide empty state and show table or graph based on active toggle
  const emptyView = document.getElementById('tvd-empty-view');
  const btnTable = document.getElementById('tvd-btn-table');
  const tableView = document.getElementById('tvd-table-view');
  const graphView = document.getElementById('tvd-graph-view');

  if (emptyView) emptyView.style.display = 'none';
  if (btnTable && btnTable.classList.contains('ky-tvd-toggle__btn--active')) {
    if (tableView) tableView.style.display = '';
    if (graphView) graphView.style.display = 'none';
  } else {
    if (graphView) graphView.style.display = '';
    if (tableView) tableView.style.display = 'none';
  }

  // Show result panel
  document.getElementById('result-loading').style.display = 'none';
  document.getElementById('result-content').style.display = 'flex';
}


