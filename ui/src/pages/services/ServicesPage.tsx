import { useState, useEffect, useRef } from 'react'
import { useServices, useStartService, useStopService, useStartAll, useStopAll } from '../../api/hooks'
import type { ServiceStatus } from '../../types'

const GROUP_ORDER = ['vehicle', 'infrastructure']
const GROUP_LABELS: Record<string, string> = {
  vehicle: 'Vehicle Terminal',
  infrastructure: 'Infrastructure',
}

export default function ServicesPage() {
  const { data: services = [] } = useServices()
  const startService = useStartService()
  const stopService  = useStopService()
  const startAll     = useStartAll()
  const stopAll      = useStopAll()

  const [logTarget, setLogTarget] = useState<string | null>(null)

  const grouped = GROUP_ORDER.map(group => ({
    group,
    items: services
      .filter(s => s.group === group)
      .sort((a, b) => a.displayOrder - b.displayOrder),
  })).filter(g => g.items.length > 0)

  const runningCount = services.filter(s => s.running).length

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="eyebrow text-[9px] mb-1">Orchestration</div>
          <h1 className="font-display text-xl font-semibold" style={{ color: 'var(--foreground-strong)' }}>
            Services
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
            {runningCount}/{services.length} running
          </span>
          <button className="btn-primary" onClick={() => startAll.mutate()} disabled={startAll.isPending}>
            ▶ Start all
          </button>
          <button className="btn-secondary" onClick={() => stopAll.mutate()} disabled={stopAll.isPending}>
            ■ Stop all
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {grouped.map(({ group, items }) => (
          <div key={group}>
            <div className="eyebrow text-[9px] mb-2">{GROUP_LABELS[group] ?? group}</div>
            <div className="surface-panel overflow-hidden">
              {items.map((svc, i) => (
                <div
                  key={svc.id}
                  style={{ borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none' }}
                >
                  <ServiceRow
                    svc={svc}
                    onStart={() => startService.mutate(svc.id)}
                    onStop={() => stopService.mutate(svc.id)}
                    onLogs={() => setLogTarget(logTarget === svc.id ? null : svc.id)}
                    showLogs={logTarget === svc.id}
                  />
                  {logTarget === svc.id && <LogPanel serviceId={svc.id} />}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ServiceRow({ svc, onStart, onStop, onLogs, showLogs }: {
  svc: ServiceStatus
  onStart: () => void
  onStop: () => void
  onLogs: () => void
  showLogs: boolean
}) {
  return (
    <div className="flex items-center gap-4 px-5 py-3">
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="status-dot">
          <span
            className="status-dot-inner"
            style={{
              background: svc.running ? 'var(--status-ok)' : 'var(--muted)',
              color: svc.running ? 'var(--status-ok)' : 'var(--muted)',
            }}
          />
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-display text-sm font-medium" style={{ color: 'var(--foreground-strong)' }}>
          {svc.name}
        </div>
        <div className="font-mono text-[10px] mt-0.5 truncate" style={{ color: 'var(--muted)' }}>
          {svc.description}
        </div>
      </div>

      <div className="font-mono text-[10px] flex-shrink-0 text-right" style={{ color: 'var(--muted)' }}>
        {svc.running && svc.pid != null && <div>PID {svc.pid}</div>}
        {svc.running && svc.startedAt && (
          <div>{new Date(svc.startedAt).toLocaleTimeString()}</div>
        )}
        {!svc.running && svc.exitCode != null && (
          <div style={{ color: svc.exitCode === 0 ? 'var(--muted)' : 'var(--status-warn)' }}>
            exit {svc.exitCode}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {svc.running ? (
          <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '11px' }} onClick={onStop}>
            ■ Stop
          </button>
        ) : (
          <button className="btn-primary" style={{ padding: '4px 12px', fontSize: '11px' }} onClick={onStart}>
            ▶ Start
          </button>
        )}
        <button
          className="btn-secondary"
          style={{ padding: '4px 10px', fontSize: '11px', borderColor: showLogs ? 'var(--electric-border)' : undefined, color: showLogs ? 'var(--electric)' : undefined }}
          onClick={onLogs}
        >
          ≡ Logs
        </button>
      </div>
    </div>
  )
}

function LogPanel({ serviceId }: { serviceId: string }) {
  const logRef = useRef<HTMLDivElement>(null)
  const [lines, setLines] = useState<string[]>([])

  useEffect(() => {
    setLines([])
    const es = new EventSource(`/api/logs/${serviceId}`)
    es.onmessage = e => {
      setLines(prev => {
        const next = [...prev, e.data].slice(-300)
        return next
      })
    }
    return () => es.close()
  }, [serviceId])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [lines])

  return (
    <div
      ref={logRef}
      className="font-mono text-[11px] px-5 py-3 overflow-y-auto"
      style={{
        background: 'rgba(5,10,16,0.96)',
        borderTop: '1px solid var(--border)',
        height: '200px',
        color: 'var(--muted-strong)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}
    >
      {lines.length === 0
        ? <span style={{ color: 'var(--muted)' }}>Waiting for log output…</span>
        : lines.map((l, i) => <div key={i}>{l}</div>)
      }
    </div>
  )
}
