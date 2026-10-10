import { describe, expect, mock, test } from 'claude-code/testing'
import { applyTask, buildView, clean, fmtIdle, MAX_AGENTS, track, type Seen } from '../hooks/line'

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
  on('agent.list', async () => {
    lists.n++
    return { value: agents() }
  })
  on('session.start', async () => ({ cwd: '/' }))
  // Stands in for whatever the engine draws above the prompt beneath the mod.
  on('ui.render', { component: 'AbovePrompt' }, async ($: any, e: any) => {
    lists.draws++
    const { Text } = $.ui.resolve(e)
    return <Text>base</Text>
  })
  on('tool.call', async (_$: any, e: any) => {
    if (e.tool === 'TaskCreate') return { result: { task: { id: e.subject, subject: e.subject } } }
    if (e.tool === 'TaskUpdate') return { result: { success: true, taskId: e.taskId, updatedFields: ['status'] } }
    return { result: {} }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'agent-status', surface: 'terminal', component: 'AbovePrompt', props: { ...props, ...over } })
  return { ui, clock, lists }
}

// The line the mod added beneath the base row, or '' when it added none.
const text = async (ui: any) => {
  const walk = (n: any): string => (typeof n === 'string' ? n : (n.children ?? []).map(walk).join(''))
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

  test('caps the agent count and reports the rest', async () => {
    const agents = Array.from({ length: MAX_AGENTS + 3 }, (_, i) => agent(String(i), 'running'))
    const view = buildView(agents, track({}, agents, 0), {}, 0)!
    expect(view.rows.length).toBe(MAX_AGENTS)
    expect(view.more).toBe(3)
  })

  test('label prefers name, then description, then type; idle counts from the status change', async () => {
    const agents = [agent('a', 'idle', { name: 'reviewer' }), agent('b', 'running', { description: '' })]
    const view = buildView(agents, track({}, agents, 0), { 1: 'completed', 2: 'pending' }, 3 * 60_000)!
    expect(view.rows.map(r => [r.label, r.idle])).toEqual([['reviewer', '3m'], ['general-purpose', '3m']])
    expect(view.tasks).toEqual({ done: 1, total: 2 })
  })
})

describe('line', () => {
  test('renders nothing while no agent is live', async ($, on) => {
    const { ui } = await mountLine($, on, () => [agent('a', 'completed')])
    expect(await text(ui)).toBe('')
  })

  test('draws live agents with status and time in status, and tracks idle time', async ($, on) => {
    let list = [agent('a', 'running', { name: 'explorer' })]
    const { ui, clock } = await mountLine($, on, () => list)
    await clock.advance(5000)
    expect(await text(ui)).toBe('agents explorer running <1m')
    list = [agent('a', 'idle', { name: 'explorer' })]
    await clock.advance(5000)
    await clock.advance(120_000)
    expect(await text(ui)).toBe('agents explorer idle 2m')
  })

  test('shows done/total tasks from Task* tool calls, deletes included', async ($, on) => {
    const { ui, clock } = await mountLine($, on, () => [agent('a', 'running', { name: 'w' })])
    await $.tool.call({ tool: 'TaskCreate', subject: '1', description: 'd' })
    await $.tool.call({ tool: 'TaskCreate', subject: '2', description: 'd' })
    await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
    await clock.settle()
    expect(await text(ui)).toBe('agents w running <1m  tasks 1/2')
    await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'deleted' })
    await clock.settle()
    expect(await text(ui)).toBe('agents w running <1m  tasks 1/1')
  })

  test('an untrusted description is cleaned and the line truncates', async ($, on) => {
    const { ui, clock } = await mountLine($, on, () => [agent('a', 'running', { description: '\x1b[2Jwipe\nscreen' })])
    await clock.advance(5000)
    expect(await text(ui)).toBe('agents wipe screen running <1m')
    const line = (await ui.findAll({ type: 'Text' })).find((el: any) => el.props.wrap)
    expect(line?.props.wrap).toBe('truncate-end')
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
