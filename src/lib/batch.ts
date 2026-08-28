import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import type { Content, LogoOptions, StyleOptions } from '../types'
import { describeContent } from './content'
import { getQRBlob } from './qr'

export interface BatchItem {
  content: Content
  name?: string
}

function sanitize(name: string): string {
  return name.replace(/[^a-z0-9-_]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'qrcode'
}

export async function generateBatchZip(
  items: BatchItem[],
  style: StyleOptions,
  logo: LogoOptions,
  format: 'png' | 'svg',
  zipName: string,
): Promise<void> {
  const zip = new JSZip()
  const folder = zip.folder('qr-codes')!
  const ext = format === 'svg' ? 'svg' : 'png'

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const blob = await getQRBlob(style, logo, item.content, format)
    const base = item.name?.trim() || describeContent(item.content) || `qrcode-${i + 1}`
    const filename = `${String(i + 1).padStart(3, '0')}-${sanitize(base)}.${ext}`
    folder.file(filename, blob)
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  saveAs(zipBlob, `${zipName}.zip`)
}
