import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import ToolPage from '../../components/ToolPage'
import Dropzone from '../../components/Dropzone'
import ColorPicker from '../../components/ColorPicker'
import { canvasToBlob, downloadBlob, fileToImage, formatBytes } from '../../lib/images'
import { toFileList } from '../../lib/fileStore'
import { usePendingFiles } from '../../lib/usePendingFiles'

type SideMode = 'redact' | 'text' | null

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface TextAnnotation {
  id: string
  x: number
  y: number
  text: string
  size: number
  color: string
}

interface RedactRect extends Rect {
  id: string
}

type CropHandle = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'new'

type DragState =
  | { kind: 'crop'; handle: CropHandle; startX: number; startY: number; startCrop?: Rect; currentRect?: Rect }
  | { kind: 'redact-new'; startX: number; startY: number; currentRect?: Rect }
  | { kind: 'redact-move'; id: string; startX: number; startY: number; startRect: Rect }
  | { kind: 'redact-resize'; id: string; handle: CropHandle; startX: number; startY: number; startRect: Rect }
  | { kind: 'text-move'; id: string; startX: number; startY: number; startXPos: number; startYPos: number }

let idCounter = 0
function nextId(): string {
  idCounter += 1
  return `ann-${idCounter}`
}

function clampRect(rect: Rect, maxW: number, maxH: number): Rect {
  const x = Math.max(0, Math.min(rect.x, maxW))
  const y = Math.max(0, Math.min(rect.y, maxH))
  const w = Math.max(8, Math.min(rect.w, maxW - x))
  const h = Math.max(8, Math.min(rect.h, maxH - y))
  return { x, y, w, h }
}

function cropToAspect(imgW: number, imgH: number, ratio: number): Rect {
  let w: number
  let h: number
  if (imgW / imgH > ratio) {
    h = imgH
    w = h * ratio
  } else {
    w = imgW
    h = w / ratio
  }
  return clampRect({ x: (imgW - w) / 2, y: (imgH - h) / 2, w, h }, imgW, imgH)
}

const CROP_RATIOS = [
  { label: '1:1', ratio: 1 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '3:2', ratio: 3 / 2 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '9:16', ratio: 9 / 16 },
] as const

function hitRectHandle(rect: Rect, px: number, py: number, imgW: number, imgH: number): CropHandle {
  const tol = Math.max(22, Math.min(imgW, imgH) * 0.03)
  const { x, y, w, h } = rect
  const right = x + w
  const bottom = y + h
  const onLeft = Math.abs(px - x) <= tol
  const onRight = Math.abs(px - right) <= tol
  const onTop = Math.abs(py - y) <= tol
  const onBottom = Math.abs(py - bottom) <= tol
  const insideX = px >= x - tol && px <= right + tol
  const insideY = py >= y - tol && py <= bottom + tol

  if (onTop && onLeft) return 'nw'
  if (onTop && onRight) return 'ne'
  if (onBottom && onRight) return 'se'
  if (onBottom && onLeft) return 'sw'
  if (onTop && insideX) return 'n'
  if (onBottom && insideX) return 's'
  if (onLeft && insideY) return 'w'
  if (onRight && insideY) return 'e'
  if (px >= x && px <= right && py >= y && py <= bottom) return 'move'
  return 'new'
}

function constrainRectAspect(rect: Rect, ratio: number, imgW: number, imgH: number): Rect {
  let { x, y, w, h } = rect
  h = w / ratio
  if (h > imgH) {
    h = imgH
    w = h * ratio
  }
  if (w > imgW) {
    w = imgW
    h = w / ratio
  }
  w = Math.max(8, w)
  h = Math.max(8, h)
  x = Math.max(0, Math.min(x, imgW - w))
  y = Math.max(0, Math.min(y, imgH - h))
  return { x, y, w, h }
}

