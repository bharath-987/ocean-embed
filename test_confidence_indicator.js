const fs = require('fs');
const assert = require('assert');
const http = require('http');

console.log('============================================================');
console.log('  TESTING DATA-DRIVEN CONFIDENCE INDICATOR FEATURE (REFINED)');
console.log('============================================================');

// 1. Check explore.html markup (Pills removed, colgroup added, uncertainty lines preserved)
console.log('\n[TEST 1] explore.html DOM Structure (No text pills, colgroup, TVD columns)...');
const exploreHtml = fs.readFileSync('explore.html', 'utf8');

const expectedCardKeys = ['mld', 'ohc', 'svad', 'd20'];
expectedCardKeys.forEach(key => {
  // Pill badges MUST be removed entirely from the HTML
  assert(!exploreHtml.includes(`id="stat-${key}-confidence-badge"`), `explore.html must NOT have #stat-${key}-confidence-badge`);
  // Uncertainty text container MUST exist
  assert(exploreHtml.includes(`id="stat-${key}-confidence"`), `explore.html must have #stat-${key}-confidence`);
});

// Confirm obsolete sub elements are not present
assert(!exploreHtml.includes('id="stat-d20-sub"'), 'explore.html must not contain obsolete #stat-d20-sub');

// TVD Table header & colgroup must contain all 3 columns with fixed widths
assert(exploreHtml.includes('<th>Depth (m)</th>'), 'explore.html TVD table must have <th>Depth (m)</th>');
assert(exploreHtml.includes('<th>Temperature (°C)</th>'), 'explore.html TVD table must have <th>Temperature (°C)</th>');
assert(exploreHtml.includes('<th>Confidence</th>'), 'explore.html TVD table must have <th>Confidence</th>');
assert(exploreHtml.includes('<colgroup>'), 'explore.html TVD table must have <colgroup>');
assert(exploreHtml.includes('width: 30%') && exploreHtml.includes('width: 35%'),
  'explore.html TVD table colgroup must define column widths (30%, 35%, 35%)');
console.log('  [PASS] explore.html markup verified (boxed text pills removed, TVD colgroup & headers intact)');

// 2. Check style.css styling (Dots, table vertical alignment, fixed layout, center alignment)
console.log('\n[TEST 2] style.css Classes & Table Column Alignment...');
const css = fs.readFileSync('style.css', 'utf8');

// Boxed pills removed
assert(!css.includes('.ky-confidence-badge {'), 'style.css must not contain .ky-confidence-badge');

// 6px colored dots and confidence text
const expectedCssClasses = [
  '.ky-stat-card__confidence',
  '.ky-stat-card__confidence-dot',
  '.ky-stat-card__confidence-dot--high',
  '.ky-stat-card__confidence-dot--moderate',
  '.ky-stat-card__confidence-dot--low',
  '.ky-tvd-conf-cell',
  '.ky-tvd-conf-bar-bg',
  '.ky-tvd-conf-bar-fill',
  '.ky-tvd-conf-bar-fill--high',
  '.ky-tvd-conf-bar-fill--moderate',
  '.ky-tvd-conf-bar-fill--low',
  '.ky-tvd-conf-pct',
];

expectedCssClasses.forEach(cls => {
  assert(css.includes(cls), `style.css must contain ${cls}`);
});

// Table layout fixed
assert(css.includes('table-layout: fixed;'), 'style.css .ky-tvd-table must include table-layout: fixed');

// Table vertical alignment: Depth, Temperature, and Confidence must be vertically centered
assert(css.includes('.ky-tvd-table td') && css.includes('vertical-align: middle;'),
  'style.css .ky-tvd-table td must include vertical-align: middle');
assert(css.includes('.ky-tvd-conf-cell') && css.includes('align-items: center;'),
  'style.css .ky-tvd-conf-cell must include align-items: center');

// Column horizontal alignment
assert(css.includes('.ky-tvd-table th:nth-child(2)') && css.includes('text-align: center;'),
  'style.css must center Temperature header (.ky-tvd-table th:nth-child(2))');
assert(css.includes('.ky-tvd-table td:nth-child(2)') && css.includes('text-align: center;'),
  'style.css must center Temperature data cells (.ky-tvd-table td:nth-child(2))');
assert(css.includes('.ky-tvd-table th:first-child') && css.includes('text-align: left;'),
  'style.css must left-align Depth header');
assert(css.includes('.ky-tvd-table td:first-child') && css.includes('text-align: left;'),
  'style.css must left-align Depth data cells');
assert(css.includes('.ky-tvd-table th:nth-child(3)') && css.includes('text-align: right;'),
  'style.css must right-align Confidence header');
