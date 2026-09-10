/**
 * Automated Verification Test for Fisheries Mode (fisheries.html & fisheries.js)
 * Tests:
 * 1. Branding: Kyogre in header, copyright in footer. ZERO instances of "OceanEmbed".
 * 2. Top 4 Stat Cards: Thermocline Depth, Upwelling Index, PFZ Confidence Score, Nutrient Proxy.
 * 3. Subheader: Fish icon, title, subtitle, tagline.
 * 4. Content Structure: Map card, Chlorophyll-a legend, Bottom card with Recommended Species & Hotspot comparison.
 * 5. Right Panel: Vertical Profile header, Table/Graph toggles, 3-column table headers (Depth, Temp, Nutrient), PFZ Advisory box, Key Insights.
 * 6. Script references: coastline.js, fisheries.js.
 * 7. Navigation: Link back to Dashboard (explore.html).
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Starting Fisheries Mode Automated Verification ---');

const htmlPath = path.join(__dirname, 'fisheries.html');
assert(fs.existsSync(htmlPath), 'fisheries.html must exist');
const html = fs.readFileSync(htmlPath, 'utf-8');

// 1. Branding & Strict "No OceanEmbed" check
console.log('1. Verifying Branding...');
assert(html.includes('Kyogre'), 'Brand must include Kyogre');
assert(html.includes('© 2025 Kyogre. All rights reserved.'), 'Copyright must specify Kyogre 2025');
const oceanEmbedMatches = html.match(/oceanembed/gi);
assert(!oceanEmbedMatches, `Found forbidden "OceanEmbed" brand references in HTML: ${oceanEmbedMatches}`);
console.log('   ✓ Zero OceanEmbed references found. Kyogre branding verified.');

// 2. Subheader Elements
console.log('2. Verifying Subheader...');
assert(html.includes('Fisheries Mode'), 'Subheader title must be Fisheries Mode');
assert(html.includes('Identify Potential Fishing Zones (PFZ) using multi-parameter ocean data.'), 'Subtitle verified');
assert(html.includes('Data-driven advisories for thriving oceans and resilient fisheries.'), 'Tagline verified');
console.log('   ✓ Subheader title, subtitle, and tagline verified.');

// 3. Top 4 Stat Cards
console.log('3. Verifying 4 Stat Cards...');
assert(html.includes('Thermocline Depth (m)'), 'Stat 1: Thermocline Depth must exist');
assert(html.includes('stat-thermocline-val'), 'stat-thermocline-val element must exist');
assert(html.includes('stat-thermocline-badge'), 'stat-thermocline-badge element must exist');

assert(html.includes('Upwelling Index (0–1)'), 'Stat 2: Upwelling Index must exist');
assert(html.includes('stat-upwelling-val'), 'stat-upwelling-val element must exist');
assert(html.includes('stat-upwelling-badge'), 'stat-upwelling-badge element must exist');

assert(html.includes('PFZ Confidence Score'), 'Stat 3: PFZ Confidence Score must exist');
assert(html.includes('stat-pfz-val'), 'stat-pfz-val element must exist');
assert(html.includes('stat-pfz-badge'), 'stat-pfz-badge element must exist');

assert(html.includes('Nutrient Proxy / Chl-a (mg/m³)'), 'Stat 4: Nutrient Proxy must exist');
assert(html.includes('stat-nutrient-val'), 'stat-nutrient-val element must exist');
assert(html.includes('stat-nutrient-badge'), 'stat-nutrient-badge element must exist');
console.log('   ✓ All 4 stat cards with values and trend badges verified.');

// 4. Map & Chlorophyll-a Legend
console.log('4. Verifying Map, Controls & Chlorophyll-a Legend...');
assert(html.includes('id="map"'), 'Map container must exist');
assert(html.includes('Chlorophyll-a &amp; Potential Fishing Zones (PFZ)'), 'Map title verified');
assert(html.includes('Chlorophyll-a (mg/m³)'), 'Legend title verified');
assert(html.includes('id="region-notice"'), 'Region notice must exist');
assert(html.includes('btn-region-select'), 'Region selector button must exist');
assert(html.includes('btn-zoom-in'), 'Zoom in button must exist');
assert(html.includes('btn-zoom-out'), 'Zoom out button must exist');
assert(html.includes('btn-layer-toggle'), 'Layer toggle button must exist');
assert(html.includes('ky-compass-indicator'), 'North compass indicator must exist');
assert(html.includes('ky-map-scale-bar'), 'Scale bar must exist');
console.log('   ✓ Map, region selector, zoom, compass, scale, and legend verified.');

// 5. Two-column Layout Structure (NO Ocean Parameters)
console.log('5. Verifying Two-Column Layout Structure...');
assert(html.includes('ky-fisheries-content-row'), 'Two-column grid container must exist');
assert(html.includes('ky-fisheries-map-col'), 'Map column must exist');
assert(html.includes('ky-fisheries-side-col'), 'Side panel column must exist');
assert(html.includes('ky-fisheries-map-wrap'), 'Map wrap container must exist');
// Ensure Ocean Parameters tiles are NOT in fisheries.html
assert(!html.includes('ky-param-tile'), 'ky-param-tile should not be in fisheries.html');
console.log('   ✓ Two-column grid structure verified without Ocean Parameters.');

// 6. Right Panel: 3-column table, PFZ Advisory & Key Insights
console.log('6. Verifying Vertical Profile Right Panel...');
assert(html.includes('Depth (m)'), 'Table Column 1: Depth');
assert(html.includes('Temperature (°C)'), 'Table Column 2: Temperature');
assert(html.includes('Nutrient (mg/m³)'), 'Table Column 3: Nutrient');
assert(html.includes('btn-view-table'), 'Table view toggle button verified');
assert(html.includes('btn-view-graph'), 'Graph view toggle button verified');
assert(html.includes('pfz-advisory-box'), 'PFZ advisory callout box verified');
assert(html.includes('Key Insights'), 'Key insights section verified');
console.log('   ✓ 3-column table, graph toggle, PFZ advisory, and insights verified.');

// 7. Scripts & Navigation
console.log('7. Verifying Script references and Navigation...');
assert(html.includes('src="coastline.js"'), 'Must include coastline.js');
assert(html.includes('src="fisheries.js"'), 'Must include fisheries.js');
assert(html.includes("window.location.href='explore.html'"), 'Must have working link back to explore.html');

const jsPath = path.join(__dirname, 'fisheries.js');
assert(fs.existsSync(jsPath), 'fisheries.js must exist');
const js = fs.readFileSync(jsPath, 'utf-8');
assert(!js.match(/oceanembed/gi), 'fisheries.js must not contain OceanEmbed');
assert(js.includes('PRESET_ZONES'), 'PRESET_ZONES constant must exist');
assert(js.includes('createChlaCanvas'), 'createChlaCanvas function must exist');
assert(js.includes('calculateSubsurfaceProfile'), 'calculateSubsurfaceProfile function must exist');
assert(js.includes('selectLocation'), 'selectLocation function must exist');
console.log('   ✓ Script logic and zero-branding-violation in fisheries.js verified.');

console.log('\n=== ALL FISHERIES MODE TESTS PASSED SUCCESSFULLY! ===\n');
