import { BREAKPOINT_MOBILE } from '../config.js';

/** True if viewport width < threshold. */
export function isMobile(threshold = BREAKPOINT_MOBILE) {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < threshold;
}
