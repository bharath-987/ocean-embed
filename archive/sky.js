import * as THREE from 'three';

export class SkyEnvironment {
  constructor(scene, sunLight) {
    this.scene = scene;
    this.sunLight = sunLight;
    
    // Sky Dome
    const skyGeo = new THREE.SphereGeometry(1000, 32, 15);
    // Render on the inside
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x87CEEB) }, // Sky blue
        bottomColor: { value: new THREE.Color(0xe0f6ff) }, // Horizon haze
        offset: { value: 33 },
        exponent: { value: 0.6 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false
    });

    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyMesh);

    // Simple procedural clouds
    const cloudGeo = new THREE.PlaneGeometry(2000, 2000);
    const cloudMat = new THREE.MeshBasicMaterial({
      map: this.createCloudTexture(),
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    
    this.cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    this.cloudMesh.rotation.x = Math.PI / 2;
    this.cloudMesh.position.y = 200;
    this.scene.add(this.cloudMesh);
  }
  
  createCloudTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Simple noise-based cloud texture approximation
    ctx.fillStyle = 'rgba(255,255,255,0)';
    ctx.fillRect(0, 0, 512, 512);
    
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = Math.random() * 50 + 20;
      
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    
    return new THREE.CanvasTexture(canvas);
  }

  update(scrollT, cameraY) {
    // Hide sky if deep underwater for performance
    if (scrollT > 0.3) {
      this.skyMesh.visible = false;
      this.cloudMesh.visible = false;
    } else {
      this.skyMesh.visible = true;
      this.cloudMesh.visible = true;
      
      // Move sky with camera so we don't clip out of it
      this.skyMesh.position.y = cameraY;
      
      // Clouds drift slowly
      this.cloudMesh.position.x += 0.05;
      this.cloudMesh.position.z += 0.02;
    }
  }
}
