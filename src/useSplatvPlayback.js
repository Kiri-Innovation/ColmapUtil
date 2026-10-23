import { useEffect, useRef, useState } from 'react';

export const PLAYBACK_STORAGE_KEY = 'colmaputil.splatv.playback';
export function restorePlayback(raw) {
  try {
    const saved = JSON.parse(raw);
    if (['auto', 'manual'].includes(saved?.mode) && typeof saved.time === 'number' && Number.isFinite(saved.time)) {
      return { mode: saved.mode, time: Math.max(0, Math.min(1, saved.time)), direction: saved.direction === -1 ? -1 : 1 };
    }
  } catch { /* Invalid preferences fall back to the first-visit defaults. */ }
  return { mode: 'auto', time: 0.5, direction: 1 };
}

export function playbackPeriod(raw) {
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 2 && seconds <= 120 ? seconds : 8;
}

export function advancePlayback(value, direction, seconds, period) {
  const phase = ((direction > 0 ? value : 2 - value) + seconds * 2 / period) % 2;
  return { value: phase <= 1 ? phase : 2 - phase, direction: phase < 1 ? 1 : -1 };
}

/** Viewer-owned animation; no React state updates in the frame loop. */
export function useSplatvPlayback(period, enabled = true) {
  const [initial] = useState(() => {
    if (!enabled) return { mode: 'manual', time: 0.5, direction: 1, raw: null };
    try { const raw = localStorage.getItem(PLAYBACK_STORAGE_KEY); return { ...restorePlayback(raw), raw }; }
    catch { return { ...restorePlayback(null), raw: null }; }
  });
  const timeRef = useRef(initial.time);
  const mode = useRef(initial.mode);
  const direction = useRef(initial.direction);
  const saveTimer = useRef(null);
  const lastSaved = useRef(initial.raw);
  const last = useRef(0);
  const drag = useRef(null);
  const trackRef = useRef(null);
  const thumbRef = useRef(null);
  const labelRef = useRef(null);

  function save() {
    if (!enabled) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const serialized = JSON.stringify({ mode: mode.current, time: timeRef.current, direction: direction.current });
    if (serialized === lastSaved.current) return;
    try { localStorage.setItem(PLAYBACK_STORAGE_KEY, serialized); lastSaved.current = serialized; }
    catch { /* Storage unavailable: playback still works for this session. */ }
  }

  function paint() {
    const value = timeRef.current;
    if (thumbRef.current) {
      thumbRef.current.style.left = `${value * 100}%`;
      thumbRef.current.setAttribute('aria-valuenow', value.toFixed(3));
      thumbRef.current.setAttribute('aria-valuetext', `${value.toFixed(3)}，${mode.current === 'auto' ? '自动往复' : '手动'}`);
      thumbRef.current.dataset.mode = mode.current;
    }
    if (labelRef.current) labelRef.current.textContent = `${mode.current === 'auto' ? '自动' : '手动'} ${value.toFixed(2)}`;
  }
  function manual(value = timeRef.current) {
    const changedMode = mode.current !== 'manual';
    mode.current = 'manual';
    timeRef.current = Math.max(0, Math.min(1, value));
    paint();
    clearTimeout(saveTimer.current);
    if (changedMode) save();
    else saveTimer.current = setTimeout(save, 300);
  }
  function resume(event) {
    event.preventDefault();
    mode.current = 'auto';
    last.current = performance.now();
    paint();
    save();
  }
  useEffect(() => {
    if (!enabled) return;
    let raf;
    last.current = performance.now();
    const tick = now => {
      if (mode.current === 'auto') {
        const next = advancePlayback(timeRef.current, direction.current, Math.max(0, now - last.current) / 1000, period);
        timeRef.current = next.value;
        direction.current = next.direction;
        paint();
      }
      last.current = now;
      raf = requestAnimationFrame(tick);
    };
    paint();
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [period, enabled]);

  useEffect(() => {
    if (!enabled) return;
    // Other cards/tabs share this preference. A stale viewer must not overwrite
    // a newer interaction when all iframes unload together.
    const flush = () => {
      clearTimeout(saveTimer.current);
      try { if (localStorage.getItem(PLAYBACK_STORAGE_KEY) !== lastSaved.current) return; } catch { return; }
      save();
    };
    const onHidden = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHidden);
      flush();
    };
  }, [enabled]);

  function pointerDown(event) {
    if (event.button !== 0 || drag.current) return;
    event.preventDefault();
    event.stopPropagation();
    manual(); // Pause on down, before any movement or release.
    thumbRef.current?.focus();
    const bounds = trackRef.current.getBoundingClientRect();
    const thumbHit = event.target === thumbRef.current;
    drag.current = { id: event.pointerId, x: event.clientX, value: timeRef.current, width: bounds.width };
    if (!thumbHit) {
      manual((event.clientX - bounds.left) / bounds.width);
      drag.current.value = timeRef.current;
    }
    // Preserve thumb as the click/dblclick target while dragging outside it.
    (thumbHit ? thumbRef.current : event.currentTarget).setPointerCapture(event.pointerId);
  }
  function pointerMove(event) {
    const start = drag.current;
    if (start?.id !== event.pointerId) return;
    manual(start.value + (event.clientX - start.x) / start.width);
  }
  function pointerEnd(event) {
    if (drag.current?.id === event.pointerId) { drag.current = null; save(); }
  }
  function keyDown(event) {
    const steps = { ArrowRight: 0.01, ArrowUp: 0.01, ArrowLeft: -0.01, ArrowDown: -0.01, PageUp: 0.1, PageDown: -0.1 };
    if (event.key === 'Enter') { resume(event); return; }
    if (!(event.key in steps) && !['Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    manual(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : timeRef.current + steps[event.key]);
  }
  return { initial, timeRef, trackRef, thumbRef, labelRef, pointerDown, pointerMove, pointerEnd, keyDown, resume, adjust: delta => manual(timeRef.current + delta) };
}
