import { toFileList } from './fileStore'

function extFromType(type: string): string {
  if (type === 'image/png') return 'png'
  if (type === 'image/jpeg') return 'jpg'
  if (type === 'image/webp') return 'webp'
  if (type === 'image/gif') return 'gif'
  if (type === 'image/svg+xml') return 'svg'
  if (type === 'application/pdf') return 'pdf'
  if (type === 'text/plain') return 'txt'
  if (type === 'application/json') return 'json'
  return 'bin'
}

function namedClipboardFile(file: File): File {
  if (file.name) return file
  const ext = extFromType(file.type)
  return new File([file], `paste-${Date.now()}.${ext}`, {
    type: file.type,
    lastModified: file.lastModified || Date.now(),
  })
}

/** Match a file against an `<input accept>` string (MIME types and extensions). */
export function fileMatchesAccept(file: File, accept?: string): boolean {
  if (!accept || accept.trim() === '' || accept === '*/*') return true
  const tokens = accept
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
  if (tokens.length === 0) return true

  const name = file.name.toLowerCase()
  const type = (file.type || '').toLowerCase()

  return tokens.some((token) => {
    if (token.startsWith('.')) return name.endsWith(token)
    if (token.endsWith('/*')) return type.startsWith(token.slice(0, -1))
    if (token.includes('/')) return type === token
    // Bare extension without a dot (rare)
    return name.endsWith(`.${token}`)
  })
}

/** Collect File objects from a paste event, optionally filtered by accept. */
export function getFilesFromClipboardEvent(e: ClipboardEvent, accept?: string): File[] {
  const out: File[] = []
  const seen = new Set<string>()

  const add = (raw: File | null | undefined) => {
    if (!raw) return
    const file = namedClipboardFile(raw)
    const key = `${file.name}:${file.size}:${file.type}:${file.lastModified}`
    if (seen.has(key)) return
    if (!fileMatchesAccept(file, accept)) return
    seen.add(key)
    out.push(file)
  }

  const items = e.clipboardData?.items
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file') add(item.getAsFile())
    }
  }

  const files = e.clipboardData?.files
  if (files) {
    for (let i = 0; i < files.length; i++) add(files[i])
  }

  return out
}

export function clipboardEventToFileList(e: ClipboardEvent, accept?: string): FileList | null {
  const files = getFilesFromClipboardEvent(e, accept)
  if (files.length === 0) return null
  return toFileList(files)
}
