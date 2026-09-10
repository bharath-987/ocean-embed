/**
 * Kyogre — Fisheries Mode & PFZ Advisory System
 * MapLibre satellite mapping, high-resolution Chlorophyll-a heatmap overlay,
 * dashed-outline PFZ zones with fish icons, Tuna zone popup card,
 * and subsurface 3-column depth/temperature/nutrient vertical profile synchronization.
 */

/* ── Operational Constants & Backend Config ───────────────── */

const API_BASE = 'http://localhost:8000';

const BOUNDS = {
  north: 30.0,
  south: 5.0,
  west:  45.0,
  east:  105.0,
};

// Depths matching the reference mockup (0 to 1000m)
const DEPTH_LEVELS = [0, 25, 50, 100, 200, 300, 500, 750, 1000];

const PRESET_ZONES = [
  {
    id: 'zone-bob',
    name: 'Bay of Bengal Tuna Zone',
    tag: 'Tuna zone',
    sub: 'Shallow thermocline + upwelling detected.',
    lat: 12.4,
    lon: 88.6,
    prob: 'High probability (0.86)',
    probScore: 0.87,
    thermocline: 68,
    upwelling: 0.72,
    nutrient: 2.6,
    badgeTc: '↓ 12%',
    badgeUp: '↑ +28%',
    badgeNutr: '↑ +35%',
    highlightDepth: 100,
    advisoryText: 'High probability of fish aggregation in this region. Suitable for tuna, sardine and mackerel.',
    insights: [
      'Shallow thermocline and elevated chlorophyll indicate favourable conditions for pelagic fish.',
      'Strong upwelling signal in the region.',
      'Recommended for targeted fishing operations.'
    ]
  },
  {
    id: 'zone-arabian-north',
    name: 'Central Arabian Sea Eddy Zone',
    tag: 'Mackerel & Tuna Zone',
    sub: 'Eddy convergence + elevated primary production.',
    lat: 15.8,
    lon: 65.2,
    prob: 'High probability (0.82)',
    probScore: 0.82,
    thermocline: 74,
    upwelling: 0.68,
    nutrient: 2.1,
    badgeTc: '↓ 8%',
    badgeUp: '↑ +22%',
    badgeNutr: '↑ +25%',
    highlightDepth: 75,
    advisoryText: 'Strong cyclonic eddy margin. Favourable for surface schooling mackerel and skipjack tuna.',
    insights: [
      'Cyclonic boundary entrains nutrient-rich subsurface water into sunlit upper column.',
      'Temperature inversion detected between 60m and 90m.',
      'Favourable window for drift gillnetting and trolling.'
    ]
  },
  {
    id: 'zone-arabian-sw',
    name: 'SW Arabian Basin Upwelling Zone',
    tag: 'Pelagic Sardine Zone',
    sub: 'Coastal jet filament + offshore zooplankton plume.',
    lat: 10.5,
    lon: 56.5,
    prob: 'Moderate probability (0.74)',
    probScore: 0.74,
    thermocline: 82,
    upwelling: 0.58,
    nutrient: 1.6,
    badgeTc: '↓ 5%',
    badgeUp: '↑ +14%',
    badgeNutr: '↑ +18%',
    highlightDepth: 50,
    advisoryText: 'Moderate pelagic potential. Optimal for oceanic squid jigging and small neritic pelagics.',
    insights: [
      'Somali current filament extends offshore, providing continuous nutrient replenishment.',
      'Moderate thermocline shoaling around 82m.',
      'Recommended operations during twilight and early night.'
    ]
  }
];

/* ── State ───────────────────────────────────────────────── */

let currentCoord = { lat: 12.4, lon: 88.6 }; // Default: Tuna zone (BoB)
let currentDateStr = '2023-09-04';
let currentMarker = null;
let currentPopup = null;
let profileChart = null;
let chlaLayerVisible = true;

/* ── Land Mask Helper ────────────────────────────────────── */

