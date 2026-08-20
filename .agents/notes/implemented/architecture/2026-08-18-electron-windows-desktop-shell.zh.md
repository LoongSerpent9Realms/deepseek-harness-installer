# Agent Note: Electron Windows 桌面外壳

Status: implemented

[English](2026-08-18-electron-windows-desktop-shell.md) | 中文

## Problem

Windows 安装程序可以安装并启动 `dsh web` 命令，但该命令会将本地 URL 交给浏览器。Windows 用户需要拥有自身窗口和启动生命周期的开始菜单应用程序。

## Decision

Windows 打包在发布的 dsh 运行时旁嵌入 Electron。Electron 会启动隐藏的 `dsh web --port 0` 子进程，读取其回环 URL，并在隔离的渲染器中加载它。窗口使用紧凑的原生控制覆盖层，不显示应用程序菜单。关闭桌面应用程序会停止该子进程树（包括包管理器派生的子进程）。打包运行时会将 pnpm 放入 PATH，供 profile 插件操作使用。在 Windows 无法创建目录联接的安装环境中，profile 模块回退会将运行时包复制到每用户数据目录。profile overlay 解析还会在解析旧版主题管理器生成的空数组前缀和追加条目之前进行规范化。应用数据使用 Electron 的每用户数据目录，现有 web UI 和 dsh 插件保持不变。

NSIS 安装程序会启动 `DeepSeek Harness.exe`，并为该可执行文件和可选的 dsh 命令提示符创建开始菜单快捷方式。

## Alternatives considered

保留浏览器启动器可维持最小安装程序，但不能提供应用程序窗口。将现有 UI 重写为原生控件会替换已可用的 React UI 及其 web 传输，却不会改善产品行为。

## Consequences

安装程序会包含 Electron，体积更大。web 服务仍是仅限回环的内部组件；用户通过 Electron 窗口而不是浏览器标签页交互。

## Verification

`pnpm run package:windows` 构建 Electron 运行时、dsh 运行时、NSIS 安装程序和桌面可执行文件。打包后的桌面进程必须加载生成的回环 URL，并在退出时终止其 dsh 子进程。
