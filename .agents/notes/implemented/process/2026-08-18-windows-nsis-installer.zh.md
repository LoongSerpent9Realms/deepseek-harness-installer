# Agent Note: Windows NSIS 安装程序

Status: implemented

[English](2026-08-18-windows-nsis-installer.md) | 中文

## Problem

已发布的 CLI 需要 Node 和包树。Windows 用户需要一个同时提供两者的安装程序，而不依赖全局 Node 安装或源码检出。

## Decision

`pnpm run package:windows` 会构建应用、打包 dsh 与 vendored 发布族、将这些 tarball 安装到暂存目录、复制选定的 Node 可执行文件，并以 `scripts/windows/deepseek-harness.nsi` 调用 `makensis.exe`。最终安装程序位于 `dist/windows/deepseek-harness-<version>-setup.exe`。

安装程序为每位用户安装。它使用带简体中文字符串和 Metro 图形的 NSIS Modern UI 2，安装在 `%LOCALAPPDATA%` 下，创建用于 `dsh web`、命令提示符和卸载程序的开始菜单快捷方式，并将安装路径写入 `HKCU\\Software\\DeepSeek Harness`。运行时包装脚本使用随附的 `node.exe` 调用已发布的 `@deepseek-ai/dsh` 入口。DSH 主目录数据留在安装目录之外，因此卸载会移除程序文件和快捷方式，但不会移除 profile、会话或凭据。

## Alternatives considered

**基于源码树的安装程序。** 复制 workspace 需要在运行时提供 pnpm 元数据和开发依赖。发布 tarball 会覆盖 npm 使用方获得的相同载荷。

**要求全局 Node。** 系统 Node 版本可能缺失或不兼容。随附的可执行文件使安装后的命令自包含。

**全系统安装程序。** 每用户安装不需要管理员提升权限，也不会修改系统 PATH。

## Consequences

构建安装程序需要 Node、pnpm、NSIS，以及暂存 `npm install` 所需的注册表访问权限。当选定的 Node 可执行文件为 Windows x64 时，安装程序即为 Windows x64。Windows ARM64 发布必须通过 `-NodeExecutable` 提供 ARM64 Node 可执行文件。
