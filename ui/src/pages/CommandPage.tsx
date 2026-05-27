import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  ArrowRight,
  Bell,
  CirclePlay,
  Gauge,
  MapPinned,
  MonitorDot,
  RefreshCcw,
  RadioTower,
  Server,
  ShieldAlert,
  Wrench,
  Play,
  Square,
  TriangleAlert,
} from 'lucide-react'
import {
  useAlarmFiles,
  useAlarmClips,
  useLatestPositions,
  useMediaSessions,
  useRecentAlarms,
  useRegistrySummary,
  useServices,
  useStartService,
  useStopService,
  useTerminals,
} from '../api/hooks'
import type { AlarmClip, LatestPosition, MediaSession, RecentAlarm, ServiceStatus, Terminal } from '../types'

type Tone = 'ok' | 'warn' | 'muted'

type BoardCard =
  | {
      id: string
      lane: 'Incidents'
      kind: 'incident'
      tone: Tone
      title: string
      subtitle: string
      tags: string[]
      source: RecentAlarm
    }
  | {
      id: string
      lane: 'Fleet'
      kind: 'terminal'
      tone: Tone
      title: string
      subtitle: string
      tags: string[]
      source: Terminal
    }
  | {
      id: string
      lane: 'Media'
      kind: 'clip'
      tone: Tone
      title: string
      subtitle: string
      tags: string[]
      source: AlarmClip
    }
  | {
      id: string
      lane: 'Services'
      kind: 'service'
      tone: Tone
      title: string
      subtitle: string
      tags: string[]
      source: ServiceStatus
    }

