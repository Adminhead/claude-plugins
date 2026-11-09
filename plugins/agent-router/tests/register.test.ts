import { describe, expect, mock, test } from 'claude-code/testing'
import { register } from '../hooks/register'

const ENGINE = { plugin: 'engine', tier: 'core' } as never
const PLUGIN = { plugin: 'reviewer@adminhead', tier: 'user' } as never
const BASE = 'Launch a new agent.'

// Stubs the engine beneath the mod and offers the given types the way a request lists them.
async function session($: any, on: any, settings: Record<string, unknown> = {}, flag?: string) {
  let invalidations = 0
  on('agent.offer', async () => ({ isOffered: true }))
  on('tool.describe', async (_$: any, e: any) => ({ description: e.description }))
  on('settings.read', async () => ({ value: settings }))
  on('ui.invalidate', async () => {
    invalidations++
    return { value: undefined }
  })
  mock.env(on, flag === undefined ? {} : { CLAUDE_ORCHESTRATE: flag })
  on('classic.SessionStart', async () => ({}))
  on('classic.UserPromptSubmit', async () => ({}))
  const offer = (agent: string, description: string, provider = PLUGIN, source = 'plugin') =>
    $.agent.offer({ agent, description, source, provider })
  const describe = async () => (await $.tool.describe({ tool: 'Agent', description: BASE, provider: ENGINE })).description as string
  return { offer, describe, invalidations: () => invalidations }
}

describe('register', () => {
  test('the orchestrator main thread gets the routing table', async ($, on) => {
    const s = await session($, on)
    await $.classic.SessionStart({ hook_event_name: 'SessionStart', source: 'startup', agent_type: 'orchestration:orchestration', session_id: 's', transcript_path: '/t', cwd: '/' } as never)
    expect((await s.offer('Explore', 'Fast read-only search.', ENGINE, 'built-in')).isOffered).toBe(true)
    await s.offer('reviewer:reviewer', 'Read-only reviewer.')
    await s.offer('orchestration:orchestration', 'Main-session orchestrator.')
    const d = await s.describe()
    expect(d.startsWith(BASE)).toBe(true)
    expect(d).toContain('- `Explore`: Fast read-only search.')
    expect(d).toContain('- `reviewer:reviewer`: Read-only reviewer.')
    expect(d.includes('Main-session orchestrator')).toBe(false)
  })

  test('another main agent, or none, leaves the description alone', async ($, on) => {
    const s = await session($, on)
    await s.offer('Explore', 'Fast read-only search.', ENGINE, 'built-in')
    expect(await s.describe()).toBe(BASE)
    await $.classic.SessionStart({ hook_event_name: 'SessionStart', source: 'startup', agent_type: 'coder:coder', session_id: 's', transcript_path: '/t', cwd: '/' } as never)
    expect(await s.describe()).toBe(BASE)
  })

  test('CLAUDE_ORCHESTRATE marks the session as orchestration without an agent', async ($, on) => {
    const s = await session($, on, {}, '1')
    await s.offer('Explore', 'Fast read-only search.', ENGINE, 'built-in')
    expect(await s.describe()).toContain('`Explore`')
  })

  test('an empty CLAUDE_ORCHESTRATE does not count', async ($, on) => {
    const s = await session($, on, {}, '')
    await s.offer('Explore', 'Fast read-only search.', ENGINE, 'built-in')
    expect(await s.describe()).toBe(BASE)
  })

  test('a subagent prompt hook does not change the main agent', async ($, on) => {
    const s = await session($, on)
    await $.classic.UserPromptSubmit({ hook_event_name: 'UserPromptSubmit', prompt: 'x', agent_type: 'orchestration', agent_id: 'a1', session_id: 's', transcript_path: '/t', cwd: '/' } as never)
    await s.offer('Explore', 'Fast read-only search.', ENGINE, 'built-in')
    expect(await s.describe()).toBe(BASE)
  })

  test('the agent setting counts as the main agent', async ($, on) => {
    const s = await session($, on, { agent: 'orchestration:orchestration' })
    await s.offer('Explore', 'Fast read-only search.', ENGINE, 'built-in')
    expect(await s.describe()).toContain('`Explore`')
  })

  test('a type offered after the first render redescribes the tool once', async ($, on) => {
    const s = await session($, on, { agent: 'orchestration' })
    await s.offer('Explore', 'Fast read-only search.', ENGINE, 'built-in')
    await s.describe()
    await s.offer('Explore', 'Fast read-only search.', ENGINE, 'built-in')
    expect(s.invalidations()).toBe(0)
    await s.offer('scribe:scribe', 'Writes docs.')
    await s.offer('coder:coder', 'Writes code.')
    expect(s.invalidations()).toBe(1)
    expect(await s.describe()).toContain('`scribe:scribe`')
  })
})

describe('options', () => {
  test('maxAgents and hideAgents shape the table', { options: { maxAgents: 1, hideAgents: 'reviewer' } }, async ($, on) => {
    const s = await session($, on, { agent: 'orchestration' })
    await s.offer('alpha', 'Does alpha work.')
    await s.offer('reviewer', 'Read-only reviewer.')
    await s.offer('zeta', 'Does zeta work.')
    const d = await s.describe()
    expect(d.match(/^- `/gm)?.length).toBe(1)
    expect(d).toContain('`alpha`')
    expect(d.includes('`reviewer`')).toBe(false)
  })

  test('default options list all three', async ($, on) => {
    const s = await session($, on, { agent: 'orchestration' })
    await s.offer('alpha', 'Does alpha work.')
    await s.offer('reviewer', 'Read-only reviewer.')
    await s.offer('zeta', 'Does zeta work.')
    expect((await s.describe()).match(/^- `/gm)?.length).toBe(3)
  })

  test('only a boolean false switches the mod off', () => {
    const events = (opts: Record<string, unknown> | undefined) => {
      const seen: string[] = []
      register(((e: string) => { seen.push(e); return { catch() {} } }) as any, opts as any)
      return seen
    }
    expect(events({ enabled: false })).toEqual([])
    for (const o of [undefined, {}, { enabled: true }, { enabled: 'false' }, { enabled: 0 }, { enabled: '' }]) {
      expect(events(o).length).toBeGreaterThan(0)
    }
  })
})
