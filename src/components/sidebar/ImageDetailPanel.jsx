/**
 * 图像详情面板组件
 * 在右侧面板中显示图像详情，替代模态框显示方式
 * 复用 ImageDetailModal 的核心逻辑
 */

import { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { useAppContext, useUI, useT } from '../../AppContext';
import { useSetting } from '../../utils/settings';
import { resolveImageFromLoaded, resolveImageFromLoadedAsync, resolveMaskFromLoadedAsync, loadedFilesUseZip } from '../../utils/imageFileUtils';
import { GAP_MATCH_VIEW, RESIZE_DEBOUNCE_MS, OPACITY_MATCH_LINES } from '../../config';
import { VIZ_POINT_TRIANGULATED, VIZ_POINT_UNTRIANGULATED, VIZ_MATCH } from '../../components/visualizer/constants';
import { ChevronDown, ChevronRight, Grid3X3 } from 'lucide-react';
import { MouseScrollIcon } from '../../assets/custom_icons';

/** File -> blob URL，依赖变化或卸载时延迟回收 */
function useFileUrl(file) {
  const [url, setUrl] = useState(null);
  const pendingRevocationsRef = useRef(new Set());

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const blobUrl = URL.createObjectURL(file);
    setUrl(blobUrl);
    return () => {
      const pendingSet = pendingRevocationsRef.current;
      pendingSet.add(blobUrl);
      const revoke = () => {
        if (pendingSet.has(blobUrl)) {
          pendingSet.delete(blobUrl);
          URL.revokeObjectURL(blobUrl);
        }
      };
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(revoke, { timeout: 1000 });
      } else {
        setTimeout(revoke, 100);
      }
    };
  }, [file]);

  useEffect(() => {
    const pending = pendingRevocationsRef.current;
    return () => {
      pending.forEach((u) => URL.revokeObjectURL(u));
      pending.clear();
    };
  }, []);

  return url;
}

const CAMERA_MODEL_NAMES= {
  0: 'SIMPLE_PINHOLE',
  1: 'PINHOLE',
  2: 'SIMPLE_RADIAL',
  3: 'RADIAL',
  4: 'OPENCV',
  5: 'OPENCV_FISHEYE',
  6: 'FULL_OPENCV',
  7: 'FOV',
  8: 'SIMPLE_RADIAL_FISHEYE',
  9: 'RADIAL_FISHEYE',
  10: 'THIN_PRISM_FISHEYE',
};

const CAMERA_PARAM_NAMES= {
  0: 'f, cx, cy',
  1: 'fx, fy, cx, cy',
  2: 'f, cx, cy, k',
  3: 'f, cx, cy, k1, k2',
  4: 'fx, fy, cx, cy, k1, k2, p1, p2',
  5: 'fx, fy, cx, cy, k1, k2, k3, k4',
  6: 'fx, fy, cx, cy, k1, k2, p1, p2, k3, k4, k5, k6',
  7: 'fx, fy, cx, cy, omega',
  8: 'f, cx, cy, k',
  9: 'f, cx, cy, k1, k2',
  10: 'fx, fy, cx, cy, k1, k2, p1, p2, k3, k4, sx1, sy1',
};

function formatParam(value) {
  const absVal = Math.abs(value);
  if (absVal >= 1) {
    return value.toFixed(1);
  }
  if (absVal === 0) {
    return '0';
  }
  return value.toPrecision(4);
}

