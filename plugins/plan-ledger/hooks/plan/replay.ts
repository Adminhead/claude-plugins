// plan-ledger: rebuild a plan from its change ledger. Pure: no `$`, no I/O, no clock. The ledger is
// the write-ahead log (decision 2 and 3 in docs/plans/goal-ledger.md); the JSON is a cache of what
// replaying it yields. Replay calls `apply` for every non-denied line, so the live path and the
// recovery path cannot drift apart.
import { apply, type ApplyCtx } from './apply'
import { isObject } from './shared'
import type { Action, Change, Plan } from './types'

/**
 * Replay passes this as the attempt cap. The cap is a live option and is not recorded in a Change, so
 * a replay under a different cap could deny a `claim` that was allowed live. A non-denied line already
 * passed the cap check when it was written and a denied line is never replayed, so trusting the
 * ledger and disabling the cap reproduces the live state under any cap, with no change to the format.
 */
export const UNBOUNDED_ATTEMPT_CAP = Number.MAX_SAFE_INTEGER

const ACTION_NAMES: ReadonlySet<string> = new Set([
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
])

// ---------------------------------------------------------------- parsing

/** A line that is complete (newline-terminated) but is not a valid Change. Kept so nothing is lost silently. */
export type BadLine = { line: number; text: string; reason: string }

export type ParsedLedger = {
  /** Every valid line in file order, denied ones included (review output needs them). */
  changes: Change[]
  /** The text ended without a newline: the last append never finished. */
  torn: boolean
  /** Number of complete but invalid lines; `badLines.length`. */
  bad: number
  /** The unterminated final line, unmodified, or null. The caller quarantines it. */
  tornText: string | null
  badLines: BadLine[]
}

const isStr = (x: unknown): x is string => typeof x === 'string'
const isStrOrNull = (x: unknown): x is string | null => x === null || typeof x === 'string'

function actorOk(a: unknown): boolean {
  if (!isObject(a)) return false
  if (a.kind === 'main') return true
  return a.kind === 'agent' && isStr(a.agentId) && isStr(a.session) && isStrOrNull(a.agentType)
}

/** Returns why `x` is not a ledger line, or null when it is one. */
function changeProblem(x: unknown): string | null {
  if (!isObject(x)) return 'not a JSON object'
  if (x.v !== 1) return 'unknown version'
  if (typeof x.rev !== 'number' || !Number.isInteger(x.rev) || x.rev < 0) return 'bad rev'
  if (!isStr(x.ts) || Number.isNaN(Date.parse(x.ts))) return 'bad ts'
  if (!isStr(x.plan)) return 'bad plan'
  if (!isStrOrNull(x.item)) return 'bad item'
  if (!actorOk(x.actor)) return 'bad actor'
  if (!isStr(x.action)) return 'bad action'
  if (x.denied === null && !ACTION_NAMES.has(x.action)) return 'unknown action'
  if (!isStrOrNull(x.from) || !isStrOrNull(x.to)) return 'bad from/to'
  if (!isObject(x.data)) return 'bad data'
  if (!isStrOrNull(x.denied)) return 'bad denied'
  if (!isStr(x.op)) return 'bad op'
  return null
}

/**
 * Splits ledger text into lines. An unterminated final line is a torn append: it is not returned as a
 * change (the mutation it belonged to never reported success) but is handed back in `tornText`. A
 * complete line that is not valid JSON or not a Change is skipped, counted and handed back in
 * `badLines`. Blank lines carry no data and are ignored.
 */
export function parseLedger(text: string): ParsedLedger {
  const out: ParsedLedger = { changes: [], torn: false, bad: 0, tornText: null, badLines: [] }
  if (text === '') return out
  const parts = text.split('\n')
  const last = parts.pop() as string // '' when the text ends with a newline
  if (last !== '') {
    out.torn = true
    out.tornText = last
  }
  parts.forEach((raw, i) => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (line.trim() === '') return
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      out.badLines.push({ line: i + 1, text: raw, reason: 'not valid JSON' })
      return
    }
    const problem = changeProblem(value)
    if (problem !== null) {
      out.badLines.push({ line: i + 1, text: raw, reason: problem })
      return
    }
    out.changes.push(value as Change)
  })
  out.bad = out.badLines.length
  return out
}

