/**
 * Package-owned invariant companion for `@loongserpent/dsh-client-ui-workspace-drag-drop`.
 * @module @loongserpent/dsh-client-ui-workspace-drag-drop/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@loongserpent/dsh-client-ui-workspace-drag-drop'

/** Cordis companion plugin name. */
export const name = 'client-ui-workspace-drag-drop-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a pure-consumer plugin registering a presentational
 * overlay component into the sidebar workspaces slot — its inject face is a
 * single createWorkspace call; it emits no cordis events and owns no
 * cross-plugin mutable state.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
