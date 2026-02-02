import { useEffect, useRef, useState } from 'react';
import { settings, DEFAULTS } from '../../utils/settings';
import { useT } from '../../AppContext';
import { LanguageTabSwitcher } from './LanguageTabSwitcher';

/**
 * Settings Modal - 简单的设置弹窗
 */
export function SettingsModal({ isOpen, onClose }) {
  const modalRef = useRef(null);
  const [isResetting, setIsResetting] = useState(false);
  const t = useT();

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // ESC 键关闭
  useEffect(() => {
    if (!isOpen) return;
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  // 清除所有偏好设置
  const handleClearPreferences = () => {
    if (!confirm(t('clearPreferencesConfirm'))) {
      return;
    }

    setIsResetting(true);

    try {
      // 重置所有 settings 到默认值
      settings.camera.setAll(DEFAULTS.camera);
      settings.pointCloud.setAll(DEFAULTS.pointCloud);
      settings.ui.setAll(DEFAULTS.ui);
      settings.export.setAll(DEFAULTS.export);
      settings.rig.setAll(DEFAULTS.rig);

      // 刷新页面以完全重置所有状态
      setTimeout(() => {
        window.location.reload();
      }, 100);
    } catch (error) {
      console.error('Clear preferences error:', error);
      alert(t('clearPreferencesError'));
      setIsResetting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center pointer-events-none">
      <div
        ref={modalRef}
        className="bg-ds-tertiary border border-ds rounded shadow-ds-lg p-6 pointer-events-auto"
        style={{
          width: '400px',
          maxWidth: 'calc(100vw - 40px)'
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ds-primary">{t('settings')}</h2>
          <button
            onClick={onClose}
            className="text-ds-secondary hover:text-ds-primary transition-colors"
            title={t('close')}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-ds-secondary">{t('language')}</span>
            <LanguageTabSwitcher />
          </div>
          <button
            onClick={handleClearPreferences}
            disabled={isResetting}
            className="w-full text-sm"
            style={{
              padding: '6px 12px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              background: 'var(--bg-hover)',
              color: 'var(--text-primary)',
              cursor: isResetting ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: isResetting ? 0.5 : 1
            }}
          >
            {isResetting ? t('resetting') : t('clearPreferences')}
          </button>
        </div>
      </div>
    </div>
  );
}
