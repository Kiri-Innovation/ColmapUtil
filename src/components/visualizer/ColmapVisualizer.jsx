/**
 * 3D viewer: useWebGL + HoloRP pipeline. OverlayUI for UI.
 */

import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import {
  useWebGL,
  useFpsCameraControl,
  useOrbitCameraControl,
  initAxisGridRenderer,
  getViewMatrix,
  getProjectionMatrix,
  screenToRay,
  rayPlaneIntersection,
  pointToRayDistance,
  invert4,
  HoloRP,
  Camera,
  createPointCloudObject,
  createPointCloudBuffers,
  createLinesObject,
  updateLinesObject,
  MaterialFactory,
} from '@holoengineruntime';
import { ColmapCanvasRenderTarget } from './colmapRenderTarget';
import { buildFrustumLinesGeometry } from '@/utils/frustumLinesGeometry';
import { buildImagePlaneMeshObjects } from '@/utils/imagePlaneMeshObjects';
import { OverlayUI } from './OverlayUI';
import { useAppContext, useSelection, useNavigation, useUI } from '@/AppContext';
import { useSetting, settings } from '../../utils/settings';
import { ImageTextureManager } from './ImageTextureManager.js';
import { cameraWorldPositionFromPose, cameraWorldQuatFromPose } from '../../utils/colmapTransforms';
import { resolveImageFromLoaded } from '../../utils/imageFileUtils';
import { sRGBToLinear, interpolateColor } from '../../utils/colorUtils';

const FOV_MIN = 10;
const FOV_MAX = 120;
const FOV_STEP = 2;

const UNSELECTED_POINT_ALPHA = 0.1;
const UNSELECTED_POINT_COLOR_MULTIPLIER = 0.5;

const IMAGE_PLANE_ALPHA_NO_SELECTION = 0.9;
const IMAGE_PLANE_ALPHA_SELECTED = 1.0;
const IMAGE_PLANE_ALPHA_UNSELECTED = 0.3;
const IMAGE_PLANE_ALPHA_MATCHED_SELECTED = 0.7;

/** 有 Colmap 数据时：cameraSpeedMultiplier = _SPEED_MULTIPLIER * magnitudeD；无数据时用 0.5 */
const _SPEED_MULTIPLIER = 0.05;

const DEFAULT_CAMERA = {
  id: 0,
  width: 1920,
  height: 1080,
  position: [0, 0, 15],
  rotation: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, -1],
  ],
  fx: 1000,
  fy: 1000,
  yawRad: 0,
  pitchRad: 0,
  forwardHorizontalRef: [0, 0, -1],
  worldUp: [0, 1, 0],
};

