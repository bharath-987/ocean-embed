/**
 * Kyogre — Marine Ecology & Heatwave Mode
 * Implements Hobday et al. (2016) Marine Heatwave (MHW) detection using
 * Observed satellite SST (OSTIA) time series and 14-year smooth daily 90th percentile climatology.
 */

// ============================================================================
// 1. STATE & CONSTANTS
// ============================================================================

const API_BASE = (typeof BACKEND_URL !== 'undefined') ? BACKEND_URL : 'http://localhost:8000';

const BOUNDS = {
  minLat: 5.0,
  maxLat: 30.0,
  minLon: 45.0,
  maxLon: 105.0
};

let map = null;
let currentCoord = null;
let currentDateStr = null;
let activeMarker = null;
let mhwChart = null;
let lastMhwData = null;
let currentLayer = 'surface'; // 'surface' | 'depth'
let rasterCanvas = null;
let currentDepthGrid = null;
let currentDepthSummary = null;

// ============================================================================
// 2. DOM INITIALIZATION & EVENT LISTENERS
// ============================================================================

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initDatePicker();
    initSearch();
    initGating();
    initLayerToggle();
  });
}

function initGating() {
  resetStatCard("default");
  showEmptyState("No location selected yet", "Click anywhere on the map or search above to analyze Marine Heatwave status.");
}

function resetStatCard(reason = 'default') {
  const valEl = document.getElementById('stat-mhw-val');
  const badgeEl = document.getElementById('stat-mhw-badge');
  const noteEl = document.getElementById('stat-mhw-note');

  if (valEl) valEl.textContent = '—';
  if (badgeEl) {
    badgeEl.style.display = 'none';
    badgeEl.className = 'ky-stat-card__badge';
    badgeEl.textContent = '';
  }

  let card1Note = 'Select location & date';
  let cardRestNote = 'Awaiting selection';

  if (typeof reason === 'string' && reason.toLowerCase().includes('date')) {
    card1Note = 'Select a date in top bar';
    cardRestNote = 'Awaiting date';
  } else if (typeof reason === 'string' && reason.toLowerCase().includes('location')) {
    card1Note = 'Select location on map';
    cardRestNote = 'Awaiting location';
  }

  if (noteEl) noteEl.textContent = card1Note;

  // Reset 3-card window summary row
  const evVal = document.getElementById('stat-window-events-val');
  const evNote = document.getElementById('stat-window-events-note');
  const peakVal = document.getElementById('stat-window-peak-val');
  const peakNote = document.getElementById('stat-window-peak-note');
  const durVal = document.getElementById('stat-window-duration-val');
  const durNote = document.getElementById('stat-window-duration-note');

  if (evVal) evVal.textContent = '—';
  if (evNote) evNote.textContent = cardRestNote;
  if (peakVal) peakVal.textContent = '—';
  if (peakNote) peakNote.textContent = cardRestNote;
  if (durVal) durVal.textContent = '—';
  if (durNote) durNote.textContent = cardRestNote;

  const coordEl = document.getElementById('selected-loc-coord');
  if (coordEl && !currentCoord) {
    coordEl.textContent = '—';
    coordEl.style.display = 'none';
  }
}

function showEmptyState(title, sub) {
  const emptyView = document.getElementById('mhw-empty-view');
  const chartView = document.getElementById('mhw-chart-view');
  const emptyTitle = document.getElementById('mhw-empty-title');
  const emptySub = document.getElementById('mhw-empty-sub');

  if (emptyView) emptyView.style.display = 'flex';
  if (chartView) chartView.style.display = 'none';
  if (emptyTitle) emptyTitle.textContent = title;
  if (emptySub) emptySub.textContent = sub;
}

function revealChartView() {
  const emptyView = document.getElementById('mhw-empty-view');
  const chartView = document.getElementById('mhw-chart-view');

  if (emptyView) emptyView.style.display = 'none';
  if (chartView) chartView.style.display = 'block';
}

// ============================================================================
// 3. MAP INITIALIZATION & INTERACTION
// ============================================================================

