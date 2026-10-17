// Text formatting for the band and its toasts. Pure: no `$`.

export function fmtTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 999_500) return `${Math.round(n / 1000)}k`
  return `${Number((n / 1e6).toFixed(1))}M`
}

// Time left until `iso`: `1h29m`, or `1h 29m` spaced.
export function fmtReset(iso: string, now: number, spaced: boolean): string {
  const mins = Math.max(0, Math.floor((Date.parse(iso) - now) / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  const parts = d > 0 ? [`${d}d`, h && `${h}h`] : h > 0 ? [`${h}h`, m && `${m}m`] : [`${m}m`]
  return parts.filter(Boolean).join(spaced ? ' ' : '')
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')

// A wall-clock time in local time: `14:30` today, `Thu 09:00` within the coming week, else `Oct 24`.
export function fmtClock(ms: number, now: number): string {
  const d = new Date(ms)
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.toDateString() === new Date(now).toDateString()) return hm
  if (ms > now && ms - now < 6.5 * 86_400_000) return `${DAYS[d.getDay()]} ${hm}`
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export function fmtUsd(usd: number): string {
  if (!Number.isFinite(usd) || usd < 0) return '$0.00'
  if (usd < 10) return `$${usd.toFixed(2)}`
  if (usd < 100) return `$${usd.toFixed(1)}`
  return `$${Math.round(usd)}`
}

export type ApiUsage = {
  input_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

// Share of the last response's input read from the prompt cache, 0 to 100; null before a response or with no input.
export function cacheHit(api: ApiUsage | null | undefined): number | null {
  if (!api) return null
  const read = api.cache_read_input_tokens || 0
  const total = (api.input_tokens || 0) + read + (api.cache_creation_input_tokens || 0)
  return total > 0 ? Math.round((read / total) * 100) : null
}

const EFFORT_GLYPH: Record<string, string> = { low: '○', medium: '◔', high: '◑', xhigh: '◕', max: '●' }

// `◑ high` for a named level, `effort 32k` for a token budget; undefined without one.
export function effortBadge(effort: unknown): string | undefined {
  if (typeof effort === 'string' && effort) return `${EFFORT_GLYPH[effort] ?? '◑'} ${effort.slice(0, 8)}`
  if (typeof effort === 'number' && Number.isFinite(effort) && effort > 0) return `effort ${fmtTokens(effort)}`
  return undefined
}

const LABELS: Record<string, [long: string, short: string]> = {
  five_hour: ['5h', '5h'],
  seven_day: ['weekly', 'wk'],
  spend_limit: ['spend', 'spend'],
}

// The band's name for a window kind; an unknown kind is shown as itself, shortened.
export function labelOf(kind: string, short = false): string {
  const known = LABELS[kind]
  if (known) return short ? known[1] : known[0]
  return kind.replace(/_/g, ' ').slice(0, 8)
}
