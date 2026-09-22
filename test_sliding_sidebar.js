/**
 * test_sliding_sidebar.js — Verification test for macOS Sliding Sidebar Navigation
 */

const fs = require('fs');
const assert = require('assert');

console.log('============================================================');
console.log('TESTING macOS-STYLE SLIDING SIDEBAR NAVIGATION');
console.log('============================================================\n');

let pass = 0;
let fail = 0;

function check(desc, condition) {
  if (condition) {
    console.log('  [PASS] ' + desc);
    pass++;
  } else {
    console.error('  [FAIL] ' + desc);
    fail++;
  }
}

// 1. Script existence and syntax
console.log('[SECTION 1] Script & Component Integrity');
check('sidebar-nav.js exists', fs.existsSync('sidebar-nav.js'));

const sidebarNavJs = fs.readFileSync('sidebar-nav.js', 'utf8');
check('sidebar-nav.js declares initSlidingSidebar', sidebarNavJs.includes('initSlidingSidebar'));
check('sidebar-nav.js creates .ky-sidebar__slide-pill', sidebarNavJs.includes('ky-sidebar__slide-pill'));
check('sidebar-nav.js uses GPU-accelerated translate3d', sidebarNavJs.includes('translate3d'));
check('sidebar-nav.js marks .has-sliding-pill on nav', sidebarNavJs.includes('has-sliding-pill'));

// Verify React component
check('MacOSSidebar.tsx exists', fs.existsSync('src/components/MacOSSidebar.tsx'));
const reactSidebar = fs.readFileSync('src/components/MacOSSidebar.tsx', 'utf8');
check('MacOSSidebar.tsx does NOT contain PlusSignIcon', !reactSidebar.includes('PlusSignIcon'));
check('MacOSSidebar.tsx does NOT contain SidebarLeftIcon', !reactSidebar.includes('SidebarLeftIcon'));
check('MacOSSidebar.tsx does NOT contain isOpen collapse toggle', !reactSidebar.includes('isOpen'));
check('MacOSSidebar.tsx includes spring sliding transition', reactSidebar.includes('cubic-bezier(0.25, 1.25, 0.5, 1)'));

// 2. CSS Rules in style.css
console.log('\n[SECTION 2] CSS Styling & Spring Dynamics');
const css = fs.readFileSync('style.css', 'utf8');
check('style.css defines .ky-sidebar__slide-pill', css.includes('.ky-sidebar__slide-pill'));
check('style.css includes macOS spring cubic-bezier curve', css.includes('cubic-bezier(0.25, 1.25, 0.5, 1)'));
check('style.css defines .ky-sidebar__nav.has-sliding-pill', css.includes('.ky-sidebar__nav.has-sliding-pill'));
check('style.css keeps .ky-nav-item above sliding pill (z-index)', css.includes('.ky-nav-item') && css.includes('z-index: 1'));
check('style.css preserves active nav item contrast #DCEAFE', css.includes('#DCEAFE'));

// 3. HTML Integration across all platform pages
console.log('\n[SECTION 3] Platform HTML Integration');
const platformPages = [
  'explore.html',
  'argo.html',
  'fisheries.html',
  'marine-ecology.html',
  'fingerprint.html',
];

platformPages.forEach(function (page) {
  check(page + ' exists', fs.existsSync(page));
  const html = fs.readFileSync(page, 'utf8');
  check(page + ' loads sidebar-nav.js', html.includes('src="sidebar-nav.js"'));
  check(page + ' contains .ky-sidebar', html.includes('class="ky-sidebar"'));
  check(page + ' contains .ky-sidebar__nav', html.includes('class="ky-sidebar__nav"'));
});

// 4. Functional DOM Simulation
console.log('\n[SECTION 4] Functional Sliding Pill State Machine');
// Mocking minimal DOM to test logic
global.document = {
  readyState: 'complete',
  addEventListener: () => {},
  querySelectorAll: () => []
};
global.window = {
  addEventListener: () => {}
};

try {
  const { initSlidingSidebar } = require('./sidebar-nav.js');
  check('sidebar-nav.js cleanly imports in Node environment', typeof initSlidingSidebar === 'function');
} catch (e) {
  check('sidebar-nav.js cleanly imports in Node environment: ' + e.message, false);
}

console.log('\n============================================================');
console.log('RESULTS: ' + pass + ' / ' + (pass + fail) + ' assertions passed');
console.log('============================================================\n');

if (fail > 0) process.exit(1);