function initMap() {
  if (typeof maplibregl === 'undefined') return;

  map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        'esri-satellite': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          ],
          tileSize: 256,
          attribution: '&copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
        }
      },
      layers: [
        {
          id: 'satellite-layer',
          type: 'raster',
          source: 'esri-satellite',
          minzoom: 0,
          maxzoom: 18
        }
      ]
    },
    center: [75.0, 15.0],
    zoom: 4.2,
    minZoom: 3.5,
    maxZoom: 10,
    attributionControl: false
  });

  map.on('load', () => {
    // Zoom button handlers
    const btnIn = document.getElementById('btn-zoom-in');
    const btnOut = document.getElementById('btn-zoom-out');
    if (btnIn) btnIn.addEventListener('click', () => map.zoomIn());
    if (btnOut) btnOut.addEventListener('click', () => map.zoomOut());

    // Initialize Heatwave Depth raster image source and layer
    const blank1x1 = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    map.addSource('heatwave-depth-raster-src', {
      type: 'image',
      url: blank1x1,
      coordinates: [
        [45.0, 30.0],
        [105.0, 30.0],
        [105.0, 5.0],
        [45.0, 5.0]
      ]
    });

    map.addLayer({
      id: 'heatwave-depth-raster-layer',
      type: 'raster',
      source: 'heatwave-depth-raster-src',
      layout: {
        visibility: 'none'
      },
      paint: {
        'raster-opacity': 0.88,
        'raster-fade-duration': 250,
        'raster-resampling': 'nearest'
      }
    });
  });

  map.on('click', (e) => {
    const lat = e.lngLat.lat;
    const lon = e.lngLat.lng;
    selectLocation(lat, lon, true);
  });
}

function selectLocation(lat, lon, zoomTo = true) {
  // Validate bounding box
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lon < BOUNDS.minLon || lon > BOUNDS.maxLon) {
    showRegionNotice();
    return;
  }

  currentCoord = { lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)) };

  // Update header coordinate pill
  const coordEl = document.getElementById('selected-loc-coord');
  if (coordEl) {
    coordEl.textContent = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
    coordEl.style.display = 'inline-flex';
  }

  // Drop or update marker pin
  dropMapMarker(lat, lon);

  // Smooth camera zoom
  if (zoomTo && map) {
    map.flyTo({
      center: [lon, lat],
      zoom: Math.max(map.getZoom(), 5),
      duration: 800
    });
  }

  // Handle gating
  if (currentLayer === 'depth') {
    if (!currentDateStr) {
      setDemoDate('2023-10-15');
    }
    fetchDepthPoint(currentCoord.lat, currentCoord.lon, currentDateStr);
    return;
  }

  if (!currentDateStr) {
    resetStatCard("Select a date in the header to evaluate heatwave conditions");
    showEmptyState(
      "Location selected: " + coordEl.textContent,
      "Select a reference date in the top bar to analyze SST time series and heatwaves."
    );
    return;
  }

  // Both location and date are present -> fetch MHW analysis
  fetchHeatwaveAnalysis(currentCoord.lat, currentCoord.lon, currentDateStr);
}

