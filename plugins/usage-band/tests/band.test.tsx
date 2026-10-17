import { describe, expect, mock, test } from 'claude-code/testing'
import { allocate, gradeLimits, inCollapsed, isShown, resetPart } from '../hooks/band'
import { DEFAULTS } from '../hooks/options'

const cat = (name: string, tokens: number, color: string, kind: string) => ({
  name,
  tokens,
  color,
  isDeferred: kind === 'deferred',
  kind,
})

// Trimmed from a live `$.session.usage({ breakdown: 'summary' })`.
const CATEGORIES = [
  cat('System prompt', 8185, 'promptBorder', 'used'),
  cat('System tools', 32640, 'inactive', 'used'),
  cat('MCP tools', 1930, 'cyan_FOR_SUBAGENTS_ONLY', 'used'),
  cat('MCP tools (deferred)', 24491, 'inactive', 'deferred'),
  cat('Custom agents', 1997, 'permission', 'used'),
  cat('Memory files', 4240, 'claude', 'used'),
  cat('Skills', 9982, 'warning', 'used'),
  cat('Messages', 1, 'purple_FOR_SUBAGENTS_ONLY', 'used'),
  cat('Autocompact buffer', 33000, 'inactive', 'buffer'),
  cat('Free space', 107502, 'promptBorder', 'free'),
]

const RESET = Date.UTC(2026, 9, 4, 5, 10)
const NOW = RESET - (89 * 60_000)
const LIMITS = [
  { kind: 'five_hour', percentUsed: 38, resetsAt: new Date(RESET).toISOString() },
  { kind: 'seven_day', percentUsed: 62, resetsAt: new Date(RESET + 31 * 3600_000).toISOString() },
]

const usage = (rateLimits: unknown[], extra: Record<string, unknown> = {}) => ({
  rateLimits,
  ...extra,
  context: {
    tokens: 54599,
    window: 200000,
    percent: 27,
    breakdown: {
      categories: CATEGORIES,
      totalTokens: 59498,
      maxTokens: 200000,
      rawMaxTokens: 200000,
      percentage: 30,
      autoCompactThreshold: 167000,
      isAutoCompactEnabled: true,
      apiUsage: null,
    },
  },
})

const props = (over: Record<string, unknown> = {}) => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 8,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 8 },
  view: {},
  ...over,
})

