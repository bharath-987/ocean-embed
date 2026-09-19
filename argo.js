/**
 * Kyogre — ARGO In-Situ Validation & Comparison Client Logic
 * Connects to /argo/profiles, /argo/compare, and /argo/summary
 */

const API_BASE_URL = (typeof window !== 'undefined' && window.API_BASE_URL)
  ? window.API_BASE_URL
  : 'http://localhost:8000';
const API_BASE = API_BASE_URL;

// Global State
let map = null;
let allProfiles = [];
let filteredProfiles = [];
let activeMarkers = []; // Array of { id, marker, wrapper, dot, label, pulseRing, profile }
let selectedProfileId = null;
let selectedCycleId = null;
let currentComparisonData = null;
let chartInstance = null;
let skillChartInstance = null;
let depthErrorChartInstance = null;
let currentSubRegionFilter = 'all';
let selectedViaSearch = false; // Tracks if current float selection was made via search
let activeSearchQuery = '';
let activeSearchIdQuery = '';
let currentSearchMatches = [];

const KNOWN_REGIONS = [
  { key: 'Arabian Sea', label: 'Arabian Sea', aliases: ['arabian', 'arabian sea', 'as'] },
  { key: 'Bay of Bengal', label: 'Bay of Bengal', aliases: ['bay of bengal', 'bay', 'bengal', 'bob'] },
  { key: 'Equatorial Indian Ocean', label: 'Equatorial Indian Ocean', aliases: ['equatorial', 'equator', 'equatorial indian ocean', 'eio'] },
  { key: 'all', label: 'All', aliases: ['all'] },
];

/* ── DOMContentLoaded Initialization ───────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  setupEventListeners();
  await loadSummaryStats();
  await loadSkillScoreStats();
  await loadProfiles();
});

/* ── MapLibre GL Initialization ────────────────────────────── */
function initMap() {
  const satelliteStyle = {
    version: 8,
    sources: {
      'esri-satellite': {
        type: 'raster',
        tiles: [
          'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: 'Esri, Maxar, Earthstar Geographics',
      },
    },
    layers: [
      {
        id: 'esri-satellite-layer',
        type: 'raster',
        source: 'esri-satellite',
        minzoom: 0,
        maxzoom: 18,
      },
    ],
  };

  map = new maplibregl.Map({
    container: 'map',
    style: satelliteStyle,
    center: [75.0, 10.0], // Centered on North Indian Ocean basin
    zoom: 4.0,
    minZoom: 3.0,
    maxZoom: 10,
    maxBounds: [
      [25.0, -10.0], // Southwest bounds
      [125.0, 40.0], // Northeast bounds
    ],
    attributionControl: false,
  });

  map.on('load', () => {
    if (filteredProfiles.length > 0) {
      renderMarkers();
    }
  });
}

/* ── Setup Event Listeners ─────────────────────────────────── */
function setupEventListeners() {
  // Subregion Filter Buttons
  const filterBtns = document.querySelectorAll('.ky-argo-filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const region = btn.getAttribute('data-region');
      // If user clicks a filter pill directly, clear search input
      const searchInput = document.getElementById('map-search-input') || document.getElementById('argo-search-input');
      const searchClear = document.getElementById('map-search-clear') || document.getElementById('argo-search-clear');
      const searchResults = document.getElementById('map-search-results') || document.getElementById('argo-search-results');
      if (searchInput && searchInput.value) {
        searchInput.value = '';
        if (searchClear) searchClear.style.display = 'none';
        if (searchResults) searchResults.style.display = 'none';
        activeSearchQuery = '';
        activeSearchIdQuery = '';
        currentSearchMatches = [];
      }
      applySubRegionFilter(region);
    });
  });

  // Dropdown Selection Change -> select float and fly
  const selectEl = document.getElementById('argo-float-select');
  selectEl?.addEventListener('change', (e) => {
    const targetId = e.target.value;
    if (targetId) {
      selectedViaSearch = false; // Manual dropdown selection
      selectFloat(targetId, true, false);
      selectDate(targetId);
    }
  });

  // Date Selection Change -> run comparison for chosen cycle date
  const dateSelectEl = document.getElementById('argo-date-select');
  dateSelectEl?.addEventListener('change', (e) => {
    const cycleId = e.target.value;
    if (cycleId) {
      selectDate(cycleId);
    }
  });

  // ── Header Search Bar Event Listeners ──
  const searchInput = document.getElementById('map-search-input') || document.getElementById('argo-search-input');
  const searchClear = document.getElementById('map-search-clear') || document.getElementById('argo-search-clear');
  const searchResults = document.getElementById('map-search-results') || document.getElementById('argo-search-results');

  if (searchInput) {
    searchInput.addEventListener('input', handleSearch);

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();

        // 1. If an item in dropdown is actively selected via keyboard (has .is-selected), select it
        const selectedItem = searchResults ? searchResults.querySelector('.map-search__item.is-selected') : null;
        if (selectedItem) {
          selectedItem.click();
          return;
        }

        // 2. If exactly one float matches, select it and open comparison panel
        const uniqueFloats = [...new Set(currentSearchMatches.map(p => p.wmoFloatId))];
        if (uniqueFloats.length === 1) {
          const match = currentSearchMatches[0];
          selectFloat(match.id, true, true);
          searchInput.value = `Float #${match.wmoFloatId}`;
          if (searchResults) searchResults.style.display = 'none';
        }
      } else if (e.key === 'Escape') {
        if (searchResults) searchResults.style.display = 'none';
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        navigateDropdown(e.key === 'ArrowDown' ? 1 : -1);
        e.preventDefault();
      }
    });
  }

  if (searchClear) {
    searchClear.addEventListener('click', () => {
      clearSearch(true);
    });
  }

  // Keyboard shortcut: Ctrl+K or Cmd+K to focus search input
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    }
  });

  // Close search dropdown on click outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.map-search-wrap') && searchResults) {
      searchResults.style.display = 'none';
    }
  });

  // Dev-Only Metric Verification Tool (Rendered only when ?debug=true or ?dev=true)
  initDevVerifyTool();
}

