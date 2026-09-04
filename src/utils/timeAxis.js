/**
 * colmap4d time-axis helpers (host/CPU side).
 *
 * Timestamps live on entity objects as `.t` (BigInt ns, or null = temporally-unbounded,
 * or undefined = model has no times sidecar). The scrubber/window are stored as fractions
 * of the model's [minNs, maxNs] range so defaults are dataset-independent; these helpers
 * derive the range and convert fractions to nanoseconds for CPU filtering.
 */

/** Scan a colmapData for its timestamp range. Returns { hasTime, minNs, maxNs } (ns as Number). */
export function computeTimeRange(colmapData) {
  let min = null;
  let max = null;
  let has = false;
  const consider = (t) => {
    if (t === null || t === undefined) return;
    const n = Number(t);
    if (!Number.isFinite(n)) return;
    has = true;
    if (min === null || n < min) min = n;
    if (max === null || n > max) max = n;
  };
  if (colmapData?.images) for (const im of colmapData.images.values()) consider(im.t);
  // Fall back to points only if images carry no time (e.g. points-only timing).
  if (!has && colmapData?.pointCloud) for (const p of colmapData.pointCloud.values()) consider(p.t);
  return { hasTime: has, minNs: min ?? 0, maxNs: max ?? 0 };
}

/**
 * Convert stored fractions + a range into the absolute ns window. Cameras (frustum lines and
 * image planes) share the SAME window as points — pointSigmaNs — so the whole camera
 * representation lives and dies with the point cloud on the time axis. pointSoftNs is the B3
 * soft-ramp band width (0 = hard cutoff).
 */
export function resolveTimeWindow(range, fractions) {
  const span = Math.max(0, (range?.maxNs ?? 0) - (range?.minNs ?? 0));
  return {
    span,
    currentNs: (range?.minNs ?? 0) + (fractions?.posFrac ?? 0) * span,
    pointSigmaNs: (fractions?.sigmaFrac ?? 0) * span,
    pointSoftNs: (fractions?.softFrac ?? 0) * span,
  };
}
