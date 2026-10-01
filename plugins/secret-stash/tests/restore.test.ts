import { describe, test, expect } from 'claude-code/testing'
import type { TurnStepChunk } from 'claude-code'
import { makeId } from '../hooks/ids.ts'
import { StreamRestorer, restoreDeep, restoreText } from '../hooks/restore.ts'
import { KEY } from './helpers.ts'

const VALUE = 'hunter2-hunter2'
const ID = await makeId(KEY, 'PW', VALUE)
const get = (id: string) => (id === ID ? VALUE : undefined)
const UNKNOWN = '__SS_PW_0000000000000000__'

describe('restoreText', () => {
  test('restores known IDs and leaves unknown ones verbatim', () => {
    expect(restoreText(`a ${ID} b ${UNKNOWN} c ${ID}`, get)).toBe(`a ${VALUE} b ${UNKNOWN} c ${VALUE}`)
  })

  test('replacement text is literal, not a replace pattern', () => {
    expect(restoreText(ID, () => "$& $1 $'")).toBe("$& $1 $'")
  })
})

describe('restoreDeep', () => {
  const freeze = <T>(v: T): T => {
    if (v && typeof v === 'object') Object.values(v).forEach(freeze)
    return Object.freeze(v)
  }

  test('walks nested objects and arrays without mutating', () => {
    const input = freeze({ command: `run ${ID}`, args: [ID, { deep: [ID] }], n: 1, flag: true, none: null })
    const out = restoreDeep(input, get, new Set())
    expect(out).toEqual({ command: `run ${VALUE}`, args: [VALUE, { deep: [VALUE] }], n: 1, flag: true, none: null })
    expect(input.command).toBe(`run ${ID}`)
  })

  test('skips listed and reserved top-level keys', () => {
    const input = freeze({ prompt: ID, query: ID, tool: ID, tool_use_id: ID, agentId: ID, consent: ID, other: ID })
    expect(restoreDeep(input, get, new Set(['prompt', 'query']))).toEqual({
      prompt: ID, query: ID, tool: ID, tool_use_id: ID, agentId: ID, consent: ID, other: VALUE,
    })
  })

  test("'all' skips everything", () => {
    const input = freeze({ text: ID })
    expect(restoreDeep(input, get, 'all')).toEqual({ text: ID })
  })

  test('reserved keys are only skipped at the top level', () => {
    const input = freeze({ input: { tool: ID } })
    expect(restoreDeep(input, get, new Set())).toEqual({ input: { tool: VALUE } })
  })
})

describe('StreamRestorer', () => {
  const text = (t: string, index = 0): TurnStepChunk => ({ kind: 'text', index, text: t })
  const joined = (cs: TurnStepChunk[], index = 0) =>
    cs.flatMap(c => (c.kind === 'text' && c.index === index ? [c.text] : [])).join('')
  const stop: TurnStepChunk = { kind: 'stop', stopReason: 'end_turn', usage: null }

  test('an ID split at every offset across two chunks restores', () => {
    const full = `before ${ID} after`
    for (let cut = 0; cut <= full.length; cut++) {
      const r = new StreamRestorer(get)
      const out = [...r.push(text(full.slice(0, cut))), ...r.push(text(full.slice(cut))), ...r.push(stop)]
      expect(joined(out)).toBe(`before ${VALUE} after`)
    }
  })

  test('an ID split across many one-character chunks restores', () => {
    const r = new StreamRestorer(get)
    const out = [...`x ${ID} ${UNKNOWN}!`].flatMap(ch => r.push(text(ch)))
    out.push(...r.flush())
    expect(joined(out)).toBe(`x ${VALUE} ${UNKNOWN}!`)
  })

  test('text without a possible prefix passes through unbuffered, keeping ref', () => {
    const r = new StreamRestorer(get)
    const c: TurnStepChunk = { kind: 'text', index: 0, text: 'plain words', ref: 9 }
    expect(r.push(c)).toEqual([c])
  })

  test('only a possible-prefix tail is held back', () => {
    const r = new StreamRestorer(get)
    expect(r.push(text('abc __SS_PW_01'))).toEqual([text('abc ')])
    expect(r.push(text('x'))).toEqual([text('__SS_PW_01x')])
  })

  test('a spread text chunk keeps ref when restored', () => {
    const r = new StreamRestorer(get)
    expect(r.push({ kind: 'text', index: 0, text: `a ${ID} b`, ref: 4 })).toEqual([
      { kind: 'text', index: 0, text: `a ${VALUE} b`, ref: 4 },
    ])
  })

  test('the tail flushes before a chunk with a new index', () => {
    const r = new StreamRestorer(get)
    expect(r.push(text('a __SS_PW', 0))).toEqual([text('a ', 0)])
    expect(r.push(text('next', 1))).toEqual([text('__SS_PW', 0), text('next', 1)])
  })

  test('the tail flushes before a non-text chunk', () => {
    const r = new StreamRestorer(get)
    r.push(text('a __SS'))
    const tool: TurnStepChunk = { kind: 'tool', index: 1, id: 't', name: 'Bash' }
    expect(r.push(tool)).toEqual([text('__SS'), tool])
    expect(r.push(stop)).toEqual([stop])
  })

  test('a stop chunk flushes the tail', () => {
    const r = new StreamRestorer(get)
    r.push(text('end __'))
    expect(r.push(stop)).toEqual([text('__'), stop])
  })

  test('without a stop chunk the tail stays held until flush()', () => {
    const r = new StreamRestorer(get)
    expect(joined(r.push(text('end __SS_PW')))).toBe('end ')
    expect(r.flush()).toEqual([text('__SS_PW')])
    expect(r.flush()).toEqual([])
  })

  test('a complete ID at the very end restores without waiting', () => {
    const r = new StreamRestorer(get)
    expect(r.push(text(`k=${ID}`))).toEqual([text(`k=${VALUE}`)])
  })

  test('an unknown complete ID passes verbatim without being held', () => {
    const r = new StreamRestorer(get)
    expect(r.push(text(`k=${UNKNOWN}`))).toEqual([text(`k=${UNKNOWN}`)])
  })
})
