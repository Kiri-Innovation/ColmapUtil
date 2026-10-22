import { useEffect, useMemo, useRef, useState } from 'react';
import { HoloEngineRuntime, SceneManager } from '@holoengineruntime';
import { ViewContextMenu } from './components/common/ViewContextMenu';
import './SplatvBenchmark.css';
import { useSplatvPlayback, playbackPeriod } from './useSplatvPlayback';
import { useSplatvFocus } from './useSplatvFocus';

const DEFAULT_VIEW_STORAGE_KEY = 'colmaputil.default_view';
const HELPERS_KEY = 'colmaputil.splatv.helpers';
const HELPER_MODES = ['both', 'axes', 'off'];
const HELPER_LABELS = { both: '网格和坐标轴', axes: '仅坐标轴', off: '不显示辅助' };

function readFileSize(url) {
  return fetch(url, { headers: { Range: 'bytes=0-0' } })
    .then((response) => {
      const range = response.headers.get('content-range');
      const size = range?.match(/\/(\d+)$/)?.[1] || response.headers.get('content-length');
      return size ? Number(size) : null;
    })
    .catch(() => null);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '未知';
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

/**
 * Deliberately small performance harness. It is selected only by
 * `?embed=splatv&src=...`; the normal COLMAP application is untouched.
 */
export default function SplatvBenchmark() {
  const src = new URLSearchParams(window.location.search).get('src');
  const showHud = new URLSearchParams(window.location.search).get('hud') === '1';
  const debug = new URLSearchParams(window.location.search).get('debug') === '1';
  const canvasRef = useRef(null);
  const [helpers, setHelpers] = useState(() => {
    try { const saved = localStorage.getItem(HELPERS_KEY); return HELPER_MODES.includes(saved) ? saved : 'both'; }
    catch { return 'both'; }
  });
  const cycleHelpers = () => {
    const next = HELPER_MODES[(HELPER_MODES.indexOf(helpers) + 1) % HELPER_MODES.length];
    setHelpers(next);
    try { localStorage.setItem(HELPERS_KEY, next); } catch { /* Session-only when storage is unavailable. */ }
  };
  const startedAtRef = useRef(performance.now());
  const [fps, setFps] = useState(0);
  const [fileSize, setFileSize] = useState(null);
  const [vertexCount, setVertexCount] = useState(null);
  const [status, setStatus] = useState(src ? '加载、解析与首次深度排序中' : '缺少 src 参数');
  const [elapsed, setElapsed] = useState(0);
  const [firstFrameMs, setFirstFrameMs] = useState(null);
  const playback = useSplatvPlayback(playbackPeriod(new URLSearchParams(window.location.search).get('playback_period')));
  const timelineRef = useRef(null);
  const activeFocus = useSplatvFocus(canvasRef, timelineRef, playback);
  const [cameraState, setCameraState] = useState(null);
  const [workflowManaged, setWorkflowManaged] = useState(false);
  const [workflowView, setWorkflowView] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null);
  const pendingViewRef = useRef(null);
  const factoryViewRef = useRef(null);
  const workflowFactoryRef = useRef(null);
  const announcedReadyRef = useRef(false);

  const captureView = useMemo(() => () => {
    const state = cameraState;
    const cam = state?.cameraRef?.current;
    const target = state?.orbitTargetRef?.current;
    const radius = state?.orbitDistanceRef?.current;
    if (!cam || !target || !Number.isFinite(radius)) return null;
    const pos = cam._position ?? cam.position;
    const dx = target[0] - pos[0], dy = target[1] - pos[1], dz = target[2] - pos[2];
    const mag = Math.hypot(dx, dy, dz);
    return {
      v: 2, mode: 'orbit', pos: [...pos],
      up: cam.worldUp,
      yaw: mag > 1e-6 ? Math.atan2(-dx, -dz) : 0,
      pitch: mag > 1e-6 ? Math.asin(Math.max(-1, Math.min(1, dy / mag))) : 0,
      fov: cam.targetVerticalFOV ?? 60,
      orbitTarget: [...target], orbitRadius: radius,
    };
  }, [cameraState]);

  const applyView = useMemo(() => (view) => {
    const state = cameraState;
    const cam = state?.cameraRef?.current;
    if (!cam || !view?.orbitTarget || !Number.isFinite(view.orbitRadius)) {
      pendingViewRef.current = view;
      return;
    }
    const target = view.orbitTarget;
    const yaw = Number(view.yaw) || 0, pitch = Number(view.pitch) || 0;
    const fwdH = [-Math.sin(yaw), 0, -Math.cos(yaw)];
    const fwd = [fwdH[0] * Math.cos(pitch), Math.sin(pitch), fwdH[2] * Math.cos(pitch)];
    cam._position = [target[0] - fwd[0] * view.orbitRadius, target[1] - fwd[1] * view.orbitRadius, target[2] - fwd[2] * view.orbitRadius];
    cam._forwardHorizontalRef = fwdH;
    cam._yawRad = 0; cam._pitchRad = pitch;
    cam.targetVerticalFOV = Number.isFinite(view.fov) ? view.fov : cam.targetVerticalFOV;
    cam._cacheInvalid = true; cam._rotationCache = null; cam._viewMatrixCache = null;
    state.orbitTargetRef.current = [...target];
    state.orbitDistanceRef.current = view.orbitRadius;
    state.orbitTargetDistanceRef.current = view.orbitRadius;
  }, [cameraState]);

  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'hololab-viewer-camera') return;
      const managed = event.data.managed === true;
      setWorkflowManaged(managed);
      setWorkflowView(event.data.has_default === false ? null : event.data.view ?? null);
      if (event.data.factory_view) workflowFactoryRef.current = event.data.factory_view;
      // If the host has no workflow view service, preserve the local fallback
      // instead of treating its null as a reset command.
      if (managed) applyView(event.data.view ?? workflowFactoryRef.current);
    };
    window.addEventListener('message', onMessage);
    if (cameraState && !announcedReadyRef.current) {
      announcedReadyRef.current = true;
      window.parent.postMessage({ type: 'hololab-viewer-ready', viewer_id: 'splatv_scene' }, window.location.origin);
    }
    return () => window.removeEventListener('message', onMessage);
  }, [applyView, cameraState]);

  useEffect(() => {
    if (cameraState && !factoryViewRef.current) factoryViewRef.current = captureView();
    if (cameraState && pendingViewRef.current) {
      const view = pendingViewRef.current;
      pendingViewRef.current = null;
      applyView(view);
    }
  }, [cameraState, applyView, captureView]);

  // Standalone/debug pages and old gateways have no workflow context. Keep
  // their historical per-browser default behavior as a graceful fallback.
  useEffect(() => {
    if (!cameraState || workflowManaged) return;
    try {
      const saved = JSON.parse(localStorage.getItem(DEFAULT_VIEW_STORAGE_KEY) || 'null');
      if (saved?.v >= 1) applyView(saved);
    } catch (_) {
      // Invalid local state is harmless: retain the runtime's factory view.
    }
  }, [cameraState, workflowManaged, applyView]);

  const publishView = useMemo(() => (view) => {
    if (workflowManaged && window.parent !== window) {
      window.parent.postMessage({ type: 'hololab-viewer-camera-default', view }, window.location.origin);
    }
  }, [workflowManaged]);

  const goHome = () => {
    if (workflowManaged) {
      applyView(workflowView ?? workflowFactoryRef.current);
      return;
    }
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(DEFAULT_VIEW_STORAGE_KEY) || 'null'); } catch { /* Use factory fallback. */ }
    applyView(saved?.orbitTarget ? saved : factoryViewRef.current);
  };

  const sceneManager = useMemo(() => {
    if (!src) return null;
    const scene = new SceneManager();
    scene.addObject('benchmark-splatv', src, [0, 0, 0], [0, 0, 0], [1, 1, 1], null, 'splatv', '4dgs');
    return scene;
  }, [src]);

  useEffect(() => {
    if (!src) return undefined;
    readFileSize(src).then(setFileSize);
    const timer = window.setInterval(() => setElapsed(performance.now() - startedAtRef.current), 100);
    return () => window.clearInterval(timer);
  }, [src]);

  useEffect(() => {
    let frameCount = 0;
    let windowStartedAt = performance.now();
    let raf = 0;
    const sample = (now) => {
      frameCount += 1;
      if (now - windowStartedAt >= 500) {
        setFps(Math.round((frameCount * 1000) / (now - windowStartedAt)));
        frameCount = 0;
        windowStartedAt = now;
      }
      raf = requestAnimationFrame(sample);
    };
    raf = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(raf);
  }, []);

  const loaded = () => {
    const model = sceneManager?.getObject('benchmark-splatv');
    setVertexCount(model?.vertexCount ?? null);
    const duration = performance.now() - startedAtRef.current;
    setFirstFrameMs(duration);
    setElapsed(duration);
    setStatus('首帧已就绪');
  };

  if (!src) {
    return <main className="splatv-benchmark"><div className="splatv-hud">需要：?embed=splatv&amp;src=&lt;.splatv URL&gt;</div></main>;
  }

  return (
    <main className="splatv-benchmark" data-active-focus={activeFocus ?? 'none'}>
      <button type="button" className="splatv-helpers nodrag nowheel" data-helper-mode={helpers}
        aria-label={`辅助显示：${HELPER_LABELS[helpers]}；点击切换`}
        title={`当前：${HELPER_LABELS[helpers]}；点击切换`} onClick={cycleHelpers}>
        <svg width="20" height="20" viewBox="0 0 24 24" data-icon-design="helpers-ac-v1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {helpers === 'both' && <path d="m2 14 10-6 10 6-10 6Zm5-3 10 6M7 17l10-6" />}
          {helpers !== 'off' ? <path d="M10 14V3m0 11L2 19m8-5 11 5M8 5l2-2 2 2" /> : <><path strokeDasharray="1 3" d="M9 5v14m6-14v14M5 9h14M5 15h14" /><path strokeWidth="1.1" d="m7 7 10 10" /></>}
        </svg>
      </button>
      <button type="button" className="splatv-helpers splatv-home nodrag nowheel"
        aria-label="回到默认视角" title="回到默认视角" onClick={goHome} disabled={!cameraState}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9" />
        </svg>
      </button>
      <span className="splatv-build" data-debug={debug ? 'true' : 'false'} data-viewer-build={__VIEWER_BUILD_ID__}
        title={`实际加载的 SplaTV 构建版本：${__VIEWER_BUILD_ID__}`}>
        {__VIEWER_BUILD_ID__}
      </span>
      <canvas ref={canvasRef} className="splatv-canvas" tabIndex={0} aria-label="SplaTV 3D view" onContextMenu={(event) => {
        event.preventDefault(); const view = captureView(); if (view) setCtxMenu({ x: event.clientX, y: event.clientY, view });
      }} />
      {showHud && <aside className="splatv-hud" aria-live="polite">
        <div>Build {__VIEWER_BUILD_ID__}</div>
        <div><b>{status}</b></div>
        <div>FPS {fps}</div>
        <div>高斯 {vertexCount?.toLocaleString('en-US') ?? '—'}</div>
        <div>文件 {formatBytes(fileSize)}</div>
        <div>{firstFrameMs === null ? `耗时 ${(elapsed / 1000).toFixed(1)} s` : `首帧 ${(firstFrameMs / 1000).toFixed(2)} s`}</div>
        <div className="splatv-help">拖拽旋转 · 滚轮缩放</div>
      </aside>}
      <div className="splatv-time-control nodrag nowheel" ref={timelineRef} tabIndex={0} aria-label="时间轴交互区域">
        <span ref={playback.labelRef}>自动 0.50</span>
        <div className="splatv-time-track" ref={playback.trackRef}
          onPointerDown={playback.pointerDown} onPointerMove={playback.pointerMove}
          onPointerUp={playback.pointerEnd} onPointerCancel={playback.pointerEnd}
          onLostPointerCapture={playback.pointerEnd}>
          <button type="button" role="slider" className="splatv-time-thumb" ref={playback.thumbRef}
            aria-label="4D Gaussian time" aria-valuemin={0} aria-valuemax={1} aria-valuenow={0.5}
            aria-orientation="horizontal" data-mode="auto" style={{ left: '50%' }}
            title="拖拽暂停；双击把手或按 Enter 恢复往复；方向键调整时间"
            onDoubleClick={playback.resume} onKeyDown={playback.keyDown} />
        </div>
      </div>
      <HoloEngineRuntime
        canvasRef={canvasRef}
        sceneManager={sceneManager}
        cameraMode="orbit"
        fourDGaussianTime={0.5}
        fourDGaussianTimeRef={playback.timeRef}
        showGrid={helpers === 'both'}
        showAxes={helpers !== 'off'}
        onCameraStateReady={setCameraState}
        onLoadComplete={loaded}
        onError={(error) => setStatus(`加载失败：${error?.message || String(error)}`)}
      />
      {ctxMenu && <ViewContextMenu
        x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)}
        onCopy={() => navigator.clipboard?.writeText(JSON.stringify(ctxMenu.view, null, 2))}
        onSetDefault={() => {
          setWorkflowView(ctxMenu.view);
          if (workflowManaged) publishView(ctxMenu.view);
          else localStorage.setItem(DEFAULT_VIEW_STORAGE_KEY, JSON.stringify(ctxMenu.view));
        }}
        onResetDefault={() => {
          setWorkflowView(null);
          applyView(workflowManaged ? workflowFactoryRef.current : factoryViewRef.current);
          if (workflowManaged) publishView(null);
          else localStorage.removeItem(DEFAULT_VIEW_STORAGE_KEY);
        }}
        hasDefault={workflowManaged ? !!workflowView : !!localStorage.getItem(DEFAULT_VIEW_STORAGE_KEY)}
      />}
    </main>
  );
}
