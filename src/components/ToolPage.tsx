import type { ReactNode } from 'react'
import { href, navigate } from '../lib/router'

interface Props {
  eyebrow: string
  title: string
  hint?: string
  children: ReactNode
}

export default function ToolPage({ eyebrow, title, hint, children }: Props) {
  return (
    <main className="tool-page" id="main">
      <header className="tool-header">
        <a
          className="crumb"
          href={href('/')}
          onClick={(e) => {
            e.preventDefault()
            navigate('/')
          }}
        >
          All tools
        </a>
        <span className="panel-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {hint && <p className="tool-hint">{hint}</p>}
      </header>
      <div className="tool-body">{children}</div>
    </main>
  )
}
