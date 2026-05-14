# Send to ColmapUtil

VSCode / Cursor 扩展：右键 Explorer 里的文件夹，把 COLMAP 重建数据一键发送到 [ColmapUtil](https://colmap.utils.kiriengine.com/) 在线可视化页面。

- **市场/仓库**：见 `package.json` 的 `repository`
- **当前版本**：与 `package.json` 的 `version` 字段一致

## 功能

- **Explorer 右键 → "Send to ColmapUtil"**：把整个文件夹（包含 `sparse/0`、`images/` 等）打包并通过 webview 发送给可视化页面。
- **Send to ColmapUtil (NoImage)**：只发 `sparse/0` 等 COLMAP 元数据，跳过 jpg/png 等栅格图，远程 SSH 大数据集传输用。
- **Remote SSH 直传**：在 SSH Remote workspace 里也能用，扩展通过 `workspace.fs` 读远端文件再 postMessage 传给本地 webview。
- **进度条**：扫描 → 压缩 → 握手 → 分块发送，整套过程在 webview 顶部有可视化进度。

## 本地开发与安装到 Cursor / VSCode

```bash
cd Utils/ColmapUtil/extension
yarn package          # 生成 colmaputil-send-<version>.vsix
yarn install-to-cursor # 本机/Remote SSH 自动找 cursor / code 安装并触发重载
```

一键：`yarn install-local`（package + install-to-cursor）。

也可从父目录走：

```bash
cd Utils/ColmapUtil
yarn buildext:cursor  # 等价于 cd extension && yarn install-local
```

Remote SSH 下脚本会自动扫描 `~/.cursor-server` 和 `~/.vscode-server`，**两个 server 都装一次**，避免不知道当前窗口属于哪个 IDE；本地装也是 cursor + code 都装，行为一致。

## 一键发布到 Marketplace

```bash
cd Utils/ColmapUtil/extension
# 二选一提供 PAT：
export VSCE_PAT=<token>
# 或写入：secrets/vsce-pat（已被 gitignore）

yarn release          # 等同于 vsce publish
```

发布前请：
- 在 [extension/package.json](./package.json) 把 `version` 加一档
- 在 [CHANGELOG.md](./CHANGELOG.md) 顶部追加新版条目
- 同步把变更摘要写到本 README 的「更新日志」段（Marketplace 商店页渲染的是 README，不是 CHANGELOG）

## 更新日志

面向市场的英文摘要：[CHANGELOG.md](./CHANGELOG.md)。

### 0.0.5

- 加 `yarn install-local` / `yarn release` 一键流程，对齐 VSCodeGitUtil 的扩展开发约定。
- Remote SSH 一键安装：扫描 `~/.cursor-server` 和 `~/.vscode-server` 双 server，避免漏装；本地也同时装 `cursor` 和 `code` 两边。

### 0.0.4

- 修复打开页面后栅格图不显示的 bug（NoImage 模式之外仍正确传输 `images/` 下的 jpg/png）。

### 0.0.3

- 支持把多个 COLMAP dataset 文件夹依次送进同一个 webview；重新选择文件夹会复用已经握手好的页面，不再重开新窗口。

### 0.0.2

- 支持 Remote SSH workspace：通过 `vscode.workspace.fs` 读远端文件而非 `fs.readFile`，可在 SSH 主机上的 colmap 输出目录直接右键发送。
- ColmapUtil 网页加上扩展下载入口（`/colmaputil-send.vsix`）。

### 0.0.1

- 初版：Explorer 右键文件夹 → "Send to ColmapUtil"，通过 webview iframe 把数据 zip + base64 分块发送到 colmap.utils.kiriengine.com。
