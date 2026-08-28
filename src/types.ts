export type ContentType =
  | 'url'
  | 'text'
  | 'wifi'
  | 'vcard'
  | 'email'
  | 'tel'
  | 'sms'
  | 'geo'

export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H'

export type DotStyle = 'square' | ' ' | 'rounded' | 'dots' | 'classy' | 'classy-rounded' | 'extra-rounded'

export type CornerStyle = 'square' | 'dot' | 'extra-rounded'

export type DownloadFormat = 'png' | 'svg' | 'jpeg' | 'webp'

export interface UrlContent {
  type: 'url'
  url: string
}

export interface TextContent {
  type: 'text'
  text: string
}

export interface WifiContent {
  type: 'wifi'
  ssid: string
  password: string
  security: 'WPA' | 'WEP' | 'nopass'
  hidden: boolean
}

export interface VCardContent {
  type: 'vcard'
  firstName: string
  lastName: string
  org: string
  title: string
  phone: string
  email: string
  url: string
  address: string
}

export interface EmailContent {
  type: 'email'
  email: string
  subject: string
  body: string
}

export interface TelContent {
  type: 'tel'
  phone: string
}

export interface SmsContent {
  type: 'sms'
  phone: string
  body: string
}

export interface GeoContent {
  type: 'geo'
  lat: number | string
  lng: number | string
}

export type Content =
  | UrlContent
  | TextContent
  | WifiContent
  | VCardContent
  | EmailContent
  | TelContent
  | SmsContent
  | GeoContent

export interface StyleOptions {
  fgColor: string
  bgColor: string
  useGradient: boolean
  gradientColor: string
  gradientType: 'linear' | 'radial'
  dotStyle: DotStyle
  cornerSquareStyle: CornerStyle
  cornerDotStyle: CornerStyle
  errorCorrectionLevel: ErrorCorrectionLevel
  margin: number
  width: number
  downloadSize: number
}

export interface LogoOptions {
  dataUrl: string | null
  size: number
  margin: number
  hideBackgroundDots: boolean
  cornerRadius: number
  opacity: number
}

export interface Preset {
  id: string
  name: string
  style: StyleOptions
  logo: LogoOptions
  createdAt: number
}

export interface HistoryEntry {
  id: string
  createdAt: number
  content: Content
  style: StyleOptions
  logo: LogoOptions
}
