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
