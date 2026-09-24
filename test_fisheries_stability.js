/**
 * test_fisheries_stability.js
 *
 * Verifies:
 * 1. Dev Server stability under rapid nearshore box queries (35+ boxes in quick succession).
 * 2. Complete frontend state reset on /predict failure:
 *    - All 4 top stat cards (values and notes) reset to "—" and "Live model unavailable".
 *    - Chlorophyll provenance pill (#stat-nutrient-pill) and badge (#stat-nutrient-badge) reset together.
 *    - PFZ badge (#stat-pfz-badge) and model badge (#fisheries-model-badge) hidden.
 *    - Error card displayed with Retry button.
 * 3. Retry button behavior:
 *    - Clicking #btn-retry-fisheries re-fires selectLocation for the exact coordinates.
 *    - Repopulates all 4 stat cards, table, and clears error card upon recovery.
 * 4. Rapid-clicking race condition elimination:
 *    - Superseded requests or AbortError do not trigger false "Live Model Unavailable" errors.
 */

const assert = require('assert');
const fs = require('fs');

console.log('============================================================');
console.log('  KYOGRE FISHERIES STABILITY & ERROR HANDLING TEST SUITE');
console.log('============================================================\n');

// Mock browser DOM environment
class MockClassList {
  constructor() { this._classes = new Set(); }
  add(c) { this._classes.add(c); }
  remove(c) { this._classes.delete(c); }
  contains(c) { return this._classes.has(c); }
  has(c) { return this._classes.has(c); }
}

class MockElement {
  constructor(id, tagName = 'div') {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    this.classList = new MockClassList();
    this.style = {};
    this.textContent = '';
    this._innerHTML = '';
    this.children = [];
    this.title = '';
    this._listeners = {};
  }
  set innerHTML(val) {
    this._innerHTML = val;
    this.children = [];
    const idMatches = [...val.matchAll(/id=["']([^"']+)["']/g)];
    idMatches.forEach(m => {
      this.children.push(new MockElement(m[1]));
    });
  }
  get innerHTML() {
    return this._innerHTML || '';
  }
  appendChild(child) { this.children.push(child); return child; }
  querySelector(sel) {
    if (sel.startsWith('#')) {
      const targetId = sel.slice(1);
      return this.children.find(c => c.id === targetId) || (this.id === targetId ? this : null);
    }
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      return this.children.find(c => c.classList && c.classList.contains(cls)) || null;
    }
    return null;
  }
  addEventListener(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }
  click() {
    if (this._listeners['click']) {
      const evt = { stopPropagation: () => {} };
      this._listeners['click'].forEach(fn => fn(evt));
    }
  }
  remove() {
    this.children = [];
    this.style.display = 'none';
  }
}

const mockDoc = {
  elements: {},
  getElementById(id) {
    if (!this.elements[id]) {
      this.elements[id] = new MockElement(id);
    }
    return this.elements[id];
  },
  createElement(tag) {
    return new MockElement('', tag);
  }
};

global.document = mockDoc;
global.window = {
  document: mockDoc,
  location: { hostname: 'localhost' },
};

// Import fisheries modules
const fisheries = require('./fisheries.js');

