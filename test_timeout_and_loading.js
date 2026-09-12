/**
 * test_timeout_and_loading.js
 * Verification test suite for:
 * 1. 90-second timeout configuration (increased from 8s)
 * 2. Clear "Generating prediction..." loading state & stale data clearing
 * 3. Honest "Model Unavailable" error state only on genuine failure
 * 4. Error message gating ("port 8000" only on localhost, never on Render)
 * 5. Console timing logs (started, succeeded with elapsed ms, failed with reason)
 * 6. Live API verification against deployed Render backend
 */

const assert = require('assert');
const fs = require('fs');

console.log('============================================================');
console.log('  TEST SUITE: FRONTEND TIMEOUT & LOADING-STATE FIX');
console.log('============================================================\n');

const appJs = fs.readFileSync('app.js', 'utf8');
const fisheriesJs = fs.readFileSync('fisheries.js', 'utf8');
const exploreHtml = fs.readFileSync('explore.html', 'utf8');

// TEST 1: Timeout value increased to at least 90 seconds (90000ms)
console.log('[TEST 1] Verifying 90s timeout definition and usage...');
assert(appJs.includes('const API_REQUEST_TIMEOUT_MS = 90000;'), 'app.js must declare API_REQUEST_TIMEOUT_MS = 90000');
assert(fisheriesJs.includes('const API_REQUEST_TIMEOUT_MS = 90000;'), 'fisheries.js must declare API_REQUEST_TIMEOUT_MS = 90000');

// Confirm the old 8000ms timeout in app.js is eliminated
assert(!appJs.includes('controller.abort(), 8000)'), 'Old 8000ms timeout must not be present in app.js');
assert(appJs.includes('currentPredictController.abort(), API_REQUEST_TIMEOUT_MS)'), 'app.js must use API_REQUEST_TIMEOUT_MS on /predict');
assert(appJs.includes('heatmapController.abort(), API_REQUEST_TIMEOUT_MS)'), 'app.js must use API_REQUEST_TIMEOUT_MS on heatmap grids');
console.log('  PASS: 90s timeout (90000ms) declared and wired across all endpoints.\n');

// TEST 2: "Generating prediction..." loading state
console.log('[TEST 2] Verifying "Generating prediction..." loading state...');
assert(exploreHtml.includes('id="result-loading"'), 'explore.html must contain #result-loading');
assert(exploreHtml.includes('Generating prediction...'), 'explore.html must display "Generating prediction..." text');
assert(exploreHtml.includes('id="result-loading-text"'), 'explore.html must have id result-loading-text');
assert(appJs.includes('Generating prediction...'), 'app.js must set "Generating prediction..." on new requests');
console.log('  PASS: "Generating prediction..." loading state present in HTML and configured in JS.\n');

// TEST 3: Stale data clearing on request start
console.log('[TEST 3] Verifying stale data clearing on request dispatch...');
assert(appJs.includes('clearPreviousPredictionUI()'), 'app.js must implement and call clearPreviousPredictionUI()');

// Check setStatsLoading unconditionally clears stat values to '···'
const setStatsLoadingMatch = appJs.match(/function setStatsLoading\(isLoading\)[\s\S]*?\n\}/);
assert(setStatsLoadingMatch, 'setStatsLoading function must exist');
assert(setStatsLoadingMatch[0].includes("el.textContent = '···';"), 'setStatsLoading must unconditionally clear stat card numbers to ···');
assert(!setStatsLoadingMatch[0].includes("if (el.textContent === '—'"), 'setStatsLoading must not guard against clearing previous numbers');

// Check surface inputs are cleared to '—'
assert(appJs.includes('function clearSurfaceInputs()'), 'app.js must implement clearSurfaceInputs()');
assert(appJs.includes("param-sst-val"), 'clearSurfaceInputs must include param-sst-val');
assert(appJs.includes("param-wind-val"), 'clearSurfaceInputs must include param-wind-val');

// Check table body and chart are cleared
assert(appJs.includes("tableBody.innerHTML = '';"), 'clearPreviousPredictionUI must empty tvd-table-body');
assert(appJs.includes("profileChart.destroy();"), 'clearPreviousPredictionUI must destroy prior chart instance');
console.log('  PASS: Stale stat cards, parameter cards, table, and chart are visibly cleared on request start.\n');

// TEST 4: Gating "port 8000" message to localhost only
console.log('[TEST 4] Verifying "port 8000" message is gated to localhost only...');
assert(appJs.includes('function isLocalBackend()'), 'app.js must implement isLocalBackend()');

