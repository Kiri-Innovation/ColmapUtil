/**
 * COLMAP pose → camera world coordinates. COLMAP stores world-to-camera (qvec, tvec); here we convert to camera-to-world for rendering.
 */

import { quatInvert, vec3Create, vec3Negate, vec3ApplyQuaternion } from './vec3Quat.js';

function poseQuatToCameraWorld(qvec) {
  const q = { x: qvec[1], y: qvec[2], z: qvec[3], w: qvec[0] };
  return quatInvert(q);
}

function tvecToCameraWorldPosition(tvec, worldQuat) {
  const t = vec3Create(tvec[0], tvec[1], tvec[2]);
  return vec3ApplyQuaternion(vec3Negate(t), worldQuat);
}

/** Get camera world quaternion from COLMAP pose. */
export function cameraWorldQuatFromPose(image) {
  return poseQuatToCameraWorld(image.qvec);
}

/** Get camera world position from COLMAP pose. */
export function cameraWorldPositionFromPose(image) {
  const worldQuat = poseQuatToCameraWorld(image.qvec);
  return tvecToCameraWorldPosition(image.tvec, worldQuat);
}

/** Get camera world position and quaternion from COLMAP pose. */
export function cameraWorldPoseFromPose(image) {
  const worldQuat = poseQuatToCameraWorld(image.qvec);
  const position = tvecToCameraWorldPosition(image.tvec, worldQuat);
  return { position, quaternion: worldQuat };
}
