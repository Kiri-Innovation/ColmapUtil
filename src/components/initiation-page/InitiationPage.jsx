/**
 * Initiation page: file drag-and-drop, browse, and load COLMAP data.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { AppContext, useAppContext } from '../../AppContext';
import { handleFileDrop } from './fileDropHandler.js';
import { isMobile } from '../../utils/isMobile.js';
import { ERROR_TOAST_DURATION_MS } from '../../config';
import { Info, Plus, X } from 'lucide-react';
import './InitiationPage.css';

// Drag-and-drop state
function useDragDropState() {
  const [isDragging, setIsDragging] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  
  const startDrag = useCallback(() => setIsDragging(true), []);
  const stopDrag = useCallback(() => setIsDragging(false), []);
  const dismiss = useCallback(() => setIsDismissed(true), []);
  
  return { isDragging, isDismissed, startDrag, stopDrag, dismiss };
}

// Error toast (auto-dismiss)
function useErrorToast() {
  const { error, setError } = useAppContext();
  
  useEffect(() => {
    if (!error) return;
    
    const timeoutId = setTimeout(() => {
      setError(null);
    }, ERROR_TOAST_DURATION_MS);
    
    return () => clearTimeout(timeoutId);
  }, [error, setError]);
  
  return { error, clearError: () => setError(null) };
}

// Loading overlay (animation only, no progress bar)
function LoadingOverlay() {
  return (
    <div className="cu-loading-overlay">
      <div className="cu-loading-container">
        <div className="cu-loading-dots">
          <div className="cu-loading-dot cu-loading-dot--0" />
          <div className="cu-loading-dot cu-loading-dot--1" />
          <div className="cu-loading-dot cu-loading-dot--2" />
        </div>
        <div className="cu-loading-text">加载中…</div>
      </div>
    </div>
  );
}


// Empty state (dropzone + info)
function EmptyState({
  onBrowse,
  onShowInfo,
  onDismiss,
}) {
  return (
    <div className="cu-initiation-page-overlay">
      <div className="cu-initiation-page-actions">
        <button
          type="button"
          onClick={onShowInfo}
          className="btn cu-initiation-page-btn"
          title="查看导入说明"
        >
          <Info className="cu-initiation-page-btn-icon" />
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="btn cu-initiation-page-btn cu-initiation-page-btn-close"
          title="关闭"
        >
          ×
        </button>
      </div>

      <div className="cu-initiation-page-content">
        <div className="cu-initiation-page-dropzone" onClick={onBrowse}>
          <Plus className="cu-initiation-page-dropzone-icon" />
        </div>

        <h2 className="cu-initiation-page-title">导入 COLMAP 数据</h2>

        <p className="cu-initiation-page-desc">
          将包含 cameras / images / points3D 的目录或 ZIP 放到此处<br />
          或点击上方加号选择文件
        </p>

        <div className="cu-initiation-page-help">
          <span>支持的格式与结构</span>
          <button type="button" onClick={onShowInfo} className="cu-initiation-page-help-link">
            查看说明
          </button>
        </div>
      </div>
    </div>
  );
}

// Drag overlay (drop hint)
function DragOverlay() {
  return (
    <div className="cu-initiation-page-drag-overlay">
      <div className="cu-initiation-page-drag-card">
        <div className="cu-initiation-page-drag-icon">+</div>
        <div className="cu-initiation-page-drag-title">松开即可导入</div>
        <div className="cu-initiation-page-drag-sub">
          需包含 cameras、images、points3D（.bin 或 .txt）
        </div>
      </div>
    </div>
  );
}

// Load instructions modal (inline, formerly LoadInfoModal)
function LoadInfoOverlay({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000
      }}
      onClick={onClose}
    >
      <div
        className="panel"
        style={{
          maxWidth: '600px',
          maxHeight: '80vh',
          overflow: 'auto',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Info style={{ width: '16px', height: '16px' }} />
            <span>导入说明</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-sm)',
              transition: 'all var(--transition-base)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            <X style={{ width: '16px', height: '16px' }} />
          </button>
        </div>

        <div className="panel-content" style={{
          fontSize: '13px',
          lineHeight: 1.6,
          color: 'var(--text-primary)'
        }}>
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>所需文件</h3>
            <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-secondary)' }}>
              <li style={{ marginBottom: '4px' }}>
                cameras、images、points3D 各一份，扩展名为 .bin 或 .txt 均可
              </li>
              <li style={{ marginBottom: '4px' }}>
                可放在任意子目录下，本工具会自动查找 sparse/0、sparse 等常见路径
              </li>
            </ul>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>可选</h3>
            <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-secondary)' }}>
              <li style={{ marginBottom: '4px' }}>源图：jpg / png / webp / tiff</li>
              <li style={{ marginBottom: '4px' }}>masks/ 下的遮罩图</li>
            </ul>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>ZIP</h3>
            <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-secondary)' }}>
              <li style={{ marginBottom: '4px' }}>支持打包成 ZIP（建议 &lt; 2GB），内部目录会自动扫描</li>
              <li style={{ marginBottom: '4px' }}>图像按需读取，不一次性载入内存</li>
            </ul>
          </div>

          <div style={{
            padding: '12px',
            backgroundColor: 'var(--bg-active)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-primary)'
          }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              把重建目录或 ZIP 拖入页面即可，无需事先解压或整理路径。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InitiationPage({ children }) {
  const { isDragging, isDismissed, startDrag, stopDrag, dismiss } = useDragDropState();
  const { error, clearError } = useErrorToast();
  const [showInfoModal, setShowInfoModal] = useState(false);
  const { loading, colmapData } = useAppContext();

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      startDrag();
    }
  }, [startDrag]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget)) {
      stopDrag();
    }
  }, [stopDrag]);

  const mobile = isMobile();

  return (
    <AppContext.Consumer>
      {(context) => {
        const { handleDrop, handleDragOver, handleBrowse } = handleFileDrop(context);
        const shouldShowEmptyState = !colmapData && !loading && !isDragging && !isDismissed && !mobile;
        const handleFileDropAsync = async (e) => {
          stopDrag();
          await handleDrop(e);
        };
        return (
    <div
      className="relative w-full h-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleFileDropAsync}
    >
      {children}

      {isDragging && <DragOverlay />}

      {shouldShowEmptyState && (
        <EmptyState
          onBrowse={handleBrowse}
          onShowInfo={() => setShowInfoModal(true)}
          onDismiss={dismiss}
        />
      )}

      {loading && <LoadingOverlay />}

      {error && (
        <div className="cu-toast-container-with-layout cu-toast-error">
          <div className="cu-toast-content">
            <div className="cu-toast-title-error">Error loading data</div>
            <div className="cu-toast-message">{error}</div>
          </div>
          <button type="button" onClick={clearError} className="cu-toast-close">×</button>
        </div>
      )}

      <LoadInfoOverlay
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
      />
    </div>
        );
      }}
    </AppContext.Consumer>
  );
}
