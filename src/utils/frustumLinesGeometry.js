/**
 * Frustum line geometry: frustums + options → positions/colors for LINES.
 */

import {
  getCameraColor,
  VIZ_FRUSTUM_DEFAULT,
  VIZ_FRUSTUM_SELECTED,
  VIZ_FRUSTUM_HOVER,
} from '../components/visualizer/constants';

function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255,
      }
    : null;
}

/** options: cameraScale, selectedImageId, hoveredImageId, matchedImageIds, frustumColorMode,
 *  imageFrameIndexMap, currentTimeNs, sigmaNs, softNs (colmap4d time gating — cameras share the
 *  point cloud's window: sigmaNs = point sigma, softNs = soft-ramp band; selected/hovered/matched
 *  cameras are never gated). */
export function buildFrustumLinesGeometry(frustumsData, options = {}) {
  const {
    cameraScale = 1.0,
    selectedImageId = null,
    hoveredImageId = null,
    matchedImageIds = new Set(),
    frustumColorMode = 'single',
    imageFrameIndexMap = new Map(),
    currentTimeNs = null,
    sigmaNs = Infinity,
    softNs = 0,
  } = options;
  const timeGating = currentTimeNs !== null && Number.isFinite(sigmaNs);

  const positions = [];
  const colors = [];

  if (!frustumsData || frustumsData.length === 0) {
    return { positions: new Float32Array(0), colors: new Float32Array(0) };
  }

  for (const f of frustumsData) {
    const camera = f.camera;
    const image = f.image;
    const position = f.position;
    const quaternion = f.quaternion;

    let baseColorHex;
    if (frustumColorMode === 'byCamera') {
      baseColorHex = getCameraColor(f.cameraIndex);
    } else if (frustumColorMode === 'byRigFrame') {
      const frameIndex = imageFrameIndexMap.get(image.imageId);
      baseColorHex = frameIndex !== undefined ? getCameraColor(frameIndex) : VIZ_FRUSTUM_DEFAULT;
    } else {
      baseColorHex = VIZ_FRUSTUM_DEFAULT;
    }

    const baseColorRaw = hexToRgb(baseColorHex);
    if (!baseColorRaw) continue;

    const isSelected = image.imageId === selectedImageId;
    const isHovered = image.imageId === hoveredImageId;
    const isMatched = matchedImageIds.has(image.imageId);

    let finalColor;
    let opacity = 1.0;
    
    if (isSelected) {
      const c = hexToRgb(VIZ_FRUSTUM_SELECTED);
      finalColor = c || baseColorRaw;
      opacity = 1.0;
    } else if (isHovered) {
      const c = hexToRgb(VIZ_FRUSTUM_HOVER);
      finalColor = c || baseColorRaw;
      opacity = 1.0;
    } else if (isMatched) {
      // matched: white, alpha 0.5
      finalColor = { r: 1.0, g: 1.0, b: 1.0 };
      opacity = 0.5;
    } else {
      finalColor = baseColorRaw;
      if (selectedImageId === null) opacity = 0.9;
      else opacity = 0.5;
    }

    // colmap4d time gating: cameras share the point cloud window (sigmaNs). Selected / hovered /
    // matched cameras are NEVER gated (interaction floor). Timeless images (t == null) always show.
    // Soft band [sigmaNs, sigmaNs+softNs] fades opacity to 0 (matches the point soft ramp).
    let timeWeight = 1.0;
    if (timeGating && !isSelected && !isHovered && !isMatched) {
      const t = image.t;
      if (t !== null && t !== undefined) {
        const d = Math.abs(Number(t) - currentTimeNs);
        const outer = sigmaNs + softNs;
        if (d > outer) continue; // fully outside → hide
        if (softNs > 0 && d > sigmaNs) timeWeight = (outer - d) / softNs;
      }
    }

    // matched: white; alpha via shader uniform. others: color * opacity * time weight.
    const r = Math.max(0, Math.min(1, finalColor.r * (isMatched ? 1.0 : opacity) * timeWeight));
    const g = Math.max(0, Math.min(1, finalColor.g * (isMatched ? 1.0 : opacity) * timeWeight));
    const b = Math.max(0, Math.min(1, finalColor.b * (isMatched ? 1.0 : opacity) * timeWeight));

    const focalLength = camera.params[0] || 1;
    const aspectRatio = camera.width / camera.height;
    const far = cameraScale * 1.0;
    const fov = 2 * Math.atan(camera.height / (2 * focalLength));
    const tanHalfFov = Math.tan(fov / 2);
    const farHeight = far * tanHalfFov;
    const farWidth = farHeight * aspectRatio;

    const cameraOrigin = [0, 0, 0];
    const farCorners = [
      [-farWidth, -farHeight, far],
      [farWidth, -farHeight, far],
      [farWidth, farHeight, far],
      [-farWidth, farHeight, far],
    ];

    const transformPoint = (local) => {
      const [x, y, z] = local;
      const qx = quaternion.x, qy = quaternion.y, qz = quaternion.z, qw = quaternion.w;
      const qvx = qw * x + qy * z - qz * y;
      const qvy = qw * y + qz * x - qx * z;
      const qvz = qw * z + qx * y - qy * x;
      const qvw = -qx * x - qy * y - qz * z;
      return [
        qvx * qw + qvw * -qx + qvy * -qz - qvz * -qy + position[0],
        qvy * qw + qvw * -qy + qvz * -qx - qvx * -qz + position[1],
        qvz * qw + qvw * -qz + qvx * -qy - qvy * -qx + position[2],
      ];
    };

    const worldOrigin = transformPoint(cameraOrigin);
    const worldFar = farCorners.map(transformPoint);
    const edges = [
      [worldOrigin, worldFar[0]], [worldOrigin, worldFar[1]], [worldOrigin, worldFar[2]], [worldOrigin, worldFar[3]],
      [worldFar[0], worldFar[1]], [worldFar[1], worldFar[2]], [worldFar[2], worldFar[3]], [worldFar[3], worldFar[0]],
    ];

    for (const [start, end] of edges) {
      positions.push(start[0], start[1], start[2], end[0], end[1], end[2]);
      colors.push(r, g, b, r, g, b);
    }
  }

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
  };
}
