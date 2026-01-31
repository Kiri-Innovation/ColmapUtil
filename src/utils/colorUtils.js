/**
 * Color: HSL↔Hex, sRGB→linear, RGB interpolation (for 3D rendering).
 */

import {
  SRGB_THRESHOLD,
  SRGB_LINEAR_SCALE,
  SRGB_GAMMA_OFFSET,
  SRGB_GAMMA_SCALE,
  SRGB_GAMMA,
} from '../components/visualizer/constants';

export function sRGBToLinear(c) {
  if (c <= SRGB_THRESHOLD) return c / SRGB_LINEAR_SCALE;
  return Math.pow((c + SRGB_GAMMA_OFFSET) / SRGB_GAMMA_SCALE, SRGB_GAMMA);
}

/** HSL (h 0–360, s/l 0–100) → hex. */
export function hslToHex(h, s, l) {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;

  let rn = 0, gn = 0, bn = 0;
  if (h < 60) { rn = c; gn = x; bn = 0; }
  else if (h < 120) { rn = x; gn = c; bn = 0; }
  else if (h < 180) { rn = 0; gn = c; bn = x; }
  else if (h < 240) { rn = 0; gn = x; bn = c; }
  else if (h < 300) { rn = x; gn = 0; bn = c; }
  else { rn = c; gn = 0; bn = x; }

  const R = Math.round((rn + m) * 255);
  const G = Math.round((gn + m) * 255);
  const B = Math.round((bn + m) * 255);
  return '#' + [R, G, B].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Hex → HSL (h 0–360, s/l 0–100). */
export function hexToHsl(hex) {
  const r = parseInt(hex.substring(1, 3), 16) / 255;
  const g = parseInt(hex.substring(3, 5), 16) / 255;
  const b = parseInt(hex.substring(5, 7), 16) / 255;
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const l = (maxC + minC) / 2;
  let s = 0;
  let h = 0;
  if (maxC !== minC) {
    const delta = maxC - minC;
    s = l <= 0.5 ? delta / (maxC + minC) : delta / (2 - maxC - minC);
    if (maxC === r) h = (g - b) / delta + (g < b ? 6 : 0);
    else if (maxC === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/** Linear RGB interpolation; alpha in [0,1]. */
export function interpolateColor(startColor, endColor, alpha) {
  const t = Math.max(0, Math.min(1, alpha));
  return [
    startColor[0] + (endColor[0] - startColor[0]) * t,
    startColor[1] + (endColor[1] - startColor[1]) * t,
    startColor[2] + (endColor[2] - startColor[2]) * t,
  ];
}
