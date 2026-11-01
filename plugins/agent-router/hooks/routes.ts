// Pure logic for agent-router: which agent types to list and how to render the routing table.
// No `$` here; register.tsx feeds it what agent.offer saw.

export type Offer = {
  agent: string
  description: string
  source: string
  provider: string
}

// Bounds: the table rides the Agent tool's description, which every request carries.
export const MAX_AGENTS = 30
export const MAX_DESCRIPTION = 320
export const MAX_NAME = 80
// Guard on what is ever stored, so a hostile or broken offer can't grow module memory.
export const MAX_TRACKED = 200

// Types that never belong in the table: helpers, and agents whose work goes straight to tools
// (the codebase-memory tiers: the orchestrator calls the graph tools itself).
const NEVER_LIST = new Set(['statusline-setup', 'codebase-memory', 'codebase-memory-scout', 'codebase-memory-auditor'])

// The main-thread agent this mod serves: `orchestration` itself or any plugin's `<plugin>:orchestration`.
export function isOrchestrator(type: unknown): boolean {
  if (typeof type !== 'string' || type.length === 0 || type.length > MAX_NAME) return false
  return type === 'orchestration' || type.endsWith(':orchestration')
}

// One line of plain text: control characters and runs of whitespace collapse to one space.
function flatten(text: string): string {
  let out = ''
  for (const ch of text.slice(0, MAX_DESCRIPTION * 8)) {
    const c = ch.charCodeAt(0)
    out += c < 0x20 || c === 0x7f || c === 0x2028 || c === 0x2029 ? ' ' : ch
  }
  return out.replace(/\s+/g, ' ').trim()
}

// A when-to-use line, truncated at a word boundary with an ellipsis.
export function summarize(description: string, max = MAX_DESCRIPTION): string {
  const flat = flatten(description)
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '')}…`
}

// A name safe to print inside backticks.
function cleanName(name: string): string | null {
  if (name.length === 0 || name.length > MAX_NAME) return null
  return /^[A-Za-z0-9_.:@-]+$/.test(name) ? name : null
}

// The rows to list: offered, not the orchestrator, not a helper, sorted by name for a stable
// prompt cache, bounded in count. `omitted` counts what the bound dropped.
export function selectRows(offers: Iterable<Offer>): { rows: { agent: string; when: string }[]; omitted: number } {
  const seen = new Map<string, { agent: string; when: string }>()
  for (const o of offers) {
    const agent = cleanName(o.agent)
    if (agent === null || isOrchestrator(agent) || NEVER_LIST.has(agent)) continue
    seen.set(agent, { agent, when: summarize(o.description) || '(no description)' })
  }
  const all = [...seen.values()].sort((a, b) => (a.agent < b.agent ? -1 : a.agent > b.agent ? 1 : 0))
  return { rows: all.slice(0, MAX_AGENTS), omitted: Math.max(0, all.length - MAX_AGENTS) }
}

export const HEADING = '## Installed agent routes (agent-router)'

// The section appended to the Agent tool's description, or null when there is nothing to list.
export function renderTable(offers: Iterable<Offer>): string | null {
  const { rows, omitted } = selectRows(offers)
  if (rows.length === 0) return null
  const lines = [
    HEADING,
    '',
    'For the orchestrating main thread: the agent types installed in this session, each with when to use it. Pass the name exactly as `subagent_type`. Prefer a specialized type over general-purpose when its line fits the task.',
    '',
    ...rows.map((r) => `- \`${r.agent}\`: ${r.when}`),
  ]
  if (omitted > 0) lines.push(`- (${omitted} more installed types not listed)`)
  return lines.join('\n')
}

// The description with the table appended once (a re-render replaces an earlier copy).
export function withTable(description: string, table: string | null): string {
  const at = description.indexOf(`\n\n${HEADING}`)
  const base = at >= 0 ? description.slice(0, at) : description
  return table === null ? base : `${base}\n\n${table}`
}
