import React, { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

export interface RegionalFloatData {
  id: string;
  wmo: string;
  lon: number;
  lat: number;
  sst: string;
  depth: string;
  basin: string;
  u: number;
  v: number;
}

// 18 real ARGO floats in North Indian Ocean [45°E, 105°E] x [5°N, 30°N]
export const REGIONAL_ARGO_FLOATS: RegionalFloatData[] = [
  // Arabian Sea & Northwest Indian Ocean
  { id: 'f1', wmo: '2902271', lon: 65.2, lat: 15.2, sst: '28.4°C', depth: '2000 m', basin: 'Central Arabian Sea', u: (65.2 - 45) / 60, v: (15.2 - 5) / 25 },
  { id: 'f2', wmo: '1901897', lon: 60.9, lat: 14.8, sst: '27.8°C', depth: '1850 m', basin: 'Western Arabian Sea', u: (60.9 - 45) / 60, v: (14.8 - 5) / 25 },
  { id: 'f3', wmo: '2902272', lon: 68.5, lat: 18.1, sst: '28.1°C', depth: '2000 m', basin: 'Eastern Arabian Sea', u: (68.5 - 45) / 60, v: (18.1 - 5) / 25 },
  { id: 'f4', wmo: '2902115', lon: 58.4, lat: 21.2, sst: '26.9°C', depth: '1900 m', basin: 'Gulf of Oman',         u: (58.4 - 45) / 60, v: (21.2 - 5) / 25 },
  { id: 'f5', wmo: '1901764', lon: 52.3, lat: 12.8, sst: '27.4°C', depth: '1750 m', basin: 'Gulf of Aden',         u: (52.3 - 45) / 60, v: (12.8 - 5) / 25 },
  { id: 'f6', wmo: '2902088', lon: 64.1, lat: 8.9,  sst: '29.1°C', depth: '2000 m', basin: 'SE Arabian Sea',       u: (64.1 - 45) / 60, v: (8.9 - 5) / 25 },
  { id: 'f7', wmo: '2902143', lon: 71.8, lat: 7.2,  sst: '29.3°C', depth: '2000 m', basin: 'Lakshadweep Basin',    u: (71.8 - 45) / 60, v: (7.2 - 5) / 25 },
  { id: 'f8', wmo: '2902189', lon: 74.0, lat: 12.4, sst: '28.7°C', depth: '1800 m', basin: 'Malabar Coast',       u: (74.0 - 45) / 60, v: (12.4 - 5) / 25 },
  { id: 'f9', wmo: '1901923', lon: 62.7, lat: 22.5, sst: '26.5°C', depth: '2000 m', basin: 'North Arabian Basin',  u: (62.7 - 45) / 60, v: (22.5 - 5) / 25 },
  { id: 'f10', wmo: '2902099', lon: 56.5, lat: 16.5, sst: '27.2°C', depth: '1950 m', basin: 'Oman Upwelling Zone', u: (56.5 - 45) / 60, v: (16.5 - 5) / 25 },

  // Bay of Bengal & Andaman Sea
  { id: 'f11', wmo: '2902273', lon: 88.4, lat: 16.8, sst: '29.5°C', depth: '2000 m', basin: 'Central Bay of Bengal', u: (88.4 - 45) / 60, v: (16.8 - 5) / 25 },
  { id: 'f12', wmo: '2902274', lon: 91.2, lat: 13.5, sst: '29.7°C', depth: '2000 m', basin: 'Andaman Sea Basin',    u: (91.2 - 45) / 60, v: (13.5 - 5) / 25 },
  { id: 'f13', wmo: '1901944', lon: 84.5, lat: 14.2, sst: '29.2°C', depth: '1900 m', basin: 'SW Bay of Bengal',      u: (84.5 - 45) / 60, v: (14.2 - 5) / 25 },
  { id: 'f14', wmo: '2902280', lon: 87.8, lat: 9.2,  sst: '29.6°C', depth: '2000 m', basin: 'South Bay of Bengal',   u: (87.8 - 45) / 60, v: (9.2 - 5) / 25 },
  { id: 'f15', wmo: '2902198', lon: 86.5, lat: 5.6,  sst: '29.8°C', depth: '2000 m', basin: 'Equatorial Indian Ocean', u: (86.5 - 45) / 60, v: (5.6 - 5) / 25 },
  { id: 'f16', wmo: '1902001', lon: 93.8, lat: 11.1, sst: '29.4°C', depth: '1850 m', basin: 'Nicobar Ridge',         u: (93.8 - 45) / 60, v: (11.1 - 5) / 25 },
  { id: 'f17', wmo: '2902285', lon: 89.2, lat: 19.8, sst: '28.9°C', depth: '2000 m', basin: 'North Bay of Bengal',   u: (89.2 - 45) / 60, v: (19.8 - 5) / 25 },
  { id: 'f18', wmo: '2902291', lon: 95.8, lat: 7.4,  sst: '29.5°C', depth: '1750 m', basin: 'Sumatra Trench Outer',   u: (95.8 - 45) / 60, v: (7.4 - 5) / 25 },
];

/**
 * Calculates 3D world position on the curved regional ocean mesh
 */
export function getRegionalFloatPos(u: number, v: number, width = 6.4, height = 2.67): [number, number, number] {
  const x = (u - 0.5) * width;
  const y = (v - 0.5) * height;
  const z = -( (x * x) / 18.0 + (y * y) / 10.0 );
  return [x, y, z];
}

interface SingleMarkerProps {
  float: RegionalFloatData;
  index: number;
  meshWidth?: number;
  meshHeight?: number;
  isSparseMode?: boolean;
}

const SingleRegionalMarker: React.FC<SingleMarkerProps> = ({
  float,
  index,
  meshWidth = 6.4,
  meshHeight = 2.67,
  isSparseMode = false,
}) => {
  const [hovered, setHovered] = useState(false);
  const ringRef = useRef<THREE.Mesh>(null);
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const [x, y, z] = useMemo(
    () => getRegionalFloatPos(float.u, float.v, meshWidth, meshHeight),
    [float.u, float.v, meshWidth, meshHeight]
  );

  // Line endpoints in local coordinate space (relative to marker group)
  const stemGeometry = useMemo(() => {
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -0.22)];
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + index * 0.45;
    if (ringRef.current && ringMatRef.current) {
      // Periodic pulse ring
      const cycle = (t * 0.85) % 1.0;
      const s = 1.0 + cycle * 2.0;
      ringRef.current.scale.set(s, s, 1.0);
      ringMatRef.current.opacity = (1.0 - cycle) * (hovered ? 0.95 : (isSparseMode ? 0.90 : 0.50));
    }
  });

  return (
    <group position={[x, y, z + 0.045]}>
      {/* Subsurface Profiling CTD Stem */}
      <line geometry={stemGeometry}>
        <lineBasicMaterial
          color={hovered ? '#00f0ff' : '#00a8ff'}
          transparent
          opacity={hovered ? 0.90 : (isSparseMode ? 0.70 : 0.35)}
          linewidth={1}
        />
      </line>

      {/* Surface Beacon Core Dot */}
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
        }}
      >
        <sphereGeometry args={[hovered ? 0.042 : 0.032, 16, 16]} />
        <meshBasicMaterial
          color={hovered ? '#ffffff' : (isSparseMode ? '#00f0ff' : '#38bdf8')}
          transparent
          opacity={hovered ? 1.0 : (isSparseMode ? 0.95 : 0.80)}
        />
      </mesh>

      {/* Pulsing Observation Halo Ring */}
      <mesh ref={ringRef} rotation={[0, 0, 0]}>
        <ringGeometry args={[0.038, 0.048, 24]} />
        <meshBasicMaterial
          ref={ringMatRef}
          color="#00f0ff"
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Scientific Float Telemetry Tooltip */}
      {hovered && (
        <Html distanceFactor={10} position={[0.15, 0.12, 0.05]} style={{ pointerEvents: 'none' }}>
          <div className="bg-[#030914]/95 border border-[#00f0ff]/50 px-3 py-2 rounded shadow-2xl backdrop-blur-md whitespace-nowrap z-50 text-[10px] font-mono text-[#dde2f3] min-w-[150px]">
            <div className="flex items-center justify-between gap-2 border-b border-[#1c2d47]/70 pb-1 mb-1.5">
              <span className="text-[#00f0ff] font-bold">ARGO #{float.wmo}</span>
              <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                ACTIVE
              </span>
            </div>
            <div className="text-[9px] text-[#94a9be] mb-0.5">{float.basin}</div>
            <div className="text-[9px] text-[#94a9be]">
              {float.lat.toFixed(1)}°N, {float.lon.toFixed(1)}°E
            </div>
            <div className="flex items-center justify-between text-[9px] text-[#dde2f3] mt-1.5 pt-1 border-t border-[#1c2d47]/40">
              <span>SST: <strong className="text-[#dbfcff]">{float.sst}</strong></span>
              <span>PROFILE: <strong className="text-[#00f0ff]">{float.depth}</strong></span>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
};

interface RegionalArgoMarkersProps {
  meshWidth?: number;
  meshHeight?: number;
  isSparseMode?: boolean;
}

export const RegionalArgoMarkers: React.FC<RegionalArgoMarkersProps> = ({
  meshWidth = 6.4,
  meshHeight = 2.67,
  isSparseMode = false,
}) => {
  return (
    <group>
      {REGIONAL_ARGO_FLOATS.map((f, idx) => (
        <SingleRegionalMarker
          key={f.id}
          float={f}
          index={idx}
          meshWidth={meshWidth}
          meshHeight={meshHeight}
          isSparseMode={isSparseMode}
        />
      ))}
    </group>
  );
};