function formatCoordinates(lat, lon) {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${latDir}, ${Math.abs(lon).toFixed(2)}°${lonDir}`;
}

function dropMapMarker(lat, lon) {
  if (!map || typeof maplibregl === 'undefined') return;

  if (activeMarker) {
    activeMarker.remove();
  }

  const el = document.createElement('div');
  el.className = 'selected-location-marker';
  el.innerHTML = `
    <div class="custom-marker-wrapper">
      <div class="custom-marker__coord">${formatCoordinates(lat, lon)}</div>
      <div class="custom-marker__pin">
        <svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40" fill="none">
          <path d="M15 0C6.71573 0 0 6.71573 0 15C0 26.25 15 40 15 40C15 40 30 26.25 30 15C30 6.71573 23.2843 0 15 0Z" fill="#1D4ED8" stroke="#FFFFFF" stroke-width="2.5"/>
          <circle cx="15" cy="14" r="5" fill="#FFFFFF"/>
        </svg>
      </div>
    </div>
  `;

  activeMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
    .setLngLat([lon, lat])
    .addTo(map);
}

function showRegionNotice() {
  const notice = document.getElementById('region-notice');
  if (notice) {
    notice.style.display = 'flex';
    setTimeout(() => { notice.style.display = 'none'; }, 3500);
  }
}

// ============================================================================
// 4. DATE PICKER INTEGRATION
// ============================================================================

function initDatePicker() {
  const dateBtn = document.getElementById('ky-date-btn');
  const nativePicker = document.getElementById('native-date-picker');
  const displayEl = document.getElementById('date-display-header');

  if (!dateBtn || !nativePicker) return;

  dateBtn.addEventListener('click', () => {
    if (document.querySelector('.ky-calendar-popover')) return;
    try {
      if (typeof nativePicker.showPicker === 'function') {
        nativePicker.showPicker();
      } else {
        nativePicker.click();
      }
    } catch (e) {
      nativePicker.click();
    }
  });

  nativePicker.addEventListener('change', (e) => {
    const val = e.target.value;
    if (!val) return;

    currentDateStr = val;
    const formatted = formatDateDisplay(val);
    if (displayEl) displayEl.textContent = formatted;

    if (currentLayer === 'depth') {
      renderDepthLayer();
      if (currentCoord) {
        fetchDepthPoint(currentCoord.lat, currentCoord.lon, currentDateStr);
      }
      return;
    }

    if (!currentCoord) {
      resetStatCard("Select a location on the map to evaluate heatwave conditions");
      showEmptyState(
        "Date selected: " + formatted,
        "Click anywhere in the North Indian Ocean to inspect SST time series and heatwaves."
      );
      return;
    }

    // Both present
    fetchHeatwaveAnalysis(currentCoord.lat, currentCoord.lon, currentDateStr);
  });
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return 'Select date';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    }
    return dateStr;
  } catch (e) {
    return dateStr;
  }
}

// ============================================================================
// 5. SEARCH BAR INTEGRATION
// ============================================================================

const PRESET_LOCATIONS = [
  { name: 'Arabian Sea (Central)', lat: 15.0, lon: 65.0 },
  { name: 'Bay of Bengal (Central)', lat: 13.0, lon: 88.0 },
  { name: 'Equatorial Indian Ocean', lat: 5.0, lon: 75.0 },
  { name: 'Andaman Sea', lat: 11.0, lon: 94.0 },
  { name: 'Northern Arabian Sea', lat: 22.0, lon: 64.0 },
  { name: 'Lakshadweep Sea', lat: 10.5, lon: 72.5 },
  { name: 'Gulf of Mannar', lat: 8.8, lon: 79.0 }
];

function initSearch() {
  const input = document.getElementById('map-search-input');
  const clearBtn = document.getElementById('map-search-clear');
  const dropdown = document.getElementById('map-search-results');

  if (!input || !dropdown) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';

    if (!q) {
      dropdown.style.display = 'none';
      return;
    }

    // Check for coordinate format (e.g. "15.5, 65.2" or "15N 65E")
    const coordMatch = parseCoordinates(q);
    const results = [];

    if (coordMatch) {
      results.push({
        name: `Coordinate: ${coordMatch.lat.toFixed(2)}°N, ${coordMatch.lon.toFixed(2)}°E`,
        lat: coordMatch.lat,
        lon: coordMatch.lon
      });
    }

    const matches = PRESET_LOCATIONS.filter(l => l.name.toLowerCase().includes(q));
    matches.forEach(m => results.push(m));

    if (results.length === 0) {
      dropdown.innerHTML = '<div class="map-search__item map-search__item--empty">No locations found within bounds</div>';
      dropdown.style.display = 'block';
      return;
    }

    dropdown.innerHTML = results.map(r => `
      <div class="map-search__item" data-lat="${r.lat}" data-lon="${r.lon}">
        <span class="map-search__item-name">${r.name}</span>
        <span class="map-search__item-coords">${r.lat.toFixed(2)}°N, ${r.lon.toFixed(2)}°E</span>
      </div>
    `).join('');

    dropdown.style.display = 'block';

    dropdown.querySelectorAll('.map-search__item[data-lat]').forEach(item => {
      item.addEventListener('click', () => {
        const lat = parseFloat(item.dataset.lat);
        const lon = parseFloat(item.dataset.lon);
        selectLocation(lat, lon, true);
        dropdown.style.display = 'none';
        input.value = item.querySelector('.map-search__item-name').textContent;
      });
    });
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.style.display = 'none';
      dropdown.style.display = 'none';
      input.focus();
    });
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.map-search-wrap')) {
      dropdown.style.display = 'none';
    }
  });
}

function parseCoordinates(str) {
  const match = str.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
  if (match) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    if (lat >= BOUNDS.minLat && lat <= BOUNDS.maxLat && lon >= BOUNDS.minLon && lon <= BOUNDS.maxLon) {
      return { lat, lon };
    }
  }
  return null;
}

// ============================================================================
// 6. API FETCH & MHW EVALUATION
// ============================================================================

async function fetchHeatwaveAnalysis(lat, lon, refDate) {
  try {
    // Determine a 120-day window (+/- 60 days) around reference date
    const { startDate, endDate } = computeDateWindow(refDate, 60);

    const payload = {
      latitude: lat,
      longitude: lon,
      start_date: startDate,
      end_date: endDate,
      reference_date: refDate
    };

    const res = await fetch(`${API_BASE}/marine-heatwave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.detail || `Server returned ${res.status}`);
    }

    const data = await res.json();
    lastMhwData = data;

    renderHeatwaveResults(data, refDate);
  } catch (err) {
    console.error('MHW API fetch error:', err);
    resetStatCard("Unable to compute heatwave status for this coordinate");
    showEmptyState(
      "Error evaluating heatwave status",
      err.message || "Please select an open ocean coordinate within the North Indian Ocean."
    );
  }
}

