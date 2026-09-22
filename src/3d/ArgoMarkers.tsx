import React, { useState, useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

interface ArgoFloatData {
  id: string;
  wmo: string;
  lat: number;
  lon: number;
  depth: number;
  temp: number;
  status: 'ACTIVE' | 'CALIBRATED';
}

// 8 realistic ARGO observation floats strategically distributed around the oceanic sphere
const ARGO_FLOATS: ArgoFloatData[] = [
  { id: 'f1', wmo: 'ARGO #2902271', lat: 14.2, lon: 68.4, depth: 1850, temp: 28.4, status: 'ACTIVE' },
  { id: 'f2', wmo: 'ARGO #1901897', lat: 9.5, lon: 86.2, depth: 2000, temp: 29.1, status: 'ACTIVE' },
  { id: 'f3', wmo: 'ARGO #2903142', lat: 18.1, lon: 64.3, depth: 1600, temp: 27.8, status: 'ACTIVE' },
  { id: 'f4', wmo: 'ARGO #2902282', lat: 12.8, lon: 92.5, depth: 1950, temp: 28.9, status: 'ACTIVE' },
  { id: 'f5', wmo: 'ARGO #2902120', lat: -4.2, lon: 74.8, depth: 2000, temp: 28.2, status: 'CALIBRATED' },
  { id: 'f6', wmo: 'ARGO #1902401', lat: 6.7, lon: 72.1, depth: 1720, temp: 28.7, status: 'ACTIVE' },
  { id: 'f7', wmo: 'ARGO #2903330', lat: 21.0, lon: 69.1, depth: 1400, temp: 26.9, status: 'ACTIVE' },
  { id: 'f8', wmo: 'ARGO #1901995', lat: 16.4, lon: 88.0, depth: 1900, temp: 28.5, status: 'CALIBRATED' },
];

interface ArgoMarkersProps {
  radius?: number;
}

export const ArgoMarkers: React.FC<ArgoMarkersProps> = ({ radius = 2.66 }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Convert lat/lon coordinates to 3D Cartesian coordinates resting slightly on the sphere surface
  const markerPositions = useMemo(() => {
    return ARGO_FLOATS.map((float) => {
      const phi = (90 - float.lat) * (Math.PI / 180);
      const theta = (float.lon + 180) * (Math.PI / 180);
      const x = -(radius * Math.sin(phi) * Math.cos(theta));
      const z = radius * Math.sin(phi) * Math.sin(theta);
      const y = radius * Math.cos(phi);
      return { ...float, position: new THREE.Vector3(x, y, z) };
    });
  }, [radius]);

  return (
    <group>
      {markerPositions.map((float) => {
        const isHovered = hoveredId === float.id;

        return (
          <group key={float.id} position={float.position}>
            {/* Transparent raycast hit target for easy mouse hover */}
            <mesh
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoveredId(float.id);
              }}
              onPointerOut={(e) => {
                e.stopPropagation();
                setHoveredId((curr) => (curr === float.id ? null : curr));
              }}
            >
              <sphereGeometry args={[0.16, 8, 8]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>

            {/* Scientific Beacon Center */}
            <mesh>
              <sphereGeometry args={[isHovered ? 0.045 : 0.032, 16, 16]} />
              <meshBasicMaterial
                color={isHovered ? '#ffffff' : '#00f0ff'}
                transparent
                opacity={isHovered ? 1.0 : 0.85}
              />
            </mesh>

            {/* Subtle Outer Pulsing Halo */}
            <mesh>
              <ringGeometry args={[0.045, 0.075, 24]} />
              <meshBasicMaterial
                color="#00f0ff"
                transparent
                opacity={isHovered ? 0.8 : 0.35}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>

            {/* Minimal HTML Scientific Floating Tooltip on Hover */}
            {isHovered && (
              <Html
                center
                distanceFactor={7.5}
                position={[0, 0.18, 0]}
                style={{
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                <div className="bg-[#040914]/95 backdrop-blur-md border border-[#00f0ff]/40 px-3 py-2 rounded shadow-[0_4px_24px_rgba(0,0,0,0.85)] text-left font-mono text-xs">
                  <div className="flex items-center gap-1.5 mb-1 pb-1 border-b border-[#00f0ff]/15">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff] animate-pulse"></span>
                    <span className="font-semibold text-white tracking-wide text-[11px]">{float.wmo}</span>
                  </div>
                  <div className="text-[10px] space-y-0.5 text-[#94a9be]">
                    <div className="flex justify-between gap-4">
                      <span>Coordinates:</span>
                      <span className="text-[#dbfcff]">{float.lat}°N, {float.lon}°E</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Profile Depth:</span>
                      <span className="text-[#00f0ff]">{float.depth} m</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>SST Sensor:</span>
                      <span className="text-white">{float.temp} °C</span>
                    </div>
                    <div className="flex justify-between gap-4 pt-0.5">
                      <span>Status:</span>
                      <span className="text-emerald-400 font-semibold text-[9px] tracking-wider">{float.status}</span>
                    </div>
                  </div>
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
};
