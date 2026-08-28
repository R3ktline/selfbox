import { useEffect, useRef, useState } from 'react'
import ToolPage from '../components/ToolPage'
import Dropzone from '../components/Dropzone'
import { downloadBlob, readFileAsDataUrl } from '../lib/images'
import {
  b64ToHex,
  b64ToStr,
  fileToB64,
  fromUrlSafeB64,
  hexToB64,
  strToB64,
  toUrlSafeB64,
  wrapB64Lines,
} from '../lib/base64'
import { usePendingFiles } from '../lib/usePendingFiles'

type SubMode = 'text' | 'image' | 'hex' | 'url' | 'file'

const SAMPLE = 'Hello, world!'

export default function Base64Tool() {
  const [sub, setSub] = useState<SubMode>('text')
  const [input, setInput] = useState(SAMPLE)
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [wrapLines, setWrapLines] = useState(false)
  const [auto, setAuto] = useState(true)
  const [direction, setDirection] = useState<'encode' | 'decode'>('encode')
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    if (sub === 'image' || !auto) return
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      try {
        setError(null)
        if (!input.trim()) {
          setOutput('')
          return
        }
        if (direction === 'encode') {
          if (sub === 'text') setOutput(wrapLines ? wrapB64Lines(strToB64(input)) : strToB64(input))
          else if (sub === 'hex') setOutput(wrapLines ? wrapB64Lines(hexToB64(input)) : hexToB64(input))
          else if (sub === 'url') setOutput(toUrlSafeB64(input))
        } else {
          if (sub === 'text') setOutput(b64ToStr(input))
          else if (sub === 'hex') setOutput(b64ToHex(input))
          else if (sub === 'url') setOutput(fromUrlSafeB64(input))
        }
      } catch (e) {
        setError((e as Error).message)
        setOutput('')
      }
    }, 200)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [input, sub, auto, direction, wrapLines])

  useEffect(() => {
    if (sub !== 'image') return
    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            const dataUrl = await readFileAsDataUrl(file)
            setInput(dataUrl.split(',')[1] ?? dataUrl)
            setOutput(dataUrl)
            setInfo(`Pasted: ${file.type} (${file.size} bytes)`)
            e.preventDefault()
            return
          }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [sub])

  const run = (op: 'encode' | 'decode') => {
    setError(null)
    setInfo(null)
    try {
      if (sub === 'text') {
        setOutput(op === 'encode' ? (wrapLines ? wrapB64Lines(strToB64(input)) : strToB64(input)) : b64ToStr(input))
      } else if (sub === 'hex') {
        setOutput(op === 'encode' ? (wrapLines ? wrapB64Lines(hexToB64(input)) : hexToB64(input)) : b64ToHex(input))
      } else if (sub === 'url') {
        setOutput(op === 'encode' ? toUrlSafeB64(input) : fromUrlSafeB64(input))
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const onImageFile = async (f: File) => {
    const dataUrl = await readFileAsDataUrl(f)
    setInput(dataUrl.split(',')[1] ?? '')
    setOutput(dataUrl)
    setInfo(`${f.name} (${f.type}, ${f.size} bytes)`)
  }

  const onAnyFile = async (f: File) => {
    const b64 = await fileToB64(f)
    setInput(b64)
    setOutput(wrapLines ? wrapB64Lines(b64) : b64)
    setInfo(`${f.name} (${f.type || 'unknown'}, ${f.size} bytes)`)
  }

  usePendingFiles('/base64', (pending) => {
    const f = pending[0]
    if (!f) return
    if (f.type.startsWith('image/')) {
      setSub('image')
      void onImageFile(f)
    } else {
      setSub('file')
      void onAnyFile(f)
    }
  })

  const onDecodeImageFromB64 = () => {
    try {
      const raw = input.trim().replace(/\s/g, '')
      setOutput(`data:image/png;base64,${raw}`)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const downloadDecoded = () => {
    if (sub !== 'image' || !output) return
    const m = output.match(/^data:([^;]+);base64,(.*)$/)
    if (!m) return
    const mime = m[1] || 'image/png'
    const b64 = m[2]
    const bin = atob(b64.replace(/\s/g, ''))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const ext = mime.split('/')[1] || 'png'
    downloadBlob(new Blob([bytes], { type: mime }), `decoded.${ext}`)
  }

  const switchMode = (next: SubMode) => {
    setSub(next)
    setInput(next === 'hex' ? '48656c6c6f' : next === 'image' || next === 'file' ? '' : SAMPLE)
    setOutput('')
    setError(null)
    setInfo(null)
  }

  return (
    <ToolPage
      eyebrow="Dev"
      title="Base64 Encoder / Decoder"
      hint="Encode and decode text, hex, URL-safe Base64, images, and arbitrary files — live when auto mode is on."
    >
      <section className="col left">
        <div className="panel">
          <h2>Mode</h2>
          <div className="tabs">
            {(['text', 'image', 'file', 'hex', 'url'] as SubMode[]).map((m) => (
              <button key={m} type="button" className={'tab' + (sub === m ? ' active' : '')} onClick={() => switchMode(m)}>
                {m === 'url' ? 'URL-safe' : m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          {sub !== 'image' && sub !== 'file' && (
            <div className="form-grid" style={{ marginTop: 10 }}>
              <label className="field check">
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                <span>Live encode/decode</span>
              </label>
              {auto && (
                <label className="field">
                  <span>Direction</span>
                  <select value={direction} onChange={(e) => setDirection(e.target.value as 'encode' | 'decode')}>
                    <option value="encode">Encode</option>
                    <option value="decode">Decode</option>
                  </select>
                </label>
              )}
              <label className="field check">
                <input type="checkbox" checked={wrapLines} onChange={(e) => setWrapLines(e.target.checked)} />
                <span>Wrap lines (76 chars)</span>
              </label>
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Input</h2>
          {sub === 'image' ? (
            <>
              <Dropzone accept="image/*" label="Drop, choose, or paste an image" onFiles={(files) => { const f = files[0]; if (f) onImageFile(f) }} />
              <label className="field" style={{ marginTop: 10 }}>
                <span>Or paste Base64</span>
                <textarea value={input} onChange={(e) => setInput(e.target.value)} style={{ minHeight: 80, fontFamily: 'var(--font-mono)' }} />
              </label>
              {input && (
                <button type="button" className="btn" style={{ marginTop: 8 }} onClick={onDecodeImageFromB64}>
                  Decode to preview
                </button>
              )}
            </>
          ) : sub === 'file' ? (
            <Dropzone label="Drop or choose any file to encode" onFiles={(files) => { const f = files[0]; if (f) onAnyFile(f) }} />
          ) : (
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              style={{ minHeight: 220, fontFamily: 'var(--font-mono)' }}
              placeholder={PLACEHOLDERS[sub]}
            />
          )}
          {info && <p className="hint" style={{ marginTop: 10 }}>{info}</p>}
          {error && (
            <div className="warning error" style={{ marginTop: 12 }}>
              <span className="warning-text">{error}</span>
            </div>
          )}
          {sub !== 'image' && sub !== 'file' && !auto && (
            <div className="row-actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn primary" onClick={() => run('encode')}>Encode</button>
              <button type="button" className="btn" onClick={() => run('decode')}>Decode</button>
            </div>
          )}
        </div>
      </section>

      <section className="col right">
        <div className="panel">
          <div className="panel-header">
            <h2>Output</h2>
            {output && (
              <div className="row-actions">
                <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(output)}>Copy</button>
                {sub === 'image' && (
                  <button type="button" className="btn" onClick={downloadDecoded}>Download</button>
                )}
                {sub === 'file' && input && (
                  <button type="button" className="btn" onClick={() => {
                    const bin = atob(input.replace(/\s/g, ''))
                    const bytes = new Uint8Array(bin.length)
                    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
                    downloadBlob(new Blob([bytes]), 'decoded.bin')
                  }}>
                    Download decoded
                  </button>
                )}
              </div>
            )}
          </div>
          {sub === 'image' ? (
            output && output.startsWith('data:') ? (
              <img src={output} alt="decoded" className="preview-image" />
            ) : (
              <p className="hint">Choose an image or paste Base64 to decode.</p>
            )
          ) : (
            <pre className="json-output">{output || '// Output will appear here.'}</pre>
          )}
        </div>
      </section>
    </ToolPage>
  )
}

const PLACEHOLDERS: Record<Exclude<SubMode, 'image' | 'file'>, string> = {
  text: 'Text to encode, or Base64 to decode',
  hex: 'Hex string (e.g. 48656c6c6f)',
  url: 'Text or URL-safe Base64 (uses - and _ instead of + and /)',
}
