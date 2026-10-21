import { useEffect, useMemo, useRef, useState } from 'react';
import { HoloEngineRuntime, SceneManager } from '@holoengineruntime';
import { ViewContextMenu } from './components/common/ViewContextMenu';
import './SplatvBenchmark.css';

const DEFAULT_VIEW_STORAGE_KEY = 'colmaputil.default_view';

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
  const canvasRef = useRef(null);
  const startedAtRef = useRef(performance.now());
  const [fps, setFps] = useState(0);
  const [fileSize, setFileSize] = useState(null);
  const [vertexCount, setVertexCount] = useState(null);
  const [status, setStatus] = useState(src ? '加载、解析与首次深度排序中' : '缺少 src 参数');
  const [elapsed, setElapsed] = useState(0);
  const [firstFrameMs, setFirstFrameMs] = useState(null);
  const [time, setTime] = useState(0.5);
  const [cameraState, setCameraState] = useState(null);
  const [workflowManaged, setWorkflowManaged] = useState(false);
  const [workflowView, setWorkflowView] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null);
  const pendingViewRef = useRef(null);
  const factoryViewRef = useRef(null);

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
  }, [cameraState]);

  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'hololab-viewer-camera') return;
      const managed = event.data.managed === true;
      setWorkflowManaged(managed);
      setWorkflowView(event.data.view ?? null);
      // If the host has no workflow view service, preserve the local fallback
      // instead of treating its null as a reset command.
      if (managed) applyView(event.data.view ?? factoryViewRef.current);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [applyView]);

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
    <main className="splatv-benchmark">
      <canvas ref={canvasRef} className="splatv-canvas" onContextMenu={(event) => {
        event.preventDefault(); const view = captureView(); if (view) setCtxMenu({ x: event.clientX, y: event.clientY, view });
      }} />
      {showHud && <aside className="splatv-hud" aria-live="polite">
        <div><b>{status}</b></div>
        <div>FPS {fps}</div>
        <div>高斯 {vertexCount?.toLocaleString('en-US') ?? '—'}</div>
        <div>文件 {formatBytes(fileSize)}</div>
        <div>{firstFrameMs === null ? `耗时 ${(elapsed / 1000).toFixed(1)} s` : `首帧 ${(firstFrameMs / 1000).toFixed(2)} s`}</div>
        <div className="splatv-help">拖拽旋转 · 滚轮缩放</div>
      </aside>}
      <label className="splatv-time-control">
        <span>时间 {time.toFixed(2)}</span>
        <input
          className="nodrag nowheel"
          type="range"
          min="0"
          max="1"
          step="0.001"
          value={time}
          onChange={(event) => setTime(Number(event.target.value))}
          aria-label="4D Gaussian time"
        />
      </label>
      <HoloEngineRuntime
        canvasRef={canvasRef}
        sceneManager={sceneManager}
        cameraMode="orbit"
        fourDGaussianTime={time}
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
          applyView(factoryViewRef.current);
          if (workflowManaged) publishView(null);
          else localStorage.removeItem(DEFAULT_VIEW_STORAGE_KEY);
        }}
        hasDefault={workflowManaged ? !!workflowView : !!localStorage.getItem(DEFAULT_VIEW_STORAGE_KEY)}
      />}
    </main>
  );
}
