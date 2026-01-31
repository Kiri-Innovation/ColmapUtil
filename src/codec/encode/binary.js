/**
 * Encode in-memory entities to COLMAP binary buffers.
 * Entry points: encodeCamerasToBuffer / encodeImagesToBuffer / encodePoints3DToBuffer / encodeRigsToBuffer / encodeFramesToBuffer.
 */

import { createBinaryWriter } from '../io/binary.js';
import { iterById } from '../lib/textHelpers.js';
import { MODEL_ID_TO_NAME, INVALID_POINT3D } from '../schema/colmap.js';

const BIN_INVALID_POINT3D = BigInt('18446744073709551615');

function point3DIdForBin(id) {
  return id === INVALID_POINT3D ? BIN_INVALID_POINT3D : id;
}

export function encodeCamerasToBuffer(data) {
  const w = createBinaryWriter();
  w.u64(data.size);
  for (const [, c] of iterById(data)) {
    w.u32(c.cameraId);
    w.i32(c.modelId);
    w.u64(c.width);
    w.u64(c.height);
    for (const v of c.params) w.f64(v);
  }
  return w.build();
}

export function encodeImagesToBuffer(data) {
  const w = createBinaryWriter();
  w.u64(data.size);
  for (const [, img] of iterById(data)) {
    w.u32(img.imageId);
    img.qvec.forEach((v) => w.f64(v));
    img.tvec.forEach((v) => w.f64(v));
    w.u32(img.cameraId);
    w.cstr(img.name);
    const pts = img.points2D ?? [];
    w.u64(pts.length);
    for (const p of pts) {
      w.f64(p.xy[0]);
      w.f64(p.xy[1]);
      w.u64(point3DIdForBin(p.point3DId));
    }
  }
  return w.build();
}

export function encodePoints3DToBuffer(data) {
  const w = createBinaryWriter();
  w.u64(data.size);
  for (const [, p] of iterById(data)) {
    w.u64(p.point3DId);
    p.xyz.forEach((v) => w.f64(v));
    p.rgb.forEach((v) => w.u8(v));
    w.f64(p.error);
    w.u64(p.track.length);
    for (const t of p.track) {
      w.u32(t.imageId);
      w.u32(t.point2DIdx);
    }
  }
  return w.build();
}

export function encodeRigsToBuffer(data) {
  const w = createBinaryWriter();
  w.u64(data.size);
  for (const [, rig] of iterById(data)) {
    w.u32(rig.rigId);
    w.u32(rig.sensors.length);
    if (rig.sensors.length) {
      const ref = rig.refSensorId ?? { type: 0, id: 0 };
      w.i32(ref.type);
      w.u32(ref.id);
      for (let j = 1; j < rig.sensors.length; j++) {
        const s = rig.sensors[j];
        w.i32(s.sensorId.type);
        w.u32(s.sensorId.id);
        w.u8(s.hasPose ? 1 : 0);
        if (s.hasPose && s.pose) {
          s.pose.qvec.forEach((v) => w.f64(v));
          s.pose.tvec.forEach((v) => w.f64(v));
        }
      }
    }
  }
  return w.build();
}

export function encodeFramesToBuffer(data) {
  const w = createBinaryWriter();
  w.u64(data.size);
  for (const [, f] of iterById(data)) {
    w.u32(f.frameId);
    w.u32(f.rigId);
    f.rigFromWorld.qvec.forEach((v) => w.f64(v));
    f.rigFromWorld.tvec.forEach((v) => w.f64(v));
    w.u32(f.dataIds.length);
    for (const d of f.dataIds) {
      w.i32(d.sensorId.type);
      w.u32(d.sensorId.id);
      w.u64(d.dataId);
    }
  }
  return w.build();
}
