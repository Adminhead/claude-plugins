// Which agent types the read-only gate checks. Pure: readonly-gate.ts passes it the hook's
// agent_type and the plugin option's raw value.

// The general read-only agents, as hooks see them: plugin-scoped when installed from the
// marketplace (`architect:architect`), bare when defined as user or project agents.
export const DEFAULT_AGENTS: readonly string[] = [
  'architect',
  'architect:architect',
  'reviewer',
  'reviewer:reviewer',
  'debugger',
  'debugger:debugger',
]
// devops is not listed: its change mode runs writing validators such as `tofu init`
// and `tofu fmt`. cloud-ops-guard blocks its live verbs instead.

const NAME = /^[A-Za-z0-9_.@-]+(:[A-Za-z0-9_.@-]+)*$/
const MAX_OPTION = 4096
const MAX_NAME = 128

// The `extra_agents` option: names separated by commas or whitespace. A JSON array of strings
// is accepted too, in case the value arrives as a list. Invalid names are ignored.
export function parseExtra(raw: string | undefined): string[] {
  if (!raw) return []
  const text = raw.slice(0, MAX_OPTION).trim()
  let parts: unknown[] = text.split(/[\s,]+/)
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) parts = parsed
    } catch {}
  }
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0 && p.length <= MAX_NAME && NAME.test(p))
}

// A listed name matches the agent type exactly. A listed bare name also matches any plugin's
// agent of that name (`reviewer` matches `security:reviewer`), so a user-listed agent is gated
// however it is installed; the defaults are listed exactly and match only themselves.
export function isReadOnly(type: string, extra: readonly string[] = []): boolean {
  if (DEFAULT_AGENTS.includes(type)) return true
  return extra.some((name) => type === name || (!name.includes(':') && type.endsWith(`:${name}`)))
}
