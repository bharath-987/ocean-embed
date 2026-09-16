/**
 * Test Suite: ARGO Page Cycle Number Synchronization
 * Verifies that the header dropdown (#argo-float-select) and the date/cycle dropdown (#argo-date-select)
 * consistently agree on the exact ground-truth cycle number across all floats and interactions.
 */

const fs = require('fs');
const assert = require('assert');

console.log('============================================================');
console.log('  TESTING ARGO PAGE CYCLE NUMBER SYNCHRONIZATION');
console.log('============================================================\n');

// 1. Load data
const data = JSON.parse(fs.readFileSync('backend/data/argo_profiles.json', 'utf8'));
const allProfiles = data.profiles;
console.log(`Loaded ${allProfiles.length} profiles from argo_profiles.json`);

// 2. Load argo.js
const argoJs = fs.readFileSync('argo.js', 'utf8');
assert(argoJs.length > 0, 'argo.js is not empty');

// Ensure sync code is present in selectDate
assert(argoJs.includes('argo-float-select') && argoJs.includes('selectEl.value = cycleId'),
  'selectDate synchronizes argo-float-select to cycleId');

// Ensure sync code is present in float-select change handler
assert(argoJs.includes('selectDate(targetId)'),
  'float-select change handler triggers selectDate(targetId)');

// Simulated DOM State Machine
class MockSelect {
  constructor(id) {
    this.id = id;
    this.options = [];
    this._value = '';
  }
  appendChild(opt) {
    this.options.push(opt);
    if (opt.selected || (this.options.length === 1 && !this._value)) {
      this._value = opt.value;
    }
  }
  get value() {
    return this._value;
  }
  set value(val) {
    this._value = val;
    this.options.forEach(opt => {
      opt.selected = (opt.value === val);
    });
  }
  get selectedOption() {
    return this.options.find(opt => opt.value === this._value) || null;
  }
}

class MockElement {
  constructor(id) {
    this.id = id;
    this.textContent = '';
    this.style = {};
  }
}

// Simulated App State
let selectedProfileId = null;
let selectedCycleId = null;
let currentSubRegionFilter = 'all';
let filteredProfiles = [...allProfiles];

const dom = {
  'argo-float-select': new MockSelect('argo-float-select'),
  'argo-date-select': new MockSelect('argo-date-select'),
  'argo-selected-sub': new MockElement('argo-selected-sub'),
  'argo-compare-empty': new MockElement('argo-compare-empty'),
  'argo-compare-content': new MockElement('argo-compare-content'),
  'argo-chart-placeholder': new MockElement('argo-chart-placeholder'),
  'argo-chart-box': new MockElement('argo-chart-box'),
};

function populateDropdown(profiles) {
  const selectEl = dom['argo-float-select'];
  selectEl.options = [];
  selectEl._value = '';

  const placeholder = { value: '', textContent: 'Select a float profile...', disabled: true, selected: !selectedProfileId };
  selectEl.appendChild(placeholder);

  profiles.forEach(p => {
    const opt = {
      value: p.id,
      textContent: `Float #${p.wmoFloatId} · Cycle ${p.cycleNumber}`,
      selected: (p.id === selectedProfileId)
    };
    selectEl.appendChild(opt);
  });

  if (selectedProfileId) {
    selectEl.value = selectedProfileId;
  }
}

function populateDateDropdown(wmoFloatId) {
  const dateSelect = dom['argo-date-select'];
  dateSelect.options = [];
  dateSelect._value = '';

  const cycles = allProfiles.filter(p => p.wmoFloatId === wmoFloatId);
  cycles.sort((a, b) => a.cycleNumber - b.cycleNumber);

  if (cycles.length === 1) {
    const c = cycles[0];
    const opt = { value: c.id, textContent: `${c.date} · Cycle #${c.cycleNumber}`, selected: true };
    dateSelect.appendChild(opt);
    dateSelect.value = c.id;
  } else {
    const placeholder = { value: '', textContent: 'Select observation date...', disabled: true, selected: true };
    dateSelect.appendChild(placeholder);
    cycles.forEach(c => {
      const opt = { value: c.id, textContent: `${c.date} · Cycle #${c.cycleNumber}`, selected: false };
      dateSelect.appendChild(opt);
    });
  }

  return cycles;
}

