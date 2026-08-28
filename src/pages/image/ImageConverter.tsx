import { useEffect, useRef, useState } from 'react'
import ToolPage from '../../components/ToolPage'
import {
  canvasToBlob,
  createPreviewUrl,
  downloadBlob,
  fileToImage,
  formatBytes,
  imageToCanvas,
  isHeicFile,
  revokePreviewUrl,
} from '../../lib/images'
import { mapPool } from '../../lib/async'
import { useToast } from '../../lib/toast'
import { usePendingFiles } from '../../lib/usePendingFiles'

const TARGETS = [
  { value: 'image/png', label: 'PNG' },
  { value: 'image/jpeg', label: 'JPEG' },
  { value: 'image/webp', label: 'WebP' },
] as const

type Target = (typeof TARGETS)[number]['value']
type OutputMode = 'jpeg' | 'png' | 'webp' | 'all'

export default function ImageConverter() {
  const [file, setFile] = useState<File | null>(null)
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [originalSize, setOriginalSize] = useState(0)
  const [results, setResults] = useState<{ type: Target; blob: Blob; url: string }[]>([])
  const [quality, setQuality] = useState(0.92)
  const [outputMode, setOutputMode] = useState<OutputMode>('jpeg')
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const sourceImageRef = useRef<HTMLImageElement | null>(null)
  const resultUrlsRef = useRef<string[]>([])
  const { push } = useToast()

  const revokeResults = () => {
    resultUrlsRef.current.forEach((u) => URL.revokeObjectURL(u))
    resultUrlsRef.current = []
    setResults([])
  }

  useEffect(() => () => {
    revokePreviewUrl(originalUrl)
    revokeResults()
  }, [originalUrl])

  const onPick = async (f: File) => {
    revokePreviewUrl(originalUrl)
    revokeResults()
    sourceImageRef.current = null
    setFile(f)
    setOriginalSize(f.size)
    if (isHeicFile(f)) {
      setOriginalUrl(null)
    } else {
      setOriginalUrl(createPreviewUrl(f))
      sourceImageRef.current = await fileToImage(f)
    }
  }

  usePendingFiles('/image/convert', (pending) => { if (pending[0]) void onPick(pending[0]) })

  const convert = async () => {
    if (!file) return
    setBusy(true)
    try {
      let sourceFile = file
      if (isHeicFile(file)) {
        const { default: heic2any } = await import('heic2any')
        const converted = await heic2any({ blob: file, toType: 'image/png' })
        const blob = Array.isArray(converted) ? converted[0] : converted
        sourceFile = new File([blob], file.name.replace(/\.hei[cf]$/i, '.png'), { type: 'image/png' })
        sourceImageRef.current = await fileToImage(sourceFile)
        const preview = createPreviewUrl(sourceFile)
        revokePreviewUrl(originalUrl)
        setOriginalUrl(preview)
      }

      const img = sourceImageRef.current ?? await fileToImage(sourceFile)
      sourceImageRef.current = img
      const canvas = imageToCanvas(img)
      const targets: Target[] =
        outputMode === 'all'
          ? TARGETS.map((t) => t.value)
          : [
              outputMode === 'jpeg' ? 'image/jpeg' : outputMode === 'png' ? 'image/png' : 'image/webp',
            ]

      revokeResults()
      const blobs = await mapPool(targets, 3, async (type) => {
        const b = await canvasToBlob(canvas, type, quality)
        const url = URL.createObjectURL(b)
        return { type, blob: b, url }
      })
      resultUrlsRef.current = blobs.map((r) => r.url)
      setResults(blobs)
      push('Converted locally')
    } catch (e) {
      push(`Conversion failed: ${e instanceof Error ? e.message : String(e)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const onDownload = (r: { type: Target; blob: Blob }) => {
    if (!file) return
    const base = file.name.replace(/\.[^.]+$/, '')
    const ext = r.type.split('/')[1] === 'jpeg' ? 'jpg' : r.type.split('/')[1]
    downloadBlob(r.blob, `${base}.${ext}`)
  }

  return (
    <ToolPage
      eyebrow="Image"
      title="Image Format Converter"
      hint="Convert HEIC, PNG, JPEG, WebP to any of the standard formats. iPhone HEIC files supported."
    >
      <section className="col left">
        <div className="panel">
          <h2>Input</h2>
          <input
            ref={fileInput}
            type="file"
            accept="image/*,.heic,.heif"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onPick(f)
            }}
            style={{ display: 'none' }}
          />
          {!file ? (
            <button type="button" className="btn primary upload-btn-large" onClick={() => fileInput.current?.click()}>
              Choose an image
            </button>
          ) : (
            <>
              <div className="file-info">
                <strong>{file.name}</strong>
                <span className="meta">
                  {file.type || 'unknown'} · {formatBytes(originalSize)}
                </span>
                <button type="button" className="btn-link" onClick={() => fileInput.current?.click()}>
                  Replace
                </button>
              </div>
              {originalUrl && (
                <img className="preview-image" src={originalUrl} alt="original" />
              )}
              {!originalUrl && isHeicFile(file) && (
                <p className="hint">HEIC file — preview after conversion.</p>
              )}
            </>
          )}
        </div>

        <div className="panel">
          <h2>Settings</h2>
          <div className="form-grid">
            <label className="field">
              <span>Output format</span>
              <select value={outputMode} onChange={(e) => setOutputMode(e.target.value as OutputMode)}>
                <option value="jpeg">JPEG</option>
                <option value="png">PNG</option>
                <option value="webp">WebP</option>
                <option value="all">All formats</option>
              </select>
            </label>
            <label className="field">
              <span>Quality ({Math.round(quality * 100)}%)</span>
              <input type="range" min={0.1} max={1} step={0.05} value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
            </label>
          </div>
          <button
            type="button"
            className="btn primary"
            style={{ marginTop: 12, width: '100%' }}
            disabled={!file || busy}
            onClick={convert}
          >
            {busy ? 'Converting…' : 'Convert'}
          </button>
        </div>
      </section>

      <section className="col right">
        <div className="panel">
          <h2>Output</h2>
          {results.length === 0 ? (
            <p className="hint">Converted images appear here. Each row shows the new format and size.</p>
          ) : (
            <ul className="result-list">
              {results.map((r) => (
                <li key={r.type}>
                  <img src={r.url} alt={r.type} />
                  <div className="result-info">
                    <strong>{r.type.split('/')[1].toUpperCase()}</strong>
                    <div className="meta">{formatBytes(r.blob.size)}</div>
                  </div>
                  <button type="button" className="btn" onClick={() => onDownload(r)}>
                    Download
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </ToolPage>
  )
}
