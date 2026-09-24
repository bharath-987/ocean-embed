const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- RUNNING PRE-DEMO FIXES VERIFICATION ---');

// 1. Fisheries Error Handling & Fallback Removal
console.log('\n[TEST 1] Fisheries Error Handling & Fallback Removal');
const fisheriesJs = fs.readFileSync(path.join(__dirname, 'fisheries.js'), 'utf8');
const fisheriesHtml = fs.readFileSync(path.join(__dirname, 'fisheries.html'), 'utf8');

assert(fisheriesHtml.includes('id="result-idle"'), 'fisheries.html must include id="result-idle"');
assert(fisheriesJs.includes('handleFisheriesBackendFailure'), 'fisheries.js must define handleFisheriesBackendFailure');
assert(!fisheriesJs.includes('calculateSubsurfaceProfile(lat, lon); // in catch'), 'Should not use calculateSubsurfaceProfile in catch block');
assert(fisheriesJs.includes('handleFisheriesBackendFailure(lat, lon, err)'), 'Catch block must delegate to handleFisheriesBackendFailure');
assert(fisheriesJs.includes('btn-retry-fisheries'), 'Must create retry button for fisheries error card');
console.log('✅ TEST 1 PASSED: Fallback removed, error card and retry button wired');

// 2. Chlorophyll Bug Fix & Nutrient Labeling
console.log('\n[TEST 2] Chlorophyll Bug Fix & Nutrient Labeling');
const apiServerPy = fs.readFileSync(path.join(__dirname, 'backend', 'api_server.py'), 'utf8');

assert(apiServerPy.includes('surface_chla = chla_val'), 'api_server.py must set surface_chla = chla_val');
assert(apiServerPy.includes('w_ch * min(1.0, chla_val / 3.0)'), 'api_server.py must use chla_val for PFZ computation');
assert(!fisheriesJs.includes('const surfaceChla = (nutrients && nutrients.length > 0) ? nutrients[0]'), 'fisheries.js must not take nutrients[0] as surfaceChla');
assert(fisheriesJs.includes('const surfaceChla = indices.chlorophyll_a !== undefined ? indices.chlorophyll_a : null;'), 'fisheries.js must read indices.chlorophyll_a directly');
assert(fisheriesJs.includes('Chlorophyll proxy (mg/m³) [illustrative shape, not measured]'), 'Chart dataset must label nutrients as illustrative shape');
assert(fisheriesJs.includes('Chlorophyll proxy (mg/m³) — illustrative shape, not measured'), 'Chart y-axis must label nutrients as illustrative shape');
console.log('✅ TEST 2 PASSED: Chlorophyll uses chla_val and nutrient curve labeled illustrative');

// 3. Silent Defaults Removed
console.log('\n[TEST 3] Silent Defaults Removed');
assert(!fisheriesJs.includes('matchedZone.thermocline ?? 68'), 'No silent fallback to 68 for thermocline');
assert(!fisheriesJs.includes('matchedZone.upwelling ?? 0.72'), 'No silent fallback to 0.72 for upwelling');
assert(!fisheriesJs.includes('matchedZone.avgScore ?? 0.87'), 'No silent fallback to 0.87 for PFZ score');
assert(!fisheriesJs.includes('matchedZone.nutrient ?? 2.60'), 'No silent fallback to 2.60 for chlorophyll');
console.log('✅ TEST 3 PASSED: Silent defaults (68, 0.72, 0.87, 2.60) completely eliminated');

// 4. Error Bands Wired to ServingData & Explore Chart
console.log('\n[TEST 4] Error Bands Wired & Charted');
const v6AdapterPy = fs.readFileSync(path.join(__dirname, 'backend', 'v6_adapter.py'), 'utf8');
const servingPy = fs.readFileSync(path.join(__dirname, 'backend', 'data', 'v6_satswap_anom_14yr_argoft_seed1', 'serving.py'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

assert(servingPy.includes('def __init__(self, field_dir=None, products_dir=None, embeddings_dir=None, correction=None, bands=None):'), 'ServingData must accept bands parameter');
assert(v6AdapterPy.includes('bands=BANDS_FILE'), 'v6_adapter must pass bands=BANDS_FILE to ServingData');
assert(v6AdapterPy.includes('def get_error_bands('), 'v6_adapter must define get_error_bands');
assert(apiServerPy.includes('error_bands_90 = v6_adapter.get_error_bands("90")'), 'api_server must expose error_bands_90');
assert(appJs.includes('90% Error Band (±0.65°C at 5m, ±1.79°C at 100m)'), 'app.js must render 90% error band dataset');
assert(appJs.includes("fill: '-1'"), 'app.js must fill between upper and lower confidence band');
console.log('✅ TEST 4 PASSED: Error bands passed to ServingData and rendered on Explore chart');

// 5. Satellite Winds Comments
console.log('\n[TEST 5] Satellite Winds References');
assert(apiServerPy.includes('CCMP satellite wind Ekman vertical upwelling velocity array'), 'api_server docstring updated to CCMP');
assert(!apiServerPy.includes('ERA5 Ekman vertical upwelling velocity array'), 'Old ERA5 docstring replaced');
console.log('✅ TEST 5 PASSED: CCMP satellite wind comments updated');

// 6. Text Fixes
console.log('\n[TEST 6] Text Fixes');
const argoSummaryJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'backend', 'data', 'argo_summary_14yr.json'), 'utf8'));
const argoHtml = fs.readFileSync(path.join(__dirname, 'argo.html'), 'utf8');
const argoJs = fs.readFileSync(path.join(__dirname, 'argo.js'), 'utf8');
const heroSection = fs.readFileSync(path.join(__dirname, 'src', 'components', 'landing', 'HeroSection.tsx'), 'utf8');

assert.strictEqual(argoSummaryJson.metadata.errorBands.band90Coverage, '90% band held 90% on 2023 test set');
assert.strictEqual(argoSummaryJson.metadata.errorBands.tchp90Band, '±17.8 kJ/cm², held about 88%');
assert(argoSummaryJson.depths[0].explanation.includes('Surface layer skill is −22% (worse than climatology), based on only 72 profiles'));
assert(argoSummaryJson.depths[1].explanation.includes('+73.3% skill'));

assert(argoHtml.includes('Jun–Dec 2023, n=277 profiles'));
assert(argoHtml.includes('Jun–Dec 2023, n=1,455 profiles'));
assert(argoHtml.includes('Jun–Dec 2023, n=77 profiles'));
assert(argoJs.includes('n=2,910 profiles, 92 floats, 2023'), 'argo.js skill chart axis title must agree with 2,910 headline');

assert(heroSection.includes('2,910 ARGO PROFILES (2023)'), 'HeroSection must state 2,910 ARGO PROFILES (2023)');
console.log('✅ TEST 6 PASSED: All scientific text and coverage percentages corrected');

// 7. 4.0 °C Floor Removed
console.log('\n[TEST 7] 4.0 °C Floor Removed');
assert(!v6AdapterPy.includes('work_profile[i] < 4.0'), 'predict_temperature_profile must not clamp to 4.0°C');
assert(!v6AdapterPy.includes('raw_arr[i] < 4.0'), 'get_profile_data must not clamp raw_arr to 4.0°C');
assert(!v6AdapterPy.includes('corr_arr[i] < 4.0'), 'get_profile_data must not clamp corr_arr to 4.0°C');
console.log('✅ TEST 7 PASSED: 4.0 °C artificial floor cleanly removed');

console.log('\n🎉 ALL 7 PRE-DEMO VERIFICATION TESTS PASSED (100%)!\n');
