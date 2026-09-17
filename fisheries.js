/**
 * Kyogre — Fisheries Mode & PFZ Advisory System
 * MapLibre satellite mapping, high-resolution Chlorophyll-a heatmap overlay,
 * dashed-outline PFZ zones with fish icons, Tuna zone popup card,
 * and subsurface 3-column depth/temperature/nutrient vertical profile synchronization.
 */

/* ── Operational Constants & Backend Config ───────────────── */

const API_BASE_URL = (typeof window !== 'undefined' && window.API_BASE_URL)
  ? window.API_BASE_URL
  : 'http://localhost:8000';
const API_BASE = API_BASE_URL;
const API_REQUEST_TIMEOUT_MS = 90000;

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

const BOUNDS = {
  north: 30.0,
  south: 5.0,
  west:  45.0,
  east:  105.0,
};

// Depths matching the reference mockup (0 to 1000m)
const DEPTH_LEVELS = [0, 25, 50, 100, 200, 300, 500, 750, 1000];

/**
 * Candidate zone visibility filter threshold.
 * Controls the minimum advisory tier that auto-renders dashed polygon outlines
 * and pulsing fish markers on the map overlay.
 * Single named constant: set to 'elevated' for >=0.70 only; 'moderate' includes >=0.40; 'low' includes all.
 */
const HIGHLIGHT_MIN_TIER = 'elevated';

const TIER_THRESHOLDS = {
  elevated: 0.70,
  moderate: 0.40,
  low: 0.0,
};

const TIER_ORDER = {
  elevated: 3,
  moderate: 2,
  low: 1,
};

const PRESET_ZONES = [
  {
    id: 'zone-bob',
    name: 'Bay of Bengal Assessment Zone',
    tag: 'PFZ Index: Elevated',
    sub: 'Thermocline shoaling + upwelling indicator.',
    lat: 12.4,
    lon: 88.6,
    probScore: 0.87,
    thermocline: 68,
    upwelling: 0.72,
    nutrient: 2.6,
    highlightDepth: 100,
  },
  {
    id: 'zone-arabian-north',
    name: 'Central Arabian Sea Eddy Zone',
    tag: 'PFZ Index: Elevated',
    sub: 'Cyclonic eddy margin + elevated primary production proxy.',
    lat: 15.8,
    lon: 65.2,
    probScore: 0.82,
    thermocline: 74,
    upwelling: 0.68,
    nutrient: 2.1,
    highlightDepth: 75,
  },
  {
    id: 'zone-arabian-sw',
    name: 'SW Arabian Basin Upwelling Zone',
    tag: 'PFZ Index: Moderate',
    sub: 'Boundary current filament + localized divergence plume.',
    lat: 10.5,
    lon: 56.5,
    probScore: 0.74,
    thermocline: 82,
    upwelling: 0.58,
    nutrient: 1.6,
    highlightDepth: 50,
  }
];

/* ── State ───────────────────────────────────────────────── */

let currentCoord = null;
let currentDateStr = null;
let currentMarker = null;
let currentPopup = null;
let profileChart = null;
let pfzLayerVisible = true;
let currentDynamicZones = [];
let activeFishMarkers = [];

/* ── Empty State & UI Gating Helpers ─────────────────────── */

function clearDynamicPfzZones() {
  currentDynamicZones = [];
  if (typeof map !== 'undefined' && map && map.getSource) {
    try {
      const source = map.getSource('pfz-zones');
      if (source) {
        source.setData({ type: 'FeatureCollection', features: [] });
      }
      // Clear chlorophyll overlay to transparent placeholder
      const chlaSource = map.getSource('chla-raster-source');
      if (chlaSource && chlaSource.updateImage) {
        const blankCanvas = document.createElement('canvas');
        blankCanvas.width = 1;
        blankCanvas.height = 1;
        chlaSource.updateImage({
          url: blankCanvas.toDataURL(),
          coordinates: [
            [BOUNDS.west, BOUNDS.north],
            [BOUNDS.east, BOUNDS.north],
            [BOUNDS.east, BOUNDS.south],
            [BOUNDS.west, BOUNDS.south]
          ]
        });
      }
    } catch (e) {
      // Map source may not be initialized yet
    }
  }
  activeFishMarkers.forEach(m => m.remove());
  activeFishMarkers = [];
  // Hide chlorophyll legend
  const legend = document.getElementById('map-legend');
  if (legend) legend.style.display = 'none';
}

function resetStatCards(promptText) {
  const noteText = promptText || 'Select a location and date';
  const tcEl = document.getElementById('stat-thermocline-val');
  const upEl = document.getElementById('stat-upwelling-val');
  const pfzEl = document.getElementById('stat-pfz-val');
  const pfzBadge = document.getElementById('stat-pfz-badge');
  const nutrEl = document.getElementById('stat-nutrient-val');

  const tcNote = document.getElementById('stat-thermocline-note');
  const upNote = document.getElementById('stat-upwelling-note');
  const pfzNote = document.getElementById('stat-pfz-note');
  const nutrNote = document.getElementById('stat-nutrient-note');

  if (tcEl) tcEl.textContent = '—';
  if (upEl) upEl.textContent = '—';
  if (pfzEl) pfzEl.textContent = '—';
  if (pfzBadge) pfzBadge.style.display = 'none';
  if (nutrEl) nutrEl.textContent = '—';

  if (tcNote) tcNote.textContent = noteText;
  if (upNote) upNote.textContent = noteText;
  if (pfzNote) pfzNote.textContent = noteText;
  if (nutrNote) nutrNote.textContent = noteText;
}

function updateEmptyStatePrompt() {
  const emptyView = document.getElementById('tvd-empty-view');
  const emptyText = document.getElementById('tvd-empty-text');
  const tableView = document.getElementById('tvd-table-view');
  const graphView = document.getElementById('tvd-graph-view');
  const coordBadge = document.getElementById('selected-loc-coord');

  if (!currentCoord && !currentDateStr) {
    if (emptyView) emptyView.style.display = 'flex';
    if (emptyText) emptyText.textContent = 'No location selected yet — click the map or search above';
    if (tableView) tableView.style.display = 'none';
    if (graphView) graphView.style.display = 'none';
    if (coordBadge) coordBadge.textContent = '—';
    resetStatCards('Select a location and date');
  } else if (currentCoord && !currentDateStr) {
    if (emptyView) emptyView.style.display = 'flex';
    if (emptyText) emptyText.textContent = 'Select a date in the header to generate predictions for this location';
    if (tableView) tableView.style.display = 'none';
    if (graphView) graphView.style.display = 'none';
    if (coordBadge) coordBadge.textContent = `${currentCoord.lat.toFixed(1)}°N, ${currentCoord.lon.toFixed(1)}°E`;
    resetStatCards('Select a date to view predictions');
  } else if (!currentCoord && currentDateStr) {
    if (emptyView) emptyView.style.display = 'flex';
    if (emptyText) emptyText.textContent = 'No location selected yet — click the map or search above';
    if (tableView) tableView.style.display = 'none';
    if (graphView) graphView.style.display = 'none';
    if (coordBadge) coordBadge.textContent = '—';
    resetStatCards('Select a location on the map');
  }
}

function revealTvdPanel() {
  const emptyView = document.getElementById('tvd-empty-view');
  const tableView = document.getElementById('tvd-table-view');
  const graphView = document.getElementById('tvd-graph-view');
  const btnGraph = document.getElementById('btn-view-graph');

  if (emptyView) emptyView.style.display = 'none';
  const isGraphActive = btnGraph && btnGraph.classList.contains('ky-tvd-toggle__btn--active');
  if (isGraphActive) {
    if (tableView) tableView.style.display = 'none';
    if (graphView) graphView.style.display = 'block';
    if (profileChart) setTimeout(() => profileChart.resize(), 50);
  } else {
    if (tableView) tableView.style.display = 'block';
    if (graphView) graphView.style.display = 'none';
  }
}

/* ── Land Mask Helper ────────────────────────────────────── */

function isCoordInsideNorthIndianOcean(lat, lon) {
  return lat >= BOUNDS.south && lat <= BOUNDS.north &&
         lon >= BOUNDS.west  && lon <= BOUNDS.east;
}

function checkIsLand(lat, lon) {
  if (typeof window !== 'undefined') {
    if (typeof window.isLand === 'function') {
      return window.isLand(lat, lon);
    }
    if (window.Coastline && typeof window.Coastline.isLand === 'function') {
      return window.Coastline.isLand(lat, lon);
    }
  }
  // Coarse bounding box fallback
  if (lat >= 8.0 && lat <= 26.0 && lon >= 73.0 && lon <= 85.0) return true;
  return false;
}

function applyLandCutout(canvas) {
  if (typeof window !== 'undefined') {
    if (typeof window.applyLandMaskToCanvas === 'function') {
      window.applyLandMaskToCanvas(canvas, BOUNDS);
    } else if (window.Coastline && typeof window.Coastline.applyLandMaskToCanvas === 'function') {
      window.Coastline.applyLandMaskToCanvas(canvas, BOUNDS);
    }
  }
}

/* ── Region Notice Alert ─────────────────────────────────── */

