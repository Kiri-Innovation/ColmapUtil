/**
 * AppContext: colmapData, toast, transform, selection, navigation, UI, locale. Exposes useAppContext, useSelection, useNavigation, useUI, useLocale, useT.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
} from 'react';
import { getStoredLocale, setStoredLocale, translate } from './i18n.js';
import {
  defaultEulerParams,
  sim3FromEuler,
  eulerParamsFromSim3,
  sim3Compose,
  centerSceneAtMedian,
  fitSceneExtentWithDefaults,
  applySim3ToScene,
} from './utils/sim3dTransforms.js';

const TRANSFORM_EPS = 1e-8;
function isDefaultEuler(e) {
  return (
    Math.abs(e.scale - 1) < TRANSFORM_EPS &&
    Math.abs(e.rotationX) < TRANSFORM_EPS &&
    Math.abs(e.rotationY) < TRANSFORM_EPS &&
    Math.abs(e.rotationZ) < TRANSFORM_EPS &&
    Math.abs(e.translationX) < TRANSFORM_EPS &&
    Math.abs(e.translationY) < TRANSFORM_EPS &&
    Math.abs(e.translationZ) < TRANSFORM_EPS
  );
}

export const AppContext = createContext(null);

const TOAST_DEFAULT_DURATION = 4000;
let toastNextId = 0;

function selectPointCount(colmapData) {
  return colmapData?.pointCloudPointCount ?? colmapData?.pointCloud?.size ?? 0;
}
function selectImageCount(colmapData) {
  return colmapData?.images?.size ?? 0;
}
function selectCameraCount(colmapData) {
  return colmapData?.cameras?.size ?? 0;
}

export function AppProvider({ children }) {
  // --- Locale (i18n, default English) ---
  const [locale, setLocaleState] = useState(() => getStoredLocale());
  const setLocale = useCallback((next) => {
    const value = next === 'zh' || next === 'en' ? next : getStoredLocale();
    setStoredLocale(value);
    setLocaleState(value);
  }, []);

  // --- ColmapData ---
  const [colmapData, setColmapDataState] = useState(null);
  const [loadedFiles, setLoadedFiles] = useState(null);
  const [droppedFiles, setDroppedFiles] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sourceType, setSourceTypeState] = useState(null);
  const [datasetEntries, setDatasetEntries] = useState([]);
  const [activeDatasetEntryId, setActiveDatasetEntryId] = useState(null);
  const [extensionReceiving, setExtensionReceiving] = useState(false);
  const [extensionReceiveFailed, setExtensionReceiveFailed] = useState(false);

  const sourceTypeRef = useRef(null);
  useEffect(() => {
    sourceTypeRef.current = sourceType;
  }, [sourceType]);

  const setColmapData = useCallback((value) => {
    setColmapDataState(value);
    setLoading(false);
    setError(null);
    if (value) setExtensionReceiveFailed(false);
  }, []);

  const setSourceInfo = useCallback((sourceTypeValue) => {
    setSourceTypeState(sourceTypeValue);
  }, []);

  const clearColmapData = useCallback(() => {
    setLoadedFiles((prev) => {
      if (prev?.imageSource?.dispose) prev.imageSource.dispose();
      return null;
    });
    setColmapDataState(null);
    setDroppedFiles(null);
    setError(null);
    setLoading(false);
    setSourceTypeState(null);
    setDatasetEntries([]);
    setActiveDatasetEntryId(null);
    setExtensionReceiveFailed(false);
  }, []);

  const pointCount = useMemo(
    () => selectPointCount(colmapData),
    [colmapData]
  );
  const imageCount = useMemo(() => selectImageCount(colmapData), [colmapData]);
  const cameraCount = useMemo(() => selectCameraCount(colmapData), [colmapData]);

  // --- Toast ---
  const [toasts, setToasts] = useState([]);
  const toastApiRef = useRef({ addToast: null, removeToast: null });

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(({ message, type = 'info', duration = TOAST_DEFAULT_DURATION }) => {
    const id = toastNextId++;
    setToasts((prev) => [...prev, { id, message, type, duration }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
    return id;
  }, []);

  useEffect(() => {
    toastApiRef.current = { addToast, removeToast };
  }, [addToast, removeToast]);

  useEffect(() => {
    window.__toastApiRef = toastApiRef;
    return () => {
      delete window.__toastApiRef;
    };
  }, []);

  // --- Transform ---
  const [transform, setTransformState] = useState(() => defaultEulerParams());

  const setTransform = useCallback((partial) => {
    setTransformState((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetTransform = useCallback(() => {
    setTransformState(defaultEulerParams());
  }, []);

  const applyPreset = useCallback(
    (preset) => {
      if (!colmapData) return;
      if (preset === 'identity') {
        setTransformState(defaultEulerParams());
        return;
      }
        setTransformState((currentTransform) => {
        const hasCurrentTransform = !isDefaultEuler(currentTransform);
        if (hasCurrentTransform) {
          const currentSim3d = sim3FromEuler(currentTransform);
          const transformed = applySim3ToScene(currentSim3d, colmapData);
          const presetSim3d =
            preset === 'centerAtOrigin'
              ? centerSceneAtMedian(transformed)
              : fitSceneExtentWithDefaults(transformed);
          const combinedSim3d = sim3Compose(presetSim3d, currentSim3d);
          return eulerParamsFromSim3(combinedSim3d);
        }
        const sim3d =
          preset === 'centerAtOrigin'
            ? centerSceneAtMedian(colmapData)
            : fitSceneExtentWithDefaults(colmapData);
        return eulerParamsFromSim3(sim3d);
      });
    },
    [colmapData]
  );

  const applyToData = useCallback(() => {
    if (!colmapData) return;
    const sim3d = sim3FromEuler(transform);
    const transformed = applySim3ToScene(sim3d, colmapData);
    setColmapDataState(transformed);
    setTransformState(defaultEulerParams());
  }, [colmapData, transform]);

  // --- Selection ---
  const [selectedPointId, setSelectedPointId] = useState(null);
  const [selectedImageId, setSelectedImageId] = useState(null);
  const toggleSelectedImageId = useCallback((id) => {
    setSelectedImageId((prev) => (prev === id ? null : id));
  }, []);

  // --- Navigation ---
  const [navigationHistory, setNavigationHistory] = useState([]);
  const [flyToViewState, setFlyToViewState] = useState(null);
  const [currentViewState, setCurrentViewState] = useState(null);
  const [flyToImageId, setFlyToImageId] = useState(null);
  const pushNavigationHistory = useCallback((entry) => {
    setNavigationHistory((prev) => [...prev, entry].slice(-50));
  }, []);
  const popNavigationHistory = useCallback(() => {
    let popped = null;
    setNavigationHistory((prev) => {
      if (prev.length === 0) return prev;
      popped = prev[prev.length - 1];
      return prev.slice(0, -1);
    });
    return popped;
  }, []);
  const peekNavigationHistory = useCallback(() => {
    return navigationHistory.length > 0
      ? navigationHistory[navigationHistory.length - 1]
      : undefined;
  }, [navigationHistory]);
  const clearNavigationHistory = useCallback(() => {
    setNavigationHistory([]);
  }, []);
  const flyToImage = useCallback((id) => {
    setFlyToImageId(id);
  }, []);
  const clearFlyTo = useCallback(() => {
    setFlyToImageId(null);
  }, []);
  const clearFlyToViewState = useCallback(() => {
    setFlyToViewState(null);
  }, []);

  // --- UI ---
  const [imageDetailId, setImageDetailId] = useState(null);
  const [showMatchesInModal, setShowMatchesInModal] = useState(false);
  const [matchedImageId, setMatchedImageId] = useState(null);
  const [viewResetTrigger, setViewResetTrigger] = useState(0);
  const [viewDirection, setViewDirection] = useState(null);
  const [viewTrigger, setViewTrigger] = useState(0);
  const [contextMenuPosition, setContextMenuPosition] = useState(null);
  const [showContextMenuEditor, setShowContextMenuEditor] = useState(false);
  const openImageDetail = useCallback((id) => {
    setImageDetailId(id);
  }, []);
  const closeImageDetail = useCallback(() => {
    setImageDetailId(null);
    setShowMatchesInModal(false);
    setMatchedImageId(null);
  }, []);
  const resetView = useCallback(() => {
    setViewResetTrigger((prev) => prev + 1);
  }, []);
  const setView = useCallback((direction) => {
    setViewDirection(direction);
    setViewTrigger((prev) => prev + 1);
  }, []);
  const openContextMenu = useCallback((x, y) => {
    setContextMenuPosition({ x, y });
  }, []);
  const closeContextMenu = useCallback(() => {
    setContextMenuPosition(null);
  }, []);

  const value = useMemo(
    () => ({
      // locale
      locale,
      setLocale,
      // colmapData
      colmapData,
      loadedFiles,
      droppedFiles,
      loading,
      error,
      sourceType,
      datasetEntries,
      activeDatasetEntryId,
      sourceTypeRef,
      extensionReceiving,
      setExtensionReceiving,
      extensionReceiveFailed,
      setExtensionReceiveFailed,
      setColmapData,
      setLoadedFiles,
      setDroppedFiles,
      setLoading,
      setError,
      setSourceInfo,
      setDatasetEntries,
      setActiveDatasetEntryId,
      clear: clearColmapData,
      pointCount,
      imageCount,
      cameraCount,
      // toast
      toasts,
      addToast,
      removeToast,
      // transform
      transform,
      setTransform,
      resetTransform,
      applyPreset,
      applyToData,
      // selection
      selectedPointId,
      setSelectedPointId,
      selectedImageId,
      setSelectedImageId,
      toggleSelectedImageId,
      // navigation
      navigationHistory,
      pushNavigationHistory,
      popNavigationHistory,
      peekNavigationHistory,
      clearNavigationHistory,
      flyToViewState,
      setFlyToViewState,
      clearFlyToViewState,
      currentViewState,
      setCurrentViewState,
      flyToImageId,
      flyToImage,
      clearFlyTo,
      // ui
      imageDetailId,
      openImageDetail,
      closeImageDetail,
      showMatchesInModal,
      setShowMatchesInModal,
      matchedImageId,
      setMatchedImageId,
      viewResetTrigger,
      resetView,
      viewDirection,
      setView,
      viewTrigger,
      contextMenuPosition,
      openContextMenu,
      closeContextMenu,
      showContextMenuEditor,
      setShowContextMenuEditor,
    }),
    [
      locale,
      setLocale,
      colmapData,
      loadedFiles,
      droppedFiles,
      loading,
      error,
      sourceType,
      datasetEntries,
      activeDatasetEntryId,
      extensionReceiving,
      setExtensionReceiving,
      extensionReceiveFailed,
      setExtensionReceiveFailed,
      setColmapData,
      setLoadedFiles,
      setDroppedFiles,
      setLoading,
      setError,
      setSourceInfo,
      setDatasetEntries,
      setActiveDatasetEntryId,
      clearColmapData,
      pointCount,
      imageCount,
      cameraCount,
      toasts,
      addToast,
      removeToast,
      transform,
      setTransform,
      resetTransform,
      applyPreset,
      applyToData,
      selectedPointId,
      setSelectedPointId,
      selectedImageId,
      setSelectedImageId,
      toggleSelectedImageId,
      navigationHistory,
      pushNavigationHistory,
      popNavigationHistory,
      peekNavigationHistory,
      clearNavigationHistory,
      flyToViewState,
      setFlyToViewState,
      clearFlyToViewState,
      currentViewState,
      setCurrentViewState,
      flyToImageId,
      flyToImage,
      clearFlyTo,
      imageDetailId,
      openImageDetail,
      closeImageDetail,
      showMatchesInModal,
      setShowMatchesInModal,
      matchedImageId,
      setMatchedImageId,
      viewResetTrigger,
      resetView,
      viewDirection,
      setView,
      viewTrigger,
      contextMenuPosition,
      openContextMenu,
      closeContextMenu,
      showContextMenuEditor,
      setShowContextMenuEditor,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}

/** Selection state from AppContext. */
export function useSelection() {
  const ctx = useAppContext();
  return {
    selectedPointId: ctx.selectedPointId,
    setSelectedPointId: ctx.setSelectedPointId,
    selectedImageId: ctx.selectedImageId,
    setSelectedImageId: ctx.setSelectedImageId,
    toggleSelectedImageId: ctx.toggleSelectedImageId,
  };
}

