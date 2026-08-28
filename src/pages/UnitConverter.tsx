import { useState } from 'react'
import ToolPage from '../components/ToolPage'
import ColorPicker from '../components/ColorPicker'
import { useToast } from '../lib/toast'
import { contrastRatio, parseHex, wcagLevel } from '../lib/contrast'

function hexToRgb(hex: string): [number, number, number] | null {
  const s = hex.trim().replace('#', '')
  if (!/^[0-9a-f]{3}$/i.test(s) && !/^[0-9a-f]{6}$/i.test(s)) return null
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h = h * 60
    if (h < 0) h += 360
  }
  return [h, s * 100, l * 100]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sn = s / 100
  const ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = ln - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

function CopyBtn({ text }: { text: string }) {
  const { push } = useToast()
  return (
    <button
      type="button"
      className="btn-link"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          push('Copied')
        } catch {
          push('Clipboard unavailable', 'error')
        }
      }}
    >
      Copy
    </button>
  )
}

export default function UnitConverter() {
  return (
    <ToolPage
      eyebrow="Design"
      title="Unit & Color Converter"
      hint="Bidirectional CSS length, color conversion, and WCAG contrast checking."
    >
      <div className="tools-grid-2col">
        <LengthConverter />
        <ColorConverter />
      </div>
      <div style={{ marginTop: 16 }}>
        <ContrastChecker />
      </div>
    </ToolPage>
  )
}

