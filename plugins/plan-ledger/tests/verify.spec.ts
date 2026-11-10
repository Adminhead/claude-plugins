import { describe, expect, test } from 'bun:test'
import { apply } from '../hooks/plan/apply'
import { checksHash } from '../hooks/plan/checks'
import {
  CRASH_EXIT,
  commandFor,
  fingerprint,
  gateQuestion,
  judge,
  outTail,
  summarize,
  treeArgvs,
  verdictOf,
} from '../hooks/plan/verify'
import type { Actor, Check, CheckResult, Item, Tree } from '../hooks/plan/types'

const unit: Check = { label: 'unit', argv: ['bun', 'test', 'x'], expectExit: 0 }
const lint: Check = { label: 'lint', argv: ['bun', 'lint'], expectExit: 0 }
const refute: Check = { label: 'refute', argv: ['grep', '-q', 'x', 'f'], expectExit: 1 }

const item = (checks: Check[] = [unit, lint]): Item => ({
  id: 's1',
  title: 't',
  instructions: 'i',
  acceptance: [],
  files: [],
  deps: [],
  agent: 'coder',
  model: 'sonnet',
  checks,
  status: 'claimed_done',
  attempts: 1,
  extraAttempts: 0,
  gen: 2,
  boundAgent: null,
  reservedFor: null,
  claimed: null,
  verification: null,
  note: null,
  failure: null,
})

const pass = (c: Check, exit = c.expectExit): CheckResult => ({ label: c.label, exit, expectExit: c.expectExit, outTail: 'out' })
const tree: Tree = { head: 'a'.repeat(40), fingerprint: fingerprint('d', 's') }

describe('treeArgvs and fingerprint', () => {
  test('the git commands are fixed argv', () => {
    const safe = ['git', '-c', 'core.fsmonitor=false', '--no-optional-locks']
    expect(treeArgvs()).toEqual({
      head: [...safe, 'rev-parse', 'HEAD'],
      diff: [...safe, 'diff', '--no-ext-diff', '--no-textconv', 'HEAD'],
      status: [...safe, 'status', '--porcelain'],
    })
  })

  test('no git command can start a program named by the repository\'s own config', () => {
    for (const argv of Object.values(treeArgvs())) {
      const sub = argv.findIndex((a) => ['rev-parse', 'diff', 'status'].includes(a))
      // the global options come before the subcommand: fsmonitor off, no optional locks
      expect(argv.slice(0, sub)).toEqual(expect.arrayContaining(['-c', 'core.fsmonitor=false', '--no-optional-locks']))
    }
    expect(treeArgvs().diff).toEqual(expect.arrayContaining(['--no-ext-diff', '--no-textconv']))
  })

  test('the fingerprint changes with either input and not between the two', () => {
    const base = fingerprint('diff', 'status')
    expect(fingerprint('diff', 'status')).toBe(base)
    expect(fingerprint('diff2', 'status')).not.toBe(base)
    expect(fingerprint('diff', 'status2')).not.toBe(base)
    // moving text between the diff and the status must not collide
    expect(fingerprint('ab', 'c')).not.toBe(fingerprint('a', 'bc'))
  })
})

