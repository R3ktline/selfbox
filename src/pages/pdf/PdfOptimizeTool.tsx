import { PdfToolView } from '../PdfTools'

export default function PdfOptimizeTool() {
  return (
    <PdfToolView
      variant="optimize"
      title="PDF Optimize"
      hint="Select pages on the right, then compress or add a watermark."
    />
  )
}
