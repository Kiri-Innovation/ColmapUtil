/**
 * Decode COLMAP binary buffers into entities.
 * Entry points: decodeCamerasFromBuffer / decodeImagesFromBuffer / decodePoints3DFromBuffer / decodeRigsFromBuffer / decodeFramesFromBuffer.
 */

import { createBinaryReader } from '../io/binary.js';
import { PARAM_COUNT_BY_MODEL, MODEL_NAME_TO_ID } from '../schema/colmap.js';

const POINT2D_RECORD_BYTES = 24;

export function decodeCamerasFromBuffer(buffer) {
  const r = createBinaryReader(buffer);
  const out = new Map();
  const n = r.u64Num();
  for (let i = 0; i < n; i++) {
    const cameraId = r.u32();
    const modelId = r.i32();
    const width = r.u64Num();
    const height = r.u64Num();
    const numParams = PARAM_COUNT_BY_MODEL[modelId] ?? 0;
    const params = [];
    for (let k = 0; k < numParams; k++) params.push(r.f64());
    out.set(cameraId, { cameraId, modelId, width, height, params });
  }
  return out;
}

export function decodeImagesFromBuffer(buffer, opts = {}) {
  const skipKeypoints = !!opts.skipKeypoints;
  const r = createBinaryReader(buffer);
  const out = new Map();
  const n = r.u64Num();
  for (let i = 0; i < n; i++) {
    const imageId = r.u32();
    const qvec = [r.f64(), r.f64(), r.f64(), r.f64()];
    const tvec = [r.f64(), r.f64(), r.f64()];
    const cameraId = r.u32();
    const name = r.cstr();
    const numPts = r.u64Num();
    let points2D = [];
    if (skipKeypoints) {
      r.consume(numPts * POINT2D_RECORD_BYTES);
    } else {
      for (let j = 0; j < numPts; j++) {
        points2D.push({
          xy: [r.f64(), r.f64()],
          point3DId: r.i64(),
        });
      }
    }
    out.set(imageId, {
      imageId,
      qvec,
      tvec,
      cameraId,
      name,
      points2D,
      numPoints2D: points2D.length,
    });
  }
  return out;
}

export function decodePoints3DFromBuffer(buffer) {
  const r = createBinaryReader(buffer);
  const out = new Map();
  const n = r.u64Num();
  for (let i = 0; i < n; i++) {
    const point3DId = r.u64();
    const xyz = [r.f64(), r.f64(), r.f64()];
    const rgb = [r.u8(), r.u8(), r.u8()];
    const error = r.f64();
    const trackLen = r.u64Num();
    const track = [];
    for (let j = 0; j < trackLen; j++) {
      track.push({ imageId: r.u32(), point2DIdx: r.u32() });
    }
    out.set(point3DId, { point3DId, xyz, rgb, error, track });
  }
  return out;
}

export function decodeRigsFromBuffer(buffer) {
  const r = createBinaryReader(buffer);
  const out = new Map();
  const n = r.u64Num();
  for (let i = 0; i < n; i++) {
    const rigId = r.u32();
    const numSensors = r.u32();
    const sensors = [];
    let refSensorId = null;
    if (numSensors > 0) {
      refSensorId = { type: r.i32(), id: r.u32() };
      sensors.push({ sensorId: refSensorId, hasPose: false });
      for (let j = 1; j < numSensors; j++) {
        const sensorId = { type: r.i32(), id: r.u32() };
        const hasPose = r.u8() !== 0;
        const entry = { sensorId, hasPose };
        if (hasPose) {
          entry.pose = {
            qvec: [r.f64(), r.f64(), r.f64(), r.f64()],
            tvec: [r.f64(), r.f64(), r.f64()],
          };
        }
        sensors.push(entry);
      }
    }
    out.set(rigId, { rigId, refSensorId, sensors });
  }
  return out;
}

export function decodeFramesFromBuffer(buffer) {
  const r = createBinaryReader(buffer);
  const out = new Map();
  const n = r.u64Num();
  for (let i = 0; i < n; i++) {
    const frameId = r.u32();
    const rigId = r.u32();
    const rigFromWorld = {
      qvec: [r.f64(), r.f64(), r.f64(), r.f64()],
      tvec: [r.f64(), r.f64(), r.f64()],
    };
    const numData = r.u32();
    const dataIds = [];
    for (let j = 0; j < numData; j++) {
      dataIds.push({
        sensorId: { type: r.i32(), id: r.u32() },
        dataId: r.u64Num(),
      });
    }
    out.set(frameId, { frameId, rigId, rigFromWorld, dataIds });
  }
  return out;
}
