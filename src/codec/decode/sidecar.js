/**
 * Decode colmap4d time sidecars into Maps.
 *
 * colmap4d adds three optional sidecar files to a standard COLMAP model:
 *   times      — per-image timestamp      (times.txt / times.bin)
 *   points_t   — per-point timestamp      (points_t.txt / points_t.bin)   PARTIAL map
 *   time_meta  — time-axis semantics      (time_meta.json)
 *
 * Timestamps are int64 nanoseconds → kept as BigInt. Keys match the base-model Maps:
 * image ids are Number (like decodeImages*), point3D ids are BigInt (like decodePoints3D*).
 * Duplicate ids resolve last-wins (colmap4d spec §I.D); Map.set gives that for free.
 * Binary layout (little-endian, count-prefixed), matching colmap4d's reference writer:
 *   times.bin    : u64 count, then [u32 image_id, i64 t_ns]
 *   points_t.bin : u64 count, then [u64 point3d_id, i64 t_ns]
 */

import { createBinaryReader } from '../io/binary.js';
import { tokenizeLine, skipCommentOrBlank } from '../lib/textHelpers.js';

/** times.txt → Map<imageId:number, t_ns:BigInt> */
export function decodeTimesFromString(txt) {
  const out = new Map();
  for (const line of (txt ?? '').split('\n')) {
    if (skipCommentOrBlank(line)) continue;
    const parts = tokenizeLine(line);
    if (parts.length < 2) continue;
    out.set(parseInt(parts[0], 10), BigInt(parts[1]));
  }
  return out;
}

/** times.bin → Map<imageId:number, t_ns:BigInt> */
export function decodeTimesFromBuffer(buffer) {
  const r = createBinaryReader(buffer);
  const out = new Map();
  const n = r.u64Num();
  for (let i = 0; i < n; i++) {
    const imageId = r.u32();
    out.set(imageId, r.i64());
  }
  return out;
}

/** points_t.txt → Map<point3DId:BigInt, t_ns:BigInt> (partial: absent point = temporally-unbounded) */
export function decodePointsTFromString(txt) {
  const out = new Map();
  for (const line of (txt ?? '').split('\n')) {
    if (skipCommentOrBlank(line)) continue;
    const parts = tokenizeLine(line);
    if (parts.length < 2) continue;
    out.set(BigInt(parts[0]), BigInt(parts[1]));
  }
  return out;
}

/** points_t.bin → Map<point3DId:BigInt, t_ns:BigInt> */
export function decodePointsTFromBuffer(buffer) {
  const r = createBinaryReader(buffer);
  const out = new Map();
  const n = r.u64Num();
  for (let i = 0; i < n; i++) {
    const point3DId = r.u64();
    out.set(point3DId, r.i64());
  }
  return out;
}

/** time_meta.json → object (or null on empty/invalid) */
export function decodeTimeMetaFromString(txt) {
  if (!txt || !txt.trim()) return null;
  try {
    return JSON.parse(txt);
  } catch (err) {
    console.warn('Parse time_meta.json failed:', err);
    return null;
  }
}
