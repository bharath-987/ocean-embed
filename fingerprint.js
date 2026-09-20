/**
 * Kyogre — Fingerprint Atlas & Ocean Regimes Client Script
 * Visualizes 8 unsupervised oceanographic regimes derived from CNN-LSTM embeddings.
 * Disclosure: colours are relative, not physical units.
 */

let mapInstance = null;
let regimeChartInstance = null;
let currentRegimeData = null;
let selectedRegime = null;
let currentDate = '2023-10-22';
let slaOverlayActive = false;
let currentSlaGrid = null;

const REGIME_NAMES = [
  'Northern Arabian Sea High-Salinity',
  'Central Basin Stratified',
  'Equatorial Warm Pool',
  'Bay of Bengal Freshwater Lens',
  'Somali / Oman Upwelling Core',
  'South Equatorial Thermocline Ridge',
  'Sri Lanka Dome Cyclonic Gyre',
  'Andaman Sea Deep Basin'
];

document.addEventListener('DOMContentLoaded', () => {
  initDateControls();
  initMap();
  initSlaToggle();
  loadRegimes(currentDate);
});

function initDateControls() {
  const dateBtn = document.getElementById('ky-date-btn');
  const datePicker = document.getElementById('native-date-picker');
  const dateDisplay = document.getElementById('date-display-header');

  if (dateBtn && datePicker) {
    dateBtn.addEventListener('click', () => {
      if (typeof datePicker.showPicker === 'function') {
        datePicker.showPicker();
      } else {
        datePicker.click();
      }
    });

    datePicker.addEventListener('change', (e) => {
      const newDate = e.target.value;
      if (!newDate) return;
      if (newDate < '2023-06-01' || newDate > '2023-12-31') {
        alert('Date outside active window: Currently serving the 14-year model for June–December 2023.');
        e.target.value = currentDate;
        return;
      }
      currentDate = newDate;
      if (dateDisplay) dateDisplay.textContent = currentDate;
      loadRegimes(currentDate);
      if (slaOverlayActive) {
        loadSlaGrid(currentDate);
      }
    });
  }
}

function initMap() {
  mapInstance = new maplibregl.Map({
    container: 'atlas-map',
    style: {
      version: 8,
      sources: {
        'osm-tiles': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution: '&copy; Esri &mdash; GEBCO, NOAA, CHS, OSU, UNH, CSUMB, National Geographic',
        },
      },
      layers: [
        {
          id: 'osm-tiles-layer',
          type: 'raster',
          source: 'osm-tiles',
          minzoom: 0,
          maxzoom: 18,
        },
      ],
    },
    center: [75.0, 15.0],
    zoom: 4.2,
    maxBounds: [
      [40.0, 2.0],
      [110.0, 32.0],
    ],
  });

  mapInstance.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
}

function initSlaToggle() {
  const toggle = document.getElementById('toggle-sla');
  if (toggle) {
    toggle.addEventListener('change', (e) => {
      slaOverlayActive = e.target.checked;
      if (slaOverlayActive) {
        loadSlaGrid(currentDate);
      } else {
        removeSlaLayer();
        renderRegimeOverlay();
      }
    });
  }
}

