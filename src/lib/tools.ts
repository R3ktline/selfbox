import type { ToolIconId } from '../components/ToolIcons'

export type ToolGroup = 'Design' | 'Image' | 'PDF' | 'Dev' | 'Media'

export interface ToolMeta {
  path: string
  title: string
  short: string
  desc: string
  group: ToolGroup
  icon: ToolIconId
  keywords: string
}

export const GROUP_ORDER: ToolGroup[] = ['Design', 'Image', 'PDF', 'Dev', 'Media']

export const GROUP_META: Record<
  ToolGroup,
  { label: string; tagline: string; desc: string }
> = {
  Design: {
    label: 'Design',
    tagline: 'Create & convert',
    desc: 'QR codes, palettes, and unit converters for visual work.',
  },
  Image: {
    label: 'Image',
    tagline: 'Edit & optimize',
    desc: 'Compress, convert, remove backgrounds, and beautify screenshots.',
  },
  PDF: {
    label: 'PDF',
    tagline: 'Document tools',
    desc: 'Merge, split, rotate, compress, watermark, OCR, and convert between PDF and images.',
  },
  Dev: {
    label: 'Dev',
    tagline: 'Developer utilities',
    desc: 'Formatters, encoders, diffs, and export helpers.',
  },
  Media: {
    label: 'Media',
    tagline: 'Download & edit',
    desc: 'Download from platforms, edit GIFs, and annotate images.',
  },
}

export const TOOLS: ToolMeta[] = [
  {
    path: '/qr',
    title: 'QR Code Generator',
    short: 'QR',
    desc: 'Styled codes with logos, batch export, and presets.',
    group: 'Design',
    icon: 'qr',
    keywords: 'qr barcode wifi vcard logo batch',
  },
  {
    path: '/image/background-remover',
    title: 'Background Remover',
    short: 'BG Remove',
    desc: 'Strip solid backgrounds. Transparent PNG, on-device.',
    group: 'Image',
    icon: 'bg-remove',
    keywords: 'cutout chroma key transparent png',
  },
  {
    path: '/image/compressor',
    title: 'Image Compressor',
    short: 'Compress',
    desc: 'Shrink images to a target size without uploading.',
    group: 'Image',
    icon: 'compress',
    keywords: 'compress jpeg webp optimize size',
  },
  {
    path: '/image/convert',
    title: 'Image Format Converter',
    short: 'Convert',
    desc: 'HEIC/HEIF to PNG, JPEG, or WebP — convert locally.',
    group: 'Image',
    icon: 'convert',
    keywords: 'heic avif webp convert format',
  },
  {
    path: '/image/resize',
    title: 'Image Resize & Crop',
    short: 'Resize',
    desc: 'Resize, crop, and export images with live preview.',
    group: 'Image',
    icon: 'resize',
    keywords: 'resize crop scale dimensions width height',
  },
  {
    path: '/image/palette',
    title: 'Color Palette from Image',
    short: 'Palette',
    desc: 'Extract a usable palette. Export HEX, RGB, CSS variables.',
    group: 'Design',
    icon: 'palette',
    keywords: 'palette colors extract hex css',
  },
  {
    path: '/pdf/pages',
    title: 'PDF Page Editor',
    short: 'Pages',
    desc: 'Merge PDFs, reorder pages, rotate, or delete pages.',
    group: 'PDF',
    icon: 'pdf-pages',
    keywords: 'merge reorder rotate delete pages pdf',
  },
  {
    path: '/pdf/split-export',
    title: 'PDF Split & Export',
    short: 'Split',
    desc: 'Split every page, extract selections, or export as images.',
    group: 'PDF',
    icon: 'pdf-split',
    keywords: 'split extract pages images png jpeg zip',
  },
  {
    path: '/pdf/from-images',
    title: 'Images to PDF',
    short: 'To PDF',
    desc: 'Combine images into a single PDF with drag-to-reorder.',
    group: 'PDF',
    icon: 'pdf-images',
    keywords: 'images photos jpg png to pdf create',
  },
  {
    path: '/pdf/ocr',
    title: 'PDF Text Extract',
    short: 'OCR',
    desc: 'Extract text with pdf.js and OCR fallback for scans.',
    group: 'PDF',
    icon: 'pdf-ocr',
    keywords: 'ocr text extract scan tesseract',
  },
  {
    path: '/pdf/optimize',
    title: 'PDF Optimize',
    short: 'Optimize',
    desc: 'Compress image-heavy PDFs or add a text watermark.',
    group: 'PDF',
    icon: 'pdf-optimize',
    keywords: 'compress watermark optimize shrink',
  },
  {
    path: '/favicon',
    title: 'Favicon Generator',
    short: 'Favicon',
    desc: 'SVG/PNG in — multi-size PNGs, ICO, and web manifest out.',
    group: 'Dev',
    icon: 'favicon',
    keywords: 'favicon ico apple touch icon',
  },
  {
    path: '/screenshot',
    title: 'Screenshot Beautifier',
    short: 'Screenshot',
    desc: 'Live preview mockups with frames, shadows, and export options.',
    group: 'Image',
    icon: 'screenshot',
    keywords: 'mockup frame shadow share crop pan zoom aspect',
  },
  {
    path: '/markdown',
    title: 'Markdown → PDF / Image',
    short: 'Markdown',
    desc: 'GFM Markdown with syntax highlighting. Live preview, beautifier-style PDF/PNG export.',
    group: 'Dev',
    icon: 'markdown',
    keywords: 'md pdf png docs export theme',
  },
  {
    path: '/json',
    title: 'JSON / CSV Formatter',
    short: 'JSON',
    desc: 'Format JSON, tree view, CSV conversion with delimiter detection.',
    group: 'Dev',
    icon: 'json',
    keywords: 'json csv pretty minify validate',
  },
  {
    path: '/diff',
    title: 'Text Diff',
    short: 'Diff',
    desc: 'Line or word diff, side-by-side view, patch and beautified PNG export.',
    group: 'Dev',
    icon: 'diff',
    keywords: 'diff compare patch git png export',
  },
  {
    path: '/base64',
    title: 'Base64 Encoder / Decoder',
    short: 'Base64',
    desc: 'Live encode/decode for text, hex, URL-safe, images, and files.',
    group: 'Dev',
    icon: 'base64',
    keywords: 'base64 encode decode data url',
  },
  {
    path: '/units',
    title: 'Unit & Color Converter',
    short: 'Units',
    desc: 'Bidirectional px/rem/vw, colors, and WCAG contrast checker.',
    group: 'Design',
    icon: 'units',
    keywords: 'px rem em hsl rgb hex vw',
  },
  {
    path: '/regex',
    title: 'Regex Tester',
    short: 'Regex',
    desc: 'Test patterns with live highlighting and replace preview.',
    group: 'Dev',
    icon: 'regex',
    keywords: 'regex regexp pattern match replace',
  },
  {
    path: '/hash',
    title: 'Hash & UUID Generator',
    short: 'Hash',
    desc: 'SHA-256/512 hashes and UUID or nanoid generation.',
    group: 'Dev',
    icon: 'hash',
    keywords: 'sha256 hash uuid nanoid checksum',
  },
  {
    path: '/text',
    title: 'Text Tools',
    short: 'Text',
    desc: 'Word counter, replace, case/slug tools, and spell check.',
    group: 'Dev',
    icon: 'text',
    keywords: 'words count spell replace find text',
  },
  {
    path: '/media',
    title: 'Media Downloader',
    short: 'Download',
    desc: 'YouTube, Twitter/X, SoundCloud (yt-dlp) and Spotify (spotDL). Batch & playlists.',
    group: 'Media',
    icon: 'media',
    keywords: 'youtube twitter soundcloud download playlist batch cobalt video audio',
  },
  {
    path: '/media/gif',
    title: 'GIF Tools',
    short: 'GIF',
    desc: 'Split GIF frames, preview animations, or build GIFs from images.',
    group: 'Media',
    icon: 'gif',
    keywords: 'gif frames split animate create',
  },
  {
    path: '/media/edit',
    title: 'Image Editor',
    short: 'Edit',
    desc: 'Crop, redact with black boxes, and add text overlays.',
    group: 'Media',
    icon: 'edit',
    keywords: 'crop redact text annotate image edit',
  },
]

