import { useMemo, useState } from 'react'
import ToolPage from '../components/ToolPage'
import { highlightRegexMatches, regexReplace, testRegex } from '../lib/case-convert'

const SAMPLE = 'Contact us at hello@example.com or call +1 (555) 123-4567.'

export default function RegexTester() {
  const [pattern, setPattern] = useState('[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}')
  const [flags, setFlags] = useState('g')
  const [input, setInput] = useState(SAMPLE)
  const [replacement, setReplacement] = useState('[redacted]')

  const result = useMemo(() => testRegex(pattern, flags, input), [pattern, flags, input])
  const replaced = useMemo(() => regexReplace(pattern, flags, input, replacement), [pattern, flags, input, replacement])
  const highlighted = useMemo(
    () => (result.error ? null : highlightRegexMatches(input, result.matches)),
    [input, result],
  )

  const toggleFlag = (f: string) => {
    setFlags((prev) => (prev.includes(f) ? prev.replace(f, '') : prev + f))
  }

  return (
    <ToolPage eyebrow="Dev" title="Regex Tester" hint="Test regular expressions with live match highlighting and replace preview.">
      <section className="col left">
        <div className="panel">
          <h2>Pattern</h2>
          <div className="form-grid">
            <label className="field span-2">
              <span>Regular expression</span>
              <input value={pattern} onChange={(e) => setPattern(e.target.value)} style={{ fontFamily: 'var(--font-mono)' }} />
            </label>
            <div className="field span-2">
              <span>Flags</span>
              <div className="regex-flags">
                {['g', 'i', 'm', 's', 'u', 'y'].map((f) => (
                  <button key={f} type="button" className={'tab' + (flags.includes(f) ? ' active' : '')} onClick={() => toggleFlag(f)}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {result.error && (
            <div className="warning error" style={{ marginTop: 12 }}>
              <span className="warning-text">{result.error}</span>
            </div>
          )}
        </div>
        <div className="panel">
          <h2>Test string</h2>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} style={{ minHeight: 200, fontFamily: 'var(--font-mono)' }} spellCheck={false} />
        </div>
        <div className="panel">
          <h2>Replace preview</h2>
          <label className="field">
            <span>Replacement</span>
            <input value={replacement} onChange={(e) => setReplacement(e.target.value)} style={{ fontFamily: 'var(--font-mono)' }} />
          </label>
          {replaced.error ? (
            <p className="hint error-text">{replaced.error}</p>
          ) : (
            <pre className="json-output" style={{ marginTop: 10 }}>{replaced.output || '// No output'}</pre>
          )}
        </div>
      </section>
      <section className="col right">
        <div className="panel">
          <h2>Matches ({result.matches.length})</h2>
          {highlighted ? (
            <div className="regex-highlight" dangerouslySetInnerHTML={{ __html: highlighted }} />
          ) : (
            <p className="hint">Fix the pattern to see matches.</p>
          )}
          {result.matches.length > 0 && (
            <ul className="regex-match-list">
              {result.matches.map((m, i) => (
                <li key={i}>
                  <code>{JSON.stringify(m.match)}</code>
                  <span className="meta"> at index {m.index}</span>
                  {m.groups.length > 0 && <span className="meta"> · groups: {m.groups.map((g) => JSON.stringify(g)).join(', ')}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </ToolPage>
  )
}
