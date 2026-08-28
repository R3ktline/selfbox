import { useEffect, useState } from 'react'

export type RouteName =
  | 'home'
  | 'qr'
  | 'image-bg-remover'
  | 'image-compressor'
  | 'image-convert'
  | 'image-palette'
  | 'pdf'
  | 'pdf-pages'
  | 'pdf-split-export'
  | 'pdf-from-images'
  | 'pdf-ocr'
  | 'pdf-optimize'
  | 'favicon'
  | 'screenshot'
  | 'markdown'
  | 'json'
  | 'diff'
  | 'base64'
  | 'units'
  | 'text'
  | 'regex'
  | 'hash'
  | 'image-resize'
  | 'media'
  | 'media-gif'
  | 'media-edit'
  | 'not-found'

export type Route = { name: RouteName; path: string }

const ROUTES: Record<string, Exclude<RouteName, 'not-found'>> = {
  '': 'home',
  '/': 'home',
  '/qr': 'qr',
  '/image/background-remover': 'image-bg-remover',
  '/image/compressor': 'image-compressor',
  '/image/convert': 'image-convert',
  '/image/palette': 'image-palette',
  '/pdf': 'pdf',
  '/pdf/pages': 'pdf-pages',
  '/pdf/split-export': 'pdf-split-export',
  '/pdf/from-images': 'pdf-from-images',
  '/pdf/ocr': 'pdf-ocr',
  '/pdf/optimize': 'pdf-optimize',
  '/favicon': 'favicon',
  '/screenshot': 'screenshot',
  '/markdown': 'markdown',
  '/json': 'json',
  '/diff': 'diff',
  '/base64': 'base64',
  '/units': 'units',
  '/text': 'text',
  '/regex': 'regex',
  '/hash': 'hash',
  '/image/resize': 'image-resize',
  '/media': 'media',
  '/media/gif': 'media-gif',
  '/media/edit': 'media-edit',
}

const PATH_TO_ROUTE: Record<string, string> = Object.fromEntries(
  Object.entries(ROUTES).map(([k, v]) => [v, k === '' ? '/' : k]),
)

export function getRoute(): Route {
  const path = window.location.hash.replace(/^#/, '') || '/'
  const name = ROUTES[path]
  if (!name) return { name: 'not-found', path }
  return { name, path }
}

export function scrollToTop(): void {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
}

export function navigate(path: string): void {
  const next = path.startsWith('/') ? path : `/${path}`
  if (currentPath() === next) return
  window.location.hash = next
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(getRoute)
  useEffect(() => {
    const onHash = () => setRoute(getRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return route
}

export function href(path: string): string {
  return `#${path}`
}

export function pathFor(name: RouteName): string {
  return PATH_TO_ROUTE[name] ?? '/'
}

export function currentPath(): string {
  return window.location.hash.replace(/^#/, '') || '/'
}
