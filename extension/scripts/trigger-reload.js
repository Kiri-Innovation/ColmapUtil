/**
 * buildext:cursor 安装扩展后调用，在 ColmapUtil 与上级仓库根目录写入 .reload-extension，
 * 扩展内监听到该文件创建后会执行 workbench.action.reloadWindow，实现自动重载。
 */
const fs = require('fs');
const path = require('path');

const trigger = '.reload-extension';
const cwd = process.cwd(); // ColmapUtil 根目录（yarn 在此执行）
fs.writeFileSync(path.join(cwd, trigger), '', 'utf8');
try {
  fs.writeFileSync(path.join(cwd, '..', '..', trigger), '', 'utf8');
} catch (_) {}

console.log('Extension installed; window will reload automatically if this workspace is open.');