let regionNoticeTimer = null;
function showNotice(msg) {
  const notice = document.getElementById('region-notice');
  if (!notice) return;
  const span = notice.querySelector('span');
  if (span) span.textContent = msg;
  notice.style.display = 'flex';
  if (regionNoticeTimer) clearTimeout(regionNoticeTimer);
  regionNoticeTimer = setTimeout(() => {
    notice.style.display = 'none';
  }, 4500);
}

/* ── Chlorophyll-a Color Field (Smooth Zoom Earth Palette) ─ */

const CHLA_STOPS = [
  { v: 0.01, r: 15,  g: 23,  b: 42  }, // #0F172A Deep Midnight Blue
  { v: 0.05, r: 30,  g: 58,  b: 138 }, // #1E3A8A Dark Blue
  { v: 0.20, r: 2,   g: 132, b: 199 }, // #0284C7 Bright Ocean Cyan
  { v: 1.00, r: 16,  g: 185, b: 129 }, // #10B981 Emerald Green
  { v: 3.00, r: 250, g: 204, b: 21  }, // #FACC15 Bright Sunny Yellow
  { v: 6.00, r: 234, g: 88,  b: 12  }, // #EA580C Intense Orange
  { v: 10.0, r: 220, g: 38,  b: 38  }, // #DC2626 Crimson Red
];

function sampleChlaColor(val) {
  const clamped = Math.max(0.01, Math.min(10.0, val));
  const logVal = Math.log10(clamped);
  const logMin = Math.log10(0.01);
  const logMax = Math.log10(10.0);
  const t = (logVal - logMin) / (logMax - logMin);

  for (let i = 0; i < CHLA_STOPS.length - 1; i++) {
    const t0 = (Math.log10(CHLA_STOPS[i].v) - logMin) / (logMax - logMin);
    const t1 = (Math.log10(CHLA_STOPS[i + 1].v) - logMin) / (logMax - logMin);
    if (t >= t0 && t <= t1) {
      const frac = (t - t0) / (t1 - t0 || 1);
      const smoothFrac = (1 - Math.cos(frac * Math.PI)) / 2;
      const r = Math.round(CHLA_STOPS[i].r + (CHLA_STOPS[i + 1].r - CHLA_STOPS[i].r) * smoothFrac);
      const g = Math.round(CHLA_STOPS[i].g + (CHLA_STOPS[i + 1].g - CHLA_STOPS[i].g) * smoothFrac);
      const b = Math.round(CHLA_STOPS[i].b + (CHLA_STOPS[i + 1].b - CHLA_STOPS[i].b) * smoothFrac);
      return [r, g, b, 210]; // 82% opacity
    }
  }
  const last = CHLA_STOPS[CHLA_STOPS.length - 1];
  return [last.r, last.g, last.b, 210];
}

function createBlankCanvas() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  return c;
}

/**
 * Renders a 2D raster canvas overlay of surface chlorophyll-a proxy derived from real
 * model predictions (/pfz-grid: upwelling + SLA eddy pumping + geostrophic current).
 * Evaluated per selected date across the North Indian Ocean basin.
 *
 * @param {Object} gridData - { lats: number[], lons: number[], chla_grid: (number|null)[][] }
 * @returns {HTMLCanvasElement|null}
 */
function renderChlaOverlayFromGrid(gridData) {
  if (!gridData || !gridData.chla_grid || !gridData.lats || !gridData.lons) return null;
  if (typeof document === 'undefined') return null;

  const H = gridData.lats.length;
  const W = gridData.lons.length;
  const lowCanvas = document.createElement('canvas');
  lowCanvas.width = W;
  lowCanvas.height = H;
  if (typeof lowCanvas.getContext !== 'function') {
    const legend = document.getElementById('map-legend');
    if (legend) legend.style.display = 'block';
    return lowCanvas;
  }
  const lowCtx = lowCanvas.getContext('2d');
  const imgData = lowCtx.createImageData(W, H);

  // Map canvas pixel rows to grid rows: canvas y=0 is North (30°N), whereas
  // gridData.lats[0] is South (5°N) and gridData.lats[H - 1] is North (30°N).
  for (let y = 0; y < H; y++) {
    const r = (H - 1) - y;
    for (let c = 0; c < W; c++) {
      const val = gridData.chla_grid[r][c];
      const idx = (y * W + c) * 4;
      if (val === null || val === undefined || isNaN(val)) {
        // Transparent land / masked
        imgData.data[idx]     = 0;
        imgData.data[idx + 1] = 0;
        imgData.data[idx + 2] = 0;
        imgData.data[idx + 3] = 0;
      } else {
        const [red, green, blue, alpha] = sampleChlaColor(val);
        imgData.data[idx]     = red;
        imgData.data[idx + 1] = green;
        imgData.data[idx + 2] = blue;
        imgData.data[idx + 3] = alpha;
      }
    }
  }
  lowCtx.putImageData(imgData, 0, 0);

  // 5x smooth upsampling onto higher-resolution display buffer
  const highCanvas = document.createElement('canvas');
  highCanvas.width = 600;
  highCanvas.height = 250;
  const highCtx = highCanvas.getContext('2d');
  highCtx.imageSmoothingEnabled = true;
  highCtx.imageSmoothingQuality = 'high';
  highCtx.drawImage(lowCanvas, 0, 0, highCanvas.width, highCanvas.height);

  // Anti-aliased coastline land cutout
  applyLandCutout(highCanvas);

  // Update MapLibre source if available
  const activeMap = (typeof map !== 'undefined' && map) || (typeof window !== 'undefined' && window.map) || (typeof global !== 'undefined' && global.map);
  if (activeMap && activeMap.getSource) {
    const chlaSource = activeMap.getSource('chla-raster-source');
    if (chlaSource && chlaSource.updateImage) {
      chlaSource.updateImage({
        url: highCanvas.toDataURL(),
        coordinates: [
          [BOUNDS.west, BOUNDS.north],
          [BOUNDS.east, BOUNDS.north],
          [BOUNDS.east, BOUNDS.south],
          [BOUNDS.west, BOUNDS.south]
        ]
      });
    }
  }

  // Show chlorophyll legend
  const legend = document.getElementById('map-legend');
  if (legend) legend.style.display = 'block';

  return highCanvas;
}

function calculateChlaValue(lat, lon) {
  // Backward-compatible stub returning scalar proxy
  return 0.25;
}

function createChlaCanvas(gridData) {
  if (gridData) return renderChlaOverlayFromGrid(gridData);
  return createBlankCanvas();
}

/* ── PFZ GeoJSON Polygons (Closed Dashed Boundaries) ─────── */

/* ── Dynamic PFZ Zone Cluster Identification & Geometry ─────── */

function generateClusterRing(centerLat, centerLon, radiusLat, radiusLon, points = 32) {
  const coords = [];
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const lat = centerLat + radiusLat * Math.sin(angle);
    const lon = centerLon + radiusLon * Math.cos(angle);
    coords.push([Number(lon.toFixed(3)), Number(lat.toFixed(3))]);
  }
  return coords;
}

/**
 * Identifies contiguous high-scoring PFZ candidate cells (pfz_score >= 0.65)
 * and groups them into spatial clusters using connected-component analysis.
 * Computes exact geometric centroid and dynamically sized bounding ellipse.
 *
 * @param {Object} gridData - { lats: number[], lons: number[], pfz_scores: number[][] }
 * @returns {Array<Object>} Array of clustered PFZ zones
 */
