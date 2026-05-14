#!/usr/bin/env node
/**
 * 将 extension/ 下打好的 .vsix 安装到 Cursor 或 VSCode（本地或 Remote SSH）。
 * 由 npm run install-local 调用（先 package，再执行本脚本）。
 *
 * 安装策略（按顺序尝试）：
 *   1. Remote SSH：扫描 ~/.cursor-server 和 ~/.vscode-server，用 server CLI 直接安装到远端。
 *   2. 本地 cursor / code 命令可用：同时给两者安装一次，确保命中。
 *   3. 以上均不可用：打印提示，让用户手动安装。
 *
 * 安装成功后写入 .reload-extension 到几个候选 workspace 根目录，
 * 由扩展 activate 时注册的 watcher 触发 reloadWindow。
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = require(pkgPath);
const vsixName = `${pkg.name}-${pkg.version}.vsix`;
const vsixPath = path.join(__dirname, '..', vsixName);

if (!fs.existsSync(vsixPath)) {
  console.error('未找到 .vsix 文件，请先执行: npm run package');
  process.exit(1);
}

const absVsix = path.resolve(vsixPath);

// ── 工具函数 ──────────────────────────────────────────────

function tryExec(cmd) {
  try {
    execSync(cmd, { stdio: 'inherit' });
    return true;
  } catch (_) {
    return false;
  }
}

function hasCmd(name) {
  const r = spawnSync(name, ['--version'], { encoding: 'utf8', timeout: 3000, shell: true });
  return r.status === 0;
}

/**
 * 在 baseDir 下找最新的 server CLI（cursor-server 或 code-server）。
 * 目录结构示例：
 *   ~/.cursor-server/bin/linux-x64/<commit>/bin/cursor-server
 *   ~/.vscode-server/cli/servers/Stable-<commit>/server/bin/code-server
 */
function findLatestServerCli(baseDir, pattern) {
  if (!fs.existsSync(baseDir)) return null;
  try {
    const results = [];
    const walk = (dir, depth) => {
      if (depth > 6) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isFile() && e.name === pattern) {
          results.push({ path: full, mtime: fs.statSync(full).mtimeMs });
        } else if (e.isDirectory()) {
          walk(full, depth + 1);
        }
      }
    };
    walk(baseDir, 0);
    if (results.length === 0) return null;
    results.sort((a, b) => b.mtime - a.mtime);
    return results[0].path;
  } catch (_) {
    return null;
  }
}

// ── 安装逻辑 ──────────────────────────────────────────────

const RELOAD_TRIGGER_FILE = '.reload-extension';
const extRoot = path.join(__dirname, '..');                 // .../extension
const colmapRoot = path.join(extRoot, '..');                // .../ColmapUtil
const utilsRoot = path.join(colmapRoot, '..');              // .../Utils
const repoRoot = path.join(utilsRoot, '..');                // .../Kiri4DGS

// 用户可能把 extension/ / ColmapUtil/ / Kiri4DGS/ 任一目录作为 workspace 打开，
// 扩展只对当前 workspaceFolders 监听 .reload-extension，所以写到几个候选点。
const RELOAD_TARGETS = [extRoot, colmapRoot, utilsRoot, repoRoot];

function writeReloadTrigger() {
  let ok = false;
  for (const dir of RELOAD_TARGETS) {
    try {
      fs.writeFileSync(path.join(dir, RELOAD_TRIGGER_FILE), '', 'utf8');
      ok = true;
    } catch (_) { /* ignore */ }
  }
  if (ok) {
    console.log('Done. Extension installed; window will reload automatically if this workspace is open.');
  } else {
    console.log('Done. Reload the window manually (Ctrl+Shift+P → "Developer: Reload Window").');
  }
}

// 1. Remote SSH：用 server CLI 安装
// 同一台远端可能同时装了 Cursor 和 VSCode，我们无法可靠判断当前窗口属于哪个，
// 因此给所有存在的 server 都装一次，确保打开扩展的那个 IDE 能拿到最新代码。
const isLikelyRemote = process.env.SSH_CONNECTION != null || process.env.VSCODE_SSH_TARGET != null;
if (isLikelyRemote) {
  const home = os.homedir();
  const candidates = [
    { base: path.join(home, '.cursor-server'), bin: 'cursor-server', label: 'Cursor' },
    { base: path.join(home, '.vscode-server'), bin: 'code-server', label: 'VSCode' },
  ];

  const results = [];
  for (const { base, bin, label } of candidates) {
    const cli = findLatestServerCli(base, bin);
    if (!cli) {
      results.push({ label, found: false });
      continue;
    }
    console.log(`[Remote SSH] 找到 ${label} (${bin}): ${cli}`);
    console.log(`执行: ${cli} --install-extension "${absVsix}"`);
    const ok = tryExec(`"${cli}" --install-extension "${absVsix}"`);
    results.push({ label, found: true, ok });
    console.log(ok ? `  ✓ 已安装到 ${label}` : `  ✗ ${label} 安装失败`);
  }

  const anyFound = results.some((r) => r.found);
  const anySuccess = results.some((r) => r.found && r.ok);

  if (anySuccess) {
    writeReloadTrigger();
  }

  if (!anyFound) {
    console.log('');
    console.log('  [提示] 未找到 cursor-server 或 vscode-server。请把 .vsix 复制到本机后手动安装：');
    console.log('    cursor --install-extension <本机路径>');
    console.log('    code   --install-extension <本机路径>');
    console.log('  .vsix 路径（远端）: ' + absVsix);
    console.log('');
  }
  process.exit(anySuccess ? 0 : 1);
}

// 2. 本地：同一台机器可能同时装了 Cursor 和 VSCode，无法可靠判断当前窗口属于哪个，
//    给所有存在的 CLI 都装一次，与 Remote SSH 一致。
const localCandidates = [
  { cmd: 'cursor', label: 'Cursor' },
  { cmd: 'code', label: 'VSCode' },
];

const localResults = [];
for (const { cmd, label } of localCandidates) {
  if (!hasCmd(cmd)) {
    localResults.push({ label, found: false });
    continue;
  }
  console.log(`执行: ${cmd} --install-extension "${absVsix}"`);
  const ok = tryExec(`${cmd} --install-extension "${absVsix}"`);
  localResults.push({ label, found: true, ok });
  console.log(ok ? `  ✓ 已安装到 ${label}` : `  ✗ ${label} 安装失败`);
}

const anyFound = localResults.some((r) => r.found);
const anySuccess = localResults.some((r) => r.found && r.ok);

if (anySuccess) {
  writeReloadTrigger();
  process.exit(0);
}

// 3. 均不可用
if (!anyFound) {
  console.log('');
  console.log('  [跳过安装] 未找到可用的 cursor / code 命令。');
  console.log('  .vsix 已生成: ' + absVsix);
  console.log('  请在本机终端执行:');
  console.log('    cursor --install-extension <路径>  或  code --install-extension <路径>');
  console.log('');
}
process.exit(1);
