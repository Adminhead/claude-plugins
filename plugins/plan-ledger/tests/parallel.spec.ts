import { describe, expect, test } from 'bun:test'
import { apply, type ApplyCtx } from '../hooks/plan/apply'
import { filesOverlap, overlapWarnings, readyItems, readyLine } from '../hooks/plan/parallel'
import { replay } from '../hooks/plan/replay'
import { renderBlock, renderItem } from '../hooks/plan/render'
import { parseInput, renderPlanStatus } from '../hooks/plan/tool'
import type { Actor, Change, Item, Plan } from '../hooks/plan/types'

const PLAN_ID = 'p-0abcdefgh-abc123'
const main: Actor = { kind: 'main' }
const ctx = (over: Partial<ApplyCtx> = {}): ApplyCtx => ({ actor: main, nowMs: Date.UTC(2026, 10, 9), attemptCap: 3, newPlanId: PLAN_ID, op: 'op-1', project: '/repo', ...over })

const input = (over: Record<string, unknown> = {}) => ({ title: 't', instructions: 'do', acceptance: [], files: [], deps: [], agent: 'coder', model: '', checks: [], ...over })
const ok = (r: ReturnType<typeof apply>) => {
  if ('denied' in r) throw new Error(`denied: ${r.denied}`)
  return r
}
const created = (items: unknown[]) => ok(apply(null, { action: 'create', title: 'P', items } as any, ctx()))
const activate = (p: Plan): Plan => ok(apply(p, { action: 'activate', plan: PLAN_ID }, ctx())).plan
const itemOf = (p: Plan, id: string) => p.items.find((i) => i.id === id) as Item

describe('filesOverlap', () => {
  test('the same path, a directory and a file inside it, and a glob and a file under its directory overlap', () => {
    expect(filesOverlap(['src/a.ts'], ['src/a.ts'])).not.toBeNull()
    expect(filesOverlap(['src/'], ['src/a/b.ts'])).not.toBeNull()
    expect(filesOverlap(['./src/a.ts'], ['src'])).not.toBeNull()
    expect(filesOverlap(['src/**/*.ts'], ['src/a/b.ts'])).not.toBeNull()
  })
  test('sibling files, a shared name prefix and empty entries do not', () => {
    expect(filesOverlap(['src/a.ts'], ['src/b.ts'])).toBeNull()
    expect(filesOverlap(['src/a'], ['src/ab/c.ts'])).toBeNull()
    expect(filesOverlap(['lib/'], ['src/'])).toBeNull()
    expect(filesOverlap([''], ['src/a.ts'])).toBeNull()
    // a glob with no directory part lands nowhere known: no warning, either side
    for (const g of ['*.md', '**/*.ts', './*.json']) {
      expect(filesOverlap([g], ['README.md'])).toBeNull()
      expect(filesOverlap(['src/a.ts'], [g])).toBeNull()
      expect(filesOverlap([g], [g])).toBeNull()
    }
    expect(filesOverlap([], ['src/a.ts'])).toBeNull()
  })
})

describe('parallelSafe', () => {
  test('is stored from create, defaults to absent (false), and survives replay and an amend', () => {
    const made = created([input({ parallelSafe: true, files: ['a.ts'] }), input({ files: ['b.ts'] })])
    expect(itemOf(made.plan, 's1').parallelSafe).toBe(true)
    expect(itemOf(made.plan, 's2').parallelSafe).toBeUndefined()
    const amended = ok(apply(made.plan, { action: 'amend', plan: PLAN_ID, item: 's2', patch: { parallelSafe: true } }, ctx({ op: 'op-2' })))
    expect(itemOf(amended.plan, 's2')).toMatchObject({ parallelSafe: true, gen: 2 })
    const back = ok(apply(amended.plan, { action: 'amend', plan: PLAN_ID, item: 's2', patch: { parallelSafe: false } }, ctx({ op: 'op-3' })))
    expect(itemOf(back.plan, 's2').parallelSafe).toBe(false)
    const changes: Change[] = [made.change, amended.change, back.change]
    expect(replay(changes).plan).toEqual(back.plan)
  })

  test('a value that is not a boolean is refused by the plan and by the tool', () => {
    const r = apply(null, { action: 'create', title: 'P', items: [input({ parallelSafe: 'yes' })] } as any, ctx())
    expect('denied' in r && r.denied).toContain('parallelSafe')
    expect(parseInput({ action: 'create', title: 'P', items: [{ title: 't', instructions: 'x', agent: 'coder', parallelSafe: 1 }] })).toHaveProperty('error')
    expect(parseInput({ action: 'amend', plan: PLAN_ID, item: 's1', patch: { parallelSafe: 'true' } })).toHaveProperty('error')
    expect(parseInput({ action: 'amend', plan: PLAN_ID, item: 's1', patch: { parallelSafe: true } })).toMatchObject({ patch: { parallelSafe: true } })
  })

  test('create warns about overlapping files of two parallelSafe items and still creates the plan', () => {
    const r = created([
      input({ parallelSafe: true, files: ['src/a.ts', 'src/b.ts'] }),
      input({ parallelSafe: true, files: ['src/b.ts'] }),
      input({ files: ['src/b.ts'] }), // not parallelSafe: no claim about it
      input({ parallelSafe: true, files: ['docs/'] }),
    ])
    expect(r.plan.items).toHaveLength(4)
    expect(r.message).toContain('Warning: s1 and s2 are both parallelSafe')
    expect(r.message).not.toContain('s3')
    expect(r.message).not.toContain('s4')
    const clean = created([input({ parallelSafe: true, files: ['a.ts'] }), input({ parallelSafe: true, files: ['b.ts'] })])
    expect(clean.message).not.toContain('Warning')
  })

  test('amend warns the same way, only about the item it changed', () => {
    const made = created([input({ files: ['x.ts'], parallelSafe: true }), input({ files: ['y.ts'], parallelSafe: true }), input({ files: ['z.ts'], parallelSafe: true })])
    const r = ok(apply(made.plan, { action: 'amend', plan: PLAN_ID, item: 's2', patch: { files: ['x.ts'] } }, ctx({ op: 'op-2' })))
    expect(r.message).toContain('s1 and s2')
    expect(r.message).not.toContain('s3')
    expect(overlapWarnings(r.plan.items)).toHaveLength(1)
  })

  test('claim rules do not change: a non-parallel item and a plan written before the field existed claim as before', () => {
    const made = created([input(), input({ parallelSafe: true })])
    const p = activate(made.plan)
    const legacy = { ...p, items: p.items.map(({ parallelSafe: _x, ...rest }) => rest as Item) }
    for (const plan of [p, legacy]) {
      const a1: Actor = { kind: 'agent', agentId: 'a1', agentType: 'coder', session: 's' }
      const claim = ok(apply(plan, { action: 'claim', plan: PLAN_ID, item: 's1' }, ctx({ actor: a1, op: 'c1' })))
      expect(itemOf(claim.plan, 's1').status).toBe('in_progress')
    }
    expect(readyItems(legacy).parallel).toEqual([])
    expect(readyItems(legacy).alone.map((i) => i.id)).toEqual(['s1', 's2'])
  })
})

