import { useState, type ReactNode } from 'react'

interface Props {
  value: unknown
  name?: string
  depth?: number
}

export default function JsonTree({ value, name, depth = 0 }: Props) {
  if (value === null) return <TreeLeaf name={name} value="null" depth={depth} />
  if (value === undefined) return <TreeLeaf name={name} value="undefined" depth={depth} />
  if (typeof value === 'boolean' || typeof value === 'number') {
    return <TreeLeaf name={name} value={String(value)} depth={depth} className="json-primitive" />
  }
  if (typeof value === 'string') {
    return <TreeLeaf name={name} value={JSON.stringify(value)} depth={depth} className="json-string" />
  }
  if (Array.isArray(value)) {
    return <TreeBranch name={name} label={`Array(${value.length})`} depth={depth} defaultOpen={depth < 2}>
      {value.map((item, i) => (
        <JsonTree key={i} name={String(i)} value={item} depth={depth + 1} />
      ))}
    </TreeBranch>
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    return (
      <TreeBranch name={name} label={`Object(${entries.length})`} depth={depth} defaultOpen={depth < 2}>
        {entries.map(([k, v]) => (
          <JsonTree key={k} name={k} value={v} depth={depth + 1} />
        ))}
      </TreeBranch>
    )
  }
  return <TreeLeaf name={name} value={String(value)} depth={depth} />
}

function TreeBranch({
  name,
  label,
  depth,
  defaultOpen,
  children,
}: {
  name?: string
  label: string
  depth: number
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  return (
    <div className="json-tree-node" style={{ paddingLeft: depth * 14 }}>
      <button type="button" className="json-tree-toggle" onClick={() => setOpen((o) => !o)}>
        <span className="json-tree-caret">{open ? '▾' : '▸'}</span>
        {name !== undefined && <span className="json-tree-key">{name}: </span>}
        <span className="json-tree-meta">{label}</span>
      </button>
      {open && <div className="json-tree-children">{children}</div>}
    </div>
  )
}

function TreeLeaf({
  name,
  value,
  depth,
  className,
}: {
  name?: string
  value: string
  depth: number
  className?: string
}) {
  return (
    <div className="json-tree-leaf" style={{ paddingLeft: depth * 14 + 18 }}>
      {name !== undefined && <span className="json-tree-key">{name}: </span>}
      <span className={className ?? 'json-primitive'}>{value}</span>
    </div>
  )
}
