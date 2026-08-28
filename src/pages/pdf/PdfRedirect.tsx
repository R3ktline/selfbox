import { useEffect } from 'react'
import { navigate } from '../../lib/router'

export default function PdfRedirect() {
  useEffect(() => {
    navigate('/pdf/pages')
  }, [])
  return <div className="page-loading">Redirecting…</div>
}
