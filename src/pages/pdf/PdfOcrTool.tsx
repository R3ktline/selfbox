import { PdfToolView } from '../PdfTools'

export default function PdfOcrTool() {
  return (
    <PdfToolView
      variant="ocr"
      title="Extract Text from PDF"
      hint="Select pages and extract their text. Scanned pages fall back to OCR automatically."
    />
  )
}
