// plan-ledger: the state machine. Pure and deterministic: no clock, no randomness, no I/O; time and
// ids come from `ctx`. Implements exactly the transition table of decision 2 in
// docs/plans/goal-ledger.md and denies everything else. `authorize` runs first.
//
// Rules the table leaves implicit:
// - `rev` is plan.rev + 1 on every non-denied result, including an idempotent repeat (a no-op) that
//   changes nothing else, so replay sees one rev per ledger line.
// - A denied result keeps `rev` unchanged. Read-only actions (`list`, `status`, `get`) are not
//   transitions and are denied here; the caller serves them without `apply`.
// - Replay: a non-denied Change rebuilds its action as `{ action, plan, item (when non-null),
//   ...data }`. `data` holds the normalized payload (evidence and notes already truncated), plus
//   `project` on `create` (supplied through `ctx.project`), so applying it again yields the same plan.
//   `ifRev` is not recorded. Replay passes `ctx.actor`, `ctx.op`, `ctx.nowMs` (the line's `ts`) and
//   `ctx.newPlanId` (the line's `plan`) from the line.
import { authorize, normalizeAgentType } from './authorize'
import { checksHash, validateChecks } from './checks'
import { hasControl, isNonEmpty, isObject, utf8Bytes } from './shared'
import type {
  Action,
  Actor,
  BoundAgent,
  Change,
  CheckResult,
  Claimed,
  CommandEvidence,
  Item,
  ItemInput,
  ItemStatus,
  Plan,
  Verification,
} from './types'
import {
  MAX_ACCEPTANCE,
  MAX_AGENT_CHARS,
  MAX_ENTRY_BYTES,
  MAX_EVIDENCE_ARGV,
  MAX_EVIDENCE_COMMANDS,
  MAX_EVIDENCE_COMMITS,
  MAX_EVIDENCE_FILES,
  MAX_FILES,
  MAX_INSTRUCTIONS_BYTES,
  MAX_ITEMS,
  MAX_MODEL_CHARS,
  MAX_TAIL_BYTES,
  MAX_TITLE_CHARS,
} from './types'

export type ApplyCtx = {
  actor: Actor
  nowMs: number
  attemptCap: number
  /** Id given to a plan made by `create`. */
  newPlanId: string
  /** Random id chosen by the mod for this call; copied into the Change. */
  op: string
  /** Project root recorded on a plan made by `create`. */
  project: string
}

export type ApplyOk = { plan: Plan; change: Change; message: string }
export type ApplyDenied = { denied: string; change: Change }
export type ApplyResult = ApplyOk | ApplyDenied

type Out =
  | { deny: string }
  | {
      plan: Plan
      item: string | null
      from: string | null
      to: string | null
      data: Record<string, unknown>
      message: string
    }

type Env<A extends Action['action']> = {
  plan: Plan
  action: Extract<Action, { action: A }>
  ctx: ApplyCtx
  now: string
}

const deny = (reason: string): { deny: string } => ({ deny: reason })

const READ_ONLY: ReadonlySet<string> = new Set(['list', 'status', 'get'])
const NO_IFREV: ReadonlySet<string> = new Set(['create', 'list', 'status', 'get'])

const ITEM_FIELDS: ReadonlySet<string> = new Set([
  'title',
  'instructions',
  'acceptance',
  'files',
  'deps',
  'agent',
  'model',
  'checks',
])

// ---------------------------------------------------------------- entry point

export function apply(plan: Plan | null, action: Action, ctx: ApplyCtx): ApplyResult {
  try {
    return run(plan, action, ctx)
  } catch {
    return refuse(plan, action, ctx, 'Could not apply this call, so it is refused.')
  }
}

function run(plan: Plan | null, action: Action, ctx: ApplyCtx): ApplyResult {
  const auth = authorize(plan, action, ctx.actor)
  if (!auth.ok) return refuse(plan, action, ctx, auth.reason)

  if (READ_ONLY.has(action.action)) {
    return refuse(plan, action, ctx, `${action.action} reads the plan and changes nothing; it is not a transition.`)
  }
  if (action.action !== 'create' && plan === null) return refuse(plan, action, ctx, 'No such plan.')
  if (action.action !== 'create' && plan !== null && plan.status === 'abandoned') {
    return refuse(plan, action, ctx, 'This plan is abandoned. Ask the orchestrator to create a new plan.')
  }

  const ifRev = (action as { ifRev?: unknown }).ifRev
  if (!NO_IFREV.has(action.action) && ifRev !== undefined && plan !== null && ifRev !== plan.rev) {
    return refuse(
      plan,
      action,
      ctx,
      `The plan is at rev ${plan.rev}, not rev ${String(ifRev)}. Re-read the plan, then retry.`,
    )
  }

  const now = iso(ctx.nowMs)
  const out = dispatch(plan, action, ctx, now)
  if ('deny' in out) return refuse(plan, action, ctx, out.deny)

  const rev = (plan?.rev ?? 0) + 1
  const next: Plan = { ...out.plan, rev }
  const change: Change = {
    v: 1,
    rev,
    ts: now,
    plan: next.id,
    item: out.item,
    actor: ctx.actor,
    action: action.action,
    from: out.from,
    to: out.to,
    data: out.data,
    denied: null,
    op: ctx.op,
  }
  return { plan: next, change, message: out.message }
}

