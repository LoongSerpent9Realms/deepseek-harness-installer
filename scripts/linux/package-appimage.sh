#!/usr/bin/env bash
# Build an AppImage package for DeepSeek Harness on Linux.
set -euo pipefail

OUTPUT_DIRECTORY="${1:-dist/linux}"
NODE_EXECUTABLE="${2:-$(which node)}"

if [[ ! -x "$NODE_EXECUTABLE" ]]; then
  echo "Error: Node executable not found or not executable: $NODE_EXECUTABLE" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTPUT="$ROOT/$OUTPUT_DIRECTORY"
TARBALLS="$OUTPUT/tarballs"
RUNTIME="$OUTPUT/runtime"
STAGE="$OUTPUT/stage"
APPDIR="$OUTPUT/AppDir"

rm -rf "$OUTPUT"
mkdir -p "$TARBALLS" "$RUNTIME" "$STAGE" "$APPDIR"

cd "$ROOT"

# Build the project
pnpm run build

# Pack release tarballs
pnpm exec tsx scripts/release/pack.ts --family vendor --out "$TARBALLS/vendor"
pnpm exec tsx scripts/release/pack.ts --family dsh --out "$TARBALLS/dsh"

# Find all .tgz files
PACKAGE_FILES=()
while IFS= read -r -d '' file; do
  PACKAGE_FILES+=("$file")
done < <(find "$TARBALLS" -name '*.tgz' -print0 | sort -z)

