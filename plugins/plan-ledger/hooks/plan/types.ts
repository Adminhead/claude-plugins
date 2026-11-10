// plan-ledger: shared types and limits. Pure: no `$`, no I/O. See docs/plans/goal-ledger.md
// (decision 2 for the data model, decision 5 for the limits).

export type PlanStatus = 'draft' | 'active' | 'done' | 'abandoned'
// `done` is derived (every item verified or abandoned); a stored plan is draft, active or abandoned.

export type ItemStatus =
  | 'pending'
  | 'in_progress'
  | 'blocked'
  | 'claimed_done'
  | 'verified'
  | 'failed'
  | 'abandoned'

/**
 * Who is calling. Built by the tool.call handler from the engine-set `agentId`:
 * - `main`: no agentId (the orchestrator's loop).
 * - `agent` with a non-null `agentType`: an id that `$.agent.list()` names, whose entry is `running`.
 * - `agent` with `agentType: null`: untrusted. The caller must use this for an id the list does not
 *   name (workflow agents, engine forks) and for a listed agent whose status is not `running`.
 */
export type Actor =
  | { kind: 'main' }
  | { kind: 'agent'; agentId: string; agentType: string | null; session: string }

export type Check = { label: string; argv: string[]; expectExit: number }

export type BoundAgent = { agentId: string; session: string; at: string }

export type CommandEvidence = { argv: string[]; exit: number; outTail: string }

/** Self-reported evidence stored by `claim_done`. */
export type Claimed = {
  summary: string
  commands: CommandEvidence[]
  commits: string[]
  files: string[]
  at: string
}

export type CheckResult = { label: string; exit: number; expectExit: number; outTail: string }

/** A working-tree fingerprint taken by the mod: `git rev-parse HEAD` plus a hash of diff and status. */
export type Tree = { head: string; fingerprint: string }

/** Built by the mod, never supplied by a caller. `kind: 'manual'` means no command was run. */
export type Verification = {
  kind: 'checks' | 'manual'
  ok: boolean
  gen: number
  cwd: string
  checksHash: string
  results: CheckResult[]
  before: Tree | null
  after: Tree | null
  note: string | null
  at: string
}

export type Item = {
  id: string
  title: string
  instructions: string
  acceptance: string[]
  files: string[]
  deps: string[]
  /** Agent type that should do this item (compared after removing a plugin prefix). */
  agent: string
  model: string
  checks: Check[]
  status: ItemStatus
  attempts: number
  /** Starts at 1; incremented by `claim_done`, `amend` and `reopen`. */
  gen: number
  boundAgent: BoundAgent | null
  /** Agent type the spawn hook reserved this item for, or null. */
  reservedFor: string | null
  claimed: Claimed | null
  verification: Verification | null
  /** Latest progress or block note, truncated. */
  note: string | null
  /** Tail of the last failure (a `fail` note or a failed verification), truncated. */
  failure: string | null
}

export type Plan = {
  v: 1
  id: string
  title: string
  rev: number
  created: string
  project: string
  status: PlanStatus
  /** Who created the plan; the `architect` rule of `authorize` needs it. */
  creator: Actor
  items: Item[]
}

/** The fields an author supplies for an item at `create` or `amend`. */
export type ItemInput = {
  title: string
  instructions: string
  acceptance: string[]
  files: string[]
  deps: string[]
  agent: string
  model: string
  checks: Check[]
}

type PlanRef = { plan: string }
type ItemRef = PlanRef & { item: string }
/** Optimistic concurrency: refuse when the plan's `rev` differs. */
type Guarded = { ifRev?: number }

export type Action =
  | ({ action: 'create'; title: string; items: ItemInput[] } & Guarded)
  | ({ action: 'activate' } & PlanRef & Guarded)
  | ({ action: 'claim' } & ItemRef & Guarded)
  | ({ action: 'progress'; note: string } & ItemRef & Guarded)
  | ({ action: 'block'; note: string } & ItemRef & Guarded)
  | ({ action: 'fail'; note: string } & ItemRef & Guarded)
  | ({
      action: 'claim_done'
      summary: string
      commands: CommandEvidence[]
      commits: string[]
      files: string[]
    } & ItemRef &
      Guarded)
  // `verification` is filled in by the mod after it ran the checks. The tool's public input never
  // carries it (slice 8 `parseInput` rejects it), and `authorize` never reads it.
  | ({
      action: 'verify'
      gen: number
      manual?: boolean
      note?: string
      cwd?: string
      verification?: Verification
    } & ItemRef &
      Guarded)
  | ({ action: 'amend'; item?: string; patch?: Partial<ItemInput>; planTitle?: string } & PlanRef & Guarded)
  | ({ action: 'assign'; agentId: string; session: string } & ItemRef & Guarded)
  | ({ action: 'reopen'; extraAttempts?: number } & ItemRef & Guarded)
  | ({ action: 'abandon'; item?: string } & PlanRef & Guarded)
  | ({ action: 'bind'; agentId: string; session: string } & ItemRef & Guarded)
  | ({ action: 'reserve'; agentType: string } & ItemRef & Guarded)
  | { action: 'list' }
  | { action: 'status'; plan?: string }
  | { action: 'get'; plan: string; item: string }

export type ActionName = Action['action']

/** One line of the change ledger (`<planId>.jsonl`). A denied attempt has `denied` set and an unchanged `rev`. */
export type Change = {
  v: 1
  rev: number
  ts: string
  plan: string
  item: string | null
  actor: Actor
  action: ActionName
  from: string | null
  to: string | null
  /** The action's payload (create and amend carry the full item text so replay can rebuild state). */
  data: Record<string, unknown>
  denied: string | null
  /** Random id chosen by the mod; lets a retry see that an operation already committed. */
  op: string
  /** Denials not logged since the previous entry (only the first 50 per plan are logged). */
  suppressedDenials?: number
}

// Limits (decision 5 and the ledger size policy of decision 2).
export const MAX_TITLE_CHARS = 120
export const MAX_INSTRUCTIONS_BYTES = 8000
export const MAX_ITEMS = 20
export const MAX_CHECKS = 8
export const MAX_ARGV_BYTES = 600
export const DEFAULT_ATTEMPT_CAP = 3
/** Evidence and note tails stored in the ledger. */
export const MAX_TAIL_BYTES = 2000
/** Output tail kept per check result. */
export const MAX_CHECK_TAIL_CHARS = 400
/** Refuse non-terminal mutations once the ledger would pass this size (the read cap is 4 MiB). */
export const MAX_LEDGER_BYTES = 3 * 1024 * 1024
/** Denied attempts are logged for the first N per plan, then counted. */
export const MAX_DENIED_LOGGED = 50
