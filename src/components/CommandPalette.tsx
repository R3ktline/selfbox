import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { href, navigate } from '../lib/router'
import { searchTools } from '../lib/tools'

interface Props {
  open: boolean
  onClose: () => void
}

export default function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const results = useMemo(() => searchTools(query), [query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    const id = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [query])

  if (!open) return null

  const go = (path: string) => {
    navigate(path)
    onClose()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % Math.max(results.length, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + results.length) % Math.max(results.length, 1))
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      go(results[active].path)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="cmd-root" role="dialog" aria-modal="true" aria-label="Search tools">
      <button type="button" className="cmd-backdrop" aria-label="Close" onClick={onClose} />
      <div className="cmd-panel" onKeyDown={onKeyDown}>
        <div className="cmd-input-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            className="cmd-input"
            placeholder="Search tools…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-autocomplete="list"
            aria-controls="cmd-list"
          />
          <kbd className="kbd">esc</kbd>
        </div>
        <ul id="cmd-list" className="cmd-list" role="listbox">
          {results.length === 0 && <li className="cmd-empty">No tools match “{query}”</li>}
          {results.map((t, i) => (
            <li key={t.path} role="option" aria-selected={i === active}>
              <a
                href={href(t.path)}
                className={'cmd-item' + (i === active ? ' active' : '')}
                onMouseEnter={() => setActive(i)}
                onClick={(e) => {
                  e.preventDefault()
                  go(t.path)
                }}
              >
                <span className="cmd-item-title">{t.title}</span>
                <span className="cmd-item-meta">{t.group}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
