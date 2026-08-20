/**
 * Updater settings UI (client half).
 * Registers into settings.section with configuration and update checking UI.
 * Supports both Electron (window.dshUpdater) and Web (host.call) environments.
 */
import React from 'react'
import type { Context } from '@deepseek-ai/cordis'

interface UpdaterConfig {
  githubRepo: string
  useMirror: boolean
  mirrorUrl: string
}

interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  isUpdateAvailable: boolean
  releaseUrl: string
  usedMirror: string | null
  downloadUrl: string | null
  releaseNotes: string
  error?: string
}

// Detect environment and get the appropriate updater API
function getUpdaterAPI(ctx: Context) {
  // Check if running in Electron (window.dshUpdater is exposed by preload)
  const electronAPI = (globalThis as unknown as Record<string, unknown>).dshUpdater as {
    getConfig: () => Promise<UpdaterConfig>
    setConfig: (config: Partial<UpdaterConfig>) => Promise<{ success: boolean }>
    checkUpdate: () => Promise<UpdateInfo>
    downloadUpdate: (url: string) => Promise<{ success?: boolean; filePath?: string; message?: string; error?: string }>
    onDownloadProgress: (cb: (p: number) => void) => () => void
  } | undefined

  if (electronAPI && typeof electronAPI.checkUpdate === 'function') {
    return {
      type: 'electron' as const,
      api: electronAPI,
    }
  }

  // Fallback to Host RPC (web environment). The cordis fiber rejects
  // undeclared property access, and no 'host' service exists on the web
  // surface, so read it defensively: an absent host just means the updater
  // is unavailable here (buttons render disabled) — the plugin still mounts.
  let host: unknown
  try {
    host = (ctx as unknown as Record<string, unknown>).host
  } catch {
    host = undefined
  }
  const hostCall = host && typeof host === 'object'
    ? (host as Record<string, unknown>).call as ((method: string, args?: unknown) => Promise<unknown>) | undefined
    : undefined

  if (hostCall && typeof hostCall === 'function') {
    return {
      type: 'web' as const,
      call: hostCall,
    }
  }

  return null
}

/**
 * Required services (cordis fiber inject): the updater reads ctx.slots to
 * register the settings entry. ctx.host is NOT injected — no 'host' service
 * exists on the web surface, and the Electron path never reads it; the web
 * fallback above probes it defensively instead.
 */
export const inject = ['slots']

