import { useEffect } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

export type MediaKind = 'image' | 'video'

export interface MediaModalItem {
  key: string
  fileName: string
  src: string
  kind: MediaKind
  title: string
  subtitle?: string
}

export default function AlarmMediaModal({
  open,
  items,
  index,
  onClose,
  onSelectIndex,
}: {
  open: boolean
  items: MediaModalItem[]
  index: number
  onClose: () => void
  onSelectIndex: (index: number) => void
}) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') onSelectIndex(Math.max(0, index - 1))
      if (event.key === 'ArrowRight') onSelectIndex(Math.min(items.length - 1, index + 1))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [index, items.length, onClose, onSelectIndex, open])

  if (!open || items.length === 0 || index < 0 || index >= items.length) return null

  const item = items[index]

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(3, 7, 12, 0.86)',
        display: 'grid',
        placeItems: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(1180px, 96vw)',
          maxHeight: '92vh',
          background: 'rgba(9,17,23,0.98)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          overflow: 'hidden',
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr) auto',
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--border)]">
          <div>
            <div className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>{item.title}</div>
            <div className="font-mono text-[11px] mt-0.5" style={{ color: 'var(--foreground-strong)' }}>{item.fileName}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            style={{ padding: '4px 8px', fontSize: '11px' }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="min-h-0 grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px' }}>
          <div className="min-h-0 flex items-center justify-center bg-[#050a10] p-4">
            {item.kind === 'image' ? (
              <img src={item.src} alt={item.fileName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ) : (
              <video src={item.src} controls autoPlay playsInline style={{ maxWidth: '100%', maxHeight: '100%' }} />
            )}
          </div>

          <div className="border-l border-[color:var(--border)] p-3 overflow-auto">
            <div className="flex items-center justify-between gap-2 mb-3">
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '4px 8px', fontSize: '11px' }}
                onClick={() => onSelectIndex(Math.max(0, index - 1))}
                disabled={index <= 0}
              >
                <ChevronLeft size={14} />
              </button>
              <div className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
                {index + 1} / {items.length}
              </div>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '4px 8px', fontSize: '11px' }}
                onClick={() => onSelectIndex(Math.min(items.length - 1, index + 1))}
                disabled={index >= items.length - 1}
              >
                <ChevronRight size={14} />
              </button>
            </div>

            <div className="space-y-2">
              {items.map((entry, i) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => onSelectIndex(i)}
                  className="w-full text-left surface-panel-quiet px-3 py-2"
                  style={{
                    borderColor: i === index ? 'var(--electric-border)' : 'var(--border)',
                    color: 'inherit',
                  }}
                >
                  <div className="font-mono text-[11px]" style={{ color: 'var(--foreground-strong)' }}>
                    {entry.title}
                  </div>
                  <div className="font-mono text-[10px] mt-1" style={{ color: 'var(--muted)' }}>
                    {entry.fileName}{entry.subtitle ? ` · ${entry.subtitle}` : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
