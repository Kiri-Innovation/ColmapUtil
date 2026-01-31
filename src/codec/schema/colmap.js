/**
 * COLMAP format constants: camera models and invalid point marker.
 * Values match official camera_models.h for compatibility.
 */

const MODEL_LIST = [
  { name: 'SIMPLE_PINHOLE', params: 3 },
  { name: 'PINHOLE', params: 4 },
  { name: 'SIMPLE_RADIAL', params: 4 },
  { name: 'RADIAL', params: 5 },
  { name: 'OPENCV', params: 8 },
  { name: 'OPENCV_FISHEYE', params: 8 },
  { name: 'FULL_OPENCV', params: 12 },
  { name: 'FOV', params: 5 },
  { name: 'SIMPLE_RADIAL_FISHEYE', params: 4 },
  { name: 'RADIAL_FISHEYE', params: 5 },
  { name: 'THIN_PRISM_FISHEYE', params: 12 },
];

export const CameraModelId = Object.fromEntries(
  MODEL_LIST.map((m, i) => [m.name, i])
);

export const PARAM_COUNT_BY_MODEL = Object.fromEntries(
  MODEL_LIST.map((m, i) => [i, m.params])
);

/** Unmatched 2D point in text uses -1; in binary uses uint64 max */
export const INVALID_POINT3D = BigInt(-1);

export const MODEL_ID_TO_NAME = Object.fromEntries(
  MODEL_LIST.map((m, i) => [i, m.name])
);

export const MODEL_NAME_TO_ID = Object.fromEntries(
  MODEL_LIST.map((m, i) => [m.name, i])
);
