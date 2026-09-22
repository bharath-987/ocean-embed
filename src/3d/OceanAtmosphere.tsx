import React, { useMemo } from 'react';
import * as THREE from 'three';

// Refined Rayleigh/Mie atmospheric limb shader:
// Creates a thin, soft, restrained cyan-blue rim around the planetary silhouette
const AtmosphereShader = {
  uniforms: {
    uAtmosphereColor: { value: new THREE.Color(0x00d2ff) },
    uSunDirection: { value: new THREE.Vector3(-1.0, 0.75, 0.9).normalize() },
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vWorldPosition;

    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    uniform vec3 uAtmosphereColor;
    uniform vec3 uSunDirection;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;

    void main() {
      vec3 viewDir = normalize(cameraPosition - vWorldPosition);
      vec3 norm = normalize(vNormal);

      // Dot product between viewing ray and surface normal
      // For BackSide rendering, dot(norm, viewDir) is negative on silhouette grazing angles
      float NdotV = dot(norm, viewDir);

      // Atmospheric limb peak: soft exponential decay away from silhouette grazing angle
      float limb = smoothstep(0.0, 0.32, 1.0 - abs(NdotV));
      float intensity = pow(limb, 2.5);

      // Atmospheric sunlight modulation: slightly brighter on the illuminated day crescent
      float sunFacing = dot(norm, uSunDirection);
      float lightMod = 0.35 + 0.65 * max(sunFacing, 0.0);

      vec3 col = uAtmosphereColor * (intensity * lightMod * 1.2);
      float alpha = clamp(intensity * 0.65 * lightMod, 0.0, 0.65);

      gl_FragColor = vec4(col, alpha);
    }
  `
};

export const OceanAtmosphere: React.FC = () => {
  const uniforms = useMemo(() => ({
    uAtmosphereColor: { value: new THREE.Color(0x00c8f8) },
    uSunDirection: { value: new THREE.Vector3(-1.0, 0.75, 0.9).normalize() },
  }), []);

  return (
    <mesh position={[0, 0, 0]}>
      {/* 2.70 radius: just 1.8% over globe radius 2.65, creating an organic hugging mantle */}
      <sphereGeometry args={[2.70, 80, 80]} />
      <shaderMaterial
        vertexShader={AtmosphereShader.vertexShader}
        fragmentShader={AtmosphereShader.fragmentShader}
        uniforms={uniforms}
        blending={THREE.AdditiveBlending}
        side={THREE.BackSide}
        transparent={true}
        depthWrite={false}
      />
    </mesh>
  );
};
