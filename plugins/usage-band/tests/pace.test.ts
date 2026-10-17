import { describe, expect, test } from 'claude-code/testing'
import { cacheHit, effortBadge, fmtClock, fmtReset, fmtUsd, labelOf } from '../hooks/format'
import { parseOptions } from '../hooks/options'
import { checkAlerts, grade, levelColor, readMemo, WINDOW_MS } from '../hooks/pace'

const NOW = Date.UTC(2026, 9, 4, 12, 0)
const H = 3_600_000
const FIVE = WINDOW_MS.five_hour!
const WEEK = WINDOW_MS.seven_day!

// A five-hour window `elapsedH` hours in, at `pct`.
const five = (pct: number, elapsedH: number) => ({
  kind: 'five_hour',
  percentUsed: pct,
  resetsAt: new Date(NOW + FIVE - elapsedH * H).toISOString(),
})

describe('grade', () => {
  test('on pace for under 90% is fine', () => {
    // 40% two and a half hours into five projects 80%.
    const g = grade(five(40, 2.5), NOW)
    expect(g.level).toBe('ok')
    expect(g.ahead).toBe(false)
    expect(Math.round(g.projected!)).toBe(80)
  })

  test('a projection of 90% to 100% is amber, with no ▲', () => {
    const g = grade(five(47, 2.5), NOW)
    expect(g.level).toBe('warn')
    expect(g.ahead).toBe(false)
  })

  test('a projection past 100% is red with ▲ and a run-out time before the reset', () => {
    // 60% after 2.5 h: the remaining 40% takes 1 h 40 m at that rate.
    const g = grade(five(60, 2.5), NOW)
    expect(g.level).toBe('crit')
    expect(g.ahead).toBe(true)
    expect(g.runsOutAt).toBe(NOW + (100 / 60) * H)
  })

  test('under 10% used stays fine however early', () => {
    expect(grade(five(9, 0.1), NOW).level).toBe('ok')
  })

  test('a high reading late in the window is graded by pace, not by the old fixed 85%', () => {
    // 88% with 15 minutes left projects 92.6%: amber, not red.
    expect(grade(five(88, 4.75), NOW).level).toBe('warn')
  })

  test('the weekly window uses its own length', () => {
    const r = { kind: 'seven_day', percentUsed: 50, resetsAt: new Date(NOW + WEEK / 2).toISOString() }
    expect(Math.round(grade(r, NOW).projected!)).toBe(100)
    expect(grade(r, NOW).level).toBe('warn')
  })

  test('100% or more is red', () => {
    expect(grade(five(100, 4), NOW)).toEqual({ level: 'crit', ahead: false })
    expect(grade({ kind: 'spend_limit', percentUsed: 104 }, NOW).level).toBe('crit')
  })

  test('without a readable pace it falls back to 60/85', () => {
    const levels = [59, 60, 84, 85].map(p => grade({ kind: 'spend_limit', percentUsed: p }, NOW).level)
    expect(levels).toEqual(['ok', 'warn', 'warn', 'crit'])
    // A reset already past, or a full window away, has no elapsed share to project from.
    expect(grade({ kind: 'five_hour', percentUsed: 70, resetsAt: new Date(NOW - 1000).toISOString() }, NOW).level).toBe('warn')
    expect(grade({ kind: 'five_hour', percentUsed: 30, resetsAt: new Date(NOW + FIVE).toISOString() }, NOW).level).toBe('ok')
    expect(grade({ kind: 'five_hour', percentUsed: 30 }, NOW).level).toBe('ok')
  })

  test('levels map to theme colours', () => {
    expect(['ok', 'warn', 'crit'].map(l => levelColor(l as any))).toEqual(['success', 'warning', 'error'])
  })
})

