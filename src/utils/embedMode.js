/**
 * Embed mode detection.
 *
 * ``?embed=1`` on the URL means we're mounted inside a parent iframe (e.g.
 * HoloLab's canvas preview) that owns the surrounding chrome and drives
 * data via postMessage.  In that mode we suppress the standalone-app UI
 * cues — full-page loading overlay, toolbar spinner, artificial UX delays
 * — because the parent already renders its own loading affordances and
 * expects hot-swap posts to apply instantly.  Standalone mode (no
 * ``?embed=1``) keeps all UI as-is.
 */

export function isEmbedMode() {
  if (typeof window === 'undefined') return false;
  const p = new URLSearchParams(window.location.search);
  const v = p.get('embed');
  return v === '1' || v === 'true';
}
