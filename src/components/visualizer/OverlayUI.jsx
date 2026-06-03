/**
 * 3D viewer control panel: layers, point cloud, cameras, transform, export.
 */

import { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react';
import { useAppContext, useSelection, useNavigation, useUI, useT } from '../../AppContext';
import { useSetting, useSettings } from '../../utils/settings';
import { settings } from '../../utils/settings';
import { getTooltipProps } from '../../utils/tooltip';
import { saveColmapAsZip } from '../../codec/export/exportingUtils.js';
import { buildImageFilesForExport } from '../../utils/imageFileUtils.js';
import { interpolateColor } from '../../utils/colorUtils';
import { Download, Move, Image, Eye, Settings, ChevronDown, Check, MoreVertical } from 'lucide-react';
import { FrustumWireframeIcon } from '../../assets/custom_icons';
import { SliderRow } from '../common/SliderRow.jsx';
import { SelectRow } from '../common/SelectRow.jsx';
import { OverlayUIButton } from '../common/OverlayUIButton.jsx';
import { PanelWrapper } from '../common/PanelWrapper.jsx';
import { GammaSliderRow } from '../common/GammaSliderRow.jsx';
import { SettingsModal } from '../common/SettingsModal';


// Color map legend (gamma-corrected)
const ColorMapLegend = memo(function ColorMapLegend({ startColor, endColor, minValue, maxValue, gamma }) {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw gamma-corrected gradient
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;
    
    for (let x = 0; x < width; x++) {
      // Normalized position (0-1)
      const normalizedPos = x / (width - 1);
      // Apply gamma
      const gammaCorrected = Math.pow(Math.max(0, Math.min(1, normalizedPos)), gamma);
      // Interpolate color
      const [r, g, b] = interpolateColor(startColor, endColor, gammaCorrected);
      
      // Fill column pixels
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4;
        data[idx] = Math.round(r * 255);     // R
        data[idx + 1] = Math.round(g * 255); // G
        data[idx + 2] = Math.round(b * 255); // B
        data[idx + 3] = 255;                 // A
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
  }, [startColor, endColor, gamma]);
  
  // Format display value
  const formatValue = (val) => {
    if (val % 1 === 0) {
      return String(val);
    }
    return val.toFixed(2);
  };
  
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '4px',
      marginTop: '-6px',
      marginBottom: '4px',
      marginLeft: '1px',
      marginRight: '1px',
    }}>
      <canvas
        ref={canvasRef}
        width={200}
        height={8}
        style={{
          width: '100%',
          height: '8px',
          borderRadius: '4px',
          flexShrink: 0,
          display: 'block'
        }}
      />
      <div style={{
        fontSize: '11px',
        color: 'var(--text-muted)',
        display: 'flex',
        justifyContent: 'space-between',
        lineHeight: '1.2'
      }}>
        <span>{formatValue(minValue)}</span>
        <span>{formatValue(maxValue)}</span>
      </div>
    </div>
  );
});

// Panel open/close state
function usePanelState() {
  const [currentPanel, setCurrentPanel] = useState(null);
  
  const openPanel = useCallback((panelId) => {
    setCurrentPanel(prev => prev === panelId ? null : panelId);
  }, []);
  
  const closePanel = useCallback(() => {
    setCurrentPanel(null);
  }, []);
  
  return { currentPanel, openPanel, closePanel };
}

