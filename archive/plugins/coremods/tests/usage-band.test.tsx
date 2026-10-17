import { describe, expect, mock, test } from 'claude-code/testing'
import { allocate, fmtReset, limitColor } from '../hooks/usage-band/band'

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

const usage = (rateLimits: unknown[]) => ({
  startedAt: 0,
  rateLimits,
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
async function mountBand($: any, on: any, answer: () => unknown, over = {}, logs: string[] = []) {
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
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  return $.ui.mount({
    plugin: 'coremods',
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

describe('fmtReset and limitColor', () => {
  test('a past reset shows 0m', async () => {
    expect(fmtReset(new Date(NOW - 5 * 60_000).toISOString(), NOW, false)).toBe('0m')
  })

  test('limit colors switch at 60 and 85', async () => {
    const colors = [59, 60, 84, 85, 130].map(limitColor)
    expect(colors).toEqual(['success', 'warning', 'warning', 'error', 'error'])
  })
})

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

  for (const [pct, color] of [[59, 'success'], [60, 'warning'], [84, 'warning'], [85, 'error'], [140, 'error']] as const) {
    test(`the 5h bar at ${pct}% is ${color}`, async ($, on) => {
      const ui = await mountBand($, on, () => usage([{ ...LIMITS[0], percentUsed: pct }]))
      const filled = (await ui.findAll({ type: 'Text' })).find((el: any) => /^━+$/.test(el.text) && el.props.color)
      expect(filled?.props.color).toBe(color)
    })
  }

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
