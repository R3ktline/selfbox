import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react'
import { href } from '../lib/router'
import {
  formatFileList,
  navigateWithFiles,
  suggestToolsForFiles,
} from '../lib/fileStore'
import { GROUP_META, GROUP_ORDER, searchTools, TOOLS, type ToolGroup, type ToolMeta } from '../lib/tools'
import { GroupIcon, ToolIcon } from '../components/ToolIcons'

function ToolCard({ tool, files, onNavigate }: { tool: ToolMeta; files: File[]; onNavigate: (path: string) => void }) {
  const hasFiles = files.length > 0

  if (hasFiles) {
    return (
      <button
        type="button"
        className="tool-card"
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

  return (
    <a key={tool.path} className="tool-card" href={href(tool.path)} data-group={tool.group}>
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

export default function Home() {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<ToolGroup | 'All'>('All')
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const suggestions = useMemo(() => suggestToolsForFiles(files), [files])

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

  return (
    <main className="home" id="main">
      <section className="home-hero home-hero-left">
        <p className="kicker">{TOOLS.length} utilities · runs in your browser</p>
        <h1>
          Your personal toolbox
          <em>self-hosted.</em>
        </h1>
        <p>
          QR codes, images, PDFs, and formatters — all processed in-tab. Close the window and your data is gone
          unless you save it.
        </p>

        <div
          className={'home-file-drop' + (dragOver ? ' active' : '') + (files.length > 0 ? ' has-files' : '')}
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
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M12 16V4m0 0L8 8m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
          </svg>
          <div className="home-file-drop-text">
            <strong>{dragOver ? 'Drop to add files' : files.length > 0 ? formatFileList(files) : 'Drop files or click to browse'}</strong>
            <span className="meta">We&apos;ll suggest the right tools for your files</span>
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
      </section>

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
              onClick={() => setGroup(group === g ? 'All' : g)}
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
          <section key={g} className="home-section home-section-group" data-group={g}>
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
        <section className="home-section">
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
    </main>
  )
}
