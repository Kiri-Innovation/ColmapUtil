# Changelog

## 0.0.5

- **One-click install / release scripts**: added `yarn install-local` (package + install-to-cursor) and `yarn release` (vsce publish via env-var or `secrets/vsce-pat`), matching the layout used by the sibling `git-util` extension.
- **Local install covers both Cursor and VSCode**: `install-to-cursor` now scans `~/.cursor-server` and `~/.vscode-server` under Remote SSH (both get installed) and falls back to local `cursor` + `code` CLIs (both get installed), so the freshly built `.vsix` lands wherever the user actually reopens.

## 0.0.4

- Fix raster-image transfer regression: non-NoImage mode now correctly streams the `images/` JPEG/PNG content alongside the `sparse/` metadata.

## 0.0.3

- Multiple datasets in one panel: re-running "Send to ColmapUtil" on a different folder reuses the already-handshaked webview instead of opening a new window.

## 0.0.2

- Remote SSH support: read folder contents via `vscode.workspace.fs` so the command works against COLMAP outputs on the SSH host.
- Web app gained an extension download entry (`/colmaputil-send.vsix`).

## 0.0.1

- Initial release: Explorer right-click on a folder → "Send to ColmapUtil"; the extension zips the folder (with `archiver`), base64-chunks it, and posts it into the iframe at colmap.utils.kiriengine.com.
