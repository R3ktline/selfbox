import { useEffect, useRef, useState } from 'react'
import ToolPage from '../components/ToolPage'
import Dropzone from '../components/Dropzone'
import { downloadBlob, createPreviewUrl, revokePreviewUrl } from '../lib/images'
import { useClipboardPaste } from '../lib/useClipboardPaste'
import { usePendingFiles } from '../lib/usePendingFiles'

const SIZES = [16, 32, 48, 64, 128, 180, 192, 256, 512]
const ICO_SIZES = [16, 32, 48, 64, 128]

async function renderPng(
  src: string,
  size: number,
  padding: number,
  bgColor: string | null,
): Promise<Blob> {
  const img = new Image()
  img.src = src
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Image load failed'))
  })

  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'

  if (bgColor) {
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, size, size)
  }

  const pad = Math.round((padding / 100) * size)
  const inner = size - pad * 2
  ctx.drawImage(img, pad, pad, inner, inner)
  return await new Promise<Blob>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  )
}

async function buildIco(blobs: { size: number; blob: Blob }[]): Promise<Blob> {
  const entries = await Promise.all(
    blobs.map(async ({ size, blob }) => {
      const data = new Uint8Array(await blob.arrayBuffer())
      return { size, data }
    }),
  )
  const headerSize = 6
  const entrySize = 16
  let offset = headerSize + entrySize * entries.length
  const totalSize = offset + entries.reduce((sum, e) => sum + e.data.length, 0)
  const buf = new Uint8Array(totalSize)
  const dv = new DataView(buf.buffer)
  dv.setUint16(0, 0, true)
  dv.setUint16(2, 1, true)
  dv.setUint16(4, entries.length, true)
  let idx = headerSize
  for (const e of entries) {
    const dim = e.size >= 256 ? 0 : e.size
    buf[idx] = dim
    buf[idx + 1] = dim
    buf[idx + 2] = 0
    buf[idx + 3] = 0
    dv.setUint16(idx + 4, 1, true)
    dv.setUint16(idx + 6, 32, true)
    dv.setUint32(idx + 8, e.data.length, true)
    dv.setUint32(idx + 12, offset, true)
    offset += e.data.length
    idx += entrySize
  }
  idx = headerSize + entrySize * entries.length
  for (const e of entries) {
    buf.set(e.data, idx)
    idx += e.data.length
  }
  return new Blob([buf], { type: 'image/x-icon' })
}

