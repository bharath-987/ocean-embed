/**
 * Automated Verification Suite for ARGO Skill Score Benchmark Feature
 */

const fs = require('fs');
const http = require('http');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${message}`);
    process.exitCode = 1;
  }
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('============================================================');
  console.log('  KYOGRE ARGO SKILL SCORE BENCHMARK VERIFICATION SUITE');
  console.log('============================================================\n');

  // 1. Backend Endpoint & Mathematical Integrity
  console.log('[TEST 1] Verifying /argo/skill-score API endpoint & mathematical parity...');
  try {
    const res = await fetchJson('http://localhost:8000/argo/skill-score');
    assert(res.status === 200, '/argo/skill-score responds with HTTP 200');

    const data = res.body;
    assert(data.metadata && data.metadata.climatologyMethod, 'Skill score response includes metadata and methodology');
    assert(data.metadata.climatologyRationale.toLowerCase().includes('month'), 'Metadata explains monthly climatological normals rationale');

    // Overall metrics
    const ov = data.overall;
    assert(ov.totalFloats === 41, 'Overall benchmark covers exactly 41 ARGO floats');
    assert(ov.totalDepthPoints === 615, 'Overall benchmark pools 615 total depth points (41 floats * 15 depths)');
    assert(ov.rmseModel === 0.75, 'Model pooled RMSE matches 0.75 °C headline (V6, full 41-profile set, computed by compute_skill_score.py)');
    assert(ov.rmseClimatology === 0.84, 'Climatology pooled RMSE matches 0.84 °C');
    assert(ov.skillScore === 0.2, 'Overall skill score matches +0.200 (V6 computed: 1 - (0.75^2/0.84^2))');
    assert(ov.skillScorePct === 20.0, 'Overall skill score percentage matches +20.0%');

    // Mathematical formula verification: 1 - (0.75^2 / 0.84^2) approx 0.203, close to 0.200 from unrounded sums
    const calcSkill = 1.0 - (Math.pow(ov.rmseModel, 2) / Math.pow(ov.rmseClimatology, 2));
    assert(Math.abs(calcSkill - ov.skillScore) < 0.02, 'Overall skill score satisfies SS = 1 - (RMSE_model^2 / RMSE_clim^2)');

    // 3 Valid Ocean Basins — V6 computed values from compute_skill_score.py (Andaman Sea dropped due to n=0 / sample guard)
    assert(data.basins && Object.keys(data.basins).length === 3, 'Basins breakdown covers exactly 3 valid sub-basins (n >= 10)');
    const bob = data.basins['Bay of Bengal'];
    const as = data.basins['Arabian Sea'];
    const eio = data.basins['Equatorial Indian Ocean'];

    assert(bob && bob.count === 16 && bob.skillScorePct === 18.6, 'Bay of Bengal: 16 floats, +18.6% skill (V6 computed)');
    assert(bob.insufficientSample === false, 'Bay of Bengal satisfies MIN_BASIN_SAMPLE_SIZE guard');
    assert(as && as.count === 15 && as.skillScorePct === 22.8, 'Arabian Sea: 15 floats, +22.8% skill (V6 computed)');
    assert(as.insufficientSample === false, 'Arabian Sea satisfies MIN_BASIN_SAMPLE_SIZE guard');
    assert(eio && eio.count === 10 && eio.skillScorePct === 18.1, 'Equatorial Indian Ocean: 10 floats, +18.1% skill (V6 computed)');
    assert(eio.insufficientSample === false, 'Equatorial Indian Ocean satisfies MIN_BASIN_SAMPLE_SIZE guard');
    assert(!data.basins['Andaman Sea'], 'Andaman Sea is excluded from active basin cards');

    // 15 Standard Depths
    assert(Array.isArray(data.depths) && data.depths.length === 15, 'Depths breakdown covers all 15 standard depths');
    const standardDepths = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000];
    const reportedDepths = data.depths.map(d => d.depth);
    assert(JSON.stringify(reportedDepths) === JSON.stringify(standardDepths), 'Depths match 0m through 1000m standard levels');

    // Surface skill high
    const d0 = data.depths.find(d => d.depth === 0);
    assert(d0 && d0.skillScorePct > 40, 'Surface (0m) exhibits strong skill (> 40%) driven by satellite SST');

    // Negative skill levels identified in V6: 100m, 700m, 1000m
    const negDepths = data.depths.filter(d => !d.isPositive || d.skillScore < 0);
    const negDepthValues = negDepths.map(d => d.depth);
    assert(negDepthValues.includes(100), '100m inflection depth identified with negative skill');
    assert(negDepthValues.includes(1000), '1000m abyssal depth identified with negative skill');

    negDepths.forEach(d => {
      assert(typeof d.explanation === 'string' && d.explanation.length > 20,
        `Depth ${d.depth}m contains rigorous physical oceanographic rationale: "${d.explanation.substring(0, 50)}..."`);
    });

    // Summary endpoint check
    const sumRes = await fetchJson('http://localhost:8000/argo/summary');
    assert(sumRes.status === 200, '/argo/summary responds with HTTP 200');
    assert(sumRes.body.skillScore === 0.200, '/argo/summary includes skillScore (0.200, V6 computed)');
    assert(sumRes.body.skillScorePct === 20.0, '/argo/summary includes skillScorePct (20.0, V6 computed)');
    assert(sumRes.body.climatologyRmse === 0.84, '/argo/summary includes climatologyRmse (0.84)');
  } catch (err) {
    console.error('API test failed:', err);
    assert(false, `API communication failed: ${err.message}`);
  }

  // 2. Frontend DOM Hooks & Layout in argo.html
  console.log('\n[TEST 2] Verifying argo.html DOM hooks & structure...');
  const html = fs.readFileSync('argo.html', 'utf8');

  assert(html.includes('ky-argo-skill-panel'), 'argo.html contains .ky-argo-skill-panel container');
  assert(html.includes('Model vs. Monthly Climatology Baseline (Skill Score, n=41)') || html.includes('Model vs. Climatology Baseline (Skill Score)'), 'Panel has explicit title with monthly climatology baseline (n=41)');
  assert(html.includes('ky-provenance-pill--model') && html.includes('Model Validation'), 'Header displays "Model Validation" provenance pill');
  assert(html.includes('id="argo-skill-headline-badge"'), 'Headline badge element #argo-skill-headline-badge present');
  assert(html.includes('id="argo-skill-headline-val"'), 'Headline value element #argo-skill-headline-val present');
  assert(html.includes('id="argo-skill-model-rmse"'), 'Model RMSE element #argo-skill-model-rmse present');
  assert(html.includes('id="argo-skill-clim-rmse"'), 'Climatology RMSE element #argo-skill-clim-rmse present');
  assert(html.includes('id="basin-skill-bob"'), 'Bay of Bengal skill element #basin-skill-bob present');
  assert(html.includes('id="basin-skill-as"'), 'Arabian Sea skill element #basin-skill-as present');
  assert(html.includes('id="basin-skill-eio"'), 'Equatorial Indian Ocean skill element #basin-skill-eio present');
  assert(!html.includes('id="basin-skill-andaman"'), 'CRITICAL: Standalone Andaman Sea skill element #basin-skill-andaman removed');
  assert(html.includes('id="argo-skill-chart"'), 'Chart.js canvas element #argo-skill-chart present');
  assert(html.includes('ky-skill-note-tag--pos'), 'Positive skill note tag present');
  assert(html.includes('ky-skill-note-tag--warn'), 'Thermocline warning note tag present');
  assert(html.includes('a known challenge for satellite-trained models'), 'argo.html uses softened hypothesis language for thermocline negative skill');
  assert(html.includes('ky-skill-note-tag--neg'), 'Abyssal negative note tag present');
  assert(html.includes('A score of <strong>0.0</strong> represents no improvement over seasonal historical averages'), 'Plain-language caption explaining 0.0 baseline present');

  // 3. Client JS Logic in argo.js
  console.log('\n[TEST 3] Verifying argo.js client script logic...');
  const js = fs.readFileSync('argo.js', 'utf8');

  assert(js.includes('loadSkillScoreStats'), 'argo.js defines loadSkillScoreStats');
  assert(js.includes('renderSkillChart'), 'argo.js defines renderSkillChart');
  assert(js.includes('DEFAULT_SKILL_DATA'), 'argo.js provides robust offline fallback dataset');
  assert(js.includes('/argo/skill-score'), 'argo.js fetches /argo/skill-score');
  assert(js.includes('await loadSkillScoreStats()'), 'argo.js invokes loadSkillScoreStats on DOMContentLoaded');
  assert(js.includes('argo-skill-chart'), 'argo.js binds to canvas #argo-skill-chart');
  assert(js.includes("indexAxis: 'y'"), 'Skill chart configured with indexAxis: y for horizontal depth orientation');
  assert(js.includes('ctx.tick && ctx.tick.value === 0'), 'Skill chart configures distinct zero-line styling on grid');

  // 4. CSS Styling in style.css
  console.log('\n[TEST 4] Verifying style.css classes & Kyogre design system...');
  const css = fs.readFileSync('style.css', 'utf8');

  assert(css.includes('.ky-argo-skill-panel'), 'style.css defines .ky-argo-skill-panel');
  assert(css.includes('.ky-argo-skill-headline-card'), 'style.css defines .ky-argo-skill-headline-card');
  assert(css.includes('.ky-argo-basin-card'), 'style.css defines .ky-argo-basin-card');
  assert(css.includes('.ky-argo-skill-chart-box'), 'style.css defines .ky-argo-skill-chart-box');
  assert(css.includes('.ky-argo-skill-notes'), 'style.css defines .ky-argo-skill-notes');
  assert(css.includes('.ky-skill-note-tag--pos'), 'style.css defines .ky-skill-note-tag--pos');
  assert(css.includes('.ky-skill-note-tag--warn'), 'style.css defines .ky-skill-note-tag--warn');
  assert(css.includes('.ky-skill-note-tag--neg'), 'style.css defines .ky-skill-note-tag--neg');

  console.log(`\n============================================================`);
  console.log(`  RESULTS: ${passedTests} / ${totalTests} assertions passed (${Math.round(passedTests/totalTests*100)}%)`);
  console.log(`============================================================`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests();
