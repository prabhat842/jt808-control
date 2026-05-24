import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import client from './client'
import type {
  Terminal,
  MediaSession,
  AlarmClip,
  ServiceStatus,
  LatestPosition,
  RecentAlarm,
  AlarmFile,
  RegistrySummary,
  OrgUnit,
  RegistryDevice,
  VehicleAsset,
  DriverProfile,
  ParameterProfile,
  ParameterItem,
  ParameterCatalogEntry,
  ParameterPush,
} from '../types'

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

// ── Garuda Registry / Management Center ──────────────────────────────────

export function useRegistrySummary() {
  return useQuery<RegistrySummary>({
    queryKey: ['registry-summary'],
    queryFn: () => client.get('/registry/summary').then(r => r.data),
    refetchInterval: 10000,
  })
}

export function useOrgUnits() {
  return useQuery<OrgUnit[]>({
    queryKey: ['registry-org-units'],
    queryFn: () => client.get('/registry/org-units').then(r => r.data),
  })
}

export function useCreateOrgUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<OrgUnit> & { orgCode: string; orgName: string }) =>
      client.post('/registry/org-units', payload).then(r => r.data),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['registry-org-units'] }),
        qc.invalidateQueries({ queryKey: ['registry-summary'] }),
        qc.invalidateQueries({ queryKey: ['registry-devices'] }),
        qc.invalidateQueries({ queryKey: ['registry-vehicles'] }),
        qc.invalidateQueries({ queryKey: ['registry-drivers'] }),
        qc.invalidateQueries({ queryKey: ['registry-parameter-profiles'] }),
      ])
    },
  })
}

export function useUpdateOrgUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ orgId, payload }: { orgId: string; payload: Partial<OrgUnit> & { orgCode: string; orgName: string } }) =>
      client.put(`/registry/org-units/${encodeURIComponent(orgId)}`, payload).then(r => r.data),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['registry-org-units'] }),
        qc.invalidateQueries({ queryKey: ['registry-summary'] }),
        qc.invalidateQueries({ queryKey: ['registry-devices'] }),
        qc.invalidateQueries({ queryKey: ['registry-vehicles'] }),
        qc.invalidateQueries({ queryKey: ['registry-drivers'] }),
        qc.invalidateQueries({ queryKey: ['registry-parameter-profiles'] }),
      ])
    },
  })
}

export function useDeleteOrgUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orgId: string) => client.delete(`/registry/org-units/${encodeURIComponent(orgId)}`).then(r => r.data),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['registry-org-units'] }),
        qc.invalidateQueries({ queryKey: ['registry-summary'] }),
        qc.invalidateQueries({ queryKey: ['registry-devices'] }),
        qc.invalidateQueries({ queryKey: ['registry-vehicles'] }),
        qc.invalidateQueries({ queryKey: ['registry-drivers'] }),
        qc.invalidateQueries({ queryKey: ['registry-parameter-profiles'] }),
      ])
    },
  })
}

export function useRegistryDevices() {
  return useQuery<RegistryDevice[]>({
    queryKey: ['registry-devices'],
    queryFn: () => client.get('/registry/devices').then(r => r.data),
    refetchInterval: 10000,
  })
}

export function useCreateRegistryDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<RegistryDevice> & { orgId: string; terminalId: string; sim: string }) =>
      client.post('/registry/devices', payload).then(r => r.data),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['registry-devices'] }),
        qc.invalidateQueries({ queryKey: ['registry-summary'] }),
        qc.invalidateQueries({ queryKey: ['registry-org-units'] }),
        qc.invalidateQueries({ queryKey: ['registry-vehicles'] }),
      ])
    },
  })
}

export function useUpdateRegistryDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ deviceId, payload }: { deviceId: string; payload: Partial<RegistryDevice> & { orgId: string; terminalId: string; sim: string } }) =>
      client.put(`/registry/devices/${encodeURIComponent(deviceId)}`, payload).then(r => r.data),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['registry-devices'] }),
        qc.invalidateQueries({ queryKey: ['registry-summary'] }),
        qc.invalidateQueries({ queryKey: ['registry-org-units'] }),
        qc.invalidateQueries({ queryKey: ['registry-vehicles'] }),
      ])
    },
  })
}

