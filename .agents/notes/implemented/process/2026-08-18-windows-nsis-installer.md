# Agent Note: Windows NSIS installer

Status: implemented

English | [中文](2026-08-18-windows-nsis-installer.zh.md)

## Problem

The published CLI needs Node and its package tree. Windows users need one installer that supplies both without depending on a global Node installation or a source checkout.

## Decision

`pnpm run package:windows` builds the application, packs the dsh and vendored release families, installs those tarballs into a staging directory, copies the selected Node executable, and invokes `makensis.exe` with `scripts/windows/deepseek-harness.nsi`. The resulting installer lives at `dist/windows/deepseek-harness-<version>-setup.exe`.

The installer is per-user. It uses NSIS Modern UI 2 with Simplified Chinese strings and Metro artwork, installs below `%LOCALAPPDATA%`, creates Start Menu shortcuts for `dsh web`, a command prompt, and the uninstaller, and stores its installation path under `HKCU\\Software\\DeepSeek Harness`. The runtime wrapper invokes the bundled `node.exe` with the published `@deepseek-ai/dsh` entry. DSH home data stays outside the installation directory, so uninstall removes program files and shortcuts without removing profiles, sessions, or credentials.

## Alternatives considered

**A source-tree installer.** Copying the workspace requires pnpm metadata and development dependencies at runtime. Release tarballs exercise the same payload that npm consumers receive.

**Requiring global Node.** A system Node version can be absent or incompatible. The bundled executable makes the installed command self-contained.

**A machine-wide installer.** Per-user installation avoids administrator elevation and does not change the system PATH.

## Consequences

Building an installer requires Node, pnpm, NSIS, and registry access for the staging `npm install`. The installer is Windows x64 when its selected Node executable is Windows x64. A Windows ARM64 release must supply an ARM64 Node executable through `-NodeExecutable`.