function isCoordInsideNorthIndianOcean(lat, lon) {
  return lat >= BOUNDS.south && lat <= BOUNDS.north &&
         lon >= BOUNDS.west  && lon <= BOUNDS.east;
}

function checkIsLand(lat, lon) {
  if (typeof window.isLand === 'function') {
    return window.isLand(lat, lon);
  }
  if (window.Coastline && typeof window.Coastline.isLand === 'function') {
    return window.Coastline.isLand(lat, lon);
  }
  // Coarse bounding box fallback
  if (lat >= 8.0 && lat <= 26.0 && lon >= 73.0 && lon <= 85.0) return true;
  return false;
}

function applyLandCutout(canvas) {
  if (typeof window.applyLandMaskToCanvas === 'function') {
    window.applyLandMaskToCanvas(canvas, BOUNDS);
  } else if (window.Coastline && typeof window.Coastline.applyLandMaskToCanvas === 'function') {
    window.Coastline.applyLandMaskToCanvas(canvas, BOUNDS);
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

function calculateChlaValue(lat, lon) {
  let chl = 0.14 + 0.05 * Math.sin(lat * 0.15 + lon * 0.12);

  // Somali upwelling plume
  const dSomali = Math.hypot(lat - 10.0, lon - 52.0);
  if (dSomali < 9.0) chl += 3.6 * Math.exp(-(dSomali * dSomali) / 26.0);

  // Oman upwelling plume
  const dOman = Math.hypot(lat - 20.0, lon - 59.0);
  if (dOman < 8.0) chl += 3.2 * Math.exp(-(dOman * dOman) / 22.0);

  // Southwest India / Malabar upwelling
  const dKerala = Math.hypot(lat - 10.5, lon - 75.5);
  if (dKerala < 6.0) chl += 3.8 * Math.exp(-(dKerala * dKerala) / 16.0);

  // Head of Bay of Bengal / Ganges delta
  const dBoBNorth = Math.hypot(lat - 21.0, lon - 90.0);
  if (dBoBNorth < 7.0) chl += 5.8 * Math.exp(-(dBoBNorth * dBoBNorth) / 20.0);

  // Andaman Sea delta plume
  const dAndaman = Math.hypot(lat - 15.0, lon - 95.5);
  if (dAndaman < 6.0) chl += 4.2 * Math.exp(-(dAndaman * dAndaman) / 18.0);

  // BoB PFZ Tuna Hotspot (12.4°N, 88.6°E)
  const dAlpha = Math.hypot(lat - 12.4, lon - 88.6);
  if (dAlpha < 5.0) chl += 2.6 * Math.exp(-(dAlpha * dAlpha) / 10.0);

  // Arabian Sea Central Hotspot (15.8°N, 65.2°E)
  const dBeta = Math.hypot(lat - 15.8, lon - 65.2);
  if (dBeta < 5.0) chl += 2.0 * Math.exp(-(dBeta * dBeta) / 10.0);

  // SW Arabian Basin Hotspot (10.5°N, 56.5°E)
  const dGamma = Math.hypot(lat - 10.5, lon - 56.5);
  if (dGamma < 5.0) chl += 1.6 * Math.exp(-(dGamma * dGamma) / 12.0);

  return Math.max(0.02, Math.min(9.8, chl));
}

function createChlaCanvas() {
  const lowW = 120;
  const lowH = 50;
  const lowCanvas = document.createElement('canvas');
  lowCanvas.width = lowW;
  lowCanvas.height = lowH;
  const lowCtx = lowCanvas.getContext('2d');
  const imgData = lowCtx.createImageData(lowW, lowH);

  for (let y = 0; y < lowH; y++) {
    const lat = BOUNDS.north - (y / (lowH - 1)) * (BOUNDS.north - BOUNDS.south);
    for (let x = 0; x < lowW; x++) {
      const lon = BOUNDS.west + (x / (lowW - 1)) * (BOUNDS.east - BOUNDS.west);
      const val = calculateChlaValue(lat, lon);
      const [r, g, b, a] = sampleChlaColor(val);
      const idx = (y * lowW + x) * 4;
      imgData.data[idx]     = r;
      imgData.data[idx + 1] = g;
      imgData.data[idx + 2] = b;
      imgData.data[idx + 3] = a;
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

  return highCanvas;
}

/* ── PFZ GeoJSON Polygons (Closed Dashed Boundaries) ─────── */

function generateEllipseRing(centerLat, centerLon, radiusLat, radiusLon, points = 32) {
  const coords = [];
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const lat = centerLat + radiusLat * Math.sin(angle);
    const lon = centerLon + radiusLon * Math.cos(angle);
    coords.push([lon, lat]);
  }
  return coords;
}

function getPfzGeoJson() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { id: 'zone-bob' },
        geometry: {
          type: 'Polygon',
          coordinates: [generateEllipseRing(12.4, 88.6, 1.4, 1.8)]
        }
      },
      {
        type: 'Feature',
        properties: { id: 'zone-arabian-north' },
        geometry: {
          type: 'Polygon',
          coordinates: [generateEllipseRing(15.8, 65.2, 1.3, 1.6)]
        }
      },
      {
        type: 'Feature',
        properties: { id: 'zone-arabian-sw' },
        geometry: {
          type: 'Polygon',
          coordinates: [generateEllipseRing(10.5, 56.5, 1.2, 1.5)]
        }
      }
    ]
  };
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

