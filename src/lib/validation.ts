import type { ErrorCorrectionLevel, LogoOptions, StyleOptions } from '../types'

export interface Warning {
  level: 'error' | 'warn' | 'info'
  message: string
}

function parseHex(hex: string): [number, number, number] | null {
  const cleaned = hex.trim().replace('#', '')
  if (cleaned.length !== 3 && cleaned.length !== 6) return null
  const full = cleaned.length === 3 ? cleaned.split('').map((c) => c + c).join('') : cleaned
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
}

function relativeLuminance(r: number, g: number, b: number): number {
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: string, b: string): number | null {
  const ca = parseHex(a)
  const cb = parseHex(b)
  if (!ca || !cb) return null
  const la = relativeLuminance(ca[0], ca[1], ca[2])
  const lb = relativeLuminance(cb[0], cb[1], cb[2])
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

const EC_HEADROOM: Record<ErrorCorrectionLevel, number> = {
  L: 0.07,
  M: 0.15,
  Q: 0.25,
  H: 0.3,
}

export function validateStyle(style: StyleOptions, logo: LogoOptions, payload: string): Warning[] {
  const warnings: Warning[] = []

  const ratio = contrastRatio(style.fgColor, style.bgColor)
  if (ratio === null) {
    warnings.push({ level: 'error', message: 'Invalid foreground or background color. Use a hex color (e.g. #111111).' })
  } else if (ratio < 3) {
    warnings.push({
      level: 'error',
      message: `Color contrast ratio is ${ratio.toFixed(2)}:1 — scanners will likely fail. Aim for at least 4.5:1.`,
    })
  } else if (ratio < 4.5) {
    warnings.push({
      level: 'warn',
      message: `Color contrast ratio is ${ratio.toFixed(2)}:1. WCAG recommends 4.5:1 or higher.`,
    })
  }

  if (style.margin < 2) {
    warnings.push({ level: 'warn', message: 'Quiet zone is small (< 2 modules). Scanners need a blank border to detect the code.' })
  }

  if (style.margin > 8) {
    warnings.push({ level: 'info', message: 'Large quiet zone increases the printed size without adding data.' })
  }

  if (payload.length > 2500) {
    warnings.push({ level: 'warn', message: `Payload is ${payload.length} characters. Long payloads force high density and lower reliability at small sizes.` })
  }

  if (payload.length > 4296) {
    warnings.push({ level: 'error', message: `Payload is ${payload.length} characters — exceeds the QR maximum of 4296 alphanumeric / 2953 byte characters.` })
  }

  if (logo.dataUrl) {
    const headroom = EC_HEADROOM[style.errorCorrectionLevel]
    const coverage = logo.size / 100
    if (coverage > headroom && !logo.hideBackgroundDots) {
      warnings.push({
        level: 'warn',
        message: 'Logo is larger than the error-correction budget. Enable "hide dots behind logo" or lower the logo size to keep the code scannable.',
      })
    }
  }

  return warnings
}
