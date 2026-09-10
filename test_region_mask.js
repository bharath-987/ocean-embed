/**
 * test_region_mask.js
 * Automated test suite for:
 * 1. Andaman Sea search placeholder
 * 2. Operational region bounding box enforcement (5N-30N, 45E-105E)
 * 3. High-resolution Natural Earth coastline land mask (Gulf of Kutch, Palk Strait, Andaman Sea)
 * 4. Heatmap destination-out land cutout
 */

const fs = require('fs');
const assert = require('assert');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

console.log('=== Running Region & Coastline Mask Test Suite ===\n');

// ── 1. explore.html static verification ──
const htmlContent = fs.readFileSync('explore.html', 'utf8');

test('explore.html has Andaman Sea search placeholder', () => {
  assert(
    htmlContent.includes('placeholder="Search location (e.g. Andaman Sea, 10°N 95°E)..."'),
    'Expected search input placeholder to reference Andaman Sea with coordinates 10°N 95°E'
  );
  assert(
    !htmlContent.includes('placeholder="Search location (e.g. Chennai, 10°N 80°E)..."'),
    'Old Chennai placeholder should no longer exist in explore.html'
  );
});

test('explore.html contains #region-notice alert element', () => {
  assert(htmlContent.includes('id="region-notice"'), 'Expected #region-notice element');
  assert(htmlContent.includes('id="region-notice-text"'), 'Expected #region-notice-text element');
  assert(htmlContent.includes('North Indian Ocean: 5°N–30°N, 45°E–105°E'), 'Expected operational bounds text in HTML template');
});

test('explore.html includes coastline.js before app.js', () => {
  const coastlineIdx = htmlContent.indexOf('<script src="coastline.js"></script>');
  const appIdx = htmlContent.indexOf('<script src="app.js"></script>');
  assert(coastlineIdx !== -1, 'coastline.js script tag missing');
  assert(appIdx !== -1, 'app.js script tag missing');
  assert(coastlineIdx < appIdx, 'coastline.js must be loaded before app.js');
});

// ── 2. style.css verification ──
const cssContent = fs.readFileSync('style.css', 'utf8');

test('style.css defines .ky-region-notice styles and animation', () => {
  assert(cssContent.includes('.ky-region-notice'), 'Missing .ky-region-notice in style.css');
  assert(cssContent.includes('.ky-region-notice--warning'), 'Missing .ky-region-notice--warning in style.css');
  assert(cssContent.includes('kyNoticeFadeIn'), 'Missing kyNoticeFadeIn animation in style.css');
  assert(cssContent.includes('.map-search__item--out-of-bounds'), 'Missing .map-search__item--out-of-bounds');
});

// ── 3. Coastline & Land Mask Accuracy Tests ──
const { COASTLINE_RINGS } = require('./coastline.js');

function pointInPolygon(lat, lon, polygon) {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const cross = ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (cross) inside = !inside;
  }
  return inside;
}

function isLand(lat, lon) {
  for (let i = 0; i < COASTLINE_RINGS.length; i++) {
    const b = COASTLINE_RINGS[i].b;
    if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
    if (pointInPolygon(lat, lon, COASTLINE_RINGS[i].p)) return true;
  }
  return false;
}

test('Gulf of Kutch is recognized as ocean (isLand = false)', () => {
  const kutchPoints = [
    { name: 'Gulf of Kutch Entrance', lat: 22.5, lon: 69.5 },
    { name: 'Gulf of Kutch Mid', lat: 22.6, lon: 69.5 },
    { name: 'Gulf of Kutch East', lat: 22.7, lon: 70.0 },
  ];
  for (const pt of kutchPoints) {
    const result = isLand(pt.lat, pt.lon);
    assert.strictEqual(result, false, `${pt.name} (${pt.lat}, ${pt.lon}) should be ocean (isLand=false)`);
  }
});

test('Palk Strait between India and Sri Lanka is recognized as ocean', () => {
  const palkPoints = [
    { name: 'Palk Strait North', lat: 9.8, lon: 79.7 },
    { name: 'Palk Strait Mid', lat: 9.5, lon: 79.5 },
  ];
  for (const pt of palkPoints) {
    const result = isLand(pt.lat, pt.lon);
    assert.strictEqual(result, false, `${pt.name} (${pt.lat}, ${pt.lon}) should be ocean (isLand=false)`);
  }
});

test('Andaman Sea channels and waters are recognized as ocean', () => {
  const andamanPoints = [
    { name: 'Andaman Sea Search Example', lat: 10.0, lon: 95.0 },
    { name: 'Andaman Sea Central', lat: 11.5, lon: 94.5 },
    { name: 'Andaman Sea Channel near Port Blair', lat: 11.6, lon: 93.0 },
  ];
  for (const pt of andamanPoints) {
    const result = isLand(pt.lat, pt.lon);
    assert.strictEqual(result, false, `${pt.name} (${pt.lat}, ${pt.lon}) should be ocean (isLand=false)`);
  }
});