export function apply(ctx: Context): void {
  const slots = (ctx as unknown as Record<string, unknown>).slots as {
    inject: (name: string, fn: () => void) => void
    register: (options: { name: string; id: string; order: number; label: string }, component: React.FC) => void
  } | undefined
  if (!slots) return

  const updaterAPI = getUpdaterAPI(ctx)

  let config: UpdaterConfig | null = null
  let updateInfo: UpdateInfo | null = null
  let error: string | null = null

  async function loadConfig() {
    if (!updaterAPI) { error = '更新服务不可用'; return }
    try {
      if (updaterAPI.type === 'electron') {
        config = await updaterAPI.api.getConfig()
      } else {
        config = (await updaterAPI.call('updater.getConfig')) as UpdaterConfig
      }
    } catch (e) {
      error = (e as Error).message || '加载配置失败'
    }
  }

  async function checkForUpdates() {
    if (!updaterAPI) { error = '更新服务不可用'; return }
    error = null
    try {
      let result: UpdateInfo
      if (updaterAPI.type === 'electron') {
        result = await updaterAPI.api.checkUpdate()
      } else {
        result = (await updaterAPI.call('updater.checkUpdate')) as UpdateInfo
      }
      if (result?.error) {
        error = result.error
        updateInfo = null
      } else {
        updateInfo = result
      }
    } catch (e) {
      error = (e as Error).message || '检查更新失败'
      updateInfo = null
    }
  }

  async function saveConfig(newConfig: Partial<UpdaterConfig>) {
    if (!updaterAPI) { error = '更新服务不可用'; return }
    try {
      if (updaterAPI.type === 'electron') {
        await updaterAPI.api.setConfig(newConfig)
      } else {
        await updaterAPI.call('updater.setConfig', newConfig)
      }
      config = { ...config, ...newConfig } as UpdaterConfig
    } catch (e) {
      error = (e as Error).message || '保存配置失败'
    }
  }

  async function downloadUpdate(downloadUrl: string) {
    if (!updaterAPI) { error = '更新服务不可用'; return }
    try {
      let result
      if (updaterAPI.type === 'electron') {
        result = await updaterAPI.api.downloadUpdate(downloadUrl)
      } else {
        result = await updaterAPI.call('updater.downloadUpdate', downloadUrl)
      }
      const res = result as { success?: boolean; filePath?: string; message?: string; error?: string }
      if (res?.error) {
        error = res.error
      } else {
        alert(res.message || '更新下载成功！')
      }
    } catch (e) {
      error = (e as Error).message || '下载更新失败'
    }
  }

  if (updaterAPI) {
    loadConfig()
  } else {
    config = {
      githubRepo: 'LoongSerpent9Realms/deepseek-harness-installer',
      useMirror: true,
      mirrorUrl: 'https://ghfile.geekertao.top/',
    }
    error = '更新服务不可用，功能受限'
  }

  function UpdaterSettingsPage() {
    const [localConfig, setLocalConfig] = React.useState<UpdaterConfig>(config || {
      githubRepo: 'LoongSerpent9Realms/deepseek-harness-installer',
      useMirror: true,
      mirrorUrl: 'https://ghfile.geekertao.top/',
    })
    const [checking, setChecking] = React.useState(false)
    const [saveSuccess, setSaveSuccess] = React.useState(false)

    React.useEffect(() => {
      if (config) setLocalConfig(config)
    }, [config])

    const handleSave = async () => {
      setSaveSuccess(false)
      await saveConfig(localConfig)
      if (!error) setSaveSuccess(true)
    }

    const handleCheckUpdate = async () => {
      if (!updaterAPI) { alert('Host 通信不可用'); return }
      setChecking(true)
      await checkForUpdates()
      setChecking(false)
    }

    const rowStyle: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 0',
      borderBottom: '1px solid var(--dsw-border-color, #e5e7eb)',
    }
    const labelStyle: React.CSSProperties = {
      fontSize: '14px',
      color: 'var(--dsw-text-primary, #1f2937)',
      fontWeight: '500',
    }
    const descStyle: React.CSSProperties = {
      fontSize: '12px',
      color: 'var(--dsw-text-secondary, #6b7280)',
      marginTop: '4px',
    }
    const inputStyle: React.CSSProperties = {
      padding: '8px 12px',
      border: '1px solid var(--dsw-border-color, #d1d5db)',
      borderRadius: '6px',
      fontSize: '14px',
      backgroundColor: 'var(--dsw-bg-input, #fff)',
      color: 'var(--dsw-text-primary, #1f2937)',
      outline: 'none',
      width: '280px',
    }
    const buttonPrimaryStyle: React.CSSProperties = {
      padding: '8px 16px',
      backgroundColor: 'var(--dsw-primary, #3b82f6)',
      color: '#fff',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: '500',
    }
    const buttonDisabledStyle: React.CSSProperties = {
      ...buttonPrimaryStyle,
      backgroundColor: 'var(--dsw-disabled-bg, #d1d5db)',
      cursor: 'not-allowed',
    }
    const hostAvailable = !!updaterAPI

    return React.createElement('div', { style: { maxWidth: '640px' } },
      // Title
      React.createElement('h2', {
        style: { fontSize: '20px', fontWeight: '600', marginBottom: '20px', color: 'var(--dsw-text-primary, #1f2937)' },
      }, '应用更新'),

      // Error message
      error && React.createElement('div', {
        style: { padding: '12px 16px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '14px', marginBottom: '16px' },
      }, error),

      // Save success message
      saveSuccess && React.createElement('div', {
        style: { padding: '12px 16px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', color: '#16a34a', fontSize: '14px', marginBottom: '16px' },
      }, '配置已保存'),

      // Update source configuration
      React.createElement('div', { style: { marginBottom: '24px' } },
        React.createElement('h3', {
          style: { fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: 'var(--dsw-text-primary, #1f2937)' },
        }, '更新源'),

        // GitHub repo
        React.createElement('div', { style: rowStyle },
          React.createElement('div', null,
            React.createElement('div', { style: labelStyle }, 'GitHub 仓库'),
            React.createElement('div', { style: descStyle }, '要检查更新的 GitHub 仓库地址'),
          ),
          React.createElement('input', {
            type: 'text',
            value: localConfig.githubRepo || '',
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setLocalConfig({ ...localConfig, githubRepo: e.target.value }),
            disabled: !hostAvailable,
            style: { ...inputStyle, width: '320px' },
            placeholder: 'owner/repo',
          }),
        ),

        // Use mirror
        React.createElement('div', { style: rowStyle },
          React.createElement('div', null,
            React.createElement('div', { style: labelStyle }, '使用镜像加速'),
            React.createElement('div', { style: descStyle }, '通过镜像站加速访问 GitHub'),
          ),
          React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: hostAvailable ? 'pointer' : 'not-allowed' } },
            React.createElement('input', {
              type: 'checkbox',
              checked: localConfig.useMirror !== false,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => setLocalConfig({ ...localConfig, useMirror: e.target.checked }),
              disabled: !hostAvailable,
              style: { width: '16px', height: '16px', accentColor: 'var(--dsw-primary, #3b82f6)' },
            }),
          ),
        ),

        // Mirror URL
        React.createElement('div', { style: rowStyle },
          React.createElement('div', null,
            React.createElement('div', { style: labelStyle }, '镜像站地址'),
            React.createElement('div', { style: descStyle }, '用于加速 GitHub 访问的镜像站'),
          ),
          React.createElement('input', {
            type: 'text',
            value: localConfig.mirrorUrl || '',
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setLocalConfig({ ...localConfig, mirrorUrl: e.target.value }),
            disabled: !hostAvailable,
            style: { ...inputStyle, width: '320px' },
            placeholder: 'https://ghfile.geekertao.top/',
          }),
        ),

        // Save button
        React.createElement('div', { style: { paddingTop: '16px' } },
          React.createElement('button', {
            onClick: handleSave,
            disabled: !hostAvailable,
            style: hostAvailable ? buttonPrimaryStyle : buttonDisabledStyle,
          }, '保存配置'),
        ),
      ),

      // Check for updates
      React.createElement('div', null,
        React.createElement('h3', {
          style: { fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: 'var(--dsw-text-primary, #1f2937)' },
        }, '检查更新'),

        React.createElement('div', { style: { ...rowStyle, borderBottom: 'none' } },
          React.createElement('div', null,
            React.createElement('div', { style: labelStyle }, '手动检查更新'),
            React.createElement('div', { style: descStyle }, '获取最新版本信息并对比当前版本'),
          ),
          React.createElement('button', {
            onClick: handleCheckUpdate,
            disabled: checking || !hostAvailable,
            style: (checking || !hostAvailable) ? buttonDisabledStyle : buttonPrimaryStyle,
          }, checking ? '检查中...' : '检查更新'),
        ),

        // Update info
        updateInfo && React.createElement('div', {
          style: { marginTop: '16px', padding: '16px', backgroundColor: 'var(--dsw-bg-secondary, #f9fafb)', borderRadius: '8px' },
        },
        React.createElement('div', {
          style: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontSize: '14px' },
        },
        React.createElement('span', { style: { color: 'var(--dsw-text-secondary, #6b7280)' } }, '当前版本:'),
        React.createElement('span', { style: { color: 'var(--dsw-text-primary, #1f2937)', fontFamily: 'monospace' } }, updateInfo.currentVersion),
        React.createElement('span', { style: { color: 'var(--dsw-text-secondary, #6b7280)' } }, '最新版本:'),
        React.createElement('span', { style: { color: 'var(--dsw-text-primary, #1f2937)', fontFamily: 'monospace' } }, updateInfo.latestVersion),
        React.createElement('span', { style: { color: 'var(--dsw-text-secondary, #6b7280)' } }, '状态:'),
        React.createElement('span', {
          style: { color: updateInfo.isUpdateAvailable ? '#16a34a' : 'var(--dsw-text-secondary, #6b7280)', fontWeight: 'bold' },
        }, updateInfo.isUpdateAvailable ? '有新版本可用' : '已是最新版本'),
        ),

        // Used mirror
        updateInfo.usedMirror && React.createElement('div', {
          style: { marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--dsw-border-color, #e5e7eb)' },
        },
        React.createElement('div', { style: { fontSize: '12px', color: 'var(--dsw-text-secondary, #6b7280)', marginBottom: '4px' } }, '使用的镜像站:'),
        React.createElement('a', {
          href: updateInfo.usedMirror,
          target: '_blank',
          rel: 'noopener noreferrer',
          style: { color: 'var(--dsw-primary, #3b82f6)', fontSize: '13px', wordBreak: 'break-all' },
        }, updateInfo.usedMirror),
        ),

        // Action buttons
        updateInfo.isUpdateAvailable && React.createElement('div', { style: { marginTop: '16px', display: 'flex', gap: '12px' } },
          React.createElement('a', {
            href: updateInfo.releaseUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
            style: { ...buttonPrimaryStyle, backgroundColor: 'transparent', color: 'var(--dsw-primary, #3b82f6)', border: '1px solid var(--dsw-primary, #3b82f6)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' },
          }, '查看发布说明'),
          updateInfo.downloadUrl && React.createElement('button', {
            onClick: () => downloadUpdate(updateInfo?.downloadUrl ?? ''),
            style: buttonPrimaryStyle,
          }, '下载更新'),
        ),
        ),
      ),
    )
  }

  slots.inject('settings.section', () => {
    slots.register(
      { name: 'settings.section', id: 'app-updater', order: 100, label: '应用更新' },
      UpdaterSettingsPage,
    )
  })
}
