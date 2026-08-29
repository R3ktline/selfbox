import type { LogoOptions } from '../types'
import { useClipboardPaste } from '../lib/useClipboardPaste'

interface Props {
  logo: LogoOptions
  onChange: (next: LogoOptions) => void
}

export default function LogoUploader({ logo, onChange }: Props) {
  const upd = (patch: Partial<LogoOptions>) =>
    onChange({ ...logo, ...patch })

  const applyFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      upd({ dataUrl: String(reader.result) })
    }
    reader.readAsDataURL(file)
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    applyFile(file)
  }

  useClipboardPaste(
    (files) => {
      const f = files[0]
      if (f) applyFile(f)
    },
    { accept: 'image/*', multiple: false },
  )

  return (
    <div className="panel panel-logo">
      <h2 className="panel-inline-title">Logo</h2>
      <p className="panel-hint">Optional center image. Upload or paste (Ctrl/⌘+V).</p>
      <div className="logo-row">
        <label className="upload-btn">
          <input type="file" accept="image/*" onChange={onFile} hidden />
          {logo.dataUrl ? 'Change image' : 'Upload image'}
        </label>
        {logo.dataUrl && (
          <button type="button" className="btn-link" onClick={() => upd({ dataUrl: null })}>
            Remove
          </button>
        )}
      </div>
      {logo.dataUrl && (
        <>
          <div className="logo-preview">
            <img src={logo.dataUrl} alt="logo preview" />
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Size ({logo.size}%)</span>
              <input
                type="range"
                min={5}
                max={40}
                value={logo.size}
                onChange={(e) => upd({ size: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>Margin ({logo.margin} modules)</span>
              <input
                type="range"
                min={0}
                max={10}
                value={logo.margin}
                onChange={(e) => upd({ margin: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>Corner radius ({logo.cornerRadius}px)</span>
              <input
                type="range"
                min={0}
                max={50}
                value={logo.cornerRadius}
                onChange={(e) => upd({ cornerRadius: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>Opacity ({Math.round(logo.opacity * 100)}%)</span>
              <input
                type="range"
                min={10}
                max={100}
                value={Math.round(logo.opacity * 100)}
                onChange={(e) => upd({ opacity: Number(e.target.value) / 100 })}
              />
            </label>
            <label className="field check span-2">
              <input
                type="checkbox"
                checked={logo.hideBackgroundDots}
                onChange={(e) => upd({ hideBackgroundDots: e.target.checked })}
              />
              <span>Hide dots behind logo (excavation)</span>
            </label>
          </div>
        </>
      )}
      {!logo.dataUrl && (
        <p className="hint">No logo — the center area is fully scannable.</p>
      )}
    </div>
  )
}
