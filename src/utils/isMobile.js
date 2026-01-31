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
