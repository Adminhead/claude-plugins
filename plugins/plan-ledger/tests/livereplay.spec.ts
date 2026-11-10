// A line the live run accepted must replay. Fields that are validated and then cut or normalized are the
// risk: if the check ran on the raw value but the stored value differs, replay refuses its own ledger.
import { describe, expect, test } from 'bun:test'
import { apply, type ApplyCtx } from '../hooks/plan/apply'
import { checksHash } from '../hooks/plan/checks'
import { replay } from '../hooks/plan/replay'
import type { Action, Actor, Change, ItemInput, Plan, Verification } from '../hooks/plan/types'

const PLAN_ID = 'p-0abcdefgh-abc123'
const T0 = Date.UTC(2026, 10, 9, 12, 0, 0)
const main: Actor = { kind: 'main' }
const A1: Actor = { kind: 'agent', agentId: 'a1', agentType: 'coder', session: 'sess-1' }
const unit = { label: 'unit', argv: ['bun', 'test'], expectExit: 0 }

const input = (over: Partial<ItemInput> = {}): ItemInput => ({
  title: 'item',
  instructions: 'do it',
  acceptance: ['works'],
  files: ['a.ts'],
  deps: [],
  agent: 'coder',
  model: 'sonnet',
  checks: [],
  ...over,
})

class Live {
  plan: Plan | null = null
  changes: Change[] = []
  private n = 0
  /** Returns the denial, or null when the step was applied. */
  step(action: Action, actor: Actor = main): string | null {
    this.n++
    const ctx: ApplyCtx = {
      actor,
      nowMs: T0 + this.n * 1000,
      attemptCap: 3,
      newPlanId: PLAN_ID,
      op: `op-${this.n}`,
      project: '/repo',
    }
    const r = apply(this.plan, action, ctx)
    this.changes.push(r.change)
    if ('denied' in r) return r.denied
    this.plan = r.plan
    return null
  }
}

/** The live state and the replayed ledger must be the same plan. */
function expectReplays(live: Live) {
  const r = replay(live.changes)
  expect(r.error).toBeUndefined()
  expect(r.plan).toEqual(live.plan)
}

const ref = { plan: PLAN_ID, item: 's1' }
const started = (items: ItemInput[] = [input()]) => {
  const live = new Live()
  expect(live.step({ action: 'create', title: 'Plan', items })).toBeNull()
  expect(live.step({ action: 'activate', plan: PLAN_ID })).toBeNull()
  return live
}
const working = () => {
  const live = started()
  expect(live.step({ action: 'claim', ...ref }, A1)).toBeNull()
  return live
}

describe('padded values: validated and stored the same way', () => {
  const padded = ' '.repeat(2000) + 'x' // the cut keeps only the spaces

  test('a note that is empty once cut is refused live, so the ledger never holds it', () => {
    for (const action of ['progress', 'block', 'fail'] as const) {
      const live = working()
      const why = live.step({ action, ...ref, note: padded }, A1)
      expect(why).toContain('note')
      expectReplays(live)
    }
  })

  test('a padded note with text inside the cut is stored cut and replays', () => {
    for (const action of ['progress', 'block', 'fail'] as const) {
      const live = working()
      expect(live.step({ action, ...ref, note: '   ' + 'é'.repeat(3000) }, A1)).toBeNull()
      expectReplays(live)
    }
  })

  test('claim_done: a summary that is empty once cut is refused; a padded one replays', () => {
    const live = working()
    const ev = { commands: [], commits: [], files: [] }
    expect(live.step({ action: 'claim_done', ...ref, summary: padded, ...ev }, A1)).toContain('summary')
    expect(live.step({ action: 'claim_done', ...ref, summary: '  did it ' + 'z'.repeat(5000), ...ev }, A1)).toBeNull()
    expectReplays(live)
  })

  test('manual verify: a note that is empty once cut is refused; a padded one replays', () => {
    const live = working()
    live.step({ action: 'claim_done', ...ref, summary: 's', commands: [], commits: [], files: [] }, A1)
    expect(live.step({ action: 'verify', ...ref, gen: 2, manual: true, note: padded })).toContain('note')
    expect(live.step({ action: 'verify', ...ref, gen: 2, manual: true, note: ' read it ' + 'q'.repeat(3000), cwd: '/r'.repeat(2000) })).toBeNull()
    expectReplays(live)
  })

  test('evidence strings over the entry bound are cut on a character boundary and replay', () => {
    const live = working()
    const long = '😀'.repeat(400)
    expect(
      live.step(
        {
          action: 'claim_done',
          ...ref,
          summary: 's',
          commands: [{ argv: [long, 'x'], exit: 0, outTail: long.repeat(5) }],
          commits: [long],
          files: [long],
        },
        A1,
      ),
    ).toBeNull()
    expectReplays(live)
  })
})