describe('checkAlerts', () => {
  test('a fine window raises nothing but is remembered', () => {
    const out = checkAlerts({}, [five(20, 2.5)], NOW)
    expect(out.toasts).toEqual([])
    expect(out.memo.five_hour).toMatchObject({ pct: 20, peak: 'ok', top: 20 })
  })

  test('turning amber toasts once, red toasts again, and a dip and climb stays quiet', () => {
    let memo = checkAlerts({}, [five(20, 2.5)], NOW).memo
    const amber = checkAlerts(memo, [five(47, 2.5)], NOW)
    expect(amber.toasts.length).toBe(1)
    expect(amber.toasts[0]).toMatch(/^5h limit at 47%: on pace for ~94% by its reset at /)
    expect(checkAlerts(amber.memo, [five(48, 2.5)], NOW).toasts).toEqual([])
    const red = checkAlerts(amber.memo, [five(60, 2.5)], NOW)
    expect(red.toasts.length).toBe(1)
    expect(red.toasts[0]).toContain(`on pace to run out ~${fmtClock(NOW + (100 / 60) * H, NOW)}, before its reset at`)
    memo = checkAlerts(red.memo, [five(40, 2.5)], NOW).memo
    expect(checkAlerts(memo, [five(60, 2.5)], NOW).toasts).toEqual([])
  })

  test('a reset of a window that alerted toasts once; a quiet window resets silently', () => {
    const red = checkAlerts({}, [five(60, 2.5)], NOW)
    expect(red.toasts.length).toBe(1)
    const later = NOW + 3 * H
    const fresh = { kind: 'five_hour', percentUsed: 2, resetsAt: new Date(later + FIVE - 0.2 * H).toISOString() }
    const reset = checkAlerts(red.memo, [fresh], later)
    expect(reset.toasts).toEqual(['5h limit reset (it reached 60%)'])
    expect(reset.memo.five_hour).toMatchObject({ peak: 'ok', top: 2 })
    expect(checkAlerts(reset.memo, [fresh], later).toasts).toEqual([])
    const quiet = checkAlerts({}, [five(20, 2.5)], NOW).memo
    expect(checkAlerts(quiet, [fresh], later).toasts).toEqual([])
  })

  test('a small resetsAt jitter is not a reset', () => {
    const red = checkAlerts({}, [five(60, 2.5)], NOW)
    const jitter = { ...five(61, 2.5), resetsAt: new Date(Date.parse(five(60, 2.5).resetsAt) + 60_000).toISOString() }
    expect(checkAlerts(red.memo, [jitter], NOW).toasts).toEqual([])
  })

  test('windows are tracked apart, and a spend limit without a reset time alerts by percentage', () => {
    const out = checkAlerts({}, [five(20, 2.5), { kind: 'spend_limit', percentUsed: 90 }], NOW)
    expect(out.toasts).toEqual(['spend limit at 90%'])
    const dropped = checkAlerts(out.memo, [{ kind: 'spend_limit', percentUsed: 5 }], NOW)
    expect(dropped.toasts).toEqual(['spend limit reset (it reached 90%)'])
  })

  test('readMemo drops malformed entries', () => {
    expect(readMemo(null)).toEqual({})
    expect(readMemo([1])).toEqual({})
    expect(readMemo({ a: { pct: 1, peak: 'bad' }, b: 'x', c: { pct: 5, peak: 'warn' } })).toEqual({ c: { pct: 5, peak: 'warn', top: 5 } })
  })
})

describe('format', () => {
  test('a past reset shows 0m', () => {
    expect(fmtReset(new Date(NOW - 5 * 60_000).toISOString(), NOW, false)).toBe('0m')
  })

  test('clock times: today as HH:MM, this week with a weekday, later as a date', () => {
    const d = new Date(NOW)
    const today = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 14, 30).getTime()
    const base = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0).getTime()
    expect(fmtClock(today, base)).toBe('14:30')
    expect(fmtClock(base + 2 * 86_400_000, base)).toMatch(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) 09:00$/)
    expect(fmtClock(base + 20 * 86_400_000, base)).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/)
  })

  test('cost, cache hit rate, effort and labels', () => {
    expect([0.004, 1.234, 12.34, 123.4].map(fmtUsd)).toEqual(['$0.00', '$1.23', '$12.3', '$123'])
    expect(cacheHit({ input_tokens: 10, cache_creation_input_tokens: 50, cache_read_input_tokens: 940 })).toBe(94)
    expect(cacheHit({ input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 })).toBeNull()
    expect(cacheHit(null)).toBeNull()
    expect(effortBadge('high')).toBe('◑ high')
    expect(effortBadge(32000)).toBe('effort 32k')
    expect(effortBadge(undefined)).toBeUndefined()
    expect([labelOf('seven_day'), labelOf('seven_day', true), labelOf('spend_limit'), labelOf('model_scoped_x')]).toEqual(['weekly', 'wk', 'spend', 'model sc'])
  })

  test('options fall back to defaults and clamp percentages', () => {
    expect(parseOptions(undefined)).toEqual({ limitsThreshold: 0, weeklyThreshold: 80, resetStyle: 'countdown', alerts: true, sessionStats: true })
    expect(parseOptions({ limitsThreshold: 150, weeklyThreshold: 'x', resetStyle: 'clock', alerts: false })).toMatchObject({ limitsThreshold: 100, weeklyThreshold: 80, resetStyle: 'clock', alerts: false })
  })
})
