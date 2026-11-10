import { describe, expect, test } from 'bun:test'
import { apply, type ApplyCtx } from '../hooks/plan/apply'
import { checksHash } from '../hooks/plan/checks'
import { findOp, needsReplay, parseLedger, parsePlanJson, reconcile, replay } from '../hooks/plan/replay'
import type { Action, Actor, Change, ItemInput, Plan, Verification } from '../hooks/plan/types'

const PLAN_ID = 'p-0abcdefgh-abc123'
const T0 = Date.UTC(2026, 10, 9, 12, 0, 0)

const main: Actor = { kind: 'main' }
const agent = (agentId: string, agentType: string | null = 'coder', session = 'sess-1'): Actor => ({
  kind: 'agent',
  agentId,
  agentType,
  session,
})
const A1 = agent('a1')
const A2 = agent('a2')
const A3 = agent('a3', 'coder', 'sess-2')
const ARCH = agent('arch1', 'architect')

const unit = { label: 'unit', argv: ['bun', 'test'], expectExit: 0 }

function input(over: Partial<ItemInput> = {}): ItemInput {
  return {
    title: 'item',
    instructions: 'do it',
    acceptance: ['works'],
    files: ['a.ts'],
    deps: [],
    agent: 'coder',
    model: 'sonnet',
    checks: [],
    ...over,
  }
}

/** A live run: applies actions one by one, keeping the plan and the ledger lines exactly as the mod would. */
class Live {
  plan: Plan | null = null
  changes: Change[] = []
  private n = 0
  constructor(private attemptCap = 3) {}

  step(action: Action, actor: Actor = main): { denied: string | null; message: string } {
    this.n++
    const ctx: ApplyCtx = {
      actor,
      nowMs: T0 + this.n * 1000,
      attemptCap: this.attemptCap,
      newPlanId: PLAN_ID,
      op: `op-${this.n}`,
      project: '/repo',
    }
    const r = apply(this.plan, action, ctx)
    this.changes.push(r.change)
    if ('denied' in r) return { denied: r.denied, message: '' }
    this.plan = r.plan
    return { denied: null, message: r.message }
  }

  text(): string {
    return serialize(this.changes)
  }
}

const serialize = (changes: Change[]) => changes.map((c) => `${JSON.stringify(c)}\n`).join('')
const ref = (item = 's1') => ({ plan: PLAN_ID, item })
const evidence = (summary = 'done') => ({ summary, commands: [], commits: ['abc'], files: ['a.ts'] })
const claimDone = (item = 's1', summary = 'done'): Action => ({ action: 'claim_done', ...ref(item), ...evidence(summary) })

function checksVerification(gen: number, ok = true): Verification {
  return {
    kind: 'checks',
    ok,
    gen,
    cwd: '/repo',
    checksHash: checksHash([unit]),
    results: [{ label: 'unit', exit: ok ? 0 : 1, expectExit: 0, outTail: ok ? 'ok' : 'boom' }],
    before: { head: 'h1', fingerprint: 'f1' },
    after: { head: 'h1', fingerprint: 'f1' },
    note: null,
    at: '2026-11-09T12:00:00.000Z',
  }
}

// ---------------------------------------------------------------- a scripted sequence

function scripted(cap = 3): Live {
  const live = new Live(cap)
  live.step(
    {
      action: 'create',
      title: 'Add retry',
      items: [input({ title: 'one', checks: [unit] }), input({ title: 'two', deps: ['s1'] }), input({ title: 'three' })],
    },
    ARCH,
  )
  live.step({ action: 'claim', ...ref() }, A1) // denied: draft
  live.step({ action: 'activate', plan: PLAN_ID })
  live.step({ action: 'claim', ...ref() }, A1)
  live.step({ action: 'claim', ...ref() }, A2) // denied: held by a1
  live.step({ action: 'progress', ...ref(), note: 'half way' }, A1)
  live.step(claimDone(), A1)
  live.step({ action: 'verify', ...ref(), gen: 1 }) // denied: stale gen
  live.step({ action: 'verify', ...ref(), gen: 2, verification: checksVerification(2, false) }) // fails
  live.step({ action: 'claim', ...ref() }, A1)
  live.step(claimDone('s1', 'second try'), A1)
  live.step({ action: 'verify', ...ref(), gen: 3, verification: checksVerification(3) })
  live.step({ action: 'claim', ...ref('s2') }, A2)
  live.step({ action: 'block', ...ref('s2'), note: 'needs a key' }, A2)
  live.step({ action: 'amend', plan: PLAN_ID, item: 's2', patch: { instructions: 'with the key', agent: 'dba' } })
  live.step({ action: 'amend', plan: PLAN_ID, planTitle: 'Add retry v2' })
  live.step({ action: 'reserve', ...ref('s3'), agentType: 'coder:coder' })
  live.step({ action: 'bind', ...ref('s3'), agentId: 'a3', session: 'sess-2' })
  live.step({ action: 'claim', ...ref('s3') }, A3)
  live.step({ action: 'fail', ...ref('s3'), note: 'tests red' }, A3)
  live.step({ action: 'reopen', ...ref('s3'), extraAttempts: 2 })
  live.step({ action: 'assign', ...ref('s3'), agentId: 'a2', session: 'sess-1' })
  live.step({ action: 'claim', ...ref('s3') }, A2)
  live.step({ action: 'claim_done', ...ref('s3'), ...evidence() }, A2)
  live.step({ action: 'verify', ...ref('s3'), gen: 3, manual: true, note: 'read it' })
  live.step({ action: 'abandon', plan: PLAN_ID, item: 's2' })
  return live
}

