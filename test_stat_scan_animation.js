const fs = require('fs');
const assert = require('assert');

console.log('======================================================================');
console.log('  TESTING KPI STAT CARDS DATA-SCAN REVEAL ANIMATION');
console.log('======================================================================');

// 1. Verify CSS styles and keyframes in style.css
console.log('\n[TEST 1] CSS Keyframes & Rules Audit in style.css...');
const css = fs.readFileSync('style.css', 'utf8');

// Assert card overflow: hidden to clip scan beam
assert(
  css.includes('.ky-stat-card {') && css.includes('overflow: hidden;'),
  '.ky-stat-card must have overflow: hidden to cleanly clip the scan sweep'
);
console.log('  [PASS] .ky-stat-card has overflow: hidden');

// Assert pseudo-element scan line and gradient beam
assert(
  css.includes('.ky-stat-card::after {'),
  '.ky-stat-card::after pseudo-element must be defined'
);
assert(
  css.includes('rgba(255, 255, 255, 0.95)') || css.includes('rgba(255, 255, 255'),
  'Scan gradient beam must feature a crisp soft white center'
);
assert(
  css.includes('rgba(219, 234, 254') && css.includes('rgba(191, 219, 254'),
  'Scan gradient beam must use Kyogre ice-blue tones'
);
console.log('  [PASS] Scan beam pseudo-element has soft light-blue/white gradient');

// Assert scan sweep keyframes
assert(
  css.includes('@keyframes kyDataScanSweep'),
  '@keyframes kyDataScanSweep must be defined'
);
assert(
  css.includes('.ky-stat-card.ky-stat-card--scanning::after'),
  '.ky-stat-card--scanning must trigger scan beam animation'
);
console.log('  [PASS] @keyframes kyDataScanSweep properly triggers on .ky-stat-card--scanning');

// Assert micro-movement keyframes for KPI icons
assert(css.includes('@keyframes kyScanWave'), '@keyframes kyScanWave for MLD must exist');
assert(css.includes('@keyframes kyScanHeat'), '@keyframes kyScanHeat for OHC must exist');
assert(css.includes('@keyframes kyScanDepth'), '@keyframes kyScanDepth for D20/D26 must exist');
assert(
  css.includes('.ky-stat-card--scanning .ky-stat-card__icon--teal svg'),
  'MLD teal icon must animate on scan'
);
assert(
  css.includes('.ky-stat-card--scanning .ky-stat-card__icon--red svg'),
  'OHC red icon must animate on scan'
);
assert(
  css.includes('.ky-stat-card--scanning .ky-stat-card__icon--blue svg'),
  'D20 blue icon must animate on scan'
);
assert(
  css.includes('.ky-stat-card--scanning .ky-stat-card__icon--indigo svg'),
  'D26 indigo icon must animate on scan'
);
console.log('  [PASS] Parameter-appropriate icon micro-movements verified (wave, heat, depth)');

// Assert value blur-to-sharp transition (Strictly no count-up)
assert(
  css.includes('@keyframes kyScanValueReveal'),
  '@keyframes kyScanValueReveal must be defined'
);
assert(
  css.includes('blur(') && css.includes('blur(0)'),
  'Value transition must be a blur-to-sharp optical refocus'
);
assert(
  css.includes('.ky-stat-card__val--revealing'),
  '.ky-stat-card__val--revealing class must be defined'
);
console.log('  [PASS] Fast blur-to-sharp value transition keyframes verified');

// Assert prefers-reduced-motion accessibility
assert(
  css.includes('@media (prefers-reduced-motion: reduce)'),
  'prefers-reduced-motion media query must be present'
);
console.log('  [PASS] prefers-reduced-motion accessibility guard in place');

// 2. Check JavaScript Logic in app.js
console.log('\n[TEST 2] JavaScript Stagger and Gating Audit in app.js...');
const appJs = fs.readFileSync('app.js', 'utf8');

assert(appJs.includes('ky-stat-card--scanning'), 'app.js must apply ky-stat-card--scanning');
assert(appJs.includes('ky-stat-card__val--revealing'), 'app.js must apply ky-stat-card__val--revealing');
assert(appJs.includes('staggerDelay = idx * 100'), 'app.js must use 100ms stagger delay (within 80–120ms range)');
assert(appJs.includes('prefers-reduced-motion'), 'app.js must check prefers-reduced-motion');
console.log('  [PASS] app.js contains scan reveal classes, 100ms stagger, and accessibility check');

// 3. Simulated DOM Stagger Sequence Test
console.log('\n[TEST 3] DOM Simulation of Staggered Sequence & Cleanup...');

const createMockCard = (valId) => {
  const cardClasses = new Set();
  const valClasses = new Set();
  const valEl = {
    id: valId,
    textContent: '···',
    title: '',
    classList: {
      add: (c) => valClasses.add(c),
      remove: (c) => valClasses.delete(c),
      contains: (c) => valClasses.has(c)
    }
  };
  const cardEl = {
    classList: {
      add: (c) => cardClasses.add(c),
      remove: (c) => cardClasses.delete(c),
      contains: (c) => cardClasses.has(c)
    },
    offsetWidth: 280,
    querySelector: (sel) => sel === `#${valId}` ? valEl : null
  };
  valEl.closest = () => cardEl;
  return { cardEl, valEl };
};

const mldMock = createMockCard('stat-mld-val');
const ohcMock = createMockCard('stat-ohc-val');
const d20Mock = createMockCard('stat-d20-val');
const d26Mock = createMockCard('stat-d26-val');

const elementsMap = {
  'stat-mld-val': mldMock.valEl,
  'stat-ohc-val': ohcMock.valEl,
  'stat-d20-val': d20Mock.valEl,
  'stat-d26-val': d26Mock.valEl
};
const cardsList = [mldMock.cardEl, ohcMock.cardEl, d20Mock.cardEl, d26Mock.cardEl];

