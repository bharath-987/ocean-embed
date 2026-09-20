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
    assert(ov.totalFloats === 81, `Overall benchmark covers exactly 81 ARGO floats (got ${ov.totalFloats})`);
    assert(ov.totalDepthPoints === 24185, `Overall benchmark pools 24,185 depth points (got ${ov.totalDepthPoints})`);
    assert(ov.rmseRaw === 1.002, `Raw pooled RMSE matches 1.002 °C (got ${ov.rmseRaw})`);
    assert(ov.rmseCorrected === 0.901, `Corrected pooled RMSE matches 0.901 °C (got ${ov.rmseCorrected})`);
    assert(ov.climatologyRmse === 1.309, `Climatology pooled RMSE matches 1.309 °C (got ${ov.climatologyRmse})`);
    assert(ov.skillScorePct === 41.4, `Headline raw skill score percentage matches +41.4% (got ${ov.skillScorePct})`);
    assert(ov.secondarySkillScorePct === 52.6, `Secondary corrected skill score percentage matches +52.6% (got ${ov.secondarySkillScorePct})`);

    // Mathematical formula verification: 1 - (1.002^2 / 1.309^2) approx 0.414
    const calcSkill = 1.0 - (Math.pow(ov.rmseRaw, 2) / Math.pow(ov.climatologyRmse, 2));
    assert(Math.abs(calcSkill - ov.skillScore) < 0.01, 'Headline raw skill score satisfies SS = 1 - (RMSE_raw^2 / RMSE_clim^2)');

    // 3 Valid Ocean Basins — 14-year computed values (Andaman Sea has n=0, insufficientSample)
    assert(data.basins && Object.keys(data.basins).length >= 3, 'Basins breakdown covers sub-basins');
    const bob = data.basins['Bay of Bengal'];
    const as = data.basins['Arabian Sea'];
    const eio = data.basins['Equatorial Indian Ocean'];

    assert(bob && bob.count === 277 && bob.insufficientSample === false, 'Bay of Bengal: 277 profiles, active');
    assert(as && as.count === 1455 && as.insufficientSample === false, 'Arabian Sea: 1,455 profiles, active');
    assert(eio && eio.count === 77 && eio.insufficientSample === false, 'Equatorial Indian Ocean: 77 profiles, active');

    // 15 Standard Depths
    assert(Array.isArray(data.depths) && data.depths.length === 15, 'Depths breakdown covers all 15 standard depths');
    const standardDepths = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000];
    const reportedDepths = data.depths.map(d => d.depth);
    assert(JSON.stringify(reportedDepths) === JSON.stringify(standardDepths), 'Depths match 0m through 1000m standard levels');

    // Upper mixed layer skill high (5m)
    const d5 = data.depths.find(d => d.depth === 5);
    assert(d5 && d5.skillScorePct > 40, `Upper mixed layer (5m) exhibits strong skill (> 40%, got ${d5?.skillScorePct}%) over climatology`);

    // Summary endpoint check
    const sumRes = await fetchJson('http://localhost:8000/argo/summary');
    assert(sumRes.status === 200, '/argo/summary responds with HTTP 200');
    assert(sumRes.body.skillScore === 0.414, `/argo/summary includes skillScore (0.414, got ${sumRes.body.skillScore})`);
    assert(sumRes.body.skillScorePct === 41.4, `/argo/summary includes skillScorePct (41.4, got ${sumRes.body.skillScorePct})`);
    assert(sumRes.body.climatologyRmse === 1.309, `/argo/summary includes climatologyRmse (1.309, got ${sumRes.body.climatologyRmse})`);
  } catch (err) {
    console.error('API test failed:', err);
    assert(false, `API communication failed: ${err.message}`);
  }

  // 2. Frontend DOM Hooks & Layout in argo.html
  console.log('\n[TEST 2] Verifying argo.html DOM hooks & structure...');
  const html = fs.readFileSync('argo.html', 'utf8');

  assert(html.includes('ky-argo-skill-panel'), 'argo.html contains .ky-argo-skill-panel container');
  assert(html.includes('Model vs. Monthly Climatology Baseline (Skill Score, n=1,809)') || html.includes('Model vs. Climatology Baseline (Skill Score)'), 'Panel has explicit title with monthly climatology baseline (n=1,809)');
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
  assert(!js.includes('DEFAULT_SKILL_DATA'), 'argo.js must not contain DEFAULT_SKILL_DATA (hardcoded fallback removed)');
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
