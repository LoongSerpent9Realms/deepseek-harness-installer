/**
 * Plugin-set snapshot store (dev tooling, node half).
 *
 * A snapshot is a point-in-time copy of everything that defines the plugin
 * set the web app boots from: every `dsh.client` web plugin package's
 * manifest plus the web-app bundle's wiring (package.json dependency and
 * cordis.patch.yml plugin row). Restoring a snapshot rewrites those files,
 * so the next restart composes the old plugin set — the rollback path for a
 * restart that breaks the boot.
 *
 * Layout under `<repoRoot>/.dsh/snapshots/<id>/`:
 *   manifest.json   — metadata: id, createdAt, reason, pluginSet, knownGood
 *   files/          — mirror of the captured files, paths relative to repo root
 *
 * The known-good slot (`id === 'known-good'`) is overwritten by the hmr host
 * whenever a scan finds the disk plugin set stable: it is always the last
 * state the running host actually served. Everything else keeps its id.
 */
import {
  copyFileSync, existsSync, globSync, mkdirSync, readdirSync, rmSync, writeFileSync,
  readFileSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'

/** Snapshot metadata, persisted as manifest.json inside the snapshot dir. */
export interface SnapshotManifest {
  /** Snapshot id: the directory name (or the reserved 'known-good' slot). */
  id: string
  /** ISO timestamp of creation. */
  createdAt: string
  /** Why the snapshot was taken (human-readable, shown in the dialog). */
  reason: string
  /** The captured plugin package names (the state this snapshot restores). */
  pluginSet: string[]
  /** Plugin packages that appeared in this change (drift snapshots only). */
  added?: string[]
  /** Plugin packages that disappeared in this change (drift snapshots only). */
  removed?: string[]
  /** True for the rolling last-known-good slot. */
  knownGood?: boolean
}

/** One captured file: repo-relative path + absolute source. */
interface SnapshotFile {
  rel: string
  abs: string
}

/** Reserved id of the rolling last-known-good slot. */
export const KNOWN_GOOD_ID = 'known-good'

/** Round up a random suffix for snapshot ids (no crypto needed). */
function rand4(): string {
  return Math.random().toString(36).slice(2, 6)
}

/** `yyyyMMdd-HHmmss` local-time stamp for snapshot ids. */
function stamp(): string {
  const d = new Date()
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** readdirSync wrapper returning [] on a missing dir. */
function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

/** Recursively list repo-relative file paths under a directory. */
function walkFiles(dir: string, base = dir): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkFiles(abs, base))
    else out.push(relative(base, abs))
  }
  return out
}

/**
 * Snapshot store rooted at the repository root. File copies are small JSON
 * writes; a torn read is simply skipped by the next scan or retried by the
 * caller.
 */
export class PluginSnapshotStore {
  constructor(private readonly root: string) {}

  private snapshotsDir(): string {
    return join(this.root, '.dsh', 'snapshots')
  }

  /** Absolute path of one snapshot dir. */
  snapshotDir(id: string): string {
    return join(this.snapshotsDir(), id)
  }

  /** Every snapshot id on disk, newest first (known-good sorts last). */
  list(): string[] {
    return readdirSafe(this.snapshotsDir()).sort((a, b) => {
      if (a === KNOWN_GOOD_ID) return 1
      if (b === KNOWN_GOOD_ID) return -1
      return b.localeCompare(a)
    })
  }

  /** Read one snapshot's manifest (undefined if absent or unreadable). */
  read(id: string): SnapshotManifest | undefined {
    try {
      const raw = readFileSync(join(this.snapshotDir(id), 'manifest.json'), 'utf8')
      return JSON.parse(raw) as SnapshotManifest
    } catch {
      return undefined
    }
  }

