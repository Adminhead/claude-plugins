import { describe, expect, test } from 'bun:test'
import { authorize, canView, normalizeAgentType } from '../hooks/plan/authorize'
import type { Action, Actor, Item, Plan } from '../hooks/plan/types'

const PLAN_ID = 'p-0abcdefgh-abc123'

const main: Actor = { kind: 'main' }
const agent = (agentId: string, agentType: string | null, session = 'sess-1'): Actor => ({
  kind: 'agent',
  agentId,
  agentType,
  session,
})

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

function plan(over: Partial<Plan> = {}, items: Item[] = [item()]): Plan {
  return {
    v: 1,
    id: PLAN_ID,
    title: 'p',
    rev: 1,
    created: '2026-11-09T00:00:00.000Z',
    project: '/repo',
    status: 'active',
    creator: main,
    items,
    ...over,
  }
}

const bound = (agentId: string, session = 'sess-1') => ({ agentId, session, at: '2026-11-09T00:00:00.000Z' })

const ref = { plan: PLAN_ID, item: 's1' }
const createAction: Action = { action: 'create', title: 'p', items: [] }
const ACTIONS: Record<string, Action> = {
  create: createAction,
  activate: { action: 'activate', plan: PLAN_ID },
  claim: { action: 'claim', ...ref },
  progress: { action: 'progress', note: 'n', ...ref },
  block: { action: 'block', note: 'n', ...ref },
  fail: { action: 'fail', note: 'n', ...ref },
  claim_done: { action: 'claim_done', summary: 's', commands: [], commits: [], files: [], ...ref },
  verify: { action: 'verify', gen: 1, ...ref },
  amend: { action: 'amend', plan: PLAN_ID, item: 's1', patch: { title: 'x' } },
  assign: { action: 'assign', agentId: 'a1', session: 'sess-1', ...ref },
  reopen: { action: 'reopen', ...ref },
  abandon: { action: 'abandon', plan: PLAN_ID },
  bind: { action: 'bind', agentId: 'a1', session: 'sess-1', ...ref },
  reserve: { action: 'reserve', agentType: 'coder', ...ref },
  list: { action: 'list' },
  status: { action: 'status', plan: PLAN_ID },
  get: { action: 'get', ...ref },
}
const NAMES = Object.keys(ACTIONS)

// Run an action against a plan (null for create/list) as an actor.
function run(name: string, actor: Actor, p: Plan | null = plan()) {
  const a = ACTIONS[name]
  return authorize(name === 'create' ? null : p, a, actor)
}
const ok = (r: { ok: boolean }) => r.ok

describe('main loop', () => {
  test('may take every action of the transition table', () => {
    for (const name of NAMES) {
      expect({ name, ok: ok(run(name, main)) }).toEqual({ name, ok: true })
    }
  })

  test('create needs no plan; every plan-bound action needs one', () => {
    expect(authorize(null, createAction, main).ok).toBe(true)
    for (const name of NAMES.filter((n) => !['create', 'list'].includes(n))) {
      expect({ name, ok: authorize(null, ACTIONS[name], main).ok }).toEqual({ name, ok: false })
    }
  })

  test('create is refused when a plan is already loaded', () => {
    expect(authorize(plan(), createAction, main).ok).toBe(false)
  })

  test('an action naming a different plan than the loaded one is refused', () => {
    const other = plan({ id: 'p-0zzzzzzzz-zzzzzz' })
    for (const name of NAMES.filter((n) => !['create', 'list'].includes(n))) {
      expect({ name, ok: authorize(other, ACTIONS[name], main).ok }).toEqual({ name, ok: false })
    }
  })

  test('status without a plan is an overview and is allowed', () => {
    expect(authorize(null, { action: 'status' }, main).ok).toBe(true)
  })
})