export function useDeleteRegistryDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (deviceId: string) => client.delete(`/registry/devices/${encodeURIComponent(deviceId)}`).then(r => r.data),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['registry-devices'] }),
        qc.invalidateQueries({ queryKey: ['registry-summary'] }),
        qc.invalidateQueries({ queryKey: ['registry-org-units'] }),
        qc.invalidateQueries({ queryKey: ['registry-vehicles'] }),
      ])
    },
  })
}

export function useCreateVehicleAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<VehicleAsset> & { orgId: string; plateNumber: string }) =>
      client.post('/registry/vehicles', payload).then(r => r.data),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['registry-vehicles'] }),
        qc.invalidateQueries({ queryKey: ['registry-summary'] }),
        qc.invalidateQueries({ queryKey: ['registry-org-units'] }),
        qc.invalidateQueries({ queryKey: ['registry-drivers'] }),
      ])
    },
  })
}

export function useUpdateVehicleAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ vehicleId, payload }: { vehicleId: string; payload: Partial<VehicleAsset> & { orgId: string; plateNumber: string } }) =>
      client.put(`/registry/vehicles/${encodeURIComponent(vehicleId)}`, payload).then(r => r.data),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['registry-vehicles'] }),
        qc.invalidateQueries({ queryKey: ['registry-summary'] }),
        qc.invalidateQueries({ queryKey: ['registry-org-units'] }),
        qc.invalidateQueries({ queryKey: ['registry-drivers'] }),
      ])
    },
  })
}

export function useDeleteVehicleAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vehicleId: string) => client.delete(`/registry/vehicles/${encodeURIComponent(vehicleId)}`).then(r => r.data),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['registry-vehicles'] }),
        qc.invalidateQueries({ queryKey: ['registry-summary'] }),
        qc.invalidateQueries({ queryKey: ['registry-org-units'] }),
        qc.invalidateQueries({ queryKey: ['registry-drivers'] }),
      ])
    },
  })
}

export function useCreateDriverProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<DriverProfile> & { orgId: string; displayName: string }) =>
      client.post('/registry/drivers', payload).then(r => r.data),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['registry-drivers'] }),
        qc.invalidateQueries({ queryKey: ['registry-summary'] }),
        qc.invalidateQueries({ queryKey: ['registry-org-units'] }),
        qc.invalidateQueries({ queryKey: ['registry-vehicles'] }),
      ])
    },
  })
}

export function useUpdateDriverProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ driverId, payload }: { driverId: string; payload: Partial<DriverProfile> & { orgId: string; displayName: string } }) =>
      client.put(`/registry/drivers/${encodeURIComponent(driverId)}`, payload).then(r => r.data),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['registry-drivers'] }),
        qc.invalidateQueries({ queryKey: ['registry-summary'] }),
        qc.invalidateQueries({ queryKey: ['registry-org-units'] }),
        qc.invalidateQueries({ queryKey: ['registry-vehicles'] }),
      ])
    },
  })
}

export function useDeleteDriverProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (driverId: string) => client.delete(`/registry/drivers/${encodeURIComponent(driverId)}`).then(r => r.data),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['registry-drivers'] }),
        qc.invalidateQueries({ queryKey: ['registry-summary'] }),
        qc.invalidateQueries({ queryKey: ['registry-org-units'] }),
        qc.invalidateQueries({ queryKey: ['registry-vehicles'] }),
      ])
    },
  })
}

export function useCreateParameterProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<ParameterProfile> & { orgId: string; profileName: string }) =>
      client.post('/registry/parameter-profiles', payload).then(r => r.data),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['registry-parameter-profiles'] }),
        qc.invalidateQueries({ queryKey: ['registry-summary'] }),
        qc.invalidateQueries({ queryKey: ['registry-org-units'] }),
      ])
    },
  })
}

