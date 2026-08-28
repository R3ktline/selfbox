import { useCallback, useEffect, useRef, useState } from 'react'
import ToolPage from '../components/ToolPage'
import { downloadBlob, createPreviewUrl, formatBytes, revokePreviewUrl } from '../lib/images'
import { copyBlobToClipboard } from '../lib/clipboard'
import { useToast } from '../lib/toast'
import { usePendingFiles } from '../lib/usePendingFiles'
import {
  BG_PRESETS,
  beautifyScreenshot,
  presetFromValue,
  type AspectPreset,
  type CropPan,
  type FrameStyle,
} from '../lib/screenshot'

export default function ScreenshotBeautifier() {
  const { push } = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [originalSize, setOriginalSize] = useState(0)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [resultSize, setResultSize] = useState(0)
  const [bgValue, setBgValue] = useState(BG_PRESETS[0].value)
  const [customColor, setCustomColor] = useState('#e8e8ed')
  const [useCustomBg, setUseCustomBg] = useState(false)
  const [cornerRadius, setCornerRadius] = useState(12)
  const [shadow, setShadow] = useState(40)
  const [shadowOpacity, setShadowOpacity] = useState(0.22)
  const [padding, setPadding] = useState(80)
  const [frame, setFrame] = useState<FrameStyle>('macos')
  const [windowTitle, setWindowTitle] = useState('screenshot.png')
  const [scale, setScale] = useState(1)
  const [aspect, setAspect] = useState<AspectPreset>('auto')
  const [cropPan, setCropPan] = useState<CropPan>({ x: 0.5, y: 0.5 })
  const [cropZoom, setCropZoom] = useState(1)
  const [exportType, setExportType] = useState<'image/png' | 'image/jpeg' | 'image/webp'>('image/png')
  const [exportQuality, setExportQuality] = useState(0.92)
  const [busy, setBusy] = useState(false)
  const resultUrlRef = useRef<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const renderTimer = useRef<number | null>(null)

  const cropDrag = useRef<{ startX: number; startY: number; pan: CropPan } | null>(null)

  const revokeResult = useCallback(() => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current)
      resultUrlRef.current = null
    }
    setResultUrl(null)
  }, [])

  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.type.startsWith('image/')) {
          const f = item.getAsFile()
          if (f) {
            e.preventDefault()
            setFile(f)
            setOriginalSize(f.size)
            setImageUrl(createPreviewUrl(f))
            setWindowTitle(f.name.replace(/\.[^.]+$/, '') || 'screenshot')
            revokeResult()
            return
          }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [revokeResult])

  useEffect(() => () => revokeResult(), [revokeResult])

  const render = useCallback(async () => {
    if (!file) return
    setBusy(true)
    try {
      const bg = useCustomBg ? presetFromValue(customColor) : presetFromValue(bgValue)
      const blob = await beautifyScreenshot(file, {
        bg,
        padding,
        cornerRadius,
        shadow,
        shadowOpacity,
        frame,
        windowTitle,
        scale,
        aspect,
        cropPan: aspect !== 'auto' ? cropPan : undefined,
        cropZoom: aspect !== 'auto' ? cropZoom : undefined,
        exportType,
        exportQuality,
      })
      revokeResult()
      const url = URL.createObjectURL(blob)
      resultUrlRef.current = url
      setResultSize(blob.size)
      setResultUrl(url)
    } catch (e) {
      push(e instanceof Error ? e.message : 'Render failed', 'error')
    } finally {
      setBusy(false)
    }
  }, [
    file,
    useCustomBg,
    customColor,
    bgValue,
    padding,
    cornerRadius,
    shadow,
    shadowOpacity,
    frame,
    windowTitle,
    scale,
    aspect,
    cropPan,
    cropZoom,
    exportType,
    exportQuality,
    revokeResult,
    push,
  ])

  useEffect(() => {
    if (!file) return
    if (renderTimer.current) window.clearTimeout(renderTimer.current)
    renderTimer.current = window.setTimeout(() => {
      render()
    }, 350)
    return () => {
      if (renderTimer.current) window.clearTimeout(renderTimer.current)
    }
  }, [file, render])

  useEffect(() => () => revokePreviewUrl(imageUrl), [imageUrl])

  const onPick = async (f: File) => {
    revokePreviewUrl(imageUrl)
    setFile(f)
    setOriginalSize(f.size)
    setImageUrl(createPreviewUrl(f))
    setWindowTitle(f.name.replace(/\.[^.]+$/, '') || 'screenshot')
    setCropPan({ x: 0.5, y: 0.5 })
    setCropZoom(1)
    revokeResult()
  }

  usePendingFiles('/screenshot', (pending) => { if (pending[0]) void onPick(pending[0]) })

  const onCropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (aspect === 'auto') return
    e.currentTarget.setPointerCapture(e.pointerId)
    cropDrag.current = { startX: e.clientX, startY: e.clientY, pan: { ...cropPan } }
  }

  const onCropPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!cropDrag.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    const dx = (e.clientX - cropDrag.current.startX) / rect.width
    const dy = (e.clientY - cropDrag.current.startY) / rect.height
    setCropPan({
      x: Math.min(1, Math.max(0, cropDrag.current.pan.x - dx)),
      y: Math.min(1, Math.max(0, cropDrag.current.pan.y - dy)),
    })
  }

  const onCropPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    cropDrag.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const ext = exportType === 'image/png' ? 'png' : exportType === 'image/webp' ? 'webp' : 'jpg'

  const onDownload = async () => {
    if (!resultUrl || !file) return
    const r = await fetch(resultUrl)
    const b = await r.blob()
    downloadBlob(b, `${file.name.replace(/\.[^.]+$/, '')}-beautified.${ext}`)
  }

  const onCopy = async () => {
    if (!resultUrl) return
    try {
      const r = await fetch(resultUrl)
      const b = await r.blob()
      await copyBlobToClipboard(b, exportType)
      push('Copied to clipboard')
    } catch {
      push('Clipboard unavailable', 'error')
    }
  }

  return (
    <ToolPage
      eyebrow="Image"
      title="Screenshot Beautifier"
      hint="Wrap a raw screenshot in a soft shadow and a clean background. Live preview updates as you tweak settings."
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
              className="dropzone"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const f = e.dataTransfer.files[0]
                if (f) onPick(f)
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click()
              }}
            >
              <strong>Drop, choose, or paste a screenshot</strong>
              <span className="meta">PNG, JPG · Ctrl/⌘+V works too</span>
            </div>
          ) : (
            <>
              <div className="file-info">
                <strong>{file?.name}</strong>
                <span className="meta">{formatBytes(originalSize)}</span>
                <button type="button" className="btn-link" onClick={() => fileInput.current?.click()}>
                  Replace
                </button>
              </div>
              <img className="preview-image" src={imageUrl} alt="source" />
            </>
          )}
        </div>

        <div className="panel">
          <h2>Settings</h2>
          <div className="form-grid">
            <label className="field span-2">
              <span>Background</span>
              <div className="bg-picker">
                {BG_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className={'bg-tile' + (!useCustomBg && bgValue === p.value ? ' active' : '')}
                    style={{ background: p.value }}
                    onClick={() => {
                      setUseCustomBg(false)
                      setBgValue(p.value)
                    }}
                    title={p.label}
                    aria-label={p.label}
                  />
                ))}
                <button
                  type="button"
                  className={'bg-tile bg-tile-custom' + (useCustomBg ? ' active' : '')}
                  onClick={() => setUseCustomBg(true)}
                  title="Custom color"
                  aria-label="Custom color"
                >
                  <input
                    type="color"
                    value={customColor}
                    onChange={(e) => {
                      setCustomColor(e.target.value)
                      setUseCustomBg(true)
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </button>
              </div>
            </label>
            <label className="field">
              <span>Frame</span>
              <select value={frame} onChange={(e) => setFrame(e.target.value as FrameStyle)}>
                <option value="none">None</option>
                <option value="macos">macOS window</option>
                <option value="browser">Browser chrome</option>
              </select>
            </label>
            <label className="field">
              <span>Aspect ratio</span>
              <select
                value={aspect}
                onChange={(e) => {
                  const next = e.target.value as AspectPreset
                  setAspect(next)
                  if (next !== 'auto') {
                    setCropPan({ x: 0.5, y: 0.5 })
                    setCropZoom(1)
                  }
                }}
              >
                <option value="auto">Original</option>
                <option value="16:9">16:9</option>
                <option value="4:3">4:3</option>
                <option value="1:1">1:1 square</option>
                <option value="9:16">9:16 portrait</option>
              </select>
            </label>
            {aspect !== 'auto' && imageUrl && (
              <>
                <label className="field span-2">
                  <span>Crop position — drag to reposition</span>
                  <div
                    className="crop-editor"
                    style={{ aspectRatio: aspect === '16:9' ? '16/9' : aspect === '4:3' ? '4/3' : aspect === '1:1' ? '1/1' : '9/16' }}
                    onPointerDown={onCropPointerDown}
                    onPointerMove={onCropPointerMove}
                    onPointerUp={onCropPointerUp}
                    onPointerCancel={onCropPointerUp}
                  >
                    <img
                      src={imageUrl}
                      alt="crop"
                      draggable={false}
                      style={{
                        objectPosition: `${cropPan.x * 100}% ${cropPan.y * 100}%`,
                        transform: `scale(${cropZoom})`,
                      }}
                    />
                  </div>
                </label>
                <label className="field">
                  <span>Zoom (×{cropZoom.toFixed(1)})</span>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.05}
                    value={cropZoom}
                    onChange={(e) => setCropZoom(Number(e.target.value))}
                  />
                </label>
                <label className="field">
                  <span>&nbsp;</span>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setCropPan({ x: 0.5, y: 0.5 })
                      setCropZoom(1)
                    }}
                  >
                    Reset crop
                  </button>
                </label>
              </>
            )}
            {frame === 'browser' && (
              <label className="field span-2">
                <span>Window title / URL</span>
                <input value={windowTitle} onChange={(e) => setWindowTitle(e.target.value)} placeholder="example.com" />
              </label>
            )}
            <label className="field">
              <span>Padding ({padding}px)</span>
              <input type="range" min={0} max={300} value={padding} onChange={(e) => setPadding(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Corner radius ({cornerRadius}px)</span>
              <input type="range" min={0} max={50} value={cornerRadius} onChange={(e) => setCornerRadius(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Shadow blur ({shadow}px)</span>
              <input type="range" min={0} max={200} value={shadow} onChange={(e) => setShadow(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Shadow opacity ({Math.round(shadowOpacity * 100)}%)</span>
              <input type="range" min={0} max={0.6} step={0.02} value={shadowOpacity} onChange={(e) => setShadowOpacity(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Export scale (×{scale})</span>
              <input type="range" min={1} max={3} step={0.5} value={scale} onChange={(e) => setScale(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Format</span>
              <select value={exportType} onChange={(e) => setExportType(e.target.value as typeof exportType)}>
                <option value="image/png">PNG</option>
                <option value="image/jpeg">JPEG</option>
                <option value="image/webp">WebP</option>
              </select>
            </label>
            {exportType !== 'image/png' && (
              <label className="field">
                <span>Quality ({Math.round(exportQuality * 100)}%)</span>
                <input type="range" min={0.5} max={1} step={0.02} value={exportQuality} onChange={(e) => setExportQuality(Number(e.target.value))} />
              </label>
            )}
          </div>
        </div>
      </section>

      <section className="col right">
        <div className="panel">
          <div className="panel-header">
            <h2>Result {busy && <span className="meta">· rendering…</span>}</h2>
            {resultUrl && (
              <div className="row-actions">
                <button type="button" className="btn" onClick={onCopy}>
                  Copy
                </button>
                <button type="button" className="btn primary" onClick={onDownload}>
                  Download
                </button>
              </div>
            )}
          </div>
          {resultUrl ? (
            <>
              <img className="preview-image" src={resultUrl} alt="result" />
              <p className="hint" style={{ marginTop: 10 }}>
                {formatBytes(resultSize)}
                {originalSize > 0 && ` (${Math.round((resultSize / originalSize) * 100)}% of original)`}
              </p>
            </>
          ) : (
            <p className="hint">{file ? 'Generating preview…' : 'Add a screenshot to see the live preview.'}</p>
          )}
        </div>
      </section>
    </ToolPage>
  )
}
