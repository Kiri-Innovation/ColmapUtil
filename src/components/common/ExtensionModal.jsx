/**
 * 全屏 Modal：Cursor/VSCode 插件介绍、下载、安装、使用说明
 * 使用 createPortal 挂载到 body，确保 z-index 最高且完全遮挡背后交互
 */

import { createPortal } from 'react-dom';
import { useT } from '../../AppContext';
import { Download } from 'lucide-react';
import { LanguageTabSwitcher } from './LanguageTabSwitcher';
import './ExtensionModal.css';

const EXTENSION_VSIX_URL = '/colmaputil-send.vsix';

export function ExtensionModal({ isOpen, onClose }) {
  const t = useT();

  if (!isOpen) return null;

  const content = (
    <div className="cu-extension-modal-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="cu-extension-modal-actions">
        <button
          type="button"
          onClick={onClose}
          className="cu-extension-modal-btn-close"
          title={t('close')}
        >
          ×
        </button>
      </div>

      <div className="cu-extension-modal-content">
        <h2 className="cu-extension-modal-title">{t('extensionModalTitle')}</h2>

        <p className="cu-extension-modal-desc">{t('extensionFeaturesDesc')}</p>

        <a
          href={EXTENSION_VSIX_URL}
          download="colmaputil-extension.vsix"
          className="cu-extension-modal-download-btn"
        >
          <Download className="cu-extension-modal-download-btn-icon" />
          {t('extensionDownload')}
        </a>

        <section className="cu-extension-modal-section">
          <h3 className="cu-extension-modal-section-title">{t('extensionFeaturesTitle')}</h3>
          <ul className="cu-extension-modal-section-body">
            <li>{t('extensionFeature1')}</li>
            <li>{t('extensionFeature2')}</li>
            <li>{t('extensionFeature3')}</li>
          </ul>
        </section>

        <section className="cu-extension-modal-section">
          <h3 className="cu-extension-modal-section-title">{t('extensionInstallTitle')}</h3>
          <ol className="cu-extension-modal-section-body">
            <li>{t('extensionInstallStep1')}</li>
            <li>{t('extensionInstallStep2')}</li>
            <li>{t('extensionInstallStep3')}</li>
          </ol>
        </section>

        <section className="cu-extension-modal-section">
          <h3 className="cu-extension-modal-section-title">{t('extensionUsageTitle')}</h3>
          <ol className="cu-extension-modal-section-body">
            <li>{t('extensionUsageStep1')}</li>
            <li>{t('extensionUsageStep2')}</li>
            <li>{t('extensionUsageStep3')}</li>
          </ol>
        </section>

        <div className="cu-extension-modal-lang-wrap">
          <LanguageTabSwitcher />
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
