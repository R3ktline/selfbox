export type MediaPlatform = 'youtube' | 'twitter' | 'soundcloud' | 'spotify' | 'other' | null

export type DownloadMode = 'video' | 'audio'

export interface MediaDownloadOptions {
  mode: DownloadMode
  videoQuality: string
  audioFormat: string
  audioBitrate: string
}

export interface MediaServerHealth {
  ok: boolean
  spotdlOk?: boolean
  version?: string
  spotdlVersion?: string
  ffmpeg?: boolean
  deno?: boolean
  binary?: string
  spotdlBinary?: string
  error?: string
}

export interface ResolvedFile {
  filename: string
  blob: Blob
  label: string
}

export function detectPlatform(url: string): MediaPlatform {
  try {
    const u = new URL(url.trim())
    const host = u.hostname.replace(/^www\./, '').toLowerCase()
    if (host.includes('youtube.com') || host === 'youtu.be' || host === 'music.youtube.com') return 'youtube'
    if (host.includes('twitter.com') || host === 'x.com') return 'twitter'
    if (host.includes('soundcloud.com')) return 'soundcloud'
    if (host.includes('spotify.com')) return 'spotify'
    return 'other'
  } catch {
    return null
  }
}

export function isSpotifyPlaylistLike(url: string): boolean {
  const lower = url.toLowerCase()
  return lower.includes('/playlist/') || lower.includes('/album/') || lower.includes('/artist/')
}

export function isPlaylistLike(url: string): boolean {
  const lower = url.toLowerCase()
  return (
    isSpotifyPlaylistLike(url) ||
    lower.includes('/playlist') ||
    lower.includes('list=') ||
    lower.includes('/album/') ||
    lower.includes('/sets/')
  )
}

export function parseUrlList(text: string): string[] {
  const parts = text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    const key = p.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      out.push(p)
    }
  }
  return out
}

export const PLATFORM_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  twitter: 'Twitter / X',
  soundcloud: 'SoundCloud',
  spotify: 'Spotify',
  other: 'Other',
}

function parseFilename(disposition: string | null): string | null {
  if (!disposition) return null
  const match = disposition.match(/filename="?([^";\n]+)"?/)
  return match?.[1] ?? null
}

export async function checkMediaServer(): Promise<MediaServerHealth> {
  const res = await fetch('/api/media/health')
  return res.json() as Promise<MediaServerHealth>
}

export async function probeUrl(url: string): Promise<number> {
  const res = await fetch('/api/media/probe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  const data = (await res.json()) as { count?: number; error?: string }
  if (!res.ok) throw new Error(data.error ?? 'Probe failed')
  return data.count ?? 0
}

export async function downloadMedia(
  url: string,
  options: MediaDownloadOptions,
): Promise<ResolvedFile[]> {
  const res = await fetch('/api/media/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, ...options }),
  })

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? `Download failed (${res.status})`)
  }

  const blob = await res.blob()
  const filename = parseFilename(res.headers.get('Content-Disposition')) ?? 'download'
  const fileCount = Number(res.headers.get('X-File-Count') ?? '1')

  if (fileCount > 1 || filename.endsWith('.zip') || blob.type.includes('zip')) {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(blob)
    const out: ResolvedFile[] = []
    for (const [name, file] of Object.entries(zip.files)) {
      if (file.dir) continue
      const fileBlob = await file.async('blob')
      out.push({ filename: name, blob: fileBlob, label: name })
    }
    if (out.length === 0) throw new Error('ZIP contained no files')
    return out
  }

  return [{ filename, blob, label: 'main' }]
}