describe('parseLedger', () => {
  test('keeps denied lines for review, drops nothing from a clean ledger', () => {
    const live = scripted()
    const parsed = parseLedger(live.text())
    expect(parsed.torn).toBe(false)
    expect(parsed.bad).toBe(0)
    expect(parsed.changes).toEqual(JSON.parse(JSON.stringify(live.changes)))
    const denied = parsed.changes.filter((c) => c.denied !== null)
    expect(denied.length).toBeGreaterThanOrEqual(3)
    expect(denied.every((c) => c.data && Object.keys(c.data).length === 0 && c.to === null)).toBe(true)
  })

  test('an unterminated final line is torn: not a change, but handed back untouched', () => {
    const live = scripted()
    const text = live.text()
    const lines = text.trimEnd().split('\n')
    const full = lines.slice(0, -1).map((l) => `${l}\n`).join('')
    const fragment = lines[lines.length - 1].slice(0, 40)
    const parsed = parseLedger(full + fragment)
    expect(parsed.torn).toBe(true)
    expect(parsed.tornText).toBe(fragment)
    expect(parsed.changes).toHaveLength(lines.length - 1)
    expect(parsed.bad).toBe(0)
  })

  test('a complete JSON line missing only its newline is an applied change that still needs its newline', () => {
    const live = scripted()
    const text = live.text().slice(0, -1)
    const parsed = parseLedger(text)
    expect(parsed.torn).toBe(true)
    expect(parsed.tornText).toBeNull()
    expect(parsed.changes).toHaveLength(live.changes.length)
    expect(parsed.bad).toBe(0)
    const r = reconcile(null, text)
    expect(r.error).toBeUndefined()
    expect(r.plan).toStrictEqual(live.plan)
  })

  test('corrupt and misshapen complete lines are skipped, counted and returned with their text', () => {
    const live = scripted()
    const lines = live.text().trimEnd().split('\n')
    const garbage = '{"v":1,"rev":'
    const notChange = JSON.stringify({ hello: 'world' })
    const wrongAction = JSON.stringify({ ...JSON.parse(lines[2]), action: 'detonate' })
    const mixed = [lines[0], garbage, lines[1], notChange, '', lines[2], wrongAction, ...lines.slice(3)].join('\n') + '\n'
    const parsed = parseLedger(mixed)
    expect(parsed.bad).toBe(3)
    expect(parsed.badLines.map((b) => b.text)).toEqual([garbage, notChange, wrongAction])
    expect(parsed.badLines.map((b) => b.line)).toEqual([2, 4, 7])
    expect(parsed.changes).toHaveLength(lines.length)
    expect(parsed.torn).toBe(false)
  })

  test('empty text is an empty ledger', () => {
    expect(parseLedger('')).toEqual({ changes: [], torn: false, bad: 0, tornText: null, badLines: [] })
  })
})

describe('parsePlanJson', () => {
  test('reads a stored plan and refuses anything else', () => {
    const live = scripted()
    expect(parsePlanJson(JSON.stringify(live.plan))).toEqual(JSON.parse(JSON.stringify(live.plan)))
    expect(parsePlanJson('{"v":1,')).toBeNull()
    expect(parsePlanJson('[]')).toBeNull()
    expect(parsePlanJson(JSON.stringify({ ...live.plan, items: 'x' }))).toBeNull()
    expect(parsePlanJson(JSON.stringify({ ...live.plan, rev: 'seven' }))).toBeNull()
    expect(parsePlanJson('')).toBeNull()
  })
})

