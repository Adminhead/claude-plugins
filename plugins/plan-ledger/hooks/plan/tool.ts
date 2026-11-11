// plan-ledger: the `plan` tool's pure half. The tool spec the model reads, the input parser (the one place the model's
// arguments become an `Action`), the actor builder, the retry policy and the plan listings. Pure: no `$`, no I/O. The
// `tool.call` handler in register.tsx wires these to `authorize`, `mutate`, `readPlan` and `verifyItem`.
// See decision 5 in docs/plans/goal-ledger.md.
import { authorize, canView } from './authorize'
import { validateChecks } from './checks'
import { clamp, one, renderBlock } from './render'
import { isNonEmpty, isObject, utf8Bytes } from './shared'
import { readyLine } from './parallel'
import { isPlanId } from './store'
import type { Action, Actor, ItemInput, Plan } from './types'
import { MAX_INSTRUCTIONS_BYTES, MAX_ITEMS, MAX_TITLE_CHARS } from './types'

export const TOOL_NAME = 'mcp__plan-ledger__plan'
const ITEM_ID = /^s[0-9]{1,2}$/
/** Any free-text field of the input; longer is refused (notes and tails are cut later, by `apply`). */
const MAX_TEXT_CHARS = 64_000
/** The whole input, serialized: a guard before anything walks it. */
export const MAX_INPUT_CHARS = 400_000

// ---------------------------------------------------------------- the tool spec

const ACTIONS = [
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
  'list',
  'status',
  'get',
] as const

const str = { type: 'string' } as const
const strList = { type: 'array', items: str } as const
const int = { type: 'integer' } as const

const ITEM_PROPS = {
  title: str,
  instructions: str,
  acceptance: strList,
  files: strList,
  deps: { type: 'array', items: str, description: 'item ids this one needs verified first' },
  agent: { type: 'string', description: 'agent type that does it' },
  model: str,
  checks: {
    type: 'array',
    description: 'commands the orchestrator runs at verify',
    items: {
      type: 'object',
      properties: { label: str, argv: strList, expectExit: int },
      required: ['label', 'argv'],
    },
  },
  parallelSafe: { type: 'boolean', description: 'may run beside other ready items; default false' },
}

/**
 * What `$.tool.register` takes. The description is what the model reads: it stays under 400 characters. `isDeferred: false`
 * keeps the schema in the prompt's tool list (`ToolDeferral`, the 2.1.302 d.ts) instead of behind ToolSearch, so a subagent
 * that lists the tool can call it at once; the cost is the schema's size on every request of an agent that lists it (decision 9
 * scopes who does), which is why `patch` names the item fields in words rather than repeating their schema.
 */
export const TOOL = {
  name: 'plan',
  isDeferred: false,
  description:
    'Work-plan ledger shared with subagents. Orchestrator: create a plan of items, activate it, assign/amend/reopen items, verify claimed items, abandon. Subagent: get your item (plan-ref p-id/sN), then claim, progress, block, fail or claim_done with evidence. list and status show plans. Only the orchestrator can verify; you cannot set verified yourself.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: [...ACTIONS] },
      plan: { type: 'string', description: 'plan id, p-...' },
      item: { type: 'string', description: 'item id, s1...' },
      title: { type: 'string', description: 'create: the plan title' },
      items: {
        type: 'array',
        description: 'create: the items, in order (ids s1, s2, ...)',
        items: {
          type: 'object',
          properties: ITEM_PROPS,
          required: ['title', 'instructions', 'agent'],
        },
      },
      note: { type: 'string', description: 'progress, block, fail; verify with manual' },
      summary: { type: 'string', description: 'claim_done: what you did' },
      commands: {
        type: 'array',
        description: 'claim_done: commands you ran',
        items: {
          type: 'object',
          properties: { argv: strList, exit: int, outTail: str },
          required: ['argv', 'exit', 'outTail'],
        },
      },
      commits: { type: 'array', items: str, description: 'claim_done: commit shas' },
      files: { type: 'array', items: str, description: 'claim_done: files changed' },
      gen: { type: 'integer', description: 'verify: the gen of the item you read' },
      manual: { type: 'boolean', description: 'verify an item with no checks by hand; needs note' },
      cwd: { type: 'string', description: 'verify: absolute directory to run the checks in' },
      patch: { type: 'object', description: 'amend: the item fields to change, named as in items' },
      planTitle: { type: 'string', description: 'amend: new plan title' },
      assignee: { type: 'string', description: 'assign: the agent id to bind the item to' },
      extraAttempts: { type: 'integer', description: 'reopen: attempts to add' },
      ifRev: { type: 'integer', description: 'refuse unless the plan is at this rev' },
    },
    required: ['action'],
  },
}

