export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_KEY = 'selfbox.theme.v2'
export const LEGACY_THEME_KEY = 'selfbox.theme.v1'
const OLD_THEME_KEY = 'qrgen.theme.v2'
const OLD_LEGACY_THEME_KEY = 'qrgen.theme.v1'

function migrateThemeKeys(): void {
  try {
    const current = localStorage.getItem(THEME_KEY)
    const legacy = localStorage.getItem(LEGACY_THEME_KEY)
    const oldCurrent = localStorage.getItem(OLD_THEME_KEY)
    const oldLegacy = localStorage.getItem(OLD_LEGACY_THEME_KEY)

    if (!current && oldCurrent) {
      localStorage.setItem(THEME_KEY, oldCurrent)
      localStorage.removeItem(OLD_THEME_KEY)
    }
    if (!legacy && oldLegacy) {
      localStorage.setItem(LEGACY_THEME_KEY, oldLegacy)
      localStorage.removeItem(OLD_LEGACY_THEME_KEY)
    }
  } catch {
    /* ignore */
  }
}

export function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function loadThemeMode(): ThemeMode {
  try {
    migrateThemeKeys()

    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'system' || stored === 'light' || stored === 'dark') return stored

    const legacy = localStorage.getItem(LEGACY_THEME_KEY)
    if (legacy === 'light' || legacy === 'dark') return legacy

    const oldStored = localStorage.getItem(OLD_THEME_KEY)
    if (oldStored === 'system' || oldStored === 'light' || oldStored === 'dark') return oldStored

    const oldLegacy = localStorage.getItem(OLD_LEGACY_THEME_KEY)
    if (oldLegacy === 'light' || oldLegacy === 'dark') return oldLegacy
  } catch {
    /* ignore */
  }
  return 'system'
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? getSystemTheme() : mode
}

export function saveThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_KEY, mode)
  } catch {
    /* ignore */
  }
}

export function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', resolved)
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content',
    resolved === 'dark' ? '#050505' : '#f4f4f1',
  )
}

export function toggleThemeMode(mode: ThemeMode, resolved: ResolvedTheme): ThemeMode {
  if (mode === 'system') return resolved === 'dark' ? 'light' : 'dark'
  return mode === 'dark' ? 'light' : 'dark'
}
