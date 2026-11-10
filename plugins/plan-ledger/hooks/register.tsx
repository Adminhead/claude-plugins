// plan-ledger: the transaction around the pure plan modules (decision 3 in docs/plans/goal-ledger.md), the plan reads,
// `verifyItem`, the directory guard, and (slice 8) the `plan` tool and the `/plans` command. Slice 9 adds the spawn hook.
//
// `claude plugin validate` fails on "$ is passed to X, which is not a function declared at the top of this file", so every
// helper that takes `$` is a top-level function declaration below and `register` only wires hooks to them.
import type { Register } from 'claude-code'
import { apply } from './plan/apply'
import { authorize } from './plan/authorize'
import { checksHash } from './plan/checks'
import {
  COMMAND_NAME,
  goalCounts,
  goalText,
  lockOwner,
  parseArgs,
  renderLog,
  renderShow,
  unlockQuestion,
} from './plan/command'
import { GUARD_REASON, isUnder, normalizePath, commandNamesPlans, plansRoot, writtenPath } from './plan/guard'
import { findOp, needsReplay, parseLedger, parsePlanJson, reconcile, type Reconciled } from './plan/replay'
import {
  appendArgv,
  isPlanId,
  lineFor,
  lockAcquireArgv,
  lockReleaseArgv,
  mkdirArgv,
  newPlanId,
  planPaths,
  projectDir,
  projectKey,
  publishArgv,
  tailArgv,
  tmpPath,
  type PlanPaths,
} from './plan/store'
import { renderItem } from './plan/render'
import { hasControl, utf8Bytes } from './plan/shared'
import { MAX_INPUT_CHARS, TOOL, TOOL_NAME, buildActor, parseInput, renderListing, renderPlanStatus, shouldRetry, statusFor } from './plan/tool'
import type { Action, Actor, Change, Check, CheckResult, Plan, Tree, Verification } from './plan/types'
import { DEFAULT_ATTEMPT_CAP, MAX_DENIED_LOGGED, MAX_LEDGER_BYTES } from './plan/types'
import {
  CRASH_EXIT,
  NO_HEAD,
  commandFor,
  fingerprint,
  gateQuestion,
  judge,
  outTail,
  summarize,
  treeArgvs,
  verdictOf,
} from './plan/verify'

// `$` is the engine's interface; the d.ts for it is written by the engine at load, so helpers take it untyped.
type Dollar = any

/** The acquire script waits this long; the process timeout must be longer or the engine kills it mid-poll. */
const LOCK_WAIT_SEC = 5
const LOCK_PROCESS_TIMEOUT_MS = 8000
const IO_TIMEOUT_MS = 5000
/** One check may run this long (the engine's own ceiling for `process.run`); a longer one counts as a failed run. */
const CHECK_TIMEOUT_MS = 600_000
const TREE_TIMEOUT_MS = 30_000
const RUN_IT = 'Run it'
const REFUSE_IT = 'Refuse'
/** Mutations that stay allowed once the ledger is full, so a plan can still be closed. */
const TERMINAL_ACTIONS: ReadonlySet<string> = new Set(['verify', 'abandon'])

const REPAIR_HINT = 'Ask the person to run /plans repair for this plan, then retry.'
const BUSY_MESSAGE = 'Plan busy, retry. If it stays busy, ask the person to run /plans unlock for this plan.'

// ---------------------------------------------------------------- results

export type MutateOk = {
  ok: true
  code: 'applied' | 'duplicate'
  /** Text for the model. */
  message: string
  plan: Plan
  planId: string
  /** Pass this `op` (and `planId` for a `create`) again to retry without applying twice. */
  op: string
}

export type MutateFail = {
  ok: false
  /**
   * `denied`: the plan refused the action (the reason is in `message`). `busy`: the lock stayed held. `repair`: the
   * ledger and the plan file disagree in a way a mutation must not paper over. `error`: anything else.
   */
  code: 'denied' | 'busy' | 'repair' | 'error'
  message: string
  planId: string | null
  op: string | null
  /** True when the change reached the ledger before the failure; a retry with the same `op` reports it as applied. */
  recorded?: boolean
}

export type MutateResult = MutateOk | MutateFail

export type MutateOpts = {
  /** The id of an earlier attempt that may have committed: the call then checks the ledger for it before applying. */
  op?: string
  /** For `create` only: the plan id chosen by an earlier attempt. */
  planId?: string
  attemptCap?: number
}

export type ReadResult = { ok: true; plan: Plan } | { ok: false; code: 'missing' | 'error'; message: string }

const failure = (
  code: MutateFail['code'],
  message: string,
  planId: string | null,
  op: string | null,
  recorded?: boolean,
): MutateFail => ({ ok: false, code, message, planId, op, ...(recorded ? { recorded } : {}) })

// ---------------------------------------------------------------- the project directory

type Store = { home: string; root: string; key: string; dir: string }

// Reset in session.end. Keyed on the inputs too, so a changed cwd or HOME never reuses another project's directory.
let store: Store | null = null
// Denials not written to a ledger since its last entry (only the first MAX_DENIED_LOGGED per plan are logged). Memory only.
const suppressedDenials = new Map<string, number>()

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Six characters of `[0-9a-f]` from the platform's random source, valid as the random part of a plan id. */
function rand6(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 6)
}

/**
 * The directory this project's plans live in, created if absent. The root is the main working tree's (so every worktree
 * of a repo shares one directory) or the cwd outside git. Throws when HOME is unusable or the directory cannot be made.
 */
export async function dirOf($: Dollar): Promise<Store> {
  const home = await $.env.get('HOME')
  if (typeof home !== 'string' || !home.startsWith('/')) throw new Error('HOME is not set')
  const repo = await $.session.repo()
  const root: string = repo?.root ?? (await $.session.cwd())
  if (store !== null && store.home === home && store.root === root) return store
  const key = projectKey(root, await sha256Hex(root))
  const dir = projectDir(home, key)
  const made = await $.process.run(mkdirArgv(dir), { timeoutMs: IO_TIMEOUT_MS })
  if (made.exitCode !== 0) throw new Error('could not create the plan directory')
  store = { home, root, key, dir }
  return store
}

// ---------------------------------------------------------------- the lock

type Locked<T> = { held: true; value: T } | { held: false; fail: MutateFail }

/**
 * Runs `fn` while holding the plan's lock directory. Exit 75 from the acquire script (busy for LOCK_WAIT_SEC) is the busy
 * message; any other failure is an error. The lock is released in `finally`, and also after an acquire that threw (a
 * timed-out acquire may still have won the directory; release removes it only when the token is ours).
 */
