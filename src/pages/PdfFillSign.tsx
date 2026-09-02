import { useCallback, useEffect, useRef, useState } from 'react'
import ToolPage from '../components/ToolPage'
import Dropzone from '../components/Dropzone'
import ColorPicker from '../components/ColorPicker'
import { downloadBlob, readFileAsArrayBuffer, sanitizeFilename } from '../lib/images'
import { toFileList } from '../lib/fileStore'
import { useClipboardPaste } from '../lib/useClipboardPaste'
import { usePendingFiles } from '../lib/usePendingFiles'
import {
  detectAcroFormFields,
  detectBlankLineFields,
  getPdfJsDocument,
  loadPdfLib,
  mergeDetectedFields,
  releasePdfJsDocument,
  releasePdfLibDocument,
  renderPdfPageToCanvas,
  type DetectedField,
} from '../lib/pdf-utils'
import { loadSavedSignature, saveSavedSignature } from '../lib/storage'

type Mode = 'text' | 'sign' | 'select' | 'mark' | 'fill'
type MarkKind = 'check' | 'cross'

interface TextAnn {
  id: string
  pageIndex: number
  /** Normalized 0–1 from top-left */
  x: number
  y: number
  text: string
  /** Fraction of page height */
  fontSize: number
  color: string
  /** Optional field box (normalized) — text is clipped / auto-sized to fit */
  w?: number
  h?: number
  fieldId?: string
}

interface SigStamp {
  id: string
  pageIndex: number
  x: number
  y: number
  w: number
  h: number
  imageDataUrl: string
}

interface MarkAnn {
  id: string
  pageIndex: number
  /** Top-left, normalized 0–1 */
  x: number
  y: number
  /** Side length as fraction of page height (square) */
  size: number
  kind: MarkKind
  color: string
  fieldId?: string
}

