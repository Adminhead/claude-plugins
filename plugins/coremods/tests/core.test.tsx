import { describe, expect, mock, test } from 'claude-code/testing'

const cat = (name: string, tokens: number, color: string, kind: string) => ({
  name,
  tokens,
  color,
  isDeferred: false,
  kind,
})

const usage = {
  startedAt: 0,
  rateLimits: [],
  context: {
    tokens: 54599,
    window: 200000,
    percent: 27,
    breakdown: {
      categories: [cat('Messages', 1, 'purple_FOR_SUBAGENTS_ONLY', 'used'), cat('Free space', 107502, 'promptBorder', 'free')],
      totalTokens: 59498,
      maxTokens: 200000,
      rawMaxTokens: 200000,
      percentage: 30,
      autoCompactThreshold: 167000,
      isAutoCompactEnabled: true,
    },
  },
}

const props = { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 120, scroll: { offset: 0, bodyRows: 8 }, view: {} }

const walk = (n: any): string => (typeof n === 'string' ? n : (n.children ?? []).map(walk).join(''))

describe('AbovePrompt', () => {
  test('the usage band and the agent line draw together, band first', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    on('session.usage', async () => ({ value: usage }))
    on('session.start', async () => ({ cwd: '/' }))
    on('agent.list', async () => ({ value: [{ id: 'a', type: 'general-purpose', description: 'job', name: 'explorer', status: 'running' }] }))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount({ plugin: 'coremods', surface: 'terminal', component: 'AbovePrompt', props })
    await clock.advance(5000)
    const root = await ui.drawn()
    expect(root.props.flexDirection).toBe('column')
    expect(walk(root.children[0])).toMatch(/ctx .* 30%/)
    expect(walk(root.children[1])).toBe('agents 1 (1 running)')
    expect(await ui.find({ type: 'Button', key: 'agents-toggle' })).toBeDefined()
  })
})
