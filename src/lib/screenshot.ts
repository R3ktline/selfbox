import { canvasToBlob, fileToImage } from './images'

export type FrameStyle = 'none' | 'macos' | 'browser'

export interface BgPreset {
  label: string
  value: string
  kind: 'gradient' | 'solid'
  angle?: number
  stops?: { color: string; pos: number }[]
  color?: string
}

export const BG_PRESETS: BgPreset[] = [
  {
    label: 'Indigo',
    kind: 'gradient',
    angle: 135,
    stops: [
      { color: '#667eea', pos: 0 },
      { color: '#764ba2', pos: 1 },
    ],
    value: 'linear-gradient(135deg, #667eea, #764ba2)',
  },
  {
    label: 'Sunset',
    kind: 'gradient',
    angle: 135,
    stops: [
      { color: '#f093fb', pos: 0 },
      { color: '#f5576c', pos: 1 },
    ],
    value: 'linear-gradient(135deg, #f093fb, #f5576c)',
  },
  {
    label: 'Sky',
    kind: 'gradient',
    angle: 135,
    stops: [
      { color: '#4facfe', pos: 0 },
      { color: '#00f2fe', pos: 1 },
    ],
    value: 'linear-gradient(135deg, #4facfe, #00f2fe)',
  },
  {
    label: 'Mint',
    kind: 'gradient',
    angle: 135,
    stops: [
      { color: '#43e97b', pos: 0 },
      { color: '#38f9d7', pos: 1 },
    ],
    value: 'linear-gradient(135deg, #43e97b, #38f9d7)',
  },
  {
    label: 'Peach',
    kind: 'gradient',
    angle: 135,
    stops: [
      { color: '#fa709a', pos: 0 },
      { color: '#fee140', pos: 1 },
    ],
    value: 'linear-gradient(135deg, #fa709a, #fee140)',
  },
  {
    label: 'Soft',
    kind: 'gradient',
    angle: 135,
    stops: [
      { color: '#fbc2eb', pos: 0 },
      { color: '#a6c1ee', pos: 1 },
    ],
    value: 'linear-gradient(135deg, #fbc2eb, #a6c1ee)',
  },
  {
    label: 'Candy',
    kind: 'gradient',
    angle: 135,
    stops: [
      { color: '#ff9a9e', pos: 0 },
      { color: '#fad0c4', pos: 0.5 },
      { color: '#fad0c4', pos: 1 },
    ],
    value: 'linear-gradient(135deg, #ff9a9e, #fad0c4, #fad0c4)',
  },
  {
    label: 'Lavender',
    kind: 'gradient',
    angle: 135,
    stops: [
      { color: '#a18cd1', pos: 0 },
      { color: '#fbc2eb', pos: 1 },
    ],
    value: 'linear-gradient(135deg, #a18cd1, #fbc2eb)',
  },
  { label: 'Light', kind: 'solid', color: '#f4f4f5', value: '#f4f4f5' },
  { label: 'Dark', kind: 'solid', color: '#18181b', value: '#18181b' },
  { label: 'Black', kind: 'solid', color: '#0c0a09', value: '#0c0a09' },
  { label: 'White', kind: 'solid', color: '#ffffff', value: '#ffffff' },
]

export type AspectPreset = 'auto' | '16:9' | '4:3' | '1:1' | '9:16'

export interface CropPan {
  /** 0–1 horizontal pan (0 = left, 1 = right) */
  x: number
  /** 0–1 vertical pan (0 = top, 1 = bottom) */
  y: number
}

