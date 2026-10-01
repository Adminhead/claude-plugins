import { describe, test, expect } from 'claude-code/testing'
import type { On, TurnStepChunk, TurnStepResult } from 'claude-code'

const SESSION = 'sess-inbound'
const VALUE = 'hunter2-hunter2'
const ID = '__SS_PW_0123456789abcdef__'
const SHORT = 'abc12'
const SHORT_ID = '__SS_PW_fedcba9876543210__'
const UNKNOWN = '__SS_PW_0000000000000000__'
const ENTRIES = { [ID]: { value: VALUE, category: 'PW' }, [SHORT_ID]: { value: SHORT, category: 'PW' } }

// Answers the engine calls the hooks make, each as `{ value }`: a vault already loaded for this session, and a
// project file that is absent, or holds `config` when given.
function engine(on: On, config?: string) {
  const answer = (event: string, value: unknown) => (on as any)(event, async () => ({ value }))
  answer('session.id', SESSION)
  answer('session.root', '/repo')
  answer('fs.exists', config !== undefined)
  answer('fs.read', config)
  answer('state.get', { value: { loadedFor: SESSION, entries: ENTRIES }, version: 1 })
}

// The tool beneath: records the input it ran with and answers with an ID in its output.
function tool(on: On) {
  const seen: any[] = []
  ;(on as any)('tool.call', async (_$: unknown, e: any) => {
    seen.push(e)
    return { result: { stdout: `out ${ID}`, stderr: '', interrupted: false } }
  })
  return seen
}

const strip = ({ tool: _t, tool_use_id: _u, agentId: _a, consent: _c, ...args }: any) => args

describe('tool.call', () => {
  test('a Bash command runs with the real value, and the result is left as is', async ($, on) => {
    engine(on)
    const seen = tool(on)
    const r: any = await $.tool.call({ tool: 'Bash', command: `echo ${ID}` } as any)
    expect(seen[0].command).toBe(`echo ${VALUE}`)
    expect(r.result.stdout).toBe(`out ${ID}`)
  })

  test('fields that feed a model or peer keep their IDs', async ($, on) => {
    engine(on)
    const seen = tool(on)
    await $.tool.call({ tool: 'WebFetch', url: `https://x.test/?k=${ID}`, prompt: `about ${ID}` } as any)
    await $.tool.call({ tool: 'Agent', prompt: `use ${ID}`, description: `d ${ID}`, name: `n${ID}` } as any)
    await $.tool.call({ tool: 'SendMessage', to: `p${ID}`, message: `m ${ID}` } as any)
    expect(strip(seen[0])).toEqual({ url: `https://x.test/?k=${VALUE}`, prompt: `about ${ID}` })
    expect(strip(seen[1])).toEqual({ prompt: `use ${ID}`, description: `d ${ID}`, name: `n${VALUE}` })
    expect(strip(seen[2])).toEqual({ to: `p${ID}`, message: `m ${ID}` })
  })

  test('an unknown ID stays verbatim', async ($, on) => {
    engine(on)
    const seen = tool(on)
    await $.tool.call({ tool: 'Bash', command: `echo ${UNKNOWN} ${ID}` } as any)
    expect(seen[0].command).toBe(`echo ${UNKNOWN} ${VALUE}`)
  })

  test('nested arguments are restored', async ($, on) => {
    engine(on)
    const seen = tool(on)
    await $.tool.call({ tool: 'Workflow', args: { list: [ID, { deep: `x${ID}` }], n: 3 } } as any)
    expect(seen[0].args).toEqual({ list: [VALUE, { deep: `x${VALUE}` }], n: 3 })
  })

  test('an ID of a short value stays verbatim, since its output could not be re-redacted', async ($, on) => {
    engine(on)
    const seen = tool(on)
    await $.tool.call({ tool: 'Bash', command: `echo ${SHORT_ID} ${ID}` } as any)
    expect(seen[0].command).toBe(`echo ${SHORT_ID} ${VALUE}`)
  })

  test('Artifact and claude.ai connector tools keep IDs in every field', async ($, on) => {
    engine(on)
    const seen = tool(on)
    await $.tool.call({ tool: 'Artifact', file_path: `p${ID}` } as any)
    await $.tool.call({ tool: 'mcp__claude_ai_Docs__update', payload: { text: ID } } as any)
    await $.tool.call({ tool: 'mcp__other__update', payload: { text: ID } } as any)
    expect(strip(seen[0])).toEqual({ file_path: `p${ID}` })
    expect(strip(seen[1])).toEqual({ payload: { text: ID } })
    expect(strip(seen[2])).toEqual({ payload: { text: VALUE } })
  })

  test('skipRestore entries add to the defaults: exact, prefix, and with fields', async ($, on) => {
    engine(on, JSON.stringify({
      skipRestore: [
        { tool: 'Bash', fields: ['description'] },
        { tool: 'Ba*', fields: ['timeout'] },
        { tool: 'mcp__notes__*' },
        { tool: 'WebFetch', fields: ['url'] },
        { tool: 'mcp__claude_ai_Docs__*', fields: ['title'] },
      ],
    }))
    const seen = tool(on)
    await $.tool.call({ tool: 'Bash', command: `echo ${ID}`, description: `d ${ID}`, timeout: `${ID}` } as any)
    await $.tool.call({ tool: 'mcp__notes__save', body: ID } as any)
    await $.tool.call({ tool: 'WebFetch', url: `u${ID}`, prompt: `p${ID}` } as any)
    await $.tool.call({ tool: 'mcp__claude_ai_Docs__update', title: ID, body: ID } as any)
    expect(strip(seen[0])).toEqual({ command: `echo ${VALUE}`, description: `d ${ID}`, timeout: `${ID}` })
    expect(strip(seen[1])).toEqual({ body: ID })
    expect(strip(seen[2])).toEqual({ url: `u${ID}`, prompt: `p${ID}` })
    // The default `mcp__claude_ai_*` still applies beside the narrower user prefix.
    expect(strip(seen[3])).toEqual({ title: ID, body: ID })
  })

  test('a failure before next denies the call', async ($, on) => {
    engine(on, '{not json')
    const seen = tool(on)
    const r: any = await $.tool.call({ tool: 'Bash', command: `echo ${ID}` } as any)
    expect(r.deny).toBe('secret-stash: restore failed')
    expect(seen).toEqual([])
  })

  // The kit skips a throwing test hook, so beneath rejects; the replay passes that rejection up
  // instead of denying, and nothing beneath runs again.
  test('a failure after next replays it, so the tool runs once', async ($, on) => {
    engine(on)
    let runs = 0
    ;(on as any)('tool.call', async () => {
      runs++
      throw new Error('tool broke')
    })
    const r = await $.tool.call({ tool: 'Bash', command: `echo ${ID}` } as any).then(v => ({ v }), err => ({ err: String(err) }))
    expect(r).toEqual({ err: 'HooksError: no implementation for tool.call' })
    expect(runs).toBe(1)
  })
})