function resizeRectWithAspect(
  rect: Rect,
  handle: CropHandle,
  dx: number,
  dy: number,
  ratio: number,
  imgW: number,
  imgH: number,
): Rect {
  const { x, y, w, h } = rect
  const right = x + w
  const bottom = y + h
  const cx = x + w / 2
  const cy = y + h / 2

  let next: Rect
  switch (handle) {
    case 'move':
      return clampRect({ x: x + dx, y: y + dy, w, h }, imgW, imgH)
    case 'e': {
      const nw = Math.max(8, w + dx)
      const nh = nw / ratio
      next = { x, y: cy - nh / 2, w: nw, h: nh }
      break
    }
    case 'w': {
      const nw = Math.max(8, w - dx)
      const nh = nw / ratio
      next = { x: right - nw, y: cy - nh / 2, w: nw, h: nh }
      break
    }
    case 's': {
      const nh = Math.max(8, h + dy)
      const nw = nh * ratio
      next = { x: cx - nw / 2, y, w: nw, h: nh }
      break
    }
    case 'n': {
      const nh = Math.max(8, h - dy)
      const nw = nh * ratio
      next = { x: cx - nw / 2, y: bottom - nh, w: nw, h: nh }
      break
    }
    case 'se': {
      const nw = Math.max(8, w + dx)
      const nh = nw / ratio
      next = { x, y, w: nw, h: nh }
      break
    }
    case 'sw': {
      const nw = Math.max(8, w - dx)
      const nh = nw / ratio
      next = { x: right - nw, y, w: nw, h: nh }
      break
    }
    case 'ne': {
      const nw = Math.max(8, w + dx)
      const nh = nw / ratio
      next = { x, y: bottom - nh, w: nw, h: nh }
      break
    }
    case 'nw': {
      const nw = Math.max(8, w - dx)
      const nh = nw / ratio
      next = { x: right - nw, y: bottom - nh, w: nw, h: nh }
      break
    }
    default:
      return rect
  }

  return constrainRectAspect(next, ratio, imgW, imgH)
}

function rectFromDragAspect(
  startX: number,
  startY: number,
  px: number,
  py: number,
  ratio: number,
  imgW: number,
  imgH: number,
): Rect {
  const dw = Math.abs(px - startX)
  const dh = Math.abs(py - startY)
  let w: number
  let h: number
  if (dw / Math.max(dh, 1) > ratio) {
    w = dw
    h = w / ratio
  } else {
    h = dh
    w = h * ratio
  }
  const x = px >= startX ? startX : startX - w
  const y = py >= startY ? startY : startY - h
  return constrainRectAspect({ x, y, w, h }, ratio, imgW, imgH)
}

function resizeRect(rect: Rect, handle: CropHandle, dx: number, dy: number, imgW: number, imgH: number): Rect {
  const { x, y, w, h } = rect
  switch (handle) {
    case 'move':
      return clampRect({ x: x + dx, y: y + dy, w, h }, imgW, imgH)
    case 'nw':
      return clampRect({ x: x + dx, y: y + dy, w: w - dx, h: h - dy }, imgW, imgH)
    case 'n':
      return clampRect({ x, y: y + dy, w, h: h - dy }, imgW, imgH)
    case 'ne':
      return clampRect({ x, y: y + dy, w: w + dx, h: h - dy }, imgW, imgH)
    case 'e':
      return clampRect({ x, y, w: w + dx, h }, imgW, imgH)
    case 'se':
      return clampRect({ x, y, w: w + dx, h: h + dy }, imgW, imgH)
    case 's':
      return clampRect({ x, y, w, h: h + dy }, imgW, imgH)
    case 'sw':
      return clampRect({ x: x + dx, y, w: w - dx, h: h + dy }, imgW, imgH)
    case 'w':
      return clampRect({ x: x + dx, y, w: w - dx, h }, imgW, imgH)
    default:
      return rect
  }
}

function textBounds(t: TextAnnotation, ctx: CanvasRenderingContext2D) {
  ctx.font = `${t.size}px system-ui, sans-serif`
  const w = ctx.measureText(t.text).width
  return { x: t.x, y: t.y - t.size, w, h: t.size + 4 }
}

function hitText(texts: TextAnnotation[], px: number, py: number, ctx: CanvasRenderingContext2D): string | null {
  for (let i = texts.length - 1; i >= 0; i--) {
    const b = textBounds(texts[i], ctx)
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return texts[i].id
  }
  return null
}

function hitRedact(redacts: RedactRect[], px: number, py: number): string | null {
  for (let i = redacts.length - 1; i >= 0; i--) {
    const r = redacts[i]
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return r.id
  }
  return null
}

