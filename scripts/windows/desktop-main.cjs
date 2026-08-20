/** Electron main process for the packaged Windows desktop application. */
const { app, BrowserWindow, dialog, shell } = require('electron')
const { execFile, spawn } = require('node:child_process')
const { join } = require('node:path')
const { registerUpdaterHandlers } = require('./desktop-updater.cjs')

let mainWindow
let webServer
let quitting = false

/** Stop the local dsh server and its package-manager descendants. */
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
    if (process.platform === 'win32' && child.pid !== undefined) {
      execFile('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, finish)
    } else {
      child.kill()
      setTimeout(finish, 3000).unref()
    }
    setTimeout(finish, 5000).unref()
  })
}

/** Create the application window before the local service is ready. */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    title: 'DeepSeek Harness',
    icon: join(app.getAppPath(), 'icon.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ffffff',
      symbolColor: '#1f2937',
      height: 32,
    },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(app.getAppPath(), 'preload.cjs'),
    },
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('page-title-updated', event => {
    event.preventDefault()
    mainWindow.setTitle('DeepSeek Harness')
  })
  mainWindow.webContents.on('did-finish-load', () => {
    // Reserve the native overlay title-bar strip so the web app's top actions
    // are never covered by the minimize/maximize/close controls, and make the
    // whole 32px strip a window drag handle.
    // Also disable text selection on the brand row elements (headline text and
    // new-session label) so dragging the title bar does not leave a blue
    // selection box. Use class-substring matching because CSS-module hashes
    // change between builds while the suffix stays stable.
    void mainWindow.webContents.insertCSS(
      'html { padding-top: 32px !important; box-sizing: border-box; } ' +
      '#dsh-titlebar-drag-handle { position: fixed; top: 0; left: 0; right: 0; height: 32px; z-index: 2147483646; -webkit-app-region: drag; app-region: drag; pointer-events: auto; } ' +
      '[class*="_headlineText"], [class*="_newSessionLabel"], ' +
      '[class*="_previewBadge"], [class*="_wide"], [class*="_sessionOverflowButton"], ' +
      '[class*="_triggerLabel"], [class*="_workspaceLabel"], [class*="_seat"] ' +
      '{ -webkit-user-select: none; user-select: none; } ' +
      '[class$="_panel"] { -webkit-user-select: none; user-select: none; } ' +
      '[class$="_panel"] input, [class$="_panel"] textarea, [class$="_panel"] [contenteditable] ' +
      '{ -webkit-user-select: text; user-select: text; }',
    )
    // Inject the fixed drag handle element so the top strip is draggable.
    void mainWindow.webContents.executeJavaScript(`
      (function () {
        if (document.getElementById('dsh-titlebar-drag-handle')) return;
        var handle = document.createElement('div');
        handle.id = 'dsh-titlebar-drag-handle';
        handle.setAttribute('aria-hidden', 'true');
        document.body.insertBefore(handle, document.body.firstChild);
      })();
    `, false)
  })
  mainWindow.once('ready-to-show', () => mainWindow.show())
}

/** Launch dsh on an ephemeral loopback port and load it into Electron. */
function startWebServer() {
  const runtime = app.getAppPath()
  const node = join(runtime, 'node.exe')
  const dsh = join(runtime, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  const packageBinaries = join(runtime, 'node_modules', '.bin')
  webServer = spawn(node, [dsh, 'web', '--port', '0'], {
    cwd: app.getPath('documents'),
    windowsHide: true,
    env: {
      ...process.env,
      DSH_HOME: join(app.getPath('userData'), 'dsh'),
      // Surface marker: the web-app bundle renders a desktop-oriented prompt
      // section instead of the browser "Web GUI at <url>" text.
      DSH_DESKTOP: '1',
      PATH: `${runtime};${packageBinaries};${process.env.PATH ?? ''}`,
    },
  })
  const loadUrl = (chunk) => {
    const match = /dsh web: (http:\/\/127\.0\.0\.1:\d+)/u.exec(chunk.toString())
    if (match !== null && mainWindow !== undefined) void mainWindow.loadURL(match[1])
  }
  webServer.stdout.on('data', loadUrl)
  webServer.stderr.on('data', loadUrl)
  webServer.once('error', error => void dialog.showErrorBox('DeepSeek Harness 无法启动', error.message))
  webServer.once('exit', code => {
    if (code !== 0 && mainWindow !== undefined && !mainWindow.isDestroyed()) {
      void dialog.showErrorBox('DeepSeek Harness 已停止', `本地服务意外退出（代码 ${String(code)}）。`)
    }
  })
}

app.whenReady().then(() => {
  // Updater IPC: registered once here (not in createWindow) so a re-created
  // window on macOS activate cannot double-register a channel.
  registerUpdaterHandlers(mainWindow)
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
