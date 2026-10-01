import { describe, test, expect } from 'claude-code/testing'
import { MARKER } from '../hooks/failclosed.ts'
import { AWS, AWS2, CONFIG, appended, boot, model, modelBridge, row, toolResult, vaultReader, type Env } from './outboundkit.ts'

describe('fails closed', () => {
  test('a detector overrun sends the marker, rewriting a tool_result in place', async ($, on) => {
    const env = boot(on, { config: JSON.stringify({ openredaction: { customPatterns: [{ type: 'PAT', regex: 'secretvalue' }] } }) })
    const blocks = [{ type: 'text', text: 'hello' }, toolResult('secretvalue '.repeat(10_001)), { ...toolResult([{ type: 'text', text: 'x' }, { type: 'image', source: 'img' }]), tool_use_id: 't2', is_error: true }]
    await $.session.append(row(blocks) as any)
    expect(appended(env)).toEqual([
      { type: 'text', text: MARKER },
      toolResult(MARKER),
      { type: 'tool_result', tool_use_id: 't2', is_error: true, content: [{ type: 'text', text: MARKER }, { type: 'image', source: 'img' }] },
    ])
    expect(env.toasts).toEqual([expect.stringContaining('overran')])
    expect(env.toasts.join()).not.toContain('secretvalue')
  })

  test('a thrown error in the vault key load sends the marker on every event', { plugins: [modelBridge] }, async ($, on) => {
    const env = boot(on, { store: { hmacKey: 'not-hex' } })
    const secret = `k ${AWS}`
    expect(await $.prompt.submit({ text: secret, context: [secret] } as any)).toEqual({ text: MARKER })
    expect(await $.prompt.submit({ text: secret, context: [secret] } as any)).toEqual({ text: MARKER })
    expect(await $.agent.spawn({ prompt: secret, description: 'd' } as any)).toEqual({ deny: MARKER })
    expect(await $.session.send({ to: 'x', text: secret } as any)).toEqual({ isDelivered: false, reason: MARKER })
    expect(await $.session.compact({ trigger: 'manual', instructions: secret, messages: [{ role: 'user', text: 'hi', toolUses: [] }] } as any)).toEqual({ skip: MARKER })
    for (const [op, args] of [['complete', { model: 'm', prompt: secret }], ['fork', { prompt: secret }], ['classify', { text: secret }]] as const) {
      expect(JSON.stringify(await model($, op, args))).toContain(MARKER)
    }
    expect(JSON.stringify(env.seen)).not.toContain(AWS)
    expect(env.toasts).toHaveLength(1)
    expect(env.toasts[0]).not.toContain(AWS)
  })
})

describe('invalid config', () => {
  test('drops the prompt with the config error, markers other content and shows the status until fixed', async ($, on) => {
    const env = boot(on, { config: '{"bogus": 1}' })
    const dropped = (await $.prompt.submit({ text: `k ${AWS}` } as any)) as any
    expect(dropped.drop).toContain('unknown key #1')
    expect(dropped.drop).not.toContain('bogus')
    expect(dropped.drop).not.toContain(AWS)
    expect(env.seen['prompt.submit']).toBeUndefined()
    expect(env.status.at(-1)).toContain('unknown key #1')
    expect(env.status.at(-1)).not.toContain('bogus')
    expect(await $.prompt.section({ name: 'n', text: `k ${AWS}` } as any)).toEqual({ text: MARKER })
    expect(await $.session.send({ to: 'x', text: AWS } as any)).toEqual({ isDelivered: false, reason: MARKER })
    expect(env.seen['session.send']).toBeUndefined()

    env.files.set(CONFIG, '{}')
    expect(await $.prompt.submit({ text: 'fine' } as any)).toEqual({ text: 'fine' })
    expect(env.status.at(-1)).toBeUndefined()
  })
})