function computeDateWindow(refDateStr, daysPadding = 60) {
  const minDate = new Date('2021-01-01T00:00:00Z');
  const maxDate = new Date('2023-12-31T00:00:00Z');
  const refDate = new Date(`${refDateStr}T00:00:00Z`);

  let start = new Date(refDate.getTime() - daysPadding * 86400000);
  let end = new Date(refDate.getTime() + daysPadding * 86400000);

  if (start < minDate) start = minDate;
  if (end > maxDate) end = maxDate;

  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0]
  };
}

// ============================================================================
// 7. RENDER RESULTS (HEADLINE CARD, SUMMARY & CHART)
// ============================================================================

function formatEventDateRange(startStr, endStr) {
  if (!startStr || !endStr) return '';
  try {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const [sY, sM, sD] = startStr.split('-').map(Number);
    const [eY, eM, eD] = endStr.split('-').map(Number);

    if (sY === eY) {
      if (sM === eM) {
        return `${months[sM - 1]} ${sD} - ${months[eM - 1]} ${eD}, ${sY}`;
      } else {
        return `${months[sM - 1]} ${sD} - ${months[eM - 1]} ${eD}, ${sY}`;
      }
    } else {
      return `${months[sM - 1]} ${sD}, ${sY} - ${months[eM - 1]} ${eD}, ${eY}`;
    }
  } catch (e) {
    return `${startStr} - ${endStr}`;
  }
}

function computeWindowStats(events) {
  const evList = Array.isArray(events) ? events : [];
  if (evList.length === 0) {
    return {
      eventCount: 0,
      eventCountText: '0',
      eventCountNote: 'No events detected in this window',
      peakCategoryText: '—',
      peakCategoryNote: 'No events detected in this window',
      longestDurationText: '—',
      longestDurationNote: 'No events detected'
    };
  }

  const CATEGORY_NAMES = { 1: 'Moderate', 2: 'Strong', 3: 'Severe', 4: 'Extreme' };

  // 1. Event count
  const count = evList.length;
  const eventCountText = String(count);
  const eventCountNote = `${count} event${count === 1 ? '' : 's'} detected in displayed window`;

  // 2. Peak Category
  const maxCat = Math.max(...evList.map(e => e.category || 1));
  const peakCatLabel = CATEGORY_NAMES[maxCat] || 'Moderate';
  const candidates = evList.filter(e => (e.category || 1) === maxCat);
  const peakEvent = candidates.reduce((best, cur) =>
    ((cur.peak_anomaly_c || 0) > (best.peak_anomaly_c || 0) ? cur : best), candidates[0]);
  const anomStr = (peakEvent && typeof peakEvent.peak_anomaly_c === 'number')
    ? `+${peakEvent.peak_anomaly_c.toFixed(1)}°C above climatological mean`
    : 'Above climatological mean';

  // 3. Longest Duration
  const longestEvent = evList.reduce((best, cur) =>
    ((cur.duration_days || 0) > (best.duration_days || 0) ? cur : best), evList[0]);
  const durationText = `${longestEvent.duration_days} days`;
  const durationNote = formatEventDateRange(longestEvent.start_date, longestEvent.end_date);

  return {
    eventCount: count,
    eventCountText,
    eventCountNote,
    peakCategoryText: peakCatLabel,
    peakCategoryNote: anomStr,
    longestDurationText: durationText,
    longestDurationNote: durationNote
  };
}

