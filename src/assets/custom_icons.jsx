/**
 * Custom SVG icons for ColmapUtil.
 * These specialized icons cannot be replaced by lucide-react.
 * 
 * For standard icons, import directly from 'lucide-react'.
 */

// ============================================
// Mouse Icons (based on lucide Mouse design)
// ============================================

export function MouseLeftIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="7" />
      <path d="M12 6v4" />
      <path d="M5 10h7V2.5" fill="currentColor" opacity="0.3" stroke="none" />
    </svg>
  );
}

export function MouseRightIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="7" />
      <path d="M12 6v4" />
      <path d="M19 10h-7V2.5" fill="currentColor" opacity="0.3" stroke="none" />
    </svg>
  );
}

export function MouseScrollIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="7" />
      <path d="M12 5v2" />
      <path d="M9 6l3-2 3 2" />
      <path d="M12 11v2" />
      <path d="M9 12l3 2 3-2" />
    </svg>
  );
}

// ============================================
// Frustum / Camera Icons
// ============================================

export function FrustumWireframeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="12" height="18" />
      <circle cx="20" cy="12" r="1.5" fill="currentColor" />
      <line x1="22" y1="12" x2="4" y2="3" />
      <line x1="22" y1="12" x2="16" y2="3" />
      <line x1="22" y1="12" x2="16" y2="21" />
      <line x1="22" y1="12" x2="4" y2="21" />
    </svg>
  );
}