describe('replay', () => {
  test('a scripted live sequence replays to a deep-equal plan, through the serialized ledger', () => {
    const live = scripted()
    const direct = replay(live.changes)
    expect(direct.error).toBeUndefined()
    expect(direct.plan).toStrictEqual(live.plan)

    const viaText = replay(parseLedger(live.text()).changes)
    expect(viaText.error).toBeUndefined()
    expect(viaText.plan).toEqual(JSON.parse(JSON.stringify(live.plan)))
    expect((viaText.plan as Plan).rev).toBe(live.changes.filter((c) => c.denied === null).length)
  })

  test('denied lines do not change state', () => {
    const live = scripted()
    const onlyApplied = live.changes.filter((c) => c.denied === null)
    expect(onlyApplied.length).toBeLessThan(live.changes.length)
    expect(replay(onlyApplied).plan).toStrictEqual(replay(live.changes).plan)
  })

  test('an empty or all-denied ledger has no plan and no error', () => {
    expect(replay([])).toEqual({ plan: null })
    const live = new Live()
    live.step({ action: 'create', title: '', items: [] })
    expect(live.changes[0].denied).not.toBeNull()
    expect(replay(live.changes)).toEqual({ plan: null })
  })

  test('a rev gap is an error and yields no plan', () => {
    const live = scripted()
    const applied = live.changes.filter((c) => c.denied === null)
    const r = replay(applied.filter((c) => c.rev !== 4))
    expect(r.plan).toBeNull()
    expect(r.error).toMatch(/gap.*expected rev 4.*found rev 5/i)
  })

  test('a duplicate rev among applied lines is an error', () => {
    const live = scripted()
    const applied = live.changes.filter((c) => c.denied === null)
    const r = replay([...applied.slice(0, 3), applied[2], ...applied.slice(3)])
    expect(r.plan).toBeNull()
    expect(r.error).toMatch(/duplicate/i)
  })

  test('lines are applied in rev order whatever their order in the array', () => {
    const live = scripted()
    const shuffled = [...live.changes].reverse()
    expect(replay(shuffled).plan).toStrictEqual(live.plan)
  })

  test('the first applied line must be create, and there is only one create', () => {
    const live = scripted()
    const applied = live.changes.filter((c) => c.denied === null)
    expect(replay(applied.slice(1).map((c) => ({ ...c, rev: c.rev - 1 }))).error).toMatch(/before any create/)
    const second: Change = { ...applied[0], rev: applied.length + 1 }
    expect(replay([...applied, second]).error).toMatch(/second plan/)
  })

  test('a line for another plan is an error', () => {
    const live = scripted()
    const changes = live.changes.map((c) => (c.rev === 3 && c.denied === null ? { ...c, plan: 'p-0zzzzzzzz-zzzzzz' } : c))
    expect(replay(changes).error).toMatch(/belongs to plan/)
  })

  test('a line apply refuses is an error rather than a silently different plan', () => {
    const live = scripted()
    // a1's claim_done relabelled as a2's: a2 is not bound, so replay refuses it
    const changes = live.changes.map((c) => (c.action === 'claim_done' && c.rev === 5 ? { ...c, actor: A2 } : c))
    const r = replay(changes)
    expect(r.plan).toBeNull()
    expect(r.error).toMatch(/recorded as applied, but replay refuses it/)
  })

  test('a line whose recorded from/to does not match what replay produces is an error', () => {
    const live = scripted()
    const changes = live.changes.map((c) => (c.rev === 3 && c.denied === null ? { ...c, to: 'abandoned' } : c))
    expect(replay(changes).error).toMatch(/does not match/)
  })

  test('the recorded header decides the action, not a hand-edited data field', () => {
    const live = scripted()
    const changes = live.changes.map((c) =>
      c.action === 'progress' ? { ...c, data: { ...c.data, action: 'abandon', item: 's3' } } : c,
    )
    expect(replay(changes).plan).toStrictEqual(live.plan)
  })

  test('uses the line ts as the clock: timestamps in the replayed plan equal the live ones', () => {
    const live = scripted()
    const p = replay(live.changes).plan as Plan
    expect(p.created).toBe(live.changes[0].ts)
    expect(p.items[0].boundAgent?.at).toBe((live.plan as Plan).items[0].boundAgent?.at)
  })
})

