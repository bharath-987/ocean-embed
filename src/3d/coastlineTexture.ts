import * as THREE from 'three';

interface Bounds {
  west: number;
  east: number;
  south: number;
  north: number;
}

// Domain bounds for North Indian Ocean (Arabian Sea + Bay of Bengal)
export const DOMAIN_BOUNDS: Bounds = {
  west: 45.0,
  east: 105.0,
  south: 5.0,
  north: 30.0,
};

/**
 * Generates a high-resolution land/ocean mask texture for the domain
 * 45°E–105°E, 5°N–30°N using Natural Earth 50m coastline rings.
 * Returns:
 * - Red channel / Alpha = 1.0 (white): Ocean water
 * - Red channel / Alpha = 0.0 (black): Continental land masses
 * - Green channel = Coastline shoreline proximity edge
 */
export function createRegionalLandMaskTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas);
    return fallback;
  }

  const w = canvas.width;
  const h = canvas.height;
  const minLon = DOMAIN_BOUNDS.west;
  const maxLon = DOMAIN_BOUNDS.east;
  const minLat = DOMAIN_BOUNDS.south;
  const maxLat = DOMAIN_BOUNDS.north;
  const lonSpan = maxLon - minLon;
  const latSpan = maxLat - minLat;

  // 1. Fill entire domain with white (ocean = 1.0)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  // 2. Fetch rings from global Coastline or fallback
  const rings: Array<{ b: number[]; p: number[][] }> =
    (typeof window !== 'undefined' && (window as any).Coastline?.COASTLINE_RINGS) ||
    (typeof window !== 'undefined' && (window as any).COASTLINE_RINGS) ||
    [];

  if (rings.length > 0) {
    // Fill continental landmasses with black (land = 0.0)
    ctx.fillStyle = '#000000';

    for (let i = 0; i < rings.length; i++) {
      const pts = rings[i].p;
      if (pts.length < 3) continue;

      ctx.beginPath();
      // Canvas y=0 corresponds to maxLat (30°N), y=h corresponds to minLat (5°N)
      // Three.js default flipY=true maps UV v=0 (5°N) to canvas bottom and v=1 (30°N) to canvas top
      const x0 = ((pts[0][0] - minLon) / lonSpan) * (w - 1);
      const y0 = ((maxLat - pts[0][1]) / latSpan) * (h - 1);
      ctx.moveTo(x0, y0);

      for (let j = 1; j < pts.length; j++) {
        const x = ((pts[j][0] - minLon) / lonSpan) * (w - 1);
        const y = ((maxLat - pts[j][1]) / latSpan) * (h - 1);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Trace coastline contour in green channel (mask.g) for crisp shoreline rendering
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.9)';
    ctx.lineWidth = 2.0;
    for (let i = 0; i < rings.length; i++) {
      const pts = rings[i].p;
      if (pts.length < 3) continue;

      ctx.beginPath();
      const x0 = ((pts[0][0] - minLon) / lonSpan) * (w - 1);
      const y0 = ((maxLat - pts[0][1]) / latSpan) * (h - 1);
      ctx.moveTo(x0, y0);

      for (let j = 1; j < pts.length; j++) {
        const x = ((pts[j][0] - minLon) / lonSpan) * (w - 1);
        const y = ((maxLat - pts[j][1]) / latSpan) * (h - 1);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  } else {
    // Fallback: draw basic schematic subcontinent peninsula if rings are not yet ready
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    // India V-shape: Gujarat -> Cape Comorin -> Bengal
    const xGuj = ((68.0 - minLon) / lonSpan) * w;
    const yGuj = ((maxLat - 23.5) / latSpan) * h;
    const xCap = ((77.5 - minLon) / lonSpan) * w;
    const yCap = ((maxLat - 8.0) / latSpan) * h;
    const xBen = ((89.0 - minLon) / lonSpan) * w;
    const yBen = ((maxLat - 22.0) / latSpan) * h;
    const xN = ((77.5 - minLon) / lonSpan) * w;
    const yN = 0;

    ctx.moveTo(xGuj, yGuj);
    ctx.lineTo(xCap, yCap);
    ctx.lineTo(xBen, yBen);
    ctx.lineTo(xN, yN);
    ctx.closePath();
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