/** Navigation state from AppContext. */
export function useNavigation() {
  const ctx = useAppContext();
  return {
    navigationHistory: ctx.navigationHistory,
    pushNavigationHistory: ctx.pushNavigationHistory,
    popNavigationHistory: ctx.popNavigationHistory,
    peekNavigationHistory: ctx.peekNavigationHistory,
    clearNavigationHistory: ctx.clearNavigationHistory,
    flyToViewState: ctx.flyToViewState,
    setFlyToViewState: ctx.setFlyToViewState,
    clearFlyToViewState: ctx.clearFlyToViewState,
    currentViewState: ctx.currentViewState,
    setCurrentViewState: ctx.setCurrentViewState,
    flyToImageId: ctx.flyToImageId,
    flyToImage: ctx.flyToImage,
    clearFlyTo: ctx.clearFlyTo,
  };
}

/** UI state from AppContext. */
export function useUI() {
  const ctx = useAppContext();
  return {
    imageDetailId: ctx.imageDetailId,
    openImageDetail: ctx.openImageDetail,
    closeImageDetail: ctx.closeImageDetail,
    showMatchesInModal: ctx.showMatchesInModal,
    setShowMatchesInModal: ctx.setShowMatchesInModal,
    matchedImageId: ctx.matchedImageId,
    setMatchedImageId: ctx.setMatchedImageId,
    viewResetTrigger: ctx.viewResetTrigger,
    resetView: ctx.resetView,
    viewDirection: ctx.viewDirection,
    setView: ctx.setView,
    viewTrigger: ctx.viewTrigger,
    contextMenuPosition: ctx.contextMenuPosition,
    openContextMenu: ctx.openContextMenu,
    closeContextMenu: ctx.closeContextMenu,
    showContextMenuEditor: ctx.showContextMenuEditor,
    setShowContextMenuEditor: ctx.setShowContextMenuEditor,
  };
}

/** Locale from AppContext. */
export function useLocale() {
  const ctx = useAppContext();
  return [ctx.locale, ctx.setLocale];
}

/** Translation: t(key) returns string for current locale. */
export function useT() {
  const { locale } = useAppContext();
  return useCallback((key) => translate(key, locale), [locale]);
}

/** Toast from non-React/async (requires AppProvider mounted). */
export function getToast() {
  const ref = window.__toastApiRef;
  const add = ref?.current?.addToast;
  return {
    info: (message, options = {}) => add?.({ message, type: 'info', ...options }),
    success: (message, options = {}) => add?.({ message, type: 'success', ...options }),
    error: (message, options = {}) => add?.({ message, type: 'error', ...options }),
  };
}