// ---------------------------------------------------------------- parseInput

type Fields = ReadonlySet<string>
const keys = (...k: string[]): Fields => new Set(k)

// What each action may carry, besides the engine's own `tool`, `tool_use_id` and `agentId`. Anything else is refused,
// so a field that only looks meaningful (a `verification`, a `results` list) never reaches `apply`.
const ALLOWED: Record<(typeof ACTIONS)[number], Fields> = {
  create: keys('action', 'title', 'items'),
  activate: keys('action', 'plan', 'ifRev'),
  claim: keys('action', 'plan', 'item', 'ifRev'),
  progress: keys('action', 'plan', 'item', 'note', 'ifRev'),
  block: keys('action', 'plan', 'item', 'note', 'ifRev'),
  fail: keys('action', 'plan', 'item', 'note', 'ifRev'),
  claim_done: keys('action', 'plan', 'item', 'summary', 'commands', 'commits', 'files', 'ifRev'),
  verify: keys('action', 'plan', 'item', 'gen', 'manual', 'note', 'cwd', 'ifRev'),
  amend: keys('action', 'plan', 'item', 'patch', 'planTitle', 'ifRev'),
  assign: keys('action', 'plan', 'item', 'assignee', 'ifRev'),
  reopen: keys('action', 'plan', 'item', 'extraAttempts', 'ifRev'),
  abandon: keys('action', 'plan', 'item', 'ifRev'),
  list: keys('action'),
  status: keys('action', 'plan'),
  get: keys('action', 'plan', 'item'),
}

/** The keys the engine puts on a `tool.call` beside the arguments (`ToolCallReserved`, `AgentLoop`, `ToolRequestMeta`). */
const ENGINE_KEYS: Fields = keys('tool', 'tool_use_id', 'agentId', 'requestMeta', 'consent')
/** Fields that would carry a verification result; named in the refusal so the model stops looking for them. */
const RESULT_KEYS: Fields = keys('verification', 'results', 'result', 'verified', 'checksHash', 'outcome')

const ITEM_KEYS: Fields = keys('title', 'instructions', 'acceptance', 'files', 'deps', 'agent', 'model', 'checks', 'parallelSafe')

export type ParseError = { error: string }
const bad = (error: string): ParseError => ({ error })

const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x)
const isStr = (x: unknown): x is string => typeof x === 'string'

/** A list of strings, or an error naming the field. */
function strings(name: string, v: unknown, fallback: string[] | null): string[] | ParseError {
  if (v === undefined && fallback !== null) return fallback
  if (!Array.isArray(v) || !v.every(isStr)) return bad(`${name} must be a list of strings.`)
  if (v.some((s) => s.length > MAX_TEXT_CHARS)) return bad(`An entry of ${name} is too long.`)
  return v.slice()
}

