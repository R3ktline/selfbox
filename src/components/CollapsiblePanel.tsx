import type { ReactNode } from 'react'

interface Props {
  eyebrow?: string
  title: string
  hint?: string
  defaultOpen?: boolean
  children: ReactNode
}

export default function CollapsiblePanel({ eyebrow, title, hint, defaultOpen = false, children }: Props) {
  return (
    <details className="collapsible" {...(defaultOpen ? { open: true } : {})}>
      <summary className="collapsible-summary">
        <div className="collapsible-text">
          {eyebrow && <span className="panel-eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
          {hint && <p className="panel-hint">{hint}</p>}
        </div>
        <svg className="collapsible-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div className="collapsible-body">
        {children}
      </div>
    </details>
  )
}
