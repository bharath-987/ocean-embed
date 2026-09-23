const fs = require('fs');
const assert = require('assert');

console.log('======================================================================');
console.log('  TESTING SUBTLE PREMIUM DATA-REFRESH ANIMATION SYSTEM');
console.log('======================================================================');

// 1. Audit style.css for Ocean Parameter & TVD Table Keyframes
console.log('\n[TEST 1] CSS Keyframes & Rules Audit for Ocean Parameters & TVD Table...');
const css = fs.readFileSync('style.css', 'utf8');

// Assert .ky-param-tile has overflow: hidden and position: relative
assert(
  css.includes('.ky-param-tile {') && css.includes('position: relative;') && css.includes('overflow: hidden;'),
  '.ky-param-tile must have position: relative and overflow: hidden'
);
console.log('  [PASS] .ky-param-tile has overflow: hidden and position: relative');

// Assert .ky-param-tile::after scan line
assert(
  css.includes('.ky-param-tile::after {'),
  '.ky-param-tile::after pseudo-element must be defined'
);
assert(
  css.includes('.ky-param-tile.ky-param-tile--scanning::after'),
  '.ky-param-tile--scanning must trigger scan sweep'
);
console.log('  [PASS] .ky-param-tile::after scan line sweep defined');

// Assert parameter-specific micro-animation keyframes
assert(css.includes('@keyframes kyParamPulseSST'), 'SST thermometer pulse keyframe must exist');
assert(css.includes('@keyframes kyParamWaveSSH'), 'SSH horizontal wave keyframe must exist');
assert(css.includes('@keyframes kyParamRippleSSS'), 'SSS ripple/dot pulse keyframe must exist');
assert(css.includes('@keyframes kyParamBarSLA'), 'SLA vertical bar movement keyframe must exist');
assert(css.includes('@keyframes kyParamFlowCurrent'), 'Current circular flow keyframe must exist');
assert(css.includes('@keyframes kyParamSweepWind'), 'Wind directional sweep keyframe must exist');
console.log('  [PASS] All 6 parameter-specific icon keyframes verified:');
console.log('    - SST: tiny thermometer pulse (kyParamPulseSST)');
console.log('    - SSH: subtle horizontal wave movement (kyParamWaveSSH)');
console.log('    - SSS: tiny ripple/dot pulse (kyParamRippleSSS)');
console.log('    - SLA: small vertical bar movement (kyParamBarSLA)');
console.log('    - Surface Ocean Current: circular flow motion (kyParamFlowCurrent)');
console.log('    - Surface Winds: short directional sweep (kyParamSweepWind)');

// Assert icon binding selectors
assert(css.includes('.ky-param-tile--scanning[data-param="sst"] .ky-param-tile__icon svg'), 'SST icon selector bound');
assert(css.includes('.ky-param-tile--scanning[data-param="ssh"] .ky-param-tile__icon svg'), 'SSH icon selector bound');
assert(css.includes('.ky-param-tile--scanning[data-param="sss"] .ky-param-tile__icon svg'), 'SSS icon selector bound');
assert(css.includes('.ky-param-tile--scanning[data-param="sla"] .ky-param-tile__icon svg'), 'SLA icon selector bound');
assert(css.includes('.ky-param-tile--scanning[data-param="current"] .ky-param-tile__icon svg'), 'Current icon selector bound');
assert(css.includes('.ky-param-tile--scanning[data-param="wind"] .ky-param-tile__icon svg'), 'Wind icon selector bound');
console.log('  [PASS] All 6 parameter icon selectors cleanly bound to .ky-param-tile--scanning');

// Assert value reveal on parameter cards
assert(css.includes('.ky-param-tile__val--revealing'), '.ky-param-tile__val--revealing class defined');

// Assert TVD table refresh optical transition
assert(css.includes('@keyframes kyTableRefreshFade'), '@keyframes kyTableRefreshFade defined');
assert(css.includes('.ky-tvd-table--refreshing tbody'), '.ky-tvd-table--refreshing tbody selector defined');
console.log('  [PASS] TVD table subtle optical refresh transition verified');

