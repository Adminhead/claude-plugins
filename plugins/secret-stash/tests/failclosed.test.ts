import { describe, test, expect } from 'claude-code/testing'
import { ConfigInvalid } from '../hooks/config.ts'
import { ScanOverrun } from '../hooks/detectors/scan.ts'
import { MARKER, clearFailures, deadlineOf, markerized, reportCaught, reportFailure, type Reporter } from '../hooks/failclosed.ts'
import { DeadlineExceeded, redactText } from '../hooks/redact.ts'
import { ctx } from './helpers.ts'

const reporter = () => {
  const r = { toasts: [] as string[], status: [] as (string | undefined)[], invalidated: [] as string[] }
  return { r, rep: { toast: t => void r.toasts.push(t), status: t => void r.status.push(t), invalidate: e => void r.invalidated.push(e) } satisfies Reporter }
}

describe('markerized', () => {
  test('a prompt keeps its fields but loses its context', () => {
    expect(markerized.submit({ text: 'secret', context: ['c'], attachments: [{ type: 'image' }] })).toEqual({ text: MARKER, attachments: [{ type: 'image' }] })
  })

  test('a row keeps its blocks and ids, with text and tool_result text replaced in place', () => {
    const e = {
      uuid: 'u',
      door: 'tool-result',
      message: {
        type: 'user',
        content: [
          { type: 'text', text: 'a' },
          { type: 'tool_result', tool_use_id: 't1', content: 'secret' },
          { type: 'tool_result', tool_use_id: 't2', is_error: true, content: [{ type: 'text', text: 'secret' }, { type: 'image', source: 'img' }] },
          { type: 'tool_result', tool_use_id: 't3' },
          { type: 'tool_use', id: 'x', input: {} },
        ],
      },
    }
    expect(markerized.append(e as any)).toEqual({
      ...e,
      message: {
        type: 'user',
        content: [
          { type: 'text', text: MARKER },
          { type: 'tool_result', tool_use_id: 't1', content: MARKER },
          { type: 'tool_result', tool_use_id: 't2', is_error: true, content: [{ type: 'text', text: MARKER }, { type: 'image', source: 'img' }] },
          { type: 'tool_result', tool_use_id: 't3' },
          { type: 'tool_use', id: 'x', input: {} },
        ],
      },
    })
  })

  test('the other events answer with the shapes their results take', () => {
    expect(markerized.section()).toEqual({ text: MARKER })
    expect(markerized.context()).toEqual({ blocks: [{ name: 'secret-stash', text: MARKER }] })
    expect(markerized.attachment()).toEqual({ text: MARKER })
    expect(markerized.describe()).toEqual({ description: MARKER })
    expect(markerized.deny()).toEqual({ deny: MARKER })
    expect(markerized.send()).toEqual({ isDelivered: false, reason: MARKER })
    expect(markerized.compact()).toEqual({ skip: MARKER })
  })

  test('the marker path drops documents and audio but keeps images', () => {
    const e = { message: { type: 'user', content: [{ type: 'document' }, { type: 'audio' }, { type: 'image', source: 'i' }] } }
    expect(markerized.append(e as any).message.content).toEqual([{ type: 'image', source: 'i' }])
  })
})

describe('deadlineOf', () => {
  test('is the remaining budget less a 2 s margin', () => {
    expect(deadlineOf({ remainingMs: 10_000 }, 1000)).toBe(9000)
  })

  test('falls back to 7 s where no budget is metered', () => {
    expect(deadlineOf({ remainingMs: Infinity }, 1000)).toBe(8000)
  })

  test('a budget inside the margin is already expired, so redaction takes the failure path', async () => {
    const deadline = deadlineOf({ remainingMs: 1500 })
    await expect(redactText('x', ctx([], { deadline }))).rejects.toBeInstanceOf(DeadlineExceeded)
  })
})

describe('reporting', () => {
  test('a config error sets the status and toasts once; a fixed config clears the status', () => {
    const { r, rep } = reporter()
    const err = new ConfigInvalid([{ path: '.secret-stash.json#env[0]', message: 'bad name' }])
    reportFailure(rep, err)
    reportFailure(rep, err)
    expect(r.toasts).toEqual([err.message])
    expect(r.status).toEqual([err.message, err.message])
    clearFailures(rep)
    clearFailures(rep)
    expect(r.status.at(-1)).toBeUndefined()
    expect(r.status).toHaveLength(3)
  })

  test('each other failure kind toasts once, with text that holds no error message', () => {
    const { r, rep } = reporter()
    const leaky = 'AKIAIOSFODNN7EXAMPLE'
    for (const err of [new ScanOverrun(leaky), new ScanOverrun(leaky), new DeadlineExceeded(), new Error(leaky), new Error(leaky)]) reportFailure(rep, err)
    reportCaught(rep, { kind: 'timeout' })
    reportCaught(rep, { kind: 'throw' })
    expect(r.toasts).toHaveLength(4)
    expect(r.toasts.join()).not.toContain(leaky)
    expect(r.status).toHaveLength(7)
    expect(r.status.join()).not.toContain(leaky)
  })
})
