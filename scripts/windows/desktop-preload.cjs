/** Preload script for the packaged Windows desktop app: exposes updater IPC. */
'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshUpdater', {
  getConfig: () => ipcRenderer.invoke('updater:getConfig'),
  setConfig: config => ipcRenderer.invoke('updater:setConfig', config),
  checkUpdate: () => ipcRenderer.invoke('updater:checkUpdate'),
  downloadUpdate: url => ipcRenderer.invoke('updater:downloadUpdate', url),
  onDownloadProgress: listener => {
    const handler = (_event, percent) => listener(percent)
    ipcRenderer.on('updater:downloadProgress', handler)
    return () => ipcRenderer.removeListener('updater:downloadProgress', handler)
  },
})