describe('ready items', () => {
  const built = () =>
    activate(
      created([
        input({ parallelSafe: true, files: ['a.ts'] }),
        input({ parallelSafe: true, files: ['b.ts'] }),
        input({ files: ['c.ts'] }),
        input({ parallelSafe: true, deps: ['s1'], files: ['d.ts'] }),
      ]).plan,
    )

  test('splits the pending items whose deps are verified into parallel-safe and alone; waiting items are in neither', () => {
    const r = readyItems(built())
    expect(r.parallel.map((i) => i.id)).toEqual(['s1', 's2'])
    expect(r.alone.map((i) => i.id)).toEqual(['s3'])
  })

  test('a draft plan has nothing ready, and an item leaves the list once claimed; a verified dep releases its dependent', () => {
    expect(readyItems({ ...built(), status: 'draft' })).toEqual({ parallel: [], alone: [] })
    const p = built()
    const claimed = { ...p, items: p.items.map((i) => (i.id === 's1' ? { ...i, status: 'in_progress' as const } : i)) }
    expect(readyItems(claimed).parallel.map((i) => i.id)).toEqual(['s2'])
    const verified = { ...p, items: p.items.map((i) => (i.id === 's1' ? { ...i, status: 'verified' as const } : i)) }
    expect(readyItems(verified).parallel.map((i) => i.id)).toEqual(['s2', 's4'])
  })

  test('status and get show the flag and the ready line; the block marks ready parallel items', () => {
    const p = built()
    expect(renderPlanStatus(p)).toContain('Ready:') // the ids themselves are asserted through readyItems above
    expect(renderItem(p, 's1')).toContain('parallel-safe')
    expect(renderItem(p, 's3')).not.toContain('parallel-safe')
    // a ready parallel item is marked in the block, a waiting one is not
    expect(renderBlock([p])).toMatch(/s1 pending \(parallel\)/)
    expect(renderBlock([p])).not.toMatch(/s4 pending \(parallel\)/)
  })

  test('a 20-item plan with long titles still lists the ready ids in its status', () => {
    const long = 'x'.repeat(120)
    const p = activate(created(Array.from({ length: 20 }, (_, n) => input({ title: long, parallelSafe: n < 3, files: [`f${n}.ts`] }))).plan)
    const status = renderPlanStatus(p)
    const ready = status.split('\n').find((l) => l.startsWith('Ready:')) as string
    expect(ready).toBeDefined()
    for (const id of ['s1', 's2', 's3']) expect(ready.split(';')[0]).toContain(id)
    expect(ready.split(';')[1]).toContain('s20')
  })

  test('the ready line names ready parallel-safe items that share files, and is absent when nothing is ready', () => {
    const p = activate(created([input({ parallelSafe: true, files: ['a/'] }), input({ parallelSafe: true, files: ['a/x.ts'] })]).plan)
    expect(readyLine(p)).toContain('Overlapping files: s1+s2')
    const done = { ...p, items: p.items.map((i) => ({ ...i, status: 'verified' as const })) }
    expect(readyLine(done)).toBeNull()
    expect(renderPlanStatus(done)).not.toContain('Ready:')
  })
})
