import Typo from 'typo-js'

export interface SpellIssue {
  word: string
  index: number
  length: number
  suggestions: string[]
  context: string
}

const CUSTOM_KEY = 'toolbox-spell-custom'
const IGNORE_KEY = 'toolbox-spell-ignore'

const TECH_WORDS = new Set([
  'javascript',
  'typescript',
  'npm',
  'github',
  'gitlab',
  'api',
  'url',
  'uri',
  'http',
  'https',
  'json',
  'html',
  'css',
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'svg',
  'gif',
  'md',
  'qr',
  'ocr',
  'toolbox',
  'webpack',
  'vite',
  'react',
  'nodejs',
  'frontend',
  'backend',
  'devops',
  'localhost',
  'wifi',
  'unicode',
  'utf',
  'ascii',
  'regex',
  'yaml',
  'toml',
  'sql',
  'postgres',
  'mongodb',
  'supabase',
  'vercel',
  'netlify',
])

/** Matches words including internal apostrophes (don't, it's). */
const WORD_RE = /\b[a-zA-Z]+(?:'[a-zA-Z]+)?\b/g

let spellPromise: Promise<Typo> | null = null

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function writeSet(key: string, set: Set<string>): void {
  localStorage.setItem(key, JSON.stringify([...set]))
}

export function getCustomWords(): Set<string> {
  return readSet(CUSTOM_KEY)
}

export function getIgnoredWords(): Set<string> {
  return readSet(IGNORE_KEY)
}

export function addCustomWord(word: string): void {
  const set = getCustomWords()
  set.add(word.toLowerCase())
  writeSet(CUSTOM_KEY, set)
  spellPromise = null
}

export function removeCustomWord(word: string): void {
  const set = getCustomWords()
  set.delete(word.toLowerCase())
  writeSet(CUSTOM_KEY, set)
  spellPromise = null
}

export function ignoreWord(word: string): void {
  const set = getIgnoredWords()
  set.add(word.toLowerCase())
  writeSet(IGNORE_KEY, set)
}

export function unignoreWord(word: string): void {
  const set = getIgnoredWords()
  set.delete(word.toLowerCase())
  writeSet(IGNORE_KEY, set)
}

export async function ensureSpellDictionary(): Promise<void> {
  await loadSpell()
}

async function loadSpell(): Promise<Typo> {
  if (spellPromise) return spellPromise
  spellPromise = (async () => {
    const base = `${import.meta.env.BASE_URL}dict`
    const [affRes, dicRes] = await Promise.all([fetch(`${base}/en.aff`), fetch(`${base}/en.dic`)])
    if (!affRes.ok || !dicRes.ok) throw new Error('Failed to load spell dictionary')
    const aff = await affRes.text()
    const dic = await dicRes.text()
    const spell = new Typo('en_US', aff, dic, { platform: 'any' })
    if (!spell.check('hello') || !spell.check('the') || spell.check('zzzznotaword')) {
      throw new Error('Spell dictionary failed to load correctly')
    }
    for (const w of getCustomWords()) spell.dictionary.addWord(w)
    return spell
  })()
  return spellPromise
}

function contextSnippet(text: string, index: number, length: number, radius = 28): string {
  const start = Math.max(0, index - radius)
  const end = Math.min(text.length, index + length + radius)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return prefix + text.slice(start, end) + suffix
}

function variants(word: string): string[] {
  const lower = word.toLowerCase()
  const out = new Set<string>([word, lower])
  if (lower.length > 1) {
    out.add(lower.charAt(0).toUpperCase() + lower.slice(1))
    out.add(word.toUpperCase())
  }
  return [...out]
}

function isKnown(word: string, spell: Typo, ignored: Set<string>): boolean {
  const lower = word.toLowerCase()
  if (word.length < 2) return true
  if (/^\d+$/.test(word)) return true
  if (TECH_WORDS.has(lower)) return true
  if (ignored.has(lower)) return true
  return variants(word).some((v) => spell.check(v))
}

function suggestionsFor(word: string, spell: Typo): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of variants(word)) {
    for (const s of spell.suggest(v)) {
      const key = s.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        out.push(s)
      }
      if (out.length >= 6) return out
    }
  }
  return out
}

export async function findMisspellings(text: string, limit = 300): Promise<SpellIssue[]> {
  const spell = await loadSpell()
  const ignored = getIgnoredWords()
  const issues: SpellIssue[] = []
  const seen = new Set<string>()
  let match: RegExpExecArray | null
  WORD_RE.lastIndex = 0

  while ((match = WORD_RE.exec(text)) !== null) {
    const word = match[0]
    const key = `${match.index}:${word.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)

    if (isKnown(word, spell, ignored)) continue

    issues.push({
      word,
      index: match.index,
      length: word.length,
      suggestions: suggestionsFor(word, spell),
      context: contextSnippet(text, match.index, word.length),
    })
    if (issues.length >= limit) break
  }
  return issues
}

export function applyReplacement(text: string, index: number, length: number, replacement: string): string {
  return text.slice(0, index) + replacement + text.slice(index + length)
}

export function applyReplacements(
  text: string,
  replacements: { index: number; length: number; word: string }[],
): string {
  const sorted = [...replacements].sort((a, b) => b.index - a.index)
  let result = text
  for (const r of sorted) {
    result = result.slice(0, r.index) + r.word + result.slice(r.index + r.length)
  }
  return result
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function highlightMisspellings(text: string, issues: SpellIssue[]): string {
  if (!issues.length) return escapeHtml(text).replace(/\n/g, '<br>')
  const sorted = [...issues].sort((a, b) => a.index - b.index)
  let html = ''
  let last = 0
  for (const issue of sorted) {
    html += escapeHtml(text.slice(last, issue.index))
    html += `<mark class="spell-mark" title="Click issue in list to fix">${escapeHtml(issue.word)}</mark>`
    last = issue.index + issue.length
  }
  html += escapeHtml(text.slice(last))
  return html.replace(/\n/g, '<br>')
}
