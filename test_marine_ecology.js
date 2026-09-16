/**
 * Automated Verification Suite for Marine Ecology & Heatwave Mode
 * Tests Hobday et al. (2016) MHW detection algorithm, backend endpoint,
 * category arithmetic, duration >= 5 days constraint, frontend DOM, and navigation.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition, message) {
  totalAssertions++;
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedAssertions++;
  console.log(`  PASS: ${message}`);
}

function makePostRequest(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(body);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('\n============================================================');
  console.log('  TEST SUITE: Marine Ecology & Heatwave Mode (Hobday 2016)');
  console.log('============================================================\n');

  // --------------------------------------------------------------------------
  // SECTION 1: Precomputed Climatology File Integrity
  // --------------------------------------------------------------------------
  console.log('SECTION 1: Climatology File Integrity');
  const climPath = path.join(__dirname, 'backend', 'data', 'mhw_climatology.npz');
  assert(fs.existsSync(climPath), 'backend/data/mhw_climatology.npz exists');
  const climStats = fs.statSync(climPath);
  assert(climStats.size > 200 * 1024, `mhw_climatology.npz is non-empty (${(climStats.size / 1024).toFixed(1)} KB)`);

  // --------------------------------------------------------------------------
  // SECTION 2: Backend API Schema & Endpoint Verification
  // --------------------------------------------------------------------------
  console.log('\nSECTION 2: Backend API POST /marine-heatwave');
  const queryCoord = { latitude: 15.0, longitude: 65.0, reference_date: '2021-07-03' };
  const res = await makePostRequest('http://localhost:8000/marine-heatwave', queryCoord);
  assert(res.status === 200, `POST /marine-heatwave returns 200 OK (status=${res.status})`);

  const body = res.data;
  assert(body.location && body.location.latitude === 15.0 && body.location.longitude === 65.0, 'Location matches query');
  assert(Array.isArray(body.events), 'Events field is an array');
  assert(body.current_status && typeof body.current_status === 'object', 'current_status is an object');
  assert(body.climatology_method && body.climatology_method.includes('90th percentile'), 'climatology_method describes 90th percentile baseline');
  assert(body.climatology_method.includes('3-year baseline'), 'climatology_method includes transparent 3-year baseline caveat');
  assert(Array.isArray(body.sst_timeseries) && body.sst_timeseries.length > 0, 'sst_timeseries is non-empty array');

  // Verify timeseries row schema
  const firstRow = body.sst_timeseries[0];
  assert('date' in firstRow, 'timeseries has date');
  assert('sst' in firstRow, 'timeseries has sst');
  assert('climatological_mean' in firstRow, 'timeseries has climatological_mean');
  assert('climatological_threshold' in firstRow, 'timeseries has climatological_threshold');
  assert('in_heatwave' in firstRow, 'timeseries has in_heatwave boolean');

  // --------------------------------------------------------------------------
  // SECTION 3: Hobday Duration Criterion (>= 5 consecutive days)
  // --------------------------------------------------------------------------
  console.log('\nSECTION 3: Hobday Duration Criterion (>= 5 Days)');
  assert(body.events.length > 0, `Detected at least 1 event at (15N, 65E) (found ${body.events.length})`);
  body.events.forEach((ev, idx) => {
    assert(ev.duration_days >= 5, `Event ${idx + 1} (${ev.start_date} to ${ev.end_date}): duration ${ev.duration_days} >= 5 days`);
  });

  // --------------------------------------------------------------------------
  // SECTION 4: Hobday Category Arithmetic Verification
  // --------------------------------------------------------------------------
  console.log('\nSECTION 4: Hobday Category Arithmetic Verification');
  body.events.forEach((ev, idx) => {
    const rawAnom = Number((ev.peak_sst - ev.peak_mean).toFixed(2));
    const rawDist = Number((ev.peak_threshold - ev.peak_mean).toFixed(2));
    assert(Math.abs(ev.peak_anomaly_c - rawAnom) <= 0.02, `Event ${idx + 1}: peak anomaly arithmetic matches (SST - Mean)`);
    assert(Math.abs(ev.threshold_distance_c - rawDist) <= 0.02, `Event ${idx + 1}: threshold distance arithmetic matches (Thresh - Mean)`);

    const expectedMult = Number((rawAnom / rawDist).toFixed(2));
    assert(Math.abs(ev.multiplier - expectedMult) <= 0.05, `Event ${idx + 1}: multiplier matches Anom / Dist`);

    let expectedCat = Math.floor(expectedMult);
    if (expectedCat < 1) expectedCat = 1;
    if (expectedCat > 4) expectedCat = 4;
    assert(ev.category === expectedCat, `Event ${idx + 1}: category ${ev.category} matches floor(multiplier)`);

    const labels = {
      1: 'Category I (Moderate)',
      2: 'Category II (Strong)',
      3: 'Category III (Severe)',
      4: 'Category IV (Extreme)'
    };
    assert(ev.category_label === labels[expectedCat], `Event ${idx + 1}: category_label '${ev.category_label}' matches expected`);
  });

  // --------------------------------------------------------------------------
  // SECTION 5: Reference Date Status Evaluation (Active vs Inactive)
  // --------------------------------------------------------------------------
  console.log('\nSECTION 5: Reference Date Evaluation');
  // Active test (2021-07-03 at 15N, 65E is day 3 of 8-day event 2021-07-01 to 2021-07-08)
  const activeStatus = body.current_status;
  assert(activeStatus.in_heatwave === true, '2021-07-03 correctly identified as in_heatwave=true');
  assert(activeStatus.days_elapsed === 3, `2021-07-03 has days_elapsed=3 (got ${activeStatus.days_elapsed})`);
  assert(activeStatus.category === 1, '2021-07-03 category is 1');
  assert(activeStatus.category_label === 'Category I (Moderate)', 'category_label is Category I (Moderate)');

  // Inactive test (2021-01-01 at 15N, 65E is not in heatwave)
  const inactiveRes = await makePostRequest('http://localhost:8000/marine-heatwave', {
    latitude: 15.0,
    longitude: 65.0,
    reference_date: '2021-01-01'
  });
  assert(inactiveRes.status === 200, 'Inactive date request returns 200');
  const inactStatus = inactiveRes.data.current_status;
  assert(inactStatus.in_heatwave === false, '2021-01-01 correctly identified as in_heatwave=false');
  assert(inactStatus.category === null, 'in_heatwave=false has category=null');
  assert(inactStatus.days_elapsed === null, 'in_heatwave=false has days_elapsed=null');
  assert(inactStatus.event === null, 'in_heatwave=false has event=null');

  // --------------------------------------------------------------------------
  // SECTION 6: Land Coordinate Rejection
  // --------------------------------------------------------------------------
  console.log('\nSECTION 6: Land Coordinate Rejection');
  const landRes = await makePostRequest('http://localhost:8000/marine-heatwave', {
    latitude: 24.7,
    longitude: 46.7,
    reference_date: '2021-03-25'
  });
  assert(landRes.status === 400, `Land coordinate returns 400 Bad Request (status=${landRes.status})`);
  assert(landRes.data && landRes.data.detail && landRes.data.detail.includes('Land coordinate selected'), 'Land error detail message is informative');

  // --------------------------------------------------------------------------
  // SECTION 7: Frontend DOM & HTML Verification (marine-ecology.html)
  // --------------------------------------------------------------------------
  console.log('\nSECTION 7: Frontend DOM Verification (marine-ecology.html)');
  const htmlPath = path.join(__dirname, 'marine-ecology.html');
  assert(fs.existsSync(htmlPath), 'marine-ecology.html exists');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert(html.includes('Kyogre — Marine Ecology &amp; Heatwave Mode'), 'Title is correct');
  assert(html.includes('Historical Reanalysis'), 'Historical Reanalysis badge title present');
  assert(html.includes('Reconstructed Data'), 'Reconstructed Data subtitle present');
  assert(!html.includes('Live Data'), 'Does NOT contain contradicted Live Data badge');
  assert(html.includes('ky-live-dot--reanalysis'), 'Uses ky-live-dot--reanalysis CSS class');

  // Single 4-column stat row (Card 1: MHW Status, Card 2: Events in Window, Card 3: Peak Category, Card 4: Longest Duration)
  const statRowIdx = html.indexOf('class="ky-stat-row"');
  assert(statRowIdx !== -1, 'Stat cards container .ky-stat-row present');
  const statRowSlice = html.slice(statRowIdx, html.indexOf('class="ky-mhw-content-row"'));

  // Assert exactly 4 cards in the single stat row
  const cardCount = (statRowSlice.match(/class="ky-stat-card"/g) || []).length;
  assert(cardCount === 4, `Stat row contains exactly 4 cards (found ${cardCount})`);

  // Assert all 4 cards carry Estimated Heuristic provenance pills
  const pillCount = (statRowSlice.match(/ky-provenance-pill--heuristic/g) || []).length;
  assert(pillCount === 4, `Stat row contains exactly 4 Estimated Heuristic provenance pills (found ${pillCount})`);
  assert(!statRowSlice.includes('ky-provenance-pill--model'), 'No Model-Derived pills remain in stat cards');
  assert(statRowSlice.includes('Derived from Hobday et al. (2016) statistical thresholding'), 'Cards include explanatory title attribute');

  // Card 1: Marine Heatwave Status
  assert(statRowSlice.includes('Marine Heatwave Status'), 'Card 1 title present');
  assert(statRowSlice.includes('id="stat-mhw-val"'), 'Card 1 value ID present');
  assert(statRowSlice.includes('id="stat-mhw-badge"'), 'Card 1 badge ID present');
  assert(statRowSlice.includes('id="stat-mhw-note"'), 'Card 1 note ID present');
  assert(statRowSlice.includes('Select location &amp; date'), 'Card 1 initial empty-state prompt present');

  // Card 2: Events in Window
  assert(statRowSlice.includes('Events in Window'), 'Card 2 title present');
  assert(statRowSlice.includes('id="stat-window-events-val"'), 'Card 2 value ID present');
  assert(statRowSlice.includes('id="stat-window-events-note"'), 'Card 2 note ID present');
  assert(statRowSlice.includes('Awaiting selection'), 'Card 2 terse empty-state copy present');

  // Card 3: Peak Category (Window)
  assert(statRowSlice.includes('Peak Category (Window)'), 'Card 3 title present');
  assert(statRowSlice.includes('id="stat-window-peak-val"'), 'Card 3 value ID present');
  assert(statRowSlice.includes('id="stat-window-peak-note"'), 'Card 3 note ID present');

  // Card 4: Longest Event Duration (Window)
  assert(statRowSlice.includes('Longest Event Duration (Window)'), 'Card 4 title present');
  assert(statRowSlice.includes('id="stat-window-duration-val"'), 'Card 4 value ID present');
  assert(statRowSlice.includes('id="stat-window-duration-note"'), 'Card 4 note ID present');

  // Map and Zoom controls
  assert(html.includes('id="map"'), 'Map container element present');
  assert(html.includes('id="btn-zoom-in"'), 'Zoom in button present');
  assert(html.includes('id="btn-zoom-out"'), 'Zoom out button present');
  assert(!html.includes('ky-mhw-map-header'), 'Obsolete map header with awkward minimize/dash removed');
  assert(html.includes('id="selected-loc-coord"'), 'Coordinate display pill present');

  // Map and Chart hooks
  assert(html.includes('id="map"'), 'Map container element present');
  assert(html.includes('id="mhw-chart"'), 'Chart canvas element present');
  assert(html.includes('id="mhw-empty-view"'), 'Empty view placeholder present');
  assert(html.includes('id="mhw-chart-view"'), 'Chart view container present');

  // Mandatory methodology caveat card
  assert(html.includes('ky-mhw-methodology-card'), 'Methodology disclaimer card present');
  assert(html.includes('Hobday et al. (2016)'), 'Disclaimer cites Hobday et al. (2016)');
  assert(html.includes('5+ consecutive days'), 'Disclaimer mentions 5+ consecutive days');
  assert(html.includes('short baseline period'), 'Disclaimer mentions short baseline period');
  assert(html.includes('10–30 year'), 'Disclaimer mentions 10–30 year long-term monitoring');

  // Exclude extraneous heuristics
  assert(!html.includes('coral bleaching risk'), 'Does NOT include extraneous coral bleaching heuristics');
  assert(!html.includes('species impact'), 'Does NOT include speculative species impact heuristics');

  // --------------------------------------------------------------------------
  // SECTION 8: Sidebar Navigation Parity Across All Pages
  // --------------------------------------------------------------------------
  console.log('\nSECTION 8: Site-Wide Navigation Verification');
  const exploreHtml = fs.readFileSync(path.join(__dirname, 'explore.html'), 'utf8');
  const fisheriesHtml = fs.readFileSync(path.join(__dirname, 'fisheries.html'), 'utf8');
  const argoHtml = fs.readFileSync(path.join(__dirname, 'argo.html'), 'utf8');

  assert(exploreHtml.includes('data-nav="ecology" onclick="window.location.href=\'marine-ecology.html\'"'), 'explore.html wires ecology button to marine-ecology.html');
  assert(fisheriesHtml.includes('data-nav="ecology" onclick="window.location.href=\'marine-ecology.html\'"'), 'fisheries.html wires ecology button to marine-ecology.html');
  assert(argoHtml.includes('data-nav="ecology" onclick="window.location.href=\'marine-ecology.html\'"'), 'argo.html wires ecology button to marine-ecology.html');
  assert(html.includes('class="ky-nav-item ky-nav-item--active" data-nav="ecology"'), 'marine-ecology.html marks ecology nav item active');

  // --------------------------------------------------------------------------
  // SECTION 9: Client Script Functions & Unit Tests (marine-ecology.js)
  // --------------------------------------------------------------------------
  console.log('\nSECTION 9: Client Script Unit Tests (marine-ecology.js)');
  const client = require('./marine-ecology.js');
  assert(typeof client.computeDateWindow === 'function', 'computeDateWindow exported');
  assert(typeof client.formatDateDisplay === 'function', 'formatDateDisplay exported');
  assert(typeof client.formatEventDateRange === 'function', 'formatEventDateRange exported');
  assert(typeof client.computeWindowStats === 'function', 'computeWindowStats exported');
  assert(typeof client.parseCoordinates === 'function', 'parseCoordinates exported');
  assert(typeof client.formatCoordinates === 'function', 'formatCoordinates exported');

  // Test formatCoordinates
  assert(client.formatCoordinates(15.5, 69.25) === '15.50°N, 69.25°E', 'formatCoordinates formats positive coordinates with N/E');
  assert(client.formatCoordinates(-8.03, -78.72) === '8.03°S, 78.72°W', 'formatCoordinates formats negative coordinates with S/W');

  // Test computeDateWindow
  const win = client.computeDateWindow('2022-07-02', 60);
  assert(win.startDate <= '2022-05-04', `Start date is padded back ~60 days (${win.startDate})`);
  assert(win.endDate >= '2022-08-30', `End date is padded forward ~60 days (${win.endDate})`);

  // Test clamp to dataset bounds
  const clampedWin = client.computeDateWindow('2021-01-15', 60);
  assert(clampedWin.startDate === '2021-01-01', 'Window clamped to dataset min 2021-01-01');

  // Test parseCoordinates
  const parsed = client.parseCoordinates('15.5, 65.2');
  assert(parsed && parsed.lat === 15.5 && parsed.lon === 65.2, 'parseCoordinates parses comma coordinates');
  const invalid = client.parseCoordinates('50.0, 10.0'); // out of bounds
  assert(invalid === null, 'parseCoordinates rejects out-of-bounds coordinates');

  // Test formatDateDisplay
  assert(client.formatDateDisplay('2022-07-02') === 'Jul 2, 2022', 'formatDateDisplay formats YYYY-MM-DD');

  // Test formatEventDateRange
  assert(client.formatEventDateRange('2023-11-03', '2023-11-20') === 'Nov 3 - Nov 20, 2023', 'formatEventDateRange formats same-month same-year range');
  assert(client.formatEventDateRange('2021-03-23', '2021-03-31') === 'Mar 23 - Mar 31, 2021', 'formatEventDateRange formats Mar 23 - Mar 31, 2021');
  assert(client.formatEventDateRange('2022-12-25', '2023-01-05') === 'Dec 25, 2022 - Jan 5, 2023', 'formatEventDateRange formats cross-year range');

  // Test computeWindowStats with empty events array (0 events)
  const emptyStats = client.computeWindowStats([]);
  assert(emptyStats.eventCount === 0, 'empty events produces eventCount=0');
  assert(emptyStats.eventCountText === '0', 'empty events produces eventCountText="0"');
  assert(emptyStats.eventCountNote === 'No events detected in this window', 'empty events produces correct count note');
  assert(emptyStats.peakCategoryText === '—', 'empty events produces peakCategoryText="—"');
  assert(emptyStats.peakCategoryNote === 'No events detected in this window', 'empty events produces correct peak category note');
  assert(emptyStats.longestDurationText === '—', 'empty events produces longestDurationText="—"');
  assert(emptyStats.longestDurationNote === 'No events detected', 'empty events produces correct longest duration note');

  // Test computeWindowStats with live events from API response
  const liveStats = client.computeWindowStats(body.events);
  assert(liveStats.eventCount === body.events.length, `liveStats eventCount matches body.events (${liveStats.eventCount})`);
  assert(liveStats.eventCountText === String(body.events.length), 'liveStats eventCountText is formatted number');
  assert(liveStats.eventCountNote.includes(`${body.events.length} event`), 'liveStats eventCountNote includes count and "event"');
  assert(['Moderate', 'Strong', 'Severe', 'Extreme'].includes(liveStats.peakCategoryText), `liveStats peakCategoryText is valid Hobday category (${liveStats.peakCategoryText})`);
  assert(liveStats.peakCategoryNote.includes('above climatological mean'), 'liveStats peakCategoryNote mentions climatological mean');
  assert(liveStats.longestDurationText.includes('days'), 'liveStats longestDurationText includes "days"');

  // Test computeWindowStats with multi-category synthetic events
  const syntheticEvents = [
    {
      start_date: '2023-04-10',
      end_date: '2023-04-16',
      duration_days: 7,
      category: 1,
      category_label: 'Moderate',
      peak_anomaly_c: 1.2
    },
    {
      start_date: '2023-05-01',
      end_date: '2023-05-18',
      duration_days: 18,
      category: 2,
      category_label: 'Strong',
      peak_anomaly_c: 2.1
    }
  ];
  const synStats = client.computeWindowStats(syntheticEvents);
  assert(synStats.eventCount === 2, 'synthetic: eventCount=2');
  assert(synStats.eventCountText === '2', 'synthetic: eventCountText="2"');
  assert(synStats.eventCountNote === '2 events detected in displayed window', 'synthetic: eventCountNote="2 events detected in displayed window"');
  assert(synStats.peakCategoryText === 'Strong', 'synthetic: peakCategoryText="Strong"');
  assert(synStats.peakCategoryNote === '+2.1°C above climatological mean', 'synthetic: peakCategoryNote="+2.1°C above climatological mean"');
  assert(synStats.longestDurationText === '18 days', 'synthetic: longestDurationText="18 days"');
  assert(synStats.longestDurationNote === 'May 1 - May 18, 2023', 'synthetic: longestDurationNote="May 1 - May 18, 2023"');

  console.log('\n============================================================');
  console.log(`  ALL TESTS PASSED! (${passedAssertions}/${totalAssertions} assertions)`);
  console.log('============================================================\n');
}

runTests().catch(err => {
  console.error('\nTest runner failed:', err);
  process.exit(1);
});
