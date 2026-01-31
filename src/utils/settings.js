/**
 * Persisted settings (localStorage). useSetting / useSettings for reactive hooks.
 */

import { useState, useEffect } from 'react';

export const STORAGE_KEYS = {
  pointCloud: 'colmap-util-pointcloud',
  camera: 'colmap-util-camera',
  ui: 'colmap-util-ui',
  export: 'colmap-util-export',
  rig: 'colmap-util-rig',
};

const DEFAULTS = {
  pointCloud: {
    pointSize: 5,
    colorMode: 'rgb',
    minTrackLength: 0,
    maxReprojectionError: Infinity,
    errorGamma: 1.0,
    trackLengthGamma: 1.0,
    showPointCloud: true,
  },
  camera: {
    cameraDisplayMode: 'on',
    showFrustumWireframes: true,
    showImagePlane: true,
    cameraScale: 0.1,
    frustumColorMode: 'byCamera',
    unselectedCameraOpacity: 0.5,
    cameraMode: 'orbit',
    cameraProjection: 'perspective',
    cameraFov: 60,
    horizonLock: 'off',
    autoRotateMode: 'off',
    autoRotateSpeed: 0.5,
    flySpeed: 2.5,
    flyTransitionDuration: 600,
    pointerLock: true,
    selectionColorMode: 'rainbow',
    selectionColor: '#00ff00',
    selectionAnimationSpeed: 2,
    selectionPlaneOpacity: 1.0,
  },
  ui: {
    showPoints2D: false,
    showPoints3D: false,
    matchesDisplayMode: 'off',
    matchesOpacity: 0.75,
    matchesColor: '#ff00ff',
    showMaskOverlay: false,
    maskOpacity: 0.7,
    axesDisplayMode: 'both',
    axesCoordinateSystem: 'colmap',
    axesScale: 1,
    gridScale: 1,
    axisLabelMode: 'extra',
    backgroundColor: '#2d2d30',
    gizmoMode: 'off',
    galleryCollapsed: false,
    contextMenuActions: [
      'resetView',
      'cycleAutoRotate',
      'toggleBackground',
      'toggleAxes',
      'toggleGizmo',
      'onePointOrigin',
      'twoPointScale',
      'threePointAlign',
    ],
  },
  export: {
    screenshotSize: 'current',
    screenshotFormat: 'jpeg',
    screenshotHideLogo: false,
    exportFormat: 'binary',
  },
  rig: {
    rigDisplayMode: 'lines',
    rigLineColor: '#00ffff',
    rigLineOpacity: 0.7,
  },
};

/** JSON.stringify(Infinity) => null. */
function serializeValue(value) {
  if (value === Infinity) return null;
  if (value === -Infinity) return null;
  return value;
}

function deserializeValue(value, defaultValue) {
  if (value === null && defaultValue === Infinity) return Infinity;
  if (value === null && defaultValue === -Infinity) return -Infinity;
  return value;
}

function createSettingsSection(sectionKey, defaults) {
  return {
    get(key) {
      const stored = localStorage.getItem(STORAGE_KEYS[sectionKey]);
      if (!stored) {
        return deserializeValue(defaults[key], defaults[key]);
      }
      try {
        const data = JSON.parse(stored);
        const state = data.state || data;
        const value = state[key];
        return value !== undefined
          ? deserializeValue(value, defaults[key])
          : deserializeValue(defaults[key], defaults[key]);
      } catch (e) {
        console.warn(`[Settings] Failed to parse ${STORAGE_KEYS[sectionKey]}:`, e);
        return deserializeValue(defaults[key], defaults[key]);
      }
    },

    set(key, value) {
      const stored = localStorage.getItem(STORAGE_KEYS[sectionKey]);
      let data = stored ? JSON.parse(stored) : {};
      const state = data.state || data;
      const newState = {
        ...state,
        [key]: serializeValue(value),
      };
      const newData = data.state !== undefined
        ? { ...data, state: newState }
        : newState;
      
      localStorage.setItem(STORAGE_KEYS[sectionKey], JSON.stringify(newData));
      
      window.dispatchEvent(new CustomEvent('settings-change', {
        detail: { section: sectionKey, key, value },
      }));
    },

    getAll() {
      const stored = localStorage.getItem(STORAGE_KEYS[sectionKey]);
      if (!stored) {
        return { ...defaults };
      }
      try {
        const data = JSON.parse(stored);
        const state = data.state || data;
        // merge defaults
        const result = { ...defaults };
        for (const k in state) {
          if (k in defaults) {
            result[k] = deserializeValue(state[k], defaults[k]);
          }
        }
        return result;
      } catch (e) {
        console.warn(`[Settings] Failed to parse ${STORAGE_KEYS[sectionKey]}:`, e);
        return { ...defaults };
      }
    },

    /**
     * Set multiple keys at once.
     */
    setAll(values) {
      const stored = localStorage.getItem(STORAGE_KEYS[sectionKey]);
      let data = stored ? JSON.parse(stored) : {};
      const state = data.state || data;
      
      const newState = { ...state };
      for (const k in values) {
        if (k in defaults) {
          newState[k] = serializeValue(values[k]);
        }
      }
      
      const newData = data.state !== undefined
        ? { ...data, state: newState }
        : newState;
      
      localStorage.setItem(STORAGE_KEYS[sectionKey], JSON.stringify(newData));
      
      window.dispatchEvent(new CustomEvent('settings-change', {
        detail: { section: sectionKey, values: newState },
      }));
    },

    reset() {
      localStorage.removeItem(STORAGE_KEYS[sectionKey]);
      window.dispatchEvent(new CustomEvent('settings-change', {
        detail: { section: sectionKey, reset: true },
      }));
    },
  };
}

export const settings = {
  pointCloud: createSettingsSection('pointCloud', DEFAULTS.pointCloud),
  camera: createSettingsSection('camera', DEFAULTS.camera),
  ui: createSettingsSection('ui', DEFAULTS.ui),
  export: createSettingsSection('export', DEFAULTS.export),
  rig: createSettingsSection('rig', DEFAULTS.rig),
};

export { DEFAULTS };

/** Reactive single setting. Returns [value, setValue]. */
export function useSetting(section, key) {
  const [value, setValue] = useState(() => settings[section].get(key));

  useEffect(() => {
    const handleChange = (event) => {
      const { detail } = event;
      if (detail.section === section && (detail.key === key || detail.reset)) {
        setValue(settings[section].get(key));
      }
    };

    window.addEventListener('settings-change', handleChange);
    return () => window.removeEventListener('settings-change', handleChange);
  }, [section, key]);

  const setSetting = (newValue) => {
    settings[section].set(key, newValue);
    setValue(newValue);
  };

  return [value, setSetting];
}

/** Reactive section object. Returns [values, setValues]. */
export function useSettings(section) {
  const [values, setValues] = useState(() => settings[section].getAll());

  useEffect(() => {
    const handleChange = (event) => {
      const { detail } = event;
      if (detail.section === section) {
        setValues(settings[section].getAll());
      }
    };

    window.addEventListener('settings-change', handleChange);
    return () => window.removeEventListener('settings-change', handleChange);
  }, [section]);

  const setSettings = (newValues) => {
    settings[section].setAll(newValues);
    setValues(settings[section].getAll());
  };

  return [values, setSettings];
}
