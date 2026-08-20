/**
 * Drag-drop overlay component: renders when a compatible file/folder drag is
 * detected over the sidebar region. Shows visual feedback and handles the drop
 * to create a workspace.
 */
import { useEffect, useState } from 'react'
import { IconFolderOpenOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import css from './DragDropOverlay.module.css'

interface DragDropOverlayProps {
  /** True while the overlay should be visible. */
  active: boolean
  /** Callback when a valid folder is dropped. */
  onDrop: (path: string) => Promise<void>
  /** Locale translate function. */
  t: TranslateNS<'workspaceDragDrop'>
}

/**
 * Check if a drag event contains file system items (folders/files).
 */
function hasFileSystemItems(event: DragEvent): boolean {
  const items = event.dataTransfer?.items
  if (items === undefined || items.length === 0) return false
  // Check if any item is a file or directory
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item !== undefined && item.kind === 'file') return true
  }
  return false
}

/**
 * Extract the first directory path from a drag event.
 * In Electron, this will be the full path of the dropped folder.
 */
function getDroppedPath(event: DragEvent): string | null {
  const files = event.dataTransfer?.files
  if (files === undefined || files.length === 0) return null

  // In Electron, the first file's path is the dropped folder/file path
  const firstFile = files[0]
  if (firstFile === undefined) return null
  // Try to get the path (Electron exposes this)
  const path = (firstFile as { path?: unknown }).path
  if (typeof path === 'string' && path.length > 0) {
    return path
  }

  // Fallback: use the name (less ideal but works in some contexts)
  return firstFile.name || null
}

/**
 * Render the drag-drop overlay.
 * @param props - component props.
 * @returns the overlay element or null.
 */
export function DragDropOverlay({ active, onDrop, t }: DragDropOverlayProps) {
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!active) {
      setDragOver(false)
      setError(null)
      return
    }

    const handleDragEnter = (event: DragEvent): void => {
      if (hasFileSystemItems(event)) {
        event.preventDefault()
        if (event.dataTransfer !== null) {
          event.dataTransfer.dropEffect = 'copy'
        }
        setDragOver(true)
      }
    }

    const handleDragOver = (event: DragEvent): void => {
      if (hasFileSystemItems(event)) {
        event.preventDefault()
        if (event.dataTransfer !== null) {
          event.dataTransfer.dropEffect = 'copy'
        }
      }
    }

    const handleDragLeave = (event: DragEvent): void => {
      // Only hide if leaving the entire window
      const rect = document.documentElement.getBoundingClientRect()
      if (
        event.clientX <= rect.left ||
        event.clientX >= rect.right ||
        event.clientY <= rect.top ||
        event.clientY >= rect.bottom
      ) {
        setDragOver(false)
      }
    }

    const handleDrop = async (event: DragEvent): Promise<void> => {
      event.preventDefault()
      setDragOver(false)

      if (!hasFileSystemItems(event)) return

      const path = getDroppedPath(event)
      if (path === null) {
        setError(t('drag.invalid.path'))
        return
      }

      try {
        await onDrop(path)
        setError(null)
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : String(reason)
        setError(message)
      }
    }

    document.addEventListener('dragenter', handleDragEnter)
    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('dragleave', handleDragLeave)
    document.addEventListener('drop', handleDrop)

    return () => {
      document.removeEventListener('dragenter', handleDragEnter)
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('dragleave', handleDragLeave)
      document.removeEventListener('drop', handleDrop)
    }
  }, [active, onDrop, t])

  if (!active) return null

  return (
    <div className={`${css.overlay} ${dragOver ? css.active : ''}`}>
      <div className={css.content}>
        <IconFolderOpenOutline16 className={css.icon} size={48} />
        <div className={css.label}>{t('drag.drop.here')}</div>
        <div className={css.hint}>{t('drag.create.workspace')}</div>
        {error !== null && (
          <div className={css.hint} style={{ color: 'var(--dsw-alias-label-error)' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
