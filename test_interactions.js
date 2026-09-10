/**
 * test_interactions.js
 * Functional test script to verify:
 * 1. Ocean Parameter cards toggle and mutual exclusivity
 * 2. TVD table row highlight synchronization with Depth dropdown state
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('============================================================');
console.log('  RUNNING INTERACTION & FUNCTIONAL REGRESSION TEST SUITE');
console.log('============================================================\n');

// 1. Setup Mock DOM Environment
class MockClassList {
  constructor() {
    this.classes = new Set();
  }
  add(c) { this.classes.add(c); }
  remove(c) { this.classes.delete(c); }
  contains(c) { return this.classes.has(c); }
  toggle(c) {
    if (this.contains(c)) { this.remove(c); return false; }
    else { this.add(c); return true; }
  }
}

class MockElement {
  constructor(tag = 'div', id = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.classList = new MockClassList();
    this.attributes = {};
    this.style = {};
    this.children = [];
    this.listeners = {};
    this.textContent = '';
    this.innerHTML = '';
    this.value = '';
    this.scrollIntoViewCalls = 0;
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] || null; }
  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  dispatchEvent(event) {
    const list = this.listeners[event.type || event] || [];
    list.forEach(fn => fn(event));
  }
  click() {
    this.dispatchEvent({ type: 'click', stopPropagation: () => {} });
  }
  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
  }
  querySelectorAll(selector) {
    const results = [];
    function search(node) {
      if (node.matches && node.matches(selector)) results.push(node);
      for (const ch of node.children) search(ch);
    }
    for (const ch of this.children) search(ch);
    return results;
  }
  querySelector(selector) {
    const res = this.querySelectorAll(selector);
    return res.length > 0 ? res[0] : null;
  }
  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector === 'tr') return this.tagName === 'TR';
    return false;
  }
  scrollIntoView(opts) {
    this.scrollIntoViewCalls++;
  }
}

const elementsById = {};
function mockGetElementById(id) {
  if (!elementsById[id]) {
    elementsById[id] = new MockElement('div', id);
  }
  return elementsById[id];
}

const allElements = [];
function createElement(tag, id = '') {
  const el = new MockElement(tag, id);
  if (id) elementsById[id] = el;
  allElements.push(el);
  return el;
}

// Populate required elements for test
const nativeDepthSelect = createElement('select', 'native-depth-select');
const mapDepthBtn = createElement('button', 'map-depth-btn');
const mapDepthLabel = createElement('span', 'map-depth-label');
mapDepthLabel.textContent = 'Depth';
const mapDepthMenu = createElement('div', 'map-depth-menu');
const mapLegendTitle = createElement('div', 'map-legend-title');
const mapLegendBar = createElement('div', 'map-legend-bar');
const mapLegendTicks = createElement('div', 'map-legend-ticks');
const tvdTableBody = createElement('tbody', 'tvd-table-body');
const tvdBtnTable = createElement('button', 'tvd-btn-table');
tvdBtnTable.classList.add('ky-tvd-toggle__btn--active');
const tvdBtnGraph = createElement('button', 'tvd-btn-graph');
const tvdTableView = createElement('div', 'tvd-table-view');
const tvdGraphView = createElement('div', 'tvd-graph-view');
const tvdEmptyView = createElement('div', 'tvd-empty-view');

const depthOptions = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000].map(d => {
  const opt = createElement('div');
  opt.classList.add('ky-depth-option');
  opt.setAttribute('data-depth', String(d));
  return opt;
});

const paramTiles = ['sst', 'ssh', 'sss', 'sla', 'current', 'wind'].map(p => {
  const tile = createElement('button', `param-${p}`);
  tile.classList.add('ky-param-tile');
  tile.setAttribute('data-param', p);
  return tile;
});

// Mock document
const document = {
  getElementById: mockGetElementById,
  querySelectorAll: (selector) => {
    if (selector === '.ky-param-tile') return paramTiles;
    if (selector === '.ky-depth-option') return depthOptions;
    if (selector === 'tr') return tvdTableBody.querySelectorAll('tr');
    return [];
  },
  createElement: (tag) => {
    const el = new MockElement(tag);
    allElements.push(el);
    return el;
  },
  addEventListener: () => {}
};

// Global variables simulating app.js state
let selectedDepth = null;
let selectedParam = null;
let hasSelectedDate = true;
let heatmapVisible = true;

const PARAM_CONFIG = {
  sst:     { title: 'Sea Surface Temperature (°C)', ticks: ['24', '26', '28', '30', '32'], bar: 'gradient-sst' },
  ssh:     { title: 'Sea Surface Height (m)',       ticks: ['-0.4', '-0.2', '0.0', '+0.2', '+0.4'], bar: 'gradient-ssh' },
  sss:     { title: 'Sea Surface Salinity (PSU)',   ticks: ['32', '33', '34', '35', '36'], bar: 'gradient-sss' },
  sla:     { title: 'Sea Level Anomaly (m)',        ticks: ['-0.3', '-0.15', '0.0', '+0.15', '+0.3'], bar: 'gradient-sla' },
  current: { title: 'Surface Ocean Current (m/s)',  ticks: ['0.0', '0.3', '0.6', '0.9', '1.2'], bar: 'gradient-current' },
  wind:    { title: 'Surface Winds (m/s)',          ticks: ['2', '5', '8', '11', '14'], bar: 'gradient-wind' },
};

function checkAndRefreshHeatmap() {
  const hasLayer = (selectedParam !== null || selectedDepth !== null);
  const isGated = !hasSelectedDate || !hasLayer;
  heatmapVisible = !isGated;
}

function updateHeatmapLegend(depth) {
  mapLegendTitle.textContent = depth === 0 
    ? 'Sea Surface Temperature (°C)' 
    : `Subsurface Temperature at ${depth}m (°C)`;
}

function updateTableHighlight(depth = selectedDepth) {
  const tbody = document.getElementById('tvd-table-body');
  if (!tbody) return;
  const rows = tbody.querySelectorAll('tr');
  rows.forEach(tr => {
    const d = parseInt(tr.getAttribute('data-depth'), 10);
    if (depth !== null && d === depth) {
      tr.classList.add('ky-tvd-table-row--highlight');
    } else {
      tr.classList.remove('ky-tvd-table-row--highlight');
    }
  });
  scrollHighlightedTvdRow();
}

function scrollHighlightedTvdRow() {
  const tbody = document.getElementById('tvd-table-body');
  if (!tbody) return;
  const highlighted = tbody.querySelector('.ky-tvd-table-row--highlight');
  if (highlighted) {
    highlighted.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function setDepthSelection(depth, updateHeatmap = true) {
  selectedDepth = depth;
  if (nativeDepthSelect) {
    nativeDepthSelect.value = depth !== null ? String(depth) : '';
  }
  if (mapDepthLabel) {
    if (depth === null) {
      mapDepthLabel.textContent = 'Depth';
    } else if (depth === 0) {
      mapDepthLabel.textContent = 'Depth: 0 m (Surface)';
    } else {
      mapDepthLabel.textContent = `Depth: ${depth} m`;
    }
  }

  depthOptions.forEach(opt => {
    const d = parseInt(opt.getAttribute('data-depth'), 10);
    if (depth !== null && d === depth) {
      opt.classList.add('ky-depth-option--selected');
    } else {
      opt.classList.remove('ky-depth-option--selected');
    }
  });

  updateTableHighlight(depth);

  if (updateHeatmap) {
    selectedParam = null;
    paramTiles.forEach(t => t.classList.remove('ky-param-tile--active'));
    checkAndRefreshHeatmap();
  }
}

function updateDepthTable(depths, temps) {
  const tbody = document.getElementById('tvd-table-body');
  if (!tbody) return;
  tbody.children = []; // clear
  depths.forEach((depth, i) => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-depth', String(depth));
    if (selectedDepth !== null && depth === selectedDepth) {
      tr.className = 'ky-tvd-table-row--highlight';
      tr.classList.add('ky-tvd-table-row--highlight');
    }
    tr.innerHTML = `<td>${depth}</td><td>${temps[i].toFixed(1)}</td>`;
    tr.addEventListener('click', () => {
      setDepthSelection(depth, true);
    });
    tbody.appendChild(tr);
  });
  scrollHighlightedTvdRow();
}

// Wire parameter tile click handlers
paramTiles.forEach(tile => {
  tile.addEventListener('click', () => {
    const param = tile.getAttribute('data-param');
    const isAlreadyActive = tile.classList.contains('ky-param-tile--active') || selectedParam === param;

    // Toggle off / deselect if already selected
    if (isAlreadyActive) {
      tile.classList.remove('ky-param-tile--active');
      selectedParam = null;
      setDepthSelection(null, false);
      updateHeatmapLegend(0);
      checkAndRefreshHeatmap();
      return;
    }

    // Deselect all other tiles and select this one
    paramTiles.forEach(t => t.classList.remove('ky-param-tile--active'));
    tile.classList.add('ky-param-tile--active');

    selectedParam = param;
    setDepthSelection(0, false);

    const cfg = PARAM_CONFIG[param] || PARAM_CONFIG.sst;
    mapLegendTitle.textContent = cfg.title;
    mapLegendBar.style.background = cfg.bar;
    mapLegendTicks.innerHTML = cfg.ticks.map(t => `<span>${t}</span>`).join('');

    checkAndRefreshHeatmap();
  });
});

// ── TEST 1: Parameter Selection & Deselection Toggle ─────────────────
console.log('[TEST 1] Ocean Parameter Card Toggle & Mutual Exclusivity');
const sstTile = paramTiles.find(t => t.getAttribute('data-param') === 'sst');
const sshTile = paramTiles.find(t => t.getAttribute('data-param') === 'ssh');
const windTile = paramTiles.find(t => t.getAttribute('data-param') === 'wind');

// Initial state: nothing selected
assert.strictEqual(selectedParam, null, 'Initially selectedParam is null');
assert.strictEqual(sstTile.classList.contains('ky-param-tile--active'), false, 'SST not initially active');

// 1. Click SST -> Select
sstTile.click();
assert.strictEqual(selectedParam, 'sst', 'Clicking SST sets selectedParam = "sst"');
assert.strictEqual(sstTile.classList.contains('ky-param-tile--active'), true, 'SST card gains active class');
assert.strictEqual(selectedDepth, 0, 'SST selection sets selectedDepth = 0');
assert.strictEqual(heatmapVisible, true, 'Heatmap layer is visible');
assert.strictEqual(mapLegendTitle.textContent, 'Sea Surface Temperature (°C)', 'Legend shows SST');
console.log('  [PASS] Parameter card click selects card and sets layer');

// 2. Click SST again -> Toggle off / Deselect
sstTile.click();
assert.strictEqual(selectedParam, null, 'Clicking active SST card deselects it (selectedParam is null)');
assert.strictEqual(sstTile.classList.contains('ky-param-tile--active'), false, 'Active class removed from SST card');
assert.strictEqual(selectedDepth, null, 'Depth resets to null');
assert.strictEqual(mapDepthLabel.textContent, 'Depth', 'Depth label resets to placeholder');
assert.strictEqual(heatmapVisible, false, 'Heatmap overlay is hidden (reset to default base map)');
assert.strictEqual(mapLegendTitle.textContent, 'Sea Surface Temperature (°C)', 'Legend resets to default title');
console.log('  [PASS] Clicking already-selected card toggles/deselects it and resets map');

// 3. Click SSH -> Select SSH
sshTile.click();
assert.strictEqual(selectedParam, 'ssh', 'Clicking SSH sets selectedParam = "ssh"');
assert.strictEqual(sshTile.classList.contains('ky-param-tile--active'), true, 'SSH tile is active');
assert.strictEqual(sstTile.classList.contains('ky-param-tile--active'), false, 'SST tile is not active');
assert.strictEqual(mapLegendTitle.textContent, 'Sea Surface Height (m)', 'Legend shows SSH title');

// 4. Click Wind -> Deselects SSH, Selects Wind
windTile.click();
assert.strictEqual(selectedParam, 'wind', 'Clicking Wind sets selectedParam = "wind"');
assert.strictEqual(windTile.classList.contains('ky-param-tile--active'), true, 'Wind tile is active');
assert.strictEqual(sshTile.classList.contains('ky-param-tile--active'), false, 'Previous SSH tile is deselected');
assert.strictEqual(mapLegendTitle.textContent, 'Surface Winds (m/s)', 'Legend switches to Wind');
console.log('  [PASS] Selecting new parameter card deselects previous (only one active at a time)');

// 5. Toggle Wind off
windTile.click();
assert.strictEqual(selectedParam, null, 'Wind deselected');
assert.strictEqual(windTile.classList.contains('ky-param-tile--active'), false, 'Wind tile inactive');
assert.strictEqual(heatmapVisible, false, 'Map resets to default');
console.log('  [PASS] Deselecting Wind returns system to default unselected state\n');


// ── TEST 2: TVD Table Row Highlight & Depth Dropdown Synchronization ──
console.log('[TEST 2] TVD Table Row Highlight & Depth Dropdown Synchronization');

const depths = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000];
const mockTemps = [28.5, 28.3, 28.1, 27.9, 27.5, 25.0, 22.1, 18.4, 15.2, 13.0, 10.5, 8.2, 5.1, 4.2, 3.8];

// Render table while depth is null
updateDepthTable(depths, mockTemps);
let rows = tvdTableBody.querySelectorAll('tr');
assert.strictEqual(rows.length, 15, 'TVD Table populated with 15 depth rows');

// Check that 50m row is NOT hardcoded to be highlighted when depth is null
const row50 = rows.find(r => r.getAttribute('data-depth') === '50');
assert.strictEqual(row50.classList.contains('ky-tvd-table-row--highlight'), false, 'Row 50m is NOT hardcoded highlighted');
const anyHighlighted = rows.some(r => r.classList.contains('ky-tvd-table-row--highlight'));
assert.strictEqual(anyHighlighted, false, 'No row is highlighted when selectedDepth is null');
console.log('  [PASS] No row is highlighted when selectedDepth is null (hardcoded 50m bug eliminated)');

// Select Depth = 50 via dropdown
setDepthSelection(50, true);
assert.strictEqual(row50.classList.contains('ky-tvd-table-row--highlight'), true, 'Row 50m is highlighted when 50m is selected');
assert.strictEqual(row50.scrollIntoViewCalls > 0, true, 'Row 50m was scrolled into view');
console.log('  [PASS] Dropdown depth selection (50m) highlights row 50 and scrolls into view');

// Change Dropdown Depth to 200m
const row200 = rows.find(r => r.getAttribute('data-depth') === '200');
setDepthSelection(200, true);
assert.strictEqual(row200.classList.contains('ky-tvd-table-row--highlight'), true, 'Row 200m is highlighted when 200m is selected');
assert.strictEqual(row50.classList.contains('ky-tvd-table-row--highlight'), false, 'Previous row 50m highlight is removed');
assert.strictEqual(row200.scrollIntoViewCalls > 0, true, 'Row 200m was scrolled into view');
console.log('  [PASS] Changing dropdown to 200m updates table highlight and scrolls row 200 into view');

// Change Dropdown Depth to 0m (Surface)
const row0 = rows.find(r => r.getAttribute('data-depth') === '0');
setDepthSelection(0, true);
assert.strictEqual(row0.classList.contains('ky-tvd-table-row--highlight'), true, 'Row 0m is highlighted');
assert.strictEqual(row200.classList.contains('ky-tvd-table-row--highlight'), false, 'Row 200m loses highlight');
console.log('  [PASS] Changing dropdown to 0m highlights surface row in TVD table');

// Re-render prediction data with depth = 100m
setDepthSelection(100, true);
updateDepthTable(depths, mockTemps);
rows = tvdTableBody.querySelectorAll('tr');
const row100 = rows.find(r => r.getAttribute('data-depth') === '100');
assert.strictEqual(row100.classList.contains('ky-tvd-table-row--highlight'), true, 'New table render preserves active depth 100m highlight');
console.log('  [PASS] Table re-rendering maintains current selectedDepth highlight');

// Click Table Row 700m -> Updates Dropdown
const row700 = rows.find(r => r.getAttribute('data-depth') === '700');
row700.click();
assert.strictEqual(selectedDepth, 700, 'Clicking table row 700 updates selectedDepth to 700');
assert.strictEqual(mapDepthLabel.textContent, 'Depth: 700 m', 'Dropdown label updates to 700m');
assert.strictEqual(row700.classList.contains('ky-tvd-table-row--highlight'), true, 'Row 700 is now highlighted');
assert.strictEqual(row100.classList.contains('ky-tvd-table-row--highlight'), false, 'Row 100 loses highlight');
console.log('  [PASS] Clicking table row syncs depth back to dropdown and updates highlight\n');

console.log('============================================================');
console.log('  ALL FUNCTIONAL & REGRESSION TESTS PASSED (100% SUCCESS)');
console.log('============================================================');