  /**
   * Capture the plugin-set-defining files. Overwrites the snapshot dir (so the
   * known-good slot refreshes in place).
   * @param reason - why this snapshot was taken.
   * @param options - knownGood marks the rolling slot; added/removed describe
   * the drift that triggered the snapshot.
   * @returns the created snapshot manifest.
   */
  create(reason: string, options: { knownGood?: boolean; added?: string[]; removed?: string[] } = {}): SnapshotManifest {
    const files = this.collectFiles()
    const id = options.knownGood === true ? KNOWN_GOOD_ID : `${stamp()}-${rand4()}`
    const dir = this.snapshotDir(id)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(join(dir, 'files'), { recursive: true })

    const pluginSet = files
      .map(f => this.pluginNameOf(f.rel))
      .filter((n): n is string => n !== undefined)
      .sort()
    const added = options.added !== undefined && options.added.length > 0 ? options.added : undefined
    const removed = options.removed !== undefined && options.removed.length > 0 ? options.removed : undefined
    const knownGood = options.knownGood === true
    const manifest: SnapshotManifest = { id, createdAt: new Date().toISOString(), reason, pluginSet }
    if (added !== undefined) manifest.added = added
    if (removed !== undefined) manifest.removed = removed
    if (knownGood) manifest.knownGood = true

    for (const file of files) {
      const target = join(dir, 'files', file.rel)
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(file.abs, target)
    }
    writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    return manifest
  }

  /**
   * Restore one snapshot: rewrite every captured file to its original path.
   * Purely additive — nothing is deleted, so the (possibly broken) current
   * plugin set survives in place until the user replaces it.
   * @param id - snapshot id to restore.
   * @returns the list of restored repo-relative paths.
   */
  restore(id: string): string[] {
    const dir = this.snapshotDir(id)
    const filesDir = join(dir, 'files')
    if (!existsSync(filesDir)) throw new Error(`plugin-snapshot: no files in snapshot "${id}"`)
    const restored: string[] = []
    for (const rel of walkFiles(filesDir)) {
      const target = join(this.root, rel)
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(join(filesDir, rel), target)
      restored.push(rel)
    }
    return restored
  }

  /** Delete one snapshot (the known-good slot excluded — it is self-managed). */
  remove(id: string): void {
    if (id === KNOWN_GOOD_ID) return
    rmSync(this.snapshotDir(id), { recursive: true, force: true })
  }

  /** Prune drift snapshots down to the newest `keep` (known-good untouched). */
  prune(keep = 20): void {
    for (const id of this.list().filter(id => id !== KNOWN_GOOD_ID).slice(keep)) this.remove(id)
  }

  /** Derive the plugin package name from a captured repo-relative path. */
  private pluginNameOf(rel: string): string | undefined {
    const m = rel.match(/^packages\/[^/]+\/([^/]+)\/package\.json$/)
    if (m === undefined) return undefined
    try {
      const pkg = JSON.parse(readFileSync(join(this.root, rel), 'utf8')) as { name?: string; dsh?: unknown }
      return pkg.name
    } catch {
      return undefined
    }
  }

  /** The file set that defines the plugin set: web plugin manifests + wiring. */
  private collectFiles(): SnapshotFile[] {
    const files: SnapshotFile[] = []
    // The web-app bundle's wiring: its dependency declaration and the cordis
    // patch that lists which plugins compose the web profile.
    for (const rel of [
      'packages/bundle/web-app/package.json',
      'packages/bundle/web-app/cordis.patch.yml',
    ]) {
      const abs = join(this.root, rel)
      if (existsSync(abs)) files.push({ rel, abs })
    }
    // Every dsh.client web plugin package manifest.
    for (const manifestPath of globSync('packages/*/*/package.json', { cwd: this.root })) {
      const abs = join(this.root, manifestPath)
      try {
        const pkg = JSON.parse(readFileSync(abs, 'utf8')) as { dsh?: { client?: { platform?: unknown } } }
        if (pkg.dsh?.client?.platform !== 'web') continue
      } catch {
        continue
      }
      files.push({ rel: manifestPath, abs })
    }
    return files
  }
}
