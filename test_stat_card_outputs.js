const fs = require('fs');
const assert = require('assert');

console.log('============================================================');
console.log('  KYOGRE STAT CARDS REGRESSION TEST SUITE (MLD, OHC300, D20)');
console.log('============================================================');

// 1. Setup DOM Mock for updateStatCards (3 cards: MLD, OHC, D20)
const makeElement = () => ({
  textContent: '—',
  title: '',
  style: { display: '' }
});

const domElements = {
  'stat-mld-val': makeElement(),
  'stat-ohc-val': makeElement(),
  'stat-d20-val': makeElement()
};

const documentMock = {
  getElementById: (id) => domElements[id] || null
};

// 2. Load live app.js source to test actual production code
const appJsSource = fs.readFileSync('app.js', 'utf8');

// Source-code assertion: Ensure app.js has completely removed SVAD
assert(
  !appJsSource.includes('computeSVAD'),
  'Source Assertion: app.js must not contain computeSVAD'
);
assert(
  !appJsSource.includes('stat-svad-val'),
  'Source Assertion: app.js must not contain stat-svad-val'
);
console.log('[TEST 1] Static source code audit of app.js passed (SVAD completely removed).');

// Slice the stat cards calculation block from app.js to test real code
const startMarker = '/* ── D20 Isotherm Depth Calculation (Linear Interpolation) ── */';
const endMarker = '/* ── Depth-Temperature table renderer ── */';
const startIdx = appJsSource.indexOf(startMarker);
const endIdx = appJsSource.indexOf(endMarker);
assert(startIdx !== -1 && endIdx !== -1 && endIdx > startIdx, 'Failed to locate stat cards calculation block in app.js');

const codeBlock = appJsSource.slice(startIdx, endIdx);
const DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000];

const sandboxFn = new Function(
  'document',
  'DEPTHS',
  'window',
  `
  ${codeBlock}
  return {
    computeMLD,
    computeD20Isotherm,
    updateStatCards
  };
`
);

const { computeMLD, computeD20Isotherm, updateStatCards } = sandboxFn(documentMock, DEPTHS, {});
assert.strictEqual(typeof computeMLD, 'function', 'computeMLD must be a function');
assert.strictEqual(typeof computeD20Isotherm, 'function', 'computeD20Isotherm must be a function');
assert.strictEqual(typeof updateStatCards, 'function', 'updateStatCards must be a function');
console.log('[TEST 2] Production functions successfully extracted and bound to mock DOM.');

// 3. Regression Test: Central Arabian Sea (15.50°N, 65.00°E) on 2022-07-02
console.log('\n[TEST 3] Central Arabian Sea live profile...');
const casPrediction = {
  depths: DEPTHS,
  temps: [28.74, 28.83, 28.78, 28.64, 28.56, 28.26, 27.26, 25.45, 23.15, 21.28, 18.49, 14.98, 12.43, 10.97, 8.79],
  raw_temps: [28.41, 28.61, 28.76, 28.82, 29.00, 28.96, 27.65, 26.71, 23.27, 21.22, 19.08, 14.58, 12.04, 11.27, 9.42],
  surfaceInputs: { sss: { val: 34.76 } }
};

updateStatCards(casPrediction);
console.log(`  MLD:  ${domElements['stat-mld-val'].textContent}`);
console.log(`  OHC:  ${domElements['stat-ohc-val'].textContent}`);
console.log(`  D20:  ${domElements['stat-d20-val'].textContent}`);

assert.strictEqual(domElements['stat-mld-val'].textContent, '58 m');
assert(domElements['stat-ohc-val'].textContent.includes('kJ/cm²'));
assert.strictEqual(domElements['stat-d20-val'].textContent, '173 m');

console.log('\n============================================================');
console.log('  ALL STAT CARDS REGRESSION TESTS PASSED (100% SUCCESS)');
console.log('============================================================');
