import { useEffect, useMemo, useState } from 'react'
import {
  useCreateOrgUnit,
  useCreateRegistryDevice,
  useDeleteOrgUnit,
  useDeleteRegistryDevice,
  useDriverProfiles,
  useOrgUnits,
  useParameterProfiles,
  useRegistryDevices,
  useRegistrySummary,
  useTerminals,
  useUpdateOrgUnit,
  useUpdateRegistryDevice,
  useVehicleAssets,
} from '../../api/hooks'
import type { OrgUnit, RegistryDevice } from '../../types'

type Section = 'devices' | 'organizations' | 'vehicles' | 'drivers' | 'parameters'
type EditorKind = 'org' | 'device'

type EditorState =
  | { kind: 'org'; mode: 'create'; org?: OrgUnit }
  | { kind: 'org'; mode: 'edit'; org: OrgUnit }
  | { kind: 'device'; mode: 'create'; device?: RegistryDevice }
  | { kind: 'device'; mode: 'edit'; device: RegistryDevice }

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

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'devices', label: 'Devices' },
  { id: 'organizations', label: 'Organizations' },
  { id: 'vehicles', label: 'Vehicles' },
  { id: 'drivers', label: 'Drivers' },
  { id: 'parameters', label: 'Parameters' },
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

export default function ManagementPage() {
  const [section, setSection] = useState<Section>('devices')
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [draft, setDraft] = useState<OrgDraft | DeviceDraft>(EMPTY_ORG)
  const [error, setError] = useState<string | null>(null)

  const { data: summary } = useRegistrySummary()
  const { data: orgs = [] } = useOrgUnits()
  const createOrg = useCreateOrgUnit()
  const updateOrg = useUpdateOrgUnit()
  const deleteOrg = useDeleteOrgUnit()
  const createDevice = useCreateRegistryDevice()
  const updateDevice = useUpdateRegistryDevice()
  const deleteDevice = useDeleteRegistryDevice()

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
    } else {
      const device = editor.mode === 'edit' ? editor.device : editor.device
      setDraft({
        orgId: device?.orgId ?? '',
        terminalId: device?.terminalId ?? '',
        sim: device?.sim ?? '',
        protocolFamily: device?.protocolFamily ?? 'JT808',
        protocolVersion: device?.protocolVersion ?? 'JT/T 808-2013',
        deviceModel: device?.deviceModel ?? '',
        manufacturerId: device?.manufacturerId ?? '',
        firmwareVersion: device?.firmwareVersion ?? '',
        hardwareVersion: device?.hardwareVersion ?? '',
        installStatus: device?.installStatus ?? 'inventory',
        lifecycleStatus: device?.lifecycleStatus ?? 'active',
      })
    }
  }, [editor])

  const sectionTitle = {
    devices: 'Devices',
    organizations: 'Organizations',
    vehicles: 'Vehicles',
    drivers: 'Drivers',
    parameters: 'Parameters',
  }[section]

  const canCreate = section === 'devices' || section === 'organizations'

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
      } else {
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
      }
      setEditor(null)
    } catch (err) {
      setError(readError(err))
    }
  }

  async function removeEditor(kind: EditorKind, id: string) {
    const ok = window.confirm(`Delete this ${kind === 'org' ? 'organization' : 'device'}?`)
    if (!ok) return
    try {
      setError(null)
      if (kind === 'org') {
        await deleteOrg.mutateAsync(id)
      } else {
        await deleteDevice.mutateAsync(id)
      }
    } catch (err) {
      setError(readError(err))
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="eyebrow text-[9px] mb-1">Garuda Registry</div>
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
            disabled={!canCreate}
            onClick={() => setEditor(section === 'devices' ? { kind: 'device', mode: 'create' } : { kind: 'org', mode: 'create' })}
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
            onEdit={device => setEditor({ kind: 'device', mode: 'edit', device })}
            onDelete={deviceId => void removeEditor('device', deviceId)}
          />
        )}

        {section === 'organizations' && (
          <OrganizationsTable
            search={search}
            onCreate={() => setEditor({ kind: 'org', mode: 'create' })}
            onEdit={org => setEditor({ kind: 'org', mode: 'edit', org })}
            onDelete={orgId => void removeEditor('org', orgId)}
          />
        )}

        {section === 'vehicles' && <VehiclesTable search={search} />}
        {section === 'drivers' && <DriversTable search={search} />}
        {section === 'parameters' && <ParametersTable search={search} />}
      </div>

      {editor && (
        <EditorDialog
          editor={editor}
          draft={draft}
          orgOptions={orgs}
          busy={
            createOrg.isPending ||
            updateOrg.isPending ||
            createDevice.isPending ||
            updateDevice.isPending
          }
          onClose={() => setEditor(null)}
          onSubmit={saveEditor}
          onChange={setDraft}
        />
      )}
    </div>
  )
}

