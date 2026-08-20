# Linux 打包脚本

[English](README.md) · 中文

本目录包含用于构建 DeepSeek Harness Linux 安装包的脚本。

## AppImage 安装包

`package-appimage.sh` 脚本会构建一个便携式 AppImage,可在大多数 Linux 发行版上无需安装即可运行。

### 前提条件

- Node.js（v22.19+ 或 v24+）
- pnpm
- ImageMagick（可选,用于生成图标）
- curl（用于下载 linuxdeploy）

### 用法

```bash
# Build with default output directory (dist/linux)
pnpm run package:linux

# Or run the script directly
bash scripts/linux/package-appimage.sh

# Specify custom output directory and node path
bash scripts/linux/package-appimage.sh dist/custom /usr/bin/node
```

### 输出

脚本会生成:

- `dist/linux/deepseek-harness-<version>-x86_64.AppImage` — 便携式 AppImage 文件

### 工作原理

1. 使用 `pnpm run build` 构建项目
2. 将所有 npm 包打包为 tarball
3. 创建包含 Node.js 和依赖的运行时环境
4. 组装基于 Electron 的桌面应用
5. 使用 linuxdeploy 创建自包含的 AppImage

### 手动安装

使用 AppImage:

```bash
# Make it executable
chmod +x deepseek-harness-*-x86_64.AppImage

# Run it
./deepseek-harness-*-x86_64.AppImage
```

无需安装 — AppImage 已包含运行 DeepSeek Harness 所需的全部内容。
