/**
 * Encode in-memory entities to COLMAP text format (compatible with official format).
 * Uses generators to emit lines and concatenate; header comments are defined here.
 */

import { iterById, floatForExport } from '../lib/textHelpers.js';
import { MODEL_ID_TO_NAME, INVALID_POINT3D } from '../schema/colmap.js';

const HEADERS = {
  cameras: ['# Cameras: one row per entry. Fields: CAMERA_ID MODEL WIDTH HEIGHT PARAMS[]', (n) => `# Total: ${n}`],
  images: [
    '# Images: two lines each. L1: IMAGE_ID QW QX QY QZ TX TY TZ CAMERA_ID NAME',
    '# L2: keypoints as X Y POINT3D_ID triplets (-1 = unmatched)',
    (n, m) => `# Count: ${n}, avg matched per image: ${m}`,
  ],
  points3D: [
    '# Points3D: one row per point. Columns: POINT3D_ID X Y Z R G B ERROR TRACK(IMAGE_ID POINT2D_IDX pairs)',
    (n, m) => `# Count: ${n}, avg track length: ${m}`,
  ],
  rigs: ['# Rigs: RIG_ID NUM_SENSORS REF_SENSOR_TYPE REF_SENSOR_ID, then sensor rows', '# Sensor: TYPE ID HAS_POSE [optional qw qx qy qz tx ty tz]', (n) => `# Total rigs: ${n}`],
  frames: ['# Frames: FRAME_ID RIG_ID pose(7) NUM_DATA_IDS, then SENSOR_TYPE SENSOR_ID DATA_ID rows', (n) => `# Total frames: ${n}`],
};

function point3DIdForText(id) {
  return id === INVALID_POINT3D ? '-1' : String(id);
}

function* emitCameraLines(data) {
  const [h1, h2] = HEADERS.cameras;
  yield h1;
  yield h2(data.size);
  for (const [, c] of iterById(data)) {
    const name = MODEL_ID_TO_NAME[c.modelId] ?? 'UNKNOWN';
    yield `${c.cameraId} ${name} ${c.width} ${c.height} ${c.params.map(floatForExport).join(' ')}`;
  }
}

export function encodeCamerasToText(data) {
  return [...emitCameraLines(data)].join('\n') + '\n';
}

function* emitImageLines(data) {
  let totalMatched = 0;
  for (const img of data.values()) {
    const pts = img.points2D ?? [];
    totalMatched += pts.filter((p) => p.point3DId !== INVALID_POINT3D).length;
  }
  const meanObs = data.size ? (totalMatched / data.size).toFixed(6) : '0';
  yield HEADERS.images[0];
  yield HEADERS.images[1];
  yield HEADERS.images[2](data.size, meanObs);
  for (const [, img] of iterById(data)) {
    const [qw, qx, qy, qz] = img.qvec;
    const [tx, ty, tz] = img.tvec;
    const row1 = [img.imageId, ...[qw, qx, qy, qz, tx, ty, tz].map(floatForExport), img.cameraId, img.name].join(' ');
    yield row1;
    const pts = img.points2D ?? [];
    const row2 = pts
      .map((p) => `${floatForExport(p.xy[0])} ${floatForExport(p.xy[1])} ${point3DIdForText(p.point3DId)}`)
      .join(' ');
    yield row2;
  }
}

export function encodeImagesToText(data) {
  return [...emitImageLines(data)].join('\n') + '\n';
}

function* emitPoints3DLines(data) {
  let totalTrack = 0;
  for (const p of data.values()) totalTrack += p.track.length;
  const meanTrack = data.size ? (totalTrack / data.size).toFixed(6) : '0';
  yield HEADERS.points3D[0];
  yield HEADERS.points3D[1](data.size, meanTrack);
  for (const [, p] of iterById(data)) {
    const xyzStr = p.xyz.map(floatForExport).join(' ');
    const trackStr = p.track.map((t) => `${t.imageId} ${t.point2DIdx}`).join(' ');
    yield `${p.point3DId} ${xyzStr} ${p.rgb.join(' ')} ${floatForExport(p.error)} ${trackStr}`;
  }
}

export function encodePoints3DToText(data) {
  return [...emitPoints3DLines(data)].join('\n') + '\n';
}

function* emitRigLines(data) {
  yield HEADERS.rigs[0];
  yield HEADERS.rigs[1];
  yield HEADERS.rigs[2](data.size);
  for (const [, rig] of iterById(data)) {
    const ref = rig.refSensorId ?? { type: 0, id: 0 };
    yield `${rig.rigId} ${rig.sensors.length} ${ref.type} ${ref.id}`;
    for (let j = 1; j < rig.sensors.length; j++) {
      const s = rig.sensors[j];
      const poseStr =
        s.hasPose && s.pose
          ? [s.pose.qvec, s.pose.tvec].flat().map(floatForExport).join(' ')
          : '';
      yield poseStr ? `${s.sensorId.type} ${s.sensorId.id} 1 ${poseStr}` : `${s.sensorId.type} ${s.sensorId.id} 0`;
    }
  }
}

export function encodeRigsToText(data) {
  return [...emitRigLines(data)].join('\n') + '\n';
}

function* emitFrameLines(data) {
  yield HEADERS.frames[0];
  yield HEADERS.frames[1](data.size);
  for (const [, f] of iterById(data)) {
    const poseStr = [...f.rigFromWorld.qvec, ...f.rigFromWorld.tvec].map(floatForExport).join(' ');
    yield `${f.frameId} ${f.rigId} ${poseStr} ${f.dataIds.length}`;
    for (const d of f.dataIds) yield `${d.sensorId.type} ${d.sensorId.id} ${d.dataId}`;
  }
}

export function encodeFramesToText(data) {
  return [...emitFrameLines(data)].join('\n') + '\n';
}
