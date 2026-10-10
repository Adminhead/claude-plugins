export type AgentLike = {
  id: string
  name?: string
  description: string
  type: string
  status: string
}

export type Seen = Record<string, { status: string; since: number }>

export type TaskStatus = 'pending' | 'in_progress' | 'completed'
export type Tasks = Record<string, TaskStatus>

export type Row = { label: string; status: string; idle: string }
export type View = { rows: Row[]; more: number; tasks: { done: number; total: number } | null }

export const MAX_AGENTS = 4
export const MAX_LABEL = 24

const LIVE = new Set(['pending', 'running', 'waiting', 'idle'])
const COLORS: Record<string, string> = { running: 'success', waiting: 'warning', idle: 'inactive', pending: 'inactive' }

// Agent names and descriptions are model-written. Drop escape sequences and
// control characters, collapse whitespace, and cap the length.
export function clean(text: string, max = MAX_LABEL): string {
  const flat = text
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const chars = [...flat]
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : flat
}

// Time in the current status. Under a minute reads `<1m`, so a steady line
// does not change on every poll.
export function fmtIdle(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60_000)
  if (m < 1) return '<1m'
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60}m`
}

// Carries each live agent's status start forward; a changed status restarts it.
export function track(prev: Seen, agents: AgentLike[], now: number): Seen {
  const next: Seen = {}
  for (const a of agents) {
    if (!LIVE.has(a.status)) continue
    const old = prev[a.id]
    next[a.id] = old && old.status === a.status ? old : { status: a.status, since: now }
  }
  return next
}

export function countTasks(tasks: Tasks): { done: number; total: number } | null {
  const all = Object.values(tasks)
  if (all.length === 0) return null
  return { done: all.filter(s => s === 'completed').length, total: all.length }
}

// The line's content, or null while no agent is live.
export function buildView(agents: AgentLike[], seen: Seen, tasks: Tasks, now: number): View | null {
  const live = agents.filter(a => seen[a.id])
  if (live.length === 0) return null
  const rows = live.slice(0, MAX_AGENTS).map(a => ({
    label: clean(a.name || a.description || a.type) || a.type,
    status: a.status,
    idle: fmtIdle(now - seen[a.id]!.since),
  }))
  return { rows, more: live.length - rows.length, tasks: countTasks(tasks) }
}

// Applies one finished Task* tool call to the id -> status map. A failed or
// malformed call changes nothing, an update for an id not yet seen is
// ignored, and TaskList is the full truth, so it replaces the map.
export function applyTask(tasks: Tasks, tool: string, input: any, result: any): Tasks {
  if (tool === 'TaskCreate' && typeof result?.task?.id === 'string') return { ...tasks, [result.task.id]: 'pending' }
  if (tool === 'TaskList' && Array.isArray(result?.tasks)) {
    const ok = result.tasks.filter((t: any) => typeof t?.id === 'string' && typeof t.status === 'string')
    return Object.fromEntries(ok.map((t: any) => [t.id, t.status]))
  }
  const id = input?.taskId
  if (tool === 'TaskUpdate' && result?.success && typeof id === 'string' && Object.hasOwn(tasks, id) && input.status) {
    const { [id]: _drop, ...rest } = tasks
    return input.status === 'deleted' ? rest : { ...tasks, [id]: input.status }
  }
  return tasks
}

export function renderLine(Text: any, view: View) {
  const parts: any[] = [<Text dimColor>{'agents '}</Text>]
  view.rows.forEach((r, i) => {
    if (i) parts.push(<Text dimColor>{' · '}</Text>)
    parts.push(
      <Text>{r.label}</Text>,
      <Text color={COLORS[r.status] ?? 'inactive'}>{` ${r.status}`}</Text>,
      <Text dimColor>{` ${r.idle}`}</Text>,
    )
  })
  if (view.more) parts.push(<Text dimColor>{` · +${view.more} more`}</Text>)
  if (view.tasks) {
    parts.push(<Text dimColor>{'  tasks '}</Text>, <Text color="success">{`${view.tasks.done}/${view.tasks.total}`}</Text>)
  }
  return <Text wrap="truncate-end">{parts}</Text>
}
