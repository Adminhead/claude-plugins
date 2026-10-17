// Pure logic for cache-clock: when the prompt cache likely expires. No `$`.
//
// The real expiry is not visible to mods. This assumes the cache was refreshed
// when the last main-loop turn that got an API response ended, and lives `ttl`.

export type ClockOptions = {
  ttlMs: number
  display: 'hint' | 'status'
}

export const TTL_MS = { '5m': 5 * 60_000, '1h': 60 * 60_000 } as const

export const DEFAULTS: ClockOptions = { ttlMs: TTL_MS['5m'], display: 'hint' }

export function parseOptions(raw: Readonly<Record<string, unknown>> | undefined): ClockOptions {
  const o = raw ?? {}
  return {
    ttlMs: o.ttl === '1h' ? TTL_MS['1h'] : TTL_MS['5m'],
    display: o.display === 'status' ? 'status' : 'hint',
  }
}

// True for a turn.complete that refreshed the main conversation's cache:
// the main loop (no agentId) and at least one API response (usage present).
export function refreshesCache(e: { agentId?: unknown; usage?: unknown }): boolean {
  return (e.agentId === undefined || e.agentId === '') && typeof e.usage === 'object' && e.usage !== null
}

const pad = (n: number) => String(n).padStart(2, '0')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Local wall-clock time: `14:32` on the same day as `now`, else `Oct 16 14:32`.
export function fmtClock(ms: number, now: number): string {
  const d = new Date(ms)
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return d.toDateString() === new Date(now).toDateString() ? hm : `${MONTHS[d.getMonth()]} ${d.getDate()} ${hm}`
}

export type Label = { text: string; cold: boolean }

// The segment, or null before the first main-loop turn. `~` marks the time as an estimate.
export function label(lastAt: number | null, ttlMs: number, now: number): Label | null {
  if (lastAt === null || !Number.isFinite(lastAt)) return null
  const expires = lastAt + ttlMs
  const at = fmtClock(expires, now)
  return now < expires ? { text: `cache warm → ~${at}`, cold: false } : { text: `cache cold since ~${at}`, cold: true }
}