const domMock = {
  getElementById: (id) => elementsMap[id] || null,
  querySelectorAll: (sel) => {
    if (sel === '.ky-stat-row .ky-stat-card') return cardsList;
    return [];
  }
};

const windowMock = {
  matchMedia: (q) => ({ matches: false }),
  _kyStatScanTimeouts: []
};

// Extract updateStatCards block
const startMarker = '/* ── D20 Isotherm Depth Calculation (Linear Interpolation) ── */';
const endMarker = '/* ── Depth-Temperature table renderer ── */';
const codeBlock = appJs.slice(appJs.indexOf(startMarker), appJs.indexOf(endMarker));

const sandbox = new Function(
  'document',
  'window',
  'setTimeout',
  'clearTimeout',
  `
  let DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000];
  ${codeBlock}
  return { updateStatCards };
  `
);

let currentTime = 0;
const scheduledTasks = [];
const mockSetTimeout = (fn, delay) => {
  const task = { fn, runAt: currentTime + delay, id: scheduledTasks.length + 1 };
  scheduledTasks.push(task);
  return task.id;
};
const mockClearTimeout = (id) => {
  const idx = scheduledTasks.findIndex(t => t.id === id);
  if (idx !== -1) scheduledTasks.splice(idx, 1);
};

const { updateStatCards } = sandbox(domMock, windowMock, mockSetTimeout, mockClearTimeout);

const prediction = {
  depths: [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000],
  temps: [28.7, 28.8, 28.7, 28.6, 28.5, 28.2, 27.2, 25.4, 23.1, 21.2, 18.4, 14.9, 12.4, 10.9, 8.7],
  raw_temps: [28.4, 28.6, 28.7, 28.8, 29.0, 28.9, 27.6, 26.7, 23.2, 21.2, 19.0, 14.5, 12.0, 11.2, 9.4]
};

// Trigger update
updateStatCards(prediction);

// Advance time helper
function advanceTimeTo(targetTime) {
  currentTime = targetTime;
  while (true) {
    const nextTaskIdx = scheduledTasks.findIndex(t => t.runAt <= currentTime);
    if (nextTaskIdx === -1) break;
    const [task] = scheduledTasks.splice(nextTaskIdx, 1);
    task.fn();
  }
}

// At t = 0ms: Card 0 (MLD) scan starts immediately
advanceTimeTo(0);
assert(mldMock.cardEl.classList.contains('ky-stat-card--scanning'), 'Card 0 should start scanning at 0ms');
assert(!ohcMock.cardEl.classList.contains('ky-stat-card--scanning'), 'Card 1 should not scan yet at 0ms');

// At t = 100ms: Card 1 (OHC) scan starts
advanceTimeTo(100);
assert(ohcMock.cardEl.classList.contains('ky-stat-card--scanning'), 'Card 1 should start scanning at 100ms');

// At t = 140ms: Card 0 value reveals with blur-to-sharp transition
advanceTimeTo(140);
assert(mldMock.valEl.classList.contains('ky-stat-card__val--revealing'), 'Card 0 value should reveal at 140ms');
assert.strictEqual(mldMock.valEl.textContent, '58 m');

// At t = 200ms: Card 2 (D20) starts scanning
advanceTimeTo(200);
assert(d20Mock.cardEl.classList.contains('ky-stat-card--scanning'), 'Card 2 should start scanning at 200ms');

// At t = 240ms: Card 1 value reveals
advanceTimeTo(240);
assert(ohcMock.valEl.classList.contains('ky-stat-card__val--revealing'), 'Card 1 value should reveal at 240ms');
assert(ohcMock.valEl.textContent.includes('kJ/cm²'));

// At t = 300ms: Card 3 (D26) starts scanning
advanceTimeTo(300);
assert(d26Mock.cardEl.classList.contains('ky-stat-card--scanning'), 'Card 3 should start scanning at 300ms');

// At t = 440ms: Card 3 value reveals
advanceTimeTo(440);
assert(d26Mock.valEl.classList.contains('ky-stat-card__val--revealing'), 'Card 3 value should reveal at 440ms');
assert.strictEqual(d26Mock.valEl.textContent, '92 m');

// At t = 1000ms: All cards have completed scan and cleanly settled to normal static state
advanceTimeTo(1000);
assert(!mldMock.cardEl.classList.contains('ky-stat-card--scanning'), 'Card 0 scan class should be removed');
assert(!ohcMock.cardEl.classList.contains('ky-stat-card--scanning'), 'Card 1 scan class should be removed');
assert(!d20Mock.cardEl.classList.contains('ky-stat-card--scanning'), 'Card 2 scan class should be removed');
assert(!d26Mock.cardEl.classList.contains('ky-stat-card--scanning'), 'Card 3 scan class should be removed');

assert(!mldMock.valEl.classList.contains('ky-stat-card__val--revealing'), 'Card 0 reveal class should be removed');
assert(!ohcMock.valEl.classList.contains('ky-stat-card__val--revealing'), 'Card 1 reveal class should be removed');
assert(!d20Mock.valEl.classList.contains('ky-stat-card__val--revealing'), 'Card 2 reveal class should be removed');
assert(!d26Mock.valEl.classList.contains('ky-stat-card__val--revealing'), 'Card 3 reveal class should be removed');

console.log('  [PASS] Stagger sequence (0ms, 100ms, 200ms, 300ms), reveal timing, and full cleanup verified');

console.log('\n======================================================================');
console.log('  ALL KPI DATA-SCAN REVEAL ANIMATION TESTS PASSED (100% SUCCESS)');
console.log('======================================================================\n');
