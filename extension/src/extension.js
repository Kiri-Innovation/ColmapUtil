const vscode = require('vscode');
const { Writable } = require('stream');
// 使用线上部署地址；开发时可改回 http://localhost:5173
const COLMAP_UTIL_URL = 'https://colmap.utils.kiriengine.com/';
const IFRAME_ORIGIN = 'https://colmap.utils.kiriengine.com';
const ZIP_CHUNK_SIZE = 1024 * 1024; // 1MB（base64 约 1.33MB/条，一般 postMessage 可接受）

/** 与 zipLoader 中 sparse 命名一致；NoImage 打包时跳过栅格图，但保留 sparse 与 database 等 */
const SPARSE_COLMAP_BASENAMES = new Set([
  'cameras.bin', 'cameras.txt', 'images.bin', 'images.txt',
  'points3d.bin', 'points3d.txt', 'rigs.bin', 'rigs.txt', 'frames.bin', 'frames.txt',
]);

function shouldSkipFileForNoImageZip(relativePath) {
  const norm = relativePath.replace(/\\/g, '/');
  const base = norm.split('/').pop() || '';
  const lower = base.toLowerCase();
  if (SPARSE_COLMAP_BASENAMES.has(lower)) return false;
  const inSparse = norm.includes('/sparse/') || norm.startsWith('sparse/');
  if (inSparse && /\.(bin|txt)$/i.test(base)) return false;
  return /\.(jpe?g|png|gif|bmp|webp|tiff?|heic|exr)$/i.test(norm);
}

/** 一次遍历收集文件列表，避免重复扫描 */
async function collectFiles(dirUri, prefix) {
  const fileList = [];
  const stack = [{ uri: dirUri, prefix }];
  while (stack.length) {
    const { uri, prefix: p } = stack.pop();
    const entries = await vscode.workspace.fs.readDirectory(uri);
    for (const [name, fileType] of entries) {
      const childUri = vscode.Uri.joinPath(uri, name);
      const archiveName = p + name;
      if ((fileType & vscode.FileType.Directory) !== 0) {
        stack.push({ uri: childUri, prefix: archiveName + '/' });
      } else {
        fileList.push({ uri: childUri, name: archiveName });
      }
    }
  }
  return fileList;
}

/** 节流：每 N 个文件或每 M 毫秒最多上报一次，减少 SSH 下的 postMessage 往返 */
function throttleProgress(intervalMs, intervalCount, onProgress) {
  let lastTime = 0;
  let lastCount = -1;
  return (processed, total) => {
    const now = Date.now();
    const shouldSend = processed === total ||
      processed - lastCount >= intervalCount ||
      now - lastTime >= intervalMs;
    if (shouldSend && onProgress) {
      lastTime = now;
      lastCount = processed;
      onProgress(processed, total);
    }
  };
}

/**
 * 使用 workspace.fs 打包，支持 SSH Remote 等远程 URI
 * @param {{ excludeRasterImages?: boolean }} [opts]
 */
async function zipFolderToBuffer(folderUri, onProgress, onScanning, opts = {}) {
  const excludeRasterImages = !!opts.excludeRasterImages;
  const archiver = require('archiver');
  if (onScanning) onScanning();
  const fileList = await collectFiles(folderUri, '');
  const toPack = excludeRasterImages
    ? fileList.filter((f) => !shouldSkipFileForNoImageZip(f.name))
    : fileList;
  const totalFiles = toPack.length;
  if (totalFiles === 0) {
    throw new Error(
      'No files left to pack (NoImage mode removed all raster files). Ensure sparse/ COLMAP files are present.'
    );
  }
  const throttled = onProgress ? throttleProgress(300, 20, onProgress) : null;
  return new Promise((resolve, reject) => {
    const chunks = [];
    const writable = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(chunk);
        callback();
      }
    });
    writable.on('finish', () => resolve(Buffer.concat(chunks)));
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', reject);
    archive.pipe(writable);
    let processed = 0;
    (async () => {
      for (const { uri, name } of toPack) {
        const data = await vscode.workspace.fs.readFile(uri);
        archive.append(Buffer.from(data), { name });
        processed++;
        if (throttled) throttled(processed, totalFiles);
      }
      archive.finalize();
    })().catch(reject);
  });
}

