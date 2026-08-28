import { useEffect, useRef } from 'react'
import type { Content, LogoOptions, StyleOptions } from '../types'
import { renderQR } from '../lib/qr'

interface Props {
  style: StyleOptions
  logo: LogoOptions
  content: Content
  onError: (err: Error) => void
}

export default function Preview({ style, logo, content, onError }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const t = window.setTimeout(() => {
      try {
        renderQR(ref.current!, style, logo, content)
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)))
      }
    }, 120)
    return () => window.clearTimeout(t)
  }, [style, logo, content, onError])

  return (
    <div className="preview-card">
      <div className="preview-inner" ref={ref} />
    </div>
  )
}
