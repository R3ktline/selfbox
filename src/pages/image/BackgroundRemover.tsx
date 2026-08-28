import { useEffect, useRef, useState } from 'react'
import ToolPage from '../../components/ToolPage'
import {
  canvasToBlob,
  createPreviewUrl,
  downloadBlob,
  fileToImage,
  formatBytes,
  imageToCanvas,
  revokePreviewUrl,
} from '../../lib/images'
import { usePendingFiles } from '../../lib/usePendingFiles'

type Method = 'auto' | 'white' | 'black' | 'green' | 'blue' | 'red' | 'magenta' | 'cyan' | 'yellow' | 'custom'

const PRESET_COLORS: Record<Exclude<Method, 'auto' | 'custom'>, [number, number, number]> = {
  white: [255, 255, 255],
  black: [0, 0, 0],
  green: [0, 177, 64],
  blue: [0, 71, 171],
  red: [222, 38, 38],
  magenta: [220, 38, 168],
  cyan: [6, 182, 212],
  yellow: [234, 179, 8],
}

export default function BackgroundRemover() {
  const [file, setFile] = useState<File | null>(null)
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [resultSize, setResultSize] = useState<number>(0)
  const [originalSize, setOriginalSize] = useState<number>(0)
  const [method, setMethod] = useState<Method>('auto')
  const [customColor, setCustomColor] = useState('#ffffff')
  const [tolerance, setTolerance] = useState(40)
  const [edgeSoftness, setEdgeSoftness] = useState(2)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const sourceImageRef = useRef<HTMLImageElement | null>(null)

  const onPick = async (f: File) => {
    revokePreviewUrl(originalUrl)
    if (resultUrl) URL.revokeObjectURL(resultUrl)
    const url = createPreviewUrl(f)
    setFile(f)
    setOriginalSize(f.size)
    setOriginalUrl(url)
    sourceImageRef.current = await fileToImage(f)
    setResultUrl(null)
  }

  usePendingFiles('/image/background-remover', (pending) => { if (pending[0]) onPick(pending[0]) })

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) onPick(f)
  }

  const detectBg = (img: HTMLImageElement): [number, number, number] => {
    const c = document.createElement('canvas')
    c.width = c.height = 32
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0, 32, 32)
    const corner = ctx.getImageData(1, 1, 1, 1).data
    return [corner[0], corner[1], corner[2]]
  }

  const removeBackground = async () => {
    const img = sourceImageRef.current
    if (!img || !file) return
    setBusy(true)
    try {
      const canvas = imageToCanvas(img)
      const ctx = canvas.getContext('2d')!
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const pixels = data.data

      let target: [number, number, number]
      if (method === 'auto') {
        target = detectBg(img)
      } else if (method === 'custom') {
        const hex = customColor.replace('#', '')
        target = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
      } else {
        target = PRESET_COLORS[method]
      }

      const tol = tolerance
      const softness = edgeSoftness
      const t2 = (tol + softness) ** 2

      for (let i = 0; i < pixels.length; i += 4) {
        const dr = pixels[i] - target[0]
        const dg = pixels[i + 1] - target[1]
        const db = pixels[i + 2] - target[2]
        const d2 = dr * dr + dg * dg + db * db
        if (d2 < tol * tol) {
          pixels[i + 3] = 0
        } else if (d2 < t2) {
          const falloff = 1 - (Math.sqrt(d2) - tol) / softness
          pixels[i + 3] = Math.round(pixels[i + 3] * falloff)
        }
      }

      ctx.putImageData(data, 0, 0)
      const blob = await canvasToBlob(canvas, 'image/png')
      setResultSize(blob.size)
      setResultUrl(URL.createObjectURL(blob))
    } finally {
      setBusy(false)
    }
  }

  const onDownload = () => {
    if (!resultUrl || !file) return
    const base = file.name.replace(/\.[^.]+$/, '')
    fetch(resultUrl)
      .then((r) => r.blob())
      .then((b) => downloadBlob(b, `${base}-no-bg.png`))
  }

  useEffect(() => () => {
    revokePreviewUrl(originalUrl)
    if (resultUrl) URL.revokeObjectURL(resultUrl)
  }, [originalUrl, resultUrl])

  return (
    <ToolPage
      eyebrow="Image"
      title="Background Remover"
      hint="Strip a solid-color background from a photo. Best for product shots, headshots, and screen captures."
    >
      <section className="col left">
        <div className="panel">
          <h2>Input</h2>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            onChange={onFileChange}
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
                <span className="meta">{formatBytes(originalSize)}</span>
                <button type="button" className="btn-link" onClick={() => fileInput.current?.click()}>
                  Replace
                </button>
              </div>
              {originalUrl && <img className="preview-image" src={originalUrl} alt="original" />}
            </>
          )}
        </div>

        <div className="panel">
          <h2>Settings</h2>
          <div className="form-grid">
            <label className="field span-2">
              <span>Background color</span>
              <select value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                <option value="auto">Auto-detect (corner pixel)</option>
                <option value="white">White</option>
                <option value="black">Black</option>
                <option value="green">Green screen</option>
                <option value="blue">Blue</option>
                <option value="red">Red</option>
                <option value="magenta">Magenta</option>
                <option value="cyan">Cyan</option>
                <option value="yellow">Yellow</option>
                <option value="custom">Custom hex</option>
              </select>
            </label>
            {method === 'custom' && (
              <label className="field span-2">
                <span>Custom color</span>
                <input type="text" value={customColor} onChange={(e) => setCustomColor(e.target.value)} />
              </label>
            )}
            <label className="field">
              <span>Tolerance ({tolerance})</span>
              <input type="range" min={0} max={120} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Edge softness ({edgeSoftness})</span>
              <input type="range" min={0} max={20} value={edgeSoftness} onChange={(e) => setEdgeSoftness(Number(e.target.value))} />
            </label>
          </div>
          <button
            type="button"
            className="btn primary"
            style={{ marginTop: 12, width: '100%' }}
            disabled={!file || busy}
            onClick={removeBackground}
          >
            {busy ? 'Processing…' : 'Remove background'}
          </button>
        </div>
      </section>

      <section className="col right">
        <div className="panel">
          <div className="panel-header">
            <h2>Result</h2>
            {resultUrl && (
              <button type="button" className="btn" onClick={onDownload}>
                Download PNG
              </button>
            )}
          </div>
          {resultUrl ? (
            <>
              <div className="checker-bg">
                <img className="preview-image" src={resultUrl} alt="result" />
              </div>
              <p className="hint" style={{ marginTop: 10 }}>
                {formatBytes(originalSize)} → {formatBytes(resultSize)} ({Math.round((1 - resultSize / originalSize) * 100)}% smaller)
              </p>
            </>
          ) : (
            <p className="hint">Choose an image and click "Remove background" to see the result here.</p>
          )}
        </div>
      </section>
    </ToolPage>
  )
}