export function toolByPath(path: string): ToolMeta | undefined {
  return TOOLS.find((t) => t.path === path)
}

export function toolsInGroup(group: ToolGroup): ToolMeta[] {
  return TOOLS.filter((t) => t.group === group)
}

export function searchTools(query: string): ToolMeta[] {
  const q = query.trim().toLowerCase()
  if (!q) return TOOLS
  return TOOLS.filter((t) => {
    const hay = `${t.title} ${t.desc} ${t.group} ${t.keywords} ${t.short}`.toLowerCase()
    return hay.includes(q)
  })
}

export const PAGE_TITLES: Record<string, string> = {
  home: 'Your personal toolbox — self-hosted',
  qr: 'QR Code Generator — Toolbox',
  'image-bg-remover': 'Background Remover — Toolbox',
  'image-compressor': 'Image Compressor — Toolbox',
  'image-convert': 'Image Converter — Toolbox',
  'image-palette': 'Color Palette — Toolbox',
  pdf: 'PDF Tools — Toolbox',
  'pdf-pages': 'PDF Page Editor — Toolbox',
  'pdf-split-export': 'PDF Split & Export — Toolbox',
  'pdf-from-images': 'Images to PDF — Toolbox',
  'pdf-ocr': 'PDF Text Extract — Toolbox',
  'pdf-optimize': 'PDF Optimize — Toolbox',
  favicon: 'Favicon Generator — Toolbox',
  screenshot: 'Screenshot Beautifier — Toolbox',
  markdown: 'Markdown Export — Toolbox',
  json: 'JSON / CSV Formatter — Toolbox',
  diff: 'Text Diff — Toolbox',
  base64: 'Base64 — Toolbox',
  units: 'Unit Converter — Toolbox',
  text: 'Text Tools — Toolbox',
  regex: 'Regex Tester — Toolbox',
  hash: 'Hash & UUID — Toolbox',
  'image-resize': 'Image Resize — Toolbox',
  media: 'Media Downloader — Toolbox',
  'media-gif': 'GIF Tools — Toolbox',
  'media-edit': 'Image Editor — Toolbox',
  'not-found': 'Not found — Toolbox',
}