function drawCropOverlay(ctx: CanvasRenderingContext2D, box: Rect, cw: number, ch: number) {
  const { x, y, w, h } = box
  const scale = Math.min(cw, ch)
  const border = Math.max(1.5, scale * 0.0018)
  const bracketLen = Math.max(16, Math.min(w, h) * 0.09)
  const handleR = Math.max(9, scale * 0.014)

  ctx.save()

  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  ctx.beginPath()
  ctx.rect(0, 0, cw, ch)
  ctx.rect(x, y, w, h)
  ctx.fill('evenodd')

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
  ctx.lineWidth = 1
  for (let i = 1; i < 3; i++) {
    const gx = x + (w * i) / 3
    const gy = y + (h * i) / 3
    ctx.beginPath()
    ctx.moveTo(gx, y)
    ctx.lineTo(gx, y + h)
    ctx.moveTo(x, gy)
    ctx.lineTo(x + w, gy)
    ctx.stroke()
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)'
  ctx.lineWidth = border
  ctx.strokeRect(x + border / 2, y + border / 2, w - border, h - border)

  const drawBracket = (ax: number, ay: number, dx1: number, dy1: number, dx2: number, dy2: number) => {
    ctx.beginPath()
    ctx.moveTo(ax + dx1, ay + dy1)
    ctx.lineTo(ax, ay)
    ctx.lineTo(ax + dx2, ay + dy2)
    ctx.stroke()
  }

  ctx.lineWidth = Math.max(2.5, scale * 0.0028)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.98)'
  drawBracket(x, y, 0, bracketLen, bracketLen, 0)
  drawBracket(x + w, y, 0, bracketLen, -bracketLen, 0)
  drawBracket(x + w, y + h, 0, -bracketLen, -bracketLen, 0)
  drawBracket(x, y + h, 0, -bracketLen, bracketLen, 0)

  ctx.strokeStyle = 'rgba(255, 68, 51, 0.85)'
  ctx.lineWidth = Math.max(1.5, scale * 0.0016)
  const inset = 1.5
  drawBracket(x + inset, y + inset, 0, bracketLen - inset, bracketLen - inset, 0)
  drawBracket(x + w - inset, y + inset, 0, bracketLen - inset, -(bracketLen - inset), 0)
  drawBracket(x + w - inset, y + h - inset, 0, -(bracketLen - inset), -(bracketLen - inset), 0)
  drawBracket(x + inset, y + h - inset, 0, -(bracketLen - inset), bracketLen - inset, 0)

  const handles: [number, number][] = [
    [x, y],
    [x + w / 2, y],
    [x + w, y],
    [x, y + h / 2],
    [x + w, y + h / 2],
    [x, y + h],
    [x + w / 2, y + h],
    [x + w, y + h],
  ]

  for (const [cx, cy] of handles) {
    ctx.beginPath()
    ctx.arc(cx, cy, handleR, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 68, 51, 0.95)'
    ctx.lineWidth = 2.5
    ctx.stroke()
  }

  ctx.restore()
}