describe('replay and the attempt cap', () => {
  // The cap is a live option that is not in the Change. Replay disables it and trusts non-denied
  // lines, so a cap that differs between the live run and the replay cannot change the outcome.
  function fourAttempts(cap: number): Live {
    const live = new Live(cap)
    live.step({ action: 'create', title: 't', items: [input()] })
    live.step({ action: 'activate', plan: PLAN_ID })
    for (let i = 0; i < 4; i++) {
      expect(live.step({ action: 'claim', ...ref() }, A1).denied).toBeNull()
      live.step({ action: 'fail', ...ref(), note: `red ${i}` }, A1)
    }
    return live
  }

  test('a claim allowed live under a larger cap replays although the default cap would refuse it', () => {
    const live = fourAttempts(10)
    // Applying the same claim lines under the default cap of 3 refuses the fourth attempt...
    const strict = new Live(3)
    strict.step({ action: 'create', title: 't', items: [input()] })
    strict.step({ action: 'activate', plan: PLAN_ID })
    for (let i = 0; i < 3; i++) {
      strict.step({ action: 'claim', ...ref() }, A1)
      strict.step({ action: 'fail', ...ref(), note: 'x' }, A1)
    }
    expect(strict.step({ action: 'claim', ...ref() }, A1).denied).toMatch(/all 3 attempts/)
    // ...but replay reproduces the live plan.
    const r = replay(live.changes)
    expect(r.error).toBeUndefined()
    expect(r.plan).toStrictEqual(live.plan)
    expect(r.plan?.items[0].attempts).toBe(4)
  })

  test('a claim refused live under a small cap stays refused (denied lines are not replayed)', () => {
    const live = new Live(1)
    live.step({ action: 'create', title: 't', items: [input()] })
    live.step({ action: 'activate', plan: PLAN_ID })
    live.step({ action: 'claim', ...ref() }, A1)
    live.step({ action: 'fail', ...ref(), note: 'x' }, A1)
    expect(live.step({ action: 'claim', ...ref() }, A1).denied).toMatch(/all 1 attempts/)
    expect(live.step({ action: 'reopen', ...ref(), extraAttempts: 1 }).denied).toBeNull()
    expect(live.step({ action: 'claim', ...ref() }, A1).denied).toBeNull()
    const r = replay(live.changes)
    expect(r.plan).toStrictEqual(live.plan)
    expect(r.plan?.items[0].attempts).toBe(2)
  })
})

// ---------------------------------------------------------------- property: live apply equals replay

// A small deterministic PRNG, so the property test is reproducible (no Math.random).
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

const AGENTS = [A1, A2, A3, ARCH]

function randomAction(r: () => number, live: Live): { action: Action; actor: Actor } {
  const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)]
  const plan = live.plan
  if (plan === null) {
    const count = 2 + Math.floor(r() * 3)
    const items = Array.from({ length: count }, (_, n) =>
      input({
        title: `item ${n + 1}`,
        deps: n > 0 && r() < 0.5 ? [`s${1 + Math.floor(r() * n)}`] : [],
        checks: r() < 0.4 ? [unit] : [],
        agent: r() < 0.8 ? 'coder' : 'dba',
      }),
    )
    return { action: { action: 'create', title: 'random plan', items }, actor: r() < 0.7 ? main : ARCH }
  }
  const it = pick(plan.items)
  const base = { plan: plan.id, item: it.id }
  const who = (): Actor => (r() < 0.8 && it.boundAgent ? agentFor(it.boundAgent.agentId) : pick(AGENTS))
  const roll = r()
  if (roll < 0.06) return { action: { action: 'activate', plan: plan.id }, actor: r() < 0.9 ? main : pick(AGENTS) }
  if (roll < 0.26) return { action: { action: 'claim', ...base }, actor: pick(AGENTS) }
  if (roll < 0.34) return { action: { action: 'progress', ...base, note: `note ${Math.floor(r() * 100)}` }, actor: who() }
  if (roll < 0.4) return { action: { action: 'block', ...base, note: 'stuck' }, actor: who() }
  if (roll < 0.46) return { action: { action: 'fail', ...base, note: 'red' }, actor: who() }
  if (roll < 0.58) {
    return { action: { action: 'claim_done', ...base, ...evidence(`s${Math.floor(r() * 3)}`) }, actor: who() }
  }
  if (roll < 0.7) {
    const gen = r() < 0.85 ? it.gen : it.gen + 1
    if (it.checks.length > 0) {
      const a: Action = { action: 'verify', ...base, gen, verification: checksVerification(gen, r() < 0.7) }
      return { action: a, actor: main }
    }
    return { action: { action: 'verify', ...base, gen, manual: true, note: 'checked by hand' }, actor: main }
  }
  if (roll < 0.76) {
    const patch: Partial<ItemInput> = r() < 0.5 ? { instructions: `v${Math.floor(r() * 9)}` } : { agent: pick(['coder', 'dba']) }
    return { action: { action: 'amend', plan: plan.id, item: it.id, patch }, actor: main }
  }
  if (roll < 0.8) return { action: { action: 'amend', plan: plan.id, planTitle: `title ${Math.floor(r() * 9)}` }, actor: main }
  if (roll < 0.85) {
    const a = pick(AGENTS)
    return { action: { action: 'assign', ...base, agentId: (a as { agentId: string }).agentId, session: 'sess-1' }, actor: main }
  }
  if (roll < 0.9) return { action: { action: 'reopen', ...base, extraAttempts: Math.floor(r() * 3) }, actor: main }
  if (roll < 0.93) return { action: { action: 'reserve', ...base, agentType: pick(['coder', 'dba']) }, actor: main }
  if (roll < 0.96) {
    const a = pick(AGENTS) as { agentId: string }
    return { action: { action: 'bind', ...base, agentId: a.agentId, session: 'sess-1' }, actor: main }
  }
  if (roll < 0.995) return { action: { action: 'abandon', plan: plan.id, item: it.id }, actor: main }
  return { action: { action: 'abandon', plan: plan.id }, actor: main }
}

