# @loongserpent/dsh-client-ui-workspace-drag-drop

[![npm version](https://img.shields.io/npm/v/@loongserpent/dsh-client-ui-workspace-drag-drop.svg)](https://www.npmjs.com/package/@loongserpent/dsh-client-ui-workspace-drag-drop)
[![License](https://img.shields.io/npm/l/@loongserpent/dsh-client-ui-workspace-drag-drop.svg)](https://github.com/loongserpent/deepseek-harness/blob/main/LICENSE)

[English](README.md) · 中文

用于 [DeepSeek Harness](https://github.com/loongserpent/deepseek-harness) 的拖放插件,允许用户将文件夹拖到侧边栏上以添加工作区。

## 功能

- 🖱️ **拖放** — 直接从文件管理器把文件夹拖到侧边栏
- ✨ **视觉反馈** — 拖拽过程中显示带虚线边框和图标的清晰浮层
- 🌍 **多语言** — 同时支持中文（简体中文）和英文
- ⚡ **自动创建** — 从拖入的文件夹自动创建工作区
- 🔒 **错误处理** — 工作区创建失败时给出友好的错误提示

## 安装

```bash
npm install @loongserpent/dsh-client-ui-workspace-drag-drop
```

或使用 pnpm:

```bash
pnpm add @loongserpent/dsh-client-ui-workspace-drag-drop
```

## 使用

该插件设计用于 DeepSeek Harness 生态,加入 bundle 配置后自动集成。

### 加入 Bundle

在 `cordis.yml` 或 bundle patch 文件中添加插件:

```yaml
- id: ui-workspace-drag-drop
  name: '@loongserpent/dsh-client-ui-workspace-drag-drop'
```

### 工作原理

1. **从文件管理器拖出一个文件夹**
2. **悬停在侧边栏上** — 会出现视觉浮层
3. **松开文件夹** — 自动创建新的工作区

## 环境要求

- **DeepSeek Harness** >= 0.1.0
- **Node.js** >= 18.0.0
- **React** >= 18.2.0
- **Electron 环境**（需要完整路径访问）

### 同伴依赖

本包依赖以下 DeepSeek Harness 包:

- `@deepseek-ai/cordis`
- `@deepseek-ai/dsh-client-locale`
- `@deepseek-ai/dsh-client-runtime`
- `@deepseek-ai/dsh-client-ui-primitives`
- `@deepseek-ai/dsh-client-ui-slots`
- `@deepseek-ai/dsh-client-ui-workspace`
- `@deepseek-ai/dsh-invariants`

## 开发

### 构建

```bash
npm run bundle
```

### 监听模式

```bash
npm run watch
```

### 类型检查

```bash
npx tsc --noEmit
```

## 架构

本插件遵循 DeepSeek Harness 客户端插件架构:

- **Host 半区**（`src/index.ts`）— 为空,无 host 侧行为
- **Browser 半区**（`src/client/index.tsx`）— 注册拖放浮层
- **插槽系统** — 集成到 `sidebar.workspaces` 插槽
- **多语言支持** — 通过 locale 系统提供翻译

### 关键组件

- `DragDropOverlay` — 处理拖拽事件与视觉反馈的主组件
- `locales.ts` — 多语言字符串（zh/en）
- CSS Modules — 浮层的作用域样式

## 模型体验

本插件**对模型无可见影响**。它是纯粹的 UI 交互:

- 在 document 级别监听原生浏览器拖拽事件
- 检测到兼容的文件/文件夹拖拽时渲染浮层组件
- 调用现有的 `ctx.workspaces.create()` 服务方法

不涉及任何提示词、工具 schema 或会话日志条目。

## 已知限制

- **Electron 依赖**:插件依赖 Electron 通过 `File.path` 暴露完整文件路径。在纯浏览器环境中无法工作（路径提取将返回 `null`）。
- **不支持多文件夹**:目前只处理第一个拖入的项目,同时拖入多个文件夹时只创建第一个工作区。
- **不做校验**:插件不校验拖入路径是目录还是文件,该校验由 `createWorkspace` 服务处理。
- **全局监听器**:拖拽监听器挂在 `document` 上,即使侧边栏折叠时也处于活动状态。浮层只在父插槽可见时渲染,但事件监听器始终存在。

## 参与贡献

欢迎贡献代码!请先阅读[贡献指南](https://github.com/loongserpent/deepseek-harness/blob/main/CONTRIBUTING.md)。

1. Fork 本仓库
2. 创建功能分支（`git checkout -b feature/amazing-feature`）
3. 提交更改（`git commit -m 'Add amazing feature'`）
4. 推送到分支（`git push origin feature/amazing-feature`）
5. 发起 Pull Request

## 许可证

MIT License — 详见 [LICENSE](LICENSE) 文件。

## 相关链接

- [DeepSeek Harness](https://github.com/loongserpent/deepseek-harness) — 主仓库
- [文档](https://github.com/loongserpent/deepseek-harness/tree/main/docs) — 项目文档
- [插件开发指南](https://github.com/loongserpent/deepseek-harness/blob/main/docs/cookbook/adding-a-package.md) — 如何创建 DSH 插件
