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

const API_BASE_URL = (typeof window !== 'undefined' && window.API_BASE_URL)
  ? window.API_BASE_URL
  : 'http://localhost:8000';
const API_BASE = API_BASE_URL;
const API_REQUEST_TIMEOUT_MS = 90000; // 90 seconds timeout for Render cold starts / slow inference
const USE_MOCK = false;  // Set to true for offline frontend dev without the Python server

/**
 * Checks whether the configured backend is running locally on localhost/127.0.0.1.
 */
function isLocalBackend() {
  try {
    const url = new URL(API_BASE, (typeof window !== 'undefined' && window.location) ? window.location.href : 'http://localhost');
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch (e) {
    return API_BASE.includes('localhost') || API_BASE.includes('127.0.0.1');
  }
}
if (typeof window !== 'undefined') {
  window.API_REQUEST_TIMEOUT_MS = API_REQUEST_TIMEOUT_MS;
  window.isLocalBackend = isLocalBackend;
}

/* ── Developer / Debug Mode Gating ──────────────────────── */

/**
 * Checks whether developer / debug mode is enabled.
 * Supported triggers:
 * - URL query parameter: ?debug=true, ?debug=1, ?dev=true, ?dev=1
 * - Window-level global: window.__KYOGRE_DEV__ === true or window.DEBUG === true
 */
function isDevModeEnabled() {
  if (typeof window === 'undefined') return false;
  if (window.__KYOGRE_DEV__ === true || window.DEBUG === true) return true;
  if (window.location && window.location.search) {
    const params = new URLSearchParams(window.location.search);
    const debugParam = params.get('debug');
    const devParam = params.get('dev');
    if (debugParam === 'true' || debugParam === '1' || devParam === 'true' || devParam === '1') {
      return true;
    }
  }
  return false;
}
if (typeof window !== 'undefined') {
  window.isDevModeEnabled = isDevModeEnabled;
}

/* ── ARGO Validation Confidence Benchmark (15 standard depths) ── */
const ARGO_CONFIDENCE_BENCHMARK = [
  { depth: 0, rmse: 0.87, confidence_pct: 75, confidence_label: 'Moderate' },
  { depth: 5, rmse: 1.20, confidence_pct: 62, confidence_label: 'Moderate' },
  { depth: 10, rmse: 1.24, confidence_pct: 60, confidence_label: 'Moderate' },
  { depth: 20, rmse: 1.34, confidence_pct: 56, confidence_label: 'Low' },
  { depth: 30, rmse: 1.37, confidence_pct: 55, confidence_label: 'Low' },
  { depth: 50, rmse: 1.38, confidence_pct: 55, confidence_label: 'Low' },
  { depth: 75, rmse: 1.49, confidence_pct: 50, confidence_label: 'Low' },
  { depth: 100, rmse: 2.15, confidence_pct: 37, confidence_label: 'Low' },
  { depth: 125, rmse: 1.89, confidence_pct: 42, confidence_label: 'Low' },
  { depth: 150, rmse: 1.69, confidence_pct: 46, confidence_label: 'Low' },
  { depth: 200, rmse: 1.42, confidence_pct: 53, confidence_label: 'Low' },
  { depth: 300, rmse: 1.03, confidence_pct: 69, confidence_label: 'Moderate' },
  { depth: 500, rmse: 0.61, confidence_pct: 86, confidence_label: 'High' },
  { depth: 700, rmse: 0.64, confidence_pct: 84, confidence_label: 'Moderate' },
  { depth: 1000, rmse: 0.81, confidence_pct: 78, confidence_label: 'Moderate' },
];

let globalConfidenceStats = ARGO_CONFIDENCE_BENCHMARK;
let hasLoggedConfidenceStats = false;

function logConfidenceStatsDev(stats) {
  if (hasLoggedConfidenceStats) return;
  if (isDevModeEnabled()) {
    console.log('[Kyogre Dev] Per-Depth ARGO Validation RMSE & Confidence Benchmark:');
    if (console.table) {
      console.table(stats.map(s => ({
        'Depth (m)': s.depth,
        'RMSE (°C)': typeof s.rmse === 'number' ? s.rmse.toFixed(2) : s.rmse,
        'Confidence (%)': `${s.confidence_pct}%`,
        'Rating': s.confidence_label,
      })));
    } else {
      console.log(stats);
    }
    hasLoggedConfidenceStats = true;
  }
}

async function initConfidenceStats() {
  if (typeof fetch !== 'undefined') {
    try {
      const res = await fetch(`${API_BASE}/confidence-stats`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.stats && Array.isArray(data.stats)) {
          globalConfidenceStats = data.stats;
        }
      }
    } catch (e) {
      // offline / fallback
    }
  }
  logConfidenceStatsDev(globalConfidenceStats);
}

// Log initial benchmark immediately if dev mode is enabled
if (isDevModeEnabled()) {
  logConfidenceStatsDev(globalConfidenceStats);
}

// Run async fetch on initialization
if (typeof window !== 'undefined') {
  window.initConfidenceStats = initConfidenceStats;
  window.ARGO_CONFIDENCE_BENCHMARK = ARGO_CONFIDENCE_BENCHMARK;
  initConfidenceStats();
}


/* ── Land/Sea Mask (High-Resolution Natural Earth 50m Coastline) ─────────────── */

// In Node.js testing environments, load COASTLINE_RINGS if not globally defined
if (typeof COASTLINE_RINGS === 'undefined') {
  try {
    // eslint-disable-next-line no-undef
    const { COASTLINE_RINGS: cr } = require('./coastline.js');
    // eslint-disable-next-line no-undef
    global.COASTLINE_RINGS = cr;
  } catch (e) {
    // browser will have COASTLINE_RINGS loaded via script tag
  }
}

// Ray-casting point-in-polygon test. Polygon points are [lon, lat] pairs.
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

// Fast bounding-box accelerated land test using Natural Earth 50m data.
// Accurately recognizes Gulf of Kutch, Palk Strait, Andaman Sea channels as ocean water.
function isLand(lat, lon) {
  const rings = (typeof COASTLINE_RINGS !== 'undefined') ? COASTLINE_RINGS : [];
  for (let i = 0; i < rings.length; i++) {
    const b = rings[i].b;
    // Bounding box filter: [minLon, minLat, maxLon, maxLat]
    if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
    if (pointInPolygon(lat, lon, rings[i].p)) return true;
  }
  return false;
}

// Applies high-resolution Natural Earth land cutout to a 2D canvas via destination-out.
// Every pixel on land is cleared to 100% transparency with sub-pixel anti-aliasing.
// Ocean pixels right up to the shoreline remain fully shaded with zero gap.
function applyLandMaskToCanvas(canvas) {
  const rings = (typeof COASTLINE_RINGS !== 'undefined') ? COASTLINE_RINGS : [];
  if (!rings || rings.length === 0) return;

  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000000';

  const minLon = HEATMAP_BOUNDS.west;  // 45.0
  const maxLon = HEATMAP_BOUNDS.east;  // 105.0
  const minLat = HEATMAP_BOUNDS.south; // 5.0
  const maxLat = HEATMAP_BOUNDS.north; // 30.0

  const lonSpan = maxLon - minLon; // 60.0
  const latSpan = maxLat - minLat; // 25.0

  ctx.beginPath();
  for (let i = 0; i < rings.length; i++) {
    const pts = rings[i].p;
    if (pts.length < 3) continue;
    const x0 = ((pts[0][0] - minLon) / lonSpan) * (w - 1);
    const y0 = ((maxLat - pts[0][1]) / latSpan) * (h - 1);
    ctx.moveTo(x0, y0);
    for (let j = 1; j < pts.length; j++) {
      const x = ((pts[j][0] - minLon) / lonSpan) * (w - 1);
      const y = ((maxLat - pts[j][1]) / latSpan) * (h - 1);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

/* ── State ───────────────────────────────────────────────── */

let clickedLatLng        = null;
let clickMarker          = null;
let profileChart         = null;
let hasSelectedDate      = false;
let selectedDepth        = null; // 0, 5, 10, ... 1000 or null
let selectedParam        = null; // 'sst', 'ssh', 'sss', 'sla', 'current', 'wind', 'confidence' or null
let currentGridData      = null; // Last loaded 101x241 grid payload (includes .grid, .u, .v)
let currentActiveCanvas  = null; // Active rendered 2D canvas element
let lastValidationReport = null; // Latest marker-layer pixel & numeric validation result
let geoLabelMarkers      = []; // Array of { marker, coords, text } for dynamic collision avoidance

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

/* ── Operational Region Notice Banner ────────────────────── */

let regionNoticeTimer = null;

function showRegionNotice(message, type = 'error') {
  const notice = document.getElementById('region-notice');
  const textEl = document.getElementById('region-notice-text');
  if (!notice || !textEl) return;

  textEl.textContent = message;
  notice.className = `ky-region-notice ${type === 'warning' ? 'ky-region-notice--warning' : ''}`;
  notice.style.display = 'flex';

  if (regionNoticeTimer) {
    clearTimeout(regionNoticeTimer);
  }

  regionNoticeTimer = setTimeout(() => {
    notice.style.display = 'none';
    regionNoticeTimer = null;
  }, 4000);
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

    // Validate date range: 2021-01-11 to 2023-12-31 (10 days prior history required for model)
    const minValidDate = new Date('2021-01-11T00:00:00');
    const maxValidDate = new Date('2023-12-31T00:00:00');

    if (selectedDate < minValidDate || selectedDate > maxValidDate) {
      showRegionNotice('Please select a date between 2021-01-11 and 2023-12-31 (Model requires 10 days of prior satellite history).', 'warning');
      nativeDatePicker.value = hasSelectedDate ? dateToISO(dayIndexToDate(parseInt(dateSlider.value, 10))) : '';
      return;
    }

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
const depthBtn    = document.getElementById('map-depth-btn');
const depthMenu   = document.getElementById('map-depth-menu');
const depthWrap   = document.getElementById('map-depth-dropdown-wrap');

function toggleDepthMenu(show) {
  if (!depthMenu || !depthBtn) return;
  const isOpen = depthMenu.classList.contains('ky-depth-menu--open');
  const next = show !== undefined ? show : !isOpen;
  if (next) {
    depthMenu.classList.add('ky-depth-menu--open');
    depthBtn.classList.add('ky-map-depth-btn--open');
    depthBtn.setAttribute('aria-expanded', 'true');
  } else {
    depthMenu.classList.remove('ky-depth-menu--open');
    depthBtn.classList.remove('ky-map-depth-btn--open');
    depthBtn.setAttribute('aria-expanded', 'false');
  }
}

function setDepthSelection(depth, updateHeatmap = true) {
  selectedDepth = depth;
  if (depthSelect) {
    depthSelect.value = depth !== null ? String(depth) : '';
  }
  if (depthLabel) {
    if (depth === null) {
      depthLabel.textContent = 'Depth';
    } else if (depth === 0) {
      depthLabel.textContent = 'Depth: 0 m (Surface)';
    } else {
      depthLabel.textContent = `Depth: ${depth} m`;
    }
  }

  // Update active state on custom menu options
  document.querySelectorAll('.ky-depth-option').forEach(opt => {
    const d = parseInt(opt.getAttribute('data-depth'), 10);
    if (depth !== null && d === depth) {
      opt.classList.add('ky-depth-option--selected');
    } else {
      opt.classList.remove('ky-depth-option--selected');
    }
  });

  // Sync Temperature vs Depth table row highlight
  updateTableHighlight(depth);

  if (updateHeatmap) {
    // If a depth selection is made directly from dropdown, deselect any surface parameter tile
    selectedParam = null;
    document.querySelectorAll('.ky-param-tile').forEach(t => t.classList.remove('ky-param-tile--active'));

    // Refresh heatmap overlay with real values for newly chosen depth
    checkAndRefreshHeatmap();
  }
}

if (depthBtn) {
  depthBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDepthMenu();
  });
}

document.querySelectorAll('.ky-depth-option').forEach(opt => {
  opt.addEventListener('click', (e) => {
    e.stopPropagation();
    const rawVal = opt.getAttribute('data-depth');
    if (rawVal === '' || rawVal === null) return;
    const depthVal = parseInt(rawVal, 10);
    setDepthSelection(depthVal, true);
    toggleDepthMenu(false);
  });
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (depthWrap && !depthWrap.contains(e.target)) {
    toggleDepthMenu(false);
  }
});

// Close dropdown on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    toggleDepthMenu(false);
  }
});

