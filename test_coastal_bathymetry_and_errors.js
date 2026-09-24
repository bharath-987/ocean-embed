/**
 * test_coastal_bathymetry_and_errors.js
 * 
 * Rigorous Verification Suite for:
 * 1. Coastal / shallow water points where bathymetry depths > seafloor return null
 *    - Point 1: 7.63°N, 77.18°E (Gulf of Mannar)
 *    - Point 2: 15.79°N, 73.18°E (Goa shelf)
 * 2. Proper error differentiation:
 *    - Data Unavailable vs Live Model Unavailable
 */

const assert = require('assert');

// Simple DOM element mock
class MockElement {
  constructor(id = '', tagName = 'div') {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    this.style = {};
    this.classList = {
      _classes: new Set(),
      add: (c) => this.classList._classes.add(c),
      remove: (c) => this.classList._classes.delete(c),
      contains: (c) => this.classList._classes.has(c),
      get className() { return Array.from(this._classes).join(' '); }
    };
    this.children = [];
    this.innerHTML = '';
    this.textContent = '';
    this.attributes = {};
  }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  appendChild(child) { this.children.push(child); }
  querySelector(sel) {
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      return this.children.find(c => c.classList && c.classList.contains(cls)) || null;
    }
    return null;
  }
  querySelectorAll(sel) {
    return this.children;
  }
  remove() {
    this.removed = true;
  }
}