const agentFor = (id: string): Actor => AGENTS.find((a) => a.kind === 'agent' && a.agentId === id) ?? A1

describe('property: replaying the serialized ledger reproduces the live plan', () => {
  const kinds = new Set<string>()
  let denied = 0
  let applied = 0

  function run(seed: number, steps: number, everyPrefix: boolean) {
    const r = rng(seed)
    const live = new Live([1, 2, 3, 5][seed % 4])
    for (let i = 0; i < steps; i++) {
      const { action, actor } = randomAction(r, live)
      const out = live.step(action, actor)
      if (out.denied === null) {
        applied++
        kinds.add(action.action)
      } else denied++
      if (everyPrefix) {
        const rep = replay(parseLedger(live.text()).changes)
        expect(rep.error).toBeUndefined()
        expect(rep.plan).toEqual(JSON.parse(JSON.stringify(live.plan)))
      }
    }
    const rep = replay(parseLedger(live.text()).changes)
    expect(rep.error).toBeUndefined()
    expect(rep.plan).toEqual(JSON.parse(JSON.stringify(live.plan)))
    expect(rep.plan).toStrictEqual(live.plan)
  }

  test('every prefix of a few long runs', () => {
    for (let seed = 1; seed <= 8; seed++) run(seed, 60, true)
  })

  test('200 seeded runs with and without denials', () => {
    for (let seed = 100; seed < 300; seed++) run(seed, 80, false)
  })

  test('the generator exercised both denials and every transition', () => {
    expect(denied).toBeGreaterThan(100)
    expect(applied).toBeGreaterThan(500)
    for (const k of ['create', 'activate', 'claim', 'progress', 'block', 'fail', 'claim_done', 'verify', 'amend', 'assign', 'reopen', 'abandon', 'bind', 'reserve']) {
      expect(kinds.has(k)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------- reconcile

describe('needsReplay', () => {
  const live = scripted()
  const plan = live.plan as Plan
  const last = `${JSON.stringify(live.changes[live.changes.length - 1])}\n`

  test('a missing or corrupt JSON always needs a replay', () => {
    expect(needsReplay(null, last)).toBe(true)
    expect(needsReplay(null, null)).toBe(true)
  })

  test('a tail at or behind the JSON rev does not', () => {
    expect(needsReplay(plan, last)).toBe(false)
    expect(needsReplay({ ...plan, rev: plan.rev + 3 }, last)).toBe(false)
  })

  test('a tail ahead of the JSON does (crash between append and publish)', () => {
    expect(needsReplay({ ...plan, rev: plan.rev - 1 }, last)).toBe(true)
  })

  test('a tail that is torn or unreadable cannot be trusted', () => {
    expect(needsReplay(plan, last.slice(0, -1))).toBe(true)
    expect(needsReplay(plan, '{"v":1,"rev"\n')).toBe(true)
    expect(needsReplay(plan, '{"hello":1}\n')).toBe(true)
  })

  test('an empty ledger with a JSON present does not', () => {
    expect(needsReplay(plan, '')).toBe(false)
    expect(needsReplay(plan, null)).toBe(false)
  })
})

describe('reconcile', () => {
  test('uses the JSON when it is at the ledger rev', () => {
    const live = scripted()
    const r = reconcile(live.plan, live.text())
    expect(r.source).toBe('json')
    expect(r.plan).toBe(live.plan as Plan)
    expect(r.error).toBeUndefined()
    expect(r.jsonAhead).toBe(false)
  })

  test('rebuilds from the ledger when the JSON is behind: a crash after append, before publish', () => {
    const before = scripted()
    const stale = JSON.parse(JSON.stringify(before.plan)) as Plan
    // one more mutation reaches the ledger but never the JSON
    before.step({ action: 'reopen', ...ref('s1') })
    const r = reconcile(stale, before.text())
    expect(r.source).toBe('ledger')
    expect(r.error).toBeUndefined()
    expect(r.plan).toStrictEqual(before.plan)
    // and the next mutation continues with consecutive revs, no duplicate
    const next = apply(r.plan, { action: 'amend', plan: PLAN_ID, planTitle: 'later' }, {
      actor: main,
      nowMs: T0 + 999999,
      attemptCap: 3,
      newPlanId: PLAN_ID,
      op: 'op-next',
      project: '/repo',
    })
    if ('denied' in next) throw new Error(next.denied)
    expect(next.change.rev).toBe((before.plan as Plan).rev + 1)
  })

  test('rebuilds when the JSON is missing or corrupt', () => {
    const live = scripted()
    const r = reconcile(null, live.text())
    expect(r.source).toBe('ledger')
    expect(r.plan).toStrictEqual(live.plan)
  })

  test('a new plan: no JSON and no ledger', () => {
    const r = reconcile(null, '')
    expect(r).toMatchObject({ plan: null, source: 'none' })
    expect(r.error).toBeUndefined()
  })

  test('a torn tail is reported and is not part of the state', () => {
    const live = scripted()
    const before = live.plan as Plan
    const torn = live.text() + '{"v":1,"rev":99,"ts"'
    const r = reconcile(before, torn)
    expect(r.torn).toBe(true)
    expect(r.tornText).toBe('{"v":1,"rev":99,"ts"')
    expect(r.plan).toBe(before)
    const rebuilt = reconcile(null, torn)
    expect(rebuilt.plan).toStrictEqual(before)
    expect(rebuilt.torn).toBe(true)
  })

  test('corrupt lines are quarantined, not dropped, and replay still succeeds when they are not applied lines', () => {
    const live = scripted()
    const lines = live.text().trimEnd().split('\n')
    const text = [lines[0], 'garbage', ...lines.slice(1)].join('\n') + '\n'
    const r = reconcile(null, text)
    expect(r.badLines).toHaveLength(1)
    expect(r.badLines[0].text).toBe('garbage')
    expect(r.plan).toStrictEqual(live.plan)
  })

  test('a ledger ahead of the JSON that cannot be replayed is an error, never the stale JSON', () => {
    const live = scripted()
    const stale = { ...(JSON.parse(JSON.stringify(live.plan)) as Plan), rev: 2 }
    const lines = live.text().trimEnd().split('\n').filter((l) => JSON.parse(l).rev !== 5 || JSON.parse(l).denied !== null)
    const r = reconcile(stale, lines.join('\n') + '\n')
    expect(r.plan).toBeNull()
    expect(r.error).toMatch(/gap/i)
  })

  test('a JSON ahead of a ledger that lost its tail is kept and flagged', () => {
    const live = scripted()
    const lines = live.text().trimEnd().split('\n')
    const r = reconcile(live.plan, lines.slice(0, 5).join('\n') + '\n')
    expect(r.source).toBe('json')
    expect(r.jsonAhead).toBe(true)
    expect(r.plan).toBe(live.plan as Plan)
  })
})

describe('findOp', () => {
  test('finds the last line that carries an op, applied or denied', () => {
    const live = scripted()
    expect(findOp(live.changes, 'op-3')?.rev).toBe(2) // the activate
    expect(findOp(live.changes, 'op-3')?.action).toBe('activate')
    expect(findOp(live.changes, 'op-2')?.denied).not.toBeNull() // the denied claim
    expect(findOp(live.changes, 'nope')).toBeNull()
  })
})