function renderHeatwaveResults(data, refDate) {
  revealChartView();

  const status = data.current_status || {};
  const inHw = Boolean(status.in_heatwave);
  const activeEv = status.event;

  // 1. Card 1: Marine Heatwave Status
  const valEl = document.getElementById('stat-mhw-val');
  const badgeEl = document.getElementById('stat-mhw-badge');
  const noteEl = document.getElementById('stat-mhw-note');

  if (inHw && activeEv) {
    const catShort = (status.category && { 1: 'Moderate', 2: 'Strong', 3: 'Severe', 4: 'Extreme' }[status.category]) || 'Active';
    if (valEl) {
      valEl.textContent = catShort;
    }
    if (badgeEl) {
      badgeEl.style.display = 'inline-flex';
      badgeEl.textContent = `Day ${status.days_elapsed || 1} of ${activeEv.duration_days}`;
      badgeEl.className = `ky-stat-card__badge ky-mhw-badge--cat${status.category || 1}`;
    }
    if (noteEl) {
      noteEl.textContent = `Peak anomaly: +${activeEv.peak_anomaly_c}°C`;
    }
  } else {
    if (valEl) {
      valEl.textContent = 'Normal';
    }
    if (badgeEl) {
      badgeEl.style.display = 'inline-flex';
      badgeEl.textContent = 'Envelope';
      badgeEl.className = 'ky-stat-card__badge ky-mhw-badge--normal';
    }
    if (noteEl) {
      noteEl.textContent = 'Within 90th percentile envelope';
    }
  }

  // 1b. Window Summary Stat Cards (3 Cards)
  const windowStats = computeWindowStats(data.events || []);
  const evVal = document.getElementById('stat-window-events-val');
  const evNote = document.getElementById('stat-window-events-note');
  const peakVal = document.getElementById('stat-window-peak-val');
  const peakNote = document.getElementById('stat-window-peak-note');
  const durVal = document.getElementById('stat-window-duration-val');
  const durNote = document.getElementById('stat-window-duration-note');

  if (evVal) evVal.textContent = windowStats.eventCountText;
  if (evNote) evNote.textContent = windowStats.eventCountNote;
  if (peakVal) peakVal.textContent = windowStats.peakCategoryText;
  if (peakNote) peakNote.textContent = windowStats.peakCategoryNote;
  if (durVal) durVal.textContent = windowStats.longestDurationText;
  if (durNote) durNote.textContent = windowStats.longestDurationNote;

  // 2. Summary Metrics Bar
  const ts = data.sst_timeseries || [];
  const refEntry = ts.find(t => t.date === refDate) || ts[ts.length - 1] || {};

  const sstEl = document.getElementById('summary-sst');
  const meanEl = document.getElementById('summary-mean');
  const threshEl = document.getElementById('summary-thresh');
  const gapEl = document.getElementById('summary-gap');

  const sstVal = (refEntry.sst !== undefined) ? `${refEntry.sst.toFixed(2)} °C` : '—';
  const meanVal = (refEntry.climatological_mean !== undefined) ? `${refEntry.climatological_mean.toFixed(2)} °C` : '—';
  const threshVal = (refEntry.climatological_threshold !== undefined) ? `${refEntry.climatological_threshold.toFixed(2)} °C` : '—';
  const gapVal = (refEntry.climatological_threshold !== undefined && refEntry.climatological_mean !== undefined)
    ? `+${(refEntry.climatological_threshold - refEntry.climatological_mean).toFixed(2)} °C`
    : '—';

  if (sstEl) sstEl.textContent = sstVal;
  if (meanEl) meanEl.textContent = meanVal;
  if (threshEl) threshEl.textContent = threshVal;
  if (gapEl) gapEl.textContent = gapVal;

  // Window info & total events count
  const windowEl = document.getElementById('mhw-window-info');
  const countBadge = document.getElementById('mhw-event-count');
  if (windowEl && ts.length > 0) {
    windowEl.textContent = `Displaying ${ts.length}-day window (${ts[0].date} to ${ts[ts.length - 1].date}) • Reference: ${refDate}`;
  }
  if (countBadge) {
    const evCount = (data.events || []).length;
    countBadge.textContent = `${evCount} Event${evCount === 1 ? '' : 's'} in Window`;
    countBadge.style.display = 'inline-flex';
  }

  // 3. Render Chart.js Time Series
  renderMhwChart(ts, data.events || [], refDate);
}

// ============================================================================
// 8. CHART.JS RENDERING & HEATWAVE SHADING PLUGIN
// ============================================================================