const STEP = { turnId: 't1', index: 0, model: 'm', messageCount: 1 }
const RESULT: TurnStepResult = { turnId: 't1', index: 0, answer: `a ${ID}`, toolUses: [], stopReason: 'end_turn', usage: null }
const STOP: TurnStepChunk = { kind: 'stop', stopReason: 'end_turn', usage: null }
const text = (t: string, index = 0, ref?: number): TurnStepChunk => ({ kind: 'text', index, text: t, ...(ref === undefined ? {} : { ref }) })

// The model beneath: streams `chunks`, then returns RESULT.
function model(on: On, chunks: TurnStepChunk[]) {
  ;(on as any)('turn.step', async function* () {
    for (const c of chunks) yield c
    return RESULT
  })
}

// Reads the result off the stream's last step: the kit's `stream.result` settles undefined.
async function drain($: any): Promise<{ out: TurnStepChunk[]; result: TurnStepResult }> {
  const stream = $.turn.step(STEP)
  const out: TurnStepChunk[] = []
  let step
  while (!(step = await stream.next()).done) out.push(step.value)
  return { out, result: step.value }
}

const textOf = (out: TurnStepChunk[], index = 0) =>
  out.filter(c => c.kind === 'text' && c.index === index).map(c => (c as { text: string }).text).join('')

describe('turn.step', () => {
  test('an ID split across chunks is restored, and the result is returned as is', async ($, on) => {
    engine(on)
    model(on, [text('key: __SS_PW_0123'), text('456789ab'), text('cdef__ done'), STOP])
    const { out, result } = await drain($)
    expect(textOf(out)).toBe(`key: ${VALUE} done`)
    expect(out.at(-1)).toEqual(STOP)
    expect(result).toEqual(RESULT)
  })

  test('an ID cut by a block-index change is not joined across blocks', async ($, on) => {
    engine(on)
    model(on, [text('a __SS_PW_01234567', 0), text('89abcdef__ b', 1), STOP])
    const { out } = await drain($)
    expect(textOf(out, 0)).toBe('a __SS_PW_01234567')
    expect(textOf(out, 1)).toBe('89abcdef__ b')
  })

  test('a restored chunk keeps its ref', async ($, on) => {
    engine(on)
    model(on, [text(`x ${ID} y`, 0, 41), STOP])
    const { out } = await drain($)
    expect(out[0]).toEqual({ kind: 'text', index: 0, text: `x ${VALUE} y`, ref: 41 })
  })

  test('a stream without a stop chunk flushes its held tail', async ($, on) => {
    engine(on)
    model(on, [text('ends with __SS_PW_01')])
    const { out } = await drain($)
    expect(textOf(out)).toBe('ends with __SS_PW_01')
  })

  test('an ID of a short value is not restored on the stream', async ($, on) => {
    engine(on)
    model(on, [text(`short ${SHORT_ID} long ${ID}`), STOP])
    const { out } = await drain($)
    expect(textOf(out)).toBe(`short ${SHORT_ID} long ${VALUE}`)
  })

  test('a stream closed early settles without throwing, dropping the held tail', async ($, on) => {
    engine(on)
    model(on, [text('first '), text('held __SS_PW_01'), text('23456789abcdef__'), STOP])
    const stream: any = $.turn.step(STEP)
    expect((await stream.next()).value).toEqual(text('first '))
    expect(await stream.return(undefined)).toEqual({ done: true, value: undefined })
  })

  // A model failing mid-stream makes the hook rethrow after next was called. Replaying next
  // would run the model again and repeat what was already shown.
  test('a failure after chunks were yielded does not repeat them', async ($, on) => {
    engine(on)
    let runs = 0
    ;(on as any)('turn.step', async function* () {
      runs++
      yield text(`one ${ID} `)
      yield text('two ')
      throw new Error('model broke')
    })
    const stream: any = $.turn.step(STEP)
    const out: TurnStepChunk[] = []
    const err = await (async () => {
      let step
      while (!(step = await stream.next()).done) out.push(step.value)
    })().then(() => undefined, e => String(e))
    expect(textOf(out)).toBe(`one ${VALUE} two `)
    expect(runs).toBe(1)
    expect(err).toBe('HooksError: no implementation for turn.step')
  })

  test('a failure falls back to the raw stream', async ($, on) => {
    engine(on, '{not json')
    model(on, [text(`raw ${ID}`), STOP])
    const { out, result } = await drain($)
    expect(textOf(out)).toBe(`raw ${ID}`)
    expect(result).toEqual(RESULT)
  })
})
