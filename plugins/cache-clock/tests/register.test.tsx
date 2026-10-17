import { describe, expect, mock, test } from 'claude-code/testing'
import { fmtClock, label, parseOptions, refreshesCache, TTL_MS } from '../hooks/clock'

const T0 = new Date(2026, 9, 17, 14, 27, 0).getTime()
const MIN = 60_000
const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 0, model: 'claude-x' }
const turn = (over: Record<string, unknown> = {}) => ({
  answer: 'ok',
  durationMs: 1000,
  isAborted: false,
  turnId: 't1',
  reason: 'answer',
  usage,
  ...over,
})

describe('clock', () => {
  test('options default to 5m and the hint', () => {
    expect(parseOptions(undefined)).toEqual({ ttlMs: TTL_MS['5m'], display: 'hint' })
    expect(parseOptions({ ttl: '1h', display: 'status' })).toEqual({ ttlMs: TTL_MS['1h'], display: 'status' })
    expect(parseOptions({ ttl: 'bogus', display: 3 })).toEqual({ ttlMs: TTL_MS['5m'], display: 'hint' })
  })

  test('only main-loop turns with a response refresh the cache', () => {
    expect(refreshesCache({ usage })).toBe(true)
    expect(refreshesCache({ usage, agentId: 'a1' })).toBe(false)
    expect(refreshesCache({})).toBe(false)
  })

  test('warm until the TTL, cold after, marked approximate', () => {
    expect(label(null, TTL_MS['5m'], T0)).toBeNull()
    expect(label(T0, TTL_MS['5m'], T0 + MIN)).toEqual({ text: 'cache warm → ~14:32', cold: false })
    expect(label(T0, TTL_MS['5m'], T0 + 5 * MIN)).toEqual({ text: 'cache cold since ~14:32', cold: true })
    expect(label(T0, TTL_MS['1h'], T0 + 30 * MIN)).toEqual({ text: 'cache warm → ~15:27', cold: false })
  })

  test('another day carries the date', () => {
    expect(fmtClock(T0, T0 + 86_400_000)).toBe('Oct 17 14:27')
  })
})

const PROPS = { isDraft: false, isWorking: false, hint: '? for shortcuts' }

async function mountHint($: any, on: any) {
  on('turn.complete', async () => ({ text: '' }))
  on('ui.render', { component: 'PromptHint' }, async ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>{e.props.hint}</Text>
  })
  return $.ui.mount({ plugin: 'cache-clock', surface: 'terminal', component: 'PromptHint', props: PROPS })
}

const rows = async (ui: any) => {
  const root = await ui.drawn()
  const walk = (n: any): string => (typeof n === 'string' ? n : (n.children ?? []).map(walk).join(''))
  return root.props?.flexDirection === 'column' ? root.children.map(walk) : [walk(root)]
}

describe('register', () => {
  test('hidden before a turn, warm after one, cold past the TTL, cleared by /clear', async ($, on) => {
    const clock = mock.clock(on, { now: T0 })
    on('session.end', async (_$: any, e: any) => ({ sessionId: e.sessionId }))
    const ui = await mountHint($, on)
    expect(await rows(ui)).toEqual(['? for shortcuts'])

    await $.turn.complete(turn() as never)
    await ui.redraw(PROPS)
    expect(await rows(ui)).toEqual(['? for shortcuts', 'cache warm → ~14:32'])

    // A subagent's turn does not move the clock.
    await clock.advance(4 * MIN)
    await $.turn.complete(turn({ agentId: 'a1' }) as never)
    await clock.advance(2 * MIN)
    await clock.settle()
    await ui.redraw(PROPS)
    expect(await rows(ui)).toEqual(['? for shortcuts', 'cache cold since ~14:32'])

    await $.session.end({ reason: 'clear', sessionId: 's1' } as never)
    await ui.redraw(PROPS)
    expect(await rows(ui)).toEqual(['? for shortcuts'])
  })

  test('a turn with no response leaves it hidden', async ($, on) => {
    mock.clock(on, { now: T0 })
    const ui = await mountHint($, on)
    await $.turn.complete(turn({ usage: undefined, reason: 'error' }) as never)
    await ui.redraw(PROPS)
    expect(await rows(ui)).toEqual(['? for shortcuts'])
  })
})
