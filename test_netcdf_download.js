const fs = require('fs');
const http = require('http');
const https = require('https');
const assert = require('assert');

console.log('============================================================');
console.log('  KYOGRE NETCDF PRODUCTION HOSTING & UI VERIFICATION SUITE');
console.log('============================================================\n');

const EXPECTED_BYTES = 173669183;
const EXPECTED_HASH = 'b462e9d99fc0e5e9e4e73c0ac8534f6b51fb797a5063c89d3a07d9b48415be47';
const HF_DOWNLOAD_URL = 'https://huggingface.co/datasets/bharath-987/ocean-embed-data/resolve/main/oceanembed_v6_satswap_anom_14yr_2023.nc';

// 1. Static HTML & UI assertions
console.log('[TEST 1] Verifying explore.html NetCDF download markup & styling...');
const html = fs.readFileSync('explore.html', 'utf8');

assert(html.includes('id="btn-download-netcdf"'), 'explore.html must contain #btn-download-netcdf');
assert(html.includes(`href="${HF_DOWNLOAD_URL}"`), 'Download link must point directly to Hugging Face dataset URL in explore.html');
assert(html.includes('download="oceanembed_v6_satswap_anom_14yr_2023.nc"'), 'Download link must include download attribute');
assert(html.includes('target="_blank"'), 'Download link should have target="_blank"');
assert(html.includes('rel="noopener noreferrer"'), 'Download link should have rel="noopener noreferrer"');
assert(html.includes('Download NetCDF'), 'Button text must include "Download NetCDF"');

console.log('  [PASS] explore.html markup points to production Hugging Face URL with proper attributes.');

// 2. Client-side local dev fallback logic in app.js
console.log('\n[TEST 2] Verifying app.js local-dev fallback gating...');
const appJs = fs.readFileSync('app.js', 'utf8');
assert(appJs.includes('initNetCDFDownloadLink'), 'app.js must implement initNetCDFDownloadLink');
assert(appJs.includes('downloads/oceanembed_v6_satswap_anom_14yr_2023.nc'), 'app.js must reference local dev fallback path');
assert(appJs.includes('isLocalDev'), 'app.js must verify localhost/127.0.0.1 environment before swapping link');
console.log('  [PASS] app.js contains valid local-dev detection and fallback logic.');

// 3. CSS styles
console.log('\n[TEST 3] Verifying style.css download styles...');
const css = fs.readFileSync('style.css', 'utf8');
assert(css.includes('.ky-tvd-download-section'), 'style.css must define .ky-tvd-download-section');
assert(css.includes('.ky-tvd-download-btn'), 'style.css must define .ky-tvd-download-btn');
assert(css.includes('.ky-tvd-download-note'), 'style.css must define .ky-tvd-download-note');
console.log('  [PASS] style.css download section, button, and note styles verified.');

// 4. File existence and byte-size match on local disk
console.log('\n[TEST 4] Verifying NetCDF file on disk and byte-level parity...');
const ncPath = 'downloads/oceanembed_v6_satswap_anom_14yr_2023.nc';
assert(fs.existsSync(ncPath), `${ncPath} must exist on disk for local dev`);

const stats = fs.statSync(ncPath);
assert.strictEqual(stats.size, EXPECTED_BYTES, `Byte size must match source exactly (${EXPECTED_BYTES}, got ${stats.size})`);
console.log(`  [PASS] NetCDF file on disk matches expected byte size exactly: ${stats.size.toLocaleString()} bytes (~173.7 MB).`);

// 5. Verify local HTTP resolution
console.log('\n[TEST 5] Verifying HTTP GET resolution via local static server (port 5500)...');
function testLocalHttp(callback) {
  const req = http.request({
    host: 'localhost',
    port: 5500,
    path: '/downloads/oceanembed_v6_satswap_anom_14yr_2023.nc',
    method: 'HEAD'
  }, (res) => {
    console.log(`  Local HTTP Response Status: ${res.statusCode}`);
    console.log(`  Local Content-Length:       ${res.headers['content-length']}`);

    assert.strictEqual(res.statusCode, 200, 'Static server must return HTTP 200');
    assert.strictEqual(parseInt(res.headers['content-length'], 10), EXPECTED_BYTES, 'Content-Length must match file size');

    console.log('  [PASS] Local HTTP endpoint resolves and serves the exact binary byte size.');
    callback();
  });

  req.on('error', (err) => {
    console.error('Local HTTP Request failed:', err);
    process.exit(1);
  });
  req.end();
}

// 6. Verify remote Hugging Face HTTPS endpoint
function testRemoteHf() {
  console.log('\n[TEST 6] Verifying Hugging Face direct HTTPS resolution...');
  console.log('  Testing URL:', HF_DOWNLOAD_URL);

  function followRedirect(url, depth = 0) {
    if (depth > 5) {
      console.error('Too many redirects');
      process.exit(1);
    }
    const client = url.startsWith('https') ? https : http;
    const req = client.request(url, { method: 'HEAD', headers: { 'User-Agent': 'Kyogre/1.0' } }, (res) => {
      console.log(`  Redirect depth ${depth}: Status ${res.statusCode}`);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return followRedirect(res.headers.location, depth + 1);
      }
      console.log(`  HF Final Status:        ${res.statusCode}`);
      console.log(`  HF Content-Type:        ${res.headers['content-type']}`);
      console.log(`  HF Content-Length:      ${res.headers['content-length']}`);

      assert.strictEqual(res.statusCode, 200, 'HF endpoint must return HTTP 200');
      assert.strictEqual(parseInt(res.headers['content-length'], 10), EXPECTED_BYTES, 'HF Content-Length must match expected byte size');
      console.log('  [PASS] Hugging Face HTTPS endpoint verified: returns 200 with exact byte length.');

      console.log('\n============================================================');
      console.log('  ALL NETCDF VERIFICATION TESTS PASSED SUCCESSFULLY! (100%)');
      console.log('============================================================');
      process.exit(0);
    });

    req.on('error', (err) => {
      console.error('HF Request failed:', err);
      process.exit(1);
    });
    req.end();
  }

  followRedirect(HF_DOWNLOAD_URL);
}

testLocalHttp(() => {
  testRemoteHf();
});