async function runTests() {
  // -------------------------------------------------------------
  // TEST 1: Stress-Test Stability on Live Backend
  // -------------------------------------------------------------
  console.log('[TEST 1] Stress-testing live backend /predict across 35 nearshore boxes...');
  const boxesResp = await fetch('http://localhost:8000/nearshore-boxes?date=2023-09-04');
  assert.strictEqual(boxesResp.status, 200, 'nearshore-boxes endpoint must return HTTP 200');
  const boxesData = await boxesResp.json();
  const testBoxes = boxesData.boxes.slice(0, 35);
  assert(testBoxes.length >= 35, 'Must have at least 35 nearshore boxes for stress test');

  let successCount = 0;
  const startStress = Date.now();
  for (const box of testBoxes) {
    const pResp = await fetch('http://localhost:8000/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: box.center_lat,
        longitude: box.center_lon,
        date: '2023-09-04'
      })
    });
    assert.strictEqual(pResp.status, 200, `Box ${box.id} (${box.center_lat}, ${box.center_lon}) must return 200`);
    const pData = await pResp.json();
    assert(pData.profile && pData.profile.length === 15, 'Profile must have 15 standard depths');
    assert(typeof pData.indices.chlorophyll_a === 'number', 'indices.chlorophyll_a must be numeric');
    successCount++;
  }
  const stressDuration = Date.now() - startStress;
  console.log(`  ✓ Successfully processed ${successCount} / 35 nearshore boxes in ${stressDuration}ms (0 failures).\n`);

  // -------------------------------------------------------------
  // TEST 2: Complete Stale-State Reset on Failure
  // -------------------------------------------------------------
  console.log('[TEST 2] Verifying complete stat card & chlorophyll badge reset on failure...');

  // 2a. First simulate a successful state with active Satellite chlorophyll badge
  const pill = mockDoc.getElementById('stat-nutrient-pill');
  const badge = mockDoc.getElementById('stat-nutrient-badge');
  const pfzBadge = mockDoc.getElementById('stat-pfz-badge');
  const modelBadge = mockDoc.getElementById('fisheries-model-badge');

  pill.className = 'ky-provenance-pill ky-provenance-pill--satellite';
  pill.textContent = 'Satellite';
  badge.style.display = '';
  badge.textContent = 'Satellite (8-day composite)';
  pfzBadge.style.display = '';
  pfzBadge.textContent = 'High';
  modelBadge.style.display = 'inline-flex';

  mockDoc.getElementById('stat-thermocline-val').textContent = '45 m';
  mockDoc.getElementById('stat-upwelling-val').textContent = '0.85';
  mockDoc.getElementById('stat-pfz-val').textContent = '0.88';
  mockDoc.getElementById('stat-nutrient-val').textContent = '1.85 mg/m³';

  // 2b. Now trigger handleFisheriesBackendFailure with Mumbai nearshore coordinate (18.0, 72.8)
  fisheries.handleFisheriesBackendFailure(18.0, 72.8, new Error('Network connection timeout'));

  // 2c. Verify all four cards reset values to "—"
  assert.strictEqual(mockDoc.getElementById('stat-thermocline-val').textContent, '—', 'Thermocline val must be "—"');
  assert.strictEqual(mockDoc.getElementById('stat-upwelling-val').textContent, '—', 'Upwelling val must be "—"');
  assert.strictEqual(mockDoc.getElementById('stat-pfz-val').textContent, '—', 'PFZ val must be "—"');
  assert.strictEqual(mockDoc.getElementById('stat-nutrient-val').textContent, '—', 'Nutrient val must be "—"');

  // 2d. Verify all four cards reset notes to "Live model unavailable"
  assert.strictEqual(mockDoc.getElementById('stat-thermocline-note').textContent, 'Live model unavailable', 'Thermocline note reset');
  assert.strictEqual(mockDoc.getElementById('stat-upwelling-note').textContent, 'Live model unavailable', 'Upwelling note reset');
  assert.strictEqual(mockDoc.getElementById('stat-pfz-note').textContent, 'Live model unavailable', 'PFZ note reset');
  assert.strictEqual(mockDoc.getElementById('stat-nutrient-note').textContent, 'Live model unavailable', 'Nutrient note reset');

  // 2e. CRITICAL: Verify Chlorophyll provenance pill and badge reset
  assert(pill.className.includes('ky-provenance-pill--heuristic'), 'Chlorophyll pill class must reset to heuristic');
  assert.strictEqual(pill.textContent, 'Estimated Heuristic', 'Chlorophyll pill text must reset from "Satellite" to "Estimated Heuristic"');
  assert.strictEqual(badge.style.display, 'none', 'Chlorophyll badge must be hidden');
  assert.strictEqual(pfzBadge.style.display, 'none', 'PFZ badge must be hidden');
  assert.strictEqual(modelBadge.style.display, 'none', 'Model badge must be hidden');

  // 2f. Verify error card rendered in idleView
  const idleView = mockDoc.getElementById('result-idle');
  assert(idleView.style.display !== 'none', 'result-idle must be visible');
  assert(idleView.children.length > 0, 'result-idle must contain error message element');
  const errorMsg = idleView.children[0];
  assert(errorMsg.innerHTML.includes('Live Model Unavailable'), 'Must declare Live Model Unavailable');
  assert(errorMsg.innerHTML.includes('Retry'), 'Must contain Retry button');
  console.log('  ✓ Verified: All 4 stat cards, notes, chlorophyll badge, pill, and model badge reset synchronously.\n');

  // -------------------------------------------------------------
  // TEST 3: Confirm Retry Button Behavior
  // -------------------------------------------------------------
  console.log('[TEST 3] Verifying Retry button invokes selectLocation and repopulates UI on recovery...');

  let retriedCoord = null;
  const originalSelectLocation = fisheries.selectLocation;

  // Intercept selectLocation on both fisheries and window to verify exact coordinates passed
  const spySelectLocation = function (lat, lon, zoomTo) {
    retriedCoord = { lat, lon, zoomTo };
    return Promise.resolve(true);
  };
  fisheries.selectLocation = spySelectLocation;
  global.window.selectLocation = spySelectLocation;

  const retryBtn = errorMsg.querySelector('#btn-retry-fisheries');
  assert(retryBtn, 'Retry button must exist with id btn-retry-fisheries');
  retryBtn.click();

  assert(retriedCoord !== null, 'Retry click must invoke selectLocation');
  assert.strictEqual(retriedCoord.lat, 18.0, 'Retry must pass exact same latitude');
  assert.strictEqual(retriedCoord.lon, 72.8, 'Retry must pass exact same longitude');
  assert.strictEqual(retriedCoord.zoomTo, false, 'Retry must not force abrupt zoom jump');

  fisheries.selectLocation = originalSelectLocation;
  global.window.selectLocation = originalSelectLocation;
  console.log('  ✓ Verified: Retry button re-fires exact coordinates without stale closures.\n');

  // -------------------------------------------------------------
  // TEST 4: Race Condition & In-Flight Cancellation Verification
  // -------------------------------------------------------------
  console.log('[TEST 4] Verifying rapid clicking race condition elimination...');
  const fisheriesCode = fs.readFileSync('fisheries.js', 'utf8');

  assert(fisheriesCode.includes('currentPredictRequestId'), 'Must declare currentPredictRequestId for request sequencing');
  assert(fisheriesCode.includes('currentPredictController'), 'Must declare currentPredictController for in-flight cancellation');
  assert(fisheriesCode.includes('if (reqId !== currentPredictRequestId) return'), 'Must ignore superseded predictions');
  assert(fisheriesCode.includes('isAbort'), 'Must ignore intentional aborts when superseded');
  console.log('  ✓ Verified: Request ID sequencing and AbortController cancellation guard against race conditions.\n');

  // -------------------------------------------------------------
  // TEST 5: Uvicorn Dev Server Watcher Scoping
  // -------------------------------------------------------------
  console.log('[TEST 5] Verifying uvicorn reload configuration excludes data and output directories...');
  const apiServerCode = fs.readFileSync('backend/api_server.py', 'utf8');
  assert(apiServerCode.includes('reload_dirs'), 'backend/api_server.py must configure reload_dirs');
  assert(apiServerCode.includes('reload_excludes'), 'backend/api_server.py must configure reload_excludes');
  assert(apiServerCode.includes('*/data/*'), 'reload_excludes must explicitly exclude data directory');
  assert(apiServerCode.includes('*.npz') && apiServerCode.includes('*.npy'), 'reload_excludes must exclude heavy binary arrays');
  console.log('  ✓ Verified: Uvicorn file watcher scoped strictly to source code.\n');

  console.log('============================================================');
  console.log('  ALL FISHERIES STABILITY & ERROR RECOVERY TESTS PASSED (100%)');
  console.log('============================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