function dispatch(plan: Plan | null, action: Action, ctx: ApplyCtx, now: string): Out {
  if (action.action === 'create') return create({ plan: plan as unknown as Plan, action, ctx, now })
  if (plan === null) return deny('No such plan.')
  switch (action.action) {
    case 'activate':
      return activate({ plan, action, ctx, now })
    case 'claim':
      return claim({ plan, action, ctx, now })
    case 'progress':
      return progress({ plan, action, ctx, now })
    case 'block':
      return block({ plan, action, ctx, now })
    case 'fail':
      return fail({ plan, action, ctx, now })
    case 'claim_done':
      return claimDone({ plan, action, ctx, now })
    case 'verify':
      return verify({ plan, action, ctx, now })
    case 'amend':
      return amend({ plan, action, ctx, now })
    case 'assign':
      return assign({ plan, action, ctx, now })
    case 'reopen':
      return reopen({ plan, action, ctx, now })
    case 'abandon':
      return abandon({ plan, action, ctx, now })
    case 'bind':
      return bind({ plan, action, ctx, now })
    case 'reserve':
      return reserve({ plan, action, ctx, now })
    default:
      return deny('Unknown action.')
  }
}

// A denial: `rev` unchanged, `denied` holds the reason, no payload (the reason is what review needs).
function refuse(plan: Plan | null, action: Action, ctx: ApplyCtx, reason: string): ApplyDenied {
  const a = (action ?? {}) as { action?: unknown; plan?: unknown; item?: unknown }
  const item = typeof a.item === 'string' ? a.item : null
  const found = plan !== null && item !== null ? plan.items.find((i) => i.id === item) : undefined
  const planId =
    plan !== null
      ? plan.id
      : a.action === 'create'
        ? ctx.newPlanId
        : typeof a.plan === 'string'
          ? a.plan
          : ''
  const change: Change = {
    v: 1,
    rev: plan?.rev ?? 0,
    ts: safeIso(ctx.nowMs),
    plan: planId,
    item,
    actor: ctx.actor,
    action: (typeof a.action === 'string' ? a.action : 'unknown') as Change['action'],
    from: found ? found.status : null,
    to: null,
    data: {},
    denied: reason,
    op: ctx.op,
  }
  return { denied: reason, change }
}

// ---------------------------------------------------------------- helpers

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

function safeIso(ms: number): string {
  try {
    return iso(ms)
  } catch {
    return '1970-01-01T00:00:00.000Z'
  }
}

/** Cuts to at most `max` UTF-8 bytes on a character boundary. Idempotent, so replay agrees with the live run. */
function truncBytes(s: string, max: number = MAX_TAIL_BYTES): string {
  if (s.length * 4 <= max || utf8Bytes(s) <= max) return s
  let n = 0
  let out = ''
  for (const ch of s) {
    const c = ch.codePointAt(0) as number
    const b = c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4
    if (n + b > max) break
    n += b
    out += ch
  }
  return out
}

const isStr = (x: unknown): x is string => typeof x === 'string'
const isStrArray = (x: unknown): x is string[] => Array.isArray(x) && x.every(isStr)
const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x)

function findItem(plan: Plan, id: unknown): Item | null {
  return isStr(id) ? (plan.items.find((i) => i.id === id) ?? null) : null
}

function withItem(plan: Plan, next: Item): Plan {
  return { ...plan, items: plan.items.map((i) => (i.id === next.id ? next : i)) }
}

const noItem = (id: string): { deny: string } => deny(`No item ${id} in this plan. Check the item id.`)

function wrongStatus(item: Item, verb: string, expected: string, hint = ''): { deny: string } {
  return deny(`Cannot ${verb} ${item.id}: it is ${item.status}, and ${verb} needs ${expected}.${hint ? ` ${hint}` : ''}`)
}

