import type { Register } from 'claude-code'
import { DEFAULTS, parseOptions, toastText, type StatsOptions } from './stats'

// A toast after long main-loop turns. It only observes `turn.complete`; the logic is in ./stats.

const TOAST_MS = 8000

let options: StatsOptions = DEFAULTS

export const register: Register = (on, rawOptions) => {
  options = parseOptions(rawOptions)

  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    try {
      // Core fills the result's usage from the turn; a hook above may have answered without it.
      const text = toastText({ ...e, usage: e.usage ?? out?.usage }, options)
      if (text) $.ui.toast(text, { timeoutMs: TOAST_MS })
    } catch (err) {
      $.ui.log(`turn-stats: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
    }
    return out
  })
}
