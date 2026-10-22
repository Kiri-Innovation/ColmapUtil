import { useEffect, useRef, useState } from 'react';

/** Two mutually exclusive input domains. Only this viewer installs the gate. */
export function useSplatvFocus(canvasRef, timelineRef, playback) {
  const [activeFocus, setActiveFocus] = useState(null);
  const activeRef = useRef(null);
  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  useEffect(() => {
    const send = focus => parent.postMessage({ type: 'hololab-viewer-focus', viewer_id: 'splatv_scene', focus }, location.origin);
    const activate = focus => {
      if (activeRef.current === focus) return;
      // Release held camera movement keys while the canvas still owns focus.
      if (activeRef.current === 'canvas') for (const key of ['w','a','s','d','q','e','ArrowLeft','ArrowRight','ArrowUp','ArrowDown']) {
        window.dispatchEvent(new KeyboardEvent('keyup', { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key }));
      }
      activeRef.current = focus;
      setActiveFocus(focus);
      if (focus === 'canvas') canvasRef.current?.focus();
      else if (focus === 'timeline') timelineRef.current?.focus({ preventScroll: true });
      else document.activeElement?.blur?.();
      send(focus);
    };
    const down = e => {
      if (timelineRef.current?.contains(e.target)) activate('timeline');
      else if (e.target === canvasRef.current) activate('canvas');
      else activate(null);
    };
    const focus = e => {
      if (timelineRef.current?.contains(e.target)) activate('timeline');
      else if (e.target === canvasRef.current) activate('canvas');
      else activate(null);
    };
    const wheel = e => {
      if (activeRef.current === 'canvas' && e.target === canvasRef.current) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (activeRef.current === 'timeline') {
        const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
        playbackRef.current.adjust(-pixels * 0.0002); // 100 px / notch = 2%.
      }
    };
    const key = e => {
      if (e.key === 'Escape') { activate(null); e.stopImmediatePropagation(); return; }
      if (activeRef.current === 'canvas' || e.key === 'Tab') return;
      if (activeRef.current === 'timeline') playbackRef.current.keyDown(e);
      e.stopImmediatePropagation();
    };
    const blur = () => activate(null);
    const message = e => {
      if (e.origin !== location.origin || e.source !== parent || e.data?.type !== 'hololab-viewer-focus-host') return;
      if (e.data.accent) timelineRef.current?.style.setProperty('--viewer-accent', e.data.accent);
      if (e.data.active === false) activate(null);
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('focusin', focus);
    window.addEventListener('wheel', wheel, { capture: true, passive: false });
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', blur);
    window.addEventListener('message', message);
    parent.postMessage({ type: 'hololab-viewer-focus-ready', viewer_id: 'splatv_scene' }, location.origin);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('focusin', focus);
      window.removeEventListener('wheel', wheel, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', blur);
      window.removeEventListener('message', message);
    };
  }, [canvasRef, timelineRef]);
  return activeFocus;
}
