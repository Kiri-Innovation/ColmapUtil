/**
 * Sim3 similarity transform (scale, rotation, translation). Pure JS. Presets via computePreset().
 */

import {
  quatIdentity,
  quatFromEuler,
  quatInvert,
  quatMultiply,
  quatNormalize,
  eulerFromQuat,
  vec3Create,
  vec3Add,
  vec3MultiplyScalar,
  vec3ApplyQuaternion,
  matrix4Compose,
} from './vec3Quat.js';
import { cameraWorldPositionFromPose } from './colmapTransforms.js';
import { computeMedian, computePercentile } from './mathUtils.js';

function makeSim3Identity() {
  return {
    scale: 1,
    rotation: quatIdentity(),
    translation: vec3Create(0, 0, 0),
  };
}

export function sim3TransformPoint(sim3d, xyz) {
  const p = vec3Create(xyz[0], xyz[1], xyz[2]);
  const rotated = vec3ApplyQuaternion(p, sim3d.rotation);
  const scaled = vec3MultiplyScalar(rotated, sim3d.scale);
  const result = vec3Add(scaled, sim3d.translation);
  return [result.x, result.y, result.z];
}

function sim3Inverse(bFromA) {
  const scaleInv = 1 / bFromA.scale;
  const rotationInv = quatInvert(bFromA.rotation);
  const translationInv = vec3ApplyQuaternion(bFromA.translation, rotationInv);
  const translationInvScaled = vec3MultiplyScalar(translationInv, -scaleInv);
  return { scale: scaleInv, rotation: rotationInv, translation: translationInvScaled };
}

export function sim3Compose(cFromB, bFromA) {
  const scale = cFromB.scale * bFromA.scale;
  const rotation = quatNormalize(quatMultiply(cFromB.rotation, bFromA.rotation));
  const t = vec3ApplyQuaternion(bFromA.translation, cFromB.rotation);
  const tScaled = vec3MultiplyScalar(t, cFromB.scale);
  const translation = vec3Add(tScaled, cFromB.translation);
  return { scale, rotation, translation };
}

function applySim3ToCameraPose(newFromOld, qvec, tvec) {
  const camFromWorld = {
    scale: 1,
    rotation: { x: qvec[1], y: qvec[2], z: qvec[3], w: qvec[0] },
    translation: vec3Create(tvec[0], tvec[1], tvec[2]),
  };
  const oldFromNew = sim3Inverse(newFromOld);
  const camFromNew = sim3Compose(camFromWorld, oldFromNew);
  const scaledT = vec3MultiplyScalar(camFromNew.translation, newFromOld.scale);
  return {
    qvec: [camFromNew.rotation.w, camFromNew.rotation.x, camFromNew.rotation.y, camFromNew.rotation.z],
    tvec: [scaledT.x, scaledT.y, scaledT.z],
  };
}

/** Apply Sim3 to data.images and data.pointCloud. */
export function applySim3ToScene(sim3d, data) {
  const transformedImages = new Map();
  for (const [imageId, image] of data.images) {
    const { qvec, tvec } = applySim3ToCameraPose(sim3d, image.qvec, image.tvec);
    transformedImages.set(imageId, { ...image, qvec, tvec });
  }
  const sourcePointCloud = data.pointCloud && data.pointCloud.size > 0 ? data.pointCloud : new Map();
  const transformedPointCloud = new Map();
  for (const [point3DId, point3D] of sourcePointCloud) {
    const xyz = sim3TransformPoint(sim3d, point3D.xyz);
    transformedPointCloud.set(point3DId, { ...point3D, xyz });
  }
  return { ...data, images: transformedImages, pointCloud: transformedPointCloud };
}

function centerSceneAtMedian(data) {
  const positions = [];
  for (const image of data.images.values()) positions.push(cameraWorldPositionFromPose(image));
  if (positions.length === 0) return makeSim3Identity();
  const centerX = computeMedian(positions.map((p) => p.x));
  const centerY = computeMedian(positions.map((p) => p.y));
  const centerZ = computeMedian(positions.map((p) => p.z));
  return {
    scale: 1,
    rotation: quatIdentity(),
    translation: vec3Create(-centerX, -centerY, -centerZ),
  };
}