async function withLock<T>(
  $: Dollar,
  lock: string,
  planId: string | null,
  op: string | null,
  fn: (token: string) => Promise<T>,
): Promise<Locked<T>> {
  const token: string = crypto.randomUUID()
  let exit: number
  try {
    const r = await $.process.run(lockAcquireArgv(lock, token, LOCK_WAIT_SEC), { timeoutMs: LOCK_PROCESS_TIMEOUT_MS })
    exit = r.exitCode
  } catch {
    await release($, lock, token)
    return { held: false, fail: failure('error', 'Could not take the plan lock. Retry.', planId, op) }
  }
  if (exit === 75) return { held: false, fail: failure('busy', BUSY_MESSAGE, planId, op) }
  if (exit !== 0) return { held: false, fail: failure('error', 'Could not take the plan lock. Retry.', planId, op) }
  try {
    return { held: true, value: await fn(token) }
  } finally {
    await release($, lock, token)
  }
}

async function release($: Dollar, lock: string, token: string): Promise<void> {
  try {
    await $.process.run(lockReleaseArgv(lock, token), { timeoutMs: IO_TIMEOUT_MS })
  } catch {
    // Nothing more to do: a lock this call still owns after a failed release is the person's to clear with /plans unlock.
  }
}

// ---------------------------------------------------------------- reading the files

type JsonRead = { kind: 'missing' } | { kind: 'bad' } | { kind: 'ok'; plan: Plan }

async function readJson($: Dollar, path: string): Promise<JsonRead> {
  if (!(await $.fs.exists(path))) return { kind: 'missing' }
  let text: string
  try {
    text = await $.fs.read(path)
  } catch {
    return { kind: 'bad' }
  }
  const plan = parsePlanJson(text)
  return plan === null ? { kind: 'bad' } : { kind: 'ok', plan }
}

/** Plan file names (`<planId>.json`) of this project, newest first, at most 100. Ids are time-ordered, so the name sorts by age. */
export async function listPlans($: Dollar): Promise<string[]> {
  const { dir } = await dirOf($)
  const entries: { name: string; kind: string }[] = await $.fs.list(dir)
  return entries
    .filter((f) => f.kind === 'file' && f.name.endsWith('.json') && isPlanId(f.name.slice(0, -'.json'.length)))
    .map((f) => f.name.slice(0, -'.json'.length))
    .sort()
    .reverse()
    .slice(0, 100)
}

/**
 * Reads a plan without the lock. The publish is an atomic rename, so a reader sees the old file or the new one; a
 * parse failure is retried once after 100 ms, then read under the lock (and, if the file is still bad, rebuilt from the
 * ledger in memory only, so a reader never writes). The caller filters what an agent may see (`canView`).
 */
export async function readPlan($: Dollar, planId: string): Promise<ReadResult> {
  if (!isPlanId(planId)) return { ok: false, code: 'error', message: 'That is not a plan id.' }
  let paths: PlanPaths
  try {
    const st = await dirOf($)
    paths = planPaths(st.home, st.key, planId)
  } catch {
    return { ok: false, code: 'error', message: 'The plan store is not available. Retry.' }
  }
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await readJson($, paths.json)
      // A missing file with a ledger is a create whose publish never happened: rebuild it like a damaged one.
      if (r.kind === 'missing' && !(await $.fs.exists(paths.ledger))) return { ok: false, code: 'missing', message: 'No such plan.' }
      if (r.kind === 'ok' && r.plan.id === planId) return { ok: true, plan: r.plan }
      if (attempt === 0) await $.clock.sleep(100)
    }
    const locked = await withLock($, paths.lock, planId, null, async (): Promise<ReadResult> => {
      const again = await readJson($, paths.json)
      if (again.kind === 'ok' && again.plan.id === planId) return { ok: true, plan: again.plan }
      const hasLedger: boolean = await $.fs.exists(paths.ledger)
      if (again.kind === 'missing' && !hasLedger) return { ok: false, code: 'missing', message: 'No such plan.' }
      const text = hasLedger ? ((await $.fs.read(paths.ledger)) as string) : ''
      const rec = reconcile(null, text)
      if (rec.error === undefined && rec.plan !== null && rec.plan.id === planId) return { ok: true, plan: rec.plan }
      return { ok: false, code: 'error', message: `The plan file is damaged. ${REPAIR_HINT}` }
    })
    return locked.held ? locked.value : { ok: false, code: 'error', message: locked.fail.message }
  } catch {
    return { ok: false, code: 'error', message: 'The plan could not be read. Retry.' }
  }
}

// ---------------------------------------------------------------- the transaction

/** The last line of the ledger's JSON, its `rev`; null when the line does not parse to one. */
function tailRev(tail: string): number | null {
  try {
    const v: unknown = JSON.parse(tail)
    const rev = (v as { rev?: unknown } | null)?.rev
    return typeof rev === 'number' ? rev : null
  } catch {
    return null
  }
}

async function removeStaleTmp($: Dollar, paths: PlanPaths, planId: string): Promise<void> {
  // The lock proves no publisher is mid-write, so every `<planId>.json.tmp.*` is a crash's leftover. Best effort.
  const stale = new RegExp(`^${planId}\\.jsonl?\\.tmp\\.[A-Za-z0-9._-]+$`)
  try {
    const entries: { name: string }[] = await $.fs.list(paths.dir)
    for (const f of entries) {
      if (stale.test(f.name)) await $.process.run(['rm', '-f', '--', `${paths.dir}/${f.name}`], { timeoutMs: IO_TIMEOUT_MS })
    }
  } catch {
    // A leftover tmp file is harmless; the next mutation tries again.
  }
}

/** Writes `text` to a tmp file beside `to` and renames it over `to`. Throws on any failure, leaving `to` as it was. */
async function publishText($: Dollar, to: string, text: string, token: string): Promise<void> {
  const tmp = tmpPath(to, token)
  try {
    await $.fs.write(tmp, text)
    const moved = await $.process.run(publishArgv(tmp, to), { timeoutMs: IO_TIMEOUT_MS })
    if (moved.exitCode !== 0) throw new Error('mv failed')
  } catch (err) {
    try {
      await $.process.run(['rm', '-f', '--', tmp], { timeoutMs: IO_TIMEOUT_MS })
    } catch {
      // The next mutation removes it.
    }
    throw err
  }
}

/** Writes `plan` over the JSON through a tmp file. Throws on any failure, leaving the old JSON. */
async function publish($: Dollar, paths: PlanPaths, plan: Plan, token: string): Promise<void> {
  await publishText($, paths.json, JSON.stringify(plan), token)
}

/** Brings the JSON up to a replayed plan after a call that applied nothing. Failure is ignored: the next mutation heals it. */
async function healJson($: Dollar, paths: PlanPaths, rec: Reconciled, token: string): Promise<void> {
  if (rec.source !== 'ledger' || rec.plan === null) return
  try {
    await publish($, paths, rec.plan, token)
  } catch {
    // Reconcile redoes this at the start of the next mutation.
  }
}

type Reconcile = { rec: Reconciled; ledgerSize: number; loaded: boolean; text: string } | MutateFail