function useCanvasSize(canvasRef, containerRef) {
  useEffect(() => {
    const canvas = canvasRef?.current;
    const container = containerRef?.current;
    if (!canvas || !container || !canvas.getContext) return;

    const updateSize = () => {
      if (!container || !canvas) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;
      const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [canvasRef, containerRef]);
}

export function ColmapVisualizer() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const pipelineRef = useRef(null);
  const renderTargetRef = useRef(null);
  const pipelineCameraRef = useRef(null);
  const pointCloudObjRef = useRef(null);
  const selectedPointCloudObjRef = useRef(null);
  const frustumLinesObjRef = useRef(null);
  const matchedFrustumLinesObjRef = useRef(null);
  const matchesLinesObjRef = useRef(null);
  const imagePlaneMeshMapRef = useRef(new Map());
  const rafRef = useRef(null);
  const animationStartTimeRef = useRef(performance.now() / 1000);
  const { selectedImageId, setSelectedImageId } = useSelection();
  const { navigationHistory } = useNavigation();
  const { imageDetailId, openImageDetail, showMatchesInModal, matchedImageId, setMatchedImageId } = useUI();
  
  // Settings
  const [backgroundColor] = useSetting('ui', 'backgroundColor');
  const [axesDisplayMode] = useSetting('ui', 'axesDisplayMode');
  const [showFrustumWireframes] = useSetting('camera', 'showFrustumWireframes');
  const [showImagePlane] = useSetting('camera', 'showImagePlane');
  const [cameraScale] = useSetting('camera', 'cameraScale');
  const [frustumColorMode] = useSetting('camera', 'frustumColorMode');
  const [unselectedCameraOpacity] = useSetting('camera', 'unselectedCameraOpacity');
  const [cameraProjection] = useSetting('camera', 'cameraProjection');
  const [cameraFov, setCameraFov] = useSetting('camera', 'cameraFov');
  const [cameraMode] = useSetting('camera', 'cameraMode');
  const [cameraSpeedScale] = useSetting('camera', 'cameraSpeedScale');
  const [selectionColorMode] = useSetting('camera', 'selectionColorMode');
  const [selectionColor] = useSetting('camera', 'selectionColor');
  const [selectionAnimationSpeed] = useSetting('camera', 'selectionAnimationSpeed');
  const [pointSize] = useSetting('pointCloud', 'pointSize');
  const [showPointCloud] = useSetting('pointCloud', 'showPointCloud');
  const [colorMode] = useSetting('pointCloud', 'colorMode');
  const [errorGamma] = useSetting('pointCloud', 'errorGamma');
  const [trackLengthGamma] = useSetting('pointCloud', 'trackLengthGamma');
  
  // Colmap data (Context)
  const { colmapData, loadedFiles } = useAppContext();
  /** false = NoImage / 仅有 sparse、无栅格图：不显视锥图像平面、不解码纹理 */
  const frustumRasterOk = loadedFiles?.canResolveRasterImages !== false;
  
  // Temporary UI state
  const [hoveredImageId, setHoveredImageId] = useState(null);
  const [hoveredImageCardPos, setHoveredImageCardPos] = useState(null);
  const [hoveredGaussian, setHoveredGaussian] = useState(null);
  const [hoveredGaussianCardPos, setHoveredGaussianCardPos] = useState(null);
  // matchedImageIds for 3D hover (from useMemo below)
  const [matchedImageIds, setMatchedImageIds] = useState(new Set());
  const mouseDownPos = useRef(null);
  const focusedImageIdRef = useRef(null);

  const defaultCamera = useMemo(() => ({ ...DEFAULT_CAMERA }), []);
  const initialViewMatrix = useMemo(() => getViewMatrix(defaultCamera), [defaultCamera]);

  const viewMatrixRef = useRef(initialViewMatrix);
  const projectionMatrixRef = useRef(null);
  const cameraRef = useRef(defaultCamera);
  const camerasRef = useRef([defaultCamera]);

  useCanvasSize(canvasRef, containerRef);

  const {
    gl,
    meshProgram,
    meshUniforms,
    meshAttributes,
    programPointCloud,
    pointCloudUniforms,
    pointCloudAttributes,
    programLines,
    linesUniforms,
    linesAttributes,
    shaderRegistry,
  } = useWebGL(canvasRef, { antialias: false });
  
  // Unlit materials for image plane (per-state alpha)
  const unlitMaterialNoSelectionRef = useRef(null);      // no selection: alpha=0.9
  const unlitMaterialSelectedRef = useRef(null);         // selected image: alpha=1.0
  const unlitMaterialUnselectedRef = useRef(null);        // unselected: alpha=0.3
  const unlitMaterialMatchedSelectedRef = useRef(null);   // matched and selected: alpha=0.7
  useEffect(() => {
    if (shaderRegistry && !unlitMaterialNoSelectionRef.current) {
      unlitMaterialNoSelectionRef.current = MaterialFactory.createUnlit(shaderRegistry, {
        transparent: true,
        cullMode: 'none',
        alpha: IMAGE_PLANE_ALPHA_NO_SELECTION,
      });
      unlitMaterialSelectedRef.current = MaterialFactory.createUnlit(shaderRegistry, {
        transparent: false,
        cullMode: 'none',
        alpha: IMAGE_PLANE_ALPHA_SELECTED,
      });
      unlitMaterialUnselectedRef.current = MaterialFactory.createUnlit(shaderRegistry, {
        transparent: true,
        cullMode: 'none',
        alpha: IMAGE_PLANE_ALPHA_UNSELECTED,
      });
      unlitMaterialMatchedSelectedRef.current = MaterialFactory.createUnlit(shaderRegistry, {
        transparent: true,
        cullMode: 'none',
        alpha: IMAGE_PLANE_ALPHA_MATCHED_SELECTED,
      });
    }
  }, [shaderRegistry]);

  // 相机均值中心到最远相机的距离（有 Colmap 时用于缩放移动速度）
  const magnitudeD = useMemo(() => {
    try {
      if (!colmapData?.images?.size || typeof colmapData.images.values !== 'function') return 0;
      const positions = [];
      for (const image of colmapData.images.values()) {
        if (!image?.qvec || !image?.tvec) continue;
        const camera = colmapData.cameras?.get?.(image.cameraId);
        if (!camera) continue;
        const p = cameraWorldPositionFromPose(image);
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) {
          positions.push([p.x, p.y, p.z]);
        }
      }
      if (positions.length === 0) return 0;
      const n = positions.length;
      const mean = [
        positions.reduce((s, p) => s + p[0], 0) / n,
        positions.reduce((s, p) => s + p[1], 0) / n,
        positions.reduce((s, p) => s + p[2], 0) / n,
      ];
      let maxDist = 0;
      for (const p of positions) {
        const d = Math.hypot(p[0] - mean[0], p[1] - mean[1], p[2] - mean[2]);
        if (d > maxDist) maxDist = d;
      }
      return maxDist;
    } catch (_) {
      return 0;
    }
  }, [colmapData]);

  const baseSpeedMultiplier = magnitudeD > 0 ? _SPEED_MULTIPLIER * magnitudeD : 0.5;
  const speedScale = typeof cameraSpeedScale === 'number' && Number.isFinite(cameraSpeedScale)
    ? Math.max(0.1, Math.min(10, cameraSpeedScale))
    : 1;
  const cameraSpeedMultiplier = baseSpeedMultiplier * speedScale;

  // Camera control: orbit vs FPS hook by store
  const isOrbitMode = cameraMode === 'orbit';
  
  const fpsControls = useFpsCameraControl(
    canvasRef,
    viewMatrixRef,
    cameraRef,
    camerasRef,
    () => {}, // onViewMatrixChange
    () => {}, // onCameraChange
    0, // camerasVersion
    0, // worldUpPitchAdjust
    null, // onNotifyUserInput
    false, // disableLeftMouseButton
    cameraSpeedMultiplier, // 无 Colmap 时为 0.5，有 Colmap 时为 _SPEED_MULTIPLIER * magnitudeD
    !isOrbitMode
  );
  
  const orbitControls = useOrbitCameraControl(
    canvasRef,
    viewMatrixRef,
    cameraRef,
    camerasRef,
    () => {}, // onViewMatrixChange
    () => {}, // onCameraChange
    0, // camerasVersion
    0, // worldUpPitchAdjust
    null, // onNotifyUserInput
    false, // disableLeftMouseButton
    cameraSpeedMultiplier,
    15, // initialOrbitRadius
    0.6, // minOrbitRadius
    isOrbitMode
  );
  
  const { updateCameraFromInput: fpsUpdateCameraFromInput, focusOnTarget: fpsFocusOnTarget } = fpsControls;
  const { updateCameraFromInput: orbitUpdateCameraFromInput, focusOnTarget: orbitFocusOnTarget } = orbitControls;
  
  // updateCameraFromInput by mode
  const updateCameraFromInput = isOrbitMode ? orbitUpdateCameraFromInput : fpsUpdateCameraFromInput;

  useEffect(() => {
    animationStartTimeRef.current = performance.now() / 1000;
  }, []);

  useEffect(() => {
    if (!gl || !meshProgram || !programPointCloud || !pointCloudUniforms || !pointCloudAttributes || !canvasRef.current) return;
    const extendedOptions = {
      pointCloudProgram: programPointCloud,
      pointCloudUniforms,
      pointCloudAttributes,
    };
    if (programLines && linesUniforms && linesAttributes) {
      extendedOptions.linesProgram = programLines;
      extendedOptions.linesUniforms = linesUniforms;
      extendedOptions.linesAttributes = linesAttributes;
    }
    const pipeline = new HoloRP(
      gl,
      meshProgram,
      meshProgram,
      meshProgram,
      meshUniforms,
      meshUniforms,
      meshUniforms,
      meshAttributes,
      meshAttributes,
      meshAttributes,
      extendedOptions
    );
    const initialFov = settings.camera.get('cameraFov');
    const projCam = new Camera({
      width: 1920,
      height: 1080,
      fx: 1000,
      fy: 1000,
      targetVerticalFOV: initialFov,
    });
    pipelineCameraRef.current = projCam;
    pipeline.setCamera(projCam);
    pipeline.initAxisGrid(initAxisGridRenderer);

    // Unselected point cloud (original color, alpha=UNSELECTED_POINT_ALPHA)
    const pcObj = createPointCloudObject(gl, 'colmap-points-unselected', [], []);
    const initialSize = settings.pointCloud.get('pointSize');
    pcObj.pointSize = typeof initialSize === 'number' && initialSize > 0 ? initialSize : 5;
    pcObj.alpha = UNSELECTED_POINT_ALPHA;
    pipeline.addObject(pcObj);
    pointCloudObjRef.current = pcObj;

    // Selected point cloud (original color, alpha=1.0, rendered on top)
    const selectedPcObj = createPointCloudObject(gl, 'colmap-points-selected', [], []);
    selectedPcObj.pointSize = typeof initialSize === 'number' && initialSize > 0 ? initialSize : 5;
    selectedPcObj.alpha = 1.0;
    pipeline.addObject(selectedPcObj);
    selectedPointCloudObjRef.current = selectedPcObj;

    const linesObj = createLinesObject(gl, 'frustums', [], []);
    pipeline.addObject(linesObj);
    frustumLinesObjRef.current = linesObj;

    // Matched camera frustum (white, alpha 0.5)
    const matchedFrustumLinesObj = createLinesObject(gl, 'matched-frustums', [], []);
    matchedFrustumLinesObj.alpha = 0.5;
    pipeline.addObject(matchedFrustumLinesObj);
    matchedFrustumLinesObjRef.current = matchedFrustumLinesObj;

    // Match connection lines
    const matchesLinesObj = createLinesObject(gl, 'camera-matches', [], []);
    matchesLinesObj.alpha = 0.5;
    pipeline.addObject(matchesLinesObj);
    matchesLinesObjRef.current = matchesLinesObj;

    const rt = new ColmapCanvasRenderTarget(canvasRef.current, gl);
    pipelineRef.current = pipeline;
    renderTargetRef.current = rt;

    return () => {
      const map = imagePlaneMeshMapRef.current;
      for (const [, { obj, texture }] of map) {
        pipeline.removeObject(obj.id);
        if (obj.vertexBuffer) gl.deleteBuffer(obj.vertexBuffer);
        if (obj.elementBuffer) gl.deleteBuffer(obj.elementBuffer);
        if (texture) gl.deleteTexture(texture);
      }
      map.clear();
      pipeline.removeObject('colmap-points-unselected');
      pipeline.removeObject('colmap-points-selected');
      pipeline.removeObject('frustums');
      pipeline.removeObject('matched-frustums');
      pipeline.removeObject('camera-matches');
      if (matchedFrustumLinesObjRef.current?.positionBuffer) {
        gl.deleteBuffer(matchedFrustumLinesObjRef.current.positionBuffer);
        matchedFrustumLinesObjRef.current.positionBuffer = null;
        matchedFrustumLinesObjRef.current.ready = false;
      }
      if (matchesLinesObjRef.current?.positionBuffer) {
        gl.deleteBuffer(matchesLinesObjRef.current.positionBuffer);
        matchesLinesObjRef.current.positionBuffer = null;
        matchesLinesObjRef.current.ready = false;
      }
      if (pcObj.pointPositionBuffer) gl.deleteBuffer(pcObj.pointPositionBuffer);
      if (pcObj.pointColorBuffer) gl.deleteBuffer(pcObj.pointColorBuffer);
      if (selectedPcObj.pointPositionBuffer) gl.deleteBuffer(selectedPcObj.pointPositionBuffer);
      if (selectedPcObj.pointColorBuffer) gl.deleteBuffer(selectedPcObj.pointColorBuffer);
      if (linesObj.positionBuffer) {
        gl.deleteBuffer(linesObj.positionBuffer);
        linesObj.positionBuffer = null;
        linesObj.ready = false;
      }
      pipeline.dispose();
      pipelineRef.current = null;
      renderTargetRef.current = null;
      pipelineCameraRef.current = null;
      pointCloudObjRef.current = null;
      selectedPointCloudObjRef.current = null;
      frustumLinesObjRef.current = null;
    };
  }, [gl, meshProgram, meshUniforms, meshAttributes, programPointCloud, pointCloudUniforms, pointCloudAttributes, programLines, linesUniforms, linesAttributes]);

  // Build frustum data (includes image file info)
  const frustums = useMemo(() => {
    if (!colmapData) return [];

    const result = [];
    const cameraIdToIndex = new Map();
    let cameraIndex = 0;

    // Camera ID -> index map
    for (const cameraId of colmapData.cameras.keys()) {
      cameraIdToIndex.set(cameraId, cameraIndex++);
    }

    // Image frame index map (for rig-frame color mode)
    const imageFrameIndexMap = new Map();
    const frameIndexMap = new Map();
    let frameIndex = 0;
    for (const image of colmapData.images.values()) {
      const filename = image.name.split('/').pop() || image.name;
      if (!frameIndexMap.has(filename)) {
        frameIndexMap.set(filename, frameIndex++);
      }
      imageFrameIndexMap.set(image.imageId, frameIndexMap.get(filename));
    }

    for (const image of colmapData.images.values()) {
      const camera = colmapData.cameras.get(image.cameraId);
      if (!camera) continue;

      const positionVec = cameraWorldPositionFromPose(image);
      const quaternionObj = cameraWorldQuatFromPose(image);

      // Skip invalid pose data
      if (!Number.isFinite(positionVec.x) || !Number.isFinite(positionVec.y) || !Number.isFinite(positionVec.z)) {
        continue;
      }

      const imageFile = resolveImageFromLoaded(loadedFiles, image.name);

      result.push({
        image,
        camera,
        position: [positionVec.x, positionVec.y, positionVec.z],
        quaternion: {
          x: quaternionObj.x,
          y: quaternionObj.y,
          z: quaternionObj.z,
          w: quaternionObj.w,
        },
        cameraIndex: cameraIdToIndex.get(image.cameraId) ?? 0,
        imageFile,
      });
    }

    return result;
  }, [colmapData, loadedFiles]);

  // Point IDs observed by selected camera
  const selectedImagePointIds = useMemo(() => {
    if (!colmapData || selectedImageId === null) {
      return new Set();
    }
    return colmapData.pointCloudIdsByImage.get(selectedImageId) ?? new Set();
  }, [colmapData, selectedImageId]);

  // Point cloud: split unselected vs selected; color by colorMode (rgb / error / trackLength)
  const pointCloudData = useMemo(() => {
    if (!colmapData) {
      return {
        unselectedPositions: null,
        unselectedColors: null,
        selectedPositions: null,
        selectedColors: null,
        point3DIds: null,
        errors: null,
        trackLengths: null,
      };
    }

    // Collect all point data
    let allPositions, allRawColors, allPoint3DIds, allErrors, allTrackLengths;
    const pointCloud = colmapData.pointCloud;
    if (!pointCloud || pointCloud.size === 0) {
      return {
        unselectedPositions: null,
        unselectedColors: null,
        selectedPositions: null,
        selectedColors: null,
        point3DIds: null,
        errors: null,
        trackLengths: null,
      };
    }
    const n = pointCloud.size;
    allPositions = new Float32Array(n * 3);
    allRawColors = new Float32Array(n * 3);
    allErrors = new Float32Array(n);
    allTrackLengths = new Uint32Array(n);
    allPoint3DIds = new Array(n);
    let i = 0;
    for (const p of pointCloud.values()) {
      allPositions[i * 3] = p.xyz[0];
      allPositions[i * 3 + 1] = p.xyz[1];
      allPositions[i * 3 + 2] = p.xyz[2];
      allRawColors[i * 3] = p.rgb[0] / 255;
      allRawColors[i * 3 + 1] = p.rgb[1] / 255;
      allRawColors[i * 3 + 2] = p.rgb[2] / 255;
      allErrors[i] = p.error ?? 0;
      allTrackLengths[i] = p.track?.length ?? 0;
      allPoint3DIds[i] = p.point3DId;
      i++;
    }

    if (!allPositions || !allRawColors) {
      return {
        unselectedPositions: null,
        unselectedColors: null,
        selectedPositions: null,
        selectedColors: null,
        point3DIds: null,
        errors: null,
        trackLengths: null,
      };
    }

    const pointCount = allPositions.length / 3;
    
    // Min/max for color mapping (no filtering)
    let minError = Infinity, maxError = -Infinity;
    let minTrack = Infinity, maxTrack = -Infinity;
    
    for (let i = 0; i < pointCount; i++) {
      // Stats for color mapping
      if (colorMode === 'error' && allErrors && allErrors[i] >= 0) {
        minError = Math.min(minError, allErrors[i]);
        maxError = Math.max(maxError, allErrors[i]);
      }
      if (colorMode === 'trackLength' && allTrackLengths) {
        minTrack = Math.min(minTrack, allTrackLengths[i]);
        maxTrack = Math.max(maxTrack, allTrackLengths[i]);
      }
    }
    
    if (minError === Infinity || minError === maxError) {
      minError = 0;
      maxError = 1;
    }
    if (minTrack === Infinity || minTrack === maxTrack) {
      minTrack = 0;
      maxTrack = 1;
    }
    
    const allColors = new Float32Array(pointCount * 3);
    
    if (colorMode === 'rgb') {
      for (let i = 0; i < pointCount; i++) {
        const colorBase = i * 3;
        allColors[colorBase] = sRGBToLinear(allRawColors[colorBase]);
        allColors[colorBase + 1] = sRGBToLinear(allRawColors[colorBase + 1]);
        allColors[colorBase + 2] = sRGBToLinear(allRawColors[colorBase + 2]);
      }
    } else if (colorMode === 'error') {
      if (allErrors) {
        const startColor = [0, 1, 0];
        const endColor = [1, 0, 0];
        for (let i = 0; i < pointCount; i++) {
          const errorNorm = allErrors[i] >= 0 ? (allErrors[i] - minError) / (maxError - minError) : 0;
          const gammaCorrected = Math.pow(Math.max(0, Math.min(1, errorNorm)), errorGamma);
          const [r, g, b] = interpolateColor(startColor, endColor, gammaCorrected);
          allColors[i * 3] = r;
          allColors[i * 3 + 1] = g;
          allColors[i * 3 + 2] = b;
        }
      } else {
        allColors.fill(1);
      }
    } else if (colorMode === 'trackLength') {
      if (allTrackLengths) {
        const startColor = [0, 0, 1];
        const endColor = [1, 1, 0];
        for (let i = 0; i < pointCount; i++) {
          const trackNorm = (allTrackLengths[i] - minTrack) / (maxTrack - minTrack);
          const gammaCorrected = Math.pow(Math.max(0, Math.min(1, trackNorm)), trackLengthGamma);
          const [r, g, b] = interpolateColor(startColor, endColor, gammaCorrected);
          allColors[i * 3] = r;
          allColors[i * 3 + 1] = g;
          allColors[i * 3 + 2] = b;
        }
      } else {
        allColors.fill(1);
      }
      } else {
      for (let i = 0; i < pointCount; i++) {
        const colorBase = i * 3;
        allColors[colorBase] = sRGBToLinear(allRawColors[colorBase]);
        allColors[colorBase + 1] = sRGBToLinear(allRawColors[colorBase + 1]);
        allColors[colorBase + 2] = sRGBToLinear(allRawColors[colorBase + 2]);
      }
    }

    const unselectedPositions = [];
    const unselectedColors = [];
    const selectedPositions = [];
    const selectedColors = [];

    const hasSelection = selectedImageId !== null && selectedImagePointIds.size > 0;

    for (let i = 0; i < pointCount; i++) {
      const point3DId = allPoint3DIds ? allPoint3DIds[i] : BigInt(i + 1);
      const isSelected = hasSelection && selectedImagePointIds.has(point3DId);
      
      const posBase = i * 3;
      const position = [allPositions[posBase], allPositions[posBase + 1], allPositions[posBase + 2]];
      const colorBase = i * 3;
      
      if (isSelected || !hasSelection) {
        selectedPositions.push(...position);
        selectedColors.push(allColors[colorBase], allColors[colorBase + 1], allColors[colorBase + 2]);
      } else {
        unselectedPositions.push(...position);
        unselectedColors.push(
          allColors[colorBase] * UNSELECTED_POINT_COLOR_MULTIPLIER,      // R * multiplier
          allColors[colorBase + 1] * UNSELECTED_POINT_COLOR_MULTIPLIER,  // G * multiplier
          allColors[colorBase + 2] * UNSELECTED_POINT_COLOR_MULTIPLIER   // B * multiplier
        );
      }
    }

    return {
      // Split data for rendering
      unselectedPositions: unselectedPositions.length > 0 ? new Float32Array(unselectedPositions) : null,
      unselectedColors: unselectedColors.length > 0 ? new Float32Array(unselectedColors) : null,
      selectedPositions: selectedPositions.length > 0 ? new Float32Array(selectedPositions) : null,
      selectedColors: selectedColors.length > 0 ? new Float32Array(selectedColors) : null,
      // Full data for hover (preserve indices)
      positions: allPositions,
      colors: allColors,
      point3DIds: allPoint3DIds,
      errors: allErrors,
      trackLengths: allTrackLengths,
    };
  }, [colmapData, selectedImagePointIds, colorMode, errorGamma, trackLengthGamma]);

  // Update unselected point cloud
  useEffect(() => {
    const obj = pointCloudObjRef.current;
    if (!obj || !gl) return;
    const { unselectedPositions, unselectedColors } = pointCloudData;
    if (!unselectedPositions || !unselectedColors || !showPointCloud) {
      if (obj.pointPositionBuffer) { gl.deleteBuffer(obj.pointPositionBuffer); obj.pointPositionBuffer = null; }
      if (obj.pointColorBuffer) { gl.deleteBuffer(obj.pointColorBuffer); obj.pointColorBuffer = null; }
      obj.pointCount = 0;
      obj.ready = false;
      return;
    }
    const { pointPositionBuffer, pointColorBuffer, pointCount } = createPointCloudBuffers(gl, unselectedPositions, unselectedColors);
    if (obj.pointPositionBuffer) gl.deleteBuffer(obj.pointPositionBuffer);
    if (obj.pointColorBuffer) gl.deleteBuffer(obj.pointColorBuffer);
    obj.pointPositionBuffer = pointPositionBuffer;
    obj.pointColorBuffer = pointColorBuffer;
    obj.pointCount = pointCount;
    obj.ready = pointCount > 0;
  }, [gl, pointCloudData, showPointCloud]);

  // Update selected point cloud
  useEffect(() => {
    const obj = selectedPointCloudObjRef.current;
    if (!obj || !gl) return;
    const { selectedPositions, selectedColors } = pointCloudData;
    if (!selectedPositions || !selectedColors || !showPointCloud) {
      if (obj.pointPositionBuffer) { gl.deleteBuffer(obj.pointPositionBuffer); obj.pointPositionBuffer = null; }
      if (obj.pointColorBuffer) { gl.deleteBuffer(obj.pointColorBuffer); obj.pointColorBuffer = null; }
      obj.pointCount = 0;
      obj.ready = false;
      return;
    }
    const { pointPositionBuffer, pointColorBuffer, pointCount } = createPointCloudBuffers(gl, selectedPositions, selectedColors);
    if (obj.pointPositionBuffer) gl.deleteBuffer(obj.pointPositionBuffer);
    if (obj.pointColorBuffer) gl.deleteBuffer(obj.pointColorBuffer);
    obj.pointPositionBuffer = pointPositionBuffer;
    obj.pointColorBuffer = pointColorBuffer;
    obj.pointCount = pointCount;
    obj.ready = pointCount > 0;
  }, [gl, pointCloudData, showPointCloud]);

  useEffect(() => {
    const obj = pointCloudObjRef.current;
    const selectedObj = selectedPointCloudObjRef.current;
    if (!obj || !selectedObj) return;
    const size = typeof pointSize === 'number' && pointSize > 0 ? pointSize : 5;
    obj.pointSize = size;
    selectedObj.pointSize = size;
  }, [pointSize]);

  const imageFrameIndexMap = useMemo(() => {
    const m = new Map();
    if (frustumColorMode !== 'byRigFrame' || !colmapData) return m;
    const frameIndexMap = new Map();
    let frameIndex = 0;
    for (const image of colmapData.images.values()) {
      const filename = image.name.split('/').pop() || image.name;
      if (!frameIndexMap.has(filename)) frameIndexMap.set(filename, frameIndex++);
      m.set(image.imageId, frameIndexMap.get(filename));
    }
    return m;
  }, [frustumColorMode, colmapData]);

  const frustumByImageId = useMemo(() => {
    const map = new Map();
    for (const frustum of frustums) {
      map.set(frustum.image.imageId, frustum);
    }
    return map;
  }, [frustums]);

  // Matched camera IDs (when camera selected, detail panel open, show matches on)
  const matchedCameraIds = useMemo(() => {
    if (!colmapData || selectedImageId === null || imageDetailId === null || selectedImageId !== imageDetailId || !showMatchesInModal) {
      return new Set();
    }
    const connections = colmapData.imagePairCovisibilityCount.get(selectedImageId);
    if (!connections || connections.size === 0) {
      return new Set();
    }
    
    if (matchedImageId !== null) {
      if (connections.has(matchedImageId)) {
        return new Set([matchedImageId]);
      }
      return new Set();
    }
    
    return new Set(connections.keys());
  }, [colmapData, selectedImageId, imageDetailId, showMatchesInModal, matchedImageId]);

  // Sync matchedImageIds for 3D hover highlight
  useEffect(() => {
    if (showMatchesInModal && selectedImageId !== null && imageDetailId !== null && selectedImageId === imageDetailId) {
      setMatchedImageIds(matchedCameraIds);
    } else {
      setMatchedImageIds(new Set());
    }
  }, [showMatchesInModal, selectedImageId, imageDetailId, matchedCameraIds]);

  // Update main frustum (exclude matched cameras)
  useEffect(() => {
    const linesObj = frustumLinesObjRef.current;
    if (!linesObj || !gl) return;
    const source = showFrustumWireframes && frustums.length > 0 ? frustums : [];
    const { positions, colors } = buildFrustumLinesGeometry(source, {
      cameraScale,
      selectedImageId,
      hoveredImageId,
      matchedImageIds: new Set(),
      frustumColorMode,
      imageFrameIndexMap,
    });
    updateLinesObject(gl, linesObj, positions, colors);
  }, [gl, frustums, showFrustumWireframes, cameraScale, selectedImageId, hoveredImageId, matchedCameraIds, frustumColorMode, imageFrameIndexMap]);

  // Update matched camera frustums (white, alpha 0.5)
  useEffect(() => {
    const matchedFrustumLinesObj = matchedFrustumLinesObjRef.current;
    if (!matchedFrustumLinesObj || !gl || !colmapData) {
      if (matchedFrustumLinesObj && gl) {
        updateLinesObject(gl, matchedFrustumLinesObj, [], []);
      }
      return;
    }

    const shouldShowMatchedFrustums = selectedImageId !== null && imageDetailId !== null && selectedImageId === imageDetailId && showMatchesInModal && matchedCameraIds.size > 0;

    if (!shouldShowMatchedFrustums || !showFrustumWireframes) {
      updateLinesObject(gl, matchedFrustumLinesObj, [], []);
      return;
    }

    const matchedFrustums = frustums.filter(f => matchedCameraIds.has(f.image.imageId));
    if (matchedFrustums.length === 0) {
      updateLinesObject(gl, matchedFrustumLinesObj, [], []);
      return;
    }

    const { positions, colors } = buildFrustumLinesGeometry(matchedFrustums, {
      cameraScale,
      selectedImageId: null,
      hoveredImageId: null,
      matchedImageIds: matchedCameraIds,
      frustumColorMode,
      imageFrameIndexMap,
    });
    updateLinesObject(gl, matchedFrustumLinesObj, positions, colors);
  }, [gl, frustums, showFrustumWireframes, cameraScale, selectedImageId, imageDetailId, showMatchesInModal, matchedCameraIds, frustumColorMode, imageFrameIndexMap]);

  // Update match connection lines (when camera selected, detail open, show matches on)
  useEffect(() => {
    const matchesLinesObj = matchesLinesObjRef.current;
    if (!matchesLinesObj || !gl || !colmapData) {
      if (matchesLinesObj && gl) {
        updateLinesObject(gl, matchesLinesObj, [], []);
      }
      return;
    }

    const shouldShowMatches = selectedImageId !== null && imageDetailId !== null && selectedImageId === imageDetailId && showMatchesInModal;

    if (!shouldShowMatches) {
      updateLinesObject(gl, matchesLinesObj, [], []);
      return;
    }

    const selectedImage = colmapData.images.get(selectedImageId);
    if (!selectedImage) {
      updateLinesObject(gl, matchesLinesObj, [], []);
      return;
    }

    const connections = colmapData.imagePairCovisibilityCount.get(selectedImageId);
    if (!connections || connections.size === 0) {
      updateLinesObject(gl, matchesLinesObj, [], []);
      return;
    }

    const selectedPos = cameraWorldPositionFromPose(selectedImage);

    const positions = [];
    const colors = [];
    const whiteColor = [1.0, 1.0, 1.0];

    if (matchedImageId !== null && connections.has(matchedImageId)) {
      const matchedImage = colmapData.images.get(matchedImageId);
      if (matchedImage) {
        const matchedPos = cameraWorldPositionFromPose(matchedImage);
        positions.push(selectedPos.x, selectedPos.y, selectedPos.z);
        colors.push(...whiteColor);
        positions.push(matchedPos.x, matchedPos.y, matchedPos.z);
        colors.push(...whiteColor);
      }
    } else {
      for (const [matchedImgId, matchCount] of connections.entries()) {
        const matchedImage = colmapData.images.get(matchedImgId);
        if (!matchedImage) continue;

        const matchedPos = cameraWorldPositionFromPose(matchedImage);

        positions.push(selectedPos.x, selectedPos.y, selectedPos.z);
        colors.push(...whiteColor);

        positions.push(matchedPos.x, matchedPos.y, matchedPos.z);
        colors.push(...whiteColor);
      }
    }
    updateLinesObject(gl, matchesLinesObj, positions, colors);
  }, [gl, colmapData, selectedImageId, imageDetailId, showMatchesInModal, matchedImageId]);

  // Texture map: imageId -> { bitmap, hasAlpha } (updated by ImageTextureManager callback)
  const textureMapRef = useRef(new Map());
  const [textureMapVersion, setTextureMapVersion] = useState(0);

  const handleTextureMapUpdate = useCallback((newTextureMap) => {
    const oldMap = textureMapRef.current;
    let hasChange = oldMap.size !== newTextureMap.size;
    if (!hasChange) {
      for (const [id, entry] of newTextureMap) {
        if (oldMap.get(id) !== entry) {
          hasChange = true;
          break;
        }
      }
    }
    if (hasChange) {
      textureMapRef.current = newTextureMap;
      setTextureMapVersion((v) => v + 1);
    }
  }, []);

  const imageTextureManagerRef = useRef(null);
  if (!imageTextureManagerRef.current) {
    imageTextureManagerRef.current = new ImageTextureManager({ onTextureMapUpdate: handleTextureMapUpdate });
  }
  useEffect(() => {
    imageTextureManagerRef.current?.update(
      frustums,
      showImagePlane,
      selectedImageId,
      frustumRasterOk ? loadedFiles : null,
      frustumRasterOk
    );
  }, [frustums, showImagePlane, selectedImageId, loadedFiles, frustumRasterOk]);

  useEffect(() => {
    const pipeline = pipelineRef.current;
    const map = imagePlaneMeshMapRef.current;
    if (!gl || !pipeline) return;

    const removeAll = () => {
      const pl = pipelineRef.current;
      for (const [, { obj, texture }] of map) {
        if (pl) pl.removeObject(obj.id);
        if (obj.vertexBuffer) gl.deleteBuffer(obj.vertexBuffer);
        if (obj.elementBuffer) gl.deleteBuffer(obj.elementBuffer);
        if (texture) gl.deleteTexture(texture);
      }
      map.clear();
    };
    removeAll();

    if (!frustums.length) return;

    const list = buildImagePlaneMeshObjects(gl, frustums, textureMapRef.current, {
      cameraScale,
      selectedImageId,
      showImagePlane,
      allowRasterTextures: frustumRasterOk,
    });
    
    // Show matches and selected match
    const isShowingMatches = selectedImageId !== null && imageDetailId !== null && selectedImageId === imageDetailId && showMatchesInModal;
    const hasMatchedSelected = isShowingMatches && matchedImageId !== null;
    
    for (const { imageId, obj, texture } of list) {
      // Material by state
      let material = null;
      
      if (selectedImageId === null) {
        // No camera selected: all images 0.9 alpha
        material = unlitMaterialNoSelectionRef.current;
      } else {
        const isSelected = imageId === selectedImageId;
        const isMatchedSelected = hasMatchedSelected && imageId === matchedImageId;
        
        if (isMatchedSelected) {
          // Matched and selected: 0.7 alpha
          material = unlitMaterialMatchedSelectedRef.current;
        } else if (isSelected) {
          // Selected image: 1.0 alpha
          material = unlitMaterialSelectedRef.current;
        } else {
          // Unselected: 0.3 alpha
          material = unlitMaterialUnselectedRef.current;
        }
      }
      
      if (material) {
        obj.material = material;
      }
      
      pipeline.addObject(obj);
      map.set(imageId, { obj, texture });
    }
    return removeAll;
  }, [gl, frustums, cameraScale, selectedImageId, showImagePlane, textureMapVersion, imageDetailId, showMatchesInModal, matchedImageId, frustumRasterOk]);

  // Hex color to RGB (0-1)
  const backgroundColorRgb = useMemo(() => {
    try {
      const hex = backgroundColor.trim().replace('#', '');
      if (hex.length !== 6) {
        return [0.176, 0.176, 0.188]; // #2d2d30 fallback
      }
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      if (isNaN(r) || isNaN(g) || isNaN(b)) {
        return [0.176, 0.176, 0.188];
      }
      return [r, g, b];
    } catch (e) {
      return [0.176, 0.176, 0.188];
    }
  }, [backgroundColor]);

  const showGrid = useMemo(() => {
    return axesDisplayMode === 'grid' || axesDisplayMode === 'both';
  }, [axesDisplayMode]);

  const showAxes = useMemo(() => {
    return axesDisplayMode === 'axes' || axesDisplayMode === 'both';
  }, [axesDisplayMode]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const pipeline = pipelineRef.current;
    const renderTarget = renderTargetRef.current;
    if (!gl || !canvas || !pipeline || !renderTarget) return;

    const view = viewMatrixRef.current;
    if (!view || view.length !== 16) return;

    const w = canvas.width;
    const h = canvas.height;
    if (w <= 0 || h <= 0) return;

    const projCam = pipelineCameraRef.current;
    if (projCam) {
      projCam.targetVerticalFOV = cameraProjection === 'perspective' ? cameraFov : null;
      projCam.width = w;
      projCam.height = h;
      projectionMatrixRef.current = projCam.projectionMatrix;
    }

    const onBeforeRender = () => {
      gl.clearColor(backgroundColorRgb[0], backgroundColorRgb[1], backgroundColorRgb[2], 1);
      pipeline.setViewMatrix(view);
      pipeline.setCamera(projCam);
      pipeline.enableAxisGrid = showGrid || showAxes;
      pipeline.showGrid = showGrid;
      pipeline.showAxes = showAxes;
    };
    pipeline.render(renderTarget, onBeforeRender);
  }, [gl, backgroundColorRgb, showGrid, showAxes, cameraProjection, cameraFov]);

  useEffect(() => {
    let running = true;
    let lastFrameTime = performance.now();
    const loop = () => {
      if (!running) return;
      const now = performance.now();
      const deltaTime = (now - lastFrameTime) / 1000;
      lastFrameTime = now;
      updateCameraFromInput(deltaTime);
      render();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [updateCameraFromInput, render]);


  const handleContextMenu = useCallback((e) => {
    // Context menu removed, no-op
    e.preventDefault();
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (e.button === 2) {
      mouseDownPos.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      mouseDownPos.current = null;
      isDraggingRef.current = false;
    }, 0);
  }, []);

  // Detect hovered frustum
  const detectHoveredFrustum = useCallback((mouseX, mouseY) => {
    if (!canvasRef.current || !frustums.length || !showFrustumWireframes) {
      return null;
    }

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = mouseX - rect.left;
    const y = mouseY - rect.top;

    // Device pixel ratio
    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    const canvasX = x * dpr;
    const canvasY = y * dpr;

    const view = viewMatrixRef.current;
    if (!view || view.length !== 16) return null;

    const w = canvas.width;
    const h = canvas.height;
    if (w <= 0 || h <= 0) return null;

    const proj = projectionMatrixRef.current || (() => {
      const fovRad = (cameraFov * Math.PI) / 180;
      const fy = (h / 2) / Math.tan(fovRad / 2);
      const fx = (w / 2) / Math.tan(fovRad / 2);
      return getProjectionMatrix(fx, fy, w, h);
    })();

    // Ray from screen
    const ray = screenToRay(canvasX, canvasY, view, proj, w, h);
    if (!ray) return null;

    // Intersect each frustum plane
    let closestHit = null;
    let closestDistance = Infinity;

    frustums.forEach((f) => {
      const camera = f.camera;
      const position = f.position;
      const quaternion = f.quaternion;

      // Frustum far plane (image plane)
      const focalLength = camera.params[0] || 1;
      const aspectRatio = camera.width / camera.height;
      const far = cameraScale * 1.0;
      const fov = 2 * Math.atan(camera.height / (2 * focalLength));
      const tanHalfFov = Math.tan(fov / 2);
      const farHeight = far * tanHalfFov;
      const farWidth = farHeight * aspectRatio;

      // Far plane center (camera local space)
      const localCenter = [0, 0, far];

      // Transform to world space
      const transformPoint = (localPoint) => {
        const [x, y, z] = localPoint;
        const qx = quaternion.x;
        const qy = quaternion.y;
        const qz = quaternion.z;
        const qw = quaternion.w;

        const qvx = qw * x + qy * z - qz * y;
        const qvy = qw * y + qz * x - qx * z;
        const qvz = qw * z + qx * y - qy * x;
        const qvw = -qx * x - qy * y - qz * z;

        const worldX = qvx * qw + qvw * -qx + qvy * -qz - qvz * -qy;
        const worldY = qvy * qw + qvw * -qy + qvz * -qx - qvx * -qz;
        const worldZ = qvz * qw + qvw * -qz + qvx * -qy - qvy * -qx;

        return [
          worldX + position[0],
          worldY + position[1],
          worldZ + position[2],
        ];
      };

      const worldCenter = transformPoint(localCenter);

      // Plane normal (camera forward, +Z in camera space)
      const forward = transformPoint([0, 0, 1]);
      const normal = [
        forward[0] - position[0],
        forward[1] - position[1],
        forward[2] - position[2],
      ];
      const normalLen = Math.hypot(normal[0], normal[1], normal[2]);
      if (normalLen < 1e-6) return;
      const normalNorm = [normal[0] / normalLen, normal[1] / normalLen, normal[2] / normalLen];

      // Ray-plane intersection
      const t = rayPlaneIntersection(ray, {
        point: worldCenter,
        normal: normalNorm,
        size: [farWidth * 2, farHeight * 2],
      });

      if (t !== null && t < closestDistance) {
        closestDistance = t;
        closestHit = f.image.imageId;
      }
    });

    return closestHit;
  }, [frustums, showFrustumWireframes, cameraScale, cameraFov]);

  // Track camera drag
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef(null);
  const lastPointHoverTimeRef = useRef(0);

  const getPointInfoByIndex = useCallback((index) => {
    const { positions, colors, point3DIds, errors, trackLengths } = pointCloudData;
    if (!positions) return null;
    const base = index * 3;
    const position = [positions[base], positions[base + 1], positions[base + 2]];
    const color = colors ? [
      Math.round((colors[base] ?? 0) * 255),
      Math.round((colors[base + 1] ?? 0) * 255),
      Math.round((colors[base + 2] ?? 0) * 255),
    ] : null;
    const point3DId = point3DIds ? point3DIds[index] : BigInt(index + 1);
    const error = errors ? errors[index] : null;
    const trackLength = trackLengths ? trackLengths[index] : null;
    return { index, position, color, point3DId, error, trackLength };
  }, [pointCloudData]);

  const detectHoveredPoint = useCallback((mouseX, mouseY) => {
    if (!canvasRef.current || !pointCloudData.positions) return null;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = mouseX - rect.left;
    const y = mouseY - rect.top;

    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    const canvasX = x * dpr;
    const canvasY = y * dpr;

    const view = viewMatrixRef.current;
    if (!view || view.length !== 16) return null;

    const w = canvas.width;
    const h = canvas.height;
    if (w <= 0 || h <= 0) return null;

    const proj = projectionMatrixRef.current || (() => {
      const fovRad = (cameraFov * Math.PI) / 180;
      const fy = (h / 2) / Math.tan(fovRad / 2);
      const fx = (w / 2) / Math.tan(fovRad / 2);
      return getProjectionMatrix(fx, fy, w, h);
    })();

    const ray = screenToRay(canvasX, canvasY, view, proj, w, h);
    if (!ray) return null;

    const projFx = Math.abs((proj?.[0] ?? 0) * w * 0.5);
    const fx = projFx > 0 ? projFx : (w / 2);
    const sizePx = Math.max(1, pointSize * dpr);

    const positions = pointCloudData.positions;
    let closestIndex = -1;
    let closestT = Infinity;

    for (let i = 0; i < positions.length; i += 3) {
      const px = positions[i];
      const py = positions[i + 1];
      const pz = positions[i + 2];

      const toPoint = [px - ray.origin[0], py - ray.origin[1], pz - ray.origin[2]];
      const t = toPoint[0] * ray.direction[0] + toPoint[1] * ray.direction[1] + toPoint[2] * ray.direction[2];
      if (t <= 0 || t >= closestT) continue;

      const dist = pointToRayDistance([px, py, pz], ray);
      const depth = t;
      const halfSizeWorld = (sizePx * 0.5) * (depth / fx);
      const threshold = Math.max(halfSizeWorld * 1.1, 0.0001);

      if (dist <= threshold) {
        closestIndex = i / 3;
        closestT = t;
      }
    }

    if (closestIndex < 0) return null;
    return getPointInfoByIndex(closestIndex);
  }, [pointCloudData, pointSize, cameraFov, getPointInfoByIndex]);

  const handleMouseMove = useCallback((e) => {
    // Camera and point cloud hover

    // Detect drag (mouse down + move)
    if (mouseDownPos.current) {
      const dx = Math.abs(e.clientX - mouseDownPos.current.x);
      const dy = Math.abs(e.clientY - mouseDownPos.current.y);
      const DRAG_THRESHOLD = 5;
      if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
        isDraggingRef.current = true;
        if (hoveredImageId !== null) {
          setHoveredImageId(null);
          setHoveredImageCardPos(null);
        }
        document.body.style.cursor = '';
        return;
      }
    }

    isDraggingRef.current = false;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    // Prefer camera hover (skip point if camera hovered)
    const hoveredId = detectHoveredFrustum(e.clientX, e.clientY);
    
    // Update camera hover
    if (hoveredId !== hoveredImageId) {
      setHoveredImageId(hoveredId);
      // Update card position only when hovered camera changes
      if (hoveredId !== null) {
        setHoveredImageCardPos({ x: e.clientX, y: e.clientY });
      } else {
        setHoveredImageCardPos(null);
      }
    }
    
    if (hoveredId !== null) {
      document.body.style.cursor = 'pointer';
      if (hoveredGaussian !== null) {
        setHoveredGaussian(null);
      }
    } else {
      document.body.style.cursor = '';
      const now = performance.now();
      if (now - lastPointHoverTimeRef.current >= 80) {
        lastPointHoverTimeRef.current = now;
        const pointHit = detectHoveredPoint(e.clientX, e.clientY);
        if (pointHit) {
          // New point hover (by point3DId)
          const isNewPoint = !hoveredGaussian || 
            (hoveredGaussian.point3DId !== pointHit.point3DId);
          
          setHoveredGaussian(pointHit);
          
          // Update card position only when hovered point changes
          if (isNewPoint) {
            setHoveredGaussianCardPos({ x: e.clientX, y: e.clientY });
          }
        } else if (hoveredGaussian !== null) {
          setHoveredGaussian(null);
          setHoveredGaussianCardPos(null);
        }
      }
    }
  }, [detectHoveredFrustum, hoveredImageId, detectHoveredPoint, hoveredGaussian]);

  // Mouse leave handler
  const handleMouseLeave = useCallback(() => {
    if (hoveredImageId !== null) {
      setHoveredImageId(null);
      setHoveredImageCardPos(null);
    }
    document.body.style.cursor = '';
    if (hoveredGaussian !== null) {
      setHoveredGaussian(null);
      setHoveredGaussianCardPos(null);
    }
  }, [hoveredImageId, hoveredGaussian]);

  // Clear focus when selected camera changes (cleared on click-unselect only)
  useEffect(() => {
    if (selectedImageId === null) {
      focusedImageIdRef.current = null;
    } else if (selectedImageId !== focusedImageIdRef.current) {
      // Do not clear focus here (may be selected from gallery etc.)
    }
  }, [selectedImageId]);

  const handleClick = useCallback((e) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      return;
    }

    const cameraControls = !isOrbitMode ? fpsControls : orbitControls;
    if (cameraControls?.hasDragged?.current) {
      return;
    }
    
    // Fallback: compare mouse down vs up position
    const mouseDownPos = cameraControls?.getMouseDownPos?.();
    if (mouseDownPos) {
      const dx = Math.abs(e.clientX - mouseDownPos.x);
      const dy = Math.abs(e.clientY - mouseDownPos.y);
      const DRAG_THRESHOLD = 5;
      if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
        return;
      }
    }

    const hoveredId = detectHoveredFrustum(e.clientX, e.clientY);
    if (hoveredId !== null) {
      if (hoveredId === selectedImageId) {
        if (hoveredId === focusedImageIdRef.current) {
          openImageDetail(hoveredId);
        } else {
          const frustum = frustumByImageId.get(hoveredId);
          if (frustum?.position) {
            if (isOrbitMode) {
              orbitFocusOnTarget(frustum.position);
            } else {
              fpsFocusOnTarget(frustum.position);
            }
            focusedImageIdRef.current = hoveredId;
          }
        }
      } else {
        setSelectedImageId(hoveredId);
        focusedImageIdRef.current = null;
        
        if (imageDetailId !== null) {
          openImageDetail(hoveredId);
        }
      }
    } else {
      if (selectedImageId !== null) {
        setSelectedImageId(null);
        focusedImageIdRef.current = null;
      }
    }
  }, [detectHoveredFrustum, selectedImageId, setSelectedImageId, isOrbitMode, frustumByImageId, orbitFocusOnTarget, fpsFocusOnTarget]);

  const handleDoubleClick = useCallback((e) => {
    const hoveredId = detectHoveredFrustum(e.clientX, e.clientY);
    if (hoveredId !== null) {
      setSelectedImageId(hoveredId);
      if (isOrbitMode) {
        const frustum = frustumByImageId.get(hoveredId);
        if (frustum?.position) {
          orbitControls.focusOnTarget(frustum.position);
          focusedImageIdRef.current = hoveredId;
        }
      }
    }
  }, [detectHoveredFrustum, setSelectedImageId, isOrbitMode, frustumByImageId, orbitControls]);

  // Wheel adjusts FOV when perspective + hovering selected image (same as View menu slider)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (e) => {
      if (
        cameraProjection !== 'perspective' ||
        hoveredImageId !== selectedImageId ||
        selectedImageId == null
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? FOV_STEP : -FOV_STEP;
      const newFov = Math.max(FOV_MIN, Math.min(FOV_MAX, cameraFov + delta));
      setCameraFov(newFov);
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [cameraProjection, hoveredImageId, selectedImageId, cameraFov, setCameraFov]);

  const hoveredImageInfo = useMemo(() => {
    if (!hoveredImageId || !colmapData) return null;

    const image = colmapData.images.get(hoveredImageId);
    if (!image) return null;

    const stats = hoveredImageId != null && colmapData
      ? {
          numPoints3D: colmapData.imageNumPoints3D.get(hoveredImageId) ?? 0,
          avgError: colmapData.imageAvgError.get(hoveredImageId) ?? 0,
          covisibleCount: colmapData.imageCovisibleCount.get(hoveredImageId) ?? 0,
        }
      : null;
    const numPoints3D = stats?.numPoints3D ?? 0;
    const isSelected = hoveredImageId === selectedImageId;
    const isMatched = matchedImageIds.has ? matchedImageIds.has(hoveredImageId) : false;
    const lastNavigationToImageId = navigationHistory && navigationHistory.length > 0 
      ? navigationHistory[navigationHistory.length - 1].toImageId 
      : null;
    const wouldGoBack = hoveredImageId === lastNavigationToImageId;

    return {
      image,
      numPoints3D,
      isSelected,
      isMatched,
      wouldGoBack,
    };
  }, [hoveredImageId, colmapData, selectedImageId, matchedImageIds, navigationHistory]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative isolate"
      style={{ backgroundColor }}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          outline: 'none',
        }}
        tabIndex={0}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      />
      <OverlayUI />
      {/* Image plane textures driven by ImageTextureManager in useEffect */}
      {/* Hover card: camera info */}
      {hoveredImageInfo && hoveredImageCardPos && !isDraggingRef.current && (
        <div
          style={{
            position: 'fixed',
            left: hoveredImageCardPos.x + 12,
            top: hoveredImageCardPos.y + 12,
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        >
          <div className="cu-hover-card">
            <div className="cu-hover-card-title">{hoveredImageInfo.image.name}</div>
            <div className="cu-hover-card-subtitle">#{hoveredImageInfo.image.imageId}</div>
            <div className="cu-hover-card-subtitle">{hoveredImageInfo.numPoints3D} points</div>
            <div className="cu-hover-card-hint">
              <div className="cu-hover-card-hint-row">
                <svg className="cu-hover-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="6" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                Left: select
              </div>
              <div className="cu-hover-card-hint-row">
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  <svg className="cu-hover-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="6" y="2" width="12" height="20" rx="6"/>
                    <path d="M12 2v8"/>
                    <rect x="6" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                  </svg>
                  <span style={{ 
                    position: 'absolute', 
                    right: '-8px', 
                    top: '-4px', 
                    fontSize: '8px', 
                    fontWeight: 'bold',
                    color: 'currentColor',
                    lineHeight: 1
                  }}>×2</span>
                </div>
                Double: fly to
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Hover card: point info */}
      {hoveredGaussian && hoveredGaussianCardPos && !isDraggingRef.current && !hoveredImageInfo && (
        <div
          style={{
            position: 'fixed',
            left: hoveredGaussianCardPos.x + 12,
            top: hoveredGaussianCardPos.y + 12,
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        >
          <div className="cu-hover-card">
            <div className="cu-hover-card-title">Point #{String(hoveredGaussian.point3DId ?? hoveredGaussian.index)}</div>
            <div className="cu-hover-card-subtitle">
              XYZ: {hoveredGaussian.position[0].toFixed(4)}, {hoveredGaussian.position[1].toFixed(4)}, {hoveredGaussian.position[2].toFixed(4)}
            </div>
            {hoveredGaussian.color && (
              <div className="cu-hover-card-subtitle">
                RGB: {hoveredGaussian.color[0]}, {hoveredGaussian.color[1]}, {hoveredGaussian.color[2]}
              </div>
            )}
            {hoveredGaussian.trackLength !== null && (
              <div className="cu-hover-card-subtitle">Track: {hoveredGaussian.trackLength}</div>
            )}
            {hoveredGaussian.error !== null && (
              <div className="cu-hover-card-subtitle">Error: {hoveredGaussian.error.toFixed(4)}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
