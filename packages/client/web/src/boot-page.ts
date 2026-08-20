/**
 * Framework-free boot page and failure report. It remains available when a
 * client plugin fails because React arrives only with the UI renderer.
 * @module @deepseek-ai/dsh-client-web/src/boot-page
 */
import type { LoaderEntryState } from './loader-status.ts'
import css from './boot-page.module.css'

/** Create a div with one module class and optional text. */
function div(className: string | undefined, text?: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = className ?? ''
  if (text !== undefined) el.textContent = text
  return el
}

/**
 * Fallback copy path: write to a hidden, off-screen textarea and run
 * `document.execCommand('copy')`. Kept for environments where the async
 * Clipboard API is unavailable (the boot page may render in an insecure
 * context before the application has registered secure permissions).
 * @param text - The text to copy.
 * @returns Whether the legacy copy path reported success.
 */
function legacyCopy(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-1000px'
  textarea.style.left = '-1000px'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(textarea)
  return ok
}

/** Kernel-owned page mounted below the application's root element. */
export class BootPage {
  private readonly root: HTMLDivElement
  private readonly card: HTMLDivElement
  private readonly wordmark: HTMLDivElement
  private readonly spinner: HTMLDivElement
  private readonly hint: HTMLDivElement
  private readonly states = new Map<string, LoaderEntryState>()
  private readonly active = new Set<string>()
  private total = 0
  private failure: string | undefined

  /**
   * Build and attach the boot page.
   * @param container - Application mount point.
   */
  constructor(container: HTMLElement) {
    this.root = div(css.boot)
    this.root.dataset.dshBoot = ''
    this.card = div(css.card)
    this.wordmark = div(css.wordmark, 'HARNESS')
    this.spinner = div(css.spinner)
    this.spinner.dataset.dshBootSpinner = ''
    this.hint = div(css.hint, 'Loading plugins…')
    this.card.append(this.wordmark, this.spinner, this.hint)
    this.root.append(this.card)
    container.append(this.root)
    this.updateProgress()
  }

  /**
   * Set the number of loader entries represented by the progress arc.
   * @param total - Complete boot roster size.
   */
  setTotal(total: number): void {
    this.total = total
    this.updateProgress()
  }

  /**
   * Project one loader entry's fiber state.
   * @param id - Loader entry name.
   * @param state - Projected fiber state.
   */
  setState(id: string, state: LoaderEntryState): void {
    this.states.set(id, state)
    if (state === 'active') this.active.add(id)
    this.updateProgress()
    this.render()
  }

  /**
   * Display the boot failure report.
   * @param message - Failure report text.
   */
  fail(message: string): void {
    this.failure = message
    this.render()
  }

  /** Detach the page before or after the UI renderer takes the mount point. */
  dispose(): void {
    this.root.remove()
  }

  /** Redraw the state-dependent content below the wordmark. */
  private render(): void {
    const failed = [...this.states].filter(([, state]) => state === 'failed').map(([id]) => id)
    if (this.failure === undefined && failed.length === 0) {
      if (this.spinner.parentElement !== this.card) {
        this.card.replaceChildren(this.wordmark, this.spinner, this.hint)
      }
      return
    }
    const report = div(css.failed)
    report.append(div(css.failedTitle, 'Failed to load plugins'))
    for (const id of failed) report.append(div(css.failedItem, id))
    if (this.failure !== undefined) report.append(div(css.failedItem, this.failure))
    report.append(this.buildCopyButton(failed))
    this.card.replaceChildren(this.wordmark, report)
  }

  /**
   * Build a "Copy" button that places the full failure report on the clipboard
   * and briefly shows a confirmation. The button itself stays unselectable so
   * the surrounding selectable text doesn't pick up the label on a drag.
   * @param failed - Plugin IDs that failed to load.
   * @returns The button element, attached to the report.
   */
  private buildCopyButton(failed: readonly string[]): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = css.copyButton ?? ''
    button.textContent = 'Copy report'
    button.addEventListener('click', () => {
      void this.copyReport(failed, button)
    })
    return button
  }

  /**
   * Copy the full failure report to the clipboard. Falls back to a hidden
   * textarea + execCommand when the async Clipboard API is unavailable
   * (insecure context, missing permission, or restricted editor).
   * @param failed - Plugin IDs that failed to load.
   * @param button - The button to flash on success.
   */
  private async copyReport(failed: readonly string[], button: HTMLButtonElement): Promise<void> {
    const text = this.formatReport(failed)
    let copied = false
    try {
      if (navigator.clipboard?.writeText !== undefined) {
        await navigator.clipboard.writeText(text)
        copied = true
      } else {
        copied = legacyCopy(text)
      }
    } catch {
      copied = legacyCopy(text)
    }
    if (copied) {
      button.dataset.state = 'copied'
      button.textContent = 'Copied'
      window.setTimeout(() => {
        delete button.dataset.state
        button.textContent = 'Copy report'
      }, 1500)
    }
  }

  /** Build a plain-text representation of the failure report for the clipboard. */
  private formatReport(failed: readonly string[]): string {
    const lines: string[] = ['Failed to load plugins']
    for (const id of failed) lines.push(`- ${id}`)
    if (this.failure !== undefined) lines.push(this.failure)
    return lines.join('\n')
  }

  /** Grow the rotating arc monotonically as loader entries activate. */
  private updateProgress(): void {
    const ratio = this.total === 0 ? 0 : Math.min(this.active.size / this.total, 1)
    this.spinner.style.setProperty('--dsh-boot-arc', `${String(Math.round(72 + ratio * 216))}deg`)
  }
}
