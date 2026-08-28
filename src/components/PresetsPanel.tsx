import { useState } from 'react'
import type { HistoryEntry, LogoOptions, Preset, StyleOptions } from '../types'
import { loadHistory, loadPresets, newId, saveHistory, savePresets } from '../lib/storage'
import CollapsiblePanel from './CollapsiblePanel'

interface Props {
  style: StyleOptions
  logo: LogoOptions
  onLoadPreset: (style: StyleOptions, logo: LogoOptions) => void
  onLoadHistory: (entry: HistoryEntry) => void
}

export default function PresetsPanel({ style, logo, onLoadPreset, onLoadHistory }: Props) {
  const [tab, setTab] = useState<'presets' | 'history'>('presets')
  const [presetName, setPresetName] = useState('')
  const [presets, setPresets] = useState<Preset[]>(loadPresets())
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory())

  const onSavePreset = () => {
    const name = presetName.trim() || `Preset ${presets.length + 1}`
    const next: Preset[] = [
      { id: newId(), name, style, logo, createdAt: Date.now() },
      ...presets,
    ]
    setPresets(next)
    savePresets(next)
    setPresetName('')
  }

  const onDeletePreset = (id: string) => {
    const next = presets.filter((p) => p.id !== id)
    setPresets(next)
    savePresets(next)
  }

  const onClearHistory = () => {
    saveHistory([])
    setHistory([])
  }

  return (
    <CollapsiblePanel eyebrow="Library" title="Presets & history" hint="Save your style or revisit past codes." defaultOpen={false}>
      <div className="tabs">
        <button
          type="button"
          className={'tab' + (tab === 'presets' ? ' active' : '')}
          onClick={() => setTab('presets')}
        >
          Presets
        </button>
        <button
          type="button"
          className={'tab' + (tab === 'history' ? ' active' : '')}
          onClick={() => setTab('history')}
        >
          History
        </button>
      </div>
      {tab === 'presets' && (
        <>
          <div className="preset-row">
            <input
              placeholder="Name this style…"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
            />
            <button type="button" className="btn" onClick={onSavePreset}>
              Save current
            </button>
          </div>
          {presets.length === 0 && <p className="hint">No presets saved yet.</p>}
          <ul className="list">
            {presets.map((p) => (
              <li key={p.id}>
                <div>
                  <strong>{p.name}</strong>
                  <div className="meta">{new Date(p.createdAt).toLocaleString()}</div>
                </div>
                <div className="row-actions">
                  <button type="button" className="btn-link" onClick={() => onLoadPreset(p.style, p.logo)}>
                    Load
                  </button>
                  <button type="button" className="btn-link danger" onClick={() => onDeletePreset(p.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {tab === 'history' && (
        <>
          {history.length > 0 && (
            <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn-link danger" onClick={onClearHistory}>
                Clear history
              </button>
            </div>
          )}
          {history.length === 0 && <p className="hint">No codes generated yet — download one to save it here.</p>}
          <ul className="list">
            {history.map((h) => (
              <li key={h.id}>
                <div>
                  <strong>{summary(h)}</strong>
                  <div className="meta">{new Date(h.createdAt).toLocaleString()}</div>
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => onLoadHistory(h)}
                  >
                    Load
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </CollapsiblePanel>
  )
}

function summary(h: HistoryEntry): string {
  switch (h.content.type) {
    case 'url':
      return h.content.url
    case 'text':
      return h.content.text.slice(0, 60)
    case 'wifi':
      return `WiFi: ${h.content.ssid}`
    case 'vcard':
      return `${h.content.firstName} ${h.content.lastName}`.trim() || 'vCard'
    case 'email':
      return h.content.email
    case 'tel':
      return h.content.phone
    case 'sms':
      return `SMS ${h.content.phone}`
    case 'geo':
      return `${h.content.lat}, ${h.content.lng}`
  }
}
