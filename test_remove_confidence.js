// test_remove_confidence.js
// Verifies complete eradication of prediction confidence from explore.html, style.css, app.js, and api_server.py

const fs = require('fs');
const assert = require('assert');
const http = require('http');

console.log('--- TEST: Verification of Complete Confidence Level Removal ---');

let passedTests = 0;
let totalTests = 0;

function check(desc, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${desc}: ${err.message}`);
    process.exitCode = 1;
  }
}

async function checkAsync(desc, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`[PASS] ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${desc}: ${err.message}`);
    process.exitCode = 1;
  }
}

function requestHttp(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch(e) {
          parsed = data;
        }
        resolve({ statusCode: res.statusCode, body: parsed });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  // 1. Static file audits: explore.html
  const exploreHtml = fs.readFileSync('explore.html', 'utf8');
  check('explore.html has 0 occurrences of "confidence"', () => {
    const matches = exploreHtml.match(/confidence/gi);
    assert.strictEqual(matches, null, `Found ${matches ? matches.length : 0} occurrences of confidence in explore.html`);
  });

  check('explore.html does not contain stat confidence elements', () => {
    assert(!exploreHtml.includes('stat-mld-confidence'), 'stat-mld-confidence found');
    assert(!exploreHtml.includes('stat-ohc-confidence'), 'stat-ohc-confidence found');
    assert(!exploreHtml.includes('stat-sound-confidence'), 'stat-sound-confidence found');
    assert(!exploreHtml.includes('stat-d20-confidence'), 'stat-d20-confidence found');
  });

  check('explore.html does not contain param-confidence button', () => {
    assert(!exploreHtml.includes('param-confidence'), 'param-confidence button found');
  });

  check('explore.html TVD table has 2 columns', () => {
    assert(exploreHtml.includes('<col style="width: 50%;">'), 'TVD table does not contain 50% width columns');
    const cols = (exploreHtml.match(/<col style="width: 50%;">/g) || []).length;
    assert.strictEqual(cols, 2, `Expected 2 cols of 50% width, found ${cols}`);
    assert(!exploreHtml.includes('Confidence ℹ'), 'Confidence column header found in table');
  });

  // 2. Static file audits: style.css
  const styleCss = fs.readFileSync('style.css', 'utf8');
  check('style.css has 0 occurrences of "confidence"', () => {
    const matches = styleCss.match(/confidence/gi);
    assert.strictEqual(matches, null, `Found ${matches ? matches.length : 0} occurrences of confidence in style.css`);
  });

  // 3. Static file audits: app.js
  const appJs = fs.readFileSync('app.js', 'utf8');
  check('app.js has 0 occurrences of confidence metrics', () => {
    // Exclude the TVD chart statistical error band label
    const sanitized = appJs.replace(/90% Confidence Band/gi, '');
    const matches = sanitized.match(/confidence/gi);
    assert.strictEqual(matches, null, `Found ${matches ? matches.length : 0} occurrences of confidence metrics in app.js`);
  });

  // 4. Obsolete files deleted
  check('backend/data/confidence_stats.json does not exist', () => {
    assert(!fs.existsSync('backend/data/confidence_stats.json'), 'confidence_stats.json should be deleted');
  });

  check('test_confidence_grid.js and test_confidence_indicator.js do not exist', () => {
    assert(!fs.existsSync('test_confidence_grid.js'), 'test_confidence_grid.js should be deleted');
    assert(!fs.existsSync('test_confidence_indicator.js'), 'test_confidence_indicator.js should be deleted');
  });

  // 5. Backend endpoints verification
  await checkAsync('GET /confidence-grid returns 404', async () => {
    const res = await requestHttp('GET', '/confidence-grid?date=2023-10-22');
    assert.strictEqual(res.statusCode, 404, `Expected 404, got ${res.statusCode}`);
  });

  await checkAsync('GET /confidence-stats returns 404', async () => {
    const res = await requestHttp('GET', '/confidence-stats');
    assert.strictEqual(res.statusCode, 404, `Expected 404, got ${res.statusCode}`);
  });

  await checkAsync('POST /predict returns 200 with clean profile and no metrics_confidence', async () => {
    const res = await requestHttp('POST', '/predict', {
      latitude: 15.5,
      longitude: 65.0,
      date: '2023-10-22'
    });
    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    assert.strictEqual(res.body.metrics_confidence, undefined, 'metrics_confidence must not be present');
    assert.strictEqual(res.body.nearest_argo, undefined, 'nearest_argo must not be present');
    assert(Array.isArray(res.body.profile), 'profile must be an array');
    for (const pt of res.body.profile) {
      assert('depth' in pt, 'profile point must have depth');
      assert('temperature' in pt, 'profile point must have temperature');
      assert(!('confidence' in pt), 'profile point must not have confidence');
    }
  });

  console.log(`\nResults: ${passedTests}/${totalTests} tests passed.`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