export default function CommandPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const startService = useStartService()
  const stopService = useStopService()

  const { data: registry = { organizations: 0, devices: 0, vehicles: 0, drivers: 0, profiles: 0 } } = useRegistrySummary()
  const { data: terminals = [] } = useTerminals()
  const { data: services = [] } = useServices()
  const { data: alarms = [] } = useRecentAlarms(40)
  const { data: clips = [] } = useAlarmClips()
  const { data: sessions = [] } = useMediaSessions()
  const { data: positions = [] } = useLatestPositions()

  const [now, setNow] = useState(() => new Date())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  const positionByTerminal = useMemo(() => new Map(positions.map(p => [p.sim, p])), [positions])
  const sessionsByTerminal = useMemo(() => {
    const map = new Map<string, MediaSession[]>()
    for (const session of sessions) {
      const list = map.get(session.terminalId) ?? []
      list.push(session)
      map.set(session.terminalId, list)
    }
    return map
  }, [sessions])

  const board = useMemo<BoardCard[]>(() => {
    const incidentCards: BoardCard[] = alarms.slice(0, 8).map(alarm => ({
      id: `incident:${alarm.alarmId}`,
      lane: 'Incidents',
      kind: 'incident',
      tone: alarm.alarmLevel >= 3 ? 'warn' : 'muted',
      title: alarmLabel(alarm.alarmType),
      subtitle: `${alarm.sim} · ${ageLabel(alarm.receivedAt, now)}`,
      tags: [
        `L${alarm.alarmLevel}`,
        `${alarm.speed.toFixed(0)} km/h`,
        alarm.lat.toFixed(4),
        alarm.lon.toFixed(4),
      ],
      source: alarm,
    }))

    const fleetCards: BoardCard[] = terminals.slice(0, 8).map(terminal => {
      const live = positionByTerminal.get(terminal.terminalId)
      const streamCount = sessionsByTerminal.get(terminal.terminalId)?.length ?? 0
      const connectedAgo = ageLabel(terminal.connectedAt, now)
      const tone: Tone = streamCount > 0 ? 'ok' : live ? 'muted' : 'warn'
      return {
        id: `terminal:${terminal.terminalId}`,
        lane: 'Fleet',
        kind: 'terminal',
        tone,
        title: terminal.plateNumber || terminal.terminalId,
        subtitle: terminal.terminalId,
        tags: [
          live ? `${live.speed.toFixed(0)} km/h` : 'no GPS',
          streamCount ? `${streamCount} stream${streamCount > 1 ? 's' : ''}` : 'no stream',
          connectedAgo,
        ],
        source: terminal,
      }
    })

    const mediaCards: BoardCard[] = clips.slice(0, 8).map(clip => ({
      id: `clip:${clip.id}`,
      lane: 'Media',
      kind: 'clip',
      tone: clip.payloadSize > 0 ? 'ok' : 'muted',
      title: clip.alarmTypeName || clip.fileName,
      subtitle: `${clip.terminalId} · ${ageLabel(clip.receivedAt, now)}`,
      tags: [
        `ch ${clip.channelId}`,
        formatBytes(clip.payloadSize),
        clip.mediaTypeName,
      ],
      source: clip,
    }))

    const serviceCards: BoardCard[] = services.map(service => ({
      id: `service:${service.id}`,
      lane: 'Services',
      kind: 'service',
      tone: service.running ? 'ok' : 'warn',
      title: service.name,
      subtitle: service.group,
      tags: [
        service.running ? `pid ${service.pid ?? 'n/a'}` : 'stopped',
        service.description,
      ],
      source: service,
    }))

    return [...incidentCards, ...fleetCards, ...mediaCards, ...serviceCards]
  }, [alarms, clips, now, positionByTerminal, services, sessionsByTerminal, terminals])

  useEffect(() => {
    if (!selectedId && board.length > 0) {
      setSelectedId(board[0].id)
    } else if (selectedId && !board.some(card => card.id === selectedId)) {
      setSelectedId(board[0]?.id ?? null)
    }
  }, [board, selectedId])

  const selected = board.find(card => card.id === selectedId) ?? null
  const selectedAlarmFiles = useAlarmFiles(selected?.kind === 'incident' ? selected.source.alarmId : null)
  const selectedIncidentClips = useMemo(() => {
    if (!selected || selected.kind !== 'incident') return []
    return clips.filter(clip => matchesIncidentClip(selected.source, clip)).slice(0, 6)
  }, [clips, selected])

  const incidentCount = board.filter(card => card.kind === 'incident').length
  const fleetCount = terminals.length
  const liveStreams = sessions.filter(session => session.active).length
  const runningServices = services.filter(service => service.running).length
  const unresolvedServices = services.length - runningServices

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['services'] }),
      queryClient.invalidateQueries({ queryKey: ['terminals'] }),
      queryClient.invalidateQueries({ queryKey: ['media-sessions'] }),
      queryClient.invalidateQueries({ queryKey: ['alarms'] }),
      queryClient.invalidateQueries({ queryKey: ['clips'] }),
      queryClient.invalidateQueries({ queryKey: ['gps-latest'] }),
      queryClient.invalidateQueries({ queryKey: ['registry-summary'] }),
    ])
  }

  return (
    <div className="command-page">
      <section className="command-hero surface-panel-quiet">
        <div className="command-hero-copy">
          <div className="eyebrow text-[9px]">Command Dashboard</div>
          <div className="command-title">Enterprise Kanban</div>
          <div className="command-subtitle">
            Active incidents, live fleet, media clips, and runtime services in one operational board.
          </div>
        </div>

        <div className="command-actions">
          <button className="btn-secondary" onClick={() => navigate('/vehicles')}>
            <MonitorDot size={14} strokeWidth={2} />
            Live Monitor
          </button>
          <button className="btn-secondary" onClick={() => navigate('/alarms')}>
            <ShieldAlert size={14} strokeWidth={2} />
            Safety
          </button>
          <button className="btn-secondary" onClick={() => navigate('/services')}>
            <Wrench size={14} strokeWidth={2} />
            Services
          </button>
          <button className="btn-secondary" onClick={refresh}>
            <RefreshCcw size={14} strokeWidth={2} />
            Refresh
          </button>
        </div>
      </section>

      <section className="command-metrics">
        <Metric icon={Gauge} label="Devices" value={String(registry.devices)} tone={registry.devices > 0 ? 'ok' : 'muted'} />
        <Metric icon={RadioTower} label="Terminals" value={String(fleetCount)} tone={fleetCount > 0 ? 'ok' : 'muted'} />
        <Metric icon={Bell} label="Incidents" value={String(incidentCount)} tone={incidentCount > 0 ? 'warn' : 'muted'} />
        <Metric icon={CirclePlay} label="Streams" value={String(liveStreams)} tone={liveStreams > 0 ? 'ok' : 'muted'} />
        <Metric icon={Server} label="Services" value={`${runningServices}/${services.length}`} tone={unresolvedServices === 0 && services.length > 0 ? 'ok' : 'warn'} />
        <Metric icon={Activity} label="Clips" value={String(clips.length)} tone={clips.length > 0 ? 'ok' : 'muted'} />
      </section>

      <section className="command-board">
        <KanbanLane
          title="Incidents"
          icon={TriangleAlert}
          count={incidentCount}
          cards={board.filter(card => card.kind === 'incident')}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <KanbanLane
          title="Fleet"
          icon={MapPinned}
          count={fleetCount}
          cards={board.filter(card => card.kind === 'terminal')}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <KanbanLane
          title="Media"
          icon={CirclePlay}
          count={clips.length}
          cards={board.filter(card => card.kind === 'clip')}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <KanbanLane
          title="Services"
          icon={Wrench}
          count={services.length}
          cards={board.filter(card => card.kind === 'service')}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

        <aside className="command-detail surface-panel">
          {selected ? (
            <>
              <div className="command-detail-head">
                <div>
                  <div className="eyebrow text-[9px]">{selected.lane}</div>
                  <div className="command-detail-title">{selected.title}</div>
                  <div className="command-detail-sub">{selected.subtitle}</div>
                </div>
                <span className={`command-badge ${selected.tone}`}>{selected.kind}</span>
              </div>

              <div className="command-detail-body">
                <div className="command-tag-row">
                  {selected.tags.map(tag => <span key={tag} className="command-tag">{tag}</span>)}
                </div>

                {selected.kind === 'incident' && (
                  <>
                    <DetailRow label="Alarm" value={alarmLabel(selected.source.alarmType)} />
                    <DetailRow label="Terminal" value={selected.source.sim} />
                    <DetailRow label="Speed" value={`${selected.source.speed.toFixed(0)} km/h`} />
                    <DetailRow label="Time" value={new Date(selected.source.receivedAt).toLocaleString()} />
                    <div className="command-mini-section">
                      <div className="command-section-title">Evidence</div>
                      {selectedIncidentClips.length ? selectedIncidentClips.map(clip => (
                        <div key={clip.id} className="command-info-row">
                          <span>{clip.mediaTypeName} · {clip.alarmTypeName}</span>
                          <strong>{formatBytes(clip.payloadSize)}</strong>
                        </div>
                      )) : <div className="command-empty">No linked media yet</div>}
                    </div>
                    <div className="command-mini-section">
                      <div className="command-section-title">Alarm files</div>
                      {selectedAlarmFiles.data?.length ? selectedAlarmFiles.data.map(file => (
                        <div key={file.path} className="command-info-row">
                          <span>{file.fileName}</span>
                          <strong>{formatBytes(file.size)}</strong>
                        </div>
                      )) : <div className="command-empty">No uploaded files</div>}
                    </div>
                    <div className="command-detail-actions">
                      <button className="btn-primary" onClick={() => navigate('/alarms')}>
                        <ArrowRight size={14} strokeWidth={2} />
                        Open Safety
                      </button>
                    </div>
                  </>
                )}

                {selected.kind === 'terminal' && (
                  <>
                    <DetailRow label="Connected" value={new Date(selected.source.connectedAt).toLocaleString()} />
                    <DetailRow label="Plate" value={selected.source.plateNumber || 'n/a'} />
                    <DetailRow label="Manufacturer" value={selected.source.manufacturerId || 'n/a'} />
                    <DetailRow label="Position" value={describePosition(positionByTerminal.get(selected.source.terminalId))} />
                    <DetailRow label="Streams" value={String(sessionsByTerminal.get(selected.source.terminalId)?.length ?? 0)} />
                    <div className="command-detail-actions">
                      <button className="btn-primary" onClick={() => navigate('/vehicles')}>
                        <MonitorDot size={14} strokeWidth={2} />
                        Open Monitor
                      </button>
                    </div>
                  </>
                )}

                {selected.kind === 'clip' && (
                  <>
                    <DetailRow label="Terminal" value={selected.source.terminalId} />
                    <DetailRow label="Event" value={selected.source.alarmTypeName} />
                    <DetailRow label="Recorded" value={new Date(selected.source.receivedAt).toLocaleString()} />
                    <DetailRow label="Payload" value={formatBytes(selected.source.payloadSize)} />
                    <div className="command-detail-actions">
                      <button className="btn-primary" onClick={() => navigate('/media')}>
                        <CirclePlay size={14} strokeWidth={2} />
                        Open Media
                      </button>
                    </div>
                  </>
                )}

                {selected.kind === 'service' && (
                  <>
                    <DetailRow label="Group" value={selected.source.group} />
                    <DetailRow label="Description" value={selected.source.description} />
                    <DetailRow label="State" value={selected.source.running ? 'running' : 'stopped'} />
                    <DetailRow label="PID" value={selected.source.pid == null ? 'n/a' : String(selected.source.pid)} />
                    <div className="command-detail-actions">
                      {selected.source.running ? (
                        <button
                          className="btn-secondary"
                          disabled={stopService.isPending}
                          onClick={() => stopService.mutate(selected.source.id)}
                        >
                          <Square size={14} strokeWidth={2} />
                          Stop
                        </button>
                      ) : (
                        <button
                          className="btn-primary"
                          disabled={startService.isPending}
                          onClick={() => startService.mutate(selected.source.id)}
                        >
                          <Play size={14} strokeWidth={2} />
                          Start
                        </button>
                      )}
                      <button className="btn-secondary" onClick={() => navigate('/services')}>
                        <ArrowRight size={14} strokeWidth={2} />
                        Open Services
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="command-empty">No item selected</div>
          )}
        </aside>
      </section>
    </div>
  )
}

function matchesIncidentClip(alarm: RecentAlarm, clip: AlarmClip) {
  if (clip.terminalId !== alarm.sim) return false
  if (clip.eventCode === 0) return false
  const alarmTime = new Date(alarm.receivedAt).getTime()
  const clipTime = new Date(clip.receivedAt).getTime()
  return Math.abs(clipTime - alarmTime) <= 10 * 60 * 1000
}

function KanbanLane({
  title,
  icon: Icon,
  count,
  cards,
  selectedId,
  onSelect,
}: {
  title: string
  icon: typeof Activity
  count: number
  cards: BoardCard[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <section className="command-lane">
      <div className="command-lane-head">
        <div className="command-lane-title">
          <Icon size={14} strokeWidth={2} />
          <span>{title}</span>
        </div>
        <span className="command-lane-count">{count}</span>
      </div>
      <div className="command-lane-body">
        {cards.length ? cards.map(card => (
          <button
            key={card.id}
            className={`command-card ${selectedId === card.id ? 'active' : ''}`}
            onClick={() => onSelect(card.id)}
          >
            <div className="command-card-head">
              <div>
                <div className="command-card-title">{card.title}</div>
                <div className="command-card-sub">{card.subtitle}</div>
              </div>
              <span className={`command-card-pill ${card.tone}`}>{card.kind}</span>
            </div>
            <div className="command-card-tags">
              {card.tags.map(tag => <span key={tag} className="command-tag">{tag}</span>)}
            </div>
          </button>
        )) : <div className="command-empty compact">No records</div>}
      </div>
    </section>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Activity
  label: string
  value: string
  tone: Tone
}) {
  return (
    <div className={`command-metric ${tone}`}>
      <Icon size={15} strokeWidth={2} />
      <div>
        <div className="command-metric-label">{label}</div>
        <div className="command-metric-value">{value}</div>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="command-info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function alarmLabel(alarmType: number) {
  const labels: Record<number, string> = {
    1: 'SOS',
    2: 'Overspeed',
    3: 'Fatigue',
    4: 'Danger',
    5: 'GNSS failure',
    6: 'Route deviation',
    7: 'Area entry',
    8: 'Area exit',
  }
  return labels[alarmType] ?? `Alarm ${alarmType}`
}

function ageLabel(value: string, now: Date) {
  const ts = new Date(value).getTime()
  const delta = Math.max(0, now.getTime() - ts)
  const mins = Math.floor(delta / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function formatBytes(size: number) {
  if (size <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = size
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

function describePosition(position?: LatestPosition) {
  if (!position) return 'no GPS'
  return `${position.speed.toFixed(0)} km/h · ${position.lat.toFixed(4)}, ${position.lon.toFixed(4)}`
}
