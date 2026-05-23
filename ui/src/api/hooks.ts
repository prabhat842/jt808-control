import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import client from './client'
import type { Terminal, MediaSession, AlarmClip, ServiceStatus, LatestPosition, RecentAlarm, AlarmFile } from '../types'

// ── Services ──────────────────────────────────────────────────────────────

export function useServices() {
  return useQuery<ServiceStatus[]>({
    queryKey: ['services'],
    queryFn: () => client.get('/status').then(r => r.data),
    refetchInterval: 2000,
  })
}

export function useStartService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => client.post(`/start/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  })
}

export function useStopService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => client.post(`/stop/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  })
}

export function useStartAll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => client.post('/start-all').then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  })
}

export function useStopAll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => client.post('/stop-all').then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  })
}

// ── Live terminals & media ────────────────────────────────────────────────

export function useTerminals() {
  return useQuery<Terminal[]>({
    queryKey: ['terminals'],
    queryFn: () => client.get('/terminals').then(r => r.data),
    refetchInterval: 3000,
  })
}

export function useMediaSessions() {
  return useQuery<MediaSession[]>({
    queryKey: ['media-sessions'],
    queryFn: () => client.get('/sessions').then(r => r.data),
    refetchInterval: 3000,
  })
}

export function useStartLive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ terminal, channel, type = 0 }: { terminal: string; channel: number; type?: number }) =>
      client.get('/live/start', { params: { terminal, channel, type } }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['media-sessions'] }),
  })
}

export function useStopLive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ terminal, channel }: { terminal: string; channel: number }) =>
      client.get('/live/stop', { params: { terminal, channel } }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['media-sessions'] }),
  })
}

// ── ClickHouse reads ──────────────────────────────────────────────────────

export function useLatestPositions() {
  return useQuery<LatestPosition[]>({
    queryKey: ['gps-latest'],
    queryFn: () => client.get('/gps/latest').then(r => r.data),
    refetchInterval: 5000,
  })
}

export function useRecentAlarms(limit = 200) {
  return useQuery<RecentAlarm[]>({
    queryKey: ['alarms', limit],
    queryFn: () => client.get('/alarms', { params: { limit } }).then(r => r.data),
    refetchInterval: 10000,
  })
}

export function useAlarmFiles(alarmId: string | null) {
  return useQuery<AlarmFile[]>({
    queryKey: ['alarm-files', alarmId],
    queryFn: () => client.get('/alarm-files', { params: { alarmId } }).then(r => r.data),
    enabled: !!alarmId,
  })
}

// ── Alarm clips (in-memory, SSE) ──────────────────────────────────────────

export function useAlarmClips() {
  return useQuery<AlarmClip[]>({
    queryKey: ['clips'],
    queryFn: () => client.get('/clips').then(r => r.data),
    refetchInterval: 5000,
  })
}

export function useClipSse(onClip: (clip: AlarmClip) => void) {
  useEffect(() => {
    const es = new EventSource('/api/clips/events')
    es.addEventListener('clip', e => {
      try { onClip(JSON.parse(e.data)) } catch { /* ignore */ }
    })
    return () => es.close()
  }, [onClip])
}
