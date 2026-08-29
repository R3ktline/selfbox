import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ToolPage from '../components/ToolPage'
import { readFileAsText } from '../lib/images'
import { applyReplaceAll, countTextStats } from '../lib/text-utils'
import {
  addCustomWord,
  applyReplacement,
  applyReplacements,
  ensureSpellDictionary,
  findMisspellings,
  getCustomWords,
  getIgnoredWords,
  highlightMisspellings,
  ignoreWord,
  type SpellIssue,
} from '../lib/spell-check'
import { useToast } from '../lib/toast'
import { useClipboardPaste } from '../lib/useClipboardPaste'
import { usePendingFiles } from '../lib/usePendingFiles'

import { convertCase, slugify, type CaseStyle } from '../lib/case-convert'

type Tab = 'counter' | 'replace' | 'spell' | 'case' | 'slug'

const SAMPLE =
  'The quick brown fox jumps over the lazy dog.\nThis is a sampel text with a few mispelled words for testing.'

export default function TextTools() {
  const { push } = useToast()
  const [tab, setTab] = useState<Tab>('counter')
  const [text, setText] = useState(SAMPLE)
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [customWord, setCustomWord] = useState('')
  const [slugSep, setSlugSep] = useState('-')
  const fileInput = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)

  const stats = useMemo(() => countTextStats(text), [text])
  const [misspellings, setMisspellings] = useState<SpellIssue[]>([])
  const [spellBusy, setSpellBusy] = useState(false)
  const [dictVersion, setDictVersion] = useState(0)

  const runSpellCheck = useCallback(async (input: string) => {
    setSpellBusy(true)
    try {
      const issues = await findMisspellings(input)
      setMisspellings(issues)
    } catch (e) {
      push(e instanceof Error ? e.message : 'Spell check failed', 'error')
      setMisspellings([])
    } finally {
      setSpellBusy(false)
    }
  }, [push])

  useEffect(() => {
    if (tab !== 'spell') return
    const ta = textareaRef.current
    const hl = highlightRef.current
    if (!ta || !hl) return
    const sync = () => {
      hl.scrollTop = ta.scrollTop
      hl.scrollLeft = ta.scrollLeft
    }
    ta.addEventListener('scroll', sync)
    sync()
    return () => ta.removeEventListener('scroll', sync)
  }, [tab, text])

  useEffect(() => {
    if (tab !== 'spell') return
    ensureSpellDictionary().catch(() => {})
  }, [tab])

  useEffect(() => {
    if (tab !== 'spell') return
    const timer = window.setTimeout(() => {
      runSpellCheck(text)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [text, tab, dictVersion, runSpellCheck])

  const highlighted = useMemo(
    () => (tab === 'spell' && !spellBusy ? highlightMisspellings(text, misspellings) : ''),
    [tab, spellBusy, text, misspellings],
  )

  const replaceCount = useMemo(() => {
    if (!find) return 0
    const flags = caseSensitive ? 'g' : 'gi'
    const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return (text.match(new RegExp(escaped, flags)) ?? []).length
  }, [text, find, caseSensitive])

  const onImport = async (f: File) => {
    setText(await readFileAsText(f))
  }

  usePendingFiles('/text', (pending) => { if (pending[0]) void onImport(pending[0]) })

  useClipboardPaste(
    (files) => {
      const f = files[0]
      if (f) void onImport(f)
    },
    { accept: '.txt,.md,.json,.csv', multiple: false },
  )

  const fixIssue = (issue: SpellIssue, replacement: string) => {
    setText((prev) => applyReplacement(prev, issue.index, issue.length, replacement))
  }

  const fixAll = () => {
    const replacements = misspellings
      .filter((i) => i.suggestions[0])
      .map((i) => ({ index: i.index, length: i.length, word: i.suggestions[0]! }))
    if (replacements.length === 0) {
      push('No suggestions available to fix', 'error')
      return
    }
    setText((prev) => applyReplacements(prev, replacements))
    push(`Fixed ${replacements.length} word${replacements.length !== 1 ? 's' : ''}`)
  }

  const scrollToIssue = (issue: SpellIssue) => {
    const ta = textareaRef.current
    if (!ta) return
    ta.focus()
    ta.setSelectionRange(issue.index, issue.index + issue.length)
    const lineHeight = 20
    const linesBefore = text.slice(0, issue.index).split('\n').length - 1
    ta.scrollTop = Math.max(0, linesBefore * lineHeight - 60)
  }

  const customWords = getCustomWords()
  const ignoredWords = getIgnoredWords()
  const slug = useMemo(() => slugify(text, slugSep), [text, slugSep])

  const CASE_STYLES: { id: CaseStyle; label: string }[] = [
    { id: 'lower', label: 'lower case' },
    { id: 'upper', label: 'UPPER CASE' },
    { id: 'title', label: 'Title Case' },
    { id: 'sentence', label: 'Sentence case' },
    { id: 'camel', label: 'camelCase' },
    { id: 'pascal', label: 'PascalCase' },
    { id: 'snake', label: 'snake_case' },
    { id: 'screaming', label: 'SCREAMING_SNAKE' },
    { id: 'kebab', label: 'kebab-case' },
    { id: 'constant', label: 'CONSTANT_CASE' },
  ]

  return (
    <ToolPage
      eyebrow="Dev"
      title="Text Tools"
      hint="Word counter, find & replace, case conversion, slugify, and spell check."
    >
      <section className="col left">
        <div className="panel">
          <div className="panel-header">
            <h2>Text</h2>
            <button type="button" className="btn-link" onClick={() => fileInput.current?.click()}>
              Import
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".txt,.md,.json,.csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onImport(f)
              }}
            />
          </div>
          <div className="tabs" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
            {(
              [
                ['counter', 'Counter'],
                ['replace', 'Replace'],
                ['case', 'Case'],
                ['slug', 'Slug'],
                ['spell', 'Spell'],
              ] as [Tab, string][]
            ).map(([t, label]) => (
              <button key={t} type="button" className={'tab' + (tab === t ? ' active' : '')} onClick={() => setTab(t)}>
                {label}
              </button>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className={tab === 'spell' ? 'spell-textarea' : undefined}
            style={{ minHeight: 280, fontFamily: 'var(--font-mono)' }}
            spellCheck={false}
          />
          {tab === 'spell' && highlighted && (
            <div className="spell-highlight-wrap" aria-hidden="true">
              <div ref={highlightRef} className="spell-highlight" dangerouslySetInnerHTML={{ __html: highlighted }} />
            </div>
          )}
        </div>

        {tab === 'replace' && (
          <div className="panel">
            <h2>Find & replace</h2>
            <div className="form-grid">
              <label className="field">
                <span>Find</span>
                <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search text" />
              </label>
              <label className="field">
                <span>Replace with</span>
                <input value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="Replacement" />
              </label>
              <label className="field check span-2">
                <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
                <span>Case sensitive</span>
              </label>
            </div>
            <div className="row-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn primary"
                disabled={!find}
                onClick={() => setText(applyReplaceAll(text, find, replace, caseSensitive))}
              >
                Replace all{replaceCount > 0 ? ` (${replaceCount})` : ''}
              </button>
            </div>
          </div>
        )}

        {tab === 'slug' && (
          <div className="panel">
            <h2>Slug options</h2>
            <label className="field">
              <span>Separator</span>
              <select value={slugSep} onChange={(e) => setSlugSep(e.target.value)}>
                <option value="-">Hyphen (-)</option>
                <option value="_">Underscore (_)</option>
                <option value=".">Dot (.)</option>
              </select>
            </label>
          </div>
        )}

        {tab === 'spell' && (
          <div className="panel">
            <h2>Dictionary</h2>
            <p className="hint">US English dictionary. Add tech terms or names so they are not flagged.</p>
            <div className="row-actions" style={{ marginTop: 8 }}>
              <input
                value={customWord}
                onChange={(e) => setCustomWord(e.target.value)}
                placeholder="Add word…"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn"
                disabled={!customWord.trim()}
                onClick={() => {
                  addCustomWord(customWord.trim())
                  setCustomWord('')
                  setDictVersion((v) => v + 1)
                  push(`Added "${customWord.trim()}" to dictionary`)
                }}
              >
                Add
              </button>
            </div>
            {customWords.size > 0 && (
              <div className="spell-tags">
                {[...customWords].slice(0, 12).map((w) => (
                  <span key={w} className="spell-tag">{w}</span>
                ))}
                {customWords.size > 12 && <span className="meta">+{customWords.size - 12} more</span>}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="col right">
        <div className="panel">
          {tab === 'counter' && (
            <>
              <h2>Statistics</h2>
              <table className="kv-table">
                <tbody>
                  <tr><th>Words</th><td>{stats.words.toLocaleString()}</td></tr>
                  <tr><th>Unique words</th><td>{stats.uniqueWords.toLocaleString()}</td></tr>
                  <tr><th>Characters</th><td>{stats.chars.toLocaleString()}</td></tr>
                  <tr><th>No spaces</th><td>{stats.charsNoSpaces.toLocaleString()}</td></tr>
                  <tr><th>Lines</th><td>{stats.lines.toLocaleString()}</td></tr>
                  <tr><th>Paragraphs</th><td>{stats.paragraphs.toLocaleString()}</td></tr>
                  <tr><th>Sentences</th><td>{stats.sentences.toLocaleString()}</td></tr>
                  <tr>
                    <th>Reading time</th>
                    <td>
                      {stats.readingMinutes < 1
                        ? `${Math.max(1, Math.round(stats.readingMinutes * 60))} sec`
                        : `${stats.readingMinutes.toFixed(1)} min`}
                    </td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {tab === 'replace' && (
            <>
              <h2>Preview</h2>
              <p className="hint">
                {find ? `${replaceCount} match${replaceCount !== 1 ? 'es' : ''} found` : 'Enter text to find above.'}
              </p>
            </>
          )}

          {tab === 'case' && (
            <>
              <h2>Case conversion</h2>
              <div className="case-grid">
                {CASE_STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="case-tile"
                    onClick={() => {
                      const out = convertCase(text, s.id)
                      navigator.clipboard?.writeText(out)
                      push(`Copied ${s.label}`)
                    }}
                  >
                    <span className="meta">{s.label}</span>
                    <code>{convertCase(text, s.id) || '—'}</code>
                  </button>
                ))}
              </div>
              <button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => setText(convertCase(text, 'sentence'))}>
                Apply sentence case to editor
              </button>
            </>
          )}

          {tab === 'slug' && (
            <>
              <div className="panel-header">
                <h2>Slug</h2>
                <button type="button" className="btn" onClick={() => navigator.clipboard.writeText(slug).then(() => push('Copied'))}>
                  Copy
                </button>
              </div>
              <pre className="json-output">{slug || '// Enter text to generate a slug'}</pre>
            </>
          )}

          {tab === 'spell' && (
            <>
              <div className="panel-header">
                <h2>
                  Issues
                  <span className="meta" style={{ marginLeft: 8 }}>
                    {spellBusy ? 'checking…' : `${misspellings.length} found`}
                  </span>
                </h2>
                {misspellings.length > 0 && (
                  <button type="button" className="btn primary" onClick={fixAll} disabled={spellBusy}>
                    Fix all
                  </button>
                )}
              </div>
              {!spellBusy && misspellings.length === 0 ? (
                <p className="hint">No misspellings detected.</p>
              ) : (
                <ul className="spell-list">
                  {misspellings.map((issue, i) => (
                    <li key={`${issue.index}-${issue.word}-${i}`}>
                      <button type="button" className="spell-issue-word" onClick={() => scrollToIssue(issue)}>
                        {issue.word}
                      </button>
                      <span className="spell-context meta">{issue.context}</span>
                      <div className="spell-suggestions">
                        {issue.suggestions.map((s) => (
                          <button
                            key={s}
                            type="button"
                            className="spell-suggestion"
                            onClick={() => fixIssue(issue, s)}
                          >
                            {s}
                          </button>
                        ))}
                        {issue.suggestions.length === 0 && <span className="meta">No suggestions</span>}
                      </div>
                      <div className="spell-actions">
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => {
                            ignoreWord(issue.word)
                            setDictVersion((v) => v + 1)
                          }}
                        >
                          Ignore
                        </button>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => {
                            addCustomWord(issue.word)
                            setDictVersion((v) => v + 1)
                            push(`Added "${issue.word}" to dictionary`)
                          }}
                        >
                          Add to dict
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {ignoredWords.size > 0 && (
                <p className="hint" style={{ marginTop: 12 }}>
                  {ignoredWords.size} ignored word{ignoredWords.size !== 1 ? 's' : ''} stored locally.
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </ToolPage>
  )
}
