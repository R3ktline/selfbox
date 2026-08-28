import { useToast } from '../lib/toast'

export default function Toasts() {
  const { toasts, dismiss } = useToast()
  if (toasts.length === 0) return null

  return (
    <div className="toast-stack" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`toast toast-${t.kind}`}
          onClick={() => dismiss(t.id)}
        >
          <span className="toast-dot" />
          <span>{t.message}</span>
        </button>
      ))}
    </div>
  )
}