// `agent` and `model` are rendered inside parentheses on one line of the injected block, so they take no spaces,
// parentheses or other text that could pass for an item status. A model may carry a context suffix such as
// `sonnet[1m]`, and an empty model means unset.
const AGENT_RE = /^[A-Za-z0-9._:-]{1,60}$/
const MODEL_RE = /^[A-Za-z0-9._:[\]-]{0,60}$/

function otherInProgress(plan: Plan, agentId: string, exceptId: string): Item | undefined {
  return plan.items.find(
    (i) => i.id !== exceptId && i.status === 'in_progress' && i.boundAgent !== null && i.boundAgent.agentId === agentId,
  )
}

function isBoundTo(item: Item, agentId: string): boolean {
  return item.boundAgent !== null && item.boundAgent.agentId === agentId
}

// ---------------------------------------------------------------- item input validation

/** Validates a list of strings: at most `maxCount` entries of at most `MAX_ENTRY_BYTES` bytes each (nothing is cut). */
function boundedList(name: string, raw: unknown, maxCount: number): string[] | string {
  if (!isStrArray(raw)) return `${name} must be a list of strings.`
  if (raw.length > maxCount) return `At most ${maxCount} entries in ${name}.`
  if (raw.some((x) => utf8Bytes(x) > MAX_ENTRY_BYTES)) return `Each entry in ${name} is at most ${MAX_ENTRY_BYTES} bytes.`
  return raw.slice()
}

/**
 * Validates the fields of an item (all of them at `create`, only those present in an `amend` patch).
 * Every rule here tests the value that is stored, so replaying a stored line passes the same checks.
 */
function readFields(raw: unknown, complete: boolean): Partial<ItemInput> | string {
  if (!isObject(raw)) return 'An item must be an object.'
  const r = raw
  for (const k of Object.keys(r)) {
    if (!ITEM_FIELDS.has(k)) return `Unknown item field "${k}".`
  }
  const out: Partial<ItemInput> = {}
  const need = (k: string) => complete && r[k] === undefined
  if (r.title !== undefined || need('title')) {
    if (!validTitle(r.title)) return TITLE_RULE
    out.title = r.title
  }
  if (r.instructions !== undefined || need('instructions')) {
    if (!isStr(r.instructions)) return 'An item needs instructions (a string).'
    if (utf8Bytes(r.instructions) > MAX_INSTRUCTIONS_BYTES) {
      return `Instructions are over ${MAX_INSTRUCTIONS_BYTES} bytes. Shorten them; nothing is truncated for you.`
    }
    out.instructions = r.instructions
  }
  for (const [k, max] of [['acceptance', MAX_ACCEPTANCE], ['files', MAX_FILES], ['deps', MAX_ITEMS]] as const) {
    if (r[k] !== undefined || need(k)) {
      const l = boundedList(k, r[k], max)
      if (typeof l === 'string') return l
      if (k === 'deps' && l.some(hasControl)) return 'A dependency id must not contain control characters.'
      out[k] = l
    }
  }
  if (r.agent !== undefined || need('agent')) {
    if (!isNonEmpty(r.agent) || normalizeAgentType(r.agent) === null) return 'An item needs an agent type.'
    if (r.agent.length > MAX_AGENT_CHARS) return `An agent type is at most ${MAX_AGENT_CHARS} characters.`
    if (!AGENT_RE.test(r.agent)) return 'An agent type may only use letters, digits and . _ : -.'
    out.agent = r.agent
  }
  if (r.model !== undefined || need('model')) {
    if (!isStr(r.model)) return 'An item needs a model (a string).'
    if (r.model.length > MAX_MODEL_CHARS) return `A model is at most ${MAX_MODEL_CHARS} characters.`
    if (!MODEL_RE.test(r.model)) return 'A model may only use letters, digits and . _ : - [ ] (or be empty for unset).'
    out.model = r.model
  }
  if (r.checks !== undefined || need('checks')) {
    const c = validateChecks(r.checks)
    if (!Array.isArray(c)) return c.error
    out.checks = c
  }
  return out
}

