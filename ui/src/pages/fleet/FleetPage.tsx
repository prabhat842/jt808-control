import { useRef, useEffect, useMemo, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { useTerminals, useMediaSessions, useLatestPositions, useRecentAlarms } from '../../api/hooks'
import { useConfig } from '../../api/config'
import type { Terminal, MediaSession, LatestPosition, RecentAlarm } from '../../types'

function demoCoord(terminalId: string, home: [number, number]): [number, number] {
  let h = 0
  for (const c of terminalId) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return [
    home[0] + ((h % 1000) - 500) / 3000,
    home[1] + (((h >> 8) % 1000) - 500) / 3000,
  ]
}

export default function FleetPage() {
  const config = useConfig()
  const home: [number, number] = [config.mapCenterLon, config.mapCenterLat]

  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<mapboxgl.Map | null>(null)
  const markersRef   = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const [selected, setSelected] = useState<Terminal | null>(null)
  const [search, setSearch] = useState('')

  const { data: terminals = [] }     = useTerminals()
  const { data: mediaSessions = [] } = useMediaSessions()
  const { data: positions = [] }     = useLatestPositions()
  const { data: alarms = [] }        = useRecentAlarms(120)

  const filteredTerminals = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return terminals
    return terminals.filter(t =>
      t.terminalId.toLowerCase().includes(term) ||
      (t.plateNumber || '').toLowerCase().includes(term) ||
      (t.manufacturerId || '').toLowerCase().includes(term)
    )
  }, [terminals, search])

  const posMap = useMemo(() => new Map(positions.map(p => [p.sim, p])), [positions])
  const alarmByTerminal = useMemo(() => {
    const map = new Map<string, RecentAlarm>()
    for (const alarm of alarms) {
      if (!map.has(alarm.sim)) map.set(alarm.sim, alarm)
    }
    return map
  }, [alarms])
  const alarmCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const alarm of alarms) counts.set(alarm.sim, (counts.get(alarm.sim) ?? 0) + 1)
    return counts
  }, [alarms])
  const selectedPosition = selected ? posMap.get(selected.terminalId) : undefined
  const selectedAlarm = selected ? alarmByTerminal.get(selected.terminalId) : undefined
  const selectedAlarmCount = selected ? (alarmCounts.get(selected.terminalId) ?? 0) : 0

  useEffect(() => {
    if (!config.mapboxToken) return
    mapboxgl.accessToken = config.mapboxToken
  }, [config.mapboxToken])

  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !config.mapboxToken) return
    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: home,
      zoom: config.mapZoom,
    })
    mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    return () => { mapRef.current?.remove(); mapRef.current = null }
  }, [home, config.mapZoom, config.mapboxToken])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const current = new Set(filteredTerminals.map(t => t.terminalId))

    for (const [id, marker] of markersRef.current) {
      if (!current.has(id)) { marker.remove(); markersRef.current.delete(id) }
    }

    for (const t of filteredTerminals) {
      const gps   = posMap.get(t.terminalId)
      const coord: [number, number] = gps
        ? [gps.lon, gps.lat]
        : demoCoord(t.terminalId, home)
      const existingMarker = markersRef.current.get(t.terminalId)
      if (existingMarker) {
        existingMarker.setLngLat(coord)
        existingMarker.setPopup(new mapboxgl.Popup({ offset: 14, closeButton: false }).setHTML(
          popupHtml(t, gps, alarmByTerminal.get(t.terminalId), alarmCounts.get(t.terminalId) ?? 0)
        ))
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

      const nextMarker = new mapboxgl.Marker({ element: el })
        .setLngLat(coord)
        .setPopup(new mapboxgl.Popup({ offset: 14, closeButton: false }).setHTML(
          popupHtml(t, gps, alarmByTerminal.get(t.terminalId), alarmCounts.get(t.terminalId) ?? 0)
        ))
        .addTo(map)

      el.addEventListener('click', () => setSelected(t))
      markersRef.current.set(t.terminalId, nextMarker)
    }
  }, [filteredTerminals, posMap, home, alarmByTerminal, alarmCounts])

  const activeStreams = mediaSessions.filter(s => s.active).length
  const gpsOnline = positions.length
  const activeAlarms = alarms.length
  const mapReady = Boolean(config.mapboxToken)

  return (
    <div className="flex h-full" style={{ background: 'var(--background)' }}>
      {/* Map */}
      <div className="flex-1 relative">
        {mapReady ? (
          <div ref={mapContainer} className="w-full h-full" />
        ) : (
          <div className="w-full h-full flex items-center justify-center technical-grid" style={{ color: 'var(--muted)' }}>
            <div className="surface-panel-quiet px-4 py-3 font-mono text-[11px]" style={{ maxWidth: '320px' }}>
              Mapbox token is not configured.
            </div>
          </div>
        )}

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
          <StatRow label="GPS" value={String(gpsOnline)} />
          <StatRow label="Alarms" value={String(activeAlarms)} />
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
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search terminal / plate…"
            className="font-mono text-[11px] px-3 py-2 w-full focus:outline-none"
            style={{
              background: 'var(--surface-1)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--foreground)',
            }}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {selected ? (
            <TerminalDetail
              terminal={selected}
              position={selectedPosition}
              alarm={selectedAlarm}
              alarmCount={selectedAlarmCount}
              streams={mediaSessions.filter(s => s.terminalId === selected.terminalId)}
              onBack={() => setSelected(null)}
            />
          ) : (
            <TerminalList terminals={filteredTerminals} onSelect={setSelected} />
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
        <div className="font-mono text-[11px]">No terminals match this filter</div>
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

function TerminalDetail({ terminal: t, position, alarm, alarmCount, streams, onBack }: {
  terminal: Terminal
  position?: LatestPosition
  alarm?: RecentAlarm
  alarmCount: number
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
          ['GPS', position ? `${position.lat.toFixed(6)}, ${position.lon.toFixed(6)}` : '—'],
          ['Speed', position ? `${position.speed.toFixed(1)} km/h` : '—'],
          ['GPS time', position ? new Date(position.gpsTime).toLocaleString() : '—'],
          ['Alarms', String(alarmCount)],
        ].map(([label, value]) => (
          <div key={label}>
            <div className="eyebrow text-[9px]">{label}</div>
            <div className="font-mono text-[11px] mt-0.5" style={{ color: 'var(--foreground-strong)' }}>{value}</div>
          </div>
        ))}
      </div>

      {alarm && (
        <div className="surface-panel-quiet p-3 space-y-2">
          <div className="eyebrow text-[9px]">Latest Alarm</div>
          <div className="font-mono text-[11px]" style={{ color: 'var(--status-warn)' }}>
            {alarm.alarmId}
          </div>
          <div className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
            Type {alarm.alarmType} · Level {alarm.alarmLevel} · {new Date(alarm.receivedAt).toLocaleString()}
          </div>
          <div className="font-mono text-[11px]" style={{ color: 'var(--foreground-strong)' }}>
            {alarm.lat.toFixed(6)}, {alarm.lon.toFixed(6)} · {alarm.speed.toFixed(1)} km/h
          </div>
        </div>
      )}

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

function popupHtml(
  t: Terminal,
  position?: LatestPosition,
  alarm?: RecentAlarm,
  alarmCount = 0,
) {
  const alarmLine = alarm
    ? `<div style="color:var(--status-warn);margin-top:2px">Alarm ${alarm.alarmId} · ${new Date(alarm.receivedAt).toLocaleTimeString()}</div>`
    : `<div style="color:var(--muted);margin-top:2px">No recent alarm</div>`
  return `<div style="font-family:var(--ff-mono);font-size:11px;color:var(--foreground-strong);min-width:180px">
    <div style="color:var(--electric);font-weight:500">${t.plateNumber || t.terminalId}</div>
    <div style="color:var(--muted);margin-top:2px">${t.terminalId}</div>
    <div style="color:var(--muted);margin-top:2px">${position ? `${position.lat.toFixed(6)}, ${position.lon.toFixed(6)}` : 'No live GPS yet'}</div>
    <div style="color:var(--muted);margin-top:2px">${position ? `${position.speed.toFixed(1)} km/h · ${position.direction} deg` : ''}</div>
    <div style="color:var(--muted);margin-top:2px">Alarms ${alarmCount}</div>
    ${alarmLine}
  </div>`
}
