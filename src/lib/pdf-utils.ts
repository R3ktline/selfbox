import type { PDFDocument } from 'pdf-lib'
import type * as PdfJs from 'pdfjs-dist'

type PdfLibModule = typeof import('pdf-lib')

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null
let pdfLibPromise: Promise<PdfLibModule> | null = null
const pdfjsDocCache = new Map<string, Promise<PdfJs.PDFDocumentProxy>>()
const pdfLibDocCache = new Map<string, PDFDocument>()

const THUMB_SCALE = 0.45
const THUMB_JPEG_QUALITY = 0.65

export async function loadPdfJs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then(async (pdfjs) => {
      // pdf.js 6 uses Map#getOrInsertComputed (ES2025); polyfill for Electron/older Chromium.
      const proto = Map.prototype as Map<unknown, unknown> & {
        getOrInsertComputed?: (key: unknown, callback: (key: unknown) => unknown) => unknown
      }
      if (typeof proto.getOrInsertComputed !== 'function') {
        proto.getOrInsertComputed = function (key, callback) {
          if (this.has(key)) return this.get(key)
          const value = callback(key)
          this.set(key, value)
          return value
        }
      }
      const workerSrc = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc as string
      return pdfjs
    })
  }
  return pdfjsPromise
}

export async function loadPdfLib(): Promise<PdfLibModule> {
  if (!pdfLibPromise) pdfLibPromise = import('pdf-lib')
  return pdfLibPromise
}

export async function getPdfJsDocument(docId: string, bytes: ArrayBuffer): Promise<PdfJs.PDFDocumentProxy> {
  let pending = pdfjsDocCache.get(docId)
  if (!pending) {
    pending = loadPdfJs().then((pdfjs) => pdfjs.getDocument({ data: bytes }).promise)
    pdfjsDocCache.set(docId, pending)
  }
  return pending
}

export async function loadPdfLibDocument(cacheKey: string, bytes: ArrayBuffer): Promise<PDFDocument> {
  let doc = pdfLibDocCache.get(cacheKey)
  if (!doc) {
    const { PDFDocument } = await loadPdfLib()
    doc = await PDFDocument.load(bytes)
    pdfLibDocCache.set(cacheKey, doc)
  }
  return doc
}

export function releasePdfJsDocument(docId: string): void {
  const pending = pdfjsDocCache.get(docId)
  pdfjsDocCache.delete(docId)
  pending?.then((doc) => {
    const destroy = (doc as { destroy?: () => void }).destroy
    destroy?.()
  }).catch(() => {})
}

export function releasePdfLibDocument(docId: string): void {
  pdfLibDocCache.delete(docId)
}

export async function renderPdfPageThumbnail(
  docId: string,
  bytes: ArrayBuffer,
  pageIndex: number,
): Promise<string> {
  const doc = await getPdfJsDocument(docId, bytes)
  const page = await doc.getPage(pageIndex)
  const viewport = page.getViewport({ scale: THUMB_SCALE })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')!
  await page.render({ canvasContext: ctx, viewport, canvas }).promise
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', THUMB_JPEG_QUALITY),
  )
  return URL.createObjectURL(blob)
}

export interface PdfPageRender {
  /** Offscreen canvas with rendered page pixels */
  canvas: HTMLCanvasElement
  /** Display width in CSS pixels */
  width: number
  /** Display height in CSS pixels */
  height: number
  /** PDF page width in points */
  pdfWidth: number
  /** PDF page height in points */
  pdfHeight: number
}

