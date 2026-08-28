export type CaseStyle =
  | 'lower'
  | 'upper'
  | 'title'
  | 'sentence'
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'screaming'
  | 'kebab'
  | 'constant'

function wordsFrom(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

export function convertCase(text: string, style: CaseStyle): string {
  const words = wordsFrom(text)
  if (words.length === 0) return ''
  const lower = words.map((w) => w.toLowerCase())
  switch (style) {
    case 'lower':
      return lower.join(' ')
    case 'upper':
      return lower.join(' ').toUpperCase()
    case 'title':
      return lower.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    case 'sentence':
      return lower.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ')
    case 'camel':
      return lower.map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))).join('')
    case 'pascal':
      return lower.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
    case 'snake':
      return lower.join('_')
    case 'screaming':
      return lower.join('_').toUpperCase()
    case 'kebab':
      return lower.join('-')
    case 'constant':
      return lower.join('_').toUpperCase()
    default:
      return text
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function slugify(text: string, separator = '-'): string {
  const sep = escapeRegExp(separator)
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, separator)
    .replace(new RegExp(`${sep}+`, 'g'), separator)
    .replace(new RegExp(`^${sep}|${sep}$`, 'g'), '')
}

export interface RegexMatch {
  index: number
  match: string
  groups: string[]
}

export function testRegex(pattern: string, flags: string, input: string): { matches: RegexMatch[]; error: string | null } {
  try {
    const re = new RegExp(pattern, flags)
    const matches: RegexMatch[] = []
    if (flags.includes('g')) {
      let m: RegExpExecArray | null
      while ((m = re.exec(input)) !== null) {
        matches.push({ index: m.index, match: m[0], groups: m.slice(1) })
        if (m[0].length === 0) re.lastIndex++
      }
    } else {
      const m = re.exec(input)
      if (m) matches.push({ index: m.index, match: m[0], groups: m.slice(1) })
    }
    return { matches, error: null }
  } catch (e) {
    return { matches: [], error: (e as Error).message }
  }
}

export function regexReplace(pattern: string, flags: string, input: string, replacement: string): { output: string; error: string | null } {
  try {
    const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g')
    return { output: input.replace(re, replacement), error: null }
  } catch (e) {
    return { output: '', error: (e as Error).message }
  }
}

export function highlightRegexMatches(input: string, matches: RegexMatch[]): string {
  if (!matches.length) return escapeHtml(input)
  const sorted = [...matches].sort((a, b) => a.index - b.index)
  let html = ''
  let last = 0
  for (const m of sorted) {
    html += escapeHtml(input.slice(last, m.index))
    html += `<mark class="regex-mark">${escapeHtml(m.match)}</mark>`
    last = m.index + m.match.length
  }
  html += escapeHtml(input.slice(last))
  return html.replace(/\n/g, '<br>')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
