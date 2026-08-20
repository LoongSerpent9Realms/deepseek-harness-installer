# @loongserpent/dsh-client-ui-workspace-drag-drop

[![npm version](https://img.shields.io/npm/v/@loongserpent/dsh-client-ui-workspace-drag-drop.svg)](https://www.npmjs.com/package/@loongserpent/dsh-client-ui-workspace-drag-drop)
[![License](https://img.shields.io/npm/l/@loongserpent/dsh-client-ui-workspace-drag-drop.svg)](https://github.com/loongserpent/deepseek-harness/blob/main/LICENSE)

English | [中文](README.zh.md)

Drag-and-drop plugin for [DeepSeek Harness](https://github.com/loongserpent/deepseek-harness) that allows users to add workspaces by dropping folders onto the sidebar.

## Features

- 🖱️ **Drag & Drop** - Drag folders from your file explorer directly onto the sidebar
- ✨ **Visual Feedback** - Clear overlay with dashed border and icons during drag operations
- 🌍 **Multi-language** - Supports both Chinese (简体中文) and English
- ⚡ **Auto-create** - Automatically creates a workspace from the dropped folder
- 🔒 **Error Handling** - Graceful error messages if workspace creation fails

## Installation

```bash
npm install @loongserpent/dsh-client-ui-workspace-drag-drop
```

Or with pnpm:

```bash
pnpm add @loongserpent/dsh-client-ui-workspace-drag-drop
```

## Usage

This plugin is designed to work within the DeepSeek Harness ecosystem. It integrates automatically when added to your bundle configuration.

### Adding to Your Bundle

Add the plugin to your `cordis.yml` or bundle patch file:

```yaml
- id: ui-workspace-drag-drop
  name: '@loongserpent/dsh-client-ui-workspace-drag-drop'
```

### How It Works

1. **Drag a folder** from your file explorer
2. **Hover over the sidebar** - you'll see a visual overlay
3. **Drop the folder** - a new workspace is created automatically

## Requirements

- **DeepSeek Harness** >= 0.1.0
- **Node.js** >= 18.0.0
- **React** >= 18.2.0
- **Electron environment** (for full path access)

### Peer Dependencies

This package requires the following DeepSeek Harness packages:

- `@deepseek-ai/cordis`
- `@deepseek-ai/dsh-client-locale`
- `@deepseek-ai/dsh-client-runtime`
- `@deepseek-ai/dsh-client-ui-primitives`
- `@deepseek-ai/dsh-client-ui-slots`
- `@deepseek-ai/dsh-client-ui-workspace`
- `@deepseek-ai/dsh-invariants`

## Development

### Building

```bash
npm run bundle
```

### Watch Mode

```bash
npm run watch
```

### Type Checking

```bash
npx tsc --noEmit
```

## Architecture

This plugin follows the DeepSeek Harness client plugin architecture:

- **Host half** (`src/index.ts`) - Empty, no host-side behavior
- **Browser half** (`src/client/index.tsx`) - Registers the drag-drop overlay
- **Slot system** - Integrates into `sidebar.workspaces` slot
- **Locale support** - Provides translations via the locale system

### Key Components

- `DragDropOverlay` - Main component handling drag events and visual feedback
- `locales.ts` - Multi-language strings (zh/en)
- CSS Modules - Scoped styling for the overlay

## Model Experience

This plugin has **no model-visible effects**. It is a pure UI interaction that:
- Listens to native browser drag events at the document level
- Renders an overlay component when compatible file/folder drags are detected
- Invokes the existing `ctx.workspaces.create()` service method

No prompts, tool schemas, or session log entries are affected.

## Known Limitations

- **Electron dependency**: The plugin relies on Electron's exposure of full file paths via `File.path`. In a pure browser context, this will not work (the path extraction will return `null`).
- **No multi-folder support**: Currently only processes the first dropped item. Dropping multiple folders will only create a workspace from the first one.
- **No validation**: The plugin does not validate whether the dropped path is actually a directory vs. a file. The `createWorkspace` service handles this validation.
- **Global listeners**: The drag listeners are attached to `document`, which means they are active even when the sidebar is collapsed. The overlay only renders when the parent slot is visible, but the event listeners remain.

## Contributing

Contributions are welcome! Please read the [contributing guidelines](https://github.com/loongserpent/deepseek-harness/blob/main/CONTRIBUTING.md) first.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Related

- [DeepSeek Harness](https://github.com/loongserpent/deepseek-harness) - The main repository
- [Documentation](https://github.com/loongserpent/deepseek-harness/tree/main/docs) - Project documentation
- [Plugin Development Guide](https://github.com/loongserpent/deepseek-harness/blob/main/docs/cookbook/adding-a-package.md) - How to create DSH plugins
