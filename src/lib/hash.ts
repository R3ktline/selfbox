export async function digestText(algorithm: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512', text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest(algorithm, data)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function digestFile(algorithm: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512', file: File): Promise<string> {
  const data = await file.arrayBuffer()
  const hash = await crypto.subtle.digest(algorithm, data)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function uuidV4(): string {
  return crypto.randomUUID()
}

const NANOID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-'

export function nanoid(size = 21): string {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  let id = ''
  for (let i = 0; i < size; i++) id += NANOID_ALPHABET[bytes[i] % NANOID_ALPHABET.length]
  return id
}

export function uuidBatch(count: number, style: 'v4' | 'nanoid'): string[] {
  return Array.from({ length: count }, () => (style === 'v4' ? uuidV4() : nanoid()))
}
