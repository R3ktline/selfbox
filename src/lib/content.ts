import type { Content } from '../types'

function esc(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/:/g, '\\:').replace(/\n/g, '\\n')
}

function escapeVcard(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

export function buildPayload(content: Content): string {
  switch (content.type) {
    case 'url':
      return content.url.trim()

    case 'text':
      return content.text

    case 'wifi': {
      const security = content.security
      const ssid = esc(content.ssid)
      const password = esc(content.password)
      const hidden = content.hidden ? 'true' : 'false'
      return `WIFI:T:${security};S:${ssid};P:${password};H:${hidden};;`
    }

    case 'vcard': {
      const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0']
      const name = `${content.lastName};${content.firstName}`
      lines.push(`N:${escapeVcard(name)}`)
      lines.push(`FN:${escapeVcard(`${content.firstName} ${content.lastName}`.trim())}`)
      if (content.org) lines.push(`ORG:${escapeVcard(content.org)}`)
      if (content.title) lines.push(`TITLE:${escapeVcard(content.title)}`)
      if (content.phone) lines.push(`TEL:${escapeVcard(content.phone)}`)
      if (content.email) lines.push(`EMAIL:${escapeVcard(content.email)}`)
      if (content.url) lines.push(`URL:${escapeVcard(content.url)}`)
      if (content.address) lines.push(`ADR:;;${escapeVcard(content.address)};;;;`)
      lines.push('END:VCARD')
      return lines.join('\r\n')
    }

    case 'email': {
      const params: string[] = []
      if (content.subject) params.push(`subject=${encodeURIComponent(content.subject)}`)
      if (content.body) params.push(`body=${encodeURIComponent(content.body)}`)
      const query = params.length ? `?${params.join('&')}` : ''
      return `mailto:${content.email}${query}`
    }

    case 'tel':
      return `tel:${content.phone.replace(/[^0-9+]/g, '')}`

    case 'sms': {
      const body = content.body ? `?body=${encodeURIComponent(content.body)}` : ''
      return `sms:${content.phone}${body}`
    }

    case 'geo':
      return `geo:${content.lat},${content.lng}`

    default:
      return ''
  }
}

export function describeContent(content: Content): string {
  switch (content.type) {
    case 'url':
      return 'URL'
    case 'text':
      return 'Text'
    case 'wifi':
      return `WiFi (${content.ssid})`
    case 'vcard':
      return `vCard (${content.firstName} ${content.lastName})`.trim()
    case 'email':
      return `Email (${content.email})`
    case 'tel':
      return `Phone (${content.phone})`
    case 'sms':
      return `SMS (${content.phone})`
    case 'geo':
      return `Geo (${content.lat}, ${content.lng})`
  }
}