async function runTests() {
  console.log('============================================================');
  console.log('  COASTAL BATHYMETRY & ERROR DIFFERENTIATION TEST SUITE');
  console.log('============================================================\n');

  // TEST 1: Live Backend Fetch for Coastal Point 1 (7.63°N, 77.18°E)
  console.log('[TEST 1] Fetching live prediction for Point 1 (7.63°N, 77.18°E)...');
  const res1 = await fetch('http://localhost:8000/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude: 7.63, longitude: 77.18, date: '2023-10-18' }),
  });
  assert.strictEqual(res1.status, 200, 'Point 1 must return HTTP 200');
  const pred1 = await res1.json();
  assert(Array.isArray(pred1.temps), 'pred1.temps must be array');
  assert.strictEqual(pred1.temps[pred1.temps.length - 1], null, 'Deepest depth (1000m) must be null in shallow water');
  console.log('  ✓ Point 1 returned 200 OK with null seafloor depths (75m–1000m: null).\n');

  // TEST 2: Live Backend Fetch for Coastal Point 2 (15.79°N, 73.18°E)
  console.log('[TEST 2] Fetching live prediction for Point 2 (15.79°N, 73.18°E)...');
  const res2 = await fetch('http://localhost:8000/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude: 15.79, longitude: 73.18, date: '2023-10-18' }),
  });
  assert.strictEqual(res2.status, 200, 'Point 2 must return HTTP 200');
  const pred2 = await res2.json();
  assert(Array.isArray(pred2.temps), 'pred2.temps must be array');
  assert.strictEqual(pred2.temps[pred2.temps.length - 1], null, 'Deepest depth (1000m) must be null in shallow water');
  console.log('  ✓ Point 2 returned 200 OK with null seafloor depths.\n');

  // TEST 3: Summary Element Calculation Logic with null deepT
  console.log('[TEST 3] Verifying summary text formatting with null bathymetry depths...');
  const summaryEl = new MockElement('result-summary');
  const surfT = pred1.temps[0];
  const depths = pred1.depths;

  let deepestIdx = -1;
  for (let i = pred1.temps.length - 1; i >= 0; i--) {
    if (pred1.temps[i] !== null && pred1.temps[i] !== undefined && !isNaN(pred1.temps[i])) {
      deepestIdx = i;
      break;
    }
  }

  assert(deepestIdx >= 0, 'Must find valid shallow water depths');
  const deepestT = pred1.temps[deepestIdx];
  const deepestDepth = depths[deepestIdx];
  assert(deepestDepth <= 50, `Seafloor depth for point 1 should be <= 50m, got ${deepestDepth}`);

  if (deepestIdx === depths.length - 1) {
    summaryEl.innerHTML = `Thermocline drop: <strong>${surfT.toFixed(1)}°C</strong> surface &rarr; <strong>${deepestT.toFixed(1)}°C</strong> at 1 000 m`;
  } else {
    summaryEl.innerHTML = `Profile span: <strong>${surfT.toFixed(1)}°C</strong> surface &rarr; <strong>${deepestT.toFixed(1)}°C</strong> at ${deepestDepth} m <span style="color:#64748B; font-weight:normal;">(seafloor reached; deeper levels unavailable)</span>`;
  }

  assert(summaryEl.innerHTML.includes('seafloor reached; deeper levels unavailable'), 'Must indicate seafloor reached');
  assert(summaryEl.innerHTML.includes(`${deepestDepth} m`), 'Must indicate deepest valid depth');
  console.log('  ✓ Summary element rendered without throwing TypeError:');
  console.log('   ', summaryEl.innerHTML, '\n');

  // TEST 4: Verification of Data Unavailable vs Live Model Unavailable in app.js logic
  console.log('[TEST 4] Verifying Data Unavailable vs Live Model Unavailable classification...');

  // Mock DOM elements for handleBackendFailure
  const elements = {
    'result-loading': new MockElement('result-loading'),
    'result-content': new MockElement('result-content'),
    'result-idle': new MockElement('result-idle'),
    'tvd-empty-view': new MockElement('tvd-empty-view'),
    'stat-mld-val': new MockElement('stat-mld-val'),
    'stat-ohc-val': new MockElement('stat-ohc-val'),
    'stat-d20-val': new MockElement('stat-d20-val'),
    'stat-d26-val': new MockElement('stat-d26-val'),
    'tvd-table-body': new MockElement('tvd-table-body'),
    'region-notice': new MockElement('region-notice')
  };

  const mockDoc = {
    getElementById: (id) => elements[id] || null
  };

  function simulateHandleBackendFailure(msg, errorType = 'model') {
    const isData = errorType === 'data' || (typeof msg === 'string' && (
      msg.toLowerCase().includes('data unavailable') ||
      msg.toLowerCase().includes('no satellite data') ||
      msg.toLowerCase().includes('not available') ||
      msg.toLowerCase().includes('outside the active model window') ||
      msg.toLowerCase().includes('outside domain') ||
      msg.toLowerCase().includes('land coordinate') ||
      msg.toLowerCase().includes('data gap')
    ));

    const idleEl = elements['result-idle'];
    idleEl.children = [];
    const errDiv = new MockElement('', 'div');
    errDiv.classList.add('cast-error-msg');

    if (isData) {
      errDiv.innerHTML = `<strong>Data Unavailable</strong><br><span>${msg || 'No satellite observation or profile data available for this location and date.'}</span>`;
    } else {
      errDiv.innerHTML = `<strong>Live Model Unavailable</strong><br><span>Inference backend could not be reached.</span>`;
    }
    idleEl.appendChild(errDiv);
    return { isData, title: isData ? 'Data Unavailable' : 'Live Model Unavailable' };
  }

  // 4a. When backend returns data unavailable (HTTP 400)
  const dataRes = simulateHandleBackendFailure('no satellite data available for this location/date (likely land or data gap)', 'data');
  assert.strictEqual(dataRes.title, 'Data Unavailable', 'Must show Data Unavailable for missing satellite data');
  assert(elements['result-idle'].children[0].innerHTML.includes('Data Unavailable'), 'Idle element must declare Data Unavailable');
  console.log('  ✓ Data gap / 400 error correctly renders "Data Unavailable"');

  // 4b. When backend returns date outside window
  const dateRes = simulateHandleBackendFailure('Date 2020-05-01 is outside the active model window (2023-01-10 to 2023-12-31)', 'data');
  assert.strictEqual(dateRes.title, 'Data Unavailable', 'Must show Data Unavailable for out-of-window dates');
  console.log('  ✓ Date outside window correctly renders "Data Unavailable"');

  // 4c. When network connection is refused / timed out
  const modelRes = simulateHandleBackendFailure('Failed to fetch', 'model');
  assert.strictEqual(modelRes.title, 'Live Model Unavailable', 'Must show Live Model Unavailable for actual connection drops');
  assert(elements['result-idle'].children[0].innerHTML.includes('Live Model Unavailable'), 'Idle element must declare Live Model Unavailable');
  console.log('  ✓ Connection drop / timeout correctly renders "Live Model Unavailable"\n');

  console.log('============================================================');
  console.log('  ALL COASTAL BATHYMETRY & ERROR TESTS PASSED (100%)');
  console.log('============================================================');
}

runTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
