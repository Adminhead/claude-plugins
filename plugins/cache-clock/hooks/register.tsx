import type { Register } from 'claude-code'
import { DEFAULTS, label, parseOptions, refreshesCache, type ClockOptions } from './clock'

// Shows when the prompt cache likely expires: the last main-loop turn's end plus the TTL.
// Everything that touches `$` lives here; the logic is in ./clock.

// How often the warm/cold state is re-checked between turns.
const TICK_MS = 15_000

let options: ClockOptions = DEFAULTS
let lastAt: number | null = null
// The last state drawn, so a tick redraws only when warm turns cold.
let drawn = ''
let ticking = false

// Redraws (hint) or re-pins (status) when the label changed. Never throws.
async function repaint($: any) {
  try {
    const l = label(lastAt, options.ttlMs, await $.clock.now())
    const key = l ? `${l.cold}|${l.text}` : ''
    if (key === drawn) return
    drawn = key
    if (options.display === 'status') $.ui.status(l ? l.text : undefined)
    else $.ui.invalidate('ui.render')
  } catch (err) {
    $.ui.log(`cache-clock: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
  }
}

// A reload drops timers and session.start does not fire again, so the first turn after one starts it too.
function startTicking($: any) {
  if (ticking) return
  ticking = true
  $.clock.every(TICK_MS, () => void repaint($))
}

export const register: Register = (on, rawOptions) => {
  options = parseOptions(rawOptions)

  on('session.start', async ($, e, next) => {
    startTicking($)
    return next(e)
  })

  // The main loop's turns refresh its cache; a subagent's run has its own prefix.
  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    if (refreshesCache(e)) {
      try {
        lastAt = await $.clock.now()
        startTicking($)
      } catch (err) {
        $.ui.log(`cache-clock: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
      }
      await repaint($)
    }
    return out
  })

  // /clear starts a new conversation with no session.start: nothing is cached for it yet.
  on('session.end', async ($, e, next) => {
    lastAt = null
    await repaint($)
    return next(e)
  })

  // Stacks the segment under whatever the engine and other plugins draw at the hint.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (options.display !== 'hint') return next(e)
    const l = label(lastAt, options.ttlMs, await $.clock.now())
    if (!l) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        {l.cold ? (
          <Text color="warning" wrap="truncate-end">
            {l.text}
          </Text>
        ) : (
          <Text dimColor wrap="truncate-end">
            {l.text}
          </Text>
        )}
      </Box>
    )
  })
}