function drawRectSelection(ctx: CanvasRenderingContext2D, box: Rect, color: string) {
  const scale = Math.max(box.w, box.h)
  const handleR = Math.max(5, scale * 0.04)
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.setLineDash([6, 4])
  ctx.strokeRect(box.x, box.y, box.w, box.h)
  ctx.setLineDash([])
  for (const [cx, cy] of [
    [box.x, box.y],
    [box.x + box.w, box.y],
    [box.x + box.w, box.y + box.h],
    [box.x, box.y + box.h],
  ] as [number, number][]) {
    ctx.beginPath()
    ctx.arc(cx, cy, handleR, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.stroke()
  }
  ctx.restore()
}

interface TextFieldsProps {
  text: string
  size: number
  color: string
  onText: (value: string) => void
  onSize: (value: number) => void
  onColor: (value: string) => void
}

function TextFields({ text, size, color, onText, onSize, onColor }: TextFieldsProps) {
  return (
    <div className="img-editor-text-opts">
      <label className="field">
        <span>Label</span>
        <input value={text} onChange={(e) => onText(e.target.value)} />
      </label>
      <label className="field">
        <span>Size ({size}px)</span>
        <input type="range" min={14} max={96} value={size} onChange={(e) => onSize(Number(e.target.value))} />
      </label>
      <label className="field">
        <span>Color</span>
        <div className="color-row">
          <ColorPicker value={color} onChange={onColor} ariaLabel="Text color" />
          <input type="text" value={color} onChange={(e) => onColor(e.target.value)} />
        </div>
      </label>
    </div>
  )
}

function estimateTextWidth(t: TextAnnotation): number {
  return Math.max(24, t.text.length * t.size * 0.55)
}

function textPopoverPos(t: TextAnnotation, scale: number, stageW: number, stageH: number) {
  const pad = 8
  const popW = 236
  const popH = 200
  const textW = estimateTextWidth(t) * scale
  const textX = t.x * scale
  const textY = (t.y - t.size) * scale
  const textH = (t.size + 4) * scale

  let left = textX + textW + 12
  let top = textY

  if (left + popW > stageW - pad) left = textX - popW - 12
  if (left < pad) {
    left = Math.min(pad, Math.max(pad, textX))
    top = textY + textH + 12
  }
  if (top + popH > stageH - pad) top = Math.max(pad, stageH - popH - pad)
  if (top < pad) top = pad

  return { left, top }
}

export default function ImageEditor() {
  const [file, setFile] = useState<File | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [sideMode, setSideMode] = useState<SideMode>(null)
  const [crop, setCrop] = useState<Rect | null>(null)
  const [draftRect, setDraftRect] = useState<Rect | null>(null)
  const [redacts, setRedacts] = useState<RedactRect[]>([])
  const [texts, setTexts] = useState<TextAnnotation[]>([])
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [selectedRedactId, setSelectedRedactId] = useState<string | null>(null)
  const [format, setFormat] = useState<'image/png' | 'image/jpeg'>('image/png')
  const [quality, setQuality] = useState(0.92)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [viewScale, setViewScale] = useState(1)
  const [cropAspect, setCropAspect] = useState<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const drag = useRef<DragState | null>(null)
  const drawRaf = useRef<number | null>(null)
  const [overlayTick, setOverlayTick] = useState(0)
  const liveCropRef = useRef<Rect | null>(null)
  const liveDraftRef = useRef<Rect | null>(null)
  const liveRedactsRef = useRef<RedactRect[]>([])
  const liveTextsRef = useRef<TextAnnotation[]>([])
  const cropAspectRef = useRef<number | null>(null)

  const selectedText = texts.find((t) => t.id === selectedTextId) ?? null

  useEffect(() => {
    cropAspectRef.current = cropAspect
  }, [cropAspect])

  useEffect(() => {
    liveCropRef.current = crop
  }, [crop])

  useEffect(() => {
    liveDraftRef.current = draftRect
  }, [draftRect])

  useEffect(() => {
    liveRedactsRef.current = redacts
  }, [redacts])

  useEffect(() => {
    liveTextsRef.current = texts
  }, [texts])

  const onPick = async (files: FileList) => {
    const f = files[0]
    if (!f) return
    const image = await fileToImage(f)
    const initialCrop = { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight }
    liveCropRef.current = initialCrop
    liveDraftRef.current = null
    liveRedactsRef.current = []
    liveTextsRef.current = []
    setFile(f)
    setImg(image)
    setCrop(initialCrop)
    setDraftRect(null)
    setRedacts([])
    setTexts([])
    setSelectedTextId(null)
    setSelectedRedactId(null)
    setSideMode(null)
    setCropAspect(null)
    setHint(null)
  }

  usePendingFiles('/media/edit', (pending) => {
    if (pending.length) void onPick(toFileList(pending))
  })

  useEffect(() => {
    if (!img || !wrapRef.current) return
    const update = () => {
      const wrap = wrapRef.current
      if (!wrap) return
      const maxW = Math.max(1, wrap.clientWidth - 24)
      const maxH = Math.max(1, Math.min(560, window.innerHeight * 0.62))
      const next = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight)
      setViewScale(Number.isFinite(next) && next > 0 ? next : 1)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(wrapRef.current)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [img])

  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !img) return
    const cropLive = liveCropRef.current ?? crop
    if (!cropLive) return
    const ctx = canvas.getContext('2d')!
    const cw = img.naturalWidth
    const ch = img.naturalHeight
    if (canvas.width !== cw) canvas.width = cw
    if (canvas.height !== ch) canvas.height = ch
    ctx.clearRect(0, 0, cw, ch)
    ctx.drawImage(img, 0, 0)

    const redactsLive = liveRedactsRef.current
    const textsLive = liveTextsRef.current
    const draftLive = liveDraftRef.current

    for (const r of redactsLive) {
      ctx.fillStyle = '#000000'
      ctx.fillRect(r.x, r.y, r.w, r.h)
      if (r.id === selectedRedactId) drawRectSelection(ctx, r, 'rgba(255, 90, 90, 0.95)')
    }

    for (const t of textsLive) {
      ctx.font = `${t.size}px system-ui, sans-serif`
      ctx.fillStyle = t.color
      ctx.fillText(t.text, t.x, t.y)
      if (t.id === selectedTextId) {
        const b = textBounds(t, ctx)
        ctx.strokeStyle = 'rgba(99, 179, 237, 0.95)'
        ctx.lineWidth = 2
        ctx.setLineDash([4, 3])
        ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4)
        ctx.setLineDash([])
      }
    }

    const cropBox = draftLive ?? cropLive
    drawCropOverlay(ctx, cropBox, cw, ch)

    if (sideMode === 'redact' && draftLive && draftLive.w > 0 && draftLive.h > 0) {
      drawRectSelection(ctx, draftLive, 'rgba(255, 90, 90, 0.7)')
    }
  }, [img, crop, sideMode, selectedRedactId, selectedTextId])

  const scheduleDraw = useCallback(() => {
    if (drawRaf.current != null) return
    drawRaf.current = requestAnimationFrame(() => {
      drawRaf.current = null
      draw()
      if (drag.current?.kind === 'text-move') setOverlayTick((n) => n + 1)
    })
  }, [draw])

  useLayoutEffect(() => {
    draw()
  }, [draw, viewScale, crop, draftRect, redacts, texts])

  useEffect(() => {
    return () => {
      if (drawRaf.current != null) cancelAnimationFrame(drawRaf.current)
    }
  }, [])

  const releasePointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const target = e.currentTarget
    if (target.hasPointerCapture(e.pointerId)) {
      target.releasePointerCapture(e.pointerId)
    }
  }

  const updateText = (id: string, patch: Partial<TextAnnotation>) => {
    setTexts((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
      liveTextsRef.current = next
      return next
    })
    scheduleDraw()
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!img || !crop) return
    const p = pointerPos(e)
    const ctx = canvasRef.current!.getContext('2d')!

    const textHit = hitText(liveTextsRef.current, p.x, p.y, ctx)
    if (textHit) {
      const t = liveTextsRef.current.find((x) => x.id === textHit)!
      setSelectedTextId(textHit)
      setSelectedRedactId(null)
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { kind: 'text-move', id: textHit, startX: p.x, startY: p.y, startXPos: t.x, startYPos: t.y }
      return
    }

    const redactHit = hitRedact(liveRedactsRef.current, p.x, p.y)
    if (redactHit) {
      const r = liveRedactsRef.current.find((x) => x.id === redactHit)!
      setSelectedRedactId(redactHit)
      setSelectedTextId(null)
      const handle = hitRectHandle(r, p.x, p.y, img.naturalWidth, img.naturalHeight)
      if (handle !== 'new') {
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current =
          handle === 'move'
            ? { kind: 'redact-move', id: redactHit, startX: p.x, startY: p.y, startRect: { ...r } }
            : { kind: 'redact-resize', id: redactHit, handle, startX: p.x, startY: p.y, startRect: { ...r } }
        return
      }
    }

    setSelectedTextId(null)
    setSelectedRedactId(null)

    if (sideMode === 'text') {
      const id = nextId()
      const item: TextAnnotation = {
        id,
        x: p.x,
        y: p.y,
        text: 'Label',
        size: 28,
        color: '#ffffff',
      }
      const nextTexts = [...liveTextsRef.current, item]
      liveTextsRef.current = nextTexts
      setTexts(nextTexts)
      setSelectedTextId(id)
      setHint('Drag to move · edit in the panel →')
      scheduleDraw()
      return
    }

    if (sideMode === 'redact') {
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { kind: 'redact-new', startX: p.x, startY: p.y }
      liveDraftRef.current = { x: p.x, y: p.y, w: 0, h: 0 }
      setDraftRect({ x: p.x, y: p.y, w: 0, h: 0 })
      return
    }

    const cropLive = liveCropRef.current ?? crop
    const handle = hitRectHandle(cropLive, p.x, p.y, img.naturalWidth, img.naturalHeight)
    e.currentTarget.setPointerCapture(e.pointerId)
    if (handle === 'new') {
      drag.current = { kind: 'crop', handle: 'new', startX: p.x, startY: p.y }
      liveDraftRef.current = { x: p.x, y: p.y, w: 0, h: 0 }
      setDraftRect({ x: p.x, y: p.y, w: 0, h: 0 })
      setCropAspect(null)
    } else {
      drag.current = { kind: 'crop', handle, startX: p.x, startY: p.y, startCrop: { ...cropLive } }
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current || !img || !crop) return
    const p = pointerPos(e)
    const d = drag.current

    if (d.kind === 'redact-new') {
      const x = Math.min(d.startX, p.x)
      const y = Math.min(d.startY, p.y)
      const next = clampRect({ x, y, w: Math.abs(p.x - d.startX), h: Math.abs(p.y - d.startY) }, img.naturalWidth, img.naturalHeight)
      d.currentRect = next
      liveDraftRef.current = next
      scheduleDraw()
      return
    }

    if (d.kind === 'redact-move') {
      const dx = p.x - d.startX
      const dy = p.y - d.startY
      const next = clampRect(
        { x: d.startRect.x + dx, y: d.startRect.y + dy, w: d.startRect.w, h: d.startRect.h },
        img.naturalWidth,
        img.naturalHeight,
      )
      liveRedactsRef.current = liveRedactsRef.current.map((r) => (r.id === d.id ? { ...r, ...next } : r))
      scheduleDraw()
      return
    }

    if (d.kind === 'redact-resize') {
      const dx = p.x - d.startX
      const dy = p.y - d.startY
      const next = resizeRect(d.startRect, d.handle, dx, dy, img.naturalWidth, img.naturalHeight)
      liveRedactsRef.current = liveRedactsRef.current.map((r) => (r.id === d.id ? { ...r, ...next } : r))
      scheduleDraw()
      return
    }

    if (d.kind === 'text-move') {
      const dx = p.x - d.startX
      const dy = p.y - d.startY
      liveTextsRef.current = liveTextsRef.current.map((t) =>
        t.id === d.id ? { ...t, x: d.startXPos + dx, y: d.startYPos + dy } : t,
      )
      scheduleDraw()
      return
    }

    if (d.kind === 'crop') {
      const aspect = cropAspectRef.current
      if (d.handle === 'new') {
        const next =
          aspect != null
            ? rectFromDragAspect(d.startX, d.startY, p.x, p.y, aspect, img.naturalWidth, img.naturalHeight)
            : clampRect(
                {
                  x: Math.min(d.startX, p.x),
                  y: Math.min(d.startY, p.y),
                  w: Math.abs(p.x - d.startX),
                  h: Math.abs(p.y - d.startY),
                },
                img.naturalWidth,
                img.naturalHeight,
              )
        d.currentRect = next
        liveDraftRef.current = next
        scheduleDraw()
      } else if (d.startCrop) {
        const dx = p.x - d.startX
        const dy = p.y - d.startY
        liveCropRef.current =
          aspect != null
            ? resizeRectWithAspect(d.startCrop, d.handle, dx, dy, aspect, img.naturalWidth, img.naturalHeight)
            : resizeRect(d.startCrop, d.handle, dx, dy, img.naturalWidth, img.naturalHeight)
        scheduleDraw()
      }
    }
  }

  const finishDrag = (d: DragState) => {
    if (d.kind === 'redact-new' && d.currentRect && d.currentRect.w > 6 && d.currentRect.h > 6) {
      const id = nextId()
      const item = { ...d.currentRect, id }
      const next = [...liveRedactsRef.current, item]
      liveRedactsRef.current = next
      setRedacts(next)
      setSelectedRedactId(id)
      setHint('Drag to move · corners to resize')
    } else if (d.kind === 'redact-move' || d.kind === 'redact-resize') {
      setRedacts([...liveRedactsRef.current])
    } else if (d.kind === 'text-move') {
      setTexts([...liveTextsRef.current])
    } else if (d.kind === 'crop' && d.handle === 'new' && d.currentRect && d.currentRect.w > 6 && d.currentRect.h > 6) {
      liveCropRef.current = d.currentRect
      setCrop(d.currentRect)
    } else if (d.kind === 'crop' && d.startCrop && liveCropRef.current) {
      setCrop(liveCropRef.current)
    }

    liveDraftRef.current = null
    setDraftRect(null)
    scheduleDraw()
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    releasePointer(e)
    if (!drag.current || !img) return
    const d = drag.current
    drag.current = null
    finishDrag(d)
  }

  const onPointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    releasePointer(e)
    if (!drag.current || !img) return
    const d = drag.current
    drag.current = null
    finishDrag(d)
  }

  const exportImage = async () => {
    if (!img || !crop) return
    setBusy(true)
    try {
      const out = document.createElement('canvas')
      out.width = Math.round(crop.w)
      out.height = Math.round(crop.h)
      const ctx = out.getContext('2d')!
      ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h)
      for (const r of redacts) {
        const ix = r.x - crop.x
        const iy = r.y - crop.y
        if (ix + r.w < 0 || iy + r.h < 0 || ix > crop.w || iy > crop.h) continue
        ctx.fillStyle = '#000000'
        ctx.fillRect(ix, iy, r.w, r.h)
      }
      for (const t of texts) {
        const tx = t.x - crop.x
        const ty = t.y - crop.y
        ctx.font = `${t.size}px system-ui, sans-serif`
        ctx.fillStyle = t.color
        ctx.fillText(t.text, tx, ty)
      }
      const blob = await canvasToBlob(out, format, quality)
      const ext = format === 'image/png' ? 'png' : 'jpg'
      downloadBlob(blob, `edited.${ext}`)
      setHint(`Downloaded ${formatBytes(blob.size)}.`)
    } finally {
      setBusy(false)
    }
  }

  const resetCrop = () => {
    if (!img) return
    const next = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight }
    liveCropRef.current = next
    setCrop(next)
    setCropAspect(null)
    setHint('Crop reset to full image.')
  }

  const applyAspectCrop = (label: string, ratio: number) => {
    if (!img) return
    const next = cropToAspect(img.naturalWidth, img.naturalHeight, ratio)
    liveCropRef.current = next
    setCrop(next)
    setCropAspect(ratio)
    setHint(`Crop set to ${label}. Drag handles to resize.`)
  }

  const toggleSideMode = (mode: SideMode) => {
    setSideMode((prev) => (prev === mode ? null : mode))
    liveDraftRef.current = null
    setDraftRect(null)
    if (mode === 'redact') setHint('Drag on the image to add a blackout.')
    else if (mode === 'text') setHint('Click on the image to place text.')
    else setHint(null)
  }

  const deleteSelected = () => {
    if (selectedTextId) {
      const next = liveTextsRef.current.filter((t) => t.id !== selectedTextId)
      liveTextsRef.current = next
      setTexts(next)
      setSelectedTextId(null)
    }
    if (selectedRedactId) {
      const next = liveRedactsRef.current.filter((r) => r.id !== selectedRedactId)
      liveRedactsRef.current = next
      setRedacts(next)
      setSelectedRedactId(null)
    }
    scheduleDraw()
  }

  const cropLabel = crop && img ? `${Math.round(crop.w)}×${Math.round(crop.h)}` : ''
  const displayW = img ? Math.round(img.naturalWidth * viewScale) : 0
  const displayH = img ? Math.round(img.naturalHeight * viewScale) : 0
  const activeText = selectedTextId
    ? (liveTextsRef.current.find((t) => t.id === selectedTextId) ?? selectedText)
    : null
  const textPopover =
    activeText && displayW > 0 && displayH > 0
      ? textPopoverPos(activeText, viewScale, displayW, displayH)
      : null
  void overlayTick

  return (
    <ToolPage
      eyebrow="Media"
      title="Image Editor"
      hint="Crop with the box on load, black out sensitive bits, or add labels — then download."
    >
      <div className={`img-editor-layout${img ? ' has-image' : ''}`}>
        {!img ? (
          <div className="img-editor-empty">
            <Dropzone accept="image/*" label="Drop an image to start" onFiles={onPick} />
          </div>
        ) : (
          <>
            <div className="img-editor-main">
              <div className="img-editor-canvas-wrap" ref={wrapRef}>
                <div
                  className="img-editor-canvas-stage"
                  style={{ width: displayW || undefined, height: displayH || undefined }}
                >
                  <canvas
                    ref={canvasRef}
                    className="img-editor-canvas"
                    style={{ width: '100%', height: '100%' }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerCancel}
                  />
                  {activeText && textPopover && (
                    <div
                      className="img-editor-text-popover"
                      style={{ left: textPopover.left, top: textPopover.top }}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <p className="img-editor-text-popover-title">Edit label</p>
                      <TextFields
                        text={activeText.text}
                        size={activeText.size}
                        color={activeText.color}
                        onText={(value) => updateText(activeText.id, { text: value })}
                        onSize={(value) => updateText(activeText.id, { size: value })}
                        onColor={(value) => updateText(activeText.id, { color: value })}
                      />
                      <button type="button" className="btn-link danger" onClick={deleteSelected}>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {hint && <p className="hint img-editor-canvas-hint">{hint}</p>}
            </div>

            <aside className="img-editor-panel" aria-label="Editor tools">
              <div className="img-editor-panel-section">
                <h2>Export</h2>
                {file && (
                  <p className="hint meta img-editor-file-meta" title={file.name}>
                    {file.name} · {img.naturalWidth}×{img.naturalHeight}
                    {crop ? ` · crop ${cropLabel}` : ''}
                  </p>
                )}
                <div className="img-editor-export-row">
                  <label className="field">
                    <span>Format</span>
                    <select
                      className="img-editor-select"
                      value={format}
                      onChange={(e) => setFormat(e.target.value as 'image/png' | 'image/jpeg')}
                    >
                      <option value="image/png">PNG</option>
                      <option value="image/jpeg">JPEG</option>
                    </select>
                  </label>
                  {format === 'image/jpeg' && (
                    <label className="field">
                      <span>Quality ({Math.round(quality * 100)}%)</span>
                      <input type="range" min={0.5} max={1} step={0.02} value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
                    </label>
                  )}
                </div>
                <button type="button" className="btn primary img-editor-download" disabled={busy} onClick={exportImage}>
                  {busy ? 'Exporting…' : 'Download'}
                </button>
                <button type="button" className="btn-link" onClick={() => fileInputRef.current?.click()}>
                  Replace image
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files && onPick(e.target.files)} />
              </div>

              <div className="img-editor-panel-section">
                <h2>Crop</h2>
                <p className="hint img-editor-side-hint">Drag corners or edges. Drag outside to redraw.</p>
                <div className="img-editor-ratio-grid">
                  {CROP_RATIOS.map(({ label, ratio }) => (
                    <button
                      key={label}
                      type="button"
                      className={`btn img-editor-ratio-btn${cropAspect === ratio ? ' active' : ''}`}
                      onClick={() => applyAspectCrop(label, ratio)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button type="button" className="btn img-editor-side-btn" onClick={resetCrop}>
                  Full image
                </button>
              </div>

              <div className="img-editor-panel-section">
                <h2>Annotate</h2>
                <button
                  type="button"
                  className={`btn img-editor-side-btn${sideMode === 'redact' ? ' active' : ''}`}
                  onClick={() => toggleSideMode('redact')}
                >
                  Black out
                </button>
                <button
                  type="button"
                  className={`btn img-editor-side-btn${sideMode === 'text' ? ' active' : ''}`}
                  onClick={() => toggleSideMode('text')}
                >
                  Add text
                </button>
                <p className="hint img-editor-side-hint">Click an existing label or blackout to select and move it.</p>
              </div>

              {selectedRedactId && !selectedTextId && (
                <button type="button" className="btn-link danger" onClick={deleteSelected}>
                  Delete selected
                </button>
              )}

              {(redacts.length > 0 || texts.length > 0) && !selectedTextId && !selectedRedactId && (
                <div className="img-editor-clear">
                  {redacts.length > 0 && (
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => {
                        liveRedactsRef.current = []
                        setRedacts([])
                        scheduleDraw()
                      }}
                    >
                      Clear all blackouts
                    </button>
                  )}
                  {texts.length > 0 && (
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => {
                        liveTextsRef.current = []
                        setTexts([])
                        scheduleDraw()
                      }}
                    >
                      Clear all text
                    </button>
                  )}
                </div>
              )}
            </aside>
          </>
        )}
      </div>
    </ToolPage>
  )
}
