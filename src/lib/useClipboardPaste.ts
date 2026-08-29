import { useEffect, useRef } from 'react'
import { getFilesFromClipboardEvent } from './clipboardFiles'
import { toFileList } from './fileStore'

interface Options {
  /** Same syntax as `<input accept>`. */
  accept?: string
  /** When false, the listener is not registered. Default true. */
  enabled?: boolean
  /** When false, only the first matching file is passed through. Default true. */
  multiple?: boolean
}

/**
 * Call `onFiles` when the user pastes file(s) from the clipboard (e.g. a screenshot).
 * Uses capture + stopImmediatePropagation so the most specific mounted handler wins
 * when several accept filters are active on one page.
 */
export function useClipboardPaste(
  onFiles: (files: FileList) => void,
  options: Options = {},
): void {
  const { accept, enabled = true, multiple = true } = options
  const onFilesRef = useRef(onFiles)

  useEffect(() => {
    onFilesRef.current = onFiles
  })

  useEffect(() => {
    if (!enabled) return

    const onPaste = (e: ClipboardEvent) => {
      const files = getFilesFromClipboardEvent(e, accept)
      if (files.length === 0) return
      e.preventDefault()
      e.stopImmediatePropagation()
      onFilesRef.current(toFileList(multiple ? files : [files[0]]))
    }

    window.addEventListener('paste', onPaste, true)
    return () => window.removeEventListener('paste', onPaste, true)
  }, [accept, enabled, multiple])
}
