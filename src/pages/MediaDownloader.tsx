import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import ToolPage from '../components/ToolPage'
import { downloadBlob } from '../lib/images'
import {
  checkMediaServer,
  detectPlatform,
  downloadMedia,
  isPlaylistLike,
  parseUrlList,
  PLATFORM_LABELS,
  type MediaDownloadOptions,
  type MediaPlatform,
  type MediaServerHealth,
} from '../lib/media'
import { useToast } from '../lib/toast'

type JobStatus = 'queued' | 'processing' | 'done' | 'error' | 'skipped'

interface DownloadItem {
  id: string
  sourceUrl: string
  label: string
  platform: MediaPlatform
  status: JobStatus
  message?: string
  filename?: string
  blob?: Blob
}

type DownloadMode = 'video' | 'audio'

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function platformBadge(platform: MediaPlatform): string {
  if (!platform) return 'Invalid URL'
  return PLATFORM_LABELS[platform] ?? platform
}

export default function MediaDownloader() {
  const { push } = useToast()
  const [urlsText, setUrlsText] = useState('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  const [downloadMode, setDownloadMode] = useState<DownloadMode>('video')
  const [videoQuality, setVideoQuality] = useState('1080')
  const [audioFormat, setAudioFormat] = useState('mp3')
  const [audioBitrate, setAudioBitrate] = useState('best')
  const [health, setHealth] = useState<MediaServerHealth | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)
  const [items, setItems] = useState<DownloadItem[]>([])
  const [busy, setBusy] = useState(false)
  const queueRef = useRef<HTMLDivElement>(null)

  const parsedUrls = useMemo(() => parseUrlList(urlsText), [urlsText])
  const doneItems = items.filter((i) => i.status === 'done' && i.blob)
  const errorItems = items.filter((i) => i.status === 'error' && i.message)
  const processingItems = items.filter((i) => i.status === 'processing')
  const queuedItems = items.filter((i) => i.status === 'queued')
  const activeCount = processingItems.length + queuedItems.length
  const hasPlaylist = parsedUrls.some(isPlaylistLike)
  const needsYtDlp = parsedUrls.some((u) => {
    const p = detectPlatform(u)
    return p !== null && p !== 'spotify'
  })
  const needsSpotdl = parsedUrls.some((u) => detectPlatform(u) === 'spotify')
  const canDownload =
    parsedUrls.length > 0 &&
    (!needsYtDlp || health?.ok) &&
    (!needsSpotdl || health?.spotdlOk)

  const downloadOptions: MediaDownloadOptions = useMemo(
    () => ({
      mode: downloadMode,
      videoQuality,
      audioFormat,
      audioBitrate,
    }),
    [downloadMode, videoQuality, audioFormat, audioBitrate],
  )

  const scrollToQueue = () => {
    queueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const refreshHealth = useCallback(async () => {
    setHealthLoading(true)
    try {
      setHealth(await checkMediaServer())
    } catch {
      setHealth({ ok: false, error: 'Media server not reachable — run npm run dev' })
    } finally {
      setHealthLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshHealth()
  }, [refreshHealth])

  const setItem = (id: string, patch: Partial<DownloadItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }

  const processOneUrl = useCallback(
    async (
      sourceUrl: string,
      existingId?: string,
    ): Promise<{ done: number; error: number; skipped: number; errorMessage?: string }> => {
      const platform = detectPlatform(sourceUrl)
      const id = existingId ?? makeId()

      if (!platform) {
        if (existingId) {
          setItem(id, { status: 'error', message: 'Not a valid URL' })
        } else {
          setItems((prev) => [
            ...prev,
            {
              id,
              sourceUrl,
              label: 'Invalid',
              platform: null,
              status: 'error',
              message: 'Not a valid URL',
            },
          ])
        }
        return { done: 0, error: 1, skipped: 0 }
      }

      if (existingId) {
        setItem(id, {
          label: platformBadge(platform),
          platform,
          status: 'processing',
          message: undefined,
        })
      } else {
        setItems((prev) => [
          ...prev,
          {
            id,
            sourceUrl,
            label: platformBadge(platform),
            platform,
            status: 'processing',
          },
        ])
      }

      try {
        const resolved = await downloadMedia(sourceUrl, downloadOptions)

        if (resolved.length === 1) {
          const { filename, blob } = resolved[0]
          setItem(id, { status: 'done', filename, blob, message: undefined })
          return { done: 1, error: 0, skipped: 0 }
        }

        setItems((prev) => {
          const withoutParent = prev.filter((i) => i.id !== id)
          const expanded: DownloadItem[] = resolved.map((r, idx) => ({
            id: `${id}-${idx}`,
            sourceUrl,
            label: `${platformBadge(platform)} · ${r.label}`,
            platform,
            status: 'done',
            filename: r.filename,
            blob: r.blob,
          }))
          return [...withoutParent, ...expanded]
        })
        return { done: resolved.length, error: 0, skipped: 0 }
      } catch (e) {
        const errorMessage = (e as Error).message
        setItem(id, { status: 'error', message: errorMessage })
        return { done: 0, error: 1, skipped: 0, errorMessage }
      }
    },
    [downloadOptions],
  )

  const onDownloadAll = async () => {
    if (!canDownload) {
      if (needsYtDlp && !health?.ok) push('yt-dlp is not ready — install it and restart the dev server', 'error')
      else if (needsSpotdl && !health?.spotdlOk) {
        push('spotDL is not ready — run pip install spotdl', 'error')
      } else {
        push('Paste at least one URL', 'error')
      }
      return
    }

    setBusy(true)

    const jobs = parsedUrls.map((sourceUrl) => ({
      id: makeId(),
      sourceUrl,
      platform: detectPlatform(sourceUrl),
    }))

    setItems(
      jobs.map((job) => ({
        id: job.id,
        sourceUrl: job.sourceUrl,
        label: job.platform ? platformBadge(job.platform) : 'Invalid',
        platform: job.platform,
        status: job.platform ? ('queued' as JobStatus) : ('error' as JobStatus),
        message: job.platform ? undefined : 'Not a valid URL',
      })),
    )

    requestAnimationFrame(() => scrollToQueue())

    const queue = [...jobs]
    const concurrency = 2
    let index = 0
    const totals = { done: 0, error: 0, skipped: 0 }
    let lastErrorMessage = ''

    const worker = async () => {
      while (index < queue.length) {
        const job = queue[index++]
        if (!job.platform) {
          totals.error += 1
          continue
        }
        const result = await processOneUrl(job.sourceUrl, job.id)
        totals.done += result.done
        totals.error += result.error
        totals.skipped += result.skipped
        if (result.errorMessage) lastErrorMessage = result.errorMessage
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()))
      if (totals.done > 0) push(`Finished — ${totals.done} file(s) ready`)
      else if (totals.error > 0) {
        const short = lastErrorMessage.length > 140 ? `${lastErrorMessage.slice(0, 140)}…` : lastErrorMessage
        push(short || 'Download failed', 'error')
        requestAnimationFrame(() => scrollToQueue())
      } else if (totals.skipped > 0) push('All links were skipped', 'info')
    } finally {
      setBusy(false)
    }
  }

  const onDownloadOne = (item: DownloadItem) => {
    if (!item.blob || !item.filename) return
    downloadBlob(item.blob, item.filename)
    push(`Saved ${item.filename}`)
  }

  const onDownloadZip = async () => {
    const ready = items.filter((i) => i.status === 'done' && i.blob && i.filename)
    if (ready.length === 0) return
    setBusy(true)
    try {
      const zip = new JSZip()
      const used = new Set<string>()
      for (const item of ready) {
        let name = item.filename!
        let n = 1
        while (used.has(name)) {
          const dot = name.lastIndexOf('.')
          name = dot > 0 ? `${name.slice(0, dot)}-${n}${name.slice(dot)}` : `${name}-${n}`
          n++
        }
        used.add(name)
        zip.file(name, item.blob!)
      }
      const out = await zip.generateAsync({ type: 'blob' })
      downloadBlob(out, 'media-downloads.zip')
      push(`ZIP with ${ready.length} file(s) downloaded`)
    } catch (e) {
      push((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const statusIcon = (status: JobStatus) => {
    if (status === 'processing') return null
    if (status === 'done') return '✓'
    if (status === 'queued') return '○'
    if (status === 'skipped') return '—'
    return '✕'
  }

  const progressHint =
    processingItems.length > 0
      ? `Fetching ${processingItems.map((i) => i.label).join(', ')}…`
      : queuedItems.length > 0
        ? `Waiting to start ${queuedItems.length} link(s)…`
        : 'Starting download…'

  return (
    <ToolPage
      eyebrow="Media"
      title="Media Downloader"
      hint="YouTube, Twitter/X, and SoundCloud via yt-dlp. Spotify via spotDL (matches tracks on YouTube). Batch links and playlists supported locally."
    >
      <section className="col left">
        <div className="panel">
          <div className="panel-header">
            <h2>Local tools</h2>
            <button type="button" className="btn" disabled={healthLoading} onClick={refreshHealth}>
              {healthLoading ? 'Checking…' : 'Recheck'}
            </button>
          </div>
          {healthLoading ? (
            <p className="hint">Checking yt-dlp and spotDL…</p>
          ) : (
            <ul className="hint-list">
              <li>
                <strong>yt-dlp</strong>{' '}
                {health?.ok ? health.version : 'not found'}
                {!health?.ok && (
                  <>
                    {' — '}
                    <a href="https://github.com/yt-dlp/yt-dlp#installation" target="_blank" rel="noreferrer">
                      install
                    </a>
                  </>
                )}
              </li>
              <li>
                <strong>spotDL</strong>{' '}
                {health?.spotdlOk ? health.spotdlVersion : 'not found'}
                {!health?.spotdlOk && (
                  <>
                    {' — '}
                    <a href="https://github.com/spotDL/spotify-downloader" target="_blank" rel="noreferrer">
                      pip install spotdl
                    </a>
                  </>
                )}
              </li>
              <li>
                <strong>ffmpeg</strong>{' '}
                {health?.ffmpeg ? 'available' : 'not found — needed for video merges and spotDL'}
              </li>
              <li>
                <strong>Deno</strong>{' '}
                {health?.deno ? 'available' : 'not found — recommended for YouTube (fixes many 403 errors)'}
              </li>
            </ul>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Links</h2>
            <span className="hint">{parsedUrls.length} URL(s)</span>
          </div>
          <label className="field">
            <span>One URL per line (batch) · playlist / set links download every entry</span>
            <textarea
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
              placeholder="https://youtube.com/watch?v=…&#10;https://youtube.com/playlist?list=…&#10;https://soundcloud.com/artist/track"
              style={{ minHeight: 160, fontFamily: 'var(--font-mono)', fontSize: 13 }}
              spellCheck={false}
            />
          </label>
          {hasPlaylist && (
            <p className="hint" style={{ marginTop: 8 }}>
              Playlist or album detected — yt-dlp / spotDL will fetch every track in the list.
            </p>
          )}
          <div className="platform-tags" style={{ marginTop: 12 }}>
            {(['youtube', 'twitter', 'soundcloud', 'spotify'] as const).map((p) => (
              <span key={p} className="platform-tag">{PLATFORM_LABELS[p]}</span>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Format</h2>
          <div className="form-grid">
            <label className="field">
              <span>Mode</span>
              <select
                value={downloadMode}
                onChange={(e) => setDownloadMode(e.target.value as DownloadMode)}
              >
                <option value="video">Video + audio</option>
                <option value="audio">Audio only</option>
              </select>
            </label>
            {downloadMode === 'video' && (
              <label className="field">
                <span>Video quality</span>
                <select value={videoQuality} onChange={(e) => setVideoQuality(e.target.value)}>
                  <option value="max">Best available</option>
                  <option value="2160">4K (2160p)</option>
                  <option value="1440">1440p</option>
                  <option value="1080">1080p</option>
                  <option value="720">720p</option>
                  <option value="480">480p</option>
                  <option value="360">360p</option>
                </select>
              </label>
            )}
            <label className="field">
              <span>Audio format</span>
              <select value={audioFormat} onChange={(e) => setAudioFormat(e.target.value)}>
                <option value="mp3">MP3</option>
                <option value="opus">Opus</option>
                <option value="ogg">OGG</option>
                <option value="wav">WAV</option>
                <option value="best">Best</option>
              </select>
            </label>
            <label className="field">
              <span>Audio bitrate</span>
              <select value={audioBitrate} onChange={(e) => setAudioBitrate(e.target.value)}>
                <option value="best">Best available</option>
                <option value="320">320 kbps</option>
                <option value="256">256 kbps</option>
                <option value="128">128 kbps</option>
                <option value="96">96 kbps</option>
                <option value="64">64 kbps</option>
              </select>
            </label>
          </div>
          <div className="row-actions" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn primary"
              disabled={busy || !canDownload}
              onClick={onDownloadAll}
            >
              {busy && <span className="spinner spinner-in-btn" aria-hidden="true" />}
              {busy ? 'Downloading…' : parsedUrls.length > 1 ? `Download all (${parsedUrls.length})` : 'Download'}
            </button>
            {doneItems.length > 1 && (
              <button type="button" className="btn" disabled={busy} onClick={onDownloadZip}>
                Download ZIP
              </button>
            )}
          </div>
          {busy && (
            <div className="download-loading-panel" role="status" aria-live="polite">
              <span className="spinner spinner-lg" aria-hidden="true" />
              <div className="download-loading-text">
                <strong>Downloading</strong>
                <span>{progressHint}</span>
                <span className="hint">yt-dlp / spotDL is running on your machine — large videos can take a minute.</span>
              </div>
            </div>
          )}
          {errorItems.length > 0 && !busy && (
            <div className="warning error download-error-panel" style={{ marginTop: 16 }}>
              <span className="warning-text">
                <strong>{errorItems.length} download failed</strong>
                <ul className="download-error-list">
                  {errorItems.map((item) => (
                    <li key={item.id}>
                      <span className="download-error-label">{item.label}</span>
                      <span className="download-error-msg">{item.message}</span>
                    </li>
                  ))}
                </ul>
              </span>
              <button type="button" className="btn" onClick={scrollToQueue}>
                View in queue
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="col right">
        <div className="panel" ref={queueRef} id="download-queue">
          <div className="panel-header">
            <h2>Queue</h2>
            {busy && activeCount > 0 && (
              <span className="download-queue-badge" role="status">
                <span className="spinner spinner-sm" aria-hidden="true" />
                {activeCount} active
              </span>
            )}
            {doneItems.length > 0 && (
              <button type="button" className="btn" disabled={busy} onClick={onDownloadZip}>
                ZIP all
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="hint">
              Paste links and hit Download. yt-dlp runs on your computer via the dev server — nothing is uploaded to the cloud.
            </p>
          ) : (
            <ul className="download-queue">
              {items.map((item) => (
                <li key={item.id} className={`download-queue-item status-${item.status}`}>
                  <span className="download-queue-icon" aria-hidden="true">
                    {item.status === 'processing' ? (
                      <span className="spinner spinner-sm" aria-label="Downloading" />
                    ) : (
                      statusIcon(item.status)
                    )}
                  </span>
                  <div className="download-queue-body">
                    <span className="download-queue-label">{item.label}</span>
                    <span className="download-queue-url">{item.sourceUrl}</span>
                    {item.filename && item.status === 'done' && (
                      <span className="download-queue-file">{item.filename}</span>
                    )}
                    {item.message && (
                      <span className="download-queue-error">{item.message}</span>
                    )}
                  </div>
                  {item.status === 'done' && item.blob && (
                    <button type="button" className="btn" onClick={() => onDownloadOne(item)}>
                      Save
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <h2>How it works</h2>
          <ul className="hint-list">
            <li><strong>YouTube</strong> — videos, Shorts, Music, playlists (yt-dlp)</li>
            <li><strong>Twitter / X</strong> — videos and GIFs (yt-dlp)</li>
            <li><strong>SoundCloud</strong> — tracks and sets (yt-dlp)</li>
            <li><strong>Spotify</strong> — tracks, albums, playlists (spotDL → YouTube)</li>
          </ul>
          <p className="hint" style={{ marginTop: 12 }}>
            spotDL resolves Spotify metadata and downloads matching audio from YouTube. Only use content you have the right to save.
          </p>
        </div>
      </section>
    </ToolPage>
  )
}