describe('failure recovery', () => {
  test('re-asks cached events that answered a marker once any redaction succeeds', async ($, on) => {
    const env = boot(on, { broken: ['prompt.section', 'tool.describe'] })
    expect(await $.prompt.section({ name: 'n', text: AWS } as any)).toEqual({ text: MARKER })
    expect(await $.tool.describe({ tool: 'T', description: AWS, provider: {} } as any)).toEqual({ description: MARKER })
    expect(env.invalidated).toEqual([])
    env.broken.clear()
    await $.session.send({ to: 'x', text: 'fine' } as any)
    expect(env.invalidated.sort()).toEqual(['prompt.section', 'tool.describe'])
    await $.session.send({ to: 'x', text: 'fine' } as any)
    expect(env.invalidated).toHaveLength(2)
  })

  test('also after an invalid config is fixed', async ($, on) => {
    const env = boot(on, { config: '{"bogus": 1}' })
    await $.prompt.attachment({ type: 'file', text: 'x', origin: {} } as any)
    env.files.set(CONFIG, '{}')
    await $.prompt.submit({ text: 'ok' } as any)
    expect(env.invalidated).toEqual(['prompt.attachment'])
  })

  test('the status line holds the latest failure, with no values, until a success', async ($, on) => {
    const env = boot(on, { config: JSON.stringify({ openredaction: { customPatterns: [{ type: 'PAT', regex: 'secretvalue' }] } }) })
    const flood = [{ type: 'text', text: 'secretvalue '.repeat(10_001) }]
    await $.session.append(row(flood) as any)
    await $.session.append(row(flood, { uuid: 'u2' }) as any)
    expect(env.toasts).toHaveLength(1)
    expect(env.status.at(-1)).toContain('overran')
    expect(env.status.join()).not.toContain('secretvalue')
    env.files.set(CONFIG, '{}')
    await $.session.append(row([{ type: 'text', text: 'ok' }], { uuid: 'u3' }) as any)
    expect(env.status.at(-1)).toBeUndefined()
  })
})

describe('redact-then-next hooks under a mid-redaction failure', () => {
  const overrun = JSON.stringify({ openredaction: { customPatterns: [{ type: 'PAT', regex: 'secretvalue' }] } })
  const flood = 'secretvalue '.repeat(10_001)

  test('prompt.submit and agent.spawn never let the raw value beneath', async ($, on) => {
    const env = boot(on, { config: overrun })
    expect(await $.prompt.submit({ text: flood, context: [flood] } as any)).toEqual({ text: MARKER })
    expect(await $.agent.spawn({ prompt: flood, description: 'd' } as any)).toEqual({ deny: MARKER })
    expect(JSON.stringify(env.seen)).not.toContain('secretvalue')
  })

  test('a failing toast or status call does not stop the marker', async ($, on) => {
    const env = boot(on, { config: overrun, uiThrows: true })
    expect(await $.prompt.section({ name: 'n', text: flood } as any)).toEqual({ text: MARKER })
    expect(await $.agent.spawn({ prompt: flood, description: 'd' } as any)).toEqual({ deny: MARKER })
    expect(JSON.stringify(env.seen['agent.spawn'] ?? [])).not.toContain('secretvalue')
  })

  test('replay after beneath fails passes one redacted call, for session.append and prompt.submit', async ($, on) => {
    const env = boot(on, { broken: ['prompt.submit', 'session.append'] })
    await expect($.prompt.submit({ text: `t ${AWS}` } as any)).rejects.toThrow()
    await expect($.session.append(row([{ type: 'text', text: `t ${AWS}` }]) as any)).rejects.toThrow()
    expect(env.seen['prompt.submit']).toEqual([{ text: expect.stringMatching(/^t __SS_AWS/) }])
    expect(appended(env)).toEqual([{ type: 'text', text: expect.stringMatching(/^t __SS_AWS/) }])
    expect(env.seen['session.append']).toHaveLength(1)
  })
})
