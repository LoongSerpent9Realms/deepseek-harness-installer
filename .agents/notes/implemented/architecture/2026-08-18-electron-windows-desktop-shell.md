# Agent Note: Electron Windows desktop shell

Status: implemented

English | [中文](2026-08-18-electron-windows-desktop-shell.zh.md)

## Problem

The Windows installer could install and launch the `dsh web` command, but the command handed the local URL to a browser. Windows users need a Start Menu application that owns its own window and startup lifecycle.

## Decision

The Windows package embeds Electron beside the published dsh runtime. Electron starts `dsh web --port 0` as a hidden child process, reads its loopback URL, and loads it into an isolated renderer. The window uses a compact native control overlay without an application menu. Closing the desktop application stops the child process tree, including package-manager descendants. The packaged runtime carries pnpm on PATH for profile plugin operations. On Windows installations where directory junction creation is unavailable, the profile module fallback copies runtime packages into the per-user data directory. Profile overlays also normalize the legacy empty-array prefix emitted by older skin managers before parsing appended entries. Application data uses Electron's per-user data directory, while the existing web UI and its dsh plugins remain unchanged.

The NSIS installer launches `DeepSeek Harness.exe` and creates Start Menu shortcuts for that executable and the optional dsh command prompt.

## Alternatives considered

Keeping the browser launcher preserves the smallest installer, but does not deliver an application window. Rewriting the existing UI as native controls would replace the working React UI and its web transport without improving the product behavior.

## Consequences

The installer includes Electron and is larger. The web server remains a loopback-only internal component; users interact with the Electron window instead of a browser tab.

## Verification

`pnpm run package:windows` builds the Electron runtime, dsh runtime, NSIS installer, and desktop executable. The packaged desktop process must load the emitted loopback URL and terminate its dsh child process on exit.
