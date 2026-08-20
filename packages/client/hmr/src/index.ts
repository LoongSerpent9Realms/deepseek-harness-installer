/**
 * HMR plugin, node half: the host end of the dev reload chain. One interval
 * stat-polls every graph row's client bundle (polling by design: network
 * mounts deliver no inotify events), reports content changes through
 * `clientModuleHost.rebuilt(id)`, and serves the `/plugins/events` SSE channel
 * broadcasting graph/rebuilt frames to the browser half (src/client/).
 * The web bundle mounts this row unconditionally: without a rebuild
 * watcher rewriting client bundles, the poll observes no changes and the
 * chain stays idle.
 */
import { existsSync, globSync, readFileSync, statSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Empty type imports carry the clientModuleHost/webServer Context merges.
import type {} from '@deepseek-ai/dsh-client-modules'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { PluginsEventFrame } from './events.ts'
import { EVENTS_ENDPOINT, RESTART_ENDPOINT } from './events.ts'
import { KNOWN_GOOD_ID, PluginSnapshotStore } from './snapshot.ts'

export type { PluginsEventFrame } from './events.ts'
export { EVENTS_ENDPOINT, RESTART_ENDPOINT } from './events.ts'
export { PluginSnapshotStore, KNOWN_GOOD_ID } from './snapshot.ts'

/** Cordis plugin name. */
export const name = 'client-hmr'

/** Required services: the web plugin table and the route registry. */
export const inject = ['clientModules', 'webServer']

/** Plugin config, validated by the same-named schemastery schema. */
export interface Config {
  /** Bundle stat-poll interval in milliseconds (default 500, the build-side watcher's polling default). */
  pollIntervalMs?: number
  /** Plugin-set scan interval in milliseconds (default 2000, slower than the bundle poll — it reads every package manifest). */
  pluginScanIntervalMs?: number
}

export const Config: z<Config> = z.object({
  pollIntervalMs: z.number().step(1).min(1).default(500),
  pluginScanIntervalMs: z.number().step(1).min(250).default(2000),
})

/** Serialize one frame as an SSE data line. */
function sseData(frame: PluginsEventFrame): string {
  return `data: ${JSON.stringify(frame)}\n\n`
}

/**
 * Resolve the repository root from the config-tree anchor: walk up from
 * `ctx.baseUrl` (the cordis.yml directory) until a `pnpm-workspace.yaml`
 * marks the monorepo boundary. The scan lives on the repo's package tree, so
 * the anchor must be a filesystem path — a file: URL is normalized first.
 * @param baseUrl - the loader config's baseUrl (path or file: URL).
 * @returns the repository root directory, or undefined if the walk fails.
 */
function findRepoRoot(baseUrl: string): string | undefined {
  let dir = baseUrl.startsWith('file:') ? fileURLToPath(baseUrl) : baseUrl
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/**
 * Scan the repository for every `dsh.client` web plugin package: the disk-side
 * plugin set that a restarted host would compose into the boot graph. Reading
 * every package manifest on each tick is cheap (a few hundred small JSON
 * files, well under the scan interval).
 * @param root - the repository root.
 * @returns the sorted package names declaring `dsh.client.platform === 'web'`.
 */
function scanPluginSet(root: string): string[] {
  const names: string[] = []
  for (const manifestPath of globSync('packages/*/*/package.json', { cwd: root })) {
    let pkg: { name?: string; dsh?: { client?: { platform?: unknown } } }
    try {
      pkg = JSON.parse(readFileSync(join(root, manifestPath), 'utf8')) as {
        name?: string
        dsh?: { client?: { platform?: unknown } }
      }
    } catch {
      continue // a torn write mid-scan is skipped; the next tick re-reads it
    }
    if (pkg.name !== undefined && pkg.dsh?.client?.platform === 'web') names.push(pkg.name)
  }
  return names.sort()
}

/**
 * Respawn this process with the exact same invocation (detached, inherited
 * stdio): the classic self-restart used by the browser restart prompt. The
 * exit is deferred so the HTTP response has time to flush.
 * @param delayMs - grace period before process.exit.
 */
function respawnHost(delayMs = 150): void {
  // process.argv[0] is the running node binary; argv.slice(1) reproduces the
  // exact CLI (pnpm/tsx flags preserved). Node types allow argv[0] to be
  // absent in some configurations — guard explicitly so the respawn call
  // typechecks under strict null checks.
  const nodeBin = process.argv[0] ?? 'node'
  const child = spawn(nodeBin, process.argv.slice(1), {
    detached: true,
    stdio: 'inherit',
  }) as import('node:child_process').ChildProcess
  child.unref()
  setTimeout(() => process.exit(0), delayMs)
}

interface WatchedBundle {
  path: string
  mtimeMs: number
  size: number
  dirty: boolean
}

/**
 * Mount the dev chain: bundle watches, rebuilt reporting, and the SSE channel.
 * @param ctx - host plugin context carrying clientModuleHost and webServer.
 * @param config - validated {@link Config}.
 */
export function apply(ctx: Context, config: Config): void {
  // schemastery's .default() guarantees the field is set after validation.
  const pollIntervalMs = config.pollIntervalMs as number

  // --- bundle watch: one HMR-owned stat poll ------------------------------
  const watched = new Map<string, WatchedBundle>()

  const rehash = (id: string, watch: WatchedBundle, current: { mtimeMs: number; size: number }): void => {
    try {
      // rebuilt() re-hashes; an unchanged hash stays silent (clientModuleHost
      // fires onRebuilt only on a real rev change).
      ctx.clientModules.rebuilt(id)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        watch.dirty = true
        return
      }
      ctx.logger.warn(error)
    }
    watch.mtimeMs = current.mtimeMs
    watch.size = current.size
    watch.dirty = false
  }

  const watchRow = (id: string, path: string): void => {
    let baseline: { mtimeMs: number; size: number }
    try {
      baseline = statSync(path)
    } catch (error) {
      watched.set(id, { path, mtimeMs: 0, size: 0, dirty: true })
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') ctx.logger.warn(error)
      return
    }
    const watch = { path, mtimeMs: baseline.mtimeMs, size: baseline.size, dirty: false }
    watched.set(id, watch)
    // The module host hashed before publishing the graph. Re-hash immediately
    // after capturing this baseline so a write in between cannot become an
    // already-current baseline paired with a stale graph rev.
    rehash(id, watch, baseline)
  }

  const pollWatches = (): void => {
    for (const [id, watch] of watched) {
      let current: { mtimeMs: number; size: number }
      try {
        current = statSync(watch.path)
      } catch (error) {
        watch.dirty = true
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') ctx.logger.warn(error)
        continue
      }
      if (!watch.dirty && current.mtimeMs === watch.mtimeMs && current.size === watch.size) continue
      // Stat-before-hash preserves a detectable older baseline for writes that
      // land during hashing. Repeated stat changes heal a torn read.
      rehash(id, watch, current)
    }
  }

  // Diff the watch set against the current graph: drop watches for removed
  // rows (or rows whose bundle path moved), add watches for new rows.
  const syncWatches = (): void => {
    const rows = new Map<string, string>()
    for (const row of ctx.clientModules.graph().entries) {
      const path = ctx.clientModules.clientPath(row.id)
      if (path !== undefined) rows.set(row.id, path)
    }
    for (const [id, watch] of watched) {
      if (rows.get(id) === watch.path) continue
      watched.delete(id)
    }
    for (const [id, path] of rows) {
      if (!watched.has(id)) watchRow(id, path)
    }
  }

  ctx.effect(() => {
    // Initial sync covers rows already in the graph; the subscription covers
    // rows arriving later (boot-window activations, including this plugin's
    // own row — no self-exemption, a modules/hmr rebuild rides the same chain).
    syncWatches()
    const unsubscribe = ctx.clientModules.onGraphChanged(syncWatches)
    const timer = setInterval(pollWatches, pollIntervalMs)
    timer.unref()
    return () => {
      unsubscribe()
      clearInterval(timer)
      watched.clear()
    }
  }, 'client-hmr: bundle watches')

  // --- /plugins/events SSE channel ----------------------------------------
  const connections = new Set<ServerResponse>()

  const connect = (res: ServerResponse): void => {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'connection': 'keep-alive',
    })
    // Comment line on open so clients/proxies see a live channel even when
    // no rebuild ever happens; EventSource frame parsing skips it naturally.
    res.write(': connected\n\n')
    res.write(sseData({ type: 'graph', graph: ctx.clientModules.graph() }))
    connections.add(res)
    res.on('close', () => { connections.delete(res) })
  }

  ctx.effect(() => {
    const disposeRoute = ctx.webServer.register({
      kind: 'exact',
      path: EVENTS_ENDPOINT,
      handler: (req, res) => {
        // Named routes match ahead of the carrier's method gate; keep the old
        // global 405 semantics for non-GET hits on this endpoint.
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405)
          res.end()
          return
        }
        connect(res)
      },
    })
    const unsubscribe = ctx.clientModules.onRebuilt((id, rev) => {
      const line = sseData({ type: 'rebuilt', id, rev })
      for (const res of connections) res.write(line)
    })
    return () => {
      unsubscribe()
      disposeRoute()
      for (const res of connections) res.destroy()
      connections.clear()
    }
  }, 'client-hmr: /plugins/events channel')

  // --- plugin-set watch + snapshots (new-plugin restart chain) ------------
  // A brand-new dsh.client web plugin package cannot enter the boot graph
  // without a host restart. Scan the disk-side plugin set and the web-app
  // wiring; on drift, snapshot the current state as a recovery point and
  // broadcast `plugins-changed` so the browser half can prompt for a restart
  // (with a rollback path if that restart breaks the boot).
  const repoRoot = ctx.baseUrl === undefined ? undefined : findRepoRoot(ctx.baseUrl)
  const pluginScanIntervalMs = config.pluginScanIntervalMs as number
  const snapshots = repoRoot === undefined ? undefined : new PluginSnapshotStore(repoRoot)
  let diskPluginSet = new Set<string>()
  let wiringFingerprint = ''
  let lastKnownGoodRefresh = 0

  const broadcast = (frame: PluginsEventFrame): void => {
    const line = sseData(frame)
    for (const res of connections) res.write(line)
  }

  const readWiringFingerprint = (): string => {
    if (repoRoot === undefined) return ''
    let fp = ''
    for (const rel of [
      'packages/bundle/web-app/package.json',
      'packages/bundle/web-app/cordis.patch.yml',
    ]) {
      try {
        const hash = createHash('sha1').update(readFileSync(join(repoRoot, rel))).digest('hex').slice(0, 12)
        fp += `${rel}:${hash};`
      } catch {
        // Missing wiring file contributes nothing (a torn read is skipped).
      }
    }
    return fp
  }

  const scanPluginSetChanges = (): void => {
    if (repoRoot === undefined || snapshots === undefined) return
    const disk = new Set(scanPluginSet(repoRoot))
    const fingerprint = readWiringFingerprint()
    const added = [...disk].filter(n => !diskPluginSet.has(n))
    const removed = [...diskPluginSet].filter(n => !disk.has(n))
    // First scan sets the wiring baseline (the running graph was composed
    // from it); only later wiring edits count as drift.
    const wiringBaseline = wiringFingerprint === ''
    const wiringChanged = fingerprint !== '' && wiringFingerprint !== '' && fingerprint !== wiringFingerprint

    if (added.length === 0 && removed.length === 0 && !wiringChanged) {
      // Stable set: keep the rolling known-good slot fresh, so rollback always
      // points at the last state the running host actually served. Refreshed
      // at most once per scan interval.
      const now = Date.now()
      if (wiringBaseline || now - lastKnownGoodRefresh >= pluginScanIntervalMs) {
        snapshots.create('last known-good plugin set', { knownGood: true })
        lastKnownGoodRefresh = now
      }
      diskPluginSet = disk
      wiringFingerprint = fingerprint
      return
    }

    // Drift detected: snapshot the CURRENT disk state as the pre-restart
    // recovery point, then tell the browser half a restart is required.
    const manifest = snapshots.create(
      `plugin-set change (added: ${added.join(', ') || 'none'}; removed: ${removed.join(', ') || 'none'})`,
      { added, removed },
    )
    snapshots.prune()
    diskPluginSet = disk
    wiringFingerprint = fingerprint
    ctx.logger.info(
      `client-hmr: plugin set changed — added [${added.join(', ')}], removed [${removed.join(', ')}]; `
      + `snapshot "${manifest.id}" saved; restart required to load the new set`,
    )
    broadcast({ type: 'plugins-changed', added, removed, snapshotId: manifest.id })
  }

  ctx.effect(() => {
    scanPluginSetChanges() // baseline (also seeds the known-good slot)
    const timer = setInterval(scanPluginSetChanges, pluginScanIntervalMs)
    timer.unref()
    return () => { clearInterval(timer) }
  }, 'client-hmr: plugin-set watch')

  // --- restart + snapshot endpoints ---------------------------------------
  // Dev tooling endpoints backing the browser restart prompt. The respawn
  // endpoints answer 202 first, then re-execute this process so the next page
  // load re-boots the cordis graph (which is what actually loads new plugins).
  const readJsonBody = (req: IncomingMessage, maxBytes = 1_048_576): Promise<Record<string, unknown>> =>
    new Promise((resolve) => {
      const chunks: Buffer[] = []
      let total = 0
      req.on('data', (chunk: Buffer) => {
        total += chunk.length
        if (total > maxBytes) {
          req.destroy()
          resolve({})
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>)
        } catch {
          resolve({})
        }
      })
      req.on('error', () => resolve({}))
    })

  const json = (res: ServerResponse, status: number, body: unknown): void => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  ctx.effect(() => {
    const disposers: (() => void)[] = []

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: RESTART_ENDPOINT,
      handler: (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end()
          return
        }
        if (repoRoot === undefined) {
          json(res, 500, { ok: false, error: 'no repo root (config baseUrl missing)' })
          return
        }
        json(res, 202, { ok: true, note: 'host respawn scheduled' })
        ctx.logger.info('client-hmr: host restart requested via /plugins/restart-host')
        respawnHost()
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/plugins/snapshot/list',
      handler: (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405)
          res.end()
          return
        }
        if (snapshots === undefined) {
          json(res, 500, { ok: false, error: 'snapshots unavailable' })
          return
        }
        const ids = snapshots.list()
        json(res, 200, {
          ok: true,
          ids,
          knownGood: ids.includes(KNOWN_GOOD_ID) ? snapshots.read(KNOWN_GOOD_ID) : undefined,
        })
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/plugins/snapshot/create',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end()
          return
        }
        if (snapshots === undefined) {
          json(res, 500, { ok: false, error: 'snapshots unavailable' })
          return
        }
        const body = await readJsonBody(req)
        const manifest = snapshots.create(String(body.reason ?? 'manual snapshot'))
        snapshots.prune()
        json(res, 201, { ok: true, snapshot: manifest })
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/plugins/snapshot/restore',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end()
          return
        }
        if (snapshots === undefined || repoRoot === undefined) {
          json(res, 500, { ok: false, error: 'snapshots unavailable' })
          return
        }
        const body = await readJsonBody(req)
        const id = String(body.id ?? '')
        if (id === '') {
          json(res, 400, { ok: false, error: 'missing snapshot id' })
          return
        }
        const manifest = snapshots.read(id)
        if (manifest === undefined) {
          json(res, 404, { ok: false, error: `no snapshot "${id}"` })
          return
        }
        const restored = snapshots.restore(id)
        ctx.logger.info(`client-hmr: snapshot "${id}" restored (${restored.length} files); respawning host`)
        json(res, 202, { ok: true, restored, note: 'host respawn scheduled' })
        respawnHost()
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/plugins/snapshot/remove',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end()
          return
        }
        if (snapshots === undefined) {
          json(res, 500, { ok: false, error: 'snapshots unavailable' })
          return
        }
        const body = await readJsonBody(req)
        const id = String(body.id ?? '')
        if (id === '' || id === KNOWN_GOOD_ID) {
          json(res, 400, { ok: false, error: `cannot remove "${id}"` })
          return
        }
        snapshots.remove(id)
        json(res, 200, { ok: true, removed: id })
      },
    }))

    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'client-hmr: restart + snapshot endpoints')
}