/**
 * The state a mutation starts from. Reads the JSON (quarantining it when it is unreadable as a plan), asks `tail` for the
 * ledger's newest line, and reads the whole ledger only when needed: the JSON is missing or bad, the tail is behind or
 * ahead of the JSON, the tail is torn, or `needAll` (a retry that must look for its `op`).
 */
async function reconcileStore(
  $: Dollar,
  paths: PlanPaths,
  planId: string,
  nowMs: number,
  needAll: boolean,
  op: string,
): Promise<Reconcile> {
  let json: Plan | null = null
  const read = await readJson($, paths.json)
  if (read.kind === 'ok') {
    json = read.plan
  } else if (read.kind === 'bad') {
    const moved = await $.process.run(['mv', '-n', '--', paths.json, `${paths.json}.corrupt-${nowMs}`], {
      timeoutMs: IO_TIMEOUT_MS,
    })
    if (moved.exitCode !== 0) return failure('error', 'The plan file is damaged and could not be set aside. Retry.', planId, op)
  }
  if (json !== null && json.id !== planId) {
    return failure('repair', `The plan file does not belong to this plan. ${REPAIR_HINT}`, planId, op)
  }

  const ledgerExists: boolean = await $.fs.exists(paths.ledger)
  let ledgerSize = 0
  let tail: string | null = null
  if (ledgerExists) {
    ledgerSize = ((await $.fs.stat(paths.ledger)) as { size: number }).size
    const t = await $.process.run(tailArgv(paths.ledger), { timeoutMs: IO_TIMEOUT_MS })
    if (t.exitCode !== 0) return failure('error', 'The plan ledger could not be read. Retry.', planId, op)
    tail = t.stdout
  }

  // The tail's rev equals the ledger's applied rev in a healthy ledger (a denied line repeats the current rev), so a JSON
  // whose rev differs from it, ahead or behind, takes the full path where `reconcile` names which it is.
  const fast = !needAll && json !== null && !needsReplay(json, tail) && tail !== null && tailRev(tail) === json.rev
  if (fast) {
    const rec: Reconciled = { plan: json, source: 'json', changes: [], torn: false, tornText: null, badLines: [], jsonAhead: false }
    return { rec, ledgerSize, loaded: false, text: '' }
  }
  const text = ledgerExists ? ((await $.fs.read(paths.ledger)) as string) : ''
  const rec = reconcile(json, text)
  if (rec.error !== undefined) {
    return failure('repair', `The plan ledger cannot be replayed (${rec.error.slice(0, 200)}). ${REPAIR_HINT}`, planId, op)
  }
  if (rec.jsonAhead) {
    return failure('repair', `The plan file is ahead of its change ledger, so a change would leave a gap. ${REPAIR_HINT}`, planId, op)
  }
  if (rec.plan !== null && rec.plan.id !== planId) {
    return failure('repair', `The change ledger belongs to another plan. ${REPAIR_HINT}`, planId, op)
  }
  return { rec, ledgerSize, loaded: true, text }
}

async function appendLine($: Dollar, paths: PlanPaths, text: string): Promise<boolean> {
  try {
    const r = await $.process.run(appendArgv(paths.ledger), { stdin: text, timeoutMs: IO_TIMEOUT_MS })
    return r.exitCode === 0
  } catch {
    return false
  }
}

/**
 * What goes before the next ledger line, and the ledger's size once it is there. A last line that is a whole change missing
 * only its newline is closed with one (it counts as applied). A cut-off fragment is set aside rather than closed: a copy
 * goes to `<ledger>.torn-<ms>` and the ledger is rewritten without it, atomically, so it never becomes a line of the
 * ledger. Null when that could not be done; nothing is appended then.
 */
async function settleTail(
  $: Dollar,
  paths: PlanPaths,
  r: { rec: Reconciled; ledgerSize: number; text: string },
  token: string,
  nowMs: number,
): Promise<{ prefix: string; size: number } | null> {
  const { rec } = r
  if (!rec.torn) return { prefix: '', size: r.ledgerSize }
  if (rec.tornText === null) return { prefix: '\n', size: r.ledgerSize }
  if (!r.text.endsWith(rec.tornText)) return null
  try {
    await $.fs.write(`${paths.ledger}.torn-${nowMs}`, rec.tornText)
    await publishText($, paths.ledger, r.text.slice(0, r.text.length - rec.tornText.length), token)
  } catch {
    return null
  }
  return { prefix: '', size: Math.max(0, r.ledgerSize - utf8Bytes(rec.tornText)) }
}

type Tx = {
  paths: PlanPaths
  planId: string
  action: Action
  actor: Actor
  op: string
  retry: boolean
  attemptCap: number
  root: string
}

/** The critical section: everything after the lock is held and before it is released. */
async function transact($: Dollar, tx: Tx, token: string): Promise<MutateResult> {
  const { paths, planId, action, actor, op } = tx
  const nowMs: number = await $.clock.now()
  await removeStaleTmp($, paths, planId)

  const r = await reconcileStore($, paths, planId, nowMs, tx.retry, op)
  if ('ok' in r) return r
  const { rec } = r

  if (tx.retry) {
    const hit = findOp(
      rec.changes.filter((c) => c.denied === null),
      op,
    )
    if (hit !== null && rec.plan !== null) {
      await healJson($, paths, rec, token)
      const message = `This call was already applied (rev ${hit.rev}). The plan is at rev ${rec.plan.rev}.`
      return { ok: true, code: 'duplicate', message, plan: rec.plan, planId, op }
    }
  }
  if (action.action === 'create' && rec.plan !== null) {
    return failure('error', 'A plan with this id already exists. Retry to get a new id.', planId, op)
  }

  const tail = await settleTail($, paths, r, token, nowMs)
  if (tail === null) {
    return failure('error', 'The cut-off end of the change ledger could not be set aside, so nothing was changed. Retry.', planId, op)
  }
  const { prefix, size: ledgerSize } = tail

  const out = apply(rec.plan, action, {
    actor,
    nowMs,
    attemptCap: tx.attemptCap,
    newPlanId: planId,
    op,
    project: tx.root,
  })

  if ('denied' in out) {
    // A denial is logged for review, but only for a plan that exists (a create, or an existing plan), only for the first
    // MAX_DENIED_LOGGED, and only while the ledger has room. It never changes the JSON.
    if (rec.plan !== null || action.action === 'create') {
      const changes = r.loaded ? rec.changes : parseLedger(await $.fs.read(paths.ledger)).changes
      const logged = changes.filter((c) => c.denied !== null).length
      const change: Change = { ...out.change, ...suppressedField(planId) }
      const text = prefix + lineFor(change)
      if (logged >= MAX_DENIED_LOGGED || ledgerSize + utf8Bytes(text) > MAX_LEDGER_BYTES) {
        suppressedDenials.set(planId, (suppressedDenials.get(planId) ?? 0) + 1)
      } else if (await appendLine($, paths, text)) {
        suppressedDenials.delete(planId)
      }
    }
    await healJson($, paths, rec, token)
    return failure('denied', out.denied, planId, op)
  }

  // Write-ahead: the ledger line first, then the JSON. A crash between the two is repaired by the next call's reconcile.
  const change: Change = { ...out.change, ...suppressedField(planId) }
  const text = prefix + lineFor(change)
  if (!TERMINAL_ACTIONS.has(action.action) && ledgerSize + utf8Bytes(text) > MAX_LEDGER_BYTES) {
    return failure(
      'error',
      'The change ledger for this plan is full. Ask the orchestrator to verify or abandon the remaining items, or to start a new plan.',
      planId,
      op,
    )
  }
  if (!(await appendLine($, paths, text))) {
    return failure('error', 'The change could not be recorded, so nothing was changed. Retry.', planId, op)
  }
  suppressedDenials.delete(planId)
  try {
    await publish($, paths, out.plan, token)
  } catch {
    return failure(
      'error',
      `The change to plan ${planId} was recorded (rev ${out.plan.rev}) but the plan file could not be updated; the next call repairs it. Do not repeat this call.`,
      planId,
      op,
      true,
    )
  }
  return { ok: true, code: 'applied', message: out.message, plan: out.plan, planId, op }
}

