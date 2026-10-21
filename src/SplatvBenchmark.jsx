import { useEffect, useMemo, useRef, useState } from 'react';
import { HoloEngineRuntime, SceneManager } from '@holoengineruntime';
import './SplatvBenchmark.css';

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
      <canvas ref={canvasRef} className="splatv-canvas" />
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
        onLoadComplete={loaded}
        onError={(error) => setStatus(`加载失败：${error?.message || String(error)}`)}
      />
    </main>
  );
}
