// The plugin's userConfig values, read defensively. Pure: no `$`.

import { DEFAULT_PACE, type PaceThresholds } from './pace'

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

const intIn = (v: unknown, min: number, max: number, d: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isNaN(n) ? d : Math.min(max, Math.max(min, Math.floor(n)))
}

// The pace thresholds; a pair whose warn is not below its crit reverts both values to the defaults.
export function paceOf(raw: Readonly<Record<string, unknown>> | undefined): PaceThresholds {
  const o = raw ?? {}
  const d = DEFAULT_PACE
  const warnPace = intIn(o.warnPace, 1, 200, d.warnPace)
  const critPace = intIn(o.critPace, 1, 200, d.critPace)
  const warnPercent = intIn(o.warnPercent, 1, 100, d.warnPercent)
  const critPercent = intIn(o.critPercent, 1, 100, d.critPercent)
  const paceOk = warnPace < critPace
  const percentOk = warnPercent < critPercent
  return {
    warnPace: paceOk ? warnPace : d.warnPace,
    critPace: paceOk ? critPace : d.critPace,
    warnPercent: percentOk ? warnPercent : d.warnPercent,
    critPercent: percentOk ? critPercent : d.critPercent,
  }
}
