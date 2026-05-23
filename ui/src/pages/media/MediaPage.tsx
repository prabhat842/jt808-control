import { useTerminals, useMediaSessions, useStartLive, useStopLive } from '../../api/hooks'
import { useConfig } from '../../api/config'
import { useState } from 'react'

const STREAM_TYPES = [
  { value: 0, label: 'Video' },
  { value: 2, label: 'Two-way Intercom' },
  { value: 4, label: 'Broadcast' },
]

function idMatches(jt808Id: string, rtvsId: string) {
  return jt808Id === rtvsId || jt808Id.endsWith(rtvsId) || rtvsId.endsWith(jt808Id)
}

export default function MediaPage() {
  const config = useConfig()
  const { data: terminals = [] } = useTerminals()
  const { data: sessions  = [] } = useMediaSessions()
  const startLive = useStartLive()
  const stopLive  = useStopLive()

  const [terminal,   setTerminal]   = useState('')
  const [channel,    setChannel]    = useState(1)
  const [streamType, setStreamType] = useState(0)

  const activeSession = sessions.find(
    s => idMatches(terminal, s.terminalId) && s.channelId === channel && s.active
  )

  const sel = {
    background: 'var(--surface-1)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--foreground)',
    fontFamily: 'var(--ff-mono)',
    fontSize: '12px',
    padding: '6px 10px',
    outline: 'none',
  } as React.CSSProperties

  return (
    <div className="flex h-full" style={{ background: 'var(--background)' }}>
      {/* Left: stream controls */}
      <div
        className="w-72 flex-shrink-0 flex flex-col overflow-y-auto"
        style={{ borderRight: '1px solid var(--border)', background: 'rgba(9,17,23,0.97)' }}
      >
        <div className="p-4 space-y-4">
          <div>
            <div className="eyebrow text-[9px] mb-1">Streaming</div>
            <div className="font-display text-sm font-semibold" style={{ color: 'var(--foreground-strong)' }}>
              Media Control
            </div>
          </div>

          <div className="surface-panel-quiet p-3 space-y-3">
            <div className="eyebrow text-[9px]">Start Stream</div>
            <select value={terminal} onChange={e => setTerminal(e.target.value)} style={{ ...sel, width: '100%' }}>
              <option value="">Select terminal…</option>
              {terminals.map(t => (
                <option key={t.terminalId} value={t.terminalId}>
                  {t.terminalId}{t.plateNumber ? ` — ${t.plateNumber}` : ''}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <select value={channel} onChange={e => setChannel(Number(e.target.value))} style={{ ...sel, flex: 1 }}>
                {[1,2,3,4,5,6,7,8].map(c => <option key={c} value={c}>Ch {c}</option>)}
              </select>
              <select value={streamType} onChange={e => setStreamType(Number(e.target.value))} style={{ ...sel, flex: 2 }}>
                {STREAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => startLive.mutate({ terminal, channel, type: streamType })}
                disabled={!terminal || startLive.isPending}>▶ Start</button>
              <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => stopLive.mutate({ terminal, channel })}
                disabled={!terminal || stopLive.isPending}>■ Stop</button>
            </div>
            {activeSession && (
              <div className="font-mono text-[10px] px-2 py-1.5"
                style={{ background: 'var(--status-ok-soft)', border: '1px solid var(--status-ok-border)', borderRadius: 'var(--radius-sm)', color: 'var(--status-ok)' }}>
                ● {activeSession.frames.toLocaleString()} frames · {(activeSession.bytes / 1024).toFixed(1)} KB
              </div>
            )}
          </div>

          <div>
            <div className="eyebrow text-[9px] mb-2">Active Sessions</div>
            {sessions.length === 0
              ? <div className="font-mono text-[11px]" style={{ color: 'var(--muted)' }}>No active sessions</div>
              : sessions.map(s => {
                const fullTerminal = terminals.find(t => idMatches(t.terminalId, s.terminalId))?.terminalId ?? s.terminalId
                return (
                <div key={`${s.terminalId}-${s.channelId}`} className="surface-panel-quiet px-3 py-2 mb-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px]" style={{ color: 'var(--electric)' }}>{fullTerminal}</span>
                    <span className="font-mono text-[9px] px-1.5 py-0.5"
                      style={{ background: s.active ? 'var(--status-ok-soft)' : 'var(--surface-2)', border: `1px solid ${s.active ? 'var(--status-ok-border)' : 'var(--border)'}`, borderRadius: '4px', color: s.active ? 'var(--status-ok)' : 'var(--muted)' }}>
                      {s.active ? '● active' : '○ idle'}
                    </span>
                  </div>
                  <div className="font-mono text-[10px] mt-1" style={{ color: 'var(--muted)' }}>
                    Ch {s.channelId} · {s.frames.toLocaleString()} frames · {(s.bytes / 1024).toFixed(1)} KB
                  </div>
                  <button className="btn-secondary mt-1.5" style={{ fontSize: '10px', padding: '2px 8px' }}
                    onClick={() => stopLive.mutate({ terminal: fullTerminal, channel: s.channelId })}>■ Stop</button>
                </div>
              )})
            }
          </div>
        </div>
      </div>

      {/* Right: embedded RTVS */}
      <div className="flex-1 flex flex-col" style={{ background: '#050a10' }}>
        <div className="flex items-center justify-between px-4 py-2 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: 'var(--muted)' }}>
              RTVS Studio
            </span>
            <span className="font-mono text-[9px] px-1.5 py-0.5"
              style={{ background: 'var(--electric-soft)', border: '1px solid var(--electric-border)', borderRadius: '4px', color: 'var(--electric)' }}>
              ● live
            </span>
          </div>
          <a href={config.rtvsUrl} target="_blank" rel="noopener noreferrer"
            className="font-mono text-[10px]" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
            ↗ open full
          </a>
        </div>
        <iframe src={config.rtvsUrl} className="flex-1 w-full border-0"
          title="RTVS Studio" allow="camera; microphone; autoplay" />
      </div>
    </div>
  )
}