/** Render a PDF page to a high-DPI canvas for interactive viewing. pageIndex is 1-based. */
export async function renderPdfPageToCanvas(
  docId: string,
  bytes: ArrayBuffer,
  pageIndex: number,
  cssScale = 1.5,
): Promise<PdfPageRender> {
  const doc = await getPdfJsDocument(docId, bytes)
  const page = await doc.getPage(pageIndex)
  const base = page.getViewport({ scale: 1 })
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2.5) : 1
  const renderScale = cssScale * dpr
  const viewport = page.getViewport({ scale: renderScale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')!
  await page.render({ canvasContext: ctx, viewport, canvas }).promise
  return {
    canvas,
    width: base.width * cssScale,
    height: base.height * cssScale,
    pdfWidth: base.width,
    pdfHeight: base.height,
  }
}

export type DetectedFieldKind = 'text' | 'checkbox'

/** Fillable region in normalized top-left coords (0–1). pageIndex is 1-based. */
export interface DetectedField {
  id: string
  pageIndex: number
  kind: DetectedFieldKind
  name: string
  x: number
  y: number
  w: number
  h: number
  source: 'acroform' | 'blank'
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  pad = 0.01,
): boolean {
  return !(
    a.x + a.w + pad < b.x ||
    b.x + b.w + pad < a.x ||
    a.y + a.h + pad < b.y ||
    b.y + b.h + pad < a.y
  )
}

/** Detect AcroForm text fields and checkboxes via pdf-lib. */
export async function detectAcroFormFields(bytes: ArrayBuffer): Promise<DetectedField[]> {
  const pdfLib = await loadPdfLib()
  const { PDFDocument, PDFTextField, PDFCheckBox } = pdfLib
  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(bytes.slice(0), { ignoreEncryption: true })
  } catch {
    return []
  }

  const out: DetectedField[] = []
  const pages = doc.getPages()
  let form
  try {
    form = doc.getForm()
  } catch {
    return []
  }

  const fields = form.getFields()
  for (const field of fields) {
    const isText = field instanceof PDFTextField
    const isCheck = field instanceof PDFCheckBox
    if (!isText && !isCheck) continue

    const name = field.getName()
    const widgets = field.acroField.getWidgets()
    widgets.forEach((widget, wi) => {
      const rect = widget.getRectangle()
      if (rect.width < 4 || rect.height < 4) return

      let page = doc.findPageForAnnotationRef(field.ref)
      if (!page) {
        try {
          const pref = widget.P()
          page = pages.find((p) => p.ref === pref)
        } catch {
          /* ignore */
        }
      }
      if (!page) return
      const pageIndex = pages.indexOf(page) + 1
      if (pageIndex < 1) return

      const { width: pw, height: ph } = page.getSize()
      if (pw <= 0 || ph <= 0) return

      out.push({
        id: `acro-${name}-${wi}`,
        pageIndex,
        kind: isCheck ? 'checkbox' : 'text',
        name: name || (isCheck ? 'Checkbox' : 'Text field'),
        x: rect.x / pw,
        y: (ph - rect.y - rect.height) / ph,
        w: rect.width / pw,
        h: rect.height / ph,
        source: 'acroform',
      })
    })
  }

  return out
}

const BLANK_RUN_RE = /(?:_|\uFF3F|\u2017){2,}|…{2,}|\.{3,}|–{2,}|—{2,}|-{3,}/g
/** Short boxed fields (camera, seria) are often ~55–70pt wide. */
const MIN_GAP_PT = 48
const RIGHT_MARGIN_PT = 36
const MAX_FIELD_WIDTH_FRAC = 0.72
const MAX_VECTOR_WIDTH_FRAC = 0.88
const MAX_TITLE_FONT_PT = 16

type TextItem = {
  str: string
  transform: number[]
  width: number
}

type FieldAlign = 'underline' | 'box'

type DrawnRect = { x: number; y: number; w: number; h: number }

function textFontHeight(transform: number[]): number {
  // [scaleX, skewY, skewX, scaleY, translateX, translateY]
  const [, , c, d] = transform
  return Math.hypot(c ?? 0, d ?? 0) || Math.abs(d ?? 0) || 10
}

/** Rough Latin glyph widths so underscore spans aren't skewed by proportional fonts. */
function approxTextWidth(text: string, fontHeight: number): number {
  let w = 0
  for (const ch of text) {
    if (ch === ' ') w += fontHeight * 0.28
    else if (ch === '_' || ch === '\uFF3F' || ch === '\u2017' || ch === '.' || ch === '-' || ch === '–' || ch === '—')
      w += fontHeight * 0.5
    else if ("iljI.,:;|!'".includes(ch)) w += fontHeight * 0.28
    else if ('mwMW@%'.includes(ch)) w += fontHeight * 0.82
    else w += fontHeight * 0.55
  }
  return Math.max(w, fontHeight * 0.2)
}

function textItemWidth(item: TextItem): number {
  const fh = textFontHeight(item.transform)
  return Math.max(item.width || 0, approxTextWidth(item.str, fh))
}