/** Unknown dependencies and cycles (depth-first search over the whole item list). */
function checkDeps(items: { id: string; deps: string[] }[]): string | null {
  const byId = new Map(items.map((i) => [i.id, i]))
  for (const i of items) {
    for (const d of i.deps) {
      if (!byId.has(d)) return `Item ${i.id} depends on ${d}, which is not an item of this plan.`
    }
  }
  const state = new Map<string, 1 | 2>() // 1 = on the stack, 2 = done
  const stack: string[] = []
  const visit = (id: string): string | null => {
    const s = state.get(id)
    if (s === 2) return null
    if (s === 1) return `Dependency cycle: ${[...stack.slice(stack.indexOf(id)), id].join(' -> ')}.`
    state.set(id, 1)
    stack.push(id)
    for (const d of (byId.get(id) as { deps: string[] }).deps) {
      const r = visit(d)
      if (r !== null) return r
    }
    stack.pop()
    state.set(id, 2)
    return null
  }
  for (const i of items) {
    const r = visit(i.id)
    if (r !== null) return r
  }
  return null
}

const TITLE_RULE = `A title must be non-empty, at most ${MAX_TITLE_CHARS} characters, with no control characters.`

function validTitle(t: unknown): t is string {
  return isNonEmpty(t) && t.length <= MAX_TITLE_CHARS && !hasControl(t)
}

// ---------------------------------------------------------------- transitions

function create(e: Env<'create'>): Out {
  const { action, ctx, now } = e
  if (!validTitle(action.title)) return deny(`A plan needs a title. ${TITLE_RULE}`)
  if (!Array.isArray(action.items)) return deny('A plan needs a list of items.')
  if (action.items.length > MAX_ITEMS) return deny(`At most ${MAX_ITEMS} items per plan. Split the work into two plans.`)

  const inputs: ItemInput[] = []
  const items: Item[] = []
  for (let n = 0; n < action.items.length; n++) {
    const id = `s${n + 1}`
    const f = readFields(action.items[n], true)
    if (typeof f === 'string') return deny(`Item ${id}: ${f}`)
    const input = f as ItemInput
    inputs.push(input)
    items.push({
      id,
      ...input,
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
    })
  }
  const bad = checkDeps(items)
  if (bad !== null) return deny(bad)

  const plan: Plan = {
    v: 1,
    id: ctx.newPlanId,
    title: action.title,
    rev: 0,
    created: now,
    project: ctx.project,
    status: 'draft',
    creator: ctx.actor,
    items,
  }
  return {
    plan,
    item: null,
    from: null,
    to: 'draft',
    data: { title: action.title, items: inputs, project: ctx.project },
    message: `Created plan ${plan.id} as a draft with ${items.length} item${items.length === 1 ? '' : 's'}. The orchestrator reviews it, then activates it; nothing is claimable until then.`,
  }
}

function activate(e: Env<'activate'>): Out {
  const { plan } = e
  if (plan.status !== 'draft') {
    return deny(`Cannot activate plan ${plan.id}: it is ${plan.status}, and activate needs a draft plan.`)
  }
  return {
    plan: { ...plan, status: 'active' },
    item: null,
    from: 'draft',
    to: 'active',
    data: {},
    message: `Plan ${plan.id} is active. Items can now be claimed.`,
  }
}

function claim(e: Env<'claim'>): Out {
  const { plan, action, ctx, now } = e
  const actor = ctx.actor
  if (actor.kind !== 'agent') return deny('Only a subagent claims an item. Brief a subagent, or use assign.')
  const item = findItem(plan, action.item)
  if (item === null) return noItem(action.item)
  const done = (next: Item, message: string): Out => ({
    plan: withItem(plan, next),
    item: item.id,
    from: item.status,
    to: next.status,
    data: {},
    message,
  })
  const cap = ctx.attemptCap + item.extraAttempts

  if (item.status === 'in_progress' && isBoundTo(item, actor.agentId)) {
    return done(item, `You already hold ${item.id} (attempt ${item.attempts}). Carry on; nothing changed.`)
  }
  if (plan.status !== 'active') return deny('Ask the orchestrator to activate the plan first.')
  if (item.status !== 'pending' && item.status !== 'failed') {
    const hint =
      item.status === 'in_progress'
        ? 'Another agent holds it. Ask the orchestrator.'
        : 'Ask the orchestrator to reopen or assign it.'
    return wrongStatus(item, 'claim', 'a pending or failed item', hint)
  }
  if (item.status === 'pending') {
    const unmet = item.deps.filter((d) => findItem(plan, d)?.status !== 'verified')
    if (unmet.length > 0) {
      return deny(
        `${item.id} waits for ${unmet.join(', ')} to be verified. Do not start it; tell the orchestrator you are waiting.`,
      )
    }
  }
  if (item.attempts >= cap) {
    return deny(
      `${item.id} has used all ${cap} attempts. Stop and report; the orchestrator must reopen it with extraAttempts.`,
    )
  }
  const busy = otherInProgress(plan, actor.agentId, item.id)
  if (busy !== undefined) {
    return deny(`You already have ${busy.id} in progress. Finish it (claim_done, block or fail) before claiming ${item.id}.`)
  }
  const boundAgent: BoundAgent =
    item.boundAgent !== null && item.boundAgent.agentId === actor.agentId
      ? item.boundAgent
      : { agentId: actor.agentId, session: actor.session, at: now }
  const next: Item = { ...item, status: 'in_progress', attempts: item.attempts + 1, boundAgent }
  return done(next, `Claimed ${item.id} (attempt ${next.attempts} of ${cap}). Read it with get, then work.`)
}

