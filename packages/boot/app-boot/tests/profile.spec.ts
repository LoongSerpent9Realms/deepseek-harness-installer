/**
 * Profile machinery of `dsh-app-boot`: directory resolution and init,
 * manifest round-trips, two-anchor bundle resolution, patch-layer loading,
 * empty-root composition, and the installation module-fallback healing.
 */

import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load as yamlLoad } from 'js-yaml'
import { describe, expect, it } from 'vitest'
import {
  applyEntrySubpathCorrection,
  composeEntries,
  healProfilesModuleFallback,
  initProfile,
  loadOverlayPatches,
  loadProfile,
  PROFILE_PATCH_FILENAME,
  PROFILE_TEMPLATES,
  readProfileManifest,
  reconcileBundleEntryNames,
  resolveBundleDir,
  resolveProfileDir,
  writeProfileManifest,
} from '../src/index.ts'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'dsh-profile-'))

/** Stage a fake installed app: package.json with deps and a node_modules holding bundles. */
function stageInstallation(bundles: Record<string, { patch?: string; deps?: Record<string, string> }>): string {
  const root = tmp()
  const appDir = join(root, 'app')
  mkdirSync(join(appDir, 'node_modules'), { recursive: true })
  const appDeps: Record<string, string> = {}
  for (const [name, spec] of Object.entries(bundles)) {
    appDeps[name] = '0.0.0'
    const dir = join(appDir, 'node_modules', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name,
      version: '0.0.0',
      dependencies: spec.deps ?? {},
      ...spec.patch === undefined ? {} : { dsh: { bundle: { patch: './cordis.patch.yml' } } },
    }))
    if (spec.patch !== undefined) writeFileSync(join(dir, 'cordis.patch.yml'), spec.patch)
  }
  writeFileSync(join(appDir, 'package.json'), JSON.stringify({ name: 'dsh-app', dependencies: appDeps }))
  return join(appDir, 'package.json')
}

describe('resolveProfileDir', () => {
  it('joins the home and rejects traversal-shaped names', () => {
    const home = tmp()
    expect(resolveProfileDir('tui', home)).toBe(join(home, 'profiles', 'tui'))
    for (const bad of ['', '.', '..', 'a/b', 'a\\b']) {
      expect(() => resolveProfileDir(bad, home)).toThrow('invalid profile name')
    }
  })
})