export function useUpdateParameterProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ profileId, payload }: { profileId: string; payload: Partial<ParameterProfile> & { orgId: string; profileName: string } }) =>
      client.put(`/registry/parameter-profiles/${encodeURIComponent(profileId)}`, payload).then(r => r.data),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['registry-parameter-profiles'] }),
        qc.invalidateQueries({ queryKey: ['registry-summary'] }),
        qc.invalidateQueries({ queryKey: ['registry-org-units'] }),
      ])
    },
  })
}

export function useDeleteParameterProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (profileId: string) => client.delete(`/registry/parameter-profiles/${encodeURIComponent(profileId)}`).then(r => r.data),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['registry-parameter-profiles'] }),
        qc.invalidateQueries({ queryKey: ['registry-summary'] }),
        qc.invalidateQueries({ queryKey: ['registry-org-units'] }),
      ])
    },
  })
}

export function useParameterItems(profileId: string | null) {
  return useQuery<ParameterItem[]>({
    queryKey: ['registry-parameter-items', profileId],
    queryFn: () => client.get(`/registry/parameter-profiles/${encodeURIComponent(profileId ?? '')}/items`).then(r => r.data),
    enabled: !!profileId,
  })
}

export function useParameterCatalog() {
  return useQuery<ParameterCatalogEntry[]>({
    queryKey: ['registry-parameter-catalog'],
    queryFn: () => client.get('/registry/parameter-catalog').then(r => r.data),
  })
}

export function useCreateParameterItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ profileId, payload }: { profileId: string; payload: Partial<ParameterItem> & { parameterId: number; valueKind: string; valueText: string } }) =>
      client.post(`/registry/parameter-profiles/${encodeURIComponent(profileId)}/items`, payload).then(r => r.data),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['registry-parameter-items', variables.profileId] }),
        qc.invalidateQueries({ queryKey: ['registry-parameter-profiles'] }),
        qc.invalidateQueries({ queryKey: ['registry-summary'] }),
      ])
    },
  })
}

export function useUpdateParameterItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ profileId, itemId, payload }: { profileId: string; itemId: string; payload: Partial<ParameterItem> & { parameterId: number; valueKind: string; valueText: string } }) =>
      client.put(`/registry/parameter-profiles/${encodeURIComponent(profileId)}/items/${encodeURIComponent(itemId)}`, payload).then(r => r.data),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['registry-parameter-items', variables.profileId] }),
        qc.invalidateQueries({ queryKey: ['registry-parameter-profiles'] }),
      ])
    },
  })
}

export function useDeleteParameterItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ profileId, itemId }: { profileId: string; itemId: string }) =>
      client.delete(`/registry/parameter-profiles/${encodeURIComponent(profileId)}/items/${encodeURIComponent(itemId)}`).then(r => r.data),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['registry-parameter-items', variables.profileId] }),
        qc.invalidateQueries({ queryKey: ['registry-parameter-profiles'] }),
      ])
    },
  })
}

export function useParameterPushes() {
  return useQuery<ParameterPush[]>({
    queryKey: ['registry-parameter-pushes'],
    queryFn: () => client.get('/registry/parameter-pushes').then(r => r.data),
    refetchInterval: 10000,
  })
}

export function useApplyParameterProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ profileId, deviceId }: { profileId: string; deviceId: string }) =>
      client.post(`/registry/parameter-profiles/${encodeURIComponent(profileId)}/pushes`, {
        deviceId,
        requestedBy: 'Garuda UI',
      }).then(r => r.data),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['registry-parameter-pushes'] }),
        qc.invalidateQueries({ queryKey: ['registry-devices'] }),
      ])
    },
  })
}

export function useVehicleAssets() {
  return useQuery<VehicleAsset[]>({
    queryKey: ['registry-vehicles'],
    queryFn: () => client.get('/registry/vehicles').then(r => r.data),
  })
}

export function useDriverProfiles() {
  return useQuery<DriverProfile[]>({
    queryKey: ['registry-drivers'],
    queryFn: () => client.get('/registry/drivers').then(r => r.data),
  })
}

export function useParameterProfiles() {
  return useQuery<ParameterProfile[]>({
    queryKey: ['registry-parameter-profiles'],
    queryFn: () => client.get('/registry/parameter-profiles').then(r => r.data),
  })
}
