import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PDFPage } from 'pdf-lib'
import JSZip from 'jszip'
import ToolPage from '../components/ToolPage'
import Dropzone from '../components/Dropzone'
import { downloadBlob, readFileAsArrayBuffer, sanitizeFilename } from '../lib/images'
import { copyText } from '../lib/clipboard'
import {
  getPdfJsDocument,
  loadPdfLib,
  loadPdfLibDocument,
  releasePdfJsDocument,
  releasePdfLibDocument,
  renderPdfPageThumbnail,
} from '../lib/pdf-utils'
import { mapPool } from '../lib/async'
import { toFileList } from '../lib/fileStore'
import { usePendingFiles } from '../lib/usePendingFiles'

export type PdfToolVariant = 'pages' | 'export' | 'images' | 'ocr' | 'optimize'

const VARIANT_PATH: Record<PdfToolVariant, string> = {
  pages: '/pdf/pages',
  export: '/pdf/split-export',
  images: '/pdf/from-images',
  ocr: '/pdf/ocr',
  optimize: '/pdf/optimize',
}

export interface PdfToolViewProps {
  variant: PdfToolVariant
  title: string
  hint: string
  eyebrow?: string
}

interface PagePreview {
  id: string
  docId: string
  pageIndex: number
  rotation: number
  selected: boolean
  previewUrl: string | null
  width: number
  height: number
}

interface DocEntry {
  id: string
  name: string
  bytes: ArrayBuffer
  pageCount: number
}

interface ImageEntry {
  id: string
  file: File
  preview: string
}

