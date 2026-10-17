// Pure logic for turn-stats: the toast text for a finished turn. No `$`.

export type StatsOptions = {
  thresholdMs: number
  includeAborted: boolean
}

export const DEFAULTS: StatsOptions = { thresholdMs: 60_000, includeAborted: false }

export function parseOptions(raw: Readonly<Record<string, unknown>> | undefined): StatsOptions {
  const o = raw ?? {}
  const v = o.thresholdSeconds
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return {
    thresholdMs: Number.isFinite(n) ? Math.max(0, Math.min(86_400, n)) * 1000 : DEFAULTS.thresholdMs,
    includeAborted: o.includeAborted === true,
  }
}

export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export type TurnLike = {
  durationMs: number
  isAborted?: boolean
  reason?: string
  agentId?: string
  usage?: Usage
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)

// `45s`, `3m12s`, `1h05m`.
export function fmtDuration(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

export function fmtTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 999_500) return `${Math.round(n / 1000)}k`
  return `${Number((n / 1e6).toFixed(1))}M`
}

// Share of the turn's input tokens served from the cache, 0-100, or null with no input.
export function cacheHit(u: Usage | undefined): number | null {
  if (!u) return null
  const read = num(u.cache_read_input_tokens)
  const total = num(u.input_tokens) + read + num(u.cache_creation_input_tokens)
  return total > 0 ? Math.round((read / total) * 100) : null
}

// The toast for a turn, or null when it gets none: a subagent's turn, a short
// one, or an interrupted one unless `includeAborted`.
export function toastText(e: TurnLike, o: StatsOptions): string | null {
  if (e.agentId) return null
  if (!(typeof e.durationMs === 'number' && e.durationMs >= o.thresholdMs)) return null
  const aborted = e.isAborted === true || e.reason === 'aborted'
  if (aborted && !o.includeAborted) return null
  // Compact, because the notification bar is shared and clips long text.
  const parts = [fmtDuration(e.durationMs)]
  if (e.usage) {
    parts.push(`${fmtTokens(num(e.usage.output_tokens))}↑`)
    const hit = cacheHit(e.usage)
    if (hit !== null) parts.push(`${hit}%c`)
  }
  if (aborted) parts.push('interrupted')
  else if (e.reason === 'error') parts.push('error')
  else if (e.reason === 'refusal') parts.push('refused')
  return parts.join(' ')
}
