import { useEffect, useRef, useState } from 'react'
import ToolPage from '../../components/ToolPage'
import { createPreviewUrl, fileToImage, revokePreviewUrl } from '../../lib/images'
import { usePendingFiles } from '../../lib/usePendingFiles'

interface Swatch {
  hex: string
  rgb: [number, number, number]
  count: number
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)
}

function quantize(img: HTMLImageElement, count: number): Swatch[] {
  const c = document.createElement('canvas')
  const size = 100
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0, size, size)
  const data = ctx.getImageData(0, 0, size, size).data
  const buckets: Record<string, { rgb: [number, number, number]; count: number }> = {}
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a < 128) continue
    const r = data[i] & 0xf8
    const g = data[i + 1] & 0xf8
    const b = data[i + 2] & 0xf8
    const key = `${r},${g},${b}`
    if (buckets[key]) {
      buckets[key].count++
      buckets[key].rgb[0] += data[i]
      buckets[key].rgb[1] += data[i + 1]
      buckets[key].rgb[2] += data[i + 2]
    } else {
      buckets[key] = { rgb: [data[i], data[i + 1], data[i + 2]], count: 1 }
    }
  }
  const all = Object.values(buckets)
    .map((b) => ({ rgb: [b.rgb[0] / b.count, b.rgb[1] / b.count, b.rgb[2] / b.count] as [number, number, number], count: b.count }))
    .sort((a, b) => b.count - a.count)

  const palette: Swatch[] = []
  for (const item of all) {
    if (palette.length >= count) break
    const tooClose = palette.some((p) => colorDistance(p.rgb, item.rgb) < 30)
    if (!tooClose) {
      palette.push({ hex: rgbToHex(item.rgb[0], item.rgb[1], item.rgb[2]), rgb: item.rgb, count: item.count })
    }
  }
  return palette
}