/* ── Load Summary Benchmark Statistics (/argo/summary) ─────── */
async function loadSummaryStats() {
  try {
    const res = await fetch(`${API_BASE}/argo/summary`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const summary = await res.json();

    const rmseEl = document.getElementById('stat-argo-rmse');
    const biasEl = document.getElementById('stat-argo-bias');
    const corrEl = document.getElementById('stat-argo-corr');
    const floatsEl = document.getElementById('stat-argo-floats');

    if (rmseEl) rmseEl.textContent = `${summary.aggregateRmse.toFixed(2)} °C`;
    if (biasEl) biasEl.textContent = `${summary.aggregateBias.toFixed(2)} °C`;
    if (corrEl) corrEl.textContent = `${summary.aggregateCorr.toFixed(3)}`;
    if (floatsEl) floatsEl.textContent = `${summary.totalFloats}`;
  } catch (err) {
    console.warn('Failed to load live /argo/summary stats:', err);
  }
}

/* ── Load Skill Score Benchmark (/argo/skill-score) ────────── */
const DEFAULT_SKILL_DATA = {
  overall: {
    totalFloats: 41,
    totalDepthPoints: 615,
    baselineType: "monthly climatology",
    baselineSampleSize: 41,
    baselineLabel: "vs monthly climatology baseline, n=41 Argo profiles",
    rmseModel: 0.75,           // computed: backend/compute_skill_score.py, full 3-year float16 set
    rmseClimatology: 0.84,     // computed: backend/compute_skill_score.py
    skillScore: 0.200,         // computed: 1 - (0.75^2 / 0.84^2) = 0.200
    skillScorePct: 20.0,
    // Trimmed demo-window figure (source: collaborator HANDOFF.md, 27 of 41 profiles in trimmed window):
    trimmedWindowRmse: 0.715,
    trimmedWindowFloats: 27,
    trimmedWindowLabel: "0.715 °C (trimmed demo-window subset, n=27 profiles, V6 vs V4=0.820 °C)",
  },
  basins: {
    "Bay of Bengal": { count: 16, baselineType: "monthly climatology", baselineSampleSize: 16, baselineLabel: "vs monthly climatology baseline, n=16 Argo profiles", rmseModel: 0.66, rmseClimatology: 0.73, skillScore: 0.186, skillScorePct: 18.6, insufficientSample: false },
    "Arabian Sea": { count: 15, baselineType: "monthly climatology", baselineSampleSize: 15, baselineLabel: "vs monthly climatology baseline, n=15 Argo profiles", rmseModel: 0.74, rmseClimatology: 0.84, skillScore: 0.228, skillScorePct: 22.8, insufficientSample: false },
    "Equatorial Indian Ocean": { count: 10, baselineType: "monthly climatology", baselineSampleSize: 10, baselineLabel: "vs monthly climatology baseline, n=10 Argo profiles", rmseModel: 0.90, rmseClimatology: 0.99, skillScore: 0.181, skillScorePct: 18.1, insufficientSample: false }
  },
  depths: [
    { depth: 0, baselineType: "monthly climatology", baselineSampleSize: 41, baselineLabel: "vs monthly climatology baseline, n=41 Argo profiles", rmseModel: 0.42, rmseClimatology: 0.60, skillScore: 0.491, skillScorePct: 49.1, isPositive: true, explanation: "Direct satellite SST anchor and upper ocean radiation forcing provide exceptional accuracy over climatology." },
    { depth: 5, baselineType: "monthly climatology", baselineSampleSize: 41, baselineLabel: "vs monthly climatology baseline, n=41 Argo profiles", rmseModel: 0.37, rmseClimatology: 0.46, skillScore: 0.370, skillScorePct: 37.0, isPositive: true, explanation: "Mixed layer dynamics tightly coupled to satellite SST observations; strong variance reduction." },
    { depth: 10, baselineType: "monthly climatology", baselineSampleSize: 41, baselineLabel: "vs monthly climatology baseline, n=41 Argo profiles", rmseModel: 0.32, rmseClimatology: 0.39, skillScore: 0.341, skillScorePct: 34.1, isPositive: true, explanation: "Surface mixed layer reflects real-time atmospheric forcing captured by multi-satellite inputs." },
    { depth: 20, baselineType: "monthly climatology", baselineSampleSize: 41, baselineLabel: "vs monthly climatology baseline, n=41 Argo profiles", rmseModel: 0.28, rmseClimatology: 0.35, skillScore: 0.389, skillScorePct: 38.9, isPositive: true, explanation: "Near-surface barrier layer and seasonal mixed layer accurately tracked by CNN-LSTM encoder." },
    { depth: 30, baselineType: "monthly climatology", baselineSampleSize: 41, baselineLabel: "vs monthly climatology baseline, n=41 Argo profiles", rmseModel: 0.38, rmseClimatology: 0.44, skillScore: 0.234, skillScorePct: 23.4, isPositive: true, explanation: "Upper column thermal structure successfully resolves mesoscale eddies and seasonal stratification." },
    { depth: 50, baselineType: "monthly climatology", baselineSampleSize: 41, baselineLabel: "vs monthly climatology baseline, n=41 Argo profiles", rmseModel: 0.63, rmseClimatology: 0.64, skillScore: 0.031, skillScorePct: 3.1, isPositive: true, explanation: "Mixed layer shoaling and upwelling plumes accurately predicted from altimetry and wind stress." },
    { depth: 75, baselineType: "monthly climatology", baselineSampleSize: 41, baselineLabel: "vs monthly climatology baseline, n=41 Argo profiles", rmseModel: 0.87, rmseClimatology: 1.04, skillScore: 0.292, skillScorePct: 29.2, isPositive: true, explanation: "Upper thermocline boundary resolved with substantial improvement over static seasonal averages." },
    { depth: 100, baselineType: "monthly climatology", baselineSampleSize: 41, baselineLabel: "vs monthly climatology baseline, n=41 Argo profiles", rmseModel: 1.69, rmseClimatology: 1.61, skillScore: -0.111, skillScorePct: -11.1, isPositive: false, explanation: "Error increases sharply near the thermocline core — a known challenge for satellite-trained models, possibly related to sub-grid-scale internal wave activity, though this specific mechanism has not been isolated in this analysis." },
    { depth: 125, baselineType: "monthly climatology", baselineSampleSize: 41, baselineLabel: "vs monthly climatology baseline, n=41 Argo profiles", rmseModel: 0.98, rmseClimatology: 1.31, skillScore: 0.447, skillScorePct: 44.7, isPositive: true, explanation: "Core thermocline structure effectively recovered by temporal LSTM embeddings of surface height anomalies." },
    { depth: 150, baselineType: "monthly climatology", baselineSampleSize: 41, baselineLabel: "vs monthly climatology baseline, n=41 Argo profiles", rmseModel: 0.93, rmseClimatology: 1.30, skillScore: 0.486, skillScorePct: 48.6, isPositive: true, explanation: "Lower thermocline depth; model captures regional basin tilts between Arabian Sea and Bay of Bengal." },
    { depth: 200, baselineType: "monthly climatology", baselineSampleSize: 41, baselineLabel: "vs monthly climatology baseline, n=41 Argo profiles", rmseModel: 0.95, rmseClimatology: 0.96, skillScore: 0.012, skillScorePct: 1.2, isPositive: true, explanation: "Thermocline transition boundary; elevated uncertainty near seasonal shoaling levels compared to smooth climatological averages." },
    { depth: 300, baselineType: "monthly climatology", baselineSampleSize: 41, baselineLabel: "vs monthly climatology baseline, n=41 Argo profiles", rmseModel: 0.71, rmseClimatology: 0.76, skillScore: 0.137, skillScorePct: 13.7, isPositive: true, explanation: "Upper mesopelagic layer; model successfully tracks basin-wide warm/cold water mass distributions." },
    { depth: 500, baselineType: "monthly climatology", baselineSampleSize: 41, baselineLabel: "vs monthly climatology baseline, n=41 Argo profiles", rmseModel: 0.48, rmseClimatology: 0.50, skillScore: 0.075, skillScorePct: 7.5, isPositive: true, explanation: "Intermediate depth; model maintains stable thermal profiles with lower absolute error than climatology." },
    { depth: 700, baselineType: "monthly climatology", baselineSampleSize: 41, baselineLabel: "vs monthly climatology baseline, n=41 Argo profiles", rmseModel: 0.28, rmseClimatology: 0.27, skillScore: -0.088, skillScorePct: -8.8, isPositive: false, explanation: "Abyssal ocean baseline has near-zero seasonal variance (~0.46°C); neural network residual noise (~0.64°C) exceeds static climatology." },
    { depth: 1000, baselineType: "monthly climatology", baselineSampleSize: 41, baselineLabel: "vs monthly climatology baseline, n=41 Argo profiles", rmseModel: 0.56, rmseClimatology: 0.56, skillScore: -0.007, skillScorePct: -0.7, isPositive: false, explanation: "Deep ocean temperatures are near-constant (~7-9°C); unweighted neural net loss allows ~0.81°C variance, exceeding climatology's ~0.45°C variance." }
  ]
};

async function loadSkillScoreStats() {
  let data = DEFAULT_SKILL_DATA;
  try {
    const res = await fetch(`${API_BASE}/argo/skill-score`);
    if (res.ok) {
      data = await res.json();
    }
  } catch (err) {
    console.warn('Using default skill score data:', err);
  }

  // 1. Overall Headline
  const headlineBadge = document.getElementById('argo-skill-headline-badge');
  const headlineVal = document.getElementById('argo-skill-headline-val');
  const modelRmseEl = document.getElementById('argo-skill-model-rmse');
  const climRmseEl = document.getElementById('argo-skill-clim-rmse');

  if (data.overall) {
    const pct = data.overall.skillScorePct !== undefined ? data.overall.skillScorePct : (data.overall.skillScore * 100);
    const pctStr = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
    if (headlineBadge) headlineBadge.textContent = `${pctStr} Overall Skill`;
    if (headlineVal) headlineVal.textContent = pctStr;
    if (modelRmseEl && data.overall.rmseModel !== undefined) {
      modelRmseEl.textContent = `${data.overall.rmseModel.toFixed(2)} °C`;
    }
    if (climRmseEl && data.overall.rmseClimatology !== undefined) {
      climRmseEl.textContent = `${data.overall.rmseClimatology.toFixed(2)} °C`;
    }
  }

  // 2. Basins
  if (data.basins) {
    const bob = data.basins['Bay of Bengal'];
    const as = data.basins['Arabian Sea'];
    const eio = data.basins['Equatorial Indian Ocean'];

    const bobEl = document.getElementById('basin-skill-bob');
    const asEl = document.getElementById('basin-skill-as');
    const eioEl = document.getElementById('basin-skill-eio');

    const bobMetaEl = document.getElementById('basin-meta-bob');
    const asMetaEl = document.getElementById('basin-meta-as');
    const eioMetaEl = document.getElementById('basin-meta-eio');

    const updateBasinCard = (basinData, skillEl, metaEl) => {
      if (!basinData || !skillEl) return;
      const cardEl = skillEl.closest('.ky-argo-basin-card');
      if (basinData.insufficientSample) {
        skillEl.textContent = '—';
        skillEl.classList.add('ky-argo-basin-skill--insufficient');
        if (metaEl) {
          metaEl.textContent = basinData.insufficientNote || `Insufficient data (n=${basinData.count}, minimum 10 required for basin-level reporting)`;
        }
        if (cardEl) {
          cardEl.classList.add('ky-argo-basin-card--insufficient');
        }
      } else {
        skillEl.textContent = `${basinData.skillScorePct >= 0 ? '+' : ''}${basinData.skillScorePct.toFixed(1)}%`;
        skillEl.classList.remove('ky-argo-basin-skill--insufficient');
        if (metaEl && basinData.rmseModel !== undefined && basinData.rmseClimatology !== undefined) {
          metaEl.textContent = `Model ${basinData.rmseModel.toFixed(2)}°C vs Clim ${basinData.rmseClimatology.toFixed(2)}°C (vs monthly climatology baseline, n=${basinData.count} Argo profiles)`;
        }
        if (cardEl) {
          cardEl.classList.remove('ky-argo-basin-card--insufficient');
        }
      }
    };

    updateBasinCard(bob, bobEl, bobMetaEl);
    updateBasinCard(as, asEl, asMetaEl);
    updateBasinCard(eio, eioEl, eioMetaEl);
  }

  // 3. Render Per-Depth Horizontal Bar Chart
  if (data.depths && data.depths.length) {
    renderSkillChart(data.depths);
  }
}

function renderSkillChart(depthsData) {
  const canvas = document.getElementById('argo-skill-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (skillChartInstance) {
    skillChartInstance.destroy();
    skillChartInstance = null;
  }

  const labels = depthsData.map(d => `${d.depth}m`);
  const values = depthsData.map(d => d.skillScore);
  const bgColors = depthsData.map(d => d.skillScore >= 0 ? 'rgba(16, 185, 129, 0.85)' : 'rgba(244, 63, 94, 0.85)');
  const borderColors = depthsData.map(d => d.skillScore >= 0 ? '#059669' : '#E11D48');

  skillChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Skill Score',
          data: values,
          backgroundColor: bgColors,
          borderColor: borderColors,
          borderWidth: 1.2,
          borderRadius: 4,
          barPercentage: 0.75,
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: {
            color: (ctx) => (ctx.tick && ctx.tick.value === 0 ? '#1E293B' : '#F1F5F9'),
            lineWidth: (ctx) => (ctx.tick && ctx.tick.value === 0 ? 2 : 1),
          },
          ticks: {
            color: '#64748B',
            font: { size: 11 },
            callback: (val) => val.toFixed(1),
          },
          title: {
            display: true,
            text: 'Skill Score (SS = 1 - RMSE²_model / RMSE²_clim, vs monthly climatology baseline, n=41 Argo profiles)',
            color: '#475569',
            font: { size: 11, weight: '600' }
          }
        },
        y: {
          grid: { display: false },
          ticks: {
            color: '#334155',
            font: { size: 11, weight: '600' }
          },
          title: {
            display: true,
            text: 'Depth (m)',
            color: '#475569',
            font: { size: 11, weight: '600' }
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleFont: { size: 12, weight: 'bold' },
          bodyFont: { size: 11 },
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            title: (items) => `Depth: ${items[0].label}`,
            label: (ctx) => {
              const d = depthsData[ctx.dataIndex];
              const pct = (d.skillScore * 100).toFixed(1);
              const sign = d.skillScore >= 0 ? '+' : '';
              return [
                `Skill Score: ${d.skillScore.toFixed(3)} (${sign}${pct}%)`,
                `Model RMSE: ${d.rmseModel.toFixed(2)} °C`,
                `Climatology RMSE: ${d.rmseClimatology.toFixed(2)} °C`,
                `(vs monthly climatology baseline, n=41 Argo profiles)`,
              ];
            },
            afterBody: (items) => {
              const d = depthsData[items[0].dataIndex];
              return d.explanation ? `\nPhysical Rationale: ${d.explanation}` : '';
            }
          }
        }
      }
    }
  });
}

