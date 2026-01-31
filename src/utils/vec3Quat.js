/**
 * Vector3 / Quaternion / Euler / Matrix4 (pure JS, no Three.js). For COLMAP pose and Sim3D.
 */

export function quatIdentity() {
  return { x: 0, y: 0, z: 0, w: 1 };
}

export function quatClone(q) {
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

/** Quaternion multiply q1 * q2. */
export function quatMultiply(q1, q2) {
  return {
    w: q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z,
    x: q1.w * q2.x + q1.x * q2.w + q1.y * q2.z - q1.z * q2.y,
    y: q1.w * q2.y - q1.x * q2.z + q1.y * q2.w + q1.z * q2.x,
    z: q1.w * q2.z + q1.x * q2.y - q1.y * q2.x + q1.z * q2.w,
  };
}

/** Inverse of unit quat = conjugate. */
export function quatInvert(q) {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

export function quatLengthSq(q) {
  return q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w;
}

export function quatNormalize(q) {
  const len = Math.sqrt(quatLengthSq(q));
  if (len < 1e-10) return quatClone(q);
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

/** Euler (rad) XYZ order → Quaternion (matches Three.js 'XYZ'). */
export function quatFromEuler(rotationX, rotationY, rotationZ) {
  const cx = Math.cos(rotationX / 2), sx = Math.sin(rotationX / 2);
  const cy = Math.cos(rotationY / 2), sy = Math.sin(rotationY / 2);
  const cz = Math.cos(rotationZ / 2), sz = Math.sin(rotationZ / 2);
  return quatNormalize({
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz,
  });
}

/** Quaternion → Euler XYZ (rad). Matches Three.js 'XYZ'. */
export function eulerFromQuat(q) {
  const { x, y, z, w } = q;
  const siny = 2 * (w * y - z * x);
  return {
    x: Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)),
    y: Math.abs(siny) >= 1 ? Math.sign(siny) * Math.PI / 2 : Math.asin(siny),
    z: Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)),
  };
}

export function vec3Create(x, y, z) {
  return { x: Number(x) || 0, y: Number(y) || 0, z: Number(z) || 0 };
}

export function vec3Clone(v) {
  return { x: v.x, y: v.y, z: v.z };
}

export function vec3Add(v, w) {
  return { x: v.x + w.x, y: v.y + w.y, z: v.z + w.z };
}

export function vec3MultiplyScalar(v, s) {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function vec3Negate(v) {
  return { x: -v.x, y: -v.y, z: -v.z };
}

/** Rotate vector by quaternion: v' = q * [0,v] * q^-1. */
export function vec3ApplyQuaternion(v, q) {
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  const vx = v.x, vy = v.y, vz = v.z;
  const ix = qw * vx + qy * vz - qz * vy;
  const iy = qw * vy + qz * vx - qx * vz;
  const iz = qw * vz + qx * vy - qy * vx;
  const iw = -qx * vx - qy * vy - qz * vz;
  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  };
}

/** Build 4x4 matrix from T, R (quat), S. Column-major, 16 elements (WebGL). */
export function matrix4Compose(translation, rotation, scale) {
  const qx = rotation.x, qy = rotation.y, qz = rotation.z, qw = rotation.w;
  const sx = scale.x, sy = scale.y, sz = scale.z;
  const m = new Float32Array(16);
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  m[0] = (1 - (yy + zz)) * sx;
  m[1] = (xy + wz) * sx;
  m[2] = (xz - wy) * sx;
  m[3] = 0;
  m[4] = (xy - wz) * sy;
  m[5] = (1 - (xx + zz)) * sy;
  m[6] = (yz + wx) * sy;
  m[7] = 0;
  m[8] = (xz + wy) * sz;
  m[9] = (yz - wx) * sz;
  m[10] = (1 - (xx + yy)) * sz;
  m[11] = 0;
  m[12] = translation.x;
  m[13] = translation.y;
  m[14] = translation.z;
  m[15] = 1;
  return m;
}