// Cut first, then test the stored value: a note of 2000 spaces plus text keeps only the spaces, and replay
// would refuse that line if the live run had accepted it.
function noteOf(note: unknown): string | null {
  if (!isStr(note)) return null
  const stored = truncBytes(note)
  return isNonEmpty(stored) ? stored : null
}

function progress(e: Env<'progress'>): Out {
  const { plan, action } = e
  const item = findItem(plan, action.item)
  if (item === null) return noItem(action.item)
  if (item.status !== 'in_progress') return wrongStatus(item, 'report progress on', 'an in_progress item')
  const note = noteOf(action.note)
  if (note === null) return deny('progress needs a note saying what you did.')
  return {
    plan: withItem(plan, { ...item, note }),
    item: item.id,
    from: 'in_progress',
    to: 'in_progress',
    data: { note },
    message: `Noted on ${item.id}.`,
  }
}

function block(e: Env<'block'>): Out {
  const { plan, action } = e
  const item = findItem(plan, action.item)
  if (item === null) return noItem(action.item)
  if (item.status !== 'in_progress') return wrongStatus(item, 'block', 'an in_progress item')
  const note = noteOf(action.note)
  if (note === null) return deny('block needs a note saying what you are waiting for.')
  return {
    plan: withItem(plan, { ...item, status: 'blocked', note }),
    item: item.id,
    from: 'in_progress',
    to: 'blocked',
    data: { note },
    message: `${item.id} is blocked. Stop and tell the orchestrator what you need.`,
  }
}

function fail(e: Env<'fail'>): Out {
  const { plan, action, ctx } = e
  if (ctx.actor.kind !== 'agent') {
    return deny('Only the assigned agent fails an item. Use block, abandon or reopen instead.')
  }
  const item = findItem(plan, action.item)
  if (item === null) return noItem(action.item)
  if (item.status !== 'in_progress') return wrongStatus(item, 'fail', 'an in_progress item')
  const note = noteOf(action.note)
  if (note === null) return deny('fail needs a note saying why it failed.')
  return {
    plan: withItem(plan, { ...item, status: 'failed', failure: note }),
    item: item.id,
    from: 'in_progress',
    to: 'failed',
    data: { note },
    message: `${item.id} is failed. Stop and report; claim it again only if the orchestrator says so.`,
  }
}

function readEvidence(a: Env<'claim_done'>['action']): { summary: string; commands: CommandEvidence[]; commits: string[]; files: string[] } | string {
  const summary = isStr(a.summary) ? truncBytes(a.summary) : ''
  if (!isNonEmpty(summary)) return 'claim_done needs a summary of what you did.'
  if (!Array.isArray(a.commands)) return 'commands must be a list.'
  if (a.commands.length > MAX_EVIDENCE_COMMANDS) return `At most ${MAX_EVIDENCE_COMMANDS} commands as evidence.`
  const commands: CommandEvidence[] = []
  for (const c of a.commands) {
    if (!isObject(c)) return 'Each command needs argv, exit and outTail.'
    const { argv, exit, outTail } = c
    if (!isStrArray(argv) || !isInt(exit) || !isStr(outTail)) return 'Each command needs argv, exit and outTail.'
    if (argv.length > MAX_EVIDENCE_ARGV) return `A command has at most ${MAX_EVIDENCE_ARGV} argv entries.`
    commands.push({ argv: argv.map((x) => truncBytes(x, MAX_ENTRY_BYTES)), exit, outTail: truncBytes(outTail) })
  }
  if (!isStrArray(a.commits)) return 'commits must be a list of strings.'
  if (a.commits.length > MAX_EVIDENCE_COMMITS) return `At most ${MAX_EVIDENCE_COMMITS} commits as evidence.`
  if (!isStrArray(a.files)) return 'files must be a list of strings.'
  if (a.files.length > MAX_EVIDENCE_FILES) return `At most ${MAX_EVIDENCE_FILES} files as evidence.`
  return {
    summary,
    commands,
    commits: a.commits.map((x) => truncBytes(x, MAX_ENTRY_BYTES)),
    files: a.files.map((x) => truncBytes(x, MAX_ENTRY_BYTES)),
  }
}