function buildFishBadgeElement() {
  const el = document.createElement('div');
  el.className = 'pfz-fish-badge';
  el.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2">
      <path d="M2 16s1-5 8-5 8 5 8 5-2 2-8 2-8-2-8-2z"/>
      <path d="M18 11c1-2 3-4 3-4s-1 2-1 4 1 4 1 4-2-2-3-4z"/>
      <circle cx="8" cy="11" r="1.2" fill="#FFFFFF"/>
    </svg>
  `;
  return el;
}

function buildPopupHtml(lat, lon, zone, probScore) {
  const title = zone ? zone.tag : 'Potential Fishing Zone';
  const sub = zone ? zone.sub : 'Shallow thermocline + upwelling detected.';
  const coordText = `${lat.toFixed(1)}°N, ${lon.toFixed(1)}°E`;
  const probBadge = (probScore !== undefined)
    ? (probScore >= 0.8 ? `High probability (${probScore.toFixed(2)})` : (probScore >= 0.65 ? `Moderate probability (${probScore.toFixed(2)})` : `Low probability (${probScore.toFixed(2)})`))
    : (zone ? zone.prob : 'High probability (0.86)');

  return `
    <div class="ky-pfz-speech-bubble">
      <div class="ky-pfz-speech-bubble__title">${title}</div>
      <div class="ky-pfz-speech-bubble__sub">${sub}</div>
      <div class="ky-pfz-speech-bubble__coord">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="#2563EB"><path d="M12 2L2 12l10 10 10-10L12 2z"/></svg>
        ${coordText}
      </div>
      <div class="ky-pfz-speech-bubble__badge">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="#16A34A"><path d="M12 2L2 12l10 10 10-10L12 2z"/></svg>
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
          label: 'Temperature (°C)',
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
          label: 'Nutrient (mg/m³)',
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
          title: { display: true, text: 'Nutrient (mg/m³)', color: '#059669', font: { size: 11, weight: '600' } },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

function updateStatCards(zone, thermocline, upwelling, pfzScore, nutrientVal) {
  const tcEl = document.getElementById('stat-thermocline-val');
  const tcBadge = document.getElementById('stat-thermocline-badge');
  const upEl = document.getElementById('stat-upwelling-val');
  const upBadge = document.getElementById('stat-upwelling-badge');
  const pfzEl = document.getElementById('stat-pfz-val');
  const pfzBadge = document.getElementById('stat-pfz-badge');
  const nutrEl = document.getElementById('stat-nutrient-val');
  const nutrBadge = document.getElementById('stat-nutrient-badge');

  if (tcEl) tcEl.textContent = `${Math.round(thermocline)} m`;
  if (tcBadge) tcBadge.textContent = zone ? zone.badgeTc : '↓ 12%';

  if (upEl) upEl.textContent = upwelling.toFixed(2);
  if (upBadge) upBadge.textContent = zone ? zone.badgeUp : '↑ +28%';

  if (pfzEl) pfzEl.textContent = pfzScore.toFixed(2);
  if (pfzBadge) pfzBadge.textContent = pfzScore >= 0.8 ? 'High' : (pfzScore >= 0.65 ? 'Moderate' : 'Low');

  if (nutrEl) nutrEl.textContent = `${nutrientVal.toFixed(1)} mg/m³`;
  if (nutrBadge) nutrBadge.textContent = zone ? zone.badgeNutr : '↑ +35%';
}

function updateAdvisory(zone) {
  const advText = document.getElementById('pfz-advisory-text');
  const ins1 = document.getElementById('insight-1');
  const ins2 = document.getElementById('insight-2');
  const ins3 = document.getElementById('insight-3');

  if (zone) {
    if (advText) advText.textContent = zone.advisoryText;
    if (ins1) ins1.textContent = zone.insights[0];
    if (ins2) ins2.textContent = zone.insights[1];
    if (ins3) ins3.textContent = zone.insights[2];
  } else {
    if (advText) advText.textContent = 'High probability of fish aggregation in this region. Suitable for tuna, sardine and mackerel.';
    if (ins1) ins1.textContent = 'Shallow thermocline and elevated chlorophyll indicate favourable conditions for pelagic fish.';
    if (ins2) ins2.textContent = 'Strong upwelling signal in the region.';
    if (ins3) ins3.textContent = 'Recommended for targeted fishing operations.';
  }
}

/* ── Select Location Handler ─────────────────────────────── */

async function selectLocation(lat, lon, zoomTo = false) {
  if (!isCoordInsideNorthIndianOcean(lat, lon)) {
    showNotice('This location is outside our supported region (North Indian Ocean: 5°N–30°N, 45°E–105°E)');
    return false;
  }

  if (checkIsLand(lat, lon)) {
    showNotice('Selected location is on land. Please select an ocean point within the North Indian Ocean.');
    return false;
  }

  currentCoord = { lat, lon };

  // Find if matching one of our predefined PFZ zones
  const matchedZone = PRESET_ZONES.find(z => Math.hypot(z.lat - lat, z.lon - lon) < 1.0);

  // Update panel coordinate text
  const coordBadge = document.getElementById('selected-loc-coord');
  if (coordBadge) {
    coordBadge.textContent = `${lat.toFixed(1)}°N, ${lon.toFixed(1)}°E`;
  }

  // Remove existing marker and popup
  if (currentMarker) currentMarker.remove();
  if (currentPopup) currentPopup.remove();

  // Create new marker pin
  currentMarker = new maplibregl.Marker({
    element: buildTeardropPin(),
    anchor: 'bottom',
  })
    .setLngLat([lon, lat])
    .addTo(map);

  // Attach speech bubble popup card
  currentPopup = new maplibregl.Popup({
    offset: [0, -40],
    closeButton: false,
    closeOnClick: false,
    anchor: 'bottom',
  })
    .setLngLat([lon, lat])
    .setHTML(buildPopupHtml(lat, lon, matchedZone))
    .addTo(map);

  if (zoomTo) {
    map.flyTo({
      center: [lon, lat],
      zoom: Math.max(map.getZoom(), 4.8),
      duration: 800,
    });
  }

  // Fetch real model prediction & oceanographic indices from backend API
  let temps, nutrients, thermocline, upwelling, pfzScore, nutrientVal, highlightDepth;

  try {
    const res = await fetch(`${API_BASE}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: lat,
        longitude: lon,
        date: currentDateStr,
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.detail || `Server error ${res.status}`);
    }

    const data = await res.json();
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
    thermocline = indices.thermocline_depth !== undefined ? indices.thermocline_depth : (matchedZone ? matchedZone.thermocline : 68);
    upwelling = indices.upwelling_index !== undefined ? indices.upwelling_index : (matchedZone ? matchedZone.upwelling : 0.72);
    pfzScore = indices.pfz_confidence_score !== undefined ? indices.pfz_confidence_score : (matchedZone ? matchedZone.probScore : 0.87);
    nutrientVal = indices.chlorophyll_a !== undefined ? indices.chlorophyll_a : (matchedZone ? matchedZone.nutrient : 2.6);

    // Compute vertical nutrient profile for DEPTH_LEVELS matching thermocline DCM
    nutrients = DEPTH_LEVELS.map(d => {
      const peak = 1.35 * nutrientVal * Math.exp(-Math.pow(d - thermocline, 2) / (2 * 28 * 28));
      const base = d < 100 ? nutrientVal * 0.30 : 0.15;
      const deep = 0.25 * Math.exp(-d / 400);
      return Number((base + peak + deep).toFixed(2));
    });

    // Highlight closest depth to thermocline
    highlightDepth = DEPTH_LEVELS.reduce((prev, curr) =>
      Math.abs(curr - thermocline) < Math.abs(prev - thermocline) ? curr : prev, DEPTH_LEVELS[0]);

    renderTable(DEPTH_LEVELS, temps, nutrients, highlightDepth);
    renderChart(DEPTH_LEVELS, temps, nutrients);
    updateStatCards(matchedZone, thermocline, upwelling, pfzScore, nutrientVal);
    updateAdvisory(matchedZone);

    // Update popup with real probability score
    if (currentPopup) {
      currentPopup.setHTML(buildPopupHtml(lat, lon, matchedZone, pfzScore));
    }

  } catch (err) {
    console.warn('Backend /predict unavailable, using physical fallback:', err.message);
    const fallback = calculateSubsurfaceProfile(lat, lon);
    temps = fallback.temps;
    nutrients = fallback.nutrients;
    thermocline = matchedZone ? matchedZone.thermocline : 68;
    upwelling = matchedZone ? matchedZone.upwelling : 0.72;
    pfzScore = matchedZone ? matchedZone.probScore : 0.87;
    nutrientVal = matchedZone ? matchedZone.nutrient : 2.6;
    highlightDepth = matchedZone ? matchedZone.highlightDepth : 100;

    renderTable(DEPTH_LEVELS, temps, nutrients, highlightDepth);
    renderChart(DEPTH_LEVELS, temps, nutrients);
    updateStatCards(matchedZone, thermocline, upwelling, pfzScore, nutrientVal);
    updateAdvisory(matchedZone);
  }

  return true;
}

/* ── MapLibre Initialization ─────────────────────────────── */

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
  // 1. Add Chlorophyll-a High-Res Raster Overlay
  const chlaCanvas = createChlaCanvas();
  map.addSource('chla-raster-source', {
    type: 'image',
    url: chlaCanvas.toDataURL(),
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

  // 2. Add PFZ Vector Outlines & Fill
  const pfzData = getPfzGeoJson();
  map.addSource('pfz-zones', {
    type: 'geojson',
    data: pfzData
  });

  map.addLayer({
    id: 'pfz-zones-fill',
    type: 'fill',
    source: 'pfz-zones',
    paint: {
      'fill-color': '#10B981',
      'fill-opacity': 0.16
    }
  });

  map.addLayer({
    id: 'pfz-zones-line',
    type: 'line',
    source: 'pfz-zones',
    paint: {
      'line-color': '#FFFFFF',
      'line-width': 2.2,
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

  // 4. Fish Icon Markers in the 3 PFZ Zones
  const FISH_MARKER_COORDS = [
    [65.2, 15.8], // Zone 1 Arabian Sea
    [56.5, 10.5], // Zone 2 SW Arabian Sea
    [90.4, 12.0], // Zone 3 Bay of Bengal (beside Tuna zone pin)
  ];

  FISH_MARKER_COORDS.forEach(coord => {
    new maplibregl.Marker({ element: buildFishBadgeElement(), anchor: 'center' })
      .setLngLat(coord)
      .addTo(map);
  });

  // 5. Initial Selection: Bay of Bengal Tuna Zone (matching mockup)
  selectLocation(12.4, 88.6, false);

  // Force initial resize
  map.resize();
});

// Click on map to select location
map.on('click', (e) => {
  selectLocation(e.lngLat.lat, e.lngLat.lng);
});

// Click on PFZ polygon
map.on('click', 'pfz-zones-fill', (e) => {
  if (e.features && e.features[0]) {
    const id = e.features[0].properties.id;
    const z = PRESET_ZONES.find(item => item.id === id);
    if (z) selectLocation(z.lat, z.lon, true);
  }
});

map.on('mouseenter', 'pfz-zones-fill', () => {
  map.getCanvas().style.cursor = 'pointer';
});
map.on('mouseleave', 'pfz-zones-fill', () => {
  map.getCanvas().style.cursor = '';
});

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

  // Region Selector Button
  const btnRegion = document.getElementById('btn-region-select');
  if (btnRegion) {
    btnRegion.addEventListener('click', () => {
      map.flyTo({ center: [75.0, 15.0], zoom: 4.2, duration: 900 });
    });
  }

  // Layer Toggle Button
  const btnLayer = document.getElementById('btn-layer-toggle');
  if (btnLayer) {
    btnLayer.addEventListener('click', () => {
      chlaLayerVisible = !chlaLayerVisible;
      const val = chlaLayerVisible ? 'visible' : 'none';
      if (map.getLayer('chla-raster-layer')) {
        map.setLayoutProperty('chla-raster-layer', 'visibility', val);
      }
      btnLayer.style.color = chlaLayerVisible ? '#1D4ED8' : '#94A3B8';
    });
  }

  // Table / Graph Toggle
  const btnTable = document.getElementById('btn-view-table');
  const btnGraph = document.getElementById('btn-view-graph');
  const tableView = document.getElementById('tvd-table-view');
  const graphView = document.getElementById('tvd-graph-view');

  if (btnTable && btnGraph) {
    btnTable.addEventListener('click', () => {
      btnTable.classList.add('ky-tvd-toggle__btn--active');
      btnGraph.classList.remove('ky-tvd-toggle__btn--active');
      if (tableView) tableView.style.display = 'block';
      if (graphView) graphView.style.display = 'none';
    });

    btnGraph.addEventListener('click', () => {
      btnGraph.classList.add('ky-tvd-toggle__btn--active');
      btnTable.classList.remove('ky-tvd-toggle__btn--active');
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
    { name: 'Bay of Bengal Tuna Zone', lat: 12.4, lon: 88.6 },
    { name: 'Central Arabian Sea Eddy Zone', lat: 15.8, lon: 65.2 },
    { name: 'SW Arabian Basin Upwelling Zone', lat: 10.5, lon: 56.5 },
    { name: 'Andaman Sea PFZ', lat: 11.5, lon: 94.5 },
    { name: 'Lakshadweep Pelagic Basin', lat: 10.5, lon: 72.5 },
    { name: 'Gulf of Oman Upwelling', lat: 24.0, lon: 60.0 },
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
      if (!val) return;
      currentDateStr = val;
      const parts = val.split('-');
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const formatted = `${months[parseInt(parts[1], 10) - 1]} ${parseInt(parts[2], 10)}, ${parts[0]}`;
      if (displayHeader) displayHeader.textContent = formatted;
      selectLocation(currentCoord.lat, currentCoord.lon, false);
    });
  }
}

// Ensure map resize on various lifecycle events
window.addEventListener('DOMContentLoaded', () => {
  initControls();
  if (map) map.resize();
});

window.addEventListener('load', () => {
  if (map) map.resize();
});

window.addEventListener('resize', () => {
  if (map) map.resize();
});
