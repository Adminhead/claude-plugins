import { describe, expect, mock, test } from 'claude-code/testing'
import { applyTask, buildView, clean, fmtIdle, paneRows, track, type Seen } from '../hooks/agent-status/line'

const agent = (id: string, status: string, over: Record<string, unknown> = {}) => ({
  id,
  type: 'general-purpose',
  description: `job ${id}`,
  status,
  ...over,
})

const props = { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 120 }

// Mounts the line on a session whose agent list and Task* tools answer from the test.
async function mountLine($: any, on: any, agents: () => unknown[], over: Record<string, unknown> = {}) {
  const clock = mock.clock(on, { now: 1_000_000 })
  const lists = { n: 0, draws: 0 }
  // What the engine receives from the mod's $.ui.open and $.ui.close.
  // `up` is whether the engine holds the pane; a test sets it false to stand for the person's Esc
  // (the test engine's `$.ui` has no close, so it cannot raise a close with the person origin).
  const panes = { opened: [] as any[], closed: [] as string[], up: false }
  on('agent.list', async () => {
    lists.n++
    return { value: agents() }
  })
  on('session.start', async () => ({ cwd: '/' }))
  on('session.end', async () => ({ sessionId: 's' }))
  on('ui.open', async (_$: any, e: any) => {
    panes.opened.push(e)
    panes.up = true
    return { value: undefined }
  })
  on('ui.close', async (_$: any, e: any) => {
    panes.closed.push(e.id)
    panes.up = false
    return { value: undefined }
  })
  on('ui.log', async () => ({ value: undefined }))
  on('ui.panes', async () => ({ value: panes.up ? [{ id: 'agents', title: 'Agents', shown: true, focused: false, placed: true }] : [] }))
  // Stands in for whatever the engine draws above the prompt beneath the mod.
  on('ui.render', { component: 'AbovePrompt' }, async ($: any, e: any) => {
    lists.draws++
    const { Text } = $.ui.resolve(e)
    return <Text>base</Text>
  })
  on('tool.call', async (_$: any, e: any) => {
    if (e.tool === 'TaskCreate') return { result: { task: { id: e.subject, subject: e.subject } } }
    if (e.tool === 'TaskUpdate') return { result: { success: true, taskId: e.taskId, updatedFields: ['status'] } }
    if (e.tool === 'TaskList') return { result: { tasks: [null, { id: 7 }, 'x'] } }
    return { result: {} }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'coremods', surface: 'terminal', component: 'AbovePrompt', props: { ...props, ...over } })
  return { ui, clock, lists, panes }
}

// Mounts the pane the way the engine does after $.ui.open: component Pane, requestId the pane id.
const mountPane = ($: any) =>
  $.ui.mount({
    plugin: 'coremods',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'agents',
    props: { title: 'Agents', isFocused: false, bodyColumns: 38, placement: 'inline', scroll: { offset: 0, bodyRows: 8 }, view: {} },
  })

// Shown text: a column's children are lines, a Button reads as its label after a space (the row's gap).
const flat = (n: any): string =>
  typeof n === 'string'
    ? n
    : n.type === 'Button'
      ? n.props.label
      : (n.children ?? []).map(flat).join(n.props?.flexDirection === 'column' ? '\n' : n.type === 'Box' ? ' ' : '')
const walk = flat

// The line the mod added beneath the base row, or '' when it added none.
const text = async (ui: any) => {
  const root = await ui.drawn()
  return root.props?.flexDirection === 'column' ? walk(root.children[1] ?? '') : ''
}

describe('clean', () => {
  test('strips escapes and control characters, collapses space, and caps length', async () => {
    expect(clean('\x1b[31mred\x1b[0m\n\tteam  lead\x07')).toBe('red team lead')
    expect(clean('x'.repeat(40))).toBe(`${'x'.repeat(23)}…`)
    expect(clean('   ')).toBe('')
  })
})

describe('fmtIdle', () => {
  test('under a minute, minutes, then hours', async () => {
    expect([0, 59_000, 60_000, 59 * 60_000, 62 * 60_000, -5].map(fmtIdle)).toEqual(['<1m', '<1m', '1m', '59m', '1h2m', '<1m'])
  })
})

describe('track', () => {
  test('a status change restarts the clock, an unchanged one keeps it', async () => {
    let seen: Seen = track({}, [agent('a', 'running')], 100)
    seen = track(seen, [agent('a', 'running')], 500)
    expect(seen.a).toEqual({ status: 'running', since: 100 })
    seen = track(seen, [agent('a', 'idle')], 900)
    expect(seen.a).toEqual({ status: 'idle', since: 900 })
  })

  test('finished and vanished agents drop out', async () => {
    const seen = track({}, [agent('a', 'running'), agent('b', 'running')], 0)
    const next = track(seen, [agent('a', 'completed')], 10)
    expect(Object.keys(next)).toEqual([])
  })
})

