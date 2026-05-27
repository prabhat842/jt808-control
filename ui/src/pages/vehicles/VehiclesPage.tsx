import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import mapboxgl from 'mapbox-gl'
import {
  Bell,
  CirclePlay,
  FileVideo,
  Grid2X2,
  MapPinned,
  Radio,
  Search,
  Square,
  TerminalSquare,
  Video,
} from 'lucide-react'
import { useConfig } from '../../api/config'
import { useAlarmClips, useLatestPositions, useMediaSessions, useRecentAlarmFiles, useRecentAlarms, useRecentGpsReports, useRegistryDevices, useServices, useStartLive, useStopLive, useTerminals, useClipSse } from '../../api/hooks'
import type { AlarmClip, AlarmFile, LatestPosition, MediaSession, RecentAlarm, RecentGpsReport, RegistryDevice, Terminal } from '../../types'
import AlarmMediaModal, { type MediaModalItem } from '../../components/AlarmMediaModal'
import { alarmLabel } from '../../components/alarmLabels'

const JT808_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

const RECEIVED_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

type MonitorMode = 'map' | 'video'
type FleetFilter = 'all' | 'online' | 'risk' | 'streaming'
type BottomTab = 'vehicles' | 'alarms' | 'events' | 'media' | 'commands'
type MonitorTerminal = Terminal & {
  registered: boolean
  online: boolean
  orgName?: string | null
  lifecycleStatus?: string | null
  lastSeenAt?: string | null
}

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

function displayName(terminal: Pick<MonitorTerminal, 'plateNumber' | 'terminalId'>) {
  return terminal.plateNumber || terminal.terminalId
}

function toMonitorTerminal(device: RegistryDevice, live?: Terminal): MonitorTerminal {
  return {
    terminalId: device.terminalId,
    connectedAt: live?.connectedAt ?? device.lastSeenAt ?? '',
    plateNumber: live?.plateNumber || device.plateNumber || '',
    plateColor: live?.plateColor ?? 0,
    plateColorName: live?.plateColorName ?? '',
    manufacturerId: live?.manufacturerId || device.manufacturerId || '',
    registered: true,
    online: Boolean(live),
    orgName: device.orgName,
    lifecycleStatus: device.lifecycleStatus,
    lastSeenAt: device.lastSeenAt,
  }
}

function formatGpsTime(value: string | null | undefined) {
  return value ? JT808_TIME_FORMAT.format(new Date(value)) : '—'
}