function identifyPfzClusters(gridData) {
  if (!gridData || !gridData.lats || !gridData.lons || !gridData.pfz_scores) {
    return [];
  }

  const lats = gridData.lats;
  const lons = gridData.lons;
  const scores = gridData.pfz_scores;
  const H = lats.length;
  const W = lons.length;
  const ELEVATED_THRESHOLD = 0.65;

  const visited = Array.from({ length: H }, () => Array(W).fill(false));
  const clusters = [];

  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (!visited[r][c] && scores[r][c] >= ELEVATED_THRESHOLD) {
        const cells = [];
        const queue = [[r, c]];
        visited[r][c] = true;

        while (queue.length > 0) {
          const [cr, cc] = queue.shift();
          cells.push({
            r: cr,
            c: cc,
            lat: lats[cr],
            lon: lons[cc],
            score: scores[cr][cc]
          });

          // 8-connectivity (orthogonal + diagonal neighbors)
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nr = cr + dr;
              const nc = cc + dc;
              if (nr >= 0 && nr < H && nc >= 0 && nc < W) {
                if (!visited[nr][nc] && scores[nr][nc] !== null && scores[nr][nc] >= ELEVATED_THRESHOLD) {
                  visited[nr][nc] = true;
                  queue.push([nr, nc]);
                }
              }
            }
          }
        }

        clusters.push(cells);
      }
    }
  }

  // 1. Filter clusters with minimum size threshold: cellCount >= 3 (eliminates 1-2 cell noise)
  const qualifyingClusters = clusters.filter(cells => cells.length >= 3);

  // 2. Compute spatial statistics & dynamic bounded sizing for candidate clusters
  const candidateZones = qualifyingClusters.map(cells => {
    const cellCount = cells.length;
    const centroidLat = cells.reduce((sum, cell) => sum + cell.lat, 0) / cellCount;
    const centroidLon = cells.reduce((sum, cell) => sum + cell.lon, 0) / cellCount;
    const minLat = Math.min(...cells.map(c => c.lat));
    const maxLat = Math.max(...cells.map(c => c.lat));
    const minLon = Math.min(...cells.map(c => c.lon));
    const maxLon = Math.max(...cells.map(c => c.lon));

    const avgScore = cells.reduce((sum, cell) => sum + cell.score, 0) / cellCount;
    const maxScore = Math.max(...cells.map(c => c.score));

    // Dynamic sizing based on actual cluster bounding extent with min & max visual caps:
    // Min visual radius: 0.85° lat x 1.10° lon (~95 x 120 km)
    // Max visual radius cap: 2.80° lat x 3.60° lon (~310 x 400 km) to prevent oversized basin-covering blobs
    const halfLat = (maxLat - minLat) / 2.0;
    const halfLon = (maxLon - minLon) / 2.0;
    const radiusLat = Math.min(2.80, Math.max(0.85, halfLat + 0.45));
    const radiusLon = Math.min(3.60, Math.max(1.10, halfLon + 0.55));

    return {
      centroidLat: Number(centroidLat.toFixed(3)),
      centroidLon: Number(centroidLon.toFixed(3)),
      minLat,
      maxLat,
      minLon,
      maxLon,
      radiusLat: Number(radiusLat.toFixed(3)),
      radiusLon: Number(radiusLon.toFixed(3)),
      cellCount,
      avgScore: Number(avgScore.toFixed(2)),
      maxScore: Number(maxScore.toFixed(2)),
      probScore: Number(avgScore.toFixed(2)),
    };
  });

  // 3. Sort by avgScore descending (with cellCount tie-breaker) and cap to top 5 zones
  candidateZones.sort((a, b) => (b.avgScore - a.avgScore) || (b.cellCount - a.cellCount));
  const topZones = candidateZones.slice(0, 5);

  // 4. Assign regional names, IDs, tags, and boundary rings
  return topZones.map((z, idx) => {
    let basinName = 'Arabian Sea';
    if (z.centroidLon >= 78.0 && z.centroidLon <= 95.0) basinName = 'Bay of Bengal';
    else if (z.centroidLon > 95.0) basinName = 'Andaman Sea';

    const id = `dynamic-zone-${idx + 1}`;
    const name = `${basinName} Candidate Zone ${idx + 1}`;
    const pfz_index = Number(z.avgScore.toFixed(2));
    const tag = `PFZ Index: ${pfz_index >= 0.70 ? 'Elevated' : 'Moderate'} (${pfz_index.toFixed(2)})`;

    return {
      ...z,
      id,
      name,
      tag,
      pfz_index,
      data_quality_flag: false,
      ring: generateClusterRing(z.centroidLat, z.centroidLon, z.radiusLat, z.radiusLon)
    };
  });
}

/**
 * Data-quality guard for temperature corruption bug.
 * Inspects raw temperature profile across standard depths in the 0-50m band
 * (depths: 0, 5, 10, 20, 30, 50m).
 * Flags if:
 *   a) Unphysical drop > 8°C between two adjacent standard depths in 0-50m
 *   b) 3+ consecutive identical temperature values within 0-50m
 *
 * @param {Array|Object} rawProfile - Array of numbers, array of objects, or depth->temp map
 * @returns {{ data_quality_flag: boolean, reason?: string }}
 */
function checkTemperatureDataQuality(rawProfile) {
  if (!rawProfile) return { data_quality_flag: false };

  let temps = [];
  if (Array.isArray(rawProfile)) {
    if (rawProfile.length > 0 && typeof rawProfile[0] === 'object' && rawProfile[0] !== null) {
      // Array of objects [{ depth: 0, temperature: 28.0 }, ...]
      const sorted = [...rawProfile]
        .filter(item => (item.depth ?? item.d) <= 50)
        .sort((a, b) => (a.depth ?? a.d) - (b.depth ?? b.d));
      temps = sorted.map(item => Number(item.temperature ?? item.temp ?? item.t));
    } else {
      // Array of numbers [t0, t1, t2, t3, t4, t5, ...]
      temps = rawProfile.slice(0, 6).map(Number);
    }
  } else if (typeof rawProfile === 'object' && rawProfile !== null) {
    // Dict { 0: t0, 5: t1, 10: t2, 20: t3, 30: t4, 50: t5 }
    const stdDepths = [0, 5, 10, 20, 30, 50];
    temps = stdDepths.filter(d => d in rawProfile).map(d => Number(rawProfile[d]));
  }

  if (temps.length < 2) {
    return { data_quality_flag: false };
  }

  // a) Unphysical drop > 8°C between adjacent standard depths in 0-50m
  for (let i = 0; i < temps.length - 1; i++) {
    const drop = temps[i] - temps[i + 1];
    if (drop > 8.0) {
      return {
        data_quality_flag: true,
        reason: `Unphysical drop of ${drop.toFixed(2)}°C (>8°C) between adjacent standard depths in 0-50m band`
      };
    }
  }

  // b) 3+ consecutive identical temperature values within 0-50m
  for (let i = 0; i < temps.length - 2; i++) {
    if (Math.abs(temps[i] - temps[i + 1]) < 1e-4 && Math.abs(temps[i + 1] - temps[i + 2]) < 1e-4) {
      return {
        data_quality_flag: true,
        reason: `3+ consecutive identical temperature values (${temps[i]}°C) within 0-50m band`
      };
    }
  }

  return { data_quality_flag: false };
}

/**
 * Evaluates candidate zone tier based on its pfz_index or avgScore.
 *
 * @param {Object} zone - Candidate zone object
 * @returns {'elevated'|'moderate'|'low'}
 */
function getZoneTier(zone) {
  const score = zone.pfz_index ?? zone.avgScore ?? zone.probScore ?? 0;
  if (score >= 0.70) return 'elevated';
  if (score >= 0.40) return 'moderate';
  return 'low';
}

/**
 * Determines whether a candidate zone qualifies for the auto-rendered map overlay.
 * Must not be flagged for corrupted temperature data, and must meet HIGHLIGHT_MIN_TIER.
 *
 * @param {Object} zone - Candidate zone object
 * @returns {boolean}
 */
function shouldHighlightZone(zone) {
  if (!zone) return false;
  if (zone.data_quality_flag) return false;

  const profile = zone.temps || zone.temperatures || zone.rawProfile || zone.tempProfile;
  if (profile) {
    const dq = checkTemperatureDataQuality(profile);
    if (dq.data_quality_flag) {
      zone.data_quality_flag = true;
      zone.data_quality_reason = dq.reason;
      return false;
    }
  }

  const zoneTier = getZoneTier(zone);
  const minRank = TIER_ORDER[HIGHLIGHT_MIN_TIER.toLowerCase()] ?? 3;
  const zoneRank = TIER_ORDER[zoneTier] ?? 1;
  return zoneRank >= minRank;
}

/**
 * Scores a candidate zone, inspecting its raw temperature profile (0-50m) for data quality.
 * If corrupted, marks data_quality_flag: true instead of computing a normal score.
 *
 * @param {Object} zone - Candidate zone object
 * @param {Array|Object} [tempProfile] - Raw temperature profile
 * @returns {Object} Updated zone
 */
function scoreCandidateZone(zone, tempProfile) {
  const profile = tempProfile || zone.temps || zone.temperatures || zone.rawProfile || zone.tempProfile;
  const dq = checkTemperatureDataQuality(profile);
  if (dq.data_quality_flag) {
    zone.data_quality_flag = true;
    zone.data_quality_reason = dq.reason;
    zone.pfz_index = null;
    zone.tier = 'flagged';
    return zone;
  }
  zone.data_quality_flag = false;
  const score = zone.pfz_index ?? zone.avgScore ?? zone.probScore ?? 0.70;
  zone.pfz_index = score;
  zone.tier = getZoneTier(zone);
  return zone;
}

/**
 * Fetches /pfz-grid for the target date, identifies dynamic clusters,
 * updates the MapLibre GeoJSON layer, and places fish icon markers at cluster centroids.
 * Restricts map rendering to Elevated candidate zones (pfz_index >= 0.70) with no
 * data-quality corruption flags.
 *
 * @param {string|Array} dateStr - Target date (YYYY-MM-DD) or custom zones array for testing
 * @param {Array} [customZones] - Optional custom zones array overriding network fetch
 */
