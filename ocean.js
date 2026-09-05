/* ============================================================
   OceanEmbed — ocean.js  v3 (3D Engine Host)
   Cinematic scroll-driven ocean depth experience for index.html

   Architecture:
   ─ Scroll engine uses #ocean-experience getBoundingClientRect()
     so that any content added outside that container never shifts
     the depth mapping.
   ─ Drives HTML overlays (hero fade, background gradient, depth meter).
   ─ Dispatches 'oceanScroll' events for three-scene.js to render 3D.
   ============================================================ */

'use strict';

/* ── Reduced-motion guard ─────────────────────────────────── */
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  // CSS handles the static fallback; nothing needed from JS.
  console.log('ocean.js: reduced-motion active — 3D scene skipped.');
}

/* ═══════════════════════════════════════════════════════════
   DEPTH ZONE DEFINITIONS (Used for CSS background fallback)
   ═══════════════════════════════════════════════════════════ */
// New Cinematic Timeline:
// 0.00 = above surface
// 0.12 = diver entering water
// 0.25 = fully submerged
// 0.40 = surface swimming
// 0.50 = descent begins
// 0.70 = twilight zone
// 1.00 = 1000 m

const ZONES = [
  {
    name: 'Above',
    label: 'Above Surface',
    tStart: 0.00, tEnd: 0.12,
    bgTop:    [135, 206, 235], // Sky blue
    bgBottom: [ 24, 115, 168], // Surface water
  },
  {
    name: 'Surface',
    label: 'Surface · 0 m',
    tStart: 0.12, tEnd: 0.40,
    bgTop:    [ 24, 115, 168],
    bgBottom: [  8,  65, 118],
  },
  {
    name: 'Epipelagic',
    label: 'Epipelagic · 200 m',
    tStart: 0.40, tEnd: 0.60,
    bgTop:    [  8,  65, 118],
    bgBottom: [  5,  40,  85],
  },
  {
    name: 'Twilight Zone',
    label: 'Mesopelagic · 500 m',
    tStart: 0.60, tEnd: 0.80,
    bgTop:    [  5,  40,  85],
    bgBottom: [  2,  18,  45],
  },
  {
    name: 'Midnight Zone',
    label: 'Bathypelagic · 1000 m',
    tStart: 0.80, tEnd: 1.00,
    bgTop:    [  2,  18,  45],
    bgBottom: [  0,   4,  14],
  },
];

/* ═══════════════════════════════════════════════════════════
   UTILITY
   ═══════════════════════════════════════════════════════════ */

const lerp       = (a, b, t) => a + (b - a) * t;
const clamp      = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const smoothstep = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const mapRange   = (v, a, b, c, d) => lerp(c, d, clamp((v - a) / (b - a), 0, 1));

function getDepthAt(t) {
  if (t < 0.12) return 0; // Above water
  if (t < 0.50) {
    // 0.12 to 0.50 is shallow water (0 to 10m)
    return mapRange(t, 0.12, 0.50, 0, 10);
  }
  // 0.50 to 1.00 descends from 10m to 1000m
  return mapRange(t, 0.50, 1.00, 10, 1000);
}

function lerpRGB(a, b, t) {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

const rgb = ([r, g, b]) => `rgb(${r},${g},${b})`;

function getZoneInterp(t) {
  let zi = 0;
  for (let i = 0; i < ZONES.length - 1; i++) {
    if (t >= ZONES[i].tStart) zi = i;
  }
  const z0 = ZONES[zi];
  const z1 = ZONES[Math.min(zi + 1, ZONES.length - 1)];
  const localT = smoothstep(mapRange(t, z0.tStart, z0.tEnd, 0, 1));
  return { z0, z1, localT, zi };
}

/* ═══════════════════════════════════════════════════════════
   DOM SETUP
   ═══════════════════════════════════════════════════════════ */

const oceanExperience = document.getElementById('ocean-experience');
const oceanBg         = document.getElementById('ocean-bg');
const depthValueEl    = document.getElementById('depth-value');
const depthTickEl     = document.querySelector('.depth-meter__tick');
const zoneLabelEl     = document.getElementById('zone-label');
const heroSection     = document.querySelector('.hero');

/* ═══════════════════════════════════════════════════════════
   SCROLL ENGINE
   ═══════════════════════════════════════════════════════════ */

let scrollT      = 0;   // smoothed, current depth t [0,1]
let rawScrollT   = 0;   // unsmoothed, direct from rect

function getRawScrollT() {
  if (!oceanExperience) return 0;
  const rect = oceanExperience.getBoundingClientRect();
  const scrollable = rect.height - window.innerHeight;
  if (scrollable <= 0) return 0;
  return clamp(-rect.top / scrollable, 0, 1);
}

/* ═══════════════════════════════════════════════════════════
   HTML OVERLAYS
   ═══════════════════════════════════════════════════════════ */

function updateHeroFade(t) {
  if (!heroSection) return;
  const opacity = clamp(1 - smoothstep(mapRange(t, 0.08, 0.18, 0, 1)), 0, 1);
  heroSection.style.opacity       = opacity;
  heroSection.style.pointerEvents = opacity < 0.05 ? 'none' : '';
}

function updateBackground(t) {
  if (!oceanBg) return;
  const { z0, z1, localT } = getZoneInterp(t);
  const top    = rgb(lerpRGB(z0.bgTop,    z1.bgTop,    localT));
  const bottom = rgb(lerpRGB(z0.bgBottom, z1.bgBottom, localT));
  oceanBg.style.background = `linear-gradient(180deg, ${top} 0%, ${bottom} 100%)`;
}

let lastDepth = -1;
let lastZoneIdx = -1;
let zoneLabelTimer = null;

function updateDepthMeter(t) {
  if (!depthValueEl || !depthTickEl) return;
  const depth = Math.round(getDepthAt(t));
  if (depth === lastDepth) return;
  lastDepth = depth;
  depthValueEl.textContent = depth;
  // Map tick pos visually down the meter 
  // meter is roughly 0 to 100% mapped to depth 0-1000m
  depthTickEl.style.setProperty('--tick-pos', (depth / 1000 * 100) + '%');
}

function updateZoneLabel(zi) {
  if (!zoneLabelEl) return;
  if (zi === lastZoneIdx) return;
  lastZoneIdx = zi;
  zoneLabelEl.textContent = ZONES[zi].label;
  zoneLabelEl.style.opacity = '1';
  clearTimeout(zoneLabelTimer);
  zoneLabelTimer = setTimeout(() => { zoneLabelEl.style.opacity = '0'; }, 2400);
}

/* ═══════════════════════════════════════════════════════════
   MAIN RAF LOOP
   ═══════════════════════════════════════════════════════════ */

function frame(time) {
  requestAnimationFrame(frame);

  rawScrollT = getRawScrollT();
  scrollT    = lerp(scrollT, rawScrollT, 0.08);

  const { zi } = getZoneInterp(scrollT);

  updateBackground(scrollT);
  updateHeroFade(scrollT);
  updateDepthMeter(scrollT);
  updateZoneLabel(zi);

  // Dispatch custom event for three-scene.js
  window.dispatchEvent(new CustomEvent('oceanScroll', { 
    detail: { t: scrollT, rawT: rawScrollT } 
  }));
}

/* ═══════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════ */

function init() {
  if (oceanExperience) {
    oceanExperience.style.minHeight = '500vh';
  }
  
  // Only start the loop if reduced motion is not active
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    requestAnimationFrame(frame);
  } else {
    // If reduced motion is on, just set state once at top
    updateBackground(0);
    updateDepthMeter(0);
    updateZoneLabel(0);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
