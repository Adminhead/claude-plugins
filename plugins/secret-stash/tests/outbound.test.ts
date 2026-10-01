import { describe, test, expect } from 'claude-code/testing'
import { DROPPED, MARKER } from '../hooks/failclosed.ts'
import { AWS, AWS2, CONFIG, appended, boot, model, modelBridge, row, toolResult, vaultReader, type Env } from './outboundkit.ts'

describe('session.append', () => {
  test('stores a secret in a tool result redacted, and the vault keeps the value', { plugins: [vaultReader] }, async ($, on) => {
    const env = boot(on)
    await $.session.append(row([toolResult(`out: ${AWS}\n`)]) as any)
    const out = appended(env)[0]
    expect(out.tool_use_id).toBe('t1')
    expect(out.content).toMatch(/^out: __SS_AWS_ACCESS_KEY_[0-9a-f]{16}__\n$/)
    const vault = JSON.parse((await $.skill.prompt({ skill: 'x', text: '' })).text)
    expect(Object.values(vault.entries)).toEqual([{ value: AWS, category: 'AWS_ACCESS_KEY' }])
  })

  test('redacts a subagent row, nested tool_result blocks and text blocks', async ($, on) => {
    const env = boot(on)
    await $.session.append(row([{ type: 'text', text: `a ${AWS}` }, toolResult([{ type: 'text', text: `b ${AWS}` }, { type: 'image', source: 'img' }])], { agentId: 'sub-1' }) as any)
    const [text, result] = appended(env)
    expect(text.text).toMatch(/^a __SS_AWS/)
    expect(result.content[0].text).toMatch(/^b __SS_AWS/)
    expect(result.content[1]).toEqual({ type: 'image', source: 'img' })
    expect(env.seen['session.append'][0].agentId).toBe('sub-1')
  })

  test('the same secret in two rows gets the same ID, and differs from another secret', async ($, on) => {
    const env = boot(on)
    await $.session.append(row([toolResult(`one ${AWS}`)]) as any)
    await $.session.append(row([{ type: 'text', text: `two ${AWS} ${AWS2}` }], { uuid: 'u2' }) as any)
    const first = appended(env, 0)[0].content.match(/__SS_\w+__/)[0]
    const [a, b] = appended(env, 1)[0].text.match(/__SS_\w+__/g)
    expect(a).toBe(first)
    expect(b).not.toBe(first)
  })

  test('still redacts, with the same ID, after the session id changes', async ($, on) => {
    const env = boot(on)
    await $.session.append(row([{ type: 'text', text: `k ${AWS}` }]) as any)
    env.session.id = 's2'
    await $.session.append(row([{ type: 'text', text: `k ${AWS}` }], { uuid: 'u2' }) as any)
    expect(appended(env, 1)[0].text).toBe(appended(env, 0)[0].text)
    expect(appended(env, 1)[0].text).toMatch(/^k __SS_AWS_ACCESS_KEY_/)
  })

  test('is deterministic: the same input gives the same output', async ($, on) => {
    const env = boot(on)
    const input = row([{ type: 'text', text: `x ${AWS2} y ${AWS}` }, toolResult(`z ${AWS}`)])
    await $.session.append(structuredClone(input) as any)
    await $.session.append(structuredClone(input) as any)
    expect(appended(env, 1)).toEqual(appended(env, 0))
  })
})

