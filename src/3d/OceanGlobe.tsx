import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ArgoMarkers } from './ArgoMarkers';

// Procedural GLSL Shader for deep ocean sphere with bathymetric depth, continental continental shelf variations, and subtle Fresnel edge response
const OceanGlobeShader = {
  uniforms: {
    uTime: { value: 0 },
    uSunDirection: { value: new THREE.Vector3(-1.0, 0.75, 0.9).normalize() },
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vWorldPosition;
    varying vec2 vUv;

    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      vUv = uv;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uSunDirection;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vWorldPosition;
    varying vec2 vUv;

    // Simple analytical 3D noise for organic ocean/bathymetry patterning
    float hash(vec3 p) {
      p = fract(p * 0.3183099 + 0.1);
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    float noise(vec3 x) {
      vec3 p = floor(x);
      vec3 w = fract(x);
      vec3 u = w * w * (3.0 - 2.0 * w);
      return mix(mix(mix(hash(p + vec3(0,0,0)), hash(p + vec3(1,0,0)), u.x),
                     mix(hash(p + vec3(0,1,0)), hash(p + vec3(1,1,0)), u.x), u.y),
                 mix(mix(hash(p + vec3(0,0,1)), hash(p + vec3(1,0,1)), u.x),
                     mix(hash(p + vec3(0,1,1)), hash(p + vec3(1,1,1)), u.x), u.y), u.z);
    }

    float fbm(vec3 p) {
      float f = 0.0;
      f += 0.5200 * noise(p); p *= 2.02;
      f += 0.2600 * noise(p); p *= 2.03;
      f += 0.1300 * noise(p); p *= 2.01;
      f += 0.0650 * noise(p);
      return f;
    }

    void main() {
      vec3 norm = normalize(vNormal);
      vec3 viewDir = normalize(cameraPosition - vWorldPosition);

      // Multi-scale oceanic basin and bathymetric shelf topography
      vec3 samplePos = normalize(vPosition) * 3.8;
      float basinStructure = fbm(samplePos);
      float microDetail = fbm(samplePos * 3.2 + vec3(0.0, uTime * 0.02, 0.0));
      
      // Ridge & current flow streamlines
      float ridges = abs(sin((basinStructure + microDetail * 0.4) * 14.0));
      float shelfContour = smoothstep(0.48, 0.52, basinStructure);

      // Distinct ocean scientific palette:
      // Abyssal deeps (#020b18) -> Bathypelagic (#061b38) -> Deep ocean (#0c2e55) -> Shelf (#104d80) -> Sunlit epipelagic (#1d78b5)
      vec3 deepAbyss     = vec3(0.015, 0.052, 0.110);
      vec3 bathypelagic  = vec3(0.025, 0.100, 0.220);
      vec3 openOcean     = vec3(0.040, 0.180, 0.350);
      vec3 continentalShelf = vec3(0.070, 0.300, 0.520);
      vec3 sunlitSurface = vec3(0.120, 0.440, 0.680);

      // Layer blending with natural bathymetric stratification
      vec3 oceanColor = mix(deepAbyss, bathypelagic, smoothstep(0.28, 0.46, basinStructure));
      oceanColor = mix(oceanColor, openOcean, smoothstep(0.46, 0.64, basinStructure + microDetail * 0.1));
      oceanColor = mix(oceanColor, continentalShelf, smoothstep(0.64, 0.78, basinStructure));
      oceanColor = mix(oceanColor, sunlitSurface, smoothstep(0.78, 0.90, basinStructure) * 0.6);

      // Subtle scientific ridge current lines (0.05 intensity)
      oceanColor += vec3(0.02, 0.08, 0.14) * (1.0 - ridges) * shelfContour;

      // Scientific key directional sunlight (from upper-left)
      float NdotL = dot(norm, uSunDirection);
      // Half-Lambert / soft wrap diffuse so the spherical curvature is instantly readable across terminator
      float diffuse = smoothstep(-0.20, 0.88, NdotL);

      // Ambient night radiance: deep luminous indigo separating sphere from void background #02060d
      vec3 ambientNight = vec3(0.012, 0.035, 0.075);

      // Specular highlight: sun reflection on glossy ocean water
      vec3 halfDir = normalize(uSunDirection + viewDir);
      float specAngle = max(dot(norm, halfDir), 0.0);
      float specular = pow(specAngle, 48.0) * 0.60 * diffuse;
      vec3 specularColor = vec3(0.75, 0.92, 1.0);

      // Grazing Fresnel rim: physical dielectric reflectance curve
      float NdotV = max(dot(norm, viewDir), 0.0);
      float fresnel = pow(1.0 - NdotV, 3.0);
      vec3 fresnelCyan = vec3(0.04, 0.45, 0.75);

      // Night-side edge lift
      vec3 backLightDir = normalize(vec3(1.0, -0.5, -0.6));
      float backRim = max(dot(norm, backLightDir), 0.0) * pow(1.0 - NdotV, 2.0) * 0.30;
      vec3 backRimColor = vec3(0.03, 0.20, 0.40);

      // Final composite: rich spherical illumination, visible bathymetric contrast
      vec3 litSurface = oceanColor * (diffuse * 1.55) + ambientNight;
      vec3 finalColor = litSurface + specular * specularColor + fresnel * fresnelCyan * 0.40 + backRim * backRimColor;

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
};

export const OceanGlobe: React.FC = () => {
  const meshRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    // Key light positioned upper-left/front for a dramatic planetary crescent/half phase
    uSunDirection: { value: new THREE.Vector3(-1.0, 0.75, 0.9).normalize() },
  }), []);

  useFrame((state, delta) => {
    // Noticeable yet slow, graceful planetary axial rotation (~1 revolution per 90s)
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.065;
      // Slight planetary axial tilt (12 degrees)
      meshRef.current.rotation.x = 0.12;
    }
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <group ref={meshRef} position={[0, 0, 0]}>
      {/* 2.65 radius: occupies ~50-55% of viewport height at camera z=6.8 */}
      <mesh>
        <sphereGeometry args={[2.65, 80, 80]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={OceanGlobeShader.vertexShader}
          fragmentShader={OceanGlobeShader.fragmentShader}
          uniforms={uniforms}
        />
      </mesh>

      {/* Surface ARGO float beacons attached to the rotating sphere */}
      <ArgoMarkers radius={2.66} />
    </group>
  );
};