function DevicesTable({
  search,
  onCreate,
  onEdit,
  onDelete,
}: {
  search: string
  onCreate: () => void
  onEdit: (device: RegistryDevice) => void
  onDelete: (deviceId: string) => void
}) {
  const { data: devices = [], isLoading } = useRegistryDevices()
  const { data: terminals = [] } = useTerminals()
  const online = useMemo(() => new Set(terminals.map(t => t.terminalId)), [terminals])
  const rows = filterRows(devices, search, d => [
    d.terminalId, d.sim, d.plateNumber, d.orgName, d.deviceModel, d.installStatus, d.lifecycleStatus,
  ])

  return (
    <RegistryTable
      loading={isLoading}
      empty="No registered devices"
      headers={['Status', 'Terminal', 'Plate', 'Organization', 'Model', 'Protocol', 'Channels', 'Lifecycle', 'Actions']}
      rows={rows.map(d => [
        <StatusPill key="status" label={online.has(d.terminalId) ? 'online' : d.installStatus} tone={online.has(d.terminalId) ? 'ok' : 'muted'} />,
        <Mono key="terminal" strong>{d.terminalId}</Mono>,
        <Mono key="plate">{d.plateNumber ?? '-'}</Mono>,
        d.orgName,
        d.deviceModel ?? '-',
        `${d.protocolFamily} · ${d.protocolVersion}`,
        String(d.channelCount),
        <StatusPill key="life" label={d.lifecycleStatus} tone={d.lifecycleStatus === 'active' ? 'ok' : 'warn'} />,
        <RowActions
          key="actions"
          onEdit={() => onEdit(d)}
          onDelete={() => onDelete(d.deviceId)}
          canDelete={d.channelCount === 0 && d.plateNumber == null}
        />,
      ])}
      onCreate={onCreate}
      createLabel="Add device"
    />
  )
}

function OrganizationsTable({
  search,
  onCreate,
  onEdit,
  onDelete,
}: {
  search: string
  onCreate: () => void
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
          onEdit={() => onEdit(o)}
          onDelete={() => onDelete(o.orgId)}
          canDelete={o.deviceCount === 0 && o.vehicleCount === 0 && o.parentOrgId == null}
        />,
      ])}
      onCreate={onCreate}
      createLabel="Add organization"
    />
  )
}

function VehiclesTable({ search }: { search: string }) {
  const { data: vehicles = [], isLoading } = useVehicleAssets()
  const rows = filterRows(vehicles, search, v => [
    v.plateNumber, v.vin, v.orgName, v.terminalId, v.vehicleKind, v.operationStatus, v.currentDriverName,
  ])

  return (
    <RegistryTable
      loading={isLoading}
      empty="No vehicle assets"
      headers={['Plate', 'Organization', 'Terminal', 'Kind', 'Fuel', 'Driver', 'Status']}
      rows={rows.map(v => [
        <Mono key="plate" strong>{v.plateNumber}</Mono>,
        v.orgName,
        <Mono key="terminal">{v.terminalId ?? '-'}</Mono>,
        v.vehicleKind,
        v.fuelKind ?? '-',
        v.currentDriverName ?? '-',
        <StatusPill key="status" label={v.operationStatus} tone={v.operationStatus === 'active' ? 'ok' : 'muted'} />,
      ])}
    />
  )
}

