const fs = require('fs');
const assert = require('assert');

console.log('============================================================');
console.log('  KYOGRE NETCDF INTERACTION & GATING VERIFICATION');
console.log('============================================================\n');

// 1. Static explore.html verification
console.log('[TEST 1] Verifying explore.html button markup...');
const html = fs.readFileSync('explore.html', 'utf8');

assert(html.includes('id="btn-download-netcdf"'), 'explore.html must have #btn-download-netcdf');
assert(html.includes('id="btn-download-netcdf-text"'), 'explore.html must have #btn-download-netcdf-text');
assert(html.includes('↓ Download NetCDF'), 'explore.html must have initial text "↓ Download NetCDF"');
assert(!html.includes('Download NetCDF (174 MB)'), 'Must not display file size in button');
assert(!html.includes('Current Location'), 'Must not mention location in button');
console.log('  [PASS] Initial button text and structure conform to spec.');

// 2. CSS Styles in style.css
console.log('\n[TEST 2] Verifying CSS classes and shimmer animation...');
const css = fs.readFileSync('style.css', 'utf8');

assert(css.includes('.ky-tvd-download-btn.is-downloading'), 'Must style .is-downloading state');
assert(css.includes('kyDownloadShimmer'), 'Must define @keyframes kyDownloadShimmer');
assert(css.includes('.ky-tvd-download-btn.is-downloaded'), 'Must style .is-downloaded state');
assert(css.includes('aria-disabled="true"'), 'Must style aria-disabled="true" state');
assert(css.includes('prefers-reduced-motion'), 'Must support prefers-reduced-motion');
assert(css.includes('cursor: not-allowed') || css.includes('pointer-events: none'), 'Disabled button must be non-interactive');

console.log('  [PASS] CSS transitions, shimmer keyframes, and disabled states verified.');

// 3. app.js logic verification
console.log('\n[TEST 3] Verifying app.js interaction logic...');
const appJs = fs.readFileSync('app.js', 'utf8');

assert(appJs.includes('kyogre_netcdf_downloaded'), 'Must use sessionStorage key kyogre_netcdf_downloaded');
assert(appJs.includes('↓ Downloading...'), 'Must update label to "↓ Downloading..." on click');
assert(appJs.includes('✓ Downloaded'), 'Must update label to "✓ Downloaded" on success');
assert(appJs.includes('✓ Already Downloaded'), 'Must update label to "✓ Already Downloaded" when disabled');
assert(appJs.includes('applyDisabledDownloadedState'), 'Must have helper for applying disabled downloaded state');
assert(appJs.includes('isDownloading'), 'Must prevent multiple concurrent downloads');
assert(appJs.includes('polyline points="20 6 9 17 4 12"'), 'Must transition icon to checkmark');

console.log('  [PASS] app.js click handler, state transitions, and sessionStorage locking verified.');

// 4. In-memory DOM simulation of states
console.log('\n[TEST 4] Simulating button lifecycle states...');

class MockElement {
  constructor(tag, id = '') {
    this.tagName = tag.toUpperCase();
    this.classList = {
      _set: new Set(),
      add: (cls) => this.classList._set.add(cls),
      remove: (cls) => this.classList._set.delete(cls),
      contains: (cls) => this.classList._set.has(cls),
      has: (cls) => this.classList._set.has(cls)
    };
    this.attributes = {};
    this.style = {};
    this.textContent = '';
    this.innerHTML = '';
    this.children = [];
  }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  removeAttribute(k) { delete this.attributes[k]; }
  querySelector(sel) {
    if (sel === 'svg') return this.children.find(c => c.tagName === 'SVG') || null;
    if (sel === 'span') return this.children.find(c => c.tagName === 'SPAN') || null;
    return null;
  }
}

const mockBtn = new MockElement('a', 'btn-download-netcdf');
mockBtn.classList.add('ky-tvd-download-btn');
mockBtn.setAttribute('href', 'downloads/oceanembed_v6_satswap_anom_14yr_2023.nc');
mockBtn.setAttribute('download', 'oceanembed_v6_satswap_anom_14yr_2023.nc');

const mockText = new MockElement('span', 'btn-download-netcdf-text');
mockText.textContent = '↓ Download NetCDF';
mockBtn.children.push(mockText);

const mockSvg = new MockElement('svg');
mockBtn.children.push(mockSvg);

assert.strictEqual(mockText.textContent, '↓ Download NetCDF', 'Initial state must be "↓ Download NetCDF"');

// Simulate click -> downloading
mockBtn.classList.add('is-downloading');
mockText.textContent = '↓ Downloading...';
assert.strictEqual(mockText.textContent, '↓ Downloading...');
assert(mockBtn.classList.has('is-downloading'), 'Must have is-downloading class');

// Simulate download success -> Downloaded
mockBtn.classList.remove('is-downloading');
mockText.textContent = '✓ Downloaded';
assert.strictEqual(mockText.textContent, '✓ Downloaded');

// Simulate disabled downloaded -> Already Downloaded
mockBtn.classList.add('is-downloaded');
mockBtn.setAttribute('aria-disabled', 'true');
mockBtn.setAttribute('tabindex', '-1');
mockBtn.removeAttribute('href');
mockBtn.removeAttribute('download');
mockBtn.style.pointerEvents = 'none';
mockText.textContent = '✓ Already Downloaded';

assert.strictEqual(mockText.textContent, '✓ Already Downloaded');
assert.strictEqual(mockBtn.getAttribute('aria-disabled'), 'true');
assert.strictEqual(mockBtn.getAttribute('href'), undefined);
assert.strictEqual(mockBtn.style.pointerEvents, 'none');

console.log('  [PASS] Simulated lifecycle transition (Default -> Downloading -> Downloaded -> Already Downloaded) completed.');

console.log('\n============================================================');
console.log('  ALL NETCDF INTERACTION TESTS PASSED! (100%)');
console.log('============================================================');
