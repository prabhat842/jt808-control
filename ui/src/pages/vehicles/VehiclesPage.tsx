import { useMemo, useState } from 'react'
import { useTerminals, useStartLive, useStopLive, useLatestPositions, useRecentAlarms } from '../../api/hooks'
import type { Terminal, LatestPosition, RecentAlarm } from '../../types'

export default function VehiclesPage() {
  const { data: terminals = [], isLoading } = useTerminals()
  const { data: positions = [] } = useLatestPositions()
  const { data: alarms = [] } = useRecentAlarms(120)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Terminal | null>(null)

  const positionByTerminal = useMemo(
    () => new Map(positions.map(p => [p.sim, p])),
    [positions],
  )
  const alarmByTerminal = useMemo(() => {
    const map = new Map<string, RecentAlarm>()
    for (const alarm of alarms) {
      if (!map.has(alarm.sim)) map.set(alarm.sim, alarm)
    }
    return map
  }, [alarms])

  const filtered = terminals.filter(t =>
    t.terminalId.includes(search) ||
    t.plateNumber.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex h-full" style={{ background: 'var(--background)' }}>
      <div className="flex-1 p-6 overflow-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="eyebrow text-[9px] mb-1">Command Center</div>
            <h1 className="font-display text-xl font-semibold" style={{ color: 'var(--foreground-strong)' }}>
              Vehicles
            </h1>
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search terminal / plate…"
            className="font-mono text-[12px] px-3 py-2 w-56 focus:outline-none"
            style={{
              background: 'var(--surface-1)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--foreground)',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--electric-border)')}
            onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
        </div>

        {/* Table */}
        <div className="surface-panel overflow-hidden">
          {isLoading ? (
            <div className="px-5 py-6 font-mono text-[12px]" style={{ color: 'var(--muted)' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-6 font-mono text-[12px]" style={{ color: 'var(--muted)' }}>
              {search ? 'No matches' : 'No terminals connected'}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Terminal ID', 'Plate', 'GPS', 'Alarm', 'Manufacturer', 'Connected', 'Actions'].map(h => (
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
                {filtered.map((t, i) => (
                  <TerminalRow
                    key={t.terminalId}
                    terminal={t}
                    position={positionByTerminal.get(t.terminalId)}
                    alarm={alarmByTerminal.get(t.terminalId)}
                    last={i === filtered.length - 1}
                    onSelect={() => setSelected(t)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selected && (
        <div className="w-72 flex-shrink-0 flex flex-col overflow-y-auto"
          style={{ borderLeft: '1px solid var(--border)', background: 'rgba(9,17,23,0.97)' }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="font-display text-sm font-medium" style={{ color: 'var(--foreground-strong)' }}>
              {selected.terminalId}
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
            <TerminalSummary terminal={selected} position={positionByTerminal.get(selected.terminalId)} alarm={alarmByTerminal.get(selected.terminalId)} />
          </div>
        </div>
      )}
    </div>
  )
}

function TerminalRow({
  terminal: t,
  position,
  alarm,
  last,
  onSelect,
}: {
  terminal: Terminal
  position?: LatestPosition
  alarm?: RecentAlarm
  last: boolean
  onSelect: () => void
}) {
  const startLive = useStartLive()
  const stopLive  = useStopLive()
  const [ch, setCh] = useState(1)

  return (
    <tr
      style={{ borderBottom: last ? 'none' : '1px solid var(--border)' }}
      onClick={onSelect}
      className="cursor-pointer transition-colors"
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-1)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <td className="px-5 py-3 font-mono text-[12px]" style={{ color: 'var(--electric)' }}>
        {t.terminalId}
      </td>
      <td className="py-3 pr-4 font-mono text-[12px]" style={{ color: 'var(--foreground-strong)' }}>
        {t.plateNumber || '—'}
      </td>
      <td className="py-3 pr-4 font-mono text-[11px]" style={{ color: 'var(--muted-strong)' }}>
        {position ? `${position.lat.toFixed(6)}, ${position.lon.toFixed(6)}` : '—'}
      </td>
      <td className="py-3 pr-4">
        {alarm ? (
          <div className="font-mono text-[11px]" style={{ color: 'var(--status-warn)' }}>
            {alarm.alarmType} · {new Date(alarm.receivedAt).toLocaleTimeString()}
          </div>
        ) : (
          <span
            className="font-mono text-[10px] px-2 py-0.5"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--muted-strong)',
            }}
          >
            clear
          </span>
        )}
      </td>
      <td className="py-3 pr-4 font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
        {t.manufacturerId || '—'}
      </td>
      <td className="py-3 pr-4 font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
        {new Date(t.connectedAt).toLocaleString()}
      </td>
      <td className="py-3 pr-5">
        <div className="flex items-center gap-2">
          <select
            value={ch}
            onChange={e => setCh(Number(e.target.value))}
            onClick={e => e.stopPropagation()}
            className="font-mono text-[11px] px-1.5 py-1 focus:outline-none"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--foreground)',
            }}
          >
            {[1,2,3,4,5,6,7,8].map(c => <option key={c} value={c}>Ch {c}</option>)}
          </select>
          <button
            className="btn-primary"
            onClick={e => {
              e.stopPropagation()
              startLive.mutate({ terminal: t.terminalId, channel: ch })
            }}
            disabled={startLive.isPending}
          >
            ▶ Live
          </button>
          <button
            className="btn-secondary"
            onClick={e => {
              e.stopPropagation()
              stopLive.mutate({ terminal: t.terminalId, channel: ch })
            }}
            disabled={stopLive.isPending}
          >
            ■ Stop
          </button>
        </div>
      </td>
    </tr>
  )
}

function TerminalSummary({
  terminal,
  position,
  alarm,
}: {
  terminal: Terminal
  position?: LatestPosition
  alarm?: RecentAlarm
}) {
  return (
    <>
      <div className="surface-panel-quiet p-3 space-y-2">
        {[
          ['Plate', terminal.plateNumber || '—'],
          ['Color', terminal.plateColorName],
          ['Manufacturer', terminal.manufacturerId || '—'],
          ['Connected', new Date(terminal.connectedAt).toLocaleString()],
          ['GPS', position ? `${position.lat.toFixed(6)}, ${position.lon.toFixed(6)}` : '—'],
          ['Speed', position ? `${position.speed.toFixed(1)} km/h` : '—'],
          ['GPS time', position ? new Date(position.gpsTime).toLocaleString() : '—'],
        ].map(([label, value]) => (
          <div key={label}>
            <div className="eyebrow text-[9px]">{label}</div>
            <div className="font-mono text-[11px] mt-0.5" style={{ color: 'var(--foreground-strong)' }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="surface-panel-quiet p-3 space-y-2">
        <div className="eyebrow text-[9px]">Latest Alarm</div>
        {alarm ? (
          <>
            <div className="font-mono text-[11px]" style={{ color: 'var(--status-warn)' }}>
              {alarm.alarmId}
            </div>
            <div className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
              Type {alarm.alarmType} · Level {alarm.alarmLevel}
            </div>
            <div className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
              {new Date(alarm.receivedAt).toLocaleString()}
            </div>
          </>
        ) : (
          <div className="font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
            No alarm recorded
          </div>
        )}
      </div>
    </>
  )
}