describe('architect', () => {
  const arch = agent('arch-1', 'architect')

  test('may create (the new plan is always a draft) and list', () => {
    expect(authorize(null, createAction, arch).ok).toBe(true)
    expect(authorize(null, ACTIONS.list, arch).ok).toBe(true)
  })

  test('may not create when a plan is loaded', () => {
    expect(authorize(plan({ status: 'draft' }), createAction, arch).ok).toBe(false)
  })

  test('may read status and get only on a plan it created in this session', () => {
    const mine = plan({ status: 'draft', creator: arch })
    expect(authorize(mine, ACTIONS.status, arch).ok).toBe(true)
    expect(authorize(mine, ACTIONS.get, arch).ok).toBe(true)
    expect(authorize(null, { action: 'status' }, arch).ok).toBe(true)

    const byMain = plan({ status: 'draft' })
    expect(authorize(byMain, ACTIONS.status, arch).ok).toBe(false)
    expect(authorize(byMain, ACTIONS.get, arch).ok).toBe(false)

    const byOtherArchitect = plan({ status: 'draft', creator: agent('arch-2', 'architect') })
    expect(authorize(byOtherArchitect, ACTIONS.get, arch).ok).toBe(false)

    const earlierSession = plan({ status: 'draft', creator: agent('arch-1', 'architect', 'sess-0') })
    expect(authorize(earlierSession, ACTIONS.get, arch).ok).toBe(false)
  })

  test('may do nothing else, even on its own plan or an item bound to it', () => {
    const mine = plan({ status: 'active', creator: arch }, [item({ boundAgent: bound('arch-1'), agent: 'architect' })])
    for (const name of NAMES.filter((n) => !['create', 'list', 'status', 'get'].includes(n))) {
      expect({ name, ok: ok(run(name, arch, mine)) }).toEqual({ name, ok: false })
    }
  })

  test('the plugin prefix is tolerated on the architect type', () => {
    expect(authorize(null, createAction, agent('arch-1', 'plugin:architect')).ok).toBe(true)
  })
})