function renderMhwChart(timeseries, events, refDate) {
  const canvas = document.getElementById('mhw-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  const labels = timeseries.map(d => d.date);
  const sstData = timeseries.map(d => d.sst);
  const meanData = timeseries.map(d => d.climatological_mean);
  const threshData = timeseries.map(d => d.climatological_threshold);

  // Custom Chart.js plugin to shade active heatwave periods and reference date
  const heatwaveShadingPlugin = {
    id: 'heatwaveShading',
    beforeDraw: (chart) => {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || !scales.x || !scales.y) return;

      const xScale = scales.x;
      const { top, bottom } = chartArea;

      // 1. Shade active heatwave event intervals
      events.forEach(ev => {
        const startIdx = labels.indexOf(ev.start_date);
        const endIdx = labels.indexOf(ev.end_date);

        if (startIdx !== -1 && endIdx !== -1) {
          const xStart = xScale.getPixelForValue(startIdx);
          const xEnd = xScale.getPixelForValue(endIdx);
          const width = Math.max(xEnd - xStart, 4);

          ctx.save();
          // Shaded band color based on category
          let fillColor = 'rgba(239, 68, 68, 0.12)';
          if (ev.category === 1) fillColor = 'rgba(245, 158, 11, 0.14)';
          else if (ev.category === 2) fillColor = 'rgba(249, 115, 22, 0.16)';
          else if (ev.category >= 3) fillColor = 'rgba(239, 68, 68, 0.20)';

          ctx.fillStyle = fillColor;
          ctx.fillRect(xStart, top, width, bottom - top);

          // Top border accent
          ctx.strokeStyle = ev.category >= 2 ? '#EA580C' : '#D97706';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(xStart, top);
          ctx.lineTo(xStart + width, top);
          ctx.stroke();

          // Small text tag at top
          ctx.fillStyle = ev.category >= 2 ? '#C2410C' : '#B45309';
          ctx.font = '600 10px Inter, system-ui, sans-serif';
          ctx.fillText(`Cat ${ev.category}`, xStart + 4, top + 14);
          ctx.restore();
        }
      });

      // 2. Draw subtle vertical dashed line on reference date
      if (refDate) {
        const refIdx = labels.indexOf(refDate);
        if (refIdx !== -1) {
          const xRef = xScale.getPixelForValue(refIdx);
          ctx.save();
          ctx.strokeStyle = '#1D4ED8';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(xRef, top);
          ctx.lineTo(xRef, bottom);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  };

  if (mhwChart) {
    mhwChart.destroy();
  }

  mhwChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Actual SST (°C)',
          data: sstData,
          borderColor: '#2563EB',
          backgroundColor: '#2563EB',
          borderWidth: 2.2,
          pointRadius: labels.length > 90 ? 1 : 2,
          pointHoverRadius: 5,
          tension: 0.15,
          order: 1
        },
        {
          label: '90th Percentile Threshold (°C)',
          data: threshData,
          borderColor: '#EF4444',
          backgroundColor: '#EF4444',
          borderWidth: 1.8,
          borderDash: [5, 4],
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.1,
          order: 2
        },
        {
          label: 'Climatological Mean (°C)',
          data: meanData,
          borderColor: '#64748B',
          backgroundColor: '#64748B',
          borderWidth: 1.6,
          borderDash: [6, 5],
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.1,
          order: 3
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
          display: false // Using custom styled legend below
        },
        tooltip: {
          backgroundColor: '#1E293B',
          titleColor: '#FFFFFF',
          bodyColor: '#F1F5F9',
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            title: (items) => {
              return `Date: ${items[0].label}`;
            },
            label: (ctx) => {
              const val = ctx.parsed.y;
              return ` ${ctx.dataset.label}: ${val.toFixed(2)} °C`;
            },
            afterBody: (items) => {
              const idx = items[0].dataIndex;
              const point = timeseries[idx];
              if (point && point.in_heatwave) {
                const anom = (point.sst - point.climatological_mean).toFixed(2);
                return [`Active Heatwave Day (Anomaly: +${anom} °C)`];
              }
              return [];
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: '#F1F5F9'
          },
          ticks: {
            maxTicksLimit: 12,
            font: { family: 'Inter', size: 11 },
            color: '#64748B',
            callback: function(val, index) {
              const label = this.getLabelForValue(val);
              if (!label) return '';
              const parts = label.split('-');
              return `${parts[1]}/${parts[2]}`;
            }
          }
        },
        y: {
          grid: {
            color: '#E2E8F0'
          },
          ticks: {
            font: { family: 'Inter', size: 11 },
            color: '#64748B',
            callback: (val) => `${val}°C`
          }
        }
      }
    },
    plugins: [heatwaveShadingPlugin]
  });
}

// ============================================================================
// 9. HEATWAVE DEPTH CHECK (SURFACE VS DEPTH LAYER)
// ============================================================================

function initLayerToggle() {
  const btnSurf = document.getElementById('btn-layer-surface');
  const btnDepth = document.getElementById('btn-layer-depth');
  if (btnSurf) {
    btnSurf.addEventListener('click', () => switchLayer('surface'));
  }
  if (btnDepth) {
    btnDepth.addEventListener('click', () => switchLayer('depth'));
  }

  // Demo date shortcut buttons
  if (typeof document !== 'undefined') {
    document.querySelectorAll('.ky-demo-date-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = btn.dataset.date;
        if (d) setDemoDate(d);
      });
    });
  }

  // Fetch initial summary for default demo date so bulletin is pre-populated
  fetchDepthSummary('2023-10-15');
}

function setDemoDate(dateStr) {
  currentDateStr = dateStr;
  const picker = document.getElementById('native-date-picker');
  if (picker) picker.value = dateStr;
  const disp = document.getElementById('date-display-header');
  if (disp) disp.textContent = formatDateDisplay(dateStr);

  if (currentLayer === 'depth') {
    renderDepthLayer();
    if (currentCoord) {
      fetchDepthPoint(currentCoord.lat, currentCoord.lon, currentDateStr);
    }
  } else {
    if (currentCoord) {
      fetchHeatwaveAnalysis(currentCoord.lat, currentCoord.lon, currentDateStr);
    }
  }
}

