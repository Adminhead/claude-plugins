import { describe, expect, test } from 'bun:test'
import { MAX_PROMPT_CHARS, REMINDER, boundItemReminder, isOrchestratorSpawn, parsePlanRef, reminderLine, withReminder } from '../hooks/plan/spawn'
import type { Item, Plan } from '../hooks/plan/types'

const PLAN = 'p-0mw97li3s-25c993'
const REF = `plan-ref: ${PLAN}/s2`

describe('parsePlanRef', () => {
  test('reads the reference from a line of its own', () => {
    expect(parsePlanRef(REF)).toEqual({ plan: PLAN, item: 's2' })
    expect(parsePlanRef(`Do the work.\n${REF}\nStop when done.`)).toEqual({ plan: PLAN, item: 's2' })
    expect(parsePlanRef(`${REF}  \r\nmore`)).toEqual({ plan: PLAN, item: 's2' })
    expect(parsePlanRef(`plan-ref:${PLAN}/s12`)).toEqual({ plan: PLAN, item: 's12' })
  })

  test('the first reference wins', () => {
    expect(parsePlanRef(`plan-ref: ${PLAN}/s1\nplan-ref: ${PLAN}/s2`)).toEqual({ plan: PLAN, item: 's1' })
  })

  test('anything but the whole line is not a reference', () => {
    for (const prompt of [
      '',
      'no reference here',
      `see ${REF}`, // not at the start of the line
      `${REF} please`, // trailing text
      ` ${REF}`, // leading space
      `- ${REF}`,
      `PLAN-REF: ${PLAN}/s2`,
      `plan-ref: ${PLAN}/s123`, // three digits
      `plan-ref: ${PLAN}/s`,
      `plan-ref: ${PLAN}/x2`,
      `plan-ref: p-short-abc/s2`,
      `plan-ref: ${PLAN.toUpperCase()}/s2`,
      `plan-ref: ${PLAN}/s2/extra`,
      `plan-ref: ${PLAN} s2`,
    ]) {
      expect([prompt, parsePlanRef(prompt)]).toEqual([prompt, null])
    }
  })

  test('only the first 8192 characters are searched', () => {
    const pad = 'x'.repeat(MAX_PROMPT_CHARS - 1)
    expect(parsePlanRef(`${pad}\n${REF}`)).toBeNull() // the line starts at 8192
    const within = 'x'.repeat(MAX_PROMPT_CHARS - REF.length - 2)
    expect(parsePlanRef(`${within}\n${REF}`)).toEqual({ plan: PLAN, item: 's2' })
    expect(parsePlanRef(`${'y\n'.repeat(5000)}${REF}`)).toBeNull()
  })

  test('a reference the cut ends in the middle of is dropped, never read as a shorter item', () => {
    const lead = 'x'.repeat(MAX_PROMPT_CHARS - `plan-ref: ${PLAN}/s1`.length - 1)
    const prompt = `${lead}\nplan-ref: ${PLAN}/s12\nrest`
    expect(prompt.slice(0, MAX_PROMPT_CHARS).endsWith('/s1')).toBe(true)
    expect(parsePlanRef(prompt)).toBeNull()
    // The same line, when the cut falls exactly at its end, is whole and counts.
    const exact = `${lead}\nplan-ref: ${PLAN}/s1`
    expect(exact.length).toBe(MAX_PROMPT_CHARS)
    expect(parsePlanRef(exact)).toEqual({ plan: PLAN, item: 's1' })
    expect(parsePlanRef(`${exact}\nmore`)).toEqual({ plan: PLAN, item: 's1' })
  })

  test('a very long prompt with no line breaks is handled', () => {
    expect(parsePlanRef('a'.repeat(1_000_000))).toBeNull()
    expect(parsePlanRef(undefined as unknown as string)).toBeNull()
  })
})

