import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react'
import { href } from '../lib/router'
import {
  formatFileList,
  navigateWithFiles,
  suggestToolsForFiles,
} from '../lib/fileStore'
import {
  GROUP_META,
  GROUP_ORDER,
  MOST_USED_META,
  mostUsedTools,
  searchTools,
  TOOLS,
  type HomeFilter,
  type ToolGroup,
  type ToolMeta,
} from '../lib/tools'
import { GroupIcon, ToolIcon } from '../components/ToolIcons'

function setCardSpotlight(e: PointerEvent<HTMLElement>) {
  const el = e.currentTarget
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--spot-x', `${((e.clientX - rect.left) / rect.width) * 100}%`)
  el.style.setProperty('--spot-y', `${((e.clientY - rect.top) / rect.height) * 100}%`)
}

function ToolCard({ tool, files, onNavigate }: { tool: ToolMeta; files: File[]; onNavigate: (path: string) => void }) {
  const hasFiles = files.length > 0

  if (hasFiles) {
    return (
      <button
        type="button"
        className="tool-card"
        data-group={tool.group}
        onClick={() => onNavigate(tool.path)}
        onPointerMove={setCardSpotlight}
      >
        <span className="tool-icon" data-group={tool.group}>
          <ToolIcon id={tool.icon} />
        </span>
        <div className="tool-text">
          <span className="tool-index">{tool.group}</span>
          <h3>{tool.title}</h3>
          <p>{tool.desc}</p>
        </div>
        <span className="tool-arrow" aria-hidden="true">
          ↗
        </span>
      </button>
    )
  }

  return (
    <a key={tool.path} className="tool-card" href={href(tool.path)} data-group={tool.group} onPointerMove={setCardSpotlight}>
      <span className="tool-icon" data-group={tool.group}>
        <ToolIcon id={tool.icon} />
      </span>
      <div className="tool-text">
        <span className="tool-index">{tool.group}</span>
        <h3>{tool.title}</h3>
        <p>{tool.desc}</p>
      </div>
      <span className="tool-arrow" aria-hidden="true">
        ↗
      </span>
    </a>
  )
}

function SuggestedToolCard({ tool, onNavigate }: { tool: ToolMeta; onNavigate: (path: string) => void }) {
  return (
    <button
      type="button"
      className="suggested-tool-card"
      data-group={tool.group}
      onClick={() => onNavigate(tool.path)}
    >
      <span className="tool-icon" data-group={tool.group}>
        <ToolIcon id={tool.icon} />
      </span>
      <div className="tool-text">
        <span className="tool-index">{tool.group}</span>
        <h3>{tool.title}</h3>
        <p>{tool.desc}</p>
      </div>
      <span className="tool-arrow" aria-hidden="true">
        ↗
      </span>
    </button>
  )
}

function QuickAccessLink({
  tool,
  files,
  onNavigate,
}: {
  tool: ToolMeta
  files: File[]
  onNavigate: (path: string) => void
}) {
  const content = (
    <>
      <span className="quick-access-icon" data-group={tool.group}>
        <ToolIcon id={tool.icon} size={18} />
      </span>
      <span className="quick-access-label">{tool.short}</span>
    </>
  )

  if (files.length > 0) {
    return (
      <button type="button" className="quick-access-link" data-group={tool.group} onClick={() => onNavigate(tool.path)}>
        {content}
      </button>
    )
  }

  return (
    <a className="quick-access-link" href={href(tool.path)} data-group={tool.group}>
      {content}
    </a>
  )
}

const BELOW_FOLD_REVEAL_MS = 480
const BELOW_FOLD_SESSION_KEY = 'home-below-fold-revealed'
const HOME_GROUP_KEY = 'home-group-filter'
const HOME_QUERY_KEY = 'home-search-query'

const HOME_FILTERS: HomeFilter[] = ['All', ...GROUP_ORDER]