function LengthConverter() {
  const [px, setPx] = useState(16)
  const [baseFont, setBaseFont] = useState(16)
  const [viewportW, setViewportW] = useState(1440)
  const [viewportH, setViewportH] = useState(900)

  const rem = px / baseFont
  const em = px / baseFont
  const pt = (px * 3) / 4
  const percent = (px / baseFont) * 100
  const vw = (px / viewportW) * 100
  const vh = (px / viewportH) * 100

  const rows = [
    { label: 'rem', value: rem.toFixed(4), onChange: (v: number) => setPx(v * baseFont) },
    { label: 'em', value: em.toFixed(4), onChange: (v: number) => setPx(v * baseFont) },
    { label: 'pt', value: pt.toFixed(4), onChange: (v: number) => setPx((v * 4) / 3) },
    { label: '%', value: percent.toFixed(2), onChange: (v: number) => setPx((v / 100) * baseFont), suffix: '%' },
    { label: 'vw', value: vw.toFixed(4), onChange: (v: number) => setPx((v / 100) * viewportW) },
    { label: 'vh', value: vh.toFixed(4), onChange: (v: number) => setPx((v / 100) * viewportH) },
  ]

  return (
    <div className="panel">
      <h2>CSS length</h2>
      <div className="form-grid">
        <label className="field">
          <span>Pixels (px)</span>
          <input type="number" value={px} onChange={(e) => setPx(Number(e.target.value))} />
        </label>
        <label className="field">
          <span>Base font ({baseFont}px)</span>
          <input type="range" min={8} max={32} value={baseFont} onChange={(e) => setBaseFont(Number(e.target.value))} />
        </label>
        <label className="field">
          <span>Viewport width ({viewportW}px)</span>
          <input type="range" min={320} max={3840} step={16} value={viewportW} onChange={(e) => setViewportW(Number(e.target.value))} />
        </label>
        <label className="field">
          <span>Viewport height ({viewportH}px)</span>
          <input type="range" min={320} max={3840} step={16} value={viewportH} onChange={(e) => setViewportH(Number(e.target.value))} />
        </label>
      </div>
      <table className="kv-table">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th>{row.label}</th>
              <td>
                <input
                  type="number"
                  className="kv-input"
                  value={parseFloat(row.value)}
                  onChange={(e) => row.onChange(Number(e.target.value))}
                  step={row.label === '%' ? 0.1 : 0.0001}
                />
                {row.suffix && <span className="meta">{row.suffix}</span>}
                <CopyBtn text={row.label === '%' ? `${row.value}%` : `${row.value}${row.label}`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint" style={{ marginTop: 8 }}>Edit any row to update px. ch/ex depend on font metrics and are omitted.</p>
    </div>
  )
}

function ColorConverter() {
  const [hex, setHex] = useState('#4b6bff')
  const [hslText, setHslText] = useState('')

  const rgb = hexToRgb(hex)
  const valid = rgb !== null
  const [r, g, b] = rgb ?? [0, 0, 0]
  const [h, s, l] = rgbToHsl(r, g, b)

  const swatchStyle: React.CSSProperties = { background: valid ? hex : 'transparent' }

  const applyHsl = (text: string) => {
    setHslText(text)
    const m = text.trim().match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/)
    if (!m) return
    const [nr, ng, nb] = hslToRgb(Number(m[1]), Number(m[2]), Number(m[3]))
    setHex(rgbToHex(nr, ng, nb))
  }

  return (
    <div className="panel">
      <h2>Color</h2>
      <div className="form-grid">
        <label className="field">
          <span>Hex</span>
          <input
            type="text"
            value={hex}
            onChange={(e) => {
              setHex(e.target.value)
              const parsed = hexToRgb(e.target.value)
              if (parsed) {
                const [hh, ss, ll] = rgbToHsl(...parsed)
                setHslText(`${Math.round(hh)} ${Math.round(ss)}% ${Math.round(ll)}%`)
              }
            }}
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </label>
        <label className="field">
          <span>HSL (h s% l%)</span>
          <input
            type="text"
            value={hslText || `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`}
            onChange={(e) => applyHsl(e.target.value)}
            placeholder="220 80% 60%"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </label>
        <div className="field">
          <span>Preview</span>
          <div className="color-swatch-large" style={swatchStyle} />
        </div>
      </div>
      {valid ? (
        <table className="kv-table">
          <tbody>
            <tr>
              <th>RGB</th>
              <td>
                <code>rgb({Math.round(r)}, {Math.round(g)}, {Math.round(b)})</code>
                <CopyBtn text={`rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`} />
              </td>
            </tr>
            <tr>
              <th>HEX</th>
              <td>
                <code>{hex.toUpperCase()}</code>
                <CopyBtn text={hex.toUpperCase()} />
              </td>
            </tr>
            <tr>
              <th>HSL</th>
              <td>
                <code>hsl({Math.round(h)} {Math.round(s)}% {Math.round(l)}%)</code>
                <CopyBtn text={`hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`} />
              </td>
            </tr>
            <tr>
              <th>sRGB</th>
              <td>
                <code>color(srgb {(r / 255).toFixed(4)} {(g / 255).toFixed(4)} {(b / 255).toFixed(4)})</code>
                <CopyBtn text={`color(srgb ${(r / 255).toFixed(4)} ${(g / 255).toFixed(4)} ${(b / 255).toFixed(4)})`} />
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="hint">Enter a valid hex color (e.g. <code>#4b6bff</code>) or HSL values.</p>
      )}
    </div>
  )
}

function ContrastChecker() {
  const [fg, setFg] = useState('#111827')
  const [bg, setBg] = useState('#ffffff')
  const fgRgb = parseHex(fg)
  const bgRgb = parseHex(bg)
  const valid = fgRgb !== null && bgRgb !== null
  const ratio = valid ? contrastRatio(fgRgb, bgRgb) : 0
  const levels = wcagLevel(ratio)

  return (
    <div className="panel">
      <h2>Contrast checker (WCAG)</h2>
      <div className="form-grid">
        <label className="field">
          <span>Foreground</span>
          <div className="color-row">
            <ColorPicker value={fgRgb ? fg : '#111827'} onChange={setFg} ariaLabel="Foreground color" />
            <input value={fg} onChange={(e) => setFg(e.target.value)} style={{ fontFamily: 'var(--font-mono)' }} />
          </div>
        </label>
        <label className="field">
          <span>Background</span>
          <div className="color-row">
            <ColorPicker value={bgRgb ? bg : '#ffffff'} onChange={setBg} ariaLabel="Background color" />
            <input value={bg} onChange={(e) => setBg(e.target.value)} style={{ fontFamily: 'var(--font-mono)' }} />
          </div>
        </label>
      </div>
      {valid ? (
        <>
          <div className="contrast-preview" style={{ background: bg, color: fg }}>
            <strong>Sample heading</strong>
            <p>Body text preview for readability testing.</p>
          </div>
          <table className="kv-table">
            <tbody>
              <tr><th>Ratio</th><td><strong>{ratio.toFixed(2)}:1</strong></td></tr>
              <tr><th>AA normal</th><td className={levels.aa ? 'pass' : 'fail'}>{levels.aa ? 'Pass' : 'Fail'} (4.5:1)</td></tr>
              <tr><th>AAA normal</th><td className={levels.aaa ? 'pass' : 'fail'}>{levels.aaa ? 'Pass' : 'Fail'} (7:1)</td></tr>
              <tr><th>AA large</th><td className={levels.aaLarge ? 'pass' : 'fail'}>{levels.aaLarge ? 'Pass' : 'Fail'} (3:1)</td></tr>
              <tr><th>AAA large</th><td className={levels.aaaLarge ? 'pass' : 'fail'}>{levels.aaaLarge ? 'Pass' : 'Fail'} (4.5:1)</td></tr>
            </tbody>
          </table>
        </>
      ) : (
        <p className="hint">Enter valid hex colors for both foreground and background.</p>
      )}
    </div>
  )
}