describe('other events', () => {
  test('prompt.submit redacts text and context, and leaves a prompt without context alone', async ($, on) => {
    const env = boot(on)
    await $.prompt.submit({ text: `a ${AWS}`, context: [`b ${AWS}`, 'plain'] } as any)
    const [e] = env.seen['prompt.submit']
    expect(e.text).toMatch(/^a __SS_AWS/)
    expect(e.context[0]).toMatch(/^b __SS_AWS/)
    expect(e.context[1]).toBe('plain')
    await $.prompt.submit({ text: 'no secrets' } as any)
    expect('context' in env.seen['prompt.submit'][1] && env.seen['prompt.submit'][1].context).toBeFalsy()
  })

  test('prompt.section, prompt.attachment and tool.describe redact what comes back up', async ($, on) => {
    boot(on)
    expect(((await $.prompt.section({ name: 'n', text: `s ${AWS}` } as any)) as any).text).toMatch(/^s __SS_AWS/)
    expect(await $.prompt.section({ name: 'n', text: null } as any)).toEqual({ text: null })
    expect(((await $.prompt.attachment({ type: 'file', text: `f ${AWS}`, origin: {} } as any)) as any).text).toMatch(/^f __SS_AWS/)
    expect(((await $.tool.describe({ tool: 'T', description: `d ${AWS}`, provider: {} } as any)) as any).description).toMatch(/^d __SS_AWS/)
  })

  test('prompt.context rewrites only the blocks that hold a secret and drops the files behind them', async ($, on) => {
    boot(on)
    const files = [{ path: '/x/CLAUDE.md', kind: 'project', content: AWS }]
    const r = (await $.prompt.context({ blocks: [{ name: 'claudeMd', text: `m ${AWS}` }, { name: 'currentDate', text: 'today' }], instructionFiles: files } as any)) as any
    expect(r.blocks[0].text).toMatch(/^m __SS_AWS/)
    expect(r.blocks[1]).toEqual({ name: 'currentDate', text: 'today' })
    expect(r.instructionFiles).toBeUndefined()
    const clean = (await $.prompt.context({ blocks: [{ name: 'currentDate', text: 'today' }], instructionFiles: files } as any)) as any
    expect(clean.instructionFiles).toEqual(files)
  })

  test('agent.spawn, session.send and session.compact redact their text fields', async ($, on) => {
    const env = boot(on)
    await $.agent.spawn({ prompt: `p ${AWS}`, description: `d ${AWS}`, subagentType: 'x' } as any)
    await $.session.send({ to: 'x', text: `t ${AWS}` } as any)
    await $.session.compact({ trigger: 'manual', instructions: `i ${AWS}`, messages: [{ role: 'user', text: 'hi', toolUses: [] }] } as any)
    await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'hi', toolUses: [] }] } as any)
    const [spawn] = env.seen['agent.spawn']
    expect([spawn.prompt, spawn.description, env.seen['session.send'][0].text, env.seen['session.compact'][0].instructions].every(t => /^\w __SS_AWS/.test(t))).toBe(true)
    expect(env.seen['session.compact'][1].instructions).toBeUndefined()
  })

  test('model.complete, model.fork and model.classify redact prompt, system and text', { plugins: [modelBridge] }, async ($, on) => {
    const env = boot(on)
    await model($, 'complete', { model: 'm', prompt: `p ${AWS}`, system: `s ${AWS}` })
    await model($, 'fork', { prompt: `f ${AWS}` })
    await model($, 'classify', { text: `c ${AWS}` })
    const { 'model.complete': [c], 'model.fork': [f], 'model.classify': [k] } = env.seen
    expect([c.prompt, c.system, f.prompt, k.text].every(t => /^\w __SS_AWS/.test(t))).toBe(true)
  })

  test('hooks that rewrite on the way up answer with the marker when what is beneath fails', async ($, on) => {
    const env = boot(on, { broken: ['prompt.section', 'prompt.context', 'prompt.attachment', 'tool.describe'] })
    expect(await $.prompt.section({ name: 'n', text: AWS } as any)).toEqual({ text: MARKER })
    expect(await $.prompt.context({ blocks: [{ name: 'claudeMd', text: AWS }] } as any)).toEqual({ blocks: [{ name: 'secret-stash', text: MARKER }] })
    expect(await $.prompt.attachment({ type: 'file', text: AWS, origin: {} } as any)).toEqual({ text: MARKER })
    expect(await $.tool.describe({ tool: 'T', description: AWS, provider: {} } as any)).toEqual({ description: MARKER })
    expect(env.toasts.join()).not.toContain(AWS)
  })
})

describe('hooks that rewrite on the way down', () => {
  test('never pass the raw event on when what is beneath fails', async ($, on) => {
    const env = boot(on, { broken: ['session.send'] })
    await expect($.session.send({ to: 'x', text: `t ${AWS}` } as any)).rejects.toThrow('no implementation for session.send')
    // One call, redacted: the replay after the failure did not run beneath again or pass the raw text.
    expect(env.seen['session.send']).toEqual([{ to: 'x', text: expect.stringMatching(/^t __SS_AWS/) }])
  })
})

describe('documents', () => {
  const doc = (data: string) => ({ type: 'document', source: { type: 'text', media_type: 'text/plain', data } })

  test('a text document holding a secret is dropped with a toast; clean documents and images stay', async ($, on) => {
    const env = boot(on)
    const img = { type: 'image', source: 'img' }
    await $.session.append(row([doc(`k ${AWS}`), doc('clean'), img, toolResult([doc(AWS), img])]) as any)
    expect(appended(env)).toEqual([doc('clean'), img, toolResult([img])])
    expect(env.toasts).toEqual([expect.stringContaining('document')])
    expect(env.toasts.join()).not.toContain(AWS)
  })

  test('the failure path drops every document and keeps images', async ($, on) => {
    const env = boot(on, { store: { hmacKey: 'not-hex' } })
    const img = { type: 'image', source: 'img' }
    await $.session.append(row([doc('clean'), img, toolResult([doc('x'), img])]) as any)
    expect(appended(env)).toEqual([img, toolResult([img])])
  })

  test('a row or tool_result left empty gets a text block, whichever path dropped the documents', async ($, on) => {
    const env = boot(on)
    await $.session.append(row([doc(AWS)]) as any)
    await $.session.append(row([toolResult([doc(AWS)])], { uuid: 'u2' }) as any)
    expect(appended(env, 0)).toEqual([{ type: 'text', text: DROPPED }])
    expect(appended(env, 1)).toEqual([toolResult([{ type: 'text', text: DROPPED }])])
  })

  test('the failure path leaves a marker text block where only documents were', async ($, on) => {
    const env = boot(on, { store: { hmacKey: 'not-hex' } })
    await $.session.append(row([doc('x')]) as any)
    expect(appended(env)).toEqual([{ type: 'text', text: MARKER }])
  })
})
