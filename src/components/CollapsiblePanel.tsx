import { useId, useState, type ReactNode } from 'react'

interface Props {
  eyebrow?: string
  title: string
  hint?: string
  defaultOpen?: boolean
  children: ReactNode
}

export default function CollapsiblePanel({ eyebrow, title, hint, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()

  return (
    <div className={'collapsible' + (open ? ' is-open' : '')}>
      <button
        type="button"
        className="collapsible-summary"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="collapsible-text">
          {eyebrow && <span className="panel-eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
          {hint && <p className="panel-hint">{hint}</p>}
        </div>
        <svg className="collapsible-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div className="collapsible-content" id={bodyId}>
        <div className="collapsible-inner">
          <div className="collapsible-body">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
