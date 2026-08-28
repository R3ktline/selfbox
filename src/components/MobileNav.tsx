import { href, navigate } from '../lib/router'
import { GROUP_ORDER, TOOLS } from '../lib/tools'

interface Props {
  open: boolean
  onClose: () => void
  currentPath: string
}

export default function MobileNav({ open, onClose, currentPath }: Props) {
  if (!open) return null

  return (
    <div className="sheet-root" role="dialog" aria-modal="true" aria-label="Tools">
      <button type="button" className="cmd-backdrop" aria-label="Close menu" onClick={onClose} />
      <nav className="sheet-panel">
        <div className="sheet-head">
          <span className="panel-eyebrow">Tools</span>
          <button type="button" className="theme-toggle" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {GROUP_ORDER.map((group) => (
          <section key={group} className="sheet-group">
            <h2>{group}</h2>
            {TOOLS.filter((t) => t.group === group).map((t) => (
              <a
                key={t.path}
                href={href(t.path)}
                className={'sheet-link' + (currentPath === t.path ? ' active' : '')}
                onClick={(e) => {
                  e.preventDefault()
                  navigate(t.path)
                  onClose()
                }}
              >
                {t.title}
              </a>
            ))}
          </section>
        ))}
      </nav>
    </div>
  )
}