// Mounts the band on a session whose usage() answers `answer`.
async function mountBand($: any, on: any, answer: () => unknown, over = {}, logs: string[] = [], toasts: string[] = []) {
  on('session.usage', async () => {
    const out = answer()
    return out instanceof Error ? { deny: out.message } : { value: out }
  })
  on('session.start', async () => ({ cwd: '/' }))
  on('session.measure', async () => ({ changed: [] }))
  on('ui.log', async (_$: any, e: any) => {
    logs.push(e.text)
    return { value: undefined }
  })
  mock.clock(on, { now: NOW })
  mock.store(on, {})
  on('ui.toast', async (_$: any, e: any) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  return $.ui.mount({
    plugin: 'usage-band',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: props(over),
  })
}

const text = async (ui: any) => {
  const row = await ui.drawn()
  const walk = (n: any): string =>
    typeof n === 'string' ? n : (n.children ?? []).map(walk).join('')
  return walk(row)
}

// Cell width of each drawn row (a column Box is one row per child).
const rowWidths = async (ui: any) => {
  const root = await ui.drawn()
  const walk = (n: any): string =>
    typeof n === 'string' ? n : (n.children ?? []).map(walk).join('')
  const rows = root.props?.flexDirection === 'column' ? root.children : [root]
  return rows.map((r: any) => [...walk(r)].length)
}

describe('allocate', () => {
  test('widths sum to the bar width', async () => {
    for (const width of [10, 17, 40, 83]) {
      const cells = allocate(CATEGORIES.filter(c => c.kind !== 'deferred').map(c => c.tokens), width)
      expect(cells.reduce((a, b) => a + b, 0)).toBe(width)
    }
  })

  test('a non-zero category keeps at least one cell', async () => {
    const tokens = CATEGORIES.filter(c => c.kind !== 'deferred').map(c => c.tokens)
    const cells = allocate(tokens, 10)
    tokens.forEach((t, i) => expect(cells[i]! >= 1).toBe(t > 0))
    expect(cells[tokens.indexOf(1)]).toBe(1)
  })
})

describe('band', () => {
  test('compact by default: ctx, free tokens and 5h with reset', async ($, on) => {
    const ui = await mountBand($, on, () => usage(LIMITS))
    const t = await text(ui)
    expect(t).toMatch(/ctx .* 30% · 108k free/)
    expect(t).toMatch(/5h .* 38% ↻1h29m/)
    expect(t).not.toMatch(/weekly|context/)
    expect(await ui.find({ type: 'Button', key: 'toggle' })).toBeDefined()
  })

  test('segment widths fill the context bar', async ($, on) => {
    const ui = await mountBand($, on, () => usage(LIMITS))
    const bar = (await ui.findAll({ type: 'Text' })).filter(
      (el: any) => /^[█░]+$/.test(el.text) && el.props.color !== undefined,
    )
    expect(bar.length > 1).toBe(true)
    const width = bar.reduce((n: number, el: any) => n + el.text.length, 0)
    expect(width >= 10 && width <= 40).toBe(true)
  })

  test('the toggle switches to the expanded view and back', async ($, on) => {
    const ui = await mountBand($, on, () => usage(LIMITS))
    await ui.press({ key: 'toggle' })
    const t = await text(ui)
    expect(t).toMatch(/context +.*59k \/ 200k · 30% · compacts at 167k/)
    expect(t).toMatch(/● sys 8k +● tools 33k/)
    expect(t).toMatch(/5h +.* 38% {2}↻ 1h 29m/)
    expect(t).toMatch(/weekly +.* 62% {2}↻ 1d 8h/)
    expect(t).toContain('┊')
    const ctxBar = t.match(/context +([█░┊]+)/)![1]!
    const fiveBar = t.match(/5h +([━─]+)/)![1]!
    expect(ctxBar.length).toBe(fiveBar.length)
    expect(ctxBar.indexOf('┊')).toBe(Math.round((167000 / 200000) * ctxBar.length))
    await ui.press({ key: 'toggle' })
    expect(await text(ui)).not.toMatch(/weekly/)
  })

  test('expanded drops legend tokens under 80 columns', async ($, on) => {
    const ui = await mountBand($, on, () => usage(LIMITS), { bodyColumns: 70 })
    await ui.press({ key: 'toggle' })
    const t = await text(ui)
    expect(t).toMatch(/● sys +● tools/)
    expect(t).not.toMatch(/tools 33k/)
    expect(t).toMatch(/weekly/)
  })

  test('expanded falls back to compact when maxRows is short', async ($, on) => {
    const ui = await mountBand($, on, () => usage(LIMITS), { maxRows: 2 })
    await ui.press({ key: 'toggle' })
    expect(await text(ui)).not.toMatch(/weekly|context/)
  })

  test('narrow compact drops the 5h segment, keeping the context bar', async ($, on) => {
    const ui = await mountBand($, on, () => usage(LIMITS), { bodyColumns: 40 })
    const t = await text(ui)
    expect(t).toMatch(/ctx .* 30%/)
    expect(t).not.toMatch(/5h/)
  })

  test('without rate limits no limit parts or placeholders appear', async ($, on) => {
    const ui = await mountBand($, on, () => usage([]))
    expect(await text(ui)).not.toMatch(/5h|↻|n\/a|--/)
    await ui.press({ key: 'toggle' })
    const t = await text(ui)
    expect(t).toMatch(/context/)
    expect(t).not.toMatch(/5h|weekly|↻|n\/a/)
  })

  test('compact is forced while working', async ($, on) => {
    const ui = await mountBand($, on, () => usage(LIMITS))
    await ui.press({ key: 'toggle' })
    expect(await text(ui)).toMatch(/weekly/)
    await ui.redraw(props({ isWorking: true }))
    expect(await text(ui)).not.toMatch(/weekly|context/)
    await ui.redraw(props({ isWorking: false }))
    expect(await text(ui)).toMatch(/weekly/)
  })

  for (const bodyColumns of [160, 100, 79, 50, 34]) {
    test(`every row fits ${bodyColumns} columns in both views`, async ($, on) => {
      const ui = await mountBand($, on, () => usage(LIMITS), { bodyColumns })
      const compact = await rowWidths(ui)
      await ui.press({ key: 'toggle' })
      const expanded = await rowWidths(ui)
      expect(expanded.length > compact.length || bodyColumns < 50).toBe(true)
      expect([...compact, ...expanded].filter(w => w > bodyColumns)).toEqual([])
    })
  }

  test('a missing resetsAt omits the reset text and its width', async ($, on) => {
    const noReset = LIMITS.map(({ resetsAt: _drop, ...rest }) => rest)
    const ui = await mountBand($, on, () => usage(noReset))
    expect(await text(ui)).toMatch(/5h .* 38%/)
    expect(await text(ui)).not.toMatch(/↻|NaN/)
    await ui.press({ key: 'toggle' })
    expect(await text(ui)).toMatch(/weekly .* 62%/)
    expect(await text(ui)).not.toMatch(/↻|NaN/)
  })

  test('a survey passes the band through', async ($, on) => {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      const { Text } = $.ui.resolve(e)
      return <Text>survey</Text>
    })
    const ui = await mountBand($, on, () => usage(LIMITS), { hasSurvey: true })
    expect(await text(ui)).toBe('survey')
  })

  test('a failing usage() keeps the last snapshot and logs once', async ($, on) => {
    let fail = false
    const logs: string[] = []
    const ui = await mountBand($, on, () => {
      if (fail) return new Error('boom')
      return usage(LIMITS)
    }, {}, logs)
    fail = true
    await $.session.measure({ context: (usage(LIMITS).context as any), rateLimits: [], changed: [] })
    await $.session.measure({ context: (usage(LIMITS).context as any), rateLimits: [], changed: [] })
    await ui.redraw(props())
    expect(await text(ui)).toMatch(/ctx .* 30%/)
    expect(logs.filter(l => l.includes('boom')).length).toBe(1)
  })
})