describe('judge', () => {
  const it = item()
  const good = [pass(unit), pass(lint)]

  test('passing results make an ok verification bound to this gen, cwd and checks', () => {
    const j = judge(it, good, tree, { ...tree }, { cwd: '/w', at: 'T' })
    expect(j).toMatchObject({
      ok: true,
      verification: { kind: 'checks', ok: true, gen: 2, cwd: '/w', at: 'T', checksHash: checksHash(it.checks), note: null },
    })
    expect(j.ok && j.verification.results).toEqual(good)
  })

  test('a failing check is a recordable verification with ok false', () => {
    const j = judge(it, [pass(unit, 1), pass(lint)], tree, tree)
    expect(j.ok && j.verification.ok).toBe(false)
  })

  test('expectExit is honoured in both directions', () => {
    const r = item([refute])
    expect(judge(r, [pass(refute, 1)], tree, tree)).toMatchObject({ ok: true, verification: { ok: true } })
    expect(judge(r, [pass(refute, 0)], tree, tree)).toMatchObject({ ok: true, verification: { ok: false } })
  })

  test('a crashed run is never a pass, even if it matches nothing else', () => {
    const j = judge(item([unit]), [{ ...pass(unit, CRASH_EXIT) }], tree, tree)
    expect(j.ok && j.verification.ok).toBe(false)
    const weird: Check = { label: 'w', argv: ['x'], expectExit: CRASH_EXIT }
    expect(judge(item([weird]), [pass(weird, CRASH_EXIT)], tree, tree)).toMatchObject({ ok: false })
  })

  test('missing, extra, duplicated and reordered results are refused', () => {
    expect(judge(it, [pass(unit)], tree, tree)).toMatchObject({ ok: false })
    expect(judge(it, [pass(unit), pass(lint), pass(lint)], tree, tree)).toMatchObject({ ok: false })
    expect(judge(it, [pass(unit), pass(unit)], tree, tree)).toMatchObject({ ok: false })
    expect(judge(it, [pass(lint), pass(unit)], tree, tree)).toMatchObject({ ok: false })
    expect(judge(it, [], tree, tree)).toMatchObject({ ok: false })
  })

  test('a result with a different expectExit or a non-integer exit is refused', () => {
    expect(judge(it, [{ ...pass(unit), expectExit: 1 }, pass(lint)], tree, tree)).toMatchObject({ ok: false })
    expect(judge(it, [{ ...pass(unit), exit: 0.5 }, pass(lint)], tree, tree)).toMatchObject({ ok: false })
    expect(judge(it, [{ ...pass(unit), exit: '0' as unknown as number }, pass(lint)], tree, tree)).toMatchObject({ ok: false })
    expect(judge(it, [{ ...pass(unit), outTail: undefined as unknown as string }, pass(lint)], tree, tree)).toMatchObject({ ok: false })
  })

  test('the checks that ran must hash like the item checks', () => {
    expect(judge(it, good, tree, tree, { ranHash: checksHash([unit]) })).toMatchObject({ ok: false })
    expect(judge(it, good, tree, tree, { ranHash: checksHash(it.checks) })).toMatchObject({ ok: true })
  })

  test('a changed HEAD is refused, even when every check passed', () => {
    const j = judge(it, good, tree, { ...tree, head: 'b'.repeat(40) })
    expect(j).toMatchObject({ ok: false })
    expect(!j.ok && j.why).toContain('HEAD moved')
  })

  test('a changed fingerprint is refused', () => {
    expect(judge(it, good, tree, { ...tree, fingerprint: fingerprint('other', 's') })).toMatchObject({ ok: false })
  })

  test('a changed tree is refused when a check failed too (nothing is recorded from a moving tree)', () => {
    expect(judge(it, [pass(unit, 1), pass(lint)], tree, { ...tree, head: 'c'.repeat(40) })).toMatchObject({ ok: false })
  })

  test('a tree that could not be read is refused', () => {
    expect(judge(it, good, null, tree)).toMatchObject({ ok: false })
    expect(judge(it, good, tree, null)).toMatchObject({ ok: false })
  })

  test('an item without checks has nothing to judge', () => {
    expect(judge(item([]), [], tree, tree)).toMatchObject({ ok: false })
  })

  test('long output tails are cut to the limit', () => {
    const j = judge(item([unit]), [{ ...pass(unit), outTail: 'x'.repeat(5000) }], tree, tree)
    expect(j.ok && j.verification.results[0].outTail.length).toBe(400)
  })
})

