import type { ResolvedTheme, ThemeMode } from '../lib/theme'

interface Props {
  themeMode: ThemeMode
  resolvedTheme: ResolvedTheme
  onChange: () => void
}

export default function ThemeToggle({ themeMode, resolvedTheme, onChange }: Props) {
  const isDark = resolvedTheme === 'dark'
  const followingSystem = themeMode === 'system'

  return (
    <button
      type="button"
      className={'theme-toggle' + (followingSystem ? ' theme-toggle-system' : '')}
      onClick={onChange}
      aria-label={
        followingSystem
          ? `Using system theme (${resolvedTheme}). Click to switch to ${isDark ? 'light' : 'dark'} mode`
          : isDark
            ? 'Switch to light mode'
            : 'Switch to dark mode'
      }
      title={
        followingSystem
          ? `System · ${resolvedTheme}`
          : isDark
            ? 'Switch to light mode'
            : 'Switch to dark mode'
      }
    >
      {isDark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="M4.93 4.93l1.41 1.41" />
          <path d="M17.66 17.66l1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="M4.93 19.07l1.41-1.41" />
          <path d="M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  )
}