function suppressedField(planId: string): { suppressedDenials?: number } {
  const n = suppressedDenials.get(planId) ?? 0
  return n > 0 ? { suppressedDenials: n } : {}
}

/**
 * Applies one action to a plan under its lock: acquire, read the JSON, reconcile against the ledger, apply, append the
 * ledger line, publish the JSON through a tmp file and `mv`, release. `planId` is null only for `create`.
 *
 * Retrying after an ambiguous failure (a timeout, or a result with `recorded`) with the returned `op` (and `planId`) is
 * safe: the ledger is searched for the `op` and the call reports it applied rather than applying twice.
 */
export async function mutate(
  $: Dollar,
  planId: string | null,
  action: Action,
  actor: Actor,
  opts: MutateOpts = {},
): Promise<MutateResult> {
  const op = opts.op ?? crypto.randomUUID()
  const retry = opts.op !== undefined
  let id: string
  if (action.action === 'create') {
    if (planId !== null) return failure('error', 'A new plan takes no plan id.', planId, op)
    id = opts.planId ?? newPlanId(await $.clock.now(), rand6())
  } else {
    if (planId === null || (action as { plan?: unknown }).plan !== planId) {
      return failure('error', 'The action and the plan id disagree.', planId, op)
    }
    id = planId
  }
  if (!isPlanId(id)) return failure('error', 'That is not a plan id.', null, op)

  let tx: Tx
  try {
    const st = await dirOf($)
    tx = {
      paths: planPaths(st.home, st.key, id),
      planId: id,
      action,
      actor,
      op,
      retry,
      attemptCap: opts.attemptCap ?? DEFAULT_ATTEMPT_CAP,
      root: st.root,
    }
  } catch {
    return failure('error', 'The plan store is not available. Retry.', id, op)
  }

  try {
    const locked = await withLock($, tx.paths.lock, id, op, (token) => transact($, tx, token))
    return locked.held ? locked.value : locked.fail
  } catch {
    // An exception after the lock was taken, before or after the ledger line: the op id tells a retry which.
    return failure('error', 'The plan could not be updated. Retry; the same call will not apply twice.', id, op)
  }
}

// ---------------------------------------------------------------- verification

export type VerifyArgs = {
  /** The item `gen` the caller saw; a changed item is refused. */
  gen: number
  /** Verify by hand, for an item with no checks; needs `note`. Runs nothing. */
  manual?: boolean
  note?: string
  /** Absolute directory to run the checks in (default: the session's). Recorded, canonicalized, shown before any run. */
  cwd?: string
  /** The plan `rev` the caller last read. A mismatch refuses before anything is asked or run; see `verifyItem`. */
  ifRev?: number
}

/**
 * What one `verify` call keeps between its own attempts, so a retry never repeats what already happened: the approval
 * the person gave, the tree before, the results of the run, and the judged verification awaiting its commit. The caller
 * makes one per tool call. `key` names the checks and directory they belong to; a changed key starts over.
 */
export type VerifyMemo = {
  key?: string
  gated?: boolean
  before?: Tree
  results?: CheckResult[]
  verification?: Verification
}

export type VerifyOpts = MutateOpts & { memo?: VerifyMemo }

const refusal = (message: string, planId: string, op: string | null = null): MutateFail =>
  failure('denied', message, planId, op)

/** The canonical directory the checks run in, or why not. The caller's `cwd` is a location only: never a command. */
async function resolveCwd($: Dollar, given: unknown): Promise<{ ok: true; cwd: string } | { ok: false; message: string }> {
  const bad = { ok: false as const, message: 'cwd must be an absolute path to an existing directory.' }
  const raw: unknown = given === undefined ? await $.session.cwd() : given
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.length > 1024 || hasControl(raw)) return bad
  try {
    const st = (await $.fs.stat(raw, { resolve: true })) as { kind?: string; realPath?: string }
    if (st.kind !== 'dir' || typeof st.realPath !== 'string' || !st.realPath.startsWith('/')) return bad
    return { ok: true, cwd: st.realPath }
  } catch {
    return bad
  }
}

/**
 * The execution gate for one check, before anything runs. `$.process.run` is not a Bash call, so installed Bash guards do
 * not see it; `$.tool.check` reports only the user's own rules (and not the directory), and shows a guard's target as
 * `ask`. So `allow` means "the user's rules allow it", `deny` refuses, and `ask` or any other answer (a throw, an unknown
 * shape) goes to the person with the exact argv and directory. A refused, dismissed or unanswerable question (`-p`) refuses.
 *
 * TODO(G3, docs/plans/goal-ledger.md "Open interactive gates"): the real `$.ui.ask` dialog is unverified. Headless runs and
 * tests only show that a rejection (`-p`) refuses. A person must confirm in an interactive session that the dialog shows
 * the exact argv and cwd, that "Run it" runs the check, and that "Refuse" and dismissing it refuse.
 */
async function gateCheck($: Dollar, check: Check, cwd: string): Promise<string | null> {
  let decision: 'allow' | 'ask' | 'deny'
  try {
    decision = verdictOf(await $.tool.check({ tool: 'Bash', input: { command: commandFor(check.argv) } }))
  } catch {
    decision = 'ask'
  }
  if (decision === 'deny') {
    return `Check "${check.label}" is denied by the user's permission rules, so nothing was run and the item is not verified. Tell the person.`
  }
  if (decision === 'allow') return null
  let answer: unknown
  try {
    answer = await $.ui.ask(gateQuestion(check, cwd), { options: [RUN_IT, REFUSE_IT], header: 'Run check' })
  } catch {
    return `Check "${check.label}" needs the person's approval and could not be asked, so nothing was run and the item is not verified. Tell the person to verify in an interactive session.`
  }
  return answer === RUN_IT ? null : `The person refused check "${check.label}", so nothing was run and the item is not verified.`
}