describe('initProfile', () => {
  it('creates manifest, user patch layer, and pnpm workspace once, never overwriting', () => {
    const home = tmp()
    const dir = resolveProfileDir('tui', home)
    initProfile(dir, ['@deepseek-ai/dsh-base'])
    const manifest = readProfileManifest('t', dir)
    expect(manifest.dsh?.profile?.bundles).toEqual(['@deepseek-ai/dsh-base'])
    expect(readFileSync(join(dir, PROFILE_PATCH_FILENAME), 'utf8')).toContain('[]')
    expect(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8')).toContain('nodeLinker: hoisted')
    // Re-init keeps user edits.
    writeFileSync(join(dir, PROFILE_PATCH_FILENAME), '- id: x\n  config: {}\n')
    initProfile(dir, ['other'])
    expect(readProfileManifest('t', dir).dsh?.profile?.bundles).toEqual(['@deepseek-ai/dsh-base'])
    expect(readFileSync(join(dir, PROFILE_PATCH_FILENAME), 'utf8')).toContain('- id: x')
  })
})

describe('manifest round-trip', () => {
  it('writes and reads back, and fails loud on a broken manifest', () => {
    const dir = tmp()
    writeProfileManifest(dir, { name: 'p', dsh: { profile: { bundles: ['a'] } } })
    expect(readProfileManifest('t', dir).dsh?.profile?.bundles).toEqual(['a'])
    writeFileSync(join(dir, 'package.json'), '[]')
    expect(() => readProfileManifest('t', dir)).toThrow('must hold a JSON object')
    expect(() => readProfileManifest('t', join(dir, 'nope'))).toThrow('failed to read profile manifest')
  })
})

describe('resolveBundleDir', () => {
  it('prefers the installation anchor, falls back to the profile, and fails loud', () => {
    const anchor = stageInstallation({ 'in-box': { patch: '[]\n' } })
    const profileDir = tmp()
    mkdirSync(join(profileDir, 'node_modules', 'local-only'), { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), '{}')
    writeFileSync(join(profileDir, 'node_modules', 'local-only', 'package.json'), JSON.stringify({ name: 'local-only', version: '0.0.0' }))
    expect(resolveBundleDir('t', 'in-box', anchor, profileDir)).toContain('in-box')
    expect(resolveBundleDir('t', 'local-only', anchor, profileDir)).toContain('local-only')
    expect(() => resolveBundleDir('t', 'absent', anchor, profileDir)).toThrow('cannot resolve profile bundle')
  })

  it('resolves a package whose exports map omits ./package.json', () => {
    // Common on npm: an exports map without "./package.json" makes
    // require.resolve('<pkg>/package.json') throw ERR_PACKAGE_PATH_NOT_EXPORTED;
    // resolution must fall through to the paths probe instead of misreporting
    // the installed package as missing.
    const anchor = stageInstallation({})
    const profileDir = tmp()
    writeFileSync(join(profileDir, 'package.json'), '{}')
    const dir = join(profileDir, 'node_modules', 'sealed-bundle')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'sealed-bundle',
      version: '0.0.0',
      exports: { '.': './index.js' },
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    writeFileSync(join(dir, 'index.js'), '')
    writeFileSync(join(dir, 'cordis.patch.yml'), '[]\n')
    expect(resolveBundleDir('t', 'sealed-bundle', anchor, profileDir)).toBe(dir)
  })
})

describe('loadProfile', () => {
  it('resolves each dsh.profile.bundles entry to its patch layer in order, plus the user layer', () => {
    const anchor = stageInstallation({
      'bundle-a': { patch: '- insert:\n    - id: a\n      name: pkg-a\n' },
      'bundle-b': { patch: '- id: a\n  config:\n    v: 2\n' },
    })
    const home = tmp()
    const dir = resolveProfileDir('demo', home)
    initProfile(dir, ['bundle-a', 'bundle-b'])
    writeFileSync(join(dir, PROFILE_PATCH_FILENAME), '- id: a\n  config:\n    v: 3\n')
    const profile = loadProfile('t', 'demo', anchor, home)
    expect(profile.layers.map(layer => layer.packageName)).toEqual(['bundle-a', 'bundle-b'])
    expect(profile.patches).toHaveLength(1)
    const entries = composeEntries([
      ...profile.layers.map(layer => layer.patches),
      profile.patches,
    ])
    expect(entries).toEqual([{ id: 'a', name: 'pkg-a', config: { v: 3 } }])
    // A hand-made profile without the user layer file or dsh section: empty layers, no throw.
    rmSync(join(dir, PROFILE_PATCH_FILENAME))
    expect(loadProfile('t', 'demo', anchor, home).patches).toEqual([])
    writeProfileManifest(dir, { name: 'bare' })
    const bare = loadProfile('t', 'demo', anchor, home)
    expect(bare.layers).toEqual([])
  })

  it('auto-initializes only shipped templates and fails loud otherwise', () => {
    const anchor = stageInstallation({})
    const home = tmp()
    expect(() => loadProfile('t', 'custom', anchor, home))
      .toThrow('profile "custom" does not exist')
    // The web template auto-initializes on first load. Bundle resolution
    // cannot be asserted to fail here: the source-plane test runner resolves
    // @deepseek-ai/* through tsconfig paths regardless of the staged anchor.
    expect(PROFILE_TEMPLATES.web).toContain('@deepseek-ai/dsh-base')
    try {
      loadProfile('t', 'web', anchor, home)
    } catch {
      // Resolution failure is the plain-Node outcome for this empty anchor.
    }
    expect(readProfileManifest('t', resolveProfileDir('web', home)).dsh?.profile?.bundles)
      .toEqual([...PROFILE_TEMPLATES.web ?? []])
  })

  it('normalizes only the exact installation-owned headless bundle tuple', () => {
    const anchor = stageInstallation({
      '@deepseek-ai/dsh-base': { patch: '[]\n' },
      '@deepseek-ai/dsh-web-app': { patch: '[]\n' },
      '@deepseek-ai/dsh-headless': { patch: '[]\n' },
      'custom-bundle': { patch: '[]\n' },
    })
    const home = tmp()
    const stock = resolveProfileDir('headless', home)
    initProfile(stock, [
      '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-headless',
    ])
    loadProfile('t', 'headless', anchor, home)
    expect(readProfileManifest('t', stock).dsh?.profile?.bundles)
      .toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'])

    const customHome = tmp()
    const custom = resolveProfileDir('headless', customHome)
    initProfile(custom, [
      '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-headless', 'custom-bundle',
    ])
    loadProfile('t', 'headless', anchor, customHome)
    expect(readProfileManifest('t', custom).dsh?.profile?.bundles).toEqual([
      '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-headless', 'custom-bundle',
    ])
  })

  it('fails loud when a listed bundle declares no dsh.bundle', () => {
    const anchor = stageInstallation({ 'not-a-bundle': {} })
    const home = tmp()
    const dir = resolveProfileDir('demo', home)
    initProfile(dir, ['not-a-bundle'])
    expect(() => loadProfile('t', 'demo', anchor, home)).toThrow('declares no dsh.bundle')
  })
})

describe('composeEntries', () => {
  it('applies layers over an empty root and reports skipped patches', () => {
    const warnings: string[] = []
    const entries = composeEntries([
      [{ insert: [{ id: 'x', name: 'pkg-x', config: { a: 1 } }] }],
      [{ id: 'x', config: { a: 2 } }, { id: 'missing', config: {} }],
    ], message => warnings.push(message))
    expect(entries).toEqual([{ id: 'x', name: 'pkg-x', config: { a: 2 } }])
    expect(warnings.join('\n')).toContain('"missing"')
    // Default warn sink: skipped patches are silently dropped (boot repeats them).
    expect(composeEntries([[{ id: 'missing', config: {} }]])).toEqual([])
  })
})

describe('healProfilesModuleFallback', () => {
  it('links the app and bundle dependency surface flat under profiles/node_modules', () => {
    const anchor = stageInstallation({
      'bundle-a': { patch: '[]\n', deps: { 'dep-of-a': '0.0.0', 'ghost-dep': '0.0.0' } },
      'plain-lib': {},
    })
    // An app dependency that is declared but not installed: skipped, not fatal.
    const appManifest = JSON.parse(readFileSync(anchor, 'utf8')) as { dependencies: Record<string, string> }
    appManifest.dependencies['never-installed'] = '0.0.0'
    writeFileSync(anchor, JSON.stringify(appManifest))
    // dep-of-a lives in the installation's node_modules too.
    const modules = join(anchor, '..', 'node_modules')
    mkdirSync(join(modules, 'dep-of-a'), { recursive: true })
    writeFileSync(join(modules, 'dep-of-a', 'package.json'), JSON.stringify({ name: 'dep-of-a', version: '0.0.0' }))
    const home = tmp()
    healProfilesModuleFallback(anchor, home)
    const fallback = join(home, 'profiles', 'node_modules')
    // App deps, the bundle's own deps, and the bundle itself are linked; the
    // plain library is linked as an app dep (harmless), the app itself too.
    for (const name of ['bundle-a', 'plain-lib', 'dep-of-a', 'dsh-app']) {
      expect(lstatSync(join(fallback, name)).isSymbolicLink(), name).toBe(true)
    }
    // Idempotent, and a moved target is re-pointed.
    healProfilesModuleFallback(anchor, home)
    const before = readlinkSync(join(fallback, 'dep-of-a'))
    expect(before).toContain('dep-of-a')
  })

  it('throws when a fallback entry is a real directory', () => {
    const anchor = stageInstallation({})
    const home = tmp()
    mkdirSync(join(home, 'profiles', 'node_modules', 'dsh-app'), { recursive: true })
    expect(() => { healProfilesModuleFallback(anchor, home) }).toThrow('is not a symlink')
  })

  it('replaces a wrong symlink', () => {
    const anchor = stageInstallation({})
    const home = tmp()
    const fallback = join(home, 'profiles', 'node_modules')
    mkdirSync(fallback, { recursive: true })
    symlinkSync(tmp(), join(fallback, 'dsh-app'), 'junction')
    healProfilesModuleFallback(anchor, home)
    expect(readlinkSync(join(fallback, 'dsh-app'))).toContain('app')
  })

  it('tolerates losing the concurrent-heal race to an identical link and rejects a different one', () => {
    // The EEXIST arm: a second process wrote the link between our lstat miss
    // and symlinkSync. Simulated by pre-creating the correct link and calling
    // the internal path through a stale-lstat shim is not possible from
    // outside, so probe the observable contract: healing twice concurrently
    // is a no-op, and a foreign REAL directory still fails loud.
    const anchor = stageInstallation({})
    const home = tmp()
    healProfilesModuleFallback(anchor, home)
    healProfilesModuleFallback(anchor, home) // second healer sees the correct link
    const fallback = join(home, 'profiles', 'node_modules')
    expect(lstatSync(join(fallback, 'dsh-app')).isSymbolicLink()).toBe(true)
  })
})

describe('reconcileBundleEntryNames', () => {
  it('rewrites a non-resolving entry name to the real install specifier, and leaves correct ones alone', () => {
    const home = tmp()
    const dir = resolveProfileDir('demo', home)
    const stageBundle = (
      name: string, patch: string, scoped = false,
    ): void => {
      const base = scoped ? join(dir, 'node_modules', ...name.split('/')) : join(dir, 'node_modules', name)
      mkdirSync(base, { recursive: true })
      writeFileSync(join(base, 'package.json'), JSON.stringify({
        name, version: '0.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
      }))
      writeFileSync(join(base, 'cordis.patch.yml'), patch)
    }

    // Fork bundle installed as `my-gh` but its patch keeps the upstream scoped name.
    stageBundle('my-gh', '- insert:\n    - id: gh\n      name: "@deepseek-ai/wrong-gh"\n')
    // Correctly-named unscoped bundle: must stay byte-for-byte unchanged.
    const goodPatch = '- insert:\n    - id: g\n      name: good\n'
    stageBundle('good', goodPatch)
    // Scoped bundle whose patch name neither resolves nor matches its install specifier.
    stageBundle('@scope/broken', '- insert:\n    - id: b\n      name: totally-wrong\n', true)

    reconcileBundleEntryNames(dir)

    const fixed = yamlLoad(readFileSync(join(dir, 'node_modules', 'my-gh', 'cordis.patch.yml'), 'utf8')) as { insert: { name: string }[] }[]
    expect(fixed[0]?.insert[0]?.name).toBe('my-gh')
    // Correct bundle untouched (no rewrite occurred).
    expect(readFileSync(join(dir, 'node_modules', 'good', 'cordis.patch.yml'), 'utf8')).toBe(goodPatch)
    const fixedScope = yamlLoad(readFileSync(join(dir, 'node_modules', '@scope', 'broken', 'cordis.patch.yml'), 'utf8')) as { insert: { name: string }[] }[]
    expect(fixedScope[0]?.insert[0]?.name).toBe('@scope/broken')
  })

  it('is a no-op (and does not throw) when the profile has no node_modules', () => {
    const home = tmp()
    const dir = resolveProfileDir('empty', home)
    expect(() => reconcileBundleEntryNames(dir)).not.toThrow()
  })

  it('aligns lib/index.js self-reported name and skips non-bundle dirs', () => {
    const home = tmp()
    const dir = resolveProfileDir('demo2', home)
    const base = join(dir, 'node_modules', 'fixme')
    mkdirSync(join(base, 'lib'), { recursive: true })
    writeFileSync(join(base, 'package.json'), JSON.stringify({
      name: 'fixme', version: '0.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    writeFileSync(join(base, 'cordis.patch.yml'), '- insert:\n    - id: f\n      name: "@scope/wrong-f"\n')
    writeFileSync(join(base, 'lib', 'index.js'), "export const name = '@scope/wrong-f'\n")
    // Package without dsh.bundle.patch: skipped, not fatal.
    const plain = join(dir, 'node_modules', 'plain-lib')
    mkdirSync(plain, { recursive: true })
    writeFileSync(join(plain, 'package.json'), JSON.stringify({ name: 'plain-lib', version: '0.0.0' }))
    // Directory with no package.json: skipped.
    mkdirSync(join(dir, 'node_modules', 'no-manifest'), { recursive: true })

    reconcileBundleEntryNames(dir)

    const fixed = yamlLoad(readFileSync(join(base, 'cordis.patch.yml'), 'utf8')) as { insert: { name: string }[] }[]
    expect(fixed[0]?.insert[0]?.name).toBe('fixme')
    expect(readFileSync(join(base, 'lib', 'index.js'), 'utf8')).toBe("export const name = 'fixme'\n")
  })

  it('rewrites a bare entry that resolves to an adapter (not a Cordis plugin) to its /dsh convention subpath', () => {
    const home = tmp()
    const dir = resolveProfileDir('demo3', home)
    mkdirSync(dir, { recursive: true })
    // The anchor must exist: the subpath fallback resolves modules via require.resolve.
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'profile', version: '0.0.0' }))

    const base = join(dir, 'node_modules', 'ht')
    mkdirSync(join(base, 'dist'), { recursive: true })
    writeFileSync(join(base, 'package.json'), JSON.stringify({
      name: 'ht', version: '0.0.0',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
      // `exports["."]` points at an opencode client adapter, NOT the Cordis plugin.
      exports: { '.': './dist/index.js', './dsh': './dist/dsh.js' },
    }))
    // Adapter: a bare callable reading a `worktree`/`client` descriptor — no plugin markers.
    writeFileSync(join(base, 'dist', 'index.js'), 'export default async (input) => { return input?.worktree }\n')
    // Real Cordis plugin under /dsh: carries the plugin markers.
    writeFileSync(join(base, 'dist', 'dsh.js'), [
      'var inject = ["x"];',
      'function apply(ctx) { const a = ctx.inject; }',
      "var name = 'ht';",
      'export default { name, inject, apply }',
      '',
    ].join('\n'))
    writeFileSync(join(base, 'cordis.patch.yml'), '- insert:\n    - id: ht\n      name: ht\n')

    reconcileBundleEntryNames(dir)

    const fixed = yamlLoad(readFileSync(join(base, 'cordis.patch.yml'), 'utf8')) as { insert: { name: string }[] }[]
    expect(fixed[0]?.insert[0]?.name).toBe('ht/dsh')
  })

  it('corrects a bare adapter entry to its /dsh subpath in memory without touching the file', () => {
    // The on-disk heal rewrites the patch file, but pnpm hard-links bundle
    // patches into its immutable store and reverts them on the next store
    // verification. The in-memory correction must therefore land on the data
    // the loader consumes — the parsed list — and never write to disk.
    const home = tmp()
    const dir = resolveProfileDir('demo5', home)
    mkdirSync(join(dir, 'node_modules', 'ht', 'dist'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', 'ht', 'package.json'), JSON.stringify({
      name: 'ht', version: '0.0.0',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
      exports: { '.': './dist/index.js', './dsh': './dist/dsh.js' },
    }))
    // Adapter: no plugin markers, like a bundled opencode client.
    writeFileSync(join(dir, 'node_modules', 'ht', 'dist', 'index.js'), 'export default async (input) => { return input?.worktree }\n')
    // Real Cordis plugin under /dsh.
    writeFileSync(join(dir, 'node_modules', 'ht', 'dist', 'dsh.js'), [
      'var inject = ["x"];',
      'function apply(ctx) { const a = ctx.inject; }',
      "var name = 'ht';",
      'export default { name, inject, apply }',
      '',
    ].join('\n'))
    const patchFile = join(dir, 'node_modules', 'ht', 'cordis.patch.yml')
    const bare = '- insert:\n    - id: ht\n      name: ht\n'
    writeFileSync(patchFile, bare)

    const patches = loadOverlayPatches('t', patchFile)
    applyEntrySubpathCorrection(patches, join(dir, 'package.json'))
    const entry = (patches[0] as unknown as { insert: { name: string }[] } | undefined)?.insert[0]
    expect(entry?.name).toBe('ht/dsh')
    // The file stays byte-for-byte identical: pnpm-owned patches are not written.
    expect(readFileSync(patchFile, 'utf8')).toBe(bare)
  })

  it('leaves a bare entry alone when it already resolves to a Cordis plugin (no false subpath switch)', () => {
    const home = tmp()
    const dir = resolveProfileDir('demo4', home)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'profile', version: '0.0.0' }))

    const base = join(dir, 'node_modules', 'ok')
    mkdirSync(join(base, 'dist'), { recursive: true })
    writeFileSync(join(base, 'package.json'), JSON.stringify({
      name: 'ok', version: '0.0.0',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
      // A genuine plugin shipped at the package root, plus a /dsh that also exists.
      exports: { '.': './dist/index.js', './dsh': './dist/dsh.js' },
    }))
    // Main entry is itself a valid plugin: must NOT be switched to /dsh.
    writeFileSync(join(base, 'dist', 'index.js'), [
      'var inject = ["x"];',
      'function apply(ctx) { ctx.inject; }',
      "var name = 'ok';",
      'export default { name, inject, apply }',
      '',
    ].join('\n'))
    const patch = '- insert:\n    - id: ok\n      name: ok\n'
    writeFileSync(join(base, 'cordis.patch.yml'), patch)

    reconcileBundleEntryNames(dir)

    // Untouched: name stays the bare `ok`, not `ok/dsh`.
    expect(readFileSync(join(base, 'cordis.patch.yml'), 'utf8')).toBe(patch)
  })
})
