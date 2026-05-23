import { useState, useEffect, useRef } from 'react'
import { useServices, useStartService, useStopService, useStartAll, useStopAll } from '../../api/hooks'
import type { ServiceStatus } from '../../types'

const GROUP_ORDER  = ['database', 'vehicle', 'infrastructure']
const GROUP_LABELS: Record<string, string> = {
  database:       'Database',
  vehicle:        'Vehicle Terminal',
  infrastructure: 'Infrastructure',
}
const GROUP_NOTE: Record<string, string> = {
  database:       'Starts first · stops last — ensures all writes are flushed before shutdown',
  vehicle:        'Stops first on shutdown — sends JT808 logout before server closes',
  infrastructure: 'Stops after vehicle · @PreDestroy flushes write queue before DB shuts down',
}

export default function ServicesPage() {
  const { data: services = [] } = useServices()
  const startService = useStartService()
  const stopService  = useStopService()
  const startAll     = useStartAll()
  const stopAll      = useStopAll()
  const [logTarget, setLogTarget] = useState<string | null>(null)

  const grouped = GROUP_ORDER
    .map(group => ({
      group,
      items: services
        .filter(s => s.group === group)
        .sort((a, b) => a.displayOrder - b.displayOrder),
    }))
    .filter(g => g.items.length > 0)

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
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
            {runningCount}/{services.length} running
          </span>
          <button className="btn-primary"    onClick={() => startAll.mutate()} disabled={startAll.isPending}>▶ Start all</button>
          <button className="btn-secondary"  onClick={() => stopAll.mutate()}  disabled={stopAll.isPending} >■ Stop all</button>
        </div>
      </div>

      <div className="space-y-5">
        {grouped.map(({ group, items }) => (
          <div key={group}>
            <div className="flex items-baseline gap-3 mb-2">
              <div className="eyebrow text-[9px]">{GROUP_LABELS[group] ?? group}</div>
              {GROUP_NOTE[group] && (
                <span className="font-mono text-[9px]" style={{ color: 'var(--muted)' }}>
                  {GROUP_NOTE[group]}
                </span>
              )}
            </div>
            <div className="surface-panel overflow-hidden">
              {items.map((svc, i) => (
                <div key={svc.id} style={{ borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <ServiceRow
                    svc={svc}
                    onStart={() => startService.mutate(svc.id)}
                    onStop={()  => stopService.mutate(svc.id)}
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
  onStop:  () => void
  onLogs:  () => void
  showLogs: boolean
}) {
  const dotColor = svc.running ? 'var(--status-ok)' : 'var(--muted)'

  return (
    <div className="flex items-center gap-4 px-5 py-3">
      {/* Status dot */}
      <span className="status-dot flex-shrink-0">
        <span className="status-dot-inner" style={{ background: dotColor, color: dotColor }} />
      </span>

      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <div className="font-display text-sm font-medium" style={{ color: 'var(--foreground-strong)' }}>
          {svc.name}
        </div>
        <div className="font-mono text-[10px] mt-0.5 truncate" style={{ color: 'var(--muted)' }}>
          {svc.description}
        </div>
      </div>

      {/* Runtime info */}
      <div className="font-mono text-[10px] flex-shrink-0 text-right w-28" style={{ color: 'var(--muted)' }}>
        {svc.running && svc.pid != null && svc.pid > 0 && <div>PID {svc.pid}</div>}
        {svc.running && svc.startedAt && (
          <div>{new Date(svc.startedAt).toLocaleTimeString()}</div>
        )}
        {!svc.running && svc.exitCode != null && (
          <div style={{ color: svc.exitCode === 0 ? 'var(--muted)' : 'var(--status-warn)' }}>
            exit {svc.exitCode}
          </div>
        )}
        {!svc.running && svc.exitCode == null && (
          <div style={{ color: 'var(--muted)' }}>stopped</div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {svc.running
          ? <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '11px' }} onClick={onStop}>■ Stop</button>
          : <button className="btn-primary"   style={{ padding: '4px 12px', fontSize: '11px' }} onClick={onStart}>▶ Start</button>
        }
        <button
          className="btn-secondary"
          style={{
            padding: '4px 10px', fontSize: '11px',
            ...(showLogs ? { borderColor: 'var(--electric-border)', color: 'var(--electric)' } : {}),
          }}
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
      setLines(prev => [...prev, e.data].slice(-300))
    }
    return () => es.close()
  }, [serviceId])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [lines])

  return (
    <div
      ref={logRef}
      className="font-mono text-[11px] px-5 py-3 overflow-y-auto"
      style={{
        background: 'rgba(5,10,16,0.96)',
        borderTop: '1px solid var(--border)',
        height: '220px',
        color: 'var(--muted-strong)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}
    >
      {lines.length === 0
        ? <span style={{ color: 'var(--muted)' }}>Waiting for log output…</span>
        : lines.map((l, i) => (
          <div key={i} style={{ color: colorForLine(l) }}>{l}</div>
        ))
      }
    </div>
  )
}

function colorForLine(line: string): string {
  const l = line.toLowerCase()
  if (l.includes('error') || l.includes('exception') || l.includes('fatal'))
    return 'var(--status-warn)'
  if (l.includes('warn'))
    return '#fb923c99'
  if (l.includes('--- start') || l.includes('--- stop') || l.includes('--- evict'))
    return 'var(--electric)'
  return 'var(--muted-strong)'
}
