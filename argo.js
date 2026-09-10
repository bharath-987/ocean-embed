/**
 * Kyogre — ARGO In-Situ Validation & Comparison Client Logic
 * Connects to /argo/profiles, /argo/compare, and /argo/summary
 */

const API_BASE = 'http://localhost:8000';

// Global State
let map = null;
let allProfiles = [];
let filteredProfiles = [];
let activeMarkers = []; // Array of { id, marker, wrapper, dot, label, pulseRing, profile }
let selectedProfileId = null;
let selectedCycleId = null;
let currentComparisonData = null;
let chartInstance = null;
let currentSubRegionFilter = 'all';
let selectedViaSearch = false; // Tracks if current float selection was made via search
let activeSearchQuery = '';
let activeSearchIdQuery = '';
let currentSearchMatches = [];

const KNOWN_REGIONS = [
  { key: 'Arabian Sea', label: 'Arabian Sea', aliases: ['arabian', 'arabian sea', 'as'] },
  { key: 'Bay of Bengal', label: 'Bay of Bengal', aliases: ['bay of bengal', 'bay', 'bengal', 'bob'] },
  { key: 'Equatorial Indian Ocean', label: 'Equatorial Indian Ocean', aliases: ['equatorial', 'equator', 'equatorial indian ocean', 'eio'] },
  { key: 'Andaman Sea', label: 'Andaman Sea', aliases: ['andaman', 'andaman sea'] },
  { key: 'all', label: 'All', aliases: ['all'] },
];

/* ── DOMContentLoaded Initialization ───────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  setupEventListeners();
  await loadSummaryStats();
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
    updateSelectedMarkerVisuals(cycleId);
    const subEl = document.getElementById('argo-selected-sub');
    if (subEl) {
      subEl.textContent = `${cycleProfile.latitude.toFixed(2)}°N, ${cycleProfile.longitude.toFixed(2)}°E · ${cycleProfile.date} (${cycleProfile.subRegion})`;
    }
  }

  // Hide placeholder and reveal chart canvas box
  const placeholderEl = document.getElementById('argo-chart-placeholder');
  const chartBox = document.getElementById('argo-chart-box');
  if (placeholderEl) placeholderEl.style.display = 'none';
  if (chartBox) chartBox.style.display = 'block';

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

  // 2. Render Chart.js Temperature Profile Line Graph
  renderChart(depths, aiTemps, argoTemps);

  // 3. Render Bottom Plain Data Table (Depth, AI Model, ARGO Float, Diff)
  const tbody = document.getElementById('argo-table-body');
  if (tbody) {
    tbody.innerHTML = '';
    depths.forEach((depth, i) => {
      const tr = document.createElement('tr');
      const ai = aiTemps[i] !== undefined ? aiTemps[i].toFixed(2) : '—';
      const argo = argoTemps[i] !== undefined ? argoTemps[i].toFixed(2) : '—';
      const diff = diffs[i];
      let diffStr = '—';
      if (diff !== undefined) {
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
  const aiData = depths.map((d, i) => ({ x: aiTemps[i], y: d }));
  const argoData = depths.map((d, i) => ({ x: argoTemps[i], y: d }));

  chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'AI Reconstructed',
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
    // ── Mode A: Region Match (Arabian Sea, Bay of Bengal, Equatorial, Andaman) ──
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

  // Destroy chart if active
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  // Clear marker visual selections
  updateSelectedMarkerVisuals(null);
}
