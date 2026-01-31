/**
 * Decode COLMAP text into entities.
 * Entry points: decodeCamerasFromString / decodeImagesFromString / decodePoints3DFromString / decodeRigsFromString / decodeFramesFromString.
 */

import { tokenizeLine, skipCommentOrBlank } from '../lib/textHelpers.js';
import { MODEL_NAME_TO_ID } from '../schema/colmap.js';

export function decodeCamerasFromString(txt) {
  const out = new Map();
  for (const line of txt.split('\n')) {
    if (skipCommentOrBlank(line)) continue;
    const parts = tokenizeLine(line);
    if (parts.length < 4) continue;
    const modelId = MODEL_NAME_TO_ID[parts[1]];
    if (modelId === undefined) {
      console.warn(`Unknown camera model: ${parts[1]}`);
      continue;
    }
    const cameraId = parseInt(parts[0], 10);
    out.set(cameraId, {
      cameraId,
      modelId,
      width: parseInt(parts[2], 10),
      height: parseInt(parts[3], 10),
      params: parts.slice(4).map(parseFloat),
    });
  }
  return out;
}

export function decodeImagesFromString(txt) {
  const out = new Map();
  const lines = txt.split('\n');
  let idx = 0;
  while (idx < lines.length) {
    const line = lines[idx++];
    if (skipCommentOrBlank(line)) continue;
    const parts = tokenizeLine(line);
    if (parts.length < 10) continue;
    const imageId = parseInt(parts[0], 10);
    let points2D = [];
    if (idx < lines.length && !lines[idx].trim().startsWith('#')) {
      const obsLine = lines[idx].trim();
      idx++;
      if (obsLine) {
        const obsParts = tokenizeLine(obsLine);
        for (let k = 0; k + 2 < obsParts.length; k += 3) {
          points2D.push({
            xy: [parseFloat(obsParts[k]), parseFloat(obsParts[k + 1])],
            point3DId: BigInt(obsParts[k + 2]),
          });
        }
      }
    }
    out.set(imageId, {
      imageId,
      qvec: parts.slice(1, 5).map(parseFloat),
      tvec: parts.slice(5, 8).map(parseFloat),
      cameraId: parseInt(parts[8], 10),
      name: parts[9],
      points2D,
      numPoints2D: points2D.length,
    });
  }
  return out;
}

export function decodePoints3DFromString(txt) {
  const out = new Map();
  for (const line of txt.split('\n')) {
    if (skipCommentOrBlank(line)) continue;
    const parts = tokenizeLine(line);
    if (parts.length < 8) continue;
    const point3DId = BigInt(parts[0]);
    const track = [];
    for (let idx = 8; idx + 1 < parts.length; idx += 2) {
      track.push({
        imageId: parseInt(parts[idx], 10),
        point2DIdx: parseInt(parts[idx + 1], 10),
      });
    }
    out.set(point3DId, {
      point3DId,
      xyz: parts.slice(1, 4).map(parseFloat),
      rgb: parts.slice(4, 7).map((s) => parseInt(s, 10)),
      error: parseFloat(parts[7]),
      track,
    });
  }
  return out;
}

export function decodeRigsFromString(txt) {
  const out = new Map();
  const lines = txt.split('\n');
  let idx = 0;
  while (idx < lines.length) {
    const line = lines[idx++];
    if (skipCommentOrBlank(line)) continue;
    const parts = tokenizeLine(line);
    if (parts.length < 4) continue;
    const rigId = parseInt(parts[0], 10);
    const numSensors = parseInt(parts[1], 10);
    const refSensorId = { type: parseInt(parts[2], 10), id: parseInt(parts[3], 10) };
    const sensors = [{ sensorId: refSensorId, hasPose: false }];
    for (let j = 1; j < numSensors && idx < lines.length; j++) {
      const sensorLine = lines[idx++];
      if (skipCommentOrBlank(sensorLine)) {
        j--;
        continue;
      }
      const sensorParts = tokenizeLine(sensorLine);
      if (sensorParts.length < 3) continue;
      const entry = {
        sensorId: { type: parseInt(sensorParts[0], 10), id: parseInt(sensorParts[1], 10) },
        hasPose: parseInt(sensorParts[2], 10) !== 0,
      };
      if (entry.hasPose && sensorParts.length >= 10) {
        entry.pose = {
          qvec: sensorParts.slice(3, 7).map(parseFloat),
          tvec: sensorParts.slice(7, 10).map(parseFloat),
        };
      }
      sensors.push(entry);
    }
    out.set(rigId, { rigId, refSensorId, sensors });
  }
  return out;
}

export function decodeFramesFromString(txt) {
  const out = new Map();
  const lines = txt.split('\n');
  let idx = 0;
  while (idx < lines.length) {
    const line = lines[idx++];
    if (skipCommentOrBlank(line)) continue;
    const parts = tokenizeLine(line);
    if (parts.length < 10) continue;
    const frameId = parseInt(parts[0], 10);
    const rigId = parseInt(parts[1], 10);
    const rigFromWorld = {
      qvec: parts.slice(2, 6).map(parseFloat),
      tvec: parts.slice(6, 9).map(parseFloat),
    };
    const numData = parseInt(parts[9], 10);
    const dataIds = [];
    for (let j = 0; j < numData && idx < lines.length; j++) {
      const dataLine = lines[idx++];
      if (skipCommentOrBlank(dataLine)) {
        j--;
        continue;
      }
      const dataParts = tokenizeLine(dataLine);
      if (dataParts.length < 3) continue;
      dataIds.push({
        sensorId: { type: parseInt(dataParts[0], 10), id: parseInt(dataParts[1], 10) },
        dataId: parseInt(dataParts[2], 10),
      });
    }
    out.set(frameId, { frameId, rigId, rigFromWorld, dataIds });
  }
  return out;
}
