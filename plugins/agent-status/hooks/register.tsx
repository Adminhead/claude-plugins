import type { Register } from 'claude-code'
import {
  applyTask,
  buildView,
  noteSpawn,
  PANE_COLUMNS,
  PANE_ID,
  paneRows,
  pruneSpawned,
  renderLine,
  renderPane,
  track,
  type Seen,
  type Spawned,
  type Tasks,
  type View,
} from './line'

// A live-agent count line above the prompt and an `agents` pane with each agent's model and age.
// Everything that touches `$` lives here; the logic and drawing are in ./line.

const POLL_MS = 5000

let seen: Seen = {}
let spawned: Spawned = {}
let tasks: Tasks = {}
let view: View | null = null
let key = 'null'
let polling = false
// Collapsed (a count line) until the person expands; then the `agents` pane is open, sized for `paneRowsOpen` rows.
let paneOpen = false
let paneRowsOpen = 0

// The last error logged, so a repeat stays quiet until a refresh succeeds again.
let lastError: string | null = null
function report($: any, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  if (message !== lastError) $.ui.log(`agent-status: ${message}`, { to: 'debug' })
  lastError = message
}

// Opening an open id retitles it and takes the new size, so this also resizes.
async function openPane($: any) {
  paneRowsOpen = paneRows(view)
  await $.ui.open({ id: PANE_ID, title: 'Agents', columns: PANE_COLUMNS, rows: paneRowsOpen, closeOnEscape: true })
  paneOpen = true
}

async function togglePane($: any) {
  try {
    if (paneOpen) {
      await $.ui.close({ id: PANE_ID })
      paneOpen = false
    } else await openPane($)
  } catch (err) {
    report($, err)
  }
  $.ui.invalidate('ui.render')
}

// Re-reads the agent list and redraws only when the drawn content changed.
// Never throws: it also runs unawaited beside tool and spawn calls.
async function refreshAgents($: any) {
  try {
    const now = await $.clock.now()
    const agents = await $.agent.list()
    seen = track(seen, agents, now)
    spawned = pruneSpawned(spawned, agents, now)
    view = buildView(agents, seen, tasks, now, spawned)
    lastError = null
    // A close made while the mod was not looking (the person's Esc) is caught here if the ui.close hook missed it.
    if (paneOpen && !(await $.ui.panes()).some((p: any) => p.id === PANE_ID)) {
      paneOpen = false
      $.ui.invalidate('ui.render')
    }
    if (paneOpen && paneRows(view) !== paneRowsOpen) await openPane($)
    const next = JSON.stringify(view)
    if (next === key) return
    key = next
    $.ui.invalidate('ui.render')
  } catch (err) {
    report($, err)
  }
}

// A reload drops the timer and session.start does not fire again, so a spawn or Task call starts it too.
function startPolling($: any) {
  if (polling) return
  polling = true
  $.clock.every(POLL_MS, () => void refreshAgents($))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    startPolling($)
    return next(e)
  })

  // /clear ends the session and no session.start follows, so the agent state and task counts start over here.
  on('session.end', async ($, e, next) => {
    seen = {}
    spawned = {}
    tasks = {}
    view = null
    key = 'null'
    if (paneOpen) {
      paneOpen = false
      try {
        await $.ui.close({ id: PANE_ID })
      } catch (err) {
        report($, err)
      }
    }
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // Observes Task* calls for the done/total count; every call goes through untouched.
  on('tool.call', async ($, e: any, next) => {
    if (typeof e.tool !== 'string' || !e.tool.startsWith('Task')) return next(e)
    const out: any = await next(e)
    try {
      tasks = applyTask(tasks, e.tool, e, out?.result)
    } catch (err) {
      report($, err)
    }
    startPolling($)
    void refreshAgents($)
    return out
  })

  // AgentInfo has no model or start time, so both are cached from the spawn's result.
  on('agent.spawn', async ($, e, next) => {
    const out = await next(e)
    try {
      if (out.agentId) spawned = noteSpawn(spawned, out.agentId, out.model || e.model || e.parentModel, await $.clock.now())
    } catch (err) {
      report($, err)
    }
    startPolling($)
    void refreshAgents($)
    return out
  })

  // Shares the band with other mods (usage-band): whatever they draw stays on top, the count line beneath.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !view) return next(e)
    const ui = $.ui.resolve(e)
    const line = renderLine(ui, view, paneOpen, () => void togglePane($))
    // next(e) rejects when nothing beneath draws the band.
    const below = await next(e).catch(() => undefined)
    if (below === undefined || below === null) return line
    const { Box } = ui
    return (
      <Box flexDirection="column">
        {below}
        {line}
      </Box>
    )
  })

  // The literal is PANE_ID, spelled out so `claude plugin validate` can read the matcher.
  on('ui.render', { component: 'Pane', requestId: 'agents' }, async ($, e) => renderPane($.ui.resolve(e), view, () => void togglePane($)))

  // The person's close of the pane (Esc or ctrl+x x) keeps the count line's arrow in step.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE_ID) {
      paneOpen = false
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })
}
