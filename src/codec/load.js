/**
 * COLMAP parsing unified entry.
 * Exposes parse*Binary / parse*Text names for compatibility; delegates to decode/binary and decode/text.
 */

import * as decodeBinary from './decode/binary.js';
import * as decodeSidecar from './decode/sidecar.js';
import * as decodeText from './decode/text.js';

export const parseCamerasBinary = decodeBinary.decodeCamerasFromBuffer;
export const parseCamerasText = decodeText.decodeCamerasFromString;
export const parseImagesBinary = (buf, omitKeypoints) => decodeBinary.decodeImagesFromBuffer(buf, { skipKeypoints: omitKeypoints });
export const parseImagesText = decodeText.decodeImagesFromString;
export const parsePoints3DBinary = decodeBinary.decodePoints3DFromBuffer;
export const parsePoints3DText = decodeText.decodePoints3DFromString;
export const parseRigsBinary = decodeBinary.decodeRigsFromBuffer;
export const parseRigsText = decodeText.decodeRigsFromString;
export const parseFramesBinary = decodeBinary.decodeFramesFromBuffer;
export const parseFramesText = decodeText.decodeFramesFromString;

export const decodeCamerasFromBinary = parseCamerasBinary;
export const decodeCamerasFromText = parseCamerasText;
export const decodeImagesFromBinary = parseImagesBinary;
export const decodeImagesFromText = parseImagesText;
export const decodePointCloudFromBinary = parsePoints3DBinary;
export const decodePointCloudFromText = parsePoints3DText;
export const decodeRigsFromBinary = parseRigsBinary;
export const decodeRigsFromText = parseRigsText;
export const decodeFramesFromBinary = parseFramesBinary;
export const decodeFramesFromText = parseFramesText;

// colmap4d time sidecars
export const parseTimesBinary = decodeSidecar.decodeTimesFromBuffer;
export const parseTimesText = decodeSidecar.decodeTimesFromString;
export const parsePointsTBinary = decodeSidecar.decodePointsTFromBuffer;
export const parsePointsTText = decodeSidecar.decodePointsTFromString;
export const parseTimeMetaText = decodeSidecar.decodeTimeMetaFromString;
