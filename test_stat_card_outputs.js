const fs = require('fs');
const assert = require('assert');

console.log('============================================================');
console.log('  KYOGRE SVAD & STAT CARDS REGRESSION TEST SUITE');
console.log('============================================================');

// 1. Setup DOM Mock for updateStatCards
const makeElement = () => ({
  textContent: '—',
  title: '',
  style: { display: '' }
});

const domElements = {
  'stat-mld-val': makeElement(),
  'stat-ohc-val': makeElement(),
  'stat-svad-val': makeElement(),
  'stat-svad-sub': makeElement(),
  'stat-d20-val': makeElement()
};

const documentMock = {
  getElementById: (id) => domElements[id] || null
};

// 2. Load live app.js source to test actual production code
const appJsSource = fs.readFileSync('app.js', 'utf8');

// Source-code assertion: Ensure app.js specifically assigns svadTemps from raw_temps
assert(
  appJsSource.includes('const svadTemps = (raw_temps && raw_temps.length) ? raw_temps : temps;'),
  'Source Assertion: app.js must explicitly define svadTemps with raw_temps priority'
);
assert(
  !appJsSource.includes('const svadTemps = temps;'),
  'Source Assertion: app.js must not directly assign svadTemps = temps'
);
console.log('[TEST 1] Static source code audit of app.js passed.');

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
    computeSVAD,
    updateStatCards
  };
