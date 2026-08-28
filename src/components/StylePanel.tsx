import { useState } from 'react'
import type { ErrorCorrectionLevel, StyleOptions, CornerStyle, DotStyle } from '../types'
import ColorPicker from './ColorPicker'
import CollapsiblePanel from './CollapsiblePanel'

interface Props {
  style: StyleOptions
  onChange: (next: StyleOptions) => void
}

const DOT_STYLES: DotStyle[] = ['square', 'rounded', 'dots', 'classy', 'classy-rounded', 'extra-rounded']
const CORNER_STYLES: CornerStyle[] = ['square', 'dot', 'extra-rounded']
const EC_LEVELS: { value: ErrorCorrectionLevel; label: string; desc: string }[] = [
  { value: 'L', label: 'L — Low (7%)', desc: 'Smallest code, recovers ~7% damage. Use when space is tight and the code will stay clean.' },
  { value: 'M', label: 'M — Medium (15%)', desc: 'Recovers ~15% damage. Good general-purpose balance.' },
  { value: 'Q', label: 'Q — Quartile (25%)', desc: 'Recovers ~25% damage. Good for codes with small logos.' },
  { value: 'H', label: 'H — High (30%)', desc: 'Recovers ~30% damage. Recommended when using a centered logo.' },
]

export default function StylePanel({ style, onChange }: Props) {
  const upd = (patch: Partial<StyleOptions>) =>
    onChange({ ...style, ...patch })
  const [advancedOpen, setAdvancedOpen] = useState(false)

  return (
    <CollapsiblePanel title="Style" hint="Colors and shape." defaultOpen={false}>
      <div className="form-grid">
        <label className="field span-2">
          <span>Foreground</span>
          <div className="color-row">
            <ColorPicker value={style.fgColor} onChange={(c) => upd({ fgColor: c })} ariaLabel="Foreground color" />
            <input
              type="text"
              value={style.fgColor}
              onChange={(e) => upd({ fgColor: e.target.value })}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </div>
        </label>
        <label className="field span-2">
          <span>Background</span>
          <div className="color-row">
            <ColorPicker value={style.bgColor} onChange={(c) => upd({ bgColor: c })} ariaLabel="Background color" />
            <input
              type="text"
              value={style.bgColor}
              onChange={(e) => upd({ bgColor: e.target.value })}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </div>
        </label>

        <div className="field span-2 advanced-disclosure">
          <button
            type="button"
            className={'advanced-toggle' + (advancedOpen ? ' open' : '')}
            onClick={() => setAdvancedOpen((o) => !o)}
            aria-expanded={advancedOpen}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span>Advanced</span>
          </button>
        </div>

        {advancedOpen && (
          <>
            <label className="field check span-2">
              <input
                type="checkbox"
                checked={style.useGradient}
                onChange={(e) => upd({ useGradient: e.target.checked })}
              />
              <span>Use gradient (foreground → secondary color)</span>
            </label>
            {style.useGradient && (
              <>
                <label className="field span-2">
                  <span>Secondary color</span>
                  <div className="color-row">
                    <ColorPicker value={style.gradientColor} onChange={(c) => upd({ gradientColor: c })} ariaLabel="Gradient secondary color" />
                    <input
                      type="text"
                      value={style.gradientColor}
                      onChange={(e) => upd({ gradientColor: e.target.value })}
                      style={{ fontFamily: 'var(--font-mono)' }}
                    />
                  </div>
                </label>
                <label className="field">
                  <span>Gradient type</span>
                  <select
                    value={style.gradientType}
                    onChange={(e) => upd({ gradientType: e.target.value as 'linear' | 'radial' })}
                  >
                    <option value="linear">Linear</option>
                    <option value="radial">Radial</option>
                  </select>
                </label>
              </>
            )}
            <label className="field">
              <span>Dot style</span>
              <select
                value={style.dotStyle}
                onChange={(e) => upd({ dotStyle: e.target.value as DotStyle })}
              >
                {DOT_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Corner square</span>
              <select
                value={style.cornerSquareStyle}
                onChange={(e) => upd({ cornerSquareStyle: e.target.value as CornerStyle })}
              >
                {CORNER_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Corner dot</span>
              <select
                value={style.cornerDotStyle}
                onChange={(e) => upd({ cornerDotStyle: e.target.value as CornerStyle })}
              >
                {CORNER_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Error correction</span>
              <select
                value={style.errorCorrectionLevel}
                onChange={(e) => upd({ errorCorrectionLevel: e.target.value as ErrorCorrectionLevel })}
              >
                {EC_LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint span-2">
              {EC_LEVELS.find((l) => l.value === style.errorCorrectionLevel)?.desc}
            </p>
            <label className="field">
              <span>Quiet zone (margin, {style.margin} modules)</span>
              <input
                type="range"
                min={0}
                max={10}
                value={style.margin}
                onChange={(e) => upd({ margin: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>Export resolution ({style.downloadSize}px)</span>
              <input
                type="range"
                min={256}
                max={4096}
                step={64}
                value={style.downloadSize}
                onChange={(e) => upd({ downloadSize: Number(e.target.value) })}
              />
            </label>
          </>
        )}
      </div>
    </CollapsiblePanel>
  )
}
