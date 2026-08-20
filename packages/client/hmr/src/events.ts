/**
 * Wire protocol of the `/plugins/events` dev SSE channel — single source for
 * both halves of this package. Frames still cross a wire boundary: the
 * browser half validates them at its JSON parse point; sharing the type keeps
 * the two ends from drifting, not from parsing.
 */

import type { WebBootGraph } from '@deepseek-ai/dsh-client-modules'

/**
 * One SSE frame: the full graph on connect, one rebuilt bundle notice, or a
 * plugin-set change notice. `plugins-changed` is the "new plugin needs a
 * restart" signal: a brand-new `dsh.client` web plugin package cannot enter
 * the boot graph without a host restart (the module registry caches negative
 * verdicts forever), so the host scans the plugin package set on disk and
 * tells the browser half when it drifts from what the running graph covers.
 */
export type PluginsEventFrame =
  | { type: 'graph'; graph: WebBootGraph }
  | { type: 'rebuilt'; id: string; rev: string }
  | { type: 'plugins-changed'; added: string[]; removed: string[]; snapshotId?: string }

/** System SSE endpoint pushing graph/rebuilt frames (wire protocol constant). */
export const EVENTS_ENDPOINT = '/plugins/events'

/**
 * Dev-only endpoint that respawns the host process (used by the browser
 * restart prompt: click "restart now" → the client POSTs here → the process
 * re-executes itself and the next page load re-boots the cordis graph, which
 * is what actually picks up new plugin packages).
 */
export const RESTART_ENDPOINT = '/plugins/restart-host'
