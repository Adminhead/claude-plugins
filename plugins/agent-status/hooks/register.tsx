import type { Register } from 'claude-code'
import { applyTask, buildView, renderLine, track, type Seen, type Tasks, type View } from './line'

const POLL_MS = 5000

let seen: Seen = {}
let tasks: Tasks = {}
let view: View | null = null
let key = 'null'
let polling = false
let lastError: string | null = null

// Re-reads the agent list and redraws only when the drawn content changed.
async function refresh($: any) {
  try {
    const now = await $.clock.now()
    const agents = await $.agent.list()
    seen = track(seen, agents, now)
    view = buildView(agents, seen, tasks, now)
    lastError = null
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message !== lastError) $.ui.log(`agent-status: ${message}`)
    lastError = message
    return
  }
  const next = JSON.stringify(view)
  if (next === key) return
  key = next
  $.ui.invalidate('ui.render')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    if (!polling) {
      polling = true
      $.clock.every(POLL_MS, () => refresh($))
    }
    return next(e)
  })
  on('tool.call', async ($, e: any, next) => {
    const out: any = await next(e)
    if (typeof e.tool === 'string' && e.tool.startsWith('Task')) {
      tasks = applyTask(tasks, e.tool, e, out?.result)
      await refresh($)
    }
    return out
  })
  on('agent.spawn', async ($, e, next) => {
    const out = await next(e)
    await refresh($)
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
