// Rate-limit pace: grades each window by how fast it is being used, and decides which toasts to raise. Pure: no `$`.
// The linear-projection idea (amber at a projected 90%, red past 100%, quiet under 10% used) is claude-hud's (MIT).

import { fmtClock, labelOf } from './format'

export type Level = 'ok' | 'warn' | 'crit'

// A `SessionRateLimit` as `$.session.usage()` reports it.
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Grade = {
  level: Level
  // True when the current rate would use the whole window before it resets (drawn as ▲).
  ahead: boolean
  // Where the window would end at the current rate, in percent; absent when pace can't be read.
  projected?: number
  // When the window would run out at the current rate (ms since the epoch), when `ahead`.
  runsOutAt?: number
}

// Window lengths by kind; a kind without one (a gateway's spend_limit) is graded by its percentage alone.
export const WINDOW_MS: Record<string, number> = {
  five_hour: 5 * 3_600_000,
  seven_day: 7 * 86_400_000,
}

// Under this much use a projection is noise (3% five minutes in projects 180%).
const MIN_USED = 10
const WARN_PROJECTED = 90
const CRIT_PROJECTED = 100
// Fallback colours for a window whose pace can't be read (no reset time, unknown length).
const WARN_PCT = 60
const CRIT_PCT = 85

const RANK: Record<Level, number> = { ok: 0, warn: 1, crit: 2 }

export function grade(l: Limit, now: number): Grade {
  const pct = Number(l.percentUsed)
  if (!Number.isFinite(pct)) return { level: 'ok', ahead: false }
  if (pct >= 100) return { level: 'crit', ahead: false }
  const windowMs = WINDOW_MS[l.kind]
  const remaining = l.resetsAt ? Date.parse(l.resetsAt) - now : NaN
  if (windowMs && Number.isFinite(remaining) && remaining > 0 && remaining < windowMs) {
    if (pct < MIN_USED) return { level: 'ok', ahead: false }
    const elapsed = windowMs - remaining
    const projected = (pct * windowMs) / elapsed
    if (projected > CRIT_PROJECTED) {
      return { level: 'crit', ahead: true, projected, runsOutAt: now + ((100 - pct) / pct) * elapsed }
    }
    return { level: projected >= WARN_PROJECTED ? 'warn' : 'ok', ahead: false, projected }
  }
  return { level: pct >= CRIT_PCT ? 'crit' : pct >= WARN_PCT ? 'warn' : 'ok', ahead: false }
}

export function levelColor(level: Level): string {
  return level === 'crit' ? 'error' : level === 'warn' ? 'warning' : 'success'
}

// What the alerts remember per window kind, kept in `$.store` so every session shares one de-dup.
export type AlertEntry = { resetsAt?: string; pct: number; peak: Level; top: number }
export type AlertMemo = Record<string, AlertEntry>

// A reset moves `resetsAt` later; small shifts between readings of one window are not resets.
const RESET_SLACK_MS = 5 * 60_000
// Without reset times, a drop this large (in points) counts as a reset.
const RESET_DROP = 10

const isLevel = (v: unknown): v is Level => v === 'ok' || v === 'warn' || v === 'crit'

// Reads a stored memo, dropping anything malformed.
export function readMemo(raw: unknown): AlertMemo {
  const out: AlertMemo = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [kind, v] of Object.entries(raw as Record<string, any>)) {
    if (!v || typeof v !== 'object' || !isLevel(v.peak) || typeof v.pct !== 'number') continue
    out[kind] = {
      pct: v.pct,
      peak: v.peak,
      top: typeof v.top === 'number' ? v.top : v.pct,
      ...(typeof v.resetsAt === 'string' ? { resetsAt: v.resetsAt } : {}),
    }
  }
  return out
}

function isReset(prior: AlertEntry, l: Limit): boolean {
  if (prior.resetsAt && l.resetsAt) {
    const moved = Date.parse(l.resetsAt) - Date.parse(prior.resetsAt)
    return Number.isFinite(moved) && moved > RESET_SLACK_MS
  }
  return !prior.resetsAt && !l.resetsAt && prior.pct - l.percentUsed >= RESET_DROP
}

function alertText(l: Limit, g: Grade, now: number): string {
  const name = `${labelOf(l.kind)} limit at ${l.percentUsed}%`
  const reset = l.resetsAt ? fmtClock(Date.parse(l.resetsAt), now) : undefined
  if (g.ahead && g.runsOutAt !== undefined) {
    return `${name}: on pace to run out ~${fmtClock(g.runsOutAt, now)}${reset ? `, before its reset at ${reset}` : ''}`
  }
  if (g.level === 'warn' && g.projected !== undefined) {
    return `${name}: on pace for ~${Math.round(g.projected)}% by its reset${reset ? ` at ${reset}` : ''}`
  }
  return `${name}${reset ? `, resets ${reset}` : ''}`
}

// Compares this reading with the memo: one toast when a window first reaches amber or red (and again on red after amber),
// and one when a window that had alerted resets. A window that dips and climbs again before resetting stays quiet.
export function checkAlerts(memo: AlertMemo, limits: readonly Limit[], now: number): { memo: AlertMemo; toasts: string[] } {
  const next: AlertMemo = { ...memo }
  const toasts: string[] = []
  for (const l of limits) {
    if (typeof l?.kind !== 'string' || !Number.isFinite(Number(l.percentUsed))) continue
    const g = grade(l, now)
    let prior = memo[l.kind]
    if (prior && isReset(prior, l)) {
      if (prior.peak !== 'ok') toasts.push(`${labelOf(l.kind)} limit reset (it reached ${prior.top}%)`)
      prior = undefined
    }
    const peak = prior && RANK[prior.peak] >= RANK[g.level] ? prior.peak : g.level
    if (RANK[g.level] > RANK[prior?.peak ?? 'ok']) toasts.push(alertText(l, g, now))
    next[l.kind] = {
      pct: l.percentUsed,
      peak,
      top: Math.max(prior?.top ?? 0, l.percentUsed),
      ...(l.resetsAt ? { resetsAt: l.resetsAt } : {}),
    }
  }
  return { memo: next, toasts }
}
