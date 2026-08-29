import { href, navigate } from '../lib/router'
import { toolsInGroup, type ToolMeta } from '../lib/tools'
import { ToolIcon } from './ToolIcons'

interface Props {
  current: ToolMeta
}

export default function ContextBar({ current }: Props) {
  const siblings = toolsInGroup(current.group)
  if (siblings.length <= 1) return null

  return (
    <nav className="context-bar" aria-label="Related tools">
      <div className="context-bar-scroll">
        <div className="context-bar-links">
          {siblings.map((t) => (
            <a
              key={t.path}
              href={href(t.path)}
              className={'context-link' + (t.path === current.path ? ' active' : '')}
              aria-current={t.path === current.path ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault()
                navigate(t.path)
              }}
            >
              <span className="context-link-icon" data-group={current.group}>
                <ToolIcon id={t.icon} size={14} />
              </span>
              <span className="context-link-text">{t.short}</span>
            </a>
          ))}
        </div>
      </div>
    </nav>
  )
}