describe('reminder', () => {
  test('is one fixed line and says nothing of the item', () => {
    expect(REMINDER.includes('\n')).toBe(false)
    expect(REMINDER).toContain('plan get')
  })

  test('is appended once, on a line of its own, and never twice', () => {
    expect(reminderLine('task')).toBe(REMINDER)
    expect(withReminder('task')).toBe(`task\n${REMINDER}`)
    expect(withReminder('task\n')).toBe(`task\n${REMINDER}`)
    expect(withReminder('')).toBe(REMINDER)
    const once = withReminder(`${REF}\ntask`)
    expect(reminderLine(once)).toBeNull()
    expect(withReminder(once)).toBe(once)
    expect(reminderLine(`brief\n${REMINDER}`)).toBeNull()
  })
})

describe('isOrchestratorSpawn', () => {
  const fresh = { prompt: REF, subagentType: 'coder', background: false, fork: false }

  test('a fresh spawn from the main loop counts, a plugin-prefixed type included', () => {
    expect(isOrchestratorSpawn(fresh)).toBe(true)
    expect(isOrchestratorSpawn({ ...fresh, subagentType: 'pp:coder' })).toBe(true)
    expect(isOrchestratorSpawn({ ...fresh, background: true, isTeammate: true })).toBe(true)
  })

  test('a spawn from a subagent, a resume and a workflow agent do not', () => {
    expect(isOrchestratorSpawn({ ...fresh, parentAgentId: 'a1' })).toBe(false)
    expect(isOrchestratorSpawn({ ...fresh, resume: { agentId: 'a1' } })).toBe(false)
    expect(isOrchestratorSpawn({ ...fresh, workflow: { runId: 'wf_1', agentIndex: 1 } })).toBe(false)
  })

  test('malformed input does not', () => {
    for (const e of [null, undefined, 'x', {}, { ...fresh, prompt: 3 }, { ...fresh, subagentType: '' }, { ...fresh, subagentType: undefined }, { ...fresh, subagentType: 'x'.repeat(201) }]) {
      expect(isOrchestratorSpawn(e)).toBe(false)
    }
  })
})

function item(id: string, over: Partial<Item> = {}): Item {
  return {
    id,
    title: `title ${id}`,
    instructions: 'do it',
    acceptance: [],
    files: [],
    deps: [],
    agent: 'coder',
    model: 'sonnet',
    checks: [],
    status: 'in_progress',
    attempts: 1,
    extraAttempts: 0,
    gen: 1,
    boundAgent: null,
    reservedFor: null,
    claimed: null,
    verification: null,
    note: null,
    failure: null,
    ...over,
  }
}
const bound = (agentId: string, at = '2026-11-10T00:00:00.000Z') => ({ boundAgent: { agentId, session: 's', at } })
const plan = (id: string, items: Item[], status: Plan['status'] = 'active'): Plan =>
  ({ v: 1, id, title: 'T', rev: 3, created: '2026-11-10T00:00:00.000Z', project: '/r', status, creator: { kind: 'main' }, items }) as unknown as Plan

describe('boundItemReminder', () => {
  test('names the open item bound to the agent, and only a reference', () => {
    const p = plan(PLAN, [item('s1'), item('s2', bound('a1'))])
    const line = boundItemReminder([p], 'a1')
    expect(line).toContain(`plan-ref: ${PLAN}/s2`)
    expect(line?.includes('\n')).toBe(false)
    expect(line).not.toContain('do it')
    expect(line).not.toContain('title')
  })

  test('nothing for an agent with no item, a finished item, an abandoned plan or a bad id', () => {
    const p = plan(PLAN, [item('s1', { ...bound('a1'), status: 'verified' }), item('s2', { ...bound('a1'), status: 'abandoned' }), item('s3', bound('a2'))])
    expect(boundItemReminder([p], 'a1')).toBeNull()
    expect(boundItemReminder([plan(PLAN, [item('s1', bound('a1'))], 'abandoned')], 'a1')).toBeNull()
    expect(boundItemReminder([p], 'nobody')).toBeNull()
    expect(boundItemReminder([p], '')).toBeNull()
    expect(boundItemReminder([p], undefined)).toBeNull()
    expect(boundItemReminder([], 'a1')).toBeNull()
  })

  test('the newest binding wins', () => {
    const p = plan(PLAN, [item('s1', bound('a1', '2026-11-10T00:00:00.000Z')), item('s2', bound('a1', '2026-11-10T01:00:00.000Z'))])
    expect(boundItemReminder([p], 'a1')).toContain('/s2')
  })
})
