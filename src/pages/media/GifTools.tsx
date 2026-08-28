import { useEffect, useRef, useState } from 'react'
import { parseGIF, decompressFrames } from 'gifuct-js'
import { GIFEncoder, quantize, applyPalette } from 'gifenc'
import JSZip from 'jszip'
import ToolPage from '../../components/ToolPage'
import Dropzone from '../../components/Dropzone'
import { canvasToBlob, createPreviewUrl, downloadBlob, fileToImage, readFileAsArrayBuffer, revokePreviewUrl, sanitizeFilename } from '../../lib/images'
import { toFileList } from '../../lib/fileStore'
import { usePendingFiles } from '../../lib/usePendingFiles'

interface GifInfo {
  width: number
  height: number
  frameCount: number
  durationMs: number
}

interface DecodedFrame {
  dims: { top: number; left: number; width: number; height: number }
  patch: Uint8ClampedArray
  delay: number
  disposalType: number
}

function compositeFrame(
  ctx: CanvasRenderingContext2D,
  tempCanvas: HTMLCanvasElement,
  tempCtx: CanvasRenderingContext2D,
  frame: DecodedFrame,
  clear: boolean,
): void {
  if (clear) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  const dims = frame.dims
  tempCanvas.width = dims.width
  tempCanvas.height = dims.height
  const imageData = tempCtx.createImageData(dims.width, dims.height)
  imageData.data.set(frame.patch)
  tempCtx.putImageData(imageData, 0, 0)
  ctx.drawImage(tempCanvas, dims.left, dims.top)
}

async function renderFramesBatched(
  width: number,
  height: number,
  frames: DecodedFrame[],
  batchSize = 8,
): Promise<HTMLCanvasElement[]> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const tempCanvas = document.createElement('canvas')
  const tempCtx = tempCanvas.getContext('2d')!
  const out: HTMLCanvasElement[] = []

  for (let i = 0; i < frames.length; i++) {
    compositeFrame(ctx, tempCanvas, tempCtx, frames[i], frames[i].disposalType === 2)
    const copy = document.createElement('canvas')
    copy.width = width
    copy.height = height
    copy.getContext('2d')!.drawImage(canvas, 0, 0)
    out.push(copy)
    if (i > 0 && i % batchSize === 0) {
      await new Promise<void>((r) => window.setTimeout(r, 0))
    }
  }
  return out
}