const MSGS = [{ role: 'user', text: 'summary', toolUses: [] }]

describe('pace, windows and stats', () => {
  const at = (hoursLeft: number) => new Date(NOW + hoursLeft * 3600_000).toISOString()

  test('a window pacing to run out is red with ▲, and weekly joins the collapsed row when high', async ($, on) => {
    const limits = [
      { kind: 'five_hour', percentUsed: 60, resetsAt: at(2.5) },
      { kind: 'seven_day', percentUsed: 85, resetsAt: at(24) },
    ]
    const ui = await mountBand($, on, () => usage(limits))
    const t = await text(ui)
    expect(t).toMatch(/5h .* 60%▲ ↻2h30m/)
    expect(t).toMatch(/wk .* 85% ↻1d/)
    const red = (await ui.findAll({ type: 'Text' })).find((el: any) => /^━+$/.test(el.text) && el.props.color === 'error')
    expect(red).toBeDefined()
    expect((await ui.find({ type: 'Text', text: '60%▲' }))?.props.color).toBe('error')
  })

  test('a fine 5h window is green and a low weekly stays out of the collapsed row', async ($, on) => {
    const ui = await mountBand($, on, () => usage(LIMITS))
    const filled = (await ui.findAll({ type: 'Text' })).find((el: any) => /^━+$/.test(el.text) && el.props.color)
    expect(filled?.props.color).toBe('success')
    expect(await text(ui)).not.toMatch(/wk|▲/)
  })

  test('the spend_limit window gets its own row, clamped bar, real percentage', async ($, on) => {
    const ui = await mountBand($, on, () => usage([...LIMITS, { kind: 'spend_limit', percentUsed: 104 }]))
    expect(await text(ui)).toMatch(/spend .* 104%/)
    await ui.press({ key: 'toggle' })
    const t = await text(ui)
    expect(t).toMatch(/spend +━+ {2}104%/)
  })

  test('the expanded view shows cost, cache hit rate, compactions and effort', async ($, on) => {
    const u = usage(LIMITS, { cost: { usd: 1.234 } }) as any
    u.context.breakdown.apiUsage = { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 50, cache_read_input_tokens: 940 }
    on('session.compact', async () => ({ messages: MSGS }))
    on('turn.step', async function* (_$: any, e: any) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
    } as any)
    const ui = await mountBand($, on, () => u)
    await $.session.compact({ trigger: 'manual', messages: MSGS } as any)
    await $.session.compact({ trigger: 'auto', agentId: 'a1', messages: MSGS } as any)
    const stream = $.turn.step({ turnId: 't', index: 0, model: 'm', effort: 'high', messageCount: 1 } as any) as any
    if (stream && typeof stream[Symbol.asyncIterator] === 'function') for await (const _ of stream) void _
    else await stream
    expect(await text(ui)).toMatch(/30% · 108k free · \$1\.23 · cache 94% · ◑ high/)
    await ui.press({ key: 'toggle' })
    expect(await text(ui)).toMatch(/session +\$1\.23 · cache 94% · compacted ×1 · ◑ high/)
  })

  test('a window turning red toasts once across measurements', async ($, on) => {
    const toasts: string[] = []
    const red = [{ kind: 'five_hour', percentUsed: 60, resetsAt: at(2.5) }]
    await mountBand($, on, () => usage(red), {}, [], toasts)
    const ctx = usage(red).context as any
    await $.session.measure({ context: ctx, rateLimits: red, changed: ['rateLimits'] } as any)
    await $.session.measure({ context: ctx, rateLimits: red, changed: ['rateLimits'] } as any)
    expect(toasts.length).toBe(1)
    expect(toasts[0]).toMatch(/^5h limit at 60%: on pace to run out/)
  })

  for (const bodyColumns of [160, 100, 79, 50, 34]) {
    test(`with three windows and stats every row fits ${bodyColumns} columns`, async ($, on) => {
      const limits = [
        { kind: 'five_hour', percentUsed: 60, resetsAt: at(2.5) },
        { kind: 'seven_day', percentUsed: 85.5, resetsAt: at(24) },
        { kind: 'spend_limit', percentUsed: 104 },
      ]
      const ui = await mountBand($, on, () => usage(limits, { cost: { usd: 12.5 } }), { bodyColumns })
      const compact = await rowWidths(ui)
      await ui.press({ key: 'toggle' })
      const expanded = await rowWidths(ui)
      expect([...compact, ...expanded].filter(w => w > bodyColumns)).toEqual([])
    })
  }

  test('the band stays above what other mods draw beneath it', async ($, on) => {
    on('ui.render', { component: 'AbovePrompt' }, async ($: any, e: any) => {
      const { Text } = $.ui.resolve(e)
      return <Text>other</Text>
    })
    const ui = await mountBand($, on, () => usage(LIMITS))
    const t = await text(ui)
    expect(t).toMatch(/^ctx .*other$/)
  })
})

