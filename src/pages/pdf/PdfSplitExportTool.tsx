import { PdfToolView } from '../PdfTools'

export default function PdfSplitExportTool() {
  return (
    <PdfToolView
      variant="export"
      title="PDF Split & Export"
      hint="Split every page, pull out selections, or save pages as images. Select pages on the right."
    />
  )
}
