import { useRef, useState } from 'react'
import imageCompression from 'browser-image-compression'
import ToolPage from '../../components/ToolPage'
import Dropzone from '../../components/Dropzone'
import { downloadBlob, formatBytes } from '../../lib/images'
import { mapPool } from '../../lib/async'
import { useToast } from '../../lib/toast'
import { toFileList } from '../../lib/fileStore'
import { useClipboardPaste } from '../../lib/useClipboardPaste'
import { usePendingFiles } from '../../lib/usePendingFiles'

interface Result {
  name: string
  originalSize: number
  compressedSize: number
  url: string
  blob: Blob
  type: string
}

export default function ImageCompressor() {
  const [files, setFiles] = useState<File[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [maxSizeMB, setMaxSizeMB] = useState(1)
  const [maxWidthOrHeight, setMaxWidthOrHeight] = useState(2048)
  const [useWebWorker, setUseWebWorker] = useState(true)
  const [outputType, setOutputType] = useState<'auto' | 'image/jpeg' | 'image/png' | 'image/webp'>('auto')
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const { push } = useToast()

  const onPick = (list: FileList | null) => {
    if (!list) return
    const arr = Array.from(list).filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|avif|heic)$/i.test(f.name))
    if (arr.length === 0) {
      push('Drop image files (JPEG, PNG, WebP…)', 'error')
      return
    }
    setFiles(arr)
    setResults([])
  }

  usePendingFiles('/image/compressor', (pending) => onPick(toFileList(pending)))

  useClipboardPaste(onPick, { accept: 'image/*', enabled: files.length > 0, multiple: true })

  const compressAll = async () => {
    if (files.length === 0) return
    setBusy(true)
    try {
      const out = await mapPool(files, 3, async (file) => {
        const options = {
          maxSizeMB,
          maxWidthOrHeight,
          useWebWorker,
          fileType: outputType === 'auto' ? undefined : outputType,
          initialQuality: 0.85,
        }
        const blob = await imageCompression(file, options)
        return {
          name: file.name,
          originalSize: file.size,
          compressedSize: blob.size,
          url: URL.createObjectURL(blob),
          blob,
          type: blob.type,
        }
      })
      setResults(out)
      push(`Compressed ${out.length} image${out.length === 1 ? '' : 's'}`)
    } catch (e) {
      push(`Compression failed: ${e instanceof Error ? e.message : String(e)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const onDownloadOne = (r: Result) => {
    const base = r.name.replace(/\.[^.]+$/, '')
    const ext = r.type.split('/')[1] || 'jpg'
    downloadBlob(r.blob, `${base}-min.${ext}`)
  }

  return (
    <ToolPage
      eyebrow="Image"
      title="Image Compressor"
      hint="Shrink images to a target file size. Runs locally, your photos never leave the browser."
    >
      <section className="col left">
        <div className="panel">
          <h2>Input</h2>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => onPick(e.target.files)}
            style={{ display: 'none' }}
          />
          {!files.length ? (
            <Dropzone
              accept="image/*"
              multiple
              label="Drop, choose, or paste images"
              hint="JPEG, PNG, WebP, GIF — Ctrl/⌘+V to paste"
              onFiles={onPick}
            />
          ) : (
            <>
              <div className="file-info">
                <strong>{files.length} image{files.length !== 1 ? 's' : ''}</strong>
                <span className="meta">{formatBytes(files.reduce((a, f) => a + f.size, 0))} total</span>
                <button type="button" className="btn-link" onClick={() => fileInput.current?.click()}>
                  Replace
                </button>
              </div>
            </>
          )}
        </div>

        <div className="panel">
          <h2>Settings</h2>
          <div className="form-grid">
            <label className="field">
              <span>Target size (MB)</span>
              <input type="number" min={0.05} max={20} step={0.1} value={maxSizeMB} onChange={(e) => setMaxSizeMB(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Max dimension (px)</span>
              <input type="number" min={200} max={8000} step={100} value={maxWidthOrHeight} onChange={(e) => setMaxWidthOrHeight(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Output format</span>
              <select value={outputType} onChange={(e) => setOutputType(e.target.value as 'auto' | 'image/jpeg' | 'image/png' | 'image/webp')}>
                <option value="auto">Keep original</option>
                <option value="image/jpeg">JPEG</option>
                <option value="image/webp">WebP</option>
                <option value="image/png">PNG</option>
              </select>
            </label>
            <label className="field check">
              <input type="checkbox" checked={useWebWorker} onChange={(e) => setUseWebWorker(e.target.checked)} />
              <span>Use web worker (faster, no UI freeze)</span>
            </label>
          </div>
          <button
            type="button"
            className="btn primary"
            style={{ marginTop: 12, width: '100%' }}
            disabled={files.length === 0 || busy}
            onClick={compressAll}
          >
            {busy ? 'Compressing…' : `Compress ${files.length || ''} image${files.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </section>

      <section className="col right">
        <div className="panel">
          <h2>Results</h2>
          {results.length === 0 ? (
            <p className="hint">Results appear here after compression.</p>
          ) : (
            <ul className="result-list">
              {results.map((r) => {
                const saved = Math.round((1 - r.compressedSize / r.originalSize) * 100)
                return (
                  <li key={r.name}>
                    <img src={r.url} alt={r.name} />
                    <div className="result-info">
                      <strong>{r.name}</strong>
                      <div className="meta">
                        {formatBytes(r.originalSize)} → <strong>{formatBytes(r.compressedSize)}</strong> ({saved >= 0 ? `−${saved}%` : `+${-saved}%`})
                      </div>
                    </div>
                    <button type="button" className="btn" onClick={() => onDownloadOne(r)}>
                      Download
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </ToolPage>
  )
}
