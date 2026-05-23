import { useState, useCallback } from 'react'
import { useAlarmClips, useClipSse } from '../../api/hooks'
import type { AlarmClip } from '../../types'

const FORMAT: Record<number, string> = { 0:'JPEG', 1:'TIF', 2:'MP3', 3:'WAV', 4:'WMV' }

export default function AlarmsPage() {
  const { data: initial = [] } = useAlarmClips()
  const [live, setLive]        = useState<AlarmClip[]>([])
  const [selected, setSelected] = useState<AlarmClip | null>(null)

  const onClip = useCallback((clip: AlarmClip) => {
    setLive(prev => [clip, ...prev].slice(0, 200))
  }, [])
  useClipSse(onClip)

  const seen = new Set<string>()
  const clips = [...live, ...initial].filter(c => {
    if (seen.has(c.id)) return false
    seen.add(c.id); return true
  })

  return (
    <div className="flex h-full" style={{ background: 'var(--background)' }}>
      {/* Main */}
      <div className="flex-1 p-6 overflow-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="eyebrow text-[9px] mb-1">Real-time Feed</div>
            <h1 className="font-display text-xl font-semibold" style={{ color: 'var(--foreground-strong)' }}>
              Alarm Media
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="status-dot">
              <span className="status-dot-inner" style={{ background: 'var(--electric)', color: 'var(--electric)' }} />
            </span>
            <span className="font-mono text-[11px]" style={{ color: 'var(--muted-strong)' }}>
              {clips.length} clips · live
            </span>
          </div>
        </div>

        <div className="surface-panel overflow-hidden">
          {clips.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <div className="text-3xl mb-3 opacity-20">◉</div>
              <div className="font-mono text-[12px]" style={{ color: 'var(--muted)' }}>
                No alarm clips received yet
              </div>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Time', 'Terminal', 'Alarm', 'Media', 'Ch', 'Size', ''].map(h => (
                    <th
                      key={h}
                      className="text-left px-5 py-3 font-mono text-[10px] uppercase tracking-[0.2em]"
                      style={{ color: 'var(--muted)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clips.map((c, i) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className="cursor-pointer transition-colors"
                    style={{ borderBottom: i < clips.length - 1 ? '1px solid var(--border)' : 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-1)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-5 py-2.5 font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
                      {new Date(c.receivedAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-[11px]" style={{ color: 'var(--electric)' }}>
                      {c.terminalId}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className="font-mono text-[10px] px-2 py-0.5"
                        style={{
                          background: 'rgba(251,146,60,0.10)',
                          border: '1px solid rgba(251,146,60,0.25)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--status-warn)',
                        }}
                      >
                        {c.alarmTypeName}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-[11px]" style={{ color: 'var(--muted-strong)' }}>
                      {c.mediaTypeName} · {FORMAT[c.formatCode] ?? c.formatCode}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
                      {c.channelId}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
                      {c.payloadSize > 0 ? `${c.payloadSize} B` : '—'}
                    </td>
                    <td className="py-2.5 pr-5">
                      {c.fileName && (
                        <a
                          href={`/media/clips/${c.fileName}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="font-mono text-[11px] transition-colors"
                          style={{ color: 'var(--electric)' }}
                        >
                          ↓ File
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div
          className="w-72 flex flex-col overflow-y-auto"
          style={{
            borderLeft: '1px solid var(--border)',
            background: 'rgba(9,17,23,0.97)',
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <span className="font-display text-sm font-medium" style={{ color: 'var(--foreground-strong)' }}>
              Clip Detail
            </span>
            <button
              onClick={() => setSelected(null)}
              className="font-mono text-lg transition-colors"
              style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              ×
            </button>
          </div>

          <div className="p-4 space-y-3">
            <div className="surface-panel-quiet p-3 space-y-2.5">
              {([
                ['ID',       selected.id.slice(0, 8) + '…'],
                ['Terminal', selected.terminalId],
                ['Alarm',    selected.alarmTypeName],
                ['Media',    `${selected.mediaTypeName} / ${FORMAT[selected.formatCode] ?? selected.formatCode}`],
                ['Channel',  String(selected.channelId)],
                ['Location', `${selected.lat.toFixed(4)}, ${selected.lon.toFixed(4)}`],
                ['Speed',    `${selected.speedKmh} km/h`],
                ['Received', new Date(selected.receivedAt).toLocaleString()],
                ['Size',     selected.payloadSize > 0 ? `${selected.payloadSize} B` : 'no payload'],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label}>
                  <div className="eyebrow text-[9px]">{label}</div>
                  <div className="font-mono text-[11px] mt-0.5 break-all" style={{ color: 'var(--foreground-strong)' }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {selected.fileName && (
              <a
                href={`/media/clips/${selected.fileName}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full justify-center"
              >
                ↓ Download file
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
