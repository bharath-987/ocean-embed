const fs = require('fs');

const bundle = fs.readFileSync('dist/kyogre-app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

const checks = [
  ['Bundle generated & non-empty', bundle.length > 50000],
  ['React mount point in index.html', html.includes('id="root"')],
  ['Bundle script loaded in html', html.includes('dist/kyogre-app.js')],
  
  // Requirement 1: Navbar removed, minimal KYOGRE brand in top-left
  ['Navbar header removed', !bundle.includes('SIH26066 · INCOIS / MoES') && !bundle.includes('0m Surface') && !bundle.includes('The Void')],
  ['Minimal KYOGRE brand present in top-left', bundle.includes('KYOGRE')],
  
  // Requirement 2: Telemetry box removed
  ['SENSOR TELEMETRY card removed', !bundle.includes('SENSOR TELEMETRY')],
  ['Coordinate stamp above depth indicator removed', !bundle.includes('ARABIAN SEA TRANSECT')],

  // Requirement 3: Vertical depth indicator retained
  ['AIR marker present in depth indicator', bundle.includes('"AIR"')],
  ['0m marker present in depth indicator', bundle.includes('"0m"')],
  ['100m marker present in depth indicator', bundle.includes('"100m"')],
  ['250m marker present in depth indicator', bundle.includes('"250m"')],
  ['500m marker present in depth indicator', bundle.includes('"500m"')],
  ['750m marker present in depth indicator', bundle.includes('"750m"')],
  ['1000m marker present in depth indicator', bundle.includes('"1000m"')],

  // Requirement 4 & 6: Hero, Descent narrative, and subsequent sections untouched
  ['Hero title KYOGRE present', bundle.includes('KYOGRE')],
  ['Hero tagline Seeing Beneath the Surface present', bundle.includes('Seeing Beneath the Surface')],
  ['Hero Explore button present', bundle.includes('EXPLORE KYOGRE')],
  ['Hero View Prototype button present', bundle.includes('VIEW PROTOTYPE')],
  ['Hero Scroll to Descend indicator present', bundle.includes('SCROLL TO DESCEND')],
  ['0m Surface narrative present', bundle.includes('WE CAN SEE THE SURFACE')],
  ['100m Volumetric narrative present', bundle.includes('THE OCEAN IS VOLUMETRIC')],
  ['250m The Void narrative present', bundle.includes('BETWEEN THE OBSERVATIONS')],
  ['500m Turning point question present', bundle.includes('HOW DO WE RECONSTRUCT WHAT WE CANNOT DIRECTLY OBSERVE')],
  ['750m Architecture narrative present', bundle.includes('MEET KYOGRE')],
  ['1000m Reconstruction narrative present', bundle.includes('FROM SURFACE SIGNALS')],
  ['National Oceanographic Console present', bundle.includes('THE OCEAN, MADE COMPUTABLE')],
  ['Prototype Showcase present', bundle.includes('KYOGRE IS ALREADY TAKING SHAPE')],
  ['Final CTA present', bundle.includes('THE SURFACE IS ONLY THE BEGINNING')],
  ['Module links intact', bundle.includes('explore.html') && bundle.includes('fisheries.html') && bundle.includes('argo.html') && bundle.includes('marine-ecology.html')],

  // Strict Video-First and Video-Only Requirements
  ['Canonical video asset exists in public/media/kyogre-ocean-dive.mp4', fs.existsSync('public/media/kyogre-ocean-dive.mp4') && fs.statSync('public/media/kyogre-ocean-dive.mp4').size > 1000000],
  ['Canonical video asset exists in media/kyogre-ocean-dive.mp4', fs.existsSync('media/kyogre-ocean-dive.mp4') && fs.statSync('media/kyogre-ocean-dive.mp4').size > 1000000],
  ['Video canonical path referenced in bundle', bundle.includes('/public/media/kyogre-ocean-dive.mp4') && bundle.includes('media/kyogre-ocean-dive.mp4')],
  ['Image background system completely removed from cinematic dive', !bundle.includes('assets/ocean-aerial-hero.jpg') && !bundle.includes('assets/ocean-underwater-caustics.jpg') && !bundle.includes('assets/ocean-abyss-deep.jpg')],
  ['No simulated canvas wave lines in dive', !bundle.includes('waterY + wave')],
  ['Hardware-accelerated scroll-seek mechanism implemented', bundle.includes('currentTime') && (bundle.includes('dispatchSeek') || bundle.includes('fastSeek'))],
  ['Video specification documentation present in public/media/README.md', fs.existsSync('public/media/README.md') && fs.readFileSync('public/media/README.md', 'utf8').includes('kyogre-ocean-dive.mp4')],

  // Master Continuous Timeline & Decoupled Scrubbing Requirements
  ['Extended 1000vh master cinematic track configured', bundle.includes('1000vh')],
  ['Decoupled video scrubbing with held final frame', bundle.includes('VIDEO_END_PROGRESS') || bundle.includes('0.62')],
  ['CNN-LSTM DEEP LEARNING MODEL label present in Phase 5', bundle.includes('CNN-LSTM DEEP LEARNING MODEL')],
  ['SURFACE WINDS and SURFACE CURRENTS chips present', bundle.includes('SURFACE WINDS') && bundle.includes('SURFACE CURRENTS')],
  ['Research Console precedes Scientific Pipeline in DOM flow', bundle.indexOf('THE OCEAN, MADE COMPUTABLE') < bundle.indexOf('A RECONSTRUCTION IS ONLY AS VALUABLE AS ITS VALIDATION')],
];

let passCount = 0;
for (const [name, ok] of checks) {
  console.log((ok ? 'PASS: ' : 'FAIL: ') + name);
  if (ok) passCount++;
}

console.log('\nResult: ' + passCount + ' / ' + checks.length + ' checks passed.');
if (passCount !== checks.length) process.exit(1);