export default function ImagePalette() {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [palette, setPalette] = useState<Swatch[]>([])
  const [count, setCount] = useState(6)
  const [picked, setPicked] = useState<Swatch | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pasteHint, setPasteHint] = useState(false)
  const [hexInput, setHexInput] = useState('#4b6bff')
  const fileInput = useRef<HTMLInputElement>(null)
  const sourceImageRef = useRef<HTMLImageElement | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const onPick = async (f: File) => {
    revokePreviewUrl(imageUrl)
    setImageFile(f)
    setImageUrl(createPreviewUrl(f))
    setPalette([])
    setPicked(null)
    setZoom(1)
    const img = await fileToImage(f)
    sourceImageRef.current = img
    setPalette(quantize(img, count))
  }

  usePendingFiles('/image/palette', (pending) => { if (pending[0]) void onPick(pending[0]) })

  const onRecount = async () => {
    const img = sourceImageRef.current
    if (!img) return
    setPalette(quantize(img, count))
  }

  // Paste from clipboard (anywhere on the page)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            onPick(file)
            e.preventDefault()
            setPasteHint(true)
            window.setTimeout(() => setPasteHint(false), 2000)
            return
          }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [count])

  useEffect(() => () => revokePreviewUrl(imageUrl), [imageUrl])

  const onImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return
    const img = imgRef.current
    const rect = img.getBoundingClientRect()
    const x = Math.round(((e.clientX - rect.left) / rect.width) * img.naturalWidth)
    const y = Math.round(((e.clientY - rect.top) / rect.height) * img.naturalHeight)
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const pixel = ctx.getImageData(x, y, 1, 1).data
    const rgb: [number, number, number] = [pixel[0], pixel[1], pixel[2]]
    const swatch: Swatch = { hex: rgbToHex(rgb[0], rgb[1], rgb[2]), rgb, count: 0 }
    setPicked(swatch)
  }

  const onAddPicked = () => {
    if (!picked) return
    setPalette((prev) => {
      if (prev.some((p) => p.hex.toLowerCase() === picked.hex.toLowerCase())) return prev
      return [{ ...picked, count: 1 }, ...prev]
    })
  }

  const onAddHex = () => {
    const hex = hexInput.trim().replace(/^#/, '')
    if (!/^[0-9a-f]{3}$/i.test(hex) && !/^[0-9a-f]{6}$/i.test(hex)) return
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
    const normalized = '#' + full.toLowerCase()
    const rgb: [number, number, number] = [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ]
    setPicked({ hex: normalized, rgb, count: 0 })
    setPalette((prev) =>
      prev.some((p) => p.hex.toLowerCase() === normalized) ? prev : [{ hex: normalized, rgb, count: 1 }, ...prev],
    )
  }

  const copyAll = (format: 'hex' | 'rgb' | 'css') => {
    if (palette.length === 0) return
    let text = ''
    if (format === 'hex') text = palette.map((p) => p.hex).join(', ')
    else if (format === 'rgb') text = palette.map((p) => `rgb(${Math.round(p.rgb[0])}, ${Math.round(p.rgb[1])}, ${Math.round(p.rgb[2])})`).join('\n')
    else text = `:root {\n${palette.map((p, i) => `  --color-${i + 1}: ${p.hex};`).join('\n')}\n}`
    navigator.clipboard?.writeText(text)
  }

  return (
    <ToolPage
      eyebrow="Design"
      title="Color Palette from Image"
      hint="Drop a photo, paste one from your clipboard, or pick colors directly with the eyedropper."
    >
      <section className="col left">
        <div className="panel">
          <h2>Input</h2>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onPick(f)
            }}
            style={{ display: 'none' }}
          />
          {!imageUrl ? (
            <div
              className={'dropzone' + (pasteHint ? ' active' : '')}
              onClick={() => fileInput.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click()
              }}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              <strong>Choose an image, drop one, or paste from clipboard</strong>
              <span className="meta">Click, drag-and-drop, or press Ctrl/⌘ + V anywhere on the page</span>
            </div>
          ) : (
            <>
              <div className="file-info">
                <button type="button" className="btn-link" onClick={() => fileInput.current?.click()}>
                  Replace
                </button>
                <button type="button" className="btn-link" onClick={() => setZoom((z) => Math.min(4, z * 1.25))} disabled={zoom >= 4}>
                  Zoom +
                </button>
                <button type="button" className="btn-link" onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))} disabled={zoom <= 0.5}>
                  Zoom −
                </button>
                <button type="button" className="btn-link" onClick={() => setZoom(1)}>
                  Reset
                </button>
              </div>
              <p className="hint" style={{ marginBottom: 6 }}>
                Click anywhere on the image to pick that color.
              </p>
              <div ref={containerRef} className="palette-image-wrap">
                <img
                  ref={imgRef}
                  className="preview-image palette-image"
                  src={imageUrl}
                  alt="source"
                  onClick={onImageClick}
                  crossOrigin="anonymous"
                  style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
                  draggable={false}
                />
              </div>
            </>
          )}
        </div>

        <div className="panel">
          <h2>Settings</h2>
          <div className="form-grid">
            <label className="field">
              <span>Colors ({count})</span>
              <input type="range" min={3} max={12} value={count} onChange={(e) => setCount(Number(e.target.value))} />
            </label>
          </div>
          <button type="button" className="btn" style={{ marginTop: 12, width: '100%' }} onClick={onRecount} disabled={!imageFile}>
            Regenerate
          </button>
        </div>
      </section>

      <section className="col right">
        {picked && (
          <div className="panel">
            <h2>Picked color</h2>
            <div className="picked-row">
              <span className="palette-swatch" style={{ background: picked.hex, width: 56, height: 56 }} />
              <div className="picked-info">
                <code>{picked.hex.toUpperCase()}</code>
                <code className="meta">
                  {Math.round(picked.rgb[0])}, {Math.round(picked.rgb[1])}, {Math.round(picked.rgb[2])}
                </code>
              </div>
              <div className="row-actions">
                <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(picked.hex.toUpperCase())}>
                  Copy
                </button>
                <button type="button" className="btn primary" onClick={onAddPicked}>
                  Add to palette
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="panel">
          <h2>Add by hex</h2>
          <p className="hint">Type a hex color and press Add to inject it into the palette.</p>
          <div className="hex-input-row">
            <span className="cp-hash">#</span>
            <input
              type="text"
              value={hexInput.replace(/^#/, '')}
              onChange={(e) => setHexInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onAddHex()
              }}
              maxLength={6}
              style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}
            />
            <button type="button" className="btn" onClick={onAddHex}>Add</button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Palette</h2>
            <div className="row-actions">
              <button type="button" className="btn-link" onClick={() => copyAll('hex')}>Copy hex</button>
              <button type="button" className="btn-link" onClick={() => copyAll('rgb')}>Copy rgb</button>
              <button type="button" className="btn-link" onClick={() => copyAll('css')}>Copy CSS</button>
            </div>
          </div>
          {palette.length === 0 ? (
            <p className="hint">Upload an image, paste one, or pick colors directly to start.</p>
          ) : (
            <ul className="palette-list">
              {palette.map((s, i) => (
                <li key={`${s.hex}-${i}`}>
                  <span className="palette-swatch" style={{ background: s.hex }} />
                  <code>{s.hex.toUpperCase()}</code>
                  <code className="meta">
                    {Math.round(s.rgb[0])}, {Math.round(s.rgb[1])}, {Math.round(s.rgb[2])}
                  </code>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => navigator.clipboard?.writeText(s.hex.toUpperCase())}
                  >
                    Copy
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