/** Reads a stored plan JSON. Null when it does not parse or is not shaped like a plan (the caller quarantines it). */
export function parsePlanJson(text: string): Plan | null {
  try {
    const p: unknown = JSON.parse(text)
    if (!isObject(p) || p.v !== 1 || !isStr(p.id) || !Array.isArray(p.items)) return null
    if (typeof p.rev !== 'number' || !Number.isInteger(p.rev) || p.rev < 0) return null
    if (!isStr(p.title) || !isStr(p.status)) return null
    if (!p.items.every((i) => isObject(i) && isStr(i.id) && isStr(i.status))) return null
    return p as unknown as Plan
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- replay

export type ReplayResult = { plan: Plan | null; error?: string }

/**
 * Rebuilds a plan by applying every non-denied change in `rev` order. A denied change never changed
 * state and is skipped. The result is `plan: null` with `error` set when the lines cannot be a valid
 * history (a `rev` gap or duplicate, a first line that is not `create`, lines of another plan, or a
 * line `apply` refuses): a partial state would be wrong to mutate from. No lines, or only denied
 * ones, gives `plan: null` with no error.
 *
 * The action is rebuilt as `{ action, plan, item (when non-null), ...data }`; the header keys are
 * written after `data` so that a hand-edited `data` cannot change which action runs. `ifRev` is not
 * recorded. Replay supplies the line's actor, op, ts, plan id and (for `create`) project.
 */
export function replay(changes: Change[]): ReplayResult {
  const applied = changes
    .map((change, index) => ({ change, index }))
    .filter(({ change }) => change.denied === null)
    .sort((a, b) => a.change.rev - b.change.rev || a.index - b.index)
    .map(({ change }) => change)

  let plan: Plan | null = null
  let expected = 1
  for (const c of applied) {
    const where = `line rev ${c.rev} (${c.action})`
    if (c.rev < expected) return fail(`Duplicate ${where}: rev ${c.rev} appears twice among applied lines.`)
    if (c.rev > expected) return fail(`Rev gap: expected rev ${expected}, found rev ${c.rev}.`)
    if (plan === null && c.action !== 'create') return fail(`${where} comes before any create.`)
    if (plan !== null && c.action === 'create') return fail(`${where} creates a second plan in this ledger.`)
    if (plan !== null && c.plan !== plan.id) return fail(`${where} belongs to plan ${c.plan}, not ${plan.id}.`)

    const action = {
      ...c.data,
      action: c.action,
      plan: c.plan,
      ...(c.item !== null ? { item: c.item } : {}),
    } as unknown as Action
    const ctx: ApplyCtx = {
      actor: c.actor,
      nowMs: Date.parse(c.ts),
      attemptCap: UNBOUNDED_ATTEMPT_CAP,
      newPlanId: c.plan,
      op: c.op,
      project: typeof c.data.project === 'string' ? c.data.project : '',
    }
    const r = apply(plan, action, ctx)
    if ('denied' in r) return fail(`${where} was recorded as applied, but replay refuses it: ${r.denied}`)
    if (r.plan.rev !== c.rev || r.change.from !== c.from || r.change.to !== c.to) {
      return fail(`${where} does not match what replay produces (from ${String(r.change.from)} to ${String(r.change.to)}).`)
    }
    plan = r.plan
    expected++
  }
  return { plan }
}

function fail(error: string): ReplayResult {
  return { plan: null, error }
}

// ---------------------------------------------------------------- reconcile

/**
 * Whether the stored JSON may be behind the ledger, decided from the ledger's last line alone (what
 * `tail -n 1` prints) so the common case reads no more than one line. True when the JSON is missing
 * or corrupt (`json` null), when the tail is torn or unreadable (it cannot be trusted to show the
 * latest rev), or when its rev is ahead of the JSON's. A missing or empty ledger with a JSON present
 * needs no replay.
 */
export function needsReplay(json: Plan | null, tail: string | null): boolean {
  if (json === null) return true
  if (tail === null || tail.trim() === '') return false
  if (!tail.endsWith('\n')) return true
  let value: unknown
  try {
    value = JSON.parse(tail)
  } catch {
    return true
  }
  if (changeProblem(value) !== null) return true
  return (value as Change).rev > json.rev
}

export type Reconciled = {
  /** The state to mutate from; null for a new plan or when `error` is set. */
  plan: Plan | null
  /** Where `plan` came from: the JSON, a replay of the ledger, or nowhere (empty store). */
  source: 'json' | 'ledger' | 'none'
  /** Every valid ledger line, denied ones included (review, and `findOp` for retries). */
  changes: Change[]
  /** The ledger ends in an unterminated line: write a newline before appending the next line. */
  torn: boolean
  tornText: string | null
  badLines: BadLine[]
  /** The JSON is ahead of the ledger (the ledger lost its tail); the JSON is kept as is. */
  jsonAhead: boolean
  /** Set when the ledger cannot be replayed; the caller refuses to mutate and points to repair. */
  error?: string
}

/**
 * Picks the state a mutation starts from, as decision 3 describes: keep the JSON when it is at or
 * ahead of the ledger, otherwise rebuild from the ledger. A ledger that is ahead of the JSON but
 * cannot be replayed is an error rather than a fallback to the stale JSON, because mutating from it
 * would write a second line with an existing rev.
 */
export function reconcile(json: Plan | null, ledgerText: string): Reconciled {
  const parsed = parseLedger(ledgerText)
  const base = {
    changes: parsed.changes,
    torn: parsed.torn,
    tornText: parsed.tornText,
    badLines: parsed.badLines,
  }
  const ledgerRev = parsed.changes.reduce((n, c) => (c.denied === null && c.rev > n ? c.rev : n), 0)

  if (json !== null && json.rev >= ledgerRev) {
    return { ...base, plan: json, source: 'json', jsonAhead: json.rev > ledgerRev }
  }
  const r = replay(parsed.changes)
  if (r.error !== undefined) return { ...base, plan: null, source: 'none', jsonAhead: false, error: r.error }
  return { ...base, plan: r.plan, source: r.plan === null ? 'none' : 'ledger', jsonAhead: false }
}

/** The last ledger line carrying `op`, or null: a retry after an ambiguous failure checks this before applying again. */
export function findOp(changes: Change[], op: string): Change | null {
  for (let i = changes.length - 1; i >= 0; i--) if (changes[i].op === op) return changes[i]
  return null
}
