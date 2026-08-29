import { useEffect } from 'react'
import { takePendingFiles } from './fileStore'

export function usePendingFiles(path: string, handler: (files: File[]) => void): void {
  useEffect(() => {
    const files = takePendingFiles(path)
    if (files?.length) handler(files)
    // Only run on mount / path change — handler is intentionally excluded
  }, [path])
}
