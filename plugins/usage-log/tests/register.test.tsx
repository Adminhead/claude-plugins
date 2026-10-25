import { describe, expect, mock, test } from 'claude-code/testing'
import { DEFAULTS, commandsOf, listingKey, listingOf, parseOptions, slashCommand } from '../hooks/events'

const skills = (names: string[], included = names.length) => ({
  totalSkills: names.length,
  includedSkills: included,
  tokens: 100,
  skillFrontmatter: names.map(name => ({ name, source: 'plugin', pluginName: name.split(':')[0], tokens: 10 })),
})

describe('events', () => {
  test('options', () => {
    expect(parseOptions(undefined)).toEqual(DEFAULTS)
    expect(parseOptions({ retentionDays: 0, promptText: false })).toEqual({ retentionDays: 1, promptText: false })
    expect(parseOptions({ retentionDays: 7.9 }).retentionDays).toBe(7)
    expect(parseOptions({ retentionDays: 'x' }).retentionDays).toBe(30)
  })

  test('the listing and its change key', () => {
    const l = listingOf(skills(['git-commit:git-commit', 'xlsx'], 1))!
    expect(l).toMatchObject({ total: 2, included: 1, skills: [{ name: 'git-commit:git-commit', plugin: 'git-commit' }, { name: 'xlsx' }] })
    expect(listingKey(l)).toBe(listingKey(listingOf(skills(['xlsx', 'git-commit:git-commit'], 1))!))
    expect(listingKey(l)).not.toBe(listingKey(listingOf(skills(['git-commit:git-commit', 'xlsx'], 2))!))
    expect(listingOf(undefined)).toBeNull()
    expect(listingOf({ skillFrontmatter: 'no' })).toBeNull()
    const cmds = commandsOf([
      { name: 'git-commit:git-commit', description: 'Writes commits.', source: 'plugin', plugin: 'git-commit' },
      { name: 'clear', description: 'Clear', source: 'builtin' },
      { name: 'mine', description: 'x'.repeat(400), source: 'user' },
      'junk',
    ])
    expect(cmds.map(c => c.name)).toEqual(['git-commit:git-commit', 'mine'])
    expect(cmds[1]!.description).toHaveLength(300)
    expect(listingKey(l, cmds)).not.toBe(listingKey(l))
  })

  test('slash commands', () => {
    expect(slashCommand('/ship-plugin bash-rules')).toBe('ship-plugin')
    expect(slashCommand('  /git-commit:git-commit')).toBe('git-commit:git-commit')
    expect(slashCommand('use /tmp please')).toBeUndefined()
    expect(slashCommand('/')).toBeUndefined()
  })
})