describe('options', () => {
  const opts = (over: Partial<typeof DEFAULTS>) => ({ ...DEFAULTS, ...over })

  test('hide-until-threshold keeps only windows past it or on a pace alert', async () => {
    const reset = new Date(NOW + 2.5 * 3600_000).toISOString()
    const limits = gradeLimits(
      [
        { kind: 'seven_day', percentUsed: 62, resetsAt: LIMITS[1]!.resetsAt },
        { kind: 'five_hour', percentUsed: 60, resetsAt: reset },
        { kind: 'spend_limit', percentUsed: 20 },
      ],
      NOW,
    )
    expect(limits.map(l => l.r.kind)).toEqual(['five_hour', 'seven_day', 'spend_limit'])
    expect(limits.filter(l => isShown(l, opts({}))).length).toBe(3)
    // 5h is under 70% but pacing to run out, so it still shows.
    expect(limits.filter(l => isShown(l, opts({ limitsThreshold: 70 }))).map(l => l.r.kind)).toEqual(['five_hour'])
    expect(limits.filter(l => isShown(l, opts({ limitsThreshold: 50 }))).map(l => l.r.kind)).toEqual(['five_hour', 'seven_day'])
  })

  test('the weekly threshold decides what joins the collapsed row', async () => {
    const [week] = gradeLimits([{ kind: 'seven_day', percentUsed: 62, resetsAt: LIMITS[1]!.resetsAt }], NOW)
    expect(inCollapsed(week!, opts({}))).toBe(false)
    expect(inCollapsed(week!, opts({ weeklyThreshold: 60 }))).toBe(true)
  })

  test('the clock reset style names the time instead of the time left', async () => {
    const r = LIMITS[0] as any
    expect(resetPart(r, NOW, false, 'countdown')).toBe(' ↻1h29m')
    expect(resetPart(r, NOW, true, 'countdown')).toBe('  ↻ 1h 29m')
    const d = new Date(RESET)
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    expect(resetPart(r, NOW, false, 'clock')).toMatch(new RegExp(` ↻(\\w{3} )?${hm}$`))
    expect(resetPart({ kind: 'five_hour', percentUsed: 1 }, NOW, true, 'clock')).toBe('')
  })
})
