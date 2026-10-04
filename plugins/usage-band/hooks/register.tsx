import type { Register, SessionUsage } from 'claude-code'
import { renderBand } from './band'

let usage: SessionUsage | null = null
let expanded = false
let lastError: string | null = null

async function refresh($: any) {
  try {
    usage = await $.session.usage({ breakdown: 'summary' })
    lastError = null
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message !== lastError) $.ui.log(`usage-band: ${message}`)
    lastError = message
    return
  }
  $.ui.invalidate('ui.render')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await refresh($)
    return next(e)
  })
  on('session.measure', async ($, e, next) => {
    await refresh($)
    return next(e)
  })
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !usage?.context.breakdown) return next(e)
    return renderBand({
      ui: $.ui.resolve(e),
      usage,
      breakdown: usage.context.breakdown,
      columns: e.props.bodyColumns,
      maxRows: e.props.maxRows,
      expanded: expanded && !e.props.isWorking,
      now: await $.clock.now(),
      onToggle: () => {
        expanded = !expanded
        $.ui.invalidate('ui.render')
      },
    })
  })
}