function fitSceneExtent(data, extent, minPercentile, maxPercentile, useImages) {
  const coordsX = [];
  const coordsY = [];
  const coordsZ = [];
  if (useImages) {
    for (const image of data.images.values()) {
      const pos = cameraWorldPositionFromPose(image);
      coordsX.push(pos.x);
      coordsY.push(pos.y);
      coordsZ.push(pos.z);
    }
  } else if (data.pointCloud) {
    for (const point3D of data.pointCloud.values()) {
      coordsX.push(point3D.xyz[0]);
      coordsY.push(point3D.xyz[1]);
      coordsZ.push(point3D.xyz[2]);
    }
  }
  if (coordsX.length === 0) return makeSim3Identity();
  const sortedX = [...coordsX].sort((a, b) => a - b);
  const sortedY = [...coordsY].sort((a, b) => a - b);
  const sortedZ = [...coordsZ].sort((a, b) => a - b);
  const pLo = minPercentile * 100;
  const pHi = maxPercentile * 100;
  const minX = computePercentile(sortedX, pLo);
  const maxX = computePercentile(sortedX, pHi);
  const minY = computePercentile(sortedY, pLo);
  const maxY = computePercentile(sortedY, pHi);
  const minZ = computePercentile(sortedZ, pLo);
  const maxZ = computePercentile(sortedZ, pHi);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const diagonal = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2 + (maxZ - minZ) ** 2);
  const scale = diagonal > 1e-6 ? extent / diagonal : 1;
  return {
    scale,
    rotation: quatIdentity(),
    translation: vec3Create(-centerX * scale, -centerY * scale, -centerZ * scale),
  };
}

/** Preset: 'identity' | 'center' | 'normalize'. opts for normalize: extent, minPercentile, maxPercentile, useImages. */
export function computePreset(preset, data, opts = {}) {
  if (preset === 'identity' || !data?.images?.size) return makeSim3Identity();
  if (preset === 'center') return centerSceneAtMedian(data);
  if (preset === 'normalize') {
    const { extent = 10, minPercentile = 0.1, maxPercentile = 0.9, useImages = true } = opts;
    return fitSceneExtent(data, extent, minPercentile, maxPercentile, useImages);
  }
  return makeSim3Identity();
}

/** Default Euler params (identity transform). */
export function defaultEulerParams() {
  return {
    scale: 1,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    translationX: 0,
    translationY: 0,
    translationZ: 0,
  };
}

export function sim3FromEuler(euler) {
  const rotation = quatFromEuler(euler.rotationX, euler.rotationY, euler.rotationZ);
  return {
    scale: euler.scale,
    rotation,
    translation: vec3Create(euler.translationX, euler.translationY, euler.translationZ),
  };
}

export function eulerParamsFromSim3(sim3d) {
  const euler = eulerFromQuat(sim3d.rotation);
  return {
    scale: sim3d.scale,
    rotationX: euler.x,
    rotationY: euler.y,
    rotationZ: euler.z,
    translationX: sim3d.translation.x,
    translationY: sim3d.translation.y,
    translationZ: sim3d.translation.z,
  };
}

/** Translate scene center to origin (median of camera positions). */
export { centerSceneAtMedian };
/** Scale scene to extent (default params). */
export const fitSceneExtentWithDefaults = (data, extent = 10, minPercentile = 0.1, maxPercentile = 0.9, useImages = true) =>
  fitSceneExtent(data, extent, minPercentile, maxPercentile, useImages);

/** Column-major 4x4 Float32Array (16 elements). */
export function sim3ToMatrix4(sim3d) {
  const scaleVec = vec3Create(sim3d.scale, sim3d.scale, sim3d.scale);
  return matrix4Compose(sim3d.translation, sim3d.rotation, scaleVec);
}
