// three-scene.js - Core 3D engine for OceanEmbed

import * as THREE from 'three';
import { 
  waterVertexShader, 
  waterFragmentShader, 
  particleVertexShader, 
  particleFragmentShader 
} from './materials.js';

// --- Configuration ---
const MAX_DEPTH = 1000; // Camera Y ranges from 0 to -1000

// Depth zones for Volumetric Fog Color Interpolation
const FOG_ZONES = [
  { t: 0.00, color: new THREE.Color(0x1873A8), density: 0.015 }, // Surface: bright blue
  { t: 0.15, color: new THREE.Color(0x084176), density: 0.025 }, // Epipelagic
  { t: 0.38, color: new THREE.Color(0x052855), density: 0.040 }, // Mesopelagic
  { t: 0.65, color: new THREE.Color(0x02122D), density: 0.060 }, // Bathypelagic
  { t: 1.00, color: new THREE.Color(0x00040E), density: 0.080 }, // Midnight
];

function getFogState(t) {
  for (let i = 0; i < FOG_ZONES.length - 1; i++) {
    if (t >= FOG_ZONES[i].t && t <= FOG_ZONES[i+1].t) {
      const z0 = FOG_ZONES[i];
      const z1 = FOG_ZONES[i+1];
      const localT = (t - z0.t) / (z1.t - z0.t);
      // smoothstep for natural transition
      const smoothT = localT * localT * (3 - 2 * localT);
      return {
        color: z0.color.clone().lerp(z1.color, smoothT),
        density: z0.density + (z1.density - z0.density) * smoothT
      };
    }
  }
  return FOG_ZONES[FOG_ZONES.length-1];
}

// --- Setup ---
const canvas = document.getElementById('webgl-canvas');
if (!canvas) {
  console.warn('WebGL canvas not found.');
}

