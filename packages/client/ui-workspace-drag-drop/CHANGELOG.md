# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-XX

### Added
- Initial release of workspace drag-drop plugin
- Drag-and-drop support for adding workspaces from folder drops
- Visual feedback overlay with dashed border and folder icon
- Multi-language support (Chinese and English)
- Integration with DeepSeek Harness sidebar slot system
- Error handling for invalid paths and failed workspace creation
- TypeScript type definitions exported
- CSS Modules for scoped styling
- Hot reload support for development

### Technical Details
- Built with TypeScript and React
- Uses HTML5 Drag and Drop API
- Integrates with `ctx.workspaces.create()` service
- Follows DeepSeek Harness plugin architecture
- Zero runtime dependencies (peer dependencies only)