/** Reject titles, ALLCAPS noise, and prose so label-gaps stay on real form blanks. */
function isLikelyFieldLabel(label: string, fontHeight: number): boolean {
  const t = label.trim()
  if (t.length < 2 || t.length > 36) return false
  if (fontHeight > MAX_TITLE_FONT_PT) return false
  if (/^(I{1,3}|IV|V|VI{0,3})\.\s/i.test(t)) return false
  if (/^(CERERE|ANUL UNIVERSITAR|DATE PERSONALE|DATE CU PRIVIRE|DATE DESPRE)/i.test(t)) return false
  if (/^(În|In)\s+(căminele|caminele)/i.test(t)) return false
  if (/^(Subsemnatul|acordarea|Se acordă|media se|completează)/i.test(t)) return false
  if (/^[,.;)\]]/.test(t)) return false
  if (
    /^[a-zăâîșț]/.test(t) &&
    !/[A-ZĂÂÎȘȚ]/.test(t) &&
    !/^(nr|ap|etaj|bloc|strada|seria|camera|mail)\b/i.test(t)
  )
    return false
  if (/^[A-ZĂÂÎȘȚ]{4,}$/.test(t) && !t.includes(':')) return false
  if (/^[A-ZĂÂÎȘȚ0-9]{10,}$/.test(t) && !t.includes(':')) return false
  if (t.split(/\s+/).length > 5) return false
  if (/\.\s*$/.test(t) && t.length > 8) return false
  if (/Universit|Bucure|Secretariat|prelucrar|caracter personal/i.test(t)) return false
  return true
}

function pushNormalizedField(
  out: DetectedField[],
  pageIndex: number,
  pw: number,
  ph: number,
  opts: {
    id: string
    name: string
    xPdf: number
    baseline: number
    widthPt: number
    fontHeight: number
    align?: FieldAlign
  },
): void {
  const fh = Math.max(opts.fontHeight, 8)
  const align: FieldAlign = opts.align ?? 'box'
  const h = Math.max(align === 'underline' ? fh * 1.05 : fh * 1.35, align === 'underline' ? 10 : 12)
  // Underscore: sit entirely above the line (line = box baseline). Gap: text band.
  const ascent = align === 'underline' ? h : fh * 0.85
  const yTop = ph - opts.baseline - ascent
  const x = opts.xPdf / pw
  const y = yTop / ph
  const w = opts.widthPt / pw
  const hn = h / ph
  if (opts.widthPt < 16 || w < 0.022 || w > MAX_FIELD_WIDTH_FRAC) return
  if (hn < 0.008 || hn > 0.07) return
  if (x < 0 || y < -0.01 || x + w > 1.02 || y + hn > 1.02) return

  out.push({
    id: opts.id,
    pageIndex,
    kind: 'text',
    name: opts.name,
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    w: Math.max(0.02, Math.min(1 - x, w)),
    h: Math.max(0.01, Math.min(1 - y, hn)),
    source: 'blank',
  })
}

function dedupeDrawnRects(rects: DrawnRect[]): DrawnRect[] {
  const out: DrawnRect[] = []
  for (const r of rects) {
    if (
      out.some(
        (d) =>
          Math.abs(d.x - r.x) < 1.5 &&
          Math.abs(d.y - r.y) < 1.5 &&
          Math.abs(d.w - r.w) < 2 &&
          Math.abs(d.h - r.h) < 2,
      )
    )
      continue
    out.push(r)
  }
  return out
}

function labelRightEdge(item: TextItem): number {
  // Prefer pdf.js advance width for boundary tests — approx can overshoot into the box.
  const fh = textFontHeight(item.transform)
  if ((item.width || 0) > 0) return item.transform[4] + item.width
  return item.transform[4] + approxTextWidth(item.str, fh)
}