// Backward-compatible listener for programmatic changes to native select
if (depthSelect) {
  depthSelect.addEventListener('change', () => {
    const rawVal = depthSelect.value;
    if (rawVal === '' || rawVal === null) return;
    setDepthSelection(parseInt(rawVal, 10), true);
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
let currentHeatmapController = null;
let currentHeatmapTimeoutId = null;

// ── Zoom Earth-Style 11-Stop Temperature Palette & Precomputed C1-Smooth LUT ──
const ZOOM_EARTH_GRADIENT_CSS = 'linear-gradient(to right, #2A0845 0%, #1B267E 10%, #1976D2 20%, #00B4D8 32%, #00E1B4 42%, #10B981 52%, #84CC16 63%, #FACC15 74%, #F97316 84%, #EF4444 93%, #8C1028 100%)';

const ZOOM_EARTH_STOPS = [
  { t: 0.00, r: 42,  g: 8,   b: 69  }, // #2A0845 Deep Midnight Purple
  { t: 0.10, r: 27,  g: 38,  b: 126 }, // #1B267E Deep Indigo
  { t: 0.20, r: 25,  g: 118, b: 210 }, // #1976D2 Cobalt Ocean Blue
  { t: 0.32, r: 0,   g: 180, b: 216 }, // #00B4D8 Vivid Sky Blue
  { t: 0.42, r: 0,   g: 225, b: 180 }, // #00E1B4 Electric Aqua / Cyan
  { t: 0.52, r: 16,  g: 185, b: 129 }, // #10B981 Vibrant Emerald Green
  { t: 0.63, r: 132, g: 204, b: 22  }, // #84CC16 Bright Lime Green
  { t: 0.74, r: 250, g: 204, b: 21  }, // #FACC15 Sunny Golden Yellow
  { t: 0.84, r: 249, g: 115, b: 22  }, // #F97316 Vivid Amber Orange
  { t: 0.93, r: 239, g: 68,  b: 68  }, // #EF4444 Fiery Scarlet Red
  { t: 1.00, r: 140, g: 16,  b: 40  }, // #8C1028 Deep Crimson Maroon
];

function buildCosineSmoothLut(stops, size = 1024) {
  const rLut = new Uint8Array(size);
  const gLut = new Uint8Array(size);
  const bLut = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    let s0 = stops[0], s1 = stops[stops.length - 1];
    for (let j = 0; j < stops.length - 1; j++) {
      if (t >= stops[j].t && t <= stops[j + 1].t) {
        s0 = stops[j];
        s1 = stops[j + 1];
        break;
      }
    }
    const span = s1.t - s0.t;
    const localT = span > 0 ? (t - s0.t) / span : 0;
    // Cosine smoothing ensures C1 derivative continuity across stops (eliminates optical Mach banding)
    const smoothT = (1 - Math.cos(localT * Math.PI)) / 2;
    rLut[i] = Math.round(s0.r + (s1.r - s0.r) * smoothT);
    gLut[i] = Math.round(s0.g + (s1.g - s0.g) * smoothT);
    bLut[i] = Math.round(s0.b + (s1.b - s0.b) * smoothT);
  }
  return { rLut, gLut, bLut, size };
}

const TEMP_LUT = buildCosineSmoothLut(ZOOM_EARTH_STOPS, 1024);

function tempToColor(temp, depth) {
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
  const lutIdx = Math.round(tNorm * (TEMP_LUT.size - 1));
  return {
    r: TEMP_LUT.rLut[lutIdx],
    g: TEMP_LUT.gLut[lutIdx],
    b: TEMP_LUT.bLut[lutIdx]
  };
}

function generateRealGridCanvas(gridData, depth) {
  // ── Zoom Earth-Style Smooth & Anti-Aliased Temperature Field ────────────
  // Strategy:
  //   1. Pre-process: Identify real ocean points (>0.5 C) and extrapolate (infill)
  //      temperatures 1-2 cells into coastal land cells to prevent coastline blur cliff.
  //   2. High-res bilinear upsampling (5x scale -> 1201 x 501 px) for both temperature
  //      and continuous ocean presence (0.0 to 1.0).
  //   3. Separable Gaussian blur (sigma = 3.2 px) across the continuous temperature field.
  //   4. Smoothstep anti-aliasing on alpha mask (alpha = 0 on pure land, smoothly rising
  //      to 205 on open ocean), completely eliminating jagged coastal staircases.
  //   5. MapLibre WebGL hardware linear filtering handles pan/zoom resampling.
  // ────────────────────────────────────────────────────────────────────────

  const lats = gridData.lats; // 101 entries, 5.0 -> 30.0 (ascending)
  const lons = gridData.lons; // 241 entries, 45.0 -> 105.0 (ascending)
  const grid = gridData.grid; // [101][241], land cells = 0.0

  const srcW = lons.length;   // 241
  const srcH = lats.length;   // 101

  // ── Step 1: Pre-process source grid: identify ocean cells and infill coast ─
  const isOceanSrc = new Uint8Array(srcH * srcW);
  const tempSrc    = new Float32Array(srcH * srcW);

  for (let sy = 0; sy < srcH; sy++) {
    const latIdx = (srcH - 1) - sy; // flip Y so row 0 is north
    const row = grid[latIdx];
    for (let sx = 0; sx < srcW; sx++) {
      const val = row[sx];
      const idx = sy * srcW + sx;
      if (val >= 0.5) {
        isOceanSrc[idx] = 1;
        tempSrc[idx]    = val;
      } else {
        isOceanSrc[idx] = 0;
        tempSrc[idx]    = 0;
      }
    }
  }

  // Coastal temperature infill: extrapolate ocean temperatures into near-shore land cells
  // so bilinear interpolation and blur near coastlines remain smooth without dropping to 0 C.
  const infilledTemp = new Float32Array(tempSrc);
  for (let sy = 0; sy < srcH; sy++) {
    for (let sx = 0; sx < srcW; sx++) {
      const idx = sy * srcW + sx;
      if (isOceanSrc[idx]) continue;

      let sum = 0, count = 0;
      for (let dy = -2; dy <= 2; dy++) {
        const ny = sy + dy;
        if (ny < 0 || ny >= srcH) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const nx = sx + dx;
          if (nx < 0 || nx >= srcW) continue;
          const nidx = ny * srcW + nx;
          if (isOceanSrc[nidx]) {
            const dist = Math.hypot(dx, dy);
            const w = 1 / (dist + 0.1);
            sum += tempSrc[nidx] * w;
            count += w;
          }
        }
      }
      if (count > 0) {
        infilledTemp[idx] = sum / count;
      }
    }
  }

  // ── Step 2: High-Resolution Bilinear Upsampling (5x Scale -> 1201 x 501) ──
  const SCALE = 5;
  const dstW = (srcW - 1) * SCALE + 1; // 1201
  const dstH = (srcH - 1) * SCALE + 1; // 501

  const dstTemp  = new Float32Array(dstH * dstW);
  const dstOcean = new Float32Array(dstH * dstW);

  for (let dy = 0; dy < dstH; dy++) {
    const fy  = dy / SCALE;
    const sy0 = Math.floor(fy);
    const sy1 = Math.min(sy0 + 1, srcH - 1);
    const ty  = fy - sy0;

    for (let dx = 0; dx < dstW; dx++) {
      const fx  = dx / SCALE;
      const sx0 = Math.floor(fx);
      const sx1 = Math.min(sx0 + 1, srcW - 1);
      const tx  = fx - sx0;

      const i00 = sy0 * srcW + sx0;
      const i10 = sy0 * srcW + sx1;
      const i01 = sy1 * srcW + sx0;
      const i11 = sy1 * srcW + sx1;

      const w00 = (1 - tx) * (1 - ty);
      const w10 = tx       * (1 - ty);
      const w01 = (1 - tx) * ty;
      const w11 = tx       * ty;

      const di = dy * dstW + dx;

      dstOcean[di] = isOceanSrc[i00] * w00 + isOceanSrc[i10] * w10 +
                     isOceanSrc[i01] * w01 + isOceanSrc[i11] * w11;

      dstTemp[di]  = infilledTemp[i00] * w00 + infilledTemp[i10] * w10 +
                     infilledTemp[i01] * w01 + infilledTemp[i11] * w11;
    }
  }

  // ── Step 3: Fast Separable Gaussian Smoothing on Temperature Field ───────
  const SIGMA = 3.2;
  const RADIUS = Math.ceil(SIGMA * 2.5);
  const kernel = new Float32Array(2 * RADIUS + 1);
  let ksum = 0;
  for (let k = -RADIUS; k <= RADIUS; k++) {
    kernel[k + RADIUS] = Math.exp(-(k * k) / (2 * SIGMA * SIGMA));
    ksum += kernel[k + RADIUS];
  }
  for (let k = 0; k < kernel.length; k++) kernel[k] /= ksum;

  const hTemp    = new Float32Array(dstH * dstW);
  const blurTemp = new Float32Array(dstH * dstW);

  // Horizontal blur pass
  for (let dy = 0; dy < dstH; dy++) {
    const rowOffset = dy * dstW;
    for (let dx = 0; dx < dstW; dx++) {
      let sum = 0;
      for (let k = -RADIUS; k <= RADIUS; k++) {
        const nx = Math.max(0, Math.min(dstW - 1, dx + k));
        sum += dstTemp[rowOffset + nx] * kernel[k + RADIUS];
      }
      hTemp[rowOffset + dx] = sum;
    }
  }

  // Vertical blur pass
  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      let sum = 0;
      for (let k = -RADIUS; k <= RADIUS; k++) {
        const ny = Math.max(0, Math.min(dstH - 1, dy + k));
        sum += hTemp[ny * dstW + dx] * kernel[k + RADIUS];
      }
      blurTemp[dy * dstW + dx] = sum;
    }
  }

  // ── Step 4: Write to Canvas with Anti-Aliased Ocean Masking ───────────────
  const canvas = document.createElement('canvas');
  canvas.width  = dstW;
  canvas.height = dstH;
  const ctx     = canvas.getContext('2d');
  const imgData = ctx.createImageData(dstW, dstH);
  const imgArr  = imgData.data;

  const MAX_ALPHA = 245; // High saturation overlay opacity matching legend scale

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

  for (let i = 0, pi = 0; i < dstH * dstW; i++, pi += 4) {
    const w = dstOcean[i];

    // Land threshold: deep inland without ocean data
    if (w <= 0.05 || blurTemp[i] === 0) {
      imgArr[pi]     = 0;
      imgArr[pi + 1] = 0;
      imgArr[pi + 2] = 0;
      imgArr[pi + 3] = 0;
    } else {
      // Full vibrant ocean color right up to the shoreline
      let alpha = MAX_ALPHA;
      if (w < 0.20) {
        const t = (w - 0.05) / 0.15;
        alpha = Math.round(MAX_ALPHA * (t * t * (3 - 2 * t)));
      }

      const tNorm = Math.max(0, Math.min(1, (blurTemp[i] - minT) / (maxT - minT)));
      const lutIdx = Math.round(tNorm * 1023);

      imgArr[pi]     = TEMP_LUT.rLut[lutIdx];
      imgArr[pi + 1] = TEMP_LUT.gLut[lutIdx];
      imgArr[pi + 2] = TEMP_LUT.bLut[lutIdx];
      imgArr[pi + 3] = alpha;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  applyLandMaskToCanvas(canvas);
  currentActiveCanvas = canvas;
  return canvas.toDataURL();
}

function generateFallbackCanvas(dateStr, depth) {
  // Use simulated basin model to create 101x241 grid and feed into smooth renderer
  const lats = [];
  const lons = [];
  for (let i = 0; i <= 100; i++) lats.push(5.0 + i * 0.25);
  for (let j = 0; j <= 240; j++) lons.push(45.0 + j * 0.25);

  const grid = [];
  for (let i = 0; i < lats.length; i++) {
    const lat = lats[i];
    const row = [];
    for (let j = 0; j < lons.length; j++) {
      const lon = lons[j];
      if (isLand(lat, lon)) {
        row.push(0.0);
      } else {
        row.push(calculateOceanTemp(lat, lon, depth, dateStr));
      }
    }
    grid.push(row);
  }

  return generateRealGridCanvas({ lats, lons, grid }, depth);
}


function interpolateColorStops(stops, norm) {
  let s0 = stops[0], s1 = stops[stops.length - 1];
  for (let j = 0; j < stops.length - 1; j++) {
    if (norm >= stops[j].t && norm <= stops[j + 1].t) {
      s0 = stops[j];
      s1 = stops[j + 1];
      break;
    }
  }
  const span = s1.t - s0.t;
  const f = span > 0 ? (norm - s0.t) / span : 0;
  return {
    r: Math.round(s0.r + (s1.r - s0.r) * f),
    g: Math.round(s0.g + (s1.g - s0.g) * f),
    b: Math.round(s0.b + (s1.b - s0.b) * f),
  };
}

function paramToColor(param, val) {
  const p = param.toLowerCase();
  if (p === 'sst') {
    return tempToColor(val, 0);
  } else if (p === 'ssh') {
    // Sea Surface Height: 0.2m to 1.0m (physical dynamic topography + anomaly)
    // Deep Blue #1E3A8A -> Blue #2563EB -> Cyan #06B6D4 -> Emerald #10B981 -> Amber #F59E0B -> Red #EF4444
    const minV = 0.20, maxV = 1.00;
    const norm = Math.max(0, Math.min(1, (val - minV) / (maxV - minV)));
    const stops = [
      { t: 0.00, r: 30,  g: 58,  b: 138 }, // #1E3A8A
      { t: 0.25, r: 37,  g: 99,  b: 235 }, // #2563EB
      { t: 0.50, r: 6,   g: 182, b: 212 }, // #06B6D4
      { t: 0.70, r: 16,  g: 185, b: 129 }, // #10B981
      { t: 0.85, r: 245, g: 158, b: 11  }, // #F59E0B
      { t: 1.00, r: 239, g: 68,  b: 68  }, // #EF4444
    ];
    return interpolateColorStops(stops, norm);
  } else if (p === 'sss') {
    // Sea Surface Salinity: 32.0 to 36.0 PSU
    // Dark Green #059669 -> Emerald #10B981 -> Sky Blue #38BDF8 -> Royal Blue #1D4ED8
    const minV = 32.0, maxV = 36.0;
    const norm = Math.max(0, Math.min(1, (val - minV) / (maxV - minV)));
    const stops = [
      { t: 0.00, r: 5,   g: 150, b: 105 }, // #059669
      { t: 0.35, r: 16,  g: 185, b: 129 }, // #10B981
      { t: 0.70, r: 56,  g: 189, b: 248 }, // #38BDF8
      { t: 1.00, r: 29,  g: 78,  b: 216 }, // #1D4ED8
    ];
    return interpolateColorStops(stops, norm);
  } else if (p === 'sla') {
    // Sea Level Anomaly: -0.20m to +0.20m (-20cm to +20cm)
    // High-contrast diverging: Deep Indigo #1E1B4B -> Indigo #4338CA -> Light Ice #E0F2FE -> Vivid Rose #EC4899 -> Deep Maroon #9D174D
    const minV = -0.20, maxV = 0.20;
    const norm = Math.max(0, Math.min(1, (val - minV) / (maxV - minV)));
    const stops = [
      { t: 0.00, r: 30,  g: 27,  b: 75  }, // #1E1B4B
      { t: 0.30, r: 67,  g: 56,  b: 202 }, // #4338CA
      { t: 0.50, r: 224, g: 242, b: 254 }, // #E0F2FE
      { t: 0.75, r: 236, g: 72,  b: 153 }, // #EC4899
      { t: 1.00, r: 157, g: 23,  b: 77  }, // #9D174D
    ];
    return interpolateColorStops(stops, norm);
  } else if (p === 'current') {
    // Surface Ocean Current Speed: 0.0 to 2.0 m/s
    // Midnight #0F172A -> Ocean Blue #0284C7 -> Cyan #06B6D4 -> Gold #EAB308 -> Vivid Crimson #E11D48
    const minV = 0.00, maxV = 2.00;
    const norm = Math.max(0, Math.min(1, (val - minV) / (maxV - minV)));
    const stops = [
      { t: 0.00, r: 15,  g: 23,  b: 42  }, // #0F172A
      { t: 0.25, r: 2,   g: 132, b: 199 }, // #0284C7
      { t: 0.50, r: 6,   g: 182, b: 212 }, // #06B6D4
      { t: 0.75, r: 234, g: 179, b: 8   }, // #EAB308
      { t: 1.00, r: 225, g: 29,  b: 72  }, // #E11D48
    ];
    return interpolateColorStops(stops, norm);
  } else if (p === 'wind') {
    // Surface Winds: 0.0 to 15.0 m/s (approx 0 to 54 km/h)
    // Dark Slate #334155 -> Slate #475569 -> Sky Blue #38BDF8 -> Warm Amber #F59E0B -> Flame Orange #EA580C
    const minV = 0.00, maxV = 15.00;
    const norm = Math.max(0, Math.min(1, (val - minV) / (maxV - minV)));
    const stops = [
      { t: 0.00, r: 51,  g: 65,  b: 85  }, // #334155
      { t: 0.25, r: 71,  g: 85,  b: 105 }, // #475569
      { t: 0.50, r: 56,  g: 189, b: 248 }, // #38BDF8
      { t: 0.75, r: 245, g: 158, b: 11  }, // #F59E0B
      { t: 1.00, r: 234, g: 88,  b: 12  }, // #EA580C
    ];
    return interpolateColorStops(stops, norm);
  } else if (p === 'confidence') {
    // Prediction Confidence: 30% to 95%+
    // Red-Orange #DC2626 -> Flame #EA580C -> Warm Amber #F59E0B -> Emerald #10B981 -> Cyan #06B6D4 -> Royal Blue #1D4ED8
    const minV = 30.0, maxV = 95.0;
    const norm = Math.max(0, Math.min(1, (val - minV) / (maxV - minV)));
    const stops = [
      { t: 0.00, r: 220, g: 38,  b: 38  }, // #DC2626
      { t: 0.20, r: 234, g: 88,  b: 12  }, // #EA580C
      { t: 0.40, r: 245, g: 158, b: 11  }, // #F59E0B
      { t: 0.65, r: 16,  g: 185, b: 129 }, // #10B981
      { t: 0.82, r: 6,   g: 182, b: 212 }, // #06B6D4
      { t: 1.00, r: 29,  g: 78,  b: 216 }, // #1D4ED8
    ];
    return interpolateColorStops(stops, norm);
  }
  return tempToColor(val, 0);
}

function generateParamGridCanvas(gridData, param) {
  // Same smooth anti-aliased 5x pipeline as generateRealGridCanvas
  const lats = gridData.lats;
  const lons = gridData.lons;
  const grid = gridData.grid;

  const srcW = lons.length;   // 241
  const srcH = lats.length;   // 101

  // ── Step 1: Pre-process source grid: identify ocean cells and infill coast ─
  const isOceanSrc = new Uint8Array(srcH * srcW);
  const paramSrc   = new Float32Array(srcH * srcW);

  for (let sy = 0; sy < srcH; sy++) {
    const latIdx = (srcH - 1) - sy;
    const row = grid[latIdx];
    const lat = lats[latIdx];
    for (let sx = 0; sx < srcW; sx++) {
      const val = row[sx];
      const idx = sy * srcW + sx;
      const isCoastLand = isLand(lat, lons[sx]);
      // For SST and Confidence, check valid ocean values. For anomalies, check isLand.
      if (!isCoastLand && (param === 'confidence' ? val >= 10 : (param !== 'sst' || val >= 0.5))) {
        isOceanSrc[idx] = 1;
        paramSrc[idx]   = val;
      } else {
        isOceanSrc[idx] = 0;
        paramSrc[idx]   = 0;
      }
    }
  }

  const infilledParam = new Float32Array(paramSrc);
  for (let sy = 0; sy < srcH; sy++) {
    for (let sx = 0; sx < srcW; sx++) {
      const idx = sy * srcW + sx;
      if (isOceanSrc[idx]) continue;
      let sum = 0, count = 0;
      for (let dy = -2; dy <= 2; dy++) {
        const ny = sy + dy;
        if (ny < 0 || ny >= srcH) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const nx = sx + dx;
          if (nx < 0 || nx >= srcW) continue;
          const nidx = ny * srcW + nx;
          if (isOceanSrc[nidx]) {
            const dist = Math.hypot(dx, dy);
            const w = 1 / (dist + 0.1);
            sum += paramSrc[nidx] * w;
            count += w;
          }
        }
      }
      if (count > 0) infilledParam[idx] = sum / count;
    }
  }

  // ── Step 2: High-Resolution Bilinear Upsampling (5x Scale -> 1201 x 501) ──
  const SCALE = 5;
  const dstW = (srcW - 1) * SCALE + 1; // 1201
  const dstH = (srcH - 1) * SCALE + 1; // 501

  const dstParam = new Float32Array(dstH * dstW);
  const dstOcean = new Float32Array(dstH * dstW);

  for (let dy = 0; dy < dstH; dy++) {
    const fy  = dy / SCALE;
    const sy0 = Math.floor(fy);
    const sy1 = Math.min(sy0 + 1, srcH - 1);
    const ty  = fy - sy0;

    for (let dx = 0; dx < dstW; dx++) {
      const fx  = dx / SCALE;
      const sx0 = Math.floor(fx);
      const sx1 = Math.min(sx0 + 1, srcW - 1);
      const tx  = fx - sx0;

      const i00 = sy0 * srcW + sx0;
      const i10 = sy0 * srcW + sx1;
      const i01 = sy1 * srcW + sx0;
      const i11 = sy1 * srcW + sx1;

      const w00 = (1 - tx) * (1 - ty);
      const w10 = tx       * (1 - ty);
      const w01 = (1 - tx) * ty;
      const w11 = tx       * ty;

      const di = dy * dstW + dx;

      dstOcean[di] = isOceanSrc[i00] * w00 + isOceanSrc[i10] * w10 +
                     isOceanSrc[i01] * w01 + isOceanSrc[i11] * w11;

      dstParam[di] = infilledParam[i00] * w00 + infilledParam[i10] * w10 +
                     infilledParam[i01] * w01 + infilledParam[i11] * w11;
    }
  }

  // ── Step 3: Fast Separable Gaussian Smoothing on Parameter Field ──────────
  const SIGMA = 3.2;
  const RADIUS = Math.ceil(SIGMA * 2.5);
  const kernel = new Float32Array(2 * RADIUS + 1);
  let ksum = 0;
  for (let k = -RADIUS; k <= RADIUS; k++) {
    kernel[k + RADIUS] = Math.exp(-(k * k) / (2 * SIGMA * SIGMA));
    ksum += kernel[k + RADIUS];
  }
  for (let k = 0; k < kernel.length; k++) kernel[k] /= ksum;

  const hTemp    = new Float32Array(dstH * dstW);
  const blurParam = new Float32Array(dstH * dstW);

  for (let dy = 0; dy < dstH; dy++) {
    const rowOffset = dy * dstW;
    for (let dx = 0; dx < dstW; dx++) {
      let sum = 0;
      for (let k = -RADIUS; k <= RADIUS; k++) {
        const nx = Math.max(0, Math.min(dstW - 1, dx + k));
        sum += dstParam[rowOffset + nx] * kernel[k + RADIUS];
      }
      hTemp[rowOffset + dx] = sum;
    }
  }

  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      let sum = 0;
      for (let k = -RADIUS; k <= RADIUS; k++) {
        const ny = Math.max(0, Math.min(dstH - 1, dy + k));
        sum += hTemp[ny * dstW + dx] * kernel[k + RADIUS];
      }
      blurParam[dy * dstW + dx] = sum;
    }
  }

  // ── Step 4: Write to Canvas with Anti-Aliased Ocean Masking ───────────────
  const canvas = document.createElement('canvas');
  canvas.width  = dstW;
  canvas.height = dstH;
  const ctx     = canvas.getContext('2d');
  const imgData = ctx.createImageData(dstW, dstH);
  const imgArr  = imgData.data;

  const MAX_ALPHA = 245;

  for (let i = 0, pi = 0; i < dstH * dstW; i++, pi += 4) {
    const w = dstOcean[i];
    if (w <= 0.05) {
      imgArr[pi]     = 0;
      imgArr[pi + 1] = 0;
      imgArr[pi + 2] = 0;
      imgArr[pi + 3] = 0;
    } else {
      let alpha = MAX_ALPHA;
      if (w < 0.20) {
        const t = (w - 0.05) / 0.15;
        alpha = Math.round(MAX_ALPHA * (t * t * (3 - 2 * t)));
      }
      const { r, g, b } = paramToColor(param, blurParam[i]);
      imgArr[pi]     = r;
      imgArr[pi + 1] = g;
      imgArr[pi + 2] = b;
      imgArr[pi + 3] = alpha;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // ── Step 5: Magnitude Backdrop ───────────────────────────────────────────
  // Note: Directional vector flow is rendered dynamically as animated streamlines
  // on the dedicated #ky-vector-canvas overlay via ParticleFlowEngine.

  applyLandMaskToCanvas(canvas);
  currentActiveCanvas = canvas;
  return canvas.toDataURL();
}

function drawVectorGlyphs(ctx, gridData, param, dstW, dstH, scale, isOceanSrc) {
  // Retained for testing / fallback static drawing if invoked
  const lats = gridData.lats;
  const lons = gridData.lons;
  const uGrid = gridData.u;
  const vGrid = gridData.v;
  const srcW = lons.length;
  const srcH = lats.length;

  const stepX = 5;
  const stepY = 4;

  for (let sy = 2; sy < srcH - 1; sy += stepY) {
    const latIdx = (srcH - 1) - sy;
    const uRow = uGrid[latIdx];
    const vRow = vGrid[latIdx];
    if (!uRow || !vRow) continue;

    for (let sx = 2; sx < srcW - 1; sx += stepX) {
      const idx = sy * srcW + sx;
      if (!isOceanSrc[idx]) continue;

      const lat = lats[latIdx];
      const lon = lons[sx];
      if (isLand(lat, lon)) continue;

      const u = uRow[sx];
      const v = vRow[sx];
      const speed = Math.hypot(u, v);
      if (speed < 0.04) continue;

      const cx = sx * scale;
      const cy = sy * scale;
      const angle = Math.atan2(-v, u);

      const len = Math.max(9, Math.min(24, 8 + (speed / 2.0) * 12));
      const headLen = Math.min(6.5, len * 0.42);
      const headW = 3.0;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);

      ctx.strokeStyle = 'rgba(15, 23, 42, 0.70)';
      ctx.lineWidth = 3.0;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.lineTo(len / 2, 0);
      ctx.stroke();

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.lineTo(len / 2, 0);
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(len / 2, 0);
      ctx.lineTo(len / 2 - headLen, -headW);
      ctx.lineTo(len / 2 - headLen * 0.7, 0);
      ctx.lineTo(len / 2 - headLen, headW);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }
}

/* ── High-Performance Windy / Nullschool-Style Particle Advection Engine ── */

const ParticleFlowEngine = {
  canvas: null,
  ctx: null,
  particles: [],
  maxParticles: 1200,
  param: null,
  gridData: null,
  uGrid: null,
  vGrid: null,
  lats: null,
  lons: null,
  animId: null,
  isRunning: false,
  cssWidth: 0,
  cssHeight: 0,

  init() {
    if (typeof document === 'undefined') return;
    if (this.canvas && this.ctx) return;
    this.canvas = document.getElementById('ky-vector-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    const handleResize = () => {
      if (!this.canvas || !this.ctx) return;
      const wrap = this.canvas.parentElement;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = Math.round(rect.width * dpr);
      this.canvas.height = Math.round(rect.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.cssWidth = rect.width;
      this.cssHeight = rect.height;
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    if (typeof map !== 'undefined' && map) {
      map.on('resize', handleResize);
      map.on('movestart', () => {
        if (this.isRunning && this.ctx) {
          this.ctx.clearRect(0, 0, this.cssWidth || this.canvas.width, this.cssHeight || this.canvas.height);
        }
      });
      map.on('zoomstart', () => {
        if (this.isRunning && this.ctx) {
          this.ctx.clearRect(0, 0, this.cssWidth || this.canvas.width, this.cssHeight || this.canvas.height);
        }
      });
    }
  },

  getVelocity(lon, lat) {
    if (!this.uGrid || !this.vGrid) return null;
    if (lon < 45.0 || lon > 105.0 || lat < 5.0 || lat > 30.0) return null;

    const gx = (lon - 45.0) / 0.25;
    const gy = (lat - 5.0) / 0.25;

    const x0 = Math.floor(gx);
    const x1 = Math.min(x0 + 1, 240);
    const y0 = Math.floor(gy);
    const y1 = Math.min(y0 + 1, 100);

    const tx = gx - x0;
    const ty = gy - y0;

    const uRow0 = this.uGrid[y0];
    const uRow1 = this.uGrid[y1];
    const vRow0 = this.vGrid[y0];
    const vRow1 = this.vGrid[y1];

    if (!uRow0 || !uRow1 || !vRow0 || !vRow1) return null;

    const u00 = uRow0[x0], u10 = uRow0[x1];
    const u01 = uRow1[x0], u11 = uRow1[x1];
    const v00 = vRow0[x0], v10 = vRow0[x1];
    const v01 = vRow1[x0], v11 = vRow1[x1];

    const w00 = (1 - tx) * (1 - ty);
    const w10 = tx * (1 - ty);
    const w01 = (1 - tx) * ty;
    const w11 = tx * ty;

    const u = w00 * u00 + w10 * u10 + w01 * u01 + w11 * u11;
    const v = w00 * v00 + w10 * v10 + w01 * v01 + w11 * v11;
    const speed = Math.hypot(u, v);
    return { u, v, speed };
  },

  spawnParticle(p = {}) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const lon = 45.5 + Math.random() * 59.0;
      const lat = 5.5 + Math.random() * 24.0;
      if (!isLand(lat, lon)) {
        const vel = this.getVelocity(lon, lat);
        if (vel && vel.speed > 0.03) {
          p.lon = lon;
          p.lat = lat;
          p.age = Math.floor(Math.random() * 45);
          p.maxAge = 40 + Math.floor(Math.random() * 50);
          p.speed = vel.speed;
          return p;
        }
      }
    }
    p.lon = 65.0 + (Math.random() - 0.5) * 8.0;
    p.lat = 14.0 + (Math.random() - 0.5) * 6.0;
    p.age = 0;
    p.maxAge = 50;
    p.speed = 0.2;
    return p;
  },

  start(gridData, param) {
    this.init();
    if (!this.canvas || !this.ctx) return;
    if (!gridData || !gridData.u || !gridData.v) return;

    // Refresh dimensions
    if (this.canvas.parentElement) {
      const rect = this.canvas.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = Math.round(rect.width * dpr);
      this.canvas.height = Math.round(rect.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.cssWidth = rect.width;
      this.cssHeight = rect.height;
    }

    this.gridData = gridData;
    this.uGrid = gridData.u;
    this.vGrid = gridData.v;
    this.lats = gridData.lats;
    this.lons = gridData.lons;
    this.param = param;
    this.isRunning = true;

    if (this.particles.length === 0) {
      for (let i = 0; i < this.maxParticles; i++) {
        this.particles.push(this.spawnParticle({}));
      }
    } else {
      for (let i = 0; i < this.particles.length; i++) {
        this.spawnParticle(this.particles[i]);
      }
    }

    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }

    const self = this;
    function loop(timestamp) {
      if (!self.isRunning) return;
      self.renderFrame(timestamp);
      self.animId = requestAnimationFrame(loop);
    }
    this.animId = requestAnimationFrame(loop);
  },

  stop() {
    this.isRunning = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.cssWidth || this.canvas.width, this.cssHeight || this.canvas.height);
    }
  },

  renderFrame(timestamp) {
    if (!this.ctx || !this.canvas) return;
    if (typeof map === 'undefined' || !map || typeof map.project !== 'function') return;

    const w = this.cssWidth || (this.canvas.width / (window.devicePixelRatio || 1));
    const h = this.cssHeight || (this.canvas.height / (window.devicePixelRatio || 1));

    // 1. Trail decay: smooth 8.5% alpha decay per frame creates seamless fading particle trails
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'destination-out';
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.085)';
    this.ctx.fillRect(0, 0, w, h);
    this.ctx.restore();

    // 2. Draw particle streamlines
    const isCurrent = (this.param === 'current');
    this.ctx.lineWidth = isCurrent ? 1.7 : 1.4;
    this.ctx.lineCap = 'round';

    const dtMult = isCurrent ? 0.14 : 0.032;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.age++;

      if (p.age > p.maxAge) {
        this.spawnParticle(p);
        continue;
      }

      const vel = this.getVelocity(p.lon, p.lat);
      if (!vel || vel.speed < 0.02 || isLand(p.lat, p.lon)) {
        this.spawnParticle(p);
        continue;
      }

      p.speed = vel.speed;

      const pt0 = map.project([p.lon, p.lat]);

      const cosLat = Math.max(0.2, Math.cos(p.lat * Math.PI / 180));
      const dLon = (vel.u * dtMult) / cosLat;
      const dLat = (vel.v * dtMult);

      const nextLon = p.lon + dLon;
      const nextLat = p.lat + dLat;

      if (nextLon < 45.0 || nextLon > 105.0 || nextLat < 5.0 || nextLat > 30.0 || isLand(nextLat, nextLon)) {
        this.spawnParticle(p);
        continue;
      }

      p.lon = nextLon;
      p.lat = nextLat;

      const pt1 = map.project([nextLon, nextLat]);

      if (pt0.x < -30 || pt0.x > w + 30 || pt0.y < -30 || pt0.y > h + 30) {
        if (p.age > p.maxAge * 0.4) this.spawnParticle(p);
        continue;
      }

      const { r, g, b } = paramToColor(this.param, p.speed);

      this.ctx.beginPath();
      this.ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
      this.ctx.moveTo(pt0.x, pt0.y);
      this.ctx.lineTo(pt1.x, pt1.y);
      this.ctx.stroke();
    }
  }
};

