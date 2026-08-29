import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import ToolPage from '../components/ToolPage'
import JsonTree from '../components/JsonTree'
import { readFileAsText } from '../lib/images'
import { useToast } from '../lib/toast'
import { useClipboardPaste } from '../lib/useClipboardPaste'
import { usePendingFiles } from '../lib/usePendingFiles'

type Mode = 'json' | 'csv'
type CsvDelimiter = ',' | ';' | '\t'
type ViewMode = 'text' | 'tree'

function tryParseJson(input: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(input) }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

function detectDelimiter(text: string): CsvDelimiter {
  const first = text.split('\n')[0] ?? ''
  const counts: Record<CsvDelimiter, number> = { ',': 0, ';': 0, '\t': 0 }
  let quoted = false
  for (const c of first) {
    if (c === '"') quoted = !quoted
    else if (!quoted && c in counts) counts[c as CsvDelimiter]++
  }
  if (counts['\t'] >= counts[','] && counts['\t'] >= counts[';']) return '\t'
  if (counts[';'] > counts[',']) return ';'
  return ','
}

function parseCsv(text: string, delimiter: CsvDelimiter): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
    } else if (c === '"') quoted = true
    else if (c === delimiter) {
      row.push(cell)
      cell = ''
    } else if (c === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (c !== '\r') cell += c
  }
  if (cell.length || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((x) => x.length > 0))
}

function coerceValue(s: string): unknown {
  const t = s.trim()
  if (t === '') return ''
  if (t === 'true') return true
  if (t === 'false') return false
  if (t === 'null') return null
  if (/^-?\d+$/.test(t)) return Number(t)
  if (/^-?\d+\.\d+$/.test(t)) return Number(t)
  return s
}

function csvToJson(text: string, delimiter: CsvDelimiter, coerce: boolean): unknown {
  const rows = parseCsv(text, delimiter)
  if (rows.length === 0) return []
  const [header, ...body] = rows
  return body.map((r) => {
    const obj: Record<string, unknown> = {}
    header.forEach((h, i) => {
      const raw = r[i] ?? ''
      obj[h || `col_${i + 1}`] = coerce ? coerceValue(raw) : raw
    })
    return obj
  })
}

function jsonToCsv(value: unknown): string {
  const rows = Array.isArray(value) ? value : [value]
  if (rows.length === 0) return ''
  const objects: Record<string, unknown>[] = rows.map((r) =>
    r && typeof r === 'object' && !Array.isArray(r) ? (r as Record<string, unknown>) : { value: r },
  )
  const keys = Array.from(new Set(objects.flatMap((o) => Object.keys(o))))
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [keys.join(','), ...objects.map((o) => keys.map((k) => esc(o[k])).join(','))].join('\n')
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((k) => [k, sortKeysDeep(obj[k])]),
    )
  }
  return value
}

function stringifyJson(value: unknown, indent: string): string {
  if (indent === '0') return JSON.stringify(value)
  if (indent === 'tab') return JSON.stringify(value, null, '\t')
  return JSON.stringify(value, null, Number(indent))
}

