/**
 * Preload script: safely exposes updater IPC APIs to the renderer process.
 */
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('dshUpdater', {
  getConfig: () => ipcRenderer.invoke('updater:getConfig'),
  setConfig: (config: object) => ipcRenderer.invoke('updater:setConfig', config),
  checkUpdate: () => ipcRenderer.invoke('updater:checkUpdate'),
  downloadUpdate: (url: string) => ipcRenderer.invoke('updater:downloadUpdate', url),
  onDownloadProgress: (callback: (percent: number) => void) => {
    const listener = (_event: unknown, percent: number) => callback(percent)
    ipcRenderer.on('updater:downloadProgress', listener)
    return () => ipcRenderer.removeListener('updater:downloadProgress', listener)
  },
})

// App-level bridge: restart the whole desktop app (used by the plugin-restart
// prompt — a new plugin package needs a full relaunch to enter the boot graph).
contextBridge.exposeInMainWorld('dshApp', {
  restart: () => ipcRenderer.invoke('app:restart'),
})
