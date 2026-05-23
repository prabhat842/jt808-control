import { useState } from 'react'
import { useRecentAlarms } from '../../api/hooks'
import type { RecentAlarm } from '../../types'

export default function AlarmsPage() {
  const { data: alarms = [] } = useRecentAlarms(200)
  const [selected, setSelected] = useState<RecentAlarm | null>(null)

  return (
    <div className="flex h-full" style={{ background: 'var(--background)' }}>
      {/* Main */}
      <div className="flex-1 p-6 overflow-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="eyebrow text-[9px] mb-1">Alarm History</div>
            <h1 className="font-display text-xl font-semibold" style={{ color: 'var(--foreground-strong)' }}>
              Vehicle Alarms
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="status-dot">
              <span className="status-dot-inner" style={{ background: 'var(--electric)', color: 'var(--electric)' }} />
            </span>
            <span className="font-mono text-[11px]" style={{ color: 'var(--muted-strong)' }}>
              {alarms.length} rows · ClickHouse
            </span>
          </div>
        </div>

        <div className="surface-panel overflow-hidden">
          {alarms.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <div className="text-3xl mb-3 opacity-20">◉</div>
              <div className="font-mono text-[12px]" style={{ color: 'var(--muted)' }}>
                No alarm records received yet
              </div>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Time', 'Vehicle', 'SIM', 'Alarm', 'Level', 'Location', 'Speed'].map(h => (
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
                {alarms.map((a, i) => (
                  <tr
                    key={a.alarmId}
                    onClick={() => setSelected(a)}
                    className="cursor-pointer transition-colors"
                    style={{ borderBottom: i < alarms.length - 1 ? '1px solid var(--border)' : 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-1)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-5 py-2.5 font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
                      {new Date(a.receivedAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-[11px]" style={{ color: 'var(--electric)' }}>
                      {a.vehicleId}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-[11px]" style={{ color: 'var(--muted-strong)' }}>
                      {a.sim}
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
                        {a.alarmType}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
                      {a.alarmLevel}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
                      {a.lat.toFixed(4)}, {a.lon.toFixed(4)}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
                      {a.speed.toFixed(1)} km/h
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
              Alarm Detail
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
                ['Alarm ID', selected.alarmId],
                ['Vehicle',  selected.vehicleId],
                ['SIM',      selected.sim],
                ['Type',     String(selected.alarmType)],
                ['Level',    String(selected.alarmLevel)],
                ['Location', `${selected.lat.toFixed(4)}, ${selected.lon.toFixed(4)}`],
                ['Speed',    `${selected.speed} km/h`],
                ['Alarm At', new Date(selected.alarmStartTime).toLocaleString()],
                ['Received', new Date(selected.receivedAt).toLocaleString()],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label}>
                  <div className="eyebrow text-[9px]">{label}</div>
                  <div className="font-mono text-[11px] mt-0.5 break-all" style={{ color: 'var(--foreground-strong)' }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