describe('listed agent (coder)', () => {
  const me = agent('coder-1', 'coder')

  test('may list and status', () => {
    expect(run('list', me).ok).toBe(true)
    expect(run('status', me).ok).toBe(true)
    expect(authorize(null, { action: 'status' }, me).ok).toBe(true)
  })

  test('status naming a plan that does not exist is refused', () => {
    expect(authorize(null, ACTIONS.status, me).ok).toBe(false)
  })

  test('an unbound item of its type: may get and claim', () => {
    expect(run('get', me).ok).toBe(true)
    expect(run('claim', me).ok).toBe(true)
  })

  test('an unbound item meant for a different type: no get, no claim', () => {
    const p = plan({}, [item({ agent: 'dba' })])
    expect(run('get', me, p).ok).toBe(false)
    expect(run('claim', me, p).ok).toBe(false)
  })

  test('reservedFor excludes other types even when item.agent matches', () => {
    const p = plan({}, [item({ reservedFor: 'dba' })])
    expect(run('get', me, p).ok).toBe(false)
    expect(run('claim', me, p).ok).toBe(false)
    const mineReserved = plan({}, [item({ reservedFor: 'coder' })])
    expect(run('claim', me, mineReserved).ok).toBe(true)
  })

  test('a reservation for another type does not bar the bound agent', () => {
    const p = plan({}, [item({ reservedFor: 'dba', boundAgent: bound('coder-1'), status: 'in_progress' })])
    expect(run('claim_done', me, p).ok).toBe(true)
  })

  test('claim needs an active plan; get does not', () => {
    for (const status of ['draft', 'abandoned', 'done'] as const) {
      const p = plan({ status })
      expect({ status, claim: run('claim', me, p).ok }).toEqual({ status, claim: false })
      expect({ status, get: run('get', me, p).ok }).toEqual({ status, get: true })
    }
  })

  test('the bound agent may get, claim, progress, block, fail and claim_done its item', () => {
    const p = plan({}, [item({ boundAgent: bound('coder-1'), status: 'in_progress' })])
    for (const name of ['get', 'claim', 'progress', 'block', 'fail', 'claim_done']) {
      expect({ name, ok: run(name, me, p).ok }).toEqual({ name, ok: true })
    }
  })

  test('bound agent keeps access even if the item type no longer matches its own', () => {
    const p = plan({}, [item({ agent: 'dba', boundAgent: bound('coder-1'), status: 'in_progress' })])
    expect(run('progress', me, p).ok).toBe(true)
  })

  test('an item bound to another agent is refused every agent action', () => {
    const p = plan({}, [item({ boundAgent: bound('coder-2'), status: 'in_progress' })])
    for (const name of ['get', 'claim', 'progress', 'block', 'fail', 'claim_done']) {
      const r = run(name, me, p)
      expect({ name, ok: r.ok }).toEqual({ name, ok: false })
    }
  })

  test('the denial reason tells the model what to do', () => {
    const p = plan({}, [item({ boundAgent: bound('coder-2'), status: 'in_progress' })])
    const r = run('claim_done', me, p)
    expect(r.ok === false && r.reason).toContain('Ask the orchestrator to assign it')
    const draft = run('claim', me, plan({ status: 'draft' }))
    expect(draft.ok === false && draft.reason).toContain('activate the plan first')
  })

  test('progress, block, fail and claim_done need the binding: an unbound item is refused', () => {
    for (const name of ['progress', 'block', 'fail', 'claim_done']) {
      expect({ name, ok: run(name, me).ok }).toEqual({ name, ok: false })
    }
  })

  test('an item that does not exist is refused', () => {
    const a: Action = { action: 'claim', plan: PLAN_ID, item: 's9' }
    expect(authorize(plan(), a, me).ok).toBe(false)
  })

  test('takeover of another agent\'s binding: only from an earlier session, failed or blocked, matching type', () => {
    const stale = (over: Partial<Item>) =>
      plan({}, [item({ boundAgent: bound('coder-2', 'sess-0'), ...over })])
    expect(run('claim', me, stale({ status: 'failed' })).ok).toBe(true)
    expect(run('claim', me, stale({ status: 'blocked' })).ok).toBe(true)
    // wrong status
    for (const status of ['pending', 'in_progress', 'claimed_done', 'verified', 'abandoned'] as const) {
      expect({ status, ok: run('claim', me, stale({ status })).ok }).toEqual({ status, ok: false })
    }
    // same session as the binding
    const sameSession = plan({}, [item({ boundAgent: bound('coder-2', 'sess-1'), status: 'failed' })])
    expect(run('claim', me, sameSession).ok).toBe(false)
    // wrong type or reserved for another type
    expect(run('claim', me, stale({ status: 'failed', agent: 'dba' })).ok).toBe(false)
    expect(run('claim', me, stale({ status: 'failed', reservedFor: 'dba' })).ok).toBe(false)
    // inactive plan
    const inactive = plan({ status: 'draft' }, [item({ boundAgent: bound('coder-2', 'sess-0'), status: 'failed' })])
    expect(run('claim', me, inactive).ok).toBe(false)
  })

  test('takeover does not extend to get or the bound-only actions', () => {
    const p = plan({}, [item({ boundAgent: bound('coder-2', 'sess-0'), status: 'failed' })])
    for (const name of ['get', 'progress', 'block', 'fail', 'claim_done']) {
      expect({ name, ok: run(name, me, p).ok }).toEqual({ name, ok: false })
    }
  })

  test('the plugin prefix is tolerated on both the caller and the item type', () => {
    expect(run('claim', agent('c', 'coder:coder')).ok).toBe(true)
    expect(run('claim', agent('c', 'coder'), plan({}, [item({ agent: 'coder:coder' })])).ok).toBe(true)
    expect(run('claim', agent('c', 'x:coder'), plan({}, [item({ reservedFor: 'coder' })])).ok).toBe(true)
    expect(run('claim', agent('c', 'x:dba')).ok).toBe(false)
    expect(run('claim', agent('c', 'coder:dba')).ok).toBe(false)
  })

  test('type matching is exact: no substring or case folding', () => {
    expect(run('claim', agent('c', 'coder2')).ok).toBe(false)
    expect(run('claim', agent('c', 'Coder')).ok).toBe(false)
    expect(run('claim', agent('c', 'cod')).ok).toBe(false)
  })

  test('an item with no agent type matches nobody', () => {
    const p = plan({}, [item({ agent: '' })])
    expect(run('claim', me, p).ok).toBe(false)
    expect(run('get', me, p).ok).toBe(false)
  })
})

