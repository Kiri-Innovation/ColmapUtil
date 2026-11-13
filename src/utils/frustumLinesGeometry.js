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

/** Numeric identity of a camera, ignoring CAMERA_ID. Model, size, and params must all match. */
export function cameraIntrinsicsKey(camera) {
  if (!camera) return 'missing';
  const params = Array.isArray(camera.params) ? camera.params : [];
  const paramKey = params.map((p) => (typeof p === 'number' && Number.isFinite(p) ? String(p) : 'nan')).join(',');
  return `${camera.modelId ?? ''}|${camera.width ?? ''}|${camera.height ?? ''}|${paramKey}`;
}

/**
 * Stable dataset identity written by the multi-dataset merge.
 *
 * `datasetIndex` is authoritative: image names are user data and may not contain the
 * synthetic `entryId/` prefix (or may later be normalized by another loading path).
 * Keep the name prefix only as a compatibility fallback for older frustum objects.
 */
export function frustumDatasetKey(frustum) {
  const datasetIndex = frustum?.datasetIndex;
  if (datasetIndex !== null && datasetIndex !== undefined) {
    return String(datasetIndex);
  }

  const name = String(frustum?.image?.name ?? '');
  const slash = name.indexOf('/');
  if (slash > 0) return name.slice(0, slash);
  return '0';
}

/**
 * Palette index for each frustum. Same key shares a color.
 * divideByDataset appends the dataset key, so identical intrinsics in two datasets differ.
 * First-seen key gets index 0.
 */
export function assignIntrinsicsColorIndices(frustumsData, divideByDataset) {
  const keyToIndex = new Map();
  let next = 0;
  const indices = new Array(frustumsData?.length ?? 0);
  for (let i = 0; i < indices.length; i++) {
    const frustum = frustumsData[i];
    const intrinsics = cameraIntrinsicsKey(frustum?.camera);
    const key = divideByDataset
      ? `${frustumDatasetKey(frustum)}|${intrinsics}`
      : intrinsics;
    let index = keyToIndex.get(key);
    if (index === undefined) {
      index = next++;
      keyToIndex.set(key, index);
    }
    indices[i] = index;
  }
  return indices;
}

/** options: cameraScale, selectedImageId, hoveredImageId, matchedImageIds, frustumColorMode,
 *  imageFrameIndexMap, divideByDataset, currentTimeNs, sigmaNs, softNs (colmap4d time gating —
 *  cameras share the point cloud's window: sigmaNs = point sigma, softNs = soft-ramp band;
 *  selected/hovered/matched cameras are never gated). By-camera colors use intrinsics, not CAMERA_ID.
 *  divideByDataset gives each dataset its own copy of those intrinsics colors. */
export function buildFrustumLinesGeometry(frustumsData, options = {}) {
  const {
    cameraScale = 1.0,
    selectedImageId = null,
    hoveredImageId = null,
    matchedImageIds = new Set(),
    frustumColorMode = 'single',
    imageFrameIndexMap = new Map(),
    divideByDataset = true,
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

  // The dataset checkbox is independent of the Cameras color-mode menu.
  // Single mode used to ignore it and paint every cone #ff0000.
  const useIntrinsicsPalette = divideByDataset || frustumColorMode === 'byCamera';
  const intrinsicsColorIndex = useIntrinsicsPalette
    ? assignIntrinsicsColorIndices(frustumsData, divideByDataset)
    : null;

  for (let frustumIdx = 0; frustumIdx < frustumsData.length; frustumIdx++) {
    const f = frustumsData[frustumIdx];
    const camera = f.camera;
    const image = f.image;
    const position = f.position;
    const quaternion = f.quaternion;

    let baseColorHex;
    if (useIntrinsicsPalette) {
      baseColorHex = getCameraColor(intrinsicsColorIndex[frustumIdx]);
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