describe('judge satisfies apply (verificationProblem is the contract)', () => {
  const main: Actor = { kind: 'main' }
  const a1: Actor = { kind: 'agent', agentId: 'a1', agentType: 'coder', session: 's' }
  const ctx = (actor: Actor, n: number) => ({
    actor,
    nowMs: Date.UTC(2026, 10, 9) + n * 1000,
    attemptCap: 3,
    newPlanId: 'p-0abcdefgh-abc123',
    op: `op${n}`,
    project: '/repo',
  })

  function claimedPlan() {
    const steps: [any, Actor][] = [
      [{ action: 'create', title: 'P', items: [{ title: 't', instructions: 'i', acceptance: ['a'], files: [], deps: [], agent: 'coder', model: 'sonnet', checks: [unit, lint] }] }, main],
      [{ action: 'activate', plan: 'p-0abcdefgh-abc123' }, main],
      [{ action: 'claim', plan: 'p-0abcdefgh-abc123', item: 's1' }, a1],
      [{ action: 'claim_done', plan: 'p-0abcdefgh-abc123', item: 's1', summary: 's', commands: [], commits: [], files: [] }, a1],
    ]
    let plan: any = null
    steps.forEach(([action, actor], i) => {
      const r = apply(plan, action, ctx(actor, i + 1))
      if ('denied' in r) throw new Error(r.denied)
      plan = r.plan
    })
    return plan
  }

  test('a judged verification is accepted by apply, passing or failing, and a stale gen is not', () => {
    const plan = claimedPlan()
    const it = plan.items[0] as Item
    const verify = (v: any, gen = it.gen) =>
      apply(plan, { action: 'verify', plan: plan.id, item: 's1', gen, verification: v }, ctx(main, 9))
    const passing = judge(it, [pass(unit), pass(lint)], tree, tree, { cwd: '/w', at: 'T' })
    const failing = judge(it, [pass(unit, 1), pass(lint)], tree, tree, { cwd: '/w', at: 'T' })
    expect(passing.ok && verify(passing.verification)).toMatchObject({ plan: { items: [{ status: 'verified' }] } })
    expect(failing.ok && verify(failing.verification)).toMatchObject({ plan: { items: [{ status: 'failed' }] } })
    expect(passing.ok && verify(passing.verification, it.gen - 1)).toHaveProperty('denied')
    // the checks changed after the run: apply refuses what judge allowed
    const amended = { ...plan, items: [{ ...it, checks: [unit] }] }
    expect(passing.ok && apply(amended, { action: 'verify', plan: plan.id, item: 's1', gen: it.gen, verification: passing.verification }, ctx(main, 10))).toHaveProperty('denied')
  })
})

describe('words and verdicts', () => {
  test('verdictOf trusts only an exact allow or deny', () => {
    expect(verdictOf({ decision: 'allow' })).toBe('allow')
    expect(verdictOf({ decision: 'deny', reason: 'r' })).toBe('deny')
    for (const v of [{ decision: 'ask' }, {}, null, undefined, 'allow', { decision: 'ALLOW' }, { decision: 1 }, []]) {
      expect(verdictOf(v)).toBe('ask')
    }
  })

  test('the gate question shows the exact argv and directory, escaped', () => {
    const q = gateQuestion({ label: 'x', argv: ['sh', '-c', 'echo "hi"\nrm -rf /'], expectExit: 0 }, '/w/my dir')
    expect(q).toContain(JSON.stringify(['sh', '-c', 'echo "hi"\nrm -rf /']))
    expect(q).toContain('"/w/my dir"')
    expect(q).not.toContain('\n')
  })

  test('the gate question ends in a question mark, and a label cannot add lines or hide the end of it', () => {
    for (const label of ['unit', 'a\nb\u001b[2Jc', 'x'.repeat(500)]) {
      const q = gateQuestion({ label, argv: ['bun', 'test'], expectExit: 0 }, '/w')
      expect(q.endsWith('?')).toBe(true)
      expect(q).not.toMatch(/[\u0000-\u001f]/)
      expect(q.length).toBeLessThan(400)
    }
  })

  test('commandFor quotes every word', () => {
    expect(commandFor(['echo', "a'b"])).toBe(`'echo' 'a'\\''b'`)
  })

  test('outTail keeps the end of stdout then stderr', () => {
    expect(outTail('a', 'b')).toBe('a\nb')
    expect(outTail('a', '')).toBe('a')
    expect(outTail(undefined, null)).toBe('')
    expect(outTail('x'.repeat(1000), 'tail').endsWith('tail')).toBe(true)
    expect(outTail('x'.repeat(1000), 'tail').length).toBe(400)
  })

  test('summarize names the checks, the commit and the directory, and the failing output', () => {
    const j = judge(item(), [pass(unit), pass(lint, 2)], { ...tree, head: 'abcdef1234567890' + '0'.repeat(24) }, { ...tree, head: 'abcdef1234567890' + '0'.repeat(24) }, { cwd: '/w' })
    expect(j.ok).toBe(true)
    const s = summarize('s1', (j as any).verification)
    expect(s).toContain('s1 failed by command')
    expect(s).toContain('unit exit 0')
    expect(s).toContain('lint exit 2 (expected 0): out')
    expect(s).toContain('abcdef123456')
    expect(s).toContain('in /w')
  })
})
