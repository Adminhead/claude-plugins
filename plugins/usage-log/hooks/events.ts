// The pure pieces of usage-log: options, the skill listing as logged, and the slash command a prompt starts with.
// Nothing here touches `$`.

export type UsageOptions = {
  // Log files older than this many days are deleted at session start.
  retentionDays: number
  // false: a prompt line records its length and slash command, not its text.
  promptText: boolean
}

export const DEFAULTS: UsageOptions = { retentionDays: 30, promptText: true }

export function parseOptions(raw: Readonly<Record<string, unknown>> | undefined): UsageOptions {
  const o = raw ?? {}
  const days = typeof o.retentionDays === 'number' && Number.isFinite(o.retentionDays) ? Math.min(3650, Math.max(1, Math.floor(o.retentionDays))) : DEFAULTS.retentionDays
  return { retentionDays: days, promptText: typeof o.promptText === 'boolean' ? o.promptText : DEFAULTS.promptText }
}

export type ListedSkill = { name: string; source: string; plugin?: string; tokens: number }
export type Listing = { total: number; included: number; tokens: number; skills: ListedSkill[] }

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

// The skill listing from `$.session.usage({ breakdown })`'s `context.breakdown.skills`, or null when it is absent or
// not that shape.
export function listingOf(raw: unknown): Listing | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.skillFrontmatter)) return null
  const skills: ListedSkill[] = []
  for (const s of r.skillFrontmatter as unknown[]) {
    if (typeof s !== 'object' || s === null || typeof (s as any).name !== 'string') continue
    const x = s as Record<string, unknown>
    skills.push({ name: x.name as string, source: typeof x.source === 'string' ? x.source : '', ...(typeof x.pluginName === 'string' ? { plugin: x.pluginName } : {}), tokens: num(x.tokens) })
  }
  return { total: num(r.totalSkills), included: num(r.includedSkills), tokens: num(r.tokens), skills }
}

// Plugin and user commands from `$.command.list()`, plugin skills among them: the context breakdown counts those as
// slash commands without naming them. Built-in and MCP commands are left out. Descriptions are cut to 300 characters.
export type ListedCommand = { name: string; source: string; plugin?: string; description: string }

export function commandsOf(raw: unknown): ListedCommand[] {
  if (!Array.isArray(raw)) return []
  const out: ListedCommand[] = []
  for (const c of raw) {
    if (typeof c !== 'object' || c === null || typeof c.name !== 'string') continue
    if (c.source !== 'plugin' && c.source !== 'user') continue
    out.push({ name: c.name, source: c.source, ...(typeof c.plugin === 'string' ? { plugin: c.plugin } : {}), description: typeof c.description === 'string' ? c.description.slice(0, 300) : '' })
  }
  return out
}

// Changes when the listed skills, the budget cut or the commands change; a listing is logged again only then.
export const listingKey = (l: Listing, commands: readonly ListedCommand[] = []) =>
  `${l.included}/${l.total}:${l.skills.map(s => s.name).sort().join(',')}|${commands.map(c => c.name).sort().join(',')}`

// `/name` or `/plugin:name` at the start of a prompt: a skill or command the user typed.
export function slashCommand(text: string): string | undefined {
  return /^\/([A-Za-z0-9][\w:.-]{0,80})(?:\s|$)/.exec(text.trimStart())?.[1]
}