async function loadRegimes(dateStr) {
  try {
    const res = await fetch(`http://localhost:8000/regimes?date=${dateStr}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    currentRegimeData = data;

    renderChips(data);
    renderTable(data);
    renderChart(data);

    if (mapInstance.isStyleLoaded()) {
      renderRegimeOverlay();
    } else {
      mapInstance.once('load', () => renderRegimeOverlay());
    }
  } catch (err) {
    console.error('Failed to load regimes:', err);
  }
}

async function loadSlaGrid(dateStr) {
  try {
    const res = await fetch(`http://localhost:8000/parameter-grid?param=sla&date=${dateStr}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    currentSlaGrid = data.grid;
    renderRegimeOverlay();
  } catch (err) {
    console.error('Failed to load SLA grid:', err);
  }
}

function renderChips(data) {
  const container = document.getElementById('regime-chips-container');
  if (!container) return;
  container.innerHTML = '';

  data.hexColors.forEach((color, idx) => {
    const chip = document.createElement('div');
    chip.className = `ky-atlas-chip ${selectedRegime === idx ? 'ky-atlas-chip--active' : ''}`;
    chip.innerHTML = `
      <span class="ky-atlas-chip-color" style="background: ${color};"></span>
      <span>Regime ${idx}</span>
    `;
    chip.addEventListener('click', () => {
      if (selectedRegime === idx) {
        selectedRegime = null;
      } else {
        selectedRegime = idx;
      }
      updateSelectionState();
    });
    container.appendChild(chip);
  });
}

function renderTable(data) {
  const container = document.getElementById('regime-table-body');
  if (!container) return;
  container.innerHTML = '';

  const thermoclineIdx = data.depths.indexOf(100);

  data.relativeProfiles.forEach((relProf, idx) => {
    const d100 = thermoclineIdx !== -1 ? relProf[thermoclineIdx] : 0;
    const sign = d100 > 0 ? '+' : '';
    const color = data.hexColors[idx];

    const row = document.createElement('div');
    row.className = `ky-atlas-regime-row ${selectedRegime === idx ? 'ky-atlas-regime-row--active' : ''}`;
    row.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="width: 8px; height: 8px; border-radius: 50%; background: ${color};"></span>
        <span style="font-weight: 600; color: #1E293B;">Regime ${idx}: ${REGIME_NAMES[idx] || 'Oceanic Water Mass'}</span>
      </div>
      <div style="font-weight: 700; color: ${d100 >= 0 ? '#16A34A' : '#DC2626'};">
        100m: ${sign}${d100.toFixed(2)} °C
      </div>
    `;
    row.addEventListener('click', () => {
      selectedRegime = selectedRegime === idx ? null : idx;
      updateSelectionState();
    });
    container.appendChild(row);
  });
}

function updateSelectionState() {
  // Update chips
  document.querySelectorAll('.ky-atlas-chip').forEach((chip, idx) => {
    chip.classList.toggle('ky-atlas-chip--active', selectedRegime === idx);
  });
  // Update table rows
  document.querySelectorAll('.ky-atlas-regime-row').forEach((row, idx) => {
    row.classList.toggle('ky-atlas-regime-row--active', selectedRegime === idx);
  });
  // Update chart highlights
  if (regimeChartInstance) {
    regimeChartInstance.data.datasets.forEach((ds, idx) => {
      if (idx === 0) return; // Reference line
      const rIdx = idx - 1;
      if (selectedRegime === null) {
        ds.borderWidth = 2.5;
        ds.borderColor = currentRegimeData.hexColors[rIdx];
      } else if (selectedRegime === rIdx) {
        ds.borderWidth = 4.5;
        ds.borderColor = currentRegimeData.hexColors[rIdx];
      } else {
        ds.borderWidth = 1.0;
        ds.borderColor = '#CBD5E1';
      }
    });
    regimeChartInstance.update();
  }
  // Re-render map overlay
  renderRegimeOverlay();
}

function renderChart(data) {
  const ctx = document.getElementById('regime-profile-chart');
  if (!ctx) return;

  if (regimeChartInstance) {
    regimeChartInstance.destroy();
  }

  const depths = data.depths;

  const datasets = [
    {
      label: 'Domain Average (Baseline 0.0 °C)',
      data: depths.map(d => ({ x: 0.0, y: d })),
      borderColor: '#0F172A',
      borderWidth: 2,
      borderDash: [5, 5],
      pointRadius: 0,
      fill: false,
    },
  ];

  data.relativeProfiles.forEach((relProf, idx) => {
    datasets.push({
      label: `Regime ${idx} (${REGIME_NAMES[idx] || 'Regime ' + idx})`,
      data: depths.map((d, dIdx) => ({ x: relProf[dIdx], y: d })),
      borderColor: data.hexColors[idx],
      backgroundColor: data.hexColors[idx],
      borderWidth: 2.5,
      pointRadius: 3,
      pointHoverRadius: 6,
      tension: 0.25,
      fill: false,
    });
  });

  regimeChartInstance = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 10,
            font: { size: 10, family: 'Inter' },
            padding: 8,
          },
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const rIdx = context.datasetIndex - 1;
              const dIdx = depths.indexOf(context.parsed.y);
              const absTemp = rIdx >= 0 ? data.profiles[rIdx][dIdx] : data.meanProfile[dIdx];
              return `${context.dataset.label}: ΔT = ${context.parsed.x > 0 ? '+' : ''}${context.parsed.x.toFixed(2)} °C (Actual: ${absTemp.toFixed(2)} °C)`;
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Temperature Difference Relative to Domain Average (ΔT °C)',
            font: { size: 11, weight: '600', family: 'Inter' },
            color: '#475569',
          },
          grid: {
            color: (context) => (context.tick.value === 0 ? '#0F172A' : '#E2E8F0'),
            lineWidth: (context) => (context.tick.value === 0 ? 2 : 1),
          },
          ticks: {
            font: { size: 10, family: 'Inter' },
          },
        },
        y: {
          reverse: true,
          title: {
            display: true,
            text: 'Depth (meters)',
            font: { size: 11, weight: '600', family: 'Inter' },
            color: '#475569',
          },
          ticks: {
            font: { size: 10, family: 'Inter' },
          },
          grid: { color: '#E2E8F0' },
        },
      },
    },
  });
}

function renderRegimeOverlay() {
  if (!mapInstance || !currentRegimeData) return;

  const labels = currentRegimeData.labels; // 101 x 241
  const H = labels.length;
  const W = labels[0].length;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(W, H);
  const data = imgData.data;

  const rgbColors = currentRegimeData.colors;

  for (let r = 0; r < H; r++) {
    // Invert row index because array row 0 is min_lat (south) while canvas row 0 is top (north)
    const latRow = H - 1 - r;
    for (let c = 0; c < W; c++) {
      const idx = (r * W + c) * 4;
      const label = labels[latRow][c];

      if (label === -1) {
        // Land
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      } else {
        const isDimmed = selectedRegime !== null && selectedRegime !== label;
        const color = rgbColors[label];

        if (slaOverlayActive && currentSlaGrid) {
          // Modulate with SLA (Sea Level Anomaly) brightness
          const sla = currentSlaGrid[latRow] ? currentSlaGrid[latRow][c] : 0;
          const factor = sla !== null ? Math.max(0.5, Math.min(1.5, 1.0 + sla * 1.5)) : 1.0;
          data[idx] = Math.min(255, color[0] * factor);
          data[idx + 1] = Math.min(255, color[1] * factor);
          data[idx + 2] = Math.min(255, color[2] * factor);
        } else {
          data[idx] = color[0];
          data[idx + 1] = color[1];
          data[idx + 2] = color[2];
        }

        data[idx + 3] = isDimmed ? 45 : 210; // Semi-transparent
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const dataUrl = canvas.toDataURL();

  const sourceId = 'regime-overlay-source';
  const layerId = 'regime-overlay-layer';

  const bounds = [
    [45.0, 5.0],   // SW
    [105.0, 5.0],  // SE
    [105.0, 30.0], // NE
    [45.0, 30.0],  // NW
  ];

  if (mapInstance.getSource(sourceId)) {
    mapInstance.getSource(sourceId).updateImage({ url: dataUrl, coordinates: bounds });
  } else {
    mapInstance.addSource(sourceId, {
      type: 'image',
      url: dataUrl,
      coordinates: bounds,
    });

    mapInstance.addLayer({
      id: layerId,
      type: 'raster',
      source: sourceId,
      paint: {
        'raster-opacity': 0.88,
        'raster-fade-duration': 100,
      },
    });
  }
}

function removeSlaLayer() {
  currentSlaGrid = null;
}