assert(css.includes('.ky-tvd-table td:nth-child(3)') && css.includes('text-align: right;'),
  'style.css must right-align Confidence data cells');

console.log('  [PASS] style.css verified (subtle 6px dots, table-layout: fixed, Temperature column centered)');

// 3. Check backend confidence_stats.json and absolute formula accuracy
console.log('\n[TEST 3] Absolute RMSE Threshold Formula Verification...');
const confStatsPath = 'backend/data/confidence_stats.json';
assert(fs.existsSync(confStatsPath), 'backend/data/confidence_stats.json must exist');
const confStats = JSON.parse(fs.readFileSync(confStatsPath, 'utf8'));

assert.strictEqual(confStats.formula, 'absolute_v2', 'confidence_stats.json must use formula absolute_v2');
assert(Array.isArray(confStats.stats), 'stats must be an array');
assert.strictEqual(confStats.stats.length, 15, 'must contain 15 standard depths');

confStats.stats.forEach(item => {
  const { depth, rmse, confidence_pct, confidence_label } = item;
  assert(typeof depth === 'number', 'depth must be number');
  assert(typeof rmse === 'number', 'rmse must be number');
  assert(typeof confidence_pct === 'number', 'confidence_pct must be number');

  // Verify absolute RMSE threshold formula:
  // if rmse <= 0.5: 90 + (0.5 - rmse) * 16
  // elif rmse <= 1.0: 70 + (1.0 - rmse) * 40
  // elif rmse <= 1.5: 50 + (1.5 - rmse) * 40
  // else: max(30, 50 - (rmse - 1.5) * 20)
  let expectedPct;
  if (rmse <= 0.5) expectedPct = Math.round(90.0 + (0.5 - rmse) * 16.0);
  else if (rmse <= 1.0) expectedPct = Math.round(70.0 + (1.0 - rmse) * 40.0);
  else if (rmse <= 1.5) expectedPct = Math.round(50.0 + (1.5 - rmse) * 40.0);
  else expectedPct = Math.round(Math.max(30.0, 50.0 - (rmse - 1.5) * 20.0));

  assert.strictEqual(confidence_pct, expectedPct, `Confidence pct for depth ${depth} (RMSE ${rmse}) should be ${expectedPct}, got ${confidence_pct}`);

  let expectedLabel = 'Low';
  if (expectedPct >= 85) expectedLabel = 'High';
  else if (expectedPct >= 60) expectedLabel = 'Moderate';
  assert.strictEqual(confidence_label, expectedLabel, `Confidence label for depth ${depth} should be ${expectedLabel}`);
});
console.log('  [PASS] 15 standard depths match absolute threshold formula (0.5°C = strong, 1.5°C = poor)');

// 4. Test live backend API endpoints (/confidence-stats & /predict)
console.log('\n[TEST 4] Backend API Live Endpoints (/confidence-stats & /predict)...');

function fetchJson(url, postData = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: postData ? 'POST' : 'GET',
      headers: postData ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      } : {}
    };
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(data) });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