function getWebviewContent() {
  const iframeOrigin = IFRAME_ORIGIN;
  const iframeSrc = COLMAP_UTIL_URL;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; min-height: 100vh; }
    body { background: #252526; color: #cccccc; }
    .view { position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 20px; background: #252526; }
    .view.hidden { display: none !important; }
    .progress-outer { width: 300px; height: 12px; background: #3c3c3c; border-radius: 6px; overflow: hidden; }
    .progress-inner { height: 100%; width: 0%; background: #0e639c; border-radius: 6px; transition: width 0.2s; }
    .progress-label { color: #cccccc; font-family: system-ui, sans-serif; font-size: 14px; }
    #colmap-frame { position: absolute; top: 0; left: 0; right: 0; bottom: 0; width: 100%; height: 100%; border: none; display: block; }
    #send-progress-bar { position: fixed; left: 0; right: 0; bottom: 0; height: 40px; min-height: 40px; max-height: 40px; background: #252526; border-top: 1px solid #3c3c3c; display: none; align-items: center; padding: 0 16px; gap: 12px; font-family: system-ui, sans-serif; font-size: 13px; color: #cccccc; z-index: 1000; box-sizing: border-box; }
    #send-progress-bar.visible { display: flex; }
    #send-progress-bar.error { background: #5a1d1d; color: #f48771; border-top-color: #be1100; }
    #send-progress-bar .send-progress-fill { flex: 1; max-width: 200px; height: 8px; background: #3c3c3c; border-radius: 4px; overflow: hidden; }
    #send-progress-bar .send-progress-inner { height: 100%; width: 0%; background: #0e639c; border-radius: 4px; transition: width 0.15s; }
  </style>
</head>
<body>
  <div id="compressing-view" class="view" style="background:#252526;color:#cccccc;">
    <div class="progress-outer"><div class="progress-inner" id="progress-fill"></div></div>
    <div class="progress-label" id="progress-text">压缩中...</div>
  </div>
  <iframe id="colmap-frame" class="view hidden" title="ColmapUtil"></iframe>
  <div id="send-progress-bar">
    <div class="send-progress-fill"><div class="send-progress-inner" id="send-progress-fill"></div></div>
    <span id="send-progress-text">发送中...</span>
  </div>
  <script>
    (function() {
      var iframeOrigin = ${JSON.stringify(iframeOrigin)};
      var iframeSrc = ${JSON.stringify(iframeSrc)};
      var vsCodeApi = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

      function sendToExtension(msg) {
        if (vsCodeApi) vsCodeApi.postMessage(msg);
      }

      function forwardToIframe(msg) {
        var frame = document.getElementById('colmap-frame');
        if (frame && frame.contentWindow) {
          frame.contentWindow.postMessage(msg, iframeOrigin);
        }
      }

      window.addEventListener('message', function(event) {
        var d = event.data;
        if (!d) return;
        var frame = document.getElementById('colmap-frame');
        if (frame && frame.contentWindow && event.source === frame.contentWindow) {
          if (d.type === 'colmaputil-page-ready') {
            sendToExtension({ type: 'ready' });
            return;
          }
          if (d.type === 'colmaputil-ready-ack') {
            sendToExtension({ type: 'iframeReady' });
            var bar = document.getElementById('send-progress-bar');
            var text = document.getElementById('send-progress-text');
            if (bar && text) text.textContent = '握手成功，准备发送...';
          }
          if (d.type === 'colmaputil-chunk-ack' && typeof d.index === 'number') sendToExtension({ type: 'chunkAck', index: d.index });
          return;
        }
        if (d.type === 'colmaputil-rezipBegin') {
          var cv = document.getElementById('compressing-view');
          var fe = document.getElementById('colmap-frame');
          if (cv) cv.classList.remove('hidden');
          if (fe) fe.classList.add('hidden');
          var el = document.getElementById('progress-fill');
          var text = document.getElementById('progress-text');
          if (el) el.style.width = '0%';
          if (text) text.textContent = '压缩中...';
          return;
        }
        if (d.type === 'colmaputil-rezipZipComplete') {
          var cv2 = document.getElementById('compressing-view');
          var fe2 = document.getElementById('colmap-frame');
          if (cv2) cv2.classList.add('hidden');
          if (fe2) fe2.classList.remove('hidden');
          return;
        }
        if (d.type === 'colmaputil-scanning') {
          var el = document.getElementById('progress-fill');
          var text = document.getElementById('progress-text');
          if (el) el.style.width = '0%';
          if (text) text.textContent = '扫描目录中...';
          return;
        }
        if (d.type === 'colmaputil-zipProgress') {
          var el = document.getElementById('progress-fill');
          var text = document.getElementById('progress-text');
          var pct = d.total > 0 ? Math.round((d.processed / d.total) * 100) : 0;
          if (el) el.style.width = pct + '%';
          if (text) text.textContent = '压缩中... ' + d.processed + ' / ' + d.total + ' 个文件';
          return;
        }
        if (d.type === 'colmaputil-handshake') {
          var bar = document.getElementById('send-progress-bar');
          var fillWrap = bar && bar.querySelector('.send-progress-fill');
          var text = document.getElementById('send-progress-text');
          if (bar) {
            bar.classList.remove('error');
            bar.classList.add('visible');
            if (fillWrap) fillWrap.style.display = 'none';
            if (text) text.textContent = '等待握手回复...';
          }
          forwardToIframe({ type: 'colmaputil-handshake', noImage: !!d.noImage });
          return;
        }
        if (d.type === 'colmaputil-zipDone') {
          document.getElementById('compressing-view').classList.add('hidden');
          var frameEl = document.getElementById('colmap-frame');
          frameEl.classList.remove('hidden');
          frameEl.src = iframeSrc;
          return;
        }
        if (d.type === 'colmaputil-sendStart') {
          var bar = document.getElementById('send-progress-bar');
          var fillWrap = bar && bar.querySelector('.send-progress-fill');
          var fill = document.getElementById('send-progress-fill');
          var text = document.getElementById('send-progress-text');
          if (bar) {
            bar.classList.remove('error');
            bar.classList.add('visible');
            if (fillWrap) fillWrap.style.display = '';
            if (fill) fill.style.width = '0%';
            if (text) text.textContent = '0 / ' + (d.total || 0);
          }
          return;
        }
        if (d.type === 'colmaputil-error') {
          document.getElementById('compressing-view').classList.add('hidden');
          var fe3 = document.getElementById('colmap-frame');
          if (fe3) fe3.classList.remove('hidden');
          var bar = document.getElementById('send-progress-bar');
          var text = document.getElementById('send-progress-text');
          bar.classList.add('visible', 'error');
          var fillWrap = bar.querySelector('.send-progress-fill');
          if (fillWrap) fillWrap.style.display = 'none';
          if (text) text.textContent = '错误: ' + (d.message || '未知错误');
          return;
        }
        if (d.type === 'colmaputil-zipChunk') {
          forwardToIframe({ type: 'colmaputil-chunk', index: d.index, total: d.total, data: d.data });
          var bar = document.getElementById('send-progress-bar');
          var fill = document.getElementById('send-progress-fill');
          var text = document.getElementById('send-progress-text');
          if (bar && !bar.classList.contains('error') && d.total > 0) {
            var sent = d.index + 1;
            var pct = Math.round((sent / d.total) * 100);
            if (fill) fill.style.width = pct + '%';
            if (text) text.textContent = sent + ' / ' + d.total;
            if (sent === d.total) {
              if (text) text.textContent = '发送完成 ' + d.total + ' / ' + d.total;
              setTimeout(function() {
                bar.classList.remove('visible');
                bar.querySelector('.send-progress-fill').style.display = '';
              }, 1500);
            }
          }
          return;
        }
      });

      if (document.readyState === 'complete') {
        sendToExtension({ type: 'compressingViewReady' });
      } else {
        window.addEventListener('load', function() { sendToExtension({ type: 'compressingViewReady' }); });
      }
    })();
  </script>
</body>
</html>`;
}

const RELOAD_TRIGGER_FILE = '.reload-extension';

/** @type {vscode.WebviewPanel | null} */
let colmapPanel = null;
let webviewBootstrapped = false;
let colmapIframeReady = false;
let zipSessionId = 0;
/** @type {{ uri: vscode.Uri; session: number; noImage: boolean } | null} */
let pendingZip = null;
let zipSessionNoImage = false;
/** @type {Buffer | null} */
let zipBuffer = null;
let zipBufferSession = -1;
/** @type {(() => void) | null} */
let chunkAckResolve = null;
let chunkAckExpectedIndex = -1;

function bumpZipSession() {
  zipSessionId += 1;
  zipBuffer = null;
  zipBufferSession = -1;
  zipSessionNoImage = false;
  if (chunkAckResolve) {
    const r = chunkAckResolve;
    chunkAckResolve = null;
    r();
  }
}

function resetColmapPanelState() {
  colmapPanel = null;
  webviewBootstrapped = false;
  colmapIframeReady = false;
  zipBuffer = null;
  zipBufferSession = -1;
  chunkAckResolve = null;
  pendingZip = null;
}

/**
 * @param {vscode.WebviewPanel} panel
 * @param {Buffer} buf
 * @param {number} session
 */
async function sendZipChunks(panel, buf, session) {
  const base64 = buf.toString('base64');
  const total = Math.ceil(base64.length / ZIP_CHUNK_SIZE);
  panel.webview.postMessage({ type: 'colmaputil-sendStart', total });
  for (let i = 0; i < total; i++) {
    if (session !== zipSessionId) return;
    const start = i * ZIP_CHUNK_SIZE;
    const end = Math.min(start + ZIP_CHUNK_SIZE, base64.length);
    panel.webview.postMessage({
      type: 'colmaputil-zipChunk',
      index: i,
      total,
      data: base64.slice(start, end)
    });
    chunkAckExpectedIndex = i;
    await new Promise((r) => {
      chunkAckResolve = r;
    });
  }
}

/**
 * @param {vscode.WebviewPanel} panel
 * @param {vscode.Uri} folderUri
 * @param {number} session
 */
async function runZipFlow(panel, folderUri, session, noImage) {
  try {
    const buf = await zipFolderToBuffer(
      folderUri,
      (processed, total) => {
        panel.webview.postMessage({ type: 'colmaputil-zipProgress', processed, total });
      },
      () => {
        panel.webview.postMessage({ type: 'colmaputil-scanning' });
      },
      { excludeRasterImages: noImage }
    );
    if (session !== zipSessionId) return;

    zipBuffer = buf;
    zipBufferSession = session;
    zipSessionNoImage = noImage;

    if (!colmapIframeReady) {
      panel.webview.postMessage({ type: 'colmaputil-zipDone' });
    } else {
      panel.webview.postMessage({ type: 'colmaputil-rezipZipComplete' });
      panel.webview.postMessage({ type: 'colmaputil-handshake', noImage: zipSessionNoImage });
    }
  } catch (e) {
    const errMsg = (e && e.message) ? String(e.message) : '打包失败';
    void vscode.window.showErrorMessage('打包失败: ' + errMsg);
    panel.webview.postMessage({ type: 'colmaputil-error', message: errMsg });
  }
}

function attachColmapWebviewMessageHandler(panel) {
  panel.webview.onDidReceiveMessage(async (msg) => {
    if (!colmapPanel) return;

    if (msg.type === 'chunkAck' && typeof msg.index === 'number') {
      if (chunkAckResolve && msg.index === chunkAckExpectedIndex) {
        chunkAckResolve();
        chunkAckResolve = null;
      }
      return;
    }

    if (msg.type === 'compressingViewReady') {
      webviewBootstrapped = true;
      const p = pendingZip;
      pendingZip = null;
      if (p?.uri) {
        void runZipFlow(panel, p.uri, p.session, p.noImage);
      }
      return;
    }

    if (msg.type === 'ready' && zipBuffer && zipBufferSession === zipSessionId) {
      colmapIframeReady = true;
      colmapPanel.webview.postMessage({ type: 'colmaputil-handshake', noImage: zipSessionNoImage });
      return;
    }

    if (msg.type === 'iframeReady' && zipBuffer && zipBufferSession === zipSessionId) {
      const buf = zipBuffer;
      const sendSession = zipBufferSession;
      zipBuffer = null;
      zipBufferSession = -1;
      try {
        if (!buf) return;
        await sendZipChunks(colmapPanel, buf, sendSession);
      } catch (e) {
        const errMsg = (e && e.message) ? String(e.message) : '发送失败';
        void vscode.window.showErrorMessage('发送失败: ' + errMsg);
        colmapPanel.webview.postMessage({ type: 'colmaputil-error', message: errMsg });
      }
      return;
    }
  });
}

function runSendToColmap(folderUri, noImage) {
  if (!folderUri) return;

  bumpZipSession();
  const session = zipSessionId;

  const title = `ColmapUtil — ${folderUri.fsPath.split(/[/\\]/).pop()}${noImage ? ' (NoImage)' : ''}`;

  if (colmapPanel) {
    colmapPanel.title = title;
    colmapPanel.reveal(vscode.ViewColumn.One);
    if (webviewBootstrapped) {
      colmapPanel.webview.postMessage({ type: 'colmaputil-rezipBegin' });
      void runZipFlow(colmapPanel, folderUri, session, noImage);
    } else {
      pendingZip = { uri: folderUri, session, noImage };
    }
    return;
  }

  pendingZip = { uri: folderUri, session, noImage };

  colmapPanel = vscode.window.createWebviewPanel(
    'colmapUtilWebview',
    title,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: []
    }
  );

  colmapPanel.webview.html = getWebviewContent();
  colmapPanel.reveal(vscode.ViewColumn.One);

  colmapPanel.onDidDispose(() => {
    bumpZipSession();
    resetColmapPanelState();
  });

  attachColmapWebviewMessageHandler(colmapPanel);
}

function activate(context) {
  try {
    const d1 = vscode.commands.registerCommand(
      'colmaputil.sendToColmapUtil',
      (folderUri) => runSendToColmap(folderUri, false)
    );
    const d2 = vscode.commands.registerCommand(
      'colmaputil.sendToColmapUtilNoImage',
      (folderUri) => runSendToColmap(folderUri, true)
    );
    context.subscriptions.push(d1, d2);

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const pattern = new vscode.RelativePattern(folder, RELOAD_TRIGGER_FILE);
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      watcher.onDidCreate(() => {
        void vscode.commands.executeCommand('workbench.action.reloadWindow');
      });
      context.subscriptions.push(watcher);
    }
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const uri = vscode.Uri.joinPath(folder.uri, RELOAD_TRIGGER_FILE);
      void vscode.workspace.fs.delete(uri).then(() => {}, () => {});
    }
  } catch (err) {
    void vscode.window.showErrorMessage('ColmapUtil 扩展激活失败: ' + (err && err.message));
    throw err;
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
