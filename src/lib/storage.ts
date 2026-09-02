import type { HistoryEntry, Preset } from '../types'

const PRESETS_KEY = 'selfbox.presets.v1'
const HISTORY_KEY = 'selfbox.history.v1'
const SIGNATURE_KEY = 'selfbox.pdf.signature.v1'
const OLD_PRESETS_KEY = 'qrgen.presets.v1'
const OLD_HISTORY_KEY = 'qrgen.history.v1'
const MAX_HISTORY = 20

function migrateStorageKey(oldKey: string, newKey: string): void {
  try {
    const raw = localStorage.getItem(oldKey)
    if (raw && !localStorage.getItem(newKey)) {
      localStorage.setItem(newKey, raw)
      localStorage.removeItem(oldKey)
    }
  } catch {
    /* ignore */
  }
}

function migrateStorageKeys(): void {
  migrateStorageKey(OLD_PRESETS_KEY, PRESETS_KEY)
  migrateStorageKey(OLD_HISTORY_KEY, HISTORY_KEY)
}

function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function safeSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota or disabled — ignore */
  }
}

export function loadPresets(): Preset[] {
  migrateStorageKeys()
  return safeGet<Preset[]>(PRESETS_KEY, [])
}

export function savePresets(presets: Preset[]): void {
  safeSet(PRESETS_KEY, presets)
}

export function loadHistory(): HistoryEntry[] {
  migrateStorageKeys()
  return safeGet<HistoryEntry[]>(HISTORY_KEY, [])
}

export function saveHistory(entries: HistoryEntry[]): void {
  safeSet(HISTORY_KEY, entries.slice(0, MAX_HISTORY))
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export function loadSavedSignature(): string | null {
  try {
    const raw = localStorage.getItem(SIGNATURE_KEY)
    if (!raw) return null
    // Stored as a PNG data URL string (not JSON-wrapped) to save a little space.
    if (raw.startsWith('data:image/')) return raw
    const parsed = JSON.parse(raw) as unknown
    return typeof parsed === 'string' && parsed.startsWith('data:image/') ? parsed : null
  } catch {
    return null
  }
}

export function saveSavedSignature(dataUrl: string | null): void {
  try {
    if (!dataUrl) {
      localStorage.removeItem(SIGNATURE_KEY)
      return
    }
    localStorage.setItem(SIGNATURE_KEY, dataUrl)
  } catch {
    /* quota or disabled — ignore */
  }
}