const evidenceKey = (c: { summary: string; commands: CommandEvidence[]; commits: string[]; files: string[] }) =>
  JSON.stringify({ summary: c.summary, commands: c.commands, commits: c.commits, files: c.files })

function claimDone(e: Env<'claim_done'>): Out {
  const { plan, action, ctx, now } = e
  if (ctx.actor.kind !== 'agent') return deny('Only the assigned agent claims an item done. Use verify with manual for unchecked work.')
  const item = findItem(plan, action.item)
  if (item === null) return noItem(action.item)
  const ev = readEvidence(action)
  if (typeof ev === 'string') return deny(ev)

  if (item.status === 'claimed_done') {
    if (item.claimed !== null && evidenceKey(item.claimed) === evidenceKey(ev)) {
      return {
        plan,
        item: item.id,
        from: 'claimed_done',
        to: 'claimed_done',
        data: ev,
        message: `${item.id} is already claimed done with this evidence; nothing changed. Wait for the orchestrator to verify it.`,
      }
    }
    return deny(
      `${item.id} is already claimed done with different evidence. Ask the orchestrator to reopen it if the evidence must change.`,
    )
  }
  if (item.status !== 'in_progress') return wrongStatus(item, 'claim done on', 'an in_progress item')
  const claimed: Claimed = { ...ev, at: now }
  return {
    plan: withItem(plan, { ...item, status: 'claimed_done', gen: item.gen + 1, claimed }),
    item: item.id,
    from: 'in_progress',
    to: 'claimed_done',
    data: ev,
    message: `${item.id} is claimed done (self-reported). The orchestrator will verify it; stop here.`,
  }
}

function failureTail(results: CheckResult[]): string {
  const bad = results.filter((r) => r.exit !== r.expectExit)
  const text = (bad.length > 0 ? bad : results)
    .map((r) => `${r.label}: exit ${r.exit}, expected ${r.expectExit}\n${r.outTail}`)
    .join('\n')
  return truncBytes(text)
}

/**
 * Why a supplied verification cannot stand for this item, or null. The mod builds it after running the
 * checks, but `apply` does not take that on trust: it must be for this gen, run this item's current
 * checks in order, and `ok` must be what the results say.
 */
function verificationProblem(item: Item, v: Verification): string | null {
  if (!isObject(v) || typeof v.ok !== 'boolean' || !Array.isArray(v.results)) return 'The verification is malformed, so it is refused.'
  if (v.gen !== item.gen) return `The verification is for gen ${String(v.gen)} of ${item.id}, which is at gen ${item.gen}.`
  if ((v.kind === 'checks') !== (item.checks.length > 0) || (v.kind !== 'checks' && v.kind !== 'manual')) {
    return `The verification kind does not match ${item.id}: items with checks are verified by running them, items without by manual.`
  }
  if (v.kind === 'checks') {
    if (v.checksHash !== checksHash(item.checks)) {
      return `The verification ran different checks from the ones ${item.id} has now (its checks changed), so it is refused.`
    }
    if (v.results.length !== item.checks.length) return `The verification has ${v.results.length} results for ${item.checks.length} checks of ${item.id}.`
    for (let i = 0; i < v.results.length; i++) {
      const r: unknown = v.results[i]
      const c = item.checks[i]
      if (!isObject(r) || r.label !== c.label || r.expectExit !== c.expectExit || !isInt(r.exit) || !isStr(r.outTail)) {
        return `Result ${i + 1} of the verification does not match check "${c.label}" of ${item.id}.`
      }
    }
  } else if (v.results.length > 0) {
    return 'A manual verification has no check results.'
  }
  if (v.ok !== v.results.every((r) => r.exit === r.expectExit)) return 'The verification says ok, but its results say otherwise.'
  return null
}

