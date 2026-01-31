// ============================================================================
// Enum Arrays (used by property registry for validation)
// ============================================================================

// Point cloud visualization
export const COLOR_MODES = ['rgb', 'error', 'trackLength'];

// Camera and navigation
export const CAMERA_MODES = ['orbit', 'fly'];
export const CAMERA_PROJECTIONS = ['perspective', 'orthographic'];
export const AUTO_ROTATE_MODES = ['off', 'cw', 'ccw'];
export const HORIZON_LOCK_MODES = ['off', 'on', 'flip'];
export const CAMERA_DISPLAY_MODES = ['off', 'on'];
export const FRUSTUM_COLOR_MODES = ['single', 'byCamera', 'byRigFrame'];

// Visualization
export const MATCHES_DISPLAY_MODES = ['off', 'on', 'blink'];
export const SELECTION_COLOR_MODES = ['off', 'static', 'blink', 'rainbow'];
export const AXES_DISPLAY_MODES = ['off', 'axes', 'grid', 'both'];
export const AXES_COORDINATE_SYSTEMS = [
  'colmap',
  'opencv',
  'threejs',
  'opengl',
  'vulkan',
  'blender',
  'houdini',
  'unity',
  'unreal',
];
export const AXIS_LABEL_MODES = ['off', 'xyz', 'extra'];
export const GIZMO_MODES = ['off', 'local', 'global'];

// Rig visualization
export const RIG_DISPLAY_MODES = ['off', 'lines', 'blink'];

// Export
export const SCREENSHOT_SIZES = [
  'current',
  '1920x1080',
  '1280x720',
  '3840x2160',
  '1024x1024',
  '512x512',
  '2048x2048',
];
export const SCREENSHOT_FORMATS = ['jpeg', 'png', 'webp'];
export const EXPORT_FORMATS = ['text', 'binary', 'ply'];
