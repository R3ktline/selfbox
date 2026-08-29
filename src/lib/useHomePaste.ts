import { useEffect, useRef } from 'react'
import { getFilesFromClipboardEvent } from './clipboardFiles'
import { pastedTextToFile, toFileList } from './fileStore'

interface Options {
  onFiles: (files: FileList) => void
  onText: (text: string, file: File) => void
}

function isHomeSearchTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false
  return Boolean(document.querySelector('.home-search input')?.contains(target))
}

/**
 * Home-page paste: files are merged like a dropzone; plain text shows text-tool
 * suggestions without touching the search filter input.
 */
export function useHomePaste({ onFiles, onText }: Options): void {
  const onFilesRef = useRef(onFiles)
  const onTextRef = useRef(onText)

  useEffect(() => {
    onFilesRef.current = onFiles
  })

  useEffect(() => {
    onTextRef.current = onText
  })

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isHomeSearchTarget(e.target)) return

      const files = getFilesFromClipboardEvent(e)
      if (files.length > 0) {
        e.preventDefault()
        e.stopImmediatePropagation()
        onFilesRef.current(toFileList(files))
        return
      }

      const text = e.clipboardData?.getData('text/plain')
      if (!text?.trim()) return

      e.preventDefault()
      e.stopImmediatePropagation()
      onTextRef.current(text, pastedTextToFile(text))
    }

    window.addEventListener('paste', onPaste, true)
    return () => window.removeEventListener('paste', onPaste, true)
  }, [])
}
