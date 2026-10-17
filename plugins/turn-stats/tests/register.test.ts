import { describe, expect, test } from 'claude-code/testing'
import { cacheHit, DEFAULTS, fmtDuration, fmtTokens, parseOptions, toastText } from '../hooks/stats'

const usage = { input_tokens: 500, output_tokens: 41_200, cache_read_input_tokens: 9_000, cache_creation_input_tokens: 500, model: 'claude-x' }
const turn = (over: Record<string, unknown> = {}) => ({
  answer: 'done',
  durationMs: 192_000,
  isAborted: false,
  turnId: 't1',
  reason: 'answer',
  usage,
  ...over,
})

describe('stats', () => {
  test('options', () => {
    expect(parseOptions(undefined)).toEqual(DEFAULTS)
    expect(parseOptions({ thresholdSeconds: 0, includeAborted: true })).toEqual({ thresholdMs: 0, includeAborted: true })
    expect(parseOptions({ thresholdSeconds: '90' }).thresholdMs).toBe(90_000)
    expect(parseOptions({ thresholdSeconds: -5 }).thresholdMs).toBe(0)
    expect(parseOptions({ thresholdSeconds: 'x' }).thresholdMs).toBe(60_000)
  })

  test('formatting', () => {
    expect(fmtDuration(45_900)).toBe('45s')
    expect(fmtDuration(192_000)).toBe('3m12s')
    expect(fmtDuration(3_900_000)).toBe('1h05m')
    expect(fmtTokens(812)).toBe('812')
    expect(fmtTokens(41_200)).toBe('41k')
    expect(fmtTokens(1_250_000)).toBe('1.3M')
  })

  test('cache hit rate over all input tokens', () => {
    expect(cacheHit(usage)).toBe(90)
    expect(cacheHit({ input_tokens: 0, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })).toBeNull()
    expect(cacheHit(undefined)).toBeNull()
  })

  test('toast text and when there is none', () => {
    expect(toastText(turn(), DEFAULTS)).toBe('turn 3m12s · 41k out · cache 90%')
    expect(toastText(turn({ durationMs: 30_000 }), DEFAULTS)).toBeNull()
    expect(toastText(turn({ agentId: 'a1' }), DEFAULTS)).toBeNull()
    expect(toastText(turn({ isAborted: true, reason: 'aborted' }), DEFAULTS)).toBeNull()
    expect(toastText(turn({ isAborted: true, reason: 'aborted', usage: undefined }), { ...DEFAULTS, includeAborted: true })).toBe('turn 3m12s · interrupted')
    expect(toastText(turn({ reason: 'error' }), DEFAULTS)).toBe('turn 3m12s · 41k out · cache 90% · ended on error')
  })
})

describe('register', () => {
  test('a long main-loop turn toasts once; short and subagent turns do not', async ($, on) => {
    const toasts: string[] = []
    on('turn.complete', async (_$: any, e: any) => ({ text: '', usage: e.usage }))
    on('ui.toast', async (_$: any, e: any) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    const out: any = await $.turn.complete(turn() as never)
    expect(out.text).toBe('')
    await $.turn.complete(turn({ durationMs: 5_000 }) as never)
    await $.turn.complete(turn({ agentId: 'a1' }) as never)
    expect(toasts).toEqual(['turn 3m12s · 41k out · cache 90%'])
  })
})
