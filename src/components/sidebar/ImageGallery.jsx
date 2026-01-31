import { useMemo, useState, useEffect, useRef, memo, startTransition, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { LayoutGrid, List, ArrowUp, ArrowDown } from 'lucide-react';
import { useAppContext, useSelection, useNavigation, useUI } from '../../AppContext';
import { useSetting } from '../../utils/settings';
import { resolveImageFromLoaded, resolveImageFromLoadedAsync, loadedFilesUseZip } from '../../utils/imageFileUtils';
import { Thumbnail, pauseThumbnailCache, resumeThumbnailCache } from './Thumbnail';
import { COLUMNS_DEFAULT, COLUMNS_MIN, COLUMNS_MAX, GAP_GALLERY, DEFAULT_CELL_HEIGHT, LIST_ROW_HEIGHT, WHEEL_DEBOUNCE_MS, TRANSITION_BASE_MS } from '../../config';

// Use lucide-react icons
const GridIcon = LayoutGrid;
const ListIcon = List;
const SortAscIcon = ArrowUp;
const SortDescIcon = ArrowDown;

const GalleryItem = memo(function GalleryItem({ img, isSelected, isMatched, matchesColor, matchesBlink, onClick, onDoubleClick, onRightClick, isScrolling, skipImages, isSettling, isResizing, wouldGoBack }) {
  const enabled = !isScrolling && !skipImages && !isSettling && !isResizing;
  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState(null);

  // Clear hover state when scrolling starts
  useEffect(() => {
    if (isScrolling && hovered) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional pattern to clear hover during scroll
      setHovered(false);
       
      setMousePos(null);
      document.body.style.cursor = '';
    }
  }, [isScrolling, hovered]);

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
      onPointerOver={(e) => {
        setHovered(true);
        setMousePos({ x: e.clientX, y: e.clientY });
        document.body.style.cursor = 'pointer';
      }}
      onPointerMove={(e) => {
        if (hovered) setMousePos({ x: e.clientX, y: e.clientY });
      }}
      onPointerOut={() => {
        setHovered(false);
        setMousePos(null);
        document.body.style.cursor = '';
      }}
    >
      {/* Inner wrapper clips image content without clipping tooltip */}
      <div className="cu-gallery-item-inner">
        {src ? (
          <img src={src} alt={img.name} className="cu-gallery-item-image" draggable={false} />
        ) : (
          <div className="cu-gallery-item-placeholder">
            {isScrolling ? '...' : img.name}
          </div>
        )}
        {/* Realistic lens vignette overlay - elliptical with smooth falloff (hidden when selected) */}
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
      {/* Image name overlay */}
      <div className="cu-gallery-overlay z-20">
        <div className="cu-gallery-overlay-text">{img.name}</div>
      </div>
      {/* Hover card - rendered via portal to body */}
      {hovered && mousePos && createPortal(
        <div
          style={{
            position: 'fixed',
            left: mousePos.x + 12,
            top: mousePos.y + 12,
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        >
          <div className="cu-hover-card">
            <div className="cu-hover-card-title">{img.name}</div>
            <div className="cu-hover-card-subtitle">#{img.imageId}</div>
            <div className="cu-hover-card-subtitle">{img.numPoints3D} 3D points</div>
            <div className="cu-hover-card-subtitle">{img.numPoints2D} 2D points</div>
            <div className="cu-hover-card-subtitle">{img.covisibleCount} covisible</div>
            <div className="cu-hover-card-subtitle">{img.avgError.toFixed(2)} avg error</div>
            <div className="cu-hover-card-hint">
              <div className="cu-hover-card-hint-row">
                <svg className="cu-hover-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="6" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                {isSelected ? 'Left: details' : 'Left: select'}
              </div>
              <div className="cu-hover-card-hint-row">
                <svg className="cu-hover-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="12" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                {isMatched ? 'Right: matches' : wouldGoBack ? 'Right: back' : 'Right: fly to'}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
      )}
    </Thumbnail>
  );
});

const ListItem = memo(function ListItem({ img, isSelected, isMatched, matchesColor, matchesBlink, onClick, onDoubleClick, onRightClick, isScrolling, skipImages, isSettling, isResizing, wouldGoBack }) {
  const enabled = !isScrolling && !skipImages && !isSettling && !isResizing;
  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState(null);

  // Clear hover state when scrolling starts
  useEffect(() => {
    if (isScrolling && hovered) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional pattern to clear hover during scroll
      setHovered(false);
       
      setMousePos(null);
      document.body.style.cursor = '';
    }
  }, [isScrolling, hovered]);

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
    ? 'cu-list-item--selected'
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
      onClick={handleClick}
      onContextMenu={(e) => { e.preventDefault(); onRightClick(img.imageId); }}
      onPointerOver={(e) => {
        setHovered(true);
        setMousePos({ x: e.clientX, y: e.clientY });
        document.body.style.cursor = 'pointer';
      }}
      onPointerMove={(e) => {
        if (hovered) setMousePos({ x: e.clientX, y: e.clientY });
      }}
      onPointerOut={() => {
        setHovered(false);
        setMousePos(null);
        document.body.style.cursor = '';
      }}
      className={`cu-list-item px-3 list-stats-container ${borderClass}`}
    >
      <div className="cu-list-thumbnail cu-list-thumbnail-size">
        {src ? (
          <img src={src} alt={img.name} className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="cu-list-thumbnail-placeholder">{img.imageId}</div>
        )}
      </div>
      <div className="cu-list-content">
        <div className="cu-list-title">{img.name}</div>
        <div className="cu-list-subtitle">ID {img.imageId} · Camera {img.cameraId} ({img.cameraWidth}×{img.cameraHeight})</div>
      </div>
      {/* Compact format for narrow panels - single column, 2 lines */}
      <div className="flex-shrink-0 text-right list-stats-compact">
        <div className="text-ds-primary text-xs whitespace-nowrap">{img.numPoints3D}<span className="text-ds-muted">/{img.numPoints2D}</span> · {img.covisibleCount} · {img.avgError.toFixed(2)}</div>
        <div className="text-ds-muted text-xs whitespace-nowrap">pts · covis · err</div>
      </div>
      {/* Full format for wider panels */}
      <div className="flex-shrink-0 text-right list-stats-full">
        <div className="text-ds-primary text-sm">{img.numPoints3D}<span className="text-ds-muted">/{img.numPoints2D}</span></div>
        <div className="text-ds-muted text-xs">3D/2D pts</div>
      </div>
      <div className="flex-shrink-0 text-right w-16 list-stats-full">
        <div className="text-ds-primary text-sm">{img.covisibleCount}</div>
        <div className="text-ds-muted text-xs">covisible</div>
      </div>
      <div className="flex-shrink-0 text-right w-16 list-stats-full">
        <div className="text-ds-primary text-sm">{img.avgError.toFixed(2)}</div>
        <div className="text-ds-muted text-xs">avg err</div>
      </div>
      {/* Hover card - simplified for list view (stats already visible in row) */}
      {hovered && mousePos && createPortal(
        <div
          style={{
            position: 'fixed',
            left: mousePos.x + 12,
            top: mousePos.y + 12,
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        >
          <div className="cu-hover-card">
            <div className="cu-hover-card-hint">
              <div className="cu-hover-card-hint-row">
                <svg className="cu-hover-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="6" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                {isSelected ? 'Left: details' : 'Left: select'}
              </div>
              <div className="cu-hover-card-hint-row">
                <svg className="cu-hover-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="12" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                {isMatched ? 'Right: matches' : wouldGoBack ? 'Right: back' : 'Right: fly to'}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
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

function getViewModeButtonClass(isActive) {
  return isActive ? 'cu-btn cu-btn--icon cu-btn--toggle-active' : 'cu-btn cu-btn--icon cu-btn--toggle';
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
    flyToState,
    navigationHistory 
  } = useNavigation();
  const [viewMode, setViewMode] = useState('gallery');
  const [galleryColumns, setGalleryColumns] = useState(COLUMNS_DEFAULT);
  const [cameraFilter, setCameraFilter] = useState('all');
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
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

  // Get the last navigation target for "back" hint display
  const lastNavigationToImageId = useMemo(() => {
    if (navigationHistory.length === 0) return null;
    return navigationHistory[navigationHistory.length - 1].toImageId;
  }, [navigationHistory]);

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
  }, [cameraFilter, sortField, sortDirection, selectedImageId]);

  const cameras = useMemo(() => {
    if (!colmapData) return [];
    return Array.from(colmapData.cameras.values()).sort((a, b) => a.cameraId - b.cameraId);
  }, [colmapData]);

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

    // Sort images
    const sortMultiplier = sortDirection === 'asc' ? 1 : -1;
    mapped.sort((a, b) => {
      if (sortField === 'name') {
        return sortMultiplier * a.name.localeCompare(b.name);
      }
      return sortMultiplier * (a[sortField] - b[sortField]);
    });

    return mapped;
  }, [colmapData, loadedFiles, cameraFilter, sortField, sortDirection, zipImageCacheVersion]);

  // Handle shift+scroll to zoom with debouncing for performance
  const pendingColumnChange = useRef(null);
  const wheelTimeoutRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || viewMode !== 'gallery') return;

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
  }, [viewMode, galleryColumns]);

  // Grid layout
  const rows = useMemo(() => chunkArray(images, galleryColumns), [images, galleryColumns]);
  const listRows = useMemo(() => images.map(img => [img]), [images]); // 1 item per row for list view

  // Row virtualizer for gallery grid - uses measureElement for actual row heights
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual library is compatible despite compiler warning
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => DEFAULT_CELL_HEIGHT + GAP_GALLERY, // Estimate, actual size from measureElement
    overscan: 5
  });

  // List virtualizer - fixed row height
   
  const listVirtualizer = useVirtualizer({
    count: listRows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => LIST_ROW_HEIGHT + GAP_GALLERY,
    overscan: 5
  });

  // Debounced scroll state: immediately block loads when scrolling, debounce re-enabling after stop
  const [debouncedIsScrolling, setDebouncedIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef(null);
  const currentIsScrolling = viewMode === 'gallery' ? rowVirtualizer.isScrolling : listVirtualizer.isScrolling;

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

    const visibleItems = viewMode === 'gallery'
      ? rowVirtualizer.getVirtualItems()
      : listVirtualizer.getVirtualItems();

    const toFetch = [];
    for (const virtualItem of visibleItems) {
      const rowImages = viewMode === 'gallery'
        ? rows[virtualItem.index] || []
        : [images[virtualItem.index]].filter(Boolean);

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
  }, [loadedFiles, colmapData, viewMode, rows, images, debouncedIsScrolling, isSettling, rowVirtualizer, listVirtualizer]);

  // Scroll to selected image when selection changes (e.g., from 3D viewer frustum click)
  useEffect(() => {
    if (selectedImageId === null) return;

    // Find the index of the selected image
    const imageIndex = images.findIndex((img) => img.imageId === selectedImageId);
    if (imageIndex === -1) return;

    if (viewMode === 'gallery') {
      const rowIndex = Math.floor(imageIndex / galleryColumns);
      rowVirtualizer.scrollToIndex(rowIndex, { align: 'center', behavior: 'smooth' });
    } else {
      // List view
      listVirtualizer.scrollToIndex(imageIndex, { align: 'center', behavior: 'smooth' });
    }
  }, [selectedImageId, images, viewMode, galleryColumns, rowVirtualizer, listVirtualizer]);

  // Arrow key navigation for gallery/list
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't handle if typing in input/textarea or no images
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (images.length === 0) return;

      const key = e.key;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return;

      e.preventDefault();

      // Find current index, default to -1 if nothing selected
      const currentIndex = selectedImageId !== null
        ? images.findIndex((img) => img.imageId === selectedImageId)
        : -1;

      let newIndex;

      if (viewMode === 'gallery') {
        // Gallery mode: up/down move by row, left/right move by 1
        switch (key) {
          case 'ArrowLeft':
            newIndex = currentIndex <= 0 ? images.length - 1 : currentIndex - 1;
            break;
          case 'ArrowRight':
            newIndex = currentIndex >= images.length - 1 ? 0 : currentIndex + 1;
            break;
          case 'ArrowUp':
            newIndex = currentIndex - galleryColumns;
            if (newIndex < 0) newIndex = currentIndex; // Stay at current if can't go up
            break;
          case 'ArrowDown':
            newIndex = currentIndex + galleryColumns;
            if (newIndex >= images.length) newIndex = currentIndex; // Stay at current if can't go down
            break;
          default:
            return;
        }
      } else {
        // List mode: up/down and left/right both navigate sequentially
        switch (key) {
          case 'ArrowLeft':
          case 'ArrowUp':
            newIndex = currentIndex <= 0 ? images.length - 1 : currentIndex - 1;
            break;
          case 'ArrowRight':
          case 'ArrowDown':
            newIndex = currentIndex >= images.length - 1 ? 0 : currentIndex + 1;
            break;
          default:
            return;
        }
      }

      // Handle nothing selected - start from first or last
      if (currentIndex === -1) {
        newIndex = (key === 'ArrowLeft' || key === 'ArrowUp') ? images.length - 1 : 0;
      }

      const newImageId = images[newIndex].imageId;

      if (e.shiftKey) {
        // Shift + arrow = right-click behavior (select and fly to)
        handleRightClick(newImageId);
      } else {
        // Arrow only = left-click behavior (just select)
        handleClick(newImageId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images, selectedImageId, viewMode, galleryColumns, handleClick, handleRightClick]);

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select
            value={cameraFilter}
            onChange={(e) => setCameraFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            className="input"
            style={{ fontSize: '12px', padding: '4px 8px' }}
          >
            <option value="all">所有相机 ({cameras.length})</option>
            {cameras.map((cam) => (
              <option key={cam.cameraId} value={cam.cameraId}>
                相机 {cam.cameraId} ({cam.width}×{cam.height})
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value)}
            className="input"
            style={{ fontSize: '12px', padding: '4px 8px' }}
          >
            <option value="name">排序: 名称</option>
            <option value="imageId">排序: 图像 ID</option>
            <option value="avgError">排序: 平均误差</option>
            <option value="covisibleCount">排序: 共视</option>
            <option value="numPoints3D">排序: 3D 点</option>
            <option value="numPoints2D">排序: 2D 点</option>
          </select>
          <button
            onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
            className="btn"
            style={{
              padding: '4px 8px',
              minWidth: '32px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title={sortDirection === 'asc' ? '升序' : '降序'}
          >
            {sortDirection === 'asc' ? <SortAscIcon style={{ width: '14px', height: '14px' }} /> : <SortDescIcon style={{ width: '14px', height: '14px' }} />}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
          <button
            onClick={() => setViewMode('gallery')}
            className="btn"
            style={{
              padding: '4px 8px',
              minWidth: '32px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: viewMode === 'gallery' ? 'var(--bg-active)' : 'transparent'
            }}
            title="网格视图 (Shift+滚动调整大小)"
          >
            <GridIcon style={{ width: '14px', height: '14px' }} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className="btn"
            style={{
              padding: '4px 8px',
              minWidth: '32px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: viewMode === 'list' ? 'var(--bg-active)' : 'transparent'
            }}
            title="列表视图（带统计信息）"
          >
            <ListIcon style={{ width: '14px', height: '14px' }} />
          </button>
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
        {viewMode === 'gallery' ? (
            // Gallery Grid View - virtualize rows
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
                        wouldGoBack={img.imageId === lastNavigationToImageId}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            // List View - 1 item per row
            <div
              style={{
                height: listVirtualizer.getTotalSize(),
                width: '100%',
                position: 'relative',
              }}
            >
              {listVirtualizer.getVirtualItems().map((virtualRow) => {
                const img = listRows[virtualRow.index][0];
                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                      willChange: 'transform',
                    }}
                  >
                    <ListItem
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
                      wouldGoBack={img.imageId === lastNavigationToImageId}
                    />
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}
