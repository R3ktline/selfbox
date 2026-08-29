import { useEffect, useRef, useState } from 'react'
import ToolPage from '../../components/ToolPage'
import Dropzone from '../../components/Dropzone'
import {
  canvasToBlob,
  createPreviewUrl,
  downloadBlob,
  fileToImage,
  formatBytes,
  revokePreviewUrl,
} from '../../lib/images'
import { useClipboardPaste } from '../../lib/useClipboardPaste'
import { usePendingFiles } from '../../lib/usePendingFiles'

type FitMode = 'fit' | 'fill' | 'stretch'

export default function ImageResizer() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [naturalW, setNaturalW] = useState(0)
  const [naturalH, setNaturalH] = useState(0)
  const [width, setWidth] = useState(800)
  const [height, setHeight] = useState(600)
  const [lockAspect, setLockAspect] = useState(true)
  const [mode, setMode] = useState<FitMode>('fit')
  const [format, setFormat] = useState<'image/png' | 'image/jpeg' | 'image/webp'>('image/png')
  const [quality, setQuality] = useState(0.92)
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 1, h: 1 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, crop: crop })
  const previewBox = useRef<HTMLDivElement>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [resultSize, setResultSize] = useState(0)
  const [busy, setBusy] = useState(false)
  const sourceImageRef = useRef<HTMLImageElement | null>(null)

  const onPick = async (f: File) => {
    if (preview) revokePreviewUrl(preview)
    const url = createPreviewUrl(f)
    setFile(f)
    setPreview(url)
    sourceImageRef.current = await fileToImage(f)
    const img = sourceImageRef.current
    setNaturalW(img.naturalWidth)
    setNaturalH(img.naturalHeight)
    setWidth(img.naturalWidth)
    setHeight(img.naturalHeight)
    setCrop({ x: 0, y: 0, w: 1, h: 1 })
    if (resultUrl) URL.revokeObjectURL(resultUrl)
    setResultUrl(null)
  }

  usePendingFiles('/image/resize', (pending) => { if (pending[0]) void onPick(pending[0]) })

  useClipboardPaste(
    (files) => {
      const f = files[0]
      if (f) void onPick(f)
    },
    { accept: 'image/*', enabled: Boolean(preview), multiple: false },
  )

  const onWidthChange = (w: number) => {
    setWidth(w)
    if (lockAspect && naturalW > 0) setHeight(Math.round((w / naturalW) * naturalH))
  }

  const onHeightChange = (h: number) => {
    setHeight(h)
    if (lockAspect && naturalH > 0) setWidth(Math.round((h / naturalH) * naturalW))
  }

  const render = async () => {
    const img = sourceImageRef.current
    if (!img || !file) return
    setBusy(true)
    try {
      const c = document.createElement('canvas')
      c.width = width
      c.height = height
      const ctx = c.getContext('2d')!
      const sx = Math.round(crop.x * img.naturalWidth)
      const sy = Math.round(crop.y * img.naturalHeight)
      const sw = Math.round(crop.w * img.naturalWidth)
      const sh = Math.round(crop.h * img.naturalHeight)

      if (mode === 'stretch') {
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height)
      } else if (mode === 'fit') {
        const scale = Math.min(width / sw, height / sh)
        const dw = sw * scale
        const dh = sh * scale
        const dx = (width - dw) / 2
        const dy = (height - dh) / 2
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
      } else {
        const scale = Math.max(width / sw, height / sh)
        const dw = sw * scale
        const dh = sh * scale
        const dx = (width - dw) / 2
        const dy = (height - dh) / 2
        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
      }

      const blob = await canvasToBlob(c, format, format === 'image/png' ? undefined : quality)
      if (resultUrl) URL.revokeObjectURL(resultUrl)
      const url = URL.createObjectURL(blob)
      setResultUrl(url)
      setResultSize(blob.size)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!file) return
    const t = window.setTimeout(render, 350)
    return () => window.clearTimeout(t)
  }, [file, width, height, mode, crop, format, quality])

  useEffect(() => () => {
    if (preview) revokePreviewUrl(preview)
    if (resultUrl) URL.revokeObjectURL(resultUrl)
  }, [preview, resultUrl])

  const onCropPointerDown = (e: React.PointerEvent) => {
    if (!previewBox.current) return
    const rect = previewBox.current.getBoundingClientRect()
    const nx = (e.clientX - rect.left) / rect.width
    const ny = (e.clientY - rect.top) / rect.height
    dragStart.current = { x: nx, y: ny, crop: { ...crop } }
    setDragging(true)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onCropPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !previewBox.current) return
    const rect = previewBox.current.getBoundingClientRect()
    const nx = (e.clientX - rect.left) / rect.width
    const ny = (e.clientY - rect.top) / rect.height
    const dx = nx - dragStart.current.x
    const dy = ny - dragStart.current.y
    const c = dragStart.current.crop
    setCrop({
      x: Math.max(0, Math.min(1 - c.w, c.x + dx)),
      y: Math.max(0, Math.min(1 - c.h, c.y + dy)),
      w: c.w,
      h: c.h,
    })
  }

  const ext = format === 'image/png' ? 'png' : format === 'image/webp' ? 'webp' : 'jpg'

  return (
    <ToolPage eyebrow="Image" title="Image Resize & Crop" hint="Resize, crop, and export images with live preview.">
      <section className="col left">
        <div className="panel">
          <h2>Source</h2>
          {!preview ? (
            <Dropzone accept="image/*" label="Drop, choose, or paste an image" hint="Ctrl/⌘+V to paste" onFiles={(files: FileList) => { const f = files[0]; if (f) onPick(f) }} />
          ) : (
            <>
              <div className="file-info">
                <strong>{file?.name}</strong>
                <span className="meta">{naturalW}×{naturalH}</span>
              </div>
              <div
                ref={previewBox}
                className="crop-preview-box"
                onPointerDown={onCropPointerDown}
                onPointerMove={onCropPointerMove}
                onPointerUp={() => setDragging(false)}
                onPointerLeave={() => setDragging(false)}
              >
                <img src={preview} alt="source" className="crop-preview-img" />
                <div
                  className="crop-overlay"
                  style={{
                    left: `${crop.x * 100}%`,
                    top: `${crop.y * 100}%`,
                    width: `${crop.w * 100}%`,
                    height: `${crop.h * 100}%`,
                  }}
                />
              </div>
              <p className="hint">Drag the crop region to reposition. Adjust size with sliders below.</p>
            </>
          )}
        </div>
        {preview && (
          <div className="panel">
            <h2>Output</h2>
            <div className="form-grid">
              <label className="field">
                <span>Width ({width}px)</span>
                <input type="number" value={width} min={1} max={8192} onChange={(e) => onWidthChange(Number(e.target.value))} />
              </label>
              <label className="field">
                <span>Height ({height}px)</span>
                <input type="number" value={height} min={1} max={8192} onChange={(e) => onHeightChange(Number(e.target.value))} />
              </label>
              <label className="field check">
                <input type="checkbox" checked={lockAspect} onChange={(e) => setLockAspect(e.target.checked)} />
                <span>Lock aspect ratio</span>
              </label>
              <label className="field">
                <span>Fit mode</span>
                <select value={mode} onChange={(e) => setMode(e.target.value as FitMode)}>
                  <option value="fit">Fit (letterbox)</option>
                  <option value="fill">Fill (crop to cover)</option>
                  <option value="stretch">Stretch</option>
                </select>
              </label>
              <label className="field">
                <span>Crop width ({Math.round(crop.w * 100)}%)</span>
                <input type="range" min={0.1} max={1} step={0.01} value={crop.w} onChange={(e) => setCrop((c) => ({ ...c, w: Number(e.target.value) }))} />
              </label>
              <label className="field">
                <span>Crop height ({Math.round(crop.h * 100)}%)</span>
                <input type="range" min={0.1} max={1} step={0.01} value={crop.h} onChange={(e) => setCrop((c) => ({ ...c, h: Number(e.target.value) }))} />
              </label>
              <label className="field">
                <span>Format</span>
                <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
                  <option value="image/png">PNG</option>
                  <option value="image/jpeg">JPEG</option>
                  <option value="image/webp">WebP</option>
                </select>
              </label>
              {format !== 'image/png' && (
                <label className="field">
                  <span>Quality ({Math.round(quality * 100)}%)</span>
                  <input type="range" min={0.5} max={1} step={0.02} value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
                </label>
              )}
            </div>
          </div>
        )}
      </section>
      <section className="col right">
        <div className="panel">
          <div className="panel-header">
            <h2>Result {busy && <span className="meta">· rendering…</span>}</h2>
            {resultUrl && file && (
              <button type="button" className="btn primary" onClick={() => fetch(resultUrl).then((r) => r.blob()).then((b) => downloadBlob(b, file.name.replace(/\.[^.]+$/, '') + `-resized.${ext}`))}>
                Download
              </button>
            )}
          </div>
          {resultUrl ? (
            <>
              <img src={resultUrl} alt="result" className="preview-image" />
              <p className="hint">{formatBytes(resultSize)} · {width}×{height}</p>
            </>
          ) : (
            <p className="hint">Add an image to see the live preview.</p>
          )}
        </div>
      </section>
    </ToolPage>
  )
}