/** An item as the author wrote it; `complete` fills the optional fields at `create` and demands the required ones. */
function itemFields(raw: unknown, complete: boolean, where: string): Partial<ItemInput> | ParseError {
  if (!isObject(raw)) return bad(`${where} must be an object.`)
  for (const k of Object.keys(raw)) if (!ITEM_KEYS.has(k)) return bad(`${where}: unknown field "${k.slice(0, 40)}".`)
  const out: Partial<ItemInput> = {}
  if (raw.title !== undefined || complete) {
    if (!isNonEmpty(raw.title) || raw.title.length > MAX_TITLE_CHARS) {
      return bad(`${where}: a title is needed, at most ${MAX_TITLE_CHARS} characters.`)
    }
    out.title = raw.title
  }
  if (raw.instructions !== undefined || complete) {
    if (!isStr(raw.instructions)) return bad(`${where}: instructions are needed (a string).`)
    if (utf8Bytes(raw.instructions) > MAX_INSTRUCTIONS_BYTES) {
      return bad(`${where}: instructions are over ${MAX_INSTRUCTIONS_BYTES} bytes. Shorten them or split the item; nothing is cut for you.`)
    }
    out.instructions = raw.instructions
  }
  for (const k of ['acceptance', 'files', 'deps'] as const) {
    if (raw[k] === undefined && !complete) continue
    const l = strings(`${where}: ${k}`, raw[k], [])
    if (!Array.isArray(l)) return l
    out[k] = l
  }
  if (raw.agent !== undefined || complete) {
    if (!isNonEmpty(raw.agent)) return bad(`${where}: an agent type is needed (for example coder).`)
    out.agent = raw.agent
  }
  if (raw.model !== undefined || complete) {
    if (raw.model !== undefined && !isStr(raw.model)) return bad(`${where}: model must be a string.`)
    out.model = raw.model ?? ''
  }
  if (raw.checks !== undefined || complete) {
    const c = validateChecks(raw.checks === undefined ? [] : raw.checks)
    if (!Array.isArray(c)) return bad(`${where}: ${c.error}`)
    out.checks = c
  }
  if (raw.parallelSafe !== undefined) {
    if (typeof raw.parallelSafe !== 'boolean') return bad(`${where}: parallelSafe must be true or false.`)
    out.parallelSafe = raw.parallelSafe
  }
  return out
}

/**
 * The model's arguments as an `Action`, or why not. `e` is the `tool.call` event: the engine's keys (`tool`,
 * `tool_use_id`, `agentId`) are ignored and every other key must belong to the action. `bind` and `reserve` are internal
 * (the spawn hook's) and not accepted here. `verify` takes no result data of any kind: the mod runs the checks itself.
 * `session` is the caller's session id, recorded by `assign`.
 */
