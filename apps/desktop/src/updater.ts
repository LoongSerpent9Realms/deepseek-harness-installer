/**
 * Electron main-process updater module.
 * Provides GitHub release checking with mirror support and download/install capabilities.
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export interface UpdaterConfig {
  githubRepo: string
  useMirror: boolean
  mirrorUrl: string
}

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  isUpdateAvailable: boolean
  releaseUrl: string
  usedMirror: string | null
  downloadUrl: string | null
  releaseNotes: string
  error?: string
}

const DEFAULT_CONFIG: UpdaterConfig = {
  githubRepo: 'LoongSerpent9Realms/deepseek-harness-installer',
  useMirror: true,
  mirrorUrl: 'https://ghfile.geekertao.top/',
}

function toMirrorUrl(githubUrl: string, mirrorBase: string): string {
  const base = mirrorBase.endsWith('/') ? mirrorBase : mirrorBase + '/'
  return base + githubUrl
}

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: 'GET' as const,
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': `DSH-Desktop/${app.getVersion()}`,
      },
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk.toString() })
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data)
        } else {
          reject(new Error(`HTTP ${res.statusCode}`))
        }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

async function checkForUpdates(config: UpdaterConfig): Promise<UpdateInfo> {
  try {
    const currentVersion = app.getVersion()
    const releaseUrl = `https://github.com/${config.githubRepo}/releases/tag/v${currentVersion}`
    const apiUrl = `https://api.github.com/repos/${config.githubRepo}/releases/latest`

    let fetchUrl = apiUrl
    let usedMirror: string | null = null

    if (config.useMirror && config.mirrorUrl) {
      fetchUrl = toMirrorUrl(apiUrl, config.mirrorUrl)
      usedMirror = config.mirrorUrl
    }

    const responseText = await httpGet(fetchUrl)
    const data = JSON.parse(responseText) as {
      tag_name?: string
      name?: string
      html_url?: string
      body?: string
      assets?: Array<{ browser_download_url: string; name: string }>
    }

    const latestVersion = (data.tag_name || data.name || '').replace(/^v/, '')
    const isUpdateAvailable = latestVersion !== currentVersion

    // Find the best asset for the current platform
    let downloadUrl: string | null = null
    if (data.assets && data.assets.length > 0) {
      const platform = process.platform
      const arch = process.arch
      const assetName = getAssetName(platform, arch)
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
      currentVersion: app.getVersion(),
      latestVersion: '',
      isUpdateAvailable: false,
      releaseUrl: '',
      usedMirror: null,
      downloadUrl: null,
      releaseNotes: '',
      error: (error as Error).message || '检查更新失败',
    }
  }
}

function getAssetName(platform: string, arch: string): string {
  const platformMap: Record<string, string> = {
    win32: 'win',
    darwin: 'mac',
    linux: 'linux',
  }
  const archMap: Record<string, string> = {
    x64: 'x64',
    arm64: 'arm64',
  }
  return `${platformMap[platform] || platform}-${archMap[arch] || arch}`
}

async function downloadUpdate(downloadUrl: string, onProgress?: (percent: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const tempDir = path.join(os.tmpdir(), 'dsh-updates')
    fs.mkdirSync(tempDir, { recursive: true })

    const fileName = path.basename(new URL(downloadUrl).pathname) || 'update.exe'
    const filePath = path.join(tempDir, fileName)

    const file = fs.createWriteStream(filePath)

    https.get(downloadUrl, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed: HTTP ${response.statusCode}`))
        return
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10)
      let downloadedSize = 0

      response.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length
        if (totalSize > 0 && onProgress) {
          onProgress(Math.round((downloadedSize / totalSize) * 100))
        }
        file.write(chunk)
      })

      response.on('end', () => {
        file.end()
        resolve(filePath)
      })

      response.on('error', (err) => {
        file.close()
        fs.unlinkSync(filePath)
        reject(err)
      })
    }).on('error', (err) => {
      file.close()
      fs.unlinkSync(filePath)
      reject(err)
    })
  })
}

// IPC handlers registration
export function registerUpdaterHandlers(mainWindow: BrowserWindow) {
  let config: UpdaterConfig = { ...DEFAULT_CONFIG }

  ipcMain.handle('updater:getConfig', async () => {
    return { ...config }
  })

  ipcMain.handle('updater:setConfig', async (_event, newConfig: Partial<UpdaterConfig>) => {
    if (newConfig && typeof newConfig === 'object') {
      config = { ...config, ...newConfig }
    }
    return { success: true }
  })

  ipcMain.handle('updater:checkUpdate', async () => {
    return await checkForUpdates(config)
  })

  ipcMain.handle('updater:downloadUpdate', async (_event, downloadUrl: string) => {
    try {
      const filePath = await downloadUpdate(downloadUrl, (percent) => {
        mainWindow.webContents.send('updater:downloadProgress', percent)
      })
      return { success: true, filePath, message: '下载完成，请手动安装或等待自动安装' }
    } catch (error) {
      return { error: (error as Error).message || '下载失败' }
    }
  })
}
