import { useMemo, useState } from 'react'
import type { Content, LogoOptions, StyleOptions } from '../types'
import { generateBatchZip } from '../lib/batch'

interface Props {
  style: StyleOptions
  logo: LogoOptions
}

const EXAMPLE = `https://example.com
https://github.com/anomalyco/opencode
Hello, world!
WIFI:T:WPA;S:MyWiFi;P:secret123;;
mailto:hello@example.com
tel:+15551234567`

export default function BatchPanel({ style, logo }: Props) {
  const [input, setInput] = useState(EXAMPLE)
  const [format, setFormat] = useState<'png' | 'svg'>('png')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')

  const items = useMemo(() => parseBatch(input), [input])

  const onRun = async () => {
    if (items.length === 0) return
    setBusy(true)
    setProgress(`0 / ${items.length}`)
    try {
      await generateBatchZip(
        items.map((item, i) => ({
          content: item.content,
          name: item.name || String(i + 1),
        })),
        style,
        logo,
        format,
        `qr-batch-${Date.now()}`,
      )
      setProgress(`Done — ${items.length} codes`)
    } catch (e) {
      setProgress(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
      window.setTimeout(() => setProgress(''), 4000)
    }
  }

  return (
    <div className="extras-block">
      <h3 className="extras-heading">Batch generation</h3>
      <p className="hint">
        One payload per line — URLs, WiFi strings, mailto, tel, or plain text. Prefix with{' '}
        <code>name | payload</code> to name files.
      </p>
      <textarea
        className="batch-input"
        rows={6}
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <div className="batch-row">
        <label>
          <span>Format</span>
          <select value={format} onChange={(e) => setFormat(e.target.value as 'png' | 'svg')}>
            <option value="png">PNG</option>
            <option value="svg">SVG</option>
          </select>
        </label>
        <div className="spacer" />
        <span className="meta">
          {items.length} {items.length === 1 ? 'code' : 'codes'} ready
        </span>
        <button type="button" className="btn primary" disabled={busy || items.length === 0} onClick={onRun}>
          {busy ? 'Generating…' : `Download ZIP (${format.toUpperCase()})`}
        </button>
      </div>
      {progress && <p className="hint">{progress}</p>}
    </div>
  )
}

interface BatchRow {
  content: Content
  name?: string
}

function parseBatch(input: string): BatchRow[] {
  const lines = input.split(/\r?\n/)
  const rows: BatchRow[] = []
  let vcardBuf: string[] = []

  const flushVcard = () => {
    if (vcardBuf.length > 0) {
      const text = vcardBuf.join('\n')
      vcardBuf = []
      rows.push({ content: { type: 'text', text } })
    }
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flushVcard()
      continue
    }
    if (line.startsWith('BEGIN:VCARD')) {
      vcardBuf.push(line)
      continue
    }
    if (vcardBuf.length > 0) {
      vcardBuf.push(line)
      if (line === 'END:VCARD') flushVcard()
      continue
    }
    let name: string | undefined
    let payload = line
    if (line.includes('|')) {
      const idx = line.indexOf('|')
      const left = line.slice(0, idx).trim()
      payload = line.slice(idx + 1).trim()
      if (left) name = left
    }
    rows.push({ content: detectContent(payload), name })
  }
  flushVcard()
  return rows
}

function detectContent(payload: string): Content {
  if (/^https?:\/\//i.test(payload)) return { type: 'url', url: payload }
  if (/^mailto:/i.test(payload)) {
    const rest = payload.slice(7)
    const [email, query] = rest.split('?')
    const params = new URLSearchParams(query || '')
    return {
      type: 'email',
      email: email || '',
      subject: params.get('subject') || '',
      body: params.get('body') || '',
    }
  }
  if (/^tel:/i.test(payload)) return { type: 'tel', phone: payload.slice(4) }
  if (/^sms:/i.test(payload)) {
    const [phone, query] = payload.slice(4).split('?')
    const params = new URLSearchParams(query || '')
    return { type: 'sms', phone: phone || '', body: params.get('body') || '' }
  }
  if (/^geo:/i.test(payload)) {
    const [lat, lng] = payload.slice(4).split(',')
    return { type: 'geo', lat: lat || '', lng: lng || '' }
  }
  if (/^WIFI:/i.test(payload)) {
    const fields: Record<string, string> = {}
    payload
      .slice(5)
      .split(';')
      .filter(Boolean)
      .forEach((part) => {
        const idx = part.indexOf(':')
        if (idx === -1) return
        fields[part.slice(0, idx)] = part.slice(idx + 1)
      })
    return {
      type: 'wifi',
      ssid: fields.S || '',
      password: fields.P || '',
      security: (fields.T as 'WPA' | 'WEP' | 'nopass') || 'WPA',
      hidden: fields.H === 'true',
    }
  }
  return { type: 'text', text: payload }
}