/** 可折叠的相机详情：每行一个 key-value；支持受控 expanded/onToggle 以便父组件根据展开状态预留不同高度 */
function CollapsibleCameraDetail({ camera, image, imageDetailId, qvec, tvec, defaultExpanded = false, expanded: controlledExpanded, onToggle }) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const t = useT();
  const isControlled = controlledExpanded !== undefined;
  const expanded = isControlled ? controlledExpanded : internalExpanded;
  const handleToggle = useCallback(() => {
    if (isControlled && onToggle) onToggle();
    else setInternalExpanded((e) => !e);
  }, [isControlled, onToggle]);

  const modelName = CAMERA_MODEL_NAMES[camera.modelId] || `MODEL_${camera.modelId}`;
  const paramNames = (CAMERA_PARAM_NAMES[camera.modelId] || '').split(', ');
  const rotXyzw = [qvec[1], qvec[2], qvec[3], qvec[0]];
  const paramsStr = camera.params.map((p, i) => `${paramNames[i] || `p${i}`}=${formatParam(p)}`).join(', ');
  const rStr = rotXyzw.map((v) => v.toFixed(3)).join(', ');
  const tStr = tvec.map((v) => v.toFixed(2)).join(', ');

  const rows = [
    { key: t('imageId'), value: String(imageDetailId ?? image?.imageId ?? '') },
    { key: t('imageName'), value: image?.name ?? '' },
    { key: t('cameraModel'), value: modelName },
    { key: t('resolution'), value: `${camera.width} × ${camera.height}` },
    { key: t('intrinsics'), value: paramsStr },
    { key: t('rotationR'), value: rStr },
    { key: t('translationT'), value: tStr },
  ];

  return (
    <div className="camera-detail-collapsible">
      <button
        type="button"
        onClick={handleToggle}
        className="camera-detail-header"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
        <span>{t('cameraDetail')}</span>
      </button>
      {expanded && (
        <div className="camera-detail-body">
          {rows.map(({ key, value }) => (
            <div key={key} className="camera-detail-row">
              <span className="camera-detail-key">{key}</span>
              <span className="camera-detail-value">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const KeypointCanvas = memo(function KeypointCanvas({
  points2D,
  camera,
  imageWidth,
  imageHeight,
  containerWidth,
  containerHeight,
  showPoints2D,
  showPoints3D
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scaleX = imageWidth / camera.width;
    const scaleY = imageHeight / camera.height;

    const triangulatedPoints = [];
    const untriangulatedPoints = [];

    for (const point of points2D) {
      const isTriangulated = point.point3DId !== BigInt(-1);
      const x = point.xy[0] * scaleX;
      const y = point.xy[1] * scaleY;

      if (isTriangulated) {
        triangulatedPoints.push({ x, y });
      } else {
        untriangulatedPoints.push({ x, y });
      }
    }

    // Draw untriangulated points in green (only when showPoints2D is on)
    if (showPoints2D && untriangulatedPoints.length > 0) {
      ctx.fillStyle = VIZ_POINT_TRIANGULATED;
      ctx.beginPath();
      for (const { x, y } of untriangulatedPoints) {
        ctx.moveTo(x + 2, y);
        ctx.arc(x, y, 2, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // Draw triangulated points
    // - Green when only showPoints2D is on
    // - Red when showPoints3D is on
    if (triangulatedPoints.length > 0 && (showPoints2D || showPoints3D)) {
      ctx.fillStyle = showPoints3D ? VIZ_POINT_UNTRIANGULATED : VIZ_POINT_TRIANGULATED;
      ctx.beginPath();
      for (const { x, y } of triangulatedPoints) {
        ctx.moveTo(x + 2, y);
        ctx.arc(x, y, 2, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }, [points2D, camera, imageWidth, imageHeight, showPoints2D, showPoints3D]);

  const offsetX = (containerWidth - imageWidth) / 2;
  const offsetY = (containerHeight - imageHeight) / 2;

  return (
    <canvas
      ref={canvasRef}
      width={imageWidth}
      height={imageHeight}
      className="absolute pointer-events-none"
      style={{
        left: offsetX,
        top: offsetY,
      }}
    />
  );
});

/** 点匹配视图：为下拉框预留的底部高度，使下拉框不被裁剪且紧贴右侧图片底部 */
const MATCH_DROPDOWN_ROW_HEIGHT = 36;
/** 单图视图：相机详情折叠时预留的底部高度 */
const CAMERA_DETAIL_RESERVE_HEIGHT_COLLAPSED = 40;
/** 单图视图：相机详情展开时预留的底部高度（含展开后内容） */
const CAMERA_DETAIL_RESERVE_HEIGHT_EXPANDED = 220;

const MatchCanvas = memo(function MatchCanvas({
  lines,
  image1Camera,
  image2Camera,
  image1Width,
  image1Height,
  image2Width,
  image2Height,
  containerWidth,
  containerHeight,
  gap,
  lineOpacity
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const halfWidth = (containerWidth - gap) / 2;
    const offset1X = (halfWidth - image1Width) / 2;
    const offset1Y = (containerHeight - image1Height) / 2;
    const offset2X = halfWidth + gap + (halfWidth - image2Width) / 2;
    const offset2Y = (containerHeight - image2Height) / 2;

    const scale1X = image1Width / image1Camera.width;
    const scale1Y = image1Height / image1Camera.height;
    const scale2X = image2Width / image2Camera.width;
    const scale2Y = image2Height / image2Camera.height;

    ctx.strokeStyle = VIZ_MATCH;
    ctx.globalAlpha = lineOpacity;
    ctx.lineWidth = 1;

    for (const { point1, point2 } of lines) {
      const x1 = offset1X + point1[0] * scale1X;
      const y1 = offset1Y + point1[1] * scale1Y;
      const x2 = offset2X + point2[0] * scale2X;
      const y2 = offset2Y + point2[1] * scale2Y;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = VIZ_POINT_TRIANGULATED;
    for (const { point1, point2 } of lines) {
      const x1 = offset1X + point1[0] * scale1X;
      const y1 = offset1Y + point1[1] * scale1Y;
      const x2 = offset2X + point2[0] * scale2X;
      const y2 = offset2Y + point2[1] * scale2Y;

      ctx.beginPath();
      ctx.arc(x1, y1, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x2, y2, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [lines, image1Camera, image2Camera, image1Width, image1Height, image2Width, image2Height, containerWidth, containerHeight, gap, lineOpacity]);

  return (
    <canvas
      ref={canvasRef}
      width={containerWidth}
      height={containerHeight}
      className="absolute inset-0 pointer-events-none"
    />
  );
});

function ImagePlaceholder({ width, height, cameraWidth, cameraHeight, label }) {
  return (
    <div
      className="relative flex-shrink-0"
      style={{
        width,
        height,
        boxSizing: 'border-box',
        backgroundColor: 'var(--color-ds-secondary)',
        backgroundImage: `
          linear-gradient(45deg, var(--color-ds-tertiary) 25%, transparent 25%),
          linear-gradient(-45deg, var(--color-ds-tertiary) 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, var(--color-ds-tertiary) 75%),
          linear-gradient(-45deg, transparent 75%, var(--color-ds-tertiary) 75%)
        `,
        backgroundSize: '20px 20px',
        backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
        border: '1px dashed var(--color-ds-muted)',
      }}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center text-ds-muted text-xs pointer-events-none">
        <span className="bg-ds-secondary/80 px-2 py-1 rounded">{cameraWidth} × {cameraHeight}</span>
        {label && <span className="bg-ds-secondary/80 px-2 py-0.5 rounded mt-1 text-[10px] max-w-full truncate px-2">{label}</span>}
      </div>
    </div>
  );
}

export function ImageDetailPanel() {
  const { colmapData, loadedFiles } = useAppContext();
  const t = useT();
  const [zipImageCacheVersion, setZipImageCacheVersion] = useState(0);
  const [zipMaskFile, setZipMaskFile] = useState(null);
  const { imageDetailId, closeImageDetail, openImageDetail, showMatchesInModal, setShowMatchesInModal, matchedImageId, setMatchedImageId } = useUI();
  const [showPoints2D, setShowPoints2D] = useSetting('ui', 'showPoints2D');
  const [showPoints3D, setShowPoints3D] = useSetting('ui', 'showPoints3D');

  /** 互斥视图：'points2d' | 'points3d' | 'matches'，选中一个则关闭其他 */
  const viewMode = showMatchesInModal ? 'matches' : showPoints3D ? 'points3d' : showPoints2D ? 'points2d' : null;
  const setViewMode = useCallback((mode) => {
    setShowPoints2D(mode === 'points2d');
    setShowPoints3D(mode === 'points3d');
    setShowMatchesInModal(mode === 'matches');
  }, [setShowPoints2D, setShowPoints3D, setShowMatchesInModal]);

  useEffect(() => {
    if (!loadedFilesUseZip(loadedFiles) || !colmapData) return;

    const imagesToFetch = [];

    if (imageDetailId !== null) {
      const currentImage = colmapData.images.get(imageDetailId);
      if (currentImage && !resolveImageFromLoaded(loadedFiles, currentImage.name)) {
        imagesToFetch.push(currentImage.name);
      }
    }

    if (matchedImageId !== null) {
      const matchedImg = colmapData.images.get(matchedImageId);
      if (matchedImg && !resolveImageFromLoaded(loadedFiles, matchedImg.name)) {
        imagesToFetch.push(matchedImg.name);
      }
    }

    if (imagesToFetch.length === 0) return;

    let cancelled = false;
    Promise.all(imagesToFetch.map((name) => resolveImageFromLoadedAsync(loadedFiles, name))).then((results) => {
      if (!cancelled && results.some((f) => f !== null)) {
        setZipImageCacheVersion((v) => v + 1);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadedFiles, colmapData, imageDetailId, matchedImageId]);

  useEffect(() => {
    setZipMaskFile(null);

    if (!loadedFilesUseZip(loadedFiles) || !colmapData || imageDetailId === null) return;

    const currentImage = colmapData.images.get(imageDetailId);
    if (!currentImage) return;

    let cancelled = false;
    resolveMaskFromLoadedAsync(loadedFiles, currentImage.name).then((file) => {
      if (!cancelled) {
        setZipMaskFile(file);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadedFiles, colmapData, imageDetailId]);

  const imageIds = useMemo(() => {
    if (!colmapData) return [];
    return Array.from(colmapData.images.keys()).sort((a, b) => a - b);
  }, [colmapData]);

  const currentIndex = imageDetailId !== null ? imageIds.indexOf(imageDetailId) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < imageIds.length - 1;

  const goToPrev = useCallback(() => {
    if (hasPrev) {
      openImageDetail(imageIds[currentIndex - 1]);
    }
  }, [hasPrev, imageIds, currentIndex, openImageDetail]);

  const goToNext = useCallback(() => {
    if (hasNext) {
      openImageDetail(imageIds[currentIndex + 1]);
    }
  }, [hasNext, imageIds, currentIndex, openImageDetail]);

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const imageContainerRef = useRef(null);

  const [maskMode, setMaskMode] = useState('hover');
  const [splitX, setSplitX] = useState(0.5);
  /** 相机详情展开状态，用于单图模式下预留不同高度（折叠/展开占不同空间） */
  const [cameraDetailExpanded, setCameraDetailExpanded] = useState(false);
  /** 点匹配下拉框内滚轮图标的 tooltip：用 createPortal 固定定位，避免被父级 overflow 裁剪 */
  const [matchSelectScrollTooltip, setMatchSelectScrollTooltip] = useState({ show: false, top: 0, left: 0 });
  /** 翻页器滚轮图标的 tooltip：同上，右对齐图标避免超出画面 */
  const [paginationScrollTooltip, setPaginationScrollTooltip] = useState({ show: false, top: 0, left: 0 });
  /** alpha 背景模式：panel(面板底色) / red(深红纯色) / checker(棋盘格) */
  const [alphaBgMode, setAlphaBgMode] = useState('panel');

  const cycleMaskMode = useCallback(() => {
    setMaskMode(prev => {
      const modes = ['hover', 'mask', 'split', 'image'];
      const currentIndex = modes.indexOf(prev);
      return modes[(currentIndex + 1) % modes.length];
    });
  }, []);

  const cycleAlphaBg = useCallback(() => {
    setAlphaBgMode(prev => {
      const modes = ['panel', 'red', 'checker'];
      return modes[(modes.indexOf(prev) + 1) % modes.length];
    });
  }, []);

  const handleMaskMouseMove = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    setSplitX(Math.max(0, Math.min(1, x)));
  }, []);

  const handleMaskMouseLeave = useCallback(() => {
    setMaskMode('hover');
  }, []);

  useEffect(() => {
    setMaskMode('hover');
    setSplitX(0.5);
  }, [imageDetailId]);

  const image = imageDetailId !== null ? colmapData?.images.get(imageDetailId) : null;
  const camera = image ? colmapData?.cameras.get(image.cameraId) : null;
  const imageFile = useMemo(() => {
    if (!image) return null;
    return resolveImageFromLoaded(loadedFiles, image.name) ?? null;
  }, [image, loadedFiles, zipImageCacheVersion]);
  const maskFile = useMemo(() => {
    if (!image) return null;
    if (loadedFiles?.imageSource) {
      return zipMaskFile;
    }
    if (loadedFiles?.imageResolver?.hasMasks?.()) {
      return loadedFiles.imageResolver.getMask(image.name) ?? null;
    }
    return null;
  }, [image, zipMaskFile, loadedFiles]);
  const hasMask = !!maskFile;

  const imageSrc = useFileUrl(imageFile);
  const maskSrc = useFileUrl(maskFile);

  const alphaBgStyle = useMemo(() => {
    switch (alphaBgMode) {
      case 'red':
        return { backgroundColor: '#700' };
      case 'checker':
        return {
          backgroundImage: `
            linear-gradient(45deg, #555 25%, transparent 25%),
            linear-gradient(-45deg, #555 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #555 75%),
            linear-gradient(-45deg, transparent 75%, #555 75%)
          `,
          backgroundSize: '16px 16px',
          backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
        };
      default:
        return {};
    }
  }, [alphaBgMode]);

  const { numPoints2D, numPoints3D } = useMemo(() => {
    if (!image || !colmapData) return { numPoints2D: 0, numPoints3D: 0 };
    const total = image.numPoints2D ?? image.points2D.length;
    const stats = imageDetailId != null && colmapData
      ? {
          numPoints3D: colmapData.imageNumPoints3D.get(imageDetailId) ?? 0,
          avgError: colmapData.imageAvgError.get(imageDetailId) ?? 0,
          covisibleCount: colmapData.imageCovisibleCount.get(imageDetailId) ?? 0,
        }
      : null;
    const triangulated = stats?.numPoints3D ?? 0;
    return { numPoints2D: total, numPoints3D: triangulated };
  }, [image, colmapData, imageDetailId]);

  const connectedImages = useMemo(() => {
    if (!colmapData || imageDetailId === null) return [];

    const connections = colmapData.imagePairCovisibilityCount.get(imageDetailId);
    if (!connections) return [];

    return Array.from(connections.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({
        imageId: id,
        matchCount: count,
        name: colmapData.images.get(id)?.name || `Image ${id}`
      }));
  }, [colmapData, imageDetailId]);

  const matchedImage = matchedImageId !== null ? colmapData?.images.get(matchedImageId) : null;
  const matchedCamera = matchedImage ? colmapData?.cameras.get(matchedImage.cameraId) : null;
  const matchedImageFile = useMemo(() => {
    if (!matchedImage) return null;
    return resolveImageFromLoaded(loadedFiles, matchedImage.name) ?? null;
  }, [matchedImage, loadedFiles, zipImageCacheVersion]);
  const matchedImageSrc = useFileUrl(matchedImageFile);

  const effectivePoints2D = useMemo(() => {
    return image?.points2D ?? [];
  }, [image]);

  const matchedPoints2D = useMemo(() => {
    return matchedImage?.points2D ?? [];
  }, [matchedImage]);

  const matchLines = useMemo(() => {
    if (!showMatchesInModal || !image || !matchedImage) return [];
    if (effectivePoints2D.length === 0 || matchedPoints2D.length === 0) return [];

    const point3DToPoint1 = new Map();
    for (const p of effectivePoints2D) {
      if (p.point3DId !== BigInt(-1)) {
        point3DToPoint1.set(p.point3DId, p.xy);
      }
    }

    const lines = [];
    for (const p of matchedPoints2D) {
      if (p.point3DId !== BigInt(-1)) {
        const point1 = point3DToPoint1.get(p.point3DId);
        if (point1) {
          lines.push({ point1, point2: p.xy });
        }
      }
    }

    return lines;
  }, [showMatchesInModal, image, matchedImage, effectivePoints2D, matchedPoints2D]);

  const currentMatchCount = matchLines.length;

  const isMatchViewMode = showMatchesInModal && matchedImageId !== null && matchedImage && matchedCamera;

  const handleMatchedImageWheel = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (connectedImages.length === 0) return;

    const currentIdx = connectedImages.findIndex(img => img.imageId === matchedImageId);
    if (currentIdx === -1) {
      if (connectedImages.length > 0) {
        setMatchedImageId(connectedImages[0].imageId);
      }
      return;
    }

    const delta = e.deltaY > 0 ? 1 : -1;
    const newIdx = (currentIdx + delta + connectedImages.length) % connectedImages.length;
    setMatchedImageId(connectedImages[newIdx].imageId);
  }, [connectedImages, matchedImageId, setMatchedImageId]);

  // ESC 键关闭
  useEffect(() => {
    if (!imageDetailId) return;
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeImageDetail();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [imageDetailId, closeImageDetail]);

  // Handle mouse wheel scrolling on image to navigate between images
  const lastWheelTime = useRef(0);
  const WHEEL_THROTTLE_MS = 100;

  useEffect(() => {
    const container = imageContainerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      e.preventDefault();
      e.stopPropagation(); // 阻止事件冒泡到 3D 窗口

      const now = Date.now();
      if (now - lastWheelTime.current < WHEEL_THROTTLE_MS) return;
      lastWheelTime.current = now;

      if (showMatchesInModal && connectedImages.length > 0) {
        const currentMatchIndex = matchedImageId !== null
          ? connectedImages.findIndex(img => img.imageId === matchedImageId)
          : -1;

        if (e.deltaY > 0) {
          const nextIndex = currentMatchIndex + 1;
          if (nextIndex < connectedImages.length) {
            setMatchedImageId(connectedImages[nextIndex].imageId);
          }
        } else if (e.deltaY < 0) {
          const prevIndex = currentMatchIndex - 1;
          if (prevIndex >= 0) {
            setMatchedImageId(connectedImages[prevIndex].imageId);
          }
        }
      } else {
        if (e.deltaY > 0) {
          goToNext();
        } else if (e.deltaY < 0) {
          goToPrev();
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [goToNext, goToPrev, showMatchesInModal, connectedImages, matchedImageId, setMatchedImageId]);

  const updateContainerSize = useCallback(() => {
    if (imageContainerRef.current) {
      setContainerSize({
        width: imageContainerRef.current.clientWidth,
        height: imageContainerRef.current.clientHeight,
      });
    }
  }, []);

  useEffect(() => {
    if (!imageContainerRef.current) return;

    updateContainerSize();

    const observer = new ResizeObserver(() => {
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = setTimeout(updateContainerSize, RESIZE_DEBOUNCE_MS);
    });

    observer.observe(imageContainerRef.current);
    return () => {
      observer.disconnect();
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
    };
  }, [updateContainerSize, imageDetailId]);

  const resizeTimeoutRef = useRef(undefined);

  // Memoize rendered image dimensions (single image mode；为相机详情预留底部高度，折叠/展开占不同高度)
  const cameraDetailReserveHeight = cameraDetailExpanded ? CAMERA_DETAIL_RESERVE_HEIGHT_EXPANDED : CAMERA_DETAIL_RESERVE_HEIGHT_COLLAPSED;
  const contentHeight = Math.max(0, containerSize.height - cameraDetailReserveHeight);
  const { renderedImageWidth, renderedImageHeight } = useMemo(() => {
    if (!camera || containerSize.width <= 0 || containerSize.height <= 0) {
      return { renderedImageWidth: 0, renderedImageHeight: 0 };
    }

    const originalAspect = camera.width / camera.height;
    const containerAspect = containerSize.width / contentHeight;

    if (contentHeight <= 0) {
      return { renderedImageWidth: 0, renderedImageHeight: 0 };
    }
    if (originalAspect > containerAspect) {
      return {
        renderedImageWidth: containerSize.width,
        renderedImageHeight: containerSize.width / originalAspect,
      };
    } else {
      return {
        renderedImageHeight: contentHeight,
        renderedImageWidth: contentHeight * originalAspect,
      };
    }
  }, [camera, containerSize.width, containerSize.height, contentHeight]);

  // Memoize rendered dimensions for side-by-side view (点匹配始终双槽；无关联图时右侧用占位尺寸；为下拉框预留底部高度)
  const sideBySideDimensions = useMemo(() => {
    if (!camera || containerSize.width <= 0 || containerSize.height <= 0) {
      return { image1Width: 0, image1Height: 0, image2Width: 0, image2Height: 0, halfWidth: 0, slot2Height: 0 };
    }

    const halfWidth = (containerSize.width - GAP_MATCH_VIEW) / 2;
    const height = containerSize.height - MATCH_DROPDOWN_ROW_HEIGHT;
    const containerAspect = halfWidth / height;

    const aspect1 = camera.width / camera.height;
    const image1Width = aspect1 > containerAspect ? halfWidth : height * aspect1;
    const image1Height = aspect1 > containerAspect ? halfWidth / aspect1 : height;

    let image2Width = halfWidth;
    let image2Height = height;
    if (matchedCamera) {
      const aspect2 = matchedCamera.width / matchedCamera.height;
      image2Width = aspect2 > containerAspect ? halfWidth : height * aspect2;
      image2Height = aspect2 > containerAspect ? halfWidth / aspect2 : height;
    }

    return { image1Width, image1Height, image2Width, image2Height, halfWidth, slot2Height: height };
  }, [camera, matchedCamera, containerSize.width, containerSize.height]);

  if (imageDetailId === null || !image || !camera) return null;

  // 点匹配模式：始终双槽布局；未选关联图时右侧显示灰色占位
  if (viewMode === 'matches') {

    return (
      <div className="flex flex-col flex-1 overflow-hidden px-4 pt-1 pb-4 gap-2 h-full">
        {/* 两图对比模式：隐藏相机详情 */}
        {/* 互斥 Tab：2D点 / 3D点 / 点匹配 */}
        <div className="flex-shrink-0 detail-view-tabs">
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'points2d' ? null : 'points2d')}
            className={`detail-view-tab ${viewMode === 'points2d' ? 'detail-view-tab-active' : ''}`}
          >
            {t('points2D')}{numPoints2D > 0 && <span className="detail-view-tab-count">({numPoints2D})</span>}
          </button>
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'points3d' ? null : 'points3d')}
            className={`detail-view-tab ${viewMode === 'points3d' ? 'detail-view-tab-active' : ''}`}
          >
            {t('points3D')}{numPoints3D > 0 && <span className="detail-view-tab-count">({numPoints3D})</span>}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('matches')}
            className="detail-view-tab detail-view-tab-active"
          >
            {t('pointMatches')}{currentMatchCount > 0 && <span className="detail-view-tab-count">({currentMatchCount})</span>}
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          <div
            ref={imageContainerRef}
            className="group/scroll relative flex-1 min-h-0 bg-ds-secondary rounded overflow-hidden"
            style={{ paddingBottom: MATCH_DROPDOWN_ROW_HEIGHT }}
          >
            {(() => {
              const halfWidth = (containerSize.width - GAP_MATCH_VIEW) / 2;
              const contentHeight = containerSize.height - MATCH_DROPDOWN_ROW_HEIGHT;
              const offset1X = (halfWidth - sideBySideDimensions.image1Width) / 2;
              const offset1Y = (contentHeight - sideBySideDimensions.image1Height) / 2;
              const offset2X = halfWidth + GAP_MATCH_VIEW + (halfWidth - sideBySideDimensions.image2Width) / 2;
              const offset2Y = (contentHeight - sideBySideDimensions.image2Height) / 2;
              const hasMatched = matchedImage && matchedCamera;
              const rightSlotLeft = hasMatched ? offset2X : halfWidth + GAP_MATCH_VIEW + (halfWidth - sideBySideDimensions.image1Width) / 2;
              const rightSlotWidth = hasMatched ? sideBySideDimensions.image2Width : sideBySideDimensions.image1Width;
              const rightSlotBottom = hasMatched ? offset2Y + sideBySideDimensions.image2Height : (contentHeight - sideBySideDimensions.image1Height) / 2 + sideBySideDimensions.image1Height;

              return (
                <>
                  {sideBySideDimensions.image1Width > 0 && (imageSrc ? (
                    <img
                      src={imageSrc}
                      alt={image.name}
                      className="absolute object-contain"
                      style={{
                        width: sideBySideDimensions.image1Width,
                        height: sideBySideDimensions.image1Height,
                        left: offset1X,
                        top: offset1Y,
                      }}
                      draggable={false}
                    />
                  ) : (
                    <div className="absolute" style={{ left: offset1X, top: offset1Y }}>
                      <ImagePlaceholder
                        width={sideBySideDimensions.image1Width}
                        height={sideBySideDimensions.image1Height}
                        cameraWidth={camera.width}
                        cameraHeight={camera.height}
                        label={image.name}
                      />
                    </div>
                  ))}
                  {/* 右侧槽位：有关联图则显示图像，否则显示灰色占位 + 请选择图片 */}
                  {hasMatched ? (
                    sideBySideDimensions.image2Width > 0 && (matchedImageSrc ? (
                      <img
                        src={matchedImageSrc}
                        alt={matchedImage?.name || ''}
                        className="absolute object-contain"
                        style={{
                          width: sideBySideDimensions.image2Width,
                          height: sideBySideDimensions.image2Height,
                          left: offset2X,
                          top: offset2Y,
                        }}
                        draggable={false}
                      />
                    ) : (
                      <div className="absolute" style={{ left: offset2X, top: offset2Y }}>
                        <ImagePlaceholder
                          width={sideBySideDimensions.image2Width}
                          height={sideBySideDimensions.image2Height}
                          cameraWidth={matchedCamera.width}
                          cameraHeight={matchedCamera.height}
                          label={matchedImage?.name}
                        />
                      </div>
                    ))
                  ) : (
                    <div
                      className="absolute flex items-center justify-center bg-ds-tertiary border border-ds"
                      style={{
                        left: halfWidth + GAP_MATCH_VIEW + (halfWidth - sideBySideDimensions.image1Width) / 2,
                        top: (contentHeight - sideBySideDimensions.image1Height) / 2,
                        width: sideBySideDimensions.image1Width,
                        height: sideBySideDimensions.image1Height,
                      }}
                    >
                      <span className="text-ds-muted text-sm">{t('selectImage')}</span>
                    </div>
                  )}
                  {matchLines.length > 0 && hasMatched && sideBySideDimensions.image1Width > 0 && sideBySideDimensions.image2Width > 0 && (
                    <MatchCanvas
                      lines={matchLines}
                      image1Camera={camera}
                      image2Camera={matchedCamera}
                      image1Width={sideBySideDimensions.image1Width}
                      image1Height={sideBySideDimensions.image1Height}
                      image2Width={sideBySideDimensions.image2Width}
                      image2Height={sideBySideDimensions.image2Height}
                      containerWidth={containerSize.width}
                      containerHeight={contentHeight}
                      gap={GAP_MATCH_VIEW}
                      lineOpacity={OPACITY_MATCH_LINES}
                    />
                  )}
                  {/* 下拉框：与右侧图片等宽，紧贴右侧图片底部；框内右侧为滚轮图标 + 下拉三角 */}
                  <div
                    className="detail-match-select-wrap absolute z-10"
                    style={{
                      left: rightSlotLeft,
                      top: rightSlotBottom + 6,
                      width: rightSlotWidth,
                    }}
                  >
                    <select
                      value={matchedImageId ?? ''}
                      onChange={(e) => setMatchedImageId(e.target.value ? parseInt(e.target.value) : null)}
                      onWheel={handleMatchedImageWheel}
                      className="detail-match-select w-full py-1.5 px-2 pr-[52px] text-xs bg-ds-input text-ds-primary border border-ds rounded focus:outline-none focus:border-ds-light"
                    >
                      <option value="">{t('selectRelatedImage')}</option>
                      {connectedImages.map(({ imageId, matchCount, name }) => (
                        <option key={imageId} value={imageId}>
                          {name} ({matchCount} {t('matches')})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="detail-match-select-chevron w-4 h-4 text-ds-muted pointer-events-none" aria-hidden />
                    <span
                      className="detail-match-select-scroll-hint"
                      aria-label={t('scrollWheelSwitchImage')}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setMatchSelectScrollTooltip({
                          show: true,
                          top: rect.top - 8,
                          left: rect.right,
                        });
                      }}
                      onMouseLeave={() => setMatchSelectScrollTooltip((prev) => ({ ...prev, show: false }))}
                    >
                      <MouseScrollIcon className="w-4 h-4 text-ds-muted" />
                    </span>
                  </div>
                </>
              );
            })()}
          </div>
          {matchSelectScrollTooltip.show && createPortal(
            <div
              style={{
                position: 'fixed',
                top: `${matchSelectScrollTooltip.top}px`,
                left: `${matchSelectScrollTooltip.left}px`,
                transform: 'translate(-100%, -100%)',
                padding: '6px 10px',
                borderRadius: '4px',
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                fontSize: '12px',
                boxShadow: 'var(--shadow-md)',
                border: '1px solid var(--border-light)',
                zIndex: 10000,
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                lineHeight: 1.4,
              }}
            >
              {t('scrollWheelSwitchImage')}
            </div>,
            document.body
          )}

          <div className="detail-pagination">
              <div className="detail-pagination-group">
                <button type="button" onClick={goToPrev} disabled={!hasPrev}>{t('prevImage')}</button>
                <div className="detail-pagination-input-wrap">
                  <input
                    type="text"
                    defaultValue={imageDetailId ?? ''}
                    key={imageDetailId}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') {
                        const id = parseInt(e.target.value);
                        if (!isNaN(id) && colmapData?.images.has(id)) openImageDetail(id);
                        e.target.blur();
                      } else if (e.key === 'Escape') {
                        e.target.value = String(imageDetailId ?? '');
                        e.target.blur();
                      }
                    }}
                    onBlur={(e) => { e.target.value = String(imageDetailId ?? ''); }}
                  />
                  <span className="detail-pagination-total">/ {imageIds.length}</span>
                </div>
                <button type="button" onClick={goToNext} disabled={!hasNext}>{t('nextImage')}</button>
                {/* 两图对比模式：底部翻页不显示滚轮图标（滚轮用于切换关联图，更符合直觉） */}
              </div>
            </div>
        </div>
      </div>
    );
  }

  const offsetX = (containerSize.width - renderedImageWidth) / 2;
  const offsetY = (contentHeight - renderedImageHeight) / 2;
  const cameraDetailTop = offsetY + renderedImageHeight + 6;

  return (
    <div className="flex flex-col flex-1 overflow-hidden px-4 pt-1 pb-4 gap-2 h-full">
      {/* 互斥 Tab：2D点 / 3D点 / 点匹配 */}
      <div className="flex-shrink-0 detail-view-tabs">
        <button
          type="button"
          onClick={() => setViewMode(viewMode === 'points2d' ? null : 'points2d')}
          className={`detail-view-tab ${viewMode === 'points2d' ? 'detail-view-tab-active' : ''}`}
        >
          {t('points2D')}{numPoints2D > 0 && <span className="detail-view-tab-count">({numPoints2D})</span>}
        </button>
        <button
          type="button"
          onClick={() => setViewMode(viewMode === 'points3d' ? null : 'points3d')}
          className={`detail-view-tab ${viewMode === 'points3d' ? 'detail-view-tab-active' : ''}`}
        >
          {t('points3D')}{numPoints3D > 0 && <span className="detail-view-tab-count">({numPoints3D})</span>}
        </button>
        <button
          type="button"
          onClick={() => setViewMode('matches')}
          className={`detail-view-tab ${viewMode === 'matches' ? 'detail-view-tab-active' : ''}`}
        >
          {t('pointMatches')}{connectedImages.length > 0 && <span className="detail-view-tab-count">({connectedImages.reduce((s, c) => s + c.matchCount, 0)})</span>}
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <div
          ref={imageContainerRef}
          className="group/scroll relative flex-1 min-h-0 bg-ds-secondary rounded overflow-hidden"
          style={{ paddingBottom: cameraDetailReserveHeight, ...alphaBgStyle }}
        >
          {/* alpha 背景切换按钮 */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); cycleAlphaBg(); }}
            title={t(alphaBgMode === 'panel' ? 'alphaBgPanel' : alphaBgMode === 'red' ? 'alphaBgRed' : 'alphaBgChecker')}
            className="absolute top-2 right-2 z-10 w-7 h-7 flex items-center justify-center rounded bg-ds-void/50 hover:bg-ds-void/80 text-ds-secondary/70 hover:text-ds-secondary transition-opacity opacity-0 group-hover/scroll:opacity-100"
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
          {hasMask && maskSrc && (() => {
            const nextMode = maskMode === 'hover' ? 'mask' : maskMode === 'mask' ? 'split' : maskMode === 'split' ? 'image' : 'hover';
            const modeLabel = (m) => t(m === 'hover' ? 'maskModeHover' : m === 'mask' ? 'maskModeMask' : m === 'split' ? 'maskModeSplit' : 'maskModeImage');
            return (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 px-2 py-1 bg-ds-void/70 text-ds-secondary text-xs rounded opacity-0 group-hover/scroll:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                <span>
                  {t('clickLabel')} <span className="text-ds-primary">{modeLabel(maskMode)}</span> → {modeLabel(nextMode)}
                </span>
              </div>
            );
          })()}
          <div
            className="group absolute inset-0"
            onClick={hasMask && maskSrc ? cycleMaskMode : undefined}
            onMouseMove={hasMask && maskSrc ? handleMaskMouseMove : undefined}
            onMouseLeave={hasMask && maskSrc ? handleMaskMouseLeave : undefined}
            style={{ cursor: hasMask && maskSrc ? 'pointer' : undefined }}
          >
            {renderedImageWidth > 0 && (imageSrc ? (
              <>
                <img
                  src={imageSrc}
                  alt={image.name}
                  className="absolute object-contain pointer-events-none"
                  style={{
                    width: renderedImageWidth,
                    height: renderedImageHeight,
                    left: offsetX,
                    top: offsetY,
                    opacity: maskMode === 'mask' ? 0 : 1,
                    clipPath: maskMode === 'split' ? `inset(0 ${(1 - splitX) * 100}% 0 0)` : undefined,
                  }}
                  draggable={false}
                />
                {hasMask && maskSrc && (
                  <img
                    src={maskSrc}
                    alt="mask"
                    className={`absolute object-contain pointer-events-none ${
                      maskMode === 'hover' ? 'opacity-0 group-hover:opacity-50' : ''
                    }`}
                    style={{
                      width: renderedImageWidth,
                      height: renderedImageHeight,
                      left: offsetX,
                      top: offsetY,
                      ...(maskMode !== 'hover' && {
                        opacity: maskMode === 'image' ? 0 : 1,
                      }),
                      clipPath: maskMode === 'split' ? `inset(0 0 0 ${splitX * 100}%)` : undefined,
                    }}
                    draggable={false}
                  />
                )}
              </>
            ) : (
              <div className="absolute" style={{ left: offsetX, top: offsetY }}>
                <ImagePlaceholder
                  width={renderedImageWidth}
                  height={renderedImageHeight}
                  cameraWidth={camera.width}
                  cameraHeight={camera.height}
                  label={t('noImageLoaded')}
                />
              </div>
            ))}
            {(showPoints2D || showPoints3D) && renderedImageWidth > 0 && effectivePoints2D.length > 0 && (
              <KeypointCanvas
                points2D={effectivePoints2D}
                camera={camera}
                imageWidth={renderedImageWidth}
                imageHeight={renderedImageHeight}
                containerWidth={containerSize.width}
                containerHeight={contentHeight}
                showPoints2D={showPoints2D}
                showPoints3D={showPoints3D}
              />
            )}
          </div>
          {/* 相机详情：放在图片容器内，绝对定位紧贴图片底部（与点匹配下拉框同理） */}
          <div
            className="absolute left-0 right-0 z-10"
            style={{ top: cameraDetailTop }}
          >
            <CollapsibleCameraDetail
              camera={camera}
              image={image}
              imageDetailId={imageDetailId}
              qvec={image.qvec}
              tvec={image.tvec}
              expanded={cameraDetailExpanded}
              onToggle={() => setCameraDetailExpanded((e) => !e)}
            />
          </div>
        </div>

        {viewMode === 'matches' && (
          <div className="detail-match-options">
            <select
              value={matchedImageId ?? ''}
              onChange={(e) => setMatchedImageId(e.target.value ? parseInt(e.target.value) : null)}
              onWheel={handleMatchedImageWheel}
            >
              <option value="">{t('selectRelatedImage')}</option>
              {connectedImages.map(({ imageId, matchCount, name }) => (
                <option key={imageId} value={imageId}>
                  {name} ({matchCount} {t('matches')})
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="detail-pagination">
          <div className="detail-pagination-group">
            <button type="button" onClick={goToPrev} disabled={!hasPrev}>{t('prevImage')}</button>
            <div className="detail-pagination-input-wrap">
              <input
                type="text"
                defaultValue={imageDetailId ?? ''}
                key={imageDetailId}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    const id = parseInt(e.target.value);
                    if (!isNaN(id) && colmapData?.images.has(id)) openImageDetail(id);
                    e.target.blur();
                  } else if (e.key === 'Escape') {
                    e.target.value = String(imageDetailId ?? '');
                    e.target.blur();
                  }
                }}
                onBlur={(e) => { e.target.value = String(imageDetailId ?? ''); }}
              />
              <span className="detail-pagination-total">/ {imageIds.length}</span>
            </div>
            <button type="button" onClick={goToNext} disabled={!hasNext}>{t('nextImage')}</button>
            <span
              className="detail-pagination-scroll-hint"
              aria-label={t('scrollWheelSwitchImage')}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setPaginationScrollTooltip({
                  show: true,
                  top: rect.top - 8,
                  left: rect.right,
                });
              }}
              onMouseLeave={() => setPaginationScrollTooltip((prev) => ({ ...prev, show: false }))}
            >
              <MouseScrollIcon className="w-4 h-4 text-ds-muted" />
            </span>
          </div>
          {paginationScrollTooltip.show && createPortal(
            <div
              style={{
                position: 'fixed',
                top: `${paginationScrollTooltip.top}px`,
                left: `${paginationScrollTooltip.left}px`,
                transform: 'translate(-100%, -100%)',
                padding: '6px 10px',
                borderRadius: '4px',
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                fontSize: '12px',
                boxShadow: 'var(--shadow-md)',
                border: '1px solid var(--border-light)',
                zIndex: 10000,
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                lineHeight: 1.4,
              }}
            >
              {t('scrollWheelSwitchImage')}
            </div>,
            document.body
          )}
        </div>
      </div>
    </div>
  );
}
