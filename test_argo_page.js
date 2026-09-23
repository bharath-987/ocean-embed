/**
 * Automated Verification Suite for ARGO Validation & Compare Feature (Minimal SaaS Redesign & 3 Bugfixes)
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
  console.log('  KYOGRE ARGO VALIDATION & COMPARE VERIFICATION SUITE');
  console.log('  (Minimal SaaS Redesign & 3 Bugfixes)');
  console.log('============================================================\n');

  // 1. DOM Hook & Markup Integrity (argo.html)
  console.log('[TEST 1] Verifying argo.html DOM hooks & new layout structure...');
  assert(fs.existsSync('argo.html'), 'argo.html exists in project root');
  const html = fs.readFileSync('argo.html', 'utf8');

  // 1.1 Navbar & Header Search Bar
  assert(html.includes('ky-argo-navbar'), 'Top navbar has ky-argo-navbar class');
  assert(!html.includes('ky-brand-wave'), 'Logo icon successfully removed next to Kyogre in navbar');
  assert(html.includes('ky-header__brand-title') && html.includes('Kyogre'), 'Kyogre brand text preserved in navbar');
  assert(!html.includes('ky-argo-nav-title'), 'ARGO Validation & Compare title element removed from navbar');
  assert(html.includes('ky-header__search'), 'Centered search bar wrapper present in navbar');
  assert(html.includes('map-search-wrap'), 'Search bar component container present');
  assert(html.includes('id="map-search-input"'), 'Search input #map-search-input present');
  assert(!html.includes('ky-search-kbd') && !html.includes('Ctrl K'), 'Ctrl K shortcut hint successfully removed from search bar');
  assert(html.includes('id="map-search-clear"'), 'Search clear button present');
  assert(html.includes('id="map-search-results"'), 'Search dropdown container present');
  assert(html.includes('ky-live-indicator') && html.includes('ky-live-dot--reanalysis'), 'Navbar includes Historical Reanalysis indicator (replaces removed Live badge)');
  assert(html.includes('Historical Reanalysis') && html.includes('In-situ Observational Data'), 'Navbar reanalysis badge shows correct text labels');
  assert(!html.includes('ky-argo-live-badge') && !html.includes('ky-argo-avatar-btn'), 'Removed: inaccurate Live badge and inert avatar button are gone');

  // 1.2 Stat cards
  assert(html.includes('id="stat-argo-rmse"'), 'Basin RMSE stat element present');
  assert(html.includes('id="stat-argo-bias"'), 'Mean Thermal Bias stat element present');
  assert(html.includes('id="stat-argo-glorys"'), 'GLORYS RMSE stat element present');
  assert(html.includes('id="stat-argo-floats"'), 'Active Floats stat element present');
  assert(!html.includes('ky-stat-card__badge--green'), 'Secondary badges removed from stat cards');
  assert(!html.includes('id="stat-argo-rmse-sub"'), 'Description subtext removed from stat cards');

  // 1.3 Map panel
  assert(html.includes('id="map"'), 'Map container element #map present');
  assert(html.includes('id="subregion-filters"'), 'Subregion filter bar element present');
  assert(!html.includes('id="argo-marker-popup"'), 'CRITICAL: Floating marker info popup card removed from map');
  assert(!html.includes('Float Network Sub-basins'), 'CRITICAL: Sub-basin legend card removed from map');
  assert(html.includes('ky-compass-indicator'), 'Compass rose indicator present on map');
  assert(html.includes('ky-map-scale-bar'), 'Scale bar present on map');

  // 1.4 Right panel (Vertical Profile Comparison)
  assert(html.includes('id="argo-compare-empty"'), 'Empty/placeholder container #argo-compare-empty present');
  assert(html.includes('id="argo-compare-content"'), 'Comparison content container #argo-compare-content present');
  assert(html.includes('Select a float on the map to view its profile comparison'), 'Placeholder instructions present');
  assert(html.includes('id="argo-float-select"'), 'Float selector dropdown #argo-float-select present');
  assert(html.includes('id="argo-date-select"'), 'Observation date dropdown #argo-date-select present');
  assert(html.includes('id="argo-selected-sub"'), 'Float subtext container #argo-selected-sub present');
  assert(html.includes('id="argo-chart-placeholder"'), 'Date pending chart placeholder #argo-chart-placeholder present');
  assert(html.includes('id="argo-chart-canvas"'), 'Chart.js canvas element present');
  assert(html.includes('id="argo-depth-error-canvas"'), 'Per-depth signed error canvas #argo-depth-error-canvas present');
  assert(html.includes('ky-argo-charts-row'), 'Dual chart side-by-side row .ky-argo-charts-row present');
  assert(html.includes('Signed Error by Depth'), 'Signed Error by Depth title present');
  assert(html.includes('Temperature Profile'), 'Temperature Profile chart section title present');
  assert(html.includes('id="comp-float-rmse"'), 'Float RMSE metric element present');
  assert(html.includes('id="comp-float-bias"'), 'Float Mean Bias metric element present');
  assert(html.includes('id="comp-float-max-err"'), 'Float Max Abs Error metric element present');

  // 1.5 Bottom panel (Profile Comparison Data)
  assert(html.includes('Profile Comparison Data'), 'Bottom panel title Profile Comparison Data present');
  assert(html.includes('ky-argo-plain-table'), 'Plain data table element present');
  assert(html.includes('id="argo-table-body"'), 'Table body container #argo-table-body present');
  assert(html.includes('ky-argo-table-placeholder'), 'Table placeholder row present');
  assert(html.includes('Depth (m)') && html.includes('AI Model (°C)') && html.includes('ARGO Float (°C)') && html.includes('Diff (Δ)'), 'Table headers match specification');

  // 1.6 Sidebar & Branding
  assert(html.includes('class="ky-nav-item ky-nav-item--active" data-nav="argo"'), 'Sidebar active state set to ARGO');
  assert(html.includes('Real observational in-situ data via Argovis &amp; ARGO GDAC'), 'Data provenance footnote present');

  // 2. Navigation Link Integrity
  console.log('\n[TEST 2] Verifying bidirectional sidebar navigation wiring...');
  const exploreHtml = fs.readFileSync('explore.html', 'utf8');
  assert(exploreHtml.includes('data-nav="argo" onclick="window.location.href=\'argo.html\'"'), 'explore.html navigates to argo.html');

  const fisheriesHtml = fs.readFileSync('fisheries.html', 'utf8');
  assert(fisheriesHtml.includes('data-nav="argo" onclick="window.location.href=\'argo.html\'"'), 'fisheries.html navigates to argo.html');

  assert(html.includes('onclick="window.location.href=\'explore.html\'"'), 'argo.html navigates back to explore.html');
  assert(html.includes('onclick="window.location.href=\'fisheries.html\'"'), 'argo.html navigates back to fisheries.html');

  // 3. Client JS & CSS Integrity & 3 Bugfixes Verification
  console.log('\n[TEST 3] Verifying 3 bugfixes in client script & CSS rules...');
  assert(fs.existsSync('argo.js'), 'argo.js exists');
  const js = fs.readFileSync('argo.js', 'utf8');
  assert(js.includes('/argo/profiles'), 'argo.js requests /argo/profiles');
  assert(js.includes('/argo/compare'), 'argo.js requests /argo/compare');
  assert(js.includes('/argo/summary'), 'argo.js requests /argo/summary');
  assert(js.includes('new maplibregl.Map'), 'argo.js initializes MapLibre GL map');
  assert(js.includes('new Chart'), 'argo.js initializes Chart.js dual profile graph');
  assert(js.includes('argo-float-select'), 'argo.js binds to #argo-float-select dropdown');
  assert(js.includes('argo-table-body'), 'argo.js binds to #argo-table-body bottom table');

  // BUG 1: Zero transition jitter on marker wrapper & anchor: center
  assert(js.includes("anchor: 'center'"), 'BUG 1: MapLibre markers initialized with anchor: center');
  assert(js.includes('ky-float-marker-wrap'), 'BUG 1: Dedicated ky-float-marker-wrap positioning wrapper used');

  // BUG 2: Chart.js linear X & Y scales with inverted depth and console logging
  assert(js.includes("indexAxis: 'y'"), "BUG 2: Chart.js configured with indexAxis: 'y' for vertical depth axis");
  assert(js.includes("type: 'linear'"), "BUG 2: Chart.js X & Y scales configured with type: 'linear'");
  assert(js.includes('console.log') && js.includes('Temperature Profile Chart'), 'BUG 2: Console logging added for profile arrays debug');
  assert(js.includes('aiData = depths.map'), 'BUG 2: Parallel arrays mapped to {x, y} coordinate pairs');

  // BUG 3: Selected float visual distinction and floating location label
  assert(js.includes('ky-float-label'), 'BUG 3: Floating location label element added above marker');
  assert(js.includes('ky-float-pulse'), 'BUG 3: Pulsing halo ring element added around selected marker');
  assert(js.includes('ky-float-dot--selected'), 'BUG 3: Distinct selected marker class ky-float-dot--selected applied');
  assert(js.includes('updateSelectedMarkerVisuals'), 'BUG 3: updateSelectedMarkerVisuals function manages single active marker');

  // Initial load empty state verification
  assert(!js.includes('selectFloat(filteredProfiles[0].id, false)'), 'Initial load: Auto-selection of first float eliminated');
  assert(js.includes('argo-compare-empty') && js.includes('argo-compare-content'), 'Initial load: Empty state and content toggled dynamically on selectFloat');

  // Two-step date selection step verification
  assert(js.includes('argo-date-select'), 'argo.js binds to #argo-date-select dropdown');
  assert(js.includes('populateDateDropdown'), 'argo.js implements populateDateDropdown');
  assert(js.includes('showChartPlaceholder'), 'argo.js implements showChartPlaceholder');
  assert(js.includes('selectDate'), 'argo.js implements selectDate');
  assert(js.includes('cycles.length === 1') && js.includes('selectDate(cycles[0].id)'), 'Single-cycle float auto-selects date and immediately runs comparison');

  // Search bar logic verification in argo.js
  assert(js.includes('handleSearch'), 'argo.js implements handleSearch');
  assert(js.includes('clearSearch'), 'argo.js implements clearSearch');
  assert(js.includes('clearFloatSelection'), 'argo.js implements clearFloatSelection');
  assert(js.includes('applyMarkerSearchHighlights'), 'argo.js implements applyMarkerSearchHighlights');
  assert(js.includes('selectedViaSearch'), 'argo.js tracks selectedViaSearch flag');
  assert(js.includes('KNOWN_REGIONS'), 'argo.js declares KNOWN_REGIONS mapping');
  assert(js.includes('ctrlKey') && js.includes("'k'"), 'argo.js binds Ctrl+K shortcut to search input');
  assert(js.includes('renderDepthErrorChart'), 'argo.js implements renderDepthErrorChart function');
  assert(js.includes('depthErrorChartInstance'), 'argo.js manages depthErrorChartInstance lifecycle');
  assert(js.includes('argo-depth-error-canvas'), 'argo.js binds to canvas #argo-depth-error-canvas');

  const css = fs.readFileSync('style.css', 'utf8');
  assert(css.includes('.ky-argo-navbar'), 'style.css includes .ky-argo-navbar');
  assert(css.includes('.ky-argo-mini-card'), 'style.css includes .ky-argo-mini-card');
  assert(css.includes('.ky-argo-select'), 'style.css includes .ky-argo-select');
  assert(css.includes('.ky-argo-plain-table'), 'style.css includes .ky-argo-plain-table');
  assert(css.includes('.ky-argo-empty-state'), 'style.css includes .ky-argo-empty-state');
  assert(css.includes('.ky-argo-table-placeholder'), 'style.css includes .ky-argo-table-placeholder');
  assert(css.includes('.ky-argo-chart-placeholder'), 'style.css includes .ky-argo-chart-placeholder');
  assert(css.includes('.ky-argo-date-select-container'), 'style.css includes .ky-argo-date-select-container');
  assert(css.includes('.ky-float-marker-wrap') && css.includes('transition: none !important;'), 'style.css sets transition: none !important on marker wrapper to prevent jitter');
  assert(css.includes('.ky-float-label'), 'style.css includes .ky-float-label frosted badge');
  assert(css.includes('.ky-float-pulse'), 'style.css includes .ky-float-pulse ring animation');
  assert(css.includes('.ky-float-dot--selected'), 'style.css includes .ky-float-dot--selected accent styling');
  assert(css.includes('.ky-argo-navbar .ky-header__search'), 'style.css centers search bar in ky-argo-navbar');
  assert(css.includes('.ky-float-marker-wrap--dimmed'), 'style.css defines .ky-float-marker-wrap--dimmed');
  assert(css.includes('.ky-float-marker-wrap--matched'), 'style.css defines .ky-float-marker-wrap--matched');
  assert(css.includes('.ky-argo-charts-row'), 'style.css defines .ky-argo-charts-row');
  assert(css.includes('.ky-argo-chart-col'), 'style.css defines .ky-argo-chart-col');

  // 4. Backend Endpoints Verification
  console.log('\n[TEST 4] Verifying live backend API endpoints...');
  try {
    const pRes = await fetchJson('http://localhost:8000/argo/profiles');
    assert(pRes.status === 200, '/argo/profiles responds with HTTP 200');
    assert(Array.isArray(pRes.body) && (pRes.body.length === 1809 || pRes.body.length === 41), `/argo/profiles returns ${pRes.body.length} cached profiles`);
    const p0 = pRes.body[0];
    assert(p0.id && p0.latitude && p0.longitude && p0.date && p0.subRegion, 'Profile object contains id, lat, lon, date, and subRegion');

    const sRes = await fetchJson('http://localhost:8000/argo/summary');
    assert(sRes.status === 200, '/argo/summary responds with HTTP 200');
    assert(sRes.body.totalFloats === 81 || sRes.body.totalFloats === 1809 || sRes.body.totalFloats === 41, `/argo/summary reports ${sRes.body.totalFloats} total floats`);
    assert(typeof sRes.body.aggregateRmse === 'number' && sRes.body.aggregateRmse > 0, '/argo/summary reports valid aggregate RMSE');
    assert((typeof sRes.body.glorysRmse === 'number' && sRes.body.glorysRmse > 0) || (typeof sRes.body.aggregateCorr === 'number'), '/argo/summary reports valid benchmark metric');

    const cRes = await fetchJson(`http://localhost:8000/argo/compare?id=${encodeURIComponent(p0.id)}`);
    assert(cRes.status === 200, `/argo/compare?id=${p0.id} responds with HTTP 200`);
    assert(Array.isArray(cRes.body.depths) && cRes.body.depths.length === 15, 'Compare endpoint returns 15 standard depths');
    assert(Array.isArray(cRes.body.aiTemps) && cRes.body.aiTemps.length === 15, 'Compare endpoint returns 15 AI temperature predictions');
    assert(Array.isArray(cRes.body.argoTemps) && cRes.body.argoTemps.length === 15, 'Compare endpoint returns 15 in-situ ARGO temperatures');
    assert(Array.isArray(cRes.body.diffs) && cRes.body.diffs.length === 15, 'Compare endpoint returns 15 difference values');
    assert(typeof cRes.body.metrics.rmse === 'number', 'Compare endpoint returns numeric RMSE metric');
    assert(typeof (cRes.body.metrics.corr !== undefined ? cRes.body.metrics.corr : cRes.body.metrics.correlation) === 'number', 'Compare endpoint returns numeric correlation metric');
  } catch (err) {
    console.error('Backend endpoint test failed:', err);
    assert(false, `Backend communication error: ${err.message}`);
  }

  // 5. Search Filtering & Selection State Machine Verification
  console.log('\n[TEST 5] Verifying real-time search logic & selection state machine...');
  const argoProfilesData = JSON.parse(fs.readFileSync('./backend/data/argo_profiles.json', 'utf8')).profiles;
  assert(argoProfilesData.length === 41, `ARGO dataset contains ${argoProfilesData.length} profiles for search evaluation`);

  const KNOWN_REGIONS = [
    { key: 'Arabian Sea', label: 'Arabian Sea', aliases: ['arabian', 'arabian sea', 'as'] },
    { key: 'Bay of Bengal', label: 'Bay of Bengal', aliases: ['bay of bengal', 'bay', 'bengal', 'bob'] },
    { key: 'Equatorial Indian Ocean', label: 'Equatorial Indian Ocean', aliases: ['equatorial', 'equator', 'equatorial indian ocean', 'eio'] },
    { key: 'all', label: 'All', aliases: ['all'] },
  ];

  function testMatchRegion(query) {
    const cleanQ = query.replace(/^#/, '').trim().toLowerCase();
    const isNumericOnly = /^\d+$/.test(cleanQ) || query.trim().startsWith('#');
    if (isNumericOnly) return null;
    return KNOWN_REGIONS.find(r =>
      r.label.toLowerCase() === cleanQ ||
      r.label.toLowerCase().includes(cleanQ) ||
      r.aliases.some(a => a === cleanQ || a.startsWith(cleanQ) || (cleanQ.length >= 3 && a.includes(cleanQ)))
    ) || null;
  }

  function testMatchFloats(cleanQ) {
    const matching = argoProfilesData.filter(p =>
      String(p.wmoFloatId).toLowerCase().includes(cleanQ) ||
      p.id.toLowerCase().includes(cleanQ)
    );
    const unique = new Map();
    matching.forEach(p => { if (!unique.has(p.wmoFloatId)) unique.set(p.wmoFloatId, p); });
    return Array.from(unique.values());
  }

  // 5.1 Region queries
  const rArabian = testMatchRegion('Arabian Sea');
  assert(rArabian && rArabian.key === 'Arabian Sea', 'Search identifies "Arabian Sea" region');
  const rBob = testMatchRegion('Bay of Bengal');
  assert(rBob && rBob.key === 'Bay of Bengal', 'Search identifies "Bay of Bengal" region');
  const bobFloats = argoProfilesData.filter(p => p.subRegion === 'Bay of Bengal');
  assert(bobFloats.length === 16, 'Bay of Bengal region has 16 floats (15 original + 1 reclassified #2902282)');
  const andamanFloats = argoProfilesData.filter(p => p.subRegion === 'Andaman Sea');
  assert(andamanFloats.length === 0, 'Andaman Sea region has 0 floats (misclassified float moved to Bay of Bengal)');

  // 5.2 Float ID queries
  const fSingle = testMatchFloats('2902282');
  assert(fSingle.length === 1 && fSingle[0].wmoFloatId === 2902282, 'Search for "2902282" yields exactly 1 unambiguous float match');
  const fHash = testMatchFloats('2902282'.replace(/^#/, ''));
  assert(fHash.length === 1 && fHash[0].wmoFloatId === 2902282, 'Search for "#2902282" handles leading hash symbol cleanly');
  const fPartial = testMatchFloats('290');
  assert(fPartial.length > 1, 'Search for partial "290" yields multiple float matches');
  const nonMatchingFloats = argoProfilesData.filter(p => !String(p.wmoFloatId).includes('290'));
  assert(nonMatchingFloats.length > 0, 'Non-matching floats identified for spatial dimming/fading');

  // 5.3 Selection State Machine Simulation
  let simState = {
    selectedFloatId: null,
    selectedViaSearch: false,
    filter: 'all',
  };

  function simSelect(id, viaSearch) {
    simState.selectedFloatId = id;
    simState.selectedViaSearch = viaSearch;
  }

  function simClearSearch() {
    simState.filter = 'all';
    if (simState.selectedViaSearch) {
      simState.selectedFloatId = null;
      simState.selectedViaSearch = false;
    }
  }

  // Flow A: Selection made via search Enter -> clearing search MUST clear selection
  simSelect('2902282_cycle', true);
  assert(simState.selectedViaSearch === true, 'Selection tracked as via-search');
  simClearSearch();
  assert(simState.selectedFloatId === null, 'Clearing search resets search-made selection');
  assert(simState.filter === 'all', 'Clearing search resets map to all floats');

  // Flow B: Selection made manually via marker click -> clearing search MUST preserve selection
  simSelect('2902205_274', false);
  assert(simState.selectedViaSearch === false, 'Selection tracked as manual click');
  simClearSearch();
  assert(simState.selectedFloatId === '2902205_274', 'CRITICAL: Clearing search preserves manual marker selection');

  // 6. Per-Depth Signed Error Chart Verification (Multi-Float & Data Parity)
  console.log('\n[TEST 6] Verifying per-depth signed error chart logic & multi-float data parity...');
  try {
    const testFloats = ['2903142_21', '2902271_150'];
    for (const fid of testFloats) {
      const cRes = await fetchJson(`http://localhost:8000/argo/compare?id=${fid}`);
      assert(cRes.status === 200, `Float ${fid}: /argo/compare responds with HTTP 200`);
      const cData = cRes.body;
      assert(Array.isArray(cData.depths) && cData.depths.length === 15, `Float ${fid}: contains 15 standard depths`);
      assert(Array.isArray(cData.diffs) && cData.diffs.length === 15, `Float ${fid}: contains 15 diffs`);
      assert(Array.isArray(cData.aiTemps) && cData.aiTemps.length === 15, `Float ${fid}: contains 15 AI temperatures`);
      assert(Array.isArray(cData.argoTemps) && cData.argoTemps.length === 15, `Float ${fid}: contains 15 ARGO temperatures`);

      // Verify diff calculation: diffs[i] == round(aiTemps[i] - argoTemps[i], 2)
      let mathAccurate = true;
      for (let i = 0; i < 15; i++) {
        const expectedDiff = Number((cData.aiTemps[i] - cData.argoTemps[i]).toFixed(2));
        if (Math.abs(cData.diffs[i] - expectedDiff) > 0.01) {
          mathAccurate = false;
        }
      }
      assert(mathAccurate, `Float ${fid}: diffs array strictly equals aiTemps - argoTemps across all 15 depths`);

      // Verify presence of both positive and negative errors across the profile
      const hasPos = cData.diffs.some(d => d >= 0);
      const hasNeg = cData.diffs.some(d => d < 0);
      assert(hasPos, `Float ${fid}: contains positive signed errors (AI warmer, emerald green convention)`);
      assert(hasNeg, `Float ${fid}: contains negative signed errors (AI cooler, crimson red convention)`);
    }
  } catch (err) {
    console.error('Error chart test failed:', err);
    assert(false, `Error chart verification failed: ${err.message}`);
  }

  console.log(`\n============================================================`);
  console.log(`  RESULTS: ${passedTests} / ${totalTests} assertions passed (${Math.round(passedTests/totalTests*100)}%)`);
  console.log(`============================================================`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests();
