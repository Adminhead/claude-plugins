// plan-ledger: who may do what. Pure and total: any unknown action, malformed actor or plan, or
// internal error is a denial. Implements the actor and eligibility rules of decision 5 in
// docs/plans/goal-ledger.md. It checks identity and ownership, not status transitions (that is
// `apply`), except where a rule is itself status-based: `claim` needs an `active` plan, and a
// binding from an earlier session can be taken over only for a `failed` or `blocked` item.
import type { Action, Actor, Item, Plan } from './types'

export type AuthResult = { ok: true } | { ok: false; reason: string }

const OK: AuthResult = { ok: true }
const deny = (reason: string): AuthResult => ({ ok: false, reason })

const ACTIONS: ReadonlySet<string> = new Set([
  'create',
  'activate',
  'claim',
  'progress',
  'block',
  'fail',
  'claim_done',
  'verify',
  'amend',
  'assign',
  'reopen',
  'abandon',
  'bind',
  'reserve',
  'list',
  'status',
  'get',
])

// Actions an agent that is bound to an item may take on that item.
const BOUND_ONLY: ReadonlySet<string> = new Set(['progress', 'block', 'fail', 'claim_done'])

const MSG_ORCHESTRATOR_ONLY = 'Only the orchestrator can do that. Ask the orchestrator.'
const MSG_UNLISTED =
  'The plan tool is not available to this caller. Only the orchestrator and its listed subagents can use it.'
const MSG_BOUND_ELSEWHERE = 'This item is bound to another agent. Ask the orchestrator to assign it.'
const MSG_NOT_YOURS = 'This item is not assigned to you. Ask the orchestrator to assign it.'

/** Removes a plugin prefix (`coder:coder` becomes `coder`). Null for anything that is not a usable name. */
export function normalizeAgentType(t: unknown): string | null {
  if (typeof t !== 'string') return null
  const name = t.slice(t.lastIndexOf(':') + 1).trim()
  return name === '' ? null : name
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function isBoundTo(item: Item, agentId: string): boolean {
  return isObject(item.boundAgent) && item.boundAgent.agentId === agentId
}

function isUnbound(item: Item): boolean {
  return item.boundAgent === null || item.boundAgent === undefined
}

// The item is meant for this agent type: `agent` matches and, when reserved, the reservation matches.
function typeMatches(item: Item, agentType: string): boolean {
  if (normalizeAgentType(item.agent) !== agentType) return false
  if (item.reservedFor === null || item.reservedFor === undefined) return true
  return normalizeAgentType(item.reservedFor) === agentType
}

function createdBy(plan: Plan, actor: { agentId: string; session: string }): boolean {
  const c = plan.creator
  return isObject(c) && c.kind === 'agent' && c.agentId === actor.agentId && c.session === actor.session
}

function findItem(plan: Plan, id: unknown): Item | null {
  if (typeof id !== 'string') return null
  return plan.items.find((i) => i.id === id) ?? null
}

/** Whether `actor` may see this plan in a `list` or `status` answer. Callers filter lists with it. */
export function canView(plan: Plan, actor: Actor): boolean {
  try {
    if (!isObject(actor)) return false
    if (actor.kind === 'main') return true
    if (actor.kind !== 'agent') return false
    const type = normalizeAgentType(actor.agentType)
    if (type === null || typeof actor.agentId !== 'string' || actor.agentId === '') return false
    if (type === 'architect') return createdBy(plan, actor)
    return true
  } catch {
    return false
  }
}

export function authorize(plan: Plan | null, action: Action, actor: Actor): AuthResult {
  try {
    return decide(plan, action, actor)
  } catch {
    return deny('Could not authorize this call, so it is refused.')
  }
}

function decide(plan: Plan | null, action: Action, actor: Actor): AuthResult {
  if (!isObject(action) || typeof action.action !== 'string' || !ACTIONS.has(action.action)) {
    return deny('Unknown action.')
  }
  if (!isObject(actor)) return deny(MSG_UNLISTED)
  if (plan !== null && !isObject(plan)) return deny('Invalid plan.')

  // `create` makes a new plan, so there is none yet; a plan must exist for everything else that names one.
  if (action.action === 'create') {
    if (plan !== null) return deny('A plan already exists here; create makes a new one.')
  } else if (action.action === 'list') {
    // no plan target
  } else if (action.action === 'status' && action.plan === undefined) {
    // an overview of all plans, no plan target
  } else {
    if (plan === null) return deny('No such plan.')
    if (action.plan !== plan.id) return deny('The action names a different plan than the one loaded.')
  }

  if (actor.kind === 'main') return OK
  if (actor.kind !== 'agent') return deny(MSG_UNLISTED)

  if (typeof actor.agentId !== 'string' || actor.agentId === '' || typeof actor.session !== 'string') {
    return deny(MSG_UNLISTED)
  }
  const type = normalizeAgentType(actor.agentType)
  if (type === null) return deny(MSG_UNLISTED)

  if (type === 'architect') return decideArchitect(plan, action, actor)
  return decideAgent(plan, action, { agentId: actor.agentId, session: actor.session, type })
}

// The architect drafts plans: `create` (always a draft), and read access to plans it created.
function decideArchitect(
  plan: Plan | null,
  action: Action,
  actor: { agentId: string; session: string },
): AuthResult {
  switch (action.action) {
    case 'create':
    case 'list':
      return OK
    case 'status':
    case 'get':
      if (action.action === 'status' && action.plan === undefined) return OK
      if (plan !== null && createdBy(plan, actor)) return OK
      return deny('Only plans you created are visible to you.')
    default:
      return deny(MSG_ORCHESTRATOR_ONLY)
  }
}

function decideAgent(
  plan: Plan | null,
  action: Action,
  me: { agentId: string; session: string; type: string },
): AuthResult {
  const name = action.action
  if (name === 'list') return OK
  if (name === 'status') return OK

  const readsOrClaims = name === 'get' || name === 'claim' || BOUND_ONLY.has(name)
  if (!readsOrClaims) return deny(MSG_ORCHESTRATOR_ONLY)

  if (plan === null) return deny('No such plan.')
  const item = findItem(plan, (action as { item?: unknown }).item)
  if (item === null) return deny('No such item in this plan.')

  if (BOUND_ONLY.has(name)) {
    return isBoundTo(item, me.agentId) ? OK : deny(isUnbound(item) ? MSG_NOT_YOURS : MSG_BOUND_ELSEWHERE)
  }

  if (name === 'get') {
    if (isBoundTo(item, me.agentId)) return OK
    if (isUnbound(item) && typeMatches(item, me.type)) return OK
    return deny(isUnbound(item) ? MSG_NOT_YOURS : MSG_BOUND_ELSEWHERE)
  }

  // claim
  if (plan.status !== 'active') return deny('Ask the orchestrator to activate the plan first.')
  if (isBoundTo(item, me.agentId)) return OK
  if (isUnbound(item)) {
    return typeMatches(item, me.type) ? OK : deny(MSG_NOT_YOURS)
  }
  // Bound to someone else: only a matching agent of a later session may take over a stuck item.
  const bound = item.boundAgent
  if (
    bound !== null &&
    bound.session !== me.session &&
    (item.status === 'failed' || item.status === 'blocked') &&
    typeMatches(item, me.type)
  ) {
    return OK
  }
  return deny(MSG_BOUND_ELSEWHERE)
}
