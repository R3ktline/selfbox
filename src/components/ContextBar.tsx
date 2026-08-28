import { href, navigate } from '../lib/router'
import { GROUP_META, toolsInGroup, type ToolMeta } from '../lib/tools'
import { ToolIcon } from './ToolIcons'

interface Props {
  current: ToolMeta
}

export default function ContextBar({ current }: Props) {
  const siblings = toolsInGroup(current.group)
  if (siblings.length <= 1) return null

  const meta = GROUP_META[current.group]

  return (
    <nav className="context-bar" aria-label={`${current.group} tools`}>
      <span className="context-bar-label" data-group={current.group}>
        <span className="context-bar-dot" aria-hidden="true" />
        {meta.label}
      </span>
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
