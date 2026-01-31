/**
 * Camera model IDs and param counts for parsing/writing COLMAP bin and export.
 * Values match COLMAP source models.h.
 */

export const CameraModelId = {
  SIMPLE_PINHOLE: 0,
  PINHOLE: 1,
  SIMPLE_RADIAL: 2,
  RADIAL: 3,
  OPENCV: 4,
  OPENCV_FISHEYE: 5,
  FULL_OPENCV: 6,
  FOV: 7,
  SIMPLE_RADIAL_FISHEYE: 8,
  RADIAL_FISHEYE: 9,
  THIN_PRISM_FISHEYE: 10,
};

/** Number of intrinsic params per model. */
export const PARAM_COUNT_BY_MODEL = {
  [CameraModelId.SIMPLE_PINHOLE]: 3,
  [CameraModelId.PINHOLE]: 4,
  [CameraModelId.SIMPLE_RADIAL]: 4,
  [CameraModelId.RADIAL]: 5,
  [CameraModelId.OPENCV]: 8,
  [CameraModelId.OPENCV_FISHEYE]: 8,
  [CameraModelId.FULL_OPENCV]: 12,
  [CameraModelId.FOV]: 5,
  [CameraModelId.SIMPLE_RADIAL_FISHEYE]: 4,
  [CameraModelId.RADIAL_FISHEYE]: 5,
  [CameraModelId.THIN_PRISM_FISHEYE]: 12,
};

/** Placeholder ID for unmatched 2D point: -1 in txt, uint64 max in bin. */
export const UNMATCHED_2D_POINT_ID = BigInt(-1);