function switchLayer(layerName) {
  currentLayer = layerName;
  const btnSurf = document.getElementById('btn-layer-surface');
  const btnDepth = document.getElementById('btn-layer-depth');
  const legend = document.getElementById('depth-legend');
  const chartView = document.getElementById('mhw-chart-view');
  const emptyView = document.getElementById('mhw-empty-view');
  const depthView = document.getElementById('mhw-depth-view');
  const banner = document.getElementById('depth-bulletin-banner');

  if (layerName === 'depth') {
    if (btnSurf) btnSurf.classList.remove('ky-mhw-layer-btn--active');
    if (btnDepth) btnDepth.classList.add('ky-mhw-layer-btn--active');
    if (legend) legend.style.display = 'block';
    if (banner) banner.style.display = 'flex';
    if (chartView) chartView.style.display = 'none';
    if (emptyView) emptyView.style.display = 'none';
    if (depthView) depthView.style.display = 'block';

    if (!currentDateStr) {
      setDemoDate('2023-10-15');
    } else {
      renderDepthLayer();
      if (currentCoord) {
        fetchDepthPoint(currentCoord.lat, currentCoord.lon, currentDateStr);
      }
    }
  } else {
    if (btnSurf) btnSurf.classList.add('ky-mhw-layer-btn--active');
    if (btnDepth) btnDepth.classList.remove('ky-mhw-layer-btn--active');
    if (legend) legend.style.display = 'none';
    if (depthView) depthView.style.display = 'none';

    if (map && map.getLayer('heatwave-depth-raster-layer')) {
      map.setLayoutProperty('heatwave-depth-raster-layer', 'visibility', 'none');
    }

    if (currentCoord && currentDateStr) {
      if (chartView) chartView.style.display = 'block';
      if (emptyView) emptyView.style.display = 'none';
    } else {
      if (chartView) chartView.style.display = 'none';
      if (emptyView) emptyView.style.display = 'flex';
    }
  }
}