/** HEAD and a fingerprint of the tree in `cwd`; null when git could not be run at all. */
async function captureTree($: Dollar, cwd: string): Promise<Tree | null> {
  const argvs = treeArgvs()
  try {
    const head = await $.process.run(argvs.head, { cwd, timeoutMs: TREE_TIMEOUT_MS })
    const diff = await $.process.run(argvs.diff, { cwd, timeoutMs: TREE_TIMEOUT_MS })
    const status = await $.process.run(argvs.status, { cwd, timeoutMs: TREE_TIMEOUT_MS })
    const part = (r: { exitCode: number; stdout: string }) => (r.exitCode === 0 ? r.stdout : `exit ${r.exitCode}`)
    return {
      head: head.exitCode === 0 && typeof head.stdout === 'string' ? head.stdout.trim() : NO_HEAD,
      fingerprint: fingerprint(part(diff), part(status)),
    }
  } catch {
    return null
  }
}

/** Runs one recorded check. A run that cannot finish (timeout, no such program) is a failed result, never a pass. */
async function runCheck($: Dollar, check: Check, cwd: string): Promise<CheckResult> {
  try {
    const r = await $.process.run(check.argv, { cwd, timeoutMs: CHECK_TIMEOUT_MS })
    const exit = Number.isInteger(r.exitCode) ? (r.exitCode as number) : CRASH_EXIT
    return { label: check.label, exit, expectExit: check.expectExit, outTail: outTail(r.stdout, r.stderr) }
  } catch (err) {
    const why = err instanceof Error ? err.message.slice(0, 200) : 'unknown error'
    return { label: check.label, exit: CRASH_EXIT, expectExit: check.expectExit, outTail: `The check could not run to completion: ${why}` }
  }
}

/** The ledger entry that carries `op`, or null. A read without the lock: the caller's own attempt has finished by now. */
async function recordedOp($: Dollar, planId: string, op: string): Promise<{ ok: true; change: Change | null } | { ok: false }> {
  try {
    const st = await dirOf($)
    const paths = planPaths(st.home, st.key, planId)
    if (!(await $.fs.exists(paths.ledger))) return { ok: true, change: null }
    const parsed = parseLedger((await $.fs.read(paths.ledger)) as string)
    return { ok: true, change: findOp(parsed.changes.filter((c) => c.denied === null), op) }
  } catch {
    return { ok: false }
  }
}

/** What the ledger holds for a `verify` that ran checks, worded for the model; empty for anything else. */
function recordedSummary(itemId: string, change: Change | null): string {
  if (change === null || change.action !== 'verify') return ''
  const v = (change.data as { verification?: Verification }).verification
  return v !== undefined && v !== null && v.kind === 'checks' && Array.isArray(v.results) ? `${summarize(itemId, v)} ` : ''
}

/**
 * `verify` for one item. Order matters: (0) a retry (`opts.op`) first looks its op up in the ledger and, when the change is
 * there, runs and asks nothing and reports what the ledger holds; (1) read the plan and run `authorize` and the
 * `claimed_done` and `gen` preconditions, and when any fails hand the plain action to `mutate`, which denies it and logs
 * it, with no prompt and no subprocess for a check; (2) a `manual` verify runs nothing; (3) gate every check before any
 * runs; (4) HEAD and tree fingerprint, the checks (the argv recorded at plan time, in the canonical cwd, outside the
 * lock), the tree again; (5) `judge`; (6) `mutate` records the verification built here (the public input has no field for
 * one), and `apply` refuses it if the item is no longer `claimed_done` at the same `gen` or its checks changed during
 * the run. Other items changing meanwhile does not matter, so the plan `rev` is not part of the commit condition.
 *
 * `opts.memo` carries the steps already done across the attempts of one call: a retry skips the prompt, the checks and the
 * judging that finished, and repeats only the step that failed (a tree read, the commit). The answer's summary is always
 * of what the ledger holds: of this run's verification when this call applied it, of the recorded one on a duplicate.
 */
export async function verifyItem(
  $: Dollar,
  planId: string,
  itemId: string,
  args: VerifyArgs,
  actor: Actor,
  opts: VerifyOpts = {},
): Promise<MutateResult> {
  const memo: VerifyMemo = opts.memo ?? {}
  const base: Action = {
    action: 'verify',
    plan: planId,
    item: itemId,
    gen: args.gen,
    ...(args.manual === true ? { manual: true } : {}),
    ...(typeof args.note === 'string' ? { note: args.note } : {}),
    ...(typeof args.cwd === 'string' ? { cwd: args.cwd } : {}),
    ...(typeof args.ifRev === 'number' ? { ifRev: args.ifRev } : {}),
  }
  // The commit of a run is not conditioned on the plan `rev` (other items move it meanwhile); `ifRev` was checked up front.
  const unguarded = (): Action => {
    const { ifRev: _ignored, ...rest } = base as Action & { ifRev?: number }
    return rest as Action
  }
  const commit = async (action: Action, mine: Verification | null): Promise<MutateResult> => {
    const done = await mutate($, planId, action, actor, opts)
    if (!done.ok) {
      return done.code === 'denied' && mine !== null
        ? { ...done, message: `The checks ran, but the result was not recorded: ${done.message}` }
        : done
    }
    let summary = ''
    if (done.code === 'applied' && mine !== null && mine.kind === 'checks') summary = `${summarize(itemId, mine)} `
    if (done.code === 'duplicate') {
      const seen = await recordedOp($, planId, done.op)
      if (seen.ok) summary = recordedSummary(itemId, seen.change)
    }
    return { ...done, message: `${summary}${done.message}` }
  }

  if (opts.op !== undefined) {
    const seen = await recordedOp($, planId, opts.op)
    if (!seen.ok) return failure('error', 'The plan ledger could not be read. Retry.', planId, opts.op)
    if (seen.change !== null) return commit(base, null)
  }
  if (memo.verification !== undefined) return commit({ ...unguarded(), verification: memo.verification }, memo.verification)

  const read = await readPlan($, planId)
  if (!read.ok) return failure('error', read.message, planId, null)
  const plan = read.plan
  const item = plan.items.find((i) => i.id === itemId)

  const auth = authorize(plan, base, actor)
  const staleRev = typeof args.ifRev === 'number' && args.ifRev !== plan.rev
  if (!auth.ok || staleRev || item === undefined || item.status !== 'claimed_done' || item.gen !== args.gen) {
    // Denied by the same pure rules (the ifRev guard included), under the lock, and logged. Without `verification` or
    // `manual` apply can only deny.
    return mutate($, planId, base, actor, opts)
  }
  if (args.manual === true) return mutate($, planId, base, actor, opts)
  if (item.checks.length === 0) {
    return refusal(`${item.id} has no checks, so there is nothing to run. If you checked it by hand, verify it with manual: true and a note.`, planId)
  }

  const where = await resolveCwd($, args.cwd)
  if (!where.ok) return refusal(where.message, planId)
  const { cwd } = where

  const checks: Check[] = item.checks.map((c) => ({ label: c.label, argv: c.argv.slice(), expectExit: c.expectExit }))
  const ranHash = checksHash(checks)
  const key = `${ranHash}\u0000${cwd}`
  if (memo.key !== key) {
    // A changed set of checks or directory (an amend between attempts) invalidates everything kept.
    for (const k of Object.keys(memo)) delete (memo as Record<string, unknown>)[k]
    memo.key = key
  }
  if (memo.gated !== true) {
    for (const check of checks) {
      const why = await gateCheck($, check, cwd)
      if (why !== null) return refusal(why, planId)
    }
    memo.gated = true
  }

  if (memo.before === undefined) {
    const before = await captureTree($, cwd)
    if (before === null) return failure('error', 'Could not read the working tree state with git, so nothing was run. Retry.', planId, null)
    memo.before = before
  }
  if (memo.results === undefined) {
    const results: CheckResult[] = []
    for (const check of checks) results.push(await runCheck($, check, cwd))
    memo.results = results
  }
  const after = await captureTree($, cwd)
  if (after === null) return failure('error', 'Could not read the working tree state after the checks, so nothing is recorded. Retry; the checks are not run again.', planId, null)

  const at = new Date(await $.clock.now()).toISOString()
  const judged = judge({ ...item, checks }, memo.results, memo.before, after, { cwd, at, ranHash })
  if (!judged.ok) return refusal(`${judged.why} ${item.id} stays claimed_done.`, planId)
  memo.verification = judged.verification
  return commit({ ...unguarded(), verification: judged.verification }, judged.verification)
}

