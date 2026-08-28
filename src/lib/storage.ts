import type { HistoryEntry, Preset } from '../types'

const PRESETS_KEY = 'qrgen.presets.v1'
const HISTORY_KEY = 'qrgen.history.v1'
const MAX_HISTORY = 20

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
  return safeGet<Preset[]>(PRESETS_KEY, [])
}

export function savePresets(presets: Preset[]): void {
  safeSet(PRESETS_KEY, presets)
}

export function loadHistory(): HistoryEntry[] {
  return safeGet<HistoryEntry[]>(HISTORY_KEY, [])
}

export function saveHistory(entries: HistoryEntry[]): void {
  safeSet(HISTORY_KEY, entries.slice(0, MAX_HISTORY))
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