describe('agents can never use orchestrator-only actions', () => {
  const actors: Actor[] = [
    agent('coder-1', 'coder'),
    agent('arch-1', 'architect'),
    agent('rev-1', 'reviewer'),
    agent('coder-2', 'coder', 'sess-0'),
  ]
  const forbidden = ['activate', 'verify', 'amend', 'assign', 'reopen', 'abandon', 'bind', 'reserve']
  // Bound to coder-1 and in every status, so ownership and status cannot be what saves it.
  const statuses = ['pending', 'in_progress', 'blocked', 'claimed_done', 'verified', 'failed', 'abandoned'] as const

  test('activate, verify, amend, assign, reopen, abandon, bind and reserve are refused', () => {
    for (const actor of actors) {
      for (const status of statuses) {
        const p = plan({}, [item({ boundAgent: bound('coder-1'), status })])
        for (const name of forbidden) {
          expect({ actor, status, name, ok: run(name, actor, p).ok }).toEqual({ actor, status, name, ok: false })
        }
      }
    }
  })

  test('create is refused for every agent type except architect', () => {
    for (const type of ['coder', 'reviewer', 'dba', 'debugger']) {
      expect({ type, ok: authorize(null, createAction, agent('x', type)).ok }).toEqual({ type, ok: false })
    }
  })

  test('a verify cannot smuggle a prebuilt verification past the actor check', () => {
    const a: Action = {
      action: 'verify',
      gen: 1,
      ...ref,
      verification: {
        kind: 'checks',
        ok: true,
        gen: 1,
        cwd: '/',
        checksHash: 'x',
        results: [],
        before: null,
        after: null,
        note: null,
        at: 'now',
      },
    }
    const p = plan({}, [item({ boundAgent: bound('coder-1'), status: 'claimed_done' })])
    expect(authorize(p, a, agent('coder-1', 'coder')).ok).toBe(false)
  })
})

describe('unlisted callers (agentType null)', () => {
  const ghost = agent('workflow-7', null)

  test('are refused every action, including a get on an item that would match their id', () => {
    const p = plan({}, [item({ boundAgent: bound('workflow-7'), status: 'in_progress' })])
    for (const name of NAMES) {
      expect({ name, ok: run(name, ghost, p).ok }).toEqual({ name, ok: false })
    }
  })

  test('an empty or whitespace type, or a bare plugin prefix, is treated as unlisted', () => {
    for (const type of ['', '   ', 'coder:', ':']) {
      expect({ type, ok: run('get', agent('a', type)).ok }).toEqual({ type, ok: false })
    }
  })

  test('a non-string type is unlisted', () => {
    const odd = { kind: 'agent', agentId: 'a', agentType: 7, session: 's' } as unknown as Actor
    expect(run('get', odd).ok).toBe(false)
  })

  test('an empty agentId is refused even with a type', () => {
    expect(run('get', agent('', 'coder')).ok).toBe(false)
    expect(authorize(null, createAction, agent('', 'architect')).ok).toBe(false)
  })

  test('a missing session is refused', () => {
    const odd = { kind: 'agent', agentId: 'a', agentType: 'coder' } as unknown as Actor
    expect(run('get', odd).ok).toBe(false)
  })
})