// ---------------------------------------------------------------- the directory guard

/**
 * True when `path` lands in the plans directory. First by spelling (absolute, `.` and `..` folded, `~` expanded), then by
 * where it really lands: the path itself if it exists, else its nearest existing parent, with symlinks followed. A path
 * that exists but cannot be placed is treated as inside (the guard fails closed).
 */
async function landsInPlans($: Dollar, path: string, home: string): Promise<boolean> {
  const root = plansRoot(home)
  const abs = normalizePath(path, await $.session.cwd(), home)
  if (isUnder(abs, root)) return true

  const roots = [root]
  try {
    const real = ((await $.fs.stat(root, { resolve: true })) as { realPath?: string }).realPath
    if (real !== undefined) roots.push(real)
  } catch {
    // No directory yet, so nothing at a resolved spelling to protect.
  }

  let head = abs
  let rest = ''
  for (let i = 0; i < 64; i++) {
    let stat: { realPath?: string } | null = null
    try {
      stat = await $.fs.stat(head, { resolve: true })
    } catch {
      stat = null
    }
    if (stat !== null) {
      if (stat.realPath === undefined) return true
      const placed = rest === '' ? stat.realPath : `${stat.realPath}/${rest}`
      return roots.some((r) => isUnder(placed, r))
    }
    if (head === '/') return false
    const cut = head.lastIndexOf('/')
    rest = rest === '' ? head.slice(cut + 1) : `${head.slice(cut + 1)}/${rest}`
    head = cut <= 0 ? '/' : head.slice(0, cut)
  }
  return false
}

/** Denies Write, Edit, NotebookEdit and Bash calls that touch the plans directory; everything else passes. */
async function guardPlanDir($: Dollar, e: any, next: (e: unknown) => unknown): Promise<unknown> {
  const home = await $.env.get('HOME')
  if (typeof home !== 'string' || !home.startsWith('/')) return next(e)
  let hit: boolean
  if (e.tool === 'Bash') {
    hit = typeof e.command === 'string' && commandNamesPlans(e.command)
  } else {
    const path = writtenPath(e)
    hit = path !== null && (await landsInPlans($, path, home))
  }
  if (!hit) return next(e)
  $.ui.log(`plan-ledger: refused a ${String(e.tool).slice(0, 20)} call that touches the plan files`, { to: 'debug' })
  return { deny: GUARD_REASON }
}

// ---------------------------------------------------------------- the plan tool

type ToolAnswer = { result: string } | { deny: string }

const told = (text: string): ToolAnswer => ({ result: text })
const refused = (text: string): ToolAnswer => ({ deny: text })

async function sessionOf($: Dollar): Promise<string> {
  try {
    const id: unknown = await $.session.id()
    return typeof id === 'string' ? id : ''
  } catch {
    return ''
  }
}

/** Who is calling, from the engine-set `e.agentId` (absent on the main loop) and `$.agent.list()` for the type. */
async function callerOf($: Dollar, e: any, session: string): Promise<Actor> {
  if (e.agentId === undefined) return { kind: 'main' }
  let agents: unknown = []
  try {
    agents = await $.agent.list()
  } catch {
    // An id that cannot be looked up is an untrusted one (agentType null).
  }
  return buildActor(e.agentId, agents, session)
}

/**
 * Runs `call`, and while a failure may be transient or may already have committed (`shouldRetry`) calls it again with the
 * `op` (and, for `create`, the plan id) that `mutate` returned, so the second call finds the first in the ledger and
 * reports it instead of applying it twice. The model never sees an `op`.
 */
async function withRetry($: Dollar, action: Action, call: (opts: MutateOpts) => Promise<MutateResult>, base: MutateOpts): Promise<MutateResult> {
  let r = await call(base)
  for (let attempt = 1; !r.ok && shouldRetry(r, attempt, action.action); attempt++) {
    await $.clock.sleep(150)
    const again: MutateOpts = { ...base }
    if (r.op !== null) again.op = r.op
    if (action.action === 'create' && r.planId !== null) again.planId = r.planId
    r = await call(again)
  }
  return r
}

/** Every readable plan of this project (newest 100); `unreadable` counts the plan files that could not be read. */
async function loadPlans($: Dollar): Promise<{ plans: Plan[]; unreadable: number }> {
  const plans: Plan[] = []
  let unreadable = 0
  for (const id of await listPlans($)) {
    const r = await readPlan($, id)
    if (r.ok) plans.push(r.plan)
    else unreadable++
  }
  return { plans, unreadable }
}

const toAnswer = (r: MutateResult): ToolAnswer => (r.ok ? told(r.message) : refused(r.message))

