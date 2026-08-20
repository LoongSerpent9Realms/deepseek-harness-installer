# Agent Note: Web profile 插件管理

Status: implemented
Archived: 2026-08-18

[English](2026-08-18-web-profile-plugin-management.md) | 中文

## Problem

Web 设置可以列出 Loader 条目，却不能让桌面用户从当前 web profile 安装或移除树外插件。

## Decision

`pluginInventory` 为 web profile 拥有固定且串行的 `pnpm add` 和 `pnpm remove` 操作。浏览器只接受 npm registry 包名，可带可选版本或 dist-tag。它会列出由 profile 管理的包，提供两步移除操作，并在修改成功后提示用户重启。

## Alternatives considered

转发任意 pnpm 参数会通过浏览器暴露命令和文件系统 specifier。立即加载新 bundle 会在活跃应用会话中改变正在运行的 Loader 树。

## Consequences

Settings 中可以安装和移除 registry 包，插件配置和 Loader 行启停仍是独立控件。重启会激活已修改的 bundle。

## Verification

Host Remote 测试覆盖导出的管理方法。浏览器组件测试覆盖安装、由管理包的移除确认、状态反馈和既有清单行为。
