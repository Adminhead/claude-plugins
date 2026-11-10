// plan-ledger: the transaction around the pure plan modules (decision 3 in docs/plans/goal-ledger.md), the plan reads, and
// the directory guard. Slice 7 adds `verifyItem`, slice 8 the tool and `/plans`, slice 9 the spawn hook.
//
// `claude plugin validate` fails on "$ is passed to X, which is not a function declared at the top of this file", so every
// helper that takes `$` is a top-level function declaration below and `register` only wires hooks to them.
import type { Register } from 'claude-code'
import { apply } from './plan/apply'
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
import { utf8Bytes } from './plan/shared'
import type { Action, Actor, Change, Plan } from './plan/types'
import { DEFAULT_ATTEMPT_CAP, MAX_DENIED_LOGGED, MAX_LEDGER_BYTES } from './plan/types'

// `$` is the engine's interface; the d.ts for it is written by the engine at load, so helpers take it untyped.
type Dollar = any

/** The acquire script waits this long; the process timeout must be longer or the engine kills it mid-poll. */
const LOCK_WAIT_SEC = 5
const LOCK_PROCESS_TIMEOUT_MS = 8000
const IO_TIMEOUT_MS = 5000
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
  const stale = new RegExp(`^${planId}\\.json\\.tmp\\.[A-Za-z0-9._-]+$`)
  try {
    const entries: { name: string }[] = await $.fs.list(paths.dir)
    for (const f of entries) {
      if (stale.test(f.name)) await $.process.run(['rm', '-f', '--', `${paths.dir}/${f.name}`], { timeoutMs: IO_TIMEOUT_MS })
    }
  } catch {
    // A leftover tmp file is harmless; the next mutation tries again.
  }
}

/** Writes `plan` to a tmp file in the plan directory and renames it over the JSON. Throws on any failure, leaving the old JSON. */
async function publish($: Dollar, paths: PlanPaths, plan: Plan, token: string): Promise<void> {
  const tmp = tmpPath(paths.json, token)
  try {
    await $.fs.write(tmp, JSON.stringify(plan))
    const moved = await $.process.run(publishArgv(tmp, paths.json), { timeoutMs: IO_TIMEOUT_MS })
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

/** Brings the JSON up to a replayed plan after a call that applied nothing. Failure is ignored: the next mutation heals it. */
async function healJson($: Dollar, paths: PlanPaths, rec: Reconciled, token: string): Promise<void> {
  if (rec.source !== 'ledger' || rec.plan === null) return
  try {
    await publish($, paths, rec.plan, token)
  } catch {
    // Reconcile redoes this at the start of the next mutation.
  }
}

type Reconcile = { rec: Reconciled; ledgerSize: number; loaded: boolean } | MutateFail

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
    return { rec, ledgerSize, loaded: false }
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
  return { rec, ledgerSize, loaded: true }
}

async function appendLine($: Dollar, paths: PlanPaths, text: string): Promise<boolean> {
  try {
    const r = await $.process.run(appendArgv(paths.ledger), { stdin: text, timeoutMs: IO_TIMEOUT_MS })
    return r.exitCode === 0
  } catch {
    return false
  }
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
  const { rec, ledgerSize } = r

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
      const text = (rec.torn ? '\n' : '') + lineFor(change)
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
  const text = (rec.torn ? '\n' : '') + lineFor(change)
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

// ---------------------------------------------------------------- wiring

export const register: Register = (on) => {
  on('session.end', ($, e, next) => {
    store = null
    suppressedDenials.clear()
    return next(e)
  })

  on('tool.call', { tool: ['Write', 'Edit', 'NotebookEdit', 'Bash'] }, ($, e, next) => guardPlanDir($, e, next)).catch(
    ($, e, next) => (next.called ? next(e) : { deny: 'plan-ledger: could not check this call. Retry.' }),
  )
}
