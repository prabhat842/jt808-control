import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAlarmClips, useClipSse, useRecentAlarmFiles, useRecentGpsReports } from '../../api/hooks'
import type { AlarmClip, AlarmFile, RecentGpsReport } from '../../types'
import AlarmMediaModal, { type MediaModalItem } from '../../components/AlarmMediaModal'
import { alarmLabel } from '../../components/alarmLabels'

const IST_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

export default function AlarmsPage() {
  const { data: reports = [] } = useRecentGpsReports(200)
  const { data: alarmFiles = [] } = useRecentAlarmFiles(200)
  const { data: clips = [] } = useAlarmClips()
  const [selected, setSelected] = useState<RecentGpsReport | null>(null)
  const [mediaItems, setMediaItems] = useState<MediaModalItem[]>([])
  const [mediaIndex, setMediaIndex] = useState(-1)
  const queryClient = useQueryClient()

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

  const recentReports = useMemo(() => reports, [reports])

  const selectedClips = useMemo(() => {
    if (!selected) return []
    return clips.filter(clip => matchesReportClip(selected, clip)).slice(0, 6)
  }, [clips, selected])

  const selectedFiles = useMemo(() => {
    if (!selected) return []
    return alarmFiles.filter(file => matchesReportFile(selected, file)).slice(0, 6)
  }, [alarmFiles, selected])

  const handleClip = useCallback(() => {
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
    if (!recentReports.length) {
      if (selected !== null) setSelected(null)
      return
    }
    if (!selected || !recentReports.some(report => reportKey(report) === reportKey(selected))) {
      setSelected(recentReports[0])
    }
  }, [recentReports, selected])

  return (
    <div className="flex h-full" style={{ background: 'var(--background)' }}>
      <div className="flex-1 p-6 overflow-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="eyebrow text-[9px] mb-1">Live 0x0200 Feed</div>
            <h1 className="font-display text-xl font-semibold" style={{ color: 'var(--foreground-strong)' }}>
              Recent Vehicle Reports
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="status-dot">
              <span className="status-dot-inner" style={{ background: 'var(--electric)', color: 'var(--electric)' }} />
            </span>
            <span className="font-mono text-[11px]" style={{ color: 'var(--muted-strong)' }}>
              {recentReports.length} recent rows
            </span>
          </div>
        </div>

        <div className="surface-panel overflow-hidden">
          {recentReports.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <div className="text-3xl mb-3 opacity-20">◉</div>
              <div className="font-mono text-[12px]" style={{ color: 'var(--muted)' }}>
                No recent 0x0200 reports
              </div>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['GPS Time', 'Vehicle', 'SIM', 'Alarm', 'Media', 'Location', 'Speed', 'Received'].map(h => (
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
                {recentReports.map((report, i) => {
                  const mediaKey = reportKey(report)
                  return (
                    <tr
                      key={mediaKey}
                      onClick={() => setSelected(report)}
                      className="cursor-pointer transition-colors"
                      style={{ borderBottom: i < recentReports.length - 1 ? '1px solid var(--border)' : 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-1)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td className="px-5 py-2.5 font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
                        {IST_TIME_FORMAT.format(new Date(report.gpsTime))}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-[11px]" style={{ color: 'var(--electric)' }}>
                        {report.vehicleId}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-[11px]" style={{ color: 'var(--muted-strong)' }}>
                        {report.sim}
                      </td>
                      <td className="py-2.5 pr-4">
                        {report.warnBit ? (
                          <span
                            className="font-mono text-[10px] px-2 py-0.5"
                            style={{
                              background: 'rgba(251,146,60,0.10)',
                              border: '1px solid rgba(251,146,60,0.25)',
                              borderRadius: 'var(--radius-sm)',
                              color: 'var(--status-warn)',
                            }}
                          >
                            {alarmLabel(report.warnBit)}
                          </span>
                        ) : (
                          <span
                            className="font-mono text-[10px] px-2 py-0.5"
                            style={{
                              background: 'rgba(148,163,184,0.10)',
                              border: '1px solid rgba(148,163,184,0.16)',
                              borderRadius: 'var(--radius-sm)',
                              color: 'var(--muted)',
                            }}
                          >
                            Clear
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <AlarmEvidenceBadge
                          clips={reportClipsByRow.get(mediaKey) ?? []}
                          files={reportFilesByRow.get(mediaKey) ?? []}
                          onOpen={(items, index) => openMedia(items, index)}
                        />
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
                        {report.lat.toFixed(4)}, {report.lon.toFixed(4)}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
                        {report.speed.toFixed(1)} km/h
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
                        {IST_TIME_FORMAT.format(new Date(report.receivedAt))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

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
              Report Detail
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
                ['Vehicle', selected.vehicleId],
                ['SIM', selected.sim],
                ['Alarm State', selected.warnBit ? alarmLabel(selected.warnBit) : 'Clear'],
                ['Location', `${selected.lat.toFixed(4)}, ${selected.lon.toFixed(4)}`],
                ['Speed', `${selected.speed.toFixed(1)} km/h`],
                ['GPS Time', IST_TIME_FORMAT.format(new Date(selected.gpsTime))],
                ['Received', IST_TIME_FORMAT.format(new Date(selected.receivedAt))],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label}>
                  <div className="eyebrow text-[9px]">{label}</div>
                  <div className="font-mono text-[11px] mt-0.5 break-all" style={{ color: 'var(--foreground-strong)' }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>

            <div className="surface-panel-quiet p-3 space-y-2.5">
              <div className="eyebrow text-[9px]">Media</div>
              {selectedFiles.length ? selectedFiles.map(file => (
                <div key={file.path} className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] pb-2 last:border-b-0 last:pb-0">
                  <div>
                    <button
                      type="button"
                      className="font-mono text-[11px] block"
                      style={{ color: 'var(--foreground-strong)', textDecoration: 'none', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                      onClick={() => {
                        const group = selectedFiles.filter(entry => entry.alarmId === file.alarmId)
                        openMedia(group.map(mediaItemFromFile), group.findIndex(entry => entry.path === file.path))
                      }}
                    >
                      {file.fileName}
                    </button>
                    <div className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
                      {IST_TIME_FORMAT.format(new Date(file.uploadTime))}
                    </div>
                  </div>
                  <div className="font-mono text-[11px]" style={{ color: 'var(--muted-strong)' }}>
                    {formatBytes(file.size)}
                  </div>
                </div>
              )) : selectedClips.length ? selectedClips.map(clip => (
                <div key={clip.id} className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] pb-2 last:border-b-0 last:pb-0">
                  <div>
                    <button
                      type="button"
                      className="font-mono text-[11px] block"
                      style={{ color: 'var(--foreground-strong)', textDecoration: 'none', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                      onClick={() => openMedia([mediaItemFromClip(clip)])}
                    >
                      {clip.mediaTypeName} · {clip.alarmTypeName}
                    </button>
                    <div className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
                      {IST_TIME_FORMAT.format(new Date(clip.receivedAt))}
                    </div>
                  </div>
                  <div className="font-mono text-[11px]" style={{ color: 'var(--muted-strong)' }}>
                    {formatBytes(clip.payloadSize)}
                  </div>
                </div>
              )) : (
                <div className="font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
                  No linked media yet
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
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

function mediaItemFromClip(clip: AlarmClip): MediaModalItem {
  return {
    key: clip.id,
    fileName: clip.fileName,
    src: clipFileNameHref(clip.fileName),
    kind: clip.mediaType === 2 ? 'video' : 'image',
    title: `${clip.mediaTypeName} · ${clip.alarmTypeName}`,
    subtitle: clip.terminalId,
  }
}

function clipFileNameHref(fileName: string) {
  const parts = fileName.split('/').filter(Boolean).map(encodeURIComponent)
  return `/api/media/clips/${parts.join('/')}`
}

function isVideoFile(fileName: string, format?: number) {
  return format === 4 || /\.(mp4|m4v|mov|webm|wmv)$/i.test(fileName)
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
  const count = clips.length + files.length
  if (!count) {
    return (
      <span className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
        None
      </span>
    )
  }
  return (
    <button
      type="button"
      className="font-mono text-[10px] px-2 py-0.5"
      style={{
        background: 'rgba(56,189,248,0.10)',
        border: '1px solid rgba(56,189,248,0.25)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--electric)',
        cursor: 'pointer',
      }}
      title="Open alarm media"
      onClick={event => {
        event.stopPropagation()
        onOpen([
          ...files.map(mediaItemFromFile),
          ...clips.map(mediaItemFromClip),
        ])
      }}
    >
      {count} media
    </button>
  )
}
