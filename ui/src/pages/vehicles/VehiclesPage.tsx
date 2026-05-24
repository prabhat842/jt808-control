import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import mapboxgl from 'mapbox-gl'
import {
  Bell,
  CirclePlay,
  Grid2X2,
  ListFilter,
  MapPinned,
  Radio,
  Search,
  Square,
  Video,
} from 'lucide-react'
import { useConfig } from '../../api/config'
import { useLatestPositions, useMediaSessions, useRecentAlarms, useStartLive, useStopLive, useTerminals } from '../../api/hooks'
import type { LatestPosition, MediaSession, RecentAlarm, Terminal } from '../../types'

type MonitorMode = 'map' | 'video'
type FleetFilter = 'all' | 'online' | 'risk' | 'streaming'
type BottomTab = 'vehicles' | 'alarms' | 'events' | 'media'
const BOTTOM_TABS = [
  { key: 'vehicles', label: 'Vehicle List', icon: ListFilter },
  { key: 'alarms', label: 'Active Alarm', icon: Bell },
  { key: 'events', label: 'Events', icon: Radio },
  { key: 'media', label: 'Media', icon: Video },
] satisfies { key: BottomTab; label: string; icon: typeof Radio }[]

function demoCoord(terminalId: string, home: [number, number]): [number, number] {
  let h = 0
  for (const c of terminalId) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return [
    home[0] + ((h % 1000) - 500) / 3000,
    home[1] + (((h >> 8) % 1000) - 500) / 3000,
  ]
}

function idMatches(jt808Id: string, rtvsId: string) {
  return jt808Id === rtvsId || jt808Id.endsWith(rtvsId) || rtvsId.endsWith(jt808Id)
}