function nearestLabelForBox(box: DrawnRect, items: TextItem[]): string {
  const midY = box.y + box.h * 0.35
  let best: TextItem | null = null
  let bestDist = Infinity
  for (const item of items) {
    const str = item.str.trim()
    if (!str) continue
    if (/^[\s_….\-–—\uFF3F\u2017]+$/.test(str)) continue
    const baseline = item.transform[5]
    // Same visual row as the box (not labels from neighboring lines).
    if (baseline < box.y - 3 || baseline > box.y + box.h + 6) continue
    if (Math.abs(baseline - midY) > box.h * 0.85 + 4) continue
    const right = labelRightEdge(item)
    if (right > box.x + 4) continue
    const dist = box.x - right
    if (dist < -2 || dist > 48) continue
    if (dist < bestDist) {
      bestDist = dist
      best = item
    }
  }
  if (!best) return 'Field'
  BLANK_RUN_RE.lastIndex = 0
  const label = best.str.replace(BLANK_RUN_RE, '').trim()
  return (label || best.str.trim()).slice(0, 48) || 'Field'
}

/** Keep outer stroked input boxes; drop nested clip/text path duplicates. */
function preferOuterBoxes(boxes: DrawnRect[]): DrawnRect[] {
  const sorted = [...boxes].sort((a, b) => b.h - a.h || b.w - a.w)
  const kept: DrawnRect[] = []
  for (const b of sorted) {
    const nested = kept.some((k) => {
      const ox = Math.max(0, Math.min(k.x + k.w, b.x + b.w) - Math.max(k.x, b.x))
      const oy = Math.max(0, Math.min(k.y + k.h, b.y + b.h) - Math.max(k.y, b.y))
      return ox * oy > 0.55 * Math.min(k.w * k.h, b.w * b.h)
    })
    if (nested) continue
    kept.push(b)
  }
  return kept
}

/**
 * Drawn input boxes / checkboxes from the page paint stream (constructPath bboxes).
 * Exact geometry — preferred over label-gap heuristics on flat Word-style forms.
 */
async function extractDrawnWidgets(
  page: PdfJs.PDFPageProxy,
  pageIndex: number,
  pw: number,
  ph: number,
  items: TextItem[],
): Promise<DetectedField[]> {
  const pdfjs = await loadPdfJs()
  const { OPS } = pdfjs
  const opList = await page.getOperatorList()

  const raw: DrawnRect[] = []
  for (let i = 0; i < opList.fnArray.length; i++) {
    if (opList.fnArray[i] !== OPS.constructPath) continue
    const args = opList.argsArray[i] as unknown[]
    const bbox = args[2] as ArrayLike<number> | undefined
    if (!bbox || bbox.length < 4) continue
    const x1 = Number(bbox[0])
    const y1 = Number(bbox[1])
    const x2 = Number(bbox[2])
    const y2 = Number(bbox[3])
    if (![x1, y1, x2, y2].every((n) => Number.isFinite(n))) continue
    const w = Math.abs(x2 - x1)
    const h = Math.abs(y2 - y1)
    if (w > pw * 0.92 || h > ph * 0.45) continue
    if (w < 6 || h < 0.4) continue
    // Large section frames (e.g. address outer border), not input cells
    if (w > 280 && h > 30) continue
    raw.push({ x: Math.min(x1, x2), y: Math.min(y1, y2), w, h })
  }

  const widgets = dedupeDrawnRects(raw)
  const textBoxes = preferOuterBoxes(
    widgets.filter((r) => r.h >= 10 && r.h <= 26 && r.w >= 20 && r.w <= 520),
  )
  const checks = preferOuterBoxes(
    widgets.filter(
      (r) => r.h >= 7 && r.h <= 16 && r.w >= 7 && r.w <= 16 && Math.abs(r.w - r.h) < 4,
    ),
  )

  const out: DetectedField[] = []
  let n = 0
  for (const box of textBoxes) {
    const x = box.x / pw
    const y = (ph - box.y - box.h) / ph
    const w = box.w / pw
    const h = box.h / ph
    if (w < 0.025 || w > MAX_VECTOR_WIDTH_FRAC || h < 0.008 || h > 0.06) continue
    if (x < -0.01 || y < -0.01 || x + w > 1.02 || y + h > 1.02) continue
    out.push({
      id: `vec-p${pageIndex}-${++n}`,
      pageIndex,
      kind: 'text',
      name: nearestLabelForBox(box, items),
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
      w: Math.max(0.02, Math.min(1 - x, w)),
      h: Math.max(0.01, Math.min(1 - y, h)),
      source: 'blank',
    })
  }
  for (const box of checks) {
    const x = box.x / pw
    const y = (ph - box.y - box.h) / ph
    const w = box.w / pw
    const h = box.h / ph
    if (w < 0.008 || h < 0.008) continue
    out.push({
      id: `vecchk-p${pageIndex}-${++n}`,
      pageIndex,
      kind: 'checkbox',
      name: nearestLabelForBox(box, items) || 'Checkbox',
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
      w: Math.max(0.01, Math.min(1 - x, w)),
      h: Math.max(0.01, Math.min(1 - y, h)),
      source: 'blank',
    })
  }

  return out
}

