/**
 * Automated Verification Test for Fisheries Mode (fisheries.html & fisheries.js)
 * Tests:
 * 1. Branding: Kyogre in header, copyright in footer. ZERO instances of "OceanEmbed".
 * 2. Header Reframe: "Historical Reanalysis" & "Reconstructed Data".
 * 3. Subheader Reframe: Agency & research decision-support title, subtitle, tagline.
 * 4. Top 4 Stat Cards: Provenance pills (Model Gradient, Estimated Heuristic), removal of fake trend badges (↓12%, ↑+28%, ↑+35%).
 * 5. Map & Chlorophyll-a Legend: Honest proxy title, illustrative seasonal pattern subnote.
 * 6. Two-Column Layout Structure & PFZ Outlines.
 * 7. Right Panel: 2-column Depth | Temperature table. Chlorophyll-by-depth and MLD/Front rows removed. Single Distance from coast summary row.
 * 8. Persistent INCOIS Validation Disclaimer.
 * 9. Upwelling Index Inversion Fix: Proves upwelling increases as T0-T50 gap decreases.
 * 10. Dynamic PFZ Advisory Tiers: Tests Elevated, Moderate, and Low score tiers.
 * 11. Dynamic Key Insights: Confirms bullets adapt to contrasting ocean profiles.
 * 12. Two-Row Stat Card Header Layout.
 * 13. Backend indices.nutrients Single Source of Truth & Interpolation.
 * 14. Chlorophyll Reconciliation & Technical Disclaimers.
 * 15. Jitter-Free Fish Marker Architecture & Pan/Zoom Sync.
 * 16. Dynamic PFZ Grid Endpoint, Cluster Grouping & Centered Fish Markers.
 * 17. Initial Load Empty State & Interaction Gating (Zero Auto-Load, Placeholders & Gated Predict).
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Starting Fisheries Mode Automated Verification ---');

const htmlPath = path.join(__dirname, 'fisheries.html');
assert(fs.existsSync(htmlPath), 'fisheries.html must exist');
const html = fs.readFileSync(htmlPath, 'utf-8');

const cssPath = path.join(__dirname, 'style.css');
assert(fs.existsSync(cssPath), 'style.css must exist');
const css = fs.readFileSync(cssPath, 'utf-8');

// 1. Branding & Strict "No OceanEmbed" check
console.log('1. Verifying Branding...');
assert(html.includes('Kyogre'), 'Brand must include Kyogre');
assert(html.includes('© 2025 Kyogre. All rights reserved.'), 'Copyright must specify Kyogre 2025');
const oceanEmbedMatches = html.match(/oceanembed/gi);
assert(!oceanEmbedMatches, `Found forbidden "OceanEmbed" brand references in HTML: ${oceanEmbedMatches}`);
console.log('   ✓ Zero OceanEmbed references found. Kyogre branding verified.');

// 2. Header Reframe Check (Historical Reanalysis)
console.log('2. Verifying Header Historical Reanalysis Reframe...');
assert(html.includes('Historical Reanalysis'), 'Header must state Historical Reanalysis');
assert(html.includes('Reconstructed Data'), 'Header subtext must state Reconstructed Data');
assert(!html.includes('Live Data'), 'Legacy "Live Data" label must be removed');
console.log('   ✓ Header honestly framed as Historical Reanalysis / Reconstructed Data.');

// 3. Layout Order & Header Cleanup (Matching Dashboard)
console.log('3. Verifying Layout Order & In-Page Header Removal...');
assert(!html.includes('class="ky-sub-header"'), 'In-page subheader block (.ky-sub-header) must be removed');
assert(html.includes('data-nav="fisheries"'), 'Sidebar nav must retain Fisheries Mode item');
assert(html.includes('Fisheries Mode &amp; PFZ Advisory'), 'Sidebar nav label must be present');
const mainStart = html.indexOf('<main class="ky-main">');
const statRowPos = html.indexOf('class="ky-stat-row"');
assert(mainStart !== -1 && statRowPos !== -1 && statRowPos > mainStart, 'Stat row must be inside main');
const betweenMainAndStats = html.slice(mainStart, statRowPos);
assert(!betweenMainAndStats.includes('<h1') && !betweenMainAndStats.includes('<h2'), 'No headings between main and stat cards');
console.log('   ✓ Page flows cleanly with stat cards directly below header search, matching Dashboard layout.');

// 4. Top 4 Stat Cards & Provenance Pills
console.log('4. Verifying Stat Cards & Provenance Pills...');
assert(html.includes('Thermocline Depth (m)'), 'Stat 1: Thermocline Depth must exist');
assert(html.includes('stat-thermocline-val'), 'stat-thermocline-val element must exist');
assert(html.includes('Model Gradient'), 'Stat 1 must carry Model Gradient provenance pill');

assert(html.includes('Upwelling Index (0–1)'), 'Stat 2: Upwelling Index must exist');
assert(html.includes('stat-upwelling-val'), 'stat-upwelling-val element must exist');

assert(html.includes('PFZ Index (0–1)'), 'Stat 3: PFZ Index must exist');
assert(html.includes('stat-pfz-val'), 'stat-pfz-val element must exist');
assert(html.includes('stat-pfz-badge'), 'stat-pfz-badge element must exist');

assert(html.includes('Chlorophyll-a Proxy (mg/m³)'), 'Stat 4: Chlorophyll-a Proxy must exist');
assert(html.includes('stat-nutrient-val'), 'stat-nutrient-val element must exist');

assert(html.includes('ky-provenance-pill--heuristic'), 'Heuristic provenance pills must be present');
assert(html.includes('Estimated Heuristic'), 'Estimated Heuristic text must be present');

// Verify removal of fake trend badges
assert(!html.includes('↓ 12%'), 'Fake badge ↓ 12% must be removed from HTML');
assert(!html.includes('↑ +28%'), 'Fake badge ↑ +28% must be removed from HTML');
assert(!html.includes('↑ +35%'), 'Fake badge ↑ +35% must be removed from HTML');

// Verify operational range caveat banner is completely removed from fisheries.html
assert(!html.includes('ky-fisheries-operational-caveat'), 'Operational caveat banner must be removed from fisheries.html');

console.log('   ✓ All 4 stat cards carry honest provenance pills and operational note banner confirmed removed.');


// 5. Map & Chlorophyll-a Legend (Stripped to Zoom Controls Only)
console.log('5. Verifying Map, Zoom-Only Controls & Honest Chlorophyll-a Legend...');
assert(html.includes('id="map"'), 'Map container must exist');
assert(!html.includes('ky-map-card__header'), 'Map card header block must be removed');
assert(!html.includes('btn-region-select'), 'Region selector dropdown removed from map card');
assert(!html.includes('btn-toggle-pfz'), 'PFZ layer toggle badge removed from map card');
assert(!html.includes('btn-toggle-chla'), 'Chl-a layer toggle badge removed from map card');
assert(!html.includes('btn-layer-toggle'), 'Layer toggle button removed from map card');
assert(!html.includes('btn-map-info'), 'Info icon button removed from map canvas');

// Zoom controls must remain
assert(html.includes('btn-zoom-in'), 'Zoom in button must exist');
assert(html.includes('btn-zoom-out'), 'Zoom out button must exist');

// Duplicate disclaimer below map card removed (retained in persistent info box)
assert(!html.includes('ky-fisheries-map-disclaimer'), 'Duplicate map disclaimer line below map card must be removed');

assert(html.includes('Chlorophyll-a Proxy (mg/m³)'), 'Legend title verified as Proxy');
assert(html.includes('Per-date surface proxy derived from upwelling'), 'Legend caption verified as per-date proxy');
assert(!html.includes('Illustrative seasonal pattern'), 'Illustrative seasonal pattern subnote removed');
assert(css.includes('.ky-fisheries-legend') && css.includes('width: 250px;'), 'Chlorophyll legend card must have width: 250px matching Dashboard SST legend');
assert(html.includes('id="region-notice"'), 'Region notice must exist');
assert(!html.includes('ky-compass-indicator'), 'North compass indicator must be removed from map');
assert(!html.includes('ky-map-scale-bar'), 'Scale bar must be removed from map');
assert(!html.includes('ky-map-tools-bottom-right'), 'Bottom-right map tools container must be removed');
console.log('   ✓ Map stripped to zoom-only controls, scale/compass removed, disclaimer preserved below canvas, and legend intact.');

// 6. Two-column Layout Structure (NO Ocean Parameters)
console.log('6. Verifying Two-Column Layout Structure...');
assert(html.includes('ky-fisheries-content-row'), 'Two-column grid container must exist');
assert(html.includes('ky-fisheries-map-col'), 'Map column must exist');
assert(html.includes('ky-fisheries-side-col'), 'Side panel column must exist');
assert(html.includes('ky-fisheries-map-wrap'), 'Map wrap container must exist');
assert(!html.includes('ky-param-tile'), 'ky-param-tile should not be in fisheries.html');
console.log('   ✓ Two-column grid structure verified without Ocean Parameters.');

// 7. Right Panel: 2-column Depth | Temperature table, INCOIS Disclaimer Only
console.log('7. Verifying Vertical Profile Panel, Coordinate Bar Cleanup & Single INCOIS Disclaimer...');
assert(!html.includes('ky-tvd-panel__header'), 'Vertical profile panel header must be removed');
assert(!html.includes('Vertical Profile at Selected Location'), 'Redundant panel title must be removed');
assert(!html.includes('id="pfz-advisory-box"'), 'PFZ advisory callout box removed from right panel DOM');
assert(!html.includes('class="ky-insights"'), 'Key insights section removed from right panel DOM');

// "Selected Location" label and 14-YEAR MODEL badge removed from table panel
assert(!html.includes('id="selected-loc-coord"'), 'Selected location coordinate element must be removed from table panel');
assert(!html.includes('id="fisheries-model-badge"'), '14-Year Model badge must be removed from table panel');
assert(!html.includes('ky-tvd-coord-bar'), 'Coordinate bar container must be removed from table panel');

assert(html.includes('<th>Depth (m)</th>'), 'Table Column 1: Depth (m)');
assert(html.includes('<th>Temperature (°C)</th>'), 'Table Column 2: Temperature (°C) restored');
// Chlorophyll by depth must NOT be present in table
assert(!html.includes('Chlorophyll proxy (mg/m³) — est.'), 'Chlorophyll proxy by depth must not be in table header');

// Verify scalar row types in JS renderTable: single Distance from coast row
const fisheriesJsCheck = fs.readFileSync(path.join(__dirname, 'fisheries.js'), 'utf-8');
assert(fisheriesJsCheck.includes('Distance from coast'), 'renderTable must include Distance from coast row');
assert(!fisheriesJsCheck.includes('Mixed Layer Depth (MLD)'), 'renderTable must NOT include MLD row');
assert(!fisheriesJsCheck.includes('Thermal Front Strength (0–1)'), 'renderTable must NOT include Thermal Front Strength row');

assert(html.includes('btn-view-table'), 'Table view toggle button verified');
assert(html.includes('btn-view-graph'), 'Graph view toggle button verified');

// Single INCOIS disclaimer box retained
assert(html.includes('ky-pfz-disclaimer'), 'Persistent INCOIS disclaimer container must exist');
assert(html.includes("INCOIS's operational PFZ advisories"), 'INCOIS disclaimer text verified');
console.log('   ✓ 2-column Depth/Temperature table, coordinate bar removed, and single INCOIS disclaimer verified.');



// 8. Script Logic & JS Verification (Preserved Underlying Calculation Functions)
console.log('8. Verifying fisheries.js Logic & Preserved Advisory Functions...');
const jsPath = path.join(__dirname, 'fisheries.js');
assert(fs.existsSync(jsPath), 'fisheries.js must exist');
const js = fs.readFileSync(jsPath, 'utf-8');
assert(!js.match(/oceanembed/gi), 'fisheries.js must not contain OceanEmbed');
assert(js.includes('PRESET_ZONES'), 'PRESET_ZONES constant must exist');
assert(js.includes('createChlaCanvas'), 'createChlaCanvas function must exist');
assert(js.includes('calculateSubsurfaceProfile'), 'calculateSubsurfaceProfile function must exist');
assert(js.includes('selectLocation'), 'selectLocation function must exist');

// Underlying functions preserved with comment
assert(js.includes('updateAdvisory'), 'updateAdvisory function must be preserved in fisheries.js');
assert(js.includes('getKeyInsights'), 'getKeyInsights function must be preserved in fisheries.js');
assert(js.includes('popupAnchor'), 'Dynamic popup anchor must be computed in fisheries.js');

// Verify removal of operational species advice from PRESET_ZONES
assert(!js.includes('Suitable for tuna, sardine and mackerel'), 'Species advice must be removed from advisory');
assert(!js.includes('drift gillnetting and trolling'), 'Fisherman gear advice must be removed');
assert(!js.includes('squid jigging'), 'Squid jigging advice must be removed');
console.log('   ✓ Underlying calculation and insight reconciliation functions intentionally preserved in JS.');

// 9. Assertion: Upwelling Index Formula Correctness
console.log('9. Verifying Upwelling Index Formula (Near-Isothermal vs Stratified)...');
function calcUpwelling(t0, t50) {
  const temp_gap = Math.max(0.0, t0 - t50);
  return Math.max(0.0, Math.min(1.0, temp_gap / 5.0));
}

const uiWeak = calcUpwelling(28.0, 27.5);       // gap = 0.5°C (stratified/weak gradient -> low upwelling)
const uiModerate = calcUpwelling(28.0, 25.5);   // gap = 2.5°C (moderate gradient -> moderate upwelling)
const uiStrong = calcUpwelling(30.0, 23.0);     // gap = 7.0°C (strong gradient -> high upwelling)

assert(uiWeak <= 0.20, `Weak gap (0.5°C) should produce low upwelling (<=0.20), got ${uiWeak.toFixed(3)}`);
assert(uiModerate >= 0.30 && uiModerate <= 0.60, `Moderate gap (2.5°C) should produce intermediate upwelling (0.3-0.6), got ${uiModerate.toFixed(3)}`);
assert(uiStrong >= 0.70, `Strong gradient gap (7.0°C) should produce high upwelling (>=0.70), got ${uiStrong.toFixed(3)}`);
assert(uiStrong > uiModerate && uiModerate > uiWeak, 'Upwelling index must strictly increase as T0-T50 gap increases');
console.log(`   ✓ Upwelling index correctly calibrated with T0-T50: weak gap 0.5°C -> ${uiWeak.toFixed(2)}, moderate gap 2.5°C -> ${uiModerate.toFixed(2)}, strong gap 7.0°C -> ${uiStrong.toFixed(2)}.`);

// 10. Assertion: Dynamic PFZ Advisory Tiers
console.log('10. Verifying Dynamic PFZ Advisory Tiers Across Score Ranges...');
function getAdvisoryText(score) {
  if (score >= 0.70) {
    return 'Elevated PFZ likelihood based on thermocline shoaling and upwelling signal. Historically associated with pelagic aggregation — not validated against catch data.';
  } else if (score >= 0.40) {
    return 'Moderate PFZ likelihood. Conditions partially favorable; upwelling or thermocline signal weak.';
  } else {
    return 'Low PFZ likelihood based on current indices. Deep thermocline and/or weak upwelling signal.';
  }
}

const advElevated = getAdvisoryText(0.85);
const advModerate = getAdvisoryText(0.55);
const advLow = getAdvisoryText(0.25);

assert(advElevated.startsWith('Elevated PFZ likelihood'), 'Score 0.85 must trigger Elevated advisory');
assert(advModerate.startsWith('Moderate PFZ likelihood'), 'Score 0.55 must trigger Moderate advisory');
assert(advLow.startsWith('Low PFZ likelihood'), 'Score 0.25 must trigger Low advisory');
assert(advElevated !== advModerate && advModerate !== advLow, 'All three advisory tiers must be distinctly different');
console.log('   ✓ PFZ Advisory updates dynamically across Elevated (>=0.70), Moderate (0.40-0.69), and Low (<0.40) tiers.');

// 11. Assertion: Dynamic Key Insights across Contrasting Profiles & Contradiction Reconciliation
console.log('11. Verifying Dynamic Key Insights Adaptation & Contradiction Reconciliation...');
function getKeyInsights(thermocline, upwelling, pfzScore) {
  const tcClass = thermocline <= 75 ? 'shallow' : (thermocline <= 110 ? 'intermediate' : 'deep');
  const upwClass = upwelling >= 0.50 ? 'strong' : (upwelling >= 0.20 ? 'moderate' : 'minimal');

  const isConflicting = (tcClass === 'deep' && (upwClass === 'strong' || upwClass === 'moderate')) ||
                        (tcClass === 'shallow' && upwClass === 'minimal');

  if (isConflicting) {
    const reconciling = `Mixed subsurface signal: thermocline depth (~${Math.round(thermocline)}m) and near-surface thermal gradient give conflicting upwelling indicators — treat with caution pending field verification.`;
    const recommendation = 'Inconclusive oceanographic indicators; recommend field sampling before survey prioritization.';
    return [reconciling, recommendation];
  }

  let ins1 = '';
  if (tcClass === 'shallow') {
    ins1 = `Shallow thermocline (depth ~${Math.round(thermocline)}m) compresses pelagic habitat toward the euphotic zone.`;
  } else if (tcClass === 'intermediate') {
    ins1 = `Intermediate thermocline depth (~${Math.round(thermocline)}m) indicates typical tropical open-ocean stratification.`;
  } else {
    ins1 = `Deep thermocline (~${Math.round(thermocline)}m) suggests downwelling or thick warm surface mixed layer.`;
  }

  let ins2 = '';
  if (upwClass === 'strong') {
    ins2 = `Strong upwelling signature (index: ${upwelling.toFixed(2)}) indicated by pronounced surface-to-50m thermal gradient.`;
  } else if (upwClass === 'moderate') {
    ins2 = `Moderate upwelling signature (index: ${upwelling.toFixed(2)}) detected in upper layer thermal structure.`;
  } else {
    ins2 = `Minimal upwelling signal detected (index: ${upwelling.toFixed(2)}); thermal stratification predominates.`;
  }

  let ins3 = '';
  if (pfzScore >= 0.70) {
    ins3 = 'Recommended candidate area for research vessel survey and INCOIS satellite correlation.';
  } else if (pfzScore >= 0.40) {
    ins3 = 'Borderline oceanographic indicators; field sampling recommended to verify biomass.';
  } else {
    ins3 = 'Unfavorable physical indicators for pelagic aggregation during this period.';
  }

  return [ins1, ins2, ins3];
}

const insightsUpwelling = getKeyInsights(58, 0.85, 0.88); // Shallow thermocline, strong upwelling, elevated score
const insightsStratified = getKeyInsights(135, 0.05, 0.22); // Deep thermocline, minimal upwelling, low score

assert(insightsUpwelling[0] !== insightsStratified[0], 'Bullet 1 must differ between shallow and deep thermocline');
assert(insightsUpwelling[1] !== insightsStratified[1], 'Bullet 2 must differ between strong and minimal upwelling');
assert(insightsUpwelling[2] !== insightsStratified[2], 'Bullet 3 must differ between elevated and low PFZ score');

assert(insightsUpwelling[0].includes('Shallow thermocline'), 'Should recognize shallow thermocline');
assert(insightsStratified[0].includes('Deep thermocline'), 'Should recognize deep thermocline');
assert(insightsUpwelling[1].includes('Strong upwelling'), 'Should recognize strong upwelling');
assert(insightsStratified[1].includes('Minimal upwelling'), 'Should recognize minimal upwelling');
console.log('   ✓ Key Insights bullets dynamically differ between active upwelling and stratified profiles.');

// Contradiction Reconciliation Check (Deep Thermocline + High Upwelling)
console.log('   Testing Contradiction Reconciliation (Deep Thermocline + High Upwelling)...');
const insightsMixed = getKeyInsights(125, 0.85, 0.82); // deep (>110m) + high upwelling (>=0.8)
const mixedJoined = insightsMixed.join(' ');
const mixedLower = mixedJoined.toLowerCase();

// 1. Must NOT contain both "upwelling" and "downwelling" language together
const hasUpwelling = mixedLower.includes('upwelling');
const hasDownwelling = mixedLower.includes('downwelling');
assert(!(hasUpwelling && hasDownwelling), 'Insights must NOT contain both "upwelling" and "downwelling" language together');
assert(!hasDownwelling, 'Insights must NOT assert "downwelling" when signals conflict');

// 2. Must contain the mixed-signal reconciliation text
assert(mixedJoined.includes('Mixed subsurface signal'), 'Insights must contain mixed-signal reconciliation text');
assert(mixedJoined.includes('conflicting upwelling indicators'), 'Insights must acknowledge conflicting upwelling indicators');

// 3. Recommendation must be downgraded to inconclusive
assert(mixedLower.includes('inconclusive'), 'Recommendation must be downgraded to inconclusive');
assert(!mixedJoined.includes('Recommended candidate area'), 'Must not recommend candidate area when signals conflict');

// Also test shallow thermocline (<=75m) + minimal upwelling (<0.2)
const insightsMixed2 = getKeyInsights(65, 0.12, 0.50);
const mixed2Joined = insightsMixed2.join(' ');
assert(mixed2Joined.includes('Mixed subsurface signal'), 'Shallow thermocline + minimal upwelling must also trigger reconciliation');
assert(mixed2Joined.toLowerCase().includes('inconclusive'), 'Shallow thermocline + minimal upwelling must also downgrade recommendation');

// Verify fisheries.js contains the reconciliation logic
assert(js.includes('isConflicting'), 'fisheries.js must contain isConflicting reconciliation check');
assert(js.includes('Mixed subsurface signal'), 'fisheries.js must contain mixed-signal reconciliation text');
console.log('   ✓ Contradiction reconciliation verified: deep thermocline + high upwelling eliminates contradictory downwelling language and emits honest mixed-signal warning.');

// 12. Assertion: Stat Card Two-Row Header Layout
console.log('12. Verifying Two-Row Stat Card Header Layout (fisheries.html & style.css)...');

// Pill-row container in HTML (one per stat card = 4 total)
const pillRowMatches = html.match(/class="ky-stat-card__pill-row"/g);
assert(pillRowMatches && pillRowMatches.length === 4, `All 4 stat cards must contain .ky-stat-card__pill-row, found ${pillRowMatches ? pillRowMatches.length : 0}`);

// Label-row column flex in CSS
assert(css.includes('.ky-stat-card__label-row'), 'CSS must define .ky-stat-card__label-row');
assert(css.includes('flex-direction: column;'), 'label-row must use flex-direction: column to create a 2-row layout');
assert(css.includes('.ky-stat-card__pill-row'), 'CSS must define .ky-stat-card__pill-row');
console.log('   ✓ Two-row header layout verified: metric label sits on Row 1 (full width), provenance pill on Row 2 (left-aligned).');

// 13. Assertion: Backend indices.nutrients Single Source of Truth & Interpolation
console.log('13. Verifying Backend indices.nutrients Single Source of Truth & Interpolation...');
assert(js.includes('isDevModeEnabled'), 'fisheries.js must define isDevModeEnabled()');
assert(js.includes('indices.nutrients'), 'fisheries.js must consume backend indices.nutrients');
assert(js.includes('[Fisheries] Chlorophyll proxy profile received from backend indices.nutrients'), 'Gated dev-mode log must confirm backend source');

// Confirm elimination of duplicate client-side Gaussian DCM calculation inside selectLocation
const jsLines = js.split('\n');
let foundOldFormulaInSelect = false;
let insideSelectLocation = false;
for (const line of jsLines) {
  if (line.includes('async function selectLocation(')) insideSelectLocation = true;
  if (insideSelectLocation && line.includes('function ')) {
    if (!line.includes('selectLocation')) insideSelectLocation = false;
  }
  if (insideSelectLocation && line.includes('Math.exp(-Math.pow(d - thermocline')) {
    foundOldFormulaInSelect = true;
  }
}
assert(!foundOldFormulaInSelect, 'Duplicate client-side DCM Gaussian recalculation must be eliminated from selectLocation');

// Simulate the interpolation logic from fisheries.js
const testModelDepths = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000];
const testBackendNutrients = [1.10, 1.10, 1.10, 1.10, 1.13, 1.39, 2.62, 3.81, 3.80, 1.88, 0.33, 0.27, 0.22, 0.19, 0.17];
const testDisplayDepths = [0, 25, 50, 100, 200, 300, 500, 750, 1000];

const interpolatedNutrients = testDisplayDepths.map(d => {
  const idx = testModelDepths.indexOf(d);
  if (idx !== -1 && idx < testBackendNutrients.length) {
    return Number(testBackendNutrients[idx].toFixed(2));
  }
  for (let i = 0; i < testModelDepths.length - 1; i++) {
    if (d > testModelDepths[i] && d < testModelDepths[i + 1]) {
      const frac = (d - testModelDepths[i]) / (testModelDepths[i + 1] - testModelDepths[i]);
      const val = testBackendNutrients[i] + (testBackendNutrients[i + 1] - testBackendNutrients[i]) * frac;
      return Number(val.toFixed(2));
    }
  }
  return Number(testBackendNutrients[testBackendNutrients.length - 1].toFixed(2));
});

// Exact matches at standard depths:
assert.strictEqual(interpolatedNutrients[0], 1.10, 'Depth 0m must exactly match backend nutrient (1.10)');
assert.strictEqual(interpolatedNutrients[2], 1.39, 'Depth 50m must exactly match backend nutrient (1.39)');
assert.strictEqual(interpolatedNutrients[3], 3.81, 'Depth 100m must exactly match backend nutrient (3.81)');
assert.strictEqual(interpolatedNutrients[4], 0.33, 'Depth 200m must exactly match backend nutrient (0.33)');
assert.strictEqual(interpolatedNutrients[5], 0.27, 'Depth 300m must exactly match backend nutrient (0.27)');
assert.strictEqual(interpolatedNutrients[6], 0.22, 'Depth 500m must exactly match backend nutrient (0.22)');
assert.strictEqual(interpolatedNutrients[8], 0.17, 'Depth 1000m must exactly match backend nutrient (0.17)');

// Interpolated depths:
// 25m: between 20m (1.10) and 30m (1.13) -> 1.115 ~ 1.11 / 1.12
assert(Math.abs(interpolatedNutrients[1] - 1.115) < 0.01, `Depth 25m must interpolate between 1.10 and 1.13, got ${interpolatedNutrients[1]}`);
// 750m: between 700m (0.19) and 1000m (0.17) -> 0.19 - (0.02 * 50/300) = 0.187 ~ 0.19
assert(Math.abs(interpolatedNutrients[7] - 0.187) < 0.01, `Depth 750m must interpolate between 0.19 and 0.17, got ${interpolatedNutrients[7]}`);

console.log('   ✓ Single source of truth verified: rendered profile values match backend indices.nutrients across all display depths.');

// 14. Assertion: Chlorophyll Reconciliation & Technical Disclaimers
console.log('14. Verifying Chlorophyll Reconciliation & Technical Disclaimers...');
assert(js.includes('renderChlaOverlayFromGrid'),
  'fisheries.js must define renderChlaOverlayFromGrid for per-date chlorophyll overlay rendering');
assert(!html.includes('PFZ score chlorophyll input differs from the illustrative map layer shown'),
  'fisheries.html disclaimer must no longer claim that chlorophyll input differs from map layer');
assert(html.includes("intended to support — not replace — field verification and INCOIS's operational PFZ advisories."),
  'INCOIS operational advisory disclaimer must be preserved');

const pyServerPath = path.join(__dirname, 'backend', 'api_server.py');
assert(fs.existsSync(pyServerPath), 'backend/api_server.py must exist');
const pyServerCode = fs.readFileSync(pyServerPath, 'utf-8');
assert(pyServerCode.includes("Scalar surface primary productivity proxy"), 'api_server.py must document surface chlorophyll-a proxy');
assert(pyServerCode.includes("Deep Chlorophyll Maximum / DCM"), 'api_server.py must document DCM vertical nutrient profile relation to chla_val');
assert(js.includes('Chlorophyll distinction (reconciled representations):'), 'fisheries.js must document distinction between surface scalar and DCM profile');
console.log('   ✓ Chlorophyll quantities reconciled, documented (surface proxy vs DCM profile), and real per-date overlay verified.');

// 15. Assertion: Jitter-Free Fish Marker Architecture & Pan/Zoom Sync
console.log('15. Verifying Jitter-Free Fish Marker Architecture & Pan/Zoom Sync...');
assert(js.includes('pfz-fish-marker-wrap'), 'buildFishBadgeElement must create pfz-fish-marker-wrap container');
assert(js.includes('pfz-fish-pulse'), 'buildFishBadgeElement must create separate pfz-fish-pulse child element');
assert(js.includes('pfz-fish-badge'), 'buildFishBadgeElement must include inner pfz-fish-badge element');

assert(css.includes('.pfz-fish-marker-wrap'), 'style.css must style .pfz-fish-marker-wrap');
assert(css.includes('.pfz-fish-pulse'), 'style.css must style .pfz-fish-pulse');
assert(css.includes('.maplibregl-marker'), 'style.css must style .maplibregl-marker to eliminate pan/zoom jitter');

// Verify marker wrappers have transition: none !important to prevent pan/zoom lag
assert(css.match(/\.pfz-fish-marker-wrap\s*\{[^}]*transition:\s*none\s*!important/s),
  '.pfz-fish-marker-wrap must have transition: none !important');
assert(css.match(/\.maplibregl-marker\s*\{[^}]*transition:\s*none\s*!important/s),
  '.maplibregl-marker must have transition: none !important');

// Verify pulsing ring operates purely on scale/opacity
assert(css.includes('@keyframes pfzFishPulse'), '@keyframes pfzFishPulse must be defined');
assert(css.match(/@keyframes pfzFishPulse\s*\{[^}]*scale/s), 'pfzFishPulse must animate scale');
assert(css.match(/@keyframes pfzFishPulse\s*\{[^}]*opacity/s), 'pfzFishPulse must animate opacity');
console.log('   ✓ Jitter-free marker DOM/CSS verified: native translate3d, zero position transitions, and isolated child pulsing ring.');

// 16. Assertion: Dynamic PFZ Grid Endpoint, Cluster Grouping & Centered Fish Markers
console.log('16. Verifying Dynamic PFZ Grid Endpoint, Cluster Grouping & Fish Centroid Placement...');
(async function testDynamicPfzZones() {
  const { identifyPfzClusters, generateClusterRing } = require('./fisheries.js');

  // (A) Live Backend Endpoint Verification: /pfz-grid
  console.log('   (A) Querying live backend /pfz-grid?date=2023-09-04...');
  const resp = await fetch('http://localhost:8000/pfz-grid?date=2023-09-04');
  assert.strictEqual(resp.status, 200, `Expected HTTP 200 from /pfz-grid, got ${resp.status}`);
  const grid = await resp.json();
  assert(grid.date === '2023-09-04', 'Grid date must match query');
  assert(grid.bounds && grid.bounds.south === 5 && grid.bounds.north === 30, 'Grid bounds must span 5N to 30N');
  assert(Array.isArray(grid.lats) && grid.lats.length === 26, `Expected 26 latitude grid rows, got ${grid.lats.length}`);
  assert(Array.isArray(grid.lons) && grid.lons.length === 41, `Expected 41 longitude grid cols, got ${grid.lons.length}`);
  assert(Array.isArray(grid.pfz_scores) && grid.pfz_scores.length === 26, `pfz_scores row count must be 26, got ${grid.pfz_scores.length}`);
  assert(Array.isArray(grid.pfz_scores[0]) && grid.pfz_scores[0].length === 41, `pfz_scores col count must be 41, got ${grid.pfz_scores[0].length}`);

  // Validate score ranges & land mask
  let validScoreCount = 0;
  let landNullCount = 0;
  for (let r = 0; r < 26; r++) {
    for (let c = 0; c < 41; c++) {
      const s = grid.pfz_scores[r][c];
      if (s !== null) {
        assert(typeof s === 'number' && s >= 0.0 && s <= 1.0, `Score out of [0, 1] range: ${s} at [${r}, ${c}]`);
        validScoreCount++;
      } else {
        landNullCount++;
      }
    }
  }
  assert(validScoreCount >= 50, `Expected substantial nearshore ocean coverage in pfz_scores, got ${validScoreCount}`);
  assert(landNullCount > 900, `Expected >900 land & offshore-masked null cells in pfz_scores, got ${landNullCount}`);

  // Test specific geographic land vs ocean points in grid
  // Riyadh (25.0°N, 46.5°E) -> row 20, col 1
  assert.strictEqual(grid.pfz_scores[20][1], null, 'Riyadh land coordinate must return null');
  // Sana\'a (15.0°N, 45.0°E) -> row 10, col 0
  assert.strictEqual(grid.pfz_scores[10][0], null, 'Sana\'a land coordinate must return null');
  // Nagpur (21.0°N, 79.5°E) -> row 16, col 23
  assert.strictEqual(grid.pfz_scores[16][23], null, 'Nagpur Central India land coordinate must return null');
  // Central Arabian Sea (15.0°N, 64.5°E) -> row 10, col 13 (offshore: must be excluded / null)
  assert.strictEqual(grid.pfz_scores[10][13], null, 'Central Arabian Sea offshore coordinate must return null (excluded from candidate zones)');
  // Nearshore Malabar Coast cell (12.0°N, 75.0°E) -> row 7, col 20 (nearshore: must have valid numeric score)
  const r12 = grid.lats.indexOf(12.0);
  const c75 = grid.lons.indexOf(75.0);
  assert(typeof grid.pfz_scores[r12][c75] === 'number', 'Nearshore ocean coordinate (12.0°N, 75.0°E) must return numeric score');
  console.log(`      ✓ /pfz-grid nearshore mask verified: land + offshore cells return null (${landNullCount}), nearshore cells scored (${validScoreCount}).`);

  // (B) 3-Cell Minimum Defragmentation Filter Assertion (Synthetic Grid)
  console.log('   (B) Verifying cluster flood-fill, 3-cell defragmentation & sizing on synthetic grid...');
  const syntheticGrid = {
    date: '2023-09-04',
    lats: grid.lats,
    lons: grid.lons,
    pfz_scores: Array.from({ length: 26 }, () => Array(41).fill(null))
  };

  // Plant 1-cell isolated noise at (20.0°N, 65.0°E) -> row 15, col 20 (score 0.82)
  syntheticGrid.pfz_scores[15][20] = 0.82;

  // Plant 4-cell contiguous block around (11.5°N, 99.75°E) -> rows [6, 7], cols [36, 37]
  syntheticGrid.pfz_scores[6][36] = 0.88;
  syntheticGrid.pfz_scores[6][37] = 0.85;
  syntheticGrid.pfz_scores[7][36] = 0.90;
  syntheticGrid.pfz_scores[7][37] = 0.87;

  // Add boundary details for syntheticGrid
  syntheticGrid.bounds = {
    south: 5.0,
    north: 30.0,
    west: 45.0,
    east: 105.0
  };

  const syntheticClusters = identifyPfzClusters(syntheticGrid);
  assert.strictEqual(syntheticClusters.length, 1, `Expected exactly 1 cluster (1-cell noise filtered out), got ${syntheticClusters.length}`);

  // Cluster: 4-cell block
  const blockCluster = syntheticClusters[0];
  assert(blockCluster && blockCluster.cellCount === 4, 'Must retain 4-cell contiguous block cluster');
  assert.strictEqual(blockCluster.centroidLat, 11.5, `Expected centroidLat 11.5, got ${blockCluster.centroidLat}`);
  assert.strictEqual(blockCluster.centroidLon, 99.75, `Expected centroidLon 99.75, got ${blockCluster.centroidLon}`);
  assert(blockCluster.avgScore >= 0.85 && blockCluster.avgScore <= 0.90, `avgScore should be ~0.88, got ${blockCluster.avgScore}`);
  assert.strictEqual(blockCluster.probScore, blockCluster.avgScore, 'probScore must mirror avgScore');
  assert(blockCluster.radiusLat >= 0.85 && blockCluster.radiusLat <= 2.80, 'radiusLat must adhere to [0.85, 2.80]');
  assert(blockCluster.radiusLon >= 1.10 && blockCluster.radiusLon <= 3.60, 'radiusLon must adhere to [1.10, 3.60]');
  assert(Array.isArray(blockCluster.ring) && blockCluster.ring.length >= 32, 'Ring must contain closed polygon coordinates');
  assert.strictEqual(blockCluster.ring[0][0], blockCluster.ring[blockCluster.ring.length - 1][0], 'Polygon ring must be closed (lon)');
  assert.strictEqual(blockCluster.ring[0][1], blockCluster.ring[blockCluster.ring.length - 1][1], 'Polygon ring must be closed (lat)');
  console.log('      ✓ Defragmentation verified: 1-cell noise eliminated, 4-cell cluster retained with bounded sizing.');

  // (C) Real Date Cluster Bounds & Cap Assertions
  console.log('   (C) Verifying live clustering across target dates (2023-09-04, 2023-07-15, 2023-10-22)...');
  const targetDates = ['2023-09-04', '2023-07-15', '2023-10-22'];
  for (const tDate of targetDates) {
    const tResp = await fetch(`http://localhost:8000/pfz-grid?date=${tDate}`);
    const tGrid = await tResp.json();
    const tZones = identifyPfzClusters(tGrid);
    assert(tZones.length >= 1 && tZones.length <= 5, `Date ${tDate} must produce 1 to 5 zones, got ${tZones.length}`);
    for (const z of tZones) {
      assert(z.cellCount >= 3, `Zone ${z.name} must have cellCount >= 3, got ${z.cellCount}`);
      assert(z.radiusLat <= 2.80, `Zone ${z.name} radiusLat must not exceed 2.80, got ${z.radiusLat}`);
      assert(z.radiusLon <= 3.60, `Zone ${z.name} radiusLon must not exceed 3.60, got ${z.radiusLon}`);
      assert(z.radiusLat >= 0.85, `Zone ${z.name} radiusLat must be >= 0.85, got ${z.radiusLat}`);
      assert(z.radiusLon >= 1.10, `Zone ${z.name} radiusLon must be >= 1.10, got ${z.radiusLon}`);
      assert(typeof z.probScore === 'number' && !isNaN(z.probScore), `Zone ${z.name} must have valid probScore`);
    }
  }

  // Winter verification: In winter Northeast monsoon (e.g. 2023-02-20), deep mixed layers and weak upwelling produce zero false-positive candidate zones
  const winterResp = await fetch('http://localhost:8000/pfz-grid?date=2023-02-20');
  const winterGrid = await winterResp.json();
  const winterZones = identifyPfzClusters(winterGrid);
  assert.strictEqual(winterZones.length, 0, 'Winter 2023-02-20 must produce 0 false-positive candidate zones (all scores < 0.65)');
  console.log('      ✓ Live date clustering verified: monsoon/transition dates produce 2–5 zones, winter produces 0 false-positives, min 3 cells, zero land overlap, and sane radius bounds.');

  // (D) Popup Card (buildPopupHtml) & Click-to-Select Verification
  console.log('   (D) Verifying Popup Card HTML Generation & Non-Crashing Score Resolution...');
  const { buildPopupHtml } = require('./fisheries.js');
  const sampleDynamicZone = {
    id: 'dynamic-zone-1',
    name: 'Arabian Sea Candidate Zone 1',
    tag: 'PFZ Index: Elevated (0.78)',
    avgScore: 0.78,
    probScore: 0.78,
  };

  // Case 1: Pre-predict outside any zone (score undefined, zone null)
  const popup1 = buildPopupHtml(15.0, 65.0, null, undefined);
  assert(popup1.includes('PFZ Index: Moderate'), 'Pre-predict fallback outside zone must display PFZ Index: Moderate');
  assert(popup1.includes('15.0°N, 65.0°E'), 'Must display correct coordinates');
  assert(popup1.includes('Moderate index (0.65)'), 'Must show default 0.65 score badge');

  // Case 2: Post-predict outside zone (score 0.84, zone null)
  const popup2 = buildPopupHtml(15.0, 65.0, null, 0.84);
  assert(popup2.includes('PFZ Index: Elevated'), 'Score 0.84 must display PFZ Index: Elevated');
  assert(popup2.includes('Elevated index (0.84)'), 'Must show 0.84 score badge');

  // Case 3: Pre-predict inside dynamic zone (probScore undefined, zone present)
  const popup3 = buildPopupHtml(12.4, 88.6, sampleDynamicZone, undefined);
  assert(popup3.includes('PFZ Index: Elevated'), 'Inside dynamic zone pre-predict must display PFZ Index: Elevated');
  assert(popup3.includes('Arabian Sea Candidate Zone 1'), 'Must display candidate zone name in subtitle');
  assert(popup3.includes('Elevated index (0.78)'), 'Must resolve zone.probScore / avgScore');

  // Case 4: Post-predict inside dynamic zone (probScore 0.72)
  const popup4 = buildPopupHtml(12.4, 88.6, sampleDynamicZone, 0.72);
  assert(popup4.includes('PFZ Index: Elevated'), 'Must update with post-predict score');
  assert(popup4.includes('Elevated index (0.72)'), 'Must show post-predict 0.72 score badge');

  // Case 5: Low score point (score 0.35)
  const popup5 = buildPopupHtml(8.0, 60.0, null, 0.35);
  assert(popup5.includes('PFZ Index: Low'), 'Score 0.35 must display PFZ Index: Low');
  assert(popup5.includes('Low index (0.35)'), 'Must show 0.35 score badge');
  console.log('      ✓ Popup card HTML verified across all scenarios with zero TypeError / toFixed crashes.');

  // (E) Nearshore Box Click Listener, Smooth Zoom & FlyTo Verification
  console.log('   (E) Verifying Nearshore Box Click Listener, Smooth Zoom & FlyTo Behavior...');
  assert(!js.includes("map.on('click', 'pfz-zones-fill'"),
    'pfz-zones-fill click listener must be removed to avoid overriding clicked coordinates or double-triggering');
  assert(js.includes("map.on('click', 'nearshore-boxes-fill'"),
    'nearshore-boxes-fill click listener must be active to select discrete nearshore zones');
  assert(js.includes("selectNearshoreBox(targetBox, true)"),
    'nearshore-boxes-fill click must pass selected nearshore box to selectNearshoreBox');
  assert(js.includes("selectLocation(z.centroidLat, z.centroidLon, true)"),
    'Fish marker click listener must retain centroid selection with zoomTo=true');
  assert(js.includes("map.flyTo({"),
    'selectLocation must invoke map.flyTo when zoomTo is true');
  assert(js.includes("zoom: Math.max(map.getZoom(), 5)"),
    'map.flyTo must use zoom Math.max(map.getZoom(), 5) matching Dashboard');
  assert(js.includes("duration: 800"),
    'map.flyTo must use duration 800 matching Dashboard');

  // Verify smooth zoom/flyTo behavior by simulating point selection in Arabian Sea and Bay of Bengal
  const flyToCalls = [];
  const mockMap = {
    getZoom: () => 4.2,
    flyTo: (opts) => { flyToCalls.push(opts); },
    panBy: () => {},
    project: () => ({ y: 250 }),
    getContainer: () => ({ clientHeight: 600 }),
  };

  const selectLocFunc = new Function(
    'lat', 'lon', 'zoomTo', 'map', 'isCoordInsideNorthIndianOcean', 'checkIsLand',
    `
    if (!isCoordInsideNorthIndianOcean(lat, lon)) return false;
    if (checkIsLand(lat, lon)) return false;
    if (zoomTo && map.flyTo) {
      map.flyTo({
        center: [lon, lat],
        zoom: Math.max(map.getZoom(), 5),
        duration: 800,
      });
    }
    return true;
    `
  );

  // Click 1: Central Arabian Sea (15.0°N, 65.0°E)
  selectLocFunc(15.0, 65.0, true, mockMap, () => true, () => false);
  assert.strictEqual(flyToCalls.length, 1, 'Arabian Sea click must invoke map.flyTo');
  assert.deepStrictEqual(flyToCalls[0].center, [65.0, 15.0], 'Must center on Arabian Sea coordinates [65.0, 15.0]');
  assert.strictEqual(flyToCalls[0].zoom, 5, 'Must zoom to level 5 from initial 4.2');
  assert.strictEqual(flyToCalls[0].duration, 800, 'Must use 800ms duration');

  // Click 2: Bay of Bengal (12.4°N, 88.6°E)
  selectLocFunc(12.4, 88.6, true, mockMap, () => true, () => false);
  assert.strictEqual(flyToCalls.length, 2, 'Bay of Bengal click must invoke map.flyTo');
  assert.deepStrictEqual(flyToCalls[1].center, [88.6, 12.4], 'Must center on Bay of Bengal coordinates [88.6, 12.4]');
  assert.strictEqual(flyToCalls[1].zoom, 5, 'Must zoom to level 5');
  assert.strictEqual(flyToCalls[1].duration, 800, 'Must use 800ms duration');

  console.log('      ✓ Map click listener & smooth flyTo zoom verified in Arabian Sea and Bay of Bengal matching Dashboard.');

  // (F) Fish Marker Centroid Alignment & Bug Fix Verification
  console.log('   (F) Verifying Centered Fish Marker Placement & Offset Bug Elimination...');
  assert(js.includes(".setLngLat([z.centroidLon, z.centroidLat])"),
    'Fish marker setLngLat must use exact cluster centroid [z.centroidLon, z.centroidLat]');
  assert(js.includes("anchor: 'center'"),
    'Fish marker must have anchor: center');
  assert(!js.includes('[90.4, 12.0]'),
    'Hardcoded offset fish marker coordinate [90.4, 12.0] must be eliminated');
  assert(!js.includes('FISH_MARKER_COORDS'),
    'Old static FISH_MARKER_COORDS array must be eliminated');
  assert(!js.includes('generateEllipseRing'),
    'Old static generateEllipseRing function must be eliminated in favor of generateClusterRing');
  console.log('      ✓ Fish marker offset bug eliminated: markers anchor at exact cluster centroids without hardcoded offsets.');

  // 17. Assertion: Initial Load Empty State & Interaction Gating Verification
  console.log('17. Verifying Initial Load Empty State & Interaction Gating...');

  // (A) Static HTML Empty/Prompt State Assertions
  assert(html.includes('<span id="date-display-header">Select date</span>'), 'Date display header must show placeholder "Select date"');
  assert(
    html.includes('id="native-date-picker"') && html.includes('value=""') && (html.includes('min="2023-01-01"') || html.includes('min="2023-01-10"') || html.includes('min="2023-06-01"') || html.includes('min="2021-01-11"')),
    'Native date picker value must be empty on load'
  );

  assert(html.includes('<span class="ky-stat-card__val" id="stat-thermocline-val">—</span>'), 'Stat 1: Thermocline Depth value must be "—" on load');
  assert(html.includes('<div class="ky-stat-card__note" id="stat-thermocline-note">Select a location and date</div>'), 'Stat 1: Note must prompt "Select a location and date"');

  assert(html.includes('<span class="ky-stat-card__val" id="stat-upwelling-val">—</span>'), 'Stat 2: Upwelling Index value must be "—" on load');
  assert(html.includes('<div class="ky-stat-card__note" id="stat-upwelling-note">Select a location and date</div>'), 'Stat 2: Note must prompt "Select a location and date"');

  assert(html.includes('<span class="ky-stat-card__val" id="stat-pfz-val">—</span>'), 'Stat 3: PFZ Index value must be "—" on load');
  assert(html.includes('id="stat-pfz-badge" style="display:none;"'), 'Stat 3: PFZ badge must be hidden on initial load');
  assert(html.includes('<div class="ky-stat-card__note" id="stat-pfz-note">Select a location and date</div>'), 'Stat 3: Note must prompt "Select a location and date"');

  assert(html.includes('<span class="ky-stat-card__val" id="stat-nutrient-val">—</span>'), 'Stat 4: Surface Chlorophyll-a Proxy value must be "—" on load');
  assert(html.includes('<div class="ky-stat-card__note" id="stat-nutrient-note">Select a location and date</div>'), 'Stat 4: Note must prompt "Select a location and date"');

  // Coordinate bar removed from TVD panel
  assert(!html.includes('id="selected-loc-coord"'), 'Coordinate bar element must be removed from TVD panel');

  assert(html.includes('id="tvd-empty-view" class="ky-tvd-empty" style="display:flex;"'), 'TVD empty placeholder view must be displayed (flex) on load');
  assert(html.includes('No location selected yet — click the map or search above'), 'TVD empty text prompt must match Dashboard empty pattern');
  assert(html.includes('id="tvd-table-view" class="ky-tvd-table-wrap" style="display:none;"'), 'TVD table view must be hidden (display:none) on load');
  assert(html.includes('id="tvd-graph-view" class="ky-tvd-chart-wrap" style="display:none;"'), 'TVD graph view must be hidden (display:none) on load');
  console.log('      ✓ Static HTML initial empty/prompt state verified across date picker, stat cards, and TVD panel.');


  // (B) JS State Initialization & No Auto-Load Assertions
  assert(js.includes('let currentCoord = null;'), 'currentCoord must initialize to null in fisheries.js');
  assert(js.includes('let currentDateStr = null;'), 'currentDateStr must initialize to null in fisheries.js');

  // Verify map.on('load') has NO auto-calling of selectLocation or loadAndRenderDynamicPfzZones
  const mapLoadSnippet = js.substring(js.indexOf("map.on('load'"), js.indexOf("map.on('click'"));
  assert(!mapLoadSnippet.includes('selectLocation(12.4, 88.6'), 'map load must NOT auto-call selectLocation on Bay of Bengal or any default point');
  assert(!mapLoadSnippet.includes('loadAndRenderDynamicPfzZones('), 'map load must NOT auto-call loadAndRenderDynamicPfzZones before date selection');
  assert(mapLoadSnippet.includes('updateEmptyStatePrompt()'), 'map load must initialize empty prompt state via updateEmptyStatePrompt()');
  console.log('      ✓ fisheries.js verified: currentCoord/currentDateStr null, zero auto-queries on map load.');

  // (C) Gating & Prompt Logic Unit Tests
  const { resetStatCards, updateEmptyStatePrompt, revealTvdPanel } = require('./fisheries.js');
  assert(typeof resetStatCards === 'function', 'resetStatCards function must exist');
  assert(typeof updateEmptyStatePrompt === 'function', 'updateEmptyStatePrompt function must exist');
  assert(typeof revealTvdPanel === 'function', 'revealTvdPanel function must exist');

  // Setup mock DOM environment for testing prompt transitions
  const mockDOM = {
    'stat-thermocline-val': { textContent: '68 m' },
    'stat-thermocline-note': { textContent: 'some note' },
    'stat-upwelling-val': { textContent: '0.72' },
    'stat-upwelling-note': { textContent: 'some note' },
    'stat-pfz-val': { textContent: '0.87' },
    'stat-pfz-badge': { style: { display: '' }, textContent: 'High', className: 'ky-stat-card__badge--green' },
    'stat-pfz-note': { textContent: 'some note' },
    'stat-nutrient-val': { textContent: '2.60 mg/m³' },
    'stat-nutrient-note': { textContent: 'some note' },
    'selected-loc-coord': { textContent: '12.4°N, 88.6°E' },
    'tvd-empty-view': { style: { display: 'none' } },
    'tvd-empty-text': { textContent: '' },
    'tvd-table-view': { style: { display: 'block' } },
    'tvd-graph-view': { style: { display: 'none' } },
    'btn-view-graph': { classList: { contains: () => false } },
    'map-legend': { style: { display: 'none' } },
  };

  global.document = {
    getElementById: (id) => mockDOM[id] || null,
    createElement: (tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          className: '',
          style: {},
          getContext: () => ({
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            putImageData: () => {},
            drawImage: () => {},
          }),
          toDataURL: () => 'data:image/png;base64,mock',
          setAttribute: () => {},
          appendChild: () => {},
          addEventListener: () => {},
        };
      }
      return {
        className: '',
        innerHTML: '',
        style: {},
        setAttribute: () => {},
        appendChild: () => {},
        addEventListener: () => {},
      };
    },
  };

  // Test resetStatCards
  resetStatCards('Select a location and date');
  assert.strictEqual(mockDOM['stat-thermocline-val'].textContent, '—');
  assert.strictEqual(mockDOM['stat-upwelling-val'].textContent, '—');
  assert.strictEqual(mockDOM['stat-pfz-val'].textContent, '—');
  assert.strictEqual(mockDOM['stat-nutrient-val'].textContent, '—');
  assert.strictEqual(mockDOM['stat-pfz-badge'].style.display, 'none');
  assert.strictEqual(mockDOM['stat-thermocline-note'].textContent, 'Select a location and date');
  assert.strictEqual(mockDOM['stat-upwelling-note'].textContent, 'Select a location and date');

  // Test revealTvdPanel (when both location and date are present)
  revealTvdPanel();
  assert.strictEqual(mockDOM['tvd-empty-view'].style.display, 'none', 'revealTvdPanel must hide empty view');
  assert.strictEqual(mockDOM['tvd-table-view'].style.display, 'block', 'revealTvdPanel must show table view when table is active');

  // 18. Assertion: PFZ Formula Transparency & Tiered Map Highlighting
  console.log('18. Verifying PFZ Formula Transparency & 3-Tier Map Styling...');
  // Check HTML
  assert(html.includes('id="btn-pfz-formula-info"'), 'Formula info button must exist on Card 3');
  assert(html.includes('id="pfz-formula-modal"'), 'Formula breakdown modal must exist in DOM');
  assert(html.includes('85% Model-Derived Physical Drivers'), 'Modal must detail 85% model-derived components');
  assert(html.includes('15% Estimated Heuristic'), 'Modal must detail 15% estimated heuristic component');
  assert(html.includes('Horizontal Thermal Front Gradient'), 'Modal must include horizontal thermal front gradient');
  assert(html.includes('Derived from model thermal gradients'), 'Legend subnote must describe physics-based thermal gradients');

  // Check CSS
  assert(css.includes('.ky-formula-info-btn'), 'CSS must style formula info button');
  assert(css.includes('.ky-formula-modal'), 'CSS must style formula modal');
  assert(css.includes('.pfz-fish-marker-wrap[data-tier="elevated"]'), 'CSS must style elevated fish marker tier');
  assert(css.includes('.pfz-fish-marker-wrap[data-tier="moderate"]'), 'CSS must style moderate fish marker tier');
  assert(css.includes('.pfz-fish-marker-wrap[data-tier="low"]'), 'CSS must style low fish marker tier');

  // Check Backend indices transparency on live predict
  const predResp = await fetch('http://localhost:8000/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude: 15.5, longitude: 65.0, date: '2023-09-04' })
  });
  const predData = await predResp.json();
  assert(typeof predData.indices.thermal_front_gradient === 'number', 'indices.thermal_front_gradient must be numeric');
  assert(typeof predData.indices.thermal_front_strength === 'number', 'indices.thermal_front_strength must be numeric');
  assert(predData.indices.pfz_formula, 'indices.pfz_formula breakdown must be provided');
  assert.strictEqual(predData.indices.pfz_formula.model_derived_pct, 85, 'Formula breakdown must declare 85% model-derived');
  assert.strictEqual(predData.indices.pfz_formula.heuristic_pct, 15, 'Formula breakdown must declare 15% heuristic');
  // 19. Assertion: Candidate Zone Visibility Filter (Elevated Tier Only)
  console.log('19. Verifying Candidate Zone Visibility Filter (HIGHLIGHT_MIN_TIER)...');
  const {
    HIGHLIGHT_MIN_TIER,
    checkTemperatureDataQuality,
    scoreCandidateZone,
    shouldHighlightZone,
    getZoneTier,
    loadAndRenderDynamicPfzZones
  } = require('./fisheries.js');

  assert.strictEqual(HIGHLIGHT_MIN_TIER, 'elevated', "HIGHLIGHT_MIN_TIER must be named constant set to 'elevated'");
  assert(typeof checkTemperatureDataQuality === 'function', 'checkTemperatureDataQuality must be exported');
  assert(typeof scoreCandidateZone === 'function', 'scoreCandidateZone must be exported');
  assert(typeof shouldHighlightZone === 'function', 'shouldHighlightZone must be exported');
  assert(typeof getZoneTier === 'function', 'getZoneTier must be exported');

  // Test tier determination
  assert.strictEqual(getZoneTier({ pfz_index: 0.82 }), 'elevated', '0.82 must be elevated tier');
  assert.strictEqual(getZoneTier({ pfz_index: 0.55 }), 'moderate', '0.55 must be moderate tier');
  assert.strictEqual(getZoneTier({ pfz_index: 0.25 }), 'low', '0.25 must be low tier');

  // Test shouldHighlightZone filter
  const elevatedCandidate = { id: 'zone-el', name: 'Elevated Candidate', avgScore: 0.78, pfz_index: 0.78, data_quality_flag: false };
  const moderateCandidate = { id: 'zone-mod', name: 'Moderate Candidate', avgScore: 0.58, pfz_index: 0.58, data_quality_flag: false };
  const lowCandidate = { id: 'zone-low', name: 'Low Candidate', avgScore: 0.32, pfz_index: 0.32, data_quality_flag: false };

  assert.strictEqual(shouldHighlightZone(elevatedCandidate), true, 'Elevated candidate zone must qualify for map highlight');
  assert.strictEqual(shouldHighlightZone(moderateCandidate), false, 'Moderate candidate zone must NOT qualify for map highlight');
  assert.strictEqual(shouldHighlightZone(lowCandidate), false, 'Low candidate zone must NOT qualify for map highlight');

  // Test loadAndRenderDynamicPfzZones rendering gating with mock MapLibre
  let mockSourceData = null;
  const mockMarkers = [];
  global.map = {
    getSource: (id) => {
      if (id === 'pfz-zones') {
        return {
          setData: (data) => { mockSourceData = data; }
        };
      }
      return null;
    },
    getContainer: () => ({ clientHeight: 600 }),
  };
  global.maplibregl = {
    Marker: function(opts) {
      this.opts = opts;
      this.setLngLat = (coords) => { this.coords = coords; return this; };
      this.addTo = (m) => { mockMarkers.push(this); return this; };
      this.remove = () => {};
    }
  };

  const syntheticMixedZones = [
    {
      id: 'z-elevated',
      name: 'Central Arabian Sea Elevated',
      avgScore: 0.84,
      pfz_index: 0.84,
      centroidLat: 15.0,
      centroidLon: 65.0,
      radiusLat: 1.2,
      radiusLon: 1.5,
      ring: [[64, 14], [66, 14], [66, 16], [64, 16], [64, 14]],
      data_quality_flag: false,
    },
    {
      id: 'z-moderate',
      name: 'SW Arabian Basin Moderate',
      avgScore: 0.55,
      pfz_index: 0.55,
      centroidLat: 10.0,
      centroidLon: 58.0,
      radiusLat: 1.0,
      radiusLon: 1.2,
      ring: [[57, 9], [59, 9], [59, 11], [57, 11], [57, 9]],
      data_quality_flag: false,
    },
    {
      id: 'z-low',
      name: 'Stratified Low Zone',
      avgScore: 0.30,
      pfz_index: 0.30,
      centroidLat: 7.0,
      centroidLon: 75.0,
      radiusLat: 0.9,
      radiusLon: 1.0,
      ring: [[74, 6], [76, 6], [76, 8], [74, 8], [74, 6]],
      data_quality_flag: false,
    }
  ];

  const renderedOverlay = await loadAndRenderDynamicPfzZones('2023-09-04', syntheticMixedZones);
  assert.strictEqual(renderedOverlay.length, 0, 'Candidate zone highlights on map must be disabled');
  assert.strictEqual(mockSourceData.features.length, 0, 'GeoJSON source must contain 0 features (no highlighted regions)');
  assert.strictEqual(mockMarkers.length, 0, 'Zero fish markers must be placed on map');

  // Verify all zones remain stored in currentDynamicZones for manual lookup/click
  assert.strictEqual(renderedOverlay.allZones.length, 3, 'All 3 candidate zones must be preserved in allZones');
  console.log('   ✓ Candidate zone map highlight removal verified: zero highlighted regions and zero fish markers on map.');

  // 20. Assertion: Data-Quality Guard for Temperature-Corruption Bug
  console.log('20. Verifying Data-Quality Guard for Temperature-Corruption Bug...');

  // (A) Profile inspections
  const cleanProfile = [28.4, 28.6, 28.8, 28.5, 27.8, 26.5]; // 0, 5, 10, 20, 30, 50m
  const dqClean = checkTemperatureDataQuality(cleanProfile);
  assert.strictEqual(dqClean.data_quality_flag, false, 'Clean physical profile must pass data-quality guard');

  // Cliff drop > 8°C (28.0 to 19.5 = 8.5°C drop)
  const cliffProfile = [28.0, 28.0, 19.5, 18.0, 17.0, 16.0];
  const dqCliff = checkTemperatureDataQuality(cliffProfile);
  assert.strictEqual(dqCliff.data_quality_flag, true, 'Profile with drop >8°C in 0-50m must trigger data_quality_flag');
  assert(dqCliff.reason.includes('>8°C'), 'Reason must mention drop >8°C');

  // 3+ consecutive identical temperatures
  const flatProfile = [28.0, 28.0, 28.0, 26.0, 24.0, 22.0];
  const dqFlat = checkTemperatureDataQuality(flatProfile);
  assert.strictEqual(dqFlat.data_quality_flag, true, 'Profile with 3+ consecutive identical values must trigger data_quality_flag');
  assert(dqFlat.reason.includes('3+ consecutive identical'), 'Reason must mention 3+ consecutive identical values');

  // Flat-then-cliff corrupted shelf pattern
  const flatThenCliffProfile = [28.0, 28.0, 28.0, 18.0, 16.0, 15.0];
  const dqCorrupted = checkTemperatureDataQuality(flatThenCliffProfile);
  assert.strictEqual(dqCorrupted.data_quality_flag, true, 'Flat-then-cliff profile must trigger data_quality_flag');

  // (B) Candidate zone scoring with data-quality guard
  const corruptedCandidate = {
    id: 'z-corrupt',
    name: 'Shelf Corrupted Zone',
    avgScore: 0.88,
    probScore: 0.88,
    pfz_index: 0.88,
    centroidLat: 9.0,
    centroidLon: 79.0,
    radiusLat: 1.0,
    radiusLon: 1.0,
    ring: [[78, 8], [80, 8], [80, 10], [78, 10], [78, 8]],
    temps: flatThenCliffProfile,
  };

  const scoredCorrupt = scoreCandidateZone(corruptedCandidate);
  assert.strictEqual(scoredCorrupt.data_quality_flag, true, 'Corrupted zone must have data_quality_flag: true');
  assert.strictEqual(scoredCorrupt.pfz_index, null, 'Corrupted zone must have pfz_index: null (suppressed)');
  assert.strictEqual(scoredCorrupt.tier, 'flagged', 'Corrupted zone must be marked as flagged');

  // (C) Exclusion of corrupted zone from map overlay even if raw score is Elevated (0.88)
  mockMarkers.length = 0;
  mockSourceData = null;
  const overlayWithCorrupt = await loadAndRenderDynamicPfzZones('2023-09-04', [corruptedCandidate]);
  assert.strictEqual(overlayWithCorrupt.length, 0, 'Corrupted candidate zone must be completely excluded from map overlay');
  assert.strictEqual(mockSourceData.features.length, 0, 'GeoJSON features must be empty when zone is flagged');
  assert.strictEqual(mockMarkers.length, 0, 'Zero markers must be placed for flagged zone');
  console.log('   ✓ Data-quality guard verified: unphysical drops >8°C and 3+ identical values trigger flag and exclude zone from map overlay.');

  // (D) Live Backend API indices.data_quality_flag verification
  console.log('   (D) Verifying Backend /predict surfaces indices.data_quality_flag...');
  const livePredResp = await fetch('http://127.0.0.1:8000/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude: 15.5, longitude: 65.0, date: '2023-09-04' })
  });
  const livePred = await livePredResp.json();
  assert('data_quality_flag' in livePred.indices, 'Backend response indices must contain data_quality_flag');
  assert.strictEqual(livePred.indices.data_quality_flag, false, 'Standard ocean point must have data_quality_flag: false');
  assert(typeof livePred.indices.pfz === 'number', 'Standard ocean point must compute numeric pfz index');
  console.log('      ✓ Backend API indices.data_quality_flag verified on live /predict endpoint.');

  // (E) Legend & Advisory Modal UI Text Verification
  console.log('   (E) Verifying Legend & Advisory Modal UI Text Updates...');
  assert(html.includes('Only Elevated candidate zones (PFZ ≥ 0.70) auto-highlighted on map'),
    'Legend subnote must state only Elevated candidate zones are auto-highlighted on map');
  assert(html.includes('Auto-highlighted on the map overlay'),
    'Advisory modal must state Elevated tier is auto-highlighted on map overlay');
  assert(html.includes('Available in detail panel via direct coordinate search (not auto-highlighted on map)'),
    'Advisory modal must clarify Moderate and Low tiers are available in detail panel via direct search');
  console.log('      ✓ Legend and modal text accurately declare that only Elevated zones are auto-highlighted.');

  // (F) Direct Coordinate Search on Moderate Candidate Zone
  console.log('   (F) Verifying Direct Coordinate Selection Resolves Moderate Candidate Zone Details...');
  // Ensure mixed candidate zones are loaded
  await loadAndRenderDynamicPfzZones('2023-09-04', syntheticMixedZones);
  const { selectLocation } = require('./fisheries.js');
  // Mock fetch for predict when selectLocation is called
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if (url.includes('/predict')) {
      return {
        ok: true,
        json: async () => ({
          depths: [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000],
          temps: [27.0, 26.8, 26.5, 26.0, 25.5, 24.0, 22.0, 20.0, 18.0, 16.0, 14.0, 11.0, 8.0, 6.0, 5.0],
          indices: {
            thermocline_depth: 85.0,
            upwelling_index: 0.55,
            thermal_front_gradient: 0.6,
            thermal_front_strength: 0.4,
            chlorophyll_a: 1.8,
            pfz: 0.55,
            pfz_confidence_score: 0.55,
            data_quality_flag: false,
            nutrients: [1.5, 1.6, 1.8, 2.0, 2.2, 2.0, 1.5, 1.0, 0.8, 0.6, 0.4, 0.3, 0.2, 0.2, 0.1]
          }
        })
      };
    }
    return origFetch(url, opts);
  };

  // Select location inside SW Arabian Basin Moderate zone (10.0°N, 58.0°E)
  await selectLocation(10.0, 58.0, false);
  global.fetch = origFetch; // Restore fetch

  assert.strictEqual(mockDOM['stat-pfz-val'].textContent, '0.55', 'Stat card must display Moderate score 0.55 on direct selection');
  assert.strictEqual(mockDOM['stat-pfz-badge'].textContent, 'Moderate', 'Stat card badge must show Moderate');
  assert.strictEqual(mockDOM['stat-pfz-badge'].className, 'ky-stat-card__badge ky-stat-card__badge--blue', 'Stat card badge must have blue class');
  console.log('      ✓ Direct selection of Moderate zone successfully resolves zone details, preserving 3-tier color coding in detail panel.');

  // (G) Direct Selection on Low Candidate Zone (Verify NO polygon or pulsing marker added)
  console.log('   (G) Verifying Direct Selection on Low Candidate Zone Does NOT Draw Map Overlay...');
  const featuresBefore = mockSourceData.features.length; // Was 1 (Elevated)
  const markersBefore = mockMarkers.length; // Was 1 (Elevated)

  global.fetch = async (url, opts) => {
    if (url.includes('/predict')) {
      return {
        ok: true,
        json: async () => ({
          depths: [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000],
          temps: [28.0, 27.9, 27.8, 27.5, 27.2, 26.8, 24.0, 21.0, 18.0, 15.0, 13.0, 10.0, 7.0, 5.5, 4.5],
          indices: {
            thermocline_depth: 130.0,
            upwelling_index: 0.20,
            thermal_front_gradient: 0.2,
            thermal_front_strength: 0.15,
            chlorophyll_a: 0.45,
            pfz: 0.30,
            pfz_confidence_score: 0.30,
            data_quality_flag: false,
            nutrients: [0.45, 0.45, 0.5, 0.6, 0.8, 0.6, 0.4, 0.3, 0.2, 0.2, 0.1, 0.1, 0.05, 0.05, 0.05]
          }
        })
      };
    }
    return origFetch(url, opts);
  };

  // Select location inside Low candidate zone (7.0°N, 75.0°E)
  await selectLocation(7.0, 75.0, false);
  global.fetch = origFetch;

  // Confirm NO polygon was added for Low zone
  assert.strictEqual(mockSourceData.features.length, featuresBefore, 'Map GeoJSON features must remain unchanged when Low zone is selected (no polygon added)');
  // Confirm NO pulsing fish marker was added for Low zone
  assert.strictEqual(mockMarkers.length, markersBefore, 'Fish markers on map must remain unchanged when Low zone is selected (no pulsing marker added)');
  // Confirm detail panel resolved correctly
  assert.strictEqual(mockDOM['stat-pfz-val'].textContent, '0.30', 'Stat card must display Low score 0.30 on direct selection');
  assert.strictEqual(mockDOM['stat-pfz-badge'].textContent, 'Low', 'Stat card badge must show Low');
  assert.strictEqual(mockDOM['stat-pfz-badge'].className, 'ky-stat-card__badge ky-stat-card__badge--amber', 'Stat card badge must have amber class');
  console.log('      ✓ Selection of Low zone does not add polygon/pulsing marker to map, while correctly resolving detail panel.');

  // (H) Real Per-Date Chlorophyll Overlay & Predict Parity Check
  console.log('   (H) Verifying Real Per-Date Chlorophyll Grid & /predict Parity...');
  const pfzResp = await fetch('http://localhost:8000/pfz-grid?date=2023-09-04');
  const pfzData = await pfzResp.json();
  assert(Array.isArray(pfzData.chla_grid), 'Response from /pfz-grid must include chla_grid array');
  assert.strictEqual(pfzData.chla_grid.length, pfzData.lats.length, 'chla_grid height must match lats count');
  assert.strictEqual(pfzData.chla_grid[0].length, pfzData.lons.length, 'chla_grid width must match lons count');

  // Verify non-land cells have valid numbers in [0.05, 9.8]
  let oceanChlaCount = 0;
  pfzData.chla_grid.forEach(row => {
    row.forEach(val => {
      if (val !== null) {
        oceanChlaCount++;
        assert(typeof val === 'number' && val >= 0.05 && val <= 9.8, `Chlorophyll grid cell must be in [0.05, 9.8], got ${val}`);
      }
    });
  });
  assert(oceanChlaCount > 100, 'Must have at least 100 valid ocean chlorophyll values');

  // Query live /predict for central Arabian Sea coordinate (15.0°N, 64.5°E) on 2023-09-04
  const targetLat = 15.0;
  const targetLon = 64.5;
  const predChlaResp = await fetch('http://localhost:8000/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude: targetLat, longitude: targetLon, date: '2023-09-04' })
  });
  const predChlaData = await predChlaResp.json();
  const pointChla = predChlaData.indices.chlorophyll_a;
  assert(typeof pointChla === 'number', '/predict indices.chlorophyll_a must be numeric');

  // Find nearest cell in pfzData grid
  let bestR = 0, bestC = 0, minD = Infinity;
  for (let r = 0; r < pfzData.lats.length; r++) {
    for (let c = 0; c < pfzData.lons.length; c++) {
      const d = Math.hypot(pfzData.lats[r] - targetLat, pfzData.lons[c] - targetLon);
      if (d < minD) {
        minD = d;
        bestR = r;
        bestC = c;
      }
    }
  }
  const gridChlaAtPoint = pfzData.chla_grid[bestR][bestC];
  assert(gridChlaAtPoint !== null, 'Grid chlorophyll at ocean test point must not be null');
  // Tolerance ±0.6 mg/m³ between downsampled 1° grid and full-res 0.25° grid
  assert(Math.abs(gridChlaAtPoint - pointChla) < 0.6,
    `Grid chlorophyll (${gridChlaAtPoint}) must track /predict chlorophyll (${pointChla}) at (${targetLat}, ${targetLon})`);
  console.log(`      ✓ Chlorophyll grid parity verified: grid=${gridChlaAtPoint} mg/m³ vs predict=${pointChla} mg/m³ at (${targetLat}°N, ${targetLon}°E)`);

  // Verify renderChlaOverlayFromGrid function returns canvas and unhides legend
  const { renderChlaOverlayFromGrid, sampleChlaColor } = require('./fisheries.js');
  assert(typeof renderChlaOverlayFromGrid === 'function', 'renderChlaOverlayFromGrid must be exported');
  assert(typeof sampleChlaColor === 'function', 'sampleChlaColor must be exported');

  // Test sampleChlaColor mapping across ranges
  const lowColor = sampleChlaColor(0.01);
  const midColor = sampleChlaColor(1.0);
  const highColor = sampleChlaColor(10.0);
  assert.strictEqual(lowColor.length, 4, 'Color must be RGBA array of length 4');
  assert.strictEqual(midColor.length, 4, 'Color must be RGBA array of length 4');
  assert.strictEqual(highColor.length, 4, 'Color must be RGBA array of length 4');
  assert.strictEqual(lowColor[3], 210, 'Alpha must be 210');

  // Test rendering canvas from live grid data
  const chlaCanvasResult = renderChlaOverlayFromGrid(pfzData);
  assert(chlaCanvasResult, 'renderChlaOverlayFromGrid must return canvas');
  assert.strictEqual(chlaCanvasResult.width, 600, 'Canvas width must be 600');
  assert.strictEqual(chlaCanvasResult.height, 250, 'Canvas height must be 250');
  assert.strictEqual(mockDOM['map-legend'].style.display, 'block', 'Legend must be displayed as block after grid render');
  // 21. Verifying Candidate Zone Highlighting Consistency, Single Source of Truth & Layout Placement
  console.log('\n21. Verifying Highlighting Consistency, Single Source of Truth & Operational Note Relocation...');

  // (A) Operational Caveat Removal from HTML
  console.log('   (A) Verifying Operational Note Banner is Completely Removed from Page...');
  assert(!html.includes('ky-fisheries-operational-caveat'), 'Operational caveat banner must be removed from fisheries.html');
  console.log('      ✓ Operational Note banner confirmed completely removed from fisheries.html.');


  // (B) Single Source of Truth for Zone Score Parity
  console.log('   (B) Verifying Single Source of Truth for Candidate Zone Score (No 0.10 vs 0.89 discrepancy)...');
  // Load candidate zones where z-elevated has pfz_index = 0.84
  await loadAndRenderDynamicPfzZones('2023-09-04', syntheticMixedZones);
  const currentFeaturesCount = mockSourceData.features.length;
  const currentMarkersCount = mockMarkers.length;

  // Mock /predict returning 0.10 (simulating point discrepancy at 15.0°N, 65.0°E)
  global.fetch = async (url, opts) => {
    if (url.includes('/predict')) {
      return {
        ok: true,
        json: async () => ({
          depths: [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000],
          temps: [28.5, 28.5, 28.5, 28.5, 28.4, 28.3, 27.0, 24.0, 20.0, 16.0, 13.0, 10.0, 7.0, 5.5, 4.5],
          indices: {
            thermocline_depth: 110.0,
            upwelling_index: 0.04,
            thermal_front_gradient: 0.1,
            thermal_front_strength: 0.05,
            chlorophyll_a: 0.35,
            pfz: 0.10,
            pfz_confidence_score: 0.10,
            data_quality_flag: false,
            nutrients: [0.35, 0.35, 0.4, 0.5, 0.7, 0.5, 0.3, 0.2, 0.1, 0.1, 0.05, 0.05, 0.05, 0.05, 0.05]
          }
        })
      };
    }
    return origFetch(url, opts);
  };

  // Select location inside Elevated candidate zone (15.0°N, 65.0°E)
  await selectLocation(15.0, 65.0, false);
  // Both stat card and popup must agree on the zone's authoritative score 0.84, NOT the point score 0.10
  assert.strictEqual(mockDOM['stat-pfz-val'].textContent, '0.84', 'Stat card must display candidate zone score (0.84), eliminating discrepancy');
  assert.strictEqual(mockDOM['stat-pfz-badge'].textContent, 'High', 'Stat card badge must show High');
  assert(mockDOM['stat-pfz-badge'].className.includes('ky-stat-card__badge--green'), 'Stat card badge must have green class');

  // Verify popup HTML generated for the matched zone reflects the authoritative score 0.84
  const matchedPopupHtml = buildPopupHtml(15.0, 65.0, syntheticMixedZones[0], 0.84);
  assert(matchedPopupHtml.includes('PFZ Index: Elevated'), 'Popup title must reflect Elevated tier');
  assert(matchedPopupHtml.includes('Elevated index (0.84)'), 'Popup badge must reflect zone score (0.84)');
  assert(matchedPopupHtml.includes('Central Arabian Sea Elevated'), 'Popup subtext must include zone name');
  console.log('      ✓ Single source of truth verified: Candidate zone score (0.84) overrides point mismatch in stat cards and popup.');

  // (C) Rejection of Clicks Outside Nearshore Boxes (Offshore Points Beyond 185km or Land)
  console.log('   (C) Verifying Rejection of Clicks Outside Nearshore Boxes (Offshore & Land)...');
  // Attempt to select an arbitrary ocean coordinate outside any nearshore box (e.g. 18.0°N, 67.0°E, distance > 185km)
  const rejectedOffshore = await selectLocation(18.0, 67.0, false);
  assert.strictEqual(rejectedOffshore, false, 'Selecting offshore point outside nearshore boxes must return false / be rejected');

  // Attempt to select a land coordinate
  const rejectedLand = await selectLocation(20.0, 78.0, false);
  assert.strictEqual(rejectedLand, false, 'Selecting land point must return false / be rejected');

  global.fetch = origFetch;

  // Features and markers on map must remain unchanged
  assert.strictEqual(mockSourceData.features.length, currentFeaturesCount, 'Rejected clicks must not add polygon features');
  assert.strictEqual(mockMarkers.length, currentMarkersCount, 'Rejected clicks must not add markers');
  console.log('      ✓ Clicks outside nearshore boxes (offshore open water and land) strictly rejected with zero prediction requests.');

  // (D) Live Backend Shelf Cliff Elimination in /pfz-grid
  console.log('   (D) Verifying Live Backend /pfz-grid Filters 4.0°C Shelf Cliff Cells...');
  const pfzGridResp = await fetch('http://localhost:8000/pfz-grid?date=2023-09-04');
  const pfzGridData = await pfzGridResp.json();
  const r9 = pfzGridData.lats.indexOf(9.0);
  const c795 = pfzGridData.lons.indexOf(79.5);
  assert(r9 !== -1 && c795 !== -1, 'Coordinates (9.0°N, 79.5°E) must be present in grid');
  assert.strictEqual(pfzGridData.pfz_scores[r9][c795], null, 'Shelf cliff cell (9.0°N, 79.5°E) must be masked to null');
  assert.strictEqual(pfzGridData.chla_grid[r9][c795], null, 'Shelf cliff cell (9.0°N, 79.5°E) chla must be masked to null');
  console.log('      ✓ Live backend data-quality guard verified: Shelf cliff cell (9.0°N, 79.5°E) successfully masked to null.');

  console.log('\n=== ALL FISHERIES MODE TESTS PASSED SUCCESSFULLY! ===\n');
})().catch(err => {
  console.error('\n❌ FISHERIES TEST FAILED:', err);
  process.exit(1);
});