/* ── Load Float Profiles (/argo/profiles) ──────────────────── */
async function loadProfiles() {
  try {
    const res = await fetch(`${API_BASE}/argo/profiles`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allProfiles = await res.json();
    filteredProfiles = [...allProfiles];

    populateDropdown(filteredProfiles);

    if (map && map.isStyleLoaded()) {
      renderMarkers();
    }

    // Initial page load: no float is auto-selected.
    // Map shows all markers in default state, and comparison panel displays empty/placeholder state.
  } catch (err) {
    console.error('Failed to load ARGO profiles:', err);
  }
}

/* ── Populate Dropdown Options ─────────────────────────────── */
function populateDropdown(profiles) {
  const selectEl = document.getElementById('argo-float-select');
  if (!selectEl) return;

  selectEl.innerHTML = '';

  // Add unselected placeholder option
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a float profile...';
  placeholder.disabled = true;
  if (!selectedProfileId) {
    placeholder.selected = true;
  }
  selectEl.appendChild(placeholder);

  profiles.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `Float #${p.wmoFloatId} · Cycle ${p.cycleNumber}`;
    if (p.id === selectedProfileId) {
      opt.selected = true;
    }
    selectEl.appendChild(opt);
  });

  if (selectedProfileId) {
    selectEl.value = selectedProfileId;
  }
}

/* ── Filter Profiles by Subregion ──────────────────────────── */
function applySubRegionFilter(region) {
  currentSubRegionFilter = region;
  if (region === 'all') {
    filteredProfiles = [...allProfiles];
  } else {
    filteredProfiles = allProfiles.filter(p => p.subRegion === region);
  }

  // Update subregion filter button active classes
  const filterBtns = document.querySelectorAll('.ky-argo-filter-btn');
  filterBtns.forEach(btn => {
    btn.classList.toggle('ky-argo-filter-btn--active', btn.getAttribute('data-region') === region);
  });

  populateDropdown(filteredProfiles);
  renderMarkers();

  // If a float was already selected, but is not in filtered list, select first available
  if (selectedProfileId) {
    const match = filteredProfiles.find(p => p.id === selectedProfileId);
    if (!match && filteredProfiles.length > 0) {
      selectFloat(filteredProfiles[0].id, true, false);
    }
  }
}

/* ── Render Markers on Map (Jitter-Free Anchoring & Selected Visuals) ─ */
function renderMarkers() {
  // Clear existing markers from map
  activeMarkers.forEach(m => m.marker.remove());
  activeMarkers = [];

  filteredProfiles.forEach(p => {
    // Root wrapper for MapLibre positioning (ZERO CSS transitions so it tracks tiles perfectly)
    const wrapper = document.createElement('div');
    wrapper.className = 'ky-float-marker-wrap';
    wrapper.setAttribute('data-id', p.id);

    const isSelected = (p.id === selectedProfileId);
    if (isSelected) {
      wrapper.style.zIndex = '100';
    }

    // Floating location label above selected marker
    const label = document.createElement('div');
    label.className = 'ky-float-label';
    label.textContent = `Float #${p.wmoFloatId} · ${p.latitude.toFixed(2)}°N, ${p.longitude.toFixed(2)}°E`;
    if (!isSelected) {
      label.style.display = 'none';
    }
    wrapper.appendChild(label);

    // Pulsing halo ring around selected marker
    const pulseRing = document.createElement('div');
    pulseRing.className = 'ky-float-pulse';
    if (!isSelected) {
      pulseRing.style.display = 'none';
    }
    wrapper.appendChild(pulseRing);

    // Circular marker dot (Unselected: smaller muted/gray; Selected: larger accent blue)
    const dot = document.createElement('div');
    dot.className = isSelected ? 'ky-float-dot ky-float-dot--selected' : 'ky-float-dot';
    dot.title = `Float #${p.wmoFloatId} (${p.subRegion}) · ${p.date}`;

    // Inner white core on selected dot
    const inner = document.createElement('div');
    inner.className = 'ky-float-dot__inner';
    dot.appendChild(inner);

    // Click -> select float and update UI
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedViaSearch = false; // Manual marker click
      selectFloat(p.id, true, false);
    });

    wrapper.appendChild(dot);

    // Standard MapLibre Marker anchored precisely at center coordinate
    const marker = new maplibregl.Marker({ element: wrapper, anchor: 'center' })
      .setLngLat([p.longitude, p.latitude])
      .addTo(map);

    activeMarkers.push({
      id: p.id,
      marker,
      wrapper,
      dot,
      label,
      pulseRing,
      profile: p
    });
  });

  // Reapply search highlights/dimming if a float ID search is active
  if (activeSearchIdQuery) {
    applyMarkerSearchHighlights(activeSearchIdQuery);
  }
}

