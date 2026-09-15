const fs = require('fs');
const assert = require('assert');
const http = require('http');

console.log('=======================================================');
console.log('  TESTING BASIN-WIDE PREDICTION CONFIDENCE GRID FEATURE');
console.log('=======================================================');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

function httpPost(url, payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('\n[TEST 1] explore.html DOM Structure (Confidence tile, caption, provenance)...');
  const exploreHtml = fs.readFileSync('explore.html', 'utf8');
  assert(exploreHtml.includes('id="param-confidence"'), 'explore.html must contain #param-confidence tile');
  assert(exploreHtml.includes('data-param="confidence"'), 'explore.html tile must have data-param="confidence"');
  assert(exploreHtml.includes('id="param-confidence-val"'), 'explore.html tile must contain #param-confidence-val');
  assert(exploreHtml.includes('Prediction Confidence'), 'exploreHtml tile must display Prediction Confidence');
  assert(exploreHtml.includes('ky-provenance-pill--heuristic'), 'exploreHtml tile must include heuristic provenance pill');
  assert(exploreHtml.includes('id="map-legend-caption"'), 'explore.html must contain #map-legend-caption in map-legend');
  console.log('  [PASS] explore.html markup verified.');

  console.log('\n[TEST 2] style.css Styling (Full-width banner span, caption tag, icon)...');
  const css = fs.readFileSync('style.css', 'utf8');
  assert(css.includes('.ky-param-tile--wide'), 'style.css must define .ky-param-tile--wide');
  assert(css.includes('grid-column: 1 / -1'), 'style.css .ky-param-tile--wide must span full width');
  assert(css.includes('key-map-legend__caption') || css.includes('.ky-map-legend__caption'), 'style.css must define .ky-map-legend__caption');
  assert(css.includes('.ky-map-legend__caption-tag'), 'style.css must define .ky-map-legend__caption-tag');
  console.log('  [PASS] style.css classes and rules verified.');

  console.log('\n[TEST 3] app.js Integration (PARAM_CONFIG, paramToColor, fallback, float layer)...');
  const appJs = fs.readFileSync('upp.js' ? 'app.js' : 'app.js', 'utf8');
  assert(appJs.includes('confidence: {'), 'app.js PARAM_CONFIG must contain confidence key');
  assert(appJs.includes("ticks: ['30%', '45%', '60%', '75%', '90%+']"), 'PARAM_CONFIG.confidence must have specified 5 ticks');
  assert(appJs.includes("p === 'confidence'"), 'app.js paramToColor must handle confidence parameter');
  assert(appJs.includes('/confidence-grid'), 'app.js checkAndRefreshHeatmap must fetch from /confidence-grid');
  assert(appJs.includes('initArgoFloatsLayer'), 'app.js must define initArgoFloatsLayer');
  assert(appJs.includes('updateArgoFloatLayerVisibility'), 'app.js must define updateArgoFloatLayerVisibility');
  assert(appJs.includes('param-confidence-val'), 'app.js clearSurfaceInputs and validateLayerMarkerSync must reference param-confidence-val');
  console.log('  [PASS] app.js integration verified.');

  console.log('\n[TEST 4] Backend GET /confidence-grid Response Schema & Latency...');
  const startTime = Date.now();
  const res = await httpGet('http://localhost:8000/confidence-grid?date=2022-07-02&depth=0');
  const elapsed = Date.now() - startTime;
  assert.strictEqual(res.status, 200, `/confidence-grid must return 200, got ${res.status}`);
  const data = res.body;
  assert.strictEqual(data.param, 'confidence', 'data.param must be confidence');
  assert.strictEqual(data.date, '2022-07-02', 'data.date must match requested date');
  assert.strictEqual(data.depth, 0, 'data.depth must match requested depth');
  assert.strictEqual(data.base_confidence, 75, 'data.base_confidence at depth 0 must be 75%');
  assert.strictEqual(data.provenance, 'ESTIMATED HEURISTIC', 'data.provenance must be "ESTIMATED HEURISTIC"');
  assert(Array.isArray(data.lats) && data.lats.length === 101, 'data.lats must have length 101');
  assert(Array.isArray(data.lons) && data.lons.length === 241, 'data.lons must have length 241');
  assert(Array.isArray(data.grid) && data.grid.length === 101, 'data.grid must have 101 rows');
  assert(Array.isArray(data.grid[0]) && data.grid[0].length === 241, 'data.grid[0] must have 241 columns');
  assert.deepStrictEqual(data.bounds, { south: 5.0, north: 30.0, west: 45.0, east: 105.0 }, 'bounds must match basin');
  console.log(`  [PASS] /confidence-grid schema, shape, and bounds verified (${elapsed}ms).`);

  console.log('\n[TEST 5] Numerical Parity Check: /confidence-grid vs /predict...');
  const testCoords = [
    { lat: 15.5, lon: 65.0, name: 'Central Arabian Sea' },
    { lat: 12.0, lon: 85.0, name: 'Central Bay of Bengal' },
    { lat: 8.0,  lon: 77.0, name: 'South India / Cape Comorin' },
    { lat: 6.0,  lon: 92.0, name: 'Southern BoB / Nicobar' },
  ];
  for (const pt of testCoords) {
    const latIdx = Math.round((pt.lat - 5.0) / 0.25);
    const lonIdx = Math.round((pt.lon - 45.0) / 0.25);
    const gridVal = data.grid[latIdx][lonIdx];
    const predRes = await httpPost('http://localhost:8000/predict', {
      latitude: pt.lat,
      longitude: pt.lon,
      date: '2022-07-02'
    });
    assert.strictEqual(predRes.status, 200);
    const predConf = predRes.body.profile[0].confidence_pct;
    assert.strictEqual(gridVal, predConf, `Mismatch at ${pt.name} (${pt.lat}, ${pt.lon}): Grid=${gridVal} vs Predict=${predConf}`);
    console.log(`  [PASS] ${pt.name} (${pt.lat}°N, ${pt.lon}°E): Grid=${gridVal}%, Predict=${predConf}% -> Exact match`);
  }

  console.log('\n[TEST 6] Error Handling on Invalid Date...');
  const badDateRes = await httpGet('http://localhost:8000/confidence-grid?date=invalid-date');
  assert.strictEqual(badDateRes.status, 400, 'Invalid date format must return HTTP 400');
  const outOfRangeRes = await httpGet('http://localhost:8000/confidence-grid?date=2030-01-01');
  assert.strictEqual(outOfRangeRes.status, 400, 'Out-of-range date must return HTTP 400');
  console.log('  [PASS] Invalid dates rejected with HTTP 400.');

  console.log('\n=======================================================');
  console.log('  ALL CONFIDENCE GRID SUITE TESTS PASSED (6/6)');
  console.log('=======================================================');
}

runTests().catch(err => {
  console.error('\n[FAIL] Test failed with error:', err);
  process.exit(1);
});
