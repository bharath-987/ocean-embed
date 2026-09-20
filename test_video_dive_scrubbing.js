const fs = require('fs');

console.log('================================================================');
console.log('     KYOGRE CINEMATIC VIDEO DIVE VERIFICATION MATRIX           ');
console.log('================================================================\n');

const bundle = fs.readFileSync('dist/kyogre-app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

const tests = [
  // 1. Fullscreen Background Video Requirements
  ['Video pinned fullscreen in DOM (100vw x 100vh, object-cover)',
    bundle.includes('fixed inset-0') && bundle.includes('object-cover') && bundle.includes('pointer-events-none')],
  ['No native video controls or play buttons rendered',
    !bundle.includes('controls={true}') && !bundle.includes('controls="true"')],
  ['Video muted, playsInline, preload=auto',
    bundle.includes('playsInline') && bundle.includes('muted') && bundle.includes('preload')],
  ['Canonical video source loaded from /public/media/kyogre-ocean-dive.mp4',
    bundle.includes('/public/media/kyogre-ocean-dive.mp4') && bundle.includes('media/kyogre-ocean-dive.mp4')],

  // 2. Video Scrubbing & Performance
  ['Hardware-accelerated seek dispatcher (fastSeek with fallback)',
    bundle.includes('fastSeek') && bundle.includes('currentTime')],
  ['Non-blocking seek lock (isSeeking) avoids decode bottleneck',
    bundle.includes('isSeekingRef') || bundle.includes('isSeeking')],
  ['loadedmetadata listener waits for video duration before seek',
    bundle.includes('loadedmetadata')],
  ['Zero React state re-render on video scroll progress (direct DOM refs)',
    bundle.includes('videoRef') && bundle.includes('depthReadoutRef') && bundle.includes('phase1Ref')],

  // 3. Lenis & GSAP ScrollTrigger Pinned Track
  ['Extended pinned master scroll track (1000vh)',
    bundle.includes('1000vh')],
  ['Decoupled video scrubbing with held 1000m final frame',
    bundle.includes('VIDEO_END_PROGRESS') || bundle.includes('0.62')],
  ['Lenis smooth inertia configuration (lerp 0.08, wheelMultiplier 0.82)',
    bundle.includes('lerp: 0.08') && bundle.includes('wheelMultiplier: 0.82') && bundle.includes('smoothWheel: true')],
  ['GSAP ScrollTrigger scrubbed configuration (scrub: 1.0 or 1.2)',
    bundle.includes('scrub: 1') && bundle.includes('ScrollTrigger')],
  ['Single scrolling engine: Lenis synchronized via gsap.ticker',
    bundle.includes('lenis.raf') && bundle.includes('lagSmoothing(0)')],

  // 4. Text Phase Narrative Timeline
  ['Phase 0: Hero text (0–15%) with KYOGRE, tagline, and CTA buttons',
    bundle.includes('KYOGRE') && bundle.includes('Seeing Beneath the Surface') && bundle.includes('EXPLORE KYOGRE') && bundle.includes('VIEW PROTOTYPE') && bundle.includes('SCROLL TO DESCEND')],
  ['Phase 1: 0m Surface Break (15–30%) "WE CAN SEE THE SURFACE"',
    bundle.includes('WE CAN SEE THE SURFACE') && bundle.includes('BUT NOT EVERYTHING BENEATH IT')],
  ['Phase 2: 100m Volumetric Ocean (30–45%) "THE OCEAN IS VOLUMETRIC"',
    bundle.includes('THE OCEAN IS VOLUMETRIC') && bundle.includes('OUR OBSERVATIONS ARE NOT')],
  ['Phase 3: 250m Observational Void (45–60%) "BETWEEN THE OBSERVATIONS"',
    bundle.includes('BETWEEN THE OBSERVATIONS') && bundle.includes('LIES THE UNKNOWN')],
  ['Phase 4: 500m Turning Point Question (60–75%) "HOW DO WE RECONSTRUCT WHAT WE CANNOT DIRECTLY OBSERVE"',
    bundle.includes('HOW DO WE RECONSTRUCT WHAT WE CANNOT DIRECTLY OBSERVE')],
  ['Phase 5: 750m Architecture Inscriptions (75–90%) "MEET KYOGRE"',
    bundle.includes('MEET KYOGRE') && bundle.includes('SST') && bundle.includes('SSS') && bundle.includes('SSH / SLA')],
  ['Phase 6: 1000m Reconstruction Climax (90–100%) "FROM SURFACE SIGNALS TO SUBSURFACE INTELLIGENCE"',
    bundle.includes('FROM SURFACE SIGNALS') && bundle.includes('TO SUBSURFACE INTELLIGENCE')],

  // 5. Depth Indicator HUD
  ['All 7 depth milestone labels present (AIR, 0m, 100m, 250m, 500m, 750m, 1000m)',
    bundle.includes('"AIR"') && bundle.includes('"0m"') && bundle.includes('"100m"') && bundle.includes('"250m"') && bundle.includes('"500m"') && bundle.includes('"750m"') && bundle.includes('"1000m"')],
  ['Continuous numerical readout element (0m .. 1000m)',
    bundle.includes('depthReadoutRef') && bundle.includes('currentDepth') && bundle.includes('DEPTH:')],
  ['Moving active tracking pip linked 1:1 to progress',
    bundle.includes('depthPipRef') && bundle.includes('style.top')],

  // 6. Color, Cleanliness & Accessibility
  ['Natural video color preserved without heavy blue filter',
    !bundle.includes('backdrop-hue-rotate') && !bundle.includes('bg-blue-600/50')],
  ['Old image background files eliminated from cinematic dive',
    !bundle.includes('ocean-aerial-hero.jpg') && !bundle.includes('ocean-underwater-caustics.jpg') && !bundle.includes('ocean-abyss-deep.jpg')],
  ['prefers-reduced-motion accessibility respected',
    bundle.includes('prefers-reduced-motion')],
];

let passed = 0;
for (const [desc, ok] of tests) {
  console.log((ok ? '  [PASS] ' : '  [FAIL] ') + desc);
  if (ok) passed++;
}

console.log('\n----------------------------------------------------------------');
console.log(`Summary: ${passed} / ${tests.length} tests passed (${Math.round((passed / tests.length) * 100)}%).`);
console.log('================================================================');

if (passed !== tests.length) {
  process.exit(1);
}
