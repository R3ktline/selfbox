import { useEffect } from 'react'
import { takePendingFiles } from './fileStore'

export function usePendingFiles(path: string, handler: (files: File[]) => void): void {
  useEffect(() => {
    const files = takePendingFiles(path)
    if (files?.length) handler(files)
    // Only run on mount / path change — handler is intentionally excluded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])
}
