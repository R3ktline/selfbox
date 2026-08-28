export function countTextStats(text: string) {
  const chars = text.length
  const charsNoSpaces = text.replace(/\s/g, '').length
  const wordList = text.trim() ? text.trim().split(/\s+/) : []
  const words = wordList.length
  const uniqueWords = new Set(wordList.map((w) => w.toLowerCase().replace(/[^a-z0-9']/gi, ''))).size
  const lines = text.length === 0 ? 0 : text.split('\n').length
  const paragraphs = text.trim() ? text.split(/\n\s*\n/).filter((p) => p.trim()).length : 0
  const sentences = text.trim() ? (text.match(/[.!?]+(\s|$)/g) ?? []).length || (words > 0 ? 1 : 0) : 0
  const readingMinutes = words / 200
  return { chars, charsNoSpaces, words, uniqueWords, lines, paragraphs, sentences, readingMinutes }
}

export function applyReplaceAll(text: string, find: string, replace: string, caseSensitive: boolean): string {
  if (!find) return text
  const flags = caseSensitive ? 'g' : 'gi'
  const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(escaped, flags), replace)
}