if [[ ${#PACKAGE_FILES[@]} -eq 0 ]]; then
  echo "Error: No release tarballs were produced under $TARBALLS" >&2
  exit 1
fi

# Create runtime package.json
cat > "$RUNTIME/package.json" <<EOF
{
  "name": "deepseek-harness-linux-runtime",
  "private": true,
  "version": "0.0.0",
  "dependencies": {
    "pnpm": "11.7.0"
  }
}
EOF

# Install dependencies
cd "$RUNTIME"
npm install --omit=dev --ignore-scripts --no-audit --no-fund --package-lock=false "${PACKAGE_FILES[@]}"

# Copy Node.js binary
cp "$NODE_EXECUTABLE" "$RUNTIME/node"

# Create dsh launcher script
cat > "$RUNTIME/dsh" <<'EOF'
#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/node" "$SCRIPT_DIR/node_modules/@deepseek-ai/dsh/lib/bin.js" "$@"
EOF
chmod +x "$RUNTIME/dsh"

# Setup AppDir structure
cd "$ROOT"

# Copy Electron runtime
ELECTRON="$ROOT/node_modules/electron/dist"
if [[ ! -d "$ELECTRON" ]]; then
  echo "Error: Electron runtime is missing: $ELECTRON. Run pnpm install first." >&2
  exit 1
fi

cp -r "$ELECTRON"/. "$APPDIR/"
mv "$APPDIR/electron" "$APPDIR/DeepSeekHarness" || mv "$APPDIR/electron.exe" "$APPDIR/DeepSeekHarness" 2>/dev/null || true

# Create app resources directory
APP_RESOURCES="$APPDIR/resources/app"
mkdir -p "$APP_RESOURCES"

# Copy runtime files to app
cp "$RUNTIME/node" "$APP_RESOURCES/"
cp "$RUNTIME/dsh" "$APP_RESOURCES/"
cp -r "$RUNTIME/node_modules" "$APP_RESOURCES/"

# Create desktop entry
cat > "$APPDIR/deepseek-harness.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=DeepSeek Harness
Comment=An open-source agent harness powered by Cordis
Exec=DeepSeekHarness
Icon=deepseek-harness
Terminal=false
Categories=Development;IDE;
EOF

# Copy icon (use a placeholder if none exists)
ICON_PATH="$ROOT/scripts/linux/icon.png"
if [[ -f "$ICON_PATH" ]]; then
  cp "$ICON_PATH" "$APPDIR/deepseek-harness.png"
else
  # Create a simple placeholder icon using ImageMagick if available
  if command -v convert &> /dev/null; then
    convert -size 128x128 xc:'#4A90E2' -fill white -gravity center -pointsize 48 -annotate 0 'DSH' "$APPDIR/deepseek-harness.png"
  else
    # Just copy any existing icon
    find "$ROOT" -name "*.png" -o -name "*.ico" | head -1 | xargs -I {} cp {} "$APPDIR/deepseek-harness.png" 2>/dev/null || touch "$APPDIR/deepseek-harness.png"
  fi
fi

# Create main.cjs for Electron
cat > "$APP_RESOURCES/main.cjs" <<'EOF'
/** Electron main process for the packaged Linux desktop application. */
const { app, BrowserWindow, dialog, shell } = require('electron')
const { spawn } = require('node:child_process')
const { join } = require('node:path')
const fs = require('node:fs')

let mainWindow
let webServer
let quitting = false

/** Stop the local dsh server. */
function stopWebServer() {
  const child = webServer
  webServer = undefined
  if (child === undefined || child.killed) return Promise.resolve()
  return new Promise(resolve => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    child.once('exit', finish)
    child.kill()
    setTimeout(finish, 3000).unref()
    setTimeout(finish, 5000).unref()
  })
}

/** Create the application window. */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    title: 'DeepSeek Harness',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
}

/** Launch dsh on an ephemeral loopback port and load it into Electron. */
function startWebServer() {
  const runtime = app.getAppPath()
  const node = join(runtime, 'node')
  const dsh = join(runtime, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  const packageBinaries = join(runtime, 'node_modules', '.bin')

  webServer = spawn(node, [dsh, 'web', '--port', '0'], {
    cwd: app.getPath('documents'),
    env: {
      ...process.env,
      DSH_HOME: join(app.getPath('userData'), 'dsh'),
      PATH: `${runtime}:${packageBinaries}:${process.env.PATH ?? ''}`,
    },
  })

  const loadUrl = (chunk) => {
    const match = /dsh web: (http:\/\/127\.0\.0\.1:\d+)/u.exec(chunk.toString())
    if (match !== null && mainWindow !== undefined) void mainWindow.loadURL(match[1])
  }

  webServer.stdout.on('data', loadUrl)
  webServer.stderr.on('data', loadUrl)

  webServer.once('error', error => {
    void dialog.showErrorBox('DeepSeek Harness Failed to Start', error.message)
  })

  webServer.once('exit', code => {
    if (code !== 0 && mainWindow !== undefined && !mainWindow.isDestroyed()) {
      void dialog.showErrorBox('DeepSeek Harness Stopped', `Local service exited unexpectedly (code ${String(code)}).`)
    }
  })
}

app.whenReady().then(() => {
  createWindow()
  startWebServer()
})

app.on('window-all-closed', () => app.quit())
app.on('before-quit', event => {
  if (quitting) return
  quitting = true
  event.preventDefault()
  void stopWebServer().then(() => app.quit())
})
EOF

# Create package.json for the app
cat > "$APP_RESOURCES/package.json" <<'EOF'
{
  "name": "deepseek-harness-desktop",
  "main": "main.cjs",
  "private": true
}
EOF

# Download linuxdeploy tool for AppImage creation
LINUXDEPLOY_URL="https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-x86_64.AppImage"
LINUXDEPLOY="$OUTPUT/linuxdeploy-x86_64.AppImage"

if [[ ! -f "$LINUXDEPLOY" ]]; then
  echo "Downloading linuxdeploy..."
  curl -L -o "$LINUXDEPLOY" "$LINUXDEPLOY_URL"
  chmod +x "$LINUXDEPLOY"
fi

# Get version from package.json
VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$ROOT/package.json', 'utf8')).version)")
APPIMAGE_OUTPUT="$OUTPUT/deepseek-harness-$VERSION-x86_64.AppImage"

# Create AppImage
echo "Creating AppImage..."
cd "$OUTPUT"
ARCH=x86_64 ./linuxdeploy-x86_64.AppImage \
  --appdir="$APPDIR" \
  --output=appimage \
  --desktop-file="$APPDIR/deepseek-harness.desktop" \
  --icon-file="$APPDIR/deepseek-harness.png"

# Rename output
if [[ -f "$APPDIR/deepseek-harness.AppImage" ]]; then
  mv "$APPDIR/deepseek-harness.AppImage" "$APPIMAGE_OUTPUT"
elif [[ -f "deepseek-harness.AppImage" ]]; then
  mv "deepseek-harness.AppImage" "$APPIMAGE_OUTPUT"
fi

echo "Linux AppImage created: $APPIMAGE_OUTPUT"