if (typeof window !== 'undefined') {
  window.ParticleFlowEngine = ParticleFlowEngine;
}

function generateFallbackParamCanvas(param) {
  // Generate high-resolution 101x241 grid slice with spatial variation & vectors
  const lats = [];
  const lons = [];
  for (let i = 0; i <= 100; i++) lats.push(5.0 + i * 0.25);
  for (let j = 0; j <= 240; j++) lons.push(45.0 + j * 0.25);

  const grid = [];
  const uArr = (param === 'current' || param === 'wind') ? [] : null;
  const vArr = (param === 'current' || param === 'wind') ? [] : null;

  for (let i = 0; i < lats.length; i++) {
    const lat = lats[i];
    const row = [];
    const uRow = uArr ? [] : null;
    const vRow = vArr ? [] : null;
    const latNorm = (lat - 5.0) / 25.0; // 0 to 1

    for (let j = 0; j < lons.length; j++) {
      const lon = lons[j];
      const lonNorm = (lon - 45.0) / 60.0; // 0 to 1

      if (isLand(lat, lon)) {
        row.push(0.0);
        if (uRow) { uRow.push(0.0); vRow.push(0.0); }
        continue;
      }

      if (param === 'sst') {
        const val = 29.5 - latNorm * 3.2 + Math.sin(lonNorm * Math.PI) * 0.8;
        row.push(parseFloat(val.toFixed(2)));
      } else if (param === 'ssh') {
        // Physical west-to-east dynamic topography slope (0.35m in west to 0.85m in east) + eddies
        const eddy = Math.sin(lat * 0.8) * Math.cos(lon * 0.6) * 0.08;
        const val = 0.38 + lonNorm * 0.45 + eddy;
        row.push(parseFloat(val.toFixed(3)));
      } else if (param === 'sss') {
        // High in Arabian Sea (36.2), lower in BoB (32.8)
        const val = 36.2 - lonNorm * 3.4 + Math.sin(lat * 0.4) * 0.4;
        row.push(parseFloat(val.toFixed(2)));
      } else if (param === 'sla') {
        // Mesoscale eddy dipole swirls (-0.12m to +0.12m)
        const val = Math.sin(lat * 0.6 + 1.2) * Math.cos(lon * 0.5 - 0.8) * 0.11 +
                    Math.sin(lat * 1.4) * Math.sin(lon * 1.2) * 0.04;
        row.push(parseFloat(val.toFixed(3)));
      } else if (param === 'current') {
        // Somali Current (strong NE flow along western boundary) + equatorial flow
        const isSomaliCoast = (lon < 60 && lat < 18);
        const u = isSomaliCoast ? 0.45 : 0.14 * Math.cos(lat * 0.3);
        const v = isSomaliCoast ? 0.62 : -0.09 * Math.sin(lon * 0.3);
        const spd = Math.hypot(u, v);
        row.push(parseFloat(spd.toFixed(2)));
        uRow.push(parseFloat(u.toFixed(2)));
        vRow.push(parseFloat(v.toFixed(2)));
      } else if (param === 'wind') {
        // Southwest Monsoon flow: strong SW -> NE winds across Arabian Sea
        const u = 2.4 + Math.sin(latNorm * Math.PI) * 2.6 + Math.cos(lonNorm * Math.PI) * 0.8;
        const v = 1.8 + Math.sin(lonNorm * Math.PI) * 1.8;
        const spd = Math.hypot(u, v);
        row.push(parseFloat(spd.toFixed(1)));
        uRow.push(parseFloat(u.toFixed(1)));
        vRow.push(parseFloat(v.toFixed(1)));
      } else if (param === 'confidence') {
        // Fallback confidence: ranges from 45% (remote) to 75% (central basin)
        const val = 45.0 + Math.sin(latNorm * Math.PI) * Math.sin(lonNorm * Math.PI) * 30.0;
        row.push(parseFloat(val.toFixed(1)));
      }
    }
    grid.push(row);
    if (uArr) { uArr.push(uRow); vArr.push(vRow); }
  }

  const fallbackGridData = { lats, lons, grid };
  if (uArr) { fallbackGridData.u = uArr; fallbackGridData.v = vArr; }

  return generateParamGridCanvas(fallbackGridData, param);
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
    legendBar.style.background = ZOOM_EARTH_GRADIENT_CSS;
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
    if (typeof ParticleFlowEngine !== 'undefined' && ParticleFlowEngine.stop) {
      ParticleFlowEngine.stop();
    }
    // Hide heatmap overlay completely — display only plain satellite/terrain base map
    if (map.getLayer('sst-heatmap-layer')) {
      map.setLayoutProperty('sst-heatmap-layer', 'visibility', 'none');
    }
    updateArgoFloatLayerVisibility(false);
    const legendCaption = document.getElementById('map-legend-caption');
    if (legendCaption) {
      legendCaption.style.display = 'none';
      legendCaption.innerHTML = '';
    }
    return;
  }

  // Gating requirements satisfied: make layer visible
  if (map.getLayer('sst-heatmap-layer')) {
    map.setLayoutProperty('sst-heatmap-layer', 'visibility', 'visible');
  }

  if (currentHeatmapController) {
    currentHeatmapController.abort();
    currentHeatmapController = null;
  }
  if (currentHeatmapTimeoutId) {
    clearTimeout(currentHeatmapTimeoutId);
    currentHeatmapTimeoutId = null;
  }

  const dayIdx = parseInt(dateSlider.value, 10);
  const dateStr = dateToISO(dayIndexToDate(dayIdx));
  const reqId = ++currentHeatmapRequestId;
  const heatmapController = typeof AbortController !== 'undefined' ? new AbortController() : null;
  currentHeatmapController = heatmapController;
  const heatmapTimeoutId = heatmapController ? setTimeout(() => heatmapController.abort(), API_REQUEST_TIMEOUT_MS) : null;
  currentHeatmapTimeoutId = heatmapTimeoutId;

  if (selectedParam) {
    // Render 2D Surface Ocean Parameter or Confidence Grid
    const cfg = PARAM_CONFIG[selectedParam] || PARAM_CONFIG.sst;
    const legendTitle   = document.getElementById('map-legend-title');
    const legendBar     = document.getElementById('map-legend-bar');
    const legendTicks   = document.getElementById('map-legend-ticks');
    const legendCaption = document.getElementById('map-legend-caption');

    if (legendTitle) legendTitle.textContent = cfg.title;
    if (legendBar)   legendBar.style.background = cfg.bar;
    if (legendTicks) legendTicks.innerHTML = cfg.ticks.map(t => `<span>${t}</span>`).join('');
    if (legendCaption) {
      if (cfg.caption) {
        legendCaption.style.display = 'block';
        legendCaption.innerHTML = `
          ${cfg.provenance ? `<span class="ky-map-legend__caption-tag">${cfg.provenance}</span><br/>` : ''}
          <span>${cfg.caption}</span>
        `;
      } else {
        legendCaption.style.display = 'none';
        legendCaption.innerHTML = '';
      }
    }

    const isConfidence = (selectedParam === 'confidence');
    const endpoint = isConfidence
      ? `${API_BASE}/confidence-grid?date=${dateStr}&depth=0`
      : `${API_BASE}/parameter-grid?param=${selectedParam}&date=${dateStr}`;

    const startParamTime = Date.now();
    console.log(`[OceanEmbed API] GET ${isConfidence ? '/confidence-grid' : '/parameter-grid'} started for param=${selectedParam}&date=${dateStr}`);

    fetch(endpoint, {
      signal: heatmapController ? heatmapController.signal : undefined
    })
      .then(res => {
        if (heatmapTimeoutId) clearTimeout(heatmapTimeoutId);
        if (!res.ok) throw new Error(`Param Grid API HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (heatmapTimeoutId) clearTimeout(heatmapTimeoutId);
        if (reqId !== currentHeatmapRequestId) return;
        const elapsed = Date.now() - startParamTime;
        console.log(`[OceanEmbed API] GET ${isConfidence ? '/confidence-grid' : '/parameter-grid'} succeeded in ${elapsed}ms (${(elapsed / 1000).toFixed(2)}s)`);
        currentGridData = data;
        const url = generateParamGridCanvas(data, selectedParam);
        updateHeatmapOverlay(url);
        if (selectedParam === 'current' || selectedParam === 'wind') {
          ParticleFlowEngine.start(data, selectedParam);
        } else {
          ParticleFlowEngine.stop();
        }
        updateArgoFloatLayerVisibility(selectedParam === 'confidence');
        validateLayerMarkerSync();
      })
      .catch(err => {
        if (heatmapTimeoutId) clearTimeout(heatmapTimeoutId);
        if (reqId !== currentHeatmapRequestId) return;
        const elapsed = Date.now() - startParamTime;
        console.error(`[OceanEmbed API] GET ${isConfidence ? '/confidence-grid' : '/parameter-grid'} failed after ${elapsed}ms (${(elapsed / 1000).toFixed(2)}s):`, err.message || err);
        if (isDevModeEnabled()) {
          console.warn('Real parameter grid backend unavailable, falling back:', err);
        }
        const fallbackUrl = generateFallbackParamCanvas(selectedParam);
        updateHeatmapOverlay(fallbackUrl);
        if (selectedParam === 'current' || selectedParam === 'wind') {
          ParticleFlowEngine.start(currentGridData, selectedParam);
        } else {
          ParticleFlowEngine.stop();
        }
        updateArgoFloatLayerVisibility(selectedParam === 'confidence');
        validateLayerMarkerSync();
      });
  } else {
    // Render Subsurface Ocean Temperature at selectedDepth
    ParticleFlowEngine.stop();
    updateArgoFloatLayerVisibility(false);
    const legendCaption = document.getElementById('map-legend-caption');
    if (legendCaption) {
      legendCaption.style.display = 'none';
      legendCaption.innerHTML = '';
    }

    const depth = selectedDepth !== null ? selectedDepth : 0;
    updateHeatmapLegend(depth);

    const startTempTime = Date.now();
    console.log(`[OceanEmbed API] GET /temperature-grid started for date=${dateStr}&depth=${depth}`);

    fetch(`${API_BASE}/temperature-grid?date=${dateStr}&depth=${depth}`, {
      signal: heatmapController ? heatmapController.signal : undefined
    })
      .then(res => {
        if (heatmapTimeoutId) clearTimeout(heatmapTimeoutId);
        if (!res.ok) throw new Error(`Grid API HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (heatmapTimeoutId) clearTimeout(heatmapTimeoutId);
        if (reqId !== currentHeatmapRequestId) return;
        const elapsed = Date.now() - startTempTime;
        console.log(`[OceanEmbed API] GET /temperature-grid succeeded in ${elapsed}ms (${(elapsed / 1000).toFixed(2)}s)`);
        currentGridData = data;
        const url = generateRealGridCanvas(data, depth);
        updateHeatmapOverlay(url);
        validateLayerMarkerSync();
      })
      .catch(err => {
        if (heatmapTimeoutId) clearTimeout(heatmapTimeoutId);
        if (reqId !== currentHeatmapRequestId) return;
        const elapsed = Date.now() - startTempTime;
        console.error(`[OceanEmbed API] GET /temperature-grid failed after ${elapsed}ms (${(elapsed / 1000).toFixed(2)}s):`, err.message || err);
        if (isDevModeEnabled()) {
          console.warn('Real temperature grid backend unavailable, falling back to ocean model calculations:', err);
        }
        const fallbackUrl = generateFallbackCanvas(dateStr, depth);
        updateHeatmapOverlay(fallbackUrl);
        validateLayerMarkerSync();
      });
  }
}

