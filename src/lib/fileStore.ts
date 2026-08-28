import { navigate } from './router'
import { TOOLS, type ToolMeta } from './tools'

interface PendingEntry {
  path: string
  files: File[]
}

let pending: PendingEntry | null = null

export function setPendingFiles(path: string, files: File[]): void {
  pending = { path, files: [...files] }
}

export function takePendingFiles(path: string): File[] | null {
  if (pending?.path !== path) return null
  const files = pending.files
  pending = null
  return files
}

export function peekPendingFiles(): File[] | null {
  return pending?.files ?? null
}

export function navigateWithFiles(path: string, files: File[]): void {
  setPendingFiles(path, files)
  navigate(path)
}

export function toFileList(files: File[]): FileList {
  const dt = new DataTransfer()
  for (const f of files) dt.items.add(f)
  return dt.files
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|heic|heif|svg|bmp|tiff?)$/i
const PDF_EXT = /\.pdf$/i
const TEXT_EXT = /\.(txt|md|markdown|json|csv|html?|css|js|ts|tsx|jsx|xml|yaml|yml|log)$/i

function isImage(f: File): boolean {
  return f.type.startsWith('image/') || IMAGE_EXT.test(f.name)
}

function isPdf(f: File): boolean {
  return f.type === 'application/pdf' || PDF_EXT.test(f.name)
}

function isGif(f: File): boolean {
  return f.type === 'image/gif' || /\.gif$/i.test(f.name)
}

function isText(f: File): boolean {
  return f.type.startsWith('text/') || f.type === 'application/json' || TEXT_EXT.test(f.name)
}

const TOOL_MATCHERS: { test: (files: File[]) => boolean; paths: string[] }[] = [
  {
    test: (files) => files.length > 0 && files.every(isPdf),
    paths: ['/pdf/pages', '/pdf/split-export', '/pdf/ocr', '/pdf/optimize'],
  },
  {
    test: (files) => files.some(isGif),
    paths: ['/media/gif'],
  },
  {
    test: (files) => files.length > 0 && files.every(isImage),
    paths: [
      '/image/compressor',
      '/image/convert',
      '/image/resize',
      '/image/background-remover',
      '/image/palette',
      '/screenshot',
      '/favicon',
      '/pdf/from-images',
      '/media/edit',
      '/base64',
    ],
  },
  {
    test: (files) => files.some((f) => /\.(json|csv)$/i.test(f.name) || f.type === 'application/json'),
    paths: ['/json'],
  },
  {
    test: (files) => files.some((f) => /\.(md|markdown)$/i.test(f.name)),
    paths: ['/markdown'],
  },
  {
    test: (files) => files.length > 0 && files.every(isText),
    paths: ['/text', '/diff', '/base64', '/json'],
  },
  {
    test: (files) => files.length > 0,
    paths: ['/base64', '/hash'],
  },
]

export function suggestToolsForFiles(files: File[]): ToolMeta[] {
  if (files.length === 0) return []

  const seen = new Set<string>()
  const out: ToolMeta[] = []

  for (const rule of TOOL_MATCHERS) {
    if (!rule.test(files)) continue
    for (const path of rule.paths) {
      if (seen.has(path)) continue
      const tool = TOOLS.find((t) => t.path === path)
      if (tool) {
        seen.add(path)
        out.push(tool)
      }
    }
  }

  return out
}

export function formatFileList(files: File[]): string {
  if (files.length === 1) return files[0].name
  if (files.length <= 3) return files.map((f) => f.name).join(', ')
  return `${files[0].name} + ${files.length - 1} more`
}
