/**
 * ui-plugin-restart, browser half: registers the restart prompt into the
 * shell overlay slot. The prompt listens on the hmr dev SSE channel for
 * plugin-set changes and offers one-click restart / rollback.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ui-layout's SlotMap merge ('shell.overlay' + the root
// scope standard-props share that the registrant needs at runtime).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { RestartPrompt } from './RestartPrompt.tsx'
import { en, zh, type PluginRestartKey } from './locales.ts'

export type { PluginRestartKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The plugin-restart prompt copy. */
    pluginRestart: PluginRestartKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'pluginRestart'

/**
 * Required services (cordis fiber inject).
 */
export const inject = ['slots', 'locale']

/**
 * Register the restart prompt into the shell overlay (a root list slot:
 * additive with other overlays).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-plugin-restart: dictionaries')

  ctx.slots.register(
    {
      name: 'shell.overlay',
      id: 'plugin-restart',
      children: {},
      locale: NS,
    },
    ({ t }: PropsRuntime<'shell.overlay'> & PropsLocale<'pluginRestart'>) => (
      <RestartPrompt t={t} />
    ),
  )
}
