import { useEffect, useMemo, useRef, useState } from 'react'
import ToolPage from '../components/ToolPage'
import { downloadBlob, readFileAsText } from '../lib/images'
import { useToast } from '../lib/toast'
import {
  BG_PRESETS,
  presetFromValue,
} from '../lib/screenshot'
import {
  DEFAULT_MD_OPTIONS,
  renderMarkdownHtml,
  captureMarkdownPages,
  type MarkdownRenderOptions,
  type MdTheme,
} from '../lib/markdown-render'
import { usePendingFiles } from '../lib/usePendingFiles'

const SAMPLE = `# Hello, Markdown

A quick example with **GFM** support:

- **Bold**, *italic*, ~~strike~~
- Code: \`const x = 1\`
- [Toolbox](#)

| Col A | Col B |
|-------|-------|
| one   | two   |

\`\`\`js
function greet(name) {
  return \`Hello, \${name}!\`
}
\`\`\`

> Markdown is a lightweight markup language.
`

export default function MarkdownExport() {
  const [md, setMd] = useState(SAMPLE)
  const [title, setTitle] = useState('Document')
  const [paperSize, setPaperSize] = useState<'a4' | 'letter'>('a4')
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [bgValue, setBgValue] = useState(BG_PRESETS[8].value)
  const [customColor, setCustomColor] = useState('#f4f4f5')
  const [useCustomBg, setUseCustomBg] = useState(false)
  const [padding, setPadding] = useState(DEFAULT_MD_OPTIONS.padding)
  const [paperMargin, setPaperMargin] = useState(DEFAULT_MD_OPTIONS.paperMargin)
  const [fontSize, setFontSize] = useState(DEFAULT_MD_OPTIONS.fontSize)
  const [theme, setTheme] = useState<MdTheme>('light')
  const [scale, setScale] = useState(DEFAULT_MD_OPTIONS.scale)
  const { push } = useToast()
  const [busy, setBusy] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    import('highlight.js/styles/github-dark.css')
  }, [])

  const renderOptions: MarkdownRenderOptions = useMemo(() => {
    const bg = useCustomBg ? presetFromValue(customColor) : presetFromValue(bgValue)
    return { padding, bg, paperMargin, fontSize, theme, scale }
  }, [useCustomBg, customColor, bgValue, padding, paperMargin, fontSize, theme, scale])

  const html = useMemo(() => renderMarkdownHtml(md), [md])

  useEffect(() => {
    if (!previewRef.current) return
    previewRef.current.innerHTML = html
    previewRef.current.style.padding = `${padding}px ${paperMargin}px`
    previewRef.current.style.fontSize = `${fontSize}px`
    previewRef.current.classList.remove('md-theme-light', 'md-theme-dark')
    previewRef.current.classList.add(theme === 'dark' ? 'md-theme-dark' : 'md-theme-light')
  }, [html, padding, paperMargin, fontSize, theme])

  const exportPdf = async () => {
    setBusy(true)
    try {
      const pages = await captureMarkdownPages(html, renderOptions)
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ unit: 'pt', format: paperSize, orientation })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const marginX = 48
      const headerH = 56
      const contentH = pageH - headerH - 48

      pages.forEach((canvas, index) => {
        if (index > 0) pdf.addPage()
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(16)
        pdf.setTextColor(theme === 'dark' ? 240 : 17, theme === 'dark' ? 240 : 17, theme === 'dark' ? 240 : 17)
        pdf.text(title || 'Document', marginX, 40)
        pdf.setDrawColor(220, 220, 230)
        pdf.line(marginX, 50, pageW - marginX, 50)

        const ratio = canvas.width / canvas.height
        let w = pageW - marginX * 2
        let h = w / ratio
        if (h > contentH) {
          h = contentH
          w = h * ratio
        }
        const imgData = canvas.toDataURL('image/jpeg', 0.92)
        pdf.addImage(imgData, 'JPEG', marginX, headerH, w, h)
      })

      pdf.save(`${title || 'document'}.pdf`)
      push(`PDF downloaded (${pages.length} page${pages.length !== 1 ? 's' : ''})`)
    } catch (e) {
      push(`Export failed: ${e instanceof Error ? e.message : String(e)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const exportPng = async () => {
    setBusy(true)
    try {
      const pages = await captureMarkdownPages(html, renderOptions)
      if (pages.length === 1) {
        pages[0].toBlob((b) => {
          if (b) downloadBlob(b, `${title || 'document'}.png`)
        }, 'image/png')
      } else {
        const { default: JSZip } = await import('jszip')
        const zip = new JSZip()
        pages.forEach((c, i) => {
          const data = c.toDataURL('image/png').split(',')[1]
          zip.file(`${title || 'document'}-p${i + 1}.png`, data, { base64: true })
        })
        downloadBlob(await zip.generateAsync({ type: 'blob' }), `${title || 'document'}-pages.zip`)
      }
      push('PNG downloaded')
    } catch (e) {
      push(`Export failed: ${e instanceof Error ? e.message : String(e)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const onImport = async (f: File) => {
    try {
      setMd(await readFileAsText(f))
      setTitle(f.name.replace(/\.[^.]+$/, '') || 'Document')
      push('Markdown loaded')
    } catch {
      push('Failed to read file', 'error')
    }
  }

  usePendingFiles('/markdown', (pending) => { if (pending[0]) void onImport(pending[0]) })

  return (
    <ToolPage
      eyebrow="Dev"
      title="Markdown → PDF / PNG"
      hint="Write Markdown with GFM tables and syntax highlighting. Live preview with beautifier-style export settings."
    >
      <section className="col left">
        <div className="panel">
          <div className="panel-header">
            <h2>Markdown</h2>
            <button type="button" className="btn-link" onClick={() => fileInput.current?.click()}>
              Import .md
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".md,.markdown,.txt"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onImport(f)
              }}
            />
          </div>
          <textarea
            value={md}
            onChange={(e) => setMd(e.target.value)}
            style={{ minHeight: 360, fontFamily: 'var(--font-mono)' }}
            spellCheck={false}
          />
          <label className="field" style={{ marginTop: 10 }}>
            <span>Document title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
        </div>

        <div className="panel">
          <h2>Appearance</h2>
          <div className="form-grid">
            <label className="field span-2">
              <span>Page background</span>
              <div className="bg-picker">
                {BG_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className={'bg-tile' + (!useCustomBg && bgValue === p.value ? ' active' : '')}
                    style={{ background: p.value }}
                    onClick={() => {
                      setUseCustomBg(false)
                      setBgValue(p.value)
                    }}
                    title={p.label}
                    aria-label={p.label}
                  />
                ))}
                <button
                  type="button"
                  className={'bg-tile bg-tile-custom' + (useCustomBg ? ' active' : '')}
                  onClick={() => setUseCustomBg(true)}
                  title="Custom color"
                  aria-label="Custom color"
                >
                  <input
                    type="color"
                    value={customColor}
                    onChange={(e) => {
                      setCustomColor(e.target.value)
                      setUseCustomBg(true)
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </button>
              </div>
            </label>
            <label className="field">
              <span>Theme</span>
              <select value={theme} onChange={(e) => setTheme(e.target.value as MdTheme)}>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label className="field">
              <span>Font size ({fontSize}px)</span>
              <input type="range" min={12} max={22} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Padding ({padding}px)</span>
              <input type="range" min={16} max={80} value={padding} onChange={(e) => setPadding(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Paper margin ({paperMargin}px)</span>
              <input type="range" min={24} max={96} value={paperMargin} onChange={(e) => setPaperMargin(Number(e.target.value))} />
            </label>
          </div>
        </div>

        <div className="panel">
          <h2>Export settings</h2>
          <div className="form-grid">
            <label className="field">
              <span>Paper size</span>
              <select value={paperSize} onChange={(e) => setPaperSize(e.target.value as 'a4' | 'letter')}>
                <option value="a4">A4</option>
                <option value="letter">US Letter</option>
              </select>
            </label>
            <label className="field">
              <span>Orientation</span>
              <select value={orientation} onChange={(e) => setOrientation(e.target.value as 'portrait' | 'landscape')}>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </label>
            <label className="field">
              <span>Capture quality (×{scale})</span>
              <input type="range" min={1} max={3} step={0.5} value={scale} onChange={(e) => setScale(Number(e.target.value))} />
            </label>
          </div>
          <div className="row-actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn primary" onClick={exportPdf} disabled={busy}>
              {busy ? 'Working…' : 'Download PDF'}
            </button>
            <button type="button" className="btn" onClick={exportPng} disabled={busy}>
              {busy ? 'Working…' : 'Download PNG'}
            </button>
          </div>
        </div>
      </section>

      <section className="col right">
        <div className="panel">
          <h2>Preview</h2>
          <div
            className="md-preview-paper"
            style={{
              background: useCustomBg ? customColor : bgValue.startsWith('linear') ? '#e8e8ed' : bgValue,
            }}
          >
            <div ref={previewRef} className={'md-render' + (theme === 'dark' ? ' md-theme-dark' : ' md-theme-light')} />
          </div>
        </div>
      </section>
    </ToolPage>
  )
}