export default function JsonFormatter() {
  const { push } = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<Mode>('json')
  const [viewMode, setViewMode] = useState<ViewMode>('text')
  const [input, setInput] = useState('{"name":"Ada","age":36,"skills":["Math","Engineering"],"active":true}')
  const [indent, setIndent] = useState<string>('2')
  const [delimiter, setDelimiter] = useState<CsvDelimiter>(',')
  const [autoDetectDelimiter, setAutoDetectDelimiter] = useState(true)
  const [coerceTypes, setCoerceTypes] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const activeDelimiter = useMemo(() => {
    if (mode !== 'csv' || !autoDetectDelimiter) return delimiter
    return detectDelimiter(input)
  }, [mode, autoDetectDelimiter, delimiter, input])

  const parsed = useMemo(() => {
    if (mode === 'csv') {
      try {
        return { ok: true as const, value: csvToJson(input, activeDelimiter, coerceTypes) }
      } catch (e) {
        return { ok: false as const, error: (e as Error).message }
      }
    }
    return tryParseJson(input)
  }, [input, mode, activeDelimiter, coerceTypes])

  const output = useMemo(() => {
    if (!parsed.ok) return ''
    return stringifyJson(parsed.value, indent)
  }, [parsed, indent])

  const onFormat = () => {
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setError(null)
    if (mode === 'json') setInput(stringifyJson(parsed.value, indent))
  }

  const onMinify = () => {
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setError(null)
    if (mode === 'json') setInput(JSON.stringify(parsed.value))
  }

  const onSortKeys = () => {
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setInput(stringifyJson(sortKeysDeep(parsed.value), indent))
    push('Keys sorted')
  }

  const onToCsv = () => {
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    try {
      setInput(jsonToCsv(parsed.value))
      setMode('csv')
      setError(null)
      push('Converted to CSV')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const onToJson = () => {
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setInput(stringifyJson(parsed.value, indent))
    setMode('json')
    setError(null)
    push('Converted to JSON')
  }

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(output || input)
      push('Copied to clipboard')
    } catch {
      push('Clipboard unavailable', 'error')
    }
  }

  const onImport = async (f: File) => {
    const text = await readFileAsText(f)
    setInput(text)
    setError(null)
    if (f.name.endsWith('.csv')) setMode('csv')
    else setMode('json')
    push(`Loaded ${f.name}`)
  }

  usePendingFiles('/json', (pending) => { if (pending[0]) void onImport(pending[0]) })

  useClipboardPaste(
    (files) => {
      const f = files[0]
      if (f) void onImport(f)
    },
    { accept: '.json,.csv,.txt', multiple: false },
  )

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.currentTarget
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const spaces = indent === 'tab' ? '\t' : '  '
      const newVal = ta.value.slice(0, start) + spaces + ta.value.slice(end)
      setInput(newVal)
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + spaces.length
      })
    }
  }

  return (
    <ToolPage
      eyebrow="Dev"
      title="JSON / CSV Formatter"
      hint="Validate and pretty-print JSON, convert CSV with delimiter detection, or browse as a tree."
    >
      <section className="col left">
        <div className="panel">
          <div className="panel-header">
            <h2>Input</h2>
            <div className="row-actions">
              <button type="button" className="btn-link" onClick={() => fileInput.current?.click()}>
                Import file
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".json,.csv,.txt"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onImport(f)
                }}
              />
              <div className="mode-switch" role="tablist">
                <button type="button" className={'tab' + (mode === 'json' ? ' active' : '')} onClick={() => { setMode('json'); setError(null) }}>
                  JSON
                </button>
                <button type="button" className={'tab' + (mode === 'csv' ? ' active' : '')} onClick={() => { setMode('csv'); setError(null) }}>
                  CSV
                </button>
              </div>
            </div>
          </div>
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setError(null)
            }}
            onKeyDown={onKeyDown}
            style={{ minHeight: 360, fontFamily: 'var(--font-mono)' }}
            spellCheck={false}
            aria-invalid={Boolean(error) || (input.length > 0 && !parsed.ok)}
          />
          {(error || (input && !parsed.ok)) && (
            <div className="warning error shake" style={{ marginTop: 12 }}>
              <span className="warning-text">Invalid {mode.toUpperCase()}: {error ?? (!parsed.ok ? parsed.error : '')}</span>
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Actions</h2>
          <div className="form-grid">
            <label className="field">
              <span>Indent</span>
              <select value={indent} onChange={(e) => setIndent(e.target.value)}>
                <option value="2">2 spaces</option>
                <option value="4">4 spaces</option>
                <option value="tab">Tab</option>
                <option value="0">No indent</option>
              </select>
            </label>
            {mode === 'csv' && (
              <>
                <label className="field check">
                  <input type="checkbox" checked={autoDetectDelimiter} onChange={(e) => setAutoDetectDelimiter(e.target.checked)} />
                  <span>Auto-detect delimiter</span>
                </label>
                {!autoDetectDelimiter && (
                  <label className="field">
                    <span>Delimiter</span>
                    <select value={delimiter} onChange={(e) => setDelimiter(e.target.value as CsvDelimiter)}>
                      <option value=",">Comma</option>
                      <option value=";">Semicolon</option>
                      <option value={'\t'}>Tab</option>
                    </select>
                  </label>
                )}
                <label className="field check">
                  <input type="checkbox" checked={coerceTypes} onChange={(e) => setCoerceTypes(e.target.checked)} />
                  <span>Coerce numbers & booleans</span>
                </label>
              </>
            )}
          </div>
          <div className="row-actions" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            {mode === 'json' && (
              <>
                <button type="button" className="btn primary" onClick={onFormat}>Format</button>
                <button type="button" className="btn" onClick={onMinify}>Minify</button>
                <button type="button" className="btn" onClick={onSortKeys}>Sort keys</button>
                <button type="button" className="btn" onClick={onToCsv}>JSON → CSV</button>
              </>
            )}
            {mode === 'csv' && (
              <button type="button" className="btn primary" onClick={onToJson}>CSV → JSON</button>
            )}
            <button type="button" className="btn" onClick={onCopy}>Copy output</button>
          </div>
        </div>
      </section>

      <section className="col right">
        <div className="panel">
          <div className="panel-header">
            <h2>{mode === 'csv' ? 'As JSON' : 'Output'}</h2>
            <div className="mode-switch" role="tablist">
              <button type="button" className={'tab' + (viewMode === 'text' ? ' active' : '')} onClick={() => setViewMode('text')}>
                Text
              </button>
              <button type="button" className={'tab' + (viewMode === 'tree' ? ' active' : '')} onClick={() => setViewMode('tree')} disabled={!parsed.ok}>
                Tree
              </button>
            </div>
          </div>
          {viewMode === 'tree' && parsed.ok ? (
            <div className="json-tree-root">
              <JsonTree value={parsed.value} />
            </div>
          ) : (
            <pre className="json-output">
              {output || (mode === 'csv' ? '// Paste CSV with a header row.' : '// Type or paste JSON to see formatted output.')}
            </pre>
          )}
        </div>
      </section>
    </ToolPage>
  )
}
