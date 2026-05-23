import { useRef, useEffect, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { useTerminals, useMediaSessions, useLatestPositions } from '../../api/hooks'
import type { Terminal, MediaSession } from '../../types'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

// Jamshedpur, Jharkhand, India
const HOME: [number, number] = [86.2029, 22.8046]

// Fallback when ClickHouse has no position yet for this terminal
function demoCoord(terminalId: string): [number, number] {
  let h = 0
  for (const c of terminalId) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return [
    HOME[0] + ((h % 1000) - 500) / 3000,
    HOME[1] + (((h >> 8) % 1000) - 500) / 3000,
  ]
}

export default function FleetPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<mapboxgl.Map | null>(null)
  const markersRef   = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const [selected, setSelected] = useState<Terminal | null>(null)

  const { data: terminals = [] }     = useTerminals()
  const { data: mediaSessions = [] } = useMediaSessions()
  const { data: positions = [] }     = useLatestPositions()

  // Build sim → position lookup for real GPS coords
  const posMap = new Map(positions.map(p => [p.sim, p]))

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return
    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: HOME,
      zoom: 11,
    })
    mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    return () => { mapRef.current?.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const current = new Set(terminals.map(t => t.terminalId))

    for (const [id, marker] of markersRef.current) {
      if (!current.has(id)) { marker.remove(); markersRef.current.delete(id) }
    }

    for (const t of terminals) {
      const gps   = posMap.get(t.terminalId)
      const coord: [number, number] = gps
        ? [gps.lon, gps.lat]
        : demoCoord(t.terminalId)
      if (markersRef.current.has(t.terminalId)) {
        markersRef.current.get(t.terminalId)!.setLngLat(coord)
        continue
      }
      const el = document.createElement('div')
      el.style.cssText = `
        width: 12px; height: 12px; border-radius: 50%;
        background: #22d3ee; border: 2px solid rgba(34,211,238,0.4);
        box-shadow: 0 0 8px rgba(34,211,238,0.5);
        cursor: pointer; transition: transform 0.15s;
      `
      el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.4)' })
      el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)' })

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(coord)
        .setPopup(new mapboxgl.Popup({ offset: 14, closeButton: false }).setHTML(
          `<div style="font-family:var(--ff-mono);font-size:11px;color:var(--foreground-strong)">
            <div style="color:var(--electric);font-weight:500">${t.plateNumber || t.terminalId}</div>
            <div style="color:var(--muted);margin-top:2px">${t.terminalId}</div>
          </div>`
        ))
        .addTo(map)

      el.addEventListener('click', () => setSelected(t))
      markersRef.current.set(t.terminalId, marker)
    }
  }, [terminals, posMap])

  const activeStreams = mediaSessions.filter(s => s.active).length

  return (
    <div className="flex h-full" style={{ background: 'var(--background)' }}>
      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapContainer} className="w-full h-full" />

        {/* Overlay stats */}
        <div
          className="absolute top-4 left-4 font-mono text-[11px] space-y-1"
          style={{
            background: 'rgba(9,17,23,0.88)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 14px',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div className="eyebrow-electric font-mono text-[9px] tracking-[0.26em] uppercase mb-2">
            Fleet Status
          </div>
          <StatRow label="Online" value={String(terminals.length)} highlight />
          <StatRow label="Streams" value={String(activeStreams)} />
        </div>

        {/* Jamshedpur label */}
        <div
          className="absolute bottom-10 left-4 font-mono text-[10px] uppercase tracking-[0.2em]"
          style={{ color: 'var(--muted)', pointerEvents: 'none' }}
        >
          Jamshedpur · Jharkhand · India
        </div>
      </div>

      {/* Side panel */}
      <div
        className="w-72 flex flex-col"
        style={{
          borderLeft: '1px solid var(--border)',
          background: 'rgba(9,17,23,0.97)',
        }}
      >
        <div
          className="px-4 py-3 font-display text-sm font-medium"
          style={{ borderBottom: '1px solid var(--border)', color: 'var(--foreground-strong)' }}
        >
          {selected ? selected.terminalId : 'Connected Terminals'}
        </div>
        <div className="flex-1 overflow-y-auto">
          {selected ? (
            <TerminalDetail
              terminal={selected}
              streams={mediaSessions.filter(s => s.terminalId === selected.terminalId)}
              onBack={() => setSelected(null)}
            />
          ) : (
            <TerminalList terminals={terminals} onSelect={setSelected} />
          )}
        </div>
      </div>
    </div>
  )
}

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ color: highlight ? 'var(--electric)' : 'var(--foreground-strong)', fontWeight: 500 }}>
        {value}
      </span>
    </div>
  )
}

function TerminalList({ terminals, onSelect }: { terminals: Terminal[]; onSelect: (t: Terminal) => void }) {
  if (!terminals.length) {
    return (
      <div className="px-4 py-6 text-center" style={{ color: 'var(--muted)' }}>
        <div className="text-2xl mb-2 opacity-30">◈</div>
        <div className="font-mono text-[11px]">No terminals connected</div>
      </div>
    )
  }
  return (
    <ul style={{ borderBottom: '1px solid var(--border)' }}>
      {terminals.map(t => (
        <li key={t.terminalId} style={{ borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={() => onSelect(t)}
            className="w-full text-left px-4 py-3 transition-colors"
            style={{ background: 'transparent' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-1)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div className="flex items-center gap-2">
              <span className="status-dot">
                <span className="status-dot-inner" style={{ background: 'var(--status-ok)', color: 'var(--status-ok)' }} />
              </span>
              <span className="font-mono text-[12px]" style={{ color: 'var(--foreground-strong)' }}>
                {t.terminalId}
              </span>
            </div>
            <div className="font-mono text-[10px] mt-1 pl-4" style={{ color: 'var(--muted)' }}>
              {t.plateNumber || '—'} · {t.plateColorName}
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

function TerminalDetail({ terminal: t, streams, onBack }: {
  terminal: Terminal
  streams: MediaSession[]
  onBack: () => void
}) {
  return (
    <div className="p-4 space-y-4">
      <button
        onClick={onBack}
        className="font-mono text-[11px] transition-colors"
        style={{ color: 'var(--electric)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        ← Back
      </button>

      <div className="surface-panel-quiet p-3 space-y-2">
        {[
          ['Terminal ID', t.terminalId],
          ['Plate', t.plateNumber || '—'],
          ['Plate color', t.plateColorName],
          ['Manufacturer', t.manufacturerId || '—'],
          ['Connected', new Date(t.connectedAt).toLocaleString()],
        ].map(([label, value]) => (
          <div key={label}>
            <div className="eyebrow text-[9px]">{label}</div>
            <div className="font-mono text-[11px] mt-0.5" style={{ color: 'var(--foreground-strong)' }}>{value}</div>
          </div>
        ))}
      </div>

      {streams.length > 0 && (
        <div>
          <div className="eyebrow text-[9px] mb-2">Live Channels</div>
          {streams.map(s => (
            <div
              key={s.channelId}
              className="font-mono text-[11px] px-3 py-2 mb-1"
              style={{
                background: 'var(--electric-soft)',
                border: '1px solid var(--electric-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--electric)',
              }}
            >
              Ch {s.channelId} · {(s.bytes / 1024).toFixed(1)} KB · {s.frames} frames
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