export default function GifTools() {
  const [gifFile, setGifFile] = useState<File | null>(null)
  const [gifInfo, setGifInfo] = useState<GifInfo | null>(null)
  const [frames, setFrames] = useState<DecodedFrame[]>([])
  const [frameCanvases, setFrameCanvases] = useState<HTMLCanvasElement[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [frameDelay, setFrameDelay] = useState(120)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const playRef = useRef<number | null>(null)
  const imagePreviewUrls = useRef<string[]>([])

  const onPickGif = async (files: FileList) => {
    const f = files[0]
    if (!f || !f.type.includes('gif')) return
    setBusy(true)
    setMessage(null)
    setFrameCanvases([])
    try {
      const buffer = await readFileAsArrayBuffer(f)
      const parsed = parseGIF(buffer)
      const decoded = decompressFrames(parsed, true) as DecodedFrame[]
      const durationMs = decoded.reduce((sum, fr) => sum + (fr.delay || 100), 0)
      setGifFile(f)
      setFrames(decoded)
      setGifInfo({
        width: parsed.lsd.width,
        height: parsed.lsd.height,
        frameCount: decoded.length,
        durationMs,
      })
    } catch (e) {
      setMessage(`Failed to read GIF: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!gifInfo || frames.length === 0) {
      setFrameCanvases([])
      return
    }
    let cancelled = false
    setBusy(true)
    renderFramesBatched(gifInfo.width, gifInfo.height, frames)
      .then((all) => {
        if (!cancelled) setFrameCanvases(all)
      })
      .catch((e) => {
        if (!cancelled) setMessage(`Render failed: ${e instanceof Error ? e.message : String(e)}`)
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [gifInfo, frames])

  useEffect(() => {
    if (frameCanvases.length === 0 || !previewRef.current) return
    const canvas = previewRef.current
    const ctx = canvas.getContext('2d')!
    let i = 0
    const tick = () => {
      const frameCanvas = frameCanvases[i]
      if (frameCanvas) {
        canvas.width = frameCanvas.width
        canvas.height = frameCanvas.height
        ctx.drawImage(frameCanvas, 0, 0)
      }
      const delay = frames[i]?.delay || 100
      i = (i + 1) % frameCanvases.length
      playRef.current = window.setTimeout(tick, delay)
    }
    tick()
    return () => {
      if (playRef.current) clearTimeout(playRef.current)
    }
  }, [frameCanvases, frames])

  const splitToZip = async () => {
    if (!gifInfo || frames.length === 0) return
    setBusy(true)
    setMessage(null)
    try {
      const rendered =
        frameCanvases.length === frames.length
          ? frameCanvases
          : await renderFramesBatched(gifInfo.width, gifInfo.height, frames)
      const zip = new JSZip()
      for (let i = 0; i < rendered.length; i++) {
        const blob = await canvasToBlob(rendered[i], 'image/png')
        zip.file(`frame-${String(i + 1).padStart(3, '0')}.png`, blob)
      }
      const base = sanitizeFilename(gifFile?.name.replace(/\.gif$/i, '') || 'gif')
      downloadBlob(await zip.generateAsync({ type: 'blob' }), `${base}-frames.zip`)
      setMessage(`Exported ${rendered.length} frames.`)
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const onPickImages = (files: FileList) => {
    imagePreviewUrls.current.forEach((u) => revokePreviewUrl(u))
    const picked = Array.from(files).filter((f) => f.type.startsWith('image/'))
    imagePreviewUrls.current = picked.map((f) => createPreviewUrl(f))
    setImageFiles(picked)
  }

  usePendingFiles('/media/gif', (pending) => {
    const hasGif = pending.some((f) => f.type.includes('gif') || /\.gif$/i.test(f.name))
    if (hasGif) void onPickGif(toFileList(pending.filter((f) => f.type.includes('gif') || /\.gif$/i.test(f.name))))
    else void onPickImages(toFileList(pending))
  })

  useEffect(() => () => imagePreviewUrls.current.forEach((u) => revokePreviewUrl(u)), [])

  const buildGif = async () => {
    if (imageFiles.length === 0) return
    setBusy(true)
    setMessage(null)
    try {
      const gif = GIFEncoder()
      const first = await fileToImage(imageFiles[0])
      const w = first.naturalWidth
      const h = first.naturalHeight
      for (const file of imageFiles) {
        const img = await fileToImage(file)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight)
        const dw = img.naturalWidth * scale
        const dh = img.naturalHeight * scale
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
        const { data } = ctx.getImageData(0, 0, w, h)
        const palette = quantize(data, 256)
        const index = applyPalette(data, palette)
        gif.writeFrame(index, w, h, { palette, delay: frameDelay })
      }
      gif.finish()
      const bytes = gif.bytes()
      downloadBlob(new Blob([new Uint8Array(bytes)], { type: 'image/gif' }), 'animation.gif')
      setMessage(`Created GIF with ${imageFiles.length} frames (${w}×${h}).`)
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolPage
      eyebrow="Media"
      title="GIF Tools"
      hint="Open a GIF to preview and extract frames, or build one from still images."
    >
      <section className="col left">
        <div className="panel">
          <h2>Open GIF</h2>
          <Dropzone accept="image/gif" label="Choose or drop a GIF" onFiles={onPickGif} />
          {gifInfo && (
            <>
              <ul className="meta-list" style={{ marginTop: 12 }}>
                <li>{gifInfo.width}×{gifInfo.height}px</li>
                <li>{gifInfo.frameCount} frames</li>
                <li>{(gifInfo.durationMs / 1000).toFixed(2)}s</li>
              </ul>
              <button
                type="button"
                className="btn primary"
                style={{ marginTop: 12 }}
                disabled={busy || frames.length === 0}
                onClick={splitToZip}
              >
                {busy ? 'Working…' : 'Download frames as ZIP'}
              </button>
            </>
          )}
        </div>

        <div className="panel">
          <h2>Create GIF</h2>
          <p className="hint">Add images in order — each becomes one frame.</p>
          <Dropzone accept="image/*" multiple label="Add images" onFiles={onPickImages} />
          {imageFiles.length > 0 && (
            <ul className="file-list">
              {imageFiles.map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  <strong>{f.name}</strong>
                  <button
                    type="button"
                    className="btn-link danger"
                    onClick={() => setImageFiles((prev) => prev.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="field" style={{ marginTop: 12 }}>
            <span>Frame delay ({frameDelay}ms)</span>
            <input type="range" min={20} max={2000} step={10} value={frameDelay} onChange={(e) => setFrameDelay(Number(e.target.value))} />
          </label>
          <button type="button" className="btn primary" disabled={busy || imageFiles.length === 0} onClick={buildGif} style={{ marginTop: 8 }}>
            {busy ? 'Building…' : 'Build GIF'}
          </button>
        </div>

        {message && <p className="hint">{message}</p>}
      </section>

      <section className="col right">
        <div className="panel">
          <h2>Preview</h2>
          {frameCanvases.length > 0 ? (
            <>
              {gifFile && <p className="hint meta">{gifFile.name}</p>}
              <canvas ref={previewRef} className="gif-preview-canvas" />
            </>
          ) : imageFiles.length > 0 ? (
            <div className="image-strip">
              {imageFiles.map((f, i) => (
                <img key={`${f.name}-${i}`} src={imagePreviewUrls.current[i]} alt="" className="thumb-md" />
              ))}
            </div>
          ) : (
            <p className="hint">Load a GIF or add images to see a preview.</p>
          )}
        </div>
      </section>
    </ToolPage>
  )
}
