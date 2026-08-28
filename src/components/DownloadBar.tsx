import { useState } from 'react'
import type { Content, LogoOptions, StyleOptions } from '../types'
import { downloadQR } from '../lib/qr'
import { buildPayload, describeContent } from '../lib/content'
import { loadHistory, newId, saveHistory } from '../lib/storage'
import { useToast } from '../lib/toast'

interface Props {
  style: StyleOptions
  logo: LogoOptions
  content: Content
}

const PNG_SIZES: { value: number | 'custom'; label: string; px: string }[] = [
  { value: 256, label: 'Tiny', px: '256 px' },
  { value: 512, label: 'Small', px: '512 px' },
  { value: 1024, label: 'Medium', px: '1024 px' },
  { value: 2048, label: 'Large', px: '2048 px' },
  { value: 4096, label: 'Print', px: '4096 px' },
  { value: 'custom', label: 'Custom', px: 'use panel' },
]

export default function DownloadBar({ style, logo, content }: Props) {
  const [size, setSize] = useState<number | 'custom'>(4096)
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const { push } = useToast()

  const filename = describeContent(content).replace(/[^a-z0-9-_]+/gi, '_') || 'qrcode'
  const effectiveSize = size === 'custom' ? style.downloadSize : size

  const persistHistory = () => {
    const history = loadHistory()
    saveHistory([
      { id: newId(), createdAt: Date.now(), content, style, logo },
      ...history,
    ])
  }

  const onDownloadPng = async () => {
    setBusy(`png-${effectiveSize}`)
    try {
      const scaled = { ...style, downloadSize: effectiveSize }
      await downloadQR(scaled, logo, content, 'png', filename)
      persistHistory()
      push(`Saved PNG ${effectiveSize}px`)
    } finally {
      setBusy(null)
    }
  }

  const onDownloadOther = async (format: 'svg' | 'jpeg' | 'webp') => {
    setBusy(format)
    try {
      const scaled = { ...style, downloadSize: effectiveSize }
      await downloadQR(scaled, logo, content, format, filename)
      persistHistory()
      push(`Saved ${format.toUpperCase()}`)
    } finally {
      setBusy(null)
    }
  }

  const onCopy = async () => {
    const payload = buildPayload(content)
    try {
      await navigator.clipboard.writeText(payload)
      setCopied(true)
      push('Copied payload text')
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      push('Clipboard unavailable', 'error')
    }
  }

  return (
    <div className="download-bar">
      <div className="size-row">
        {PNG_SIZES.map((s) => (
          <button
            key={s.label}
            type="button"
            className={'size-btn' + (size === s.value ? ' active' : '')}
            onClick={() => setSize(s.value)}
            title={s.value === 'custom' ? `Use Style panel value (${style.downloadSize}px)` : s.px}
          >
            {s.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn primary download-primary"
        disabled={busy !== null}
        onClick={onDownloadPng}
      >
        {busy === `png-${effectiveSize}` ? 'Downloading…' : `Download PNG (${effectiveSize}px)`}
      </button>
      <div className="download-row">
        <button
          type="button"
          className="btn"
          disabled={busy !== null}
          onClick={() => onDownloadOther('svg')}
        >
          {busy === 'svg' ? '…' : 'SVG'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy !== null}
          onClick={() => onDownloadOther('jpeg')}
        >
          {busy === 'jpeg' ? '…' : 'JPEG'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy !== null}
          onClick={() => onDownloadOther('webp')}
        >
          {busy === 'webp' ? '…' : 'WebP'}
        </button>
        <button type="button" className="btn" onClick={onCopy} title="Copy the encoded payload (not the image)">
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
