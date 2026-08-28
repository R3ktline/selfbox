import QRCodeStyling from 'qr-code-styling'
import type { Content, DownloadFormat, LogoOptions, StyleOptions } from '../types'
import { buildPayload } from './content'

function getOptions(style: StyleOptions, logo: LogoOptions, payload: string) {
  const dotsOptions: Record<string, unknown> = { color: style.fgColor, type: style.dotStyle }
  const cornersSquareOptions: Record<string, unknown> = { color: style.fgColor, type: style.cornerSquareStyle }
  const cornersDotOptions: Record<string, unknown> = { color: style.fgColor, type: style.cornerDotStyle }
  const backgroundOptions: Record<string, unknown> = { color: style.bgColor }

  if (style.useGradient) {
    dotsOptions.gradient = {
      type: style.gradientType,
      rotation: 0,
      colorStops: [
        { offset: 0, color: style.fgColor },
        { offset: 1, color: style.gradientColor },
      ],
    }
  }

  const base: Record<string, unknown> = {
    width: style.downloadSize,
    height: style.downloadSize,
    type: 'canvas',
    data: payload,
    margin: style.margin,
    qrOptions: {
      errorCorrectionLevel: style.errorCorrectionLevel,
    },
    imageOptions: {
      hideBackgroundDots: logo.hideBackgroundDots,
      imageSize: logo.size / 100,
      margin: logo.margin,
      crossOrigin: 'anonymous',
    },
    dotsOptions,
    cornersSquareOptions,
    cornersDotOptions,
    backgroundOptions,
  }

  if (logo.dataUrl) {
    base.image = logo.dataUrl
  } else {
    base.imageOptions = { hideBackgroundDots: false, imageSize: 0, margin: 0, crossOrigin: 'anonymous' }
    delete base.image
  }

  return base
}

export function renderQR(
  container: HTMLElement,
  style: StyleOptions,
  logo: LogoOptions,
  content: Content,
): QRCodeStyling {
  const payload = buildPayload(content)
  const options = getOptions(style, logo, payload)
  container.innerHTML = ''
  const instance = new QRCodeStyling(options as never)
  instance.append(container)
  return instance
}

export async function downloadQR(
  style: StyleOptions,
  logo: LogoOptions,
  content: Content,
  format: DownloadFormat,
  filename: string,
): Promise<void> {
  const payload = buildPayload(content)
  const ext = format === 'jpeg' ? 'jpg' : format
  const options = getOptions(style, logo, payload)
  const temp = new QRCodeStyling(options as never)
  await temp.download({ name: filename, extension: ext as 'png' | 'svg' | 'jpeg' | 'webp' })
}

export async function getQRBlob(
  style: StyleOptions,
  logo: LogoOptions,
  content: Content,
  format: DownloadFormat,
): Promise<Blob> {
  const payload = buildPayload(content)
  const options = getOptions(style, logo, payload)
  const temp = new QRCodeStyling(options as never)
  const buffer = await temp.getRawData(format as 'png' | 'svg' | 'jpeg' | 'webp')
  return buffer as Blob
}
