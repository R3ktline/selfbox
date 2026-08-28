import { useMemo, useRef, useState } from 'react'
import { diffLines, diffWords } from 'diff'
import ToolPage from '../components/ToolPage'
import { downloadBlob, readFileAsText } from '../lib/images'
import { exportDiffAsImage } from '../lib/diff-export'
import { useToast } from '../lib/toast'

type DiffMode = 'lines' | 'words'
type Layout = 'unified' | 'split'

function countLines(parts: ReturnType<typeof diffLines>): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const part of parts) {
    const lines = part.value.split('\n')
    const n = part.value.endsWith('\n') ? lines.length - 1 : lines.length
    if (part.added) added += n
    else if (part.removed) removed += n
  }
  return { added, removed }
}

function buildUnifiedPatch(a: string, b: string, parts: ReturnType<typeof diffLines>): string {
  const aLines = a.split('\n')
  const bLines = b.split('\n')
  const out: string[] = ['--- original', '+++ modified', `@@ -1,${aLines.length} +1,${bLines.length} @@`]
  for (const part of parts) {
    const lines = part.value.replace(/\n$/, '').split('\n')
    for (const line of lines) {
      if (part.added) out.push(`+${line}`)
      else if (part.removed) out.push(`-${line}`)
      else out.push(` ${line}`)
    }
  }
  return out.join('\n') + '\n'
}

export default function TextDiff() {
  const [a, setA] = useState('Hello, world.\nThis is a test.\nGoodbye.')
  const [b, setB] = useState('Hello, world.\nThis is a different test.\nGoodbye.\nNew line added.')
  const [diffMode, setDiffMode] = useState<DiffMode>('lines')
  const [layout, setLayout] = useState<Layout>('unified')
  const [exportBusy, setExportBusy] = useState(false)
  const fileA = useRef<HTMLInputElement>(null)
  const fileB = useRef<HTMLInputElement>(null)
  const diffRef = useRef<HTMLDivElement>(null)
  const { push } = useToast()

  const diff = useMemo(() => {
    if (diffMode === 'words') return diffWords(a, b)
    return diffLines(a, b)
  }, [a, b, diffMode])

  const stats = useMemo(() => countLines(diffMode === 'lines' ? (diff as ReturnType<typeof diffLines>) : diffLines(a, b)), [diff, diffMode, a, b])

  const onLoadFile = async (f: File, side: 'a' | 'b') => {
    const text = await readFileAsText(f)
    if (side === 'a') setA(text)
    else setB(text)
  }

  const onBeautifyExport = async () => {
    const el = diffRef.current?.querySelector('.diff-output') as HTMLElement | null
    if (!el) return
    setExportBusy(true)
    try {
      const blob = await exportDiffAsImage(el, {
        title: 'Text Diff',
        subtitle: `+${stats.added} / −${stats.removed} · ${diffMode === 'lines' ? 'line' : 'word'} diff`,
      })
      downloadBlob(blob, 'diff-beautified.png')
      push('Beautified diff downloaded')
    } catch (e) {
      push(e instanceof Error ? e.message : 'Export failed', 'error')
    } finally {
      setExportBusy(false)
    }
  }

  return (
    <ToolPage
      eyebrow="Dev"
      title="Text Diff"
      hint="Compare two blocks of text. Line or word-level diff, unified or side-by-side view."
    >
      <section className="col left">
        <div className="panel">
          <div className="panel-header">
            <h2>Original</h2>
            <button type="button" className="btn-link" onClick={() => fileA.current?.click()}>Import</button>
            <input ref={fileA} type="file" accept=".txt,.md,.json,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onLoadFile(f, 'a') }} />
          </div>
          <textarea
            value={a}
            onChange={(e) => setA(e.target.value)}
            style={{ minHeight: 200, fontFamily: 'var(--font-mono)' }}
            spellCheck={false}
          />
        </div>
        <div className="panel">
          <div className="panel-header">
            <h2>Modified</h2>
            <div className="row-actions">
              <button type="button" className="btn-link" onClick={() => { setA(b); setB(a) }}>Swap</button>
              <button type="button" className="btn-link" onClick={() => fileB.current?.click()}>Import</button>
            </div>
            <input ref={fileB} type="file" accept=".txt,.md,.json,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onLoadFile(f, 'b') }} />
          </div>
          <textarea
            value={b}
            onChange={(e) => setB(e.target.value)}
            style={{ minHeight: 200, fontFamily: 'var(--font-mono)' }}
            spellCheck={false}
          />
        </div>
      </section>

      <section className="col right">
        <div className="panel">
          <div className="panel-header">
            <h2>Diff</h2>
            <div className="row-actions" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <select value={diffMode} onChange={(e) => setDiffMode(e.target.value as DiffMode)}>
                <option value="lines">Line diff</option>
                <option value="words">Word diff</option>
              </select>
              <select value={layout} onChange={(e) => setLayout(e.target.value as Layout)}>
                <option value="unified">Unified</option>
                <option value="split">Side by side</option>
              </select>
              <span className="meta">
                <span style={{ color: 'var(--success)' }}>+{stats.added}</span>{' · '}
                <span style={{ color: 'var(--error)' }}>−{stats.removed}</span>
              </span>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  downloadBlob(
                    new Blob([buildUnifiedPatch(a, b, diffLines(a, b))], { type: 'text/plain' }),
                    'diff.patch',
                  )
                }
              >
                Download patch
              </button>
              <button type="button" className="btn primary" onClick={onBeautifyExport} disabled={exportBusy}>
                {exportBusy ? 'Exporting…' : 'Beautified PNG'}
              </button>
            </div>
          </div>
          <div ref={diffRef}>
          {layout === 'unified' ? (
            <pre className="diff-output">
              {diff.map((part, i) => {
                const lines = part.value.replace(/\n$/, '').split('\n')
                return lines.map((line, j) => (
                  <div
                    key={`${i}-${j}`}
                    className={part.added ? 'diff-line added' : part.removed ? 'diff-line removed' : 'diff-line'}
                  >
                    <span className="diff-marker">{part.added ? '+' : part.removed ? '−' : ' '}</span>
                    <span>{line || ' '}</span>
                  </div>
                ))
              })}
            </pre>
          ) : (
            <div className="diff-split">
              <div className="diff-split-col">
                <h3 className="diff-split-title">Original</h3>
                <pre className="diff-output">
                  {diffLines(a, b).map((part, i) => {
                    if (part.added) return null
                    const lines = part.value.replace(/\n$/, '').split('\n')
                    return lines.map((line, j) => (
                      <div key={`${i}-${j}`} className={part.removed ? 'diff-line removed' : 'diff-line'}>
                        <span className="diff-marker">{part.removed ? '−' : ' '}</span>
                        <span>{line || ' '}</span>
                      </div>
                    ))
                  })}
                </pre>
              </div>
              <div className="diff-split-col">
                <h3 className="diff-split-title">Modified</h3>
                <pre className="diff-output">
                  {diffLines(a, b).map((part, i) => {
                    if (part.removed) return null
                    const lines = part.value.replace(/\n$/, '').split('\n')
                    return lines.map((line, j) => (
                      <div key={`${i}-${j}`} className={part.added ? 'diff-line added' : 'diff-line'}>
                        <span className="diff-marker">{part.added ? '+' : ' '}</span>
                        <span>{line || ' '}</span>
                      </div>
                    ))
                  })}
                </pre>
              </div>
            </div>
          )}
          </div>
        </div>
      </section>
    </ToolPage>
  )
}