function verify(e: Env<'verify'>): Out {
  const { plan, action, now } = e
  const item = findItem(plan, action.item)
  if (item === null) return noItem(action.item)
  if (item.status !== 'claimed_done') return wrongStatus(item, 'verify', 'a claimed_done item', 'Wait for the agent to claim it done.')
  if (action.gen !== item.gen) {
    return deny(`${item.id} is at gen ${item.gen}; you saw gen ${String(action.gen)}. It changed since you read it: re-read it, then verify again.`)
  }

  let v: Verification
  if (action.verification !== undefined) {
    v = action.verification
    const bad = verificationProblem(item, v)
    if (bad !== null) return deny(bad)
  } else if (action.manual === true) {
    if (item.checks.length > 0) return deny(`${item.id} has checks, so it is verified by running them, not manually.`)
    const note = isStr(action.note) ? truncBytes(action.note) : ''
    if (!isNonEmpty(note)) return deny('A manual verify needs a note saying what you checked by hand.')
    v = {
      kind: 'manual',
      ok: true,
      gen: item.gen,
      cwd: isStr(action.cwd) ? truncBytes(action.cwd) : '',
      checksHash: '',
      results: [],
      before: null,
      after: null,
      note,
      at: now,
    }
  } else {
    return deny('verify runs the item checks itself, and the plan tool cannot do that here. Use the verify tool path, or manual: true with a note for an item without checks.')
  }

  const ok = v.ok
  const data: Record<string, unknown> = { gen: item.gen, verification: v }
  return {
    plan: withItem(plan, {
      ...item,
      status: ok ? 'verified' : 'failed',
      verification: v,
      failure: ok ? null : failureTail(v.results),
    }),
    item: item.id,
    from: 'claimed_done',
    to: ok ? 'verified' : 'failed',
    data,
    message: ok
      ? `${item.id} is verified${v.kind === 'manual' ? ' manually (no command was run)' : ' by its checks'}.`
      : `${item.id} failed verification. The agent must claim it again (amend it first if the instructions were wrong).`,
  }
}

function amend(e: Env<'amend'>): Out {
  const { plan, action } = e
  const hasPatch = action.patch !== undefined
  const hasTitle = action.planTitle !== undefined
  if (!hasPatch && !hasTitle) return deny('amend needs a patch for an item, a planTitle, or both.')
  if (hasPatch && action.item === undefined) return deny('A patch needs the item it applies to.')
  if (hasTitle && !validTitle(action.planTitle)) return deny(`The plan title is not valid. ${TITLE_RULE}`)

  let next: Plan = hasTitle ? { ...plan, title: action.planTitle as string } : plan
  const data: Record<string, unknown> = {}
  if (hasTitle) data.planTitle = action.planTitle
  let message = `Plan ${plan.id} amended.`
  let from: string | null = null
  let to: string | null = null

  if (action.item !== undefined) {
    const item = findItem(plan, action.item)
    if (item === null) return noItem(action.item)
    if (item.status === 'verified' || item.status === 'claimed_done') {
      return wrongStatus(item, 'amend', 'an item that is not verified or claimed_done', 'Reopen it first.')
    }
    if (!hasPatch) return deny('Naming an item needs a patch for it.')
    const f = readFields(action.patch, false)
    if (typeof f === 'string') return deny(`Item ${item.id}: ${f}`)
    if (Object.keys(f).length === 0) return deny('The patch is empty; nothing to amend.')
    const edited: Item = { ...item, ...f, gen: item.gen + 1 }
    const typeChanged =
      f.agent !== undefined && normalizeAgentType(f.agent) !== normalizeAgentType(item.agent)
    if (typeChanged) {
      edited.boundAgent = null
      edited.reservedFor = null
    }
    next = withItem(next, edited)
    const bad = checkDeps(next.items)
    if (bad !== null) return deny(bad)
    data.patch = f
    from = item.status
    to = item.status
    message = `Amended ${item.id} (now gen ${edited.gen})${typeChanged ? '; its agent type changed, so its binding was cleared' : ''}.`
  }
  return { plan: next, item: action.item ?? null, from, to, data, message }
}

function assign(e: Env<'assign'>): Out {
  const { plan, action, now } = e
  const item = findItem(plan, action.item)
  if (item === null) return noItem(action.item)
  if (!(['pending', 'failed', 'blocked', 'in_progress'] as ItemStatus[]).includes(item.status)) {
    return wrongStatus(item, 'assign', 'a pending, failed, blocked or in_progress item')
  }
  if (!isNonEmpty(action.agentId) || !isStr(action.session)) return deny('assign needs the agentId and session of the agent.')
  if (item.status === 'in_progress') {
    const busy = otherInProgress(plan, action.agentId, item.id)
    if (busy !== undefined) return deny(`That agent already has ${busy.id} in progress; one in-progress item per agent.`)
  }
  const boundAgent: BoundAgent = { agentId: action.agentId, session: action.session, at: now }
  return {
    plan: withItem(plan, { ...item, boundAgent }),
    item: item.id,
    from: item.status,
    to: item.status,
    data: { agentId: action.agentId, session: action.session },
    message: `${item.id} is assigned to agent ${action.agentId}.`,
  }
}