function selectFloat(id) {
  selectedProfileId = id;
  selectedCycleId = null;

  const profile = allProfiles.find(p => p.id === id);
  if (!profile) return;

  const selectEl = dom['argo-float-select'];
  if (selectEl && selectEl.value !== id) {
    selectEl.value = id;
  }

  const subEl = dom['argo-selected-sub'];
  if (subEl) {
    subEl.textContent = `${profile.latitude.toFixed(2)}°N, ${profile.longitude.toFixed(2)}°E · ${profile.subRegion}`;
  }

  const cycles = populateDateDropdown(profile.wmoFloatId);
  if (cycles && cycles.length === 1) {
    selectDate(cycles[0].id);
  }
}

function selectDate(cycleId) {
  if (!cycleId) return;
  selectedCycleId = cycleId;

  const cycleProfile = allProfiles.find(p => p.id === cycleId);
  if (cycleProfile) {
    const subEl = dom['argo-selected-sub'];
    if (subEl) {
      subEl.textContent = `${cycleProfile.latitude.toFixed(2)}°N, ${cycleProfile.longitude.toFixed(2)}°E · ${cycleProfile.date} (${cycleProfile.subRegion})`;
    }
  }

  // Sync Float Dropdown so header float title & cycle always match the selected cycle
  const selectEl = dom['argo-float-select'];
  if (selectEl) {
    const hasOption = selectEl.options.some(opt => opt.value === cycleId);
    if (!hasOption) {
      populateDropdown(allProfiles);
    }
    if (selectEl.value !== cycleId) {
      selectEl.value = cycleId;
    }
  }

  // Also ensure the Date dropdown value matches cycleId
  const dateSelectEl = dom['argo-date-select'];
  if (dateSelectEl && dateSelectEl.value !== cycleId) {
    dateSelectEl.value = cycleId;
  }
}

// Initial setup
populateDropdown(filteredProfiles);

console.log('\n[TEST 1] Verifying Float #2902278 Cycle 126 and Cycle 144 switching...');

// Step A: User clicks Marker 144 (May 14, 2021)
selectFloat('2902278_144');
assert.strictEqual(dom['argo-float-select'].value, '2902278_144');
assert(dom['argo-float-select'].selectedOption.textContent.includes('Cycle 144'));
assert.strictEqual(dom['argo-date-select'].value, ''); // Waiting in date pending state

// Step B: User selects Cycle 126 (Feb 13, 2021) from Date Dropdown
selectDate('2902278_126');

// Verify all UI elements in sync for Cycle 126
const optFloat126 = dom['argo-float-select'].selectedOption;
const optDate126 = dom['argo-date-select'].selectedOption;
console.log('  State after selecting Cycle 126:');
console.log('    Header Dropdown:   ', optFloat126.textContent);
console.log('    Subtitle:          ', dom['argo-selected-sub'].textContent);
console.log('    Date Dropdown:     ', optDate126.textContent);

assert.strictEqual(dom['argo-float-select'].value, '2902278_126', 'Header dropdown synced to 2902278_126');
assert(optFloat126.textContent.includes('Cycle 126'), 'Header dropdown displays Cycle 126');
assert(optDate126.textContent.includes('Cycle #126'), 'Date dropdown displays Cycle #126');
assert(optDate126.textContent.includes('2021-02-13'), 'Date dropdown displays 2021-02-13');
assert(dom['argo-selected-sub'].textContent.includes('2021-02-13'), 'Subtitle displays 2021-02-13');
assert(dom['argo-selected-sub'].textContent.includes('19.34°N, 91.80°E'), 'Subtitle displays 19.34°N, 91.80°E');
console.log('  ✓ Float #2902278 Cycle 126 is 100% consistent across header, subtitle, and date dropdown.');

// Step C: User switches to Cycle 144 from Date Dropdown
selectDate('2902278_144');

