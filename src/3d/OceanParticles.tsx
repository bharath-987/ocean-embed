import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface OceanParticlesProps {
  count?: number;
}

export const OceanParticles: React.FC<OceanParticlesProps> = ({ count = 220 }) => {
  const pointsRef = useRef<THREE.Points>(null);

  // Sparse, subtle scientific data points in depth around the globe
  const [positions] = useMemo(() => {
    const pos = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Stratified distance: 3.1 to 4.8 radius (hovering clearly outside globe & atmosphere)
      const radius = 3.1 + Math.random() * 1.7;
      const theta = 2 * Math.PI * Math.random();
      const phi = Math.acos(2 * Math.random() - 1);

      pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.9;
      pos[i * 3 + 2] = radius * Math.cos(phi);
    }

    return [pos];
  }, [count]);

  useFrame((state, delta) => {
    if (pointsRef.current) {
      // Very slow, subtle orbital drift
      pointsRef.current.rotation.y -= delta * 0.012;
      pointsRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.08) * 0.03;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.024}
        color={new THREE.Color('#38bdf8')}
        transparent={true}
        opacity={0.38}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation={true}
      />
    </points>
  );
};
