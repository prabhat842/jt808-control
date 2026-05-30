import { useEffect, useMemo, useState } from 'react'
import { Eye, PencilLine, Trash2 } from 'lucide-react'
import {
  useCreateDriverProfile,
  useCreateParameterItem,
  useCreateParameterProfile,
  useApplyParameterProfile,
  useCreateVehicleAsset,
  useCreateOrgUnit,
  useCreateRegistryDevice,
  useDeleteDriverProfile,
  useDeleteParameterItem,
  useDeleteParameterProfile,
  useDeleteVehicleAsset,
  useDeleteOrgUnit,
  useDeleteRegistryDevice,
  useDriverProfiles,
  useEffectiveParameters,
  useOrgUnits,
  useParameterItems,
  useParameterCatalog,
  useParameterPushes,
  useParameterProfiles,
  useRegistryDevices,
  useRegistrySummary,
  useTerminals,
  useUpdateDriverProfile,
  useUpdateOrgUnit,
  useUpdateParameterItem,
  useUpdateParameterProfile,
  useUpdateVehicleAsset,
  useUpdateRegistryDevice,
  useVehicleAssets,
} from '../../api/hooks'
import type { DriverProfile, EffectiveParameter, OrgUnit, ParameterCatalogEntry, ParameterItem, ParameterProfile, RegistryDevice, Terminal, VehicleAsset } from '../../types'

type Section = 'devices' | 'organizations' | 'vehicles' | 'drivers'
type EditorKind = 'org' | 'device' | 'vehicle' | 'driver' | 'parameter'
type InspectorState =
  | { kind: 'device'; record: RegistryDevice }
  | { kind: 'terminal'; record: Terminal }
  | { kind: 'org'; record: OrgUnit }
  | { kind: 'vehicle'; record: VehicleAsset }
  | { kind: 'driver'; record: DriverProfile }
  | { kind: 'parameter'; record: ParameterProfile }

type EditorState =
  | { kind: 'org'; mode: 'create'; org?: OrgUnit }
  | { kind: 'org'; mode: 'edit'; org: OrgUnit }
  | { kind: 'device'; mode: 'create'; device?: RegistryDevice }
  | { kind: 'device'; mode: 'edit'; device: RegistryDevice }
  | { kind: 'vehicle'; mode: 'create'; vehicle?: VehicleAsset }
  | { kind: 'vehicle'; mode: 'edit'; vehicle: VehicleAsset }
  | { kind: 'driver'; mode: 'create'; driver?: DriverProfile }
  | { kind: 'driver'; mode: 'edit'; driver: DriverProfile }
  | { kind: 'parameter'; mode: 'create'; profile?: ParameterProfile }
  | { kind: 'parameter'; mode: 'edit'; profile: ParameterProfile }

type OrgDraft = {
  parentOrgId: string
  orgCode: string
  orgName: string
  orgKind: string
  status: string
  contactName: string
  contactPhone: string
  notes: string
}

type DeviceDraft = {
  orgId: string
  terminalId: string
  sim: string
  protocolFamily: string
  protocolVersion: string
  deviceModel: string
  manufacturerId: string
  firmwareVersion: string
  hardwareVersion: string
  installStatus: string
  lifecycleStatus: string
}

type VehicleDraft = {
  orgId: string
  deviceId: string
  plateNumber: string
  plateColor: string
  vin: string
  vehicleKind: string
  fuelKind: string
  capacityTons: string
  operationStatus: string
}

type DriverDraft = {
  orgId: string
  displayName: string
  phone: string
  licenseNumber: string
  licenseClass: string
  licenseExpiresOn: string
  qualificationNumber: string
  qualificationExpiresOn: string
  employmentStatus: string
  riskLabel: string
}

type ParameterDraft = {
  orgId: string
  deviceId: string
  profileScope: 'global' | 'org' | 'terminal'
  profileName: string
  description: string
  profileStatus: string
}

type ParameterItemDraft = {
  itemId: string | null
  parameterId: string
  valueKind: string
  valueText: string
}

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'devices', label: 'Devices' },
  { id: 'organizations', label: 'Organizations' },
  { id: 'vehicles', label: 'Vehicles' },
  { id: 'drivers', label: 'Drivers' },
]

const EMPTY_ORG: OrgDraft = {
  parentOrgId: '',
  orgCode: '',
  orgName: '',
  orgKind: 'fleet',
  status: 'active',
  contactName: '',
  contactPhone: '',
  notes: '',
}

const EMPTY_DEVICE: DeviceDraft = {
  orgId: '',
  terminalId: '',
  sim: '',
  protocolFamily: 'JT808',
  protocolVersion: 'JT/T 808-2013',
  deviceModel: '',
  manufacturerId: '',
  firmwareVersion: '',
  hardwareVersion: '',
  installStatus: 'inventory',
  lifecycleStatus: 'active',
}

const EMPTY_VEHICLE: VehicleDraft = {
  orgId: '',
  deviceId: '',
  plateNumber: '',
  plateColor: 'blue',
  vin: '',
  vehicleKind: 'commercial',
  fuelKind: '',
  capacityTons: '',
  operationStatus: 'active',
}

const EMPTY_DRIVER: DriverDraft = {
  orgId: '',
  displayName: '',
  phone: '',
  licenseNumber: '',
  licenseClass: '',
  licenseExpiresOn: '',
  qualificationNumber: '',
  qualificationExpiresOn: '',
  employmentStatus: 'active',
  riskLabel: 'normal',
}

const EMPTY_PARAMETER: ParameterDraft = {
  orgId: '',
  deviceId: '',
  profileScope: 'org',
  profileName: '',
  description: '',
  profileStatus: 'draft',
}

const EMPTY_PARAMETER_ITEM: ParameterItemDraft = {
  itemId: null,
  parameterId: '',
  valueKind: 'dword',
  valueText: '',
}

const PARAMETER_CATALOG_ORDER = [
  'Connectivity',
  'Network',
  'Reporting',
  'Alarm',
  'Speed & Safety',
  'Media',
  'Vehicle',
  'GNSS',
  'CAN',
  'Custom',
] as const

