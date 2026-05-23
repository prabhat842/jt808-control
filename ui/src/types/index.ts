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
