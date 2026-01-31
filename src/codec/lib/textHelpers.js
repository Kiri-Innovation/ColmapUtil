/** Split line by whitespace (trim then split) */
export function tokenizeLine(s) {
  return (s ?? '').trim().split(/\s+/);
}

/** Whether to skip: empty line or line starting with # */
export function skipCommentOrBlank(s) {
  const t = (s ?? '').trim();
  return t.length === 0 || t[0] === '#';
}

/** Float string for export: high precision, trailing zeros removed, COLMAP text compatible */
export function floatForExport(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0';
  const s = x.toPrecision(17).replace(/\.?0+$/, '');
  return s || '0';
}

/** Iterator over [k,v] entries sorted by key (numeric ascending) */
export function* iterById(map) {
  const arr = Array.from(map.entries());
  arr.sort((ea, eb) => {
    const a = ea[0];
    const b = eb[0];
    return (typeof a === 'bigint' ? Number(a) : a) - (typeof b === 'bigint' ? Number(b) : b);
  });
  yield* arr;
}