async function loadAndRenderDynamicPfzZones(dateStr, customZones) {
  const startTime = performance.now();
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    currentDateStr = dateStr;
  }
  try {
    let zones = [];
    if (Array.isArray(customZones)) {
      zones = customZones;
    } else if (Array.isArray(dateStr)) {
      zones = dateStr;
    } else {
      const resp = await fetch(`http://localhost:8000/pfz-grid?date=${encodeURIComponent(dateStr)}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const gridData = await resp.json();
      zones = identifyPfzClusters(gridData);
      renderChlaOverlayFromGrid(gridData);
    }
    if (customZones && customZones.gridData) {
      renderChlaOverlayFromGrid(customZones.gridData);
    }

    // Ensure all zones have pfz_index, data_quality_flag evaluated
    zones.forEach(z => {
      if (z.pfz_index === undefined) {
        z.pfz_index = z.avgScore ?? z.probScore ?? 0.70;
      }
      if (z.data_quality_flag === undefined) {
        const profile = z.temps || z.temperatures || z.rawProfile || z.tempProfile;
        if (profile) {
          const dq = checkTemperatureDataQuality(profile);
          z.data_quality_flag = dq.data_quality_flag;
          if (dq.data_quality_flag) {
            z.data_quality_reason = dq.reason;
            z.pfz_index = null;
          }
        } else {
          z.data_quality_flag = false;
        }
      }
    });

    // All candidate zones remain stored in currentDynamicZones so manual location search
    // or clicking inside any zone (Elevated, Moderate, or Low) resolves the zone in the detail panel
    currentDynamicZones = zones;

    const durationMs = Math.round(performance.now() - startTime);
    if (isDevModeEnabled()) {
      console.log(`[Fisheries] Dynamically identified ${zones.length} PFZ candidate zones for ${typeof dateStr === 'string' ? dateStr : 'custom'} in ${durationMs}ms:`, {
        zonesCount: zones.length,
        zones: zones.map(z => ({
          id: z.id,
          name: z.name,
          centroid: [z.centroidLon, z.centroidLat],
          avgScore: z.avgScore,
          pfz_index: z.pfz_index,
          data_quality_flag: z.data_quality_flag,
        }))
      });
    }

    // Filter candidate zones for map overlay:
    // Only render polygon outlines and pulsing fish markers for zones meeting HIGHLIGHT_MIN_TIER
    // (default: pfz_index >= 0.70, Elevated tier) and with NO data quality corruption flags.
    const highlightedZones = zones.filter(z => shouldHighlightZone(z));

    // 1. Update MapLibre GeoJSON Source (PFZ dashed polygon outlines)
    const geojson = {
      type: 'FeatureCollection',
      features: highlightedZones.map(z => {
        const score = z.pfz_index ?? z.avgScore ?? z.probScore ?? 0.70;
        const tier = score >= 0.70 ? 'elevated' : (score >= 0.40 ? 'moderate' : 'low');
        const fillColor = score >= 0.70 ? '#10B981' : (score >= 0.40 ? '#F59E0B' : '#64748B');
        const lineColor = score >= 0.70 ? '#10B981' : (score >= 0.40 ? '#F59E0B' : '#64748B');
        const fillOpacity = score >= 0.70 ? 0.22 : (score >= 0.40 ? 0.16 : 0.08);
        const lineWidth = score >= 0.70 ? 2.4 : (score >= 0.40 ? 1.8 : 1.2);

        return {
          type: 'Feature',
          properties: {
            id: z.id,
            name: z.name,
            pfz_index: z.pfz_index ?? score,
            avgScore: z.avgScore ?? score,
            cellCount: z.cellCount,
            tier: tier,
            fillColor: fillColor,
            lineColor: lineColor,
            fillOpacity: fillOpacity,
            lineWidth: lineWidth,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [z.ring]
          }
        };
      })
    };

    const activeMap = (typeof map !== 'undefined' && map) || (typeof window !== 'undefined' && window.map) || (typeof global !== 'undefined' && global.map);
    if (activeMap && activeMap.getSource) {
      const source = activeMap.getSource('pfz-zones');
      if (source) {
        source.setData(geojson);
      }
    }

    // 2. Clear old fish markers and place new ones ONLY for highlighted zones
    activeFishMarkers.forEach(m => m.remove());
    activeFishMarkers = [];

    const MarkerClass = (typeof maplibregl !== 'undefined' && maplibregl && maplibregl.Marker)
      || (typeof window !== 'undefined' && window.maplibregl && window.maplibregl.Marker)
      || (typeof global !== 'undefined' && global.maplibregl && global.maplibregl.Marker);

    if (activeMap && activeMap.getContainer && MarkerClass) {
      highlightedZones.forEach(z => {
        const el = buildFishBadgeElement(z);
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          selectLocation(z.centroidLat, z.centroidLon, true);
        });
        const marker = new MarkerClass({ element: el, anchor: 'center' })
          .setLngLat([z.centroidLon, z.centroidLat])
          .addTo(activeMap);
        activeFishMarkers.push(marker);
      });
    }

    highlightedZones.allZones = zones;
    highlightedZones.geojson = geojson;
    return highlightedZones;
  } catch (err) {
    console.warn('[Fisheries] /pfz-grid fetch failed or unavailable:', err.message);
    return [];
  }
}

/* ── DOM Element Builders (Marker Pin, Popup Card & Fish Badges) ── */

function buildTeardropPin() {
  const wrap = document.createElement('div');
  wrap.className = 'custom-marker-wrapper';
  wrap.innerHTML = `
    <div class="custom-marker__pin">
      <svg width="30" height="40" viewBox="0 0 30 40" fill="none">
        <path d="M15 0C6.71573 0 0 6.71573 0 15C0 26.25 15 40 15 40C15 40 30 26.25 30 15C30 6.71573 23.2843 0 15 0Z" fill="#1D4ED8" stroke="#FFFFFF" stroke-width="2.5"/>
        <circle cx="15" cy="14" r="5" fill="#FFFFFF"/>
      </svg>
    </div>
  `;
  return wrap;
}

function buildFishBadgeElement(zone) {
  const wrap = document.createElement('div');
  wrap.className = 'pfz-fish-marker-wrap';
  const score = zone ? (zone.avgScore ?? zone.probScore ?? 0.70) : 0.70;
  const tier = score >= 0.70 ? 'elevated' : (score >= 0.40 ? 'moderate' : 'low');
  wrap.setAttribute('data-tier', tier);

  // Pulsing highlight ring - separate child element animated with scale/opacity only
  const pulse = document.createElement('div');
  pulse.className = 'pfz-fish-pulse';
  wrap.appendChild(pulse);

  // Dashed circle badge containing the fish icon SVG
  const el = document.createElement('div');
  el.className = 'pfz-fish-badge';
  el.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2">
      <path d="M2 16s1-5 8-5 8 5 8 5-2 2-8 2-8-2-8-2z"/>
      <path d="M18 11c1-2 3-4 3-4s-1 2-1 4 1 4 1 4-2-2-3-4z"/>
      <circle cx="8" cy="11" r="1.2" fill="#FFFFFF"/>
    </svg>
  `;
  wrap.appendChild(el);
  return wrap;
}

function buildPopupHtml(lat, lon, zone, probScore) {
  const coordText = `${lat.toFixed(1)}°N, ${lon.toFixed(1)}°E`;
  const isFlagged = Boolean(probScore === null || (zone && zone.data_quality_flag));

  if (isFlagged) {
    const sub = (zone && zone.data_quality_reason)
      ? zone.data_quality_reason
      : 'Upper ocean temperature profile (0–50m) contains unphysical gradients. PFZ calculation suppressed.';
    return `
    <div class="ky-pfz-speech-bubble">
      <div class="ky-pfz-speech-bubble__title">PFZ Index: Data Flagged</div>
      <div class="ky-pfz-speech-bubble__sub">${sub}</div>
      <span class="ky-provenance-pill ky-provenance-pill--heuristic ky-pfz-speech-bubble__provenance">Quality Guard</span>
      <div class="ky-pfz-speech-bubble__coord">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="#2563EB"><path d="M12 2L2 12l10 10 10-10L12 2z"/></svg>
        ${coordText}
      </div>
      <div class="ky-pfz-speech-bubble__badge">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="#F59E0B"><circle cx="12" cy="12" r="8"/></svg>
        Data Flagged
      </div>
    </div>
  `;
  }

  const rawScore = (probScore !== undefined && probScore !== null && !isNaN(probScore))
    ? Number(probScore)
    : (zone ? (zone.pfz_index ?? zone.avgScore ?? zone.probScore ?? 0.65) : 0.65);
  const score = (typeof rawScore === 'number' && !isNaN(rawScore)) ? rawScore : 0.65;

  const tier = score >= 0.70 ? 'Elevated' : (score >= 0.40 ? 'Moderate' : 'Low');
  const badgeDotColor = score >= 0.70 ? '#16A34A' : (score >= 0.40 ? '#2563EB' : '#D97706');
  const title = `PFZ Index: ${tier}`;
  let sub = 'Multi-parameter oceanographic index';
  let probBadge = '';

  if (score >= 0.70) {
    sub = zone ? (zone.name || 'Active upwelling signature & thermocline shoaling') : 'Active upwelling signature & thermocline shoaling';
    probBadge = `Elevated index (${score.toFixed(2)})`;
  } else if (score >= 0.40) {
    sub = zone ? (zone.name || 'Intermediate thermocline; moderate thermal gradient') : 'Intermediate thermocline; moderate thermal gradient';
    probBadge = `Moderate index (${score.toFixed(2)})`;
  } else {
    sub = zone ? (zone.name || 'Deep thermocline or stratified water column') : 'Deep thermocline or stratified water column';
    probBadge = `Low index (${score.toFixed(2)})`;
  }

  return `
    <div class="ky-pfz-speech-bubble">
      <div class="ky-pfz-speech-bubble__title">${title}</div>
      <div class="ky-pfz-speech-bubble__sub">${sub}</div>
      <span class="ky-provenance-pill ky-provenance-pill--heuristic ky-pfz-speech-bubble__provenance">Estimated Heuristic</span>
      <div class="ky-pfz-speech-bubble__coord">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="#2563EB"><path d="M12 2L2 12l10 10 10-10L12 2z"/></svg>
        ${coordText}
      </div>
      <div class="ky-pfz-speech-bubble__badge">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="${badgeDotColor}"><circle cx="12" cy="12" r="8"/></svg>
        ${probBadge}
      </div>
    </div>
  `;
}

/* ── Fallback Profile Generator (Realistic Physical Oceanography) ── */

function calculateSubsurfaceProfile(lat, lon) {
  // In the Bay of Bengal hotspot (12.4°N, 88.6°E), values closely match mockup:
  // 0m: 28.4 | 25m: 27.9 | 50m: 26.8 | 100m: 24.1 (highlight) | 200m: 20.3 | 300m: 16.8 | 500m: 12.6 | 750m: 8.7 | 1000m: 5.1
  const isBoB = Math.hypot(lat - 12.4, lon - 88.6) < 1.0;
  
  const sst = isBoB ? 28.4 : (28.6 - (lat - 5.0) * 0.15 + Math.cos(lon * 0.1) * 0.3);

  const temps = DEPTH_LEVELS.map(depth => {
    if (depth === 0) return parseFloat(sst.toFixed(1));
    if (depth === 25) return parseFloat((sst - 0.5).toFixed(1));
    if (depth === 50) return parseFloat((sst - 1.6).toFixed(1));
    if (depth === 100) return parseFloat((sst - 4.3).toFixed(1)); // ~24.1
    if (depth === 200) return parseFloat((sst - 8.1).toFixed(1)); // ~20.3
    if (depth === 300) return parseFloat((sst - 11.6).toFixed(1)); // ~16.8
    if (depth === 500) return parseFloat((sst - 15.8).toFixed(1)); // ~12.6
    if (depth === 750) return parseFloat((sst - 19.7).toFixed(1)); // ~8.7
    if (depth === 1000) return parseFloat((sst - 23.3).toFixed(1)); // ~5.1
    return 10.0;
  });

  const nutrients = DEPTH_LEVELS.map(depth => {
    if (depth === 0) return 0.12;
    if (depth === 25) return 0.18;
    if (depth === 50) return 0.42;
    if (depth === 100) return 1.26; // Subsurface peak / Deep Chlorophyll Maximum
    if (depth === 200) return 2.14;
    if (depth === 300) return 1.87;
    if (depth === 500) return 1.12;
    if (depth === 750) return 0.65;
    if (depth === 1000) return 0.32;
    return 0.10;
  });

  return { temps, nutrients };
}

/* ── UI Update Functions ─────────────────────────────────── */

function renderTable(depths, temps, nutrients, highlightDepth = 100) {
  const tbody = document.getElementById('tvd-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  depths.forEach((d, i) => {
    const tr = document.createElement('tr');
    if (d === highlightDepth) {
      tr.className = 'ky-tvd-table-row--highlight';
    }
    tr.innerHTML = `
      <td>${d}</td>
      <td>${temps[i].toFixed(1)}</td>
      <td>${nutrients[i].toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderChart(depths, temps, nutrients) {
  const canvas = document.getElementById('profile-chart');
  if (!canvas) return;

  if (profileChart) {
    profileChart.destroy();
  }

  profileChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: depths,
      datasets: [
        {
          label: 'Temperature (°C) [Model Output]',
          data: temps,
          borderColor: '#2563EB',
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
          fill: true,
          tension: 0.3,
          borderWidth: 2.2,
          pointRadius: 3,
          pointBackgroundColor: '#2563EB',
          yAxisID: 'yTemp'
        },
        {
          label: 'Chlorophyll proxy (mg/m³) [Estimated DCM]',
          data: nutrients,
          borderColor: '#10B981',
          borderDash: [5, 4],
          backgroundColor: 'transparent',
          tension: 0.3,
          borderWidth: 2.2,
          pointRadius: 3,
          pointBackgroundColor: '#10B981',
          yAxisID: 'yNutr'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { boxWidth: 12, font: { family: 'Inter', size: 11 } }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Depth (m)', font: { size: 11, weight: '600' } },
          grid: { color: '#F1F5F9' }
        },
        yTemp: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'Temperature (°C)', color: '#1D4ED8', font: { size: 11, weight: '600' } },
          grid: { color: '#E2E8F0' }
        },
        yNutr: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'Chlorophyll proxy (mg/m³) — est.', color: '#059669', font: { size: 11, weight: '600' } },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

function updateStatCards(zone, thermocline, upwelling, pfzScore, nutrientVal) {
  const tcEl = document.getElementById('stat-thermocline-val');
  const upEl = document.getElementById('stat-upwelling-val');
  const pfzEl = document.getElementById('stat-pfz-val');
  const pfzBadge = document.getElementById('stat-pfz-badge');
  const nutrEl = document.getElementById('stat-nutrient-val');

  const tcNote = document.getElementById('stat-thermocline-note');
  const upNote = document.getElementById('stat-upwelling-note');
  const pfzNote = document.getElementById('stat-pfz-note');
  const nutrNote = document.getElementById('stat-nutrient-note');

  if (tcEl) tcEl.textContent = `${Math.round(thermocline)} m`;
  if (upEl) upEl.textContent = upwelling.toFixed(2);

  const isFlagged = Boolean(pfzScore === null || (zone && zone.data_quality_flag));
  if (isFlagged) {
    if (pfzEl) pfzEl.textContent = '—';
    if (pfzNote) pfzNote.textContent = (zone && zone.data_quality_reason) || 'Data quality flagged (0–50 m anomaly)';
    if (pfzBadge) {
      pfzBadge.style.display = '';
      pfzBadge.textContent = 'Data Flagged';
      pfzBadge.className = 'ky-stat-card__badge ky-stat-card__badge--amber';
    }
  } else if (pfzScore !== undefined && pfzScore !== null && !isNaN(pfzScore)) {
    if (pfzEl) pfzEl.textContent = pfzScore.toFixed(2);
    if (pfzNote) pfzNote.textContent = 'Combined oceanographic score';
    if (pfzBadge) {
      pfzBadge.style.display = '';
      if (pfzScore >= 0.70) {
        pfzBadge.textContent = 'High';
        pfzBadge.className = 'ky-stat-card__badge ky-stat-card__badge--green';
      } else if (pfzScore >= 0.40) {
        pfzBadge.textContent = 'Moderate';
        pfzBadge.className = 'ky-stat-card__badge ky-stat-card__badge--blue';
      } else {
        pfzBadge.textContent = 'Low';
        pfzBadge.className = 'ky-stat-card__badge ky-stat-card__badge--amber';
      }
    }
  }

  if (tcNote) tcNote.textContent = 'Max vertical gradient (dT/dz)';
  if (upNote) upNote.textContent = 'Derived from 0–50 m thermal gradient';
  if (nutrNote) nutrNote.textContent = 'Surface value (matches 0m depth)';

  if (nutrEl) nutrEl.textContent = `${nutrientVal.toFixed(2)} mg/m³`;
}

/**
 * Evaluates dynamic key insight bullets from vertical temperature indices.
 * Reconciles potential contradictions between thermocline depth (profile-wide gradient)
 * and upwelling index (0-50m surface gradient).
 *
 * @param {number} thermocline - Thermocline depth in meters
 * @param {number} upwelling - Upwelling index in [0, 1]
 * @param {number} pfzScore - PFZ confidence score in [0, 1]
 * @returns {string[]} Array of 2 or 3 insight bullet strings
 */
function getKeyInsights(thermocline, upwelling, pfzScore) {
  // 1. Classify thermocline depth
  const tcClass = thermocline <= 75 ? 'shallow' : (thermocline <= 110 ? 'intermediate' : 'deep');

  // 2. Classify upwelling index
  const upwClass = upwelling >= 0.50 ? 'strong' : (upwelling >= 0.20 ? 'moderate' : 'minimal');

  // 3. Reconcile contradictory signals:
  // - Deep thermocline (>110m) + Strong/Moderate upwelling (>=0.20)
  // - Shallow thermocline (<=75m) + Minimal upwelling (<0.20)
  const isConflicting = (tcClass === 'deep' && (upwClass === 'strong' || upwClass === 'moderate')) ||
                        (tcClass === 'shallow' && upwClass === 'minimal');

  if (isConflicting) {
    const reconciling = `Mixed subsurface signal: thermocline depth (~${Math.round(thermocline)}m) and near-surface thermal gradient give conflicting upwelling indicators — treat with caution pending field verification.`;
    const recommendation = 'Inconclusive oceanographic indicators; recommend field sampling before survey prioritization.';
    return [reconciling, recommendation];
  }

  // 4. Agreed / Non-conflicting signals:
  let ins1 = '';
  if (tcClass === 'shallow') {
    ins1 = `Shallow thermocline (depth ~${Math.round(thermocline)}m) compresses pelagic habitat toward the euphotic zone.`;
  } else if (tcClass === 'intermediate') {
    ins1 = `Intermediate thermocline depth (~${Math.round(thermocline)}m) indicates typical tropical open-ocean stratification.`;
  } else {
    ins1 = `Deep thermocline (~${Math.round(thermocline)}m) suggests downwelling or thick warm surface mixed layer.`;
  }

  let ins2 = '';
  if (upwClass === 'strong') {
    ins2 = `Strong upwelling signature (index: ${upwelling.toFixed(2)}) indicated by pronounced surface-to-50m thermal gradient.`;
  } else if (upwClass === 'moderate') {
    ins2 = `Moderate upwelling signature (index: ${upwelling.toFixed(2)}) detected in upper layer thermal structure.`;
  } else {
    ins2 = `Minimal upwelling signal detected (index: ${upwelling.toFixed(2)}); thermal stratification predominates.`;
  }

  let ins3 = '';
  if (pfzScore >= 0.70) {
    ins3 = 'Recommended candidate area for research vessel survey and INCOIS satellite correlation.';
  } else if (pfzScore >= 0.40) {
    ins3 = 'Borderline oceanographic indicators; field sampling recommended to verify biomass.';
  } else {
    ins3 = 'Unfavorable physical indicators for pelagic aggregation during this period.';
  }

  return [ins1, ins2, ins3];
}
if (typeof window !== 'undefined') {
  window.getKeyInsights = getKeyInsights;
}

// NOTE: updateAdvisory and getKeyInsights (including the mixed-signal reconciliation logic)
// are currently unused in the simplified UI, but are intentionally preserved here for future restoration.
function updateAdvisory(pfzScore, upwelling, thermocline, zone) {
  const advText = document.getElementById('pfz-advisory-text');
  const ins1 = document.getElementById('insight-1');
  const ins2 = document.getElementById('insight-2');
  const ins3 = document.getElementById('insight-3');

  // 1. Dynamic Tiered PFZ Advisory Callout
  if (advText) {
    if (pfzScore >= 0.70) {
      advText.textContent = 'Elevated PFZ likelihood based on thermocline shoaling and upwelling signal. Historically associated with pelagic aggregation — not validated against catch data.';
    } else if (pfzScore >= 0.40) {
      advText.textContent = 'Moderate PFZ likelihood. Conditions partially favorable; upwelling or thermocline signal weak.';
    } else {
      advText.textContent = 'Low PFZ likelihood based on current indices. Deep thermocline and/or weak upwelling signal.';
    }
  }

  // 2. Dynamic Key Insights with Subsurface Signal Reconciliation
  const insights = getKeyInsights(thermocline, upwelling, pfzScore);

  if (insights.length === 2) {
    if (ins1) {
      ins1.textContent = insights[0];
      const li1 = ins1.closest ? ins1.closest('.ky-insights__item') : ins1.parentElement;
      if (li1) li1.style.display = '';
    }
    if (ins2) {
      ins2.textContent = '';
      const li2 = ins2.closest ? ins2.closest('.ky-insights__item') : ins2.parentElement;
      if (li2) li2.style.display = 'none';
    }
    if (ins3) {
      ins3.textContent = insights[1];
      const li3 = ins3.closest ? ins3.closest('.ky-insights__item') : ins3.parentElement;
      if (li3) li3.style.display = '';
    }
  } else {
    if (ins1) {
      ins1.textContent = insights[0];
      const li1 = ins1.closest ? ins1.closest('.ky-insights__item') : ins1.parentElement;
      if (li1) li1.style.display = '';
    }
    if (ins2) {
      ins2.textContent = insights[1];
      const li2 = ins2.closest ? ins2.closest('.ky-insights__item') : ins2.parentElement;
      if (li2) li2.style.display = '';
    }
    if (ins3) {
      ins3.textContent = insights[2];
      const li3 = ins3.closest ? ins3.closest('.ky-insights__item') : ins3.parentElement;
      if (li3) li3.style.display = '';
    }
  }
}

/* ── Select Location Handler ─────────────────────────────── */

async function selectLocation(lat, lon, zoomTo = true) {
  if (!isCoordInsideNorthIndianOcean(lat, lon)) {
    showNotice('This location is outside our supported region (North Indian Ocean: 5°N–30°N, 45°E–105°E)');
    return false;
  }

  if (checkIsLand(lat, lon)) {
    showNotice('Selected location is on land. Please select an ocean point within the North Indian Ocean.');
    return false;
  }

  currentCoord = { lat, lon };

  // Find if matching one of our dynamic PFZ zones (or preset fallback)
  const matchedZone = (currentDynamicZones && currentDynamicZones.find(z => Math.hypot(z.centroidLat - lat, z.centroidLon - lon) < (z.radiusLat + z.radiusLon) / 2)) ||
                      PRESET_ZONES.find(z => Math.hypot(z.lat - lat, z.lon - lon) < 1.0);

  // Update panel coordinate text
  const coordBadge = document.getElementById('selected-loc-coord');
  if (coordBadge) {
    coordBadge.textContent = `${lat.toFixed(1)}°N, ${lon.toFixed(1)}°E`;
  }

  // Remove existing marker and popup
  if (typeof maplibregl !== 'undefined' && map) {
    if (currentMarker) currentMarker.remove();
    if (currentPopup) currentPopup.remove();

    // Create new marker pin
    currentMarker = new maplibregl.Marker({
      element: buildTeardropPin(),
      anchor: 'bottom',
    })
      .setLngLat([lon, lat])
      .addTo(map);

    // Smooth zoom/fly in to clicked point matching Dashboard (app.js) behavior
    if (zoomTo && map.flyTo) {
      map.flyTo({
        center: [lon, lat],
        zoom: Math.max(map.getZoom(), 5),
        duration: 800,
      });
    }
  }

  // If date is not selected yet, prompt user to pick date without firing /predict or opening speech popup
  if (!currentDateStr) {
    updateEmptyStatePrompt();
    return true;
  }

  // Both location and date are present: attach speech bubble popup card
  if (typeof maplibregl !== 'undefined' && map) {
    // Determine dynamic anchor and offset to prevent clipping at viewport edges
    let popupAnchor = 'bottom';
    if (map.project && map.getContainer) {
      try {
        const container = map.getContainer();
        if (container) {
          const pt = map.project([lon, lat]);
          const h = container.clientHeight;

          // If point is within the upper 160px of the container, anchor at 'top' (popup hangs downwards)
          // Otherwise anchor at 'bottom' (popup rises upwards)
          if (pt.y < 160) {
            popupAnchor = 'top';
          } else {
            popupAnchor = 'bottom';
          }

          // Auto-pan / edge cushioning: if click is close to viewport edges, ease map so popup is never clipped
          // Only perform manual panBy when zoomTo is false; when zoomTo is true, flyTo centers the viewport
          if (!zoomTo && map.panBy) {
            if (pt.y > h - 100) {
              map.panBy([0, 100], { duration: 300 });
            } else if (pt.y < 90) {
              map.panBy([0, -100], { duration: 300 });
            }
          }
        }
      } catch (e) {
        popupAnchor = 'bottom';
      }
    }

    // Attach speech bubble popup card with dynamic anchor & multi-anchor offsets
    currentPopup = new maplibregl.Popup({
      offset: {
        'top': [0, 12],
        'top-left': [0, 12],
        'top-right': [0, 12],
        'bottom': [0, -42],
        'bottom-left': [0, -42],
        'bottom-right': [0, -42],
        'left': [15, -15],
        'right': [-15, -15]
      },
      closeButton: false,
      closeOnClick: false,
      anchor: popupAnchor,
    })
      .setLngLat([lon, lat])
      .setHTML(buildPopupHtml(lat, lon, matchedZone))
      .addTo(map);
  }

  // Fetch real model prediction & oceanographic indices from backend API
  let temps, nutrients, thermocline, upwelling, pfzScore, nutrientVal, highlightDepth;
  const startTime = Date.now();
  console.log(`[Fisheries API] POST /predict started for (${lat.toFixed(3)}, ${lon.toFixed(3)}) on ${currentDateStr}`);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS) : null;

  try {
    const res = await fetch(`${API_BASE}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: lat,
        longitude: lon,
        date: currentDateStr,
      }),
      signal: controller ? controller.signal : undefined,
    });
    if (timeoutId) clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.detail || `Server error ${res.status}`);
    }

    const data = await res.json();
    const elapsed = Date.now() - startTime;
    console.log(`[Fisheries API] POST /predict succeeded in ${elapsed}ms (${(elapsed / 1000).toFixed(2)}s)`);
    const modelDepths = data.depths || [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000];
    const modelTemps = data.temps;
    const indices = data.indices || {};

    // Map model temps to table DEPTH_LEVELS using interpolation or exact match
    temps = DEPTH_LEVELS.map(d => {
      const idx = modelDepths.indexOf(d);
      if (idx !== -1) return Number(modelTemps[idx].toFixed(1));
      for (let i = 0; i < modelDepths.length - 1; i++) {
        if (d > modelDepths[i] && d < modelDepths[i + 1]) {
          const frac = (d - modelDepths[i]) / (modelDepths[i + 1] - modelDepths[i]);
          return Number((modelTemps[i] + (modelTemps[i + 1] - modelTemps[i]) * frac).toFixed(1));
        }
      }
      return 10.0;
    });

    // Real oceanographic indices from backend prediction
    const isDataFlagged = indices.data_quality_flag === true || (matchedZone && matchedZone.data_quality_flag === true);
    if (isDataFlagged && matchedZone) {
      matchedZone.data_quality_flag = true;
      if (indices.data_quality_reason) matchedZone.data_quality_reason = indices.data_quality_reason;
    }
    thermocline = indices.thermocline_depth !== undefined ? indices.thermocline_depth : (matchedZone ? (matchedZone.thermocline ?? 68) : 68);
    upwelling = indices.upwelling_index !== undefined ? indices.upwelling_index : (matchedZone ? (matchedZone.upwelling ?? 0.72) : 0.72);

    // Single source of truth for candidate zone score:
    // If a candidate zone was matched, use its authoritative score (matchedZone.pfz_index ?? matchedZone.avgScore)
    // so that the map highlight tier, popup badge, and stat cards agree identically.
    // For arbitrary ocean coordinates outside candidate zones, use the point prediction pfz_confidence_score.
    if (isDataFlagged) {
      pfzScore = null;
    } else if (matchedZone && (matchedZone.pfz_index !== undefined || matchedZone.avgScore !== undefined)) {
      pfzScore = matchedZone.pfz_index ?? matchedZone.avgScore;
    } else {
      pfzScore = indices.pfz_confidence_score !== undefined ? indices.pfz_confidence_score : (matchedZone ? (matchedZone.probScore ?? matchedZone.avgScore ?? 0.87) : 0.87);
    }

    // Chlorophyll distinction (reconciled representations):
    // - Surface Chlorophyll-a stat card (Option a): Directly displays the SURFACE (0m) table value (nutrients[0]),
    //   providing 1:1 direct traceability between the summary card and row 0 of the vertical profile table.
    // - indices.chlorophyll_a: Surface scalar proxy (mg/m³) evaluated from near-surface physical dynamics
    //   (upwelling, SLA, current), used as biological driver in PFZ scoring and DCM profile generation.
    // - indices.nutrients: Depth-resolved vertical primary productivity profile (mg/m³) modeling the Deep
    //   Chlorophyll Maximum (DCM) Gaussian peak around thermocline depth, rendered in the vertical profile table and chart.

    // Consume vertical nutrient/chlorophyll profile directly from backend indices.nutrients
    // Linearly interpolate 15-depth array to display DEPTH_LEVELS [0, 25, 50, 100, 200, 300, 500, 750, 1000]
    const backendNutrients = indices.nutrients;
    if (backendNutrients && Array.isArray(backendNutrients) && backendNutrients.length > 0) {
      nutrients = DEPTH_LEVELS.map(d => {
        const idx = modelDepths.indexOf(d);
        if (idx !== -1 && idx < backendNutrients.length) {
          return Number(backendNutrients[idx].toFixed(2));
        }
        for (let i = 0; i < modelDepths.length - 1; i++) {
          if (d > modelDepths[i] && d < modelDepths[i + 1]) {
            const frac = (d - modelDepths[i]) / (modelDepths[i + 1] - modelDepths[i]);
            const val = backendNutrients[i] + (backendNutrients[i + 1] - backendNutrients[i]) * frac;
            return Number(val.toFixed(2));
          }
        }
        return Number(backendNutrients[backendNutrients.length - 1].toFixed(2));
      });

      if (isDevModeEnabled()) {
        console.log('[Fisheries] Chlorophyll proxy profile received from backend indices.nutrients and interpolated to DEPTH_LEVELS:', {
          source: 'backend.indices.nutrients',
          backend_depths: modelDepths,
          backend_nutrients: backendNutrients,
          display_depth_levels: DEPTH_LEVELS,
          interpolated_nutrients: nutrients,
        });
      }
    } else {
      // Physical fallback if backend nutrients unavailable
      const fallback = calculateSubsurfaceProfile(lat, lon);
      nutrients = fallback.nutrients;
      if (isDevModeEnabled()) {
        console.warn('[Fisheries] backend indices.nutrients missing, using physical fallback');
      }
    }

    // Surface Chlorophyll-a stat card (Option a):
    // Display the SURFACE (0m) table value directly, providing 1:1 direct traceability
    // between the summary card and row 0 of the vertical profile table.
    const surfaceChla = (nutrients && nutrients.length > 0) ? nutrients[0] : (indices.chlorophyll_a ?? 2.60);

    // Highlight closest depth to thermocline
    highlightDepth = DEPTH_LEVELS.reduce((prev, curr) =>
      Math.abs(curr - thermocline) < Math.abs(prev - thermocline) ? curr : prev, DEPTH_LEVELS[0]);

    revealTvdPanel();
    renderTable(DEPTH_LEVELS, temps, nutrients, highlightDepth);
    renderChart(DEPTH_LEVELS, temps, nutrients);
    updateStatCards(matchedZone, thermocline, upwelling, pfzScore, surfaceChla);
    // updateAdvisory(pfzScore, upwelling, thermocline, matchedZone); // Intentionally omitted in simplified UI

    // Update popup with real probability score
    if (currentPopup) {
      currentPopup.setHTML(buildPopupHtml(lat, lon, matchedZone, pfzScore));
    }

  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    const elapsed = Date.now() - startTime;
    console.error(`[Fisheries API] POST /predict failed after ${elapsed}ms (${(elapsed / 1000).toFixed(2)}s):`, err.message || err);
    console.warn('Backend /predict unavailable, using physical fallback:', err.message);
    const fallback = calculateSubsurfaceProfile(lat, lon);
    temps = fallback.temps;
    nutrients = fallback.nutrients;
    thermocline = matchedZone ? (matchedZone.thermocline ?? 68) : 68;
    const isFallbackFlagged = Boolean(matchedZone && matchedZone.data_quality_flag);
    pfzScore = isFallbackFlagged ? null : (matchedZone ? (matchedZone.pfz_index ?? matchedZone.avgScore ?? matchedZone.probScore ?? 0.87) : 0.87);
    const surfaceChla = (nutrients && nutrients.length > 0) ? nutrients[0] : (matchedZone ? (matchedZone.nutrient ?? 2.60) : 2.60);
    highlightDepth = matchedZone ? (matchedZone.highlightDepth ?? 100) : 100;

    revealTvdPanel();
    renderTable(DEPTH_LEVELS, temps, nutrients, highlightDepth);
    renderChart(DEPTH_LEVELS, temps, nutrients);
    updateStatCards(matchedZone, thermocline, upwelling, pfzScore, surfaceChla);
    // updateAdvisory(pfzScore, upwelling, thermocline, matchedZone); // Intentionally omitted in simplified UI

    if (currentPopup) {
      currentPopup.setHTML(buildPopupHtml(lat, lon, matchedZone, pfzScore));
    }
  }

  return true;
}