const renderer = new THREE.WebGLRenderer({ 
  canvas, 
  antialias: false, // Post-processing or resolution scaling is better for performance here
  alpha: true,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(FOG_ZONES[0].color, FOG_ZONES[0].density);

// Camera
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, -2, 20); // Start just below surface, looking slightly forward/down
camera.lookAt(0, -10, 0);

const clock = new THREE.Clock();
let currentScrollT = 0;

// --- Lighting ---
// Ambient light
const ambientLight = new THREE.AmbientLight(0x406080, 0.8);
scene.add(ambientLight);

// Directional light (Sun)
const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
sunLight.position.set(100, 200, -50);
scene.add(sunLight);

// --- Objects ---

// 1. Water Surface
const surfaceGeometry = new THREE.PlaneGeometry(1000, 1000, 128, 128);
surfaceGeometry.rotateX(-Math.PI / 2); // Lay flat on XZ plane

const surfaceMaterial = new THREE.ShaderMaterial({
  vertexShader: waterVertexShader,
  fragmentShader: waterFragmentShader,
  uniforms: {
    uTime: { value: 0 },
    uBaseColor: { value: new THREE.Color(0x0a4b7a) },
    uSunColor: { value: new THREE.Color(0xfff5e6) },
    uSunDir: { value: sunLight.position.clone().normalize() }
  },
  transparent: true,
  side: THREE.DoubleSide
});

const waterSurface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
waterSurface.position.y = 0;
scene.add(waterSurface);

// 2. Particles (Marine Snow & Bioluminescence)
const particleCount = 3000;
const pGeometry = new THREE.BufferGeometry();
const pPositions = new Float32Array(particleCount * 3);
const pVelocities = new Float32Array(particleCount * 3);
const pSizes = new Float32Array(particleCount);
const pLayers = new Float32Array(particleCount);
const pPhases = new Float32Array(particleCount);

for (let i = 0; i < particleCount; i++) {
  // Distribute particles in a volume: X/Z: -100 to 100, Y: 0 to -1000
  pPositions[i*3] = (Math.random() - 0.5) * 200;
  pPositions[i*3+1] = -Math.random() * 1000;
  pPositions[i*3+2] = (Math.random() - 0.5) * 200;
  
  // Assign layers based on random distribution to ensure all types exist everywhere (shader handles visibility)
  // Layer 0: Surface (33%), Layer 1: Mid (33%), Layer 2: Deep/Bio (33%)
  const layer = Math.floor(Math.random() * 3);
  pLayers[i] = layer;
  
  pSizes[i] = Math.random() * 2.0 + 1.0;
  pPhases[i] = Math.random() * Math.PI * 2;
  
  // Velocities based on layer
  if (layer === 0) { // Surface: fast horizontal drift
    pVelocities[i*3] = (Math.random() - 0.5) * 4.0;
    pVelocities[i*3+1] = (Math.random() - 0.8) * 1.0;
    pVelocities[i*3+2] = (Math.random() - 0.5) * 4.0;
  } else if (layer === 1) { // Mid: slow descent
    pVelocities[i*3] = (Math.random() - 0.5) * 1.0;
    pVelocities[i*3+1] = (Math.random() - 0.9) * 2.0; // mostly sinking
    pVelocities[i*3+2] = (Math.random() - 0.5) * 1.0;
  } else { // Deep bio: extremely slow random walk
    pVelocities[i*3] = (Math.random() - 0.5) * 0.5;
    pVelocities[i*3+1] = (Math.random() - 0.5) * 0.5;
    pVelocities[i*3+2] = (Math.random() - 0.5) * 0.5;
  }
}

pGeometry.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
pGeometry.setAttribute('aVelocity', new THREE.BufferAttribute(pVelocities, 3));
pGeometry.setAttribute('aSize', new THREE.BufferAttribute(pSizes, 1));
pGeometry.setAttribute('aLayer', new THREE.BufferAttribute(pLayers, 1));
pGeometry.setAttribute('aPhase', new THREE.BufferAttribute(pPhases, 1));

const particleMaterial = new THREE.ShaderMaterial({
  vertexShader: particleVertexShader,
  fragmentShader: particleFragmentShader,
  uniforms: {
    uTime: { value: 0 },
    uScrollT: { value: 0 }
  },
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});

const particleSystem = new THREE.Points(pGeometry, particleMaterial);
scene.add(particleSystem);


// --- Event Listeners ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Hook into the scroll event dispatched by ocean.js
window.addEventListener('oceanScroll', (e) => {
  currentScrollT = e.detail.t;
});


// --- Render Loop ---
function animate() {
  requestAnimationFrame(animate);
  
  const time = clock.getElapsedTime();
  
  // 1. Update Camera Position based on scroll
  // Y goes from -2 (surface) to -1000 (deep)
  const targetY = -2 - (currentScrollT * MAX_DEPTH);
  
  // Add slight bobbing motion to camera
  const bobbing = Math.sin(time * 0.5) * 1.5 * Math.max(0.1, 1.0 - currentScrollT); // Less bobbing at depth
  camera.position.y = targetY + bobbing;
  
  // 2. Update Environment / Fog based on depth
  const fogState = getFogState(currentScrollT);
  scene.fog.color.copy(fogState.color);
  scene.fog.density = fogState.density;
  
  // Attenuate lights
  const lightAtten = Math.max(0, 1.0 - currentScrollT * 3.0); // sun gone by t=0.33
  sunLight.intensity = 2.0 * lightAtten;
  ambientLight.intensity = 0.8 * Math.max(0.2, 1.0 - currentScrollT * 1.5);
  
  // 3. Update Uniforms
  surfaceMaterial.uniforms.uTime.value = time;
  particleMaterial.uniforms.uTime.value = time;
  particleMaterial.uniforms.uScrollT.value = currentScrollT;
  
  // 4. Particle wrapping (Y axis) - handled partially in shader, but we keep the system near the camera
  // The shader handles relative Y wrapping, so we just move the container to track the camera coarsely
  particleSystem.position.y = camera.position.y;
  
  // Render
  renderer.render(scene, camera);
}

// Start
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  animate();
}
