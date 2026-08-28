import { PdfToolView } from '../PdfTools'

export default function PdfPagesTool() {
  return (
    <PdfToolView
      variant="pages"
      title="Page Edit"
      hint="Add PDFs, arrange pages, and download one file. Drag to reorder, click to exclude, rotate with ↺ ↻."
    />
  )
}
