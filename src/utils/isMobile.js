import { useState, useEffect, useCallback } from 'react';
import { BREAKPOINT_MOBILE } from '../config.js';

/**
 * 检测是否为移动设备。
 * 结合 User Agent、触摸支持和屏幕尺寸进行综合判断，
 * 避免桌面浏览器小窗口被误判为移动设备。
 */
export function isMobile() {
  if (typeof window === 'undefined') return false;
  
  // 检测 User Agent 中的移动设备标识
  const userAgent = navigator.userAgent.toLowerCase();
  const mobileKeywords = [
    'android', 'iphone', 'ipod', 'ipad', 'windows phone', 'blackberry',
    'mobile', 'webos', 'opera mini', 'iemobile'
  ];
  
  const hasMobileUA = mobileKeywords.some(keyword => userAgent.includes(keyword));
  
  // 检测是否为触摸设备
  const isTouchDevice = (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0
  );
  
  // 屏幕尺寸检测（作为辅助判断）
  const isSmallScreen = window.innerWidth < BREAKPOINT_MOBILE;
  
  // 1. 如果 User Agent 明确表示是移动设备，则为 mobile
  // 2. 如果同时满足触摸设备 + 小屏幕，则为 mobile
  // 3. 单纯的小屏幕（如桌面浏览器缩小窗口）不算 mobile
  return hasMobileUA || (isTouchDevice && isSmallScreen);
}

/**
 * 与 isMobile() 相同逻辑，但在视口尺寸变化时重新计算。
 * 在 VS Code/Cursor Webview 的内层 iframe 里，仅 window resize 往往不会在拖窄/拖宽侧栏时触发；
 * 需配合 ResizeObserver、visualViewport、matchMedia。
 */
export function useIsMobile() {
  const [, setResizeTick] = useState(0);
  const bump = useCallback(() => setResizeTick((n) => n + 1), []);

  useEffect(() => {
    window.addEventListener('resize', bump);

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', bump);
      vv.addEventListener('scroll', bump);
    }

    const mq = window.matchMedia(`(max-width: ${BREAKPOINT_MOBILE - 1}px)`);
    const onMq = () => bump();
    mq.addEventListener('change', onMq);

    let ro;
    if (typeof ResizeObserver !== 'undefined' && document.documentElement) {
      ro = new ResizeObserver(() => bump());
      ro.observe(document.documentElement);
    }

    return () => {
      window.removeEventListener('resize', bump);
      if (vv) {
        vv.removeEventListener('resize', bump);
        vv.removeEventListener('scroll', bump);
      }
      mq.removeEventListener('change', onMq);
      ro?.disconnect();
    };
  }, [bump]);

  return isMobile();
}