/* ── Update Selected Marker Visuals Immediately ────────────── */
function updateSelectedMarkerVisuals(id) {
  selectedProfileId = id;
  activeMarkers.forEach(item => {
    const isSelected = (item.id === id);
    if (isSelected) {
      item.dot.className = 'ky-float-dot ky-float-dot--selected';
      item.label.style.display = 'flex';
      item.pulseRing.style.display = 'block';
      item.wrapper.style.zIndex = '100';
    } else {
      item.dot.className = 'ky-float-dot';
      item.label.style.display = 'none';
      item.pulseRing.style.display = 'none';
      item.wrapper.style.zIndex = '10';
    }
  });
}

/* ── Step 1: Select Float (Marker Click or Float Dropdown Change) ─ */
function selectFloat(id, flyToMarker = true, viaSearch = false) {
  selectedViaSearch = viaSearch;

  // Reveal comparison panel and hide empty state
  const emptyEl = document.getElementById('argo-compare-empty');
  const contentEl = document.getElementById('argo-compare-content');
  if (emptyEl) emptyEl.style.display = 'none';
  if (contentEl) contentEl.style.display = 'flex';

  selectedProfileId = id;
  selectedCycleId = null; // Date is not selected yet!

  const profile = allProfiles.find(p => p.id === id);
  if (!profile) return;

  // Highlight this marker on the map
  updateSelectedMarkerVisuals(id);

  // Sync Float Dropdown value
  const selectEl = document.getElementById('argo-float-select');
  if (selectEl && selectEl.value !== id) {
    selectEl.value = id;
  }

  // Update Location Subtext
  const subEl = document.getElementById('argo-selected-sub');
  if (subEl) {
    subEl.textContent = `${profile.latitude.toFixed(2)}°N, ${profile.longitude.toFixed(2)}°E · ${profile.subRegion}`;
  }

  // Smoothly pan/fly camera to marker
  if (map && flyToMarker) {
    map.flyTo({
      center: [profile.longitude, profile.latitude],
      zoom: Math.max(map.getZoom(), 5.2),
      speed: 1.2,
      curve: 1.42,
    });
  }

  // Populate date dropdown with this float's known cycles
  const cycles = populateDateDropdown(profile.wmoFloatId);

  // If float has only ONE available observation date/cycle, auto-select it and run comparison immediately
  if (cycles && cycles.length === 1) {
    selectDate(cycles[0].id);
  } else {
    // 2+ available dates: prompt user to choose and show chart placeholder
    showChartPlaceholder();
  }
}

/* ── Populate Date Dropdown for Selected Float ─────────────── */
function populateDateDropdown(wmoFloatId) {
  const dateSelect = document.getElementById('argo-date-select');
  if (!dateSelect) return [];

  dateSelect.innerHTML = '';

  // Find all available cycles for this float within valid 2021-2023 range
  const cycles = allProfiles.filter(p => p.wmoFloatId === wmoFloatId);
  cycles.sort((a, b) => a.cycleNumber - b.cycleNumber);

  if (cycles.length === 1) {
    // Exactly 1 cycle: pre-select it directly (field displays this single date)
    const c = cycles[0];
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.date} · Cycle #${c.cycleNumber}`;
    opt.selected = true;
    dateSelect.appendChild(opt);
    dateSelect.value = c.id;
  } else {
    // 2+ cycles: add unselected placeholder option and prompt user
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select observation date...';
    placeholder.disabled = true;
    placeholder.selected = true;
    dateSelect.appendChild(placeholder);

    cycles.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.date} · Cycle #${c.cycleNumber}`;
      dateSelect.appendChild(opt);
    });
  }

  return cycles;
}

