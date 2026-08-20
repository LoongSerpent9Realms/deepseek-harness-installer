/** Updater main-process module for the packaged Windows desktop app (CJS). */
'use strict'
const https = require('node:https')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const DEFAULT_CONFIG = {
  githubRepo: 'LoongSerpent9Realms/deepseek-harness-installer',
  useMirror: true,
  mirrorUrl: 'https://ghfile.geekertao.top/',
}

function toMirrorUrl(githubUrl, mirrorBase) {
  const base = mirrorBase.endsWith('/') ? mirrorBase : mirrorBase + '/'
  return base + githubUrl
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const req = https.request({
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': `DSH-Desktop/${require('electron').app.getVersion()}`,
      },
    }, res => {
      let data = ''
      res.on('data', chunk => { data += chunk.toString() })
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data)
        else reject(new Error(`HTTP ${res.statusCode}`))
      })
    })
    req.on('error', reject)
    req.end()
  })
}

function getAssetName(platform, arch) {
  const platformMap = { win32: 'win', darwin: 'mac', linux: 'linux' }
  const archMap = { x64: 'x64', arm64: 'arm64' }
  return `${platformMap[platform] || platform}-${archMap[arch] || arch}`
}

async function checkForUpdates(config, appVersion) {
  try {
    const currentVersion = appVersion
    const releaseUrl = `https://github.com/${config.githubRepo}/releases/tag/v${currentVersion}`
    const apiUrl = `https://api.github.com/repos/${config.githubRepo}/releases/latest`
    let fetchUrl = apiUrl
    let usedMirror = null
    if (config.useMirror && config.mirrorUrl) {
      fetchUrl = toMirrorUrl(apiUrl, config.mirrorUrl)
      usedMirror = config.mirrorUrl
    }
    const responseText = await httpGet(fetchUrl)
    const data = JSON.parse(responseText)
    const latestVersion = (data.tag_name || data.name || '').replace(/^v/, '')
    const isUpdateAvailable = latestVersion !== currentVersion
    let downloadUrl = null
    if (data.assets && data.assets.length > 0) {
      const assetName = getAssetName(process.platform, process.arch)
      const asset = data.assets.find(a => a.name.includes(assetName)) || data.assets[0]
      if (asset) {
        downloadUrl = config.useMirror && config.mirrorUrl
          ? toMirrorUrl(asset.browser_download_url, config.mirrorUrl)
          : asset.browser_download_url
      }
    }
    return {
      currentVersion,
      latestVersion,
      isUpdateAvailable,
      releaseUrl: data.html_url || releaseUrl,
      usedMirror,
      downloadUrl,
      releaseNotes: data.body || '',
    }
  } catch (error) {
    return {
      currentVersion: appVersion,
      latestVersion: '',
      isUpdateAvailable: false,
      releaseUrl: '',
      usedMirror: null,
      downloadUrl: null,
      releaseNotes: '',
      error: error instanceof Error ? error.message : '检查更新失败',
    }
  }
}

function downloadUpdate(downloadUrl, onProgress) {
  return new Promise((resolve, reject) => {
    const tempDir = path.join(os.tmpdir(), 'dsh-updates')
    fs.mkdirSync(tempDir, { recursive: true })
    const fileName = path.basename(new URL(downloadUrl).pathname) || 'update.exe'
    const filePath = path.join(tempDir, fileName)
    const file = fs.createWriteStream(filePath)
    https.get(downloadUrl, response => {
      if (response.statusCode !== 200) {
        file.close()
        fs.unlinkSync(filePath)
        reject(new Error(`Download failed: HTTP ${response.statusCode}`))
        return
      }
      const totalSize = parseInt(response.headers['content-length'] || '0', 10)
      let downloadedSize = 0
      response.on('data', chunk => {
        downloadedSize += chunk.length
        if (totalSize > 0 && onProgress) onProgress(Math.round((downloadedSize / totalSize) * 100))
        file.write(chunk)
      })
      response.on('end', () => {
        file.end()
        resolve(filePath)
      })
      response.on('error', err => {
        file.close()
        fs.unlinkSync(filePath)
        reject(err)
      })
    }).on('error', err => {
      file.close()
      fs.unlinkSync(filePath)
      reject(err)
    })
  })
}

/**
 * Register updater IPC handlers. Call once after app.whenReady (not per
 * window) so a re-created window cannot double-register a channel.
 * @param {import('electron').BrowserWindow} mainWindow - window for progress events.
 */
function registerUpdaterHandlers(mainWindow) {
  const { app, ipcMain } = require('electron')
  let config = { ...DEFAULT_CONFIG }

  ipcMain.handle('updater:getConfig', async () => ({ ...config }))

  ipcMain.handle('updater:setConfig', async (_event, newConfig) => {
    if (newConfig && typeof newConfig === 'object') config = { ...config, ...newConfig }
    return { success: true }
  })

  ipcMain.handle('updater:checkUpdate', async () => checkForUpdates(config, app.getVersion()))

  ipcMain.handle('updater:downloadUpdate', async (_event, downloadUrl) => {
    try {
      const filePath = await downloadUpdate(downloadUrl, percent => {
        if (mainWindow !== undefined && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('updater:downloadProgress', percent)
        }
      })
      return { success: true, filePath, message: '下载完成，请手动安装或等待自动安装' }
    } catch (error) {
      return { error: error instanceof Error ? error.message : '下载失败' }
    }
  })
}

module.exports = { registerUpdaterHandlers, DEFAULT_CONFIG }
