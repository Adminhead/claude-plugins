// Which agent types the read-only gate checks. Pure: readonly-gate.ts passes it the hook's
// agent_type and the plugin option's raw value.

// The read-only agents (general ones plus the security-auditor and open-source-release-audit
// specialists), as hooks see them: plugin-scoped when installed from the
// marketplace (`architect:architect`), bare when defined as user or project agents.
export const DEFAULT_AGENTS: readonly string[] = [
  'architect',
  'architect:architect',
  'reviewer',
  'reviewer:reviewer',
  'debugger',
  'debugger:debugger',
  'security-auditor',
  'security-auditor:security-auditor',
  'open-source-release-audit',
  'open-source-release-audit:open-source-release-audit',
]
// devops is not listed: its change mode runs writing validators such as `tofu init`
// and `tofu fmt`. cloud-ops-guard blocks its live verbs instead. web-perf-auditor and
// browser-tester are not listed either; add them through `extra_agents` if wanted.

// The read-only agents that may also save Markdown plans in the plan directories (plans.ts),
// plus the plugin's `plan_writers` option. Listed exactly, like DEFAULT_AGENTS.
export const DEFAULT_PLAN_WRITERS: readonly string[] = ['architect', 'architect:architect']

const NAME = /^[A-Za-z0-9_.@-]+(:[A-Za-z0-9_.@-]+)*$/
const MAX_OPTION = 4096
const MAX_NAME = 128

// The `extra_agents` and `plan_writers` options: names separated by commas or whitespace. A JSON array of strings
// is accepted too, in case the value arrives as a list. Invalid names are ignored. A value longer
// than MAX_OPTION gives null rather than a cut list, which could drop or change names: the gate
// then blocks every subagent for extra_agents and lists no extra plan writers for plan_writers.
export function parseExtra(raw: string | undefined): string[] | null {
  if (!raw) return []
  if (raw.length > MAX_OPTION) return null
  const text = raw.trim()
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
  return listed(type, DEFAULT_AGENTS, extra)
}

// Whether a read-only agent may also write plans. The `plan_writers` names match like `extra_agents`.
export function isPlanWriter(type: string, extra: readonly string[] = []): boolean {
  return listed(type, DEFAULT_PLAN_WRITERS, extra)
}

function listed(type: string, defaults: readonly string[], extra: readonly string[]): boolean {
  if (defaults.includes(type)) return true
  return extra.some((name) => type === name || (!name.includes(':') && type.endsWith(`:${name}`)))
}
