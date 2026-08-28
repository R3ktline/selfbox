import type { ReactNode } from 'react'
import type { ToolGroup } from '../lib/tools'

export type ToolIconId =
  | 'qr'
  | 'bg-remove'
  | 'compress'
  | 'convert'
  | 'palette'
  | 'pdf'
  | 'favicon'
  | 'screenshot'
  | 'markdown'
  | 'json'
  | 'diff'
  | 'base64'
  | 'units'
  | 'media'
  | 'text'
  | 'regex'
  | 'hash'
  | 'resize'
  | 'pdf-pages'
  | 'pdf-split'
  | 'pdf-images'
  | 'pdf-ocr'
  | 'pdf-optimize'
  | 'gif'
  | 'edit'

const ICONS: Record<ToolIconId, ReactNode> = {
  qr: (
  <>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none" />
    <rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none" />
    <rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none" />
    <path d="M14 14h3v3h-3zM17 17h3v3h-3zM14 20h3" />
  </>
  ),
  'bg-remove': (
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M8 16l8-8M12 8h4v4" />
    <path d="M3 21l6-6" strokeDasharray="2 2" />
  </>
  ),
  compress: (
  <>
    <path d="M8 3H3v5M16 3h5v5M16 21h5v-5M8 21H3v-5" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
  </>
  ),
  convert: (
  <>
    <rect x="3" y="5" width="10" height="14" rx="2" />
    <path d="M14 12h7M17 9l3 3-3 3" />
  </>
  ),
  palette: (
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="8" cy="10" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="7" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="16" cy="10" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="14" cy="15" r="1.5" fill="currentColor" stroke="none" />
  </>
  ),
  pdf: (
  <>
    <path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h4" />
  </>
  ),
  favicon: (
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 9h18" />
    <circle cx="6" cy="7" r="1" fill="currentColor" stroke="none" />
    <rect x="8" y="12" width="8" height="4" rx="1" />
  </>
  ),
  screenshot: (
  <>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <rect x="5" y="7" width="14" height="10" rx="1" />
    <path d="M8 20h8" />
  </>
  ),
  markdown: (
  <>
    <path d="M4 6h16v12H4z" />
    <path d="M7 10l2 2-2 2M13 14l2-4 2 4" />
  </>
  ),
  json: (
  <>
    <path d="M8 6C6 6 5 7.5 5 9.5S6 13 8 13M16 6c2 0 3 1.5 3 3.5S18 13 16 13" />
    <path d="M10 6v12M14 6v12" />
  </>
  ),
  diff: (
  <>
    <rect x="3" y="4" width="8" height="16" rx="1" />
    <rect x="13" y="4" width="8" height="16" rx="1" />
    <path d="M7 9h1M7 13h2M16 9h2M16 15h1" />
  </>
  ),
  base64: (
  <>
    <path d="M4 8h4l2-3 2 6 2-3h4" />
    <rect x="3" y="14" width="18" height="6" rx="1" />
    <path d="M7 17h2M11 17h6" />
  </>
  ),
  units: (
  <>
    <path d="M4 20L20 4" />
    <path d="M15 4h5v5M9 20H4v-5" />
    <circle cx="12" cy="12" r="2" />
  </>
  ),
  text: (
  <>
    <path d="M4 6h16M4 12h10M4 18h14" />
    <path d="M18 10l2 2-2 2" />
  </>
  ),
  regex: (
  <>
    <path d="M4 8c2-2 4-2 6 0s4 2 6 0M4 16c2 2 4 2 6 0s4-2 6 0" />
    <circle cx="7" cy="8" r="1" fill="currentColor" stroke="none" />
    <circle cx="17" cy="16" r="1" fill="currentColor" stroke="none" />
  </>
  ),
  hash: (
  <>
    <path d="M4 9l3-1 1 4-3 1M14 9l3-1 1 4-3 1M7 5l2 14M15 5l2 14" />
  </>
  ),
  resize: (
  <>
    <rect x="4" y="6" width="16" height="12" rx="1" />
    <path d="M8 4v4M16 4v4M8 20v-4M16 20v-4M4 8h4M16 8h4M4 16h4M16 16h4" />
  </>
  ),
  'pdf-pages': (
  <>
    <path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
    <path d="M14 3v5h5" />
    <path d="M9 12h6M9 16h4" />
    <path d="M12 8v8M8 12h8" />
  </>
  ),
  'pdf-split': (
  <>
    <path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
    <path d="M14 3v5h5" />
    <path d="M12 9v10" />
    <path d="M9 12h6" />
  </>
  ),
  'pdf-images': (
  <>
    <rect x="3" y="5" width="8" height="8" rx="1" />
    <path d="M14 8h7M17 5l3 3-3 3" />
    <path d="M7 17h10a2 2 0 002-2v-6" />
  </>
  ),
  'pdf-ocr': (
  <>
    <path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
    <path d="M14 3v5h5" />
    <path d="M8 13h8M8 17h5" />
    <path d="M16 16l2 2 3-4" />
  </>
  ),
  'pdf-optimize': (
  <>
    <path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
    <path d="M14 3v5h5" />
    <path d="M9 14l2-3 2 3 2-5" />
  </>
  ),
  gif: (
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M8 10h2v2H8zM12 8h2v6h-2zM16 10h2v2h-2z" fill="currentColor" stroke="none" />
  </>
  ),
  edit: (
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M8 16l8-8M12 8h4v4" />
    <path d="M6 18h12" />
  </>
  ),
  media: (
  <>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M10 10l5 3-5 3z" fill="currentColor" stroke="none" />
    <path d="M2 9h20" />
  </>
  ),
}

const GROUP_ICONS: Record<ToolGroup, ReactNode> = {
  Design: (
  <>
    <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7L12 17.8 5.7 21l2.3-7-6-4.6h7.6z" />
  </>
  ),
  Image: (
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="8.5" cy="10" r="1.5" fill="currentColor" stroke="none" />
    <path d="M3 16l5-5 4 4 3-3 6 6" />
  </>
  ),
  PDF: (
  <>
    <path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h4" />
  </>
  ),
  Dev: (
  <>
    <path d="M8 9l-4 3 4 3M16 9l4 3-4 3" />
    <path d="M13 6l-2 12" />
  </>
  ),
  Media: (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M10 9l6 3-6 3z" fill="currentColor" stroke="none" />
  </>
  ),
}

interface IconProps {
  id: ToolIconId
  size?: number
  className?: string
}

export function ToolIcon({ id, size = 20, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[id]}
    </svg>
  )
}

interface GroupIconProps {
  group: ToolGroup
  size?: number
  className?: string
}

export function GroupIcon({ group, size = 20, className }: GroupIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {GROUP_ICONS[group]}
    </svg>
  )
}
