import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  value: string
  onChange: (next: string) => void
  ariaLabel?: string
}

const PRESETS: string[] = [
  '#000000',
  '#111111',
  '#ffffff',
  '#6c8cff',
  '#4b6bff',
  '#22c55e',
  '#16a34a',
  '#eab308',
  '#f59e0b',
  '#ef4444',
  '#dc2626',
  '#ec4899',
  '#a855f7',
  '#0ea5e9',
  '#14b8a6',
  '#64748b',
]

const GRAYSCALE: string[] = [
  '#000000',
  '#1f2937',
  '#374151',
  '#6b7280',
  '#9ca3af',
  '#cbd5e1',
  '#e5e7eb',
  '#f3f4f6',
  '#ffffff',
]

const POPOVER_WIDTH = 220
const POPOVER_HEIGHT = 280
const GAP = 6
const VIEWPORT_PAD = 8

function normalizeHex(input: string): string | null {
  const s = input.trim().replace(/^#/, '').toLowerCase()
  if (!/^[0-9a-f]+$/.test(s)) return null
  if (s.length === 3) {
    return (
      '#' +
      s
        .split('')
        .map((c) => c + c)
        .join('')
    )
  }
  if (s.length === 6) return '#' + s
  if (s.length === 8) return '#' + s.slice(0, 6)
  return null
}

interface Placement {
  left: number
  top: number
}

function computePlacement(swatch: DOMRect): Placement {
  const vw = window.innerWidth
  const vh = window.innerHeight

  const fitsRight = swatch.left + POPOVER_WIDTH + VIEWPORT_PAD <= vw
  const left = fitsRight
    ? swatch.left
    : Math.max(VIEWPORT_PAD, swatch.right - POPOVER_WIDTH)

  const fitsBelow = swatch.bottom + GAP + POPOVER_HEIGHT + VIEWPORT_PAD <= vh
  const top = fitsBelow
    ? swatch.bottom + GAP
    : Math.max(VIEWPORT_PAD, swatch.top - GAP - POPOVER_HEIGHT)

  return { left, top }
}

export default function ColorPicker({ value, onChange, ariaLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [hexInput, setHexInput] = useState(value)
  const [placement, setPlacement] = useState<Placement>({ left: 0, top: 0 })
  const rootRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setHexInput(value)
  }, [value])

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return
    const update = () => {
      const rect = rootRef.current!.getBoundingClientRect()
      setPlacement(computePlacement(rect))
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const root = rootRef.current
      const pop = popoverRef.current
      const target = e.target as Node
      if (root && root.contains(target)) return
      if (pop && pop.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onSwatch = (hex: string) => {
    onChange(hex.toLowerCase())
  }

  const onHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHexInput(e.target.value)
  }
  const commitHex = () => {
    const norm = normalizeHex(hexInput)
    if (norm) onChange(norm)
    else setHexInput(value)
  }
  const onHexKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
  }

  const popover = open ? (
    <div
      className="cp-popover"
      ref={popoverRef}
      role="dialog"
      aria-label="Color picker"
      style={{ left: placement.left, top: placement.top }}
    >
      <div className="cp-section-label">Black &amp; white</div>
      <div className="cp-row">
        {GRAYSCALE.map((c) => (
          <button
            key={c}
            type="button"
            className={'cp-tile' + (c.toLowerCase() === value.toLowerCase() ? ' active' : '')}
            style={{ background: c }}
            onClick={() => onSwatch(c)}
            title={c}
            aria-label={c}
          />
        ))}
      </div>
      <div className="cp-section-label">Color palette</div>
      <div className="cp-grid">
        {PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            className={'cp-tile' + (c.toLowerCase() === value.toLowerCase() ? ' active' : '')}
            style={{ background: c }}
            onClick={() => onSwatch(c)}
            title={c}
            aria-label={c}
          />
        ))}
      </div>
      <div className="cp-hex-row">
        <span className="cp-hash">#</span>
        <input
          className="cp-hex"
          value={hexInput.replace(/^#/, '')}
          onChange={onHexChange}
          onBlur={commitHex}
          onKeyDown={onHexKey}
          maxLength={6}
          spellCheck={false}
          aria-label="Hex color value"
        />
        <button type="button" className="cp-apply" onClick={commitHex}>
          Apply
        </button>
      </div>
    </div>
  ) : null

  return (
    <div className="cp" ref={rootRef}>
      <button
        type="button"
        className={'cp-swatch' + (open ? ' open' : '')}
        style={{ background: value }}
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel || 'Open color picker'}
        title={value}
      />
      {popover && createPortal(popover, document.body)}
    </div>
  )
}
