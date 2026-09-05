// materials.js - Custom shaders for OceanEmbed 3D

import * as THREE from 'three';

/* ── Water Surface Shader ─────────────────────────────────────
   Procedural wave displacement and Fresnel reflections.
*/
export const waterVertexShader = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  
  // Simple 2D noise
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
               mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
  }

  void main() {
    vUv = uv;
    
    // Base position
    vec3 pos = position;
    
    // Multi-frequency wave displacement
    float w1 = sin(pos.x * 0.05 + uTime * 0.8) * cos(pos.y * 0.04 + uTime * 0.6) * 2.0;
    float w2 = noise(pos.xy * 0.1 + uTime * 0.5) * 1.5;
    float w3 = noise(pos.xy * 0.3 - uTime * 0.8) * 0.5;
    
    pos.z += w1 + w2 + w3;
    
    // Compute approximate normal based on displacement derivatives
    // For performance, we'll do a simple cross product of nearby points
    float eps = 0.5;
    vec3 px = position + vec3(eps, 0.0, 0.0);
    float pxw = sin(px.x * 0.05 + uTime * 0.8) * cos(px.y * 0.04 + uTime * 0.6) * 2.0 + noise(px.xy * 0.1 + uTime * 0.5) * 1.5 + noise(px.xy * 0.3 - uTime * 0.8) * 0.5;
    px.z += pxw;
    
    vec3 py = position + vec3(0.0, eps, 0.0);
    float pyw = sin(py.x * 0.05 + uTime * 0.8) * cos(py.y * 0.04 + uTime * 0.6) * 2.0 + noise(py.xy * 0.1 + uTime * 0.5) * 1.5 + noise(py.xy * 0.3 - uTime * 0.8) * 0.5;
    py.z += pyw;
    
    vec3 p0 = pos;
    vec3 tx = px - p0;
    vec3 ty = py - p0;
    vec3 n = normalize(cross(tx, ty));
    
    // In Three.js plane, Z is up (if rotated). We're rotating the plane so Y is up.
    // The geometry is XY, so normal is roughly Z initially.
    vNormal = normalMatrix * n;
    
    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPos.xyz;
    
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const waterFragmentShader = `
  uniform vec3 uBaseColor;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec3 normal = normalize(vNormal);
    
    // Fresnel effect
    float fresnel = dot(viewDir, normal);
    fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
    fresnel = pow(fresnel, 3.0);
    
    // Specular highlight from 'sun'
    vec3 halfVector = normalize(uSunDir + viewDir);
    float NdotH = max(0.0, dot(normal, halfVector));
    float specular = pow(NdotH, 150.0) * 1.5; // sharp, bright sun reflection
    
    // Mix base color with sky reflection (approximated by fresnel) and add specular
    vec3 skyColor = vec3(0.7, 0.85, 0.95);
    vec3 finalColor = mix(uBaseColor, skyColor, fresnel * 0.6);
    finalColor += uSunColor * specular;
    
    gl_FragColor = vec4(finalColor, 0.95); // Slight transparency
  }
`;

/* ── Particle System Shader ───────────────────────────────────
   Handles all layers (surface snow, mid water, deep bioluminescence)
   Behavior shifts based on global depth T and particle attributes.
*/
export const particleVertexShader = `
  uniform float uTime;
  uniform float uScrollT; // Global depth 0..1
  
  attribute float aSize;
  attribute float aLayer; // 0=surface, 1=mid, 2=deep
  attribute float aPhase;
  attribute vec3 aVelocity;
  
  varying float vAlpha;
  varying vec3 vColor;
  
  // Layer definitions mirroring ocean.js logic
  // Surface: white/blue, fast
  // Mid: dim blue, slow
  // Deep (Bio): Cyan/Purple, very slow, pulsing
  
  void main() {
    vec3 pos = position;
    
    // Scroll depth dictates which particles are visible and how they act
    float depthMult = clamp(1.0 - uScrollT * 1.5, 0.1, 1.0); // slower at depth
    
    // Animate position
    pos += aVelocity * uTime * depthMult;
    
    // Simple wrapping (world bounds roughly -100 to 100 in X/Z, Y is deep)
    pos.x = mod(pos.x + 100.0, 200.0) - 100.0;
    pos.z = mod(pos.z + 100.0, 200.0) - 100.0;
    
    // Y wrapping needs to follow camera somewhat, or wrap within a fixed large volume
    // For a descending camera, we keep particles relative to a scrolling volume
    float camY = -uScrollT * 1000.0;
    float localY = pos.y - camY;
    pos.y = camY + (mod(localY + 150.0, 300.0) - 150.0);
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // Size attenuation
    gl_PointSize = aSize * (200.0 / -mvPosition.z);
    
    // Determine color and alpha based on layer and scroll depth
    vAlpha = 1.0;
    vColor = vec3(1.0);
    
    if (aLayer < 0.5) { // Layer 0: Surface Marine Snow
      // Fades out by t=0.3
      vAlpha = smoothstep(0.3, 0.1, uScrollT) * 0.6;
      vColor = vec3(0.8, 0.9, 1.0);
    } 
    else if (aLayer < 1.5) { // Layer 1: Mid-water Snow
      // Peaks around t=0.2, fades out by t=0.5
      vAlpha = smoothstep(0.5, 0.3, uScrollT) * smoothstep(0.0, 0.1, uScrollT) * 0.5;
      vColor = vec3(0.5, 0.7, 0.9);
    } 
    else { // Layer 2: Deep Bioluminescence
      // Fades in after t=0.4
      float baseAlpha = smoothstep(0.4, 0.6, uScrollT) * 0.9;
      // Pulse effect
      float pulse = 0.5 + 0.5 * sin(uTime * 1.5 + aPhase);
      vAlpha = baseAlpha * pulse;
      
      // Color variation based on phase (cyan to purple)
      float huePhase = sin(aPhase * 10.0) * 0.5 + 0.5;
      vColor = mix(vec3(0.1, 0.8, 0.9), vec3(0.6, 0.2, 0.9), huePhase);
    }
  }
`;

export const particleFragmentShader = `
  varying float vAlpha;
  varying vec3 vColor;
  
  void main() {
    // Soft circular particle
    vec2 pt = gl_PointCoord - vec2(0.5);
    float r = dot(pt, pt);
    if (r > 0.25) discard;
    
    // Smooth edges
    float alpha = vAlpha * smoothstep(0.25, 0.1, r);
    
    gl_FragColor = vec4(vColor, alpha);
  }
`;
