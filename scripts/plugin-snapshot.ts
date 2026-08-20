/**
 * Manual plugin-snapshot repair tool (dev): list / create / restore the
 * plugin-set snapshots the hmr host keeps under `.dsh/snapshots/`.
 *
 * Use it when a plugin-set change breaks the web app's boot and the UI
 * restart prompt is unreachable (e.g. the host itself crashed): restore the
 * last known-good snapshot, then re-run `pnpm dsh web`.
 *
 *   pnpm exec tsx scripts/plugin-snapshot.ts list
 *   pnpm exec tsx scripts/plugin-snapshot.ts restore known-good
 *   pnpm exec tsx scripts/plugin-snapshot.ts create --reason "before experiment"
 */
import { resolve } from 'node:path'

/**
 * Minimal shape this tool relies on. Declared locally (instead of importing
 * the client package `@deepseek-ai/dsh-client-hmr`) because the host build
 * runs before the client build, so the package's `.d.ts` is not guaranteed to
 * exist when this script is type-checked. The real implementation is loaded
 * dynamically at runtime.
 */
interface SnapshotManifest {
  knownGood?: boolean
  createdAt: string
  reason: string
  pluginSet: string[]
}

interface SnapshotStore {
  list(): string[]
  read(id: string): SnapshotManifest | undefined
  create(reason: string, opts?: { knownGood?: boolean; added?: string[]; removed?: string[] }): { id: string; pluginSet: string[] }
  restore(id: string): string[]
  remove(id: string): void
}

const repoRoot = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))

async function loadStore(): Promise<SnapshotStore> {
  // Specifier cast to `string` so tsc does not resolve the module at build
  // time; it is resolved (to the built package) when this script actually runs.
  const mod = (await import('@deepseek-ai/dsh-client-hmr' as string)) as {
    PluginSnapshotStore: new (root: string) => SnapshotStore
  }
  return new mod.PluginSnapshotStore(repoRoot)
}

function usage(): never {
  console.log(
    'usage: pnpm exec tsx scripts/plugin-snapshot.ts <list|create|restore|remove> [id] [--reason <text>]',
  )
  process.exit(1)
}

async function main(): Promise<void> {
  const store = await loadStore()
  const [command, arg] = process.argv.slice(2)

  if (command === undefined) usage()

  if (command === 'list') {
    const ids = store.list()
    if (ids.length === 0) {
      console.log('no snapshots yet (the web host creates them while running)')
      process.exit(0)
    }
    for (const id of ids) {
      const manifest = store.read(id)
      const label = manifest === undefined
        ? '(unreadable)'
        : `${manifest.knownGood ? 'known-good' : 'drift'}  ${manifest.createdAt}  ${manifest.reason}`
      console.log(`${id}\t${label}`)
    }
    process.exit(0)
  }

  if (command === 'create') {
    const reasonIndex = process.argv.indexOf('--reason')
    const reason = reasonIndex >= 0 ? process.argv[reasonIndex + 1] ?? 'manual snapshot' : 'manual snapshot'
    const manifest = store.create(reason)
    console.log(`snapshot created: ${manifest.id} (${manifest.pluginSet.length} plugins)`)
    process.exit(0)
  }

  if (command === 'restore') {
    if (arg === undefined) usage()
    const manifest = store.read(arg)
    if (manifest === undefined) {
      console.error(`no snapshot "${arg}" — run list to see available ids`)
      process.exit(1)
    }
    const restored = store.restore(arg)
    console.log(`restored ${restored.length} files from "${arg}" (${manifest.reason})`)
    console.log('next: restart the dev server (pnpm dsh web) to boot the restored plugin set')
    process.exit(0)
  }

  if (command === 'remove') {
    if (arg === undefined) usage()
    store.remove(arg)
    console.log(`removed snapshot "${arg}"`)
    process.exit(0)
  }

  usage()
}

void main()
