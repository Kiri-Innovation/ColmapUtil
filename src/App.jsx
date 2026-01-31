import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { InitiationPage } from './components/initiation-page/InitiationPage';
import { ColmapVisualizer } from './components/visualizer/ColmapVisualizer';
import { ImageGallery } from './components/sidebar/ImageGallery';
import { ImageDetailPanel } from './components/sidebar/ImageDetailPanel';
import { ToastContainer } from './components/common/ToastContainer';
import { AppProvider, useAppContext, useUI, useSelection } from './AppContext';
import { isMobile } from './utils/isMobile.js';
import './App.css';
import './styles/design-system.css';

const OBSERVATIONS_INFO =
  'Observations = total 2D observations (sum of track lengths). E.g. one point seen by 5 images + one by 3 = 8 observations. Distinct from "points" (3D point count).';

const MIN_PANEL_WIDTH = 200;
const MAX_PANEL_WIDTH_PERCENT = 0.6;
const DEFAULT_PANEL_WIDTH = 400;

function useResizablePanel(defaultWidth) {
  const [panelWidth, setPanelWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      const maxWidth = window.innerWidth * MAX_PANEL_WIDTH_PERCENT;
      const clampedWidth = Math.max(MIN_PANEL_WIDTH, Math.min(maxWidth, newWidth));
      setPanelWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    const handleResize = () => {
      const maxWidth = window.innerWidth * MAX_PANEL_WIDTH_PERCENT;
      setPanelWidth((prev) => Math.min(prev, maxWidth));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return { panelWidth, handleMouseDown, isResizing };
}

function Header() {
  const { colmapData, loading } = useAppContext();
  return (
    <div className="app-toolbar">
      <div className="app-toolbar-left">
        <div className="app-toolbar-title">COLMAP Util</div>
        {colmapData && (
          <div className="cu-toolbar-info">
            {colmapData.images.size} 图像 | {colmapData.cameras.size} 相机
          </div>
        )}
      </div>
      <div className="app-toolbar-right">
        {loading && (
          <div className="cu-toolbar-loading">加载中...</div>
        )}
      </div>
    </div>
  );
}

function Footer() {
  const { loading, colmapData, pointCount, imageCount, cameraCount } = useAppContext();
  const pointCloudTotalObservations = colmapData?.pointCloudTotalObservations;
  const [showObservationsInfo, setShowObservationsInfo] = useState(false);
  const [observationsTooltipRect, setObservationsTooltipRect] = useState({ top: 0, left: 0 });
  const observationsLeaveRef = useRef(null);

  const handleObservationsMouseEnter = useCallback((e) => {
    if (observationsLeaveRef.current) {
      clearTimeout(observationsLeaveRef.current);
      observationsLeaveRef.current = null;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setObservationsTooltipRect({ top: rect.top, left: rect.left });
    setShowObservationsInfo(true);
  }, []);

  const handleObservationsMouseLeave = useCallback(() => {
    observationsLeaveRef.current = setTimeout(() => setShowObservationsInfo(false), 150);
  }, []);

  return (
    <>
      <div className="app-statusbar">
        <div className="app-statusbar-left">
          {colmapData ? (
            <>
              <span className="text-ds-primary">点 = {pointCount.toLocaleString()}</span>
              <span className="text-ds-primary">图像 = {imageCount.toLocaleString()}</span>
              <span className="text-ds-primary">相机 = {cameraCount.toLocaleString()}</span>
              {pointCloudTotalObservations != null && (
                <span
                  className="text-ds-primary inline-flex items-center gap-1 cursor-help"
                  onMouseEnter={handleObservationsMouseEnter}
                  onMouseLeave={handleObservationsMouseLeave}
                >
                  观测 = {pointCloudTotalObservations.toLocaleString()}
                  <Info className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
                </span>
              )}
            </>
          ) : (
            <span>{loading ? '加载中...' : '拖放 COLMAP 文件夹以加载'}</span>
          )}
        </div>
        <div className="app-statusbar-right">
          <span>v{__APP_VERSION__}</span>
        </div>
      </div>
      {showObservationsInfo &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: `${observationsTooltipRect.top}px`,
              left: `${observationsTooltipRect.left}px`,
              transform: 'translateY(-100%)',
              marginTop: '-8px',
              padding: '8px 12px',
              borderRadius: '4px',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              boxShadow: 'var(--shadow-md)',
              border: '1px solid var(--border-light)',
              zIndex: 10000,
              pointerEvents: 'none',
              maxWidth: '280px',
              minWidth: '200px',
              whiteSpace: 'normal',
              lineHeight: '1.4',
            }}
          >
            {OBSERVATIONS_INFO}
          </div>,
          document.body
        )}
    </>
  );
}