export function parseInput(e: unknown, session = ''): Action | ParseError {
  if (!isObject(e)) return bad('The input must be an object.')
  const name = e.action
  if (!isStr(name)) return bad('Say which action: one of ' + ACTIONS.join(', ') + '.')
  if (name === 'bind' || name === 'reserve') return bad(`${name} is not available through the tool.`)
  if (!(ACTIONS as readonly string[]).includes(name)) return bad(`Unknown action "${name.slice(0, 40)}". Use one of ${ACTIONS.join(', ')}.`)
  const action = name as (typeof ACTIONS)[number]
  const allowed = ALLOWED[action]

  for (const k of Object.keys(e)) {
    if (ENGINE_KEYS.has(k) || allowed.has(k)) continue
    if (action === 'verify' && RESULT_KEYS.has(k)) {
      return bad('verify takes no results: the orchestrator tool runs the checks itself. Send only plan, item and gen (or manual with a note).')
    }
    if (RESULT_KEYS.has(k)) return bad(`The field "${k}" cannot be supplied; verification is done only by the orchestrator through verify.`)
    return bad(`Unknown field "${k.slice(0, 40)}" for ${action}. It takes ${[...allowed].filter((f) => f !== 'action').join(', ') || 'no fields'}.`)
  }
  for (const k of ['note', 'summary', 'cwd', 'title', 'planTitle', 'assignee'] as const) {
    const v = e[k]
    if (v !== undefined && (!isStr(v) || v.length > MAX_TEXT_CHARS)) return bad(`${k} must be a string of at most ${MAX_TEXT_CHARS} characters.`)
  }

  let plan: string | undefined
  if (allowed.has('plan') && e.plan !== undefined) {
    if (!isStr(e.plan) || !isPlanId(e.plan)) return bad('plan must be a plan id like p-0m3k9x1a2-abc123.')
    plan = e.plan
  }
  let item: string | undefined
  if (allowed.has('item') && e.item !== undefined) {
    if (!isStr(e.item) || !ITEM_ID.test(e.item)) return bad('item must be an item id like s1.')
    item = e.item
  }
  const needPlan = (): ParseError | null => (plan === undefined ? bad(`${action} needs plan (a plan id).`) : null)
  const needItem = (): ParseError | null => (item === undefined ? bad(`${action} needs item (an item id like s1).`) : null)
  const guard: { ifRev?: number } = {}
  if (e.ifRev !== undefined) {
    if (!isInt(e.ifRev) || e.ifRev < 0) return bad('ifRev must be a whole number, the rev you last read.')
    guard.ifRev = e.ifRev
  }

  switch (action) {
    case 'list':
      return { action: 'list' }
    case 'status':
      return plan === undefined ? { action: 'status' } : { action: 'status', plan }
    case 'get': {
      const err = needPlan() ?? needItem()
      return err ?? { action: 'get', plan: plan as string, item: item as string }
    }
    case 'create': {
      if (!isNonEmpty(e.title) || e.title.length > MAX_TITLE_CHARS) return bad(`create needs a title of at most ${MAX_TITLE_CHARS} characters.`)
      if (!Array.isArray(e.items) || e.items.length === 0) return bad('create needs items: a non-empty list.')
      if (e.items.length > MAX_ITEMS) return bad(`At most ${MAX_ITEMS} items per plan. Split the work into two plans.`)
      const items: ItemInput[] = []
      for (let i = 0; i < e.items.length; i++) {
        const f = itemFields(e.items[i], true, `Item ${i + 1}`)
        if ('error' in f) return f
        items.push(f as ItemInput)
      }
      return { action: 'create', title: e.title, items }
    }
    case 'activate':
    case 'abandon':
    case 'amend': {
      const err = needPlan()
      if (err) return err
      if (action === 'activate') return { action, plan: plan as string, ...guard }
      if (action === 'abandon') return { action, plan: plan as string, ...(item === undefined ? {} : { item }), ...guard }
      let patch: Partial<ItemInput> | undefined
      if (e.patch !== undefined) {
        const f = itemFields(e.patch, false, 'patch')
        if ('error' in f) return f
        patch = f
      }
      if (patch === undefined && e.planTitle === undefined) return bad('amend needs a patch for an item (with item), a planTitle, or both.')
      if (patch !== undefined && item === undefined) return bad('amend with a patch needs item.')
      return {
        action: 'amend',
        plan: plan as string,
        ...(item === undefined ? {} : { item }),
        ...(patch === undefined ? {} : { patch }),
        ...(e.planTitle === undefined ? {} : { planTitle: e.planTitle as string }),
        ...guard,
      }
    }
    default:
      break
  }

  // The remaining actions all name a plan and an item.
  const err = needPlan() ?? needItem()
  if (err) return err
  const ref = { plan: plan as string, item: item as string }
  switch (action) {
    case 'claim':
      return { action, ...ref, ...guard }
    case 'progress':
    case 'block':
    case 'fail':
      if (!isNonEmpty(e.note)) return bad(`${action} needs a note saying what happened.`)
      return { action, ...ref, note: e.note, ...guard }
    case 'claim_done': {
      if (!isNonEmpty(e.summary)) return bad('claim_done needs a summary of what you did.')
      const commits = strings('commits', e.commits, [])
      if (!Array.isArray(commits)) return commits
      const files = strings('files', e.files, [])
      if (!Array.isArray(files)) return files
      const raw = e.commands === undefined ? [] : e.commands
      if (!Array.isArray(raw)) return bad('commands must be a list of { argv, exit, outTail }.')
      const commands: { argv: string[]; exit: number; outTail: string }[] = []
      for (const c of raw) {
        if (!isObject(c) || !Array.isArray(c.argv) || !c.argv.every(isStr) || !isInt(c.exit) || !isStr(c.outTail)) {
          return bad('Each command needs argv (a list of strings), exit (a whole number) and outTail (a string).')
        }
        if (c.outTail.length > MAX_TEXT_CHARS) return bad('A command outTail is too long: keep the last lines only.')
        commands.push({ argv: c.argv.slice(), exit: c.exit, outTail: c.outTail })
      }
      return { action, ...ref, summary: e.summary, commands, commits, files, ...guard }
    }
    case 'verify': {
      if (!isInt(e.gen)) return bad('verify needs gen: the gen shown when you got the item.')
      if (e.manual !== undefined && typeof e.manual !== 'boolean') return bad('manual must be true or false.')
      return {
        action,
        ...ref,
        gen: e.gen,
        ...(e.manual === true ? { manual: true } : {}),
        ...(e.note === undefined ? {} : { note: e.note as string }),
        ...(e.cwd === undefined ? {} : { cwd: e.cwd as string }),
        ...guard,
      }
    }
    case 'assign':
      if (!isNonEmpty(e.assignee)) return bad('assign needs assignee: the agent id to bind the item to.')
      return { action, ...ref, agentId: e.assignee.trim(), session, ...guard }
    case 'reopen':
      if (e.extraAttempts !== undefined && (!isInt(e.extraAttempts) || e.extraAttempts < 0 || e.extraAttempts > 10)) {
        return bad('extraAttempts must be a whole number from 0 to 10.')
      }
      return { action, ...ref, ...(e.extraAttempts === undefined ? {} : { extraAttempts: e.extraAttempts }), ...guard }
    default:
      return bad('Unknown action.')
  }
}

