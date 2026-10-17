// Pure logic and drawing for agent-status. No `$`: the element table comes in as an argument.

export type AgentLike = {
  id: string
  name?: string
  description: string
  type: string
  status: string
}

// Per live agent: its current status and when that began, and when the mod first saw it.
export type Seen = Record<string, { status: string; since: number; first: number }>

// Per spawned agent, cached from `agent.spawn` (AgentInfo has neither): its model and spawn time.
export type Spawned = Record<string, { model: string; at: number }>

export type TaskStatus = 'pending' | 'in_progress' | 'completed'
export type Tasks = Record<string, TaskStatus>

export type Row = {
  id: string
  label: string
  status: string
  // Time in the current status.
  idle: string
  // Short model name, '' when the spawn was not seen.
  model: string
  // Time since spawn; `~` when it counts from first sight instead.
  age: string
}
export type View = { rows: Row[]; counts: [string, number][]; tasks: { done: number; total: number } | null }

export const MAX_LABEL = 24
export const MAX_MODEL = 20
// Longest text cleaned; names, descriptions and the Agent tool's model are model-written.
export const MAX_INPUT = 1000
export const MAX_SPAWNED = 128
// How long a spawn the agent list does not show yet is kept.
export const SPAWN_GRACE_MS = 120_000
export const PANE_ID = 'agents'
export const PANE_COLUMNS = 48

const ORDER = ['running', 'waiting', 'idle', 'pending']

const LIVE = new Set(['pending', 'running', 'waiting', 'idle'])
const COLORS: Record<string, string> = { running: 'success', waiting: 'warning', idle: 'inactive', pending: 'inactive' }

// Drops escape sequences and control characters, collapses whitespace, and caps the length.
export function clean(text: string, max = MAX_LABEL): string {
  const flat = String(text)
    .slice(0, MAX_INPUT)
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const chars = [...flat]
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : flat
}

// `claude-opus-5-5-20261001` -> `opus-5-5`; an alias (`haiku`) stays as given.
export function shortModel(model: unknown): string {
  if (typeof model !== 'string') return ''
  const m = clean(model, MAX_INPUT)
    .replace(/^claude-/, '')
    .replace(/-\d{8}(?=$|\[)/, '')
  return clean(m, MAX_MODEL)
}

// Under a minute reads `<1m`, so a steady line does not change on every poll.
export function fmtIdle(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60_000)
  if (m < 1) return '<1m'
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60}m`
}

// First sight stands in for the spawn time: `~3m`, but `<1m` already says enough.
const approx = (t: string) => (t.startsWith('<') ? t : `~${t}`)

// Carries each live agent's status start and first sight forward; a changed status restarts the former.
export function track(prev: Seen, agents: AgentLike[], now: number): Seen {
  const next: Seen = {}
  for (const a of agents) {
    if (!LIVE.has(a.status)) continue
    const old = prev[a.id]
    next[a.id] = old && old.status === a.status ? old : { status: a.status, since: now, first: old?.first ?? now }
  }
  return next
}

// Records a spawn, dropping the oldest past MAX_SPAWNED.
export function noteSpawn(prev: Spawned, id: unknown, model: unknown, at: number): Spawned {
  if (typeof id !== 'string' || id === '' || id.length > 256) return prev
  const next: Spawned = { ...prev, [id]: { model: shortModel(model), at } }
  const ids = Object.keys(next)
  for (const old of ids.slice(0, Math.max(0, ids.length - MAX_SPAWNED))) delete next[old]
  return next
}

// Keeps spawns whose agent is live, or not listed yet and recent.
export function pruneSpawned(prev: Spawned, agents: AgentLike[], now: number): Spawned {
  const listed = new Map(agents.map(a => [a.id, a.status]))
  const next: Spawned = {}
  for (const [id, s] of Object.entries(prev)) {
    const status = listed.get(id)
    if (status === undefined ? now - s.at < SPAWN_GRACE_MS : LIVE.has(status)) next[id] = s
  }
  return next
}

export function countTasks(tasks: Tasks): { done: number; total: number } | null {
  const all = Object.values(tasks)
  if (all.length === 0) return null
  return { done: all.filter(s => s === 'completed').length, total: all.length }
}

// The content, or null while no agent is live.
export function buildView(agents: AgentLike[], seen: Seen, tasks: Tasks, now: number, spawned: Spawned = {}): View | null {
  const live = agents.filter(a => seen[a.id])
  if (live.length === 0) return null
  const rows = live.map(a => {
    const s = seen[a.id]!
    const sp = Object.hasOwn(spawned, a.id) ? spawned[a.id] : undefined
    return {
      id: a.id,
      label: clean(a.name || '') || clean(a.description || a.type) || clean(a.type),
      status: a.status,
      idle: fmtIdle(now - s.since),
      model: sp?.model ?? '',
      age: sp ? fmtIdle(now - sp.at) : approx(fmtIdle(now - s.first)),
    }
  })
  const counts = ORDER.map(s => [s, rows.filter(r => r.status === s).length] as [string, number]).filter(([, n]) => n > 0)
  return { rows, counts, tasks: countTasks(tasks) }
}

// Inline pane rows wanted: a line per agent, a tasks line, and the collapse button.
export const paneRows = (view: View | null) => Math.min((view?.rows.length ?? 1) + 2, 16)

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

const tasksParts = (view: View, Text: any, lead: string) =>
  view.tasks
    ? [<Text dimColor>{lead}</Text>, <Text color="success">{`${view.tasks.done}/${view.tasks.total}`}</Text>]
    : []

// Collapsed: a count by status and the done/total tasks, with the button that toggles the pane.
export function renderLine({ Box, Text, Button }: any, view: View, open: boolean, onToggle: () => void) {
  const parts: any[] = [<Text dimColor>{`agents ${view.rows.length} (`}</Text>]
  view.counts.forEach(([status, n], i) => {
    if (i) parts.push(<Text dimColor>{', '}</Text>)
    parts.push(<Text color={COLORS[status] ?? 'inactive'}>{`${n} ${status}`}</Text>)
  })
  parts.push(<Text dimColor>{')'}</Text>, ...tasksParts(view, Text, '  tasks '))
  return (
    <Box flexDirection="row" gap={1}>
      <Text wrap="truncate-end">{parts}</Text>
      <Button key="agents-toggle" plain dimColor label={open ? '▾' : '▸'} onPress={onToggle} />
    </Box>
  )
}

// Expanded: one line per agent (name, status and time in it, then model and time since spawn) and the tasks summary.
export function renderPane({ Box, Text, Button }: any, view: View | null, onCollapse: () => void) {
  return (
    <Box flexDirection="column">
      {view ? (
        view.rows.map(r => (
          <Text key={r.id} wrap="truncate-end">
            <Text>{r.label}</Text>
            <Text color={COLORS[r.status] ?? 'inactive'}>{` ${r.status}`}</Text>
            <Text dimColor>{` ${r.idle}${r.model ? ` · ${r.model}` : ''} · up ${r.age}`}</Text>
          </Text>
        ))
      ) : (
        <Text dimColor>no live agents</Text>
      )}
      {view?.tasks ? <Text>{tasksParts(view, Text, 'tasks ')}</Text> : null}
      <Button key="agents-collapse" plain dimColor hotkey="c" label="collapse" onPress={onCollapse} />
    </Box>
  )
}
