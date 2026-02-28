/**
 * ExtensionModal 与 URL /vscode-extension 的联动
 * 打开弹窗时 push 到 /vscode-extension，关闭时恢复
 * 直接访问 /vscode-extension 时自动打开弹窗
 */

import { useState, useEffect } from 'react';

const EXTENSION_PATH = '/vscode-extension';
const PATH_CHANGE_EVENT = 'colmaputil-pathchange';

function getExtensionPath() {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '';
  return base + EXTENSION_PATH;
}

export function isExtensionPath() {
  const p = window.location.pathname;
  const extPath = getExtensionPath();
  return p === extPath || p === extPath + '/' || p.endsWith(EXTENSION_PATH);
}

export function navigateToExtension() {
  const path = getExtensionPath();
  window.history.pushState({ extensionModal: true }, '', path);
  window.dispatchEvent(new CustomEvent(PATH_CHANGE_EVENT));
}

export function navigateAwayFromExtension() {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '';
  const fallback = base || '/';
  window.history.replaceState(null, '', fallback);
  window.dispatchEvent(new CustomEvent(PATH_CHANGE_EVENT));
}

export function useExtensionModalUrl() {
  const [isOpen, setIsOpen] = useState(() => isExtensionPath());

  useEffect(() => {
    const handler = () => setIsOpen(isExtensionPath());
    window.addEventListener('popstate', handler);
    window.addEventListener(PATH_CHANGE_EVENT, handler);
    return () => {
      window.removeEventListener('popstate', handler);
      window.removeEventListener(PATH_CHANGE_EVENT, handler);
    };
  }, []);

  return isOpen;
}