export interface BeautifyOptions {
  bg: BgPreset | { kind: 'custom'; color: string }
  padding: number
  cornerRadius: number
  shadow: number
  shadowOpacity: number
  frame: FrameStyle
  windowTitle?: string
  scale?: number
  aspect?: AspectPreset
  cropPan?: CropPan
  cropZoom?: number
  exportType?: 'image/png' | 'image/jpeg' | 'image/webp'
  exportQuality?: number
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const s = hex.trim().replace('#', '')
  if (!/^[0-9a-f]{3}$/i.test(s) && !/^[0-9a-f]{6}$/i.test(s)) return null
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function isLightBackground(bg: BeautifyOptions['bg']): boolean {
  if (bg.kind === 'custom') {
    const rgb = hexToRgb(bg.color)
    return rgb ? luminance(rgb) > 0.55 : true
  }
  if (bg.kind === 'solid' && bg.color) {
    const rgb = hexToRgb(bg.color)
    return rgb ? luminance(rgb) > 0.55 : true
  }
  if (bg.kind === 'gradient' && bg.stops?.length) {
    const avg =
      bg.stops.reduce((sum, s) => {
        const rgb = hexToRgb(s.color)
        return sum + (rgb ? luminance(rgb) : 0.5)
      }, 0) / bg.stops.length
    return avg > 0.55
  }
  return true
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + rad, rad)
  ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad)
  ctx.arcTo(x, y + h, x, y + h - rad, rad)
  ctx.arcTo(x, y, x + rad, y, rad)
  ctx.closePath()
}