type DragKind =
  | { kind: 'text'; id: string; startX: number; startY: number; origX: number; origY: number }
  | { kind: 'sig'; id: string; startX: number; startY: number; origX: number; origY: number }
  | { kind: 'sig-resize'; id: string; startX: number; startY: number; origW: number; origH: number; origX: number; origY: number }
  | { kind: 'mark'; id: string; startX: number; startY: number; origX: number; origY: number }
  | { kind: 'mark-resize'; id: string; startX: number; startY: number; origSize: number }
  | { kind: 'pan'; startX: number; startY: number; origPanX: number; origPanY: number }

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = Number.parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? ''
  const bin = atob(base64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function downloadPdfBytes(bytes: Uint8Array, filename: string) {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  downloadBlob(new Blob([ab], { type: 'application/pdf' }), filename)
}

interface TextFieldsProps {
  text: string
  sizePx: number
  color: string
  onText: (value: string) => void
  onSizePx: (value: number) => void
  onColor: (value: string) => void
}

function TextFields({ text, sizePx, color, onText, onSizePx, onColor }: TextFieldsProps) {
  return (
    <div className="img-editor-text-opts">
      <label className="field">
        <span>Label</span>
        <input value={text} onChange={(e) => onText(e.target.value)} autoFocus />
      </label>
      <label className="field">
        <span>Size ({sizePx}px)</span>
        <input
          type="range"
          min={10}
          max={72}
          value={sizePx}
          onChange={(e) => onSizePx(Number(e.target.value))}
        />
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

function estimateTextWidthNorm(t: TextAnn): number {
  return Math.max(0.04, t.text.length * t.fontSize * 0.55)
}

function textPopoverPos(t: TextAnn, stageW: number, stageH: number) {
  const pad = 8
  const popW = 236
  const popH = 200
  const textW = estimateTextWidthNorm(t) * stageW
  const textX = t.x * stageW
  const textY = t.y * stageH
  const textH = (t.fontSize + 0.008) * stageH

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

function markPopoverPos(m: MarkAnn, stageW: number, stageH: number, aspect: number) {
  const pad = 8
  const popW = 236
  const popH = 180
  const markW = m.size * aspect * stageW
  const markH = m.size * stageH
  const markX = m.x * stageW
  const markY = m.y * stageH

  let left = markX + markW + 12
  let top = markY

  if (left + popW > stageW - pad) left = markX - popW - 12
  if (left < pad) {
    left = pad
    top = markY + markH + 12
  }
  if (top + popH > stageH - pad) top = Math.max(pad, stageH - popH - pad)
  if (top < pad) top = pad

  return { left, top }
}

function MarkIcon({ kind }: { kind: MarkKind }) {
  if (kind === 'check') {
    return (
      <svg className="pdf-fill-mark-svg" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M5 12.5l5 5L19 6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg className="pdf-fill-mark-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Font size as fraction of page height so text fits inside a field box. */
function fitFontSizeForField(hNorm: number, text: string, wNorm: number, pageAspect: number): number {
  const byHeight = hNorm * 0.72
  const chars = Math.max(1, text.length)
  // Approximate glyph width ≈ 0.55em; pageAspect = pdfH/pdfW so w in height-units = wNorm / pageAspect * ... 
  // width in "height fractions" ≈ wNorm * (pdfW/pdfH) = wNorm / pageAspect
  const widthInHeightUnits = pageAspect > 0 ? wNorm / pageAspect : wNorm
  const byWidth = (widthInHeightUnits * 0.92) / (chars * 0.55)
  return Math.max(0.01, Math.min(byHeight, byWidth, 0.06))
}

export default function PdfFillSign() {
  const [file, setFile] = useState<File | null>(null)
  const [docId, setDocId] = useState<string | null>(null)
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [pageIndex, setPageIndex] = useState(1)
  const [pageSize, setPageSize] = useState({ w: 0, h: 0, pdfW: 0, pdfH: 0 })
  const [pageUrl, setPageUrl] = useState<string | null>(null)
  const [loadingPage, setLoadingPage] = useState(false)
  const [mode, setMode] = useState<Mode>('text')
  const [markKind, setMarkKind] = useState<MarkKind>('check')
  const [texts, setTexts] = useState<TextAnn[]>([])
  const [stamps, setStamps] = useState<SigStamp[]>([])
  const [marks, setMarks] = useState<MarkAnn[]>([])
  const [fields, setFields] = useState<DetectedField[]>([])
  const [detecting, setDetecting] = useState(false)
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [selectedStampId, setSelectedStampId] = useState<string | null>(null)
  const [selectedMarkId, setSelectedMarkId] = useState<string | null>(null)
  const [signatureSource, setSignatureSource] = useState<string | null>(() => loadSavedSignature())
  const [signPadOpen, setSignPadOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [viewScale, setViewScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [fitScale, setFitScale] = useState(1)

  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const drag = useRef<DragKind | null>(null)
  const pinch = useRef<{ dist: number; scale: number; panX: number; panY: number } | null>(null)
  const signCanvasRef = useRef<HTMLCanvasElement>(null)
  const signDrawing = useRef(false)
  const signHasInk = useRef(false)
  const [signDirty, setSignDirty] = useState(false)
  const pageRenderGen = useRef(0)

  const selectedText = texts.find((t) => t.id === selectedTextId) ?? null
  const selectedStamp = stamps.find((s) => s.id === selectedStampId) ?? null
  const selectedMark = marks.find((m) => m.id === selectedMarkId) ?? null

  const clearSelection = () => {
    setSelectedTextId(null)
    setSelectedStampId(null)
    setSelectedMarkId(null)
  }

  // Click outside the text/mark editor (rail, empty chrome, etc.) closes it
  useEffect(() => {
    if (!selectedTextId && !selectedMarkId && !selectedStampId) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null
      if (!t) return
      if (t.closest('.pdf-fill-text-popover')) return
      if (t.closest('.pdf-fill-ann.selected')) return
      if (t.closest('.pdf-fill-field-hotspot')) return
      if (t.closest('.pdf-fill-text-sheet')) return
      if (t.closest('.pdf-fill-sign-sheet')) return
      clearSelection()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [selectedTextId, selectedMarkId, selectedStampId])

  const resetDoc = useCallback(() => {
    if (docId) {
      releasePdfJsDocument(docId)
      releasePdfLibDocument(docId)
    }
    if (pageUrl) URL.revokeObjectURL(pageUrl)
    setFile(null)
    setDocId(null)
    setBytes(null)
    setPageCount(0)
    setPageIndex(1)
    setPageSize({ w: 0, h: 0, pdfW: 0, pdfH: 0 })
    setPageUrl(null)
    setTexts([])
    setStamps([])
    setMarks([])
    setFields([])
    setSelectedTextId(null)
    setSelectedStampId(null)
    setSelectedMarkId(null)
    setSignPadOpen(false)
    setMessage(null)
    setViewScale(1)
    setPan({ x: 0, y: 0 })
    setMode('text')
  }, [docId, pageUrl])

  const onPick = async (files: FileList) => {
    const f = files[0]
    if (!f) return
    if (docId) {
      releasePdfJsDocument(docId)
      releasePdfLibDocument(docId)
    }
    if (pageUrl) URL.revokeObjectURL(pageUrl)
    const ab = await readFileAsArrayBuffer(f)
    // Keep a stable copy for pdf-lib; give pdf.js its own buffer (may transfer).
    const forViewer = ab.slice(0)
    const forExport = ab.slice(0)
    const id = `fill-${Date.now()}`
    const doc = await getPdfJsDocument(id, forViewer)
    setFile(f)
    setDocId(id)
    setBytes(forExport)
    setPageCount(doc.numPages)
    setPageIndex(1)
    setPageUrl(null)
    setTexts([])
    setStamps([])
    setMarks([])
    setFields([])
    setSelectedTextId(null)
    setSelectedStampId(null)
    setSelectedMarkId(null)
    setSignPadOpen(false)
    setMessage(null)
    setPan({ x: 0, y: 0 })
    setViewScale(1)
    setDetecting(true)
    try {
      const acro = await detectAcroFormFields(forExport.slice(0))
      setFields(acro)
      if (acro.length > 0) {
        setMode('fill')
        setMessage(`Found ${acro.length} form field${acro.length !== 1 ? 's' : ''}. Tap one to fill.`)
      } else {
        setMode('fill')
        setMessage('Scanning for blank lines…')
      }
    } catch {
      setFields([])
      setMode('text')
    } finally {
      setDetecting(false)
    }
  }

  usePendingFiles('/pdf/fill-sign', (pending) => {
    if (pending.length) void onPick(toFileList(pending))
  })

  useClipboardPaste(onPick, { accept: 'application/pdf', enabled: Boolean(bytes), multiple: false })

  useEffect(() => {
    return () => {
      if (docId) {
        releasePdfJsDocument(docId)
        releasePdfLibDocument(docId)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- release only on unmount
  }, [])

  // Render current page
  useEffect(() => {
    if (!docId || !bytes) return
    const gen = ++pageRenderGen.current
    let cancelled = false
    setLoadingPage(true)
    void (async () => {
      try {
        const render = await renderPdfPageToCanvas(docId, bytes, pageIndex, 1.75)
        if (cancelled || gen !== pageRenderGen.current) return
        const blob = await new Promise<Blob>((resolve, reject) =>
          render.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
        )
        if (cancelled || gen !== pageRenderGen.current) return
        setPageUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return URL.createObjectURL(blob)
        })
        setPageSize({ w: render.width, h: render.height, pdfW: render.pdfWidth, pdfH: render.pdfHeight })
      } catch (e) {
        if (!cancelled) setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        if (!cancelled && gen === pageRenderGen.current) setLoadingPage(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [docId, bytes, pageIndex])

  // Detect blank-line fields after page render (pdf.js worker serializes poorly
  // when getOperatorList races page.render on the same document).
  useEffect(() => {
    if (!docId || !bytes || loadingPage || !pageUrl) return
    let cancelled = false
    void (async () => {
      try {
        const blanks = await detectBlankLineFields(docId, bytes, pageIndex)
        if (cancelled) return
        setFields((prev) => {
          const acroAll = prev.filter((f) => f.source === 'acroform')
          const blanksOther = prev.filter((f) => f.source === 'blank' && f.pageIndex !== pageIndex)
          return mergeDetectedFields([...acroAll, ...blanksOther], blanks)
        })
        const pageCount = blanks.length
        if (pageCount > 0) {
          setMode('fill')
          setMessage(
            `Found ${pageCount} fillable area${pageCount !== 1 ? 's' : ''} on this page. Tap one to fill.`,
          )
        } else {
          setMessage((prev) =>
            prev?.startsWith('Scanning') ? 'No auto-detected fields on this page. Use Text / ✓ / Sign.' : prev,
          )
        }
      } catch {
        if (!cancelled) {
          setMessage((prev) =>
            prev?.startsWith('Scanning') ? 'No auto-detected fields on this page. Use Text / ✓ / Sign.' : prev,
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [docId, bytes, pageIndex, loadingPage, pageUrl])

  // Fit page into wrap
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || !pageSize.w) return
    const measure = () => {
      const pad = 24
      const availW = Math.max(120, wrap.clientWidth - pad)
      const availH = Math.max(120, wrap.clientHeight - pad)
      const s = Math.min(availW / pageSize.w, availH / pageSize.h, 1.4)
      setFitScale(s)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [pageSize.w, pageSize.h])

  const displayScale = fitScale * viewScale

  const clientToNorm = (clientX: number, clientY: number) => {
    const stage = stageRef.current
    if (!stage || !pageSize.w) return null
    const rect = stage.getBoundingClientRect()
    const x = (clientX - rect.left) / rect.width
    const y = (clientY - rect.top) / rect.height
    return { x: clamp01(x), y: clamp01(y) }
  }

  const updateText = (id: string, patch: Partial<TextAnn>) => {
    setTexts((list) =>
      list.map((t) => {
        if (t.id !== id) return t
        const next = { ...t, ...patch }
        if (next.w != null && next.h != null && (patch.text !== undefined || patch.w || patch.h)) {
          const aspect =
            pageSize.pdfW > 0 && pageSize.pdfH > 0 ? pageSize.pdfH / pageSize.pdfW : 1
          next.fontSize = fitFontSizeForField(next.h, next.text || ' ', next.w, aspect)
        }
        return next
      }),
    )
  }

  const activateField = (field: DetectedField) => {
    if (field.kind === 'checkbox') {
      const existing = marks.find((m) => m.fieldId === field.id)
      if (existing) {
        setMarks((list) => list.filter((m) => m.id !== existing.id))
        setSelectedMarkId(null)
        return
      }
      const aspect =
        pageSize.pdfW > 0 && pageSize.pdfH > 0 ? pageSize.pdfH / pageSize.pdfW : 1
      const size = field.h * 0.9
      const wNorm = size / Math.max(aspect, 0.001)
      const mark: MarkAnn = {
        id: nextId('mark'),
        pageIndex: field.pageIndex,
        x: field.x + (field.w - wNorm) / 2,
        y: field.y + field.h * 0.05,
        size,
        kind: 'check',
        color: '#111111',
        fieldId: field.id,
      }
      setMarks((m) => [...m, mark])
      setSelectedMarkId(mark.id)
      setSelectedTextId(null)
      setSelectedStampId(null)
      setMode('fill')
      return
    }

    const existing = texts.find((t) => t.fieldId === field.id)
    if (existing) {
      setSelectedTextId(existing.id)
      setSelectedStampId(null)
      setSelectedMarkId(null)
      return
    }

    const aspect =
      pageSize.pdfW > 0 && pageSize.pdfH > 0 ? pageSize.pdfH / pageSize.pdfW : 1
    const fontSize = fitFontSizeForField(field.h * 0.9, 'Text', field.w, aspect)
    const id = nextId('txt')
    // Match hotspot rect closely — extra y inset made filled text sit too low (hyp D).
    const ann: TextAnn = {
      id,
      pageIndex: field.pageIndex,
      x: field.x + field.w * 0.015,
      y: field.y + field.h * 0.02,
      text: '',
      fontSize,
      color: '#111111',
      w: field.w * 0.97,
      h: field.h * 0.96,
      fieldId: field.id,
    }
    setTexts((t) => [...t, ann])
    setSelectedTextId(id)
    setSelectedStampId(null)
    setSelectedMarkId(null)
    setMode('fill')
  }

  const updateMark = (id: string, patch: Partial<MarkAnn>) => {
    setMarks((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  const placeText = (nx: number, ny: number) => {
    const id = nextId('txt')
    const defaultPx = 18
    const fontSize = pageSize.pdfH > 0 ? defaultPx / pageSize.pdfH : 0.028
    const ann: TextAnn = {
      id,
      pageIndex,
      x: clamp01(nx),
      y: clamp01(ny),
      text: 'Text',
      fontSize,
      color: '#111111',
    }
    setTexts((t) => [...t, ann])
    setSelectedTextId(id)
    setSelectedStampId(null)
    setSelectedMarkId(null)
  }

  const placeStamp = (nx: number, ny: number) => {
    if (!signatureSource) {
      setSignPadOpen(true)
      return
    }
    const id = nextId('sig')
    const w = 0.28
    const h = 0.1
    const stamp: SigStamp = {
      id,
      pageIndex,
      x: clamp01(nx - w / 2),
      y: clamp01(ny - h / 2),
      w,
      h,
      imageDataUrl: signatureSource,
    }
    setStamps((s) => [...s, stamp])
    setSelectedStampId(id)
    setSelectedTextId(null)
    setSelectedMarkId(null)
  }

  const placeMark = (nx: number, ny: number) => {
    const id = nextId('mark')
    const size = pageSize.pdfH > 0 ? 18 / pageSize.pdfH : 0.028
    const aspect = pageSize.pdfH > 0 && pageSize.pdfW > 0 ? pageSize.pdfH / pageSize.pdfW : 1
    const wNorm = size * aspect
    const mark: MarkAnn = {
      id,
      pageIndex,
      x: clamp01(nx - wNorm / 2),
      y: clamp01(ny - size / 2),
      size,
      kind: markKind,
      color: '#111111',
    }
    setMarks((m) => [...m, mark])
    setSelectedMarkId(id)
    setSelectedTextId(null)
    setSelectedStampId(null)
  }

  const onStagePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('.pdf-fill-text-popover')) return

    // Click outside the edit popover / selected annotation → close editor
    if (selectedTextId || selectedMarkId || selectedStampId) {
      const onSelected = target.closest('.pdf-fill-ann.selected')
      if (!onSelected) {
        clearSelection()
        // Don't also place a new annotation on the dismiss click
        if (mode === 'text' || mode === 'fill' || mode === 'select') return
      }
    }

    if (target.closest('.pdf-fill-ann') || target.closest('.pdf-fill-text-sheet')) return

    const norm = clientToNorm(e.clientX, e.clientY)
    if (!norm) return

    if (mode === 'text') {
      placeText(norm.x, norm.y)
      return
    }
    if (mode === 'sign') {
      placeStamp(norm.x, norm.y)
      return
    }
    if (mode === 'mark') {
      placeMark(norm.x, norm.y)
      return
    }
    if (mode === 'fill') {
      return
    }
    if (viewScale > 1.02) {
      drag.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
      }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
  }

  const onStagePointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    if (d.kind === 'pan') {
      setPan({
        x: d.origPanX + (e.clientX - d.startX),
        y: d.origPanY + (e.clientY - d.startY),
      })
      return
    }
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const dx = (e.clientX - d.startX) / rect.width
    const dy = (e.clientY - d.startY) / rect.height
    if (d.kind === 'text') {
      setTexts((list) =>
        list.map((t) =>
          t.id === d.id ? { ...t, x: clamp01(d.origX + dx), y: clamp01(d.origY + dy) } : t,
        ),
      )
    } else if (d.kind === 'sig') {
      setStamps((list) =>
        list.map((s) =>
          s.id === d.id ? { ...s, x: clamp01(d.origX + dx), y: clamp01(d.origY + dy) } : s,
        ),
      )
    } else if (d.kind === 'sig-resize') {
      setStamps((list) =>
        list.map((s) => {
          if (s.id !== d.id) return s
          const w = Math.max(0.06, Math.min(0.9, d.origW + dx))
          const h = Math.max(0.03, Math.min(0.6, d.origH + dy))
          return { ...s, w, h }
        }),
      )
    } else if (d.kind === 'mark') {
      setMarks((list) =>
        list.map((m) =>
          m.id === d.id ? { ...m, x: clamp01(d.origX + dx), y: clamp01(d.origY + dy) } : m,
        ),
      )
    } else if (d.kind === 'mark-resize') {
      setMarks((list) =>
        list.map((m) => {
          if (m.id !== d.id) return m
          const size = Math.max(0.012, Math.min(0.12, d.origSize + dy))
          return { ...m, size }
        }),
      )
    }
  }

  const onStagePointerUp = (e: React.PointerEvent) => {
    drag.current = null
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const startTextDrag = (e: React.PointerEvent, id: string) => {
    e.stopPropagation()
    e.preventDefault()
    const t = texts.find((x) => x.id === id)
    if (!t) return
    setSelectedTextId(id)
    setSelectedStampId(null)
    setSelectedMarkId(null)
    if (mode === 'text' || mode === 'mark') setMode('select')
    drag.current = {
      kind: 'text',
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: t.x,
      origY: t.y,
    }
    stageRef.current?.setPointerCapture(e.pointerId)
  }

  const startSigDrag = (e: React.PointerEvent, id: string) => {
    e.stopPropagation()
    e.preventDefault()
    const s = stamps.find((x) => x.id === id)
    if (!s) return
    setSelectedStampId(id)
    setSelectedTextId(null)
    setSelectedMarkId(null)
    if (mode === 'sign' || mode === 'mark') setMode('select')
    drag.current = {
      kind: 'sig',
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: s.x,
      origY: s.y,
    }
    stageRef.current?.setPointerCapture(e.pointerId)
  }

  const startSigResize = (e: React.PointerEvent, id: string) => {
    e.stopPropagation()
    e.preventDefault()
    const s = stamps.find((x) => x.id === id)
    if (!s) return
    setSelectedStampId(id)
    drag.current = {
      kind: 'sig-resize',
      id,
      startX: e.clientX,
      startY: e.clientY,
      origW: s.w,
      origH: s.h,
      origX: s.x,
      origY: s.y,
    }
    stageRef.current?.setPointerCapture(e.pointerId)
  }

  const startMarkDrag = (e: React.PointerEvent, id: string) => {
    e.stopPropagation()
    e.preventDefault()
    const m = marks.find((x) => x.id === id)
    if (!m) return
    setSelectedMarkId(id)
    setSelectedTextId(null)
    setSelectedStampId(null)
    if (mode === 'mark') setMode('select')
    drag.current = {
      kind: 'mark',
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: m.x,
      origY: m.y,
    }
    stageRef.current?.setPointerCapture(e.pointerId)
  }

  const startMarkResize = (e: React.PointerEvent, id: string) => {
    e.stopPropagation()
    e.preventDefault()
    const m = marks.find((x) => x.id === id)
    if (!m) return
    setSelectedMarkId(id)
    drag.current = {
      kind: 'mark-resize',
      id,
      startX: e.clientX,
      startY: e.clientY,
      origSize: m.size,
    }
    stageRef.current?.setPointerCapture(e.pointerId)
  }

  // Pinch zoom on wrap
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const [a, b] = [e.touches[0], e.touches[1]]
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
        pinch.current = { dist, scale: viewScale, panX: pan.x, panY: pan.y }
        drag.current = null
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinch.current) {
        e.preventDefault()
        const [a, b] = [e.touches[0], e.touches[1]]
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
        const next = Math.max(0.6, Math.min(4, pinch.current.scale * (dist / pinch.current.dist)))
        setViewScale(next)
      }
    }
    const onTouchEnd = () => {
      if (!pinch.current) return
      pinch.current = null
    }
    wrap.addEventListener('touchstart', onTouchStart, { passive: true })
    wrap.addEventListener('touchmove', onTouchMove, { passive: false })
    wrap.addEventListener('touchend', onTouchEnd)
    wrap.addEventListener('touchcancel', onTouchEnd)
    return () => {
      wrap.removeEventListener('touchstart', onTouchStart)
      wrap.removeEventListener('touchmove', onTouchMove)
      wrap.removeEventListener('touchend', onTouchEnd)
      wrap.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [viewScale, pan.x, pan.y])

  // Signature pad drawing
  const initSignPad = useCallback(() => {
    const canvas = signCanvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    const w = parent?.clientWidth ?? 320
    const h = Math.max(180, Math.round(w * 0.45))
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#111111'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    signHasInk.current = false
    setSignDirty(false)
  }, [])

  useEffect(() => {
    if (!signPadOpen) return
    const t = window.setTimeout(initSignPad, 30)
    return () => window.clearTimeout(t)
  }, [signPadOpen, initSignPad])

  const signPointer = (e: React.PointerEvent<HTMLCanvasElement>, type: 'down' | 'move' | 'up') => {
    const canvas = signCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const ctx = canvas.getContext('2d')!
    if (type === 'down') {
      signDrawing.current = true
      ctx.beginPath()
      ctx.moveTo(x, y)
      canvas.setPointerCapture(e.pointerId)
    } else if (type === 'move' && signDrawing.current) {
      ctx.lineTo(x, y)
      ctx.stroke()
      signHasInk.current = true
      setSignDirty(true)
    } else if (type === 'up') {
      signDrawing.current = false
    }
  }

  const clearSignPad = () => initSignPad()

  const useSignPad = () => {
    const canvas = signCanvasRef.current
    if (!canvas || !signHasInk.current) return
    // Trim whitespace for cleaner stamp
    const ctx = canvas.getContext('2d')!
    const dpr = canvas.width / Math.max(1, canvas.clientWidth)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let minX = canvas.width
    let minY = canvas.height
    let maxX = 0
    let maxY = 0
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4
        const a = imageData.data[i + 3]
        const r = imageData.data[i]
        const g = imageData.data[i + 1]
        const b = imageData.data[i + 2]
        // non-white ink
        if (a > 10 && (r < 250 || g < 250 || b < 250)) {
          if (x < minX) minX = x
          if (y < minY) minY = y
          if (x > maxX) maxX = x
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX <= minX || maxY <= minY) return
    const pad = Math.round(8 * dpr)
    minX = Math.max(0, minX - pad)
    minY = Math.max(0, minY - pad)
    maxX = Math.min(canvas.width - 1, maxX + pad)
    maxY = Math.min(canvas.height - 1, maxY + pad)
    const tw = maxX - minX + 1
    const th = maxY - minY + 1
    const out = document.createElement('canvas')
    out.width = tw
    out.height = th
    const octx = out.getContext('2d')!
    octx.drawImage(canvas, minX, minY, tw, th, 0, 0, tw, th)
    // Make white background transparent
    const od = octx.getImageData(0, 0, tw, th)
    for (let i = 0; i < od.data.length; i += 4) {
      if (od.data[i] > 245 && od.data[i + 1] > 245 && od.data[i + 2] > 245) {
        od.data[i + 3] = 0
      }
    }
    octx.putImageData(od, 0, 0)
    const url = out.toDataURL('image/png')
    setSignatureSource(url)
    saveSavedSignature(url)
    setSignPadOpen(false)
    setMode('sign')
    setMessage('Tap the page to place your signature.')
  }

  const forgetSignature = () => {
    setSignatureSource(null)
    saveSavedSignature(null)
    setSignPadOpen(false)
    setMessage('Saved signature cleared.')
  }

  const deleteSelected = () => {
    if (selectedTextId) {
      setTexts((t) => t.filter((x) => x.id !== selectedTextId))
      setSelectedTextId(null)
    }
    if (selectedStampId) {
      setStamps((s) => s.filter((x) => x.id !== selectedStampId))
      setSelectedStampId(null)
    }
    if (selectedMarkId) {
      setMarks((m) => m.filter((x) => x.id !== selectedMarkId))
      setSelectedMarkId(null)
    }
  }

  const exportPdf = async () => {
    if (!bytes || !file) return
    setBusy(true)
    setMessage(null)
    try {
      const { PDFDocument, rgb, StandardFonts, LineCapStyle } = await loadPdfLib()
      const out = await PDFDocument.load(bytes.slice(0), { ignoreEncryption: true })
      const font = await out.embedFont(StandardFonts.Helvetica)
      const pages = out.getPages()

      const pngCache = new Map<string, Awaited<ReturnType<typeof out.embedPng>>>()

      for (const t of texts) {
        const page = pages[t.pageIndex - 1]
        if (!page) continue
        const { width, height } = page.getSize()
        const size = Math.max(6, t.fontSize * height)
        const { r, g, b } = hexToRgb(t.color)
        const lines = (t.text || ' ').split('\n')
        let lineY = height - t.y * height - size * 0.85
        const maxWidth = t.w != null ? t.w * width : undefined
        for (const line of lines) {
          const safe = line.replace(/[^\x20-\x7E]/g, '?')
          page.drawText(safe || ' ', {
            x: t.x * width,
            y: lineY,
            size,
            font,
            color: rgb(r / 255, g / 255, b / 255),
            ...(maxWidth != null ? { maxWidth } : {}),
          })
          lineY -= size * 1.25
        }
      }

      for (const s of stamps) {
        const page = pages[s.pageIndex - 1]
        if (!page) continue
        const { width, height } = page.getSize()
        let img = pngCache.get(s.imageDataUrl)
        if (!img) {
          img = await out.embedPng(dataUrlToUint8Array(s.imageDataUrl))
          pngCache.set(s.imageDataUrl, img)
        }
        const w = s.w * width
        const h = s.h * height
        page.drawImage(img, {
          x: s.x * width,
          y: height - s.y * height - h,
          width: w,
          height: h,
        })
      }

      for (const m of marks) {
        const page = pages[m.pageIndex - 1]
        if (!page) continue
        const { width, height } = page.getSize()
        const side = Math.max(6, m.size * height)
        const x = m.x * width
        const y = height - m.y * height - side
        const { r, g, b } = hexToRgb(m.color)
        const color = rgb(r / 255, g / 255, b / 255)
        const thickness = Math.max(1.2, side * 0.12)
        if (m.kind === 'check') {
          page.drawLine({
            start: { x: x + side * 0.15, y: y + side * 0.48 },
            end: { x: x + side * 0.4, y: y + side * 0.22 },
            thickness,
            color,
            lineCap: LineCapStyle.Round,
          })
          page.drawLine({
            start: { x: x + side * 0.4, y: y + side * 0.22 },
            end: { x: x + side * 0.85, y: y + side * 0.78 },
            thickness,
            color,
            lineCap: LineCapStyle.Round,
          })
        } else {
          page.drawLine({
            start: { x: x + side * 0.18, y: y + side * 0.18 },
            end: { x: x + side * 0.82, y: y + side * 0.82 },
            thickness,
            color,
            lineCap: LineCapStyle.Round,
          })
          page.drawLine({
            start: { x: x + side * 0.82, y: y + side * 0.18 },
            end: { x: x + side * 0.18, y: y + side * 0.82 },
            thickness,
            color,
            lineCap: LineCapStyle.Round,
          })
        }
      }

      const saved = await out.save()
      const base = sanitizeFilename(file.name.replace(/\.pdf$/i, '') || 'document')
      downloadPdfBytes(saved, `filled-${base}.pdf`)
      setMessage('Downloaded filled PDF.')
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const pageTexts = texts.filter((t) => t.pageIndex === pageIndex)
  const pageStamps = stamps.filter((s) => s.pageIndex === pageIndex)
  const pageMarks = marks.filter((m) => m.pageIndex === pageIndex)
  const pageFields = fields.filter((f) => f.pageIndex === pageIndex)
  const annCount = texts.length + stamps.length + marks.length
  const stageW = pageSize.w * displayScale
  const stageH = pageSize.h * displayScale
  const pageAspect =
    pageSize.pdfW > 0 && pageSize.pdfH > 0 ? pageSize.pdfH / pageSize.pdfW : pageSize.h > 0 ? pageSize.h / pageSize.w : 1
  const textPopover =
    selectedText && stageW > 0 ? textPopoverPos(selectedText, stageW, stageH) : null
  const markPopover =
    selectedMark && stageW > 0 ? markPopoverPos(selectedMark, stageW, stageH, pageAspect) : null
  const selectedTextSizePx = selectedText
    ? Math.max(
        10,
        Math.min(72, Math.round(selectedText.fontSize * (pageSize.pdfH || 1))),
      )
    : 18
  const selectedMarkSizePx = selectedMark
    ? Math.max(10, Math.min(64, Math.round(selectedMark.size * (pageSize.pdfH || 1))))
    : 18

  return (
    <ToolPage
      eyebrow="PDF"
      title="Fill & Sign"
      hint="Auto-detects form fields and blank lines. Tap a field to type — text sizes to fit. Or add free text, checks, and signatures."
    >
      {!bytes ? (
        <div className="pdf-fill-empty">
          <Dropzone
            accept="application/pdf"
            multiple={false}
            label="Drop a PDF to fill or sign"
            hint="Works offline — nothing is uploaded."
            onFiles={onPick}
          />
        </div>
      ) : (
        <div className="pdf-fill-layout">
          <div className="pdf-fill-viewer" ref={wrapRef}>
            {loadingPage && <p className="hint pdf-fill-loading">Rendering page…</p>}
            {pageUrl && (
              <div
                className="pdf-fill-stage"
                ref={stageRef}
                style={{
                  width: pageSize.w * displayScale,
                  height: pageSize.h * displayScale,
                  transform: `translate(${pan.x}px, ${pan.y}px)`,
                }}
                onPointerDown={onStagePointerDown}
                onPointerMove={onStagePointerMove}
                onPointerUp={onStagePointerUp}
                onPointerCancel={onStagePointerUp}
              >
                <img
                  className="pdf-fill-page"
                  src={pageUrl}
                  alt={`Page ${pageIndex}`}
                  draggable={false}
                />
                <div className="pdf-fill-overlay" aria-hidden={false}>
                  {(mode === 'fill' || pageFields.length > 0) &&
                    pageFields.map((f) => {
                      const filled =
                        (f.kind === 'text' && texts.some((t) => t.fieldId === f.id && t.text.trim())) ||
                        (f.kind === 'checkbox' && marks.some((m) => m.fieldId === f.id))
                      return (
                        <button
                          key={f.id}
                          type="button"
                          className={`pdf-fill-field-hotspot${f.kind === 'checkbox' ? ' is-check' : ''}${filled ? ' filled' : ''}${
                            (selectedText?.fieldId === f.id || selectedMark?.fieldId === f.id) ? ' active' : ''
                          }`}
                          style={{
                            left: `${f.x * 100}%`,
                            top: `${f.y * 100}%`,
                            width: `${f.w * 100}%`,
                            height: `${f.h * 100}%`,
                          }}
                          title={f.name}
                          aria-label={f.kind === 'checkbox' ? `Checkbox ${f.name}` : `Fill ${f.name}`}
                          onPointerDown={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            setMode('fill')
                            activateField(f)
                          }}
                        />
                      )
                    })}
                  {pageTexts.map((t) => (
                    <div
                      key={t.id}
                      className={`pdf-fill-ann pdf-fill-text${t.w != null ? ' boxed' : ''}${selectedTextId === t.id ? ' selected' : ''}`}
                      style={{
                        left: `${t.x * 100}%`,
                        top: `${t.y * 100}%`,
                        ...(t.w != null && t.h != null
                          ? {
                              width: `${t.w * 100}%`,
                              height: `${t.h * 100}%`,
                              fontSize: `${t.fontSize * pageSize.h * displayScale}px`,
                            }
                          : {
                              fontSize: `${t.fontSize * pageSize.h * displayScale}px`,
                            }),
                        color: t.color,
                      }}
                      onPointerDown={(e) => startTextDrag(e, t.id)}
                    >
                      {t.text || (t.fieldId ? 'Tap to type…' : 'Text')}
                    </div>
                  ))}
                  {pageStamps.map((s) => (
                    <div
                      key={s.id}
                      className={`pdf-fill-ann pdf-fill-stamp${selectedStampId === s.id ? ' selected' : ''}`}
                      style={{
                        left: `${s.x * 100}%`,
                        top: `${s.y * 100}%`,
                        width: `${s.w * 100}%`,
                        height: `${s.h * 100}%`,
                      }}
                      onPointerDown={(e) => startSigDrag(e, s.id)}
                    >
                      <img src={s.imageDataUrl} alt="" draggable={false} />
                      {selectedStampId === s.id && (
                        <button
                          type="button"
                          className="pdf-fill-resize"
                          aria-label="Resize signature"
                          onPointerDown={(e) => startSigResize(e, s.id)}
                        />
                      )}
                    </div>
                  ))}
                  {pageMarks.map((m) => (
                    <div
                      key={m.id}
                      className={`pdf-fill-ann pdf-fill-mark${selectedMarkId === m.id ? ' selected' : ''}`}
                      style={{
                        left: `${m.x * 100}%`,
                        top: `${m.y * 100}%`,
                        width: `${m.size * pageAspect * 100}%`,
                        height: `${m.size * 100}%`,
                        color: m.color,
                      }}
                      onPointerDown={(e) => startMarkDrag(e, m.id)}
                    >
                      <MarkIcon kind={m.kind} />
                      {selectedMarkId === m.id && (
                        <button
                          type="button"
                          className="pdf-fill-resize"
                          aria-label="Resize mark"
                          onPointerDown={(e) => startMarkResize(e, m.id)}
                        />
                      )}
                    </div>
                  ))}
                </div>
                {selectedText && textPopover && (
                  <div
                    className="img-editor-text-popover pdf-fill-text-popover"
                    style={{ left: textPopover.left, top: textPopover.top }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <p className="img-editor-text-popover-title">Edit label</p>
                    <TextFields
                      text={selectedText.text}
                      sizePx={selectedTextSizePx}
                      color={selectedText.color}
                      onText={(value) => updateText(selectedText.id, { text: value })}
                      onSizePx={(px) => {
                        const h = pageSize.pdfH || 1
                        updateText(selectedText.id, { fontSize: px / h })
                      }}
                      onColor={(color) => updateText(selectedText.id, { color })}
                    />
                    <button type="button" className="btn-link danger" onClick={deleteSelected}>
                      Delete
                    </button>
                  </div>
                )}
                {selectedMark && markPopover && !selectedText && (
                  <div
                    className="img-editor-text-popover pdf-fill-text-popover"
                    style={{ left: markPopover.left, top: markPopover.top }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <p className="img-editor-text-popover-title">Edit mark</p>
                    <div className="img-editor-text-opts">
                      <div className="pdf-fill-mark-kind-row">
                        <button
                          type="button"
                          className={`btn pdf-fill-mark-kind-btn${selectedMark.kind === 'check' ? ' active' : ''}`}
                          onClick={() => updateMark(selectedMark.id, { kind: 'check' })}
                        >
                          ✓ Check
                        </button>
                        <button
                          type="button"
                          className={`btn pdf-fill-mark-kind-btn${selectedMark.kind === 'cross' ? ' active' : ''}`}
                          onClick={() => updateMark(selectedMark.id, { kind: 'cross' })}
                        >
                          ✕ Cross
                        </button>
                      </div>
                      <label className="field">
                        <span>Size ({selectedMarkSizePx}px)</span>
                        <input
                          type="range"
                          min={10}
                          max={64}
                          value={selectedMarkSizePx}
                          onChange={(e) => {
                            const h = pageSize.pdfH || 1
                            updateMark(selectedMark.id, { size: Number(e.target.value) / h })
                          }}
                        />
                      </label>
                      <label className="field">
                        <span>Color</span>
                        <div className="color-row">
                          <ColorPicker
                            value={selectedMark.color}
                            onChange={(color) => updateMark(selectedMark.id, { color })}
                            ariaLabel="Mark color"
                          />
                          <input
                            type="text"
                            value={selectedMark.color}
                            onChange={(e) => updateMark(selectedMark.id, { color: e.target.value })}
                          />
                        </div>
                      </label>
                    </div>
                    <button type="button" className="btn-link danger" onClick={deleteSelected}>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedStamp && !selectedText && !selectedMark && (
            <div className="pdf-fill-text-sheet">
              <p className="hint">Drag to move. Use the corner handle to resize.</p>
              <div className="pdf-fill-sheet-actions">
                <button type="button" className="btn" onClick={deleteSelected}>
                  Delete
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setSelectedStampId(null)}
                >
                  Done
                </button>
              </div>
            </div>
          )}

          <div className="pdf-fill-rail" role="toolbar" aria-label="Fill and sign tools">
            <div className="pdf-fill-rail-modes">
              <button
                type="button"
                className={`pdf-fill-rail-btn${mode === 'fill' ? ' active' : ''}`}
                onClick={() => {
                  setMode('fill')
                  clearSelection()
                  setMessage(
                    pageFields.length
                      ? `${pageFields.length} field${pageFields.length !== 1 ? 's' : ''} on this page — tap to fill.`
                      : 'No fields on this page. Try Text mode or another page.',
                  )
                }}
              >
                Fields
              </button>
              <button
                type="button"
                className={`pdf-fill-rail-btn${mode === 'text' ? ' active' : ''}`}
                onClick={() => {
                  setMode('text')
                  setSelectedStampId(null)
                  setSelectedMarkId(null)
                }}
              >
                Text
              </button>
              <button
                type="button"
                className={`pdf-fill-rail-btn${mode === 'mark' && markKind === 'check' ? ' active' : ''}`}
                onClick={() => {
                  setMarkKind('check')
                  setMode('mark')
                  clearSelection()
                }}
                aria-label="Check mark"
                title="Check"
              >
                ✓
              </button>
              <button
                type="button"
                className={`pdf-fill-rail-btn${mode === 'mark' && markKind === 'cross' ? ' active' : ''}`}
                onClick={() => {
                  setMarkKind('cross')
                  setMode('mark')
                  clearSelection()
                }}
                aria-label="Cross mark"
                title="Cross"
              >
                ✕
              </button>
              <button
                type="button"
                className={`pdf-fill-rail-btn${mode === 'sign' ? ' active' : ''}`}
                onClick={() => {
                  setMode('sign')
                  setSelectedTextId(null)
                  setSelectedMarkId(null)
                  if (!signatureSource) setSignPadOpen(true)
                }}
              >
                Sign
              </button>
              <button
                type="button"
                className={`pdf-fill-rail-btn${mode === 'select' ? ' active' : ''}`}
                onClick={() => setMode('select')}
              >
                Move
              </button>
            </div>
            <div className="pdf-fill-rail-nav">
              <button
                type="button"
                className="pdf-fill-rail-btn"
                disabled={pageIndex <= 1}
                onClick={() => {
                  setPageIndex((p) => Math.max(1, p - 1))
                  clearSelection()
                  setPan({ x: 0, y: 0 })
                }}
                aria-label="Previous page"
              >
                ‹
              </button>
              <span className="pdf-fill-page-label">
                {pageIndex}/{pageCount}
              </span>
              <button
                type="button"
                className="pdf-fill-rail-btn"
                disabled={pageIndex >= pageCount}
                onClick={() => {
                  setPageIndex((p) => Math.min(pageCount, p + 1))
                  clearSelection()
                  setPan({ x: 0, y: 0 })
                }}
                aria-label="Next page"
              >
                ›
              </button>
            </div>
            <div className="pdf-fill-rail-zoom">
              <button
                type="button"
                className="pdf-fill-rail-btn"
                onClick={() => setViewScale((s) => Math.max(0.6, s - 0.2))}
                aria-label="Zoom out"
              >
                −
              </button>
              <button
                type="button"
                className="pdf-fill-rail-btn"
                onClick={() => {
                  setViewScale(1)
                  setPan({ x: 0, y: 0 })
                }}
              >
                Fit
              </button>
              <button
                type="button"
                className="pdf-fill-rail-btn"
                onClick={() => setViewScale((s) => Math.min(4, s + 0.2))}
                aria-label="Zoom in"
              >
                +
              </button>
            </div>
            <div className="pdf-fill-rail-actions">
              {signatureSource && (
                <button type="button" className="pdf-fill-rail-btn" onClick={() => setSignPadOpen(true)}>
                  Redraw
                </button>
              )}
              <button type="button" className="pdf-fill-rail-btn" onClick={resetDoc}>
                New
              </button>
              <button
                type="button"
                className="btn primary pdf-fill-download"
                disabled={busy || annCount === 0}
                onClick={() => void exportPdf()}
              >
                {busy ? 'Saving…' : 'Download'}
              </button>
            </div>
          </div>

          {message && <p className="hint pdf-fill-message">{message}</p>}
          <p className="hint meta pdf-fill-meta">
            {file?.name} · {annCount} annotation{annCount !== 1 ? 's' : ''}
            {mode === 'fill' && ' · Tap a highlighted field to fill'}
            {mode === 'text' && ' · Tap page to add text'}
            {mode === 'mark' && markKind === 'check' && ' · Tap to place a check'}
            {mode === 'mark' && markKind === 'cross' && ' · Tap to place a cross'}
            {mode === 'sign' && (signatureSource ? ' · Tap page to place signature' : ' · Draw a signature first')}
            {mode === 'select' && ' · Drag annotations to move'}
            {detecting && ' · Detecting fields…'}
            {!detecting && fields.length > 0 && ` · ${fields.length} field${fields.length !== 1 ? 's' : ''} detected`}
          </p>
        </div>
      )}

      {signPadOpen && (
        <div className="pdf-fill-sheet-backdrop" role="presentation" onClick={() => setSignPadOpen(false)}>
          <div
            className="pdf-fill-sign-sheet"
            role="dialog"
            aria-label="Draw signature"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pdf-fill-sign-head">
              <h2>Draw signature</h2>
              <button type="button" className="btn-link" onClick={() => setSignPadOpen(false)}>
                Close
              </button>
            </div>
            <p className="hint">Use your finger or stylus. Saved on this device after you tap Use.</p>
            <div className="pdf-fill-sign-canvas-wrap">
              <canvas
                ref={signCanvasRef}
                className="pdf-fill-sign-canvas"
                onPointerDown={(e) => signPointer(e, 'down')}
                onPointerMove={(e) => signPointer(e, 'move')}
                onPointerUp={(e) => signPointer(e, 'up')}
                onPointerCancel={(e) => signPointer(e, 'up')}
              />
            </div>
            <div className="pdf-fill-sign-actions">
              {signatureSource && (
                <button type="button" className="btn-link danger" onClick={forgetSignature}>
                  Forget saved
                </button>
              )}
              <button type="button" className="btn" onClick={clearSignPad}>
                Clear
              </button>
              <button type="button" className="btn primary" disabled={!signDirty} onClick={useSignPad}>
                Use signature
              </button>
            </div>
          </div>
        </div>
      )}
    </ToolPage>
  )
}
