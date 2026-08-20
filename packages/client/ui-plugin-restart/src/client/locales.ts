/** Locale strings for the plugin-restart UI plugin. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'restart.title': '需要重启以加载新插件',
  'restart.body.added': '新增插件：',
  'restart.body.removed': '移除插件：',
  'restart.body.none': '（无）',
  'restart.snapshot.saved': '已保存重载前快照 #{id}；若重启后异常，可回滚到上次正常运行状态。',
  'restart.snapshot.no': '未找到回滚快照。',
  'restart.now': '立即重启',
  'restart.rollback': '回滚并重启',
  'restart.later': '稍后',
  'restart.busy': '正在重启…',
  'restart.failed': '重启失败，请手动重启开发服务器（pnpm dsh web）。',
} satisfies Record<string, string>

/** The plugin-restart namespace key union. */
export type PluginRestartKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'restart.title': 'Restart required to load new plugins',
  'restart.body.added': 'Added plugins: ',
  'restart.body.removed': 'Removed plugins: ',
  'restart.body.none': '(none)',
  'restart.snapshot.saved': 'Pre-reload snapshot #{id} saved; if the restart breaks, you can roll back to the last known-good state.',
  'restart.snapshot.no': 'No rollback snapshot found.',
  'restart.now': 'Restart now',
  'restart.rollback': 'Roll back and restart',
  'restart.later': 'Later',
  'restart.busy': 'Restarting…',
  'restart.failed': 'Restart failed — please restart the dev server manually (pnpm dsh web).',
} satisfies Record<PluginRestartKey, string>