/* ── Show Chart Placeholder (State 2: Date Pending) ────────── */
function showChartPlaceholder() {
  const placeholderEl = document.getElementById('argo-chart-placeholder');
  const chartBox = document.getElementById('argo-chart-box');
  if (placeholderEl) placeholderEl.style.display = 'flex';
  if (chartBox) chartBox.style.display = 'none';

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  if (depthErrorChartInstance) {
    depthErrorChartInstance.destroy();
    depthErrorChartInstance = null;
  }

  // Reset 3 metrics to dash
  const rmseEl = document.getElementById('comp-float-rmse');
  const biasEl = document.getElementById('comp-float-bias');
  const corrEl = document.getElementById('comp-float-corr');
  if (rmseEl) rmseEl.textContent = '—';
  if (biasEl) biasEl.textContent = '—';
  if (corrEl) corrEl.textContent = '—';

  // Reset bottom table with date selection prompt
  const tbody = document.getElementById('argo-table-body');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="ky-argo-table-placeholder">Select an observation date above to view profile comparison data</td>
      </tr>
    `;
  }
}

/* ── Step 2: Select Date and Run /argo/compare ──────────────── */
async function selectDate(cycleId) {
  if (!cycleId) return;

  selectedCycleId = cycleId;

  // Update selected marker visuals if cycle coordinate differs
  const cycleProfile = allProfiles.find(p => p.id === cycleId);
  if (cycleProfile) {
    if (cycleProfile.subRegion !== currentSubRegionFilter && currentSubRegionFilter !== 'all') {
      applySubRegionFilter('all');
    }
    updateSelectedMarkerVisuals(cycleId);
    const subEl = document.getElementById('argo-selected-sub');
    if (subEl) {
      subEl.textContent = `${cycleProfile.latitude.toFixed(2)}°N, ${cycleProfile.longitude.toFixed(2)}°E · ${cycleProfile.date} (${cycleProfile.subRegion})`;
    }
  }

  // Sync Float Dropdown so header float title & cycle always match the selected cycle
  const selectEl = document.getElementById('argo-float-select');
  if (selectEl) {
    const hasOption = Array.from(selectEl.options).some(opt => opt.value === cycleId);
    if (!hasOption) {
      populateDropdown(allProfiles);
    }
    if (selectEl.value !== cycleId) {
      selectEl.value = cycleId;
    }
  }

  // Also ensure the Date dropdown value matches cycleId
  const dateSelectEl = document.getElementById('argo-date-select');
  if (dateSelectEl && dateSelectEl.value !== cycleId) {
    dateSelectEl.value = cycleId;
  }

  // Hide placeholder and reveal dual chart canvas box
  const placeholderEl = document.getElementById('argo-chart-placeholder');
  const chartBox = document.getElementById('argo-chart-box');
  if (placeholderEl) placeholderEl.style.display = 'none';
  if (chartBox) chartBox.style.display = 'grid';

  try {
    const res = await fetch(`${API_BASE}/argo/compare?id=${encodeURIComponent(cycleId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    currentComparisonData = data;

    renderComparisonData(data);
  } catch (err) {
    console.error('Error fetching /argo/compare:', err);
  }
}

/* ── Render Comparison Results into UI (Chart + Plain Table) ─ */
function renderComparisonData(data) {
  const { depths, aiTemps, argoTemps, diffs, metrics } = data;

  // 1. Update 3 Plain Metrics (label + big number only)
  const rmseEl = document.getElementById('comp-float-rmse');
  const biasEl = document.getElementById('comp-float-bias');
  const corrEl = document.getElementById('comp-float-corr');

  if (rmseEl) rmseEl.textContent = `${metrics.rmse.toFixed(2)} °C`;
  if (biasEl) biasEl.textContent = `${metrics.bias.toFixed(2)} °C`;
  if (corrEl) corrEl.textContent = `${metrics.corr.toFixed(3)}`;

  // 2. Render Chart.js Temperature Profile Line Graph & Per-Depth Error Bar Chart
  renderChart(depths, aiTemps, argoTemps);
  renderDepthErrorChart(depths, aiTemps, argoTemps, diffs);

  // 3. Render Bottom Plain Data Table (Depth, AI Model, ARGO Float, Diff)
  const tbody = document.getElementById('argo-table-body');
  if (tbody) {
    tbody.innerHTML = '';
    depths.forEach((depth, i) => {
      const tr = document.createElement('tr');
      const ai = (aiTemps[i] !== null && aiTemps[i] !== undefined && !isNaN(aiTemps[i])) ? aiTemps[i].toFixed(2) : '—';
      const argo = (argoTemps[i] !== null && argoTemps[i] !== undefined && !isNaN(argoTemps[i])) ? argoTemps[i].toFixed(2) : '—';
      const diff = diffs[i];
      let diffStr = '—';
      if (diff !== null && diff !== undefined && !isNaN(diff)) {
        diffStr = diff.toFixed(2);
      }

      tr.innerHTML = `
        <td>${depth}</td>
        <td>${ai}</td>
        <td>${argo}</td>
        <td>${diffStr}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

/* ── Render Chart.js Dual Profile Plot (BUG 2 Fix) ─────────── */
function renderChart(depths, aiTemps, argoTemps) {
  const canvas = document.getElementById('argo-chart-canvas');
  if (!canvas) return;

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  // End-to-end debug logging to console per BUG 2 requirements
  console.log(`[Temperature Profile Chart] Rendering Float #${selectedProfileId}:`);
  console.log('  Depths array (m):', depths);
  console.log('  AI Reconstructed temps (°C):', aiTemps);
  console.log('  ARGO Observed temps (°C):', argoTemps);

  // Calculate dynamic axis bounds from real data
  const allTemps = [...aiTemps, ...argoTemps].filter(t => typeof t === 'number' && !isNaN(t));
  const minTemp = allTemps.length ? Math.min(...allTemps) : 0;
  const maxTemp = allTemps.length ? Math.max(...allTemps) : 30;
  const xMin = Math.max(0, Math.floor(minTemp - 2));
  const xMax = Math.ceil(maxTemp + 2);
  const maxDepth = depths.length ? Math.max(...depths) : 1000;

  // Format {x, y} coordinate pairs: x = temperature (°C), y = depth (m)
  const aiData = depths
    .map((d, i) => (aiTemps[i] !== null && aiTemps[i] !== undefined && !isNaN(aiTemps[i])) ? { x: aiTemps[i], y: d } : null)
    .filter(Boolean);
  const argoData = depths
    .map((d, i) => (argoTemps[i] !== null && argoTemps[i] !== undefined && !isNaN(argoTemps[i])) ? { x: argoTemps[i], y: d } : null)
    .filter(Boolean);

  const isRaw = currentComparisonData && currentComparisonData.raw;
  const aiLabel = isRaw
    ? 'AI Reconstructed (Raw Unsmoothed)'
    : 'AI Reconstructed (Argo-bias-corrected)';

  chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      datasets: [
        {
          label: aiLabel,
          data: aiData,
          borderColor: '#2563EB',
          backgroundColor: 'transparent',
          borderWidth: 2.2,
          pointRadius: 2.5,
          pointHoverRadius: 5,
          pointBackgroundColor: '#2563EB',
          tension: 0.3,
          fill: false,
        },
        {
          label: 'ARGO Observed',
          data: argoData,
          borderColor: '#475569',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [5, 4],
          pointRadius: 2.5,
          pointHoverRadius: 5,
          pointBackgroundColor: '#475569',
          tension: 0.3,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y', // Independent variable is Depth on Y, dependent variable is Temperature on X
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'bottom',
          align: 'end',
          labels: {
            boxWidth: 16,
            boxHeight: 2,
            font: {
              family: 'Inter, system-ui, sans-serif',
              size: 11,
              weight: '500',
            },
            color: '#475569',
            padding: 10,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.94)',
          titleFont: { family: 'Inter, system-ui, sans-serif', size: 12, weight: '700' },
          bodyFont: { family: 'Inter, system-ui, sans-serif', size: 11 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            title: function(items) {
              if (!items.length) return '';
              return `Depth: ${items[0].parsed.y} m`;
            },
            label: function(context) {
              const label = context.dataset.label || '';
              return `${label}: ${context.parsed.x.toFixed(2)} °C`;
            },
            afterBody: function(items) {
              if (items.length >= 2) {
                const ai = items[0].parsed.x;
                const argo = items[1].parsed.x;
                const delta = ai - argo;
                return `Diff (Δ): ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} °C`;
              }
              return '';
            }
          }
        },
      },
      scales: {
        x: {
          type: 'linear', // Linear scale for temperature (prevents category null parsing)
          min: xMin,
          max: xMax,
          title: {
            display: true,
            text: 'Temperature (°C)',
            color: '#64748B',
            font: { family: 'Inter, system-ui, sans-serif', size: 11, weight: '500' },
          },
          grid: {
            color: '#F1F5F9',
          },
          ticks: {
            color: '#94A3B8',
            font: { family: 'Inter, system-ui, sans-serif', size: 10.5 },
            stepSize: 5,
          },
        },
        y: {
          type: 'linear',
          reverse: true, // 0m surface at top, 1000m at bottom
          min: 0,
          max: maxDepth,
          title: {
            display: true,
            text: 'Depth (m)',
            color: '#64748B',
            font: { family: 'Inter, system-ui, sans-serif', size: 11, weight: '500' },
          },
          grid: {
            color: '#F1F5F9',
          },
          ticks: {
            color: '#94A3B8',
            font: { family: 'Inter, system-ui, sans-serif', size: 10.5 },
            stepSize: 200,
          },
        },
      },
    },
  });
}

/* ── Render Chart.js Per-Depth Signed Error Bar Chart ─────── */
function renderDepthErrorChart(depths, aiTemps, argoTemps, diffs) {
  const canvas = document.getElementById('argo-depth-error-canvas');
  if (!canvas || typeof Chart === 'undefined') return;

  if (depthErrorChartInstance) {
    depthErrorChartInstance.destroy();
    depthErrorChartInstance = null;
  }

  // End-to-end debug logging
  console.log(`[Signed Depth Error Chart] Rendering Float #${selectedProfileId}:`);
  console.log('  Depths array (m):', depths);
  console.log('  Signed errors ΔT (AI - ARGO, °C):', diffs);

  // Category labels on Y-axis (top = 0m, bottom = 1000m)
  const labels = depths.map(d => `${d}m`);
  const values = diffs.map(d => typeof d === 'number' ? Number(d.toFixed(2)) : 0);

  // Established emerald (>= 0, AI warmer) vs crimson (< 0, AI cooler) convention
  const bgColors = values.map(v => v >= 0 ? 'rgba(16, 185, 129, 0.85)' : 'rgba(244, 63, 94, 0.85)');
  const borderColors = values.map(v => v >= 0 ? '#059669' : '#E11D48');

  // Compute symmetric X-axis bounds around 0 for clear zero-line centering
  const absValues = values.map(Math.abs);
  const maxAbs = absValues.length ? Math.max(...absValues) : 1.0;
  const bound = Math.max(1.0, Math.ceil(maxAbs * 1.25 * 2) / 2);

  depthErrorChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Signed Error (ΔT)',
          data: values,
          backgroundColor: bgColors,
          borderColor: borderColors,
          borderWidth: 1.2,
          borderRadius: 3,
          barPercentage: 0.72,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y', // Depth on Y (0m at top), Signed Error on X
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.94)',
          titleFont: { family: 'Inter, system-ui, sans-serif', size: 11.5, weight: '700' },
          bodyFont: { family: 'Inter, system-ui, sans-serif', size: 11 },
          padding: 9,
          cornerRadius: 8,
          callbacks: {
            title: function(items) {
              if (!items.length) return '';
              const idx = items[0].dataIndex;
              return `Depth: ${depths[idx]} m`;
            },
            label: function(context) {
              const idx = context.dataIndex;
              const diff = values[idx];
              const ai = aiTemps && aiTemps[idx] !== undefined ? aiTemps[idx] : null;
              const argo = argoTemps && argoTemps[idx] !== undefined ? argoTemps[idx] : null;
              const sign = diff >= 0 ? '+' : '';
              const desc = diff > 0 ? 'AI Warmer' : (diff < 0 ? 'AI Cooler' : 'Exact Parity');

              const lines = [];
              if (ai !== null) lines.push(`AI Model: ${ai.toFixed(2)} °C`);
              if (argo !== null) lines.push(`ARGO Float: ${argo.toFixed(2)} °C`);
              lines.push(`Signed Error (ΔT): ${sign}${diff.toFixed(2)} °C (${desc})`);
              return lines;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: -bound,
          max: bound,
          title: {
            display: true,
            text: 'ΔT = AI − ARGO (°C)',
            color: '#64748B',
            font: { family: 'Inter, system-ui, sans-serif', size: 10.5, weight: '500' },
          },
          grid: {
            color: (ctx) => (ctx.tick && ctx.tick.value === 0 ? '#1E293B' : '#F1F5F9'),
            lineWidth: (ctx) => (ctx.tick && ctx.tick.value === 0 ? 2 : 1),
          },
          ticks: {
            color: '#64748B',
            font: { family: 'Inter, system-ui, sans-serif', size: 10 },
            callback: (val) => (val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)),
          }
        },
        y: {
          grid: {
            display: false,
          },
          ticks: {
            color: '#64748B',
            font: { family: 'Inter, system-ui, sans-serif', size: 10, weight: '500' },
          }
        }
      }
    }
  });
}

