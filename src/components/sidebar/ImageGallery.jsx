import { useMemo, useState, useEffect, useRef, memo, startTransition, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAppContext, useSelection, useNavigation, useUI } from '../../AppContext';
import { useSetting } from '../../utils/settings';
import { resolveImageFromLoaded, resolveImageFromLoadedAsync, loadedFilesUseZip } from '../../utils/imageFileUtils';
import { Thumbnail, pauseThumbnailCache, resumeThumbnailCache } from './Thumbnail';
import { SelectRow } from '../common/SelectRow';
import { COLUMNS_DEFAULT, COLUMNS_MIN, COLUMNS_MAX, GAP_GALLERY, DEFAULT_CELL_HEIGHT, WHEEL_DEBOUNCE_MS, TRANSITION_BASE_MS } from '../../config';

const GalleryItem = memo(function GalleryItem({ img, isSelected, isMatched, matchesColor, matchesBlink, onClick, onDoubleClick, onRightClick, isScrolling, skipImages, isSettling, isResizing }) {
  const enabled = !isScrolling && !skipImages && !isSettling && !isResizing;

  // Click to select, click again on selected to show info
  const handleClick = () => {
    if (isSelected) {
      onDoubleClick(img.imageId);
    } else {
      onClick(img.imageId);
    }
  };

  // Determine border class and style based on selection/match state
  const borderClass = isSelected
    ? 'cu-gallery-item--selected'
    : isMatched && matchesBlink
      ? 'matches-blink'
      : '';
  const borderStyle = isMatched && !isSelected
    ? { borderColor: matchesColor }
    : {};

  return (
    <Thumbnail imageFile={img.file} imageName={img.name} enabled={enabled}>
      {(src) => (
    <div
      className={`cu-gallery-item-aspect group cu-gallery-item ${borderClass}`}
      style={{ position: 'relative', ...borderStyle }}
      onClick={handleClick}
      onContextMenu={(e) => { e.preventDefault(); onRightClick(img.imageId); }}
    >
      <div className="cu-gallery-item-inner">
        {src ? (
          <img src={src} alt={img.name} className="cu-gallery-item-image" draggable={false} />
        ) : (
          <div className="cu-gallery-item-placeholder">
            {isScrolling ? '...' : img.name}
          </div>
        )}
        {!isSelected && (
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background: `
                radial-gradient(
                  ellipse 100% 100% at center,
                  transparent 20%,
                  rgba(0,0,0,0.15) 40%,
                  rgba(0,0,0,0.4) 60%,
                  rgba(0,0,0,0.7) 80%,
                  rgba(0,0,0,0.9) 100%
                )
              `,
            }}
          />
        )}
      </div>
      <div className="cu-gallery-overlay z-20">
        <div className="cu-gallery-overlay-text">{img.name}</div>
      </div>
    </div>
      )}
    </Thumbnail>
  );
});

function chunkArray(array, chunkSize) {
  const result = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    result.push(array.slice(i, i + chunkSize));
  }
  return result;
}