interface OcrPageResult {
  pageId: string
  label: string
  text: string
  method: 'text' | 'ocr'
}

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}-${Math.random().toString(36).slice(2, 7)}`
}

function rotateCanvas(source: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  const angle = ((degrees % 360) + 360) % 360
  if (angle === 0) return source
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')!
  if (angle === 180) {
    c.width = source.width
    c.height = source.height
    ctx.translate(c.width, c.height)
    ctx.rotate(Math.PI)
    ctx.drawImage(source, 0, 0)
  } else if (angle === 90) {
    c.width = source.height
    c.height = source.width
    ctx.translate(c.width, 0)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(source, 0, 0)
  } else if (angle === 270) {
    c.width = source.height
    c.height = source.width
    ctx.translate(0, c.height)
    ctx.rotate(-Math.PI / 2)
    ctx.drawImage(source, 0, 0)
  }
  return c
}

function parsePageRange(input: string, max: number): Set<number> | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const out = new Set<number>()
  for (const part of trimmed.split(',')) {
    const p = part.trim()
    if (!p) continue
    if (p.includes('-')) {
      const [a, b] = p.split('-').map((x) => parseInt(x.trim(), 10))
      if (Number.isNaN(a) || Number.isNaN(b)) continue
      const lo = Math.max(1, Math.min(a, b))
      const hi = Math.min(max, Math.max(a, b))
      for (let i = lo; i <= hi; i++) out.add(i)
    } else {
      const n = parseInt(p, 10)
      if (!Number.isNaN(n) && n >= 1 && n <= max) out.add(n)
    }
  }
  return out.size ? out : null
}

function downloadPdfBlob(bytes: Uint8Array, filename: string) {
  const ab = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(ab).set(bytes)
  downloadBlob(new Blob([ab], { type: 'application/pdf' }), filename)
}

export function PdfToolView({ variant, title, hint, eyebrow = 'PDF' }: PdfToolViewProps) {
  const [docs, setDocs] = useState<DocEntry[]>([])
  const [previews, setPreviews] = useState<PagePreview[]>([])
  const [imageFiles, setImageFiles] = useState<ImageEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pageRange, setPageRange] = useState('')
  const [bundleZip, setBundleZip] = useState(true)
  const [imageFormat, setImageFormat] = useState<'png' | 'jpeg'>('png')
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [ocrResults, setOcrResults] = useState<OcrPageResult[]>([])
  const [ocrView, setOcrView] = useState<'combined' | 'per-page'>('combined')
  const [compressQuality, setCompressQuality] = useState(0.72)
  const [compressScale, setCompressScale] = useState(1.5)
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL')
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.25)
  const [watermarkSize, setWatermarkSize] = useState(48)
  const [watermarkAngle, setWatermarkAngle] = useState(45)
  const fileInput = useRef<HTMLInputElement>(null)
  const thumbGenRef = useRef(0)
  const previewUrlsRef = useRef<Set<string>>(new Set())

  const revokeAllPreviewUrls = () => {
    previewUrlsRef.current.forEach((u) => URL.revokeObjectURL(u))
    previewUrlsRef.current.clear()
  }

  const usesPdfPages = variant !== 'images'
  const showPageGrid = usesPdfPages && previews.length > 0

  const onPickFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    setBusy(true)
    setMessage(null)
    try {
      const newDocs: DocEntry[] = []
      for (const f of Array.from(list)) {
        if (!f.type.includes('pdf') && !/\.pdf$/i.test(f.name)) continue
        const bytes = await readFileAsArrayBuffer(f)
        const id = nextId('doc')
        const doc = await getPdfJsDocument(id, bytes)
        newDocs.push({
          id,
          name: f.name,
          bytes,
          pageCount: doc.numPages,
        })
      }
      setDocs((d) => [...d, ...newDocs])
    } catch (e) {
      setMessage(`Failed to load: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const onPickImages = async (list: FileList) => {
    const entries: ImageEntry[] = []
    for (const f of Array.from(list)) {
      if (!f.type.startsWith('image/')) continue
      entries.push({ id: nextId('img'), file: f, preview: URL.createObjectURL(f) })
    }
    setImageFiles((prev) => [...prev, ...entries])
  }

  usePendingFiles(VARIANT_PATH[variant], (pending) => {
    if (variant === 'images') void onPickImages(toFileList(pending))
    else void onPickFiles(toFileList(pending))
  })

  useEffect(() => {
    if (!usesPdfPages) return
    const gen = ++thumbGenRef.current
    let cancelled = false

    async function buildThumbnails() {
      if (docs.length === 0) {
        revokeAllPreviewUrls()
        setPreviews([])
        return
      }

      revokeAllPreviewUrls()
      setBusy(true)
      const skeletons: PagePreview[] = []
      for (const docEntry of docs) {
        const doc = await getPdfJsDocument(docEntry.id, docEntry.bytes)
        for (let pi = 1; pi <= doc.numPages; pi++) {
          const page = await doc.getPage(pi)
          const baseViewport = page.getViewport({ scale: 1 })
          if (cancelled || thumbGenRef.current !== gen) return
          skeletons.push({
            id: nextId('page'),
            docId: docEntry.id,
            pageIndex: pi,
            rotation: 0,
            selected: true,
            previewUrl: null,
            width: baseViewport.width,
            height: baseViewport.height,
          })
        }
      }
      if (cancelled || thumbGenRef.current !== gen) return
      setPreviews(skeletons)
      setBusy(false)

      await mapPool(skeletons, 4, async (p) => {
        if (cancelled || thumbGenRef.current !== gen) return null
        const docEntry = docs.find((d) => d.id === p.docId)!
        const url = await renderPdfPageThumbnail(docEntry.id, docEntry.bytes, p.pageIndex)
        if (cancelled || thumbGenRef.current !== gen) {
          URL.revokeObjectURL(url)
          return null
        }
        previewUrlsRef.current.add(url)
        setPreviews((prev) =>
          prev.map((x) => (x.id === p.id ? { ...x, previewUrl: url } : x)),
        )
        return url
      })
    }

    buildThumbnails().catch((e) => {
      if (!cancelled && thumbGenRef.current === gen) {
        setMessage(`Render failed: ${e instanceof Error ? e.message : String(e)}`)
        setBusy(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [docs, usesPdfPages])

  const applyPageRange = () => {
    const range = parsePageRange(pageRange, previews.length)
    if (!range) {
      setPreviews((prev) => prev.map((p) => ({ ...p, selected: true })))
      return
    }
    setPreviews((prev) => prev.map((p, i) => ({ ...p, selected: range.has(i + 1) })))
  }

  useEffect(
    () => () => {
      imageFiles.forEach((img) => URL.revokeObjectURL(img.preview))
      revokeAllPreviewUrls()
    },
    [imageFiles],
  )

  const docById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs])
  const selectedPages = useMemo(() => previews.filter((p) => p.selected), [previews])
  const selectedCount = selectedPages.length

  const updatePreview = (id: string, patch: Partial<PagePreview>) => {
    setPreviews((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  const rotatePage = (id: string, delta: number) => {
    setPreviews((prev) =>
      prev.map((p) => (p.id === id ? { ...p, rotation: (p.rotation + delta + 360) % 360 } : p)),
    )
  }

  const removeDoc = (id: string) => {
    releasePdfJsDocument(id)
    releasePdfLibDocument(id)
    setDocs((prev) => prev.filter((d) => d.id !== id))
    setPreviews((prev) => {
      for (const p of prev) {
        if (p.docId === id && p.previewUrl) {
          URL.revokeObjectURL(p.previewUrl)
          previewUrlsRef.current.delete(p.previewUrl)
        }
      }
      return prev.filter((p) => p.docId !== id)
    })
  }

  const clearAll = () => {
    for (const d of docs) {
      releasePdfJsDocument(d.id)
      releasePdfLibDocument(d.id)
    }
    revokeAllPreviewUrls()
    setPreviews([])
    setDocs([])
    setMessage(null)
    setPageRange('')
    setOcrResults([])
  }

  const removeImage = (id: string) => {
    setImageFiles((prev) => {
      const item = prev.find((x) => x.id === id)
      if (item) URL.revokeObjectURL(item.preview)
      return prev.filter((x) => x.id !== id)
    })
  }

  const applyRotation = useCallback(async (p: PagePreview, page: PDFPage) => {
    if (p.rotation) {
      const { degrees } = await loadPdfLib()
      page.setRotation(degrees(((page.getRotation().angle + p.rotation) % 360 + 360) % 360))
    }
  }, [])

  const buildPdfFromPages = async (pages: PagePreview[], filename: string) => {
    const { PDFDocument } = await loadPdfLib()
    const out = await PDFDocument.create()
    for (const p of pages) {
      const docEntry = docById.get(p.docId)!
      const src = await loadPdfLibDocument(p.docId, docEntry.bytes)
      const [page] = await out.copyPages(src, [p.pageIndex - 1])
      await applyRotation(p, page)
      out.addPage(page)
    }
    downloadPdfBlob(await out.save(), filename)
    return pages.length
  }

  const runBuildFromImages = async () => {
    if (imageFiles.length === 0) {
      setMessage('Add at least one image.')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const { PDFDocument } = await loadPdfLib()
      const out = await PDFDocument.create()
      for (const entry of imageFiles) {
        const f = entry.file
        const bytes = await readFileAsArrayBuffer(f)
        let img
        if (f.type === 'image/png') img = await out.embedPng(bytes)
        else if (f.type === 'image/jpeg' || f.type === 'image/jpg') img = await out.embedJpg(bytes)
        else {
          const url = URL.createObjectURL(f)
          const image = new Image()
          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve()
            image.onerror = () => reject(new Error('Image load failed'))
            image.src = url
          })
          URL.revokeObjectURL(url)
          const c = document.createElement('canvas')
          c.width = image.naturalWidth
          c.height = image.naturalHeight
          c.getContext('2d')!.drawImage(image, 0, 0)
          const blob: Blob = await new Promise((resolve, reject) =>
            c.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas toBlob failed'))), 'image/jpeg', 0.92),
          )
          img = await out.embedJpg(await blob.arrayBuffer())
        }
        const page = out.addPage([img.width, img.height])
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
      }
      downloadPdfBlob(await out.save(), 'images.pdf')
      setMessage(`Created PDF with ${imageFiles.length} page${imageFiles.length !== 1 ? 's' : ''}.`)
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const runDownloadPdf = async () => {
    if (selectedCount === 0) {
      setMessage('Select at least one page.')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const count = await buildPdfFromPages(selectedPages, 'document.pdf')
      setMessage(`Saved ${count} page${count !== 1 ? 's' : ''} as one PDF.`)
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const runSplitAll = async () => {
    if (docs.length === 0) return
    setBusy(true)
    setMessage(null)
    setProgress(null)
    try {
      const allPages: PagePreview[] = []
      for (const docEntry of docs) {
        for (let pi = 1; pi <= docEntry.pageCount; pi++) {
          allPages.push({
            id: `${docEntry.id}-${pi}`,
            docId: docEntry.id,
            pageIndex: pi,
            rotation: 0,
            selected: true,
            previewUrl: null,
            width: 0,
            height: 0,
          })
        }
      }
      setProgress({ current: 0, total: allPages.length })
      const zip = bundleZip ? new JSZip() : null
      const { PDFDocument } = await loadPdfLib()

      for (let i = 0; i < allPages.length; i++) {
        const p = allPages[i]
        const preview = previews.find((x) => x.docId === p.docId && x.pageIndex === p.pageIndex)
        const docEntry = docById.get(p.docId)!
        const src = await loadPdfLibDocument(p.docId, docEntry.bytes)
        const out = await PDFDocument.create()
        const [page] = await out.copyPages(src, [p.pageIndex - 1])
        if (preview) await applyRotation(preview, page)
        out.addPage(page)
        const bytes = await out.save()
        const base = sanitizeFilename(docEntry.name.replace(/\.pdf$/i, ''))
        const name = `${base}-p${p.pageIndex}.pdf`
        if (zip) zip.file(name, bytes)
        else downloadPdfBlob(bytes, name)
        setProgress({ current: i + 1, total: allPages.length })
      }

      if (zip) downloadBlob(await zip.generateAsync({ type: 'blob' }), 'split-pages.zip')
      setMessage(`Split ${allPages.length} page${allPages.length !== 1 ? 's' : ''} into separate files.`)
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const runExtractSelected = async () => {
    if (selectedCount === 0) {
      setMessage('Select pages to extract.')
      return
    }
    setBusy(true)
    setMessage(null)
    setProgress(null)
    try {
      setProgress({ current: 0, total: selectedCount })
      const zip = bundleZip ? new JSZip() : null
      const { PDFDocument } = await loadPdfLib()
      for (let i = 0; i < selectedPages.length; i++) {
        const p = selectedPages[i]
        const docEntry = docById.get(p.docId)!
        const src = await loadPdfLibDocument(p.docId, docEntry.bytes)
        const out = await PDFDocument.create()
        const [page] = await out.copyPages(src, [p.pageIndex - 1])
        await applyRotation(p, page)
        out.addPage(page)
        const bytes = await out.save()
        const base = sanitizeFilename(docEntry.name.replace(/\.pdf$/i, ''))
        const name = `${base}-p${p.pageIndex}.pdf`
        if (zip) zip.file(name, bytes)
        else downloadPdfBlob(bytes, name)
        setProgress({ current: i + 1, total: selectedCount })
      }
      if (zip) downloadBlob(await zip.generateAsync({ type: 'blob' }), 'extracted-pages.zip')
      setMessage(`Extracted ${selectedCount} page${selectedCount !== 1 ? 's' : ''}.`)
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const runExportImages = async () => {
    if (selectedCount === 0) {
      setMessage('Select pages to export.')
      return
    }
    setBusy(true)
    setMessage(null)
    setProgress(null)
    try {
      setProgress({ current: 0, total: selectedCount })
      const zip = bundleZip ? new JSZip() : null
      const mime = imageFormat === 'png' ? 'image/png' : 'image/jpeg'
      const ext = imageFormat
      const pdfCache = new Map<string, Awaited<ReturnType<typeof getPdfJsDocument>>>

      for (let i = 0; i < selectedPages.length; i++) {
        const p = selectedPages[i]
        const docEntry = docById.get(p.docId)!
        let pdf = pdfCache.get(p.docId)
        if (!pdf) {
          pdf = await getPdfJsDocument(p.docId, docEntry.bytes)
          pdfCache.set(p.docId, pdf)
        }
        const page = await pdf.getPage(p.pageIndex)
        const viewport = page.getViewport({ scale: 2 })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport, canvas }).promise
        const exportCanvas = p.rotation ? rotateCanvas(canvas, p.rotation) : canvas
        const blob: Blob = await new Promise((resolve, reject) =>
          exportCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), mime, 0.92),
        )
        const base = sanitizeFilename(docEntry.name.replace(/\.pdf$/i, ''))
        const name = `${base}-p${p.pageIndex}.${ext}`
        if (zip) zip.file(name, blob)
        else downloadBlob(blob, name)
        setProgress({ current: i + 1, total: selectedCount })
      }

      if (zip) downloadBlob(await zip.generateAsync({ type: 'blob' }), 'pdf-pages.zip')
      setMessage(`Exported ${selectedCount} image${selectedCount !== 1 ? 's' : ''}.`)
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const runOcr = async () => {
    if (selectedCount === 0) {
      setMessage('Select pages to read.')
      return
    }
    setBusy(true)
    setMessage(null)
    setProgress(null)
    try {
      setProgress({ current: 0, total: selectedCount })
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng')
      const results: OcrPageResult[] = []
      const pdfCache = new Map<string, Awaited<ReturnType<typeof getPdfJsDocument>>>

      try {
        for (let i = 0; i < selectedPages.length; i++) {
          const p = selectedPages[i]
          const docEntry = docById.get(p.docId)!
          let pdf = pdfCache.get(p.docId)
          if (!pdf) {
            pdf = await getPdfJsDocument(p.docId, docEntry.bytes)
            pdfCache.set(p.docId, pdf)
          }
          const page = await pdf.getPage(p.pageIndex)
          const textContent = await page.getTextContent()
          let text = textContent.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
          let method: 'text' | 'ocr' = 'text'

          if (text.length < 40) {
            const viewport = page.getViewport({ scale: 2 })
            const canvas = document.createElement('canvas')
            canvas.width = viewport.width
            canvas.height = viewport.height
            await page.render({ canvasContext: canvas.getContext('2d')!, viewport, canvas }).promise
            const rotated = p.rotation ? rotateCanvas(canvas, p.rotation) : canvas
            const { data } = await worker.recognize(rotated)
            text = data.text.trim()
            method = 'ocr'
          }

          results.push({
            pageId: p.id,
            label: `${docEntry.name} · page ${p.pageIndex}`,
            text,
            method,
          })
          setProgress({ current: i + 1, total: selectedCount })
        }
      } finally {
        await worker.terminate()
      }

      setOcrResults(results)
      setMessage(`Extracted text from ${results.length} page${results.length !== 1 ? 's' : ''}.`)
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const runCompress = async () => {
    if (selectedCount === 0) {
      setMessage('Select pages to compress.')
      return
    }
    setBusy(true)
    setMessage(null)
    setProgress(null)
    try {
      setProgress({ current: 0, total: selectedCount })
      let originalBytes = 0
      for (const p of selectedPages) originalBytes += docById.get(p.docId)?.bytes.byteLength ?? 0

      const { PDFDocument } = await loadPdfLib()
      const out = await PDFDocument.create()
      const pdfCache = new Map<string, Awaited<ReturnType<typeof getPdfJsDocument>>>

      for (let i = 0; i < selectedPages.length; i++) {
        const p = selectedPages[i]
        const docEntry = docById.get(p.docId)!
        let pdf = pdfCache.get(p.docId)
        if (!pdf) {
          pdf = await getPdfJsDocument(p.docId, docEntry.bytes)
          pdfCache.set(p.docId, pdf)
        }
        const page = await pdf.getPage(p.pageIndex)
        const viewport = page.getViewport({ scale: compressScale })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport, canvas }).promise
        const exportCanvas = p.rotation ? rotateCanvas(canvas, p.rotation) : canvas
        const blob: Blob = await new Promise((resolve, reject) =>
          exportCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', compressQuality),
        )
        const jpg = await out.embedJpg(await blob.arrayBuffer())
        const pg = out.addPage([jpg.width, jpg.height])
        pg.drawImage(jpg, { x: 0, y: 0, width: jpg.width, height: jpg.height })
        setProgress({ current: i + 1, total: selectedCount })
      }
      const bytes = await out.save()
      downloadPdfBlob(bytes, 'compressed.pdf')
      const pct = originalBytes > 0 ? Math.round((bytes.byteLength / originalBytes) * 100) : 0
      setMessage(`Compressed to ${(bytes.byteLength / 1024).toFixed(0)} KB (${pct}% of source).`)
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const runWatermark = async () => {
    if (selectedCount === 0) {
      setMessage('Select pages to watermark.')
      return
    }
    if (!watermarkText.trim()) {
      setMessage('Enter watermark text.')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const { PDFDocument, degrees, rgb, StandardFonts } = await loadPdfLib()
      const out = await PDFDocument.create()
      const font = await out.embedFont(StandardFonts.HelveticaBold)
      for (const p of selectedPages) {
        const docEntry = docById.get(p.docId)!
        const src = await loadPdfLibDocument(p.docId, docEntry.bytes)
        const [page] = await out.copyPages(src, [p.pageIndex - 1])
        await applyRotation(p, page)
        const { width, height } = page.getSize()
        const textWidth = font.widthOfTextAtSize(watermarkText, watermarkSize)
        page.drawText(watermarkText, {
          x: width / 2 - textWidth / 2,
          y: height / 2,
          size: watermarkSize,
          font,
          color: rgb(0.45, 0.45, 0.45),
          opacity: watermarkOpacity,
          rotate: degrees(watermarkAngle),
        })
        out.addPage(page)
      }
      downloadPdfBlob(await out.save(), 'watermarked.pdf')
      setMessage(`Watermarked ${selectedCount} page${selectedCount !== 1 ? 's' : ''}.`)
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const combinedOcrText = useMemo(
    () => ocrResults.map((r) => `--- ${r.label} (${r.method}) ---\n${r.text}`).join('\n\n'),
    [ocrResults],
  )

  const pageStrip = showPageGrid ? (
    <div className="pdf-pages-wrap">
      <div className="pdf-page-toolbar">
        <p className="hint pdf-page-hint">
          {variant === 'pages' && 'Drag to reorder · Click to toggle · ↺ ↻ to rotate'}
          {variant === 'export' && 'Click to select · Drag to reorder · ↺ ↻ to rotate'}
          {variant === 'ocr' && 'Click pages to include in extraction'}
          {variant === 'optimize' && 'Click to select · ↺ ↻ to rotate'}
        </p>
        <div className="row-actions pdf-page-actions">
          <button type="button" className="btn-link" onClick={() => setPreviews((p) => p.map((x) => ({ ...x, selected: true })))}>
            All
          </button>
          <button type="button" className="btn-link" onClick={() => setPreviews((p) => p.map((x) => ({ ...x, selected: false })))}>
            None
          </button>
          <span className="meta">{selectedCount}/{previews.length}</span>
        </div>
      </div>
      <ul className="pdf-page-grid">
        {previews.map((p, i) => {
          const docEntry = docById.get(p.docId)
          return (
            <li key={p.id} className={p.selected ? 'selected' : 'dim'}>
              <span className="pdf-page-order">Page {i + 1}</span>
              <div
                className="page-thumb"
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const from = Number(e.dataTransfer.getData('text/plain'))
                  if (Number.isNaN(from) || from === i) return
                  setPreviews((prev) => {
                    const next = prev.slice()
                    const [moved] = next.splice(from, 1)
                    next.splice(i, 0, moved)
                    return next
                  })
                }}
                onClick={() => updatePreview(p.id, { selected: !p.selected })}
              >
                <span className="page-num" aria-hidden="true">{i + 1}</span>
                {p.rotation !== 0 && <span className="rotation-badge">{p.rotation}°</span>}
                <img src={p.previewUrl ?? undefined} alt={`Page ${i + 1}`} style={{ transform: `rotate(${p.rotation}deg)` }} />
              </div>
              <div className="page-meta">
                <span className="page-label" title={docEntry?.name}>
                  {docEntry?.name} · p{p.pageIndex}
                </span>
                <div className="rotation-controls" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="btn rotation-btn" title="Rotate left" onClick={() => rotatePage(p.id, -90)}>
                    ↺
                  </button>
                  <button type="button" className="btn rotation-btn" title="Rotate right" onClick={() => rotatePage(p.id, 90)}>
                    ↻
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  ) : usesPdfPages ? (
    <p className="hint pdf-empty-hint">Add PDFs above to see pages here.</p>
  ) : null

  const statusLine = (progress || message) && (
    <p className="hint pdf-status">
      {progress ? `Progress ${progress.current}/${progress.total}` : null}
      {progress && message ? ' · ' : null}
      {message}
    </p>
  )

  return (
    <ToolPage eyebrow={eyebrow} title={title} hint={hint}>
      <div className="pdf-layout">
        {variant === 'images' ? (
          <>
            <div className="pdf-export-bar">
              <Dropzone accept="image/*" multiple className="dropzone-inline" label="+ Add images (drop or paste)" onFiles={onPickImages} />
              <button
                type="button"
                className="btn primary"
                disabled={busy || imageFiles.length === 0}
                onClick={runBuildFromImages}
              >
                {busy ? 'Building…' : 'Create PDF'}
              </button>
              {imageFiles.length > 0 && <span className="meta">{imageFiles.length} image{imageFiles.length !== 1 ? 's' : ''}</span>}
              {statusLine}
            </div>
            {imageFiles.length > 0 ? (
              <ul className="pdf-image-grid">
                {imageFiles.map((img, i) => (
                  <li
                    key={img.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const from = Number(e.dataTransfer.getData('text/plain'))
                      if (Number.isNaN(from) || from === i) return
                      setImageFiles((prev) => {
                        const next = prev.slice()
                        const [moved] = next.splice(from, 1)
                        next.splice(i, 0, moved)
                        return next
                      })
                    }}
                  >
                    <span className="pdf-page-order">Page {i + 1}</span>
                    <div className="pdf-image-thumb">
                      <img src={img.preview} alt={`Page ${i + 1}`} />
                      <span className="page-num" aria-hidden="true">{i + 1}</span>
                    </div>
                    <button type="button" className="pdf-chip-remove" onClick={() => removeImage(img.id)} aria-label="Remove">
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint pdf-empty-hint">Drop images to build a PDF — drag thumbnails to set page order.</p>
            )}
          </>
        ) : (
          <>
            <div className="pdf-files-row">
              <Dropzone
                accept="application/pdf"
                multiple
                className="dropzone-inline"
                label="+ Add PDF (drop or paste)"
                onFiles={onPickFiles}
              />
              {docs.map((d) => (
                <span key={d.id} className="pdf-file-chip">
                  <span className="pdf-file-chip-name" title={d.name}>{d.name}</span>
                  <span className="meta">{d.pageCount}p</span>
                  <button type="button" className="pdf-chip-remove" onClick={() => removeDoc(d.id)} aria-label={`Remove ${d.name}`}>
                    ×
                  </button>
                </span>
              ))}
              {docs.length > 1 && (
                <button type="button" className="btn-link" onClick={clearAll}>
                  Clear
                </button>
              )}
            </div>

            <div className="pdf-export-bar">
              {variant === 'pages' && (
                <>
                  <button type="button" className="btn primary" disabled={busy || selectedCount === 0} onClick={runDownloadPdf}>
                    {busy ? 'Working…' : 'Download PDF'}
                  </button>
                  {previews.length > 1 && (
                    <div className="pdf-inline-field">
                      <input
                        value={pageRange}
                        onChange={(e) => setPageRange(e.target.value)}
                        placeholder="Pages 1-3, 5"
                        aria-label="Page range"
                      />
                      <button type="button" className="btn" onClick={applyPageRange}>
                        Select
                      </button>
                    </div>
                  )}
                  {previews.length > 0 && <span className="meta">{selectedCount} of {previews.length} pages</span>}
                </>
              )}

              {variant === 'export' && docs.length > 0 && (
                <>
                  <button type="button" className="btn" disabled={busy} onClick={runSplitAll}>
                    Split all
                  </button>
                  <button type="button" className="btn" disabled={busy || selectedCount === 0} onClick={runExtractSelected}>
                    Extract ({selectedCount})
                  </button>
                  <div className="pdf-inline-field">
                    <select value={imageFormat} onChange={(e) => setImageFormat(e.target.value as 'png' | 'jpeg')} aria-label="Image format">
                      <option value="png">PNG</option>
                      <option value="jpeg">JPEG</option>
                    </select>
                    <button type="button" className="btn" disabled={busy || selectedCount === 0} onClick={runExportImages}>
                      Images ({selectedCount})
                    </button>
                  </div>
                  <label className="pdf-inline-check">
                    <input type="checkbox" checked={bundleZip} onChange={(e) => setBundleZip(e.target.checked)} />
                    ZIP
                  </label>
                </>
              )}

              {variant === 'ocr' && docs.length > 0 && (
                <>
                  <button type="button" className="btn primary" disabled={busy || selectedCount === 0} onClick={runOcr}>
                    {busy ? 'Reading…' : `Extract text (${selectedCount})`}
                  </button>
                  {ocrResults.length > 0 && (
                    <>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => downloadBlob(new Blob([combinedOcrText], { type: 'text/plain' }), 'extracted-text.txt')}
                      >
                        .txt
                      </button>
                      <button type="button" className="btn" onClick={() => copyText(combinedOcrText).catch(() => setMessage('Clipboard unavailable'))}>
                        Copy
                      </button>
                      <select value={ocrView} onChange={(e) => setOcrView(e.target.value as 'combined' | 'per-page')} aria-label="Text view">
                        <option value="combined">Combined</option>
                        <option value="per-page">Per page</option>
                      </select>
                    </>
                  )}
                  {previews.length > 0 && <span className="meta">{selectedCount} selected</span>}
                </>
              )}

              {variant === 'optimize' && docs.length > 0 && (
                <>
                  <button type="button" className="btn primary" disabled={busy || selectedCount === 0} onClick={runCompress}>
                    {busy ? 'Working…' : 'Compress'}
                  </button>
                  <button type="button" className="btn" disabled={busy || selectedCount === 0} onClick={runWatermark}>
                    Watermark
                  </button>
                  <details className="pdf-settings-pop">
                    <summary>Compress options</summary>
                    <div className="pdf-settings-body">
                      <label className="field">
                        <span>Quality ({Math.round(compressQuality * 100)}%)</span>
                        <input type="range" min={0.4} max={0.95} step={0.02} value={compressQuality} onChange={(e) => setCompressQuality(Number(e.target.value))} />
                      </label>
                      <label className="field">
                        <span>Resolution (×{compressScale})</span>
                        <input type="range" min={1} max={2.5} step={0.25} value={compressScale} onChange={(e) => setCompressScale(Number(e.target.value))} />
                      </label>
                    </div>
                  </details>
                  <details className="pdf-settings-pop">
                    <summary>Watermark options</summary>
                    <div className="pdf-settings-body">
                      <label className="field">
                        <span>Text</span>
                        <input value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} />
                      </label>
                      <label className="field">
                        <span>Opacity ({Math.round(watermarkOpacity * 100)}%)</span>
                        <input type="range" min={0.1} max={0.8} step={0.05} value={watermarkOpacity} onChange={(e) => setWatermarkOpacity(Number(e.target.value))} />
                      </label>
                      <label className="field">
                        <span>Size ({watermarkSize}pt)</span>
                        <input type="range" min={24} max={96} value={watermarkSize} onChange={(e) => setWatermarkSize(Number(e.target.value))} />
                      </label>
                      <label className="field">
                        <span>Angle ({watermarkAngle}°)</span>
                        <input type="range" min={-90} max={90} value={watermarkAngle} onChange={(e) => setWatermarkAngle(Number(e.target.value))} />
                      </label>
                    </div>
                  </details>
                  {previews.length > 0 && <span className="meta">{selectedCount} selected</span>}
                </>
              )}

              {statusLine}
            </div>

            {variant === 'ocr' && ocrResults.length > 0 && (
              <div className="pdf-ocr-output">
                {ocrView === 'combined' ? (
                  <pre className="ocr-output">{combinedOcrText}</pre>
                ) : (
                  <div className="ocr-pages">
                    {ocrResults.map((r) => (
                      <div key={r.pageId} className="ocr-page-block">
                        <div className="ocr-page-head">
                          <strong>{r.label}</strong>
                          <span className="meta">{r.method === 'ocr' ? 'OCR' : 'text layer'}</span>
                        </div>
                        <pre className="ocr-output">{r.text || '(no text found)'}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {pageStrip}
          </>
        )}
      </div>
    </ToolPage>
  )
}
