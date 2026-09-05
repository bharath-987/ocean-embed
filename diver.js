import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class Diver {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    
    // Procedural parts for animation reference
    this.parts = {};
    
    this.isLoaded = false;
    this.time = 0;
    
    // Try to load a real GLTF model if provided in the future,
    // otherwise fallback to procedural immediately.
    this.buildProceduralDiver();
    this.scene.add(this.group);
  }
  
  // Future-proofing GLTF Loader architecture
  loadModel(url) {
    const loader = new GLTFLoader();
    loader.load(url, (gltf) => {
      // If loaded, remove procedural fallback
      this.group.clear(); 
      this.model = gltf.scene;
      
      // Setup animations if present
      if (gltf.animations && gltf.animations.length > 0) {
        this.mixer = new THREE.AnimationMixer(this.model);
        // ... play default animation
      }
      
      this.group.add(this.model);
      this.isLoaded = true;
    }, undefined, (error) => {
      console.error("Failed to load GLTF diver, falling back to procedural", error);
    });
  }

  buildProceduralDiver() {
    const material = new THREE.MeshStandardMaterial({ 
      color: 0x111111,
      roughness: 0.7,
      metalness: 0.1
    });
    
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xd2b48c,
      roughness: 0.6
    });

    const equipmentMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.3,
      metalness: 0.5
    });
    
    const yellowMaterial = new THREE.MeshStandardMaterial({
      color: 0xe5c100,
      roughness: 0.4
    });

    // Torso (Wetsuit)
    const torsoGeo = new THREE.CapsuleGeometry(0.25, 0.6, 4, 16);
    this.parts.torso = new THREE.Mesh(torsoGeo, material);
    this.group.add(this.parts.torso);
    
    // Head & Mask
    const headGroup = new THREE.Group();
    headGroup.position.y = 0.55;
    
    const headGeo = new THREE.SphereGeometry(0.15, 16, 16);
    const head = new THREE.Mesh(headGeo, skinMaterial);
    
    // Scuba Mask (Glass/Black rim)
    const maskGeo = new THREE.BoxGeometry(0.2, 0.1, 0.15);
    const mask = new THREE.Mesh(maskGeo, new THREE.MeshStandardMaterial({color: 0x050505, roughness: 0.1}));
    mask.position.set(0, 0.02, 0.12);
    
    // Regulator
    const regGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.08);
    regGeo.rotateZ(Math.PI/2);
    const regulator = new THREE.Mesh(regGeo, equipmentMaterial);
    regulator.position.set(0, -0.08, 0.15);
    
    headGroup.add(head);
    headGroup.add(mask);
    headGroup.add(regulator);
    this.parts.head = headGroup;
    this.parts.torso.add(headGroup);

    // Scuba Tank
    const tankGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.7, 16);
    const tank = new THREE.Mesh(tankGeo, yellowMaterial);
    tank.position.set(0, 0.0, -0.3);
    this.parts.torso.add(tank);

    // Arms
    const buildLimb = (isLeg) => {
      const root = new THREE.Group();
      const upperGeo = new THREE.CapsuleGeometry(0.08, 0.3);
      const upper = new THREE.Mesh(upperGeo, material);
      upper.position.y = -0.15;
      
      const lowerGroup = new THREE.Group();
      lowerGroup.position.y = -0.35;
      
      const lowerGeo = new THREE.CapsuleGeometry(isLeg ? 0.09 : 0.07, 0.3);
      const lower = new THREE.Mesh(lowerGeo, material);
      lower.position.y = -0.15;
      
      lowerGroup.add(lower);
      
      if (isLeg) {
        // Fin
        const finGeo = new THREE.BoxGeometry(0.15, 0.4, 0.02);
        // taper the fin
        const fin = new THREE.Mesh(finGeo, equipmentMaterial);
        fin.position.set(0, -0.4, 0.05);
        fin.rotation.x = 0.2;
        lowerGroup.add(fin);
      }
      
      root.add(upper);
      root.add(lowerGroup);
      return { root, lowerGroup };
    };

    // Left Arm
    this.parts.armL = buildLimb(false);
    this.parts.armL.root.position.set(0.35, 0.2, 0);
    this.parts.torso.add(this.parts.armL.root);
    
    // Right Arm
    this.parts.armR = buildLimb(false);
    this.parts.armR.root.position.set(-0.35, 0.2, 0);
    this.parts.torso.add(this.parts.armR.root);
    
    // Left Leg
    this.parts.legL = buildLimb(true);
    this.parts.legL.root.position.set(0.15, -0.4, 0);
    this.parts.torso.add(this.parts.legL.root);
    
    // Right Leg
    this.parts.legR = buildLimb(true);
    this.parts.legR.root.position.set(-0.15, -0.4, 0);
    this.parts.torso.add(this.parts.legR.root);
    
    // Initial pose (horizontal swimming)
    this.group.rotation.x = -Math.PI / 2;
  }

  update(dt, scrollT) {
    this.time += dt;
    
    if (this.mixer) {
      this.mixer.update(dt);
      return;
    }
    
    // Procedural animation
    // The animation state depends on scrollT
    // 0.00 - 0.12: Above surface (treading water vertically or just standing/floating)
    // 0.12 - 0.15: Entering water (transition to horizontal)
    // 0.15 - 0.50: Horizontal surface swim
    // 0.50 - 1.00: Descending (angled down)
    
    const t = this.time;
    
    // 1. Posture & Orientation (handled largely by cinematic-camera, but diver pitches down too)
    let targetPitch = 0;
    
    if (scrollT < 0.12) {
      // Treading water (mostly vertical)
      targetPitch = 0; // vertical
    } else if (scrollT < 0.15) {
      // Transitioning to swim
      const localT = (scrollT - 0.12) / 0.03;
      targetPitch = -Math.PI/2 * localT;
    } else if (scrollT < 0.45) {
      // Horizontal swim
      targetPitch = -Math.PI/2;
    } else {
      // Descending
      const localT = Math.min(1, (scrollT - 0.45) / 0.15);
      // Pitch down further
      targetPitch = -Math.PI/2 - (Math.PI/3 * localT);
    }
    
    // Smooth interpolation for body pitch
    this.group.rotation.x += (targetPitch - this.group.rotation.x) * dt * 2.0;

    // 2. Limb Animation (Frog kick / Flutter kick)
    // We'll use a slow flutter kick
    const swimSpeed = (scrollT > 0.12 && scrollT < 0.6) ? 3.0 : 1.5; // slow down at depth
    const legPhase = t * swimSpeed;
    
    // Thighs
    this.parts.legL.root.rotation.x = Math.sin(legPhase) * 0.4;
    this.parts.legR.root.rotation.x = Math.sin(legPhase + Math.PI) * 0.4;
    
    // Knees (bend backwards only)
    this.parts.legL.lowerGroup.rotation.x = Math.max(0, -Math.sin(legPhase - 1.0) * 0.6);
    this.parts.legR.lowerGroup.rotation.x = Math.max(0, -Math.sin(legPhase + Math.PI - 1.0) * 0.6);
    
    // Arms (slowly paddling or tucked)
    if (scrollT > 0.45) {
      // Tucked arms for descent
      this.parts.armL.root.rotation.x = THREE.MathUtils.lerp(this.parts.armL.root.rotation.x, -0.2, dt*2);
      this.parts.armL.root.rotation.z = THREE.MathUtils.lerp(this.parts.armL.root.rotation.z, -0.1, dt*2);
      this.parts.armR.root.rotation.x = THREE.MathUtils.lerp(this.parts.armR.root.rotation.x, -0.2, dt*2);
      this.parts.armR.root.rotation.z = THREE.MathUtils.lerp(this.parts.armR.root.rotation.z, 0.1, dt*2);
    } else {
      // Slow breaststroke/paddling
      this.parts.armL.root.rotation.x = Math.sin(legPhase * 0.5) * 0.3 - 0.2;
      this.parts.armL.root.rotation.z = Math.cos(legPhase * 0.5) * 0.2 + 0.3;
      
      this.parts.armR.root.rotation.x = Math.sin(legPhase * 0.5) * 0.3 - 0.2;
      this.parts.armR.root.rotation.z = -Math.cos(legPhase * 0.5) * 0.2 - 0.3;
    }
    
    // Head looks slightly up/forward
    this.parts.head.rotation.x = 0.2 + Math.sin(t) * 0.05;
  }
}