export default function ManagementPage() {
  const [section, setSection] = useState<Section>('devices')
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [inspector, setInspector] = useState<InspectorState | null>(null)
  const [draft, setDraft] = useState<OrgDraft | DeviceDraft | VehicleDraft | DriverDraft | ParameterDraft>(EMPTY_ORG)
  const [error, setError] = useState<string | null>(null)

  const { data: summary } = useRegistrySummary()
  const { data: orgs = [] } = useOrgUnits()
  const { data: devices = [] } = useRegistryDevices()
  const createOrg = useCreateOrgUnit()
  const updateOrg = useUpdateOrgUnit()
  const deleteOrg = useDeleteOrgUnit()
  const createDevice = useCreateRegistryDevice()
  const updateDevice = useUpdateRegistryDevice()
  const deleteDevice = useDeleteRegistryDevice()
  const createVehicle = useCreateVehicleAsset()
  const updateVehicle = useUpdateVehicleAsset()
  const deleteVehicle = useDeleteVehicleAsset()
  const createDriver = useCreateDriverProfile()
  const updateDriver = useUpdateDriverProfile()
  const deleteDriver = useDeleteDriverProfile()
  const createParameter = useCreateParameterProfile()
  const updateParameter = useUpdateParameterProfile()
  const deleteParameter = useDeleteParameterProfile()

  useEffect(() => {
    if (!editor) {
      setError(null)
      return
    }
    setError(null)
    if (editor.kind === 'org') {
      const org = editor.mode === 'edit' ? editor.org : editor.org
      setDraft({
        parentOrgId: org?.parentOrgId ?? '',
        orgCode: org?.orgCode ?? '',
        orgName: org?.orgName ?? '',
        orgKind: org?.orgKind ?? 'fleet',
        status: org?.status ?? 'active',
        contactName: org?.contactName ?? '',
        contactPhone: org?.contactPhone ?? '',
        notes: '',
      })
    } else if (editor.kind === 'device') {
      const device = editor.mode === 'edit' ? editor.device : editor.device
      setDraft(device ? {
        orgId: device.orgId ?? '',
        terminalId: device.terminalId ?? '',
        sim: device.sim ?? '',
        protocolFamily: device.protocolFamily ?? 'JT808',
        protocolVersion: device.protocolVersion ?? 'JT/T 808-2013',
        deviceModel: device.deviceModel ?? '',
        manufacturerId: device.manufacturerId ?? '',
        firmwareVersion: device.firmwareVersion ?? '',
        hardwareVersion: device.hardwareVersion ?? '',
        installStatus: device.installStatus ?? 'inventory',
        lifecycleStatus: device.lifecycleStatus ?? 'active',
      } : EMPTY_DEVICE)
    } else if (editor.kind === 'vehicle') {
      const vehicle = editor.mode === 'edit' ? editor.vehicle : editor.vehicle
      setDraft(vehicle ? {
        orgId: vehicle.orgId ?? '',
        deviceId: vehicle.deviceId ?? '',
        plateNumber: vehicle.plateNumber ?? '',
        plateColor: vehicle.plateColor ?? 'blue',
        vin: vehicle.vin ?? '',
        vehicleKind: vehicle.vehicleKind ?? 'commercial',
        fuelKind: vehicle.fuelKind ?? '',
        capacityTons: vehicle.capacityTons == null ? '' : String(vehicle.capacityTons),
        operationStatus: vehicle.operationStatus ?? 'active',
      } : EMPTY_VEHICLE)
    } else if (editor.kind === 'driver') {
      const driver = editor.mode === 'edit' ? editor.driver : editor.driver
      setDraft(driver ? {
        orgId: driver.orgId ?? '',
        displayName: driver.displayName ?? '',
        phone: driver.phone ?? '',
        licenseNumber: driver.licenseNumber ?? '',
        licenseClass: driver.licenseClass ?? '',
        licenseExpiresOn: driver.licenseExpiresOn ?? '',
        qualificationNumber: driver.qualificationNumber ?? '',
        qualificationExpiresOn: driver.qualificationExpiresOn ?? '',
        employmentStatus: driver.employmentStatus ?? 'active',
        riskLabel: driver.riskLabel ?? 'normal',
      } : EMPTY_DRIVER)
    } else {
      const profile = editor.mode === 'edit' ? editor.profile : editor.profile
      setDraft(profile ? {
        orgId: profile.orgId ?? '',
        deviceId: profile.deviceId ?? '',
        profileScope: profile.profileScope ?? 'org',
        profileName: profile.profileName ?? '',
        description: profile.description ?? '',
        profileStatus: profile.profileStatus ?? 'draft',
      } : EMPTY_PARAMETER)
    }
  }, [editor])

  const sectionTitle = {
    devices: 'Devices',
    organizations: 'Organizations',
    vehicles: 'Vehicles',
    drivers: 'Drivers',
  }[section]

  async function saveEditor() {
    try {
      setError(null)
      if (!editor) return
      if (editor.kind === 'org') {
        const body = draft as OrgDraft
        const payload = {
          parentOrgId: blank(body.parentOrgId),
          orgCode: body.orgCode.trim(),
          orgName: body.orgName.trim(),
          orgKind: body.orgKind,
          status: body.status,
          contactName: blank(body.contactName),
          contactPhone: blank(body.contactPhone),
          notes: blank(body.notes),
        }
        if (editor.mode === 'create') {
          await createOrg.mutateAsync(payload)
        } else {
          await updateOrg.mutateAsync({ orgId: editor.org.orgId, payload })
        }
      } else if (editor.kind === 'device') {
        const body = draft as DeviceDraft
        const payload = {
          orgId: body.orgId.trim(),
          terminalId: body.terminalId.trim(),
          sim: body.sim.trim(),
          protocolFamily: body.protocolFamily,
          protocolVersion: body.protocolVersion,
          deviceModel: blank(body.deviceModel),
          manufacturerId: blank(body.manufacturerId),
          firmwareVersion: blank(body.firmwareVersion),
          hardwareVersion: blank(body.hardwareVersion),
          installStatus: body.installStatus,
          lifecycleStatus: body.lifecycleStatus,
        }
        if (editor.mode === 'create') {
          await createDevice.mutateAsync(payload)
        } else {
          await updateDevice.mutateAsync({ deviceId: editor.device.deviceId, payload })
        }
      } else if (editor.kind === 'vehicle') {
        const body = draft as VehicleDraft
        const capacityTons = body.capacityTons.trim() ? Number(body.capacityTons) : null
        if (capacityTons !== null && Number.isNaN(capacityTons)) {
          throw new Error('capacity tons must be numeric')
        }
        const payload = {
          orgId: body.orgId.trim(),
          deviceId: blank(body.deviceId),
          plateNumber: body.plateNumber.trim(),
          plateColor: body.plateColor,
          vin: blank(body.vin),
          vehicleKind: body.vehicleKind,
          fuelKind: blank(body.fuelKind),
          capacityTons,
          operationStatus: body.operationStatus,
        }
        if (editor.mode === 'create') {
          await createVehicle.mutateAsync(payload)
        } else {
          await updateVehicle.mutateAsync({ vehicleId: editor.vehicle.vehicleId, payload })
        }
      } else if (editor.kind === 'driver') {
        const body = draft as DriverDraft
        const payload = {
          orgId: body.orgId.trim(),
          displayName: body.displayName.trim(),
          phone: blank(body.phone),
          licenseNumber: blank(body.licenseNumber),
          licenseClass: blank(body.licenseClass),
          licenseExpiresOn: blank(body.licenseExpiresOn),
          qualificationNumber: blank(body.qualificationNumber),
          qualificationExpiresOn: blank(body.qualificationExpiresOn),
          employmentStatus: body.employmentStatus,
          riskLabel: body.riskLabel,
        }
        if (editor.mode === 'create') {
          await createDriver.mutateAsync(payload)
        } else {
          await updateDriver.mutateAsync({ driverId: editor.driver.driverId, payload })
        }
      } else {
        const body = draft as ParameterDraft
        const payload = {
          orgId: body.profileScope === 'org' ? body.orgId.trim() : null,
          deviceId: body.profileScope === 'terminal' ? body.deviceId.trim() : null,
          profileScope: body.profileScope,
          profileName: body.profileName.trim(),
          description: blank(body.description),
          profileStatus: body.profileStatus,
        }
        if (editor.mode === 'create') {
          await createParameter.mutateAsync(payload)
        } else {
          await updateParameter.mutateAsync({ profileId: editor.profile.profileId, payload })
        }
      }
      setEditor(null)
    } catch (err) {
      setError(readError(err))
    }
  }

  async function removeEditor(kind: EditorKind, id: string) {
    const ok = window.confirm(`Delete this ${kind === 'org' ? 'organization' : kind === 'device' ? 'device' : kind === 'vehicle' ? 'vehicle' : kind === 'driver' ? 'driver' : 'parameter profile'}?`)
    if (!ok) return
    try {
      setError(null)
      if (kind === 'org') await deleteOrg.mutateAsync(id)
      else if (kind === 'device') await deleteDevice.mutateAsync(id)
      else if (kind === 'vehicle') await deleteVehicle.mutateAsync(id)
      else if (kind === 'driver') await deleteDriver.mutateAsync(id)
      else await deleteParameter.mutateAsync(id)
    } catch (err) {
      setError(readError(err))
    }
  }

  return (
    <div className="management-page">
      <section className="management-main">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold" style={{ color: 'var(--foreground-strong)' }}>
            Management
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${sectionTitle.toLowerCase()}...`}
            className="font-mono text-[12px] px-3 py-2 w-64 focus:outline-none"
            style={{
              background: 'var(--surface-1)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--foreground)',
            }}
          />
          <button
            className="btn-secondary"
            onClick={() => {
              if (section === 'devices') setEditor({ kind: 'device', mode: 'create' })
              else if (section === 'organizations') setEditor({ kind: 'org', mode: 'create' })
              else if (section === 'vehicles') setEditor({ kind: 'vehicle', mode: 'create' })
              else setEditor({ kind: 'driver', mode: 'create' })
            }}
          >
            Add
          </button>
          <button className="btn-secondary" disabled>Import</button>
          <button className="btn-secondary" disabled>Export</button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        <Metric label="Organizations" value={summary?.organizations ?? 0} tone="blue" />
        <Metric label="Devices" value={summary?.devices ?? 0} tone="cyan" />
        <Metric label="Vehicles" value={summary?.vehicles ?? 0} tone="green" />
        <Metric label="Drivers" value={summary?.drivers ?? 0} tone="amber" />
        <Metric label="Profiles" value={summary?.profiles ?? 0} tone="violet" />
      </div>

      {error && (
        <div className="surface-panel-quiet px-4 py-3 font-mono text-[12px]" style={{ color: 'var(--status-warn)' }}>
          {error}
        </div>
      )}

      <div className="surface-panel overflow-hidden">
        <div className="flex items-center gap-1 px-3 pt-3" style={{ borderBottom: '1px solid var(--border)' }}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className="font-mono text-[11px] px-3 py-2"
              style={{
                border: 'none',
                borderBottom: section === s.id ? '2px solid var(--electric)' : '2px solid transparent',
                background: section === s.id ? 'var(--electric-soft)' : 'transparent',
                color: section === s.id ? 'var(--electric)' : 'var(--muted-strong)',
                cursor: 'pointer',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {section === 'devices' && (
          <DevicesTable
            search={search}
            onCreate={() => setEditor({ kind: 'device', mode: 'create' })}
            onView={entry => {
              if ('deviceId' in entry) setInspector({ kind: 'device', record: entry })
              else setInspector({ kind: 'terminal', record: entry })
            }}
            onEdit={entry => {
              if ('deviceId' in entry) {
                setEditor({ kind: 'device', mode: 'edit', device: entry })
              } else {
                setEditor({
                  kind: 'device',
                  mode: 'create',
                  device: {
                    deviceId: '',
                    orgId: '',
                    orgName: '',
                    terminalId: entry.terminalId,
                    sim: entry.terminalId,
                    protocolFamily: 'JT808',
                    protocolVersion: 'JT/T 808-2013',
                    deviceModel: '',
                    manufacturerId: '',
                    firmwareVersion: '',
                    hardwareVersion: '',
                    installStatus: 'installed',
                    lifecycleStatus: 'active',
                    lastSeenAt: null,
                    plateNumber: entry.plateNumber ?? null,
                    channelCount: 0,
                  },
                })
              }
            }}
            onDelete={deviceId => void removeEditor('device', deviceId)}
          />
        )}

        {section === 'organizations' && (
          <OrganizationsTable
            search={search}
            onCreate={() => setEditor({ kind: 'org', mode: 'create' })}
            onView={org => setInspector({ kind: 'org', record: org })}
            onEdit={org => setEditor({ kind: 'org', mode: 'edit', org })}
            onDelete={orgId => void removeEditor('org', orgId)}
          />
        )}

        {section === 'vehicles' && (
          <VehiclesTable
            search={search}
            onCreate={() => setEditor({ kind: 'vehicle', mode: 'create' })}
            onView={vehicle => setInspector({ kind: 'vehicle', record: vehicle })}
            onEdit={vehicle => setEditor({ kind: 'vehicle', mode: 'edit', vehicle })}
            onDelete={vehicleId => void removeEditor('vehicle', vehicleId)}
          />
        )}
        {section === 'drivers' && (
          <DriversTable
            search={search}
            onCreate={() => setEditor({ kind: 'driver', mode: 'create' })}
            onView={driver => setInspector({ kind: 'driver', record: driver })}
            onEdit={driver => setEditor({ kind: 'driver', mode: 'edit', driver })}
            onDelete={driverId => void removeEditor('driver', driverId)}
          />
        )}
      </div>

      {editor && (
        <EditorDialog
          editor={editor}
          draft={draft}
          orgOptions={orgs}
          deviceOptions={devices}
          busy={
            createOrg.isPending ||
            updateOrg.isPending ||
            createDevice.isPending ||
            updateDevice.isPending ||
            createVehicle.isPending ||
            updateVehicle.isPending ||
            createDriver.isPending ||
            updateDriver.isPending ||
            createParameter.isPending ||
            updateParameter.isPending
          }
          onClose={() => setEditor(null)}
          onSubmit={saveEditor}
          onChange={setDraft}
        />
      )}
      </section>
      <ManagementInspector inspector={inspector} onClose={() => setInspector(null)} onEdit={record => {
        if (record.kind === 'device') setEditor({ kind: 'device', mode: 'edit', device: record.record })
        else if (record.kind === 'terminal') {
          setEditor({
            kind: 'device',
            mode: 'create',
            device: {
              deviceId: '',
              orgId: '',
              orgName: '',
              terminalId: record.record.terminalId,
              sim: record.record.terminalId,
              protocolFamily: 'JT808',
              protocolVersion: 'JT/T 808-2013',
              deviceModel: '',
              manufacturerId: '',
              firmwareVersion: '',
              hardwareVersion: '',
              installStatus: 'installed',
              lifecycleStatus: 'active',
              lastSeenAt: null,
              plateNumber: record.record.plateNumber ?? null,
              channelCount: 0,
            },
          })
        }
        else if (record.kind === 'org') setEditor({ kind: 'org', mode: 'edit', org: record.record })
        else if (record.kind === 'vehicle') setEditor({ kind: 'vehicle', mode: 'edit', vehicle: record.record })
        else if (record.kind === 'driver') setEditor({ kind: 'driver', mode: 'edit', driver: record.record })
        else setEditor({ kind: 'parameter', mode: 'edit', profile: record.record })
      }} />
    </div>
  )
}

function DevicesTable({
  search,
  onCreate,
  onView,
  onEdit,
  onDelete,
}: {
  search: string
  onCreate: () => void
  onView: (device: RegistryDevice | Terminal) => void
  onEdit: (device: RegistryDevice | Terminal) => void
  onDelete: (deviceId: string) => void
}) {
  const { data: devices = [], isLoading } = useRegistryDevices()
  const { data: terminals = [] } = useTerminals()
  const terminalMap = useMemo(() => new Map(terminals.map(terminal => [terminal.terminalId, terminal])), [terminals])
  const displayRows = useMemo(() => {
    const registryRows = devices.map(device => ({
      kind: 'registry' as const,
      device,
      online: terminalMap.has(device.terminalId),
    }))
    const liveOnlyRows = terminals
      .filter(terminal => !devices.some(device => device.terminalId === terminal.terminalId))
      .map(terminal => ({ kind: 'terminal' as const, terminal }))
    return [...registryRows, ...liveOnlyRows]
  }, [devices, terminals, terminalMap])
  const rows = filterRows(displayRows, search, row => row.kind === 'registry'
    ? [
        row.device.terminalId,
        row.device.sim,
        row.device.plateNumber,
        row.device.orgName,
        row.device.deviceModel,
        'registered',
        row.online ? 'online' : 'offline',
        row.device.installStatus,
        row.device.lifecycleStatus,
      ]
    : [
        row.terminal.terminalId,
        row.terminal.plateNumber,
        'unregistered',
        'authenticated',
        row.terminal.manufacturerId,
      ])
  return (
    <RegistryTable
      loading={isLoading}
      empty="No devices or connected terminals"
      headers={['State', 'Terminal', 'Plate', 'Organization', 'Model', 'Protocol', 'Channels', 'Lifecycle', 'Actions']}
      rows={rows.map(row => row.kind === 'registry' ? [
        <div key="status" className="flex flex-wrap gap-1">
          <StatusPill label="registered" tone="ok" />
          <StatusPill label={row.online ? 'online' : 'offline'} tone={row.online ? 'ok' : 'muted'} />
        </div>,
        <Mono key="terminal" strong>{row.device.terminalId}</Mono>,
        <Mono key="plate">{row.device.plateNumber ?? '-'}</Mono>,
        row.device.orgName,
        row.device.deviceModel ?? '-',
        `${row.device.protocolFamily} · ${row.device.protocolVersion}`,
        String(row.device.channelCount),
        <StatusPill key="life" label={row.device.lifecycleStatus} tone={row.device.lifecycleStatus === 'active' ? 'ok' : 'warn'} />,
        <RowActions
          key="actions"
          onView={() => onView(row.device)}
          onEdit={() => onEdit(row.device)}
          onDelete={() => onDelete(row.device.deviceId)}
          canDelete={row.device.channelCount === 0 && row.device.plateNumber == null}
        />,
      ] : [
        <div key="status" className="flex flex-wrap gap-1">
          <StatusPill label="unregistered" tone="warn" />
          <StatusPill label="authenticated" tone="ok" />
        </div>,
        <Mono key="terminal" strong>{row.terminal.terminalId}</Mono>,
        <Mono key="plate">{row.terminal.plateNumber ?? '-'}</Mono>,
        'Not onboarded',
        row.terminal.manufacturerId ?? '-',
        '-',
        '0',
        <StatusPill key="life" label="live" tone="ok" />,
        <RowActions
          key="actions"
          onView={() => onView(row.terminal)}
          onEdit={() => onEdit(row.terminal)}
          onDelete={() => {}}
          canDelete={false}
        />,
      ])}
      onRowClick={rows.map(row => () => onView(row.kind === 'registry' ? row.device : row.terminal))}
      onCreate={onCreate}
          createLabel="Add device"
    />
  )
}

function OrganizationsTable({
  search,
  onCreate,
  onView,
  onEdit,
  onDelete,
}: {
  search: string
  onCreate: () => void
  onView: (org: OrgUnit) => void
  onEdit: (org: OrgUnit) => void
  onDelete: (orgId: string) => void
}) {
  const { data: orgs = [], isLoading } = useOrgUnits()
  const rows = filterRows(orgs, search, o => [
    o.orgCode, o.orgName, o.orgKind, o.status, o.parentOrgName, o.contactName, o.contactPhone,
  ])
  return (
    <RegistryTable
      loading={isLoading}
      empty="No organizations"
      headers={['Code', 'Name', 'Type', 'Parent', 'Devices', 'Vehicles', 'Contact', 'Status', 'Actions']}
      rows={rows.map(o => [
        <Mono key="code" strong>{o.orgCode}</Mono>,
        o.orgName,
        o.orgKind,
        o.parentOrgName ?? '-',
        String(o.deviceCount),
        String(o.vehicleCount),
        o.contactName ? `${o.contactName} · ${o.contactPhone ?? '-'}` : '-',
        <StatusPill key="status" label={o.status} tone={o.status === 'active' ? 'ok' : 'warn'} />,
        <RowActions
          key="actions"
          onView={() => onView(o)}
          onEdit={() => onEdit(o)}
          onDelete={() => onDelete(o.orgId)}
          canDelete={o.deviceCount === 0 && o.vehicleCount === 0 && o.parentOrgId == null}
        />,
      ])}
      onRowClick={rows.map(o => () => onView(o))}
      onCreate={onCreate}
      createLabel="Add organization"
    />
  )
}

function VehiclesTable({
  search,
  onCreate,
  onView,
  onEdit,
  onDelete,
}: {
  search: string
  onCreate: () => void
  onView: (vehicle: VehicleAsset) => void
  onEdit: (vehicle: VehicleAsset) => void
  onDelete: (vehicleId: string) => void
}) {
  const { data: vehicles = [], isLoading } = useVehicleAssets()
  const rows = filterRows(vehicles, search, v => [
    v.plateNumber, v.vin, v.orgName, v.terminalId, v.vehicleKind, v.operationStatus, v.currentDriverName,
  ])
  return (
    <RegistryTable
      loading={isLoading}
      empty="No vehicle assets"
      headers={['Plate', 'Organization', 'Terminal', 'Kind', 'Fuel', 'Driver', 'Status', 'Actions']}
      rows={rows.map(v => [
        <Mono key="plate" strong>{v.plateNumber}</Mono>,
        v.orgName,
        <Mono key="terminal">{v.terminalId ?? '-'}</Mono>,
        v.vehicleKind,
        v.fuelKind ?? '-',
        v.currentDriverName ?? '-',
        <StatusPill key="status" label={v.operationStatus} tone={v.operationStatus === 'active' ? 'ok' : 'muted'} />,
        <RowActions
          key="actions"
          onView={() => onView(v)}
          onEdit={() => onEdit(v)}
          onDelete={() => onDelete(v.vehicleId)}
          canDelete={v.currentDriverId == null}
        />,
      ])}
      onRowClick={rows.map(v => () => onView(v))}
      onCreate={onCreate}
      createLabel="Add vehicle"
    />
  )
}

function DriversTable({
  search,
  onCreate,
  onView,
  onEdit,
  onDelete,
}: {
  search: string
  onCreate: () => void
  onView: (driver: DriverProfile) => void
  onEdit: (driver: DriverProfile) => void
  onDelete: (driverId: string) => void
}) {
  const { data: drivers = [], isLoading } = useDriverProfiles()
  const rows = filterRows(drivers, search, d => [
    d.displayName, d.phone, d.orgName, d.licenseNumber, d.qualificationNumber, d.riskLabel, d.currentVehiclePlate,
  ])
  return (
    <RegistryTable
      loading={isLoading}
      empty="No driver profiles"
      headers={['Driver', 'Organization', 'Phone', 'License', 'Qualification', 'Vehicle', 'Risk', 'Status', 'Actions']}
      rows={rows.map(d => [
        d.displayName,
        d.orgName,
        d.phone ?? '-',
        <Mono key="license">{d.licenseNumber ?? '-'}</Mono>,
        <Mono key="qualification">{d.qualificationNumber ?? '-'}</Mono>,
        d.currentVehiclePlate ?? '-',
        <StatusPill key="risk" label={d.riskLabel} tone={d.riskLabel === 'normal' ? 'ok' : 'warn'} />,
        <StatusPill key="status" label={d.employmentStatus} tone={d.employmentStatus === 'active' ? 'ok' : 'muted'} />,
        <RowActions
          key="actions"
          onView={() => onView(d)}
          onEdit={() => onEdit(d)}
          onDelete={() => onDelete(d.driverId)}
          canDelete={d.currentVehiclePlate == null}
        />,
      ])}
      onRowClick={rows.map(d => () => onView(d))}
      onCreate={onCreate}
      createLabel="Add driver"
    />
  )
}

function DeviceParametersPanel({
  device,
}: {
  device: RegistryDevice
}) {
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [itemDraft, setItemDraft] = useState<ParameterItemDraft>(EMPTY_PARAMETER_ITEM)
  const [itemError, setItemError] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const createProfile = useCreateParameterProfile()
  const createItem = useCreateParameterItem()
  const updateItem = useUpdateParameterItem()
  const deleteItem = useDeleteParameterItem()
  const applyProfile = useApplyParameterProfile()
  const { data: catalog = [] } = useParameterCatalog()
  const { data: profiles = [] } = useParameterProfiles()
  const { data: pushes = [] } = useParameterPushes()
  const { data: effectiveParameters, isLoading: isLoadingEffective } = useEffectiveParameters(device.deviceId)

  const terminalProfiles = useMemo(
    () => profiles.filter(profile => profile.profileScope === 'terminal' && profile.deviceId === device.deviceId),
    [profiles, device.deviceId],
  )
  const selectedProfile = terminalProfiles.find(profile => profile.profileId === selectedProfileId) ?? terminalProfiles[0] ?? null
  const effectiveProfileId = selectedProfile?.profileId ?? null
  const { data: items = [], isLoading: isLoadingItems } = useParameterItems(effectiveProfileId)
  const catalogById = useMemo(() => new Map(catalog.map(entry => [entry.parameterId, entry])), [catalog])
  const catalogGroups = useMemo(() => groupCatalogByCategory(catalog), [catalog])
  const profilePushes = effectiveProfileId ? pushes.filter(push => push.profileId === effectiveProfileId).slice(0, 6) : []

  useEffect(() => {
    if (!selectedProfileId && terminalProfiles.length > 0) {
      setSelectedProfileId(terminalProfiles[0].profileId)
    } else if (selectedProfileId && terminalProfiles.length > 0 && !terminalProfiles.some(profile => profile.profileId === selectedProfileId)) {
      setSelectedProfileId(terminalProfiles[0].profileId)
    } else if (selectedProfileId && terminalProfiles.length === 0) {
      setSelectedProfileId(null)
    }
  }, [terminalProfiles, selectedProfileId])

  function editItem(item: ParameterItem) {
    setItemError(null)
    setItemDraft({
      itemId: item.itemId,
      parameterId: formatParameterId(item.parameterId),
      valueKind: item.valueKind,
      valueText: item.valueText,
    })
  }

  async function saveItem() {
    if (!effectiveProfileId) return
    try {
      setItemError(null)
      const parameterId = parseParameterId(itemDraft.parameterId)
      const payload = {
        parameterId,
        valueKind: itemDraft.valueKind,
        valueText: itemDraft.valueText.trim(),
      }
      if (!payload.valueText) throw new Error('value is required')
      if (itemDraft.itemId) {
        await updateItem.mutateAsync({ profileId: effectiveProfileId, itemId: itemDraft.itemId, payload })
      } else {
        await createItem.mutateAsync({ profileId: effectiveProfileId, payload })
      }
      setItemDraft(EMPTY_PARAMETER_ITEM)
    } catch (err) {
      setItemError(readError(err))
    }
  }

  async function removeItem(item: ParameterItem) {
    if (!effectiveProfileId) return
    if (!window.confirm('Delete this parameter item?')) return
    try {
      setItemError(null)
      await deleteItem.mutateAsync({ profileId: effectiveProfileId, itemId: item.itemId })
      if (itemDraft.itemId === item.itemId) setItemDraft(EMPTY_PARAMETER_ITEM)
    } catch (err) {
      setItemError(readError(err))
    }
  }

  async function createTerminalProfile() {
    try {
      setProfileError(null)
      const profile = await createProfile.mutateAsync({
        orgId: device.orgId,
        deviceId: device.deviceId,
        profileScope: 'terminal',
        profileName: `${device.terminalId} parameters`,
        description: `${device.terminalId} terminal override`,
        profileStatus: 'active',
      })
      setSelectedProfileId(profile.profileId)
    } catch (err) {
      setProfileError(readError(err))
    }
  }

  async function queuePush() {
    if (!effectiveProfileId) return
    try {
      setProfileError(null)
      await applyProfile.mutateAsync({ profileId: effectiveProfileId, deviceId: device.deviceId })
    } catch (err) {
      setProfileError(readError(err))
    }
  }

  return (
    <div className="space-y-3">
      <div className="surface-panel-quiet px-4 py-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-display text-sm font-semibold" style={{ color: 'var(--foreground-strong)' }}>
              {device.terminalId}
            </div>
            <div className="font-mono text-[10px]" style={{ color: 'var(--muted-strong)' }}>
              {device.orgName}
            </div>
          </div>
          {selectedProfile ? (
            <StatusPill label={selectedProfile.profileStatus} tone={selectedProfile.profileStatus === 'active' ? 'ok' : 'muted'} />
          ) : (
            <button className="btn-primary" onClick={() => void createTerminalProfile()} disabled={createProfile.isPending}>
              Create override
            </button>
          )}
        </div>

        {profileError && (
          <div className="font-mono text-[11px]" style={{ color: 'var(--status-warn)' }}>
            {profileError}
          </div>
        )}

        {terminalProfiles.length > 1 && (
          <select value={selectedProfileId ?? ''} onChange={e => setSelectedProfileId(e.target.value || null)}>
            <option value="">Select override</option>
            {terminalProfiles.map(profile => (
              <option key={profile.profileId} value={profile.profileId}>{profile.profileName}</option>
            ))}
          </select>
        )}

        {selectedProfile && (
          <div className="flex items-center justify-between gap-2 font-mono text-[10px]" style={{ color: 'var(--muted-strong)' }}>
            <span>{selectedProfile.itemCount} items</span>
            <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={() => void queuePush()} disabled={applyProfile.isPending}>
              Queue push
            </button>
          </div>
        )}
      </div>

      {selectedProfile ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Parameter" className="col-span-2">
              <select
                value={itemDraft.parameterId ? String(parseParameterIdLoose(itemDraft.parameterId)) : ''}
                onChange={e => {
                  const parameterId = Number(e.target.value)
                  const entry = catalogById.get(parameterId)
                  setItemDraft({
                    ...itemDraft,
                    parameterId: entry?.hexId ?? formatParameterId(parameterId),
                    valueKind: entry?.valueKind === 'bytes8' ? 'bytes' : entry?.valueKind ?? itemDraft.valueKind,
                    valueText: entry?.defaultValue ?? itemDraft.valueText,
                  })
                }}
              >
                <option value="">Select parameter</option>
                {catalogGroups.map(group => (
                  <optgroup key={group.category} label={group.category}>
                    {group.entries.map(entry => (
                      <option key={entry.parameterId} value={entry.parameterId}>
                        {entry.hexId} · {entry.parameterName}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field label="Value kind">
              <select value={itemDraft.valueKind} onChange={e => setItemDraft({ ...itemDraft, valueKind: e.target.value })}>
                <option value="byte">byte</option>
                <option value="word">word</option>
                <option value="dword">dword</option>
                <option value="string">string</option>
                <option value="bytes">bytes</option>
              </select>
            </Field>
            <Field label="Value">
              <input value={itemDraft.valueText} onChange={e => setItemDraft({ ...itemDraft, valueText: e.target.value })} placeholder="30" />
            </Field>
          </div>
          <div className="flex items-center justify-end gap-2">
            {itemDraft.itemId && (
              <button className="btn-secondary" onClick={() => setItemDraft(EMPTY_PARAMETER_ITEM)}>
                Cancel edit
              </button>
            )}
            <button className="btn-primary" onClick={() => void saveItem()} disabled={createItem.isPending || updateItem.isPending}>
              {itemDraft.itemId ? 'Update item' : 'Add item'}
            </button>
          </div>

          {itemError && (
            <div className="surface-panel-quiet px-4 py-3 font-mono text-[11px]" style={{ color: 'var(--status-warn)' }}>
              {itemError}
            </div>
          )}

          <RegistryTable
            loading={isLoadingItems}
            empty="No terminal parameters"
            headers={['Parameter', 'Name', 'Value', 'Actions']}
            rows={items.map(item => [
              <Mono key="param" strong>{formatParameterId(item.parameterId)}</Mono>,
              <ParameterName key="name" entry={catalogById.get(item.parameterId)} fallback={item.valueKind} />,
              <Mono key="value">{item.valueText}{catalogById.get(item.parameterId)?.unit ? ` ${catalogById.get(item.parameterId)?.unit}` : ''}</Mono>,
              <RowActions
                key="actions"
                onView={() => editItem(item)}
                onEdit={() => editItem(item)}
                onDelete={() => void removeItem(item)}
                canDelete
              />,
            ])}
          />

          <EffectiveParameterPanel
            loading={isLoadingEffective}
            parameters={effectiveParameters?.parameters ?? []}
            layers={effectiveParameters?.layers ?? []}
          />

          {profilePushes.length > 0 && (
            <RegistryTable
              loading={false}
              empty="No profile push history"
              headers={['Status', 'Requested', 'Result']}
              rows={profilePushes.map(push => [
                <StatusPill key="status" label={push.pushStatus} tone={push.pushStatus === 'acked' || push.pushStatus === 'sent' || push.pushStatus === 'queued' ? 'ok' : 'warn'} />,
                push.requestedAt ? new Date(push.requestedAt).toLocaleString() : '-',
                push.resultMessage ?? '-',
              ])}
            />
          )}
        </>
      ) : (
        <div className="surface-panel-quiet px-4 py-6 font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
          Create a terminal override to edit parameters for this device.
        </div>
      )}
    </div>
  )
}

function RegistryTable({
  loading,
  empty,
  headers,
  rows,
  onRowClick,
  onCreate,
  createLabel,
}: {
  loading: boolean
  empty: string
  headers: string[]
  rows: React.ReactNode[][]
  onRowClick?: (() => void)[]
  onCreate?: () => void
  createLabel?: string
}) {
  if (loading) {
    return <div className="px-5 py-8 font-mono text-[12px]" style={{ color: 'var(--muted)' }}>Loading...</div>
  }

  if (rows.length === 0) {
    return (
      <div className="px-5 py-8 space-y-3">
        <div className="font-mono text-[12px]" style={{ color: 'var(--muted)' }}>{empty}</div>
        {onCreate && (
          <button className="btn-primary" onClick={onCreate}>
            {createLabel ?? 'Add'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="overflow-auto">
      {onCreate && (
        <div className="px-4 pt-4 pb-2">
          <button className="btn-primary" onClick={onCreate}>
            {createLabel ?? 'Add'}
          </button>
        </div>
      )}
      <table className="w-full min-w-[900px] management-table">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {headers.map(h => (
              <th
                key={h}
                className="text-left px-4 py-2 font-mono text-[9px] uppercase tracking-[0.2em]"
                style={{ color: 'var(--muted)' }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
              <tr
                key={i}
                style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}
                className={onRowClick?.[i] ? 'registry-row-clickable' : ''}
                onClick={onRowClick?.[i]}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-1)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2 text-[11px]" style={{ color: 'var(--muted-strong)', verticalAlign: 'middle' }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ParameterName({ entry, fallback }: { entry?: ParameterCatalogEntry; fallback: string }) {
  if (!entry) return <Mono>{fallback}</Mono>
  return (
    <span className="parameter-name" title={`${entry.longDescription ?? entry.shortDescription}\n\nBusiness impact: ${entry.businessImpact ?? '-'}\nType: ${entry.valueKind}${entry.unit ? `, unit: ${entry.unit}` : ''}${entry.minValue || entry.maxValue ? `\nRange: ${entry.minValue ?? '-'} to ${entry.maxValue ?? '-'}` : ''}`}>
      <span>{entry.parameterName}</span>
      <small>{entry.shortDescription}</small>
    </span>
  )
}

function EffectiveParameterPanel({
  loading,
  parameters,
  layers,
}: {
  loading: boolean
  parameters: EffectiveParameter[]
  layers: { layer: string; label: string; target?: string; profileId: string | null; precedence: number }[]
}) {
  const highlighted = parameters.filter(parameter =>
    parameter.sourceProfileId || parameter.parameterId === 1 || parameter.parameterId === 41 || parameter.alarmRelated,
  ).slice(0, 12)
  const grouped = useMemo(() => groupEffectiveParametersByCategory(highlighted), [highlighted])

  return (
    <div className="surface-panel-quiet px-4 py-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono text-[11px]" style={{ color: 'var(--muted-strong)' }}>
          {loading ? 'Resolving policy layers...' : `${parameters.length} catalog values resolved across ${layers.length} layers`}
        </div>
        <div className="flex items-center gap-2">
          {layers.filter(layer => layer.profileId).map(layer => (
            <StatusPill key={`${layer.profileId}-${layer.precedence}`} label={layer.layer} tone={layer.layer === 'terminal' ? 'warn' : 'muted'} />
          ))}
        </div>
      </div>
      <RegistryTable
        loading={loading}
        empty="No effective parameters"
        headers={['Parameter', 'Value', 'Source', 'Impact']}
        rows={grouped.flatMap(group => ([
          [
            <div key={`group-${group.category}`} className="font-display text-sm font-semibold" style={{ color: 'var(--foreground-strong)' }}>
              {group.category}
            </div>,
            <span key="group-value" className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
              {group.entries.length} parameters
            </span>,
            <span key="group-source" className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
              grouped by function
            </span>,
            <span key="group-impact" className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
              preview
            </span>,
          ],
          ...group.entries.map(parameter => [
            <ParameterName key="name" entry={{
              parameterId: parameter.parameterId,
              hexId: parameter.hexId,
              parameterName: parameter.parameterName,
              shortDescription: parameter.category,
              longDescription: null,
              valueKind: parameter.valueKind,
              unit: parameter.unit,
              minValue: null,
              maxValue: null,
              defaultValue: parameter.valueText,
              category: parameter.category,
              businessImpact: null,
              alarmRelated: parameter.alarmRelated,
              requiresRestart: parameter.requiresRestart,
              tableRef: 'JT808 Table 12',
            }} fallback={parameter.valueKind} />,
            <Mono key="value">{parameter.valueText ?? '-'}{parameter.unit ? ` ${parameter.unit}` : ''}</Mono>,
            <span key="source" className="parameter-name">
              <span>{parameter.sourceProfileName}</span>
              <small>{parameter.sourceLayer}</small>
            </span>,
            <div key="impact" className="flex items-center gap-2">
              {parameter.alarmRelated && <StatusPill label="alarm" tone="warn" />}
              {parameter.requiresRestart && <StatusPill label="restart" tone="muted" />}
            </div>,
          ]),
        ]))}
      />
    </div>
  )
}

function EditorDialog({
  editor,
  draft,
  orgOptions,
  deviceOptions,
  busy,
  onClose,
  onSubmit,
  onChange,
}: {
  editor: EditorState
  draft: OrgDraft | DeviceDraft | VehicleDraft | DriverDraft | ParameterDraft
  orgOptions: OrgUnit[]
  deviceOptions: RegistryDevice[]
  busy: boolean
  onClose: () => void
  onSubmit: () => void
  onChange: (draft: OrgDraft | DeviceDraft | VehicleDraft | DriverDraft | ParameterDraft) => void
}) {
  const title = editor.kind === 'org'
    ? editor.mode === 'create' ? 'Add organization' : 'Edit organization'
    : editor.kind === 'device'
      ? editor.mode === 'create' ? 'Add device' : 'Edit device'
      : editor.kind === 'vehicle'
        ? editor.mode === 'create' ? 'Add vehicle' : 'Edit vehicle'
        : editor.kind === 'driver'
          ? editor.mode === 'create' ? 'Add driver' : 'Edit driver'
          : editor.mode === 'create' ? 'Add parameter profile' : 'Edit parameter profile'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2,8,12,0.74)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      onClick={onClose}
    >
      <div
        className="surface-panel"
        style={{ width: 'min(760px, 100%)', maxHeight: '90vh', overflow: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <div className="font-display text-lg font-semibold" style={{ color: 'var(--foreground-strong)' }}>{title}</div>
          </div>
          <button
            className="font-mono text-lg"
            style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4">
          {editor.kind === 'org' ? (
            <OrgForm draft={draft as OrgDraft} orgOptions={orgOptions} onChange={next => onChange(next)} />
          ) : editor.kind === 'device' ? (
            <DeviceForm draft={draft as DeviceDraft} orgOptions={orgOptions} onChange={next => onChange(next)} />
          ) : editor.kind === 'vehicle' ? (
            <VehicleForm draft={draft as VehicleDraft} orgOptions={orgOptions} deviceOptions={deviceOptions} onChange={next => onChange(next)} />
          ) : editor.kind === 'driver' ? (
            <DriverForm draft={draft as DriverDraft} orgOptions={orgOptions} onChange={next => onChange(next)} />
          ) : (
            <ParameterForm draft={draft as ParameterDraft} orgOptions={orgOptions} deviceOptions={deviceOptions} onChange={next => onChange(next)} />
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="btn-primary" onClick={onSubmit} disabled={busy}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function OrgForm({
  draft,
  orgOptions,
  onChange,
}: {
  draft: OrgDraft
  orgOptions: OrgUnit[]
  onChange: (next: OrgDraft) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Parent organization">
        <select value={draft.parentOrgId} onChange={e => onChange({ ...draft, parentOrgId: e.target.value })}>
          <option value="">None</option>
          {orgOptions.map(org => (
            <option key={org.orgId} value={org.orgId}>{org.orgName}</option>
          ))}
        </select>
      </Field>
      <Field label="Organization code">
        <input value={draft.orgCode} onChange={e => onChange({ ...draft, orgCode: e.target.value })} placeholder="GOATAI" />
      </Field>
      <Field label="Organization name">
        <input value={draft.orgName} onChange={e => onChange({ ...draft, orgName: e.target.value })} placeholder="GoatAI Fleet" />
      </Field>
      <Field label="Type">
        <select value={draft.orgKind} onChange={e => onChange({ ...draft, orgKind: e.target.value })}>
          <option value="tenant">tenant</option>
          <option value="fleet">fleet</option>
          <option value="depot">depot</option>
          <option value="contractor">contractor</option>
          <option value="other">other</option>
        </select>
      </Field>
      <Field label="Status">
        <select value={draft.status} onChange={e => onChange({ ...draft, status: e.target.value })}>
          <option value="active">active</option>
          <option value="suspended">suspended</option>
          <option value="archived">archived</option>
        </select>
      </Field>
      <Field label="Contact name">
        <input value={draft.contactName} onChange={e => onChange({ ...draft, contactName: e.target.value })} />
      </Field>
      <Field label="Contact phone">
        <input value={draft.contactPhone} onChange={e => onChange({ ...draft, contactPhone: e.target.value })} />
      </Field>
      <Field label="Notes" className="col-span-2">
        <textarea
          value={draft.notes}
          onChange={e => onChange({ ...draft, notes: e.target.value })}
          rows={4}
        />
      </Field>
    </div>
  )
}

function DeviceForm({
  draft,
  orgOptions,
  onChange,
}: {
  draft: DeviceDraft
  orgOptions: OrgUnit[]
  onChange: (next: DeviceDraft) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Organization">
        <select value={draft.orgId} onChange={e => onChange({ ...draft, orgId: e.target.value })}>
          <option value="">Select organization</option>
          {orgOptions.map(org => (
            <option key={org.orgId} value={org.orgId}>{org.orgName}</option>
          ))}
        </select>
      </Field>
      <Field label="Terminal ID">
        <input value={draft.terminalId} onChange={e => onChange({ ...draft, terminalId: e.target.value })} placeholder="00000000000000000001" />
      </Field>
      <Field label="SIM">
        <input value={draft.sim} onChange={e => onChange({ ...draft, sim: e.target.value })} placeholder="00000000000000000001" />
      </Field>
      <Field label="Protocol family">
        <input value={draft.protocolFamily} onChange={e => onChange({ ...draft, protocolFamily: e.target.value })} />
      </Field>
      <Field label="Protocol version">
        <input value={draft.protocolVersion} onChange={e => onChange({ ...draft, protocolVersion: e.target.value })} />
      </Field>
      <Field label="Device model">
        <input value={draft.deviceModel} onChange={e => onChange({ ...draft, deviceModel: e.target.value })} />
      </Field>
      <Field label="Manufacturer">
        <input value={draft.manufacturerId} onChange={e => onChange({ ...draft, manufacturerId: e.target.value })} />
      </Field>
      <Field label="Firmware version">
        <input value={draft.firmwareVersion} onChange={e => onChange({ ...draft, firmwareVersion: e.target.value })} />
      </Field>
      <Field label="Hardware version">
        <input value={draft.hardwareVersion} onChange={e => onChange({ ...draft, hardwareVersion: e.target.value })} />
      </Field>
      <Field label="Install status">
        <select value={draft.installStatus} onChange={e => onChange({ ...draft, installStatus: e.target.value })}>
          <option value="inventory">inventory</option>
          <option value="installed">installed</option>
          <option value="maintenance">maintenance</option>
          <option value="retired">retired</option>
        </select>
      </Field>
      <Field label="Lifecycle status">
        <select value={draft.lifecycleStatus} onChange={e => onChange({ ...draft, lifecycleStatus: e.target.value })}>
          <option value="active">active</option>
          <option value="disabled">disabled</option>
          <option value="archived">archived</option>
        </select>
      </Field>
    </div>
  )
}

function VehicleForm({
  draft,
  orgOptions,
  deviceOptions,
  onChange,
}: {
  draft: VehicleDraft
  orgOptions: OrgUnit[]
  deviceOptions: RegistryDevice[]
  onChange: (next: VehicleDraft) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Organization">
        <select value={draft.orgId} onChange={e => onChange({ ...draft, orgId: e.target.value })}>
          <option value="">Select organization</option>
          {orgOptions.map(org => (
            <option key={org.orgId} value={org.orgId}>{org.orgName}</option>
          ))}
        </select>
      </Field>
      <Field label="Terminal device">
        <select value={draft.deviceId} onChange={e => onChange({ ...draft, deviceId: e.target.value })}>
          <option value="">None</option>
          {deviceOptions.map(device => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.terminalId} · {device.orgName}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Plate number">
        <input value={draft.plateNumber} onChange={e => onChange({ ...draft, plateNumber: e.target.value })} placeholder="GARUDA-001" />
      </Field>
      <Field label="Plate color">
        <select value={draft.plateColor} onChange={e => onChange({ ...draft, plateColor: e.target.value })}>
          <option value="blue">blue</option>
          <option value="yellow">yellow</option>
          <option value="black">black</option>
          <option value="white">white</option>
          <option value="green">green</option>
          <option value="other">other</option>
        </select>
      </Field>
      <Field label="VIN">
        <input value={draft.vin} onChange={e => onChange({ ...draft, vin: e.target.value })} />
      </Field>
      <Field label="Vehicle kind">
        <input value={draft.vehicleKind} onChange={e => onChange({ ...draft, vehicleKind: e.target.value })} />
      </Field>
      <Field label="Fuel kind">
        <input value={draft.fuelKind} onChange={e => onChange({ ...draft, fuelKind: e.target.value })} />
      </Field>
      <Field label="Capacity tons">
        <input type="number" step="0.1" value={draft.capacityTons} onChange={e => onChange({ ...draft, capacityTons: e.target.value })} placeholder="12.5" />
      </Field>
      <Field label="Operation status" className="col-span-2">
        <select value={draft.operationStatus} onChange={e => onChange({ ...draft, operationStatus: e.target.value })}>
          <option value="active">active</option>
          <option value="parked">parked</option>
          <option value="maintenance">maintenance</option>
          <option value="retired">retired</option>
        </select>
      </Field>
    </div>
  )
}

function DriverForm({
  draft,
  orgOptions,
  onChange,
}: {
  draft: DriverDraft
  orgOptions: OrgUnit[]
  onChange: (next: DriverDraft) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Organization">
        <select value={draft.orgId} onChange={e => onChange({ ...draft, orgId: e.target.value })}>
          <option value="">Select organization</option>
          {orgOptions.map(org => (
            <option key={org.orgId} value={org.orgId}>{org.orgName}</option>
          ))}
        </select>
      </Field>
      <Field label="Display name">
        <input value={draft.displayName} onChange={e => onChange({ ...draft, displayName: e.target.value })} placeholder="Arjun Singh" />
      </Field>
      <Field label="Phone">
        <input value={draft.phone} onChange={e => onChange({ ...draft, phone: e.target.value })} />
      </Field>
      <Field label="License number">
        <input value={draft.licenseNumber} onChange={e => onChange({ ...draft, licenseNumber: e.target.value })} />
      </Field>
      <Field label="License class">
        <input value={draft.licenseClass} onChange={e => onChange({ ...draft, licenseClass: e.target.value })} />
      </Field>
      <Field label="License expires on">
        <input type="date" value={draft.licenseExpiresOn} onChange={e => onChange({ ...draft, licenseExpiresOn: e.target.value })} />
      </Field>
      <Field label="Qualification number">
        <input value={draft.qualificationNumber} onChange={e => onChange({ ...draft, qualificationNumber: e.target.value })} />
      </Field>
      <Field label="Qualification expires on">
        <input type="date" value={draft.qualificationExpiresOn} onChange={e => onChange({ ...draft, qualificationExpiresOn: e.target.value })} />
      </Field>
      <Field label="Employment status">
        <select value={draft.employmentStatus} onChange={e => onChange({ ...draft, employmentStatus: e.target.value })}>
          <option value="active">active</option>
          <option value="off_duty">off_duty</option>
          <option value="suspended">suspended</option>
          <option value="archived">archived</option>
        </select>
      </Field>
      <Field label="Risk label">
        <select value={draft.riskLabel} onChange={e => onChange({ ...draft, riskLabel: e.target.value })}>
          <option value="normal">normal</option>
          <option value="watch">watch</option>
          <option value="high_risk">high_risk</option>
        </select>
      </Field>
    </div>
  )
}

function ParameterForm({
  draft,
  orgOptions,
  deviceOptions,
  onChange,
}: {
  draft: ParameterDraft
  orgOptions: OrgUnit[]
  deviceOptions: RegistryDevice[]
  onChange: (next: ParameterDraft) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Scope">
        <select
          value={draft.profileScope}
          onChange={e => onChange({
            ...draft,
            profileScope: e.target.value as ParameterDraft['profileScope'],
            orgId: e.target.value === 'org' ? draft.orgId : '',
            deviceId: e.target.value === 'terminal' ? draft.deviceId : '',
          })}
        >
          <option value="org">organization</option>
          <option value="terminal">terminal override</option>
          <option value="global">global default</option>
        </select>
      </Field>
      {draft.profileScope === 'org' ? (
      <Field label="Organization">
        <select value={draft.orgId} onChange={e => onChange({ ...draft, orgId: e.target.value })}>
          <option value="">Select organization</option>
          {orgOptions.map(org => (
            <option key={org.orgId} value={org.orgId}>{org.orgName}</option>
          ))}
        </select>
      </Field>
      ) : draft.profileScope === 'terminal' ? (
      <Field label="Terminal device">
        <select value={draft.deviceId} onChange={e => onChange({ ...draft, deviceId: e.target.value })}>
          <option value="">Select device</option>
          {deviceOptions.map(device => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.terminalId}{device.plateNumber ? ` · ${device.plateNumber}` : ''} · {device.orgName}
            </option>
          ))}
        </select>
      </Field>
      ) : (
      <Field label="Target">
        <input value="All terminals" disabled readOnly />
      </Field>
      )}
      <Field label="Profile name">
        <input value={draft.profileName} onChange={e => onChange({ ...draft, profileName: e.target.value })} placeholder="Default telemetry" />
      </Field>
      <Field label="Status">
        <select value={draft.profileStatus} onChange={e => onChange({ ...draft, profileStatus: e.target.value })}>
          <option value="draft">draft</option>
          <option value="active">active</option>
          <option value="archived">archived</option>
        </select>
      </Field>
      <Field label="Description" className="col-span-2">
        <textarea
          value={draft.description}
          onChange={e => onChange({ ...draft, description: e.target.value })}
          rows={4}
        />
      </Field>
    </div>
  )
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={`space-y-1 ${className}`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: 'var(--muted)' }}>
        {label}
      </div>
      <div>{children}</div>
      <style>{`
        label input, label select, label textarea {
          width: 100%;
          padding: 10px 12px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          background: var(--surface-1);
          color: var(--foreground);
          font-family: var(--ff-mono);
          font-size: 12px;
          outline: none;
        }
        label input:focus, label select:focus, label textarea:focus {
          border-color: var(--electric-border);
        }
        label textarea {
          resize: vertical;
          min-height: 110px;
        }
      `}</style>
    </label>
  )
}

function RowActions({
  onView,
  onEdit,
  onDelete,
  canDelete,
}: {
  onView: () => void
  onEdit: () => void
  onDelete: () => void
  canDelete: boolean
}) {
  return (
    <div className="flex items-center gap-2" onClick={event => event.stopPropagation()}>
      <button className="icon-btn" title="View" aria-label="View" onClick={onView}>
        <Eye size={14} strokeWidth={1.8} />
      </button>
      <button className="icon-btn" title="Edit" aria-label="Edit" onClick={onEdit}>
        <PencilLine size={14} strokeWidth={1.8} />
      </button>
      <button
        className="icon-btn danger"
        title={canDelete ? 'Delete' : 'Delete unavailable'}
        aria-label="Delete"
        onClick={onDelete}
        disabled={!canDelete}
      >
        <Trash2 size={14} strokeWidth={1.8} />
      </button>
    </div>
  )
}

function ManagementInspector({
  inspector,
  onClose,
  onEdit,
}: {
  inspector: InspectorState | null
  onClose: () => void
  onEdit: (inspector: InspectorState) => void
}) {
  if (!inspector) {
    return null
  }

  const title = inspector.kind === 'device'
    ? inspector.record.terminalId
    : inspector.kind === 'terminal'
      ? inspector.record.terminalId
    : inspector.kind === 'org'
      ? inspector.record.orgName
      : inspector.kind === 'vehicle'
        ? inspector.record.plateNumber
        : inspector.kind === 'driver'
          ? inspector.record.displayName
          : inspector.record.profileName
  const subtitle = inspector.kind === 'device'
    ? inspector.record.orgName
    : inspector.kind === 'terminal'
      ? `Connected at ${inspector.record.connectedAt}`
    : inspector.kind === 'org'
      ? inspector.record.orgCode
      : inspector.kind === 'vehicle'
        ? inspector.record.orgName
        : inspector.kind === 'driver'
          ? inspector.record.orgName
          : inspector.record.orgName
  const rows = inspector.kind === 'device'
    ? [
        ['SIM', inspector.record.sim],
        ['Protocol', `${inspector.record.protocolFamily} / ${inspector.record.protocolVersion}`],
        ['Model', inspector.record.deviceModel ?? '-'],
        ['Manufacturer', inspector.record.manufacturerId ?? '-'],
        ['Firmware', inspector.record.firmwareVersion ?? '-'],
        ['Lifecycle', inspector.record.lifecycleStatus],
        ['Channels', String(inspector.record.channelCount)],
      ]
    : inspector.kind === 'terminal'
      ? [
          ['Plate', inspector.record.plateNumber ?? '-'],
          ['Color', inspector.record.plateColorName ?? String(inspector.record.plateColor)],
          ['Manufacturer', inspector.record.manufacturerId ?? '-'],
          ['Connected', inspector.record.connectedAt],
        ]
    : inspector.kind === 'org'
      ? [
          ['Type', inspector.record.orgKind],
          ['Parent', inspector.record.parentOrgName ?? '-'],
          ['Devices', String(inspector.record.deviceCount)],
          ['Vehicles', String(inspector.record.vehicleCount)],
          ['Contact', inspector.record.contactName ?? '-'],
          ['Phone', inspector.record.contactPhone ?? '-'],
          ['Status', inspector.record.status],
        ]
      : inspector.kind === 'vehicle'
        ? [
            ['Terminal', inspector.record.terminalId ?? '-'],
            ['VIN', inspector.record.vin ?? '-'],
            ['Kind', inspector.record.vehicleKind],
            ['Fuel', inspector.record.fuelKind ?? '-'],
            ['Capacity', inspector.record.capacityTons == null ? '-' : `${inspector.record.capacityTons} t`],
            ['Driver', inspector.record.currentDriverName ?? '-'],
            ['Status', inspector.record.operationStatus],
          ]
        : inspector.kind === 'driver'
          ? [
              ['Phone', inspector.record.phone ?? '-'],
              ['License', inspector.record.licenseNumber ?? '-'],
              ['License class', inspector.record.licenseClass ?? '-'],
              ['License expiry', inspector.record.licenseExpiresOn ?? '-'],
              ['Qualification', inspector.record.qualificationNumber ?? '-'],
              ['Vehicle', inspector.record.currentVehiclePlate ?? '-'],
              ['Risk', inspector.record.riskLabel],
            ]
          : [
              ['Profile ID', inspector.record.profileId],
              ['Scope', inspector.record.profileScope],
              ['Target', parameterProfileTarget(inspector.record)],
              ['Description', inspector.record.description ?? '-'],
              ['Items', String(inspector.record.itemCount)],
              ['Status', inspector.record.profileStatus],
            ]

  return (
    <div
      className="management-inspector-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <aside className="management-inspector" onClick={e => e.stopPropagation()}>
        <div className="management-inspector-head">
          <div className="min-w-0">
            <div className="management-inspector-title">{title}</div>
            <div className="management-inspector-sub">{subtitle}</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={onClose}>Close</button>
            <button className="btn-secondary" onClick={() => onEdit(inspector)}>Edit</button>
          </div>
        </div>
        <div className="management-inspector-body">
          {rows.map(([label, value]) => (
            <div key={label} className="management-inspector-row">
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
          {inspector.kind === 'device' && (
            <div className="mt-4">
              <DeviceParametersPanel device={inspector.record} />
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'blue' | 'cyan' | 'green' | 'amber' | 'violet' }) {
  const color = {
    blue: '#7fa4bd',
    cyan: 'var(--electric)',
    green: 'var(--status-ok)',
    amber: 'var(--status-warn)',
    violet: '#a78bfa',
  }[tone]

  return (
    <div className="surface-panel-quiet px-4 py-3" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="font-display text-2xl font-semibold mt-1" style={{ color: 'var(--foreground-strong)' }}>
        {value}
      </div>
    </div>
  )
}

function StatusPill({ label, tone }: { label: string; tone: 'ok' | 'warn' | 'muted' }) {
  const styles = {
    ok: {
      background: 'var(--status-ok-soft)',
      border: 'var(--status-ok-border)',
      color: 'var(--status-ok)',
    },
    warn: {
      background: 'var(--status-warn-soft)',
      border: 'rgba(251,146,60,0.30)',
      color: 'var(--status-warn)',
    },
    muted: {
      background: 'var(--surface-2)',
      border: 'var(--border)',
      color: 'var(--muted-strong)',
    },
  }[tone]

  return (
    <span
      className="font-mono text-[10px] px-2 py-0.5"
      style={{
        background: styles.background,
        border: `1px solid ${styles.border}`,
        borderRadius: 'var(--radius-sm)',
        color: styles.color,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

function Mono({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span className="font-mono text-[11px]" style={{ color: strong ? 'var(--electric)' : 'var(--muted-strong)', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

function filterRows<T>(rows: T[], search: string, pick: (row: T) => (string | number | null | undefined)[]): T[] {
  const q = search.trim().toLowerCase()
  if (!q) return rows
  return rows.filter(row => pick(row).some(value => String(value ?? '').toLowerCase().includes(q)))
}

function groupCatalogByCategory(entries: ParameterCatalogEntry[]) {
  const byCategory = new Map<string, ParameterCatalogEntry[]>()
  for (const entry of entries) {
    const category = entry.category || 'Custom'
    const group = byCategory.get(category) ?? []
    group.push(entry)
    byCategory.set(category, group)
  }
  const orderedCategories = [
    ...PARAMETER_CATALOG_ORDER.filter(category => byCategory.has(category)),
    ...Array.from(byCategory.keys()).filter(category => !PARAMETER_CATALOG_ORDER.includes(category as never)).sort(),
  ]
  return orderedCategories.map(category => ({
    category,
    entries: byCategory.get(category) ?? [],
  }))
}

function groupEffectiveParametersByCategory(entries: EffectiveParameter[]) {
  const byCategory = new Map<string, EffectiveParameter[]>()
  for (const entry of entries) {
    const category = entry.category || 'Custom'
    const group = byCategory.get(category) ?? []
    group.push(entry)
    byCategory.set(category, group)
  }
  const orderedCategories = [
    ...PARAMETER_CATALOG_ORDER.filter(category => byCategory.has(category)),
    ...Array.from(byCategory.keys()).filter(category => !PARAMETER_CATALOG_ORDER.includes(category as never)).sort(),
  ]
  return orderedCategories.map(category => ({
    category,
    entries: byCategory.get(category) ?? [],
  }))
}

function blank(value: string): string | null {
  return value.trim() ? value : null
}

function parameterProfileTarget(profile: ParameterProfile): string {
  if (profile.profileScope === 'global') return 'All terminals'
  if (profile.profileScope === 'terminal') return profile.plateNumber ?? profile.terminalId ?? profile.deviceId ?? '-'
  return profile.orgName ?? profile.orgId ?? '-'
}

function parseParameterId(value: string): number {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) throw new Error('parameter ID is required')
  const parsed = trimmed.startsWith('0x') ? Number.parseInt(trimmed.slice(2), 16) : Number.parseInt(trimmed, 10)
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0) throw new Error('parameter ID must be a non-negative number')
  return parsed
}

function parseParameterIdLoose(value: string): number {
  try {
    return parseParameterId(value)
  } catch {
    return -1
  }
}

function formatParameterId(value: number): string {
  return `0x${value.toString(16).padStart(8, '0').toUpperCase()}`
}

function readError(err: unknown): string {
  if (typeof err === 'object' && err && 'response' in err) {
    const response = err as { response?: { data?: { error?: string } } }
    if (response.response?.data?.error) return response.response.data.error
  }
  if (err instanceof Error) return err.message
  return 'Request failed'
}
