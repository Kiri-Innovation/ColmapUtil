/**
 * Visualizer constants (frustum/point/match colors, sRGB, palette).
 */

// frustum / point / match colors
export const VIZ_FRUSTUM_DEFAULT = '#ff0000';
export const VIZ_FRUSTUM_SELECTED = '#ffffff';
export const VIZ_FRUSTUM_HOVER = '#6699aa';
export const VIZ_POINT_TRIANGULATED = '#00ff00';
export const VIZ_POINT_UNTRIANGULATED = '#ff0000';
export const VIZ_MATCH = '#ff00ff';

// sRGB → linear (colorUtils.sRGBToLinear)
export const SRGB_THRESHOLD = 0.04045;
export const SRGB_LINEAR_SCALE = 12.92;
export const SRGB_GAMMA_OFFSET = 0.055;
export const SRGB_GAMMA_SCALE = 1.055;
export const SRGB_GAMMA = 2.4;

// frustum colors by index
export const FRUSTUM_COLORS = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#42d4f4',
  '#f032e6', '#bfef45', '#fabed4', '#469990', '#dcbeff', '#9a6324', '#fffac8',
  '#800000', '#aaffc3', '#808000', '#ffd8b1', '#000075', '#a9a9a9',
];

export function getCameraColor(index) {
  return FRUSTUM_COLORS[index % FRUSTUM_COLORS.length];
}