export function ImageGallery({ isResizing = false }) {
  const { colmapData, loadedFiles } = useAppContext();
  const { openImageDetail, setShowMatchesInModal, setMatchedImageId } = useUI();
  const [matchesDisplayMode] = useSetting('ui', 'matchesDisplayMode');
  const [matchesColor] = useSetting('ui', 'matchesColor');
  const { selectedImageId, setSelectedImageId } = useSelection();
  const { 
    flyToImage, 
    currentViewState, 
    pushNavigationHistory, 
    popNavigationHistory, 
    peekNavigationHistory, 
    flyToState
  } = useNavigation();
  const [galleryColumns, setGalleryColumns] = useState(COLUMNS_DEFAULT);
  const [cameraFilter, setCameraFilter] = useState('all');
  const containerRef = useRef(null);
  // Track ZIP image cache version to trigger re-renders when images are fetched
  const [zipImageCacheVersion, setZipImageCacheVersion] = useState(0);

  // Compute matched image IDs when matches are shown (uses pre-computed imagePairCovisibilityCount)
  const matchedImageIds = useMemo(() => {
    if (!colmapData || selectedImageId === null || matchesDisplayMode === 'off') {
      return new Set();
    }
    const connections = colmapData.imagePairCovisibilityCount.get(selectedImageId);
    if (!connections) {
      return new Set();
    }
    return new Set(connections.keys());
  }, [colmapData, selectedImageId, matchesDisplayMode]);

  // Click handlers
  const handleClick = useCallback((imageId) => {
    setSelectedImageId(imageId);
  }, [setSelectedImageId]);

  const handleDoubleClick = useCallback((imageId) => {
    openImageDetail(imageId);
  }, [openImageDetail]);

  // Right-click selects and goes to image in 3D viewer (with navigation history tracking)
  const handleRightClick = useCallback((imageId) => {
    // Check if this is a matched camera (shares points with the selected camera)
    if (selectedImageId !== null && matchedImageIds.has(imageId)) {
      // Open image detail with this as the matched image (shared state with 3D viewer)
      setShowMatchesInModal(true);
      setMatchedImageId(imageId);
      openImageDetail(selectedImageId);
      return;
    }

    const lastEntry = peekNavigationHistory();

    // Check if we're clicking the same image we just flew to (trace back)
    if (currentViewState && lastEntry && lastEntry.toImageId === imageId) {
      // User wants to go back - pop and return
      const entry = popNavigationHistory();
      if (entry) {
        flyToState(entry.fromState);
        setSelectedImageId(entry.fromImageId);
      }
      return;
    }

    // Push current state to history and fly to the image
    if (currentViewState) {
      pushNavigationHistory({
        fromState: currentViewState,
        fromImageId: selectedImageId,
        toImageId: imageId,
      });
    }
    setSelectedImageId(imageId);
    flyToImage(imageId);
  }, [setSelectedImageId, flyToImage, currentViewState, peekNavigationHistory, popNavigationHistory, pushNavigationHistory, flyToState, selectedImageId, matchedImageIds, setShowMatchesInModal, setMatchedImageId, openImageDetail]);

  // Reset camera filter when colmapData changes
  useEffect(() => {
    setCameraFilter('all');
  }, [colmapData]);

  // Debounce loading after filter/sort/selection changes to let virtual list settle
  const [isSettling, setIsSettling] = useState(false);
  const settleRef = useRef(null);

  useEffect(() => {
    // Pause loading when filter, sort, or selection changes (selection triggers scroll)
    setIsSettling(true);
    pauseThumbnailCache();

    if (settleRef.current !== null) {
      clearTimeout(settleRef.current);
    }

    settleRef.current = setTimeout(() => {
      setIsSettling(false);
      resumeThumbnailCache();
      settleRef.current = null;
    }, 50); // Short delay to let virtual list settle

    return () => {
      if (settleRef.current !== null) {
        clearTimeout(settleRef.current);
      }
    };
  }, [cameraFilter, selectedImageId]);

  const cameras = useMemo(() => {
    if (!colmapData) return [];
    return Array.from(colmapData.cameras.values()).sort((a, b) => a.cameraId - b.cameraId);
  }, [colmapData]);

  const cameraOptions = useMemo(() => {
    if (!colmapData) return [];
    const opts = [{ value: 'all', label: '所有相机' }];
    for (const cam of cameras) {
      opts.push({ value: cam.cameraId, label: `相机 ${cam.cameraId}` });
    }
    return opts;
  }, [cameras]);

  const images = useMemo(() => {
    if (!colmapData) return [];

    const mapped = Array.from(colmapData.images.values())
      .filter((img) => cameraFilter === 'all' || img.cameraId === cameraFilter)
      .map((img) => {
        const numPoints3D = colmapData.imageNumPoints3D.get(img.imageId) ?? 0;
        const covisibleCount = colmapData.imageCovisibleCount.get(img.imageId) ?? 0;
        const avgError = colmapData.imageAvgError.get(img.imageId) ?? 0;
        const camera = colmapData.cameras.get(img.cameraId);

        const file = resolveImageFromLoaded(loadedFiles, img.name);

        return {
          imageId: img.imageId,
          name: img.name,
          file,
          numPoints2D: img.numPoints2D ?? img.points2D.length,
          numPoints3D,
          cameraId: img.cameraId,
          cameraWidth: camera?.width ?? 0,
          cameraHeight: camera?.height ?? 0,
          covisibleCount,
          avgError,
        };
      });

    // Fixed order by imageId
    mapped.sort((a, b) => a.imageId - b.imageId);
    return mapped;
  }, [colmapData, loadedFiles, cameraFilter, zipImageCacheVersion]);

  // Handle shift+scroll to zoom with debouncing for performance
  const pendingColumnChange = useRef(null);
  const wheelTimeoutRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      // Only intercept shift+scroll, let regular scroll be handled normally
      if (!e.shiftKey) return;
      e.preventDefault();

      // Calculate new column value
      const delta = e.deltaY > 0 ? 1 : -1;
      const currentColumns = pendingColumnChange.current ?? galleryColumns;
      const newColumns = Math.max(COLUMNS_MIN, Math.min(COLUMNS_MAX, currentColumns + delta));
      pendingColumnChange.current = newColumns;

      // Debounce with setTimeout for better batching
      if (wheelTimeoutRef.current !== null) {
        clearTimeout(wheelTimeoutRef.current);
      }

      wheelTimeoutRef.current = setTimeout(() => {
        const finalColumns = pendingColumnChange.current;
        pendingColumnChange.current = null;
        wheelTimeoutRef.current = null;

        if (finalColumns !== null && finalColumns !== galleryColumns) {
          startTransition(() => {
            setGalleryColumns(finalColumns);
          });
        }
      }, WHEEL_DEBOUNCE_MS);
    };

    container.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => {
      container.removeEventListener('wheel', handleWheel, { capture: true });
      if (wheelTimeoutRef.current !== null) {
        clearTimeout(wheelTimeoutRef.current);
      }
    };
  }, [galleryColumns]);

  // Grid layout
  const rows = useMemo(() => chunkArray(images, galleryColumns), [images, galleryColumns]);

  // Row virtualizer for gallery grid - uses measureElement for actual row heights
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual library is compatible despite compiler warning
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => DEFAULT_CELL_HEIGHT + GAP_GALLERY, // Estimate, actual size from measureElement
    overscan: 5
  });

  // Debounced scroll state: immediately block loads when scrolling, debounce re-enabling after stop
  const [debouncedIsScrolling, setDebouncedIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef(null);
  const currentIsScrolling = rowVirtualizer.isScrolling;

  useEffect(() => {
    if (currentIsScrolling) {
      // Immediately block thumbnail loads when scrolling starts
      if (scrollTimeoutRef.current !== null) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
      setDebouncedIsScrolling(true);
      pauseThumbnailCache(); // Pause idle processing during scroll
    } else {
      // Debounce re-enabling loads after scrolling stops (wait for scroll to settle)
      if (scrollTimeoutRef.current === null) {
        scrollTimeoutRef.current = setTimeout(() => {
          setDebouncedIsScrolling(false);
          resumeThumbnailCache(); // Resume idle processing
          scrollTimeoutRef.current = null;
        }, TRANSITION_BASE_MS); // 150ms delay after scroll stops
      }
    }

    return () => {
      if (scrollTimeoutRef.current !== null) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [currentIsScrolling]);

  // Fetch visible images from ZIP when in ZIP mode
  useEffect(() => {
    if (!loadedFilesUseZip(loadedFiles) || !colmapData || debouncedIsScrolling || isSettling) return;

    const visibleItems = rowVirtualizer.getVirtualItems();
    const toFetch = [];
    for (const virtualItem of visibleItems) {
      const rowImages = rows[virtualItem.index] || [];
      for (const img of rowImages) {
        if (img && !resolveImageFromLoaded(loadedFiles, img.name)) {
          toFetch.push(img.name);
        }
      }
    }

    if (toFetch.length === 0) return;

    let cancelled = false;
    const fetchBatch = async () => {
      const BATCH_SIZE = 5;
      for (let i = 0; i < toFetch.length && !cancelled; i += BATCH_SIZE) {
        const batch = toFetch.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map((name) => resolveImageFromLoadedAsync(loadedFiles, name))
        );
        if (!cancelled && results.some((f) => f !== null)) {
          setZipImageCacheVersion((v) => v + 1);
        }
      }
    };

    fetchBatch();

    return () => {
      cancelled = true;
    };
  }, [loadedFiles, colmapData, rows, images, debouncedIsScrolling, isSettling, rowVirtualizer]);

  // Scroll to selected image when selection changes (e.g., from 3D viewer frustum click)
  useEffect(() => {
    if (selectedImageId === null) return;

    const imageIndex = images.findIndex((img) => img.imageId === selectedImageId);
    if (imageIndex === -1) return;

    const rowIndex = Math.floor(imageIndex / galleryColumns);
    rowVirtualizer.scrollToIndex(rowIndex, { align: 'center', behavior: 'smooth' });
  }, [selectedImageId, images, galleryColumns, rowVirtualizer]);

  // Arrow key navigation for gallery
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (images.length === 0) return;

      const key = e.key;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return;

      e.preventDefault();

      const currentIndex = selectedImageId !== null
        ? images.findIndex((img) => img.imageId === selectedImageId)
        : -1;

      let newIndex;
      switch (key) {
        case 'ArrowLeft':
          newIndex = currentIndex <= 0 ? images.length - 1 : currentIndex - 1;
          break;
        case 'ArrowRight':
          newIndex = currentIndex >= images.length - 1 ? 0 : currentIndex + 1;
          break;
        case 'ArrowUp':
          newIndex = currentIndex - galleryColumns;
          if (newIndex < 0) newIndex = currentIndex;
          break;
        case 'ArrowDown':
          newIndex = currentIndex + galleryColumns;
          if (newIndex >= images.length) newIndex = currentIndex;
          break;
        default:
          return;
      }

      if (currentIndex === -1) {
        newIndex = (key === 'ArrowLeft' || key === 'ArrowUp') ? images.length - 1 : 0;
      }

      const newImageId = images[newIndex].imageId;

      if (e.shiftKey) {
        handleRightClick(newImageId);
      } else {
        handleClick(newImageId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images, selectedImageId, galleryColumns, handleClick, handleRightClick]);

  if (!colmapData) {
    return (
      <div className="empty-state">
        加载 COLMAP 数据以查看图像
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="empty-state">
        未找到图像
      </div>
    );
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--bg-secondary)'
    }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '4px',
        padding: '8px 12px',
        backgroundColor: 'var(--bg-tertiary)',
        borderBottom: '1px solid var(--border-primary)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
          <SelectRow
            label="相机"
            value={cameraFilter}
            onChange={(val) => setCameraFilter(val === 'all' ? 'all' : val)}
            options={cameraOptions}
            showLabel={false}
          />
        </div>
      </div>

      {/* Virtualized Content - flex-1 gets height from parent flex container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'auto',
          minHeight: 0,
          position: 'relative',
          padding: '8px'
        }}
      >
        <div
          style={{
            height: rowVirtualizer.getTotalSize(),
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const rowImages = rows[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                ref={rowVirtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                  display: 'grid',
                  gridTemplateColumns: `repeat(${galleryColumns}, 1fr)`,
                  gap: GAP_GALLERY,
                  paddingBottom: GAP_GALLERY,
                  willChange: 'transform',
                }}
              >
                {rowImages.map((img) => (
                  <GalleryItem
                    key={img.imageId}
                    img={img}
                    isSelected={selectedImageId === img.imageId}
                    isMatched={matchedImageIds.has(img.imageId)}
                    matchesColor={matchesColor}
                    matchesBlink={matchesDisplayMode === 'blink'}
                    onClick={handleClick}
                    onDoubleClick={handleDoubleClick}
                    onRightClick={handleRightClick}
                    isScrolling={debouncedIsScrolling}
                    skipImages={false}
                    isSettling={isSettling}
                    isResizing={isResizing}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
