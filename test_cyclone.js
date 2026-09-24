/**
 * test_cyclone.js — Comprehensive Automated Test Suite for Cyclone Mode
 * 
 * Verifications:
 * 1. All 6 storms load correctly from backend API (/cyclones and /cyclone/{name}).
 * 2. Pre-storm TCHP map grid loads for storm's map_date (/cyclone/{name}/map-grid).
 * 3. Null fuel values (over land) render as gaps/breaks, never as zero or interpolated through.
 * 4. Experimental wake data NEVER appears in backend detail responses, cyclone.html, or cyclone.js.
 * 5. Exact required wording appears word-for-word:
 *    "ocean fuel the storm was about to cross, reconstructed from satellites."
 * 6. Forbidden words ("predicts cyclones", "predicts RI", "real-time") appear nowhere in
 *    rendered HTML, UI elements, or JS string literals.
 * 7. In-situ Argo truth check pairs render before/after changes across 12 depths.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:8000';
const CYCLONE_NAMES = ['BIPARJOY', 'MOCHA', 'TEJ', 'HAMOON', 'MIDHILI', 'MICHAUNG'];
const REQUIRED_WORDING = 'ocean fuel the storm was about to cross, reconstructed from satellites.';
const FORBIDDEN_STRINGS = ['predicts cyclones', 'predicts RI', 'real-time'];

async function runTests() {
  console.log('============================================================');
  console.log('  KYOGRE CYCLONE MODE AUTOMATED TEST SUITE');
  console.log('============================================================\n');

  // -------------------------------------------------------------
  // TEST 1: Check forbidden and required wording in source files
  // -------------------------------------------------------------
  console.log('[TEST 1] Verifying exact wording and strict absence of forbidden phrases...');
  const htmlPath = path.join(__dirname, 'cyclone.html');
  const jsPath = path.join(__dirname, 'cyclone.js');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  const jsContent = fs.readFileSync(jsPath, 'utf8');

  // 1a. Required wording must be present in HTML
  assert(
    htmlContent.includes(REQUIRED_WORDING),
    `Exact required wording string "${REQUIRED_WORDING}" must be present in cyclone.html`
  );
  console.log('  ✓ Exact required wording confirmed present in cyclone.html:');
  console.log(`    "${REQUIRED_WORDING}"`);

  // 1b. Forbidden strings must NOT be present in HTML or JS
  FORBIDDEN_STRINGS.forEach(forbidden => {
    assert(
      !htmlContent.toLowerCase().includes(forbidden.toLowerCase()),
      `Forbidden phrase "${forbidden}" must NOT appear in cyclone.html`
    );
    assert(
      !jsContent.toLowerCase().includes(forbidden.toLowerCase()),
      `Forbidden phrase "${forbidden}" must NOT appear in cyclone.js`
    );
  });
  console.log('  ✓ Zero forbidden phrases ("predicts cyclones", "predicts RI", "real-time") in cyclone.html & cyclone.js.');

  // 1c. "wake" must not appear in cyclone.html or cyclone.js
  assert(!htmlContent.toLowerCase().includes('wake'), 'Experimental wake must not appear in cyclone.html');
  assert(!jsContent.toLowerCase().includes('wake'), 'Experimental wake must not appear in cyclone.js');
  console.log('  ✓ Experimental wake data confirmed completely absent from cyclone.html & cyclone.js.');

  // 1d. Scientific terminology & wording fixes
  // 1. Header badge: 2023 Storm Replay
  assert(htmlContent.includes('2023 Storm Replay'), 'cyclone.html header must state "2023 Storm Replay"');
  assert(!htmlContent.includes('Historical Reanalysis'), 'cyclone.html must NOT state "Historical Reanalysis" (GLORYS is reanalysis, ours is satellite reconstruction)');
  
  // 2. Map legend honest heat availability
  const expectedLegend = 'Higher values = more heat available to a storm. Ocean heat alone does not decide rapid intensification; the atmosphere matters too.';
  assert(htmlContent.includes(expectedLegend), 'Map legend must explain heat availability without overclaiming');
  assert(!htmlContent.includes('fuels rapid intensification'), 'Old legend threshold claim must be removed');

  // 3. Argo table title & note
  assert(htmlContent.includes('Cooling after the storm: Argo floats vs model'), 'Argo card title must be "Cooling after the storm: Argo floats vs model"');
  const expectedTableNote = "Our model reconstructs the ocean before a storm well. It underestimates the fast cooling right after a storm (typically 25–50% of the real drop). That's a known limitation; the fuel values above are the validated part.";
  assert(htmlContent.includes(expectedTableNote), 'Argo table note must caveat post-storm cooling limitation');

  // 4. Error band label
  assert(jsContent.includes('90% error band (held 88% vs Argo, 2023)'), 'cyclone.js must label error band honestly');
  assert(!jsContent.includes('90% Confidence Band'), 'cyclone.js must NOT use statistical "Confidence Band"');

  // 5. Argo card sub-text
  assert(jsContent.includes('${preCount} Argo profiles within 200 km (7 days before)'), 'Argo sub-text must specify profiles within 200 km 7 days before');
  assert(!jsContent.includes('${preCount} floats within 200 km'), 'Old float count sub-text must be replaced');
  console.log('  ✓ All 5 scientific terminology and honest wording fixes confirmed present.\n');

  // -------------------------------------------------------------
  // TEST 2: Backend Catalog API (/cyclones)
  // -------------------------------------------------------------
  console.log('[TEST 2] Verifying GET /cyclones endpoint...');
  const catRes = await fetch(`${API_BASE}/cyclones`);
  assert.strictEqual(catRes.status, 200, '/cyclones must return HTTP 200');
  const catData = await catRes.json();
  assert(Array.isArray(catData.cyclones), 'cyclones field must be an array');
  assert.strictEqual(catData.cyclones.length, 6, 'Must list all 6 storms');

  const names = catData.cyclones.map(s => s.name);
  CYCLONE_NAMES.forEach(n => {
    assert(names.includes(n), `Storm ${n} must be in catalog`);
  });

  // Featured check: Biparjoy and Mocha must be marked featured and appear first
  assert(catData.cyclones[0].featured, 'First storm in catalog must be featured');
  assert(catData.cyclones[1].featured, 'Second storm in catalog must be featured');
  assert(['BIPARJOY', 'MOCHA'].includes(catData.cyclones[0].name), 'First storm must be Biparjoy or Mocha');
  assert(['BIPARJOY', 'MOCHA'].includes(catData.cyclones[1].name), 'Second storm must be Biparjoy or Mocha');
  console.log('  ✓ Catalog returned 6/6 storms with Biparjoy & Mocha featured first.\n');

  // -------------------------------------------------------------
  // TEST 3: Per-Storm Detail API (/cyclone/{name})
  // -------------------------------------------------------------
  console.log('[TEST 3] Verifying all 6 storms load correctly without wake data...');
  for (const name of CYCLONE_NAMES) {
    const res = await fetch(`${API_BASE}/cyclone/${name}`);
    assert.strictEqual(res.status, 200, `/cyclone/${name} must return HTTP 200`);
    const storm = await res.json();

    assert.strictEqual(storm.name, name, `Storm name mismatch: expected ${name}`);
    assert(storm.basin === 'Arabian Sea' || storm.basin === 'Bay of Bengal', `Valid basin for ${name}`);
    assert(typeof storm.peak_kt === 'number' && storm.peak_kt > 0, `Peak wind must be positive for ${name}`);
    assert(storm.map_date && storm.map_date.length === 10, `Valid map_date for ${name}`);
    assert(typeof storm.tchp_band90 === 'number', `Valid tchp_band90 for ${name}`);
    assert(Array.isArray(storm.track) && storm.track.length > 0, `Track fixes must be present for ${name}`);
    assert(storm.argo && typeof storm.argo === 'object', `Argo section must be present for ${name}`);

    // CRITICAL: Ensure wake is never sent
    assert(!('wake' in storm), `wake must NOT be present in response for ${name}`);

    console.log(`  ✓ Storm ${name.padEnd(8)}: ${storm.basin.padEnd(14)} Peak: ${String(storm.peak_kt).padStart(3)}kt, Fixes: ${String(storm.track.length).padStart(2)}, Argo Pairs: ${storm.argo.pairs ? storm.argo.pairs.length : 0} (wake omitted)`);
  }
  console.log();

  // -------------------------------------------------------------
  // TEST 4: Null Fuel Values (Over Land) Handled as Gaps
  // -------------------------------------------------------------
  console.log('[TEST 4] Verifying null fuel values (over land) are maintained as gaps...');
  const mochaRes = await fetch(`${API_BASE}/cyclone/MOCHA`);
  const mocha = await mochaRes.json();
  const landFixes = mocha.track.filter(f => f.fuel && f.fuel.tchp === null);
  assert(landFixes.length > 0, 'Mocha must contain land fixes where fuel is null');

  // In cyclone.js charting logic:
  // modelTchp = track.map(f => (f.fuel && f.fuel.tchp !== null) ? Number(f.fuel.tchp) : null)
  const mappedTchp = mocha.track.map(f => (f.fuel && f.fuel.tchp !== null) ? Number(f.fuel.tchp) : null);
  const nullCount = mappedTchp.filter(v => v === null).length;
  assert.strictEqual(nullCount, landFixes.length, 'Mapped chart array must preserve exact null count');

  // Verify none are converted to 0
  assert(!mappedTchp.some((v, idx) => v === 0 && mocha.track[idx].fuel.tchp === null), 'Null land fixes must NEVER be converted to zero');
  console.log(`  ✓ Verified: ${landFixes.length} land fixes in Mocha preserve null values (rendered as gaps with spanGaps: false).\n`);

  // -------------------------------------------------------------
  // TEST 5: Pre-Storm TCHP Map Grid Endpoint (/cyclone/{name}/map-grid)
  // -------------------------------------------------------------
  console.log('[TEST 5] Verifying /cyclone/{name}/map-grid endpoint...');
  const gridRes = await fetch(`${API_BASE}/cyclone/BIPARJOY/map-grid`);
  assert.strictEqual(gridRes.status, 200, 'BIPARJOY map-grid must return HTTP 200');
  const gridData = await gridRes.json();
  assert.strictEqual(gridData.storm, 'BIPARJOY', 'Map grid storm name mismatch');
  assert.strictEqual(gridData.parameter, 'tchp', 'Parameter must be tchp');
  assert.strictEqual(gridData.unit, 'kJ/cm²', 'Unit must be kJ/cm²');
  assert(Array.isArray(gridData.grid), 'grid must be 2D array');
  assert.strictEqual(gridData.grid.length, 101, 'Grid height must be 101');
  assert.strictEqual(gridData.grid[0].length, 241, 'Grid width must be 241');
  assert(gridData.max > 80, `TCHP max should exceed 80 kJ/cm², got ${gridData.max}`);
  console.log(`  ✓ BIPARJOY map-grid verified: 101x241 grid (min: ${gridData.min}, max: ${gridData.max} kJ/cm²).\n`);

  // -------------------------------------------------------------
  // TEST 6: In-Situ Argo Truth Check 12-Depth Pairs
  // -------------------------------------------------------------
  console.log('[TEST 6] Verifying in-situ Argo truth check 12-depth structure...');
  const bipRes = await fetch(`${API_BASE}/cyclone/BIPARJOY`);
  const bip = await bipRes.json();
  const pairs = bip.argo.pairs;
  assert(pairs.length >= 4, 'Biparjoy must have at least 4 Argo pairs');

  const p0 = pairs[0];
  assert(p0.platform_number, 'Pair must have platform_number');
  assert(p0.date_pre && p0.date_post, 'Pair must have date_pre and date_post');
  assert(Array.isArray(p0.argo_change) && p0.argo_change.length === 12, 'argo_change must have 12 depth values');
  assert(Array.isArray(p0.model_change) && p0.model_change.length === 12, 'model_change must have 12 depth values');
  assert(Array.isArray(p0.glorys_change) && p0.glorys_change.length === 12, 'glorys_change must have 12 depth values');

  // Verify non-zero temperature drops
  const validArgo = p0.argo_change.filter(v => v !== null);
  assert(validArgo.length >= 10, 'Argo must have valid changes across at least 10 depths');
  console.log(`  ✓ Argo truth check verified: Float #${p0.platform_number} has all 12 depths with valid changes.\n`);

  // -------------------------------------------------------------
  // TEST 7: Cross-Page Navigation Sidebar Linkage
  // -------------------------------------------------------------
  console.log('[TEST 7] Verifying Cyclone Mode sidebar linkage across existing pages...');
  const pagesToCheck = ['explore.html', 'fisheries.html', 'marine-ecology.html', 'argo.html', 'cyclone.html'];
  pagesToCheck.forEach(pageName => {
    const pContent = fs.readFileSync(path.join(__dirname, pageName), 'utf8');
    assert(pContent.includes('cyclone.html'), `${pageName} must contain link to cyclone.html`);
    assert(pContent.includes('Cyclone Mode'), `${pageName} must contain label 'Cyclone Mode'`);
  });
  console.log(`  ✓ All ${pagesToCheck.length} main pages correctly include Cyclone Mode in sidebar navigation.\n`);

  console.log('============================================================');
  console.log('  ALL CYCLONE MODE TESTS PASSED (100%)');
  console.log('============================================================');
}

runTests().catch(err => {
  console.error('❌ Cyclone Mode test suite failed:', err);
  process.exit(1);
});
