import { spawn } from 'node:child_process'
import { readdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface DownloadOptions {
  mode: 'video' | 'audio'
  videoQuality: string
  audioFormat: string
  audioBitrate: string
}

export interface DownloadedFile {
  name: string
  path: string
}

const YT_DLP_CANDIDATES = ['yt-dlp', 'yt-dlp.exe']

const YOUTUBE_EXTRACTOR_FALLBACKS = [
  'youtube:player_client=android,web',
  'youtube:player_client=tv_embedded,web_creator',
  'youtube:player_client=default,-tv_simply',
  'youtube:player_client=default;player_js_version=actual',
]

async function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { shell: false })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => (stdout += d))
    proc.stderr.on('data', (d) => (stderr += d))
    proc.on('error', (err) => reject(err))
    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(formatYtDlpError(stderr, stdout, code ?? undefined)))
    })
  })
}

export function formatYtDlpError(stderr: string, stdout: string, code?: number): string {
  const text = `${stderr}\n${stdout}`.trim()
  const errorLine = text.match(/^ERROR:.+$/m)?.[0] ?? text.split('\n').find((l) => l.includes('ERROR')) ?? text
  const compact = errorLine.replace(/\s+/g, ' ').trim()

  if (/403|forbidden/i.test(compact)) {
    return (
      'YouTube returned 403 Forbidden. Update yt-dlp (pip install -U yt-dlp), install Deno for JS challenges, ' +
      'then retry. If it persists, try audio-only mode. Raw: ' +
      compact.slice(0, 200)
    )
  }

  if (compact.length > 320) return compact.slice(0, 320) + '…'
  if (compact) return compact
  return `yt-dlp failed (exit ${code ?? 'unknown'})`
}

function isYoutubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be|music\.youtube\.com/i.test(url)
}

function urlsIncludeYoutube(urls: string[]): boolean {
  return urls.some(isYoutubeUrl)
}

export async function resolveYtDlp(): Promise<string | null> {
  for (const bin of YT_DLP_CANDIDATES) {
    try {
      await run(bin, ['--version'])
      return bin
    } catch {
      /* try next */
    }
  }
  return null
}

export async function getYtDlpVersion(bin: string): Promise<string> {
  const { stdout } = await run(bin, ['--version'])
  return stdout.trim().split('\n')[0]
}

export async function hasFfmpeg(): Promise<boolean> {
  try {
    await run('ffmpeg', ['-version'])
    return true
  } catch {
    return false
  }
}

export async function hasDeno(): Promise<boolean> {
  for (const bin of ['deno', 'deno.exe']) {
    try {
      await run(bin, ['--version'])
      return true
    } catch {
      /* try next */
    }
  }
  return false
}

function qualityToHeight(quality: string): number | null {
  if (quality === 'max') return null
  const n = Number(quality)
  return Number.isFinite(n) ? n : 1080
}

function buildFormatSelector(quality: string): string {
  const height = qualityToHeight(quality)
  if (!height) return 'bestvideo+bestaudio/best'
  return `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`
}

function buildBaseArgs(options: DownloadOptions, outTemplate: string): string[] {
  const args = [
    '--no-progress',
    '--restrict-filenames',
    '-o',
    outTemplate,
  ]

  if (options.mode === 'audio') {
    args.push(
      '-x',
      '--audio-format',
      options.audioFormat === 'best' ? 'best' : options.audioFormat,
      '--audio-quality',
      options.audioBitrate === 'best' ? '0' : `${options.audioBitrate}K`,
    )
  } else {
    args.push('-f', buildFormatSelector(options.videoQuality), '--merge-output-format', 'mp4')
  }

  return args
}

function isRetryableYoutubeError(message: string): boolean {
  return /403|forbidden|unable to download video data|challenge|n challenge|sign in/i.test(message)
}

async function runYtDlpDownload(bin: string, args: string[]): Promise<void> {
  await run(bin, args)
}

export async function downloadUrls(
  bin: string,
  urls: string[],
  options: DownloadOptions,
): Promise<{ files: DownloadedFile[]; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'toolbox-ytdlp-'))
  const outTemplate = join(dir, '%(playlist_index|)03d - %(title).80B.%(ext)s')
  const baseArgs = buildBaseArgs(options, outTemplate)
  const forYoutube = urlsIncludeYoutube(urls)

  const attemptArgs: string[][] = []

  if (forYoutube) {
    for (const extractorArg of YOUTUBE_EXTRACTOR_FALLBACKS) {
      attemptArgs.push([
        '--remote-components',
        'ejs:github',
        '--extractor-args',
        extractorArg,
        ...baseArgs,
        ...urls,
      ])
    }
  }

  attemptArgs.push([...baseArgs, ...urls])

  let lastError: Error | null = null
  for (const args of attemptArgs) {
    try {
      await runYtDlpDownload(bin, args)
      lastError = null
      break
    } catch (e) {
      lastError = e as Error
      if (!forYoutube || !isRetryableYoutubeError(lastError.message)) break
    }
  }

  if (lastError) {
    await rm(dir, { recursive: true, force: true })
    throw lastError
  }

  const names = await readdir(dir)
  const files = names
    .filter((n) => !n.endsWith('.part'))
    .map((name) => ({ name, path: join(dir, name) }))
    .sort((a, b) => a.name.localeCompare(b.name))

  if (files.length === 0) {
    await rm(dir, { recursive: true, force: true })
    throw new Error('yt-dlp finished but no files were produced')
  }

  const cleanup = async () => {
    await rm(dir, { recursive: true, force: true })
  }

  return { files, cleanup }
}

export async function probePlaylist(bin: string, url: string): Promise<number> {
  const args = ['--flat-playlist', '--print', 'id', url]
  if (isYoutubeUrl(url)) {
    args.unshift('--extractor-args', 'youtube:player_client=android,web')
    args.unshift('--remote-components', 'ejs:github')
  }
  const { stdout } = await run(bin, args)
  const ids = stdout.trim().split('\n').filter(Boolean)
  return ids.length
}