describe('applyTask', () => {
  test('create, update, and delete keep done/total right', async () => {
    let t = applyTask({}, 'TaskCreate', {}, { task: { id: '1' } })
    t = applyTask(t, 'TaskCreate', {}, { task: { id: '2' } })
    t = applyTask(t, 'TaskUpdate', { taskId: '1', status: 'completed' }, { success: true })
    expect(t).toEqual({ 1: 'completed', 2: 'pending' })
    t = applyTask(t, 'TaskUpdate', { taskId: '2', status: 'deleted' }, { success: true })
    expect(t).toEqual({ 1: 'completed' })
  })

  test('an update for an unseen id is ignored', async () => {
    const t = { 1: 'pending' as const }
    expect(applyTask(t, 'TaskUpdate', { taskId: '9', status: 'completed' }, { success: true })).toBe(t)
    expect(applyTask(t, 'TaskUpdate', { taskId: 'constructor', status: 'completed' }, { success: true })).toBe(t)
  })

  test('a failed update changes nothing; TaskList replaces the map', async () => {
    const t = { 1: 'pending' as const }
    expect(applyTask(t, 'TaskUpdate', { taskId: '1', status: 'completed' }, { success: false })).toBe(t)
    expect(applyTask(t, 'TaskList', {}, { tasks: [{ id: '9', status: 'completed' }] })).toEqual({ 9: 'completed' })
  })
})

describe('buildView', () => {
  test('no live agents gives no view', async () => {
    expect(buildView([agent('a', 'completed')], track({}, [agent('a', 'completed')], 0), {}, 0)).toBeNull()
  })

  test('counts live agents by status and keeps every row', async () => {
    const agents = [agent('a', 'idle'), ...['b', 'c', 'd', 'e', 'f'].map(id => agent(id, 'running'))]
    const view = buildView(agents, track({}, agents, 0), {}, 0)!
    expect(view.rows.length).toBe(6)
    expect(view.counts).toEqual([['running', 5], ['idle', 1]])
    expect(paneRows(view)).toBe(15)
    expect(paneRows(null)).toBe(3)
  })

  test('label prefers name, then description, then type; idle counts from the status change', async () => {
    const agents = [agent('a', 'idle', { name: 'reviewer' }), agent('b', 'running', { description: '' })]
    const view = buildView(agents, track({}, agents, 0), { 1: 'completed', 2: 'pending' }, 3 * 60_000)!
    expect(view.rows.map(r => [r.label, r.idle, r.desc])).toEqual([['reviewer', '3m', 'job a'], ['general-purpose', '3m', '']])
    expect(view.tasks).toEqual({ done: 1, total: 2 })
  })
})

describe('count line', () => {
  test('renders nothing while no agent is live', async ($, on) => {
    const { ui } = await mountLine($, on, () => [agent('a', 'completed')])
    expect(await text(ui)).toBe('')
  })

  test('collapsed: a count by status with the expand arrow', async ($, on) => {
    const list = [agent('a', 'running', { name: 'explorer' }), agent('b', 'running'), agent('c', 'waiting')]
    const { ui, clock } = await mountLine($, on, () => list)
    await clock.advance(5000)
    expect(await text(ui)).toBe('agents 3 (2 running, 1 waiting) ▸')
  })

  test('shows done/total tasks from Task* tool calls, deletes included', async ($, on) => {
    const { ui, clock } = await mountLine($, on, () => [agent('a', 'running', { name: 'w' })])
    await $.tool.call({ tool: 'TaskCreate', subject: '1', description: 'd' })
    await $.tool.call({ tool: 'TaskCreate', subject: '2', description: 'd' })
    await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
    await clock.settle()
    expect(await text(ui)).toBe('agents 1 (1 running)  tasks 1/2 ▸')
    await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'deleted' })
    await clock.settle()
    expect(await text(ui)).toBe('agents 1 (1 running)  tasks 1/1 ▸')
  })

  test('a malformed TaskList result passes through and the line still draws', async ($, on) => {
    const { ui, clock } = await mountLine($, on, () => [agent('a', 'running', { name: 'w' })])
    const out = await $.tool.call({ tool: 'TaskList' })
    expect(out.result).toEqual({ tasks: [null, { id: 7 }, 'x'] })
    await clock.settle()
    expect(await text(ui)).toBe('agents 1 (1 running) ▸')
  })

  test('/clear (session.end) resets the task count and closes the pane', async ($, on) => {
    let list = [agent('a', 'running', { name: 'w' })]
    const { ui, clock, panes } = await mountLine($, on, () => list)
    await $.tool.call({ tool: 'TaskCreate', subject: '1', description: 'd' })
    await clock.settle()
    await ui.press({ key: 'agents-toggle' })
    expect(await text(ui)).toBe('agents 1 (1 running)  tasks 0/1 ▾')
    list = []
    await $.session.end({ reason: 'clear', sessionId: 's', resume: {} })
    await clock.settle()
    expect(panes.closed).toEqual(['agents'])
    expect(await text(ui)).toBe('')
    list = [agent('b', 'running', { name: 'x' })]
    await clock.advance(5000)
    expect(await text(ui)).toBe('agents 1 (1 running) ▸')
  })

  test('polls without redrawing while nothing changed', async ($, on) => {
    const { clock, lists } = await mountLine($, on, () => [agent('a', 'running')])
    await clock.advance(5000)
    const polled = lists.n
    const drawn = lists.draws
    await clock.advance(30_000)
    expect(lists.n > polled).toBe(true)
    expect(lists.draws).toBe(drawn)
  })
})