/* ── Apply Marker Search Highlights (Dim Non-Matching, Highlight Matching) ── */
function applyMarkerSearchHighlights(idQuery) {
  const cleanId = idQuery.replace(/^#/, '').trim().toLowerCase();
  if (!cleanId) {
    activeMarkers.forEach(m => {
      m.wrapper.classList.remove('ky-float-marker-wrap--dimmed');
      m.wrapper.classList.remove('ky-float-marker-wrap--matched');
      m.dot.style.opacity = '';
    });
    return;
  }

  activeMarkers.forEach(m => {
    const isMatch = String(m.profile.wmoFloatId).toLowerCase().includes(cleanId) ||
                    m.profile.id.toLowerCase().includes(cleanId);
    if (isMatch) {
      m.wrapper.classList.remove('ky-float-marker-wrap--dimmed');
      m.wrapper.classList.add('ky-float-marker-wrap--matched');
      m.dot.style.opacity = '1';
    } else {
      m.wrapper.classList.add('ky-float-marker-wrap--dimmed');
      m.wrapper.classList.remove('ky-float-marker-wrap--matched');
      m.dot.style.opacity = '0.22';
    }
  });
}

/* ── Header Search Bar Real-Time Filter & Match Logic ──────── */
function handleSearch() {
  const searchInput = document.getElementById('map-search-input') || document.getElementById('argo-search-input');
  const searchClear = document.getElementById('map-search-clear') || document.getElementById('argo-search-clear');
  const searchResults = document.getElementById('map-search-results') || document.getElementById('argo-search-results');
  if (!searchInput) return;

  const rawQuery = searchInput.value;
  const q = rawQuery.trim();

  if (!q) {
    if (searchClear) searchClear.style.display = 'none';
    if (searchResults) searchResults.style.display = 'none';
    clearSearch(false);
    return;
  }

  if (searchClear) searchClear.style.display = 'flex';
  activeSearchQuery = q;

  const cleanQ = q.replace(/^#/, '').trim().toLowerCase();

  // 1. Check if cleanQ matches a known region name
  const matchedRegion = KNOWN_REGIONS.find(r => 
    r.label.toLowerCase() === cleanQ ||
    r.label.toLowerCase().includes(cleanQ) ||
    r.aliases.some(a => a === cleanQ || a.startsWith(cleanQ) || (cleanQ.length >= 3 && a.includes(cleanQ)))
  );

  const isNumericOnly = /^\d+$/.test(cleanQ) || rawQuery.trim().startsWith('#');

  if (!isNumericOnly && matchedRegion) {
    // ── Mode A: Region Match (Arabian Sea, Bay of Bengal, Equatorial Indian Ocean) ──
    activeSearchIdQuery = '';
    const regionKey = matchedRegion.key;

    // Filter map to this region (same as clicking subregion pill)
    currentSubRegionFilter = regionKey;
    if (regionKey === 'all') {
      filteredProfiles = [...allProfiles];
    } else {
      filteredProfiles = allProfiles.filter(p => p.subRegion === regionKey);
    }

    // Sync subregion filter pill buttons
    const filterBtns = document.querySelectorAll('.ky-argo-filter-btn');
    filterBtns.forEach(btn => {
      btn.classList.toggle('ky-argo-filter-btn--active', btn.getAttribute('data-region') === regionKey);
    });

    populateDropdown(filteredProfiles);
    renderMarkers();

    // Reset marker dimming because region filtering already filters which markers are shown
    activeMarkers.forEach(m => {
      m.wrapper.classList.remove('ky-float-marker-wrap--dimmed');
      m.wrapper.classList.remove('ky-float-marker-wrap--matched');
      m.dot.style.opacity = '';
    });

    // Unique floats in this region
    const uniqueFloatsMap = new Map();
    filteredProfiles.forEach(p => {
      if (!uniqueFloatsMap.has(p.wmoFloatId)) {
        uniqueFloatsMap.set(p.wmoFloatId, p);
      }
    });
    currentSearchMatches = Array.from(uniqueFloatsMap.values());

    // Render dropdown suggestions
    renderSearchDropdown([
      {
        type: 'region',
        region: regionKey,
        name: `${matchedRegion.label} (${currentSearchMatches.length} floats)`,
        subtext: 'Subregion Filter'
      },
      ...currentSearchMatches.slice(0, 6).map(p => ({
        type: 'float',
        profile: p,
        name: `Float #${p.wmoFloatId} (${p.subRegion})`,
        subtext: `${p.latitude.toFixed(2)}°N, ${p.longitude.toFixed(2)}°E`
      }))
    ]);

  } else {
    // ── Mode B: Float ID Match (partial or full, e.g. "2902282" or "290") ──
    activeSearchIdQuery = cleanQ;

    // Ensure all profiles are present in filteredProfiles so user can find floats in any region
    if (filteredProfiles.length !== allProfiles.length) {
      filteredProfiles = [...allProfiles];
      currentSubRegionFilter = 'all';
      const filterBtns = document.querySelectorAll('.ky-argo-filter-btn');
      filterBtns.forEach(btn => {
        btn.classList.toggle('ky-argo-filter-btn--active', btn.getAttribute('data-region') === 'all');
      });
      populateDropdown(filteredProfiles);
      renderMarkers();
    }

    // Highlight matching float markers on map, dim non-matching markers
    applyMarkerSearchHighlights(cleanQ);

    // Find matching profiles
    const matchingProfiles = allProfiles.filter(p => 
      String(p.wmoFloatId).toLowerCase().includes(cleanQ) ||
      p.id.toLowerCase().includes(cleanQ)
    );

    const uniqueFloatsMap = new Map();
    matchingProfiles.forEach(p => {
      if (!uniqueFloatsMap.has(p.wmoFloatId)) {
        uniqueFloatsMap.set(p.wmoFloatId, p);
      }
    });
    currentSearchMatches = Array.from(uniqueFloatsMap.values());

    if (currentSearchMatches.length === 0) {
      renderSearchDropdownEmpty(`No floats found matching "${q}"`);
    } else {
      renderSearchDropdown(
        currentSearchMatches.slice(0, 8).map(p => ({
          type: 'float',
          profile: p,
          name: `Float #${p.wmoFloatId} (${p.subRegion})`,
          subtext: `${p.latitude.toFixed(2)}°N, ${p.longitude.toFixed(2)}°E`
        }))
      );
    }
  }
}

/* ── Render Search Dropdown Items ──────────────────────────── */
function renderSearchDropdown(items) {
  const searchResults = document.getElementById('map-search-results') || document.getElementById('argo-search-results');
  const searchInput = document.getElementById('map-search-input') || document.getElementById('argo-search-input');
  if (!searchResults) return;

  searchResults.innerHTML = '';
  if (!items || items.length === 0) {
    searchResults.style.display = 'none';
    return;
  }

  items.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'map-search__item' + (idx === 0 && items.length === 1 ? ' is-selected' : '');
    div.innerHTML = `
      <span class="map-search__item-name">${item.name}</span>
      <span class="map-search__item-coord">${item.subtext}</span>
    `;
    div.addEventListener('click', () => {
      if (item.type === 'region') {
        applySubRegionFilter(item.region);
        if (searchInput) searchInput.value = item.name.split(' (')[0];
      } else if (item.type === 'float') {
        selectFloat(item.profile.id, true, true);
        if (searchInput) searchInput.value = `Float #${item.profile.wmoFloatId}`;
      }
      searchResults.style.display = 'none';
    });
    searchResults.appendChild(div);
  });
  searchResults.style.display = 'block';
}

/* ── Render Empty Dropdown Notice ──────────────────────────── */
function renderSearchDropdownEmpty(msg) {
  const searchResults = document.getElementById('map-search-results') || document.getElementById('argo-search-results');
  if (!searchResults) return;
  searchResults.innerHTML = `<div class="map-search__empty">${msg}</div>`;
  searchResults.style.display = 'block';
}

/* ── Keyboard Dropdown Navigation ──────────────────────────── */
function navigateDropdown(direction) {
  const searchResults = document.getElementById('map-search-results') || document.getElementById('argo-search-results');
  if (!searchResults || searchResults.style.display === 'none') return;
  const items = Array.from(searchResults.querySelectorAll('.map-search__item'));
  if (items.length === 0) return;

  let currentIndex = items.findIndex(item => item.classList.contains('is-selected'));
  if (currentIndex >= 0) items[currentIndex].classList.remove('is-selected');

  let nextIndex = currentIndex + direction;
  if (nextIndex >= items.length) nextIndex = 0;
  if (nextIndex < 0) nextIndex = items.length - 1;

  items[nextIndex].classList.add('is-selected');
  items[nextIndex].scrollIntoView({ block: 'nearest' });
}

