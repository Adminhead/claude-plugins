import { describe, expect, test } from 'bun:test'
import { apply, type ApplyCtx, type ApplyResult } from '../hooks/plan/apply'
import { checksHash } from '../hooks/plan/checks'
import type { Action, Actor, Item, ItemInput, ItemStatus, Plan, Verification } from '../hooks/plan/types'

const PLAN_ID = 'p-0abcdefgh-abc123'
const NOW = Date.UTC(2026, 10, 9, 12, 0, 0)

const main: Actor = { kind: 'main' }
const agent = (agentId: string, agentType: string | null = 'coder', session = 'sess-1'): Actor => ({
  kind: 'agent',
  agentId,
  agentType,
  session,
})
const A1 = agent('a1')
const A2 = agent('a2')

const ctx = (actor: Actor, over: Partial<ApplyCtx> = {}): ApplyCtx => ({
  actor,
  nowMs: NOW,
  attemptCap: 3,
  newPlanId: PLAN_ID,
  op: 'op-1',
  project: '/repo',
  ...over,
})

const bound = (agentId: string, session = 'sess-1') => ({ agentId, session, at: '2026-11-09T00:00:00.000Z' })

function item(over: Partial<Item> = {}): Item {
  return {
    id: 's1',
    title: 't',
    instructions: 'do it',
    acceptance: [],
    files: [],
    deps: [],
    agent: 'coder',
    model: 'sonnet',
    checks: [],
    status: 'pending',
    attempts: 0,
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

function plan(items: Item[] = [item()], over: Partial<Plan> = {}): Plan {
  return {
    v: 1,
    id: PLAN_ID,
    title: 'p',
    rev: 4,
    created: '2026-11-09T00:00:00.000Z',
    project: '/repo',
    status: 'active',
    creator: main,
    items,
    ...over,
  }
}

const ref = { plan: PLAN_ID, item: 's1' }
const ALL: ItemStatus[] = ['pending', 'in_progress', 'blocked', 'claimed_done', 'verified', 'failed', 'abandoned']

const evidence = { summary: 'done', commands: [], commits: ['abc'], files: ['a.ts'] }
const claimDone = (over: Record<string, unknown> = {}): Action =>
  ({ action: 'claim_done', ...ref, ...evidence, ...over }) as Action

function input(over: Partial<ItemInput> = {}): ItemInput {
  return {
    title: 'one',
    instructions: 'do',
    acceptance: ['works'],
    files: ['a.ts'],
    deps: [],
    agent: 'coder',
    model: 'sonnet',
    checks: [],
    ...over,
  }
}

function ok(r: ApplyResult) {
  if ('denied' in r) throw new Error(`denied: ${r.denied}`)
  return r
}
function denied(r: ApplyResult): string {
  if (!('denied' in r)) throw new Error('expected a denial')
  return r.denied
}
const itemOf = (p: Plan, id = 's1') => p.items.find((i) => i.id === id) as Item
const inProgress = (over: Partial<Item> = {}) =>
  item({ status: 'in_progress', attempts: 1, boundAgent: bound('a1'), ...over })

const unit = { label: 'unit', argv: ['bun', 'test'], expectExit: 0 }
const checksVerification = (over: Partial<Verification> = {}): Verification => ({
  kind: 'checks',
  ok: true,
  gen: 2,
  cwd: '/repo',
  checksHash: checksHash([unit]),
  results: [{ label: 'unit', exit: 0, expectExit: 0, outTail: 'ok' }],
  before: { head: 'h1', fingerprint: 'f1' },
  after: { head: 'h1', fingerprint: 'f1' },
  note: null,
  at: '2026-11-09T12:00:00.000Z',
  ...over,
})

describe('apply: denial shape', () => {
  test('authorize runs first and the Change records the reason with rev unchanged', () => {
    const p = plan([inProgress()])
    const r = apply(p, { action: 'claim_done', ...ref, ...evidence }, ctx(A2))
    const reason = denied(r)
    expect(r.change.denied).toBe(reason)
    expect(r.change.rev).toBe(p.rev)
    expect(r.change.actor).toEqual(A2)
    expect(r.change.op).toBe('op-1')
    expect(r.change.action).toBe('claim_done')
    expect(r.change.item).toBe('s1')
    expect(r.change.to).toBeNull()
  })

  test('an action naming a plan that is not loaded is denied with a Change', () => {
    const r = apply(null, { action: 'activate', plan: PLAN_ID }, ctx(main))
    expect(denied(r)).toBe('No such plan.')
    expect(r.change.plan).toBe(PLAN_ID)
    expect(r.change.rev).toBe(0)
  })

  test('list, status and get are reads, not transitions', () => {
    const p = plan()
    for (const a of [
      { action: 'list' },
      { action: 'status', plan: PLAN_ID },
      { action: 'get', ...ref },
    ] as Action[]) {
      expect(typeof denied(apply(p, a, ctx(main)))).toBe('string')
    }
  })

  test('an abandoned plan accepts no mutation', () => {
    const p = plan([inProgress()], { status: 'abandoned' })
    expect(denied(apply(p, { action: 'progress', note: 'x', ...ref }, ctx(A1)))).toContain('abandoned')
    expect(denied(apply(p, { action: 'amend', plan: PLAN_ID, planTitle: 'x' }, ctx(main)))).toContain('abandoned')
  })

  test('input plan is not mutated and the result is deterministic', () => {
    const p = plan([item()])
    const before = JSON.stringify(p)
    const a: Action = { action: 'claim', ...ref }
    const r1 = ok(apply(p, a, ctx(A1)))
    const r2 = ok(apply(p, a, ctx(A1)))
    expect(JSON.stringify(p)).toBe(before)
    expect(r1).toEqual(r2)
    expect(r1.change.ts).toBe('2026-11-09T12:00:00.000Z')
  })
})

describe('ifRev', () => {
  test('a mismatch is denied and names the current rev', () => {
    const p = plan([item({ status: 'in_progress', boundAgent: bound('a1') })])
    const r = apply(p, { action: 'progress', note: 'x', ifRev: 3, ...ref }, ctx(A1))
    expect(denied(r)).toContain('rev 4')
    expect(r.change.rev).toBe(4)
  })

  test('a match is applied and bumps rev', () => {
    const p = plan([item({ status: 'in_progress', boundAgent: bound('a1') })])
    const r = ok(apply(p, { action: 'progress', note: 'x', ifRev: 4, ...ref }, ctx(A1)))
    expect(r.plan.rev).toBe(5)
    expect(r.change.rev).toBe(5)
  })

  test('applies to main actions too', () => {
    expect(denied(apply(plan(), { action: 'abandon', plan: PLAN_ID, ifRev: 1 }, ctx(main)))).toContain('rev 4')
  })
})

describe('create', () => {
  const create = (items: ItemInput[], actor: Actor = main, title = 'My plan') =>
    apply(null, { action: 'create', title, items }, ctx(actor))

  test('makes a draft plan, items s1.. by order, creator from ctx, rev 1', () => {
    const arch = agent('arch1', 'architect')
    const r = ok(create([input({ title: 'a' }), input({ title: 'b', deps: ['s1'] })], arch))
    expect(r.plan.status).toBe('draft')
    expect(r.plan.id).toBe(PLAN_ID)
    expect(r.plan.rev).toBe(1)
    expect(r.plan.creator).toEqual(arch)
    expect(r.plan.project).toBe('/repo')
    expect(r.plan.created).toBe('2026-11-09T12:00:00.000Z')
    expect(r.plan.items.map((i) => i.id)).toEqual(['s1', 's2'])
    const s2 = itemOf(r.plan, 's2')
    expect(s2).toMatchObject({
      status: 'pending',
      attempts: 0,
      extraAttempts: 0,
      gen: 1,
      boundAgent: null,
      reservedFor: null,
      claimed: null,
      verification: null,
      note: null,
      failure: null,
      deps: ['s1'],
    })
    expect(r.change).toMatchObject({ rev: 1, plan: PLAN_ID, item: null, from: null, to: 'draft', denied: null })
  })

  test('an architect creates a draft that no agent can claim until activated', () => {
    const r = ok(create([input()], agent('arch', 'architect')))
    expect(r.plan.status).toBe('draft')
    expect(denied(apply(r.plan, { action: 'claim', plan: PLAN_ID, item: 's1' }, ctx(A1)))).toContain('activate')
  })

  test('needs plan === null', () => {
    const r = apply(plan(), { action: 'create', title: 't', items: [input()] }, ctx(main))
    expect(typeof denied(r)).toBe('string')
  })

  test('rejects unknown deps, self deps and cycles', () => {
    expect(denied(create([input({ deps: ['s9'] })]))).toContain('s9')
    expect(denied(create([input({ deps: ['s1'] })]))).toContain('cycle')
    expect(denied(create([input({ deps: ['s2'] }), input({ deps: ['s1'] })]))).toContain('cycle')
    expect(denied(create([input({ deps: ['s3'] }), input({ deps: ['s1'] }), input({ deps: ['s2'] })]))).toContain(
      's1 -> s3 -> s2 -> s1',
    )
  })

  test('accepts a diamond (shared dependency is not a cycle)', () => {
    ok(
      create([
        input(),
        input({ deps: ['s1'] }),
        input({ deps: ['s1'] }),
        input({ deps: ['s2', 's3'] }),
      ]),
    )
  })

  test('enforces the field limits and never truncates', () => {
    expect(denied(create([input({ title: 'x'.repeat(121) })]))).toContain('120')
    ok(create([input({ title: 'x'.repeat(120) })]))
    expect(denied(create([input()], main, 'x'.repeat(121)))).toContain('120')
    expect(denied(create([input({ instructions: 'x'.repeat(8001) })]))).toContain('8000')
    ok(create([input({ instructions: 'x'.repeat(8000) })]))
    // multi-byte characters count as bytes
    expect(denied(create([input({ instructions: 'é'.repeat(4001) })]))).toContain('8000')
    expect(denied(create(Array.from({ length: 21 }, () => input())))).toContain('20')
    ok(create(Array.from({ length: 20 }, () => input())))
    const many = Array.from({ length: 9 }, (_, i) => ({ label: `c${i}`, argv: ['true'], expectExit: 0 }))
    expect(denied(create([input({ checks: many })]))).toContain('8')
    ok(create([input({ checks: many.slice(0, 8) })]))
    expect(denied(create([input({ checks: [{ label: 'a', argv: ['x'.repeat(601)], expectExit: 0 }] })]))).toContain(
      '600',
    )
    expect(
      denied(
        create([
          input({
            checks: [
              { label: 'a', argv: ['true'], expectExit: 0 },
              { label: 'a', argv: ['true'], expectExit: 0 },
            ],
          }),
        ]),
      ),
    ).toContain('Duplicate')
    expect(denied(create([input({ checks: [{ label: 'a', argv: [], expectExit: 0 }] })]))).toContain('argv')
  })

  test('bounds the lists and the agent and model names', () => {
    const list = (n: number, size = 1) => Array.from({ length: n }, () => 'x'.repeat(size))
    expect(denied(create([input({ acceptance: list(21) })]))).toContain('acceptance')
    ok(create([input({ acceptance: list(20, 500) })]))
    expect(denied(create([input({ acceptance: list(1, 501) })]))).toContain('500')
    expect(denied(create([input({ files: list(51) })]))).toContain('files')
    ok(create([input({ files: list(50, 500) })]))
    expect(denied(create([input({ files: ['é'.repeat(251)] })]))).toContain('500')
    expect(denied(create([input({ agent: 'a'.repeat(61) })]))).toContain('60')
    ok(create([input({ agent: 'a'.repeat(60) })]))
    expect(denied(create([input({ model: 'm'.repeat(61) })]))).toContain('60')
    ok(create([input({ model: 'm'.repeat(60) })]))
    // amend applies the same bounds
    const p = plan()
    const amend = (patch: Record<string, unknown>) =>
      apply(p, { action: 'amend', plan: PLAN_ID, item: 's1', patch } as Action, ctx(main))
    expect(denied(amend({ acceptance: list(21) }))).toContain('acceptance')
    expect(denied(amend({ files: list(1, 501) }))).toContain('500')
    expect(denied(amend({ agent: 'a'.repeat(61) }))).toContain('60')
    expect(denied(amend({ model: 'm'.repeat(61) }))).toContain('60')
  })

  test('agent and model take only plain name characters, at create and amend', () => {
    const forged = ['coder) s2 verified (x', 'coder s2', 'coder\u00a0x', 'cod(er', 'a/b', 'é']
    const amend = (patch: Record<string, unknown>) =>
      apply(plan(), { action: 'amend', plan: PLAN_ID, item: 's1', patch } as Action, ctx(main))
    for (const bad of forged) {
      expect(denied(create([input({ agent: bad })]))).toContain('agent')
      expect(denied(amend({ agent: bad }))).toContain('agent')
      expect(denied(create([input({ model: bad })]))).toContain('model')
      expect(denied(amend({ model: bad }))).toContain('model')
    }
    for (const good of ['coder', 'plug:coder', 'a.b_c-d', 'A1']) {
      ok(create([input({ agent: good })]))
      ok(amend({ agent: good }))
    }
    for (const good of ['sonnet', 'claude-sonnet-4-5', 'opus[1m]', 'us.anthropic.claude-x-v1:0', '']) {
      ok(create([input({ model: good })]))
      ok(amend({ model: good }))
    }
  })

  test('rejects control characters in the title, agent, model and dependency ids, at create and amend', () => {
    for (const bad of ['a\nb', 'a\rb', 'a\tb', 'a\u0000b', 'a\u001bb', 'a\u0085b', 'a\u2028b']) {
      expect(typeof denied(create([input({ title: bad })]))).toBe('string')
      expect(typeof denied(create([input({ agent: bad })]))).toBe('string')
      expect(typeof denied(create([input({ model: bad })]))).toBe('string')
      expect(typeof denied(create([input({ deps: [bad] })]))).toBe('string')
      expect(denied(create([input()], main, bad))).toContain('control')
      const p = plan()
      const amend = (a: Record<string, unknown>) => apply(p, { action: 'amend', plan: PLAN_ID, ...a } as Action, ctx(main))
      expect(denied(amend({ planTitle: bad }))).toContain('control')
      for (const field of ['title', 'agent', 'model']) {
        expect(typeof denied(amend({ item: 's1', patch: { [field]: bad } }))).toBe('string')
      }
      expect(typeof denied(amend({ item: 's1', patch: { deps: [bad] } }))).toBe('string')
    }
    // instructions and criteria may span lines
    ok(create([input({ instructions: 'a\nb', acceptance: ['x\ny'] })]))
  })

  test('checks go through the one validator: unknown keys are refused and expectExit defaults to 0', () => {
    expect(denied(create([input({ checks: [{ label: 'a', argv: ['x'], expectexit: 1 } as never] })]))).toContain('expectexit')
    const r = ok(create([input({ checks: [{ label: 'a', argv: ['x'] } as never] })]))
    expect(r.plan.items[0].checks).toEqual([{ label: 'a', argv: ['x'], expectExit: 0 }])
    expect(r.change.data).toMatchObject({ items: [{ checks: [{ label: 'a', argv: ['x'], expectExit: 0 }] }] })
    expect(denied(create([input({ checks: [{ label: 'a', argv: ['x'], expectExit: 1.5 }] })]))).toContain('expectExit')
  })

  test('rejects malformed items', () => {
    expect(denied(create([{ ...input(), status: 'verified' } as unknown as ItemInput]))).toContain('Unknown item field')
    expect(denied(create([{ title: 'x' } as unknown as ItemInput]))).toContain('s1')
    expect(denied(create([input({ agent: '' })]))).toContain('agent')
  })

  test('records the replay payload including project', () => {
    const r = ok(create([input()]))
    expect(r.change.data).toEqual({ title: 'My plan', items: [input()], project: '/repo' })
  })
})

describe('activate', () => {
  test('draft becomes active', () => {
    const r = ok(apply(plan([item()], { status: 'draft' }), { action: 'activate', plan: PLAN_ID }, ctx(main)))
    expect(r.plan.status).toBe('active')
    expect(r.change).toMatchObject({ from: 'draft', to: 'active', item: null })
  })

  test('illegal sources', () => {
    for (const status of ['active', 'abandoned'] as const) {
      expect(typeof denied(apply(plan([item()], { status }), { action: 'activate', plan: PLAN_ID }, ctx(main)))).toBe(
        'string',
      )
    }
  })
})

describe('claim', () => {
  const claim = (p: Plan, actor: Actor = A1, over: Partial<ApplyCtx> = {}, id = 's1') =>
    apply(p, { action: 'claim', plan: PLAN_ID, item: id }, ctx(actor, over))

  test('pending with no deps: in_progress, attempts + 1, binds the caller', () => {
    const r = ok(claim(plan()))
    expect(itemOf(r.plan)).toMatchObject({
      status: 'in_progress',
      attempts: 1,
      boundAgent: { agentId: 'a1', session: 'sess-1', at: '2026-11-09T12:00:00.000Z' },
    })
    expect(r.change).toMatchObject({ from: 'pending', to: 'in_progress', item: 's1' })
  })

  test('pending waits for every dep to be verified', () => {
    const items = [item({ status: 'claimed_done' }), item({ id: 's2', deps: ['s1'] })]
    expect(denied(claim(plan(items), A1, {}, 's2'))).toContain('s1')
    items[0] = item({ status: 'verified' })
    ok(claim(plan(items), A1, {}, 's2'))
  })

  test('an abandoned dep keeps the dependent pending and unclaimable', () => {
    const p = plan([item({ status: 'pending' }), item({ id: 's2', deps: ['s1'] })])
    const r = ok(apply(p, { action: 'abandon', plan: PLAN_ID, item: 's1' }, ctx(main)))
    expect(itemOf(r.plan, 's1').status).toBe('abandoned')
    expect(itemOf(r.plan, 's2').status).toBe('pending')
    expect(denied(claim(r.plan, A1, {}, 's2'))).toContain('s1')
  })

  test('failed below the cap is claimable and keeps its binding', () => {
    const p = plan([item({ status: 'failed', attempts: 2, boundAgent: bound('a1') })])
    const r = ok(claim(p))
    expect(itemOf(r.plan)).toMatchObject({ status: 'in_progress', attempts: 3 })
  })

  test('a later session takes over a failed item and replaces the binding', () => {
    const p = plan([item({ status: 'failed', attempts: 1, boundAgent: bound('old', 'sess-0') })])
    const r = ok(claim(p, A1))
    expect(itemOf(r.plan).boundAgent).toMatchObject({ agentId: 'a1', session: 'sess-1' })
  })

  test('third attempt can succeed, the fourth claim is denied until reopen with extraAttempts', () => {
    let p = plan()
    for (let n = 1; n <= 3; n++) {
      p = ok(claim(p)).plan
      expect(itemOf(p).attempts).toBe(n)
      if (n === 3) {
        p = ok(apply(p, claimDone(), ctx(A1))).plan
        expect(itemOf(p).status).toBe('claimed_done')
      } else {
        p = ok(apply(p, { action: 'fail', note: 'no', ...ref }, ctx(A1))).plan
      }
    }
    // a separate item whose third attempt fails
    let q = plan()
    for (let n = 1; n <= 3; n++) {
      q = ok(claim(q)).plan
      q = ok(apply(q, { action: 'fail', note: 'no', ...ref }, ctx(A1))).plan
    }
    expect(itemOf(q)).toMatchObject({ status: 'failed', attempts: 3 })
    expect(denied(claim(q))).toContain('3 attempts')
    q = ok(apply(q, { action: 'reopen', extraAttempts: 1, ...ref }, ctx(main))).plan
    expect(itemOf(q)).toMatchObject({ status: 'pending', extraAttempts: 1, attempts: 3 })
    q = ok(claim(q)).plan
    expect(itemOf(q).attempts).toBe(4)
    q = ok(apply(q, { action: 'fail', note: 'no', ...ref }, ctx(A1))).plan
    expect(denied(claim(q))).toContain('4 attempts')
  })

  test('after the cap, reopen without extraAttempts is denied and the item keeps its status', () => {
    for (const status of ['failed', 'blocked', 'claimed_done', 'verified', 'abandoned'] as const) {
      const p = plan([item({ status, attempts: 3, gen: 2, boundAgent: bound('a1') })])
      for (const extra of [undefined, 0]) {
        const why = denied(apply(p, { action: 'reopen', ...(extra === undefined ? {} : { extraAttempts: extra }), ...ref }, ctx(main)))
        expect(why).toContain('extraAttempts')
        expect(why).toContain(status)
      }
      const extra = ok(apply(p, { action: 'reopen', extraAttempts: 1, ...ref }, ctx(main))).plan
      expect(itemOf(ok(claim(extra)).plan).attempts).toBe(4)
    }
  })

  test('a reopened item below the cap, or with the cap raised, is still claimable', () => {
    const below = plan([item({ status: 'failed', attempts: 2, boundAgent: bound('a1') })])
    const reopened = ok(apply(below, { action: 'reopen', ...ref }, ctx(main))).plan
    expect(itemOf(ok(claim(reopened)).plan).attempts).toBe(3)
    const raised = plan([item({ status: 'failed', attempts: 4, extraAttempts: 1, boundAgent: bound('a1') })])
    expect(typeof denied(apply(raised, { action: 'reopen', ...ref }, ctx(main)))).toBe('string')
    const more = ok(apply(raised, { action: 'reopen', extraAttempts: 1, ...ref }, ctx(main))).plan
    expect(itemOf(ok(claim(more)).plan).attempts).toBe(5)
  })

  test('attemptCap comes from ctx', () => {
    const p = plan([item({ status: 'failed', attempts: 1, boundAgent: bound('a1') })])
    expect(denied(claim(p, A1, { attemptCap: 1 }))).toContain('1 attempts')
    ok(claim(p, A1, { attemptCap: 2 }))
  })

  test('a repeat by the bound agent while in_progress is a no-op', () => {
    const p = plan([inProgress({ attempts: 2 })])
    const r = ok(claim(p))
    expect(itemOf(r.plan)).toEqual(itemOf(p))
    expect(r.plan.rev).toBe(p.rev + 1)
    expect(r.change).toMatchObject({ from: 'in_progress', to: 'in_progress' })
  })

  test('one in_progress item per agent', () => {
    const p = plan([inProgress(), item({ id: 's2' })])
    expect(denied(claim(p, A1, {}, 's2'))).toContain('s1')
    // another agent is unaffected
    ok(claim(p, A2, {}, 's2'))
  })

  test('main does not claim', () => {
    expect(denied(claim(plan(), main))).toContain('subagent')
  })

  test('illegal source statuses', () => {
    for (const status of ALL.filter((s) => s !== 'pending' && s !== 'failed')) {
      const p = plan([item({ status, boundAgent: status === 'pending' ? null : bound('a1') })])
      if (status === 'in_progress') continue // the bound agent's repeat is a no-op, tested above
      expect({ status, d: typeof denied(claim(p)) }).toEqual({ status, d: 'string' })
    }
    // in_progress held by another agent
    const held = plan([inProgress({ boundAgent: bound('a2') })])
    expect(typeof denied(claim(held))).toBe('string')
  })

  test('a nonexistent item is denied cleanly for an agent and for main', () => {
    expect(typeof denied(claim(plan(), A1, {}, 's9'))).toBe('string')
    const r = apply(plan(), { action: 'progress', note: 'x', plan: PLAN_ID, item: 's9' }, ctx(main))
    expect(denied(r)).toContain('s9')
    expect(r.change.item).toBe('s9')
  })

  test('a draft plan is not claimable', () => {
    expect(denied(claim(plan([item()], { status: 'draft' })))).toContain('activate')
  })
})

describe('progress', () => {
  test('in_progress stays in_progress and stores the note, truncated', () => {
    const p = plan([inProgress()])
    const r = ok(apply(p, { action: 'progress', note: 'half way', ...ref }, ctx(A1)))
    expect(itemOf(r.plan)).toMatchObject({ status: 'in_progress', note: 'half way' })
    const long = ok(apply(p, { action: 'progress', note: 'x'.repeat(5000), ...ref }, ctx(A1)))
    expect(itemOf(long.plan).note).toHaveLength(2000)
    expect(long.change.data).toEqual({ note: 'x'.repeat(2000) })
  })

  test('main may report progress too; a note is required', () => {
    const p = plan([inProgress()])
    ok(apply(p, { action: 'progress', note: 'x', ...ref }, ctx(main)))
    expect(denied(apply(p, { action: 'progress', note: '  ', ...ref }, ctx(main)))).toContain('note')
  })

  test('illegal sources', () => {
    for (const status of ALL.filter((s) => s !== 'in_progress')) {
      const p = plan([item({ status, boundAgent: bound('a1') })])
      expect({ status, d: typeof denied(apply(p, { action: 'progress', note: 'x', ...ref }, ctx(A1))) }).toEqual({
        status,
        d: 'string',
      })
    }
  })
})

describe('padded notes', () => {
  test('progress, block and fail refuse a note that is empty once cut to the stored size', () => {
    const padded = ' '.repeat(2000) + 'x'
    for (const action of ['progress', 'block', 'fail'] as const) {
      expect(denied(apply(plan([inProgress()]), { action, note: padded, ...ref }, ctx(A1)))).toContain('note')
    }
  })
})

describe('block', () => {
  test('in_progress becomes blocked with a note, binding kept', () => {
    const r = ok(apply(plan([inProgress()]), { action: 'block', note: 'need key', ...ref }, ctx(A1)))
    expect(itemOf(r.plan)).toMatchObject({ status: 'blocked', note: 'need key', boundAgent: { agentId: 'a1' } })
  })

  test('main may block; note required', () => {
    ok(apply(plan([inProgress()]), { action: 'block', note: 'x', ...ref }, ctx(main)))
    expect(denied(apply(plan([inProgress()]), { action: 'block', note: '', ...ref }, ctx(A1)))).toContain('note')
  })

  test('illegal sources', () => {
    for (const status of ALL.filter((s) => s !== 'in_progress')) {
      const p = plan([item({ status, boundAgent: bound('a1') })])
      expect(typeof denied(apply(p, { action: 'block', note: 'x', ...ref }, ctx(A1)))).toBe('string')
    }
  })
})

describe('fail', () => {
  test('in_progress becomes failed and keeps the note as the failure; attempts unchanged', () => {
    const r = ok(apply(plan([inProgress()]), { action: 'fail', note: 'tests red', ...ref }, ctx(A1)))
    expect(itemOf(r.plan)).toMatchObject({ status: 'failed', failure: 'tests red', attempts: 1 })
  })

  test('main cannot fail an item', () => {
    expect(typeof denied(apply(plan([inProgress()]), { action: 'fail', note: 'x', ...ref }, ctx(main)))).toBe('string')
  })

  test('illegal sources', () => {
    for (const status of ALL.filter((s) => s !== 'in_progress')) {
      const p = plan([item({ status, boundAgent: bound('a1') })])
      expect(typeof denied(apply(p, { action: 'fail', note: 'x', ...ref }, ctx(A1)))).toBe('string')
    }
  })
})

describe('claim_done', () => {
  test('in_progress becomes claimed_done, gen + 1, evidence stored', () => {
    const r = ok(apply(plan([inProgress()]), claimDone(), ctx(A1)))
    expect(itemOf(r.plan)).toMatchObject({
      status: 'claimed_done',
      gen: 2,
      claimed: { summary: 'done', commits: ['abc'], files: ['a.ts'], at: '2026-11-09T12:00:00.000Z' },
    })
    expect(r.change).toMatchObject({ from: 'in_progress', to: 'claimed_done' })
  })

  test('evidence tails are truncated to 2000 bytes', () => {
    const cmd = { argv: ['t'], exit: 0, outTail: 'é'.repeat(1500) }
    const r = ok(apply(plan([inProgress()]), claimDone({ commands: [cmd] }), ctx(A1)))
    const stored = itemOf(r.plan).claimed?.commands[0].outTail as string
    expect(new TextEncoder().encode(stored).length).toBeLessThanOrEqual(2000)
    expect(stored.length).toBe(1000)
  })

  test('an identical repeat is a no-op that keeps gen', () => {
    const first = ok(apply(plan([inProgress()]), claimDone(), ctx(A1)))
    const again = ok(apply(first.plan, claimDone(), ctx(A1)))
    expect(itemOf(again.plan)).toEqual(itemOf(first.plan))
    expect(again.plan.rev).toBe(first.plan.rev + 1)
  })

  test('a repeat with different evidence is denied', () => {
    const first = ok(apply(plan([inProgress()]), claimDone(), ctx(A1)))
    expect(denied(apply(first.plan, claimDone({ summary: 'other' }), ctx(A1)))).toContain('different evidence')
  })

  test('main cannot claim done; a summary is required', () => {
    expect(typeof denied(apply(plan([inProgress()]), claimDone(), ctx(main)))).toBe('string')
    expect(denied(apply(plan([inProgress()]), claimDone({ summary: '' }), ctx(A1)))).toContain('summary')
  })

  test('illegal sources', () => {
    for (const status of ALL.filter((s) => s !== 'in_progress' && s !== 'claimed_done')) {
      const p = plan([item({ status, boundAgent: bound('a1') })])
      expect(typeof denied(apply(p, claimDone(), ctx(A1)))).toBe('string')
    }
  })

  test('bounds the evidence: counts are refused, long strings are cut', () => {
    const p = plan([inProgress()])
    const cmd = { argv: ['t'], exit: 0, outTail: '' }
    const run = (over: Record<string, unknown>) => apply(p, claimDone(over), ctx(A1))
    expect(denied(run({ commands: Array.from({ length: 11 }, () => cmd) }))).toContain('commands')
    ok(run({ commands: Array.from({ length: 10 }, () => cmd) }))
    expect(denied(run({ commands: [{ ...cmd, argv: Array.from({ length: 21 }, () => 'x') }] }))).toContain('argv')
    ok(run({ commands: [{ ...cmd, argv: Array.from({ length: 20 }, () => 'x') }] }))
    expect(denied(run({ commits: Array.from({ length: 21 }, () => 'a') }))).toContain('commits')
    expect(denied(run({ files: Array.from({ length: 51 }, () => 'a') }))).toContain('files')
    ok(run({ commits: Array.from({ length: 20 }, () => 'a'), files: Array.from({ length: 50 }, () => 'a') }))
    const cut = ok(run({ commits: ['c'.repeat(900)], files: ['é'.repeat(900)], commands: [{ ...cmd, argv: ['a'.repeat(900)] }] }))
    const claimed = itemOf(cut.plan).claimed
    expect(claimed?.commits[0]).toHaveLength(500)
    expect(new TextEncoder().encode(claimed?.files[0]).length).toBeLessThanOrEqual(500)
    expect(claimed?.commands[0].argv[0]).toHaveLength(500)
  })

  test('a summary that is empty once cut to the stored size is refused', () => {
    expect(denied(apply(plan([inProgress()]), claimDone({ summary: ' '.repeat(2000) + 'x' }), ctx(A1)))).toContain('summary')
  })
})

describe('verify', () => {
  const claimed = (over: Partial<Item> = {}) =>
    plan([item({ status: 'claimed_done', gen: 2, boundAgent: bound('a1'), attempts: 1, ...over })])
  const v = (verification?: Verification, over: Record<string, unknown> = {}): Action =>
    ({ action: 'verify', gen: 2, ...ref, ...(verification ? { verification } : {}), ...over }) as Action

  test('a passing mod verification sets verified', () => {
    const p = claimed({ checks: [unit] })
    const r = ok(apply(p, v(checksVerification()), ctx(main)))
    expect(itemOf(r.plan)).toMatchObject({ status: 'verified', failure: null })
    expect(itemOf(r.plan).verification?.kind).toBe('checks')
    expect(r.change).toMatchObject({ from: 'claimed_done', to: 'verified' })
  })

  test('a failing verification sets failed, keeps attempts and records the tail', () => {
    const p = claimed({ checks: [unit] })
    const bad = checksVerification({
      ok: false,
      results: [{ label: 'unit', exit: 1, expectExit: 0, outTail: 'boom' }],
    })
    const r = ok(apply(p, v(bad), ctx(main)))
    expect(itemOf(r.plan)).toMatchObject({ status: 'failed', attempts: 1 })
    expect(itemOf(r.plan).failure).toContain('boom')
    // the agent must claim again
    const again = ok(apply(r.plan, { action: 'claim', ...ref }, ctx(A1)))
    expect(itemOf(again.plan).status).toBe('in_progress')
  })

  test('manual verify of an item without checks builds a manual verification', () => {
    const r = ok(apply(claimed(), v(undefined, { manual: true, note: 'read the diff' }), ctx(main)))
    expect(itemOf(r.plan).status).toBe('verified')
    expect(itemOf(r.plan).verification).toMatchObject({ kind: 'manual', ok: true, note: 'read the diff', gen: 2 })
  })

  test('manual verify is refused for an item with checks, and needs a note', () => {
    expect(denied(apply(claimed({ checks: [unit] }), v(undefined, { manual: true, note: 'x' }), ctx(main)))).toContain(
      'checks',
    )
    expect(denied(apply(claimed(), v(undefined, { manual: true }), ctx(main)))).toContain('note')
  })

  test('without a verification or manual, apply cannot verify', () => {
    expect(typeof denied(apply(claimed({ checks: [unit] }), v(), ctx(main)))).toBe('string')
  })

  test('a stale gen is denied and names the current gen', () => {
    const r = apply(claimed({ checks: [unit] }), v(checksVerification(), { gen: 1 }), ctx(main))
    expect(denied(r)).toContain('gen 2')
  })

  test('a verification for another gen or kind is denied', () => {
    expect(typeof denied(apply(claimed({ checks: [unit] }), v(checksVerification({ gen: 1 })), ctx(main)))).toBe('string')
    expect(
      typeof denied(apply(claimed({ checks: [unit] }), v(checksVerification({ kind: 'manual' })), ctx(main))),
    ).toBe('string')
    expect(typeof denied(apply(claimed(), v(checksVerification()), ctx(main)))).toBe('string')
  })

  test('a supplied verification must match the item: checks hash, results and ok', () => {
    const two = [unit, { label: 'lint', argv: ['eslint', '.'], expectExit: 1 }]
    const good = checksVerification({
      checksHash: checksHash(two),
      results: [
        { label: 'unit', exit: 0, expectExit: 0, outTail: '' },
        { label: 'lint', exit: 1, expectExit: 1, outTail: '' },
      ],
    })
    const run = (over: Partial<Verification>, checks = two) =>
      apply(claimed({ checks }), v({ ...good, ...over }), ctx(main))
    ok(run({}))
    // checks edited after the run (amend bumps gen, so only a forged gen could reach here)
    expect(denied(run({ checksHash: checksHash([unit]) }))).toContain('checks')
    expect(denied(run({ checksHash: 'h' }))).toContain('checks')
    expect(denied(run({}, [unit, { ...two[1], argv: ['eslint'] }]))).toContain('checks')
    // results that do not line up with the checks
    expect(denied(run({ results: good.results.slice(0, 1) }))).toContain('results')
    expect(denied(run({ results: [...good.results].reverse() }))).toContain('does not match')
    expect(denied(run({ results: [good.results[0], { ...good.results[1], label: 'other' }] }))).toContain('does not match')
    expect(denied(run({ results: [good.results[0], { ...good.results[1], expectExit: 0 }] }))).toContain('does not match')
    expect(typeof denied(run({ results: [good.results[0], { ...good.results[1], exit: 1.5 }] }))).toBe('string')
    // ok must agree with the results, both ways
    expect(denied(run({ ok: false }))).toContain('ok')
    const failing = [good.results[0], { ...good.results[1], exit: 0 }]
    expect(denied(run({ results: failing, ok: true }))).toContain('ok')
    const r = ok(run({ results: failing, ok: false }))
    expect(itemOf(r.plan).status).toBe('failed')
  })

  test('a supplied manual verification has no results and ok true', () => {
    const manual = checksVerification({ kind: 'manual', checksHash: '', results: [], note: 'by hand' })
    ok(apply(claimed(), v(manual), ctx(main)))
    expect(typeof denied(apply(claimed(), v({ ...manual, ok: false }), ctx(main)))).toBe('string')
    expect(typeof denied(apply(claimed(), v({ ...manual, results: checksVerification().results }), ctx(main)))).toBe('string')
  })

  test('a manual note that is empty once cut is refused', () => {
    expect(denied(apply(claimed(), v(undefined, { manual: true, note: ' '.repeat(2000) + 'x' }), ctx(main)))).toContain('note')
  })

  test('an agent cannot verify, with or without a verification', () => {
    const p = claimed({ checks: [unit] })
    expect(typeof denied(apply(p, v(checksVerification()), ctx(A1)))).toBe('string')
    expect(typeof denied(apply(p, v(undefined, { manual: true, note: 'x' }), ctx(A1)))).toBe('string')
  })

  test('illegal sources', () => {
    for (const status of ALL.filter((s) => s !== 'claimed_done')) {
      const p = plan([item({ status, gen: 2, boundAgent: bound('a1') })])
      expect(typeof denied(apply(p, v(undefined, { manual: true, note: 'x' }), ctx(main)))).toBe('string')
    }
  })
})

describe('amend', () => {
  const amend = (p: Plan, a: Record<string, unknown>) =>
    apply(p, { action: 'amend', plan: PLAN_ID, ...a } as Action, ctx(main))

  test('a plain edit keeps status, binding and attempts and bumps gen', () => {
    const p = plan([inProgress({ attempts: 2 })])
    const r = ok(amend(p, { item: 's1', patch: { title: 'new', acceptance: ['a', 'b'] } }))
    expect(itemOf(r.plan)).toMatchObject({
      title: 'new',
      acceptance: ['a', 'b'],
      status: 'in_progress',
      gen: 2,
      attempts: 2,
      boundAgent: { agentId: 'a1' },
    })
    expect(r.change).toMatchObject({ item: 's1', from: 'in_progress', to: 'in_progress' })
  })

  test('changing the agent type clears the binding and the reservation; a same-type spelling does not', () => {
    const p = plan([inProgress({ reservedFor: 'coder' })])
    const same = ok(amend(p, { item: 's1', patch: { agent: 'coder:coder' } }))
    expect(itemOf(same.plan).boundAgent).not.toBeNull()
    expect(itemOf(same.plan).reservedFor).toBe('coder')
    const changed = ok(amend(p, { item: 's1', patch: { agent: 'dba' } }))
    expect(itemOf(changed.plan)).toMatchObject({ agent: 'dba', boundAgent: null, reservedFor: null, status: 'in_progress' })
  })

  test('verified and claimed_done items cannot be amended', () => {
    for (const status of ['verified', 'claimed_done'] as const) {
      expect(typeof denied(amend(plan([item({ status })]), { item: 's1', patch: { title: 'x' } }))).toBe('string')
    }
  })

  test('other statuses can be amended', () => {
    for (const status of ALL.filter((s) => s !== 'verified' && s !== 'claimed_done')) {
      const r = ok(amend(plan([item({ status })]), { item: 's1', patch: { title: 'x' } }))
      expect(itemOf(r.plan).status).toBe(status)
    }
  })

  test('plan title only: no item gen change', () => {
    const p = plan()
    const r = ok(amend(p, { planTitle: 'renamed' }))
    expect(r.plan.title).toBe('renamed')
    expect(itemOf(r.plan).gen).toBe(1)
    expect(r.change.item).toBeNull()
  })

  test('plan title and item patch together', () => {
    const r = ok(amend(plan(), { planTitle: 'r', item: 's1', patch: { model: 'opus' } }))
    expect(r.plan.title).toBe('r')
    expect(itemOf(r.plan)).toMatchObject({ model: 'opus', gen: 2 })
  })

  test('a cycle or unknown dep from an amend is rejected', () => {
    const p = plan([item(), item({ id: 's2', deps: ['s1'] })])
    expect(denied(amend(p, { item: 's1', patch: { deps: ['s2'] } }))).toContain('cycle')
    expect(denied(amend(p, { item: 's1', patch: { deps: ['s1'] } }))).toContain('cycle')
    expect(denied(amend(p, { item: 's2', patch: { deps: ['s7'] } }))).toContain('s7')
  })

  test('limits and unknown fields apply to a patch', () => {
    expect(denied(amend(plan(), { item: 's1', patch: { instructions: 'x'.repeat(8001) } }))).toContain('8000')
    expect(denied(amend(plan(), { item: 's1', patch: { status: 'verified' } }))).toContain('Unknown')
    expect(denied(amend(plan(), { item: 's1', patch: {} }))).toContain('empty')
    expect(denied(amend(plan(), { patch: { title: 'x' } }))).toContain('item')
    expect(denied(amend(plan(), {}))).toContain('amend needs')
  })

  test('an agent cannot amend', () => {
    expect(typeof denied(apply(plan(), { action: 'amend', plan: PLAN_ID, item: 's1', patch: { title: 'x' } }, ctx(A1)))).toBe(
      'string',
    )
  })
})

describe('assign', () => {
  const assign = (p: Plan, agentId = 'a2') =>
    apply(p, { action: 'assign', agentId, session: 'sess-2', ...ref }, ctx(main))

  test('replaces the binding and keeps the status', () => {
    for (const status of ['pending', 'failed', 'blocked', 'in_progress'] as const) {
      const r = ok(assign(plan([item({ status, boundAgent: bound('a1') })])))
      expect(itemOf(r.plan).boundAgent).toMatchObject({ agentId: 'a2', session: 'sess-2' })
      expect(itemOf(r.plan).status).toBe(status)
    }
  })

  test('an in_progress item cannot go to an agent that already holds another', () => {
    const p = plan([inProgress(), item({ id: 's2', status: 'in_progress', boundAgent: bound('a2') })])
    expect(denied(assign(p, 'a2'))).toContain('s2')
  })

  test('illegal sources', () => {
    for (const status of ['claimed_done', 'verified', 'abandoned'] as const) {
      expect(typeof denied(assign(plan([item({ status })])))).toBe('string')
    }
  })

  test('an agent cannot assign', () => {
    expect(
      typeof denied(apply(plan(), { action: 'assign', agentId: 'a2', session: 's', ...ref }, ctx(A1))),
    ).toBe('string')
  })
})

describe('reopen', () => {
  const reopen = (p: Plan, extra?: number) =>
    apply(p, { action: 'reopen', ...(extra === undefined ? {} : { extraAttempts: extra }), ...ref }, ctx(main))

  test('returns the item to pending with gen + 1 from each legal status', () => {
    for (const status of ['blocked', 'failed', 'claimed_done', 'verified', 'abandoned'] as const) {
      const r = ok(reopen(plan([item({ status, gen: 3, attempts: 2 })])))
      expect(itemOf(r.plan)).toMatchObject({ status: 'pending', gen: 4, attempts: 2, extraAttempts: 0 })
      expect(r.change).toMatchObject({ from: status, to: 'pending' })
    }
  })

  test('extraAttempts accumulates', () => {
    const p = plan([item({ status: 'failed', extraAttempts: 1 })])
    expect(itemOf(ok(reopen(p, 2)).plan).extraAttempts).toBe(3)
    expect(typeof denied(reopen(p, -1))).toBe('string')
    expect(typeof denied(reopen(p, 1.5))).toBe('string')
  })

  test('dependents keep their status', () => {
    const p = plan([item({ status: 'verified' }), item({ id: 's2', status: 'in_progress', deps: ['s1'] })])
    const r = ok(reopen(p))
    expect(itemOf(r.plan, 's2').status).toBe('in_progress')
  })

  test('illegal sources', () => {
    for (const status of ['pending', 'in_progress'] as const) {
      expect(typeof denied(reopen(plan([item({ status })])))).toBe('string')
    }
  })
})

describe('abandon', () => {
  test('an item that is not verified becomes abandoned, dependents untouched', () => {
    for (const status of ['pending', 'in_progress', 'blocked', 'claimed_done', 'failed'] as const) {
      const p = plan([item({ status }), item({ id: 's2', deps: ['s1'] })])
      const r = ok(apply(p, { action: 'abandon', ...ref }, ctx(main)))
      expect(itemOf(r.plan).status).toBe('abandoned')
      expect(itemOf(r.plan, 's2').status).toBe('pending')
    }
  })

  test('the plan becomes abandoned', () => {
    const r = ok(apply(plan(), { action: 'abandon', plan: PLAN_ID }, ctx(main)))
    expect(r.plan.status).toBe('abandoned')
    expect(r.change).toMatchObject({ item: null, from: 'active', to: 'abandoned' })
  })

  test('illegal sources', () => {
    for (const status of ['verified', 'abandoned'] as const) {
      expect(typeof denied(apply(plan([item({ status })]), { action: 'abandon', ...ref }, ctx(main)))).toBe('string')
    }
  })

  test('an agent cannot abandon', () => {
    expect(typeof denied(apply(plan(), { action: 'abandon', ...ref }, ctx(A1)))).toBe('string')
  })
})

describe('bind and reserve', () => {
  const bind = (p: Plan, agentId = 'a1') =>
    apply(p, { action: 'bind', agentId, session: 'sess-1', ...ref }, ctx(main))
  const reserve = (p: Plan, agentType = 'coder') =>
    apply(p, { action: 'reserve', agentType, ...ref }, ctx(main))

  test('bind sets an empty binding and keeps the status', () => {
    for (const status of ['pending', 'failed', 'in_progress'] as const) {
      const r = ok(bind(plan([item({ status })])))
      expect(itemOf(r.plan).boundAgent).toMatchObject({ agentId: 'a1' })
      expect(itemOf(r.plan).status).toBe(status)
    }
  })

  test('replacing a binding is denied, even by the same agent', () => {
    const p = plan([item({ boundAgent: bound('a1') })])
    expect(denied(bind(p, 'a2'))).toContain('assign')
    expect(typeof denied(bind(p, 'a1'))).toBe('string')
  })

  test('bind illegal sources', () => {
    for (const status of ['blocked', 'claimed_done', 'verified', 'abandoned'] as const) {
      expect(typeof denied(bind(plan([item({ status })])))).toBe('string')
    }
  })

  test('reserve records the type without a plugin prefix', () => {
    for (const status of ['pending', 'failed', 'in_progress'] as const) {
      expect(itemOf(ok(reserve(plan([item({ status })]), 'x:coder')).plan).reservedFor).toBe('coder')
    }
  })

  test('reserve is for the item\'s own agent type only, so a reviewer spawn cannot reserve a coder item', () => {
    const p = plan([item({ agent: 'coder' })])
    expect(denied(reserve(p, 'reviewer'))).toContain('coder')
    expect(denied(reserve(p, 'x:reviewer'))).toContain('reviewer')
    // the type matches through the plugin prefix on either side
    expect(itemOf(ok(reserve(plan([item({ agent: 'pp:coder' })]), 'coder')).plan).reservedFor).toBe('coder')
    expect(itemOf(ok(reserve(p, 'pp:coder')).plan).reservedFor).toBe('coder')
  })

  test('an item with no usable agent matches no type, so it is never reserved', () => {
    for (const agent of [undefined, null, '', ':'] as unknown[]) {
      expect(typeof denied(reserve(plan([item({ agent: agent as string })])))).toBe('string')
    }
  })

  test('reserve refuses a bound or already reserved item', () => {
    expect(typeof denied(reserve(plan([item({ boundAgent: bound('a1') })])))).toBe('string')
    expect(denied(reserve(plan([item({ reservedFor: 'dba' })])))).toContain('dba')
  })

  test('reserve illegal sources', () => {
    for (const status of ['blocked', 'claimed_done', 'verified', 'abandoned'] as const) {
      expect(typeof denied(reserve(plan([item({ status })])))).toBe('string')
    }
  })

  test('an agent cannot bind or reserve', () => {
    expect(
      typeof denied(apply(plan(), { action: 'bind', agentId: 'a1', session: 's', ...ref }, ctx(A1))),
    ).toBe('string')
    expect(typeof denied(apply(plan(), { action: 'reserve', agentType: 'coder', ...ref }, ctx(A1)))).toBe('string')
  })
})

describe('ledger payload', () => {
  test('rev rises by one per non-denied result across a scripted run, denials leave it', () => {
    let p = ok(apply(null, { action: 'create', title: 't', items: [input()] }, ctx(main))).plan
    expect(p.rev).toBe(1)
    p = ok(apply(p, { action: 'activate', plan: PLAN_ID }, ctx(main))).plan
    const miss = apply(p, { action: 'claim_done', ...ref, ...evidence }, ctx(A1))
    expect(miss.change.rev).toBe(2)
    p = ok(apply(p, { action: 'claim', ...ref }, ctx(A1))).plan
    p = ok(apply(p, claimDone(), ctx(A1))).plan
    p = ok(apply(p, { action: 'verify', gen: 2, manual: true, note: 'ok', ...ref }, ctx(main))).plan
    expect(p.rev).toBe(5)
    expect(itemOf(p).status).toBe('verified')
  })
})

describe('apply: a verification built with verifyChecks off', () => {
  const claimedWith = (checks: Item['checks']) => plan([item({ status: 'claimed_done', gen: 2, boundAgent: bound('a1'), checks })])
  const skipped = (over: Partial<Verification> = {}): Verification => ({
    kind: 'manual',
    mode: 'off',
    ok: true,
    gen: 2,
    cwd: '',
    checksHash: '',
    results: [],
    before: null,
    after: null,
    note: 'not run',
    at: '2026-11-09T12:00:00.000Z',
    ...over,
  })
  const verify = (p: Plan, v: Verification) => apply(p, { action: 'verify', ...ref, gen: 2, verification: v }, ctx(main))

  test('is accepted for an item that has checks, and leaves it verified with a manual verification', () => {
    const out = ok(verify(claimedWith([unit]), skipped()))
    expect(itemOf(out.plan)).toMatchObject({ status: 'verified', verification: { kind: 'manual', mode: 'off' } })
    expect(out.message).toContain('verifyChecks is off')
  })

  test('is refused for an item without checks, for an unknown mode, and without the off mode for an item that has checks', () => {
    expect(denied(verify(claimedWith([]), skipped()))).toContain('kind does not match')
    expect(denied(verify(claimedWith([unit]), skipped({ mode: 'sometimes' as any })))).toContain('unknown verifyChecks mode')
    expect(denied(verify(claimedWith([unit]), skipped({ mode: undefined })))).toContain('kind does not match')
    expect(denied(verify(claimedWith([unit]), skipped({ results: [{ label: 'unit', exit: 0, expectExit: 0, outTail: '' }] })))).toContain('no check results')
  })
})