describe('pane', () => {
  test('the arrow opens the pane, which lists each agent, and turns down', async ($, on) => {
    const list = [agent('a', 'running', { name: 'explorer', description: '\x1b[2Jwipe\nscreen' }), agent('b', 'idle', { name: 'fixer' })]
    const { ui, clock, panes } = await mountLine($, on, () => list)
    await clock.advance(5000)
    await $.tool.call({ tool: 'TaskCreate', subject: '1', description: 'd' })
    await clock.settle()
    await ui.press({ key: 'agents-toggle' })
    expect(panes.opened).toEqual([{ id: 'agents', title: 'Agents', columns: 40, rows: 7, closeOnEscape: true }])
    expect((await text(ui)).endsWith('▾')).toBe(true)
    const pane = await mountPane($)
    expect(walk(await pane.drawn())).toBe('explorer running <1m\nwipe screen\nfixer idle <1m\njob b\ntasks 0/1\ncollapse')
    const desc = (await pane.findAll({ type: 'Text' })).find((el: any) => el.text === 'wipe screen')
    expect(desc?.props.wrap).toBe('truncate-end')
  })

  test('an agent without a name shows its description once, as the label', async ($, on) => {
    const { ui, clock } = await mountLine($, on, () => [agent('a', 'waiting')])
    await clock.advance(5000)
    await ui.press({ key: 'agents-toggle' })
    expect(walk(await (await mountPane($)).drawn())).toBe('job a waiting <1m\ncollapse')
  })

  test('the collapse button closes the pane and the arrow goes back', async ($, on) => {
    const { ui, clock, panes } = await mountLine($, on, () => [agent('a', 'running')])
    await clock.advance(5000)
    await ui.press({ key: 'agents-toggle' })
    await (await mountPane($)).press({ key: 'agents-collapse' })
    expect(panes.closed).toEqual(['agents'])
    await clock.settle()
    expect(await text(ui)).toBe('agents 1 (1 running) ▸')
  })

  test('pressing the arrow while open closes the pane', async ($, on) => {
    const { ui, clock, panes } = await mountLine($, on, () => [agent('a', 'running')])
    await clock.advance(5000)
    await ui.press({ key: 'agents-toggle' })
    await ui.press({ key: 'agents-toggle' })
    expect(panes.closed).toEqual(['agents'])
  })

  test('a close the mod did not ask for (the person) syncs the arrow on the next poll', async ($, on) => {
    const { ui, clock, panes } = await mountLine($, on, () => [agent('a', 'running')])
    await clock.advance(5000)
    await ui.press({ key: 'agents-toggle' })
    expect((await text(ui)).endsWith('▾')).toBe(true)
    panes.up = false
    await clock.advance(5000)
    expect(panes.closed).toEqual([])
    expect(await text(ui)).toBe('agents 1 (1 running) ▸')
    // The next press opens again rather than closing.
    await ui.press({ key: 'agents-toggle' })
    expect(panes.opened.length).toBe(2)
  })

  test('when the last agent finishes the pane stays, saying so', async ($, on) => {
    let list = [agent('a', 'running')]
    const { ui, clock, panes } = await mountLine($, on, () => list)
    await clock.advance(5000)
    await ui.press({ key: 'agents-toggle' })
    list = [agent('a', 'completed')]
    await clock.advance(5000)
    expect(panes.closed).toEqual([])
    expect(await text(ui)).toBe('')
    expect(walk(await (await mountPane($)).drawn())).toBe('no live agents\ncollapse')
  })

  test('the open pane is resized when the agent count changes', async ($, on) => {
    let list = [agent('a', 'running')]
    const { ui, clock, panes } = await mountLine($, on, () => list)
    await clock.advance(5000)
    await ui.press({ key: 'agents-toggle' })
    list = [agent('a', 'running'), agent('b', 'running')]
    await clock.advance(5000)
    expect(panes.opened.map((p: any) => p.rows)).toEqual([5, 7])
  })
})