async function fetchDepthSummary(dateStr) {
  try {
    const res = await fetch(`${API_BASE}/heatwave-depth/summary?date=${dateStr}`);
    if (!res.ok) return null;
    const data = await res.json();
    currentDepthSummary = data;
    const asEl = document.getElementById('depth-bulletin-as-text');
    const bobEl = document.getElementById('depth-bulletin-bob-text');
    if (data.arabian_sea && asEl) {
      asEl.textContent = data.arabian_sea.bulletin;
    }
    if (data.bay_of_bengal && bobEl) {
      bobEl.textContent = data.bay_of_bengal.bulletin;
    }
    const badgeEl = document.getElementById('depth-validation-badge');
    if (badgeEl && data.validation_badge) {
      badgeEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>${data.validation_badge}</span>`;
    }
    return data;
  } catch (err) {
    console.error('Error fetching depth summary:', err);
    return null;
  }
}

async function renderDepthLayer() {
  if (!currentDateStr) return;
  fetchDepthSummary(currentDateStr);

  try {
    const res = await fetch(`${API_BASE}/heatwave-depth?date=${currentDateStr}`);
    if (!res.ok) return;
    const data = await res.json();
    currentDepthGrid = data;

    const grid = data.grid || data.classes;
    if (!grid || !grid.length || !map) return;

    const H = grid.length;    // 101
    const W = grid[0].length; // 241

    if (typeof document !== 'undefined') {
      if (!rasterCanvas) {
        rasterCanvas = document.createElement('canvas');
      }
      rasterCanvas.width = W;
      rasterCanvas.height = H;
      const ctx = rasterCanvas.getContext('2d');
      const imgData = ctx.createImageData(W, H);
      const buf = imgData.data;

      // Palette per spec:
      // -1: transparent (no data / shallow)
      // 0: #dfe6ee (no heatwave)
      // 1: #f6b26b (surface only)
      // 2: #cc0000 (reaches 50–100 m)
      const colorMap = {
        '-1': [0, 0, 0, 0],
        '0':  [223, 230, 238, 220],
        '1':  [246, 178, 107, 245],
        '2':  [204, 0, 0, 255]
      };

      for (let r = 0; r < H; r++) {
        const latIdx = (H - 1) - r; // Invert Y: row 0 is top (north)
        const row = grid[latIdx];
        for (let c = 0; c < W; c++) {
          const clsVal = row[c];
          const rgba = colorMap[clsVal] || [0, 0, 0, 0];
          const pxIdx = (r * W + c) * 4;
          buf[pxIdx]     = rgba[0];
          buf[pxIdx + 1] = rgba[1];
          buf[pxIdx + 2] = rgba[2];
          buf[pxIdx + 3] = rgba[3];
        }
      }
      ctx.putImageData(imgData, 0, 0);

      const dataUrl = rasterCanvas.toDataURL();
      const coords = [
        [45.0, 30.0],
        [105.0, 30.0],
        [105.0, 5.0],
        [45.0, 5.0]
      ];

      const src = map.getSource('heatwave-depth-raster-src');
      if (src && typeof src.updateImage === 'function') {
        src.updateImage({
          url: dataUrl,
          coordinates: coords
        });
      } else {
        if (map.getLayer('heatwave-depth-raster-layer')) {
          map.removeLayer('heatwave-depth-raster-layer');
        }
        if (map.getSource('heatwave-depth-raster-src')) {
          map.removeSource('heatwave-depth-raster-src');
        }
        map.addSource('heatwave-depth-raster-src', {
          type: 'image',
          url: dataUrl,
          coordinates: coords
        });
        map.addLayer({
          id: 'heatwave-depth-raster-layer',
          type: 'raster',
          source: 'heatwave-depth-raster-src',
          paint: {
            'raster-opacity': 0.88,
            'raster-fade-duration': 250,
            'raster-resampling': 'nearest'
          }
        });
      }

      if (map.getLayer('heatwave-depth-raster-layer')) {
        map.setLayoutProperty('heatwave-depth-raster-layer', 'visibility', 'visible');
      }
    }
  } catch (err) {
    console.error('Error rendering depth raster:', err);
  }
}

async function fetchDepthPoint(lat, lon, dateStr) {
  try {
    const res = await fetch(`${API_BASE}/heatwave-depth/point?lat=${lat}&lon=${lon}&date=${dateStr}`);
    if (!res.ok) return;
    const data = await res.json();

    const statusEl = document.getElementById('depth-point-status');
    const tooltipEl = document.getElementById('depth-point-tooltip');
    const noteEl = document.getElementById('depth-point-note');
    const dateEl = document.getElementById('depth-meta-date');
    const coordEl = document.getElementById('depth-meta-coord');

    if (dateEl) dateEl.textContent = dateStr;
    if (coordEl) coordEl.textContent = formatCoordinates(lat, lon);

    if (statusEl) {
      statusEl.className = 'ky-mhw-depth-result-val';
      if (data.class === 2) {
        statusEl.textContent = 'Reaches 50–100 m';
        statusEl.classList.add('ky-mhw-depth-result-val--deep');
      } else if (data.class === 1) {
        statusEl.textContent = 'Surface only';
        statusEl.classList.add('ky-mhw-depth-result-val--surface');
      } else if (data.class === 0) {
        statusEl.textContent = 'No heatwave';
        statusEl.classList.add('ky-mhw-depth-result-val--none');
      } else {
        statusEl.textContent = 'No Data';
        statusEl.classList.add('ky-mhw-depth-result-val--none');
      }
    }

    if (tooltipEl) {
      if (data.tooltip || data.class === 2) {
        const tipText = data.tooltip || 'Model call: right 80% of the time against Argo floats (2023)';
        tooltipEl.style.display = 'inline-block';
        tooltipEl.textContent = tipText;
        tooltipEl.title = tipText;
      } else {
        tooltipEl.style.display = 'none';
      }
    }

    if (noteEl) {
      if (data.class >= 1) {
        noteEl.textContent = 'Daily heatwave flag (Hobday 5+ consecutive day rule required for an event).';
      } else if (data.class === 0) {
        noteEl.textContent = 'Within normal climatological range at this depth.';
      } else {
        noteEl.textContent = 'Land mask or bathymetric depth shallower than 100 m.';
      }
    }
  } catch (err) {
    console.error('Error fetching depth point:', err);
  }
}

// ============================================================================
// 10. EXPORTS FOR AUTOMATED TESTING (Node environment)
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BOUNDS,
    PRESET_LOCATIONS,
    computeDateWindow,
    formatDateDisplay,
    formatEventDateRange,
    computeWindowStats,
    parseCoordinates,
    selectLocation,
    formatCoordinates,
    resetStatCard,
    showEmptyState,
    revealChartView,
    renderHeatwaveResults,
    switchLayer,
    setDemoDate,
    fetchDepthSummary,
    renderDepthLayer,
    fetchDepthPoint
  };
}

if (typeof window !== 'undefined') {
  window.selectLocation = selectLocation;
  window.resetStatCard = resetStatCard;
  window.computeDateWindow = computeDateWindow;
  window.computeWindowStats = computeWindowStats;
  window.formatEventDateRange = formatEventDateRange;
  window.switchLayer = switchLayer;
  window.setDemoDate = setDemoDate;
  window.renderDepthLayer = renderDepthLayer;
  window.fetchDepthPoint = fetchDepthPoint;
  window.fetchDepthSummary = fetchDepthSummary;
}
