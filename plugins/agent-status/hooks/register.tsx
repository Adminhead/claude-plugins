import type { Register } from 'claude-code'
import { applyTask, buildView, renderLine, track, type Seen, type Tasks, type View } from './line'

const POLL_MS = 5000

let seen: Seen = {}
let tasks: Tasks = {}
let view: View | null = null
let key = 'null'
let polling = false
let lastError: string | null = null

// Logs an error once until a refresh succeeds again.
function report($: any, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  if (message !== lastError) $.ui.log(`agent-status: ${message}`)
  lastError = message
}

// Re-reads the agent list and redraws only when the drawn content changed.
// Never throws: it also runs unawaited beside tool and spawn calls.
async function refresh($: any) {
  try {
    const now = await $.clock.now()
    const agents = await $.agent.list()
    seen = track(seen, agents, now)
    view = buildView(agents, seen, tasks, now)
    lastError = null
    const next = JSON.stringify(view)
    if (next === key) return
    key = next
    $.ui.invalidate('ui.render')
  } catch (err) {
    report($, err)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    if (!polling) {
      polling = true
      $.clock.every(POLL_MS, () => refresh($))
    }
    return next(e)
  })
  // Observes only: the tool's result passes through whatever happens here.
  on('tool.call', async ($, e: any, next) => {
    const out: any = await next(e)
    if (typeof e.tool === 'string' && e.tool.startsWith('Task')) {
      try {
        tasks = applyTask(tasks, e.tool, e, out?.result)
      } catch (err) {
        report($, err)
      }
      void refresh($)
    }
    return out
  })
  on('agent.spawn', async ($, e, next) => {
    const out = await next(e)
    void refresh($)
    return out
  })
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !view) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        {renderLine(Text, view)}
      </Box>
    )
  })
}
