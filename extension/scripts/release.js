#!/usr/bin/env node
/**
 * 发布到 VSCode Marketplace。
 * PAT 来源优先级：环境变量 VSCE_PAT > secrets/vsce-pat（gitignored）。
 * 由 npm run release 调用。
 *
 * 优先使用 extension/node_modules/.bin/vsce；没装则用 `npx --yes @vscode/vsce`，
 * 与父目录 buildext 的取用方式一致，避免强制 `yarn install`。
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const patFile = path.join(root, 'secrets', 'vsce-pat');

let pat = process.env.VSCE_PAT;
let source;

if (pat && pat.trim()) {
  pat = pat.trim();
  source = 'env VSCE_PAT';
} else if (fs.existsSync(patFile)) {
  pat = fs.readFileSync(patFile, 'utf8').trim();
  source = patFile;
  if (!pat) {
    console.error(`PAT 文件存在但为空：${patFile}`);
    process.exit(1);
  }
} else {
  console.error('未找到 PAT。请二选一：');
  console.error('  1) export VSCE_PAT=<token>');
  console.error(`  2) 把 token 写入 ${path.relative(root, patFile)}（已被 .gitignore）`);
  process.exit(1);
}

console.log(`[release] 使用 PAT 来源：${source}`);

const localVsce = path.join(root, 'node_modules', '.bin', 'vsce');
const useLocal = fs.existsSync(localVsce);

const cmd = useLocal ? localVsce : (process.platform === 'win32' ? 'npx.cmd' : 'npx');
const args = useLocal
  ? ['publish', ...process.argv.slice(2)]
  : ['--yes', '@vscode/vsce', 'publish', ...process.argv.slice(2)];

console.log(`[release] 调用：${useLocal ? 'node_modules/.bin/vsce' : 'npx'} ${args.join(' ')}`);

const child = spawn(cmd, args, {
  stdio: 'inherit',
  env: { ...process.env, VSCE_PAT: pat },
  cwd: root,
  shell: !useLocal && process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