export default function VehiclesPage() {
  const config = useConfig()
  const home = useMemo<[number, number]>(
    () => [config.mapCenterLon, config.mapCenterLat],
    [config.mapCenterLon, config.mapCenterLat],
  )

  const { data: terminals = [], isLoading } = useTerminals()
  const { data: positions = [] } = useLatestPositions()
  const { data: alarms = [] } = useRecentAlarms(160)
  const { data: sessions = [] } = useMediaSessions()

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FleetFilter>('all')
  const [mode, setMode] = useState<MonitorMode>('map')
  const [bottomTab, setBottomTab] = useState<BottomTab>('alarms')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())

  const positionByTerminal = useMemo(() => new Map(positions.map(p => [p.sim, p])), [positions])
  const alarmsByTerminal = useMemo(() => {
    const map = new Map<string, RecentAlarm[]>()
    for (const alarm of alarms) {
      const list = map.get(alarm.sim) ?? []
      list.push(alarm)
      map.set(alarm.sim, list)
    }
    return map
  }, [alarms])
  const sessionsByTerminal = useMemo(() => {
    const map = new Map<string, MediaSession[]>()
    for (const terminal of terminals) {
      const list = sessions.filter(session => idMatches(terminal.terminalId, session.terminalId) && session.active)
      if (list.length) map.set(terminal.terminalId, list)
    }
    return map
  }, [sessions, terminals])

  const filteredTerminals = useMemo(() => {
    const term = query.trim().toLowerCase()
    return terminals.filter(t => {
      const matchesQuery =
        !term ||
        t.terminalId.toLowerCase().includes(term) ||
        (t.plateNumber || '').toLowerCase().includes(term) ||
        (t.manufacturerId || '').toLowerCase().includes(term)
      if (!matchesQuery) return false
      if (filter === 'risk') return (alarmsByTerminal.get(t.terminalId)?.length ?? 0) > 0
      if (filter === 'streaming') return (sessionsByTerminal.get(t.terminalId)?.length ?? 0) > 0
      return true
    })
  }, [alarmsByTerminal, filter, query, sessionsByTerminal, terminals])

  const selected = useMemo(() => {
    if (!selectedId) return filteredTerminals[0] ?? terminals[0] ?? null
    return terminals.find(t => t.terminalId === selectedId) ?? filteredTerminals[0] ?? null
  }, [filteredTerminals, selectedId, terminals])

  const selectedPosition = selected ? positionByTerminal.get(selected.terminalId) : undefined
  const selectedAlarms = selected ? alarmsByTerminal.get(selected.terminalId) ?? [] : []
  const selectedSessions = selected ? sessionsByTerminal.get(selected.terminalId) ?? [] : []
  const activeStreams = sessions.filter(s => s.active).length
  const riskyTerminals = terminals.filter(t => (alarmsByTerminal.get(t.terminalId)?.length ?? 0) > 0).length

  useEffect(() => {
    if (!selectedId && terminals.length > 0) setSelectedId(terminals[0].terminalId)
  }, [selectedId, terminals])

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
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [config.mapZoom, config.mapboxToken, home])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const current = new Set(filteredTerminals.map(t => t.terminalId))
    for (const [id, marker] of markersRef.current) {
      if (!current.has(id)) {
        marker.remove()
        markersRef.current.delete(id)
      }
    }
    for (const terminal of filteredTerminals) {
      const gps = positionByTerminal.get(terminal.terminalId)
      const coord: [number, number] = gps ? [gps.lon, gps.lat] : demoCoord(terminal.terminalId, home)
      const alarmCount = alarmsByTerminal.get(terminal.terminalId)?.length ?? 0
      const streaming = (sessionsByTerminal.get(terminal.terminalId)?.length ?? 0) > 0
      const marker = markersRef.current.get(terminal.terminalId)
      if (marker) {
        marker.setLngLat(coord)
        styleMarker(marker.getElement(), terminal.terminalId === selected?.terminalId, alarmCount, streaming)
        continue
      }
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'monitor-marker'
      styleMarker(el, terminal.terminalId === selected?.terminalId, alarmCount, streaming)
      el.addEventListener('click', () => setSelectedId(terminal.terminalId))
      const nextMarker = new mapboxgl.Marker({ element: el }).setLngLat(coord).addTo(map)
      markersRef.current.set(terminal.terminalId, nextMarker)
    }
  }, [alarmsByTerminal, filteredTerminals, home, positionByTerminal, selected?.terminalId, sessionsByTerminal])

  useEffect(() => {
    if (!selectedPosition || !mapRef.current) return
    mapRef.current.easeTo({ center: [selectedPosition.lon, selectedPosition.lat], duration: 450, zoom: Math.max(config.mapZoom, 12) })
  }, [config.mapZoom, selectedPosition])

  return (
    <div className="monitor-page">
      <aside className="monitor-sidebar">
        <div className="monitor-sidebar-header">
          <div>
            <div className="eyebrow text-[9px]">Live Monitor</div>
            <div className="font-display text-sm font-semibold" style={{ color: 'var(--foreground-strong)' }}>
              Vehicle Console
            </div>
          </div>
          <span className="monitor-count">{filteredTerminals.length}</span>
        </div>

        <label className="monitor-search">
          <Search size={14} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search plate or terminal" />
        </label>

        <div className="monitor-filter-row">
          {(['all', 'online', 'risk', 'streaming'] as FleetFilter[]).map(item => (
            <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>
              {item}
            </button>
          ))}
        </div>

        <div className="monitor-vehicle-list">
          {isLoading ? (
            <div className="monitor-empty">Loading terminals</div>
          ) : filteredTerminals.length === 0 ? (
            <div className="monitor-empty">No terminals match</div>
          ) : (
            filteredTerminals.map(terminal => (
              <TerminalCard
                key={terminal.terminalId}
                terminal={terminal}
                position={positionByTerminal.get(terminal.terminalId)}
                alarmCount={alarmsByTerminal.get(terminal.terminalId)?.length ?? 0}
                streamCount={sessionsByTerminal.get(terminal.terminalId)?.length ?? 0}
                selected={terminal.terminalId === selected?.terminalId}
                onSelect={() => setSelectedId(terminal.terminalId)}
              />
            ))
          )}
        </div>
      </aside>

      <section className="monitor-workspace">
        <div className="monitor-modebar">
          <div className="monitor-kpi-strip">
            <MonitorKpi icon={Radio} label="Online" value={String(terminals.length)} tone="ok" />
            <MonitorKpi icon={MapPinned} label="GPS" value={String(positions.length)} tone="info" />
            <MonitorKpi icon={Bell} label="Risk" value={String(riskyTerminals)} tone={riskyTerminals ? 'warn' : 'muted'} />
            <MonitorKpi icon={Video} label="Streams" value={String(activeStreams)} tone={activeStreams ? 'ok' : 'muted'} />
          </div>
          <div className="monitor-mode-toggle" aria-label="Monitor mode">
            <button className={mode === 'map' ? 'active' : ''} onClick={() => setMode('map')} title="Map mode">
              <MapPinned size={15} />
              <span>Map</span>
            </button>
            <button className={mode === 'video' ? 'active' : ''} onClick={() => setMode('video')} title="Video mode">
              <Grid2X2 size={15} />
              <span>Video</span>
            </button>
          </div>
        </div>

        <div className="monitor-stage">
          {mode === 'map' ? (
            config.mapboxToken ? (
              <div ref={mapContainer} className="monitor-map-stage" />
            ) : (
              <div className="monitor-map-fallback technical-grid">Map token unavailable</div>
            )
          ) : (
            <VideoWall terminals={filteredTerminals} sessionsByTerminal={sessionsByTerminal} />
          )}

          <div className="monitor-map-legend">
            <span><i className="ok" /> Online</span>
            <span><i className="warn" /> Alarm</span>
            <span><i className="stream" /> Streaming</span>
          </div>
        </div>

        <BottomPanel
          tab={bottomTab}
          onTab={setBottomTab}
          terminals={filteredTerminals}
          positions={positionByTerminal}
          alarms={alarms}
          sessions={sessions}
          onSelect={setSelectedId}
        />
      </section>

      <aside className="monitor-detail">
        {selected ? (
          <TerminalInspector
            terminal={selected}
            position={selectedPosition}
            alarms={selectedAlarms}
            sessions={selectedSessions}
          />
        ) : (
          <div className="monitor-empty">Select a terminal</div>
        )}
      </aside>
    </div>
  )
}