/* ── MapLibre Initialization ─────────────────────────────── */

let map = null;

if (typeof maplibregl !== 'undefined' && typeof document !== 'undefined' && document.getElementById('map')) {
  map = new maplibregl.Map({
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
          attribution: 'Tiles &copy; Esri &mdash; Maxar, Earthstar Geographics',
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
    center: [75.0, 15.0],
    zoom: 4.2,
    minZoom: 3.0,
    maxZoom: 11,
    attributionControl: false,
  });

  map.on('load', () => {
    // 1. Add Chlorophyll-a High-Res Raster Overlay (initially transparent placeholder)
    const blankCanvas = createBlankCanvas();
    map.addSource('chla-raster-source', {
      type: 'image',
      url: blankCanvas ? blankCanvas.toDataURL() : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      coordinates: [
        [BOUNDS.west, BOUNDS.north],
        [BOUNDS.east, BOUNDS.north],
        [BOUNDS.east, BOUNDS.south],
        [BOUNDS.west, BOUNDS.south]
      ]
    });

    map.addLayer({
      id: 'chla-raster-layer',
      type: 'raster',
      source: 'chla-raster-source',
      paint: {
        'raster-opacity': 0.82,
        'raster-fade-duration': 200,
      }
    });

    // 2. Add PFZ Vector Outlines & Fill (Dynamic GeoJSON Source)
    map.addSource('pfz-zones', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
      id: 'pfz-zones-fill',
      type: 'fill',
      source: 'pfz-zones',
      paint: {
        'fill-color': ['coalesce', ['get', 'fillColor'], '#10B981'],
        'fill-opacity': ['coalesce', ['get', 'fillOpacity'], 0.16]
      }
    });

    map.addLayer({
      id: 'pfz-zones-line',
      type: 'line',
      source: 'pfz-zones',
      paint: {
        'line-color': ['coalesce', ['get', 'lineColor'], '#FFFFFF'],
        'line-width': ['coalesce', ['get', 'lineWidth'], 2.2],
        'line-dasharray': [3, 2]
      }
    });

    // 3. Geographic Labels matching reference mockup
    const MOCKUP_GEO_LABELS = [
      { text: 'AFRICA', coords: [44.0, 14.0], cls: 'map-geo-label--land' },
      { text: 'SOMALIA', coords: [49.0, 5.5], cls: 'map-geo-label--land' },
      { text: 'SAUDI ARABIA', coords: [51.5, 23.5], cls: 'map-geo-label--land' },
      { text: 'YEMEN', coords: [47.5, 15.5], cls: 'map-geo-label--land' },
      { text: 'OMAN', coords: [56.5, 21.0], cls: 'map-geo-label--land' },
      { text: 'IRAN', coords: [58.0, 29.0], cls: 'map-geo-label--land' },
      { text: 'PAKISTAN', coords: [66.0, 26.5], cls: 'map-geo-label--land' },
      { text: 'INDIA', coords: [78.5, 21.5], cls: 'map-geo-label--land' },
      { text: 'BANGLADESH', coords: [90.0, 24.0], cls: 'map-geo-label--land' },
      { text: 'MYANMAR', coords: [96.0, 20.0], cls: 'map-geo-label--land' },
      { text: 'THAILAND', coords: [100.5, 15.5], cls: 'map-geo-label--land' },
      { text: 'SRI LANKA', coords: [81.5, 7.5], cls: 'map-geo-label--island' },
      { text: 'INDONESIA', coords: [98.5, 4.0], cls: 'map-geo-label--land' },
      { text: 'Arabian Sea', coords: [65.0, 16.0], cls: 'map-geo-label--sea' },
      { text: 'Bay of Bengal', coords: [89.0, 15.0], cls: 'map-geo-label--basin' },
      { text: 'Indian Ocean', coords: [78.0, 6.0], cls: 'map-geo-label--ocean' },
    ];

    MOCKUP_GEO_LABELS.forEach(lbl => {
      const el = document.createElement('div');
      el.className = `map-geo-label ${lbl.cls || ''}`;
      el.textContent = lbl.text;
      new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(lbl.coords)
        .addTo(map);
    });

    // 4. Initial Selection: Empty prompt state (no auto-load until user selects location and date)
    updateEmptyStatePrompt();

    // Force initial resize
    map.resize();
  });

  // Click on map to select location (both inside and outside dynamic PFZ zones)
  map.on('click', (e) => {
    selectLocation(e.lngLat.lat, e.lngLat.lng, true);
  });

  map.on('mouseenter', 'pfz-zones-fill', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'pfz-zones-fill', () => {
    map.getCanvas().style.cursor = '';
  });
}

