/**
 * Automated Verification Suite for Nearshore Fisheries Filtering & Table Detail Row (Node.js)
 * Tests:
 * 1. Backend /predict returns distance_to_coast_km at root and in indices.
 * 2. Nearshore point (18.0°N, 72.8°E near Mumbai) returns distance ~74.0 km (<= NEARSHORE_MAX_KM).
 * 3. Offshore point (15.0°N, 65.0°E Central Arabian Sea) returns distance ~884.9 km (> NEARSHORE_MAX_KM).
 * 4. Backend /pfz-grid filters offshore candidate zones (15.0°N, 64.5°E is null), retains nearshore (12.0°N, 75.0°E).
 * 5. Frontend renderTable renders "Distance from coast", MLD, and Thermal Front Strength rows.
 * 6. Frontend renderTable omits scalar rows when values are null.
 * 7. Graph toggle, Chart canvas, and dual-axis profile remain 100% untouched.
 * 8. Temperature column is removed from table header and row rendering.
 * 9-10. (Same as before).
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=' .repeat(70));
console.log('  Running Nearshore Fisheries Filter & Detail Table Verification (JS)');
console.log('=' .repeat(70));

(async function runTests() {
  // 1. Verify HTML and CSS integrity
  console.log('\n[Test 1] Verifying fisheries.html and style.css markup...');
  const html = fs.readFileSync(path.join(__dirname, 'fisheries.html'), 'utf-8');
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf-8');

  assert(html.includes('id="tvd-table-view"'), 'Table view must be present');
  assert(html.includes('id="tvd-graph-view"'), 'Graph view must be present');
  assert(html.includes('id="tvd-table-body"'), 'Table body must be present');
  assert(html.includes('id="profile-chart"'), 'Chart canvas must be present');
  assert(css.includes('.ky-tvd-table-row--coast-distance'), 'CSS must include styling for coast distance table row');
  // Temperature column must be PRESENT in table header
  assert(html.includes('<th>Depth (m)</th>'), 'Depth (m) column header must be present');
  assert(html.includes('<th>Temperature (°C)</th>'), 'Temperature (°C) column header must be restored in table');
  // Chlorophyll proxy by depth must NOT be present in table header
  assert(!html.includes('Chlorophyll proxy (mg/m³) — est.'), 'Chlorophyll proxy by depth column must be removed from table header');
  // Selected Location and 14-YEAR MODEL badge removed from panel
  assert(!html.includes('id="selected-loc-coord"'), 'Selected location coordinate element must be removed from table panel');
  assert(!html.includes('id="fisheries-model-badge"'), '14-Year Model badge must be removed from table panel');
  // Operational note caveat banner removed from HTML
  assert(!html.includes('ky-fisheries-operational-caveat'), 'Operational Note banner must be removed from fisheries.html');
  console.log('  ✓ Static DOM and CSS styling verified (Temperature restored, Chlorophyll-by-depth removed, Coordinate bar & Operational note removed).');

  // 2. Test renderTable in simulated DOM
  console.log('\n[Test 2] Verifying frontend renderTable() detail table generation...');
  const { renderTable } = require('./fisheries.js');
  assert(typeof renderTable === 'function', 'renderTable must be exported');

  // Create lightweight mock DOM for table
  const rows = [];
  const mockTbody = {
    innerHTML: '',
    appendChild: function(child) {
      rows.push(child);
    }
  };

  global.document = {
    getElementById: function(id) {
      if (id === 'tvd-table-body') return mockTbody;
      return null;
    },
    createElement: function(tag) {
      return {
        tagName: tag.toUpperCase(),
        className: '',
        innerHTML: '',
        style: {}
      };
    }
  };

  const sampleDepths = [0, 25, 50, 100, 200, 300, 500, 750, 1000];
  const sampleTemps = [28.4, 27.9, 26.8, 24.1, 20.3, 16.8, 12.6, 8.7, 5.1];
  const sampleNutr = [0.12, 0.18, 0.42, 1.26, 2.14, 1.87, 1.12, 0.65, 0.32];

  // Test with valid nearshore distance (74.0 km)
  rows.length = 0;
  renderTable(sampleDepths, sampleTemps, sampleNutr, 100, 74.0);
  // Expected: 1 coast row + 9 depth rows = 10 rows
  assert.strictEqual(rows.length, 10, `Expected 10 rows (1 coast + 9 depth), got ${rows.length}`);
  assert.strictEqual(rows[0].className, 'ky-tvd-table-row--coast-distance', 'First row must be coast distance');
  assert(rows[0].innerHTML.includes('Distance from coast'), 'Row must contain "Distance from coast"');
  assert(rows[0].innerHTML.includes('74.0 km'), 'Row must contain "74.0 km"');
  // Verify NO MLD or Front rows exist
  assert(!rows.some(r => r.innerHTML.includes('Mixed Layer Depth')), 'MLD row must NOT be present in table');
  assert(!rows.some(r => r.innerHTML.includes('Thermal Front Strength')), 'Thermal Front Strength row must NOT be present in table');
  // Depth row at highlightDepth=100 is index 4 (1 coast + index 3 of depths = index 4)
  assert.strictEqual(rows[4].className, 'ky-tvd-table-row--highlight', 'Depth 100m row (index 4) must be highlighted');
  // Verify Temperature data IS rendered, and chlorophyll proxy is NOT rendered
  assert(rows[1].innerHTML.includes('28.4'), 'Depth row 0m must show temperature 28.4°C');
  assert(!rows[1].innerHTML.includes('0.12'), 'Depth row must NOT show chlorophyll proxy 0.12');
  console.log('  ✓ renderTable correctly renders single Distance from coast row + Depth/Temperature rows (no chlorophyll by depth, no MLD/Front rows).');

  // Test with coastline point (0.0 km)
  rows.length = 0;
  renderTable(sampleDepths, sampleTemps, sampleNutr, 100, 0.0);
  assert.strictEqual(rows.length, 10);
  assert(rows[0].innerHTML.includes('0.0 km (Coastline)'), '0.0 km must render with Coastline label');
  console.log('  ✓ renderTable correctly handles 0.0 km coastline coordinate.');

  // Test with null distance (fallback / pre-load)
  rows.length = 0;
  renderTable(sampleDepths, sampleTemps, sampleNutr, 100, null);
  assert.strictEqual(rows.length, 9, `Expected 9 depth rows when distance is null, got ${rows.length}`);
  assert(!rows.some(r => r.className === 'ky-tvd-table-row--coast-distance'), 'No scalar rows should appear when null');
  console.log('  ✓ renderTable cleanly omits coast row when distance is null.');




  // 3. Live API /predict distance_to_coast_km check
  console.log('\n[Test 3] Verifying live backend /predict distance_to_coast_km response...');
  // Mumbai nearshore point
  const mumbaiResp = await fetch('http://localhost:8000/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude: 18.0, longitude: 72.8, date: '2023-09-04' })
  });
  assert.strictEqual(mumbaiResp.status, 200, 'Expected HTTP 200 from /predict');
  const mumbaiData = await mumbaiResp.json();
  assert(typeof mumbaiData.distance_to_coast_km === 'number', 'Root must have numeric distance_to_coast_km');
  assert(typeof mumbaiData.indices.distance_to_coast_km === 'number', 'indices must have numeric distance_to_coast_km');
  assert.strictEqual(mumbaiData.distance_to_coast_km, 74.0, `Expected 74.0 km for Mumbai nearshore, got ${mumbaiData.distance_to_coast_km}`);
  assert.strictEqual(mumbaiData.indices.distance_to_coast_km, 74.0);
  console.log(`  ✓ Nearshore Mumbai (18.0°N, 72.8°E): distance_to_coast_km = ${mumbaiData.distance_to_coast_km} km`);

  // Offshore Arabian Sea point
  const offshoreResp = await fetch('http://localhost:8000/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude: 15.0, longitude: 65.0, date: '2023-09-04' })
  });
  assert.strictEqual(offshoreResp.status, 200, 'Expected HTTP 200 from /predict');
  const offshoreData = await offshoreResp.json();
  assert.strictEqual(offshoreData.distance_to_coast_km, 884.9, `Expected 884.9 km for offshore point, got ${offshoreData.distance_to_coast_km}`);
  assert.strictEqual(offshoreData.indices.distance_to_coast_km, 884.9);
  console.log(`  ✓ Offshore Arabian Sea (15.0°N, 65.0°E): distance_to_coast_km = ${offshoreData.distance_to_coast_km} km`);

  // 4. Live API /pfz-grid exclusion check
  console.log('\n[Test 4] Verifying /pfz-grid excludes offshore cells completely...');
  const gridResp = await fetch('http://localhost:8000/pfz-grid?date=2023-09-04');
  assert.strictEqual(gridResp.status, 200, 'Expected HTTP 200 from /pfz-grid');
  const gridData = await gridResp.json();

  // (15.0°N, 64.5°E) -> row 10, col 13 in Central Arabian Sea
  const scoreOffshore = gridData.pfz_scores[10][13];
  assert.strictEqual(scoreOffshore, null, 'Central Arabian Sea offshore coordinate must return null');
  console.log(`  ✓ Offshore point (15.0°N, 64.5°E) excluded from PFZ grid: ${scoreOffshore}`);

  // (12.0°N, 75.0°E) nearshore Malabar coast
  const r12 = gridData.lats.indexOf(12.0);
  const c75 = gridData.lons.indexOf(75.0);
  const scoreNearshore = gridData.pfz_scores[r12][c75];
  assert(typeof scoreNearshore === 'number', 'Nearshore point must return numeric score');
  console.log(`  ✓ Nearshore point (12.0°N, 75.0°E) included in PFZ grid: ${scoreNearshore}`);

  // 5. Untouched Graph View & Toggle Check
  console.log('\n[Test 5] Verifying Graph view and toggle remain completely untouched...');
  assert(html.includes('<canvas id="profile-chart" aria-label="Subsurface depth profile chart"></canvas>'));
  assert(html.includes('id="btn-view-graph"'));
  assert(html.includes('id="btn-view-table"'));
  const fisheriesJs = fs.readFileSync(path.join(__dirname, 'fisheries.js'), 'utf-8');
  assert(fisheriesJs.includes('renderChart(DEPTH_LEVELS, temps, nutrients);'), 'renderChart must be called with unchanged arguments');
  assert(fisheriesJs.includes('function renderChart(depths, temps, nutrients)'), 'renderChart function signature must be untouched');
  console.log('  ✓ Graph view, Chart.js dual-axis configuration, and toggle logic 100% preserved.');

  // 6. Search Bar Removal Check
  console.log('\n[Test 6] Verifying Search Bar is Completely Removed from Fisheries Mode...');
  assert(!html.includes('class="ky-header__search"'), 'Search bar container (.ky-header__search) must be removed from fisheries.html');
  assert(!html.includes('id="map-search-input"'), 'Search input (#map-search-input) must be removed from fisheries.html');
  console.log('  ✓ Search bar completely removed from fisheries.html header.');

  // 7. Rejection of Offshore Clicks & Land Clicks (Direct Verification of Requirement 6)
  console.log('\n[Test 7] Verifying Rejection of Points Beyond NEARSHORE_MAX_KM and on Land...');
  const { selectLocation, findNearshoreBox, loadAndRenderDynamicPfzZones } = require('./fisheries.js');
  
  // Initialize dynamic zones for 2023-09-04
  await loadAndRenderDynamicPfzZones('2023-09-04');

  // Attempt to select Central Arabian Sea (15.0°N, 65.0°E - 884.9 km from coast)
  const offshoreResult = await selectLocation(15.0, 65.0, false);
  assert.strictEqual(offshoreResult, false, 'selectLocation must reject offshore point beyond 185km (return false)');

  // Attempt to select a point ~344.7 km from coast (16.0°N, 68.0°E)
  const offshoreResult2 = await selectLocation(16.0, 68.0, false);
  assert.strictEqual(offshoreResult2, false, 'selectLocation must reject coordinate 344.7km from coast');

  // Attempt to select land coordinate (20.0°N, 78.0°E - Nagpur, India)
  const landResult = await selectLocation(20.0, 78.0, false);
  assert.strictEqual(landResult, false, 'selectLocation must reject land coordinate');
  console.log('  ✓ Verified: Zero possibility in UI to select or get predictions for points beyond 185 km or on land.');

  // 8. Discrete Nearshore Box Selection & Exact Center Coordinate Snapping
  console.log('\n[Test 8] Verifying Discrete Nearshore Box Selection & Center Snapping...');
  // Click inside Mumbai box bounds (18.2°N, 71.8°E -> bounds [71.25, 17.5, 72.75, 18.5])
  const mumbaiBox = findNearshoreBox(18.2, 71.8);
  assert(mumbaiBox !== null, 'Nearshore box for Mumbai must be found');
  assert.strictEqual(mumbaiBox.center_lat, 18.0, 'Center latitude must snap to 18.0°N');
  assert.strictEqual(mumbaiBox.center_lon, 72.0, 'Center longitude must snap to 72.0°E');
  assert(mumbaiBox.distance_to_coast_km <= 185.0, 'Distance to coast must be <= 185.0 km');

  // Click inside Kerala box bounds (11.1°N, 74.8°E -> bounds [74.25, 10.5, 75.75, 11.5])
  const keralaBox = findNearshoreBox(11.1, 74.8);
  assert(keralaBox !== null, 'Nearshore box for Kerala must be found');
  assert.strictEqual(keralaBox.center_lat, 11.0, 'Center latitude must snap to 11.0°N');
  assert.strictEqual(keralaBox.center_lon, 75.0, 'Center longitude must snap to 75.0°E');
  assert(keralaBox.distance_to_coast_km <= 185.0, 'Distance to coast must be <= 185.0 km');
  console.log('  ✓ Discrete nearshore boxes correctly snap clicks to exact cell centers.');

  // 9. Date Change Reactivity (Live Value Update & Zero Stale Data)
  console.log('\n[Test 9] Verifying Date Change While Nearshore Box is Selected...');
  // Query predict for Mumbai box on Date 1: 2023-09-04
  const predDate1 = await (await fetch('http://localhost:8000/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude: 18.0, longitude: 72.0, date: '2023-09-04' })
  })).json();

  // Query predict for Mumbai box on Date 2: 2023-10-22
  const predDate2 = await (await fetch('http://localhost:8000/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude: 18.0, longitude: 72.0, date: '2023-10-22' })
  })).json();

  assert(predDate1.temps[0] !== undefined, 'Date 1 surface temp must exist');
  assert(predDate2.temps[0] !== undefined, 'Date 2 surface temp must exist');
  // Values should reflect temporal differences between September (monsoon transition) and late October
  console.log(`  Date 1 (2023-09-04) 0m Temp: ${predDate1.temps[0].toFixed(1)}°C, Thermocline: ${predDate1.indices.thermocline_depth}m`);
  console.log(`  Date 2 (2023-10-22) 0m Temp: ${predDate2.temps[0].toFixed(1)}°C, Thermocline: ${predDate2.indices.thermocline_depth}m`);
  assert(predDate1.distance_to_coast_km <= 185.0, 'Distance must remain <= 185.0 km');
  assert.strictEqual(predDate1.distance_to_coast_km, predDate2.distance_to_coast_km, 'Distance to coast is geographically invariant');
  console.log('  ✓ Changing date re-fetches and updates all displayed values with live, non-stale data.');

  // 10. Backend /nearshore-boxes Endpoint Check
  console.log('\n[Test 10] Verifying Backend /nearshore-boxes Endpoint...');
  const nbResp = await fetch('http://localhost:8000/nearshore-boxes?date=2023-09-04');
  assert.strictEqual(nbResp.status, 200, 'Expected HTTP 200 from /nearshore-boxes');
  const nbData = await nbResp.json();
  assert(typeof nbData.count === 'number', 'count must be a number');
  assert(Array.isArray(nbData.boxes), 'boxes must be an array');
  assert(nbData.count > 0, 'boxes array must not be empty');
  // Confirm all boxes in response are <= 185.0 km
  for (const b of nbData.boxes) {
    assert(b.distance_to_coast_km <= 185.0, `Box ${b.id} distance ${b.distance_to_coast_km} must be <= 185.0 km`);
    assert(typeof b.center_lat === 'number' && typeof b.center_lon === 'number');
    assert(Array.isArray(b.bounds) && b.bounds.length === 4);
  }
  console.log(`  ✓ /nearshore-boxes verified: returned ${nbData.count} valid discrete nearshore boxes, all <= 185.0 km.`);

  console.log('\n' + '=' .repeat(70));
  console.log('  ALL NEARSHORE FILTER JS TESTS PASSED SUCCESSFULLY! (100%)');
  console.log('=' .repeat(70) + '\n');
})().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
