/**
 * Restart prompt for plugin-set changes.
 *
 * Subscribes to the host's dev SSE channel (`/plugins/events`, the same wire
 * the hmr plugin owns). On a `plugins-changed` frame — a new/removed
 * `dsh.client` web plugin package detected on disk, which cannot enter the
 * boot graph without a host restart — shows a modal with:
 *   - "restart now": respawns the host (or relaunches the desktop shell) and
 *     hard-reloads the page once the host answers again;
 *   - "roll back and restart": restores the last known-good snapshot first
 *     (rewrites the plugin manifests + web-app wiring), then restarts;
 *   - "later": dismisses; the next frame re-shows the prompt.
 *
 * The wire constants are duplicated here on purpose: cross-plugin value
 * imports are forbidden by the client bundle purity gate, and these two
 * literals are the package boundary of the hmr dev protocol.
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import css from './RestartPrompt.module.css'

/** Dev SSE channel the hmr host half broadcasts plugin-set changes on. */
const EVENTS_ENDPOINT = '/plugins/events'
/** Reserved snapshot slot the hmr host keeps fresh while the set is stable. */
const KNOWN_GOOD_ID = 'known-good'

/** The subset of the hmr wire protocol this prompt consumes. */
interface PluginsChangedFrame {
  type: 'plugins-changed'
  added: string[]
  removed: string[]
  snapshotId?: string
}

interface RestartPromptProps {
  /** Locale translate function for the pluginRestart namespace. */
  t: TranslateNS<'pluginRestart'>
}

/** Health check that also works while the host is mid-respawn. */
async function hostAlive(): Promise<boolean> {
  try {
    const res = await fetch(EVENTS_ENDPOINT, { method: 'HEAD' })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Render the restart prompt modal.
 * @param props - the locale seat.
 * @returns the modal while a plugin-set change is pending; null otherwise.
 */
export function RestartPrompt({ t }: RestartPromptProps) {
  const [pending, setPending] = useState<PluginsChangedFrame | null>(null)
  const [knownGood, setKnownGood] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Subscribe to the dev channel; also probe whether a rollback snapshot
  // exists so the rollback action only shows when it can succeed.
  useEffect(() => {
    const source = new EventSource(EVENTS_ENDPOINT)
    const refreshKnownGood = (): void => {
      fetch('/plugins/snapshot/list')
        .then(res => (res.ok ? res.json() as Promise<{ ids: string[] }> : null))
        .then(body => setKnownGood(body !== null && body.ids.includes(KNOWN_GOOD_ID)))
        .catch(() => setKnownGood(false))
    }
    source.addEventListener('message', (event: MessageEvent<string>) => {
      let frame: PluginsChangedFrame
      try {
        frame = JSON.parse(event.data) as PluginsChangedFrame
      } catch {
        return // malformed dev frame: drop loudly is the hmr client's job
      }
      if (frame.type !== 'plugins-changed') return
      setPending(frame)
      setError(null)
      refreshKnownGood()
    })
    return () => { source.close() }
  }, [])

  // Respawn the host (or relaunch the Electron shell), then hard-reload once
  // the host answers again. Polling tolerates the respawn gap.
  const restart = useCallback(async (rollbackTo?: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      // Desktop shell: the preload bridge relaunches the whole app process.
      const shell = (window as { dshApp?: { restart?: () => Promise<void> | void } }).dshApp
      if (shell?.restart !== undefined && rollbackTo === undefined) {
        await shell.restart()
        return
      }
      const body = rollbackTo !== undefined ? JSON.stringify({ id: rollbackTo }) : undefined
      const res = await fetch(
        rollbackTo !== undefined ? '/plugins/snapshot/restore' : '/plugins/restart-host',
        { method: 'POST', headers: { 'content-type': 'application/json' }, ...(body !== undefined ? { body } : {}) },
      )
      if (!res.ok) throw new Error(await res.text())

      // The host respawns itself; reload when it is back up (15s budget).
      const started = Date.now()
      const attempt = async (): Promise<void> => {
        if (await hostAlive()) {
          window.location.reload()
          return
        }
        if (Date.now() - started < 15000) {
          setTimeout(() => void attempt(), 800)
          return
        }
        setBusy(false)
        setError(t('restart.failed'))
      }
      setTimeout(() => void attempt(), 600)
    } catch (reason) {
      setBusy(false)
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [t])

  if (pending === null) return null

  const added = pending.added.length > 0 ? pending.added.join(', ') : t('restart.body.none')
  const removed = pending.removed.length > 0 ? pending.removed.join(', ') : t('restart.body.none')
  const snapshotNote = pending.snapshotId !== undefined
    ? t('restart.snapshot.saved').replace('{id}', pending.snapshotId)
    : t('restart.snapshot.no')

  return (
    <Modal
      open
      onClose={() => { if (!busy) setPending(null) }}
      title={t('restart.title')}
      closeLabel={t('restart.later')}
      footer={
        <div className={css.actions}>
          {knownGood && !busy && (
            <Button
              variant="outline"
              className={css.rollback}
              onClick={() => { void restart(KNOWN_GOOD_ID) }}
            >
              {t('restart.rollback')}
            </Button>
          )}
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => { void restart() }}
          >
            {busy ? t('restart.busy') : t('restart.now')}
          </Button>
        </div>
      }
    >
      <div className={css.body}>
        <p className={css.line}>
          <span className={css.label}>{t('restart.body.added')}</span>
          <span className={css.value}>{added}</span>
        </p>
        <p className={css.line}>
          <span className={css.label}>{t('restart.body.removed')}</span>
          <span className={css.value}>{removed}</span>
        </p>
        <p className={css.note}>{snapshotNote}</p>
        {error !== null && <p className={css.error}>{error}</p>}
      </div>
    </Modal>
  )
}
