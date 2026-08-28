import { PdfToolView } from '../PdfTools'

export default function PdfPagesTool() {
  return (
    <PdfToolView
      variant="pages"
      title="PDF Page Editor"
      hint="Add PDFs, arrange pages, and download one file. Drag to reorder, click to exclude, rotate with ↺ ↻."
    />
  )
}
