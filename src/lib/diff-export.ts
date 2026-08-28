import { BG_PRESETS, fillBackgroundOnCanvas, presetFromValue } from './screenshot'

export interface DiffBeautifyOptions {
  title?: string
  subtitle?: string
  bgValue?: string
  padding?: number
  scale?: number
}

export async function exportDiffAsImage(
  diffElement: HTMLElement,
  options: DiffBeautifyOptions = {},
): Promise<Blob> {
  const padding = options.padding ?? 48
  const scale = options.scale ?? 2
  const bg = presetFromValue(options.bgValue ?? BG_PRESETS[8].value)

  const frame = document.createElement('div')
  frame.className = 'diff-export-frame'
  frame.style.position = 'fixed'
  frame.style.left = '0'
  frame.style.top = '0'
  frame.style.visibility = 'hidden'
  frame.style.pointerEvents = 'none'
  frame.style.zIndex = '-1'
  frame.style.padding = `${padding}px`
  frame.style.width = `${Math.min(diffElement.scrollWidth + padding * 2, 900)}px`

  if (options.title) {
    const h = document.createElement('div')
    h.className = 'diff-export-title'
    h.textContent = options.title
    frame.appendChild(h)
  }
  if (options.subtitle) {
    const s = document.createElement('div')
    s.className = 'diff-export-subtitle'
    s.textContent = options.subtitle
    frame.appendChild(s)
  }

  const inner = diffElement.cloneNode(true) as HTMLElement
  inner.classList.add('diff-export-inner')
  inner.style.maxHeight = 'none'
  inner.style.overflow = 'visible'
  frame.appendChild(inner)
  document.body.appendChild(frame)

  try {
    const measure = document.createElement('canvas')
    measure.width = 10
    measure.height = 10
    const mctx = measure.getContext('2d')!
    fillBackgroundOnCanvas(mctx, 10, 10, bg)

    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(frame, {
      scale,
      backgroundColor: null,
      useCORS: true,
      logging: false,
    })

    const out = document.createElement('canvas')
    out.width = canvas.width
    out.height = canvas.height
    const ctx = out.getContext('2d')!
    fillBackgroundOnCanvas(ctx, out.width, out.height, bg)
    ctx.drawImage(canvas, 0, 0)
    return new Promise((resolve, reject) => {
      out.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
    })
  } finally {
    document.body.removeChild(frame)
  }
}
