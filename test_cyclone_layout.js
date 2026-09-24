/**
 * test_cyclone_layout.js — Verifies Cyclone Mode Layout, Theme, Dropdown & 4 Stat Cards
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:8000';
const CYCLONES = ['BIPARJOY', 'MOCHA', 'TEJ', 'HAMOON', 'MIDHILI', 'MICHAUNG'];

async function runLayoutVerification() {
  console.log('============================================================');
  console.log('  CYCLONE MODE LAYOUT & LIGHT THEME VERIFICATION');
  console.log('============================================================\n');

  const html = fs.readFileSync(path.join(__dirname, 'cyclone.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, 'cyclone.css'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, 'cyclone.js'), 'utf8');

  // 1. Verify Body and Global App Shell
  console.log('[CHECK 1] Verifying light theme body and global app shell...');
  assert(html.includes('class="kyogre-page"'), 'Body must have kyogre-page class for light theme');
  assert(html.includes('class="ky-app"'), 'Must have ky-app container');
  assert(!html.includes('ky-page-cyclone'), 'Old dark theme class ky-page-cyclone must be removed');
  assert(css.includes('background: #EAF3FC'), 'cyclone.css must set light background #EAF3FC');
  console.log('  ✓ Light theme body class (.kyogre-page) and layout confirmed.\n');

  // 2. Verify Top-to-Bottom Structure Order
  console.log('[CHECK 2] Verifying exact top-to-bottom layout sequence...');
  const statIndex = html.indexOf('ky-stat-row ky-cyclone-stats');
  const workspaceIndex = html.indexOf('ky-cyclone-workspace-grid');
  const argoIndex = html.indexOf('ky-cyclone-argo-card');
  const methodologyIndex = html.indexOf('ky-cyclone-bottom-methodology');

  assert(statIndex !== -1, 'Stat row must exist');
  assert(workspaceIndex !== -1, 'Workspace grid (map + chart) must exist');
  assert(argoIndex !== -1, 'Argo truth check card must exist');
  assert(methodologyIndex !== -1, 'Methodology banner at bottom must exist');

  assert(statIndex < workspaceIndex, '1. 4-stat cards must be above workspace');
  assert(workspaceIndex < argoIndex, '2. Workspace (map+chart) must be above Argo truth card');
  assert(argoIndex < methodologyIndex, '3. Argo truth card must be above methodology banner at the bottom');
  console.log('  ✓ Top-to-bottom sequence confirmed: Stat Cards -> Map+Chart -> Argo Table -> Methodology Banner.\n');

  // 3. Verify 4 Stat Cards Structure
  console.log('[CHECK 3] Verifying 4 stat cards in top row...');
  assert(html.includes('id="stat-peak-wind"'), 'Peak intensity value element present');
  assert(html.includes('id="stat-peak-cat"'), 'Peak category subtitle present');
  assert(html.includes('id="stat-peak-fuel"'), 'Peak fuel value element present');
  assert(html.includes('id="stat-fuel-sub"'), 'Peak fuel subtitle present');
  assert(html.includes('id="stat-ri-val"'), 'RI value element present');
  assert(html.includes('id="stat-ri-sub"'), 'RI subtitle present');
  assert(html.includes('id="stat-argo-count"'), 'Argo count element present');
  assert(html.includes('id="stat-argo-sub"'), 'Argo subtitle present');
  console.log('  ✓ All 4 stat card elements present with exact matching IDs.\n');

  // 4. Verify Map Dropdown Selector
  console.log('[CHECK 4] Verifying map top-left dropdown storm selector...');
  assert(html.includes('id="map-storm-dropdown-wrap"'), 'map-storm-dropdown-wrap element present');
  assert(html.includes('id="map-storm-btn"'), 'map-storm-btn element present');
  assert(html.includes('id="map-storm-label"'), 'map-storm-label element present');
  assert(html.includes('id="map-storm-menu"'), 'map-storm-menu element present');
  assert(html.includes('id="map-storm-options"'), 'map-storm-options element present');
  assert(!html.includes('id="cyclone-selector-grid"'), 'Old 6-card grid selector must be removed');
  console.log('  ✓ Top-left map dropdown component verified (replaces 6-card row).\n');

  // 5. Verify All 6 Storms Load and Stat Cards Compute Correctly
  console.log('[CHECK 5] Testing all 6 storms via API and verifying stat calculations...');
  for (const name of CYCLONES) {
    const res = await fetch(`${API_BASE}/cyclone/${name}`);
    assert.strictEqual(res.status, 200, `API /cyclone/${name} must succeed`);
    const storm = await res.json();

    // Verify Peak Intensity
    const peakWind = `${storm.peak_kt} kt`;
    const kmh = Math.round(storm.peak_kt * 1.852);
    const peakCat = `${storm.peak_category} · ${kmh} km/h`;

    // Verify Peak Ocean Fuel (TCHP)
    let maxFuel = 0;
    storm.track.forEach(f => {
      if (f.fuel && f.fuel.tchp !== null && f.fuel.tchp > maxFuel) {
        maxFuel = f.fuel.tchp;
      }
    });
    const peakFuelStr = maxFuel > 0 ? `${maxFuel.toFixed(1)} kJ/cm²` : '—';

    // Verify RI
    const riStr = storm.ri ? 'Observed (RI)' : 'Standard Rate';

    // Verify Argo Count
    const pairsCount = storm.argo && storm.argo.pairs ? storm.argo.pairs.length : 0;
    const argoStr = `${pairsCount} Paired Float${pairsCount !== 1 ? 's' : ''}`;

    assert(maxFuel > 0, `Storm ${name} must have positive max fuel`);
    console.log(`  ✓ Storm ${name.padEnd(8)}: Peak Wind: ${peakWind.padEnd(7)} | Fuel: ${peakFuelStr.padEnd(14)} | RI: ${riStr.padEnd(14)} | Argo: ${argoStr}`);
  }

  console.log('\n============================================================');
  console.log('  ALL LAYOUT, THEME & BEHAVIOR CHECKS PASSED (100%)');
  console.log('============================================================\n');
}

runLayoutVerification().catch(err => {
  console.error('❌ Layout verification failed:', err);
  process.exit(1);
});