/* ── UI Controls & Event Listeners ───────────────────────── */

function initControls() {
  // Zoom Controls
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => map.zoomIn());
  }
  if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => map.zoomOut());
  }

  // Formula Breakdown Modal Controls
  const btnFormulaInfo = document.getElementById('btn-pfz-formula-info');
  const formulaModal = document.getElementById('pfz-formula-modal');
  const btnFormulaClose = document.getElementById('btn-pfz-formula-close');
  const formulaBackdrop = document.getElementById('pfz-formula-backdrop');

  if (btnFormulaInfo && formulaModal) {
    btnFormulaInfo.addEventListener('click', (e) => {
      e.stopPropagation();
      formulaModal.style.display = 'flex';
    });
  }
  if (btnFormulaClose && formulaModal) {
    btnFormulaClose.addEventListener('click', () => {
      formulaModal.style.display = 'none';
    });
  }
  if (formulaBackdrop && formulaModal) {
    formulaBackdrop.addEventListener('click', () => {
      formulaModal.style.display = 'none';
    });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && formulaModal && formulaModal.style.display === 'flex') {
        formulaModal.style.display = 'none';
      }
    });
  }



  // Table / Graph Toggle
  const btnTable = document.getElementById('btn-view-table');
  const btnGraph = document.getElementById('btn-view-graph');
  const tableView = document.getElementById('tvd-table-view');
  const graphView = document.getElementById('tvd-graph-view');
  const emptyView = document.getElementById('tvd-empty-view');

  if (btnTable && btnGraph) {
    btnTable.addEventListener('click', () => {
      btnTable.classList.add('ky-tvd-toggle__btn--active');
      btnGraph.classList.remove('ky-tvd-toggle__btn--active');
      if (!currentCoord || !currentDateStr) {
        if (emptyView) emptyView.style.display = 'flex';
        if (tableView) tableView.style.display = 'none';
        if (graphView) graphView.style.display = 'none';
        return;
      }
      if (tableView) tableView.style.display = 'block';
      if (graphView) graphView.style.display = 'none';
    });

    btnGraph.addEventListener('click', () => {
      btnGraph.classList.add('ky-tvd-toggle__btn--active');
      btnTable.classList.remove('ky-tvd-toggle__btn--active');
      if (!currentCoord || !currentDateStr) {
        if (emptyView) emptyView.style.display = 'flex';
        if (tableView) tableView.style.display = 'none';
        if (graphView) graphView.style.display = 'none';
        return;
      }
      if (tableView) tableView.style.display = 'none';
      if (graphView) graphView.style.display = 'block';
      if (profileChart) {
        setTimeout(() => profileChart.resize(), 50);
      }
    });
  }

  // Search Bar
  const searchInput = document.getElementById('map-search-input');
  const searchClear = document.getElementById('map-search-clear');
  const searchResults = document.getElementById('map-search-results');

  const LOCATIONS = [
    { name: 'Bay of Bengal Assessment Zone', lat: 12.4, lon: 88.6 },
    { name: 'Central Arabian Sea Eddy Zone', lat: 15.8, lon: 65.2 },
    { name: 'SW Arabian Basin Upwelling Zone', lat: 10.5, lon: 56.5 },
    { name: 'Andaman Sea Assessment Area', lat: 11.5, lon: 94.5 },
    { name: 'Lakshadweep Basin Area', lat: 10.5, lon: 72.5 },
    { name: 'Gulf of Oman Upwelling Area', lat: 24.0, lon: 60.0 },
    { name: 'Somali Current Basin', lat: 8.0, lon: 52.0 },
  ];

  function renderSearchItems(items) {
    if (!searchResults) return;
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
        <span class="map-search__item-coord">${item.lat.toFixed(1)}°N, ${item.lon.toFixed(1)}°E</span>
      `;
      row.addEventListener('click', () => {
        selectLocation(item.lat, item.lon, true);
        searchInput.value = `${item.name} (${item.lat.toFixed(1)}°N, ${item.lon.toFixed(1)}°E)`;
        searchResults.style.display = 'none';
        if (searchClear) searchClear.style.display = 'flex';
      });
      searchResults.appendChild(row);
    });
    searchResults.style.display = 'block';
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      if (!q) {
        if (searchResults) searchResults.style.display = 'none';
        if (searchClear) searchClear.style.display = 'none';
        return;
      }
      if (searchClear) searchClear.style.display = 'flex';
      const matches = LOCATIONS.filter(l => l.name.toLowerCase().includes(q));
      renderSearchItems(matches);
    });

    if (searchClear) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        if (searchResults) searchResults.style.display = 'none';
        searchClear.style.display = 'none';
      });
    }

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.map-search-wrap') && searchResults) {
      searchResults.style.display = 'none';
    }
  });

  // Date picker
  const nativePicker = document.getElementById('native-date-picker');
  const dateBtn = document.getElementById('ky-date-btn');
  const displayHeader = document.getElementById('date-display-header');

  if (nativePicker && dateBtn) {
    dateBtn.addEventListener('click', () => {
      if (typeof nativePicker.showPicker === 'function') {
        nativePicker.showPicker();
      } else {
        nativePicker.focus();
      }
    });

    nativePicker.addEventListener('change', () => {
      const val = nativePicker.value;
      if (!val) {
        currentDateStr = null;
        if (displayHeader) displayHeader.textContent = 'Select date';
        clearDynamicPfzZones();
        if (currentPopup) {
          currentPopup.remove();
          currentPopup = null;
        }
        updateEmptyStatePrompt();
        return;
      }
      currentDateStr = val;
      const parts = val.split('-');
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const formatted = `${months[parseInt(parts[1], 10) - 1]} ${parseInt(parts[2], 10)}, ${parts[0]}`;
      if (displayHeader) displayHeader.textContent = formatted;
      loadAndRenderDynamicPfzZones(currentDateStr);
      if (currentCoord) {
        selectLocation(currentCoord.lat, currentCoord.lon, false);
      } else {
        updateEmptyStatePrompt();
      }
    });
  }
}

if (typeof window !== 'undefined') {
  // Ensure map resize on various lifecycle events
  window.addEventListener('DOMContentLoaded', () => {
    initControls();
    updateEmptyStatePrompt();
    if (map) map.resize();
  });

  window.addEventListener('load', () => {
    if (map) map.resize();
  });

  window.addEventListener('resize', () => {
    if (map) map.resize();
  });
}

/* ── Node.js / Testing & Global Exports ──────────────────── */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    HIGHLIGHT_MIN_TIER,
    checkTemperatureDataQuality,
    scoreCandidateZone,
    shouldHighlightZone,
    getZoneTier,
    identifyPfzClusters,
    generateClusterRing,
    loadAndRenderDynamicPfzZones,
    clearDynamicPfzZones,
    buildPopupHtml,
    getKeyInsights,
    calculateSubsurfaceProfile,
    calculateChlaValue,
    createChlaCanvas,
    renderChlaOverlayFromGrid,
    sampleChlaColor,
    resetStatCards,
    updateEmptyStatePrompt,
    revealTvdPanel,
    selectLocation,
    PRESET_ZONES,
  };
}
if (typeof window !== 'undefined') {
  window.HIGHLIGHT_MIN_TIER = HIGHLIGHT_MIN_TIER;
  window.checkTemperatureDataQuality = checkTemperatureDataQuality;
  window.scoreCandidateZone = scoreCandidateZone;
  window.shouldHighlightZone = shouldHighlightZone;
  window.getZoneTier = getZoneTier;
  window.identifyPfzClusters = identifyPfzClusters;
  window.generateClusterRing = generateClusterRing;
  window.loadAndRenderDynamicPfzZones = loadAndRenderDynamicPfzZones;
  window.clearDynamicPfzZones = clearDynamicPfzZones;
  window.renderChlaOverlayFromGrid = renderChlaOverlayFromGrid;
  window.createChlaCanvas = createChlaCanvas;
  window.sampleChlaColor = sampleChlaColor;
  window.buildPopupHtml = buildPopupHtml;
  window.resetStatCards = resetStatCards;
  window.updateEmptyStatePrompt = updateEmptyStatePrompt;
  window.revealTvdPanel = revealTvdPanel;
  window.selectLocation = selectLocation;
}

