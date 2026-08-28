import { PdfToolView } from '../PdfTools'

export default function PdfFromImagesTool() {
  return (
    <PdfToolView
      variant="images"
      title="Images to PDF"
      hint="Drop images, drag to set page order, then create a PDF."
    />
  )
}
