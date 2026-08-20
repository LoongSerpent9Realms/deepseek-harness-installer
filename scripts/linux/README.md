# Linux Packaging Scripts

English | [中文](README.zh.md)

This directory contains scripts for building Linux packages of DeepSeek Harness.

## AppImage Package

The `package-appimage.sh` script builds a portable AppImage that works across most Linux distributions without installation.

### Prerequisites

- Node.js (v22.19+ or v24+)
- pnpm
- ImageMagick (optional, for icon generation)
- curl (for downloading linuxdeploy)

### Usage

```bash
# Build with default output directory (dist/linux)
pnpm run package:linux

# Or run the script directly
bash scripts/linux/package-appimage.sh

# Specify custom output directory and node path
bash scripts/linux/package-appimage.sh dist/custom /usr/bin/node
```

### Output

The script produces:
- `dist/linux/deepseek-harness-<version>-x86_64.AppImage` - The portable AppImage file

### How It Works

1. Builds the project using `pnpm run build`
2. Packs all npm packages into tarballs
3. Creates a runtime environment with Node.js and dependencies
4. Sets up an Electron-based desktop application
5. Uses linuxdeploy to create a self-contained AppImage

### Manual Installation

To use the AppImage:

```bash
# Make it executable
chmod +x deepseek-harness-*-x86_64.AppImage

# Run it
./deepseek-harness-*-x86_64.AppImage
```

No installation required - the AppImage contains everything needed to run DeepSeek Harness.