function MobileMessage() {
  return (
    <div style={{
      width: '100%',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      textAlign: 'center'
    }}>
      <h1 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>Desktop Only</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
        Drag and drop a COLMAP folder is difficult on mobile devices.
      </p>
    </div>
  );
}

function MainLayout() {
  const [embedMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('embed') === '1' || params.get('embed') === 'true';
  });
  const { imageDetailId, closeImageDetail } = useUI();
  const { panelWidth, handleMouseDown, isResizing } = useResizablePanel(DEFAULT_PANEL_WIDTH);

  const hideGallery = embedMode;
  const showDetailPanel = imageDetailId !== null;

  const mobile = isMobile();

  return (
    <>
      {mobile ? <MobileMessage /> : (
    <div style={{
      width: '100%',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--bg-primary)',
      overflow: 'hidden'
    }}>
      <Header />
      <div className="app-layout">
        <div style={{
          flex: 1,
          minWidth: 0,
          position: 'relative',
          backgroundColor: 'var(--bg-primary)'
        }}>
          <ColmapVisualizer />
          <ToastContainer />
        </div>
        {!hideGallery && (
          <div
            className={`resizer ${isResizing ? 'dragging' : ''}`}
            onMouseDown={handleMouseDown}
            style={{
              width: '4px',
              minWidth: '4px'
            }}
          />
        )}
        {!embedMode && (
          <div
            className="sidebar-panel"
            style={{
              width: hideGallery ? 0 : panelWidth,
              transition: isResizing ? 'none' : 'width 0.3s ease-in-out',
              overflow: 'hidden'
            }}
            onWheel={(e) => e.stopPropagation()}
          >
            <div style={{
              width: '100%',
              height: '100%',
              minWidth: `${MIN_PANEL_WIDTH}px`,
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div className="sidebar-header">
                <div className="sidebar-tabs">
                  {showDetailPanel ? (
                    <button
                      className="sidebar-tab active"
                      onClick={closeImageDetail}
                      style={{ cursor: 'pointer' }}
                    >
                      ← 返回
                    </button>
                  ) : (
                    <button
                      className="sidebar-tab active"
                      style={{ cursor: 'default' }}
                    >
                      图像画廊
                    </button>
                  )}
                </div>
              </div>
              <div
                className="sidebar-content"
                onWheel={(e) => e.stopPropagation()}
              >
                {showDetailPanel ? (
                  <ImageDetailPanel />
                ) : (
                  <ImageGallery isResizing={isResizing} />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {!embedMode && <Footer />}
    </div>
      )}
    </>
  );
}

function ContextRefsSetup() {
  const { resetView, closeImageDetail } = useUI();
  const { setSelectedImageId } = useSelection();

  useEffect(() => {
    if (!window.__colmapContextRefs) {
      window.__colmapContextRefs = {};
    }
    window.__colmapContextRefs.resetView = resetView;
    window.__colmapContextRefs.closeImageDetail = closeImageDetail;
    window.__colmapContextRefs.setSelectedImageId = setSelectedImageId;

    return () => {
      if (window.__colmapContextRefs) {
        window.__colmapContextRefs.resetView = null;
        window.__colmapContextRefs.closeImageDetail = null;
        window.__colmapContextRefs.setSelectedImageId = null;
      }
    };
  }, [resetView, closeImageDetail, setSelectedImageId]);

  return null;
}

function App() {
  return (
    <AppProvider>
      <ContextRefsSetup />
      <InitiationPage>
        <MainLayout />
      </InitiationPage>
    </AppProvider>
  );
}

export default App;
