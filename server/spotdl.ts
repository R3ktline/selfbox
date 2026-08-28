import { spawn } from 'node:child_process'
import { readdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DownloadedFile } from './ytdlp.js'

export interface SpotdlOptions {
  audioFormat: string
  audioBitrate: string
}

export interface SpotdlInvocation {
  command: string
  moduleArgs: string[]
}

const AUDIO_FILE_RE = /\.(mp3|flac|ogg|opus|m4a|wav)$/i
const OUTPUT_TEMPLATE = '{track-number}. {artists} - {title}.{output-ext}'

async function run(
  cmd: string,
  args: string[],
  cwd?: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { shell: false, cwd })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => (stdout += d))
    proc.stderr.on('data', (d) => (stderr += d))
    proc.on('error', (err) => reject(err))
    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(formatSpotdlError(stderr, stdout, code)))
    })
  })
}

function formatSpotdlError(stderr: string, stdout: string, code?: number | null): string {
  const text = `${stderr}\n${stdout}`.trim()
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const useful = lines.filter((l) => /error|failed|no usable/i.test(l))
  const msg = useful.join(' · ') || lines.slice(-3).join(' · ') || text
  if (msg.length > 400) return msg.slice(0, 400) + '…'
  if (msg) return msg
  return `spotDL failed (exit ${code ?? 'unknown'})`
}

function spotdlArgs(inv: SpotdlInvocation, ...rest: string[]): string[] {
  return [...inv.moduleArgs, ...rest]
}

export async function resolveSpotdl(): Promise<SpotdlInvocation | null> {
  for (const bin of ['spotdl', 'spotdl.exe']) {
    try {
      await run(bin, ['--version'])
      return { command: bin, moduleArgs: [] }
    } catch {
      /* try next */
    }
  }
  for (const py of ['py', 'python', 'python3']) {
    try {
      await run(py, ['-m', 'spotdl', '--version'])
      return { command: py, moduleArgs: ['-m', 'spotdl'] }
    } catch {
      /* try next */
    }
  }
  return null
}

export async function getSpotdlVersion(inv: SpotdlInvocation): Promise<string> {
  const { stdout } = await run(inv.command, spotdlArgs(inv, '--version'))
  return stdout.trim().split('\n')[0]
}

function mapSpotdlFormat(audioFormat: string): string {
  const fmt = audioFormat.toLowerCase()
  if (fmt === 'best' || fmt === 'mp3') return 'mp3'
  if (['flac', 'ogg', 'opus', 'm4a', 'wav'].includes(fmt)) return fmt
  return 'mp3'
}

function mapBitrate(audioBitrate: string): string {
  if (audioBitrate === 'best') return 'auto'
  const n = Number(audioBitrate)
  if (Number.isFinite(n) && n > 0) return `${n}k`
  return 'auto'
}

async function listAudioFiles(dir: string, base = dir): Promise<DownloadedFile[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: DownloadedFile[] = []
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listAudioFiles(path, base)))
    } else if (!entry.name.endsWith('.part') && AUDIO_FILE_RE.test(entry.name)) {
      const rel = path.slice(base.length + 1).replace(/\\/g, '/')
      files.push({ name: rel.includes('/') ? rel : entry.name, path })
    }
  }
  return files
}

export async function downloadSpotifyUrl(
  inv: SpotdlInvocation,
  url: string,
  options: SpotdlOptions,
): Promise<{ files: DownloadedFile[]; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'toolbox-spotdl-'))
  const format = mapSpotdlFormat(options.audioFormat)
  const bitrate = mapBitrate(options.audioBitrate)

  const args = spotdlArgs(
    inv,
    'download',
    url,
    '--output',
    OUTPUT_TEMPLATE,
    '--format',
    format,
    '--bitrate',
    bitrate,
    '--restrict',
    'ascii',
    '--print-errors',
    '--overwrite',
    'force',
  )

  await run(inv.command, args, dir)

  const files = (await listAudioFiles(dir)).sort((a, b) => a.name.localeCompare(b.name))

  if (files.length === 0) {
    await rm(dir, { recursive: true, force: true })
    throw new Error(
      'spotDL finished but no audio files were found. Check that ffmpeg and yt-dlp are installed and the Spotify link is valid.',
    )
  }

  const cleanup = async () => {
    await rm(dir, { recursive: true, force: true })
  }

  return { files, cleanup }
}