/* ── ARGO Float Marker Map Layer (for Confidence view) ───── */

function initArgoFloatsLayer() {
  if (!map || map.getSource('argo-floats-source')) return;

  map.addSource('argo-floats-source', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  });

  map.addLayer({
    id: 'argo-floats-glow',
    type: 'circle',
    source: 'argo-floats-source',
    layout: { visibility: 'none' },
    paint: {
      'circle-radius': 8,
      'circle-color': '#2563EB',
      'circle-opacity': 0.35,
    }
  });

  map.addLayer({
    id: 'argo-floats-layer',
    type: 'circle',
    source: 'argo-floats-source',
    layout: { visibility: 'none' },
    paint: {
      'circle-radius': 4.5,
      'circle-color': '#FFFFFF',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#1D4ED8',
    }
  });

  // Fetch 41 cached ARGO profiles and populate GeoJSON source
  fetch(`${API_BASE}/argo/profiles`)
    .then(res => res.ok ? res.json() : null)
    .then(data => {
      if (!data) return;
      const profiles = Array.isArray(data) ? data : (data.profiles || []);
      const features = profiles.map(p => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [p.longitude, p.latitude]
        },
        properties: {
          id: p.id,
          wmo: p.wmoFloatId || p.id,
          date: p.date,
        }
      }));
      const src = map.getSource('argo-floats-source');
      if (src) {
        src.setData({ type: 'FeatureCollection', features });
      }
    })
    .catch(err => {
      console.warn('[OceanEmbed] Could not load ARGO profiles for map layer:', err);
    });
}

