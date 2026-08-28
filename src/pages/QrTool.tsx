import { useMemo, useState } from 'react'
import type { Content, HistoryEntry, LogoOptions, StyleOptions } from '../types'
import ContentForm from '../components/ContentForm'
import StylePanel from '../components/StylePanel'
import LogoUploader from '../components/LogoUploader'
import Preview from '../components/Preview'
import DownloadBar from '../components/DownloadBar'
import WarningsList from '../components/WarningsList'
import PresetsPanel from '../components/PresetsPanel'
import BatchPanel from '../components/BatchPanel'
import { buildPayload } from '../lib/content'
import { validateStyle } from '../lib/validation'

export default function QrTool() {
  const [style, setStyle] = useState<StyleOptions>({
    fgColor: '#111111',
    bgColor: '#ffffff',
    useGradient: false,
    gradientColor: '#0066ff',
    gradientType: 'linear',
    dotStyle: 'square',
    cornerSquareStyle: 'square',
    cornerDotStyle: 'square',
    errorCorrectionLevel: 'M',
    margin: 4,
    width: 320,
    downloadSize: 4096,
  })
  const [logo, setLogo] = useState<LogoOptions>({
    dataUrl: null,
    size: 20,
    margin: 4,
    hideBackgroundDots: true,
    cornerRadius: 8,
    opacity: 1,
  })
  const [content, setContent] = useState<Content>({ type: 'url', url: 'https://example.com' })
  const [renderError, setRenderError] = useState<string | null>(null)

  const payload = useMemo(() => buildPayload(content), [content])
  const warnings = useMemo(() => validateStyle(style, logo, payload), [style, logo, payload])

  const onLoadPreset = (s: StyleOptions, l: LogoOptions) => {
    setStyle(s)
    setLogo(l)
  }
  const onLoadHistory = (entry: HistoryEntry) => {
    setContent(entry.content)
    setStyle(entry.style)
    setLogo(entry.logo)
  }

  return (
    <main className="layout" id="main">
      <section className="col left">
        <ContentForm content={content} onChange={setContent} />
        <div className="secondary-panels">
          <StylePanel style={style} onChange={setStyle} />
          <LogoUploader logo={logo} onChange={setLogo} />
        </div>
        <PresetsPanel
          style={style}
          logo={logo}
          onLoadPreset={onLoadPreset}
          onLoadHistory={onLoadHistory}
        />
        <BatchPanel style={style} logo={logo} />
      </section>
      <section className="col right">
        <WarningsList warnings={warnings} />
        {renderError && (
          <div className="warning error">
            <strong>Render error:</strong> {renderError}
          </div>
        )}
        <div className="preview-section">
          <Preview
            style={style}
            logo={logo}
            content={content}
            onError={(e) => setRenderError(e.message)}
          />
        </div>
        <DownloadBar style={style} logo={logo} content={content} />
      </section>
    </main>
  )
}