function fillBackground(ctx: CanvasRenderingContext2D, w: number, h: number, bg: BeautifyOptions['bg']) {
  if (bg.kind === 'custom' || bg.kind === 'solid') {
    const color = bg.kind === 'custom' ? bg.color : (bg.color ?? '#f4f4f5')
    const rgb = hexToRgb(color)
    ctx.fillStyle = rgb ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : color
    ctx.fillRect(0, 0, w, h)
    const v = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 1.4)
    const [r, g, b] = rgb ?? [0, 0, 0]
    v.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`)
    v.addColorStop(1, 'rgba(0, 0, 0, 0.18)')
    ctx.fillStyle = v
    ctx.fillRect(0, 0, w, h)
    return
  }

  const angle = ((bg.angle ?? 135) * Math.PI) / 180
  const cx = w / 2
  const cy = h / 2
  const len = Math.sqrt(w * w + h * h) / 2
  const x0 = cx - Math.cos(angle) * len
  const y0 = cy - Math.sin(angle) * len
  const x1 = cx + Math.cos(angle) * len
  const y1 = cy + Math.sin(angle) * len
  const grad = ctx.createLinearGradient(x0, y0, x1, y1)
  for (const stop of bg.stops ?? []) grad.addColorStop(stop.pos, stop.color)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
}

export function fillBackgroundOnCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bg: BeautifyOptions['bg'],
) {
  fillBackground(ctx, w, h, bg)
}

export function aspectRatioValue(aspect: Exclude<AspectPreset, 'auto'>): number {
  const ratios: Record<Exclude<AspectPreset, 'auto'>, number> = {
    '16:9': 16 / 9,
    '4:3': 4 / 3,
    '1:1': 1,
    '9:16': 9 / 16,
  }
  return ratios[aspect]
}

function aspectSize(w: number, h: number, aspect: AspectPreset): { w: number; h: number } {
  if (aspect === 'auto') return { w, h }
  const target = aspectRatioValue(aspect)
  const current = w / h
  if (current > target) return { w: Math.round(h * target), h }
  return { w, h: Math.round(w / target) }
}

/** Source crop region for cover-fit pan/zoom inside a fixed aspect frame. */
export function computeCropRegion(
  naturalW: number,
  naturalH: number,
  frameW: number,
  frameH: number,
  zoom = 1,
  pan: CropPan = { x: 0.5, y: 0.5 },
): { sx: number; sy: number; sw: number; sh: number } {
  const z = Math.max(1, zoom)
  const frameAspect = frameW / frameH
  const imgAspect = naturalW / naturalH
  let sw: number
  let sh: number
  if (imgAspect > frameAspect) {
    sh = naturalH / z
    sw = sh * frameAspect
  } else {
    sw = naturalW / z
    sh = sw / frameAspect
  }
  sw = Math.min(sw, naturalW)
  sh = Math.min(sh, naturalH)
  const maxSx = Math.max(0, naturalW - sw)
  const maxSy = Math.max(0, naturalH - sh)
  const px = Math.min(1, Math.max(0, pan.x))
  const py = Math.min(1, Math.max(0, pan.y))
  return { sx: maxSx * px, sy: maxSy * py, sw, sh }
}

function drawBrowserChrome(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  barH: number,
  light: boolean,
  title: string,
) {
  ctx.fillStyle = light ? '#f3f4f6' : '#1f2937'
  ctx.fillRect(x, y, w, barH)
  ctx.strokeStyle = light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
  ctx.beginPath()
  ctx.moveTo(x, y + barH)
  ctx.lineTo(x + w, y + barH)
  ctx.stroke()

  const dotY = y + barH / 2
  const colors = ['#ff5f57', '#febc2e', '#28c840']
  colors.forEach((c, i) => {
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.arc(x + 16 + i * 14, dotY, 5, 0, Math.PI * 2)
    ctx.fill()
  })

  const urlX = x + 72
  const urlW = w - 88
  ctx.fillStyle = light ? '#ffffff' : '#374151'
  roundRect(ctx, urlX, y + 8, urlW, barH - 16, 6)
  ctx.fill()
  ctx.fillStyle = light ? '#6b7280' : '#9ca3af'
  ctx.font = '12px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  const label = title || 'example.com'
  ctx.fillText(label.length > 48 ? `${label.slice(0, 45)}…` : label, urlX + 12, dotY)
}

function drawMacChrome(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, barH: number, light: boolean) {
  ctx.fillStyle = light ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.06)'
  ctx.fillRect(x, y, w, barH)
  const dotY = y + barH / 2
  const colors = ['#ff5f57', '#febc2e', '#28c840']
  colors.forEach((c, i) => {
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.arc(x + 16 + i * 14, dotY, 6, 0, Math.PI * 2)
    ctx.fill()
  })
}

export async function beautifyScreenshot(file: File, options: BeautifyOptions): Promise<Blob> {
  const img = await fileToImage(file)
  const scale = options.scale ?? 1
  let w = img.naturalWidth
  let h = img.naturalHeight
  if (options.aspect && options.aspect !== 'auto') {
    const sized = aspectSize(w, h, options.aspect)
    w = sized.w
    h = sized.h
  }

  const frame = options.frame
  const titleBarHeight = frame === 'none' ? 0 : frame === 'browser' ? 44 : 36
  const innerW = w
  const innerH = h + titleBarHeight
  const pad = options.padding
  const totalW = innerW + pad * 2
  const totalH = innerH + pad * 2

  const c = document.createElement('canvas')
  c.width = Math.round(totalW * scale)
  c.height = Math.round(totalH * scale)
  const ctx = c.getContext('2d')!
  if (scale !== 1) ctx.scale(scale, scale)

  fillBackground(ctx, totalW, totalH, options.bg)

  const r = Math.min(options.cornerRadius, Math.min(innerW, innerH) / 2)
  const light = isLightBackground(options.bg)

  ctx.save()
  ctx.shadowColor = `rgba(0, 0, 0, ${options.shadowOpacity})`
  ctx.shadowBlur = options.shadow
  ctx.shadowOffsetY = Math.round(options.shadow / 6)
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, pad, pad, innerW, innerH, r)
  ctx.fill()
  ctx.restore()

  ctx.save()
  roundRect(ctx, pad, pad, innerW, innerH, r)
  ctx.clip()

  if (frame !== 'none') {
    if (frame === 'browser') {
      drawBrowserChrome(ctx, pad, pad, innerW, titleBarHeight, light, options.windowTitle ?? '')
    } else {
      drawMacChrome(ctx, pad, pad, innerW, titleBarHeight, light)
    }
  }

  const imgY = pad + titleBarHeight
  if (options.aspect && options.aspect !== 'auto') {
    const crop = computeCropRegion(
      img.naturalWidth,
      img.naturalHeight,
      w,
      h,
      options.cropZoom ?? 1,
      options.cropPan ?? { x: 0.5, y: 0.5 },
    )
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, pad, imgY, w, h)
  } else {
    ctx.drawImage(img, pad, imgY, w, h)
  }
  ctx.restore()

  const type = options.exportType ?? 'image/png'
  const quality = options.exportQuality ?? 0.92
  return canvasToBlob(c, type, type === 'image/png' ? undefined : quality)
}

export function presetFromValue(value: string): BgPreset | { kind: 'custom'; color: string } {
  const found = BG_PRESETS.find((p) => p.value === value)
  if (found) return found
  if (value.startsWith('#')) return { kind: 'custom', color: value }
  return BG_PRESETS[0]
}
