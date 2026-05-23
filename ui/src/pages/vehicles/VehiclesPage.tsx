import { useState } from 'react'
import { useTerminals, useStartLive, useStopLive } from '../../api/hooks'
import type { Terminal } from '../../types'

export default function VehiclesPage() {
  const { data: terminals = [], isLoading } = useTerminals()
  const [search, setSearch] = useState('')

  const filtered = terminals.filter(t =>
    t.terminalId.includes(search) ||
    t.plateNumber.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-5">
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
          onFocus={e => (e.target.style.borderColor = 'var(--electric-border)')}
          onBlur={e  => (e.target.style.borderColor = 'var(--border)')}
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
                {['Terminal ID', 'Plate', 'Color', 'Manufacturer', 'Connected', 'Actions'].map(h => (
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
                <TerminalRow key={t.terminalId} terminal={t} last={i === filtered.length - 1} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function TerminalRow({ terminal: t, last }: { terminal: Terminal; last: boolean }) {
  const startLive = useStartLive()
  const stopLive  = useStopLive()
  const [ch, setCh] = useState(1)

  return (
    <tr style={{ borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <td className="px-5 py-3 font-mono text-[12px]" style={{ color: 'var(--electric)' }}>
        {t.terminalId}
      </td>
      <td className="py-3 pr-4 font-mono text-[12px]" style={{ color: 'var(--foreground-strong)' }}>
        {t.plateNumber || '—'}
      </td>
      <td className="py-3 pr-4">
        <span
          className="font-mono text-[10px] px-2 py-0.5"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--muted-strong)',
          }}
        >
          {t.plateColorName}
        </span>
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
            onClick={() => startLive.mutate({ terminal: t.terminalId, channel: ch })}
            disabled={startLive.isPending}
          >
            ▶ Live
          </button>
          <button
            className="btn-secondary"
            onClick={() => stopLive.mutate({ terminal: t.terminalId, channel: ch })}
            disabled={stopLive.isPending}
          >
            ■ Stop
          </button>
        </div>
      </td>
    </tr>
  )
}