function updateArgoFloatLayerVisibility(visible) {
  if (!map || !map.isStyleLoaded()) return;
  const vis = visible ? 'visible' : 'none';
  if (map.getLayer('argo-floats-glow')) {
    map.setLayoutProperty('argo-floats-glow', 'visibility', vis);
  }
  if (map.getLayer('argo-floats-layer')) {
    map.setLayoutProperty('argo-floats-layer', 'visibility', vis);
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
      'raster-opacity': 0.85,
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

  geoLabelMarkers = [];
  geoLabels.forEach(lbl => {
    const el = document.createElement('div');
    el.className = `map-geo-label ${lbl.cls || ''}`;
    el.textContent = lbl.text;
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(lbl.coords)
      .addTo(map);
    marker.getElement().classList.add('geo-label-marker');
    geoLabelMarkers.push({ marker, coords: lbl.coords, text: lbl.text });
  });

  initArgoFloatsLayer();

  map.resize();
  checkAndRefreshHeatmap();
});


// Extra resize guard: fire once the full page has loaded to handle any
// layout shifts caused by fonts / flex sizing.
window.addEventListener('load', () => {
  if (map) map.resize();
});

/* ── Dynamic Geo-Label Collision Avoidance ────────────────── */

function updateGeoLabelCollisions(selectedLat, selectedLon) {
  const COLLISION_RADIUS_DEG = 1.8; // ~200 km threshold for collision avoidance
  geoLabelMarkers.forEach(item => {
    const el = item.marker ? item.marker.getElement() : null;
    if (!el) return;
    if (selectedLat === null || selectedLon === null) {
      el.style.opacity = '1.0';
      return;
    }
    const [labelLon, labelLat] = item.coords;
    const dLat = labelLat - selectedLat;
    const dLon = labelLon - selectedLon;
    const dist = Math.sqrt(dLat * dLat + dLon * dLon);
    if (dist < COLLISION_RADIUS_DEG) {
      el.style.opacity = '0.15';
    } else {
      el.style.opacity = '1.0';
    }
  });
}

/* ── Custom coral marker DOM element ─────────────────────── */

/* ── Custom marker DOM element (Teardrop blue pin matching reference design) ── */

