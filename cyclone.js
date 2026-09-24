/**
 * cyclone.js — Kyogre Cyclone Mode
 * 
 * Pre-storm ocean thermal reservoir (TCHP) reconstructions and track verification.
 * Methodology: Examines the ocean fuel the storm was about to cross, reconstructed from satellites.
 * 
 * Non-negotiable directives:
 * - Reconstructs historical conditions for past storm tracks — does NOT forecast.
 * - Never uses forbidden terms.
 * - Handles null fuel over land as clean gaps, never as zero.
 */

(function () {
  'use strict';

  const API_BASE = (typeof window !== 'undefined' && window.API_BASE_URL)
    ? window.API_BASE_URL
    : 'http://localhost:8000';

  // Standard depths for Argo comparison
  const ARGO_DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300];

  // Category styling helpers
  function getCategoryClass(cat) {
    const c = (cat || '').toUpperCase();
    if (c === 'ESCS' || c === 'SUCS') return 'ky-cat-escs';
    if (c === 'VSCS') return 'ky-cat-vscs';
    if (c === 'SCS') return 'ky-cat-scs';
    if (c === 'CS') return 'ky-cat-cs';
    return 'ky-cat-d';
  }

  function getWindColor(windKt) {
    const w = Number(windKt) || 0;
    if (w >= 90) return '#EF4444'; // ESCS / SuCS: Red
    if (w >= 64) return '#F97316'; // VSCS: Orange
    if (w >= 48) return '#FBBF24'; // SCS: Amber
    if (w >= 34) return '#34D399'; // CS: Emerald
    return '#38BDF8';              // D / DD: Sky Blue
  }

  function formatDateShort(isoStr) {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    } catch (e) {
      return isoStr;
    }
  }

  function formatDateTime(isoStr) {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) + ' UTC';
    } catch (e) {
      return isoStr;
    }
  }

  // Application State
  let cyclonesCatalog = [];
  let currentStormName = 'BIPARJOY';
  let currentStormData = null;
  let mapInstance = null;
  let chartInstance = null;
  let activeFloatIndex = 0;
  let rasterCanvas = null;

  /* ============================================================
     MapLibre GL Initialization
     ============================================================ */

  function initMap() {
    if (typeof maplibregl === 'undefined') return;
    const container = document.getElementById('cyclone-map');
    if (!container) return;

    mapInstance = new maplibregl.Map({
      container: 'cyclone-map',
      style: {
        version: 8,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            ],
            tileSize: 256,
            attribution: 'Esri, Maxar, Earthstar Geographics'
          }
        },
        layers: [
          {
            id: 'satellite-base',
            type: 'raster',
            source: 'osm-tiles',
            minzoom: 0,
            maxzoom: 18
          }
        ]
      },
      center: [72.0, 18.0],
      zoom: 4.2,
      attributionControl: false
    });

    mapInstance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    mapInstance.on('load', () => {
      if (currentStormData) {
        renderMapOverlay(currentStormData);
      }
    });
  }

  /* ============================================================
     TCHP Colormap Canvas Generation
     ============================================================ */

  function getTchpRgba(val) {
    if (val === null || val === undefined || isNaN(val) || val <= 0) {
      return [0, 0, 0, 0]; // Transparent outside domain / land
    }
    // Continuous TCHP color ramp: 0 to 125+ kJ/cm²
    // 0: Deep Blue [30, 58, 138], 30: Cyan [6, 182, 212], 60: Emerald [16, 185, 129]
    // 85: Yellow [250, 204, 21], 105: Orange [249, 115, 22], 125+: Crimson [220, 38, 38]
    const clamped = Math.max(0, Math.min(130, val));
    let r = 0, g = 0, b = 0;
    if (clamped < 30) {
      const t = clamped / 30;
      r = Math.round(30 + (6 - 30) * t);
      g = Math.round(58 + (182 - 58) * t);
      b = Math.round(138 + (212 - 138) * t);
    } else if (clamped < 60) {
      const t = (clamped - 30) / 30;
      r = Math.round(6 + (16 - 6) * t);
      g = Math.round(182 + (185 - 182) * t);
      b = Math.round(212 + (129 - 212) * t);
    } else if (clamped < 85) {
      const t = (clamped - 60) / 25;
      r = Math.round(16 + (250 - 16) * t);
      g = Math.round(185 + (204 - 185) * t);
      b = Math.round(129 + (21 - 129) * t);
    } else if (clamped < 105) {
      const t = (clamped - 85) / 20;
      r = Math.round(250 + (249 - 250) * t);
      g = Math.round(204 + (115 - 204) * t);
      b = Math.round(21 + (22 - 21) * t);
    } else {
      const t = Math.min(1, (clamped - 105) / 25);
      r = Math.round(249 + (220 - 249) * t);
      g = Math.round(115 + (38 - 115) * t);
      b = Math.round(22 + (38 - 22) * t);
    }
    return [r, g, b, 175]; // 0.68 opacity over satellite base
  }

  async function fetchAndRenderTchpRaster(stormName) {
    const loadingEl = document.getElementById('cyclone-map-loading');
    if (loadingEl) loadingEl.style.display = 'flex';

    try {
      const res = await fetch(`${API_BASE}/cyclone/${stormName}/map-grid`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const grid = data.grid; // 101 x 241
      const lats = data.lats;
      const lons = data.lons;
      const H = grid.length;
      const W = grid[0].length;

      if (!rasterCanvas) {
        rasterCanvas = document.createElement('canvas');
      }
      rasterCanvas.width = W;
      rasterCanvas.height = H;
      const ctx = rasterCanvas.getContext('2d');
      const imgData = ctx.createImageData(W, H);
      const buf = imgData.data;

      // Note: grid is indexed [lat_idx, lon_idx], where lat_idx 0 is 5.0°N (bottom), lat_idx 100 is 30.0°N (top)
      // Canvas expects row 0 at top, so invert Y
      for (let r = 0; r < H; r++) {
        const latIdx = (H - 1) - r;
        const row = grid[latIdx];
        for (let c = 0; c < W; c++) {
          const val = row[c];
          const [red, green, blue, alpha] = getTchpRgba(val);
          const pxIdx = (r * W + c) * 4;
          buf[pxIdx]     = red;
          buf[pxIdx + 1] = green;
          buf[pxIdx + 2] = blue;
          buf[pxIdx + 3] = alpha;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // Coordinates for full Indian Ocean domain: [west, north], [east, north], [east, south], [west, south]
      const west = lons[0];
      const east = lons[lons.length - 1];
      const south = lats[0];
      const north = lats[lats.length - 1];

      const coordinates = [
        [west, north],
        [east, north],
        [east, south],
        [west, south]
      ];

      if (mapInstance.getSource('tchp-raster-src')) {
        mapInstance.removeLayer('tchp-raster-layer');
        mapInstance.removeSource('tchp-raster-src');
      }

      mapInstance.addSource('tchp-raster-src', {
        type: 'image',
        url: rasterCanvas.toDataURL(),
        coordinates: coordinates
      });

      // Insert raster layer below track markers
      const beforeLayer = mapInstance.getLayer('cyclone-track-line') ? 'cyclone-track-line' : undefined;
      mapInstance.addLayer({
        id: 'tchp-raster-layer',
        type: 'raster',
        source: 'tchp-raster-src',
        paint: {
          'raster-opacity': 0.85,
          'raster-fade-duration': 300
        }
      }, beforeLayer);

      const mapDateEl = document.getElementById('map-date-indicator');
      if (mapDateEl) {
        mapDateEl.textContent = `Pre-Storm TCHP (${data.map_date}) 2 days prior to genesis`;
      }
    } catch (err) {
      console.warn('[Cyclone Map] TCHP raster fetch skipped or failed:', err);
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  /* ============================================================
     Map Overlay: Track Line & Fix Markers
     ============================================================ */

  function renderMapOverlay(storm) {
    if (!mapInstance || !mapInstance.isStyleLoaded()) return;

    fetchAndRenderTchpRaster(storm.name);

    const track = storm.track || [];
    if (!track.length) return;

    // Build GeoJSON features for track line and fixes
    const lineCoordinates = track.map(f => [f.lon, f.lat]);

    // Segment lines by category colors
    const segmentFeatures = [];
    for (let i = 0; i < track.length - 1; i++) {
      const f1 = track[i];
      const f2 = track[i + 1];
      segmentFeatures.push({
        type: 'Feature',
        properties: {
          wind_kt: f2.wind_kt,
          color: getWindColor(f2.wind_kt)
        },
        geometry: {
          type: 'LineString',
          coordinates: [[f1.lon, f1.lat], [f2.lon, f2.lat]]
        }
      });
    }

    const lineGeoJson = {
      type: 'FeatureCollection',
      features: segmentFeatures
    };

    const pointFeatures = track.map((f, idx) => ({
      type: 'Feature',
      properties: {
        index: idx,
        time: f.time,
        lat: f.lat,
        lon: f.lon,
        wind_kt: f.wind_kt,
        category: f.category,
        speed_kmh: f.speed_kmh ? f.speed_kmh.toFixed(1) : '—',
        ri: f.ri === true,
        color: getWindColor(f.wind_kt),
        has_fuel: Boolean(f.fuel && f.fuel.tchp !== null),
        tchp: f.fuel && f.fuel.tchp !== null ? f.fuel.tchp.toFixed(1) : null,
        d26: f.fuel && f.fuel.d26 !== null ? f.fuel.d26.toFixed(1) : null,
        sst: f.fuel && f.fuel.sst_obs !== null ? f.fuel.sst_obs.toFixed(1) : null,
        mld: f.fuel && f.fuel.mld !== null ? f.fuel.mld.toFixed(1) : null,
        day_used: f.fuel ? f.fuel.day_used : null
      },
      geometry: {
        type: 'Point',
        coordinates: [f.lon, f.lat]
      }
    }));

    const pointGeoJson = {
      type: 'FeatureCollection',
      features: pointFeatures
    };

    // Remove existing track layers
    ['cyclone-track-line', 'cyclone-fixes-ri', 'cyclone-fixes-core', 'cyclone-fixes-outer'].forEach(id => {
      if (mapInstance.getLayer(id)) mapInstance.removeLayer(id);
    });
    ['cyclone-line-src', 'cyclone-point-src'].forEach(id => {
      if (mapInstance.getSource(id)) mapInstance.removeSource(id);
    });

    mapInstance.addSource('cyclone-line-src', {
      type: 'geojson',
      data: lineGeoJson
    });

    mapInstance.addSource('cyclone-point-src', {
      type: 'geojson',
      data: pointGeoJson
    });

    // 1. Line String Layer
    mapInstance.addLayer({
      id: 'cyclone-track-line',
      type: 'line',
      source: 'cyclone-line-src',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 3.5,
        'line-opacity': 0.95
      }
    });

    // 2. RI Highlight Rings (Distinctly circled/highlighted fixes)
    mapInstance.addLayer({
      id: 'cyclone-fixes-ri',
      type: 'circle',
      source: 'cyclone-point-src',
      filter: ['==', ['get', 'ri'], true],
      paint: {
        'circle-radius': 11,
        'circle-color': 'rgba(250, 204, 21, 0.25)',
        'circle-stroke-color': '#F59E0B',
        'circle-stroke-width': 2.5
      }
    });

    // 3. Core Fix Points
    mapInstance.addLayer({
      id: 'cyclone-fixes-core',
      type: 'circle',
      source: 'cyclone-point-src',
      paint: {
        'circle-radius': [
          'case',
          ['==', ['get', 'ri'], true], 5.5,
          4.5
        ],
        'circle-color': ['get', 'color'],
        'circle-stroke-color': '#FFFFFF',
        'circle-stroke-width': 1.5
      }
    });

    // Bounding Box Camera Fit
    let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
    track.forEach(f => {
      if (f.lon < minLon) minLon = f.lon;
      if (f.lon > maxLon) maxLon = f.lon;
      if (f.lat < minLat) minLat = f.lat;
      if (f.lat > maxLat) maxLat = f.lat;
    });

    mapInstance.fitBounds([[minLon - 2.5, minLat - 2.0], [maxLon + 2.5, maxLat + 2.0]], {
      padding: { top: 40, bottom: 40, left: 40, right: 40 },
      maxZoom: 6.8,
      duration: 800
    });

    // Fix Click / Hover Popup
    let popup = null;
    mapInstance.on('click', 'cyclone-fixes-core', (e) => {
      if (!e.features || !e.features.length) return;
      const p = e.features[0].properties;

      const riBadge = p.ri
        ? '<span style="background:#FEF08A; color:#854D0E; padding:1px 6px; border-radius:4px; font-weight:700; font-size:10px;">● RI ACTIVE</span>'
        : '';

      let fuelHtml = '';
      if (p.has_fuel && p.tchp !== null) {
        fuelHtml = `
          <div class="ky-map-popup__fuel">
            <div class="ky-map-popup__fuel-title">Ocean Fuel (2 Days Prior):</div>
            <div class="ky-map-popup__row"><span>TCHP:</span> <strong>${p.tchp} kJ/cm²</strong></div>
            <div class="ky-map-popup__row"><span>D26 Depth:</span> <strong>${p.d26 ? p.d26 + ' m' : '—'}</strong></div>
            <div class="ky-map-popup__row"><span>SST:</span> <strong>${p.sst ? p.sst + ' °C' : '—'}</strong></div>
            <div class="ky-map-popup__row"><span>MLD:</span> <strong>${p.mld ? p.mld + ' m' : '—'}</strong></div>
          </div>
        `;
      } else {
        fuelHtml = `
          <div class="ky-map-popup__fuel">
            <span style="color:#64748B; font-size:11px; font-style:italic;">Over land (ocean fuel unavailable)</span>
          </div>
        `;
      }

      const html = `
        <div class="ky-map-popup">
          <div class="ky-map-popup__title">${formatDateTime(p.time)} ${riBadge}</div>
          <div class="ky-map-popup__row"><span>Position:</span> <strong>${Number(p.lat).toFixed(1)}°N, ${Number(p.lon).toFixed(1)}°E</strong></div>
          <div class="ky-map-popup__row"><span>Intensity:</span> <strong>${p.wind_kt} kt (${p.category})</strong></div>
          <div class="ky-map-popup__row"><span>Forward Speed:</span> <strong>${p.speed_kmh} km/h</strong></div>
          ${fuelHtml}
        </div>
      `;

      if (popup) popup.remove();
      popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '280px' })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(mapInstance);
    });

    mapInstance.on('mouseenter', 'cyclone-fixes-core', () => {
      mapInstance.getCanvas().style.cursor = 'pointer';
    });
    mapInstance.on('mouseleave', 'cyclone-fixes-core', () => {
      mapInstance.getCanvas().style.cursor = '';
    });
  }

  /* ============================================================
     Chart.js: Ocean Fuel (TCHP) & Storm Intensity Time Series
     ============================================================ */

  // Plugin to shade Rapid Intensification (RI) background intervals
  const riBackgroundPlugin = {
    id: 'riBackgroundBands',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea, scales: { x } } = chart;
      if (!chartArea || !currentStormData) return;
      const track = currentStormData.track || [];
      if (!track.length) return;

      ctx.save();
      for (let i = 0; i < track.length; i++) {
        if (track[i].ri === true) {
          const xPos = x.getPixelForTick(i);
          const nextX = (i + 1 < track.length) ? x.getPixelForTick(i + 1) : chartArea.right;
          const prevX = (i > 0) ? x.getPixelForTick(i - 1) : chartArea.left;
          const leftBound = (xPos + prevX) / 2;
          const rightBound = (xPos + nextX) / 2;

          ctx.fillStyle = 'rgba(245, 158, 11, 0.14)';
          ctx.fillRect(leftBound, chartArea.top, rightBound - leftBound, chartArea.height);

          // Subtle top boundary label for RI
          if (i === 0 || track[i - 1].ri !== true) {
            ctx.fillStyle = '#B45309';
            ctx.font = 'bold 9px Inter, sans-serif';
            ctx.fillText('RI INTERVAL', leftBound + 4, chartArea.top + 12);
          }
        }
      }
      ctx.restore();
    }
  };

  function renderTrackChart(storm) {
    const canvas = document.getElementById('cyclone-track-chart');
    if (!canvas) return;

    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }

    const track = storm.track || [];
    const labels = track.map(f => {
      const d = new Date(f.time);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' +
             d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    });

    const band90 = Number(storm.tchp_band90) || 17.85;

    // Fuel values: IMPORTANT: if over land (null), must remain null with spanGaps: false
    const modelTchp = track.map(f => (f.fuel && f.fuel.tchp !== null && f.fuel.tchp !== undefined) ? Number(f.fuel.tchp) : null);
    const glorysTchp = track.map(f => (f.fuel && f.fuel.glorys_tchp !== null && f.fuel.glorys_tchp !== undefined) ? Number(f.fuel.glorys_tchp) : null);
    const upperBand = track.map(f => (f.fuel && f.fuel.tchp !== null && f.fuel.tchp !== undefined) ? Number(f.fuel.tchp) + band90 : null);
    const lowerBand = track.map(f => (f.fuel && f.fuel.tchp !== null && f.fuel.tchp !== undefined) ? Math.max(0, Number(f.fuel.tchp) - band90) : null);
    const windKt = track.map(f => Number(f.wind_kt));

    const ctx = canvas.getContext('2d');
    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          // Upper Confidence Band
          {
            label: 'Upper 90% Band',
            data: upperBand,
            borderColor: 'transparent',
            backgroundColor: 'transparent',
            pointRadius: 0,
            fill: false,
            yAxisID: 'yTchp',
            spanGaps: false
          },
          // Lower Error Band (fills up to Upper Band)
          {
            label: '90% error band (held 88% vs Argo, 2023)',
            data: lowerBand,
            borderColor: 'transparent',
            backgroundColor: 'rgba(37, 99, 235, 0.12)',
            pointRadius: 0,
            fill: '-1',
            yAxisID: 'yTchp',
            spanGaps: false
          },
          // Kyogre Model TCHP (Solid Royal Blue)
          {
            label: 'Pre-Storm TCHP (Kyogre)',
            data: modelTchp,
            borderColor: '#2563EB',
            backgroundColor: '#2563EB',
            borderWidth: 2.4,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.25,
            fill: false,
            yAxisID: 'yTchp',
            spanGaps: false
          },
          // GLORYS Reanalysis TCHP (Dashed Slate)
          {
            label: 'Pre-Storm TCHP (GLORYS Reference)',
            data: glorysTchp,
            borderColor: '#64748B',
            backgroundColor: '#64748B',
            borderWidth: 1.8,
            borderDash: [5, 4],
            pointRadius: 2,
            pointHoverRadius: 4,
            tension: 0.25,
            fill: false,
            yAxisID: 'yTchp',
            spanGaps: false
          },
          // Observed IMD Wind Speed (Solid Red on Secondary Y-Axis)
          {
            label: 'Observed Wind Speed (kt)',
            data: windKt,
            borderColor: '#DC2626',
            backgroundColor: '#DC2626',
            borderWidth: 2.4,
            pointRadius: 3.5,
            pointHoverRadius: 6,
            tension: 0.2,
            fill: false,
            yAxisID: 'yWind',
            spanGaps: true
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
            align: 'end',
            labels: {
              boxWidth: 10,
              padding: 10,
              font: { family: 'Inter', size: 11, weight: '500' },
              filter: (item) => item.text !== 'Upper 90% Band'
            }
          },
          tooltip: {
            backgroundColor: '#FFFFFF',
            titleColor: '#0F172A',
            bodyColor: '#334155',
            borderColor: '#CBD5E1',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            filter: (item) => item.dataset.label !== 'Upper 90% Band' && item.dataset.label !== '90% error band (held 88% vs Argo, 2023)',
            callbacks: {
              title: (items) => {
                const idx = items[0].dataIndex;
                const fix = track[idx];
                const riText = fix && fix.ri ? ' [RAPID INTENSIFICATION]' : '';
                return `${labels[idx]}${riText} · (${fix.lat}°N, ${fix.lon}°E)`;
              },
              label: (item) => {
                const val = item.raw;
                if (val === null) return `${item.dataset.label}: Over land (unavailable)`;
                if (item.datasetIndex === 4) return `IMD Wind: ${val} kt (${(val * 1.852).toFixed(1)} km/h)`;
                return `${item.dataset.label}: ${val.toFixed(1)} kJ/cm²`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(226, 232, 240, 0.6)' },
            ticks: {
              color: '#64748B',
              font: { family: 'Inter', size: 10 },
              maxTicksLimit: 9,
              maxRotation: 0
            }
          },
          yTchp: {
            type: 'linear',
            position: 'left',
            min: 0,
            suggestedMax: 140,
            title: {
              display: true,
              text: 'Pre-Storm TCHP (kJ/cm²)',
              color: '#2563EB',
              font: { family: 'Inter', size: 11, weight: '600' }
            },
            ticks: {
              color: '#2563EB',
              font: { family: 'JetBrains Mono', size: 10 }
            },
            grid: { color: 'rgba(226, 232, 240, 0.8)' }
          },
          yWind: {
            type: 'linear',
            position: 'right',
            min: 0,
            suggestedMax: 130,
            title: {
              display: true,
              text: 'Observed Wind Speed (kt)',
              color: '#DC2626',
              font: { family: 'Inter', size: 11, weight: '600' }
            },
            ticks: {
              color: '#DC2626',
              font: { family: 'JetBrains Mono', size: 10 }
            },
            grid: { drawOnChartArea: false }
          }
        }
      },
      plugins: [riBackgroundPlugin]
    });
  }

  /* ============================================================
     Truth Check: In-Situ Argo Float Comparisons
     ============================================================ */

  function renderArgoTruthCheck(storm) {
    const argo = storm.argo || {};
    const pairs = argo.pairs || [];
    const tabsContainer = document.getElementById('argo-float-tabs');
    const metaBar = document.getElementById('argo-meta-bar');
    const tableBody = document.getElementById('argo-truth-table-body');
    const emptyState = document.getElementById('argo-empty-state');
    const subEl = document.getElementById('argo-section-sub');

    if (subEl) {
      subEl.textContent = `${pairs.length} Argo profiling float(s) sampled within 200 km before and after passage`;
    }

    const tableNote = document.getElementById('argo-table-note');

    if (!pairs.length) {
      if (tabsContainer) tabsContainer.innerHTML = '';
      if (metaBar) metaBar.style.display = 'none';
      if (tableBody) tableBody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'flex';
      if (tableNote) tableNote.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (metaBar) metaBar.style.display = 'flex';
    if (tableNote) tableNote.style.display = 'block';

    if (activeFloatIndex >= pairs.length) {
      activeFloatIndex = 0;
    }

    // Render float tabs
    if (tabsContainer) {
      tabsContainer.innerHTML = '';
      pairs.forEach((p, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `ky-argo-tab ${idx === activeFloatIndex ? 'ky-argo-tab--active' : ''}`;
        const distKm = Math.round(p.dist_km_pre || p.dist_km_post || 0);
        btn.textContent = `Float #${p.platform_number} (${distKm} km)`;
        btn.addEventListener('click', () => {
          activeFloatIndex = idx;
          renderArgoTruthCheck(storm);
        });
        tabsContainer.appendChild(btn);
      });
    }

    // Render active float meta
    const activePair = pairs[activeFloatIndex];
    const platEl = document.getElementById('argo-platform-val');
    const distEl = document.getElementById('argo-dist-val');
    const datePreEl = document.getElementById('argo-date-pre-val');
    const datePostEl = document.getElementById('argo-date-post-val');

    if (platEl) platEl.textContent = `WMO #${activePair.platform_number}`;
    if (distEl) distEl.textContent = `${Math.round(activePair.dist_km_pre || 0)} km pre / ${Math.round(activePair.dist_km_post || 0)} km post`;
    if (datePreEl) datePreEl.textContent = formatDateShort(activePair.date_pre);
    if (datePostEl) datePostEl.textContent = formatDateShort(activePair.date_post);

    // Render 12-depth table rows
    if (tableBody) {
      tableBody.innerHTML = '';
      const argoCh = activePair.argo_change || [];
      const modelCh = activePair.model_change || [];
      const glorysCh = activePair.glorys_change || [];

      ARGO_DEPTHS.forEach((depth, idx) => {
        const tr = document.createElement('tr');
        const vArgo = (argoCh[idx] !== null && argoCh[idx] !== undefined) ? Number(argoCh[idx]) : null;
        const vModel = (modelCh[idx] !== null && modelCh[idx] !== undefined) ? Number(modelCh[idx]) : null;
        const vGlorys = (glorysCh[idx] !== null && glorysCh[idx] !== undefined) ? Number(glorysCh[idx]) : null;

        let agreementHtml = '—';
        if (vArgo !== null && vModel !== null) {
          const err = Math.abs(vModel - vArgo);
          agreementHtml = `<strong>±${err.toFixed(2)} °C</strong>`;
        }

        function formatDeltaBadge(val) {
          if (val === null || val === undefined || isNaN(val)) {
            return '<span class="ky-delta-badge ky-delta--neutral">—</span>';
          }
          if (val < -0.05) {
            return `<span class="ky-delta-badge ky-delta--cooling">${val.toFixed(2)} °C</span>`;
          }
          if (val > 0.05) {
            return `<span class="ky-delta-badge ky-delta--warming">+${val.toFixed(2)} °C</span>`;
          }
          return `<span class="ky-delta-badge ky-delta--neutral">0.00 °C</span>`;
        }

        tr.innerHTML = `
          <td><strong>${depth} m</strong></td>
          <td>${formatDeltaBadge(vArgo)}</td>
          <td>${formatDeltaBadge(vModel)}</td>
          <td>${formatDeltaBadge(vGlorys)}</td>
          <td>${agreementHtml}</td>
        `;
        tableBody.appendChild(tr);
      });
    }
  }

  /* ============================================================
     Update Top Stat Cards
     ============================================================ */

  function updateOverviewStats(storm) {
    const peakWindEl = document.getElementById('stat-peak-wind');
    const peakCatEl = document.getElementById('stat-peak-cat');
    const peakFuelEl = document.getElementById('stat-peak-fuel');
    const fuelSubEl = document.getElementById('stat-fuel-sub');
    const riValEl = document.getElementById('stat-ri-val');
    const riSubEl = document.getElementById('stat-ri-sub');
    const argoCountEl = document.getElementById('stat-argo-count');
    const argoSubEl = document.getElementById('stat-argo-sub');

    // 1. Peak wind
    if (peakWindEl) peakWindEl.textContent = `${storm.peak_kt || '—'} kt`;
    if (peakCatEl) {
      const kmh = storm.peak_kt ? Math.round(storm.peak_kt * 1.852) : '—';
      peakCatEl.textContent = `${storm.peak_category || '—'} · ${kmh} km/h`;
    }

    // 2. Peak Fuel (TCHP)
    const track = storm.track || [];
    let maxFuel = 0;
    track.forEach(f => {
      if (f.fuel && f.fuel.tchp !== null && f.fuel.tchp > maxFuel) {
        maxFuel = f.fuel.tchp;
      }
    });
    if (peakFuelEl) {
      peakFuelEl.textContent = maxFuel > 0 ? `${maxFuel.toFixed(1)} kJ/cm²` : '—';
    }
    if (fuelSubEl) {
      fuelSubEl.textContent = `Pre-passage reservoir (2d prior)`;
    }

    // 3. Rapid Intensification
    if (riValEl) {
      riValEl.textContent = storm.ri ? 'Observed (RI)' : 'Standard Rate';
      riValEl.style.color = storm.ri ? '#D97706' : '#0F172A';
    }
    if (riSubEl) {
      riSubEl.textContent = storm.ri ? 'Exceeded +30 kt / 24h threshold' : 'Gradual strengthening';
    }

    // 4. Argo truth floats
    const pairsCount = storm.argo && storm.argo.pairs ? storm.argo.pairs.length : 0;
    if (argoCountEl) {
      argoCountEl.textContent = `${pairsCount} Paired Float${pairsCount !== 1 ? 's' : ''}`;
    }
    if (argoSubEl) {
      const preCount = storm.argo ? storm.argo.near_pre || 0 : 0;
      argoSubEl.textContent = `${preCount} Argo profiles within 200 km (7 days before)`;
    }
  }

  /* ============================================================
     Select Storm & Load Details
     ============================================================ */

  async function selectStorm(stormName) {
    currentStormName = stormName.toUpperCase();
    activeFloatIndex = 0;

    // Update label in map top-left dropdown
    const labelEl = document.getElementById('map-storm-label');
    if (labelEl) {
      labelEl.textContent = `Storm: ${currentStormName}`;
    }

    // Update active state in dropdown options
    document.querySelectorAll('#map-storm-options .ky-depth-option').forEach(opt => {
      if ((opt.getAttribute('data-storm') || '').toUpperCase() === currentStormName) {
        opt.classList.add('ky-depth-option--selected');
      } else {
        opt.classList.remove('ky-depth-option--selected');
      }
    });

    try {
      const res = await fetch(`${API_BASE}/cyclone/${currentStormName}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      currentStormData = await res.json();

      updateOverviewStats(currentStormData);
      renderMapOverlay(currentStormData);
      renderTrackChart(currentStormData);
      renderArgoTruthCheck(currentStormData);
    } catch (err) {
      console.error(`[Cyclone Mode] Error fetching details for ${stormName}:`, err);
    }
  }

  /* ============================================================
     Render Storm Selector Dropdown (Top-Left Map Control)
     ============================================================ */

  function toggleStormMenu(show) {
    const btn = document.getElementById('map-storm-btn');
    const menu = document.getElementById('map-storm-menu');
    if (!menu || !btn) return;

    const isOpen = menu.classList.contains('ky-depth-menu--open');
    const next = show !== undefined ? show : !isOpen;

    if (next) {
      menu.classList.add('ky-depth-menu--open');
      btn.classList.add('ky-map-depth-btn--open');
      btn.setAttribute('aria-expanded', 'true');
    } else {
      menu.classList.remove('ky-depth-menu--open');
      btn.classList.remove('ky-map-depth-btn--open');
      btn.setAttribute('aria-expanded', 'false');
    }
  }

  function renderStormDropdown() {
    const container = document.getElementById('map-storm-options');
    const labelEl = document.getElementById('map-storm-label');
    if (!container) return;
    container.innerHTML = '';

    // Order storms: Featured first (Biparjoy, Mocha), then others
    const sorted = [...cyclonesCatalog].sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return 0;
    });

    sorted.forEach(storm => {
      const opt = document.createElement('button');
      opt.type = 'button';
      const isSelected = storm.name.toUpperCase() === currentStormName.toUpperCase();
      opt.className = `ky-depth-option ${isSelected ? 'ky-depth-option--selected' : ''}`;
      opt.setAttribute('data-storm', storm.name);

      const featuredHtml = storm.featured
        ? '<span class="ky-storm-option-badge">Featured</span>'
        : '';

      opt.innerHTML = `
        <span style="display:flex; align-items:center;">
          <strong style="color:#0F172A; font-weight:700;">${storm.name}</strong>
          ${featuredHtml}
        </span>
        <span class="ky-storm-option-basin">${storm.basin}</span>
      `;

      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        selectStorm(storm.name);
        toggleStormMenu(false);
      });

      container.appendChild(opt);
    });

    if (labelEl) {
      labelEl.textContent = `Storm: ${currentStormName}`;
    }
  }

  /* ============================================================
     Initialization Entrypoint
     ============================================================ */

  async function init() {
    initMap();

    // Wire dropdown toggle
    const stormBtn = document.getElementById('map-storm-btn');
    if (stormBtn) {
      stormBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleStormMenu();
      });
    }

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('map-storm-dropdown-wrap');
      if (wrap && !wrap.contains(e.target)) {
        toggleStormMenu(false);
      }
    });

    // Close dropdown on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        toggleStormMenu(false);
      }
    });

    try {
      const res = await fetch(`${API_BASE}/cyclones`);
      if (res.ok) {
        const body = await res.json();
        cyclonesCatalog = body.cyclones || [];
      }
    } catch (e) {
      console.warn('[Cyclone Mode] Backend /cyclones fetch failed, fallback to defaults:', e);
      cyclonesCatalog = [
        { name: 'BIPARJOY', basin: 'Arabian Sea', peak_kt: 90.0, peak_category: 'ESCS', ri: true, featured: true },
        { name: 'MOCHA', basin: 'Bay of Bengal', peak_kt: 115.0, peak_category: 'ESCS', ri: true, featured: true },
        { name: 'TEJ', basin: 'Arabian Sea', peak_kt: 95.0, peak_category: 'ESCS', ri: true, featured: false },
        { name: 'HAMOON', basin: 'Bay of Bengal', peak_kt: 65.0, peak_category: 'VSCS', ri: true, featured: false },
        { name: 'MIDHILI', basin: 'Bay of Bengal', peak_kt: 45.0, peak_category: 'CS', ri: false, featured: false },
        { name: 'MICHAUNG', basin: 'Bay of Bengal', peak_kt: 55.0, peak_category: 'SCS', ri: false, featured: false }
      ];
    }

    renderStormDropdown();

    // Default storm load (Biparjoy or Mocha)
    const initialStorm = (cyclonesCatalog.length && cyclonesCatalog[0].name) ? cyclonesCatalog[0].name : 'BIPARJOY';
    selectStorm(initialStorm);
  }

  // Expose selectStorm on window for test verification
  if (typeof window !== 'undefined') {
    window.selectCyclone = selectStorm;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
