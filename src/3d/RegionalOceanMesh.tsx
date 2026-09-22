import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createRegionalLandMaskTexture } from './coastlineTexture';
import { REGIONAL_ARGO_FLOATS } from './RegionalArgoMarkers';

const MESH_WIDTH = 6.4;
const MESH_HEIGHT = 2.67;

interface RegionalOceanMeshProps {
  sparseFactor?: number;   // 0.0 = Screen 1 (idle, full continuous), 1.0 = Screen 2 (sparse data gaps)
  transition?: number;     // 0.0 to 1.0 (Screen 3 reconstruction fill-in)
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform sampler2D uLandMask;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vIsOcean;

  void main() {
    vUv = uv;

    // Sample land mask: > 0.45 is ocean, < 0.45 is continental land
    float oceanSample = texture2D(uLandMask, uv).r;
    vIsOcean = oceanSample;

    vec3 pos = position;

    // 1. Gentle parabolic convex curvature: arches downwards at domain edges
    float zCurve = -( (pos.x * pos.x) / 18.0 + (pos.y * pos.y) / 10.0 );
    pos.z += zCurve;

    // 2. Gentle animated wave displacement on ocean only
    if (oceanSample > 0.45) {
      float wave = sin(uv.x * 16.0 + uTime * 0.9) * cos(uv.y * 14.0 + uTime * 0.7) * 0.020;
      wave += sin(uv.x * 30.0 - uTime * 1.3 + uv.y * 20.0) * 0.008;
      pos.z += wave;
    } else {
      // Slightly elevate land mass (+0.012) to provide subtle bathymetric shelf relief
      pos.z += 0.012;
    }

    vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
    vNormal = normalize(normalMatrix * normal);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform sampler2D uLandMask;
  uniform float uSparseFactor;  // 0.0 = Screen 1 (idle, full continuous), 1.0 = Screen 2 (sparse gaps)
  uniform float uTransition;    // 0.0 to 1.0 for Screen 3 reconstruction fill-in
  uniform vec2 uFloatCoords[18];

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vIsOcean;

  // Scientific Colormap: Navy Abyss -> Deep Blue -> Marine Teal -> Epipelagic Cyan -> Warm Thermal Highlight
  vec3 getTemperatureColormap(float t) {
    vec3 c0 = vec3(0.012, 0.050, 0.120); // Deep navy abyss / cold upwelling (#030d1f)
    vec3 c1 = vec3(0.025, 0.130, 0.230); // Marine blue (#06213b)
    vec3 c2 = vec3(0.050, 0.300, 0.360); // Marine teal (#0d4d5c)
    vec3 c3 = vec3(0.110, 0.450, 0.490); // Epipelagic cyan (#1c737d)
    vec3 c4 = vec3(0.820, 0.440, 0.200); // Warm thermal anomaly highlight (#d17033)

    if (t < 0.28) {
      return mix(c0, c1, t / 0.28);
    } else if (t < 0.52) {
      return mix(c1, c2, (t - 0.28) / 0.24);
    } else if (t < 0.76) {
      return mix(c2, c3, (t - 0.52) / 0.24);
    } else {
      return mix(c3, c4, (t - 0.76) / 0.24);
    }
  }

  void main() {
    vec4 mask = texture2D(uLandMask, vUv);
    float isOcean = mask.r;
    float coastG = mask.g;

    // --- 1. Realistic Procedural Temperature Field ---
    // SE Arabian Sea warm pool (lon ~68°E, lat ~10°N -> u~0.38, v~0.20)
    float asWarmPool = exp(-pow((vUv.x - 0.38) / 0.14, 2.0) - pow((vUv.y - 0.20) / 0.16, 2.0)) * 0.30;
    // Bay of Bengal warm pool (lon ~88°E, lat ~12°N -> u~0.72, v~0.28)
    float bobWarmPool = exp(-pow((vUv.x - 0.72) / 0.18, 2.0) - pow((vUv.y - 0.28) / 0.22, 2.0)) * 0.36;
    // Oman / Somali coastal upwelling cooling (u~0.16, v~0.48)
    float omanCool = exp(-pow((vUv.x - 0.16) / 0.11, 2.0) - pow((vUv.y - 0.48) / 0.20, 2.0)) * 0.26;
    // Meso-scale eddies drifting through the basin
    float eddies = sin(vUv.x * 24.0 + sin(vUv.y * 16.0) * 1.8 + uTime * 0.08) * cos(vUv.y * 20.0 - uTime * 0.06) * 0.065;
    eddies += sin(vUv.x * 42.0 - vUv.y * 28.0 + uTime * 0.12) * 0.028;

    float tNorm = clamp(0.50 + asWarmPool + bobWarmPool - omanCool + eddies, 0.0, 1.0);
    vec3 fullTempColor = getTemperatureColormap(tNorm);

    // Subtle surface lighting (gentle diffuse wrap, non-glowing)
    vec3 lightDir = normalize(vec3(-0.4, 0.6, 0.7));
    float diff = max(dot(vNormal, lightDir), 0.0) * 0.22 + 0.78;
    fullTempColor *= diff;

    // --- 2. Observation Sparsity & ARGO Float Data Pools (Screen 1 vs Screen 2) ---
    float floatInfluence = 0.0;
    for (int i = 0; i < 18; i++) {
      vec2 fCoord = uFloatCoords[i];
      // Aspect ratio correction: domain is 60 deg lon x 25 deg lat (2.4 : 1)
      vec2 diffVec = (vUv - fCoord) * vec2(2.4, 1.0);
      float dist = length(diffVec);

      // Localized observation pool around float (radius ~ 0.075 in UV space)
      float pool = 1.0 - smoothstep(0.018, 0.072, dist);

      // Concentric radar observation ping ripple
      float phase = fract(uTime * 0.65 + float(i) * 0.35);
      float ringRadius = 0.020 + phase * 0.055;
      float ring = (1.0 - smoothstep(0.002, 0.015, abs(dist - ringRadius))) * (1.0 - phase) * 0.40;

      floatInfluence = max(floatInfluence, pool + ring);
    }

    // Desaturated / Faded observation gap background color
    // Muted dark navy-slate, desaturated, displaying the unobserved ocean void
    float gray = dot(fullTempColor, vec3(0.299, 0.587, 0.114));
    vec3 desatOcean = mix(vec3(0.014, 0.038, 0.072), vec3(gray * 0.30), 0.22);

    // Visibility calculation:
    // Screen 1 (uSparseFactor = 0.0): visibility = 1.0 (continuous full field)
    // Screen 2 (uSparseFactor = 1.0, uTransition = 0.0): visibility = floatInfluence (only float spots, gaps desaturated)
    // Screen 3 (uSparseFactor = 1.0, uTransition: 0 -> 1): gaps fill in with reconstruction
    float effectiveRecon = max(floatInfluence, uTransition);
    float colorBlend = mix(1.0, effectiveRecon, uSparseFactor);

    vec3 finalOcean = mix(desatOcean, fullTempColor, colorBlend);

    // Coordinate graticules (enhanced in observation gaps to emphasize unobserved grid points)
    float lonDeg = 45.0 + vUv.x * 60.0;
    float latDeg = 5.0 + vUv.y * 25.0;
    float dLon = abs(fract((lonDeg + 2.5) / 5.0) - 0.5) * 5.0;
    float dLat = abs(fract((latDeg + 2.5) / 5.0) - 0.5) * 5.0;
    float gridAlpha = mix(0.055, 0.13, uSparseFactor);
    float grid = (smoothstep(0.12, 0.0, dLon) + smoothstep(0.12, 0.0, dLat)) * gridAlpha;
    finalOcean += vec3(grid * 0.5, grid * 0.85, grid * 1.2);

    // --- 3. Continental Landmasses & Coastline ---
    // Muted dark slate for continental land, completely non-glowing
    vec3 landColor = vec3(0.028, 0.042, 0.060);
    // Subtle topography texture on land
    float topo = sin(vUv.x * 80.0) * cos(vUv.y * 60.0) * 0.0035;
    landColor += vec3(topo);

    // Crisp coastline boundary tracing from green channel
    vec3 coastLineColor = vec3(0.10, 0.24, 0.36);
    landColor = mix(landColor, coastLineColor, clamp(coastG * 1.5, 0.0, 1.0));

    // Blend Ocean and Land
    vec3 finalColor = mix(landColor, finalOcean, smoothstep(0.46, 0.54, isOcean));

    // Subtle edge fade at outer boundary of regional domain
    float edgeFade = smoothstep(0.0, 0.015, vUv.x) * smoothstep(1.0, 0.985, vUv.x) *
                     smoothstep(0.0, 0.015, vUv.y) * smoothstep(1.0, 0.985, vUv.y);

    gl_FragColor = vec4(finalColor, edgeFade * 0.98);
  }
`;

export const RegionalOceanMesh: React.FC<RegionalOceanMeshProps> = ({
  sparseFactor = 0.0,
  transition = 0.0,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const shaderMatRef = useRef<THREE.ShaderMaterial>(null);

  // Generate land mask texture once
  const landMaskTexture = useMemo(() => {
    return createRegionalLandMaskTexture();
  }, []);

  // Map 18 float UV coordinates
  const floatCoords = useMemo(() => {
    return REGIONAL_ARGO_FLOATS.map((f) => new THREE.Vector2(f.u, f.v));
  }, []);

  // Build perimeter frame points following parabolic curvature
  const perimeterPoints = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const segsX = 48;
    const segsY = 24;
    const halfW = MESH_WIDTH / 2;
    const halfH = MESH_HEIGHT / 2;

    const zAt = (x: number, y: number) => -((x * x) / 18.0 + (y * y) / 10.0);

    // Bottom edge (left to right, v=0)
    for (let i = 0; i <= segsX; i++) {
      const x = -halfW + (i / segsX) * MESH_WIDTH;
      const y = -halfH;
      pts.push(new THREE.Vector3(x, y, zAt(x, y) - 0.005));
    }
    // Right edge (bottom to top, u=1)
    for (let i = 0; i <= segsY; i++) {
      const x = halfW;
      const y = -halfH + (i / segsY) * MESH_HEIGHT;
      pts.push(new THREE.Vector3(x, y, zAt(x, y) - 0.005));
    }
    // Top edge (right to left, v=1)
    for (let i = 0; i <= segsX; i++) {
      const x = halfW - (i / segsX) * MESH_WIDTH;
      const y = halfH;
      pts.push(new THREE.Vector3(x, y, zAt(x, y) - 0.005));
    }
    // Left edge (top to bottom, u=0)
    for (let i = 0; i <= segsY; i++) {
      const x = -halfW;
      const y = halfH - (i / segsY) * MESH_HEIGHT;
      pts.push(new THREE.Vector3(x, y, zAt(x, y) - 0.005));
    }

    return pts;
  }, []);

  const perimeterGeometry = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints(perimeterPoints);
  }, [perimeterPoints]);

  const uniforms = useMemo(() => {
    return {
      uTime: { value: 0 },
      uLandMask: { value: landMaskTexture },
      uSparseFactor: { value: sparseFactor },
      uTransition: { value: transition },
      uFloatCoords: { value: floatCoords },
    };
  }, [landMaskTexture, floatCoords]);

  // Update target uniforms when props change
  useEffect(() => {
    if (shaderMatRef.current) {
      shaderMatRef.current.uniforms.uTransition.value = transition;
      shaderMatRef.current.uniforms.uSparseFactor.value = sparseFactor;
    }
  }, [transition, sparseFactor]);

  useFrame(({ clock }, delta) => {
    if (shaderMatRef.current) {
      shaderMatRef.current.uniforms.uTime.value = clock.getElapsedTime();

      // Smoothly lerp uSparseFactor toward desired target
      const currentSparse = shaderMatRef.current.uniforms.uSparseFactor.value;
      const targetSparse = sparseFactor;
      shaderMatRef.current.uniforms.uSparseFactor.value = THREE.MathUtils.lerp(
        currentSparse,
        targetSparse,
        Math.min(delta * 4.0, 0.20)
      );
    }
  });

  return (
    <group>
      {/* 1. Regional Curved Ocean Surface Plane */}
      <mesh ref={meshRef}>
        <planeGeometry args={[MESH_WIDTH, MESH_HEIGHT, 128, 64]} />
        <shaderMaterial
          ref={shaderMatRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent
          side={THREE.DoubleSide}
          depthWrite={true}
        />
      </mesh>

      {/* 2. Scientific Perimeter Bounding Frame */}
      <line geometry={perimeterGeometry}>
        <lineBasicMaterial
          color="#00f0ff"
          transparent
          opacity={0.25}
          linewidth={1}
        />
      </line>
    </group>
  );
};
