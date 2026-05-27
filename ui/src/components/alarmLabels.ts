const MASK_LABELS: Record<number, string> = {
  1: 'Emergency',
  2: 'Overspeed',
  4: 'Driving Malfunction',
  8: 'Risk Warning',
  16: 'GNSS Fault',
  32: 'GNSS Antenna Disconnect',
  64: 'GNSS Antenna Short',
  128: 'Power Undervoltage',
  256: 'Power Off',
  512: 'LCD Malfunction',
  1024: 'TTS Malfunction',
  2048: 'Camera Malfunction',
  4096: 'IC Card Malfunction',
  8192: 'Overspeed Warning',
  16384: 'Eye Closure',
  262144: 'Accumulated Overspeed',
  524288: 'Timeout Parking',
  1048576: 'Area Entry/Exit',
  2097152: 'Route Entry/Exit',
  4194304: 'Route Time Alarm',
  8388608: 'Off Track',
  16777216: 'VSS Malfunction',
  33554432: 'Abnormal Fuel',
  67108864: 'Vehicle Stolen',
  134217728: 'Illegal Ignition',
  268435456: 'Illegal Displacement',
  536870912: 'Collision Warning',
  1073741824: 'Rollover Warning',
}

const EVENT_LABELS: Record<number, string> = {
  1: 'Eye Closure',
  2: 'Robbery / Emergency',
  3: 'Collision Warning',
}

export function alarmLabel(value: number) {
  return MASK_LABELS[value] ?? EVENT_LABELS[value] ?? `Alarm ${value}`
}