async function readAction($: Dollar, a: Extract<Action, { action: 'list' | 'status' | 'get' }>, actor: Actor): Promise<ToolAnswer> {
  if (a.action === 'list' || (a.action === 'status' && a.plan === undefined)) {
    const auth = authorize(null, a, actor)
    if (!auth.ok) return refused(auth.reason)
    const { plans, unreadable } = await loadPlans($)
    const text = renderListing(plans, actor, a.action === 'status')
    return told(unreadable > 0 ? `${text}\n(${unreadable} plan file${unreadable === 1 ? '' : 's'} could not be read.)` : text)
  }
  const planId = (a as { plan: string }).plan
  const read = await readPlan($, planId)
  if (!read.ok) return refused(read.message)
  if (a.action === 'status') {
    const s = statusFor(read.plan, actor)
    return s.ok ? told(s.text) : refused(s.reason)
  }
  const auth = authorize(read.plan, a, actor)
  if (!auth.ok) {
    // A refused `get` is review evidence like a refused claim: the ledger records it (apply denies it the same way).
    try {
      await mutate($, planId, a, actor)
    } catch {
      // The refusal stands whether or not the line was written.
    }
    return refused(auth.reason)
  }
  return told(renderItem(read.plan, a.item))
}

/** Serves one call of the `plan` tool. Every failure is an instruction for the model; nothing here throws on bad input. */
export async function planTool($: Dollar, e: any, attemptCap: number): Promise<ToolAnswer> {
  let size = MAX_INPUT_CHARS + 1
  try {
    size = JSON.stringify(e).length
  } catch {
    // Not serializable: refused below.
  }
  if (size > MAX_INPUT_CHARS) return refused('That input is too large. Send shorter text, or split the work into smaller calls.')

  const session = await sessionOf($)
  const parsed = parseInput(e, session)
  if ('error' in parsed) return refused(parsed.error)
  const actor = await callerOf($, e, session)
  const a: Action = parsed

  if (a.action === 'list' || a.action === 'status' || a.action === 'get') return readAction($, a, actor)
  const base: MutateOpts = { attemptCap }
  if (a.action === 'verify') {
    const args: VerifyArgs = { gen: a.gen, manual: a.manual, note: a.note, cwd: a.cwd, ifRev: a.ifRev }
    const memo: VerifyMemo = {}
    return toAnswer(await withRetry($, a, (opts) => verifyItem($, a.plan, a.item, args, actor, { ...opts, memo }), base))
  }
  const planId = a.action === 'create' ? null : (a as { plan: string }).plan
  return toAnswer(await withRetry($, a, (opts) => mutate($, planId, a, actor, opts), base))
}

// ---------------------------------------------------------------- the /plans command

const REMOVE_LOCK = 'Remove the lock'
const KEEP_LOCK = 'Keep the lock'
const REBUILD = 'Rebuild from the ledger'
const KEEP_FILE = 'Keep the plan file'

type Where = { paths: PlanPaths } | { error: string }

async function pathsOf($: Dollar, planId: string): Promise<Where> {
  try {
    const st = await dirOf($)
    return { paths: planPaths(st.home, st.key, planId) }
  } catch {
    return { error: 'The plan store is not available. Retry.' }
  }
}

/** The last `n` ledger entries as text. The file is read whole (it is kept under 3 MiB) and only its parsed fields are printed. */
async function showLog($: Dollar, planId: string, n: number): Promise<string> {
  const where = await pathsOf($, planId)
  if ('error' in where) return where.error
  if (!(await $.fs.exists(where.paths.ledger))) return 'No such plan.'
  let text: string
  try {
    text = (await $.fs.read(where.paths.ledger)) as string
  } catch {
    return 'The ledger could not be read.'
  }
  const parsed = parseLedger(text)
  return renderLog(parsed.changes, n, parsed.bad, parsed.tornText !== null)
}

/**
 * Rebuilds the plan file from the change ledger under the plan's lock. The file is kept (renamed, never deleted) when it
 * differs; one that is ahead of its ledger is replaced only after the person confirms, since the rebuilt plan is older.
 *
 * TODO(manual, docs/plans/goal-ledger.md slice 8): the confirmation `$.ui.ask` for a plan file that is ahead of its ledger
 * is unverified in a real session. A person must see the question and that "Keep the plan file" and dismissing leave it.
 */
async function repairPlan($: Dollar, planId: string): Promise<string> {
  const where = await pathsOf($, planId)
  if ('error' in where) return where.error
  const { paths } = where
  const locked = await withLock($, paths.lock, planId, null, async (token): Promise<string> => {
    await removeStaleTmp($, paths, planId)
    if (!(await $.fs.exists(paths.ledger))) return `Plan ${planId} has no change ledger, so there is nothing to rebuild it from.`
    const rec = reconcile(null, (await $.fs.read(paths.ledger)) as string)
    if (rec.error !== undefined) return `The ledger cannot be replayed (${rec.error.slice(0, 200)}). The plan file was left as it is.`
    if (rec.plan === null || rec.plan.id !== planId) return 'The ledger does not hold this plan. The plan file was left as it is.'
    const notes = [
      rec.tornText !== null ? 'the ledger ends in a cut-off line, which the next change sets aside' : '',
      rec.badLines.length > 0 ? `${rec.badLines.length} damaged ledger line${rec.badLines.length === 1 ? '' : 's'} skipped` : '',
    ].filter((x) => x !== '')
    const tail = notes.length === 0 ? '' : ` (${notes.join('; ')})`

    const json = await readJson($, paths.json)
    if (json.kind === 'ok' && json.plan.rev === rec.plan.rev && JSON.stringify(json.plan) === JSON.stringify(rec.plan)) {
      return `Plan ${planId} is consistent at rev ${rec.plan.rev}; nothing to repair${tail}.`
    }
    if (json.kind === 'ok' && json.plan.rev > rec.plan.rev) {
      let said: unknown
      try {
        said = await $.ui.ask(
          `The plan file of ${planId} is at rev ${json.plan.rev} but its ledger only reaches rev ${rec.plan.rev}. Replace the file with the ledger's older state?`,
          { options: [REBUILD, KEEP_FILE], header: 'Repair plan' },
        )
      } catch {
        return 'The plan file is ahead of its ledger and nobody could be asked, so it was left as it is. Run /plans repair in an interactive session.'
      }
      if (said !== REBUILD) return 'The plan file was left as it is.'
    }
    const nowMs: number = await $.clock.now()
    let kept = ''
    if (json.kind !== 'missing') {
      const to = `${paths.json}.corrupt-${nowMs}`
      const moved = await $.process.run(['mv', '-n', '--', paths.json, to], { timeoutMs: IO_TIMEOUT_MS })
      if (moved.exitCode !== 0) return 'The plan file could not be set aside, so it was left as it is. Retry.'
      kept = ` The old file was kept as ${to.slice(to.lastIndexOf('/') + 1)}.`
    }
    try {
      await publish($, paths, rec.plan, token)
    } catch {
      return 'The plan file could not be written. Retry /plans repair.'
    }
    return `Rebuilt plan ${planId} at rev ${rec.plan.rev} from its ledger${tail}.${kept}`
  })
  return locked.held ? locked.value : locked.fail.message
}