function DriversTable({ search }: { search: string }) {
  const { data: drivers = [], isLoading } = useDriverProfiles()
  const rows = filterRows(drivers, search, d => [
    d.displayName, d.phone, d.orgName, d.licenseNumber, d.qualificationNumber, d.riskLabel, d.currentVehiclePlate,
  ])

  return (
    <RegistryTable
      loading={isLoading}
      empty="No driver profiles"
      headers={['Driver', 'Organization', 'Phone', 'License', 'Qualification', 'Vehicle', 'Risk', 'Status']}
      rows={rows.map(d => [
        d.displayName,
        d.orgName,
        d.phone ?? '-',
        <Mono key="license">{d.licenseNumber ?? '-'}</Mono>,
        <Mono key="qualification">{d.qualificationNumber ?? '-'}</Mono>,
        d.currentVehiclePlate ?? '-',
        <StatusPill key="risk" label={d.riskLabel} tone={d.riskLabel === 'normal' ? 'ok' : 'warn'} />,
        <StatusPill key="status" label={d.employmentStatus} tone={d.employmentStatus === 'active' ? 'ok' : 'muted'} />,
      ])}
    />
  )
}

function ParametersTable({ search }: { search: string }) {
  const { data: profiles = [], isLoading } = useParameterProfiles()
  const rows = filterRows(profiles, search, p => [
    p.profileName, p.orgName, p.profileStatus, p.description,
  ])

  return (
    <RegistryTable
      loading={isLoading}
      empty="No parameter profiles"
      headers={['Profile', 'Organization', 'Items', 'Description', 'Status']}
      rows={rows.map(p => [
        <Mono key="profile" strong>{p.profileName}</Mono>,
        p.orgName,
        String(p.itemCount),
        p.description ?? '-',
        <StatusPill key="status" label={p.profileStatus} tone={p.profileStatus === 'active' ? 'ok' : 'muted'} />,
      ])}
    />
  )
}

function RegistryTable({
  loading,
  empty,
  headers,
  rows,
  onCreate,
  createLabel,
}: {
  loading: boolean
  empty: string
  headers: string[]
  rows: React.ReactNode[][]
  onCreate?: () => void
  createLabel?: string
}) {
  if (loading) {
    return <div className="px-5 py-8 font-mono text-[12px]" style={{ color: 'var(--muted)' }}>Loading registry...</div>
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
      <table className="w-full min-w-[980px]">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {headers.map(h => (
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
          {rows.map((row, i) => (
            <tr
              key={i}
              style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-1)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {row.map((cell, j) => (
                <td key={j} className="px-5 py-3 text-[12px]" style={{ color: 'var(--muted-strong)', verticalAlign: 'middle' }}>
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

function EditorDialog({
  editor,
  draft,
  orgOptions,
  busy,
  onClose,
  onSubmit,
  onChange,
}: {
  editor: EditorState
  draft: OrgDraft | DeviceDraft
  orgOptions: OrgUnit[]
  busy: boolean
  onClose: () => void
  onSubmit: () => void
  onChange: (draft: OrgDraft | DeviceDraft) => void
}) {
  const title = editor.kind === 'org'
    ? editor.mode === 'create' ? 'Add organization' : 'Edit organization'
    : editor.mode === 'create' ? 'Add device' : 'Edit device'

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
            <div className="eyebrow text-[9px] mb-1">Garuda Registry</div>
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
          ) : (
            <DeviceForm draft={draft as DeviceDraft} orgOptions={orgOptions} onChange={next => onChange(next)} />
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
  onEdit,
  onDelete,
  canDelete,
}: {
  onEdit: () => void
  onDelete: () => void
  canDelete: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={onEdit}>
        ✎ Edit
      </button>
      <button
        className="btn-secondary"
        style={{
          padding: '4px 10px',
          fontSize: '11px',
          opacity: canDelete ? 1 : 0.45,
        }}
        onClick={onDelete}
        disabled={!canDelete}
      >
        ⌫ Delete
      </button>
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

function blank(value: string): string | null {
  return value.trim() ? value : null
}

function readError(err: unknown): string {
  if (typeof err === 'object' && err && 'response' in err) {
    const response = err as { response?: { data?: { error?: string } } }
    if (response.response?.data?.error) return response.response.data.error
  }
  if (err instanceof Error) return err.message
  return 'Request failed'
}
