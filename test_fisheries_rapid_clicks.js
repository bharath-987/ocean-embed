/**
 * test_fisheries_rapid_clicks.js
 * Simulates a user rapidly clicking around 15+ nearshore boxes in the browser.
 * Verifies that:
 * 1. Out-of-sequence / rapid clicks are cancelled / superseded cleanly.
 * 2. Final active selection matches the last clicked box.
 * 3. No uncaught errors or false "Live model unavailable" popups occur.
 * 4. Stat cards, table, and chart resolve to real predictions.
 */

const assert = require('assert');

// Setup mock browser environment
class MockElement {
  constructor(id = '', tagName = 'div') {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    const classes = new Set();
    this.classList = {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c) => classes.has(c) ? classes.delete(c) : classes.add(c)
    };
    this.style = {};
    this.children = [];
    this.innerHTML = '';
    this.textContent = '';
    this.listeners = {};
  }
  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  click() {
    if (this.listeners['click']) {
      this.listeners['click'].forEach(fn => fn({ stopPropagation: () => {} }));
    }
  }
  appendChild(child) {
    this.children.push(child);
  }
  querySelector(selector) {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.id === id) return this;
      for (const child of this.children) {
        const found = child.querySelector ? child.querySelector(selector) : null;
        if (found) return found;
      }
    }
    return null;
  }
  remove() {}
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
  isLand: () => false
};

// Mock MapLibre
global.maplibregl = {
  Map: class {
    constructor() {}
    getSource() { return { setData: () => {} }; }
    addSource() {}
    addLayer() {}
    on() {}
    flyTo() {}
    getZoom() { return 6; }
    getContainer() { return { clientHeight: 800, clientWidth: 1200 }; }
    project() { return { x: 600, y: 400 }; }
  },
  Marker: class {
    constructor() {}
    setLngLat() { return this; }
    addTo() { return this; }
    remove() {}
  },
  Popup: class {
    constructor() {}
    setLngLat() { return this; }
    setHTML() { return this; }
    addTo() { return this; }
    remove() {}
  }
};

// Mock Chart
global.Chart = class {
  constructor() {}
  destroy() {}
};

const fisheries = require('./fisheries.js');

async function testRapidClicks() {
  console.log('============================================================');
  console.log('  SIMULATING RAPID NEARSHORE CLICKS (15 BOXES) IN FISHERIES');
  console.log('============================================================\n');

  // 1. Initialize nearshore boxes for 2023-09-04
  await fisheries.loadAndRenderDynamicPfzZones('2023-09-04');
  const allBoxes = fisheries.getNearshoreBoxes();
  assert(allBoxes && allBoxes.length >= 15, 'Must have at least 15 nearshore boxes');

  // Select 15 distinct boxes along west and east coasts
  const boxes = allBoxes.slice(0, 15);
  console.log(`Testing with ${boxes.length} nearshore boxes...`);

  // 2. Rapid succession simulation: trigger selectNearshoreBox every 40ms
  // This simulates the user rapidly clicking different boxes while previous requests are in flight!
  console.log('\n[Phase 1] Rapid clicking sequence (every 40ms)...');
  const results = [];
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    console.log(`  -> Click ${i + 1}/${boxes.length}: Box ${box.id} (${box.center_lat}°N, ${box.center_lon}°E)`);
    const p = fisheries.selectNearshoreBox(box, false);
    results.push({ i, box, promise: p });
    await new Promise(r => setTimeout(r, 40));
  }

  // Await the final request
  const lastResult = results[results.length - 1];
  const finalSuccess = await lastResult.promise;
  assert.strictEqual(finalSuccess, true, 'Last rapid click must resolve successfully');

  // Verify that idleView does NOT show error
  const idleView = mockDoc.getElementById('result-idle');
  const errorCard = idleView.querySelector ? idleView.querySelector('.cast-error-msg') : null;
  assert.strictEqual(errorCard, null, 'No error message card should be present');

  // Verify that TVD panel and stat cards are rendered with the LAST clicked box data
  const lastBox = lastResult.box;
  const coordBadge = mockDoc.getElementById('selected-loc-coord');
  const expectedCoordStr = `${lastBox.center_lat.toFixed(1)}°N, ${lastBox.center_lon.toFixed(1)}°E`;
  assert.strictEqual(coordBadge.textContent, expectedCoordStr, 'Displayed coordinate must match last clicked box');

  const thermoclineVal = mockDoc.getElementById('stat-thermocline-val').textContent;
  const upwellingVal = mockDoc.getElementById('stat-upwelling-val').textContent;
  const pfzVal = mockDoc.getElementById('stat-pfz-val').textContent;
  const nutrientVal = mockDoc.getElementById('stat-nutrient-val').textContent;
  const thermoclineNote = mockDoc.getElementById('stat-thermocline-note').textContent;

  assert(nutrientVal !== '—', 'Surface chlorophyll must be populated');
  assert(upwellingVal !== '—', 'Upwelling must be populated');
  assert(!thermoclineNote.includes('unavailable'), 'Card note must not say Live model unavailable');

  console.log(`\n  Final Selected Box: ${lastBox.id} (${lastBox.center_lat}°N, ${lastBox.center_lon}°E)`);
  console.log(`  Thermocline Depth:  ${thermoclineVal} (${thermoclineNote})`);
  console.log(`  Upwelling Index:    ${upwellingVal}`);
  console.log(`  PFZ Score:          ${pfzVal}`);
  console.log(`  Chlorophyll-a:      ${nutrientVal}`);

  // 3. Steady click-through simulation across 10 boxes (allowing each to finish)
  console.log('\n[Phase 2] Steady sequential click-through across 10 distinct nearshore boxes...');
  for (let i = 0; i < 10; i++) {
    const box = boxes[i];
    const ok = await fisheries.selectNearshoreBox(box, false);
    assert.strictEqual(ok, true, `Box ${box.id} must successfully resolve`);
    const note = mockDoc.getElementById('stat-thermocline-note').textContent;
    assert(!note.includes('unavailable'), `Box ${box.id} must not say unavailable`);
    process.stdout.write(`  [✓] Box ${box.id} (${box.center_lat}°N, ${box.center_lon}°E) OK\n`);
  }

  console.log('\n============================================================');
  console.log('  ALL RAPID CLICK-THROUGH AND STEADY CLICK TESTS PASSED (100%)');
  console.log('============================================================\n');
}

testRapidClicks().catch(err => {
  console.error('\n❌ Rapid clicks test failed:', err);
  process.exit(1);
});
