// The plugin's userConfig values, read defensively. Pure: no `$`.

export type BandOptions = {
  // Show a limit only at or above this percentage, or on a pace alert; 0 shows every window.
  limitsThreshold: number
  // Add the weekly and spend windows to the collapsed row at or above this percentage, or on a pace alert.
  weeklyThreshold: number
  resetStyle: 'countdown' | 'clock'
  alerts: boolean
  sessionStats: boolean
}

export const DEFAULTS: BandOptions = {
  limitsThreshold: 0,
  weeklyThreshold: 80,
  resetStyle: 'countdown',
  alerts: true,
  sessionStats: true,
}

const pct = (v: unknown, fallback: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback
}

export function parseOptions(raw: Readonly<Record<string, unknown>> | undefined): BandOptions {
  const o = raw ?? {}
  return {
    limitsThreshold: pct(o.limitsThreshold, DEFAULTS.limitsThreshold),
    weeklyThreshold: pct(o.weeklyThreshold, DEFAULTS.weeklyThreshold),
    resetStyle: o.resetStyle === 'clock' ? 'clock' : 'countdown',
    alerts: o.alerts !== false,
    sessionStats: o.sessionStats !== false,
  }
}
