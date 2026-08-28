declare module 'gifuct-js' {
  export interface GifFrame {
    dims: { top: number; left: number; width: number; height: number }
    patch?: Uint8ClampedArray
    delay?: number
    disposalType?: number
  }

  export interface ParsedGif {
    lsd: { width: number; height: number }
    frames: unknown[]
    gct: unknown
  }

  export function parseGIF(arrayBuffer: ArrayBuffer): ParsedGif
  export function decompressFrames(parsedGif: ParsedGif, buildImagePatches?: boolean): GifFrame[]
}

declare module 'gifenc' {
  export interface GifEncoder {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: { palette?: number[][]; delay?: number },
    ): void
    finish(): void
    bytes(): Uint8Array
  }

  export function GIFEncoder(): GifEncoder
  export function quantize(rgba: Uint8ClampedArray | Uint8Array, maxColors: number): number[][]
  export function applyPalette(rgba: Uint8ClampedArray | Uint8Array, palette: number[][]): Uint8Array
}
