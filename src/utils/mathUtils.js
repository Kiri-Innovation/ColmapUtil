/**
 * Stats: percentile (nearest-rank), median.
 */

/** Percentile of sorted ascending array (nearest-rank). Returns 0 if empty. */
export function computePercentile(data, percentile) {
  if (data.length === 0) return 0;
  if (data.length === 1) return data[0];
  const rank = Math.ceil((percentile / 100) * data.length);
  const index = Math.min(rank - 1, data.length - 1);
  return data[index];
}

/** Median; odd: middle, even: mean of two middle. Returns 0 if empty. */
export function computeMedian(values) {
  if (values.length === 0) return 0;
  const arr = [...values].sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  if (arr.length % 2 === 1) return arr[mid];
  return (arr[mid - 1] + arr[mid]) / 2;
}
