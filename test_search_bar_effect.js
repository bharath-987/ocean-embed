const fs = require('fs');
const assert = require('assert');

console.log('============================================================');
console.log('  KYOGRE SEARCH BAR UIVERSE SHRINK/REBOUND & WHITE THEME SUITE');
console.log('============================================================\n');

const PAGES = ['explore.html', 'argo.html', 'fisheries.html', 'marine-ecology.html'];

// [TEST 1] Markup Verification across all 4 pages
console.log('[TEST 1] Verifying search bar markup and absence of Ctrl+K across pages...');
PAGES.forEach(page => {
  const html = fs.readFileSync(page, 'utf8');
  assert(html.includes('map-search-wrap') && html.includes('group'), `${page} must contain .map-search-wrap.group`);
  assert(html.includes('map-search__icon') && html.includes('search-icon'), `${page} must contain search icon classes`);
  assert(html.includes('id="map-search-input"') && html.includes('class="map-search__input input"'), `${page} must preserve input ID and include input class`);
  assert(html.includes('id="map-search-clear"'), `${page} must preserve #map-search-clear button`);
  assert(html.includes('id="map-search-results"'), `${page} must preserve #map-search-results dropdown`);
  
  // Ctrl+K removal check
  assert(!html.includes('ky-search-kbd'), `${page} must NOT contain .ky-search-kbd`);
  assert(!html.includes('Ctrl K'), `${page} must NOT contain Ctrl K badge text`);
  
  // Uiverse SVG path check
  assert(html.includes('M21.53 20.47l-3.66-3.66C19.195 15.24'), `${page} must contain modern Uiverse search SVG path`);
  console.log(`  [PASS] ${page}: Markup valid, classes wired, Ctrl+K completely removed.`);
});

// [TEST 2] CSS Styling & Animation Rules
console.log('\n[TEST 2] Verifying style.css search bar styling and shrink/bounce animation...');
const css = fs.readFileSync('style.css', 'utf8');

assert(css.includes('@keyframes searchBarShrinkBounce'), 'style.css must define searchBarShrinkBounce keyframe');
assert(css.includes('transform: scale(0.96)'), 'style.css must define scale(0.96) shrink factor');
assert(css.includes('cubic-bezier(0.19, 1, 0.22, 1)'), 'style.css must use smooth Uiverse cubic-bezier(0.19, 1, 0.22, 1)');
assert(css.includes('background-color: #FFFFFF'), 'style.css must configure clean white background');
assert(css.includes('box-shadow: 0 0 0 1.5px #E2EBF6'), 'style.css must define crisp light border box-shadow');
assert(css.includes('box-shadow: 0 0 0 2px #2563EB'), 'style.css must define royal blue focus ring');
assert(css.includes('.map-search-wrap:focus-within'), 'style.css must animate wrap on focus-within');
assert(css.includes('.map-search-wrap:active'), 'style.css must scale on active click');
assert(css.includes('.ky-search-kbd') && css.includes('display: none !important'), 'style.css must hide .ky-search-kbd with !important');
assert(css.includes('right: 12px'), 'Clear button must be aligned to right: 12px since Ctrl+K is removed');

console.log('  [PASS] CSS animation, cubic-bezier timing, white palette, and focus states verified.');

console.log('\n============================================================');
console.log('  ALL SEARCH BAR TESTS PASSED SUCCESSFULLY! (100%)');
console.log('============================================================');
