// Pure logic for mcp-health: which MCP servers' latest call errored. No `$`.

// Longest tool name parsed; the name is model-controlled text.
export const MAX_TOOL_NAME = 256
// Servers listed by name before the rest collapse into `+N`.
export const MAX_SHOWN = 3
const MAX_NAME = 32

export type Health = {
  // Servers whose latest call errored.
  failing: readonly string[]
  // Servers that have errored at least once this session (for the first-error toast).
  seen: readonly string[]
}

export const EMPTY: Health = { failing: [], seen: [] }

// The server in `mcp__<server>__<tool>`, or null for any other or overlong name.
export function serverOf(tool: unknown): string | null {
  if (typeof tool !== 'string' || tool.length > MAX_TOOL_NAME || !tool.startsWith('mcp__')) return null
  const rest = tool.slice(5)
  const end = rest.indexOf('__')
  if (end <= 0 || end + 2 >= rest.length) return null
  return rest.slice(0, end)
}

export type Outcome = 'ok' | 'error' | 'skip'

// Classifies what `next(e)` resolved to: a deny never reached the server, so it is skipped.
export function outcomeOf(out: unknown): Outcome {
  if (!out || typeof out !== 'object') return 'skip'
  const o = out as { deny?: unknown; isError?: unknown }
  if (typeof o.deny === 'string') return 'skip'
  return o.isError === true ? 'error' : 'ok'
}

// Records one call's outcome. `firstError` is true the first time `server` errors this session.
export function record(h: Health, server: string, outcome: Outcome): { health: Health; changed: boolean; firstError: boolean } {
  if (outcome === 'skip') return { health: h, changed: false, firstError: false }
  const isFailing = h.failing.includes(server)
  if (outcome === 'ok') {
    if (!isFailing) return { health: h, changed: false, firstError: false }
    return { health: { ...h, failing: h.failing.filter(s => s !== server) }, changed: true, firstError: false }
  }
  const firstError = !h.seen.includes(server)
  if (isFailing && !firstError) return { health: h, changed: false, firstError: false }
  return {
    health: {
      failing: isFailing ? h.failing : [...h.failing, server],
      seen: firstError ? [...h.seen, server] : h.seen,
    },
    changed: true,
    firstError,
  }
}

export function clip(s: string): string {
  return s.length > MAX_NAME ? `${s.slice(0, MAX_NAME - 1)}…` : s
}

// The segment text, `mcp: github ✗ sentry ✗ +2`, or null while all are fine.
export function segment(h: Health): string | null {
  if (h.failing.length === 0) return null
  const shown = h.failing.slice(0, MAX_SHOWN).map(s => `${clip(s)} ✗`)
  const more = h.failing.length - MAX_SHOWN
  return `mcp: ${shown.join(' ')}${more > 0 ? ` +${more}` : ''}`
}

export function toastText(server: string): string {
  return `MCP server ${clip(server)} returned an error`
}

// Reads the toast switch from the plugin's options (default on).
export function toastEnabled(options: Readonly<Record<string, unknown>> | undefined): boolean {
  return options?.toast_on_first_error !== false
}
