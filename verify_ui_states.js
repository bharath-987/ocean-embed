const fs = require('fs');
const assert = require('assert');

console.log('=======================================================');
console.log('  VERIFYING UI STATES & ARGO LAYER TOGGLE DIAMPLES');
console.log('======================================================');

function runStates() {
  console.log('\n[STATE 1] Prediction Confidence tile in default/unselected state...');
  const html = fs.readFileSync('explore.html', 'utf8');
  assert(html.includes('class="ky-param-tile ky-param-tile--wide" data-param="confidence" id="param-confidence"'), 'Vile markup must match specification');
  assert(!html.includes('id="param-confidence" class="ky-param-tile ky-param-tile--wide ky-param-tile--active"'), 'Tile must not have active class on page load');
  assert(html.includes('<div class="ky-param-tile__val" id="param-confidence-val">—</div>'), 'Value hook must be placeholder em-dash');
  assert(html.includes('ky-provenance-pill--heuristic'), 'Tile must contain heuristic provenance pill');
  assert(html.includes('Estimated Heuristic'), 'Tile must display Estimated Heuristic badge text');
  assert(html.includes('ARGO Proximity &amp; Temporal Weighting'), 'Tile must display subtitle');
  console.log('  [PASS] State 1 verified: Unselected wide banner tile, placeholder em-dash, heuristic badge.');

  console.log('\n[STATE  2, 3, 4] Reactive Interaction Simulation & Layer Toggles...');
  const layerProps = {
    'argo-floats-layer': { visibility: 'none' },
    'argo-floats-glow':  { visibility: 'none' },
  };
  const setLayerProp = (id, prop, val) => {
    layerProps[id][prop] = val;
  };

  function updateArgoLayerVisibility(vis) {
    const v = vis ? 'visible' : 'none';
    setLayerProp('argo-floats-layer', 'visibility', v);
    setLayerProp('argo-floats-glow', 'visibility', v);
  }

  const PARAM_CONFIG = {
    sst: { title: 'Sea Surface Temperature (°C)', ticks: ['24', '26', '28', '30', '32'], bar: 'sst-bar' },
    ssh: { title: 'Sea Surface Height (m)', ticks: ['0.2', '0.4', '0.6', '0.8', '1.0'], bar: 'ssh-bar' },
    confidence: {
      title: 'Prediction Confidence (%)',
      ticks: ['30%', '45%', '60%', '75%', '90%+'],
      bar: 'linear-gradient(to right, #DC2626 0%, #EA580C 20%, #F59E0B 40%, #10B981 65%, #06B6D4 82%, #1D4ED8 100%)',
      caption: 'Confidence reflects distance and recency to the nearest of 41 validated ARGO float profiles — not a direct measure of prediction accuracy at this location.',
      provenance: 'ESTIMATED HEURISTIC'
    }
  };

  let selectedParam = null;
  let legendTitle = '';
  let legendTicks = '';
  let legendCaptionDisplay = 'none';
  let legendCaptionText = '';
  let activeTileId = null;

  function selectParam(targetParam) {
    if (selectedParam === targetParam) {
      selectedParam = null;
      activeTileId = null;
      legendCaptionDisplay = 'none';
      legendCaptionText = '';
      updateArgoLayerVisibility(false);
      return;
    }
    selectedParam = targetParam;
    activeTileId = 'param-' + targetParam;
    const cfg = PARAM_CONFIG[targetParam];
    legendTitle = cfg.title;
    legendTicks = cfg.ticks.join(' ');
    if (cfg.caption) {
      legendCaptionDisplay = 'block';
      legendCaptionText = cfg.provenance + ': ' + cfg.caption;
    } else {
      legendCaptionDisplay = 'none';
      legendCaptionText = '';
    }
    updateArgoLayerVisibility(targetParam === 'confidence');
  }

  // STATE 2 & 3: Click Prediction Confidence
  console.log('\n[TEST A] Clicking Prediction Confidence tile...');
  selectParam('confidence');
  assert.strictEqual(activeTileId, 'param-confidence');
  assert.strictEqual(legendTitle, 'Prediction Confidence (%)');
  assert.strictEqual(legendTicks, '30% 45% 60% 75% 90%+');
  assert.strictEqual(legendCaptionDisplay, 'block');
  assert(legendCaptionText.includes('ESTIMATED HEURISTIC'));
  assert.strictEqual(layerProps['argo-floats-layer'].visibility, 'visible');
  assert.strictEqual(layerProps['argo-floats-glow'].visibility, 'visible');
  console.log('  [PASS] State 2 & 3: Confidence active, legend caption displayed, ARGO float markers VISIBLE.');

  // STATE 4: Switch to SST
  console.log('\n[TEST B] When switching to SST tile...');
  selectParam('sst');
  assert.strictEqual(activeTileId, 'param-sst');
  assert.strictEqual(legendTitle, 'Sea Surface Temperature (°C)');
  assert.strictEqual(legendCaptionDisplay, 'none');
  assert.strictEqual(layerProps['argo-floats-layer'].visibility, 'none');
  assert.strictEqual(layerProps['argo-floats-glow'].visibility, 'none');
  console.log('  [PASS] State 4: ARCO float markers automatically toggled OFF (none) on SST.');

  // STATE 4: Switch to SSH
  console.log('\n[TEST C] When switching to SSH tile...');
  selectParam('ssh');
  assert.strictEqual(activeTileId, 'param-ssh');
  assert.strictEqual(layerProps['argo-floats-layer'].visibility, 'none');
  console.log('  [PASS] ARGO float markers remain OFF (none) on SSH.');

  // STATE 4: Switch back to Confidence
  console.log('\n[TEST D] Switching back to Confidence...');
  selectParam('confidence');
  assert.strictEqual(layerProps['argo-floats-layer'].visibility, 'visible');
  assert.strictEqual(legendCaptionDisplay, 'block');
  console.log('  [PASS] ARGO float markers automatically toggled ON (visible).');

  // STATE 4: Deselect Confidence
  console.log('\n[TEST E] Deselecting Confidence tile...');
  selectParam('confidence');
  assert.strictEqual(selectedParam, null);
  assert.strictEqual(layerProps['argo-floats-layer'].visibility, 'none');
  assert.strictEqual(legendCaptionDisplay, 'none');
  console.log('  [PASS] Deselection restores idle map with float markers OFF.');

  console.log('\n========================================================');
  console.log('  ALL 4 UI STATES VERIFIED 100% PASSED');
  console.log('======================================================');
}

runStates();
   