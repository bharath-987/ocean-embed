/**
 * Browser / DOM Verification Script for Argo Validation & Compare Page
 */
const fs = require('fs');
const http = require('http');

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

function assert(condition, desc) {
  if (!condition) {
    console.error(`  [FAIL] ${desc}`);
    process.exit(1);
  }
  console.log(`  [PASS] ${desc}`);
}

async function run() {
  console.log('============================================================');
  console.log('  ARGO PAGE BROWSER & ENDPOINT AUDIT');
  console.log('============================================================\n');

  // 1. Static HTML Checks
  const html = fs.readFileSync('argo.html', 'utf8');
  console.log('[AUDIT 1] Checking argo.html static markup...');
  assert(!html.toLowerCase().includes('profile coherence'), 'Profile Coherence label is NOT present anywhere in argo.html');
  assert(!html.toLowerCase().includes('correlation'), 'Correlation label is NOT present anywhere in argo.html');
  assert(html.includes('id="stat-argo-glorys"'), 'stat-argo-glorys element present');
  assert(html.includes('GLORYS RMSE'), 'GLORYS RMSE label present');
  assert(html.includes('id="toggle-argo-corrected"'), 'toggle-argo-corrected checkbox present');
  assert(html.includes('id="toggle-argo-smoothed"'), 'toggle-argo-smoothed checkbox present');
  assert(html.includes('id="comp-float-max-err"'), 'comp-float-max-err element present in float comparison panel');

  // 2. Live API /argo/summary verification
  console.log('\n[AUDIT 2] Checking live /argo/summary endpoint numbers...');
  const sRes = await fetchJson('http://localhost:8000/argo/summary');
  assert(sRes.status === 200, '/argo/summary returns 200');
  const s = sRes.body;
  assert(s.totalFloats === 81, `totalFloats is exactly 81 (got ${s.totalFloats})`);
  assert(s.totalProfiles === 1809, `totalProfiles is exactly 1809 (got ${s.totalProfiles})`);
  assert(s.totalDepthPoints === 24185, `totalDepthPoints is exactly 24185 (got ${s.totalDepthPoints})`);
  assert(s.rmseRaw === 1.002, `rmseRaw is 1.002 °C (got ${s.rmseRaw})`);
  assert(s.rmseCorrected === 0.901, `rmseCorrected is 0.901 °C (got ${s.rmseCorrected})`);
  assert(s.glorysRmse === 0.948, `glorysRmse is 0.948 °C (got ${s.glorysRmse})`);
  assert(s.biasRaw === 0.223, `biasRaw is 0.223 °C (got ${s.biasRaw})`);
  assert(s.biasCorrected === 0.081, `biasCorrected is 0.081 °C (got ${s.biasCorrected})`);
  assert(s.aggregateCorr === undefined, 'aggregateCorr is completely omitted from summary payload');
  assert(s.climatologyRmse === 1.309, `climatologyRmse is 1.309 °C (got ${s.climatologyRmse})`);
  assert(s.skillScore === 0.526, `skillScore is 0.526 (got ${s.skillScore})`);
  assert(s.skillScorePct === 52.6, `skillScorePct is 52.6% (got ${s.skillScorePct})`);
  assert(s.baselineSampleSize === 1809, `baselineSampleSize is 1809 (got ${s.baselineSampleSize})`);
  assert(s.baselineLabel === 'vs monthly-climatology baseline (n=1,809 Argo profiles, 81 floats, June–Dec 2023)', 'baselineLabel explicitly specifies n=1,809 Argo profiles, 81 floats, June–Dec 2023');

  // 3. Live API /argo/compare verification with independent flags
  console.log('\n[AUDIT 3] Checking live /argo/compare independent flags...');
  const cDefault = await fetchJson('http://localhost:8000/argo/compare?id=1901897_184');
  assert(cDefault.body.corrected === true && cDefault.body.smoothed === true, 'Default compare: corrected=true, smoothed=true');

  const cRawUnsmooth = await fetchJson('http://localhost:8000/argo/compare?id=1901897_184&corrected=false&smoothed=false');
  assert(cRawUnsmooth.body.corrected === false && cRawUnsmooth.body.smoothed === false, 'Compare &corrected=false&smoothed=false: raw uncorrected and unsmoothed');

  const cCorrUnsmooth = await fetchJson('http://localhost:8000/argo/compare?id=1901897_184&corrected=true&smoothed=false');
  assert(cCorrUnsmooth.body.corrected === true && cCorrUnsmooth.body.smoothed === false, 'Compare &corrected=true&smoothed=false: corrected without smoothing');

  const cRawSmooth = await fetchJson('http://localhost:8000/argo/compare?id=1901897_184&corrected=false&smoothed=true');
  assert(cRawSmooth.body.corrected === false && cRawSmooth.body.smoothed === true, 'Compare &corrected=false&smoothed=true: raw with smoothing');

  // 4. Stale date guard verification in app.js
  console.log('\n[AUDIT 4] Checking app.js date guard consistency...');
  const appJs = fs.readFileSync('app.js', 'utf8');
  assert(!appJs.includes('2021-01-11 and 2023-12-31'), 'Stale 2021-01-11 guard notice removed from app.js');
  assert(appJs.includes('WINDOW_START_DAY') && appJs.includes('WINDOW_END_DAY'), 'app.js uses WINDOW_START_DAY and WINDOW_END_DAY guards');

  console.log('\n============================================================');
  console.log('  ALL AUDIT CHECKS PASSED PERFECTLY!');
  console.log('============================================================\n');
}

run().catch(err => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