// ---------------------------------------------------------------- the actor

/**
 * Who is calling. `agentId` is the engine-set loop id (`undefined` on the main loop); `agents` is `$.agent.list()`. An id
 * the list does not name (workflow agents, engine forks, a failed lookup) or a listed agent whose status is not
 * `running` (it cannot be making this call) is an agent with `agentType: null`, which `authorize` refuses everything.
 */
export function buildActor(agentId: unknown, agents: unknown, session: string): Actor {
  if (agentId === undefined) return { kind: 'main' }
  const id = typeof agentId === 'string' ? agentId : ''
  let agentType: string | null = null
  if (id !== '' && Array.isArray(agents)) {
    const hit = agents.find((a) => isObject(a) && a.id === id)
    if (isObject(hit) && hit.status === 'running' && isNonEmpty(hit.type)) agentType = hit.type
  }
  return { kind: 'agent', agentId: id, agentType, session }
}

// ---------------------------------------------------------------- retry policy

/** The slice of a `mutate` failure the policy reads. */
export type Failure = { code: 'denied' | 'busy' | 'repair' | 'error'; recorded?: boolean }

/** Attempts per call, the first included. A verify retry repeats only the step that failed (its memo keeps the rest), and gets one. */
export function maxAttempts(action: string): number {
  return action === 'verify' ? 2 : 3
}

/**
 * Whether the tool layer should call again, with the `op` (and, for `create`, the `planId`) that failed attempt returned.
 * Only failures that may have committed or may be transient: a lock that stayed busy, an error, a change recorded in the
 * ledger whose publish failed. A denial or a repair request is final. Retrying with the same `op` never applies twice.
 */
export function shouldRetry(f: Failure, attempt: number, action: string): boolean {
  if (attempt >= maxAttempts(action)) return false
  return f.code === 'busy' || f.code === 'error'
}

// ---------------------------------------------------------------- listings

const verifiedCount = (p: Plan): number => p.items.filter((i) => i.status === 'verified').length

/** `p-... "title" active rev 3: 1/3 verified` */
export function planLine(p: Plan): string {
  return `${one(p.id)} "${clamp(one(p.title), 60)}" ${one(p.status)} rev ${p.rev}: ${verifiedCount(p)}/${p.items.length} verified`
}

/** Plan names and statuses, only the plans `actor` may see; every plan when `open` is false, open ones with items when true. */
export function renderListing(plans: Plan[], actor: Actor, open: boolean): string {
  const seen = plans.filter((p) => canView(p, actor))
  if (open) {
    const block = renderBlock(seen, 1800)
    return block === '' ? 'No open plans.' : block
  }
  if (seen.length === 0) return 'No plans yet.'
  return seen.map(planLine).join('\n')
}

/** One plan: its line, then one line per item with its status and who holds it. */
export function renderPlanStatus(plan: Plan, maxChars = 3000): string {
  const lines = plan.items.map((i) => {
    const who = i.boundAgent !== null ? `, bound to ${one(i.agent)}` : ''
    const par = i.parallelSafe === true ? ', parallel-safe' : ''
    return `${one(i.id)} ${one(i.status)} (${one(i.agent)}${who}${par}, gen ${i.gen}): ${clamp(one(i.title), 70)}`
  })
  const ready = readyLine(plan)
  // The ready line goes before the items so a long plan's clamp cuts item lines, not the launch advice.
  return clamp([planLine(plan), ...(ready === null ? [] : [ready]), ...lines].join('\n'), maxChars)
}

/** What a `status` call with a plan returns for `actor`: the plan's items, or the refusal. */
export function statusFor(plan: Plan, actor: Actor): { ok: true; text: string } | { ok: false; reason: string } {
  const auth = authorize(plan, { action: 'status', plan: plan.id }, actor)
  return auth.ok ? { ok: true, text: renderPlanStatus(plan) } : { ok: false, reason: auth.reason }
}