`
);

const { computeMLD, computeD20Isotherm, computeSVAD, updateStatCards } = sandboxFn(documentMock, DEPTHS, {});
assert.strictEqual(typeof computeSVAD, 'function', 'computeSVAD must be exported/available as a function');
assert.strictEqual(typeof updateStatCards, 'function', 'updateStatCards must be a function');
console.log('[TEST 2] Production functions successfully extracted and bound to mock DOM.');

// 3. Regression Test: Central Arabian Sea (15.50°N, 65.00°E) on 2022-07-02
console.log('\n[TEST 3] Central Arabian Sea live profile (raw_temps vs temps)...');
const casPrediction = {
  depths: DEPTHS,
  temps: [28.74, 28.83, 28.78, 28.64, 28.56, 28.26, 27.26, 25.45, 23.15, 21.28, 18.49, 14.98, 12.43, 10.97, 8.79],
  raw_temps: [28.41, 28.61, 28.76, 28.82, 29.00, 28.96, 27.65, 26.71, 23.27, 21.22, 19.08, 14.58, 12.04, 11.27, 9.42],
  surfaceInputs: { sss: { val: 34.76 } }
};

// Direct computeSVAD checks
const svadFromTemps = computeSVAD(casPrediction.depths, casPrediction.temps, casPrediction.surfaceInputs);
const svadFromRawTemps = computeSVAD(casPrediction.depths, casPrediction.raw_temps, casPrediction.surfaceInputs);

console.log(`  computeSVAD(depths, temps):     ${svadFromTemps} m (bias-corrected artifact bump at 5m)`);
console.log(`  computeSVAD(depths, raw_temps): ${svadFromRawTemps} m (physical mixed-layer sonic layer depth)`);

assert.strictEqual(svadFromTemps, 5, 'temps must yield 5m due to the bias bump');
assert.strictEqual(svadFromRawTemps, 50, 'raw_temps must yield 50m');

// Run updateStatCards and assert it uses raw_temps
updateStatCards(casPrediction);
console.log(`  updateStatCards result DOM:     ${domElements['stat-svad-val'].textContent}`);

assert.strictEqual(
  domElements['stat-svad-val'].textContent,
  '50 m',
  'Regression Error: updateStatCards must evaluate SVAD using raw_temps (50 m)'
);
assert.notStrictEqual(
  domElements['stat-svad-val'].textContent,
  '5 m',
  'Regression Error: updateStatCards must NOT evaluate SVAD from bias-corrected temps (5 m artifact)'
);
console.log('  [PASS] Central Arabian Sea SVAD correctly evaluates to 50m from raw_temps');

// 4. Adversarial Regression Test: Synthetic profile with diametrically opposing peaks
console.log('\n[TEST 4] Adversarial Profile with opposing peaks in temps vs raw_temps...');
// temps has its absolute peak at 0m (32.0°C) and monotonically drops (SVAD = 0m).
// raw_temps has a cooler surface (25.0°C) and a sharp subsurface peak at 75m (31.0°C) (SVAD = 75m).
const adversarialPrediction = {
  depths: DEPTHS,
  temps: [32.0, 31.0, 30.0, 29.0, 28.0, 26.0, 24.0, 22.0, 20.0, 18.0, 15.0, 12.0, 10.0, 8.0, 6.0],
  raw_temps: [25.0, 25.0, 25.0, 25.0, 25.0, 25.0, 31.0, 22.0, 20.0, 18.0, 15.0, 12.0, 10.0, 8.0, 6.0],
  surfaceInputs: { sss: { val: 35.0 } }
};

const advTempsSvad = computeSVAD(adversarialPrediction.depths, adversarialPrediction.temps, adversarialPrediction.surfaceInputs);
const advRawSvad = computeSVAD(adversarialPrediction.depths, adversarialPrediction.raw_temps, adversarialPrediction.surfaceInputs);

assert.strictEqual(advTempsSvad, 0, 'Adversarial temps must peak at 0m');
assert.strictEqual(advRawSvad, 75, 'Adversarial raw_temps must peak at 75m');

updateStatCards(adversarialPrediction);
console.log(`  Adversarial updateStatCards DOM: ${domElements['stat-svad-val'].textContent}`);

assert.strictEqual(
  domElements['stat-svad-val'].textContent,
  '75 m',
  'Regression Assertion: updateStatCards MUST use raw_temps (75m). If this failed, SVAD was reverted to temps!'
);
assert.notStrictEqual(
  domElements['stat-svad-val'].textContent,
  '0 m',
  'Regression Assertion: updateStatCards must not use temps (0m)'
);
console.log('  [PASS] Adversarial test confirmed: SVAD strictly couples to raw_temps');

// 5. Fallback Test: When raw_temps is absent/empty, safely falls back to temps
console.log('\n[TEST 5] Fallback when raw_temps is null or empty...');
const fallbackPrediction = {
  depths: DEPTHS,
  temps: [32.0, 31.0, 30.0, 29.0, 28.0, 26.0, 24.0, 22.0, 20.0, 18.0, 15.0, 12.0, 10.0, 8.0, 6.0],
  raw_temps: null,
  surfaceInputs: { sss: { val: 35.0 } }
};

updateStatCards(fallbackPrediction);
assert.strictEqual(
  domElements['stat-svad-val'].textContent,
  '0 m',
  'Fallback: When raw_temps is null, updateStatCards safely falls back to temps'
);
console.log('  [PASS] Fallback to temps verified when raw_temps is null');

// 6. Multi-Profile Coverage Suite (All 4 Profiles)
console.log('\n[TEST 6] Multi-Profile Parity Suite across 4 distinct regimes...');
const suiteProfiles = [
  {
    name: 'Deep Open-Ocean (Central Arabian Sea 15.5N, 65.0E)',
    prediction: casPrediction,
    expectedSvad: 50,
    expectedMld: 58,
    expectedD20: 173
  },
  {
    name: 'Mid-Depth Shelf Sea (Persian Gulf 28.13N, 50.45E, seafloor 50m)',
    prediction: {
      depths: DEPTHS,
      temps: [31.00, 30.73, 30.22, 27.60, 24.02, 21.38, null, null, null, null, null, null, null, null, null],
      raw_temps: [31.02, 30.66, 30.20, 27.71, 24.22, 21.88, null, null, null, null, null, null, null, null, null],
      surfaceInputs: { sss: { val: 34.88 } }
    },
    expectedSvad: 0,
    expectedMld: 11,
    expectedD20: null
  },
  {
    name: 'Shallow Shelf (Sundarbans Delta 20.90N, 87.20E, seafloor 20m)',
    prediction: {
      depths: DEPTHS,
      temps: [30.03, 30.13, 30.08, 29.91, null, null, null, null, null, null, null, null, null, null, null],
      raw_temps: [30.01, 30.03, 30.12, 30.03, null, null, null, null, null, null, null, null, null, null, null],
      surfaceInputs: { sss: { val: 35.66 } }
    },
    expectedSvad: 10,
    expectedMld: null,
    expectedD20: null
  },
  {
    name: 'Synthetic Subsurface Warm Core (peaks at 30m)',
    prediction: {
      depths: DEPTHS,
      temps: [26.00, 26.50, 27.00, 28.50, 29.00, 26.00, 23.00, 20.00, 18.00, 15.00, 12.00, 10.00, 8.00, 6.00, 5.00],
      raw_temps: [26.00, 26.50, 27.00, 28.50, 29.00, 26.00, 23.00, 20.00, 18.00, 15.00, 12.00, 10.00, 8.00, 6.00, 5.00],
      surfaceInputs: { sss: { val: 35.0 } }
    },
    expectedSvad: 30,
    expectedMld: 45,
    expectedD20: 100
  }
];

suiteProfiles.forEach((item, idx) => {
  updateStatCards(item.prediction);
  const svadText = domElements['stat-svad-val'].textContent;
  const mldText = domElements['stat-mld-val'].textContent;
  const d20Text = domElements['stat-d20-val'].textContent;

  console.log(`  Profile ${idx + 1} (${item.name}):`);
  console.log(`    SVAD: ${svadText} (expected ${item.expectedSvad} m)`);
  console.log(`    MLD:  ${mldText} (expected ${item.expectedMld !== null ? item.expectedMld + ' m' : '—'})`);
  console.log(`    D20:  ${d20Text} (expected ${item.expectedD20 !== null ? item.expectedD20 + ' m' : 'N/A — 20°C not reached in profile'})`);

  assert.strictEqual(svadText, `${item.expectedSvad} m`, `SVAD mismatch for ${item.name}`);
  if (item.expectedMld !== null) {
    assert.strictEqual(mldText, `${item.expectedMld} m`, `MLD mismatch for ${item.name}`);
  } else {
    assert.strictEqual(mldText, '—', `MLD must be em-dash for ${item.name}`);
  }
  if (item.expectedD20 !== null) {
    assert.strictEqual(d20Text, `${item.expectedD20} m`, `D20 mismatch for ${item.name}`);
  } else {
    assert(d20Text.includes('N/A'), `D20 must show N/A for ${item.name}`);
  }
});

console.log('\n============================================================');
console.log('  ALL SVAD REGRESSION TESTS PASSED (100% SUCCESS)');
console.log('============================================================');
