import type { Register, SessionUsage } from 'claude-code'
import { renderBand } from './band'
import { cacheHit, effortBadge } from './format'
import { DEFAULTS, parseOptions, type BandOptions } from './options'
import { checkAlerts, readMemo } from './pace'

// Everything that touches `$` lives here; band.tsx, pace.ts, format.ts and options.ts are pure.

// A slow repaint, so an idle countdown and the pace colours don't go stale between measurements.
const REPAINT_MS = 60_000
// The `$.store` key for the alert de-dup, shared by every session so a window alerts once.
const MEMO_KEY = 'alerts'
const TOAST_MS = 8000

let usage: SessionUsage | null = null
let expanded = false
let compactions = 0
let effort: string | undefined
let ticking = false
let options: BandOptions = DEFAULTS

// The last error per source, so a repeat stays quiet until that source succeeds again.
const lastError: Record<string, string | null> = {}
function report($: any, err: unknown, key: string) {
  const message = err instanceof Error ? err.message : String(err)
  if (message !== lastError[key]) $.ui.log(`usage-band: ${message}`)
  lastError[key] = message
}

// Toasts once when a window first turns amber or red, and when one that alerted resets. Never throws.
async function alert($: any, now: number) {
  if (!options.alerts || !usage?.rateLimits.length) return
  try {
    const memo = readMemo(await $.store.get(MEMO_KEY))
    const out = checkAlerts(memo, usage.rateLimits, now)
    if (JSON.stringify(out.memo) !== JSON.stringify(memo)) await $.store.set(MEMO_KEY, out.memo)
    for (const text of out.toasts) $.ui.toast(text, { timeoutMs: TOAST_MS })
    lastError.alerts = null
  } catch (err) {
    report($, err, 'alerts')
  }
}

async function refresh($: any) {
  try {
    usage = await $.session.usage({ breakdown: 'summary' })
    lastError.usage = null
  } catch (err) {
    report($, err, 'usage')
    return
  }
  await alert($, await $.clock.now())
  $.ui.invalidate('ui.render')
}

export const register: Register = (on, rawOptions) => {
  options = parseOptions(rawOptions)

  on('session.start', async ($, e, next) => {
    await refresh($)
    if (!ticking) {
      ticking = true
      $.clock.every(REPAINT_MS, () => $.ui.invalidate('ui.render'))
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  // /clear ends the session with no session.start after it: the per-session counts start over.
  on('session.end', async ($, e, next) => {
    compactions = 0
    effort = undefined
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // Counts the main conversation's compactions that went through.
  on('session.compact', async ($, e, next) => {
    const out: any = await next(e)
    if (!e.agentId && (e.trigger === 'manual' || e.trigger === 'auto') && !out?.skip) {
      compactions++
      $.ui.invalidate('ui.render')
    }
    return out
  })

  // The main loop's effort level, read off each model request.
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      const badge = effortBadge(e.effort)
      if (badge !== effort) {
        effort = badge
        $.ui.invalidate('ui.render')
      }
    }
    return yield* next(e)
  })

  // The band draws first; whatever other mods (or a stub) draw beneath stays below it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const breakdown = usage?.context.breakdown
    if (e.props.hasSurvey || !usage || !breakdown) return next(e)
    const ui = $.ui.resolve(e)
    const band = renderBand({
      ui,
      usage,
      breakdown,
      columns: e.props.bodyColumns,
      maxRows: e.props.maxRows,
      expanded: expanded && !e.props.isWorking,
      now: await $.clock.now(),
      options,
      extras: { costUsd: usage.cost?.usd, cacheHit: cacheHit(breakdown.apiUsage), compactions, effort },
      onToggle: () => {
        expanded = !expanded
        $.ui.invalidate('ui.render')
      },
    })
    // next(e) rejects when nothing beneath draws the band.
    const below = await next(e).catch(() => undefined)
    if (below === undefined || below === null) return band
    const { Box } = ui
    return (
      <Box flexDirection="column">
        {band}
        {below}
      </Box>
    )
  })
}
