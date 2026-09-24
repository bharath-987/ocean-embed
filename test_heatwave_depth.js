/**
 * test_heatwave_depth.js
 * Comprehensive Verification Suite for Heatwave Depth Check Feature,
 * Nearshore Box Reversion Audit, and Heatwave Mode Bug Fixes.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition, message) {
  totalAssertions++;
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedAssertions++;
  console.log(`  PASS: ${message}`);
}

function makeGetRequest(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    }).on('error', (e) => reject(e));
  });
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function runTests() {
  console.log('\n============================================================');
  console.log('  TEST SUITE: Heatwave Depth Check & Nearshore Audit');
  console.log('============================================================\n');

  // ==========================================================================
  // SECTION 1: TASK 1 — Nearshore Boxes Collision & Coordinate Audit
  // ==========================================================================
  console.log('SECTION 1: Nearshore Boxes Live Endpoint Verification (/nearshore-boxes)');
  const nbRes = await makeGetRequest('http://localhost:8000/nearshore-boxes');
  assert(nbRes.status === 200, `GET /nearshore-boxes returns 200 OK (status=${nbRes.status})`);
  assert(nbRes.data && Array.isArray(nbRes.data.boxes), 'Response contains boxes array');

  const boxes = nbRes.data.boxes;
  console.log(`  Total nearshore candidate boxes returned: ${boxes.length}`);
  assert(boxes.length > 50, `Substantial nearshore box count (${boxes.length})`);

  // Find box_4_35 and box_3_35
  const box_4_35 = boxes.find(b => b.id === 'box_4_35');
  const box_3_35 = boxes.find(b => b.id === 'box_3_35');
  assert(box_4_35 !== undefined, 'box_4_35 exists in /nearshore-boxes');
  assert(box_3_35 !== undefined, 'box_3_35 exists in /nearshore-boxes');

  console.log(`  box_4_35 center: (${box_4_35.center_lat}, ${box_4_35.center_lon})`);
  console.log(`  box_3_35 center: (${box_3_35.center_lat}, ${box_3_35.center_lon})`);

  const dist_4_3 = calculateDistanceKm(
    box_4_35.center_lat, box_4_35.center_lon,
    box_3_35.center_lat, box_3_35.center_lon
  );
  console.log(`  Distance between box_4_35 and box_3_35: ${dist_4_3.toFixed(2)} km`);
  assert(dist_4_3 > 50, `box_4_35 is well-separated from box_3_35 (${dist_4_3.toFixed(2)} km > 50 km)`);
  assert(box_4_35.center_lat === 9.0 && box_4_35.center_lon === 97.5, 'box_4_35 reverted to original coordinates (9.0°N, 97.5°E)');

  // Find box_9_19 and box_8_19
  const box_9_19 = boxes.find(b => b.id === 'box_9_19');
  const box_8_19 = boxes.find(b => b.id === 'box_8_19');
  assert(box_9_19 !== undefined, 'box_9_19 exists in /nearshore-boxes');
  assert(box_8_19 !== undefined, 'box_8_19 exists in /nearshore-boxes');

  console.log(`  box_9_19 center: (${box_9_19.center_lat}, ${box_9_19.center_lon})`);
  console.log(`  box_8_19 center: (${box_8_19.center_lat}, ${box_8_19.center_lon})`);

  const dist_9_8 = calculateDistanceKm(
    box_9_19.center_lat, box_9_19.center_lon,
    box_8_19.center_lat, box_8_19.center_lon
  );
  console.log(`  Distance between box_9_19 and box_8_19: ${dist_9_8.toFixed(2)} km`);
  assert(dist_9_8 > 50, `box_9_19 is well-separated from box_8_19 (${dist_9_8.toFixed(2)} km > 50 km)`);
  assert(box_9_19.center_lat === 14.0 && box_9_19.center_lon === 73.5, 'box_9_19 reverted to original coordinates (14.0°N, 73.5°E)');

  // Pairwise distance check across all boxes
  let collisionCount = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const d = calculateDistanceKm(
        boxes[i].center_lat, boxes[i].center_lon,
        boxes[j].center_lat, boxes[j].center_lon
      );
      if (d < 10) {
        console.error(`  COLLISION DETECTED: ${boxes[i].id} and ${boxes[j].id} are only ${d.toFixed(2)} km apart!`);
        collisionCount++;
      }
    }
  }
  assert(collisionCount === 0, `Zero box collisions (<10 km) across all ${boxes.length} nearshore boxes`);

  // ==========================================================================
  // SECTION 2: TASK 2 — Heatwave Mode Bug Fixes Verification
  // ==========================================================================
  console.log('\nSECTION 2: Heatwave Mode Bug Fixes Verification');
  const htmlPath = path.join(__dirname, 'marine-ecology.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // a) Wrong label check
  assert(html.includes('content="Detect and categorize Marine Heatwaves (MHWs) across the North Indian Ocean using Hobday et al. (2016) criteria and Observed satellite SST (OSTIA) time series."'), 'marine-ecology.html line 7 contains Observed satellite SST (OSTIA)');
  assert(!html.includes('CNN-LSTM reconstructed SST'), 'marine-ecology.html does NOT contain "CNN-LSTM reconstructed SST"');

  const pyEcologyPath = path.join(__dirname, 'backend', 'marine_ecology.py');
  const pyEcology = fs.readFileSync(pyEcologyPath, 'utf8');
  assert(!pyEcology.includes('CNN-LSTM reconstructed SST'), 'backend/marine_ecology.py does NOT contain "CNN-LSTM reconstructed SST"');
  assert(pyEcology.includes('Observed satellite SST (OSTIA)'), 'backend/marine_ecology.py contains "Observed satellite SST (OSTIA)"');

  // b) Date range 2023 only
  assert(html.includes('min="2023-01-01"'), 'Date picker min is 2023-01-01');
  assert(html.includes('max="2023-12-31"'), 'Date picker max is 2023-12-31');

  // c) Methodology note exact string
  const expectedMethodology = 'Threshold: 90th percentile of observed satellite SST, 2010–2023, daily and smoothed (Hobday et al. 2016).';
  assert(html.includes(expectedMethodology), `Methodology note has exact wording: "${expectedMethodology}"`);
  assert(!html.includes('3-year baseline'), 'Methodology note has removed "3-year baseline" caveat');

  // ==========================================================================
  // SECTION 3: TASK 3 — Heatwave Depth Check Backend Endpoints
  // ==========================================================================
  console.log('\nSECTION 3: Heatwave Depth Check Backend Endpoints');

  // 1. GET /heatwave-depth?date=2023-10-15
  console.log('Testing GET /heatwave-depth?date=2023-10-15...');
  const gridRes = await makeGetRequest('http://localhost:8000/heatwave-depth?date=2023-10-15');
  assert(gridRes.status === 200, `GET /heatwave-depth returns 200 OK (status=${gridRes.status})`);
  assert(gridRes.data.date === '2023-10-15', 'Grid response date matches 2023-10-15');
  assert(Array.isArray(gridRes.data.grid), 'grid is an array');
  assert(gridRes.data.grid.length === 101, `grid height is 101 (got ${gridRes.data.grid.length})`);
  assert(gridRes.data.grid[0].length === 241, `grid width is 241 (got ${gridRes.data.grid[0].length})`);
  assert(gridRes.data.shape[0] === 101 && gridRes.data.shape[1] === 241, 'grid shape reports [101, 241]');

  // Check legend colors
  const legend = gridRes.data.legend;
  assert(legend && typeof legend === 'object', 'legend exists in response');
  assert(legend['0'].color === '#dfe6ee', 'Legend 0 color is #dfe6ee (No heatwave)');
  assert(legend['1'].color === '#f6b26b', 'Legend 1 color is #f6b26b (Surface only)');
  assert(legend['2'].color === '#cc0000', 'Legend 2 color is #cc0000 (Reaches 50–100 m)');

  // Verify class values in grid
  let hasNoHw = false, hasSurfaceOnly = false, hasDeep = false;
  for (let r = 0; r < 101; r++) {
    for (let c = 0; c < 241; c++) {
      const v = gridRes.data.grid[r][c];
      if (v === 0) hasNoHw = true;
      if (v === 1) hasSurfaceOnly = true;
      if (v === 2) hasDeep = true;
    }
  }
  assert(hasNoHw, 'Grid contains class 0 (No heatwave)');
  assert(hasSurfaceOnly, 'Grid contains class 1 (Surface only)');
  assert(hasDeep, 'Grid contains class 2 (Reaches 50–100 m)');

  // 2. GET /heatwave-depth/point?lat=15.0&lon=65.0&date=2023-10-15
  console.log('\nTesting GET /heatwave-depth/point?lat=15.0&lon=65.0&date=2023-10-15...');
  const ptRes = await makeGetRequest('http://localhost:8000/heatwave-depth/point?lat=15.0&lon=65.0&date=2023-10-15');
  assert(ptRes.status === 200, `GET /heatwave-depth/point returns 200 OK (status=${ptRes.status})`);
  assert(ptRes.data.class === 2, `Point class is 2 (got ${ptRes.data.class})`);
  assert(ptRes.data.label === 'Reaches 50–100 m', `Point label is 'Reaches 50–100 m'`);
  assert(ptRes.data.depth_penetration === '50–100 m', `depth_penetration is '50–100 m'`);
  assert(ptRes.data.tooltip === 'Model call: right 80% of the time against Argo floats (2023)', `tooltip is strictly 'Model call: right 80% of the time against Argo floats (2023)'`);

  // STRICT RULE CHECK: band_anomaly_50_100m MUST NOT be returned as a numeric temperature value
  assert(!('band_anomaly_50_100m' in ptRes.data), 'CRITICAL: band_anomaly_50_100m temperature value is NOT exposed in point endpoint');
  assert(!JSON.stringify(ptRes.data).includes('°C'), 'CRITICAL: Point response does not contain temperature in °C');

  // 3. GET /heatwave-depth/summary?date=2023-10-15
  console.log('\nTesting GET /heatwave-depth/summary?date=2023-10-15...');
  const sumRes = await makeGetRequest('http://localhost:8000/heatwave-depth/summary?date=2023-10-15');
  assert(sumRes.status === 200, `GET /heatwave-depth/summary returns 200 OK (status=${sumRes.status})`);
  
  const expectedBadge = 'Checked against 895 Argo float profiles (2023): 80% correct (simple guess: 60%).';
  assert(sumRes.data.validation_badge === expectedBadge, `Validation badge matches exact text: "${expectedBadge}"`);

  // Check Arabian Sea bulletin line format: "<Basin>: <heatwave_share>% of the basin in a heatwave; <deep_share_of_heatwave>% of that reaches 50–100 m."
  const asLine = sumRes.data.arabian_sea.bulletin_line || sumRes.data.arabian_sea.bulletin;
  const bobLine = sumRes.data.bay_of_bengal.bulletin_line || sumRes.data.bay_of_bengal.bulletin;
  console.log(`  Arabian Sea bulletin: "${asLine}"`);
  console.log(`  Bay of Bengal bulletin: "${bobLine}"`);

  const bulletinRegex = /^([A-Za-z\s]+):\s+(\d+(\.\d+)?)%\s+of\s+the\s+basin\s+in\s+a\s+heatwave;\s+(\d+(\.\d+)?)%\s+of\s+that\s+reaches\s+50–100\s+m\.$/;
  assert(bulletinRegex.test(asLine), 'Arabian Sea bulletin matches exact required sentence template');
  assert(bulletinRegex.test(bobLine), 'Bay of Bengal bulletin matches exact required sentence template');
  assert(asLine.startsWith('Arabian Sea:'), 'Arabian Sea line starts with basin name');
  assert(bobLine.startsWith('Bay of Bengal:'), 'Bay of Bengal line starts with basin name');

  // Check second demo date: 2023-07-15 (Bay of Bengal surface only)
  console.log('\nTesting GET /heatwave-depth/summary?date=2023-07-15...');
  const sumRes2 = await makeGetRequest('http://localhost:8000/heatwave-depth/summary?date=2023-07-15');
  assert(sumRes2.status === 200, `Demo date 2023-07-15 summary returns 200 OK`);
  const bobLine2 = sumRes2.data.bay_of_bengal.bulletin_line || sumRes2.data.bay_of_bengal.bulletin;
  assert(bulletinRegex.test(bobLine2), '2023-07-15 BoB bulletin matches template');
  console.log(`  2023-07-15 BoB bulletin: "${bobLine2}"`);

  // 4. Non-2023 Date Rejection
  console.log('\nTesting Non-2023 Date Rejection...');
  const invalidDateGrid = await makeGetRequest('http://localhost:8000/heatwave-depth?date=2022-06-15');
  assert(invalidDateGrid.status === 400, `Non-2023 grid query returns 400 Bad Request (status=${invalidDateGrid.status})`);
  assert(invalidDateGrid.data.detail.includes('2023'), 'Error message states depth layer is only available for 2023');

  const invalidDatePt = await makeGetRequest('http://localhost:8000/heatwave-depth/point?lat=15.0&lon=65.0&date=2021-04-10');
  assert(invalidDatePt.status === 400, `Non-2023 point query returns 400 Bad Request (status=${invalidDatePt.status})`);

  const invalidDateSum = await makeGetRequest('http://localhost:8000/heatwave-depth/summary?date=2024-01-01');
  assert(invalidDateSum.status === 400, `Non-2023 summary query returns 400 Bad Request (status=${invalidDateSum.status})`);

  // ==========================================================================
  // SECTION 4: STRICT WORDING RULES VERIFICATION
  // ==========================================================================
  console.log('\nSECTION 4: Strict Wording Rules Verification');

  // Rule 1: Depth layer has NO severity words at depth
  const jsPath = path.join(__dirname, 'marine-ecology.js');
  const js = fs.readFileSync(jsPath, 'utf8');

  // In depth point inspection or depth layer rendering, ensure no severity labels are applied
  assert(js.includes('fetchDepthPoint'), 'fetchDepthPoint exists');
  assert(js.includes('Daily heatwave flag (Hobday 5+ consecutive day rule required for an event).'), 'Daily flag notice present in depth inspector');

  // Rule 2: band_anomaly_50_100m never shown as exact value, tooltip strictly "Model call: right 80% of the time against Argo floats (2023)"
  assert(js.includes('Model call: right 80% of the time against Argo floats (2023)'), 'Tooltip text "Model call: right 80% of the time against Argo floats (2023)" is present');
  assert(!js.includes('data.band_anomaly_50_100m.toFixed'), 'Raw band_anomaly_50_100m is NOT displayed as a formatted number');

  // ==========================================================================
  // SECTION 5: Frontend DOM Verification (Permanent Depth Layer & Removed Banner)
  // ==========================================================================
  console.log('\nSECTION 5: Frontend DOM Verification');

  // Verify removed bulletin banner & surface layer toggle
  assert(!html.includes('id="depth-bulletin-banner"'), 'Depth bulletin banner container cleanly removed');
  assert(!html.includes('id="btn-layer-surface"'), 'btn-layer-surface toggle button cleanly removed');
  assert(!html.includes('Checked against 895 Argo float profiles (2023): 80% correct (simple guess: 60%).'), 'Banner validation badge text removed');

  // Permanent Depth Layer
  assert(js.includes("currentLayer = 'depth'"), 'currentLayer defaults to depth layer permanently');

  // Depth Legend (Permanently visible)
  assert(html.includes('id="depth-legend"'), 'Depth legend container present');
  assert(!html.includes('id="depth-legend" style="display:none;"'), 'Depth legend is permanently visible (not hidden)');
  assert(html.includes('HEATWAVE DEPTH EXTENT'), 'Depth legend title present');
  assert(html.includes('#dfe6ee'), 'Depth legend contains #dfe6ee (No heatwave)');
  assert(html.includes('#f6b26b'), 'Depth legend contains #f6b26b (Surface only)');
  assert(html.includes('#cc0000'), 'Depth legend contains #cc0000 (Reaches 50–100 m)');
  assert(html.includes('Surface only'), 'Depth legend label "Surface only" present');
  assert(html.includes('Reaches 50–100 m'), 'Depth legend label "Reaches 50–100 m" present');

  // Depth Inspection View
  assert(html.includes('id="mhw-depth-view"'), 'mhw-depth-view container present');
  assert(html.includes('id="depth-point-status"'), 'depth-point-status element present');
  assert(html.includes('id="depth-point-tooltip"'), 'depth-point-tooltip element present');

  // CSS Styles
  const cssPath = path.join(__dirname, 'style.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  assert(css.includes('.ky-mhw-depth-card'), '.ky-mhw-depth-card CSS class defined');

  console.log('\n============================================================');
  console.log(`  ALL HEATWAVE DEPTH & COLLISION TESTS PASSED! (${passedAssertions}/${totalAssertions} assertions)`);
  console.log('============================================================\n');
}

runTests().catch((err) => {
  console.error('\nTest runner failed:', err);
  process.exit(1);
});
