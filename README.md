# DeepSeek Harness Desktop (DSH Desktop)

Run DeepSeek Harness on your desktop with one click — no Node.js, no pnpm, no Docker. Download and run.

[![Downloads](https://img.shields.io/github/downloads/LoongSerpent9Realms/deepseek-harness-installer/total.svg)](https://github.com/LoongSerpent9Realms/deepseek-harness-installer/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform: Windows | Linux](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-blue.svg)](https://github.com/LoongSerpent9Realms/deepseek-harness-installer/releases/latest)

English · [中文](README.zh.md)

## Features

- ⚡️ **Zero environment** — The installer bundles the Node.js and Electron runtimes, so no system Node.js, pnpm, or Docker is required. It does not modify your existing system environment.
- 🔄 **Kernel self-healing** — A built-in updater checks the latest GitHub release and updates in-app, so fixes from upstream reach you without reinstalling.
- 🔒 **Local-first · privacy by default** — Runs on `127.0.0.1:3080`; profile / sessions / settings all stay on your machine, with telemetry disabled by default.
- 🪟 **Native desktop window** — Electron wrapper (not a browser tab): double-click to launch; the loopback web service stays inside the application. Windows / Linux, with a bilingual English · 中文 interface.
- 📦 **Multi-platform** — Windows (NSIS installer) and Linux (AppImage, portable, no installation required).
- 🧩 **Full Harness inside** — Everything-is-a-plugin architecture with the complete dsh capability set (tools, skills, subagents, workflows, …).

## Quick start

Download the package for your platform from [Releases](https://github.com/LoongSerpent9Realms/deepseek-harness-installer/releases/latest), install, and launch.

### Windows

Download `deepseek-harness-<version>-setup.exe` and run the NSIS installer. It includes DeepSeek Harness, Node.js, and Electron, so no system Node.js installation is required.

After installation, select DeepSeek Harness from the Start Menu. It opens a desktop window; its loopback web service remains inside the application rather than opening a browser. See the [Web UI guide](docs/user/guide/index.md).

### Linux (AppImage)

Download `deepseek-harness-<version>-x86_64.AppImage` from the [latest release](../../releases/latest).

```bash
# Make it executable
chmod +x deepseek-harness-*-x86_64.AppImage

# Run it
./deepseek-harness-*-x86_64.AppImage
```

The AppImage is portable and works across most Linux distributions without installation.

### System requirements

- Windows 10+ (64-bit)
- Linux (AppImage)

## Development

See [apps/desktop/BUILD.md](apps/desktop/BUILD.md) for building the desktop application, and the [development guide](docs/development.md) for the harness itself.

## How it works

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

## Notes

> ⚠️ **Developer preview** — upstream dsh is still iterating rapidly and ships breaking changes; this project follows along.

> ⚠️ **Unofficial build** — this is a desktop build derived from [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness), not maintained by the DeepSeek team.

> ⚠️ **Security** — dsh can execute code locally. For learning / research / testing only; run it in a trusted, isolated environment.

## Related projects

- [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) — the upstream dsh agent platform

## License

[MIT](LICENSE) — third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
