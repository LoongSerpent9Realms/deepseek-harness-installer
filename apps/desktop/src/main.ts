/**
 * DeepSeek Harness Desktop - Electron main process entry point.
 * Wraps the dsh-web-app with auto-update support.
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { registerUpdaterHandlers } from './updater.js'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../assets/icon.png'),
  })

  // Register updater IPC handlers
  registerUpdaterHandlers(mainWindow)

  // Load the web app (in development, use dev server; in production, load built files)
  const isDev = !app.isPackaged
  if (isDev) {
    mainWindow.loadURL('http://localhost:3080')
    mainWindow.webContents.openDevTools()
  } else {
    // In production, serve the built web app from the bundled files
    const webAppPath = path.join(__dirname, '../../packages/bundle/web-app/dist')
    mainWindow.loadFile(path.join(webAppPath, 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// App lifecycle
app.whenReady().then(() => {
  // Restart the whole app on demand (the web UI's plugin-restart prompt):
  // relaunch re-runs the main process, which re-reads the plugin set. Handle
  // registration lives here (once), not in createWindow, so a macOS activate
  // re-created window cannot double-register the channel.
  ipcMain.handle('app:restart', () => {
    app.relaunch()
    app.exit(0)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
})
