import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import type { BgPreset } from './screenshot'
import { fillBackgroundOnCanvas } from './screenshot'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('css', css)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('xml', xml)

marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      if (lang && hljs.getLanguage(lang)) {
        const highlighted = hljs.highlight(text, { language: lang }).value
        return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>\n`
      }
      const highlighted = hljs.highlightAuto(text).value
      return `<pre><code class="hljs">${highlighted}</code></pre>\n`
    },
  },
})

export type MdTheme = 'light' | 'dark'

export interface MarkdownRenderOptions {
  padding: number
  bg: BgPreset | { kind: 'custom'; color: string }
  paperMargin: number
  fontSize: number
  theme: MdTheme
  scale: number
  pageWidth?: number
  pageContentHeight?: number
}

export const DEFAULT_MD_OPTIONS: MarkdownRenderOptions = {
  padding: 40,
  bg: { kind: 'custom', color: '#f4f4f5' },
  paperMargin: 56,
  fontSize: 15,
  theme: 'light',
  scale: 2,
  pageWidth: 780,
  pageContentHeight: 980,
}

export function renderMarkdownHtml(md: string): string {
  const raw = marked.parse(md, { async: false, breaks: true, gfm: true }) as string
  return DOMPurify.sanitize(raw)
}

function applyThemeClass(el: HTMLElement, theme: MdTheme) {
  el.classList.remove('md-theme-light', 'md-theme-dark')
  el.classList.add(theme === 'dark' ? 'md-theme-dark' : 'md-theme-light')
}

export function buildMarkdownPreviewElement(html: string, options: MarkdownRenderOptions): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'md-render'
  el.style.width = `${options.pageWidth ?? 780}px`
  el.style.padding = `${options.padding}px ${options.paperMargin}px`
  el.style.fontSize = `${options.fontSize}px`
  applyThemeClass(el, options.theme)
  el.innerHTML = html
  return el
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'))
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) resolve()
          else {
            img.onload = () => resolve()
            img.onerror = () => resolve()
          }
        }),
    ),
  )
}

export async function captureMarkdownPages(
  html: string,
  options: MarkdownRenderOptions,
): Promise<HTMLCanvasElement[]> {
  const pageWidth = options.pageWidth ?? 780
  const pageContentHeight = options.pageContentHeight ?? 980
  const scale = options.scale

  const source = buildMarkdownPreviewElement(html, options)
  source.classList.add('md-export-source')
  source.style.position = 'fixed'
  source.style.left = '0'
  source.style.top = '0'
  source.style.visibility = 'hidden'
  source.style.pointerEvents = 'none'
  source.style.zIndex = '-1'
  document.body.appendChild(source)

  await waitForImages(source)
  await document.fonts?.ready

  const totalHeight = source.scrollHeight
  const pageCount = Math.max(1, Math.ceil(totalHeight / pageContentHeight))
  const canvases: HTMLCanvasElement[] = []

  try {
    for (let i = 0; i < pageCount; i++) {
      const slice = document.createElement('div')
      slice.className = 'md-export-slice'
      slice.style.width = `${pageWidth}px`
      slice.style.height = `${pageContentHeight}px`
      slice.style.overflow = 'hidden'
      slice.style.position = 'fixed'
      slice.style.left = '0'
      slice.style.top = '0'
      slice.style.visibility = 'hidden'
      slice.style.pointerEvents = 'none'
      slice.style.zIndex = '-1'
      slice.style.background = options.theme === 'dark' ? '#18181b' : '#ffffff'

      const inner = source.cloneNode(true) as HTMLDivElement
      inner.style.position = 'absolute'
      inner.style.top = `-${i * pageContentHeight}px`
      inner.style.left = '0'
      inner.style.margin = '0'
      slice.appendChild(inner)
      document.body.appendChild(slice)

      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(slice, {
        scale,
        backgroundColor: options.theme === 'dark' ? '#18181b' : '#ffffff',
        useCORS: true,
        logging: false,
        width: pageWidth,
        height: pageContentHeight,
        windowWidth: pageWidth,
        windowHeight: pageContentHeight,
      })
      canvases.push(canvas)
      document.body.removeChild(slice)
    }
  } finally {
    document.body.removeChild(source)
  }

  return canvases
}

/** Wrap page canvases in a beautifier-style frame for PNG export. */
export async function frameMarkdownCanvases(
  pageCanvases: HTMLCanvasElement[],
  options: MarkdownRenderOptions,
): Promise<HTMLCanvasElement[]> {
  const pad = Math.round(options.padding * 0.6)
  const framed: HTMLCanvasElement[] = []
  for (const page of pageCanvases) {
    const c = document.createElement('canvas')
    c.width = page.width + pad * 2 * (options.scale / 2)
    c.height = page.height + pad * 2 * (options.scale / 2)
    const ctx = c.getContext('2d')!
    fillBackgroundOnCanvas(ctx, c.width, c.height, options.bg)
    const offset = pad * (options.scale / 2)
    ctx.drawImage(page, offset, offset)
    framed.push(c)
  }
  return framed
}