function hasRevealedBelowThisSession(): boolean {
  try {
    return sessionStorage.getItem(BELOW_FOLD_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

function markBelowRevealedThisSession() {
  try {
    sessionStorage.setItem(BELOW_FOLD_SESSION_KEY, '1')
  } catch {
    /* ignore */
  }
}

function loadHomeGroup(): HomeFilter {
  try {
    const value = sessionStorage.getItem(HOME_GROUP_KEY)
    if (value && HOME_FILTERS.includes(value as HomeFilter)) return value as HomeFilter
  } catch {
    /* ignore */
  }
  return 'All'
}

function saveHomeGroup(group: HomeFilter) {
  try {
    sessionStorage.setItem(HOME_GROUP_KEY, group)
  } catch {
    /* ignore */
  }
}

function loadHomeQuery(): string {
  try {
    return sessionStorage.getItem(HOME_QUERY_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveHomeQuery(query: string) {
  try {
    const trimmed = query.trim()
    if (trimmed) sessionStorage.setItem(HOME_QUERY_KEY, trimmed)
    else sessionStorage.removeItem(HOME_QUERY_KEY)
  } catch {
    /* ignore */
  }
}

function scrollToGroupSection(groupId: ToolGroup) {
  const el = document.querySelector(`[data-group-section="${groupId}"]`)
  if (!el) return

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
}

function scheduleScrollToGroup(groupId: ToolGroup, waitForReveal: boolean) {
  const runScroll = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToGroupSection(groupId))
    })
  }

  if (waitForReveal) {
    window.setTimeout(runScroll, BELOW_FOLD_REVEAL_MS)
    return
  }

  runScroll()
}

export default function Home() {
  const [query, setQuery] = useState(() => loadHomeQuery())
  const [group, setGroup] = useState<HomeFilter>(() => loadHomeGroup())
  const mostUsed = useMemo(() => mostUsedTools(), [])
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [belowRevealed, setBelowRevealed] = useState(() => hasRevealedBelowThisSession())
  const [instantBelow, setInstantBelow] = useState(() => hasRevealedBelowThisSession())
  const [hintPhase, setHintPhase] = useState<'visible' | 'hiding' | 'gone'>(() =>
    hasRevealedBelowThisSession() ? 'gone' : 'visible',
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingScrollRef = useRef<ToolGroup | null>(null)
  const pendingRevealRef = useRef(false)
  const restoredScrollRef = useRef(false)

  const suggestions = useMemo(() => suggestToolsForFiles(files), [files])
  const browsingAll = group === 'All' && !query.trim()

  useEffect(() => {
    saveHomeGroup(group)
  }, [group])

  useEffect(() => {
    saveHomeQuery(query)
  }, [query])

  useEffect(() => {
    if (restoredScrollRef.current) return
    restoredScrollRef.current = true
    if (group !== 'All' && !query.trim()) {
      scheduleScrollToGroup(group, false)
    }
  }, [group, query])

  const items = useMemo(() => {
    const found = searchTools(query)
    return group === 'All' ? found : found.filter((t) => t.group === group)
  }, [query, group])

  const grouped = useMemo(() => {
    if (group !== 'All' || query.trim()) return null
    return GROUP_ORDER.map((g) => ({
      group: g,
      tools: TOOLS.filter((t) => t.group === g),
    })).filter((s) => s.tools.length > 0)
  }, [group, query])

  useEffect(() => {
    if (!browsingAll) {
      markBelowRevealedThisSession()
      setBelowRevealed(true)
      setInstantBelow(true)
      setHintPhase('gone')
      return
    }

    if (hasRevealedBelowThisSession()) {
      setBelowRevealed(true)
      setInstantBelow(true)
      setHintPhase('gone')
      return
    }

    setBelowRevealed(false)
    setHintPhase('visible')
  }, [browsingAll])

  const revealBelow = useCallback(() => {
    if (belowRevealed || hintPhase === 'hiding') return
    markBelowRevealedThisSession()
    setHintPhase('hiding')
    window.setTimeout(() => {
      setHintPhase('gone')
      setBelowRevealed(true)
      setInstantBelow(true)
    }, 180)
  }, [belowRevealed, hintPhase])

  useEffect(() => {
    if (!browsingAll || belowRevealed) return

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 8) revealBelow()
    }

    let touchStartY = 0
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? 0
    }
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? touchStartY
      if (touchStartY - y > 36) revealBelow()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') revealBelow()
    }

    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [browsingAll, belowRevealed, revealBelow])

  const onCategoryClick = useCallback(
    (g: ToolGroup) => {
      const next = group === g ? 'All' : g
      const needsReveal = browsingAll && !belowRevealed

      if (next !== 'All') {
        if (needsReveal) revealBelow()
        pendingScrollRef.current = g
        pendingRevealRef.current = needsReveal
      }

      setGroup(next)
    },
    [group, browsingAll, belowRevealed, revealBelow],
  )

  useEffect(() => {
    const target = pendingScrollRef.current
    if (!target) return

    pendingScrollRef.current = null
    const waitForReveal = pendingRevealRef.current
    pendingRevealRef.current = false
    scheduleScrollToGroup(target, waitForReveal)
  }, [group, belowRevealed])

  const addFiles = useCallback((list: FileList | null) => {
    if (!list || list.length === 0) return
    setFiles((prev) => {
      const names = new Set(prev.map((f) => `${f.name}:${f.size}`))
      const next = [...prev]
      for (const f of Array.from(list)) {
        const key = `${f.name}:${f.size}`
        if (!names.has(key)) {
          names.add(key)
          next.push(f)
        }
      }
      return next
    })
  }, [])

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const clearFiles = () => setFiles([])

  const onNavigateWithFiles = (path: string) => {
    navigateWithFiles(path, files)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
  }

  const showScrollHint = browsingAll && hintPhase !== 'gone'
  const belowVisible = belowRevealed || !browsingAll

  return (
    <main className="home" id="main">
      <section className="home-hero home-hero-left home-hero-compact">
        <h1>
          Your personal toolbox
          <em>self-hosted.</em>
        </h1>

        <label className="home-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="search"
            placeholder="Filter tools…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          <kbd className="kbd">⌘K</kbd>
        </label>

        <div className="home-action-row">
          <div className="quick-access-panel" aria-label="Quick access tools">
            <div className="quick-access-header">
              <h2>{MOST_USED_META.label}</h2>
              <p>{MOST_USED_META.desc}</p>
            </div>
            <div className="quick-access-grid">
              {mostUsed.map((t) => (
                <QuickAccessLink key={t.path} tool={t} files={files} onNavigate={onNavigateWithFiles} />
              ))}
            </div>
          </div>

          <div
            className={'home-upload-square' + (dragOver ? ' active' : '') + (files.length > 0 ? ' has-files' : '')}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
            />
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M12 16V4m0 0L8 8m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
            </svg>
            <div className="home-upload-square-text">
              <strong>{dragOver ? 'Drop to add' : files.length > 0 ? formatFileList(files) : 'Drop files'}</strong>
              <span className="meta">or click to browse</span>
            </div>
          </div>
        </div>

        {files.length > 0 && (
          <div className="home-file-chips">
            {files.map((f, i) => (
              <span key={`${f.name}-${f.size}-${i}`} className="file-chip">
                {f.name}
                <button type="button" aria-label={`Remove ${f.name}`} onClick={(e) => { e.stopPropagation(); removeFile(i) }}>
                  ×
                </button>
              </span>
            ))}
            <button type="button" className="btn-link file-chip-clear" onClick={clearFiles}>
              Clear all
            </button>
          </div>
        )}

        {suggestions.length > 0 && (
          <section className="home-suggestions" aria-label="Suggested tools">
            <h2>Suggested for your files</h2>
            <div className="tool-grid">
              {suggestions.map((t) => (
                <SuggestedToolCard key={t.path} tool={t} onNavigate={onNavigateWithFiles} />
              ))}
            </div>
          </section>
        )}
      </section>

      <div className="home-reveal-zone">
        {showScrollHint && (
          <button
            type="button"
            className={'home-scroll-hint' + (hintPhase === 'hiding' ? ' is-hiding' : '')}
            onClick={revealBelow}
          >
            <span>More tools below</span>
            <svg className="home-scroll-hint-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        <div
          className={
            'home-below-fold' +
            (belowVisible ? ' is-visible' : '') +
            (instantBelow || !browsingAll ? ' is-instant' : '')
          }
        >
          <div className="home-below-fold-inner">
            <div className="home-below-fold-content">
        <section className="category-showcase" aria-label="Tool categories">
          {GROUP_ORDER.map((g) => {
            const meta = GROUP_META[g]
            const count = TOOLS.filter((t) => t.group === g).length
            return (
              <button
                key={g}
                type="button"
                className={'category-card' + (group === g ? ' active' : '')}
                data-group={g}
                onClick={() => onCategoryClick(g)}
                onPointerMove={setCardSpotlight}
                aria-pressed={group === g}
              >
                <span className="category-card-icon">
                  <GroupIcon group={g} size={22} />
                </span>
                <span className="category-card-body">
                  <span className="category-card-name">{meta.label}</span>
                  <span className="category-card-tagline">{meta.tagline}</span>
                </span>
                <span className="category-card-count">{count}</span>
              </button>
            )
          })}
        </section>

        {grouped ? (
          grouped.map(({ group: g, tools }) => (
            <section key={g} className="home-section home-section-group" data-group={g} data-group-section={g}>
              <header className="group-header">
                <span className="group-header-icon" data-group={g}>
                  <GroupIcon group={g} size={18} />
                </span>
                <div className="group-header-text">
                  <h2>{GROUP_META[g].label}</h2>
                  <p>{GROUP_META[g].desc}</p>
                </div>
              </header>
              <div className="tool-grid">
                {tools.map((t) => (
                  <ToolCard key={t.path} tool={t} files={files} onNavigate={onNavigateWithFiles} />
                ))}
              </div>
            </section>
          ))
        ) : (
          <section className="home-section" data-group-section={group !== 'All' ? group : undefined}>
            <h2>
              {items.length} {items.length === 1 ? 'tool' : 'tools'}
              {group !== 'All' && ` · ${GROUP_META[group].label}`}
            </h2>
            {items.length === 0 ? (
              <p className="hint">No matches. Clear the filter or press ⌘K to search titles and keywords.</p>
            ) : (
              <div className="tool-grid">
                {items.map((t) => (
                  <ToolCard key={t.path} tool={t} files={files} onNavigate={onNavigateWithFiles} />
                ))}
              </div>
            )}
          </section>
        )}
          </div>
        </div>
      </div>
      </div>
    </main>
  )
}