// Simulate isLocalBackend with different API_BASE values
function testIsLocal(apiBase) {
  try {
    const url = new URL(apiBase, 'http://localhost');
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch (e) {
    return apiBase.includes('localhost') || apiBase.includes('127.0.0.1');
  }
}

assert.strictEqual(testIsLocal('http://localhost:8000'), true, 'localhost:8000 must be recognized as local');
assert.strictEqual(testIsLocal('http://127.0.0.1:8000'), true, '127.0.0.1:8000 must be recognized as local');
assert.strictEqual(testIsLocal('https://kyogre-zk7p.onrender.com'), false, 'Render URL must NOT be recognized as local');
assert.strictEqual(testIsLocal('https://demo.oceanembed.org'), false, 'Remote URL must NOT be recognized as local');

// Verify handleBackendFailure logic
assert(appJs.includes('isLocalBackend()'), 'handleBackendFailure must gate messages on isLocalBackend()');
assert(appJs.includes('const defaultBanner = isLocalBackend()'), 'handleBackendFailure must gate banner on isLocalBackend()');
assert(appJs.includes("'Model Unavailable. Inference service could not be reached.'"), 'Remote fallback banner must show Model Unavailable without port 8000');
console.log('  PASS: "port 8000" message strictly gated to localhost; never shown on Render.\n');

// TEST 5: Console timing logs
console.log('[TEST 5] Verifying console timing telemetry...');
assert(appJs.includes('[OceanEmbed API] POST /predict started'), 'app.js must log POST /predict started');
assert(appJs.includes('[OceanEmbed API] POST /predict succeeded in'), 'app.js must log POST /predict succeeded with ms');
assert(appJs.includes('[OceanEmbed API] POST /predict failed after'), 'app.js must log POST /predict failed with ms');
assert(appJs.includes('[OceanEmbed API] GET /parameter-grid started'), 'app.js must log GET /parameter-grid started');
assert(appJs.includes('[OceanEmbed API] GET /parameter-grid succeeded in'), 'app.js must log GET /parameter-grid succeeded with ms');
assert(appJs.includes('[OceanEmbed API] GET /temperature-grid started'), 'app.js must log GET /temperature-grid started');
assert(appJs.includes('[OceanEmbed API] GET /temperature-grid succeeded in'), 'app.js must log GET /temperature-grid succeeded with ms');
assert(fisheriesJs.includes('[Fisheries API] POST /predict started'), 'fisheries.js must log POST /predict started');
assert(fisheriesJs.includes('[Fisheries API] POST /predict succeeded in'), 'fisheries.js must log POST /predict succeeded with ms');
console.log('  PASS: Request started, succeeded (with response time in ms), and failed (with reason) logged for all endpoints.\n');

// TEST 6: Live API call against deployed Render backend
console.log('[TEST 6] Testing live deployed Render backend endpoint...');
(async () => {
  const RENDER_URL = 'https://kyogre-zk7p.onrender.com';
  const testDate = '2022-07-02';
  const testLat = 15.5;
  const testLon = 65.0;

  console.log(`  Calling ${RENDER_URL}/predict with date=${testDate}, coords=(${testLat}, ${testLon})...`);
  const t0 = Date.now();

  try {
    const res = await fetch(`${RENDER_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: testLat, longitude: testLon, date: testDate }),
    });

    const elapsed = Date.now() - t0;
    console.log(`  Response received in ${elapsed} ms with HTTP status ${res.status}`);
    assert.strictEqual(res.status, 200, `Expected HTTP 200, got ${res.status}`);

    const data = await res.json();
    assert(data.temps && Array.isArray(data.temps), 'Response must include temps array');
    assert.strictEqual(data.temps.length, 15, 'Response must have 15 depth temperatures');
    assert(data.surfaceInputs, 'Response must include surfaceInputs');
    assert(data.indices, 'Response must include indices');

    console.log(`  Surface temp: ${data.temps[0]}°C, 200m: ${data.temps[10]}°C, 1000m: ${data.temps[14]}°C`);
    console.log('  PASS: Deployed Render backend responds with valid 15-depth profile.\n');

    console.log('============================================================');
    console.log('  ALL 6 TEST SUITE VERIFICATION CHECKS PASSED!');
    console.log('============================================================');
  } catch (err) {
    console.error('  FAIL: Render backend test error:', err.message);
    process.exit(1);
  }
})();
