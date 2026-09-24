/**
 * test_datepicker.js — Verification test for Watermelon UI DatePicker 3 sliding calendar
 */

const fs = require('fs');
const assert = require('assert');

console.log('============================================================');
console.log('TESTING WATERMELON UI DATEPICKER 3 SLIDING CALENDAR');
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

// 1. Script & Component Integrity
console.log('[SECTION 1] Script & Component Files');
check('datepicker.js exists', fs.existsSync('datepicker.js'));
const datepickerJs = fs.readFileSync('datepicker.js', 'utf8');
check('datepicker.js declares initDatePicker', datepickerJs.includes('initDatePicker'));
check('datepicker.js builds .ky-calendar-popover', datepickerJs.includes('ky-calendar-popover'));
check('datepicker.js defines MIN_DATE and MAX_DATE model bounds', (datepickerJs.includes('2023-01-01') || datepickerJs.includes('2023-01-10')) && datepickerJs.includes('2023-12-31'));
check('datepicker.js handles previous & next month navigation', datepickerJs.includes('ky-cal-prev') && datepickerJs.includes('ky-cal-next'));
check('datepicker.js dispatches change event on nativeInput', datepickerJs.includes("new Event('change'"));

check('DatePicker3.tsx exists', fs.existsSync('src/components/DatePicker3.tsx'));
const reactPicker = fs.readFileSync('src/components/DatePicker3.tsx', 'utf8');
check('DatePicker3.tsx exports DatePicker3 component', reactPicker.includes('export const DatePicker3') || reactPicker.includes('export default DatePicker3'));
check('DatePicker3.tsx renders trigger with CalendarIcon and ChevronDown', reactPicker.includes('polyline') && reactPicker.includes('rect'));
check('DatePicker3.tsx implements spring sliding transform', reactPicker.includes('cubic-bezier(0.25, 1.25, 0.5, 1)'));

// 2. CSS Styling & Sliding Dynamics
console.log('\n[SECTION 2] CSS Styling & Sliding Animation');
const css = fs.readFileSync('style.css', 'utf8');
check('style.css defines .ky-calendar-popover', css.includes('.ky-calendar-popover'));
check('style.css defines .ky-calendar-popover.is-open', css.includes('.ky-calendar-popover.is-open'));
check('style.css implements sliding smooth effect translateY(-8px)', css.includes('translateY(-8px)'));
check('style.css uses spring cubic-bezier curve', css.includes('cubic-bezier(0.25, 1.25, 0.5, 1)'));
check('style.css circular day buttons rounded-full border-radius: 9999px', css.includes('border-radius: 9999px'));
check('style.css active day selection styled with #0F172A', css.includes('.ky-cal-day.is-selected') && css.includes('#0F172A'));
check('style.css ky-date-btn updated to rounded-2xl (16px)', css.includes('border-radius: 16px'));

// 3. Platform HTML Integration & Test Compatibility
console.log('\n[SECTION 3] Platform HTML Integration');
const pages = [
  'explore.html',
  'fisheries.html',
  'marine-ecology.html',
  'fingerprint.html',
];

pages.forEach(function (page) {
  check(page + ' exists', fs.existsSync(page));
  const html = fs.readFileSync(page, 'utf8');
  check(page + ' loads datepicker.js', html.includes('src="datepicker.js"'));
  check(page + ' preserves #ky-date-btn', html.includes('id="ky-date-btn"'));
  check(page + ' preserves #date-display-header', html.includes('id="date-display-header"'));
  check(page + ' preserves #native-date-picker', html.includes('id="native-date-picker"'));
});

// Verify strict test string requirements
const fisheriesHtml = fs.readFileSync('fisheries.html', 'utf8');
check('fisheries.html strictly retains <span id="date-display-header">Select date</span>', fisheriesHtml.includes('<span id="date-display-header">Select date</span>'));

const exploreHtml = fs.readFileSync('explore.html', 'utf8');
check('explore.html strictly retains <span id="date-display-header">Select date</span>', exploreHtml.includes('<span id="date-display-header">Select date</span>'));

// 4. Functional DOM Simulation
console.log('\n[SECTION 4] Node DOM Execution');
global.document = {
  readyState: 'complete',
  addEventListener: () => {},
  querySelectorAll: () => []
};
global.window = {
  addEventListener: () => {}
};

try {
  const { initDatePicker } = require('./datepicker.js');
  check('datepicker.js cleanly imports in Node environment', typeof initDatePicker === 'function');
} catch (e) {
  check('datepicker.js cleanly imports in Node environment: ' + e.message, false);
}

console.log('\n============================================================');
console.log('RESULTS: ' + pass + ' / ' + (pass + fail) + ' assertions passed');
console.log('============================================================\n');

if (fail > 0) process.exit(1);