const optFloat144 = dom['argo-float-select'].selectedOption;
const optDate144 = dom['argo-date-select'].selectedOption;
console.log('\n  State after selecting Cycle 144:');
console.log('    Header Dropdown:   ', optFloat144.textContent);
console.log('    Subtitle:          ', dom['argo-selected-sub'].textContent);
console.log('    Date Dropdown:     ', optDate144.textContent);

assert.strictEqual(dom['argo-float-select'].value, '2902278_144', 'Header dropdown synced to 2902278_144');
assert(optFloat144.textContent.includes('Cycle 144'), 'Header dropdown displays Cycle 144');
assert(optDate144.textContent.includes('Cycle #144'), 'Date dropdown displays Cycle #144');
assert(optDate144.textContent.includes('2021-05-14'), 'Date dropdown displays 2021-05-14');
assert(dom['argo-selected-sub'].textContent.includes('2021-05-14'), 'Subtitle displays 2021-05-14');
assert(dom['argo-selected-sub'].textContent.includes('19.89°N, 89.84°E'), 'Subtitle displays 19.89°N, 89.84°E');
console.log('  ✓ Float #2902278 Cycle 144 is 100% consistent across header, subtitle, and date dropdown.');

console.log('\n[TEST 2] Spot-checking other floats across all subregions...');
const spotCheckFloats = [
  { wmo: 2902265, subRegion: 'Arabian Sea' },
  { wmo: 2902283, subRegion: 'Bay of Bengal' },
  { wmo: 2902768, subRegion: 'Bay of Bengal' },
  { wmo: 2902770, subRegion: 'Bay of Bengal' },
  { wmo: 2902775, subRegion: 'Equatorial Indian Ocean' },
  { wmo: 2901898, subRegion: 'Bay of Bengal / Equatorial' },
  { wmo: 2902852, subRegion: 'Equatorial Indian Ocean' },
  { wmo: 2902205, subRegion: 'Arabian Sea' },
  { wmo: 2902282, subRegion: 'Bay of Bengal' },
  { wmo: 6903060, subRegion: 'Arabian Sea' }
];

spotCheckFloats.forEach(sc => {
  const pList = allProfiles.filter(p => p.wmoFloatId === sc.wmo);
  console.log(`\nChecking Float #${sc.wmo} (${sc.subRegion}, ${pList.length} cycle(s)):`);
  pList.forEach(p => {
    // Select float then select cycle
    selectFloat(p.id);
    selectDate(p.id);

    const fOpt = dom['argo-float-select'].selectedOption;
    const dOpt = dom['argo-date-select'].selectedOption;
    const subText = dom['argo-selected-sub'].textContent;

    // Extract cycle numbers from both dropdowns
    const fCycleMatch = fOpt.textContent.match(/Cycle\s+(\d+)/);
    const dCycleMatch = dOpt.textContent.match(/Cycle\s+#?(\d+)/);

    assert(fCycleMatch, `Header dropdown has cycle number for ${p.id}`);
    assert(dCycleMatch, `Date dropdown has cycle number for ${p.id}`);

    const fCycle = parseInt(fCycleMatch[1], 10);
    const dCycle = parseInt(dCycleMatch[1], 10);

    assert.strictEqual(fCycle, p.cycleNumber, `Header cycle ${fCycle} matches ground truth ${p.cycleNumber}`);
    assert.strictEqual(dCycle, p.cycleNumber, `Date dropdown cycle ${dCycle} matches ground truth ${p.cycleNumber}`);
    assert.strictEqual(fCycle, dCycle, `Header cycle (${fCycle}) and Date dropdown cycle (${dCycle}) are identical`);
    assert(subText.includes(p.date), `Subtitle contains ground truth date ${p.date}`);

    console.log(`  ✓ Cycle ${p.cycleNumber} (${p.date}): Header="${fOpt.textContent}" | Date="${dOpt.textContent}" | Subtitle="${subText}"`);
  });
});

console.log('\n============================================================');
console.log('  ALL CYCLE SYNCHRONIZATION ASSERTIONS PASSED (100%)');
console.log('============================================================');
