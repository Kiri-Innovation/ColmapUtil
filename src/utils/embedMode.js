/**
 * Embed mode detection.
 *
 * An ``embed`` query parameter, or being mounted in an iframe, means we're
 * inside a parent application (e.g.
 * HoloLab's canvas preview) that owns the surrounding chrome and drives
 * data via postMessage.  In that mode we suppress the standalone-app UI
 * cues — full-page loading overlay, toolbar spinner, artificial UX delays
 * — because the parent already renders its own loading affordances and
 * expects hot-swap posts to apply instantly.  Standalone mode (no
 * no embed parameter and a top-level window) keeps all UI as-is.
 */

export function isEmbedMode() {
  if (typeof window === 'undefined') return false;
  const p = new URLSearchParams(window.location.search);
  // ``embed=splatv`` selects a separate entry point today, but treating all
  // explicit embed values consistently prevents an embedded App build from
  // re-enabling standalone-only UI in the future.
  if (p.has('embed')) return true;

  // A host can omit the query parameter.  Its iframe still owns layout and
  // data flow, so viewport-size and standalone drop UI must not leak in.
  return window.self !== window.top;
}