// Layers panel (click to expand, not hover)
function LayersPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef(null);
  const t = useT();

  // State from settings
  const [axesDisplayMode, setAxesDisplayMode] = useSetting('ui', 'axesDisplayMode');
  const [cameraDisplayMode, setCameraDisplayMode] = useSetting('camera', 'cameraDisplayMode');
  const [showFrustumWireframes, setShowFrustumWireframes] = useSetting('camera', 'showFrustumWireframes');
  const [showImagePlane, setShowImagePlane] = useSetting('camera', 'showImagePlane');
  const [backgroundColor, setBackgroundColor] = useSetting('ui', 'backgroundColor');
  const { colmapData } = useAppContext();

  const hasPointCloudData = !!colmapData;

  const toggleWorldGrid = useCallback(() => {
    const modes = ['off', 'axes', 'grid', 'both'];
    let nextMode;
    
    if (axesDisplayMode === 'off' || axesDisplayMode === 'axes') {
      // If grid off, turn on (grid or both)
      nextMode = axesDisplayMode === 'off' ? 'grid' : 'both';
    } else {
      // If grid on, turn off
      nextMode = axesDisplayMode === 'grid' ? 'off' : 'axes';
    }
    setAxesDisplayMode(nextMode);
  }, [axesDisplayMode, setAxesDisplayMode]);

  const toggleAxis = useCallback(() => {
    const modes = ['off', 'axes', 'grid', 'both'];
    let nextMode;
    
    if (axesDisplayMode === 'off' || axesDisplayMode === 'grid') {
      // If axes off, turn on (axes or both)
      nextMode = axesDisplayMode === 'off' ? 'axes' : 'both';
    } else {
      // If axes on, turn off
      nextMode = axesDisplayMode === 'axes' ? 'off' : 'grid';
    }
    setAxesDisplayMode(nextMode);
  }, [axesDisplayMode, setAxesDisplayMode]);

  const toggleCameras = useCallback(() => {
    if (cameraDisplayMode === 'off') {
      setCameraDisplayMode('on');
    } else {
      setCameraDisplayMode('off');
    }
  }, [cameraDisplayMode, setCameraDisplayMode]);

  const toggleFrustumWireframes = useCallback((e) => {
    e.stopPropagation();
    setShowFrustumWireframes(!showFrustumWireframes);
  }, [showFrustumWireframes, setShowFrustumWireframes]);

  const toggleImagePlane = useCallback((e) => {
    e.stopPropagation();
    setShowImagePlane(!showImagePlane);
  }, [showImagePlane, setShowImagePlane]);

  const toggleBackground = useCallback(() => {
    // Cycle: dark gray -> black -> white -> dark gray
    const colors = ['#2d2d30', '#000000', '#ffffff'];
    const normalizedBg = backgroundColor.trim().toLowerCase();
    const currentIndex = colors.findIndex(c => c === normalizedBg);
    const nextIndex = (currentIndex + 1) % colors.length;
    setBackgroundColor(colors[nextIndex]);
  }, [backgroundColor, setBackgroundColor]);

  const worldGridVisible = axesDisplayMode === 'grid' || axesDisplayMode === 'both';
  const axisVisible = axesDisplayMode === 'axes' || axesDisplayMode === 'both';
  const camerasVisible = cameraDisplayMode === 'on';

  // Track which secondary menus are open (Set for multiple)
  const [openSecondaryMenus, setOpenSecondaryMenus] = useState(new Set());
  
  const hasSecondaryMenuOpen = openSecondaryMenus.size > 0;
  
  const handleSecondaryMenuChange = useCallback((menuId, isOpen) => {
    setOpenSecondaryMenus(prev => {
      const next = new Set(prev);
      if (isOpen) {
        next.add(menuId);
      } else {
        next.delete(menuId);
      }
      return next;
    });
  }, []);

  const handleCamerasMenuChange = useCallback((isOpen) => {
    handleSecondaryMenuChange('cameras', isOpen);
  }, [handleSecondaryMenuChange]);

  const handlePointCloudMenuChange = useCallback((isOpen) => {
    handleSecondaryMenuChange('pointcloud', isOpen);
  }, [handleSecondaryMenuChange]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  // Clear secondary menus when main panel closes
  useEffect(() => {
    if (!isOpen) {
      setOpenSecondaryMenus(new Set());
    }
  }, [isOpen]);

  // ESC closes main panel (when no secondary menu open)
  useEffect(() => {
    if (!isOpen || hasSecondaryMenuOpen) return;
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, hasSecondaryMenuOpen]);

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`group cu-control-btn ${isOpen ? 'cu-control-btn--hover' : 'cu-control-btn--inactive'}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          width: 'auto',
          padding: '8px 12px',
        }}
      >
        <Settings className="w-6 h-6" />
        <ChevronDown 
          className="w-4 h-4" 
          style={{ 
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s'
          }} 
        />
      </button>
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          paddingTop: '0.5rem',
          zIndex: 1100,
        }}>
          <div className="cu-control-panel cu-control-panel--narrow">
            {/* World Grid */}
            <div
              onClick={toggleWorldGrid}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <div style={{
                width: '16px',
                height: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                {worldGridVisible && (
                  <Check className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                )}
              </div>
              <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{t('worldGrid')}</span>
            </div>

            {/* Axis */}
            <div
              onClick={toggleAxis}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <div style={{
                width: '16px',
                height: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                {axisVisible && (
                  <Check className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                )}
              </div>
              <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{t('axis')}</span>
            </div>

            {/* Cameras */}
            <CamerasRow
              camerasVisible={camerasVisible}
              showFrustumWireframes={showFrustumWireframes}
              showImagePlane={showImagePlane}
              toggleCameras={toggleCameras}
              toggleFrustumWireframes={toggleFrustumWireframes}
              toggleImagePlane={toggleImagePlane}
              onSecondaryMenuChange={handleCamerasMenuChange}
            />

            {/* Point Cloud */}
            <PointCloudRow 
              hasPointCloudData={hasPointCloudData}
              onSecondaryMenuChange={handlePointCloudMenuChange}
            />

            {/* Background */}
            <div
              onClick={toggleBackground}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <div style={{
                width: '16px',
                height: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Check className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                {t('background')} ({backgroundColor.trim().toLowerCase() === '#2d2d30' ? 'Gray' : backgroundColor.trim().toLowerCase() === '#000000' ? 'Black' : 'White'})
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Point Cloud row (like CamerasRow, three-dot button opens secondary panel)
function PointCloudRow({ hasPointCloudData, onSecondaryMenuChange }) {
  const [showSecondaryMenu, setShowSecondaryMenu] = useState(false);
  const secondaryMenuRef = useRef(null);
  const t = useT();
  
  const [showPointCloud, setShowPointCloud] = useSetting('pointCloud', 'showPointCloud');
  const [colorMode, setColorMode] = useSetting('pointCloud', 'colorMode');
  const [pointSize, setPointSize] = useSetting('pointCloud', 'pointSize');
  const [errorGamma, setErrorGamma] = useSetting('pointCloud', 'errorGamma');
  const [trackLengthGamma, setTrackLengthGamma] = useSetting('pointCloud', 'trackLengthGamma');
  
  const { colmapData } = useAppContext();
  
  // Point cloud min/max for color map legend
  const pointCloudRange = useMemo(() => {
    let minError = Infinity, maxError = -Infinity;
    let minTrack = Infinity, maxTrack = -Infinity;
    
    if (colmapData?.pointCloud) {
      for (const point of colmapData.pointCloud.values()) {
        if (point.error >= 0) {
          minError = Math.min(minError, point.error);
          maxError = Math.max(maxError, point.error);
        }
        const trackLen = point.track?.length ?? 0;
        minTrack = Math.min(minTrack, trackLen);
        maxTrack = Math.max(maxTrack, trackLen);
      }
    }
    
    return {
      minError: minError === Infinity ? 0 : minError,
      maxError: maxError === -Infinity ? 1 : maxError,
      minTrack: minTrack === Infinity ? 0 : minTrack,
      maxTrack: maxTrack === -Infinity ? 1 : maxTrack,
    };
  }, [colmapData]);
  
  const togglePointCloud = useCallback(() => {
    setShowPointCloud(!showPointCloud);
  }, [showPointCloud, setShowPointCloud]);
  
  // Close secondary menu on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (secondaryMenuRef.current && !secondaryMenuRef.current.contains(event.target)) {
        setShowSecondaryMenu(false);
      }
    };

    if (showSecondaryMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showSecondaryMenu]);

  // ESC closes secondary menu
  useEffect(() => {
    if (!showSecondaryMenu) return;
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setShowSecondaryMenu(false);
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showSecondaryMenu]);

  // Notify parent of secondary menu state (ref to avoid dependency loops)
  const onSecondaryMenuChangeRef = useRef(onSecondaryMenuChange);
  useEffect(() => {
    onSecondaryMenuChangeRef.current = onSecondaryMenuChange;
  }, [onSecondaryMenuChange]);
  
  useEffect(() => {
    if (onSecondaryMenuChangeRef.current) {
      onSecondaryMenuChangeRef.current(showSecondaryMenu);
    }
  }, [showSecondaryMenu]);
  
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '6px 8px',
      borderRadius: '4px',
      transition: 'background-color 0.2s',
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.backgroundColor = 'transparent';
    }}
    >
      {/* Left: main click area */}
      <div
        onClick={togglePointCloud}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flex: 1,
          cursor: 'pointer',
        }}
      >
        <div style={{
          width: '16px',
          height: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          {showPointCloud && (
            <Check className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
          )}
        </div>
        <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{t('pointCloud')}</span>
      </div>
      
      {/* Three-dot button - always visible */}
      <div ref={secondaryMenuRef} style={{ position: 'relative' }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowSecondaryMenu(!showSecondaryMenu);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '20px',
            height: '20px',
            padding: 0,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            borderRadius: '4px',
            color: showSecondaryMenu ? 'var(--text-primary)' : 'var(--text-muted)',
            transition: 'background-color 0.2s, color 0.2s',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = showSecondaryMenu ? 'var(--text-primary)' : 'var(--text-muted)';
          }}
          title="Point Cloud Settings"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
        {showSecondaryMenu && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              paddingTop: '0.5rem',
              zIndex: 1200,
            }}>
              <div className="cu-control-panel">
                <div className="cu-control-panel-content">
                  <SliderRow
                    label={t('pointSize')}
                    value={pointSize}
                    min={0.1}
                    max={40}
                    step={0.1}
                    onChange={setPointSize}
                    formatValue={v => v.toFixed(1)}
                  />
                  
                  <SelectRow
                    label={t('colorMode')}
                    value={colorMode}
                    onChange={v => setColorMode(v)}
                    options={[
                      { value: 'rgb', label: 'RGB' },
                      { value: 'error', label: t('errorLabel') },
                      { value: 'trackLength', label: t('trackLengthLabel') }
                    ]}
                    optionInfo={{
                      error: t('errorModeDesc'),
                      trackLength: t('trackLengthDesc')
                    }}
                  />
                  
                  {/* Color map legend */}
                  {colorMode === 'error' && (
                    <ColorMapLegend
                      startColor={[0, 1, 0]}
                      endColor={[1, 0, 0]}
                      minValue={0}
                      maxValue={pointCloudRange.maxError}
                      gamma={errorGamma}
                    />
                  )}
                  
                  {colorMode === 'trackLength' && (
                    <ColorMapLegend
                      startColor={[0, 0, 1]}
                      endColor={[1, 1, 0]}
                      minValue={pointCloudRange.minTrack}
                      maxValue={pointCloudRange.maxTrack}
                      gamma={trackLengthGamma}
                    />
                  )}
                  
                  {colorMode === 'error' && (
                    <GammaSliderRow
                      label="Gamma"
                      value={errorGamma}
                      min={0.1}
                      max={10.0}
                      onChange={setErrorGamma}
                      formatValue={v => v.toFixed(2)}
                    />
                  )}
                  
                  {colorMode === 'trackLength' && (
                    <GammaSliderRow
                      label="Gamma"
                      value={trackLengthGamma}
                      min={0.1}
                      max={10.0}
                      onChange={setTrackLengthGamma}
                      formatValue={v => v.toFixed(2)}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
    </div>
  );
}

// Cameras row (left: main click area, right: tool buttons, three-dot opens secondary)
function CamerasRow({ 
  camerasVisible, 
  showFrustumWireframes, 
  showImagePlane,
  toggleCameras,
  toggleFrustumWireframes,
  toggleImagePlane,
  onSecondaryMenuChange
}) {
  const [showSecondaryMenu, setShowSecondaryMenu] = useState(false);
  const secondaryMenuRef = useRef(null);
  const t = useT();
  
  const [cameraScale, setCameraScale] = useSetting('camera', 'cameraScale');
  const [colorMode, setColorMode] = useSetting('camera', 'frustumColorMode');
  
  // Close secondary menu on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (secondaryMenuRef.current && !secondaryMenuRef.current.contains(event.target)) {
        setShowSecondaryMenu(false);
      }
    };

    if (showSecondaryMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showSecondaryMenu]);

  // ESC closes secondary menu
  useEffect(() => {
    if (!showSecondaryMenu) return;
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setShowSecondaryMenu(false);
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showSecondaryMenu]);

  // Notify parent of secondary menu state (ref to avoid dependency loops)
  const onSecondaryMenuChangeRef = useRef(onSecondaryMenuChange);
  useEffect(() => {
    onSecondaryMenuChangeRef.current = onSecondaryMenuChange;
  }, [onSecondaryMenuChange]);
  
  useEffect(() => {
    if (onSecondaryMenuChangeRef.current) {
      onSecondaryMenuChangeRef.current(showSecondaryMenu);
    }
  }, [showSecondaryMenu]);
  
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '6px 8px',
      borderRadius: '4px',
      transition: 'background-color 0.2s'
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.backgroundColor = 'transparent';
    }}
    >
      {/* Left: main click area */}
      <div
        onClick={toggleCameras}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flex: 1,
          cursor: 'pointer',
        }}
      >
        <div style={{
          width: '16px',
          height: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          {camerasVisible && (
            <Check className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
          )}
        </div>
        <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Cameras</span>
      </div>
      
      {/* Right: tool buttons */}
      {camerasVisible && (
        <>
          <button
            onClick={toggleFrustumWireframes}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              borderRadius: '4px',
              color: showFrustumWireframes ? 'var(--text-primary)' : 'var(--text-muted)',
              transition: 'background-color 0.2s, color 0.2s',
              flexShrink: 0
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = showFrustumWireframes ? 'var(--text-primary)' : 'var(--text-muted)';
            }}
            title={showFrustumWireframes ? 'Hide Frustum Wireframes' : 'Show Frustum Wireframes'}
          >
            <FrustumWireframeIcon className="w-4 h-4" />
          </button>
          <button
            onClick={toggleImagePlane}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              borderRadius: '4px',
              color: showImagePlane ? 'var(--text-primary)' : 'var(--text-muted)',
              transition: 'background-color 0.2s, color 0.2s',
              flexShrink: 0
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = showImagePlane ? 'var(--text-primary)' : 'var(--text-muted)';
            }}
            title={showImagePlane ? 'Hide Image Plane' : 'Show Image Plane'}
          >
            <Image className="w-4 h-4" />
          </button>
          
          {/* Three-dot button */}
          <div ref={secondaryMenuRef} style={{ position: 'relative' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSecondaryMenu(!showSecondaryMenu);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                borderRadius: '4px',
                color: showSecondaryMenu ? 'var(--text-primary)' : 'var(--text-muted)',
                transition: 'background-color 0.2s, color 0.2s',
                flexShrink: 0
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = showSecondaryMenu ? 'var(--text-primary)' : 'var(--text-muted)';
              }}
              title="Camera Settings"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {showSecondaryMenu && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                paddingTop: '0.5rem',
                zIndex: 1200,
              }}>
                <div className="cu-control-panel">
                  <div className="cu-control-panel-content">
                    <SliderRow
                      label={t('cameraScale')}
                      value={cameraScale}
                      min={0.01}
                      max={10}
                      step={0.01}
                      onChange={setCameraScale}
                      formatValue={v => v.toFixed(2)}
                    />
                    
                    <SelectRow
                      label={t('colorMode')}
                      value={colorMode}
                      onChange={v => setColorMode(v)}
                      options={[
                        { value: 'single', label: t('frustumColorSingle') },
                        { value: 'byCamera', label: t('frustumColorByCamera') },
                        { value: 'byRigFrame', label: t('frustumColorByRig') }
                      ]}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Transform controls
function TransformControls() {
  const { transform, setTransform: updateTransform, resetTransform, applyToData } = useAppContext();
  const [gizmoMode, setGizmoMode] = useSetting('ui', 'gizmoMode');
  const t = useT();
  
  const eps = 1e-8;
  const hasTransform = !(
    Math.abs(transform.scale - 1) < eps &&
    Math.abs(transform.rotationX) < eps &&
    Math.abs(transform.rotationY) < eps &&
    Math.abs(transform.rotationZ) < eps &&
    Math.abs(transform.translationX) < eps &&
    Math.abs(transform.translationY) < eps &&
    Math.abs(transform.translationZ) < eps
  );
  
  const angleToDeg = (rad) => rad * 180 / Math.PI;
  const degToAngle = (deg) => deg * Math.PI / 180;
  
  const toggleGizmo = useCallback(() => {
    const modes = ['off', 'global', 'local'];
    const idx = modes.indexOf(gizmoMode);
    setGizmoMode(modes[(idx + 1) % modes.length]);
  }, [gizmoMode, setGizmoMode]);
  
  
  return (
    <div className="cu-control-panel-content">
      <SelectRow
        label={t('transformTool')}
        value={gizmoMode}
        onChange={v => setGizmoMode(v)}
        options={[
          { value: 'off', label: t('transformOff') },
          { value: 'global', label: t('transformGlobal') },
          { value: 'local', label: t('transformLocal') }
        ]}
      />
      
      <SliderRow
        label={t('scale')}
        value={transform.scale}
        min={0.01}
        max={10}
        step={0.01}
        onChange={v => updateTransform({ scale: v })}
        formatValue={v => v.toFixed(2)}
      />
      
      <SliderRow
        label={t('rotateX')}
        value={angleToDeg(transform.rotationX)}
        min={-180}
        max={180}
        step={1}
        onChange={v => updateTransform({ rotationX: degToAngle(v) })}
        formatValue={v => `${v.toFixed(0)}°`}
      />
      
      <SliderRow
        label={t('rotateY')}
        value={angleToDeg(transform.rotationY)}
        min={-180}
        max={180}
        step={1}
        onChange={v => updateTransform({ rotationY: degToAngle(v) })}
        formatValue={v => `${v.toFixed(0)}°`}
      />
      
      <SliderRow
        label={t('rotateZ')}
        value={angleToDeg(transform.rotationZ)}
        min={-180}
        max={180}
        step={1}
        onChange={v => updateTransform({ rotationZ: degToAngle(v) })}
        formatValue={v => `${v.toFixed(0)}°`}
      />
      
      <SliderRow
        label={t('translateX')}
        value={transform.translationX}
        min={-100}
        max={100}
        step={0.1}
        onChange={v => updateTransform({ translationX: v })}
        formatValue={v => v.toFixed(1)}
      />
      
      <SliderRow
        label={t('translateY')}
        value={transform.translationY}
        min={-100}
        max={100}
        step={0.1}
        onChange={v => updateTransform({ translationY: v })}
        formatValue={v => v.toFixed(1)}
      />
      
      <SliderRow
        label={t('translateZ')}
        value={transform.translationZ}
        min={-100}
        max={100}
        step={0.1}
        onChange={v => updateTransform({ translationZ: v })}
        formatValue={v => v.toFixed(1)}
      />
      
      <div className="cu-modal-action-group">
        <button
          onClick={resetTransform}
          className="cu-modal-action-btn"
          disabled={!hasTransform}
        >
          {t('reset')}
        </button>
        <button
          onClick={applyToData}
          className="cu-modal-action-btn"
          disabled={!hasTransform}
        >
          {t('applyTransform')}
        </button>
      </div>
    </div>
  );
}

// Export controls
function ExportControls() {
  const { colmapData, loadedFiles } = useAppContext();
  const t = useT();
  const [exportFormat, setExportFormat] = useState('binary');
  
  const handleExportZip = useCallback(async () => {
    if (!colmapData) return;
    
    try {
      const imageFiles = await buildImageFilesForExport(loadedFiles, colmapData.images);
      await saveColmapAsZip(
        colmapData,
        { format: exportFormat, includeImages: true },
        imageFiles
      );
    } catch (err) {
      console.error('ZIP export failed:', err);
    }
  }, [colmapData, loadedFiles, exportFormat]);
  
  return (
    <div className="cu-control-panel-content">
      {/* Format toggle tab */}
      <div className="flex flex-col gap-1.5" style={{ marginBottom: '12px' }}>
        <label className="text-ds-secondary text-sm">{t('rebuildFormat')}</label>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => setExportFormat('binary')}
            style={{ 
              flex: 1,
              padding: '6px 12px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              background: exportFormat === 'binary' ? 'var(--accent-primary)' : 'var(--bg-hover)',
              color: exportFormat === 'binary' ? 'var(--text-on-accent)' : 'var(--text-primary)',
              cursor: 'pointer',
              transition: 'all 0.2s',
              fontSize: '13px'
            }}
          >
            {t('binaryFormat')}
          </button>
          <button
            onClick={() => setExportFormat('text')}
            style={{ 
              flex: 1,
              padding: '6px 12px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              background: exportFormat === 'text' ? 'var(--accent-primary)' : 'var(--bg-hover)',
              color: exportFormat === 'text' ? 'var(--text-on-accent)' : 'var(--text-primary)',
              cursor: 'pointer',
              transition: 'all 0.2s',
              fontSize: '13px'
            }}
          >
            {t('textFormat')}
          </button>
        </div>
      </div>
      
      {/* Export button */}
      <button
        onClick={handleExportZip}
        disabled={!colmapData}
        className={colmapData ? 'cu-modal-action-btn' : 'cu-modal-action-btn cu-modal-action-btn--disabled'}
        style={{ 
          width: '100%',
          padding: '8px 12px',
          borderRadius: '4px',
          border: '1px solid var(--border)'
        }}
      >
        {t('exportZip')}
      </button>
    </div>
  );
}

// 速度倍率滑条：0.1–10 对数刻度，小倍率时更精细。position ∈ [0,100] ↔ mult = 0.1 * 10^(2*position/100)
const CAMERA_SPEED_SCALE_MIN = 0.1;
const CAMERA_SPEED_SCALE_MAX = 10;
function cameraSpeedScaleToSlider(mult) {
  return 50 * (Math.log10(Math.max(CAMERA_SPEED_SCALE_MIN, mult)) + 1);
}
function sliderToCameraSpeedScale(position) {
  return CAMERA_SPEED_SCALE_MIN * Math.pow(10, (2 * position) / 100);
}

// View button (includes Camera Mode)
function ViewButton({ activePanel, setActivePanel }) {
  const [cameraProjection, setCameraProjection] = useSetting('camera', 'cameraProjection');
  const [cameraFov, setCameraFov] = useSetting('camera', 'cameraFov');
  const [cameraMode, setCameraMode] = useSetting('camera', 'cameraMode');
  const [cameraSpeedScale, setCameraSpeedScale] = useSetting('camera', 'cameraSpeedScale');
  const { resetView, setView } = useUI();
  const t = useT();
  
  const handleResetView = useCallback(() => {
    resetView();
  }, [resetView]);
  
  
  return (
    <OverlayUIButton
      panelId="view"
      activePanel={activePanel}
      setActivePanel={setActivePanel}
      icon={<Eye className="w-6 h-6" />}
      tooltip="View (R)"
      onClick={handleResetView}
      isActive={activePanel === 'view'}
      panelTitle="View"
      panelPosition="bottom-right"
    >
      <div className="cu-control-panel-content">
        {/* Camera Mode */}
        <SelectRow
          label={t('cameraMode')}
          value={cameraMode}
          onChange={v => setCameraMode(v)}
          options={[
            { value: 'orbit', label: 'Orbit' },
            { value: 'fly', label: 'Fly' }
          ]}
        />

        {/* Projection toggle */}
        <div className="flex flex-col gap-1.5" style={{ marginBottom: '12px' }}>
          <label className="text-ds-secondary text-sm">{t('projection')}</label>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => setCameraProjection('perspective')}
              className={cameraProjection === 'perspective' ? 'cu-modal-action-btn cu-modal-action-btn--primary' : 'cu-modal-action-btn'}
              style={{ 
                flex: 1,
                padding: '6px 12px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                background: cameraProjection === 'perspective' ? 'var(--accent-primary)' : 'var(--bg-hover)',
                color: cameraProjection === 'perspective' ? 'var(--text-on-accent)' : 'var(--text-primary)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Persp
            </button>
            <button
              onClick={() => setCameraProjection('orthographic')}
              className={cameraProjection === 'orthographic' ? 'cu-modal-action-btn cu-modal-action-btn--primary' : 'cu-modal-action-btn'}
              style={{ 
                flex: 1,
                padding: '6px 12px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                background: cameraProjection === 'orthographic' ? 'var(--accent-primary)' : 'var(--bg-hover)',
                color: cameraProjection === 'orthographic' ? 'var(--text-on-accent)' : 'var(--text-primary)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Ortho
            </button>
          </div>
        </div>

        {/* FOV slider - only for perspective */}
        {cameraProjection === 'perspective' && (
          <SliderRow
            label="FOV"
            value={cameraFov}
            min={10}
            max={120}
            step={1}
            onChange={setCameraFov}
            formatValue={v => `${v}°`}
          />
        )}

        {/* Move speed scale: 0.1×–10×, log scale for finer control at low values */}
        <SliderRow
          label={t('cameraSpeedScale')}
          value={cameraSpeedScale}
          min={CAMERA_SPEED_SCALE_MIN}
          max={CAMERA_SPEED_SCALE_MAX}
          step={0.01}
          onChange={setCameraSpeedScale}
          formatValue={v => `${Number(v).toFixed(2)}×`}
          valueToSlider={cameraSpeedScaleToSlider}
          sliderToValue={sliderToCameraSpeedScale}
          sliderMin={0}
          sliderMax={100}
          sliderStep={1}
        />

        {/* View direction buttons */}
        <div className="flex flex-col gap-1.5" style={{ marginBottom: '12px' }}>
          <label className="text-ds-secondary text-sm">{t('quickMove')}</label>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setView('x')}
              className="cu-modal-action-btn"
              style={{ 
                flex: 1, 
                minWidth: '60px',
                padding: '6px 12px',
                borderRadius: '4px',
                border: '1px solid var(--border)'
              }}
            >
              X
            </button>
            <button
              onClick={() => setView('y')}
              className="cu-modal-action-btn"
              style={{ 
                flex: 1, 
                minWidth: '60px',
                padding: '6px 12px',
                borderRadius: '4px',
                border: '1px solid var(--border)'
              }}
            >
              Y
            </button>
            <button
              onClick={() => setView('z')}
              className="cu-modal-action-btn"
              style={{ 
                flex: 1, 
                minWidth: '60px',
                padding: '6px 12px',
                borderRadius: '4px',
                border: '1px solid var(--border)'
              }}
            >
              Z
            </button>
          </div>
        </div>
        
        <button
          onClick={handleResetView}
          className="cu-modal-action-btn"
          style={{ 
            width: '100%',
            padding: '6px 12px',
            borderRadius: '4px',
            border: '1px solid var(--border)'
          }}
        >
          {t('resetView')}
        </button>
      </div>
    </OverlayUIButton>
  );
}

// Settings button
function SettingsButton() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  return (
    <>
      <button
        onClick={() => setIsSettingsOpen(true)}
        className="group cu-control-btn cu-control-btn--inactive"
        {...getTooltipProps('Settings', 'left')}
      >
        <Settings className="w-6 h-6" />
      </button>
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
}

// Main control bar
export function OverlayUI() {
  const { currentPanel, openPanel } = usePanelState();
  const { colmapData } = useAppContext();
  const [cameraDisplayMode] = useSetting('camera', 'cameraDisplayMode');
  
  return (
    <>
      {/* Top toolbar */}
      <div style={{
        position: 'absolute',
        top: '12px',
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: '0 12px',
        zIndex: 1000,
        pointerEvents: 'none'
      }}>
        {/* Left: Transform */}
        <div style={{
          display: 'flex',
          gap: '8px',
          pointerEvents: 'auto'
        }}>
          <OverlayUIButton
            panelId="transform"
            activePanel={currentPanel}
            setActivePanel={openPanel}
            icon={<Move className="w-6 h-6" />}
            tooltip="Transform"
            isActive={currentPanel === 'transform'}
            panelTitle="Transform"
            panelPosition="bottom-left"
          >
            <TransformControls />
          </OverlayUIButton>
        </div>

        {/* Right: Layers, View, Camera Mode, PointCloud */}
        <div style={{
          display: 'flex',
          gap: '8px',
          pointerEvents: 'auto'
        }}>
          <LayersPanel />
          
          <ViewButton
            activePanel={currentPanel}
            setActivePanel={openPanel}
          />
          
        </div>
      </div>

      {/* Bottom-right tool area */}
      <div style={{
        position: 'absolute',
        bottom: '12px',
        right: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 1000,
        pointerEvents: 'auto'
      }}>
        <OverlayUIButton
          panelId="export"
          activePanel={currentPanel}
          setActivePanel={openPanel}
          icon={<Download className="w-6 h-6" />}
          tooltip="Export"
          isActive={currentPanel === 'export'}
          panelTitle="Export"
        >
          <ExportControls />
        </OverlayUIButton>
        
        <SettingsButton />
      </div>
    </>
  );
}
