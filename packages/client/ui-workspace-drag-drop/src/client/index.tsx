/**
 * Workspace drag-drop plugin, browser half. Registers an overlay into the
 * sidebar's workspaces region that listens for folder drops and creates
 * workspaces from them.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { DragDropOverlay } from './DragDropOverlay.tsx'
import { en, zh, type WorkspaceDragDropKey } from './locales.ts'

export type { WorkspaceDragDropKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The workspace drag-drop overlay copy. */
    workspaceDragDrop: WorkspaceDragDropKey
  }

  interface SlotMap {
    /** Drag-drop overlay for adding workspaces by dropping folders. */
    'sidebar.workspaces.dragDrop': { kind: 'single'; scope: 'root'; owner: {} }
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'workspaceDragDrop'

/**
 * Required services (cordis fiber inject).
 */
export const inject = ['slots', 'workspaces', 'locale']

/**
 * Register the drag-drop overlay into the sidebar workspaces region.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-workspace-drag-drop: dictionaries')

  // Register the overlay component. The parent slot's children table
  // (`sidebar.workspaces` registered by ui-workspace, which declares
  // `sidebar.workspaces.dragDrop`) creates this slot's record; using
  // slots.inject (like every upstream child-slot plugin) waits for that
  // declaration instead of racing it in apply().
  ctx.slots.inject('sidebar.workspaces.dragDrop', () => ctx.slots.register(
    {
      name: 'sidebar.workspaces.dragDrop',
      children: {},
      locale: NS,
    },
    ({ t }: PropsRuntime<'sidebar.workspaces.dragDrop'> & PropsLocale<'workspaceDragDrop'>) => {
      const handleDrop = async (path: string): Promise<void> => {
        await ctx.workspaces.create({ path })
      }

      return (
        <DragDropOverlay
          active={true}
          onDrop={handleDrop}
          t={t}
        />
      )
    },
  ))
}