function styleMarker(el: HTMLElement, selected: boolean, alarmCount: number, streaming: boolean) {
  const color = alarmCount > 0 ? '#fb923c' : streaming ? '#a78bfa' : '#22d3ee'
  el.style.cssText = `
    width:${selected ? 18 : 14}px;height:${selected ? 18 : 14}px;border-radius:999px;
    border:2px solid rgba(255,255,255,0.72);background:${color};
    box-shadow:0 0 0 ${selected ? 5 : 3}px ${color}30,0 0 18px ${color}80;
    cursor:pointer;padding:0;transition:width .15s,height .15s,box-shadow .15s;
  `
}

function TerminalCard({
  terminal,
  position,
  alarmCount,
  streamCount,
  selected,
  onSelect,
}: {
  terminal: Terminal
  position?: LatestPosition
  alarmCount: number
  streamCount: number
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button className={`monitor-vehicle-card ${selected ? 'active' : ''}`} onClick={onSelect}>
      <div className="monitor-vehicle-main">
        <span className={`monitor-status-dot ${alarmCount ? 'warn' : 'ok'}`} />
        <div>
          <div className="monitor-vehicle-id">{terminal.plateNumber || terminal.terminalId}</div>
          <div className="monitor-vehicle-sub">{terminal.terminalId}</div>
        </div>
      </div>
      <div className="monitor-vehicle-meta">
        <span>{position ? `${position.speed.toFixed(0)} km/h` : 'no gps'}</span>
        {alarmCount > 0 && <span className="warn">{alarmCount} alarms</span>}
        {streamCount > 0 && <span className="stream">{streamCount} live</span>}
      </div>
    </button>
  )
}

