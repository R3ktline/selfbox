export function strToB64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

export function b64ToStr(s: string): string {
  const bin = atob(normalizeB64(s))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function b64ToHex(s: string): string {
  const bin = atob(normalizeB64(s))
  const out: string[] = []
  for (let i = 0; i < bin.length; i++) out.push(bin.charCodeAt(i).toString(16).padStart(2, '0'))
  return out.join('')
}

export function hexToB64(s: string): string {
  const clean = s.replace(/^0x/, '').replace(/\s+/g, '').toLowerCase()
  if (!/^[0-9a-f]*$/.test(clean) || clean.length % 2 !== 0) throw new Error('Invalid hex')
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16)
  return bytesToB64(bytes)
}

export function bytesToB64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

export function normalizeB64(s: string): string {
  return s.trim().replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.trim().length / 4) * 4, '=')
}

export function toUrlSafeB64(s: string): string {
  return strToB64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromUrlSafeB64(s: string): string {
  return b64ToStr(normalizeB64(s))
}

export function wrapB64Lines(s: string, width = 76): string {
  const chunks: string[] = []
  for (let i = 0; i < s.length; i += width) chunks.push(s.slice(i, i + width))
  return chunks.join('\n')
}

export async function fileToB64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  return bytesToB64(new Uint8Array(buf))
}
