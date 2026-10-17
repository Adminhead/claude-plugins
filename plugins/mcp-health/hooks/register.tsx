import type { Register } from 'claude-code'
import { EMPTY, outcomeOf, record, segment, serverOf, toastEnabled, toastText, type Health } from './health'

// Shows `mcp: <server> ✗` under the prompt hint while an MCP server's latest call errored.
// It only observes: every call goes through untouched. Logic lives in ./health.

let health: Health = EMPTY

export const register: Register = (on, options) => {
  const toast = toastEnabled(options)

  on('tool.call', async ($, e, next) => {
    const server = serverOf(e.tool)
    if (server === null) return next(e)
    const out = await next(e)
    try {
      const r = record(health, server, outcomeOf(out))
      if (r.changed) {
        health = r.health
        $.ui.invalidate('ui.render')
      }
      if (r.firstError && toast) $.ui.toast(toastText(server), { timeoutMs: 6000 })
    } catch (err) {
      $.ui.log(`mcp-health: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
    }
    return out
  })
  // /clear starts a new session with no session.start, so the record starts over here.
  on('session.end', async ($, e, next) => {
    if (health.failing.length || health.seen.length) {
      health = EMPTY
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })
  // Stacks the segment under whatever the engine and other plugins draw at the hint.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const text = segment(health)
    if (text === null) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Text color="error" wrap="truncate-end">
          {text}
        </Text>
      </Box>
    )
  })
}
