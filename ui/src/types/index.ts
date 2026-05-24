export interface Terminal {
  terminalId: string
  connectedAt: string
  plateNumber: string
  plateColor: number
  plateColorName: string
  manufacturerId: string
}

export interface MediaSession {
  terminalId: string
  channelId: number
  frames: number
  bytes: number
  active: boolean
  lastFrameLength: number
  lastSequence: number
  startedAt: string
  lastSeen: string
}

export interface AlarmClip {
  id: string
  terminalId: string
  mediaType: number
  formatCode: number
  eventCode: number
  channelId: number
  lat: number
  lon: number
  speedKmh: number
  direction: number
  alarmFlags: number
  eventTime: string
  receivedAt: string
  payloadSize: number
  fileName: string
  mediaTypeName: string
  alarmTypeName: string
}

export interface ServiceStatus {
  id: string
  name: string
  description: string
  group: string
  displayOrder: number
  running: boolean
  pid: number | null
  startedAt: string | null
  exitCode: number | null
}

export interface LatestPosition {
  vehicleId: string
  sim: string
  lat: number
  lon: number
  speed: number
  direction: number
  gpsTime: string
}

export interface RecentAlarm {
  vehicleId: string
  sim: string
  alarmId: string
  alarmType: number
  alarmLevel: number
  lat: number
  lon: number
  speed: number
  alarmStartTime: string
  receivedAt: string
}

export interface AlarmFile {
  vehicleId: string
  sim: string
  alarmId: string
  alarmType: number
  channel: number
  format: number
  fileName: string
  size: number
  url: string
  path: string
  uploadTime: string
}

export interface RegistrySummary {
  organizations: number
  devices: number
  vehicles: number
  drivers: number
  profiles: number
}

export interface OrgUnit {
  orgId: string
  parentOrgId: string | null
  orgCode: string
  orgName: string
  orgKind: string
  status: string
  contactName: string | null
  contactPhone: string | null
  parentOrgName: string | null
  deviceCount: number
  vehicleCount: number
}

export interface RegistryDevice {
  deviceId: string
  orgId: string
  orgName: string
  terminalId: string
  sim: string
  protocolFamily: string
  protocolVersion: string
  deviceModel: string | null
  manufacturerId: string | null
  firmwareVersion: string | null
  hardwareVersion: string | null
  installStatus: string
  lifecycleStatus: string
  lastSeenAt: string | null
  plateNumber: string | null
  channelCount: number
}

export interface VehicleAsset {
  vehicleId: string
  orgId: string
  orgName: string
  deviceId: string | null
  terminalId: string | null
  plateNumber: string
  plateColor: string
  vin: string | null
  vehicleKind: string
  fuelKind: string | null
  capacityTons: number | null
  operationStatus: string
  currentDriverId: string | null
  currentDriverName: string | null
}

export interface DriverProfile {
  driverId: string
  orgId: string
  orgName: string
  displayName: string
  phone: string | null
  licenseNumber: string | null
  licenseClass: string | null
  licenseExpiresOn: string | null
  qualificationNumber: string | null
  qualificationExpiresOn: string | null
  employmentStatus: string
  riskLabel: string
  currentVehiclePlate: string | null
}

export interface ParameterProfile {
  profileId: string
  orgId: string
  orgName: string
  profileName: string
  description: string | null
  profileStatus: string
  itemCount: number
}

export interface ParameterItem {
  itemId: string
  profileId: string
  parameterId: number
  valueKind: string
  valueText: string
  createdAt: string | null
}

export interface ParameterCatalogEntry {
  parameterId: number
  hexId: string
  parameterName: string
  shortDescription: string
  longDescription: string | null
  valueKind: string
  unit: string | null
  minValue: string | null
  maxValue: string | null
  defaultValue: string | null
  category: string
  businessImpact: string | null
  alarmRelated: boolean
  requiresRestart: boolean
  tableRef: string
}

export interface ParameterPush {
  pushId: string
  deviceId: string
  terminalId: string
  plateNumber: string | null
  profileId: string
  profileName: string
  commandId: number | null
  pushStatus: string
  requestedBy: string | null
  requestedAt: string | null
  completedAt: string | null
  resultMessage: string | null
}