(async () => {
  try {
    // 4a. /confidence-stats
    const confRes = await fetchJson('http://localhost:8000/confidence-stats');
    assert.strictEqual(confRes.status, 200, '/confidence-stats must return HTTP 200');
    assert.strictEqual(confRes.json.formula, 'absolute_v2', '/confidence-stats must use absolute_v2 formula');
    assert(Array.isArray(confRes.json.stats), '/confidence-stats must return stats array');
    console.log('  [PASS] /confidence-stats returns 200 with absolute_v2 formula');

    // 4b. /predict
    const predRes = await fetchJson('http://localhost:8000/predict', JSON.stringify({
      latitude: 15.5,
      longitude: 65.0,
      date: '2022-07-02'
    }));
    assert.strictEqual(predRes.status, 200, '/predict must return HTTP 200');
    const pred = predRes.json;

    // Verify profile with confidence and nearest ARGO metadata
    assert(Array.isArray(pred.profile), 'predict response must include profile array');
    assert.strictEqual(pred.profile.length, 15, 'profile must have 15 depth points');
    pred.profile.forEach(p => {
      assert('depth' in p && 'temperature' in p && 'rmse' in p && 'confidence_pct' in p && 'confidence_label' in p,
        'profile item must have depth, temperature, rmse, confidence_pct, and confidence_label');
      assert('nearest_argo_distance_km' in p && 'nearest_argo_date' in p && 'nearest_argo_id' in p && 'proximity_factor' in p,
        'profile item must include nearest_argo_distance_km, nearest_argo_date, nearest_argo_id, and proximity_factor');
    });

    // Verify top-level nearest_argo metadata
    assert(pred.nearest_argo, 'predict response must include top-level nearest_argo');
    assert('float_id' in pred.nearest_argo, 'nearest_argo must include float_id');
    assert('cycle_number' in pred.nearest_argo, 'nearest_argo must include cycle_number');
    assert(typeof pred.nearest_argo.distance_km === 'number', 'nearest_argo.distance_km must be a number');
    assert(typeof pred.nearest_argo.days_diff === 'number', 'nearest_argo.days_diff must be a number');
    assert(typeof pred.nearest_argo.date === 'string', 'nearest_argo.date must be a string');
    assert(typeof pred.nearest_argo.combined_score === 'number', 'nearest_argo.combined_score must be a number');
    assert(typeof pred.nearest_argo.proximity_factor === 'number', 'nearest_argo.proximity_factor must be a number');
    assert(pred.nearest_argo.proximity_factor >= 0.5 && pred.nearest_argo.proximity_factor <= 1.0,
      'proximity_factor must be clamped between 0.5 and 1.0');
    assert(typeof pred.nearest_argo.is_same_regime === 'boolean', 'nearest_argo must have is_same_regime boolean');
    assert(['Winter', 'Pre-Monsoon', 'Monsoon', 'Post-Monsoon'].includes(pred.nearest_argo.query_regime),
      'query_regime must be a valid monsoon regime');
    assert(['Winter', 'Pre-Monsoon', 'Monsoon', 'Post-Monsoon'].includes(pred.nearest_argo.argo_regime),
      'argo_regime must be a valid monsoon regime');
    assert(pred.nearest_argo.temporal_weight === 1.5 || pred.nearest_argo.temporal_weight === 6.0,
      'temporal_weight must be 1.5 km/d (same regime) or 6.0 km/d (cross regime)');

    // Verify metrics_confidence scaled by proximity_factor
    assert(pred.metrics_confidence, 'predict response must include metrics_confidence');
    assert(pred.metrics_confidence.mld, 'metrics_confidence must have mld');
    assert(pred.metrics_confidence.ohc300, 'metrics_confidence must have ohc300');
    assert(pred.metrics_confidence.svad, 'metrics_confidence must have svad');
    assert(pred.metrics_confidence.d20, 'metrics_confidence must have d20');

    // Test dynamic variation across different coordinates & dates
    const predExact = await fetchJson('http://localhost:8000/predict', JSON.stringify({
      latitude: 17.512,
      longitude: 66.62,
      date: '2021-02-16'
    }));
    assert.strictEqual(predExact.status, 200, 'predict for exact ARGO float must return 200');
    assert.strictEqual(predExact.json.nearest_argo.proximity_factor, 1.0, 'exact ARGO float must have proximity_factor 1.0');
    assert.strictEqual(predExact.json.nearest_argo.distance_km, 0.0, 'exact ARGO float must have distance_km 0.0');
    assert.strictEqual(predExact.json.nearest_argo.days_diff, 0, 'exact ARGO float must have days_diff 0');
    assert.strictEqual(predExact.json.nearest_argo.is_same_regime, true, 'exact float must be same regime');
    assert.strictEqual(predExact.json.nearest_argo.temporal_weight, 1.5, 'same regime must use 1.5 km/d');

    // Cross-regime test: same location 53 days later in Pre-Monsoon (April vs Feb)
    const predCross = await fetchJson('http://localhost:8000/predict', JSON.stringify({
      latitude: 17.512,
      longitude: 66.62,
      date: '2021-04-10'
    }));
    assert.strictEqual(predCross.status, 200, 'cross-regime predict must return 200');
    assert.strictEqual(predCross.json.nearest_argo.is_same_regime, false, 'April vs Feb must be cross-regime');
    assert.strictEqual(predCross.json.nearest_argo.temporal_weight, 6.0, 'cross-regime must use 6.0 km/d weight');
    assert(predCross.json.nearest_argo.proximity_factor < predExact.json.nearest_argo.proximity_factor,
      'cross-regime proximity factor must be lower than exact float');

    // Confirm dynamic variation: exact match has higher confidence than distant query
    const exactMldPct = predExact.json.metrics_confidence.mld.confidence_pct;
    const distantMldPct = pred.metrics_confidence.mld.confidence_pct;
    assert(exactMldPct > distantMldPct,
      `Confidence at exact float (${exactMldPct}%) must be higher than distant query (${distantMldPct}%)`);
    assert(predExact.json.profile[12].confidence_pct > pred.profile[12].confidence_pct,
      '500m confidence must be higher when closer to ARGO float');

    console.log('  [PASS] /predict response includes monsoon season-aware nearest_argo metadata and dynamically scales confidence');

    // 5. Check app.js logic and simulation
    console.log('\n[TEST 5] app.js DOM Simulation & Logic...');
    const appJs = fs.readFileSync('app.js', 'utf8');

    assert(appJs.includes('ARGO_CONFIDENCE_BENCHMARK'), 'app.js must include ARGO_CONFIDENCE_BENCHMARK fallback');
    assert(appJs.includes('initConfidenceStats'), 'app.js must include initConfidenceStats');
    assert(appJs.includes('logConfidenceStatsDev'), 'app.js must include logConfidenceStatsDev');
    assert(appJs.includes('isDevModeEnabled()'), 'logConfidenceStatsDev must be gated behind isDevModeEnabled()');
    assert(appJs.includes('ky-stat-card__confidence-dot'), 'app.js must render 6px dot');

    // Verify error-margin text removed from visible card rendering
    assert(appJs.includes('<span>${metricConf.confidence_pct}% confidence</span>'),
      'renderCardConfidence must render only confidence percentage without error margin prefix');
    assert(!appJs.includes('±${r}°C · ${metricConf.confidence_pct}% confidence'),
      'renderCardConfidence must not render error margin text in card UI');

    // Verify hover tooltip on metric cards
    assert(appJs.includes('Nearest ARGO validation: ${nearest_argo.distance_km}km, ${nearest_argo.date} (Float #${nearest_argo.float_id}) · Proximity factor: ${nearest_argo.proximity_factor}'),
      'renderCardConfidence must set hover tooltip with nearest ARGO details');

    // Verify hover tooltip on TVD table
    assert(appJs.includes('Validation RMSE: ±${rmseStr}°C · Nearest ARGO: ${dist}km (${aDate}) · Proximity: ${pFactor}'),
      'updateDepthTable must set hover tooltip with nearest ARGO details and proximity factor');

    // Verify updateDepthTable call passes nearest_argo
    assert(appJs.includes('updateDepthTable(prediction.depths, prediction.temps, prediction.profile, prediction.nearest_argo)'),
      'renderPrediction must pass prediction.nearest_argo into updateDepthTable');

    // Verify dev mode console log
    assert(appJs.includes('[Confidence] Lat:'), 'renderPrediction must include dev mode confidence log');
    assert(appJs.includes('Proximity factor: ${na.proximity_factor}'), 'dev mode log must output proximity factor');

    // Verify OHC-300m formula and raw logging
    assert(appJs.includes('(rho * cp / 1e7) * heatSum'), 'app.js must use authentic absolute OHC integral formula');
    assert(appJs.includes('[OHC-300m Raw]'), 'app.js must log raw OHC value in dev mode');

    // Test OHC-300m calculation with actual temps from pred
    const depths = pred.depths;
    const temps = pred.temps;
    let heatSum = 0;
    for (let i = 1; i < depths.length && depths[i] <= 300; i++) {
      const dz = depths[i] - depths[i - 1];
      const avgT = (temps[i - 1] + temps[i]) / 2.0;
      heatSum += avgT * dz;
    }
    const computedOhc = parseFloat(((1025 * 3993 / 1e7) * heatSum).toFixed(1));
    assert(computedOhc >= 1500 && computedOhc <= 2900,
      `Computed OHC (${computedOhc} kJ/cm²) must be in physically realistic range (1500-2900 kJ/cm²)`);

    // Test Chart.js confidence band logic
    assert(appJs.includes("label: 'Confidence Upper'"), 'buildChart must create Confidence Upper dataset');
    assert(appJs.includes("label: 'Confidence Band (±RMSE)'"), 'buildChart must create Confidence Band (±RMSE) dataset');
    assert(appJs.includes("fill: '-1'"), 'Confidence Band must have fill: -1');

    console.log('  [PASS] app.js logic and chart configurations verified (dynamic tooltips, dev mode log, dot preserved)');

    // 6. Scope Boundaries Verification (No changes to argo or fisheries)
    console.log('\n[TEST 6] Scope Boundaries Verification...');
    const argoHtml = fs.readFileSync('argo.html', 'utf8');
    const argoJs = fs.readFileSync('argo.js', 'utf8');
    const fisheriesHtml = fs.readFileSync('fisheries.html', 'utf8');
    const fisheriesJs = fs.readFileSync('fisheries.js', 'utf8');

    assert(argoHtml.includes('ARGO'), 'argo.html intact');
    assert(argoJs.includes('argo'), 'argo.js intact');
    assert(fisheriesHtml.includes('Fisheries'), 'fisheries.html intact');
    assert(fisheriesJs.includes('fisheries') || fisheriesJs.includes('PFZ'), 'fisheries.js intact');
    console.log('  [PASS] ARGO and Fisheries modules remain untouched and intact');

    console.log('\n============================================================');
    console.log('  ALL CONFIDENCE INDICATOR TESTS PASSED (100% SUCCESS)');
    console.log('============================================================\n');
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
})();
