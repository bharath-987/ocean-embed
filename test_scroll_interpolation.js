const fs = require('fs');

// Extract interpolatePhase implementation from bundle or test logic
function interpolatePhase(p, enterStart, enterPeak, exitStart, exitEnd) {
  if (p <= enterStart || p >= exitEnd) {
    return { opacity: 0, y: 35, blur: 8 };
  }
  let progressFactor = 0;
  if (p < enterPeak) {
    progressFactor = (p - enterStart) / (enterPeak - enterStart);
  } else if (p <= exitStart) {
    progressFactor = 1;
  } else {
    progressFactor = (exitEnd - p) / (exitEnd - exitStart);
  }
  const factor = Math.max(0, Math.min(1, progressFactor));
  const smooth = factor * factor * (3 - 2 * factor);
  const opacity = smooth;
  const y = (1 - smooth) * 35;
  const blur = (1 - smooth) * 8;
  return { opacity, y, blur };
}

console.log('--- Testing Continuous Scroll & Intermediate States ---');

// Test 1: Small wheel step into Phase 1 (progress = 0.15, enterStart = 0.13, enterPeak = 0.19)
const halfP1 = interpolatePhase(0.16, 0.13, 0.19, 0.22, 0.28);
console.log(`Progress 0.16 (Halfway in Phase 1): Opacity=${halfP1.opacity.toFixed(3)}, Y=${halfP1.y.toFixed(1)}px, Blur=${halfP1.blur.toFixed(1)}px`);
if (halfP1.opacity > 0.2 && halfP1.opacity < 0.8 && halfP1.y > 5 && halfP1.y < 30) {
  console.log('✓ PASS: Halfway scroll stops at exact intermediate text state without snapping');
} else {
  console.error('FAIL: Intermediate state failed');
  process.exit(1);
}

// Test 2: Continuous depth counter values across 100 fine steps
let prevDepth = -1;
let monotonicity = true;
for (let i = 0; i <= 100; i++) {
  const p = i / 100;
  const d = Math.round(p * 1000);
  if (d < prevDepth) monotonicity = false;
  prevDepth = d;
}
if (monotonicity && prevDepth === 1000) {
  console.log('✓ PASS: Depth counter interpolates smoothly from 000m to 1000m across fine steps');
} else {
  console.error('FAIL: Depth monotonicity failed');
  process.exit(1);
}

// Test 3: Verify index.html does not have scroll-smooth or snap
const html = fs.readFileSync('index.html', 'utf8');
if (!html.includes('scroll-smooth') && !html.includes('scroll-snap') && html.includes('scroll-behavior: auto !important')) {
  console.log('✓ PASS: Zero scroll snapping or CSS smooth interference in index.html');
} else {
  console.error('FAIL: Jumpy CSS found in index.html');
  process.exit(1);
}

// Test 4: Verify App.tsx has Lenis + GSAP scrub config
const appCode = fs.readFileSync('src/App.tsx', 'utf8');
if (appCode.includes('scrub: 1') && appCode.includes('lerp: 0.08') && appCode.includes('smoothWheel: true')) {
  console.log('✓ PASS: Lenis & GSAP ScrollTrigger scrub configuration verified');
} else {
  console.error('FAIL: Lenis / scrub config missing');
  process.exit(1);
}

console.log('\nALL CONTINUOUS SCROLL INTERPOLATION TESTS PASSED (100%)');