function reopen(e: Env<'reopen'>): Out {
  const { plan, action } = e
  const item = findItem(plan, action.item)
  if (item === null) return noItem(action.item)
  if (!(['blocked', 'failed', 'claimed_done', 'verified', 'abandoned'] as ItemStatus[]).includes(item.status)) {
    return wrongStatus(item, 'reopen', 'a blocked, failed, claimed_done, verified or abandoned item')
  }
  const extra = action.extraAttempts ?? 0
  if (!isInt(extra) || extra < 0) return deny('extraAttempts must be a whole number, zero or more.')
  // Past the cap a pending item cannot be claimed and reopen refuses a pending item, so it would be stuck.
  if (extra === 0 && item.attempts >= e.ctx.attemptCap + item.extraAttempts) {
    return deny(
      `${item.id} has used all ${e.ctx.attemptCap + item.extraAttempts} attempts and stays ${item.status}. Reopen it with extraAttempts (at least 1) to allow more.`,
    )
  }
  const data: Record<string, unknown> = action.extraAttempts === undefined ? {} : { extraAttempts: extra }
  return {
    plan: withItem(plan, { ...item, status: 'pending', gen: item.gen + 1, extraAttempts: item.extraAttempts + extra }),
    item: item.id,
    from: item.status,
    to: 'pending',
    data,
    message: `${item.id} is pending again (now gen ${item.gen + 1}${extra > 0 ? `, ${extra} extra attempt${extra === 1 ? '' : 's'}` : ''}).`,
  }
}

function abandon(e: Env<'abandon'>): Out {
  const { plan, action } = e
  if (action.item === undefined) {
    return {
      plan: { ...plan, status: 'abandoned' },
      item: null,
      from: plan.status,
      to: 'abandoned',
      data: {},
      message: `Plan ${plan.id} is abandoned.`,
    }
  }
  const item = findItem(plan, action.item)
  if (item === null) return noItem(action.item)
  if (item.status === 'verified' || item.status === 'abandoned') {
    return wrongStatus(item, 'abandon', 'an item that is not verified or abandoned')
  }
  return {
    plan: withItem(plan, { ...item, status: 'abandoned' }),
    item: item.id,
    from: item.status,
    to: 'abandoned',
    data: {},
    message: `${item.id} is abandoned. Items that depend on it stay pending.`,
  }
}

function bind(e: Env<'bind'>): Out {
  const { plan, action, now } = e
  const item = findItem(plan, action.item)
  if (item === null) return noItem(action.item)
  if (!(['pending', 'failed', 'in_progress'] as ItemStatus[]).includes(item.status)) {
    return wrongStatus(item, 'bind', 'a pending, failed or in_progress item')
  }
  if (item.boundAgent !== null) return deny(`${item.id} is already bound to agent ${item.boundAgent.agentId}. Use assign to replace a binding.`)
  if (!isNonEmpty(action.agentId) || !isStr(action.session)) return deny('bind needs the agentId and session of the agent.')
  if (item.status === 'in_progress') {
    const busy = otherInProgress(plan, action.agentId, item.id)
    if (busy !== undefined) return deny(`That agent already has ${busy.id} in progress; one in-progress item per agent.`)
  }
  const boundAgent: BoundAgent = { agentId: action.agentId, session: action.session, at: now }
  return {
    plan: withItem(plan, { ...item, boundAgent }),
    item: item.id,
    from: item.status,
    to: item.status,
    data: { agentId: action.agentId, session: action.session },
    message: `${item.id} is bound to agent ${action.agentId}.`,
  }
}

function reserve(e: Env<'reserve'>): Out {
  const { plan, action } = e
  const item = findItem(plan, action.item)
  if (item === null) return noItem(action.item)
  if (!(['pending', 'failed', 'in_progress'] as ItemStatus[]).includes(item.status)) {
    return wrongStatus(item, 'reserve', 'a pending, failed or in_progress item')
  }
  if (item.boundAgent !== null) return deny(`${item.id} is already bound to agent ${item.boundAgent.agentId}, so it cannot be reserved.`)
  if (item.reservedFor !== null) return deny(`${item.id} is already reserved for ${item.reservedFor}.`)
  const type = normalizeAgentType(action.agentType)
  if (type === null) return deny('reserve needs an agent type.')
  return {
    plan: withItem(plan, { ...item, reservedFor: type }),
    item: item.id,
    from: item.status,
    to: item.status,
    data: { agentType: type },
    message: `${item.id} is reserved for ${type}.`,
  }
}