function detectUnderscoreSpans(
  items: TextItem[],
  pageIndex: number,
  pw: number,
  ph: number,
): DetectedField[] {
  const out: DetectedField[] = []
  let n = 0

  for (const item of items) {
    const str = item.str
    if (!str || str.length < 2) continue
    const transform = item.transform
    const fontHeight = textFontHeight(transform)
    const totalWidth = item.width || approxTextWidth(str, fontHeight)
    if (totalWidth < 14 || str.length === 0) continue
    const approxAll = approxTextWidth(str, fontHeight) || 1
    const scale = totalWidth / approxAll
    const x0 = transform[4]
    const baseline = transform[5]
    const useProportional = (item.width || 0) > 0 && str.length > 0

    BLANK_RUN_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = BLANK_RUN_RE.exec(str)) !== null) {
      const start = match.index
      const run = match[0]
      const prefix = str.slice(0, start)
      const widthPt = useProportional
        ? Math.max((run.length / str.length) * totalWidth, 14)
        : Math.max(approxTextWidth(run, fontHeight) * scale, 18)
      const xPdf = useProportional
        ? x0 + (start / str.length) * totalWidth
        : x0 + approxTextWidth(prefix, fontHeight) * scale
      n += 1
      pushNormalizedField(out, pageIndex, pw, ph, {
        id: `blank-p${pageIndex}-${n}`,
        name: 'Blank',
        xPdf,
        baseline,
        widthPt,
        fontHeight,
        align: 'underline',
      })
    }
  }

  return out
}

function detectLabelGapFields(
  items: TextItem[],
  pageIndex: number,
  pw: number,
  ph: number,
  existing: DetectedField[],
): DetectedField[] {
  const out: DetectedField[] = []
  let n = 0

  // Cluster into rows by baseline Y
  const sorted = [...items].sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])
  const rows: TextItem[][] = []
  const ROW_TOL = 3.5

  for (const item of sorted) {
    if (!item.str.trim()) continue
    const y = item.transform[5]
    const row = rows.find((r) => Math.abs(r[0].transform[5] - y) <= ROW_TOL)
    if (row) row.push(item)
    else rows.push([item])
  }

  for (const row of rows) {
    row.sort((a, b) => a.transform[4] - b.transform[4])
    const fontHeight = Math.max(...row.map((i) => textFontHeight(i.transform)), 10)
    const baseline = row.reduce((s, i) => s + i.transform[5], 0) / row.length

    type Interval = { left: number; right: number; label: string; src: string }
    const intervals: Interval[] = []
    for (const item of row) {
      const left = item.transform[4]
      const width = textItemWidth(item)
      const right = left + width
      BLANK_RUN_RE.lastIndex = 0
      const label = item.str.replace(BLANK_RUN_RE, '').trim()
      BLANK_RUN_RE.lastIndex = 0
      intervals.push({ left, right, label: label || item.str.trim(), src: item.str })
    }

    for (let i = 0; i < intervals.length; i++) {
      const cur = intervals[i]
      const nextLeft = i + 1 < intervals.length ? intervals[i + 1].left : pw - RIGHT_MARGIN_PT
      const gap = nextLeft - cur.right
      if (gap < MIN_GAP_PT) continue

      // Inline underscore blanks are handled by underscore detection
      BLANK_RUN_RE.lastIndex = 0
      if (BLANK_RUN_RE.test(cur.src)) {
        BLANK_RUN_RE.lastIndex = 0
        continue
      }
      if (/^[\s_….\-–—\uFF3F\u2017]+$/.test(cur.src)) continue

      const label = (cur.label || 'Field').trim()
      if (!isLikelyFieldLabel(label, fontHeight)) continue

      const widthPt = Math.min(gap * 0.94, pw * MAX_FIELD_WIDTH_FRAC)
      if (widthPt < MIN_GAP_PT * 0.9) continue

      const xPdf = cur.right + Math.min(gap * 0.03, 4)
      const name = label.slice(0, 48)
      const ascent = fontHeight * 0.85
      const hPt = Math.max(fontHeight * 1.35, 12)
      const candidate = {
        x: xPdf / pw,
        y: (ph - baseline - ascent) / ph,
        w: widthPt / pw,
        h: hPt / ph,
      }
      const overlaps = (e: DetectedField) =>
        e.pageIndex === pageIndex && rectsOverlap(e, candidate, 0.006)
      if (existing.some(overlaps) || out.some(overlaps)) continue

      n += 1
      pushNormalizedField(out, pageIndex, pw, ph, {
        id: `gap-p${pageIndex}-${n}`,
        name,
        xPdf,
        baseline,
        widthPt,
        fontHeight,
        align: 'box',
      })
    }
  }

  return out
}