export default function VehiclesPage() {
  const config = useConfig()
  const home = useMemo<[number, number]>(
    () => [config.mapCenterLon, config.mapCenterLat],
    [config.mapCenterLon, config.mapCenterLat],
  )

  const { data: terminals = [], isLoading } = useTerminals()
  const { data: registryDevices = [] } = useRegistryDevices()
  const { data: positions = [] } = useLatestPositions()
  const { data: reports = [] } = useRecentGpsReports(120)
  const { data: alarms = [] } = useRecentAlarms(160)
  const { data: alarmFiles = [] } = useRecentAlarmFiles(160)
  const { data: clips = [] } = useAlarmClips()
  const { data: sessions = [] } = useMediaSessions()
  const { data: services = [] } = useServices()
  const queryClient = useQueryClient()

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FleetFilter>('all')
  const [mode, setMode] = useState<MonitorMode>('map')
  const [bottomTab, setBottomTab] = useState<BottomTab>('events')
  const [videoGrid, setVideoGrid] = useState<1 | 4 | 6 | 9>(4)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [livePoint, setLivePoint] = useState<{ x: number; y: number; label: string; gpsTime: string; speed: number } | null>(null)
  const [mediaItems, setMediaItems] = useState<MediaModalItem[]>([])
  const [mediaIndex, setMediaIndex] = useState(-1)

  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())

  const monitorTerminals = useMemo<MonitorTerminal[]>(() => {
    const liveByTerminal = new Map(terminals.map(t => [t.terminalId, t]))
    const rows = new Map<string, MonitorTerminal>()
    for (const device of registryDevices) {
      const live = liveByTerminal.get(device.terminalId)
      rows.set(device.terminalId, toMonitorTerminal(device, live))
    }
    for (const live of terminals) {
      if (!rows.has(live.terminalId)) {
        rows.set(live.terminalId, {
          ...live,
          registered: false,
          online: true,
          lastSeenAt: live.connectedAt,
        })
      }
    }
    return Array.from(rows.values()).sort((a, b) => Number(b.online) - Number(a.online) || displayName(a).localeCompare(displayName(b)))
  }, [registryDevices, terminals])

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
  const alarmClipsByAlarm = useMemo(() => {
    const map = new Map<string, AlarmClip[]>()
    for (const alarm of alarms) {
      const linked = clips.filter(clip => matchesIncidentClip(alarm, clip)).slice(0, 3)
      if (linked.length) map.set(alarm.alarmId, linked)
    }
    return map
  }, [alarms, clips])
  const alarmFilesByAlarm = useMemo(() => {
    const map = new Map<string, AlarmFile[]>()
    for (const file of alarmFiles) {
      const list = map.get(file.alarmId) ?? []
      list.push(file)
      map.set(file.alarmId, list)
    }
    return map
  }, [alarmFiles])
  const reportClipsByRow = useMemo(() => {
    const map = new Map<string, AlarmClip[]>()
    for (const report of reports) {
      const linked = clips.filter(clip => matchesReportClip(report, clip)).slice(0, 4)
      if (linked.length) map.set(reportKey(report), linked)
    }
    return map
  }, [clips, reports])
  const reportFilesByRow = useMemo(() => {
    const map = new Map<string, AlarmFile[]>()
    for (const report of reports) {
      const linked = alarmFiles.filter(file => matchesReportFile(report, file)).slice(0, 4)
      if (linked.length) map.set(reportKey(report), linked)
    }
    return map
  }, [alarmFiles, reports])
  const sessionsByTerminal = useMemo(() => {
    const map = new Map<string, MediaSession[]>()
    for (const terminal of monitorTerminals) {
      const list = sessions.filter(session => idMatches(terminal.terminalId, session.terminalId) && session.active)
      if (list.length) map.set(terminal.terminalId, list)
    }
    return map
  }, [sessions, monitorTerminals])
  const liveSessions = useMemo(() => sessions.filter(session => session.active), [sessions])

  const filteredTerminals = useMemo(() => {
    const term = query.trim().toLowerCase()
    return monitorTerminals.filter(t => {
      const matchesQuery =
        !term ||
        t.terminalId.toLowerCase().includes(term) ||
        (t.plateNumber || '').toLowerCase().includes(term) ||
        (t.manufacturerId || '').toLowerCase().includes(term) ||
        (t.orgName || '').toLowerCase().includes(term)
      if (!matchesQuery) return false
      if (filter === 'online') return t.online
      if (filter === 'risk') return (alarmsByTerminal.get(t.terminalId)?.length ?? 0) > 0
      if (filter === 'streaming') return (sessionsByTerminal.get(t.terminalId)?.length ?? 0) > 0
      return true
    })
  }, [alarmsByTerminal, filter, monitorTerminals, query, sessionsByTerminal])

  const selected = useMemo(() => {
    if (!selectedId) return filteredTerminals[0] ?? monitorTerminals[0] ?? null
    return monitorTerminals.find(t => t.terminalId === selectedId) ?? filteredTerminals[0] ?? null
  }, [filteredTerminals, selectedId, monitorTerminals])

  const selectedPosition = selected ? positionByTerminal.get(selected.terminalId) : undefined
  const selectedAlarms = selected ? alarmsByTerminal.get(selected.terminalId) ?? [] : []
  const activeStreams = sessions.filter(s => s.active).length
  const onlineTerminals = monitorTerminals.filter(t => t.online).length
  const riskyTerminals = monitorTerminals.filter(t => (alarmsByTerminal.get(t.terminalId)?.length ?? 0) > 0).length
  const runningServices = services.filter(service => service.running).length

  useEffect(() => {
    if (!selectedId && monitorTerminals.length > 0) setSelectedId(monitorTerminals[0].terminalId)
  }, [selectedId, monitorTerminals])

  const handleClip = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['alarms'] })
    queryClient.invalidateQueries({ queryKey: ['gps-recent'] })
    queryClient.invalidateQueries({ queryKey: ['clips'] })
    queryClient.invalidateQueries({ queryKey: ['alarm-files-recent'] })
    queryClient.invalidateQueries({ queryKey: ['alarm-files'] })
  }, [queryClient])

  const openMedia = useCallback((items: MediaModalItem[], index = 0) => {
    if (items.length === 0) return
    setMediaItems(items)
    setMediaIndex(Math.max(0, Math.min(index, items.length - 1)))
  }, [])

  const closeMedia = useCallback(() => {
    setMediaItems([])
    setMediaIndex(-1)
  }, [])

  useClipSse(handleClip)

  useEffect(() => {
    if (!config.mapboxToken) return
    mapboxgl.accessToken = config.mapboxToken
  }, [config.mapboxToken])

  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !config.mapboxToken) return
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: home,
      zoom: config.mapZoom,
    })
    map.on('load', () => setMapReady(true))
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      setMapReady(false)
      setLivePoint(null)
    }
  }, [config.mapZoom, config.mapboxToken, home])

  useEffect(() => {
    if (mode !== 'map') return
    const map = mapRef.current
    const container = mapContainer.current
    if (!map || !container) return
    const resize = () => map.resize()
    const frame = window.requestAnimationFrame(resize)
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    window.addEventListener('resize', resize)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [mode, videoGrid, filteredTerminals.length, selectedId])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
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
  }, [alarmsByTerminal, filteredTerminals, home, mapReady, positionByTerminal, selected?.terminalId, sessionsByTerminal])

  useEffect(() => {
    const map = mapRef.current
    if (!selectedPosition || !map || !mapReady) return
    const center: [number, number] = [selectedPosition.lon, selectedPosition.lat]
    map.jumpTo({ center, zoom: Math.max(config.mapZoom, 12) })
    const point = map.project(center)
    setLivePoint({
      x: point.x,
      y: point.y,
      label: selected?.plateNumber || selected?.terminalId || 'live',
      gpsTime: selectedPosition.gpsTime,
      speed: selectedPosition.speed,
    })
  }, [config.mapZoom, mapReady, selected?.plateNumber, selected?.terminalId, selectedPosition])

  return (
    <div className="monitor-page">
      <div className="monitor-top">
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

          <div className="monitor-mini-section monitor-live-strip">
            <div className="monitor-section-title">Live Channels</div>
            {liveSessions.length ? (
              liveSessions.slice(0, 6).map(session => (
                <div key={`${session.terminalId}:${session.channelId}`} className="monitor-channel-row">
                  <span>{session.terminalId}</span>
                  <span>Ch {session.channelId} · {session.frames.toLocaleString()}</span>
                </div>
              ))
            ) : (
              <div className="monitor-muted">No active stream</div>
            )}
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
              <MonitorKpi icon={Radio} label="Online" value={`${onlineTerminals}/${monitorTerminals.length}`} tone="ok" />
              <MonitorKpi icon={MapPinned} label="GPS" value={String(positions.length)} tone="info" />
              <MonitorKpi icon={Bell} label="Risk" value={String(riskyTerminals)} tone={riskyTerminals ? 'warn' : 'muted'} />
              <MonitorKpi icon={Video} label="Streams" value={String(activeStreams)} tone={activeStreams ? 'ok' : 'muted'} />
              <MonitorKpi icon={Square} label="Services" value={`${runningServices}/${services.length}`} tone={services.length && runningServices === services.length ? 'ok' : 'info'} />
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
            {mode === 'video' && (
              <div className="monitor-grid-toggle" aria-label="Video grid">
                {[1, 4, 6, 9].map(size => (
                  <button key={size} className={videoGrid === size ? 'active' : ''} onClick={() => setVideoGrid(size as 1 | 4 | 6 | 9)}>
                    {size}x
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="monitor-stage">
            {mode === 'map' ? (
              config.mapboxToken ? (
                <div ref={mapContainer} className="monitor-map-stage" />
              ) : (
                <div className="monitor-map-fallback technical-grid">Map token unavailable</div>
              )
            ) : (
              <VideoWall terminals={filteredTerminals} sessionsByTerminal={sessionsByTerminal} gridSize={videoGrid} />
            )}

            {mode === 'map' && livePoint && (
              <div
                className="monitor-live-pin"
                style={{
                  left: `${livePoint.x}px`,
                  top: `${livePoint.y}px`,
                }}
              >
                <span className="monitor-live-pin-ring" />
                <span className="monitor-live-pin-dot" />
                <div className="monitor-live-pin-label">
                  <div className="monitor-live-pin-title">{livePoint.label}</div>
                  <div className="monitor-live-pin-meta">
                    {livePoint.speed.toFixed(0)} km/h · {RECEIVED_TIME_FORMAT.format(new Date(livePoint.gpsTime))}
                  </div>
                </div>
              </div>
            )}

            <div className="monitor-map-legend">
              <span><i className="ok" /> Online</span>
              <span><i className="warn" /> Alarm</span>
              <span><i className="stream" /> Streaming</span>
            </div>
          </div>
        </section>

        <aside className="monitor-detail">
          {selected ? (
          <TerminalInspector
            terminal={selected}
            position={selectedPosition}
            alarms={selectedAlarms}
          />
          ) : (
            <div className="monitor-empty">Select a terminal</div>
          )}
        </aside>
      </div>

      <div className="monitor-bottom-shell">
        <BottomPanel
          activeTab={bottomTab}
          onTabChange={setBottomTab}
          terminals={filteredTerminals}
          positionsByTerminal={positionByTerminal}
          sessionsByTerminal={sessionsByTerminal}
          alarms={alarms}
          reports={reports}
          files={alarmFiles}
          clips={clips}
          alarmClipsByAlarm={alarmClipsByAlarm}
          alarmFilesByAlarm={alarmFilesByAlarm}
          reportClipsByRow={reportClipsByRow}
          reportFilesByRow={reportFilesByRow}
          onSelect={setSelectedId}
          onOpenMedia={openMedia}
        />
      </div>

      <AlarmMediaModal
        open={mediaItems.length > 0 && mediaIndex >= 0}
        items={mediaItems}
        index={mediaIndex}
        onClose={closeMedia}
        onSelectIndex={setMediaIndex}
      />
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
  terminal: MonitorTerminal
  position?: LatestPosition
  alarmCount: number
  streamCount: number
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button className={`monitor-vehicle-card ${selected ? 'active' : ''}`} onClick={onSelect}>
      <div className="monitor-vehicle-main">
        <span className={`monitor-status-dot ${alarmCount ? 'warn' : terminal.online ? 'ok' : 'offline'}`} />
        <div>
          <div className="monitor-vehicle-id">{terminal.plateNumber || terminal.terminalId}</div>
          <div className="monitor-vehicle-sub">{terminal.terminalId}</div>
        </div>
      </div>
      <div className="monitor-vehicle-meta">
        <span className={terminal.online ? 'online' : 'offline'}>{terminal.online ? 'online' : 'offline'}</span>
        <span>{terminal.registered ? 'registered' : 'live-only'}</span>
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

function VideoWall({ terminals, sessionsByTerminal, gridSize }: {
  terminals: MonitorTerminal[]
  sessionsByTerminal: Map<string, MediaSession[]>
  gridSize: 1 | 4 | 6 | 9
}) {
  const liveTerminals = terminals.filter(t => (sessionsByTerminal.get(t.terminalId)?.length ?? 0) > 0)
  const preferred = liveTerminals.length ? liveTerminals : terminals
  const cells = preferred.slice(0, gridSize)
  return (
    <div className={`monitor-video-wall grid-${gridSize}`}>
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
      {cells.length === 0 && <div className="monitor-empty compact">No terminals available</div>}
    </div>
  )
}

function TerminalInspector({ terminal, position, alarms }: {
  terminal: MonitorTerminal
  position?: LatestPosition
  alarms: RecentAlarm[]
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
          ['Status', `${terminal.registered ? 'registered' : 'unregistered'} / ${terminal.online ? 'online' : 'offline'}`],
          ['Organization', terminal.orgName || '—'],
          ['GPS', position ? `${position.lat.toFixed(6)}, ${position.lon.toFixed(6)}` : '—'],
          ['Speed', position ? `${position.speed.toFixed(1)} km/h` : '—'],
          ['Heading', position ? `${position.direction} deg` : '—'],
          ['GPS time', formatGpsTime(position?.gpsTime)],
        ]} />

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
  activeTab,
  onTabChange,
  terminals,
  positionsByTerminal,
  sessionsByTerminal,
  alarms,
  reports,
  files,
  clips,
  alarmClipsByAlarm,
  alarmFilesByAlarm,
  reportClipsByRow,
  reportFilesByRow,
  onSelect,
  onOpenMedia,
}: {
  activeTab: BottomTab
  onTabChange: (tab: BottomTab) => void
  terminals: MonitorTerminal[]
  positionsByTerminal: Map<string, LatestPosition>
  sessionsByTerminal: Map<string, MediaSession[]>
  alarms: RecentAlarm[]
  reports: RecentGpsReport[]
  files: AlarmFile[]
  clips: AlarmClip[]
  alarmClipsByAlarm: Map<string, AlarmClip[]>
  alarmFilesByAlarm: Map<string, AlarmFile[]>
  reportClipsByRow: Map<string, AlarmClip[]>
  reportFilesByRow: Map<string, AlarmFile[]>
  onSelect: (terminalId: string) => void
  onOpenMedia: (items: MediaModalItem[], index?: number) => void
}) {
  const tabs: { id: BottomTab; label: string; count: number }[] = [
    { id: 'vehicles', label: 'Vehicles', count: terminals.length },
    { id: 'alarms', label: 'Active Alarm', count: alarms.length },
    { id: 'events', label: '0x0200 Feed', count: reports.length },
    { id: 'media', label: 'Media', count: files.length + clips.length },
    { id: 'commands', label: 'Commands', count: terminals.filter(t => t.online).length },
  ]

  return (
    <div className="monitor-bottom">
      <div className="monitor-alarm-header">
        <div>
          <div className="eyebrow text-[9px]">Monitor Workbench</div>
          <div className="monitor-alarm-title">{tabs.find(tab => tab.id === activeTab)?.label}</div>
        </div>
        <span className="monitor-count">{tabs.find(tab => tab.id === activeTab)?.count ?? 0}</span>
      </div>
      <div className="monitor-bottom-tabs">
        {tabs.map(tab => (
          <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => onTabChange(tab.id)}>
            {tab.label}
            <span>{tab.count}</span>
          </button>
        ))}
      </div>
      <div className="monitor-bottom-body">
        {activeTab === 'vehicles' && (
          <CompactTable
            headers={['Vehicle', 'Terminal', 'Status', 'Speed', 'Streams', 'GPS Time', 'Org']}
            rows={terminals.map(terminal => {
              const position = positionsByTerminal.get(terminal.terminalId)
              return [
                displayName(terminal),
                <button className="monitor-link" onClick={() => onSelect(terminal.terminalId)}>{terminal.terminalId}</button>,
                `${terminal.registered ? 'registered' : 'live-only'} / ${terminal.online ? 'online' : 'offline'}`,
                position ? `${position.speed.toFixed(1)} km/h` : '—',
                String(sessionsByTerminal.get(terminal.terminalId)?.length ?? 0),
                formatGpsTime(position?.gpsTime),
                terminal.orgName || '—',
              ]
            })}
          />
        )}
        {activeTab === 'alarms' && (
          <CompactTable
            headers={['Alarm', 'Terminal', 'Type', 'Speed', 'Location', 'Media', 'GPS Time', 'Received']}
            rows={alarms.map(alarm => [
              alarm.alarmId,
              <button className="monitor-link" onClick={() => onSelect(alarm.sim)}>{alarm.sim}</button>,
              `${alarmLabel(alarm.alarmType)} / L${alarm.alarmLevel}`,
              `${alarm.speed.toFixed(1)} km/h`,
              `${alarm.lat.toFixed(5)}, ${alarm.lon.toFixed(5)}`,
              <AlarmEvidenceBadge
                clips={alarmClipsByAlarm.get(alarm.alarmId) ?? []}
                files={alarmFilesByAlarm.get(alarm.alarmId) ?? []}
                onOpen={(items, index) => onOpenMedia(items, index)}
              />,
              RECEIVED_TIME_FORMAT.format(new Date(alarm.alarmStartTime)),
              RECEIVED_TIME_FORMAT.format(new Date(alarm.receivedAt)),
            ])}
          />
        )}
        {activeTab === 'events' && (
          <CompactTable
            headers={['GPS Time', 'Terminal', 'Alarm', 'Media', 'Speed', 'Heading', 'Location', 'Received']}
            rows={reports.map(report => {
              const key = reportKey(report)
              return [
                RECEIVED_TIME_FORMAT.format(new Date(report.gpsTime)),
                <button className="monitor-link" onClick={() => onSelect(report.sim)}>{report.sim}</button>,
                report.warnBit ? alarmLabel(report.warnBit) : 'Clear',
                <AlarmEvidenceBadge
                  clips={reportClipsByRow.get(key) ?? []}
                  files={reportFilesByRow.get(key) ?? []}
                  onOpen={(items, index) => onOpenMedia(items, index)}
                />,
                `${report.speed.toFixed(1)} km/h`,
                `${report.direction} deg`,
                `${report.lat.toFixed(5)}, ${report.lon.toFixed(5)}`,
                RECEIVED_TIME_FORMAT.format(new Date(report.receivedAt)),
              ]
            })}
          />
        )}
        {activeTab === 'media' && (
          <CompactTable
            headers={['Terminal', 'Alarm', 'Kind', 'File', 'Size', 'Time']}
            rows={[
              ...files.map(file => [
                <button className="monitor-link" onClick={() => onSelect(file.sim)}>{file.sim}</button>,
                alarmLabel(file.alarmType),
                isVideoFile(file.fileName, file.format) ? 'video' : 'image',
                <MediaLink label={file.fileName} onClick={() => {
                  const group = alarmFilesByAlarm.get(file.alarmId) ?? [file]
                  const media = buildFileMediaItems(file, group)
                  onOpenMedia(media.items, media.index)
                }} />,
                formatBytes(file.size),
                RECEIVED_TIME_FORMAT.format(new Date(file.uploadTime)),
              ]),
              ...clips.map(clip => [
                <button className="monitor-link" onClick={() => onSelect(clip.terminalId)}>{clip.terminalId}</button>,
                clip.alarmTypeName,
                clip.mediaTypeName,
                <MediaLink label={clip.fileName} onClick={() => onOpenMedia([buildClipMediaItem(clip)], 0)} />,
                formatBytes(clip.payloadSize),
                RECEIVED_TIME_FORMAT.format(new Date(clip.receivedAt)),
              ]),
            ]}
          />
        )}
        {activeTab === 'commands' && (
          <div className="monitor-command-grid">
            {terminals.map(terminal => (
              <div key={terminal.terminalId} className="monitor-command-card">
                <div>
                  <strong>{displayName(terminal)}</strong>
                  <span>{terminal.terminalId}</span>
                </div>
                <div className="monitor-command-actions">
                  <button onClick={() => onSelect(terminal.terminalId)}><TerminalSquare size={13} /> Select</button>
                  <button onClick={() => onSelect(terminal.terminalId)}><FileVideo size={13} /> Streams</button>
                </div>
              </div>
            ))}
          </div>
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

function AlarmEvidenceBadge({
  clips,
  files,
  onOpen,
}: {
  clips: AlarmClip[]
  files: AlarmFile[]
  onOpen: (items: MediaModalItem[], index?: number) => void
}) {
  if (files.length === 0 && clips.length === 0) {
    return <span className="monitor-evidence-empty">No media</span>
  }

  const imageCount = files.filter(file => isImageFile(file.fileName, file.format)).length
  const videoCount = files.filter(file => isVideoFile(file.fileName, file.format)).length
  const titles = [
    ...files.map(file => `${alarmLabel(file.alarmType)} · ${file.fileName} · ${formatBytes(file.size)}`),
    ...clips.map(clip => `${clip.mediaTypeName} · ${clip.alarmTypeName} · ${clip.fileName}`),
  ]

  return (
    <button
      type="button"
      className="monitor-evidence-badge"
      title={`${titles.join('\n')}\n\nOpen media`}
      onClick={() => onOpen(buildEvidenceItems(files, clips))}
    >
      <span className="monitor-evidence-count">{files.length || clips.length}</span>
      {imageCount > 0 && <span className="monitor-evidence-kind">img {imageCount}</span>}
      {videoCount > 0 && <span className="monitor-evidence-kind">vid {videoCount}</span>}
    </button>
  )
}

function MediaLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="monitor-media-link" onClick={onClick}>
      {label}
    </button>
  )
}

function buildEvidenceItems(files: AlarmFile[], clips: AlarmClip[]) {
  const items: MediaModalItem[] = []
  const groupedFiles = new Map<string, AlarmFile[]>()
  for (const file of files) {
    const list = groupedFiles.get(file.alarmId) ?? []
    list.push(file)
    groupedFiles.set(file.alarmId, list)
  }
  const seenGroups = new Set<string>()
  for (const file of files) {
    if (seenGroups.has(file.alarmId)) continue
    seenGroups.add(file.alarmId)
    const group = groupedFiles.get(file.alarmId) ?? [file]
    items.push(...group.map(mediaItemFromFile))
  }
  for (const clip of clips) {
    items.push(buildClipMediaItem(clip))
  }
  return items
}

function buildFileMediaItems(file: AlarmFile, group: AlarmFile[]): { items: MediaModalItem[]; index: number } {
  const items = group.length ? group.map(entry => mediaItemFromFile(entry)) : [mediaItemFromFile(file)]
  const index = Math.max(0, group.findIndex(entry => entry.path === file.path))
  return { items, index }
}

function buildClipMediaItem(clip: AlarmClip): MediaModalItem {
  return {
    key: clip.id,
    fileName: clip.fileName,
    src: clipFileNameHref(clip.fileName),
    kind: isVideoFile(clip.fileName, clip.formatCode) || clip.mediaType === 2 ? 'video' : 'image',
    title: `${clip.mediaTypeName} · ${clip.alarmTypeName}`,
    subtitle: clip.terminalId,
  }
}

function mediaItemFromFile(file: AlarmFile): MediaModalItem {
  return {
    key: file.path,
    fileName: file.fileName,
    src: clipFileNameHref(file.fileName),
    kind: isVideoFile(file.fileName, file.format) ? 'video' : 'image',
    title: alarmLabel(file.alarmType),
    subtitle: `${file.sim} · ${formatBytes(file.size)}`,
  }
}

function clipFileNameHref(fileName: string) {
  const parts = fileName.split('/').filter(Boolean).map(encodeURIComponent)
  return `/api/media/clips/${parts.join('/')}`
}

function isImageFile(fileName: string, format?: number) {
  return format === 0 || /\.(jpg|jpeg|png|tif|tiff)$/i.test(fileName)
}

function isVideoFile(fileName: string, format?: number) {
  return format === 4 || /\.(mp4|m4v|mov|webm|wmv)$/i.test(fileName)
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function matchesIncidentClip(alarm: RecentAlarm, clip: AlarmClip) {
  if (clip.terminalId !== alarm.sim) return false
  if (clip.eventCode === 0) return false
  const alarmTime = new Date(alarm.receivedAt).getTime()
  const clipTime = new Date(clip.receivedAt).getTime()
  return Math.abs(clipTime - alarmTime) <= 10 * 60 * 1000
}

function reportKey(report: RecentGpsReport) {
  return `${report.vehicleId}|${report.sim}|${report.gpsTime}|${report.receivedAt}`
}

function matchesReportClip(report: RecentGpsReport, clip: AlarmClip) {
  if (!report.warnBit) return false
  if (clip.terminalId !== report.sim) return false
  if (clip.eventCode === 0) return false
  const reportTime = new Date(report.receivedAt).getTime()
  const clipTime = new Date(clip.receivedAt).getTime()
  return Math.abs(clipTime - reportTime) <= 10 * 60 * 1000
}

function matchesReportFile(report: RecentGpsReport, file: AlarmFile) {
  if (!report.warnBit) return false
  if (file.sim !== report.sim) return false
  const reportTime = new Date(report.receivedAt).getTime()
  const fileTime = new Date(file.uploadTime).getTime()
  return Math.abs(fileTime - reportTime) <= 10 * 60 * 1000
}
