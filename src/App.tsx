import { lazy, Suspense, useEffect, useState } from 'react'
import './styles.css'
import { href, navigate, useRoute } from './lib/router'
import { PAGE_TITLES, toolByPath } from './lib/tools'
import {
  applyTheme,
  loadThemeMode,
  resolveTheme,
  saveThemeMode,
  toggleThemeMode,
  type ResolvedTheme,
  type ThemeMode,
} from './lib/theme'
import { ToastProvider } from './lib/toast'
import Home from './pages/Home'
import NotFound from './pages/NotFound'
import ThemeToggle from './components/ThemeToggle'
import CommandPalette from './components/CommandPalette'
import ContextBar from './components/ContextBar'
import Toasts from './components/Toasts'
import ErrorBoundary from './components/ErrorBoundary'

const QrTool = lazy(() => import('./pages/QrTool'))
const BackgroundRemover = lazy(() => import('./pages/image/BackgroundRemover'))
const ImageCompressor = lazy(() => import('./pages/image/ImageCompressor'))
const ImageConverter = lazy(() => import('./pages/image/ImageConverter'))
const ImagePalette = lazy(() => import('./pages/image/ImagePalette'))
const PdfRedirect = lazy(() => import('./pages/pdf/PdfRedirect'))
const PdfPagesTool = lazy(() => import('./pages/pdf/PdfPagesTool'))
const PdfSplitExportTool = lazy(() => import('./pages/pdf/PdfSplitExportTool'))
const PdfFromImagesTool = lazy(() => import('./pages/pdf/PdfFromImagesTool'))
const PdfOcrTool = lazy(() => import('./pages/pdf/PdfOcrTool'))
const PdfOptimizeTool = lazy(() => import('./pages/pdf/PdfOptimizeTool'))
const FaviconGenerator = lazy(() => import('./pages/FaviconGenerator'))
const ScreenshotBeautifier = lazy(() => import('./pages/ScreenshotBeautifier'))
const MarkdownExport = lazy(() => import('./pages/MarkdownExport'))
const JsonFormatter = lazy(() => import('./pages/JsonFormatter'))
const TextDiff = lazy(() => import('./pages/TextDiff'))
const Base64Tool = lazy(() => import('./pages/Base64Tool'))
const UnitConverter = lazy(() => import('./pages/UnitConverter'))
const TextTools = lazy(() => import('./pages/TextTools'))
const RegexTester = lazy(() => import('./pages/RegexTester'))
const HashUuidTool = lazy(() => import('./pages/HashUuidTool'))
const ImageResizer = lazy(() => import('./pages/image/ImageResizer'))
const MediaDownloader = lazy(() => import('./pages/MediaDownloader'))
const GifTools = lazy(() => import('./pages/media/GifTools'))
const ImageEditor = lazy(() => import('./pages/media/ImageEditor'))


function AppShell() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(loadThemeMode)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(loadThemeMode()))
  const [cmdOpen, setCmdOpen] = useState(false)
  const route = useRoute()
  const path = route.path
  const current = toolByPath(path)

  useEffect(() => {
    const next = resolveTheme(themeMode)
    setResolvedTheme(next)
    applyTheme(next)
    saveThemeMode(themeMode)
  }, [themeMode])

  useEffect(() => {
    if (themeMode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => {
      const next = resolveTheme('system')
      setResolvedTheme(next)
      applyTheme(next)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [themeMode])

  useEffect(() => {
    document.title = PAGE_TITLES[route.name] ?? 'Toolbox'
  }, [route.name])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    document.body.style.overflow = cmdOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [cmdOpen])

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <a
          className="brand"
          href={href('/')}
          onClick={(e) => {
            e.preventDefault()
            navigate('/')
          }}
        >
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">toolbox</span>
        </a>
        <span className="topbar-crumb">
          {current ? (
            <>
              <span className="topbar-crumb-group" data-group={current.group}>
                {current.group}
              </span>
              <span className="topbar-crumb-sep" aria-hidden="true">
                /
              </span>
              {current.title}
            </>
          ) : route.name === 'home' ? (
            'Index'
          ) : (
            '404'
          )}
        </span>
        <div className="topbar-right">
          <button type="button" className="cmd-trigger" onClick={() => setCmdOpen(true)}>
            Search
            <kbd className="kbd">⌘K</kbd>
          </button>
          <ThemeToggle
            themeMode={themeMode}
            resolvedTheme={resolvedTheme}
            onChange={() => setThemeMode((mode) => toggleThemeMode(mode, resolveTheme(mode)))}
          />
        </div>
      </header>

      {current && <ContextBar current={current} />}

      <ErrorBoundary>
        <Suspense fallback={<div className="page-loading">Loading</div>}>
          <div key={route.name} className="page-enter">
            {route.name === 'home' && <Home />}
            {route.name === 'qr' && <QrTool />}
            {route.name === 'image-bg-remover' && <BackgroundRemover />}
            {route.name === 'image-compressor' && <ImageCompressor />}
            {route.name === 'image-convert' && <ImageConverter />}
            {route.name === 'image-palette' && <ImagePalette />}
            {route.name === 'pdf' && <PdfRedirect />}
            {route.name === 'pdf-pages' && <PdfPagesTool />}
            {route.name === 'pdf-split-export' && <PdfSplitExportTool />}
            {route.name === 'pdf-from-images' && <PdfFromImagesTool />}
            {route.name === 'pdf-ocr' && <PdfOcrTool />}
            {route.name === 'pdf-optimize' && <PdfOptimizeTool />}
            {route.name === 'favicon' && <FaviconGenerator />}
            {route.name === 'screenshot' && <ScreenshotBeautifier />}
            {route.name === 'markdown' && <MarkdownExport />}
            {route.name === 'json' && <JsonFormatter />}
            {route.name === 'diff' && <TextDiff />}
            {route.name === 'base64' && <Base64Tool />}
            {route.name === 'units' && <UnitConverter />}
            {route.name === 'text' && <TextTools />}
            {route.name === 'regex' && <RegexTester />}
            {route.name === 'hash' && <HashUuidTool />}
            {route.name === 'image-resize' && <ImageResizer />}
            {route.name === 'media' && <MediaDownloader />}
            {route.name === 'media-gif' && <GifTools />}
            {route.name === 'media-edit' && <ImageEditor />}
            {route.name === 'not-found' && <NotFound />}
          </div>
        </Suspense>
      </ErrorBoundary>

      <footer className="footer">
        <span className="footer-status">● Local execution</span>
        <span className="footer-sep" aria-hidden="true">·</span>
        <span>No uploads · No tracking</span>
        <span className="footer-sep" aria-hidden="true">·</span>
        <button type="button" className="btn-link" onClick={() => setCmdOpen(true)}>
          Open command palette
        </button>
      </footer>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <Toasts />
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  )
}
