import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useClipboardPaste } from '../lib/useClipboardPaste'

interface Props {
  accept?: string
  multiple?: boolean
  label: string
  hint?: string
  className?: string
  /** Listen for Ctrl/⌘+V file paste. Default true. */
  paste?: boolean
  onFiles: (files: FileList) => void
  children?: ReactNode
}

export default function Dropzone({
  accept,
  multiple,
  label,
  hint,
  className,
  paste = true,
  onFiles,
  children,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  useEffect(() => {
    const onDrag = (e: globalThis.DragEvent) => {
      if (e.dataTransfer?.types?.includes('Files')) e.preventDefault()
    }
    window.addEventListener('dragover', onDrag)
    window.addEventListener('drop', onDrag)
    return () => {
      window.removeEventListener('dragover', onDrag)
      window.removeEventListener('drop', onDrag)
    }
  }, [])

  useClipboardPaste(onFiles, { accept, enabled: paste, multiple: Boolean(multiple) })

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files)
  }

  return (
    <button
      type="button"
      className={'dropzone' + (over ? ' active' : '') + (className ? ` ${className}` : '')}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => e.target.files && onFiles(e.target.files)}
      />
      {children ?? (
        <>
          <strong>{over ? 'Drop to add' : label}</strong>
          {hint && <span className="meta">{hint}</span>}
        </>
      )}
    </button>
  )
}
