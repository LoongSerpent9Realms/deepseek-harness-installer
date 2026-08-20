# DeepSeek Harness Desktop 构建指南

## 前提条件

由于 DSH 进程正在运行并锁定了 `node_modules`，你需要**先完全退出 DSH 应用**，然后再执行以下步骤。

## 步骤 1: 安装依赖

```powershell
# 完全退出 DSH 后，在项目根目录执行
cd H:\deepseek-harness
pnpm install
```

如果 pnpm store 仍然被锁定，尝试：
```powershell
# 删除整个 pnpm store 后重装
rmdir /s /q .pnpm-store
pnpm install
```

## 步骤 2: 构建 TypeScript

```powershell
# 构建 desktop 应用的 TypeScript 代码
cd apps/desktop
npx tsc
```

这会在 `apps/desktop/dist/` 目录下生成编译后的 JS 文件。

## 步骤 3: 开发模式测试

```powershell
# 启动 Electron 开发模式（需要 web app 也在运行）
cd apps/desktop
pnpm run dev
```

注意：开发模式下需要确保 web app 的 dev server 在 `http://localhost:3080` 运行。

## 步骤 4: 构建安装包

### Windows NSIS 安装包（推荐）
```powershell
cd apps/desktop
pnpm run build:win
```

生成的安装包位于 `apps/desktop/release/` 目录下：
- `DeepSeek Harness Setup x.x.x.exe` — NSIS 安装程序
- `DeepSeek Harness x.x.x.exe` — 便携版

### macOS DMG
```powershell
cd apps/desktop
pnpm run build:mac
```

### Linux AppImage
```powershell
cd apps/desktop
pnpm run build:linux
```

## 步骤 5: 配置 GitHub Releases 自动更新

在 `apps/desktop/package.json` 的 `build.publish` 中已配置：

```json
"publish": {
  "provider": "github",
  "owner": "LoongSerpent9Realms",
  "repo": "deepseek-harness-installer",
  "private": false
}
```

构建完成后，将生成的安装包上传到对应的 GitHub Release：

```powershell
# 使用 gh CLI 创建 release 并上传
cd apps/desktop/release
gh release create v0.1.0-rc.8 --title "v0.1.0-rc.8" --generate-notes *.exe
```

electron-updater 会自动从 GitHub Releases 检测更新。

## 架构说明

### 更新检测流程

```
─────────────────────┐     IPC      ┌──────────────────────┐
│   Web GUI (Renderer) │ ◄──────────► │  Electron Main Process│
│                     │              │                      │
│  Settings Page      │  invoke()    │  updater.ts          │
│  - 配置仓库/镜像站   │ ──────────►  │  - httpGet()         │
│  - 检查更新按钮      │              │  - checkForUpdates() │
│  - 下载进度显示      │ ◄──────────  │  - downloadUpdate()  │
│                     │  send()      │  - 平台资产匹配       │
─────────────────────┘              └──────────────────────┘
                                              │
                                              ▼
                                     ┌──────────────────────┐
                                     │  GitHub Releases API │
                                     │  (可选镜像站加速)     │
                                     ──────────────────────┘
```

### 双环境适配

Client UI 插件 (`packages/client/ui-updater`) 同时支持：
- **Electron 环境**: 通过 `window.dshUpdater` (preload 暴露的 IPC API)
- **Web 环境**: 通过 `host.call()` (Cordis Host RPC)

自动检测运行环境并选择正确的通信方式。

## 故障排除

### pnpm SQLite store 锁定
```powershell
# 方法 1: 重启电脑后重试
# 方法 2: 使用临时 store 目录
pnpm install --store-dir "%TEMP%\dsh-pnpm-store"
```

### node_modules 被锁定
- 确保所有 DSH 进程已完全退出
- 检查任务管理器中是否有残留的 node.exe 进程

### electron-builder 失败
```powershell
# 清除 electron-builder 缓存
rd /s /q "%LOCALAPPDATA%\electron\Cache"
rd /s /q "%LOCALAPPDATA%\electron-builder\Cache"
```

## 版本管理

每次发布新版本时：
1. 更新 `apps/desktop/package.json` 中的 `version`
2. 更新 `package.json` (root) 中的 `version`
3. 构建并发布到 GitHub Releases
4. electron-updater 会自动通知用户有新版本可用
