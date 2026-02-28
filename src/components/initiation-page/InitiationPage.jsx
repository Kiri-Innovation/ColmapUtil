/**
 * Initiation page: file drag-and-drop, browse, and load COLMAP data.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { AppContext, useAppContext, useT } from '../../AppContext';
import { LanguageTabSwitcher } from '../common/LanguageTabSwitcher';
import { handleFileDrop } from './fileDropHandler.js';
import { isMobile } from '../../utils/isMobile.js';
import { isExtensionPath } from '../../utils/extensionModalUrl';
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
  const t = useT();
  return (
    <div className="cu-loading-overlay">
      <div className="cu-loading-container">
        <div className="cu-loading-dots">
          <div className="cu-loading-dot cu-loading-dot--0" />
          <div className="cu-loading-dot cu-loading-dot--1" />
          <div className="cu-loading-dot cu-loading-dot--2" />
        </div>
        <div className="cu-loading-text">{t('loading')}</div>
      </div>
    </div>
  );
}

// Extension postMessage: receiving zip + loading
function ExtensionReceivingOverlay() {
  const t = useT();
  return (
    <div className="cu-loading-overlay">
      <div className="cu-loading-container">
        <div className="cu-loading-dots">
          <div className="cu-loading-dot cu-loading-dot--0" />
          <div className="cu-loading-dot cu-loading-dot--1" />
          <div className="cu-loading-dot cu-loading-dot--2" />
        </div>
        <div className="cu-loading-text">{t('receivingAndLoading')}</div>
      </div>
    </div>
  );
}

// Listens for postMessage: handshake (close drag modal, open receiving modal), then chunks with ack
function ExtensionZipListener({ context }) {
  const { processZipFile } = handleFileDrop(context);
  const { setExtensionReceiving, setExtensionReceiveFailed } = context;
  const chunksRef = useRef({});
  const totalRef = useRef(0);
  useEffect(() => {
    const handler = (event) => {
      const d = event?.data;
      if (!d) return;
      if (d.type === 'colmaputil-handshake') {
        setExtensionReceiveFailed(false);
        setExtensionReceiving(true);
        if (window.parent !== window) {
          window.parent.postMessage({ type: 'colmaputil-ready-ack' }, '*');
        }
        return;
      }
      if (d.type === 'colmaputil-chunk') {
        const { index, total, data } = d;
        if (typeof index !== 'number' || typeof total !== 'number' || typeof data !== 'string') return;
        totalRef.current = total;
        chunksRef.current[index] = data;
        if (window.parent !== window) {
          window.parent.postMessage({ type: 'colmaputil-chunk-ack', index }, '*');
        }
        const received = Object.keys(chunksRef.current).length;
        if (received !== total) return;
        const parts = [];
        for (let i = 0; i < total; i++) parts.push(chunksRef.current[i]);
        chunksRef.current = {};
        const base64 = parts.join('');
        try {
          const binary = atob(base64);
          const arr = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
          const file = new File([new Blob([arr], { type: 'application/zip' })], 'colmap.zip', { type: 'application/zip' });
          processZipFile(file)
            .catch(() => setExtensionReceiveFailed(true))
            .finally(() => setExtensionReceiving(false));
        } catch (err) {
          console.error('[ColmapUtil] Extension zip load failed:', err);
          setExtensionReceiveFailed(true);
          setExtensionReceiving(false);
        }
        return;
      }
    };
    window.addEventListener('message', handler);
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'colmaputil-page-ready' }, '*');
    }
    return () => window.removeEventListener('message', handler);
  }, [processZipFile, setExtensionReceiving, setExtensionReceiveFailed]);
  return null;
}


// Empty state (dropzone + info)
function EmptyState({
  onBrowse,
  onShowInfo,
  onDismiss,
}) {
  const t = useT();
  return (
    <div className="cu-initiation-page-overlay">
      <div className="cu-initiation-page-actions">
        <button
          type="button"
          onClick={onShowInfo}
          className="btn cu-initiation-page-btn"
          title={t('viewInstructions')}
        >
          <Info className="cu-initiation-page-btn-icon" />
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="btn cu-initiation-page-btn cu-initiation-page-btn-close"
          title={t('close')}
        >
          ×
        </button>
      </div>

      <div className="cu-initiation-page-content">
        <div className="cu-initiation-page-dropzone" onClick={onBrowse}>
          <Plus className="cu-initiation-page-dropzone-icon" />
        </div>

        <h2 className="cu-initiation-page-title">{t('importTitle')}</h2>

        <p className="cu-initiation-page-desc">
          {t('importDesc')}
        </p>

        <div className="cu-initiation-page-help">
          <span>{t('supportedFormats')}</span>
          <button type="button" onClick={onShowInfo} className="cu-initiation-page-help-link">
            {t('viewInstructions')}
          </button>
        </div>

        <div className="cu-initiation-page-lang-wrap">
          <LanguageTabSwitcher />
        </div>
      </div>
    </div>
  );
}

// Drag overlay (drop hint)
function DragOverlay() {
  const t = useT();
  return (
    <div className="cu-initiation-page-drag-overlay">
      <div className="cu-initiation-page-drag-card">
        <div className="cu-initiation-page-drag-icon">+</div>
        <div className="cu-initiation-page-drag-title">{t('dragReleaseTitle')}</div>
        <div className="cu-initiation-page-drag-sub">
          {t('dragReleaseSub')}
        </div>
      </div>
    </div>
  );
}

// Load instructions modal (inline, formerly LoadInfoModal)
function LoadInfoOverlay({ isOpen, onClose }) {
  const t = useT();
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
            <span>{t('loadInfoTitle')}</span>
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
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>{t('requiredFiles')}</h3>
            <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-secondary)' }}>
              <li style={{ marginBottom: '4px' }}>{t('requiredFilesList1')}</li>
              <li style={{ marginBottom: '4px' }}>{t('requiredFilesList2')}</li>
            </ul>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>{t('optional')}</h3>
            <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-secondary)' }}>
              <li style={{ marginBottom: '4px' }}>{t('optionalList1')}</li>
              <li style={{ marginBottom: '4px' }}>{t('optionalList2')}</li>
            </ul>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>{t('zipTitle')}</h3>
            <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-secondary)' }}>
              <li style={{ marginBottom: '4px' }}>{t('zipList1')}</li>
              <li style={{ marginBottom: '4px' }}>{t('zipList2')}</li>
            </ul>
          </div>

          <div style={{
            padding: '12px',
            backgroundColor: 'var(--bg-active)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-primary)'
          }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              {t('importTip')}
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
  const { loading, colmapData, extensionReceiving, extensionReceiveFailed } = useAppContext();
  const mobile = isMobile();

  const shouldShowEmptyState = !colmapData && !loading && !isDragging && !isDismissed && !mobile && !extensionReceiving && !extensionReceiveFailed && !isExtensionPath();

  // ESC 关闭：优先关「查看说明」弹窗，否则关 initiation 空状态
  useEffect(() => {
    if (!shouldShowEmptyState && !showInfoModal) return;
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (showInfoModal) setShowInfoModal(false);
        else if (shouldShowEmptyState) dismiss();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [shouldShowEmptyState, showInfoModal, dismiss]);

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

  return (
    <AppContext.Consumer>
      {(context) => {
        const { handleDrop, handleDragOver, handleBrowse, processZipFile } = handleFileDrop(context);
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
      <ExtensionZipListener context={context} />
      {children}

      {isDragging && <DragOverlay />}

      {shouldShowEmptyState && (
        <EmptyState
          onBrowse={handleBrowse}
          onShowInfo={() => setShowInfoModal(true)}
          onDismiss={dismiss}
        />
      )}

      {loading && !extensionReceiving && <LoadingOverlay />}

      {extensionReceiving && <ExtensionReceivingOverlay />}

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