function buildWebManifest(name: string): string {
  return JSON.stringify(
    {
      name,
      icons: [
        { src: '/favicon-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/favicon-512x512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    null,
    2,
  )
}

export default function FaviconGenerator() {
  const [source, setSource] = useState<string | null>(null)
  const [fileName, setFileName] = useState('App')
  const [padding, setPadding] = useState(8)
  const [bgColor, setBgColor] = useState<string>('')
  const [previews, setPreviews] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const previewUrls = useRef<string[]>([])

  const revokePreviews = () => {
    previewUrls.current.forEach((u) => URL.revokeObjectURL(u))
    previewUrls.current = []
    setPreviews({})
  }

  useEffect(() => () => {
    revokePreviews()
    revokePreviewUrl(source)
  }, [])

  useEffect(() => {
    if (!source) {
      revokePreviews()
      return
    }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      revokePreviews()
      const next: Record<number, string> = {}
      const urls: string[] = []
      for (const s of SIZES) {
        try {
          const blob = await renderPng(source, s, padding, bgColor || null)
          const url = URL.createObjectURL(blob)
          urls.push(url)
          next[s] = url
        } catch {
          /* skip failed size */
        }
      }
      if (!cancelled) {
        previewUrls.current = urls
        setPreviews(next)
      } else {
        urls.forEach((u) => URL.revokeObjectURL(u))
      }
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [source, padding, bgColor])

  const onPick = async (f: File) => {
    revokePreviewUrl(source)
    setSource(createPreviewUrl(f))
    setFileName(f.name.replace(/\.[^.]+$/, '') || 'App')
  }

  usePendingFiles('/favicon', (pending) => { if (pending[0]) void onPick(pending[0]) })

  useClipboardPaste(
    (files) => {
      const f = files[0]
      if (f) void onPick(f)
    },
    { accept: 'image/svg+xml,image/png,image/jpeg,image/webp', enabled: Boolean(source), multiple: false },
  )

  const renderAt = (size: number) => {
    if (!source) throw new Error('No source')
    return renderPng(source, size, padding, bgColor || null)
  }

  const onDownload = async (size: number) => {
    if (!source) return
    setBusy(true)
    try {
      downloadBlob(await renderAt(size), `favicon-${size}x${size}.png`)
    } finally {
      setBusy(false)
    }
  }

  const onDownloadAll = async () => {
    if (!source) return
    setBusy(true)
    try {
      const zip: Record<string, Blob> = {}
      const icoInputs: { size: number; blob: Blob }[] = []
      for (const s of SIZES) {
        const blob = await renderAt(s)
        zip[`favicon-${s}x${s}.png`] = blob
        if (ICO_SIZES.includes(s)) icoInputs.push({ size: s, blob })
      }
      zip['favicon.ico'] = await buildIco(icoInputs)
      zip['site.webmanifest'] = new Blob([buildWebManifest(fileName)], { type: 'application/json' })
      const { default: JSZip } = await import('jszip')
      const z = new JSZip()
      for (const [name, blob] of Object.entries(zip)) z.file(name, blob)
      downloadBlob(await z.generateAsync({ type: 'blob' }), 'favicons.zip')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolPage
      eyebrow="Dev"
      title="Favicon Generator"
      hint="Drop an SVG or PNG. Get a multi-size PNG bundle, .ico, and site.webmanifest."
    >
      <section className="col left">
        <div className="panel">
          <h2>Source</h2>
          {!source ? (
            <Dropzone
              accept="image/svg+xml,image/png,image/jpeg,image/webp"
              label="Drop, choose, or paste an SVG / PNG"
              hint="Works best with square images · Ctrl/⌘+V to paste"
              onFiles={(files) => {
                const f = files[0]
                if (f) onPick(f)
              }}
            />
          ) : (
            <>
              <div className="file-info">
                <button type="button" className="btn-link" onClick={() => { revokePreviews(); setSource(null) }}>
                  Clear
                </button>
              </div>
              <div className="checker-bg" style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
                <img src={source} alt="source" style={{ maxWidth: 200, maxHeight: 200 }} />
              </div>
            </>
          )}
        </div>

        <div className="panel">
          <h2>Options</h2>
          <div className="form-grid">
            <label className="field">
              <span>App name (manifest)</span>
              <input value={fileName} onChange={(e) => setFileName(e.target.value)} />
            </label>
            <label className="field">
              <span>Padding ({padding}%)</span>
              <input type="range" min={0} max={30} value={padding} onChange={(e) => setPadding(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Background (optional)</span>
              <div className="row-actions">
                <input type="color" value={bgColor || '#ffffff'} onChange={(e) => setBgColor(e.target.value)} />
                <button type="button" className="btn-link" onClick={() => setBgColor('')}>
                  Transparent
                </button>
              </div>
            </label>
          </div>
        </div>
      </section>

      <section className="col right">
        <div className="panel">
          <div className="panel-header">
            <h2>Sizes</h2>
            <button type="button" className="btn primary" onClick={onDownloadAll} disabled={busy || !source}>
              {busy ? 'Building…' : 'Download ZIP'}
            </button>
          </div>
          {source ? (
            <>
              <p className="hint">Rendered previews at each size. Click to download individually.</p>
              <div className="favicon-grid">
                {SIZES.map((s) => (
                  <button key={s} type="button" className="favicon-tile" onClick={() => onDownload(s)} disabled={busy}>
                    {previews[s] ? (
                      <img src={previews[s]} alt="" style={{ width: Math.min(s, 64), height: Math.min(s, 64) }} />
                    ) : (
                      <span className="meta">…</span>
                    )}
                    <span>{s}×{s}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="hint">Upload an image to see size options.</p>
          )}
        </div>
      </section>
    </ToolPage>
  )
}