describe('authorize is total', () => {
  test('unknown action names are denied for main and agents', () => {
    for (const name of ['nope', '', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'CLAIM']) {
      const a = { action: name, plan: PLAN_ID, item: 's1' } as unknown as Action
      expect({ name, main: authorize(plan(), a, main).ok }).toEqual({ name, main: false })
      expect({ name, agent: authorize(plan(), a, agent('c', 'coder')).ok }).toEqual({ name, agent: false })
    }
  })

  test('a malformed action is denied', () => {
    for (const a of [null, undefined, 'claim', 7, {}, { action: 7 }, { action: ['claim'] }]) {
      expect(authorize(plan(), a as unknown as Action, main).ok).toBe(false)
    }
  })

  test('a malformed actor is denied', () => {
    for (const actor of [null, undefined, 'main', 7, {}, { kind: 'root' }, { kind: 'Main' }, { kind: ['main'] }]) {
      expect(authorize(plan(), ACTIONS.get, actor as unknown as Actor).ok).toBe(false)
      expect(authorize(null, createAction, actor as unknown as Actor).ok).toBe(false)
    }
  })

  test('a malformed plan is denied for agents and never throws', () => {
    const me = agent('coder-1', 'coder')
    for (const p of ['plan', 7, {}, { id: PLAN_ID }, { id: PLAN_ID, items: null }, { id: PLAN_ID, items: [null] }]) {
      expect(() => authorize(p as unknown as Plan, ACTIONS.claim, me)).not.toThrow()
      expect(authorize(p as unknown as Plan, ACTIONS.claim, me).ok).toBe(false)
    }
  })

  test('a malformed item id is denied for agents', () => {
    const me = agent('coder-1', 'coder')
    for (const id of [undefined, null, 1, {}, ['s1']]) {
      const a = { action: 'claim', plan: PLAN_ID, item: id } as unknown as Action
      expect(authorize(plan(), a, me).ok).toBe(false)
    }
  })

  test('an agent action with a prototype-like item id finds nothing', () => {
    const a = { action: 'claim', plan: PLAN_ID, item: '__proto__' } as unknown as Action
    expect(authorize(plan(), a, agent('c', 'coder')).ok).toBe(false)
  })

  test('a plan whose creator is missing grants the architect nothing', () => {
    const p = plan({ status: 'draft' })
    delete (p as { creator?: Actor }).creator
    expect(authorize(p, ACTIONS.get, agent('arch-1', 'architect')).ok).toBe(false)
  })
})

describe('canView', () => {
  const byArch = plan({ status: 'draft', creator: agent('arch-1', 'architect') })
  const byMain = plan()

  test('main sees every plan', () => {
    expect(canView(byArch, main)).toBe(true)
    expect(canView(byMain, main)).toBe(true)
  })

  test('an architect sees only plans it created', () => {
    expect(canView(byArch, agent('arch-1', 'architect'))).toBe(true)
    expect(canView(byMain, agent('arch-1', 'architect'))).toBe(false)
    expect(canView(byArch, agent('arch-2', 'architect'))).toBe(false)
  })

  test('other listed agents see every plan; unlisted and malformed callers see none', () => {
    expect(canView(byMain, agent('c', 'coder'))).toBe(true)
    expect(canView(byMain, agent('c', null))).toBe(false)
    expect(canView(byMain, agent('', 'coder'))).toBe(false)
    expect(canView(byMain, null as unknown as Actor)).toBe(false)
    expect(canView(byMain, { kind: 'x' } as unknown as Actor)).toBe(false)
  })
})

describe('normalizeAgentType', () => {
  test('strips a plugin prefix and rejects unusable names', () => {
    expect(normalizeAgentType('coder:coder')).toBe('coder')
    expect(normalizeAgentType('coder')).toBe('coder')
    expect(normalizeAgentType('a:b:c')).toBe('c')
    expect(normalizeAgentType('')).toBeNull()
    expect(normalizeAgentType('coder:')).toBeNull()
    expect(normalizeAgentType(null)).toBeNull()
    expect(normalizeAgentType(3)).toBeNull()
  })
})