// Assert prefers-reduced-motion covers parameter tiles and TVD table
const reducedMotionMatch = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([^}]+)\}/);
assert(reducedMotionMatch, 'prefers-reduced-motion media query must be present');
const reducedMotionContent = reducedMotionMatch[1];
assert(reducedMotionContent.includes('.ky-param-tile'), 'prefers-reduced-motion must cover .ky-param-tile');
assert(reducedMotionContent.includes('.ky-tvd-table--refreshing'), 'prefers-reduced-motion must cover .ky-tvd-table--refreshing');
console.log('  [PASS] prefers-reduced-motion accessibility covers all new animated components');

// 2. Audit app.js for Coordinated Data Flow & Sequential Parameter Refresh
console.log('\n[TEST 2] JavaScript Coordinated Flow & Stagger Audit in app.js...');
const appJs = fs.readFileSync('app.js', 'utf8');

assert(appJs.includes('ky-param-tile--scanning'), 'app.js must apply ky-param-tile--scanning');
assert(appJs.includes('ky-param-tile__val--revealing'), 'app.js must apply ky-param-tile__val--revealing');
assert(appJs.includes('staggerStep = 75'), 'app.js must stagger parameter cards within 60–100ms (75ms)');
assert(appJs.includes('ky-tvd-table--refreshing'), 'app.js must apply ky-tvd-table--refreshing');

// Check order in renderPrediction
const kpiCallIdx = appJs.indexOf('updateStatCards(prediction);');
const paramsCallIdx = appJs.indexOf('renderSurfaceInputs(prediction.surfaceInputs');
const tableCallIdx = appJs.indexOf('updateDepthTable(prediction.depths');

assert(kpiCallIdx !== -1 && paramsCallIdx !== -1 && tableCallIdx !== -1, 'All refresh functions must be called in renderPrediction');
assert(kpiCallIdx < paramsCallIdx, 'Top KPI cards must be triggered before Ocean Parameters in data flow');
assert(paramsCallIdx < tableCallIdx, 'Ocean Parameters must be triggered before Depth Table in data flow');
console.log('  [PASS] Coordinated data flow sequence verified: KPI cards -> Ocean Parameters -> TVD Table');

// 3. DOM Simulation of Ocean Parameters Sequential Refresh
console.log('\n[TEST 3] DOM Simulation of Ocean Parameters Sequential Refresh...');

const paramIds = ['sst', 'ssh', 'sss', 'sla', 'current', 'wind'];
const tileMocks = {};
const valMocks = {};

paramIds.forEach(param => {
  const tileClasses = new Set();
  const valClasses = new Set();

  const valEl = {
    id: `param-${param}-val`,
    textContent: '—',
    title: '',
    classList: {
      add: (c) => valClasses.add(c),
      remove: (c) => valClasses.delete(c),
      contains: (c) => valClasses.has(c)
    }
  };

  const tileEl = {
    id: `param-${param}`,
    getAttribute: (attr) => attr === 'data-param' ? param : null,
    classList: {
      add: (c) => tileClasses.add(c),
      remove: (c) => tileClasses.delete(c),
      contains: (c) => tileClasses.has(c)
    },
    offsetWidth: 200
  };

  valEl.closest = (sel) => sel === '.ky-param-tile' ? tileEl : null;

  tileMocks[param] = tileEl;
  valMocks[`param-${param}-val`] = valEl;
});

const elementsMap = { ...valMocks };
paramIds.forEach(param => {
  elementsMap[`param-${param}`] = tileMocks[param];
});

const domMock = {
  getElementById: (id) => elementsMap[id] || null,
  querySelectorAll: (sel) => {
    if (sel === '.ky-param-tile') return Object.values(tileMocks);
    return [];
  }
};

const windowMock = {
  matchMedia: (q) => ({ matches: false }),
  _kyParamScanTimeouts: []
};

// Extract renderSurfaceInputs block
const startMarker = 'function renderSurfaceInputs(inputs, options = {}) {';
const endMarker = '/* ── Stat Cards In-Flight Loading State ──────────────────── */';
const fnBlock = appJs.slice(appJs.indexOf(startMarker), appJs.indexOf(endMarker));

