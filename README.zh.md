# DeepSeek Harness Desktop（DSH Desktop）

在桌面上一键运行 DeepSeek Harness —— 无需 Node.js、无需 pnpm、无需 Docker，下载即用。

[![Downloads](https://img.shields.io/github/downloads/LoongSerpent9Realms/deepseek-harness-installer/total.svg)](https://github.com/LoongSerpent9Realms/deepseek-harness-installer/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform: Windows | Linux](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-blue.svg)](https://github.com/LoongSerpent9Realms/deepseek-harness-installer/releases/latest)

[English](README.md) · 中文

## 功能

- ⚡️ **零环境** — 安装包内置 Node.js 与 Electron 运行时，无需在系统中安装 Node.js、pnpm 或 Docker，也不会修改已有的系统环境。
- 🔄 **内核自愈** — 内置更新器自动检查 GitHub Release 并在应用内更新，上游修复无需重新安装即可同步。
- 🔒 **纯本地 · 隐私默认** — 运行在 `127.0.0.1:3080`，profile / 会话 / 设置全部留在本机，默认关闭遥测。
- 🪟 **桌面原生窗口** — Electron 封装（非浏览器标签页）：双击启动；回环 web 服务只在应用程序内部使用。Windows / Linux，中英双语界面。
- 📦 **多平台** — Windows（NSIS 安装包）与 Linux（AppImage，便携免安装）。
- 🧩 **完整 Harness 能力** — 一切皆插件架构，内置全套 dsh 能力（工具、技能、子代理、工作流等）。

## 快速开始

从 [Releases](https://github.com/LoongSerpent9Realms/deepseek-harness-installer/releases/latest) 下载对应平台安装包，安装后启动即可。

### Windows

下载 `deepseek-harness-<version>-setup.exe`，运行 NSIS 安装程序。安装程序包含 DeepSeek Harness、Node.js 和 Electron，因此无需在系统中另行安装 Node.js。

安装完成后，从开始菜单选择 DeepSeek Harness。它会打开独立的桌面窗口；回环 web 服务只在应用程序内部使用，不会打开浏览器。详见 [Web UI 指南](docs/user/guide/index.md)。

### Linux (AppImage)

从[最新发布](../../releases/latest)下载 `deepseek-harness-<version>-x86_64.AppImage`。

```bash
# Make it executable
chmod +x deepseek-harness-*-x86_64.AppImage

# Run it
./deepseek-harness-*-x86_64.AppImage
```

AppImage 是便携式格式，无需安装即可在大多数 Linux 发行版上运行。

### 系统要求

- Windows 10+（64 位）
- Linux（AppImage）

## 开发

构建桌面应用参见 [apps/desktop/BUILD.md](apps/desktop/BUILD.md)；Harness 本身的开发参见[开发指南](docs/development.md)。

## 工作原理

```
┌────────────────────────────────────────────────────────┐
│ Electron main process (apps/desktop/src/main.ts)       │
│   window management → loads the dsh web UI             │
│   updater (updater.ts) → GitHub release check          │
└──────────────┬─────────────────────────────┬───────────┘
               │ loadFile / localhost:3080   │ releases
               ▼                             ▼
┌────────────────────────────────────┐  ┌──────────────────────────────┐
│ dsh web UI (packages/bundle/       │  │ GitHub Releases              │
│ web-app)                           │  │ deepseek-harness-*-setup.exe │
│   local loopback web service       │  │ deepseek-harness-*.AppImage  │
│   http://127.0.0.1:3080/           │  └──────────────────────────────┘
└──────────────┬─────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│ dsh Harness core (packages/*)      │
│   profile / sessions / settings    │
│   → local storage on this machine  │
└────────────────────────────────────┘
```

## 说明

> ⚠️ **开发预览** — 上游 dsh 仍在快速迭代，存在破坏性变更；本项目同步跟随。

> ⚠️ **非官方构建** — 本桌面版派生自 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)，并非由 DeepSeek 官方团队维护。

> ⚠️ **安全声明** — dsh 具备本地代码执行能力。仅供学习 / 研究 / 测试，请在可信、隔离的环境中使用。

## 相关项目

- [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) — 上游 dsh agent 平台

## 许可证

[MIT](LICENSE) — 第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