/**
 * Removes a plan's lock after the person confirms, showing the holder and its age. The holder's token goes to the same
 * compare-and-remove script `release` uses, so a lock that changed hands between the question and the removal stays.
 *
 * TODO(manual, docs/plans/goal-ledger.md slice 8): the confirmation `$.ui.ask` is unverified in a real session. A person
 * must hold a lock (see the report's steps), run /plans unlock, and see the holder and age, that "Keep the lock" and
 * dismissing leave it, and that "Remove the lock" removes it.
 */
async function unlockPlan($: Dollar, planId: string): Promise<string> {
  const where = await pathsOf($, planId)
  if ('error' in where) return where.error
  const { lock } = where.paths
  if (!(await $.fs.exists(lock))) return `Plan ${planId} is not locked.`
  const readOwner = async () => {
    let text = ''
    try {
      text = (await $.fs.read(`${lock}/owner`)) as string
    } catch {
      // A lock whose owner file is missing or unreadable is shown as having an unreadable owner.
    }
    return lockOwner(text, await $.clock.now())
  }
  const owner = await readOwner()
  let said: unknown
  try {
    said = await $.ui.ask(unlockQuestion(planId, owner), { options: [REMOVE_LOCK, KEEP_LOCK], header: 'Unlock plan' })
  } catch {
    return 'Nobody could be asked, so the lock was left. Run /plans unlock in an interactive session.'
  }
  if (said !== REMOVE_LOCK) return 'The lock was left.'
  // Only the lock the person was shown may go: read the owner again, and a different holder (or one that appeared where
  // there was none) means it changed hands. The holder's token then goes to the compare-and-remove release.
  const now = await readOwner()
  const changed = `The lock of plan ${planId} changed hands or is already gone; nothing was removed. Run /plans unlock again if it is still held.`
  if ((owner === null) !== (now === null) || (owner !== null && now !== null && owner.token !== now.token)) return changed
  const argv = now === null ? ['rm', '-rf', '--', lock] : lockReleaseArgv(lock, now.token)
  const r = await $.process.run(argv, { timeoutMs: IO_TIMEOUT_MS })
  return r.exitCode === 0 ? `Removed the lock of plan ${planId}.` : changed
}

async function goalFor($: Dollar, planId: string): Promise<string> {
  const read = await readPlan($, planId)
  if (!read.ok) return read.message
  const text = goalText(read.plan)
  const c = goalCounts(read.plan)
  const split = `${c.byCommand} verified by command, ${c.manual} manually, ${c.open} open`
  let filled = false
  try {
    filled = ((await $.prompt.fill({ text, mode: 'replace' })) as { isFilled?: boolean }).isFilled === true
  } catch {
    filled = false
  }
  return filled
    ? `Put a /goal condition for plan ${planId} in the prompt (${split}). Edit it if you like and press Enter to set it; nothing was submitted.`
    : `The prompt could not be filled here. Copy this and enter it yourself (${split}):\n${text}`
}

/** Runs one `/plans` subcommand and returns the text the person sees. */
export async function plansCommand($: Dollar, e: any, attemptCap: number): Promise<{ text: string }> {
  const parsed = parseArgs(e.args)
  if ('error' in parsed) return { text: parsed.error }
  try {
    switch (parsed.sub) {
      case 'status': {
        if (parsed.plan !== undefined) {
          const r = await readPlan($, parsed.plan)
          return { text: r.ok ? renderPlanStatus(r.plan) : r.message }
        }
        const { plans, unreadable } = await loadPlans($)
        const text = renderListing(plans, { kind: 'main' }, true)
        return { text: unreadable > 0 ? `${text}\n(${unreadable} plan file${unreadable === 1 ? '' : 's'} could not be read; try /plans repair <plan>.)` : text }
      }
      case 'show': {
        const r = await readPlan($, parsed.plan as string)
        return { text: r.ok ? renderShow(r.plan) : r.message }
      }
      case 'log':
        return { text: await showLog($, parsed.plan as string, parsed.n as number) }
      case 'repair':
        return { text: await repairPlan($, parsed.plan as string) }
      case 'unlock':
        return { text: await unlockPlan($, parsed.plan as string) }
      case 'goal-text':
        return { text: await goalFor($, parsed.plan as string) }
      case 'abandon': {
        const plan = parsed.plan as string
        const a: Action = { action: 'abandon', plan }
        const r = await withRetry($, a, (opts) => mutate($, plan, a, { kind: 'main' }, opts), { attemptCap })
        return { text: r.message }
      }
    }
  } catch {
    return { text: 'plan-ledger: that command failed. Retry, or run /plans repair <plan>.' }
  }
}

// ---------------------------------------------------------------- registration

async function registerSurface($: Dollar, withTool: boolean): Promise<void> {
  if (withTool) {
    try {
      const { tool } = await $.tool.register(TOOL)
      if (tool !== TOOL_NAME) $.ui.log(`plan-ledger: the tool registered as ${tool}, but calls are served only for ${TOOL_NAME}`, { to: 'debug' })
    } catch (err) {
      $.ui.log(`plan-ledger: could not register the plan tool: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
    }
  }
  try {
    await $.command.register({
      name: COMMAND_NAME,
      description: 'Plans of this project: status, show, log, repair, unlock, abandon, goal-text',
      argumentHint: '[status|show|log|repair|unlock|abandon|goal-text] [plan]',
    })
  } catch (err) {
    $.ui.log(`plan-ledger: could not register /${COMMAND_NAME}: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
  }
}

/** `attemptCap` option: a whole number from 1 to 10; anything else is the default. */
function capOption(raw: unknown): number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 10 ? raw : DEFAULT_ATTEMPT_CAP
}

// ---------------------------------------------------------------- wiring

export const register: Register = (on, options) => {
  const withTool = options?.registerTool !== false
  const attemptCap = capOption(options?.attemptCap)

  on('session.start', async ($, e, next) => {
    await registerSurface($, withTool)
    return next(e)
  })

  on('session.end', ($, e, next) => {
    store = null
    suppressedDenials.clear()
    return next(e)
  })

  on('tool.call', { tool: ['Write', 'Edit', 'NotebookEdit', 'Bash'] }, ($, e, next) => guardPlanDir($, e, next)).catch(
    ($, e, next) => (next.called ? next(e) : { deny: 'plan-ledger: could not check this call. Retry.' }),
  )

  if (withTool) {
    // The answer is the tool's result. A throw out of the handler (the transaction catches its own) refuses the call with
    // an instruction rather than leaving it unanswered; a change may have been recorded, so the model is told to look first.
    on('tool.call', { tool: 'mcp__plan-ledger__plan' }, ($, e: any) => planTool($, e, attemptCap)).catch(() => ({
      deny: 'The plan tool failed before it answered. Check the state with status or get before repeating a change.',
    }))
  }

  on('command.run', { command: 'plans' }, ($, e: any) => plansCommand($, e, attemptCap)).catch(() => ({
    text: 'plan-ledger: that command failed. Retry, or run /plans repair <plan>.',
  }))
}