const sandbox = new Function(
  'document',
  'window',
  'setTimeout',
  'clearTimeout',
  `
  ${fnBlock}
  return { renderSurfaceInputs };
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

const { renderSurfaceInputs } = sandbox(domMock, windowMock, mockSetTimeout, mockClearTimeout);

function advanceTimeTo(targetTime) {
  currentTime = targetTime;
  while (true) {
    const nextTaskIdx = scheduledTasks.findIndex(t => t.runAt <= currentTime);
    if (nextTaskIdx === -1) break;
    const [task] = scheduledTasks.splice(nextTaskIdx, 1);
    task.fn();
  }
}

const mockInputs = {
  sst: { val: 28.5 },
  ssh: { val: 0.12 },
  sss: { val: 35.1 },
  sla: { val: 0.045 },
  current: { val: 0.42, dir: 140 },
  wind: { val: 5.6, dir: 65, kmh: 20 }
};

// Start sequential update with base delay = 240ms (coordinated data flow)
renderSurfaceInputs(mockInputs, { delay: 240 });

// At t = 0ms: No parameter card scanning yet (waiting for base delay 240ms)
advanceTimeTo(0);
assert(!tileMocks.sst.classList.contains('ky-param-tile--scanning'), 'SST should not scan at 0ms');

// At t = 240ms: SST (Tile 0) starts scanning
advanceTimeTo(240);
assert(tileMocks.sst.classList.contains('ky-param-tile--scanning'), 'SST tile should start scanning at 240ms');
assert(!tileMocks.ssh.classList.contains('ky-param-tile--scanning'), 'SSH tile should not scan at 240ms');

// At t = 315ms (240 + 75): SSH (Tile 1) starts scanning
advanceTimeTo(315);
assert(tileMocks.ssh.classList.contains('ky-param-tile--scanning'), 'SSH tile should start scanning at 315ms');

// At t = 360ms (240 + 120): SST value reveals with blur-to-sharp transition
advanceTimeTo(360);
assert(valMocks['param-sst-val'].classList.contains('ky-param-tile__val--revealing'), 'SST value should reveal at 360ms');
assert.strictEqual(valMocks['param-sst-val'].textContent, '28.5 °C');

// At t = 390ms (315 + 75): SSS (Tile 2) starts scanning
advanceTimeTo(390);
assert(tileMocks.sss.classList.contains('ky-param-tile--scanning'), 'SSS tile should start scanning at 390ms');

// At t = 465ms (390 + 75): SLA (Tile 3) starts scanning
advanceTimeTo(465);
assert(tileMocks.sla.classList.contains('ky-param-tile--scanning'), 'SLA tile should start scanning at 465ms');

// At t = 540ms (465 + 75): Current (Tile 4) starts scanning
advanceTimeTo(540);
assert(tileMocks.current.classList.contains('ky-param-tile--scanning'), 'Current tile should start scanning at 540ms');

// At t = 615ms (540 + 75): Winds (Tile 5) starts scanning
advanceTimeTo(615);
assert(tileMocks.wind.classList.contains('ky-param-tile--scanning'), 'Wind tile should start scanning at 615ms');

// At t = 735ms (615 + 120): Winds value reveals
advanceTimeTo(735);
assert(valMocks['param-wind-val'].classList.contains('ky-param-tile__val--revealing'), 'Wind value should reveal at 735ms');
assert(valMocks['param-wind-val'].textContent.includes('5.6 m/s'));

// At t = 1300ms: All parameter cards have completed scan and cleanly settled to normal static state
advanceTimeTo(1300);
paramIds.forEach(p => {
  assert(!tileMocks[p].classList.contains('ky-param-tile--scanning'), `${p} scan class should be removed`);
  assert(!valMocks[`param-${p}-val`].classList.contains('ky-param-tile__val--revealing'), `${p} reveal class should be removed`);
});
console.log('  [PASS] Stagger sequence (SST -> SSH -> SSS -> SLA -> Current -> Winds at 75ms), reveal timing, and full cleanup verified');

console.log('\n======================================================================');
console.log('  ALL DATA-REFRESH ANIMATION SYSTEM TESTS PASSED (100% SUCCESS)');
console.log('======================================================================\n');