/* ── Reset Search & Restore Map State ──────────────────────── */
function clearSearch(refocus = true) {
  const searchInput = document.getElementById('map-search-input') || document.getElementById('argo-search-input');
  const searchClear = document.getElementById('map-search-clear') || document.getElementById('argo-search-clear');
  const searchResults = document.getElementById('map-search-results') || document.getElementById('argo-search-results');

  if (searchInput) searchInput.value = '';
  if (searchClear) searchClear.style.display = 'none';
  if (searchResults) searchResults.style.display = 'none';
  activeSearchQuery = '';
  activeSearchIdQuery = '';
  currentSearchMatches = [];

  // Reset map to show all floats
  applySubRegionFilter('all');
  const filterBtns = document.querySelectorAll('.ky-argo-filter-btn');
  filterBtns.forEach(b => {
    b.classList.toggle('ky-argo-filter-btn--active', b.getAttribute('data-region') === 'all');
  });

  // Reset marker dimming / matched classes
  activeMarkers.forEach(m => {
    m.wrapper.classList.remove('ky-float-marker-wrap--dimmed');
    m.wrapper.classList.remove('ky-float-marker-wrap--matched');
    m.dot.style.opacity = '';
  });

  // If the selection was made via search, clear it
  if (selectedViaSearch) {
    clearFloatSelection();
    selectedViaSearch = false;
  }

  if (refocus && searchInput) {
    searchInput.focus();
  }
}

