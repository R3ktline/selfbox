import type { Connect } from 'vite'
import type { ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import {
  downloadUrls,
  getYtDlpVersion,
  hasDeno,
  hasFfmpeg,
  probePlaylist,
  resolveYtDlp,
  type DownloadOptions,
} from './ytdlp.js'
import {
  downloadSpotifyUrl,
  getSpotdlVersion,
  resolveSpotdl,
  type SpotdlInvocation,
} from './spotdl.js'

let ytDlpBin: string | null = null
let ytDlpVersion: string | null = null
let spotdlInv: SpotdlInvocation | null = null
let spotdlVersion: string | null = null
let ffmpegOk = false
let denoOk = false

async function ensureYtDlp(): Promise<string> {
  if (ytDlpBin) return ytDlpBin
  ytDlpBin = await resolveYtDlp()
  if (!ytDlpBin) throw new Error('yt-dlp not found — install it and ensure it is on PATH')
  ytDlpVersion = await getYtDlpVersion(ytDlpBin)
  ffmpegOk = await hasFfmpeg()
  denoOk = await hasDeno()
  return ytDlpBin
}

async function ensureSpotdl(): Promise<SpotdlInvocation> {
  if (spotdlInv) return spotdlInv
  spotdlInv = await resolveSpotdl()
  if (!spotdlInv) {
    throw new Error('spotDL not found — install with pip install spotdl and ensure it is on PATH')
  }
  spotdlVersion = await getSpotdlVersion(spotdlInv)
  return spotdlInv
}

async function warmHealth(): Promise<void> {
  ffmpegOk = await hasFfmpeg()
  denoOk = await hasDeno()
  const ytdlp = await resolveYtDlp()
  if (ytdlp) {
    ytDlpBin = ytdlp
    ytDlpVersion = await getYtDlpVersion(ytdlp)
  }
  const spotdl = await resolveSpotdl()
  if (spotdl) {
    spotdlInv = spotdl
    spotdlVersion = await getSpotdlVersion(spotdl)
  }
}

function isSpotifyUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    return host.includes('spotify.com')
  } catch {
    return false
  }
}

async function readBody(req: Connect.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

function safeFilename(name: string): string {
  return name.replace(/[^\w.\-() +]/g, '_')
}

async function sendFiles(
  res: ServerResponse,
  files: Array<{ name: string; path: string }>,
): Promise<void> {
  if (files.length === 1) {
    const file = files[0]
    const buf = await readFile(file.path)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(file.name)}"`)
    res.setHeader('X-File-Count', '1')
    res.end(buf)
    return
  }

  const zip = new JSZip()
  for (const file of files) {
    zip.file(file.name, await readFile(file.path))
  }
  const zipBuf = await zip.generateAsync({ type: 'nodebuffer' })
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', 'attachment; filename="downloads.zip"')
  res.setHeader('X-File-Count', String(files.length))
  res.end(zipBuf)
}

export function mediaApiMiddleware(): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith('/api/media')) return next()

    const path = url.split('?')[0]

    if (req.method === 'GET' && path === '/api/media/health') {
      try {
        await warmHealth()
        json(res, 200, {
          ok: Boolean(ytDlpBin),
          spotdlOk: Boolean(spotdlInv),
          version: ytDlpVersion,
          spotdlVersion,
          ffmpeg: ffmpegOk,
          deno: denoOk,
          binary: ytDlpBin,
          spotdlBinary: spotdlInv
            ? spotdlInv.moduleArgs.length
              ? `${spotdlInv.command} ${spotdlInv.moduleArgs.join(' ')}`
              : spotdlInv.command
            : undefined,
          error: ytDlpBin ? undefined : 'yt-dlp not found — install it and ensure it is on PATH',
        })
      } catch (e) {
        json(res, 200, { ok: false, spotdlOk: false, error: (e as Error).message })
      }
      return
    }

    if (req.method === 'POST' && path === '/api/media/probe') {
      try {
        const body = JSON.parse(await readBody(req)) as { url?: string }
        if (!body.url?.trim()) {
          json(res, 400, { error: 'url is required' })
          return
        }
        const sourceUrl = body.url.trim()
        if (isSpotifyUrl(sourceUrl)) {
          json(res, 200, { count: null, spotify: true })
          return
        }
        const bin = await ensureYtDlp()
        const count = await probePlaylist(bin, sourceUrl)
        json(res, 200, { count })
      } catch (e) {
        json(res, 500, { error: (e as Error).message })
      }
      return
    }

    if (req.method === 'POST' && path === '/api/media/download') {
      let cleanup: (() => Promise<void>) | undefined
      try {
        const body = JSON.parse(await readBody(req)) as {
          url?: string
          mode?: DownloadOptions['mode']
          videoQuality?: string
          audioFormat?: string
          audioBitrate?: string
        }

        const sourceUrl = body.url?.trim()
        if (!sourceUrl) {
          json(res, 400, { error: 'url is required' })
          return
        }

        const audioFormat = body.audioFormat ?? 'mp3'
        const audioBitrate = body.audioBitrate ?? 'best'

        if (isSpotifyUrl(sourceUrl)) {
          const inv = await ensureSpotdl()
          const { files, cleanup: c } = await downloadSpotifyUrl(inv, sourceUrl, {
            audioFormat,
            audioBitrate,
          })
          cleanup = c
          await sendFiles(res, files)
        } else {
          const bin = await ensureYtDlp()
          const options: DownloadOptions = {
            mode: body.mode === 'audio' ? 'audio' : 'video',
            videoQuality: body.videoQuality ?? '1080',
            audioFormat,
            audioBitrate,
          }
          const { files, cleanup: c } = await downloadUrls(bin, [sourceUrl], options)
          cleanup = c
          await sendFiles(res, files)
        }
      } catch (e) {
        if (!res.headersSent) json(res, 500, { error: (e as Error).message })
      } finally {
        if (cleanup) await cleanup()
      }
      return
    }

    json(res, 404, { error: 'Not found' })
  }
}
