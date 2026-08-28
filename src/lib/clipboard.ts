export async function copyBlobToClipboard(blob: Blob, type = blob.type): Promise<void> {
  if (!navigator.clipboard?.write) throw new Error('Clipboard API unavailable')
  await navigator.clipboard.write([new ClipboardItem({ [type]: blob })])
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}