/**
 * Detect fillable regions: drawn vector boxes (preferred), underscore runs,
 * then label-gap heuristics only when no vectors exist on the page.
 */
export async function detectBlankLineFields(
  docId: string,
  bytes: ArrayBuffer,
  pageIndex: number,
): Promise<DetectedField[]> {
  const doc = await getPdfJsDocument(docId, bytes)
  const page = await doc.getPage(pageIndex)
  const viewport = page.getViewport({ scale: 1 })
  const pw = viewport.width
  const ph = viewport.height
  if (pw <= 0 || ph <= 0) return []

  const content = await page.getTextContent()
  const items: TextItem[] = []
  for (const raw of content.items) {
    const item = raw as { str?: string; transform?: number[]; width?: number }
    if (!item.str || !item.transform || item.transform.length < 6) continue
    items.push({
      str: item.str,
      transform: item.transform,
      width: item.width ?? 0,
    })
  }

  let vectors: DetectedField[] = []
  try {
    vectors = await extractDrawnWidgets(page, pageIndex, pw, ph, items)
  } catch {
    /* paint-stream optional — fall back to underscores/gaps */
  }
  const underscores = detectUnderscoreSpans(items, pageIndex, pw, ph)
  let out = mergeDetectedFields(vectors, underscores)

  // Label-gaps invent geometry — only use when the page has no drawn widgets.
  if (vectors.length === 0) {
    const gaps = detectLabelGapFields(items, pageIndex, pw, ph, out)
    out = mergeDetectedFields(out, gaps)
  }

  // Also pick up widget annotations from pdf.js when present
  try {
    const annots = await page.getAnnotations()
    let n = out.length
    for (const ann of annots as Array<{
      subtype?: string
      fieldType?: string
      fieldName?: string
      rect?: number[]
      checkbox?: boolean
    }>) {
      if (ann.subtype !== 'Widget' || !ann.rect || ann.rect.length < 4) continue
      const [x1, y1, x2, y2] = ann.rect
      const rw = Math.abs(x2 - x1)
      const rh = Math.abs(y2 - y1)
      if (rw < 6 || rh < 6) continue
      const ft = (ann.fieldType || '').toLowerCase()
      const kind: DetectedFieldKind =
        ft === 'btn' || ft === 'checkbox' || ann.checkbox ? 'checkbox' : 'text'
      const field: DetectedField = {
        id: `jsann-p${pageIndex}-${++n}`,
        pageIndex,
        kind,
        name: ann.fieldName || (kind === 'checkbox' ? 'Checkbox' : 'Field'),
        x: Math.min(x1, x2) / pw,
        y: (ph - Math.max(y1, y2)) / ph,
        w: rw / pw,
        h: rh / ph,
        source: 'acroform',
      }
      if (out.some((e) => rectsOverlap(e, field))) continue
      out.push(field)
    }
  } catch {
    /* annotations optional */
  }

  return out
}

/** Merge detections, dropping overlaps (entries in primary win). */
export function mergeDetectedFields(primary: DetectedField[], secondary: DetectedField[]): DetectedField[] {
  const merged = [...primary]
  for (const f of secondary) {
    if (merged.some((m) => m.pageIndex === f.pageIndex && rectsOverlap(m, f))) continue
    merged.push(f)
  }
  return merged
}