function formatCoordinates(lat, lon) {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${latDir}, ${Math.abs(lon).toFixed(2)}°${lonDir}`;
}

function createMarkerElement(lat, lon) {
  const wrapper = document.createElement('div');
  wrapper.className = 'custom-marker-wrapper';

  const coordLabel = document.createElement('div');
  coordLabel.className = 'custom-marker__coord';
  coordLabel.textContent = formatCoordinates(lat, lon);

  const pin = document.createElement('div');
  pin.className = 'custom-marker__pin';
  pin.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40" fill="none">
      <path d="M15 0C6.71573 0 0 6.71573 0 15C0 26.25 15 40 15 40C15 40 30 26.25 30 15C30 6.71573 23.2843 0 15 0Z" fill="#1D4ED8" stroke="#FFFFFF" stroke-width="2.5"/>
      <circle cx="15" cy="14" r="5" fill="#FFFFFF"/>
    </svg>`;

  wrapper.appendChild(coordLabel);
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
  // Guard: must be within study bounds (5°N–30°N, 45°E–105°E)
  if (lat < BOUNDS.south || lat > BOUNDS.north ||
      lon < BOUNDS.west  || lon > BOUNDS.east) {
    showRegionNotice('This location is outside our supported region (North Indian Ocean: 5°N–30°N, 45°E–105°E)', 'error');
    return false;
  }

  // Guard: reject clicks on land — only ocean locations are valid
  if (isLand(lat, lon)) {
    showRegionNotice('Selected location is on land. Please select an ocean point within the North Indian Ocean.', 'warning');
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

  if (clickMarker.getElement()) {
    clickMarker.getElement().classList.add('selected-location-marker');
  }

  // Dynamic collision avoidance: dim any static geographic labels near the selected coordinate
  updateGeoLabelCollisions(lat, lon);

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

function renderSearchResults(items, isOutOfArea = false) {
  searchResults.innerHTML = '';
  if (!items || items.length === 0) {
    searchResults.innerHTML = `<div class="map-search__empty">${
      isOutOfArea
        ? 'This location is outside our supported region (North Indian Ocean: 5°N–30°N, 45°E–105°E)'
        : 'No locations found within study area (5°–30°N, 45°–105°E)'
    }</div>`;
    searchResults.style.display = 'block';
    return;
  }

  items.forEach(item => {
    const row = document.createElement('div');
    const outClass = item.outOfBounds ? 'map-search__item--out-of-bounds' : '';
    const landClass = item.isLand ? 'map-search__item--land' : '';
    row.className = `map-search__item ${outClass} ${landClass}`.trim();

    if (item.outOfBounds) {
      row.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:2px;">
          <span class="map-search__item-name" style="color:#EF4444;">Outside supported region</span>
          <span style="font-size:11px; color:#94A3B8;">North Indian Ocean (5°N–30°N, 45°E–105°E) only</span>
        </div>
        <span class="map-search__item-coord" style="color:#EF4444;">${item.lat.toFixed(2)}°N, ${item.lon.toFixed(2)}°E</span>
      `;
      row.addEventListener('click', () => {
        showRegionNotice('This location is outside our supported region (North Indian Ocean: 5°N–30°N, 45°E–105°E)', 'error');
        searchResults.style.display = 'none';
      });
    } else if (item.isLand) {
      row.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:2px;">
          <span class="map-search__item-name" style="color:#F59E0B;">Land Coordinate</span>
          <span style="font-size:11px; color:#94A3B8;">Please select an ocean point</span>
        </div>
        <span class="map-search__item-coord" style="color:#F59E0B;">${item.lat.toFixed(2)}°N, ${item.lon.toFixed(2)}°E</span>
      `;
      row.addEventListener('click', () => {
        showRegionNotice('Selected location is on land. Please select an ocean point within the North Indian Ocean.', 'warning');
        searchResults.style.display = 'none';
      });
    } else {
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
    }
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
  let isOutOfArea = false;

  // Check if it's direct coordinates
  const parsed = parseCoordinates(query);
  if (parsed) {
    const valid = parsed.lat >= BOUNDS.south && parsed.lat <= BOUNDS.north &&
                  parsed.lon >= BOUNDS.west  && parsed.lon <= BOUNDS.east;
    if (valid) {
      if (isLand(parsed.lat, parsed.lon)) {
        results.push({
          name: 'Land Coordinate',
          lat: parsed.lat,
          lon: parsed.lon,
          isLand: true,
        });
      } else {
        results.push({
          name: 'Coordinates Point',
          lat: parsed.lat,
          lon: parsed.lon,
        });
      }
    } else {
      isOutOfArea = true;
      results.push({
        name: 'Outside supported region',
        lat: parsed.lat,
        lon: parsed.lon,
        outOfBounds: true,
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

  renderSearchResults(results, isOutOfArea);
}

searchInput.addEventListener('input', handleSearch);

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const query = searchInput.value.trim();
    const parsed = parseCoordinates(query);
    if (parsed) {
      if (parsed.lat < BOUNDS.south || parsed.lat > BOUNDS.north ||
          parsed.lon < BOUNDS.west  || parsed.lon > BOUNDS.east) {
        showRegionNotice('This location is outside our supported region (North Indian Ocean: 5°N–30°N, 45°E–105°E)', 'error');
        searchResults.style.display = 'none';
        return;
      }
      if (selectPoint(parsed.lat, parsed.lon)) {
        searchResults.style.display = 'none';
        return;
      }
    }
    const firstValid = searchResults.querySelector('.map-search__item:not(.map-search__item--out-of-bounds):not(.map-search__item--land)');
    if (firstValid) {
      firstValid.click();
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
    if (el) el.textContent = unit ? `${val} ${unit}` : `${val}`;
  }

  if (inputs.sst) setVal('param-sst-val', inputs.sst.val, '°C');
  if (inputs.ssh) {
    const v = typeof inputs.ssh.val === 'number' ? inputs.ssh.val.toFixed(2) : inputs.ssh.val;
    setVal('param-ssh-val', v, 'm');
  }
  if (inputs.sss) setVal('param-sss-val', inputs.sss.val, 'PSU');
  if (inputs.sla) {
    const slaM = typeof inputs.sla.val === 'number' ? inputs.sla.val : parseFloat(inputs.sla.val);
    const prefix = slaM >= 0 ? '+' : '';
    setVal('param-sla-val', `${prefix}${slaM.toFixed(3)}`, 'm');
  } else if (inputs.ssh) {
    const sshV = typeof inputs.ssh.val === 'number' ? inputs.ssh.val : parseFloat(inputs.ssh.val);
    setVal('param-sla-val', `${sshV >= 0 ? '+' : ''}${sshV.toFixed(2)}`, 'm');
  }
  if (inputs.current) {
    const curVal = typeof inputs.current.val === 'number' ? `${inputs.current.val.toFixed(2)} m/s` : `${inputs.current.val} m/s`;
    const curDir = inputs.current.dir !== undefined ? ` (${inputs.current.dir}°)` : '';
    setVal('param-current-val', `${curVal}${curDir}`, '');
  }
  if (inputs.wind) {
    const windSpeed = typeof inputs.wind.val === 'number' ? `${inputs.wind.val.toFixed(1)} m/s` : (typeof inputs.wind.val === 'string' && inputs.wind.val.includes(',') ? inputs.wind.val : `${inputs.wind.val} m/s`);
    const windDir = inputs.wind.dir !== undefined ? ` (${inputs.wind.dir}°)` : '';
    setVal('param-wind-val', `${windSpeed}${windDir}`, '');
    const el = document.getElementById('param-wind-val');
    if (el) {
      const speedNum = typeof inputs.wind.val === 'number' ? inputs.wind.val : parseFloat(inputs.wind.val);
      const kmh = inputs.wind.kmh !== undefined ? inputs.wind.kmh : (!isNaN(speedNum) ? Math.round(speedNum * 3.6) : null);
      if (kmh !== null) {
        el.title = `${kmh} km/h`;
      }
    }
  }
  if (inputs.confidence !== undefined) {
    const confVal = typeof inputs.confidence === 'object' ? inputs.confidence.val : inputs.confidence;
    setVal('param-confidence-val', confVal, '%');
  }
}

/* ── Stat Cards In-Flight Loading State ──────────────────── */

function setStatsLoading(isLoading) {
  const statIds = ['stat-mld-val', 'stat-ohc-val', 'stat-svad-val', 'stat-d20-val'];
  statIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (isLoading) {
      el.classList.add('ky-stat-card__val--loading');
      el.textContent = '···';
    } else {
      el.classList.remove('ky-stat-card__val--loading');
    }
  });

  if (isLoading) {
    const svadSubEl = document.getElementById('stat-svad-sub');
    if (svadSubEl) svadSubEl.style.display = 'none';
    ['mld', 'ohc', 'svad', 'd20'].forEach(key => {
      const conf = document.getElementById(`stat-${key}-confidence`);
      if (conf) {
        conf.textContent = '';
        conf.style.display = 'none';
      }
    });
  }
}

function clearSurfaceInputs() {
  ['param-sst-val', 'param-ssh-val', 'param-sss-val', 'param-sla-val', 'param-current-val', 'param-wind-val', 'param-confidence-val'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '—';
  });
}

/* ── D20 Isotherm Depth Calculation (Linear Interpolation) ── */

function computeD20Isotherm(depths, temps) {
  if (!temps || !depths || temps.length === 0) return null;
  if (temps[0] <= 20.0) return depths[0];
  for (let i = 1; i < depths.length; i++) {
    if (temps[i] <= 20.0) {
      const d0 = depths[i - 1];
      const d1 = depths[i];
      const t0 = temps[i - 1];
      const t1 = temps[i];
      const frac = (t0 - 20.0) / (t0 - t1 || 1);
      return Math.round(d0 + frac * (d1 - d0));
    }
  }
  return null;
}
if (typeof window !== 'undefined') {
  window.computeD20Isotherm = computeD20Isotherm;
}

/* ── Mixed Layer Depth Calculation (de Boyer Montégut 2004, 10m Reference Depth) ── */

function computeMLD(depths, temps) {
  if (!temps || !depths || temps.length <= 2) return null;
  // de Boyer Montégut (2004) criterion: depth where temperature first drops 0.2°C below 10m reference depth T(10m)
  // using linear interpolation between the two bracketing depth levels.
  // Using 10m reference depth avoids diurnal skin warming / satellite radiometry substitution artifacts in 0–5m layer
  // while preserving the 0m table display.
  const idx10 = depths.indexOf(10) !== -1 ? depths.indexOf(10) : 2;
  const tRef = temps[idx10];
  const targetT = tRef - 0.2;
  for (let i = idx10 + 1; i < depths.length; i++) {
    if (temps[i] <= targetT) {
      const d0 = depths[i - 1];
      const d1 = depths[i];
      const t0 = temps[i - 1];
      const t1 = temps[i];
      const frac = (t0 - targetT) / (t0 - t1 || 1);
      return Math.round(d0 + frac * (d1 - d0));
    }
  }
  return null;
}
if (typeof window !== 'undefined') {
  window.computeMLD = computeMLD;
}

/* ── Update Stat Cards from cast result ──────────────────── */

function updateStatCards(prediction) {
  const { temps, depths: pDepths, surfaceInputs, validation, metrics_confidence, nearest_argo } = prediction;
  const depths = pDepths || DEPTHS;

  // 1: Mixed Layer Depth (MLD)
  // de Boyer Montégut (2004) criterion: depth where temperature first drops 0.2°C below 10m reference depth T(10m)
  const mld = computeMLD(depths, temps);

  const mldEl = document.getElementById('stat-mld-val');
  if (mldEl) {
    mldEl.textContent = mld !== null ? `${mld} m` : '—';
    mldEl.title = mld !== null ? `Mixed layer depth computed at ${mld} m (de Boyer Montégut 2004, 10m ref)` : '';
  }

  // 2: Ocean Heat Content – 300m (OHC₃₀₀) in kJ/cm²
  // Absolute OHC integrated over 0–300m: OHC = (rho * cp / 1e7) * sum( avg_T_layer * dz )
  // rho = 1025 kg/m³, cp = 3993 J/(kg·K) across layers with depths <= 300m
  let ohc = null;
  let heatSum = 0;
  if (temps && temps.length > 1) {
    const rho = 1025; // kg/m^3
    const cp = 3993;  // J/(kg·K)

    for (let i = 1; i < depths.length && depths[i] <= 300; i++) {
      const dz = depths[i] - depths[i - 1];
      const avgT = (temps[i - 1] + temps[i]) / 2.0;
      heatSum += avgT * dz;
    }

    ohc = parseFloat(((rho * cp / 1e7) * heatSum).toFixed(1));
  }

  // Developer mode raw log BEFORE formatting/display
  if (typeof isDevModeEnabled === 'function' && isDevModeEnabled()) {
    console.log('[OHC-300m Raw] Value:', ohc, 'kJ/cm² (heatSum:', heatSum.toFixed(2), ')');
  }

  const ohcEl = document.getElementById('stat-ohc-val');
  if (ohcEl) {
    ohcEl.textContent = ohc !== null ? `${ohc.toFixed(1)} kJ/cm²` : '—';
    ohcEl.title = ohc !== null ? `Ocean heat content in upper 300m: ${ohc.toFixed(1)} kJ/cm²` : '';
  }

  // 3: Sound Velocity / Acoustic Shadow Depth (SVAD)
  // Mackenzie (1981) formula:
  // c(T,S,z) = 1448.96 + 4.591*T - 5.304e-2*T^2 + 2.374e-4*T^3 + 1.340*(S-35) + 1.630e-2*z
  // Sonic Layer Depth (SLD): depth of maximum sound speed in the upper water column before decreasing
  let svad = null;
  if (temps && temps.length > 0) {
    let S = 35.0;
    if (surfaceInputs && surfaceInputs.sss) {
      if (typeof surfaceInputs.sss.val === 'number') {
        S = surfaceInputs.sss.val;
      } else if (typeof surfaceInputs.sss.val === 'string') {
        const parsedS = parseFloat(surfaceInputs.sss.val);
        if (!isNaN(parsedS)) S = parsedS;
      }
    }

    const soundSpeeds = depths.map((z, i) => {
      const T = temps[i];
      // Regional climatological halocline approximation for North Indian Ocean (Levitus / WOA / Rao & Sivakumar 2003):
      // S(z) = S_inf + (S_0 - S_inf) * exp(-z / z_h), with S_inf = 35.0 PSU and z_h = 150.0 m
      const Sz = 35.0 + (S - 35.0) * Math.exp(-z / 150.0);
      return 1448.96 + 4.591 * T - 5.304e-2 * (T * T) + 2.374e-4 * (T * T * T) + 1.340 * (Sz - 35.0) + 1.630e-2 * z;
    });

    let maxC = soundSpeeds[0];
    let maxIdx = 0;

    for (let i = 1; i < soundSpeeds.length && depths[i] <= 300; i++) {
      if (soundSpeeds[i] > maxC) {
        maxC = soundSpeeds[i];
        maxIdx = i;
      }
    }
    svad = depths[maxIdx];
  }

  const svadEl = document.getElementById('stat-svad-val');
  const svadSubEl = document.getElementById('stat-svad-sub');
  if (svadEl) {
    svadEl.textContent = svad !== null ? `${svad} m` : '—';
    if (svad === 0) {
      svadEl.title = 'No surface duct — sound speed decreases with depth';
      if (svadSubEl) {
        svadSubEl.textContent = 'No surface duct — sound speed decreases with depth';
        svadSubEl.title = 'No surface duct — sound speed decreases with depth';
        svadSubEl.style.display = 'block';
      }
    } else {
      svadEl.title = svad !== null ? `Sonic Layer Depth: ${svad} m` : '';
      if (svadSubEl) {
        svadSubEl.textContent = '';
        svadSubEl.style.display = 'none';
      }
    }
  }

  // 4: D20 Isotherm Depth
  // Compute depth (in meters) at which temperature first drops to 20°C,
  // linearly interpolating between the depth level just above 20°C and the depth level just below 20°C.
  let d20Isotherm = computeD20Isotherm(depths, temps);

  const d20El = document.getElementById('stat-d20-val');
  if (d20El) {
    if (d20Isotherm !== null) {
      d20El.textContent = `${d20Isotherm} m`;
      d20El.title = `D20 Isotherm Depth: ${d20Isotherm} m`;
    } else if (temps && temps.length > 0) {
      d20El.textContent = 'N/A — 20°C not reached in profile';
      d20El.title = '20°C isotherm not reached in depth range';
    } else {
      d20El.textContent = '—';
      d20El.title = '';
    }
  }

  // ── Render Data-Driven Confidence Indicator on 4 Metric Cards ──
  function renderCardConfidence(cardKey, metricConf) {
    const confEl = document.getElementById(`stat-${cardKey}-confidence`);
    if (!confEl) return;

    if (metricConf && metricConf.confidence_pct !== undefined) {
      const r = typeof metricConf.rmse === 'number' ? metricConf.rmse.toFixed(2) : metricConf.rmse;
      const labelClass = (metricConf.confidence_label || 'Moderate').toLowerCase();
      confEl.innerHTML = `<span class="ky-stat-card__confidence-dot ky-stat-card__confidence-dot--${labelClass}"></span><span>${metricConf.confidence_pct}% confidence</span>`;
      if (nearest_argo && nearest_argo.distance_km !== undefined) {
        confEl.title = `Nearest ARGO validation: ${nearest_argo.distance_km}km, ${nearest_argo.date} (Float #${nearest_argo.float_id}) · Proximity factor: ${nearest_argo.proximity_factor}`;
      } else {
        confEl.title = `Validation RMSE: ±${r}°C (${metricConf.confidence_label || 'Moderate'} confidence)`;
      }
      confEl.style.display = 'inline-flex';
    } else {
      confEl.textContent = '';
      confEl.title = '';
      confEl.style.display = 'none';
    }
  }

  function calcFallbackConfidence(rmse) {
    let pct = 50;
    if (rmse <= 0.5) pct = 90.0 + (0.5 - rmse) * 16.0;
    else if (rmse <= 1.0) pct = 70.0 + (1.0 - rmse) * 40.0;
    else if (rmse <= 1.5) pct = 50.0 + (1.5 - rmse) * 40.0;
    else pct = Math.max(30.0, 50.0 - (rmse - 1.5) * 20.0);
    const pInt = Math.round(pct);
    const lbl = pInt >= 85 ? 'High' : (pInt >= 60 ? 'Moderate' : 'Low');
    return { rmse: parseFloat(rmse.toFixed(2)), confidence_pct: pInt, confidence_label: lbl };
  }

  // 1: MLD Confidence (depths 0-50m average)
  let mldConf = metrics_confidence && metrics_confidence.mld;
  if (!mldConf) {
    const rel = globalConfidenceStats.filter(s => s.depth <= 50);
    const avgR = rel.reduce((a, b) => a + b.rmse, 0) / (rel.length || 1);
    mldConf = calcFallbackConfidence(avgR);
  }
  renderCardConfidence('mld', mldConf);

  // 2: OHC300 Confidence (depths 0-300m average)
  let ohcConf = metrics_confidence && (metrics_confidence.ohc || metrics_confidence.ohc300);
  if (!ohcConf) {
    const rel = globalConfidenceStats.filter(s => s.depth <= 300);
    const avgR = rel.reduce((a, b) => a + b.rmse, 0) / (rel.length || 1);
    ohcConf = calcFallbackConfidence(avgR);
  }
  renderCardConfidence('ohc', ohcConf);

  // 3: Sound Velocity / Acoustic Shadow Depth Confidence (nearest to SLD)
  let svadConf = metrics_confidence && metrics_confidence.svad;
  if (!svadConf) {
    const targetZ = svad !== null ? svad : 0;
    const nearestZ = depths.reduce((p, c) => Math.abs(c - targetZ) < Math.abs(p - targetZ) ? c : p, depths[0]);
    const item = globalConfidenceStats.find(s => s.depth === nearestZ) || globalConfidenceStats[0];
    svadConf = item;
  }
  renderCardConfidence('svad', svadConf);

  // 4: D20 Isotherm Depth Confidence (nearest to D20)
  let d20Conf = metrics_confidence && metrics_confidence.d20;
  if (!d20Conf) {
    const targetZ = d20Isotherm !== null ? d20Isotherm : 100;
    const nearestZ = depths.reduce((p, c) => Math.abs(c - targetZ) < Math.abs(p - targetZ) ? c : p, 100);
    const item = globalConfidenceStats.find(s => s.depth === nearestZ) || globalConfidenceStats[7];
    d20Conf = item;
  }
  renderCardConfidence('d20', d20Conf);
}

/* ── Depth-Temperature table renderer (3 columns: Depth, Temp, Confidence) ── */

function updateDepthTable(depths, temps, profile = null, nearestArgo = null) {
  const tbody = document.getElementById('tvd-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  depths.forEach((depth, i) => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-depth', String(depth));
    if (selectedDepth !== null && depth === selectedDepth) {
      tr.className = 'ky-tvd-table-row--highlight';
    }

    let conf = null;
    if (profile && profile[i] && profile[i].confidence_pct !== undefined) {
      conf = profile[i];
    } else {
      conf = globalConfidenceStats.find(s => s.depth === depth) || {
        rmse: 1.0,
        confidence_pct: 50,
        confidence_label: 'Moderate',
      };
    }

    const pct = conf.confidence_pct;
    const label = conf.confidence_label || 'Moderate';
    const labelClass = label.toLowerCase();
    const rmseStr = typeof conf.rmse === 'number' ? conf.rmse.toFixed(2) : String(conf.rmse);

    let cellTitle = `${label} Confidence (${pct}%) · RMSE ±${rmseStr}°C`;
    const dist = conf.nearest_argo_distance_km !== undefined ? conf.nearest_argo_distance_km : (nearestArgo ? nearestArgo.distance_km : null);
    const aDate = conf.nearest_argo_date || (nearestArgo ? nearestArgo.date : null);
    const pFactor = conf.proximity_factor !== undefined ? conf.proximity_factor : (nearestArgo ? nearestArgo.proximity_factor : null);

    if (dist !== null && aDate && pFactor !== null) {
      cellTitle = `Validation RMSE: ±${rmseStr}°C · Nearest ARGO: ${dist}km (${aDate}) · Proximity: ${pFactor}`;
    }

    tr.innerHTML = `<td>${depth}</td><td>${temps[i].toFixed(1)}</td><td><div class="ky-tvd-conf-cell" title="${cellTitle}"><div class="ky-tvd-conf-bar-bg"><div class="ky-tvd-conf-bar-fill ky-tvd-conf-bar-fill--${labelClass}" style="width: ${pct}%;"></div></div><span class="ky-tvd-conf-pct">${pct}%</span></div></td>`;
    tr.style.cursor = 'pointer';
    tr.title = `Click to inspect depth ${depth} m`;
    tr.addEventListener('click', () => {
      setDepthSelection(depth, true);
    });
    tbody.appendChild(tr);
  });
  scrollHighlightedTvdRow();
}

function updateTableHighlight(depth = selectedDepth) {
  const tbody = document.getElementById('tvd-table-body');
  if (!tbody) return;
  const rows = tbody.querySelectorAll('tr');
  rows.forEach(tr => {
    const d = parseInt(tr.getAttribute('data-depth'), 10);
    if (depth !== null && d === depth) {
      tr.classList.add('ky-tvd-table-row--highlight');
    } else {
      tr.classList.remove('ky-tvd-table-row--highlight');
    }
  });
  scrollHighlightedTvdRow();
}

function scrollHighlightedTvdRow() {
  const tbody = document.getElementById('tvd-table-body');
  if (!tbody) return;
  const highlighted = tbody.querySelector('.ky-tvd-table-row--highlight');
  if (highlighted) {
    highlighted.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
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
    scrollHighlightedTvdRow();
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
  sst:        { title: 'Sea Surface Temperature (°C)', ticks: ['24', '26', '28', '30', '32'], bar: ZOOM_EARTH_GRADIENT_CSS },
  ssh:        { title: 'Sea Surface Height (m)',       ticks: ['0.2', '0.4', '0.6', '0.8', '1.0'], bar: 'linear-gradient(to right, #1E3A8A 0%, #2563EB 25%, #06B6D4 50%, #10B981 70%, #F59E0B 85%, #EF4444 100%)' },
  sss:        { title: 'Sea Surface Salinity (PSU)',   ticks: ['32', '33', '34', '35', '36'], bar: 'linear-gradient(to right, #059669 0%, #10B981 35%, #38BDF8 70%, #1D4ED8 100%)' },
  sla:        { title: 'Sea Level Anomaly (m)',        ticks: ['-0.20', '-0.10', '0.00', '+0.10', '+0.20'], bar: 'linear-gradient(to right, #1E1B4B 0%, #4338CA 30%, #E0F2FE 50%, #EC4899 75%, #9D174D 100%)' },
  current:    { title: 'Surface Ocean Current (m/s)',  ticks: ['0.0', '0.5', '1.0', '1.5', '2.0+'], bar: 'linear-gradient(to right, #0F172A 0%, #0284C7 30%, #06B6D4 55%, #EAB308 80%, #E11D48 100%)' },
  wind:       { title: 'Surface Winds (m/s)',          ticks: ['0', '3', '6', '9', '12', '15+'], bar: 'linear-gradient(to right, #334155 0%, #475569 25%, #38BDF8 55%, #F59E0B 80%, #EA580C 100%)' },
  confidence: {
    title: 'Prediction Confidence (%)',
    ticks: ['30%', '45%', '60%', '75%', '90%+'],
    bar: 'linear-gradient(to right, #DC2626 0%, #EA580C 20%, #F59E0B 40%, #10B981 65%, #06B6D4 82%, #1D4ED8 100%)',
    caption: 'Confidence reflects distance and recency to the nearest of 41 validated ARGO float profiles — not a direct measure of prediction accuracy at this location.',
    provenance: 'ESTIMATED HEURISTIC'
  },
};

document.querySelectorAll('.ky-param-tile').forEach(tile => {
  tile.addEventListener('click', () => {
    const param = tile.getAttribute('data-param');
    const isAlreadyActive = tile.classList.contains('ky-param-tile--active') || selectedParam === param;

    // Toggle off / deselect if already selected
    if (isAlreadyActive) {
      tile.classList.remove('ky-param-tile--active');
      selectedParam = null;
      if (typeof ParticleFlowEngine !== 'undefined' && ParticleFlowEngine.stop) {
        ParticleFlowEngine.stop();
      }
      setDepthSelection(null, false);
      updateHeatmapLegend(0);
      updateArgoFloatLayerVisibility(false);
      const legendCaption = document.getElementById('map-legend-caption');
      if (legendCaption) {
        legendCaption.style.display = 'none';
        legendCaption.innerHTML = '';
      }
      checkAndRefreshHeatmap();
      validateLayerMarkerSync();
      return;
    }

    // Deselect all other tiles and select this one
    document.querySelectorAll('.ky-param-tile').forEach(t => t.classList.remove('ky-param-tile--active'));
    tile.classList.add('ky-param-tile--active');

    selectedParam = param;
    setDepthSelection(0, false); // Auto-set/lock depth to 0m (Surface) for 2D surface parameter

    const cfg = PARAM_CONFIG[param] || PARAM_CONFIG.sst;
    
    const legendTitle = document.getElementById('map-legend-title');
    if (legendTitle) legendTitle.textContent = cfg.title;

    const legendBar = document.getElementById('map-legend-bar');
    if (legendBar) legendBar.style.background = cfg.bar;

    const legendTicks = document.getElementById('map-legend-ticks');
    if (legendTicks) {
      legendTicks.innerHTML = cfg.ticks.map(t => `<span>${t}</span>`).join('');
    }

    const legendCaption = document.getElementById('map-legend-caption');
    if (legendCaption) {
      if (cfg.caption) {
        legendCaption.style.display = 'block';
        legendCaption.innerHTML = `
          ${cfg.provenance ? `<span class="ky-map-legend__caption-tag">${cfg.provenance}</span><br/>` : ''}
          <span>${cfg.caption}</span>
        `;
      } else {
        legendCaption.style.display = 'none';
        legendCaption.innerHTML = '';
      }
    }

    // Trigger heatmap refresh with new parameter overlay
    checkAndRefreshHeatmap();
    validateLayerMarkerSync();
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
  const { temps, depths, argo, indices } = prediction;
  const n = depths.length;

  // Compute D20 Isotherm Depth (20°C crossing point) matching the D20 summary card
  const d20Depth = computeD20Isotherm(depths, temps);

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

  // Extract per-depth RMSE from prediction.profile or fallback to globalConfidenceStats
  let rmseList = null;
  if (prediction.profile && Array.isArray(prediction.profile)) {
    rmseList = prediction.profile.map(p => typeof p.rmse === 'number' ? p.rmse : 1.0);
  } else if (globalConfidenceStats && Array.isArray(globalConfidenceStats)) {
    rmseList = depths.map(d => {
      const match = globalConfidenceStats.find(s => s.depth === d);
      return match ? match.rmse : 1.0;
    });
  }

  const datasets = [];

  // Shaded confidence band (temperature ± per-depth RMSE) rendered behind the main line
  if (rmseList && rmseList.length === n) {
    datasets.push({
      label: 'Confidence Upper',
      data: temps.map((t, i) => ({ x: t + rmseList[i], y: depths[i] })),
      parsing: false,
      borderColor: 'transparent',
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      tension: 0.35,
      order: 3,
    });
    datasets.push({
      label: 'Confidence Band (±RMSE)',
      data: temps.map((t, i) => ({ x: Math.max(0, t - rmseList[i]), y: depths[i] })),
      parsing: false,
      borderColor: 'transparent',
      backgroundColor: 'rgba(29, 100, 242, 0.12)',
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: '-1',
      tension: 0.35,
      order: 3,
    });
  }

  datasets.push(mainDataset);

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
      layout: {
        padding: {
          top: 4,
          right: 8,
          bottom: 0,
          left: 0,
        },
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
            filter: function(item) {
              return item.text !== 'Confidence Upper';
            },
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
              if (item.dataset.label === 'Confidence Upper') return null;
              if (item.dataset.label === 'Confidence Band (±RMSE)') {
                const idx = item.dataIndex;
                const r = rmseList && rmseList[idx] !== undefined ? rmseList[idx] : null;
                return r !== null ? `Confidence Band: ±${r.toFixed(2)} °C` : null;
              }
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
    plugins: d20Depth !== null ? [{
      id: 'referenceDepthLine',
      afterDraw(chart) {
        const { ctx, chartArea: { left, right, top, bottom }, scales: { y } } = chart;
        const yPos = y.getPixelForValue(d20Depth);
        if (yPos >= top && yPos <= bottom) {
          ctx.save();

          // 1. Draw horizontal dashed reference line across the chart area
          ctx.beginPath();
          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = '#94A3B8';
          ctx.lineWidth = 1.5;
          ctx.moveTo(left, yPos);
          ctx.lineTo(right, yPos);
          ctx.stroke();

          // 2. Full label text: e.g. "D20: 127 m"
          const labelText = `D20: ${d20Depth} m`;
          ctx.font = '600 11px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.textAlign = 'right';

          // Prevent top clipping: if reference line is near chart top, render label below line
          const isNearTop = yPos < top + 18;
          ctx.textBaseline = isNearTop ? 'top' : 'bottom';
          const yOffset = isNearTop ? 3 : -3;

          // Crisp background halo so text remains legible against grid lines and data curves
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
          ctx.lineWidth = 3;
          ctx.setLineDash([]);
          ctx.strokeText(labelText, right - 6, yPos + yOffset);

          // Render foreground text in dark slate matching Kyogre palette
          ctx.fillStyle = '#1E293B';
          ctx.fillText(labelText, right - 6, yPos + yOffset);

          ctx.restore();
        }
      }
    }] : []
  });
}

/* ── Cast / Reconstruct button handler & Failure Fallback ───── */

let lastSuccessfulPrediction = null;
let lastSuccessfulLat = null;
let lastSuccessfulLon = null;
let lastSuccessfulDate = null;
let currentPredictController = null;
let currentPredictTimeoutId = null;
let currentPredictRequestId = 0;

function clearPreviousPredictionUI() {
  lastSuccessfulPrediction = null;
  lastSuccessfulLat = null;
  lastSuccessfulLon = null;
  lastSuccessfulDate = null;

  setStatsLoading(true);
  clearSurfaceInputs();

  const idleEl    = document.getElementById('result-idle');
  const contentEl = document.getElementById('result-content');
  const loadingEl = document.getElementById('result-loading');
  const emptyView = document.getElementById('tvd-empty-view');
  const tableView = document.getElementById('tvd-table-view');
  const graphView = document.getElementById('tvd-graph-view');

  if (idleEl)    idleEl.style.display    = 'none';
  if (contentEl) contentEl.style.display = 'none';
  if (emptyView) emptyView.style.display = 'none';
  if (tableView) tableView.style.display = 'none';
  if (graphView) graphView.style.display = 'none';

  const tableBody = document.getElementById('tvd-table-body');
  if (tableBody) tableBody.innerHTML = '';

  if (profileChart) {
    try {
      profileChart.destroy();
    } catch (e) {}
    profileChart = null;
  }

  const coordsValEl = document.getElementById('result-coords-val');
  const regionValEl = document.getElementById('result-region-val');
  const dateValEl   = document.getElementById('result-date-val');
  if (coordsValEl) coordsValEl.textContent = '';
  if (regionValEl) regionValEl.textContent = '';
  if (dateValEl)   dateValEl.textContent   = '';

  const regionNotice = document.getElementById('region-notice');
  if (regionNotice) regionNotice.style.display = 'none';

  if (loadingEl) {
    loadingEl.style.display = 'flex';
    const loadingText = document.getElementById('result-loading-text') || loadingEl.querySelector('.ky-tvd-loading__text');
    if (loadingText) loadingText.textContent = 'Generating prediction...';
  }
}

function handleBackendFailure(msg) {
  setStatsLoading(false);

  const loadingEl = document.getElementById('result-loading');
  const contentEl = document.getElementById('result-content');
  const idleEl    = document.getElementById('result-idle');
  const emptyView = document.getElementById('tvd-empty-view');

  if (loadingEl) loadingEl.style.display = 'none';
  if (contentEl) contentEl.style.display = 'none';
  if (emptyView) emptyView.style.display = 'none';

  const defaultBanner = isLocalBackend()
    ? 'Live model unavailable. Make sure Python backend is running on port 8000.'
    : 'Model Unavailable. Inference service could not be reached.';
  const bannerText = msg || defaultBanner;
  showRegionNotice(bannerText, 'error');

  if (idleEl) {
    idleEl.style.display = 'flex';
    const existingErr = idleEl.querySelector('.cast-error-msg');
    if (existingErr) existingErr.remove();
    const errDiv = document.createElement('div');
    errDiv.className = 'cast-error-msg';
    const serverHint = isLocalBackend()
      ? 'Ensure Python server is running on port 8000.'
      : 'Inference backend service is currently unreachable.';
    errDiv.innerHTML = `<strong>Live Model Unavailable</strong><br><span>Inference backend at <code>${API_BASE}</code> could not be reached. ${serverHint}</span>`;
    idleEl.appendChild(errDiv);
  }

  // Set honest placeholders rather than displaying fabricated numbers
  ['stat-mld-val', 'stat-ohc-val', 'stat-svad-val', 'stat-d20-val'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '—';
  });
  const svadSubEl = document.getElementById('stat-svad-sub');
  if (svadSubEl) svadSubEl.style.display = 'none';
  clearSurfaceInputs();

  const tableBody = document.getElementById('tvd-table-body');
  if (tableBody) tableBody.innerHTML = '';
  if (profileChart) {
    try {
      profileChart.destroy();
    } catch (e) {}
    profileChart = null;
  }
}

function showCastError(msg) {
  handleBackendFailure(msg);
}

document.getElementById('btn-cast').addEventListener('click', function () {
  if (!clickedLatLng || !hasSelectedDate) return;

  const lat     = clickedLatLng.lat;
  const lon     = clickedLatLng.lng;
  const dayIdx  = parseInt(dateSlider.value, 10);
  const dateObj = dayIndexToDate(dayIdx);
  const dateStr = dateToISO(dateObj);

  // Date guard — model needs 10 days of prior satellite history (2021-01-11 to 2023-12-31)
  if (dayIdx < MIN_VALID_DAY || dayIdx > TOTAL_DAYS) {
    showRegionNotice('Date requires 10 days of prior satellite history. Please select a date between 2021-01-11 and 2023-12-31.', 'warning');
    return;
  }

  // Abort any previous pending request
  if (currentPredictController) {
    currentPredictController.abort();
    currentPredictController = null;
  }
  if (currentPredictTimeoutId) {
    clearTimeout(currentPredictTimeoutId);
    currentPredictTimeoutId = null;
  }
  const reqId = ++currentPredictRequestId;

  // Clear stale prediction data and show in-flight "Generating prediction..." loading state
  clearPreviousPredictionUI();

  if (USE_MOCK) {
    // ── Offline dev fallback ─────────────────────────────────
    setTimeout(function () {
      if (reqId !== currentPredictRequestId) return;
      const prediction = mockPredict(lat, lon, dateStr);
      renderPrediction(prediction, lat, lon, dateObj);
    }, 620);
    return;
  }

  // ── Real inference via FastAPI backend with 90s timeout ──────
  const startTime = Date.now();
  console.log(`[OceanEmbed API] POST /predict started for (${lat.toFixed(3)}, ${lon.toFixed(3)}) on ${dateStr}`);

  currentPredictController = typeof AbortController !== 'undefined' ? new AbortController() : null;
  currentPredictTimeoutId = currentPredictController ? setTimeout(() => currentPredictController.abort(), API_REQUEST_TIMEOUT_MS) : null;

  // Simulation hook: ?simulateBackendDown=1 or window.simulateBackendDown = true
  const shouldSimulateDown = typeof window !== 'undefined' && (
    (window.location && new URLSearchParams(window.location.search).get('simulateBackendDown') === '1') ||
    window.simulateBackendDown === true
  );
  const predictEndpoint = shouldSimulateDown ? 'http://localhost:9999/predict' : `${API_BASE}/predict`;

  fetch(predictEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude: lat, longitude: lon, date: dateStr }),
    signal: currentPredictController ? currentPredictController.signal : undefined,
  })
    .then(function (res) {
      if (currentPredictTimeoutId) {
        clearTimeout(currentPredictTimeoutId);
        currentPredictTimeoutId = null;
      }
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
      if (reqId !== currentPredictRequestId) return;
      const elapsed = Date.now() - startTime;
      console.log(`[OceanEmbed API] POST /predict succeeded in ${elapsed}ms (${(elapsed / 1000).toFixed(2)}s)`);
      renderPrediction(prediction, lat, lon, dateObj);
    })
    .catch(function (err) {
      if (currentPredictTimeoutId) {
        clearTimeout(currentPredictTimeoutId);
        currentPredictTimeoutId = null;
      }
      // If superseded by another newer request, ignore quietly
      if (reqId !== currentPredictRequestId) return;

      const elapsed = Date.now() - startTime;
      console.error(`[OceanEmbed API] POST /predict failed after ${elapsed}ms (${(elapsed / 1000).toFixed(2)}s):`, err.message || err);

      let msg = err.message || 'Inference service unavailable.';
      const isAbort = err.name === 'AbortError' || msg.toLowerCase().includes('aborted');
      const isNetwork = !navigator.onLine || msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('networkerror');

      if (isAbort) {
        msg = isLocalBackend()
          ? 'Inference request timed out after 90s. Make sure Python backend is running on port 8000.'
          : 'Inference request timed out after 90s. Remote inference service took too long to respond.';
      } else if (isNetwork) {
        msg = isLocalBackend()
          ? 'Inference service unavailable. Make sure the Python backend is running on port 8000.'
          : 'Inference service unavailable. Remote inference backend could not be reached.';
      }

      handleBackendFailure(msg);
    });
});

/* ── Shared render helper (used by both mock and real paths) ─ */

function renderPrediction(prediction, lat, lon, dateObj) {
  lastSuccessfulPrediction = prediction;
  lastSuccessfulLat = lat;
  lastSuccessfulLon = lon;
  lastSuccessfulDate = dateObj;

  setStatsLoading(false);

  // Update target location & date header
  const coordsValEl = document.getElementById('result-coords-val');
  const regionValEl = document.getElementById('result-region-val');
  const dateValEl   = document.getElementById('result-date-val');
  if (coordsValEl) coordsValEl.textContent = `${lat.toFixed(3)}° N, ${lon.toFixed(3)}° E`;
  if (regionValEl) regionValEl.textContent = getRegionName(lat, lon);
  if (dateValEl)   dateValEl.textContent   = formatDate(dateObj);

  // Update Ocean Parameters tiles
  renderSurfaceInputs(prediction.surfaceInputs);
  if (prediction.profile && prediction.profile[0] && prediction.profile[0].confidence_pct !== undefined) {
    const confEl = document.getElementById('param-confidence-val');
    if (confEl) confEl.textContent = `${prediction.profile[0].confidence_pct}%`;
  }

  // Update Stat Cards (MLD, OHC, SVAD, D20 Isotherm)
  updateStatCards(prediction);

  // Update Depth-Temperature table
  updateDepthTable(prediction.depths, prediction.temps, prediction.profile, prediction.nearest_argo);

  // Dev mode console log for dynamic spatio-temporal confidence (including monsoon regime match)
  if (typeof isDevModeEnabled === 'function' && isDevModeEnabled() && prediction.nearest_argo) {
    const na = prediction.nearest_argo;
    const dateStr = (dateObj instanceof Date && !isNaN(dateObj.getTime())) ? dateToISO(dateObj) : String(dateObj);
    const regimeStatus = na.is_same_regime ? 'same-regime' : 'cross-regime';
    const regimeDetail = `${regimeStatus} (${na.query_regime || 'query'} vs ${na.argo_regime || 'argo'}, weight: ${na.temporal_weight || 1.5}km/d)`;
    console.log(
      `[Confidence] Lat: ${lat.toFixed(3)}, Lon: ${lon.toFixed(3)}, Date: ${dateStr} -> Nearest ARGO Float #${na.float_id} (${na.distance_km}km, ${na.days_diff}d diff, score: ${na.combined_score}, ${regimeDetail}) -> Proximity factor: ${na.proximity_factor}`
    );
  }

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
  const loadingEl = document.getElementById('result-loading');
  const contentEl = document.getElementById('result-content');
  if (loadingEl) loadingEl.style.display = 'none';
  if (contentEl) contentEl.style.display = 'flex';

  // Run general layer and marker data validation check
  validateLayerMarkerSync();
}

/* ── General Layer & Marker Data Validation Check ──────────── */

function validateLayerMarkerSync() {
  if (!clickedLatLng) return null;
  const lat = clickedLatLng.lat;
  const lon = clickedLatLng.lng;

  // Snapped grid indices (0.25 deg grid: 5.0-30.0N, 45.0-105.0E)
  const latIdx = Math.max(0, Math.min(100, Math.round((lat - 5.0) / 0.25)));
  const lonIdx = Math.max(0, Math.min(240, Math.round((lon - 45.0) / 0.25)));
  const snappedLat = 5.0 + latIdx * 0.25;
  const snappedLon = 45.0 + lonIdx * 0.25;

  let layerName = selectedParam || (selectedDepth !== null ? `depth_${selectedDepth}m` : null);
  if (!layerName) return null;

  // 1. Grid numeric value at marker coordinates
  let gridVal = null;
  if (currentGridData && currentGridData.grid && currentGridData.grid[latIdx]) {
    gridVal = currentGridData.grid[latIdx][lonIdx];
  }

  // 2. Stat card / table numeric value
  let cardVal = null;
  let cardElId = '';
  if (selectedParam === 'sst') cardElId = 'param-sst-val';
  else if (selectedParam === 'ssh') cardElId = 'param-ssh-val';
  else if (selectedParam === 'sss') cardElId = 'param-sss-val';
  else if (selectedParam === 'sla') cardElId = 'param-sla-val';
  else if (selectedParam === 'current') cardElId = 'param-current-val';
  else if (selectedParam === 'wind') cardElId = 'param-wind-val';
  else if (selectedParam === 'confidence') cardElId = 'param-confidence-val';
  else if (selectedDepth !== null) {
    const row = document.querySelector(`.tvd-table tr[data-depth="${selectedDepth}"] .tvd-temp-cell`);
    if (row && row.textContent) {
      cardVal = parseFloat(row.textContent);
    }
  }

  if (cardElId) {
    const el = document.getElementById(cardElId);
    if (el && el.textContent && el.textContent !== '—') {
      const match = el.textContent.trim().match(/([+-]?\d+(?:\.\d+)?)/);
      if (match) cardVal = parseFloat(match[1]);
    }
  }

  // 3. Rendered pixel check from active canvas
  let pixelRgb = null;
  let expectedRgb = null;
  let pixelMatch = false;

  if (currentActiveCanvas && typeof currentActiveCanvas.getContext === 'function') {
    const ctx = currentActiveCanvas.getContext('2d', { willReadFrequently: true });
    const xNorm = (lon - BOUNDS.west) / (BOUNDS.east - BOUNDS.west);
    const yNorm = (BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south);
    const px = Math.max(0, Math.min(currentActiveCanvas.width - 1, Math.round(xNorm * (currentActiveCanvas.width - 1))));
    const py = Math.max(0, Math.min(currentActiveCanvas.height - 1, Math.round(yNorm * (currentActiveCanvas.height - 1))));
    try {
      const pData = ctx.getImageData(px, py, 1, 1).data;
      pixelRgb = { r: pData[0], g: pData[1], b: pData[2], a: pData[3] };
    } catch (e) {
      // tainted or headless canvas fallback
    }

    const testVal = (gridVal !== null) ? gridVal : cardVal;
    if (testVal !== null) {
      if (selectedParam) {
        expectedRgb = paramToColor(selectedParam, testVal);
      } else if (selectedDepth !== null) {
        expectedRgb = tempToColor(testVal, selectedDepth);
      }
      if (pixelRgb && expectedRgb) {
        const dr = Math.abs(pixelRgb.r - expectedRgb.r);
        const dg = Math.abs(pixelRgb.g - expectedRgb.g);
        const db = Math.abs(pixelRgb.b - expectedRgb.b);
        pixelMatch = (dr <= 18 && dg <= 18 && db <= 18);
      }
    }
  }

  const numDiff = (gridVal !== null && cardVal !== null) ? Math.abs(gridVal - cardVal) : null;
  const numMatch = (numDiff !== null) ? (numDiff <= 0.08) : null;

  const report = {
    layer: layerName,
    lat,
    lon,
    snappedLat,
    snappedLon,
    gridVal,
    cardVal,
    numDiff,
    numMatch,
    pixelRgb,
    expectedRgb,
    pixelMatch,
    timestamp: new Date().toISOString()
  };

  lastValidationReport = report;
  if (isDevModeEnabled()) {
    console.log(`[Validation Check] Layer: ${report.layer} | Pinned: (${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E) -> Cell: (${snappedLat}°N, ${snappedLon}°E) | Grid: ${gridVal} | Card: ${cardVal} | Num Match: ${numMatch ? 'PASS' : 'FAIL'} (Δ=${numDiff !== null ? numDiff.toFixed(3) : 'N/A'}) | Pixel Match: ${pixelMatch ? 'PASS' : 'INFO'}`);
  }

  return report;
}

window.validateLayerMarkerSync = validateLayerMarkerSync;
window.getLastValidationReport = () => lastValidationReport;