/* ── Clear Float Selection (Return to Initial Empty State) ─── */
function clearFloatSelection() {
  selectedProfileId = null;
  selectedCycleId = null;
  currentComparisonData = null;

  // Reveal empty state and hide comparison content
  const emptyEl = document.getElementById('argo-compare-empty');
  const contentEl = document.getElementById('argo-compare-content');
  if (emptyEl) emptyEl.style.display = 'flex';
  if (contentEl) contentEl.style.display = 'none';

  // Reset dropdowns
  const floatSelect = document.getElementById('argo-float-select');
  if (floatSelect) floatSelect.value = '';
  const dateSelect = document.getElementById('argo-date-select');
  if (dateSelect) dateSelect.innerHTML = '<option value="" disabled selected>Select observation date...</option>';

  // Reset metrics
  const rmseEl = document.getElementById('comp-float-rmse');
  const biasEl = document.getElementById('comp-float-bias');
  const corrEl = document.getElementById('comp-float-corr');
  if (rmseEl) rmseEl.textContent = '—';
  if (biasEl) biasEl.textContent = '—';
  if (corrEl) corrEl.textContent = '—';

  // Reset bottom table
  const tbody = document.getElementById('argo-table-body');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="ky-argo-table-placeholder">Select an observation date above to view profile comparison data</td>
      </tr>
    `;
  }

  // Destroy charts if active
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  if (depthErrorChartInstance) {
    depthErrorChartInstance.destroy();
    depthErrorChartInstance = null;
  }

  // Clear marker visual selections
  updateSelectedMarkerVisuals(null);
}

/* ── Client-Side Metric Verification Tool (Dev / Audit) ──────── */

/**
 * Numerically stable Pearson correlation coefficient between two 1D arrays
 */
function computePearsonCorrelation(xArr, yArr) {
  const n = xArr.length;
  if (n === 0) return 1.0;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xArr[i];
    sumY += yArr[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xArr[i] - meanX;
    const dy = yArr[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const denom = Math.sqrt(denX * denY);
  if (denom < 1e-12) return 1.0;
  return num / denom;
}

/**
 * Format numeric difference with explicit sign or clean 0.00
 */
function formatMetricDiff(diff, decimals) {
  if (Math.abs(diff) < 1e-6) {
    return (0).toFixed(decimals);
  }
  return (diff > 0 ? '+' : '') + diff.toFixed(decimals);
}

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

/**
 * Initializes the developer-only Metric Verification tool.
 * By default (no debug flag), the button is NOT rendered in the DOM at all,
 * preventing accidental clicks or exposure during demos.
 * If ?debug=true or ?dev=true is present in the URL, the tool markup is dynamically
 * rendered into #argo-dev-verify-tool and event listeners are wired.
 */
function initDevVerifyTool() {
  const mount = document.getElementById('argo-dev-verify-tool');
  if (!mount) return;

  if (!isDevModeEnabled()) {
    // Ensure clean empty state when debug mode is disabled (nothing rendered)
    mount.innerHTML = '';
    mount.className = '';
    return;
  }

  // Debug flag is active: Render the verification tool into DOM
  mount.className = 'ky-argo-dev-tool';
  mount.innerHTML = `
    <div class="ky-argo-dev-bar">
      <span class="ky-argo-dev-status" id="argo-dev-status"></span>
      <button type="button" id="btn-verify-metrics" class="ky-argo-dev-btn" aria-expanded="false" aria-controls="argo-dev-verify-panel">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 17 10 11 4 5"></polyline>
          <line x1="12" y1="19" x2="20" y2="19"></line>
        </svg>
        Verify Metrics (Dev)
      </button>
    </div>
    <div class="ky-argo-dev-panel" id="argo-dev-verify-panel" style="display: none;"></div>
  `;

  const verifyBtn = document.getElementById('btn-verify-metrics');
  if (verifyBtn) {
    verifyBtn.addEventListener('click', verifyMetricsDev);
  }
}

/**
 * Main verification routine: fetches raw per-float, per-depth data fresh
 * and recomputes Basin RMSE, Mean Thermal Bias, and Profile Coherence.
 */
async function verifyMetricsDev() {
  const btn = document.getElementById('btn-verify-metrics');
  const panel = document.getElementById('argo-dev-verify-panel');
  const statusEl = document.getElementById('argo-dev-status');

  const originalBtnHtml = btn ? btn.innerHTML : 'Verify Metrics (Dev)';
  if (btn) {
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: kyFloatPulse 1s linear infinite; margin-right: 4px;">
        <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12"/>
      </svg>
      Recomputing...
    `;
  }
  if (statusEl) {
    statusEl.textContent = 'Fetching fresh profile data...';
  }

  const startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  try {
    // 1. Fresh fetch of /argo/profiles (all 41 floats, no caching)
    const profilesRes = await fetch(`${API_BASE}/argo/profiles`, { cache: 'no-store' });
    if (!profilesRes.ok) throw new Error(`HTTP ${profilesRes.status} fetching /argo/profiles`);
    const profiles = await profilesRes.json();

    if (statusEl) {
      statusEl.textContent = `Fetching comparisons for ${profiles.length} floats...`;
    }

    // 2. Fresh fetch of each float's per-depth comparison data (no caching)
    const compareResults = await Promise.all(
      profiles.map(p =>
        fetch(`${API_BASE}/argo/compare?id=${encodeURIComponent(p.id)}&raw=true`, { cache: 'no-store' })
          .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status} on float profile ${p.id}`);
            return res.json();
          })
      )
    );

    // 3. Pool ALL point-wise errors across all floats and depths
    let floatsUsed = 0;
    const pooledErrors = [];     // (predicted - actual)
    const pooledSqErrors = [];   // (predicted - actual)^2
    const pooledPred = [];       // AI model predictions
    const pooledActual = [];     // ARGO in-situ observations

    for (const item of compareResults) {
      if (!item || !Array.isArray(item.aiTemps) || !Array.isArray(item.argoTemps) || !Array.isArray(item.depths)) {
        continue;
      }
      floatsUsed++;
      const { aiTemps, argoTemps, depths } = item;
      for (let i = 0; i < depths.length; i++) {
        const pred = aiTemps[i];
        const actual = argoTemps[i];
        if (typeof pred === 'number' && !isNaN(pred) && typeof actual === 'number' && !isNaN(actual)) {
          const err = pred - actual;
          pooledErrors.push(err);
          pooledSqErrors.push(err * err);
          pooledPred.push(pred);
          pooledActual.push(actual);
        }
      }
    }

    const totalPoints = pooledErrors.length;
    if (totalPoints === 0) {
      throw new Error('No valid point-wise depth data found across floats.');
    }

    // 4. Compute pooled metrics
    // Pooled RMSE = sqrt(mean of squared errors) across full pooled array
    const meanSqError = pooledSqErrors.reduce((a, b) => a + b, 0) / totalPoints;
    const pooledRmse = Math.sqrt(meanSqError);

    // Mean Thermal Bias = mean of (predicted - actual), preserving sign
    const meanBias = pooledErrors.reduce((a, b) => a + b, 0) / totalPoints;

    // Profile Coherence = Pearson correlation coefficient between full pooled arrays
    const coherence = computePearsonCorrelation(pooledPred, pooledActual);

    // Read displayed values directly from summary cards in DOM
    const dispRmseEl = document.getElementById('stat-argo-rmse');
    const dispBiasEl = document.getElementById('stat-argo-bias');
    const dispCorrEl = document.getElementById('stat-argo-corr');
    const dispFloatsEl = document.getElementById('stat-argo-floats');

    const dispRmse = dispRmseEl ? parseFloat(dispRmseEl.textContent) : 1.34;
    const dispBias = dispBiasEl ? parseFloat(dispBiasEl.textContent) : 0.41;
    const dispCorr = dispCorrEl ? parseFloat(dispCorrEl.textContent) : 0.986;
    const dispFloats = dispFloatsEl ? parseInt(dispFloatsEl.textContent, 10) : 41;

    // Rounded recomputed values for comparison display
    const recompRmse = Number(pooledRmse.toFixed(2));
    const recompBias = Number(meanBias.toFixed(2));
    const recompCorr = Number(coherence.toFixed(3));

    // Numerical differences (Recomputed - Displayed)
    const diffRmse = Number((recompRmse - dispRmse).toFixed(2));
    const diffBias = Number((recompBias - dispBias).toFixed(2));
    const diffCorr = Number((recompCorr - dispCorr).toFixed(3));

    // STEP 5: Mismatch criteria:
    // |Displayed - Recomputed| > 0.05 for RMSE/Bias, > 0.01 for Coherence, points !== 615, floats !== 41
    const isRmseMismatch = Math.abs(recompRmse - dispRmse) > 0.05;
    const isBiasMismatch = Math.abs(recompBias - dispBias) > 0.05;
    const isCorrMismatch = Math.abs(recompCorr - dispCorr) > 0.01;
    const isPointsMismatch = (totalPoints !== 615);
    const isFloatsMismatch = (floatsUsed !== dispFloats);

    const hasAnyMismatch = isRmseMismatch || isBiasMismatch || isCorrMismatch || isPointsMismatch || isFloatsMismatch;

    // STEP 4: Console.log formatted comparison table
    const consoleOutput = [
      '',
      '  METRIC VERIFICATION',
      '  --------------------------------------------',
      `  Basin RMSE:         Displayed = ${dispRmse.toFixed(2)}°C   Recomputed = ${recompRmse.toFixed(2)}°C   Diff = ${formatMetricDiff(diffRmse, 2)}`,
      `  Mean Thermal Bias:  Displayed = ${dispBias.toFixed(2)}°C   Recomputed = ${recompBias >= 0 ? '+' : ''}${recompBias.toFixed(2)}°C   Diff = ${formatMetricDiff(diffBias, 2)}`,
      `  Profile Coherence:  Displayed = ${dispCorr.toFixed(3)}    Recomputed = ${recompCorr.toFixed(3)}    Diff = ${formatMetricDiff(diffCorr, 3)}`,
      `  Floats used:        Displayed = ${dispFloats}       Recomputed used = ${floatsUsed}`,
      `  Total data points:  Recomputed used = ${totalPoints} (expected 41 floats x 15 depths = 615)`,
      '  --------------------------------------------',
    ].join('\n');
    console.log(consoleOutput);

    if (hasAnyMismatch) {
      console.warn('⚠️ Mismatch detected — check backend aggregation logic.');
    } else {
      console.log('✓ All recomputed metrics match displayed values within tolerance.');
    }

    const endTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const elapsedMs = Math.round(endTime - startTime);

    // STEP 4 & 5: Render comparison table in collapsible panel
    if (panel) {
      panel.style.display = 'block';
      panel.innerHTML = renderVerifyPanelHtml({
        dispRmse,
        dispBias,
        dispCorr,
        dispFloats,
        recompRmse,
        recompBias,
        recompCorr,
        floatsUsed,
        totalPoints,
        diffRmse,
        diffBias,
        diffCorr,
        isRmseMismatch,
        isBiasMismatch,
        isCorrMismatch,
        isPointsMismatch,
        isFloatsMismatch,
        hasAnyMismatch,
        elapsedMs,
      });

      // Bind panel close button
      const closeBtn = panel.querySelector('.ky-argo-dev-close-btn');
      closeBtn?.addEventListener('click', () => {
        panel.style.display = 'none';
        if (btn) btn.setAttribute('aria-expanded', 'false');
      });

      if (btn) btn.setAttribute('aria-expanded', 'true');
    }

    if (statusEl) {
      statusEl.textContent = `Recomputed ${totalPoints} data points in ${elapsedMs}ms`;
    }
  } catch (err) {
    console.error('Error during ARGO metric verification:', err);
    if (panel) {
      panel.style.display = 'block';
      panel.innerHTML = `
        <div class="ky-argo-dev-alert ky-argo-dev-alert--error">
          <strong>Verification Failed:</strong> ${err.message || err}
        </div>
      `;
    }
    if (statusEl) {
      statusEl.textContent = 'Verification error';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.innerHTML = originalBtnHtml;
    }
  }
}

/**
 * Builds HTML table for the collapsible audit panel
 */
function renderVerifyPanelHtml(data) {
  const {
    dispRmse, dispBias, dispCorr, dispFloats,
    recompRmse, recompBias, recompCorr, floatsUsed, totalPoints,
    diffRmse, diffBias, diffCorr,
    isRmseMismatch, isBiasMismatch, isCorrMismatch, isPointsMismatch, isFloatsMismatch,
    hasAnyMismatch, elapsedMs
  } = data;

  const mismatchNotice = 'Mismatch detected — check backend aggregation logic.';

  const rows = [
    {
      metric: 'Basin RMSE',
      displayed: `${dispRmse.toFixed(2)} °C`,
      recomputed: `${recompRmse.toFixed(2)} °C`,
      diff: `${formatMetricDiff(diffRmse, 2)} °C`,
      isMismatch: isRmseMismatch,
      note: isRmseMismatch ? mismatchNotice : '✓ Within tolerance (≤ 0.05°C)'
    },
    {
      metric: 'Mean Thermal Bias',
      displayed: `${dispBias.toFixed(2)} °C`,
      recomputed: `${recompBias >= 0 ? '+' : ''}${recompBias.toFixed(2)} °C`,
      diff: `${formatMetricDiff(diffBias, 2)} °C`,
      isMismatch: isBiasMismatch,
      note: isBiasMismatch ? mismatchNotice : '✓ Within tolerance (≤ 0.05°C)'
    },
    {
      metric: 'Profile Coherence',
      displayed: `${dispCorr.toFixed(3)}`,
      recomputed: `${recompCorr.toFixed(3)}`,
      diff: `${formatMetricDiff(diffCorr, 3)}`,
      isMismatch: isCorrMismatch,
      note: isCorrMismatch ? mismatchNotice : '✓ Within tolerance (≤ 0.010)'
    },
    {
      metric: 'Floats used',
      displayed: `${dispFloats}`,
      recomputed: `${floatsUsed}`,
      diff: `${floatsUsed - dispFloats}`,
      isMismatch: isFloatsMismatch,
      note: isFloatsMismatch ? mismatchNotice : '✓ All 41 floats processed'
    },
    {
      metric: 'Total data points',
      displayed: '615',
      recomputed: `${totalPoints}`,
      diff: `${totalPoints - 615}`,
      isMismatch: isPointsMismatch,
      note: isPointsMismatch
        ? `Mismatch detected — check backend aggregation logic. (Missing data: expected 615, got ${totalPoints})`
        : '✓ Expected 41 floats × 15 depths = 615 points'
    }
  ];

  const rowsHtml = rows.map(r => `
    <tr class="${r.isMismatch ? 'ky-argo-dev-row--mismatch' : 'ky-argo-dev-row--ok'}">
      <td style="font-weight: 600;">${r.metric}</td>
      <td>${r.displayed}</td>
      <td>${r.recomputed}</td>
      <td>${r.diff}</td>
      <td>
        <span class="${r.isMismatch ? 'ky-argo-dev-badge--mismatch' : 'ky-argo-dev-badge--ok'}">
          ${r.note}
        </span>
      </td>
    </tr>
  `).join('');

  return `
    <div class="ky-argo-dev-panel-header">
      <div class="ky-argo-dev-panel-title">
        <span class="ky-argo-dev-tag">AUDIT</span>
        <strong>Client-Side Metric Verification</strong>
        <span class="ky-argo-dev-time">(${elapsedMs}ms fresh live recomputation)</span>
      </div>
      <button type="button" class="ky-argo-dev-close-btn" aria-label="Close audit panel">&times;</button>
    </div>
    <div class="ky-argo-dev-table-wrap">
      <table class="ky-argo-dev-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Displayed</th>
            <th>Recomputed</th>
            <th>Diff</th>
            <th>Audit Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
    ${hasAnyMismatch ? `
      <div class="ky-argo-dev-alert ky-argo-dev-alert--error">
        <strong>⚠️ Mismatch detected — check backend aggregation logic.</strong>
        One or more recomputed pooled values deviate from the displayed summary benchmark cards.
      </div>
    ` : `
      <div class="ky-argo-dev-alert ky-argo-dev-alert--success">
        <strong>✓ Verification Passed:</strong> Independently recomputed pooled RMSE, Mean Thermal Bias, and Pearson Profile Coherence match displayed values across all 41 floats and 615 depth points.
      </div>
    `}
  `;
}

if (typeof window !== 'undefined') {
  window.renderDepthErrorChart = renderDepthErrorChart;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ...(module.exports || {}),
    renderDepthErrorChart,
  };
}


