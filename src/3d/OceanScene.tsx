import React, { Suspense, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RegionalOceanMesh } from './RegionalOceanMesh';
import { RegionalArgoMarkers } from './RegionalArgoMarkers';

interface SceneContentProps {
  isMobile: boolean;
  prefersReducedMotion: boolean;
  screenState: number;
  transitionProgress: number;
  isContained?: boolean;
}

const SceneContent: React.FC<SceneContentProps> = ({
  isMobile,
  prefersReducedMotion,
  screenState,
  transitionProgress,
  isContained = false,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const targetPos = useRef(new THREE.Vector2(0, 0));
  const currentPos = useRef(new THREE.Vector2(0, 0));

  // Determine target sparse factor (Screen 1 = 0.0, Screen 2 = 1.0)
  const targetSparse = screenState === 2 ? 1.0 : 0.0;

  useEffect(() => {
    if (prefersReducedMotion) return;

    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      targetPos.current.x = x * 0.08;
      targetPos.current.y = y * 0.06;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [prefersReducedMotion]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    if (!prefersReducedMotion) {
      // Velvety smooth pointer parallax interpolation
      const lerpSpeed = Math.min(delta * 2.8, 0.1);
      currentPos.current.x += (targetPos.current.x - currentPos.current.x) * lerpSpeed;
      currentPos.current.y += (targetPos.current.y - currentPos.current.y) * lerpSpeed;

      if (isContained) {
        // Centered inside dedicated scientific viewport card
        groupRef.current.position.x = 0.0 + currentPos.current.x * 0.5;
        groupRef.current.position.y = 0.12 + currentPos.current.y * 0.5;
        groupRef.current.position.z = 0.0;
        groupRef.current.rotation.x = -0.50 - currentPos.current.y * 0.12;
        groupRef.current.rotation.y = -0.06 + currentPos.current.x * 0.15;
        groupRef.current.rotation.z = 0.01;
        groupRef.current.scale.setScalar(isMobile ? 0.75 : 1.10);
      } else if (!isMobile) {
        // Base desktop offset: positioned in right 60% of viewport
        groupRef.current.position.x = 2.4 + currentPos.current.x;
        groupRef.current.position.y = 0.05 + currentPos.current.y;
        groupRef.current.position.z = 0.0;
        groupRef.current.rotation.x = -0.52 - currentPos.current.y * 0.15;
        groupRef.current.rotation.y = -0.10 + currentPos.current.x * 0.20;
        groupRef.current.rotation.z = 0.02;
        groupRef.current.scale.setScalar(1.0);
      } else {
        // Mobile layout: centered below hero stats
        groupRef.current.position.set(0.0, -3.0, 0.0);
        groupRef.current.rotation.set(-0.48, -0.05, 0.0);
        groupRef.current.scale.setScalar(0.50);
      }
    } else {
      // Reduced motion
      if (isContained) {
        groupRef.current.position.set(0.0, -0.10, 0.0);
        groupRef.current.rotation.set(-0.50, -0.06, 0.01);
        groupRef.current.scale.setScalar(isMobile ? 0.65 : 0.95);
      } else {
        groupRef.current.position.set(isMobile ? 0 : 2.4, isMobile ? -3.0 : 0.05, 0.0);
        groupRef.current.rotation.set(isMobile ? -0.48 : -0.52, isMobile ? -0.05 : -0.10, isMobile ? 0.0 : 0.02);
        groupRef.current.scale.setScalar(isMobile ? 0.50 : 1.0);
      }
    }
  });

  return (
    <group
      ref={groupRef}
      position={isContained ? [0, -0.10, 0] : isMobile ? [0, -3.0, 0] : [2.4, 0.05, 0]}
      rotation={[-0.50, -0.06, 0.01]}
      scale={isContained ? (isMobile ? [0.65, 0.65, 0.65] : [0.95, 0.95, 0.95]) : isMobile ? [0.50, 0.50, 0.50] : [1, 1, 1]}
    >
      {/* Regional North Indian Ocean Mesh (5°N–30°N, 45°E–105°E) */}
      <RegionalOceanMesh
        sparseFactor={targetSparse}
        transition={transitionProgress}
      />

      {/* In-Situ ARGO Float Profilers */}
      <RegionalArgoMarkers
        isSparseMode={screenState === 2}
      />
    </group>
  );
};

export interface OceanSceneProps {
  screenState?: number;          // 1: Idle continuous domain, 2: Sparse ARGO data gaps
  transitionProgress?: number;   // 0.0 -> 1.0 (Screen 3 gap reconstruction)
  onScreenChange?: (screen: number) => void;
  isContained?: boolean;
}

export const OceanScene: React.FC<OceanSceneProps> = ({
  screenState: propScreenState,
  transitionProgress = 0.0,
  onScreenChange,
  isContained = false,
}) => {
  const [internalScreen, setInternalScreen] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const screenParam = params.get('screen');
      if (screenParam === '2') return 2;
    }
    return 1;
  });

  const activeScreen = propScreenState !== undefined ? propScreenState : internalScreen;

  // Expose global controller for automated tests and external drivers
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).setKyogreScreenState = (s: number) => {
        setInternalScreen(s);
        if (onScreenChange) onScreenChange(s);
      };
    }
  }, [onScreenChange]);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div className={`w-full h-full select-none pointer-events-auto ${isContained ? 'relative' : 'absolute inset-0'}`}>
      <Canvas
        camera={{ position: [0, 0, isContained ? 8.6 : 9.4], fov: 38, near: 0.1, far: 100 }}
        dpr={[1, 2]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
        className="w-full h-full"
      >
        {isContained && <color attach="background" args={['#030914']} />}

        {/* Scientific Lighting Rig (Subtle, non-glowing) */}
        <ambientLight intensity={0.25} color="#051528" />
        <directionalLight position={[-4.5, 4.0, 5.0]} intensity={2.0} color="#f0f9ff" />
        <directionalLight position={[4.0, -3.0, -2.0]} intensity={0.35} color="#004d73" />

        <Suspense fallback={null}>
          <SceneContent
            isMobile={isMobile}
            prefersReducedMotion={prefersReducedMotion}
            screenState={activeScreen}
            transitionProgress={transitionProgress}
            isContained={isContained}
          />
        </Suspense>
      </Canvas>
    </div>
  );
};
