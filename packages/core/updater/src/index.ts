/**
 * Application updater plugin (host half).
 * Provides GitHub release checking with mirror proxy support.
 */
import type { Context } from '@deepseek-ai/cordis'
import * as https from 'node:https'

export const name = 'updater'

export interface UpdaterConfig {
  githubRepo: string
  useMirror: boolean
  mirrorUrl: string
  checkInterval: number
}

const DEFAULT_CONFIG: UpdaterConfig = {
  githubRepo: 'LoongSerpent9Realms/deepseek-harness-installer',
  useMirror: true,
  mirrorUrl: 'https://ghfile.geekertao.top/',
  checkInterval: 3600000,
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
        'User-Agent': 'DSH-Updater',
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

export function apply(ctx: Context): void {
  const harness = ctx.get('harness')
  if (!harness) return

  let config: UpdaterConfig = { ...DEFAULT_CONFIG }

  harness.handle('updater.getConfig', async () => {
    return { ...config }
  })

  harness.handle('updater.setConfig', async (newConfig: Partial<UpdaterConfig>) => {
    if (newConfig && typeof newConfig === 'object') {
      config = { ...config, ...newConfig }
    }
    return { success: true }
  })

  harness.handle('updater.checkUpdate', async () => {
    try {
      const currentVersion = '0.1.0-rc.7'
      const releaseUrl = `https://github.com/${config.githubRepo}/releases/tag/${currentVersion}`
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
        assets?: Array<{ browser_download_url: string }>
      }

      const latestVersion = data.tag_name || data.name || currentVersion
      const isUpdateAvailable = latestVersion !== currentVersion

      let mirroredDownloadUrl: string | null = null
      const firstAsset = data.assets?.[0]
      if (firstAsset && config.useMirror && config.mirrorUrl) {
        mirroredDownloadUrl = toMirrorUrl(firstAsset.browser_download_url, config.mirrorUrl)
      }

      return {
        currentVersion,
        latestVersion,
        isUpdateAvailable,
        releaseUrl,
        usedMirror,
        downloadUrl: mirroredDownloadUrl || firstAsset?.browser_download_url || null,
        releaseNotes: data.body || '',
      }
    } catch (error) {
      return { error: (error as Error).message || '检查更新失败' }
    }
  })

  harness.handle('updater.downloadUpdate', async (downloadUrl: string) => {
    if (!downloadUrl) return { error: '下载地址无效' }
    return { success: true, message: `请下载链接：${downloadUrl}`, downloadUrl }
  })
}