function MonitorKpi({ icon: Icon, label, value, tone }: {
  icon: typeof Radio
  label: string
  value: string
  tone: 'ok' | 'warn' | 'info' | 'muted'
}) {
  return (
    <div className={`monitor-kpi ${tone}`}>
      <Icon size={15} />
      <div>
        <div className="monitor-kpi-label">{label}</div>
        <div className="monitor-kpi-value">{value}</div>
      </div>
    </div>
  )
}

function VideoWall({ terminals, sessionsByTerminal }: {
  terminals: Terminal[]
  sessionsByTerminal: Map<string, MediaSession[]>
}) {
  const liveTerminals = terminals.filter(t => (sessionsByTerminal.get(t.terminalId)?.length ?? 0) > 0).slice(0, 4)
  const cells = liveTerminals.length ? liveTerminals : terminals.slice(0, 4)
  return (
    <div className="monitor-video-wall">
      {cells.map(terminal => {
        const sessions = sessionsByTerminal.get(terminal.terminalId) ?? []
        return (
          <div key={terminal.terminalId} className="monitor-video-cell">
            <div className="monitor-video-top">
              <span>{terminal.plateNumber || terminal.terminalId}</span>
              <span className={sessions.length ? 'live' : ''}>{sessions.length ? 'live' : 'idle'}</span>
            </div>
            <div className="monitor-video-feed">
              <CirclePlay size={38} />
              <div>{sessions.length ? `${sessions.length} active channel${sessions.length > 1 ? 's' : ''}` : 'No active stream'}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TerminalInspector({ terminal, position, alarms, sessions }: {
  terminal: Terminal
  position?: LatestPosition
  alarms: RecentAlarm[]
  sessions: MediaSession[]
}) {
  const startLive = useStartLive()
  const stopLive = useStopLive()
  const [channel, setChannel] = useState(1)

  return (
    <>
      <div className="monitor-detail-head">
        <div>
          <div className="eyebrow text-[9px]">Selected Terminal</div>
          <div className="monitor-detail-title">{terminal.plateNumber || terminal.terminalId}</div>
          <div className="monitor-detail-sub">{terminal.terminalId}</div>
        </div>
        <span className={`monitor-risk-badge ${alarms.length ? 'warn' : 'ok'}`}>{alarms.length ? 'risk' : 'clear'}</span>
      </div>

      <div className="monitor-detail-body">
        <div className="monitor-action-panel">
          <select value={channel} onChange={e => setChannel(Number(e.target.value))}>
            {[1,2,3,4,5,6,7,8].map(c => <option key={c} value={c}>Channel {c}</option>)}
          </select>
          <button className="btn-primary" onClick={() => startLive.mutate({ terminal: terminal.terminalId, channel })} disabled={startLive.isPending}>
            <CirclePlay size={14} /> Start
          </button>
          <button className="btn-secondary" onClick={() => stopLive.mutate({ terminal: terminal.terminalId, channel })} disabled={stopLive.isPending}>
            <Square size={13} /> Stop
          </button>
        </div>

        <InfoBlock title="Telemetry" rows={[
          ['GPS', position ? `${position.lat.toFixed(6)}, ${position.lon.toFixed(6)}` : '—'],
          ['Speed', position ? `${position.speed.toFixed(1)} km/h` : '—'],
          ['Heading', position ? `${position.direction} deg` : '—'],
          ['GPS time', position ? new Date(position.gpsTime).toLocaleString() : '—'],
        ]} />

        <InfoBlock title="Vehicle" rows={[
          ['Plate', terminal.plateNumber || '—'],
          ['Color', terminal.plateColorName],
          ['Manufacturer', terminal.manufacturerId || '—'],
          ['Connected', new Date(terminal.connectedAt).toLocaleString()],
        ]} />

        <div className="monitor-mini-section">
          <div className="monitor-section-title">Live Channels</div>
          {sessions.length ? sessions.map(session => (
            <div key={session.channelId} className="monitor-channel-row">
              <span>Ch {session.channelId}</span>
              <span>{session.frames.toLocaleString()} frames</span>
            </div>
          )) : <div className="monitor-muted">No active stream</div>}
        </div>

        <div className="monitor-mini-section">
          <div className="monitor-section-title">Latest Alarm</div>
          {alarms[0] ? (
            <div className="monitor-alarm-card">
              <div>{alarms[0].alarmId}</div>
              <span>Type {alarms[0].alarmType} · Level {alarms[0].alarmLevel}</span>
            </div>
          ) : <div className="monitor-muted">No recent alarm</div>}
        </div>
      </div>
    </>
  )
}

function InfoBlock({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="monitor-mini-section">
      <div className="monitor-section-title">{title}</div>
      {rows.map(([label, value]) => (
        <div key={label} className="monitor-info-row">
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  )
}

function BottomPanel({
  tab,
  onTab,
  terminals,
  positions,
  alarms,
  sessions,
  onSelect,
}: {
  tab: BottomTab
  onTab: (tab: BottomTab) => void
  terminals: Terminal[]
  positions: Map<string, LatestPosition>
  alarms: RecentAlarm[]
  sessions: MediaSession[]
  onSelect: (terminalId: string) => void
}) {
  return (
    <div className="monitor-bottom">
      <div className="monitor-bottom-tabs">
        {BOTTOM_TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => onTab(key)}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>
      <div className="monitor-bottom-body">
        {tab === 'vehicles' && (
          <CompactTable
            headers={['Terminal', 'Plate', 'GPS', 'Speed']}
            rows={terminals.slice(0, 8).map(t => {
              const position = positions.get(t.terminalId)
              return [
                <button className="monitor-link" onClick={() => onSelect(t.terminalId)}>{t.terminalId}</button>,
                t.plateNumber || '—',
                position ? `${position.lat.toFixed(4)}, ${position.lon.toFixed(4)}` : '—',
                position ? `${position.speed.toFixed(1)} km/h` : '—',
              ]
            })}
          />
        )}
        {tab === 'alarms' && (
          <CompactTable
            headers={['Alarm', 'Terminal', 'Type', 'Received']}
            rows={alarms.slice(0, 8).map(alarm => [
              alarm.alarmId,
              <button className="monitor-link" onClick={() => onSelect(alarm.sim)}>{alarm.sim}</button>,
              `Type ${alarm.alarmType} / L${alarm.alarmLevel}`,
              new Date(alarm.receivedAt).toLocaleTimeString(),
            ])}
          />
        )}
        {tab === 'events' && (
          <CompactTable
            headers={['Event', 'Terminal', 'State', 'Time']}
            rows={terminals.slice(0, 8).map(t => [
              'GPS report',
              <button className="monitor-link" onClick={() => onSelect(t.terminalId)}>{t.terminalId}</button>,
              positions.get(t.terminalId) ? 'position updated' : 'awaiting GPS',
              positions.get(t.terminalId) ? new Date(positions.get(t.terminalId)!.gpsTime).toLocaleTimeString() : '—',
            ])}
          />
        )}
        {tab === 'media' && (
          <CompactTable
            headers={['Terminal', 'Channel', 'Frames', 'Last seen']}
            rows={sessions.slice(0, 8).map(session => [
              <button className="monitor-link" onClick={() => onSelect(session.terminalId)}>{session.terminalId}</button>,
              `Ch ${session.channelId}`,
              session.frames.toLocaleString(),
              new Date(session.lastSeen).toLocaleTimeString(),
            ])}
          />
        )}
      </div>
    </div>
  )
}

function CompactTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  if (rows.length === 0) return <div className="monitor-empty compact">No records</div>
  return (
    <table className="monitor-table">
      <thead>
        <tr>{headers.map(header => <th key={header}>{header}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
