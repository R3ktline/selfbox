import { useEffect, useState } from 'react'
import ToolPage from '../components/ToolPage'
import Dropzone from '../components/Dropzone'
import { digestFile, digestText, nanoid, uuidBatch, uuidV4 } from '../lib/hash'
import { useToast } from '../lib/toast'
import { usePendingFiles } from '../lib/usePendingFiles'

type HashAlgo = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'
type Tab = 'hash' | 'uuid'

export default function HashUuidTool() {
  const { push } = useToast()
  const [tab, setTab] = useState<Tab>('hash')
  const [algo, setAlgo] = useState<HashAlgo>('SHA-256')
  const [text, setText] = useState('Hello, world!')
  const [hash, setHash] = useState('')
  const [busy, setBusy] = useState(false)
  const [uuidStyle, setUuidStyle] = useState<'v4' | 'nanoid'>('v4')
  const [uuidCount, setUuidCount] = useState(5)
  const [uuids, setUuids] = useState<string[]>([])

  useEffect(() => {
    if (tab !== 'hash') return
    const timer = window.setTimeout(async () => {
      setBusy(true)
      try {
        setHash(await digestText(algo, text))
      } catch (e) {
        setHash('')
        push(e instanceof Error ? e.message : 'Hash failed', 'error')
      } finally {
        setBusy(false)
      }
    }, 200)
    return () => window.clearTimeout(timer)
  }, [tab, algo, text, push])

  const onFile = async (f: File) => {
    setBusy(true)
    try {
      setHash(await digestFile(algo, f))
      push(`Hashed ${f.name}`)
    } catch (e) {
      push(e instanceof Error ? e.message : 'Hash failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  usePendingFiles('/hash', (pending) => { if (pending[0]) void onFile(pending[0]) })

  const generateUuids = () => setUuids(uuidBatch(uuidCount, uuidStyle))

  return (
    <ToolPage eyebrow="Dev" title="Hash & UUID Generator" hint="SHA hashes and UUID/nanoid generation using Web Crypto — all local.">
      <section className="col left">
        <div className="panel">
          <div className="tabs" style={{ marginBottom: 12 }}>
            <button type="button" className={'tab' + (tab === 'hash' ? ' active' : '')} onClick={() => setTab('hash')}>Hash</button>
            <button type="button" className={'tab' + (tab === 'uuid' ? ' active' : '')} onClick={() => setTab('uuid')}>UUID</button>
          </div>
          {tab === 'hash' ? (
            <>
              <div className="form-grid">
                <label className="field">
                  <span>Algorithm</span>
                  <select value={algo} onChange={(e) => setAlgo(e.target.value as HashAlgo)}>
                    <option value="SHA-256">SHA-256</option>
                    <option value="SHA-384">SHA-384</option>
                    <option value="SHA-512">SHA-512</option>
                    <option value="SHA-1">SHA-1</option>
                  </select>
                </label>
              </div>
              <label className="field" style={{ marginTop: 10 }}>
                <span>Text input</span>
                <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 120, fontFamily: 'var(--font-mono)' }} />
              </label>
              <Dropzone label="Or hash a file" onFiles={(files) => { const f = files[0]; if (f) onFile(f) }} />
            </>
          ) : (
            <div className="form-grid">
              <label className="field">
                <span>Style</span>
                <select value={uuidStyle} onChange={(e) => setUuidStyle(e.target.value as 'v4' | 'nanoid')}>
                  <option value="v4">UUID v4</option>
                  <option value="nanoid">Nanoid</option>
                </select>
              </label>
              <label className="field">
                <span>Count ({uuidCount})</span>
                <input type="range" min={1} max={50} value={uuidCount} onChange={(e) => setUuidCount(Number(e.target.value))} />
              </label>
              <button type="button" className="btn primary span-2" onClick={generateUuids}>Generate</button>
            </div>
          )}
        </div>
      </section>
      <section className="col right">
        <div className="panel">
          {tab === 'hash' ? (
            <>
              <div className="panel-header">
                <h2>Digest {busy && <span className="meta">· computing…</span>}</h2>
                {hash && (
                  <button type="button" className="btn" onClick={() => navigator.clipboard.writeText(hash).then(() => push('Copied'))}>
                    Copy
                  </button>
                )}
              </div>
              <pre className="json-output">{hash || '// Enter text or drop a file'}</pre>
            </>
          ) : (
            <>
              <div className="panel-header">
                <h2>Generated IDs</h2>
                {uuids.length > 0 && (
                  <button type="button" className="btn" onClick={() => navigator.clipboard.writeText(uuids.join('\n')).then(() => push('Copied'))}>
                    Copy all
                  </button>
                )}
              </div>
              {uuids.length === 0 ? (
                <p className="hint">Click Generate to create IDs.</p>
              ) : (
                <ul className="uuid-list">
                  {uuids.map((id) => (
                    <li key={id}>
                      <code>{id}</code>
                      <button type="button" className="btn-link" onClick={() => navigator.clipboard.writeText(id).then(() => push('Copied'))}>Copy</button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => { setUuids([uuidStyle === 'v4' ? uuidV4() : nanoid()]); push('Generated one') }}>
                Quick single ID
              </button>
            </>
          )}
        </div>
      </section>
    </ToolPage>
  )
}