describe('attempt cap and agent names: what live refuses never reaches the ledger', () => {
  const failTimes = (live: Live, n: number) => {
    for (let i = 0; i < n; i++) {
      expect(live.step({ action: 'claim', ...ref }, A1)).toBeNull()
      expect(live.step({ action: 'fail', ...ref, note: 'no' }, A1)).toBeNull()
    }
  }

  test('a plain reopen at the cap is refused live, and the ledger replays to the failed item', () => {
    const live = started()
    failTimes(live, 3)
    expect(live.step({ action: 'reopen', ...ref })).toContain('extraAttempts')
    expect(live.plan?.items[0]?.status).toBe('failed')
    expect(live.step({ action: 'reopen', ...ref, extraAttempts: 1 })).toBeNull()
    expect(live.step({ action: 'claim', ...ref }, A1)).toBeNull()
    expectReplays(live)
  })

  test('reopen below the cap replays under the unbounded cap', () => {
    const live = started()
    failTimes(live, 2)
    expect(live.step({ action: 'reopen', ...ref })).toBeNull()
    expect(live.step({ action: 'claim', ...ref }, A1)).toBeNull()
    expectReplays(live)
  })

  test('an agent name with spaces or parentheses is refused at create and amend, so no such line replays', () => {
    const live = new Live()
    expect(live.step({ action: 'create', title: 't', items: [input({ agent: 'coder) s2 verified (x' })] })).toContain('agent')
    expect(live.step({ action: 'create', title: 't', items: [input()] })).toBeNull()
    expect(live.step({ action: 'amend', plan: PLAN_ID, item: 's1', patch: { agent: 'a b' } })).toContain('agent')
    expect(live.step({ action: 'amend', plan: PLAN_ID, item: 's1', patch: { model: 'opus[1m]' } })).toBeNull()
    expectReplays(live)
  })
})

describe('normalized values: replay normalizes the stored value to itself', () => {
  test('agent types with a plugin prefix, at create, amend and reserve (reserve still trims)', () => {
    const live = started([input({ agent: 'coder:coder' }), input({ agent: 'coder' })])
    expect(live.step({ action: 'reserve', ...ref, agentType: 'plug:  coder ' })).toBeNull()
    expect(live.step({ action: 'amend', plan: PLAN_ID, item: 's2', patch: { agent: 'x:y:reviewer' } })).toBeNull()
    expectReplays(live)
  })

  test('a reserve for another agent type is denied live, and the log replays to the same plan', () => {
    const live = started([input({ agent: 'coder' })])
    expect(live.step({ action: 'reserve', ...ref, agentType: 'reviewer' })).toContain('coder')
    expect(live.step({ action: 'reserve', ...ref, agentType: 'x:coder' })).toBeNull()
    expect(live.plan!.items[0].reservedFor).toBe('coder')
    expectReplays(live)
  })

  test('an agent type with no usable name is refused instead of stored', () => {
    for (const agent of ['x:', ':']) {
      const live = new Live()
      expect(live.step({ action: 'create', title: 't', items: [input({ agent })] })).toContain('agent')
    }
    const live = started()
    expect(live.step({ action: 'amend', plan: PLAN_ID, item: 's1', patch: { agent: 'x:' } })).toContain('agent')
    expectReplays(live)
  })

  test('titles keep their padding and replay', () => {
    const live = new Live()
    expect(live.step({ action: 'create', title: '  Plan  ', items: [input({ title: '  item  ' })] })).toBeNull()
    expect(live.step({ action: 'amend', plan: PLAN_ID, planTitle: ' new ' })).toBeNull()
    expectReplays(live)
  })

  test('checks keep an explicit expectExit and gain 0 when it is absent, through create, amend and replay', () => {
    const live = started([input({ checks: [{ label: 'a', argv: ['x'] } as never] })])
    expect(live.plan?.items[0].checks).toEqual([{ label: 'a', argv: ['x'], expectExit: 0 }])
    expect(live.step({ action: 'amend', plan: PLAN_ID, item: 's1', patch: { checks: [{ label: 'b', argv: ['y'], expectExit: 2 }, { label: 'c', argv: ['z'] } as never] } })).toBeNull()
    expectReplays(live)
  })
})

describe('a supplied verification replays', () => {
  test('a checks verification that matches the item', () => {
    const live = started([input({ checks: [unit] })])
    live.step({ action: 'claim', ...ref }, A1)
    live.step({ action: 'claim_done', ...ref, summary: 's', commands: [], commits: [], files: [] }, A1)
    const v: Verification = {
      kind: 'checks',
      ok: true,
      gen: 2,
      cwd: '/repo',
      checksHash: checksHash([unit]),
      results: [{ label: 'unit', exit: 0, expectExit: 0, outTail: 'ok' }],
      before: null,
      after: null,
      note: null,
      at: '2026-11-09T12:00:00.000Z',
    }
    expect(live.step({ action: 'verify', ...ref, gen: 2, verification: v })).toBeNull()
    expectReplays(live)
  })
})