describe('register', () => {
  const capture = (on: any) => {
    const lines: any[] = []
    mock.clock(on, { now: Date.UTC(2026, 9, 18) })
    on('ui.log', async () => ({ value: undefined }))
    on('session.id', async () => ({ value: 's1' }))
    on('session.usage', async () => ({ value: { context: { window: 1, breakdown: { skills: skills(['a:a', 'b:b']) } }, rateLimits: [] } }))
    on('command.list', async () => ({ value: [{ name: 'c:c', description: 'Does c.', source: 'plugin', plugin: 'c' }] }))
    on('process.run', async (_$: any, e: any) => {
      if (e.argv[2]?.includes('cat >>')) lines.push({ file: e.argv[4], ...JSON.parse(e.init.stdin) })
      return { value: { exitCode: 0, stdout: '', stderr: '' } }
    })
    return lines
  }

  test('a prompt, the listing, a Skill call and its expansion are logged and joined by prompt number', async ($, on) => {
    const lines = capture(on)
    on('prompt.submit', async (_$: any, e: any) => ({ text: e.text }))
    on('tool.call', async () => ({ result: 'ok' }))
    on('skill.prompt', async (_$: any, e: any) => ({ text: e.text }))
    await $.prompt.submit({ text: '/a:a do the thing' } as never)
    await $.tool.call({ tool: 'Skill', skill: 'b:b', agentId: 'ag1' } as never)
    await $.skill.prompt({ skill: 'b:b', text: 'body' } as never)
    await $.tool.call({ tool: 'Agent', subagent_type: 'coder:coder', description: 'fix it', prompt: 'p', model: 'sonnet', effort: 'high' } as never)
    await $.tool.call({ tool: 'Read', file_path: 'x' } as never)
    expect(lines.map(l => l.kind)).toEqual(['prompt', 'listing', 'skill-call', 'skill', 'agent-call'])
    expect(lines[0]).toMatchObject({ session: 's1', prompt: 1, text: '/a:a do the thing', slash: 'a:a', chars: 17 })
    expect(lines[0].file).toMatch(/^usage-log-\d{4}-\d{2}-\d{2}\.jsonl$/)
    expect(lines[1]).toMatchObject({ prompt: 1, total: 2, included: 2, commands: [{ name: 'c:c', description: 'Does c.', plugin: 'c' }] })
    expect(lines[2]).toMatchObject({ prompt: 1, skill: 'b:b', agentId: 'ag1', isError: false })
    expect(lines[3]).toMatchObject({ prompt: 1, skill: 'b:b' })
    expect(lines[4]).toMatchObject({ type: 'coder:coder', description: 'fix it', model: 'sonnet', effort: 'high' })
  })

  test('an unchanged listing is not logged twice', async ($, on) => {
    const lines = capture(on)
    on('prompt.submit', async (_$: any, e: any) => ({ text: e.text }))
    await $.prompt.submit({ text: 'one' } as never)
    await $.prompt.submit({ text: 'two' } as never)
    expect(lines.map(l => l.kind)).toEqual(['prompt', 'listing', 'prompt'])
    expect(lines[2].prompt).toBe(lines[0].prompt + 1)
  })

  test('model-step is logged per loop only when the resolved model or effort changes', async ($, on) => {
    const lines = capture(on)
    on('turn.step', async function* (_$: any, e: any) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
    } as any)
    const step = async (e: any) => {
      for await (const _ of $.turn.step({ turnId: 't', index: 0, messageCount: 1, ...e } as never)) void _
    }
    await step({ model: 'm1', effort: 'medium' })
    await step({ model: 'm1', effort: 'medium' })
    await step({ model: 'm1', effort: 'medium', agentId: 'a1' })
    await step({ model: 'm1', effort: 'medium', agentId: 'a1' })
    await step({ model: 'm1', effort: 'high' })
    await step({ model: 'm1', effort: 'high', agentId: 'a1' })
    expect(lines.map(l => [l.kind, l.agentId, l.model, l.effort])).toEqual([
      ['model-step', undefined, 'm1', 'medium'],
      ['model-step', 'a1', 'm1', 'medium'],
      ['model-step', undefined, 'm1', 'high'],
      ['model-step', 'a1', 'm1', 'high'],
    ])
  })

  test('session.start clears the model-step dedupe', async ($, on) => {
    const lines = capture(on)
    on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }) as any)
    on('turn.step', async function* (_$: any, e: any) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
    } as any)
    const step = async () => {
      for await (const _ of $.turn.step({ turnId: 't', index: 0, messageCount: 1, model: 'm1', effort: 'medium' } as never)) void _
    }
    await step()
    await $.session.start({ cwd: '/x', surface: 'terminal', isInteractive: true } as never)
    await step()
    expect(lines.filter(l => l.kind === 'model-step')).toHaveLength(2)
  })

  test('a failing log write never blocks a model step', async ($, on) => {
    on('ui.log', async () => ({ value: undefined }))
    on('session.id', async () => ({ value: 's1' }))
    on('process.run', async () => ({ deny: 'no process' }))
    on('turn.step', async function* (_$: any, e: any) {
      return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: null }
    } as any)
    let result: any
    const stream: any = $.turn.step({ turnId: 't', index: 0, messageCount: 1, model: 'm1' } as never)
    const it = stream[Symbol.asyncIterator]()
    for (;;) {
      const r = await it.next()
      if (r.done) {
        result = r.value
        break
      }
    }
    expect(result?.answer).toBe('ok')
  })

  test('a failing log write never blocks the prompt', async ($, on) => {
    on('ui.log', async () => ({ value: undefined }))
    on('session.id', async () => ({ value: 's1' }))
    on('process.run', async () => ({ deny: 'no process' }))
    on('prompt.submit', async (_$: any, e: any) => ({ text: e.text }))
    const out: any = await $.prompt.submit({ text: 'still goes' } as never)
    expect(out).toBeDefined()
  })
})
