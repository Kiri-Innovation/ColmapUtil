/**
 * Export entry: build COLMAP archive ZIP and trigger download.
 * Implementation delegated to export/archive.js and encode/*.
 */

import { buildColmapArchive as buildArchive, saveColmapAsZip as saveZip } from './archive.js';
import * as encodeText from '../encode/text.js';
import * as encodeBinary from '../encode/binary.js';

export const buildColmapArchive = buildArchive;
export const saveColmapAsZip = saveZip;

export function encodeCamerasToText(data) {
  return encodeText.encodeCamerasToText(data);
}
export function encodeImagesToText(data) {
  return encodeText.encodeImagesToText(data);
}
export function encodePointCloudToText(data) {
  return encodeText.encodePoints3DToText(data);
}
export function encodeCamerasToBinary(data) {
  return encodeBinary.encodeCamerasToBuffer(data);
}
export function encodeImagesToBinary(data) {
  return encodeBinary.encodeImagesToBuffer(data);
}
export function encodePointCloudToBinary(data) {
  return encodeBinary.encodePoints3DToBuffer(data);
}
export function encodeRigsToText(data) {
  return encodeText.encodeRigsToText(data);
}
export function encodeRigsToBinary(data) {
  return encodeBinary.encodeRigsToBuffer(data);
}
export function encodeFramesToText(data) {
  return encodeText.encodeFramesToText(data);
}
export function encodeFramesToBinary(data) {
  return encodeBinary.encodeFramesToBuffer(data);
}
