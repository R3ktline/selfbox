import type { Content, ContentType } from '../types'
import ContentIcon from './ContentIcon'

interface Props {
  content: Content
  onChange: (next: Content) => void
}

const PRIMARY_TYPES: { value: ContentType; label: string }[] = [
  { value: 'url', label: 'URL' },
  { value: 'wifi', label: 'WiFi' },
]

const MORE_TYPES: { value: ContentType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'tel', label: 'Phone' },
  { value: 'sms', label: 'SMS' },
  { value: 'vcard', label: 'vCard' },
  { value: 'geo', label: 'Location' },
]

export default function ContentForm({ content, onChange }: Props) {
  const setType = (type: ContentType) => {
    if (type === content.type) return
    onChange(makeDefault(type) as Content)
  }

  return (
    <div className="panel panel-content">
      <div className="content-tabs content-tabs-primary">
        {PRIMARY_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            className={'content-tab' + (content.type === t.value ? ' active' : '')}
            onClick={() => setType(t.value)}
          >
            <ContentIcon type={t.value} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div className="form-grid form-grid-content">{renderFields(content, onChange)}</div>
      <p className="content-more-types">
        Also:{' '}
        {MORE_TYPES.map((t, i) => (
          <span key={t.value}>
            {i > 0 && ' · '}
            <button
              type="button"
              className={'content-more-link' + (content.type === t.value ? ' active' : '')}
              onClick={() => setType(t.value)}
            >
              {t.label}
            </button>
          </span>
        ))}
      </p>
    </div>
  )
}

function renderFields(content: Content, onChange: (next: Content) => void) {
  const upd = (patch: Partial<Content>) =>
    onChange({ ...content, ...patch } as Content)

  switch (content.type) {
    case 'url':
      return (
        <label className="field span-2 input-hero">
          <span>URL</span>
          <input
            type="url"
            placeholder="https://example.com"
            value={content.url}
            onChange={(e) => upd({ url: e.target.value })}
            spellCheck={false}
            autoFocus
          />
        </label>
      )
    case 'text':
      return (
        <label className="field span-2 input-hero">
          <span>Text</span>
          <textarea
            rows={6}
            placeholder="Any text you want the QR code to contain"
            value={content.text}
            onChange={(e) => upd({ text: e.target.value })}
          />
        </label>
      )
    case 'wifi':
      return (
        <>
          <label className="field">
            <span>Network name (SSID)</span>
            <input
              value={content.ssid}
              onChange={(e) => upd({ ssid: e.target.value })}
              placeholder="MyWiFi"
            />
          </label>
          <label className="field">
            <span>Security</span>
            <select
              value={content.security}
              onChange={(e) => upd({ security: e.target.value as 'WPA' | 'WEP' | 'nopass' })}
            >
              <option value="WPA">WPA / WPA2</option>
              <option value="WEP">WEP</option>
              <option value="nopass">No password</option>
            </select>
          </label>
          <label className="field span-2">
            <span>Password</span>
            <input
              type="text"
              value={content.password}
              disabled={content.security === 'nopass'}
              onChange={(e) => upd({ password: e.target.value })}
              placeholder={content.security === 'nopass' ? '(no password)' : 'Network password'}
            />
          </label>
          <label className="field check span-2">
            <input
              type="checkbox"
              checked={content.hidden}
              onChange={(e) => upd({ hidden: e.target.checked })}
            />
            <span>Hidden network</span>
          </label>
        </>
      )
    case 'vcard':
      return (
        <>
          <label className="field">
            <span>First name</span>
            <input value={content.firstName} onChange={(e) => upd({ firstName: e.target.value })} />
          </label>
          <label className="field">
            <span>Last name</span>
            <input value={content.lastName} onChange={(e) => upd({ lastName: e.target.value })} />
          </label>
          <label className="field">
            <span>Phone</span>
            <input value={content.phone} onChange={(e) => upd({ phone: e.target.value })} />
          </label>
          <label className="field">
            <span>Email</span>
            <input value={content.email} onChange={(e) => upd({ email: e.target.value })} />
          </label>
          <label className="field">
            <span>Organization</span>
            <input value={content.org} onChange={(e) => upd({ org: e.target.value })} />
          </label>
          <label className="field">
            <span>Title</span>
            <input value={content.title} onChange={(e) => upd({ title: e.target.value })} />
          </label>
          <label className="field">
            <span>Website</span>
            <input value={content.url} onChange={(e) => upd({ url: e.target.value })} />
          </label>
          <label className="field">
            <span>Address</span>
            <input value={content.address} onChange={(e) => upd({ address: e.target.value })} />
          </label>
        </>
      )
    case 'email':
      return (
        <>
          <label className="field">
            <span>Email address</span>
            <input
              type="email"
              value={content.email}
              onChange={(e) => upd({ email: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Subject</span>
            <input
              value={content.subject}
              onChange={(e) => upd({ subject: e.target.value })}
            />
          </label>
          <label className="field span-2">
            <span>Body</span>
            <textarea
              rows={3}
              value={content.body}
              onChange={(e) => upd({ body: e.target.value })}
            />
          </label>
        </>
      )
    case 'tel':
      return (
        <label className="field span-2">
          <span>Phone number</span>
          <input
            value={content.phone}
            onChange={(e) => upd({ phone: e.target.value })}
            placeholder="+15551234567"
          />
        </label>
      )
    case 'sms':
      return (
        <>
          <label className="field span-2">
            <span>Phone number</span>
            <input
              value={content.phone}
              onChange={(e) => upd({ phone: e.target.value })}
              placeholder="+15551234567"
            />
          </label>
          <label className="field span-2">
            <span>Message</span>
            <textarea
              rows={4}
              value={content.body}
              onChange={(e) => upd({ body: e.target.value })}
            />
          </label>
        </>
      )
    case 'geo':
      return (
        <>
          <label className="field">
            <span>Latitude</span>
            <input
              value={String(content.lat)}
              onChange={(e) => upd({ lat: e.target.value })}
              placeholder="37.7749"
            />
          </label>
          <label className="field">
            <span>Longitude</span>
            <input
              value={String(content.lng)}
              onChange={(e) => upd({ lng: e.target.value })}
              placeholder="-122.4194"
            />
          </label>
        </>
      )
  }
}
function makeDefault(type: ContentType): unknown {
  switch (type) {
    case 'url':
      return { type, url: 'https://example.com' }
    case 'text':
      return { type, text: 'Hello, world!' }
    case 'wifi':
      return { type, ssid: '', password: '', security: 'WPA', hidden: false }
    case 'vcard':
      return {
        type,
        firstName: '',
        lastName: '',
        org: '',
        title: '',
        phone: '',
        email: '',
        url: '',
        address: '',
      }
    case 'email':
      return { type, email: '', subject: '', body: '' }
    case 'tel':
      return { type, phone: '' }
    case 'sms':
      return { type, phone: '', body: '' }
    case 'geo':
      return { type, lat: '', lng: '' }
  }
}