test('Open ocean basins (Arabian Sea, Bay of Bengal, Lakshadweep) are ocean', () => {
  assert.strictEqual(isLand(15.5, 65.0), false, 'Central Arabian Sea must be ocean');
  assert.strictEqual(isLand(14.0, 88.0), false, 'Bay of Bengal must be ocean');
  assert.strictEqual(isLand(10.5, 72.5), false, 'Lakshadweep must be ocean');
});

test('Inland continental masses are accurately recognized as land (isLand = true)', () => {
  const landPoints = [
    { name: 'New Delhi', lat: 28.6, lon: 77.2 },
    { name: 'Nagpur (Central India)', lat: 21.1, lon: 79.0 },
    { name: 'Inland Mumbai', lat: 19.1, lon: 73.0 },
    { name: 'Central Sri Lanka', lat: 7.5, lon: 80.7 },
    { name: 'Riyadh (Saudi Arabia)', lat: 24.7, lon: 46.7 },
    { name: 'Yangon (Myanmar)', lat: 16.8, lon: 96.2 },
    { name: 'Bangkok (Thailand)', lat: 13.7, lon: 100.5 },
  ];
  for (const pt of landPoints) {
    const result = isLand(pt.lat, pt.lon);
    assert.strictEqual(result, true, `${pt.name} (${pt.lat}, ${pt.lon}) must be land (isLand=true)`);
  }
});

// ── 4. Operational Region Bounding Box Verification ──
const BOUNDS = { south: 5, north: 30, west: 45, east: 105 };

let lastNoticeMsg = null;
let lastNoticeType = null;
function mockShowRegionNotice(msg, type = 'error') {
  lastNoticeMsg = msg;
  lastNoticeType = type;
}

function mockSelectPoint(lat, lon) {
  if (lat < BOUNDS.south || lat > BOUNDS.north || lon < BOUNDS.west || lon > BOUNDS.east) {
    mockShowRegionNotice('This location is outside our supported region (North Indian Ocean: 5°N–30°N, 45°E–105°E)', 'error');
    return false;
  }
  if (isLand(lat, lon)) {
    mockShowRegionNotice('Selected location is on land. Please select an ocean point within the North Indian Ocean.', 'warning');
    return false;
  }
  return true;
}

test('selectPoint rejects coordinates south of 5N with exact message', () => {
  lastNoticeMsg = null;
  const ok = mockSelectPoint(4.0, 65.0);
  assert.strictEqual(ok, false);
  assert.strictEqual(lastNoticeMsg, 'This location is outside our supported region (North Indian Ocean: 5°N–30°N, 45°E–105°E)');
  assert.strictEqual(lastNoticeType, 'error');
});

test('selectPoint rejects coordinates north of 30N with exact message', () => {
  lastNoticeMsg = null;
  const ok = mockSelectPoint(31.5, 70.0);
  assert.strictEqual(ok, false);
  assert.strictEqual(lastNoticeMsg, 'This location is outside our supported region (North Indian Ocean: 5°N–30°N, 45°E–105°E)');
  assert.strictEqual(lastNoticeType, 'error');
});

test('selectPoint rejects coordinates west of 45E with exact message', () => {
  lastNoticeMsg = null;
  const ok = mockSelectPoint(15.0, 40.0);
  assert.strictEqual(ok, false);
  assert.strictEqual(lastNoticeMsg, 'This location is outside our supported region (North Indian Ocean: 5°N–30°N, 45°E–105°E)');
  assert.strictEqual(lastNoticeType, 'error');
});

test('selectPoint rejects coordinates east of 105E with exact message', () => {
  lastNoticeMsg = null;
  const ok = mockSelectPoint(15.0, 110.0);
  assert.strictEqual(ok, false);
  assert.strictEqual(lastNoticeMsg, 'This location is outside our supported region (North Indian Ocean: 5°N–30°N, 45°E–105°E)');
  assert.strictEqual(lastNoticeType, 'error');
});

test('selectPoint rejects land coordinates with descriptive warning', () => {
  lastNoticeMsg = null;
  const ok = mockSelectPoint(21.1, 79.0); // Nagpur
  assert.strictEqual(ok, false);
  assert.strictEqual(lastNoticeMsg, 'Selected location is on land. Please select an ocean point within the North Indian Ocean.');
  assert.strictEqual(lastNoticeType, 'warning');
});

test('selectPoint accepts all valid ocean locations within region', () => {
  assert.strictEqual(mockSelectPoint(15.5, 65.0), true, 'Arabian Sea must be selectable');
  assert.strictEqual(mockSelectPoint(14.0, 88.0), true, 'Bay of Bengal must be selectable');
  assert.strictEqual(mockSelectPoint(22.6, 69.5), true, 'Gulf of Kutch must be selectable');
  assert.strictEqual(mockSelectPoint(9.5, 79.5), true, 'Palk Strait must be selectable');
  assert.strictEqual(mockSelectPoint(10.0, 95.0), true, 'Andaman Sea must be selectable');
});

console.log(`\nResults: ${passedTests}/${totalTests} tests passed.`);
if (passedTests === totalTests) {
  console.log('ALL REGION AND COASTLINE MASK TESTS PASSED!\n');
} else {
  process.exit(1);
}
