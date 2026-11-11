// plan-ledger: the pure half of `verify` (decision 4 in docs/plans/goal-ledger.md). No `$`, no I/O.
// The mod runs the item's recorded check argv itself (`verifyItem` in register.tsx); this file builds the git argv for the
// tree fingerprint, judges the results the mod collected, and words the answer. Nothing here takes a result from a caller.
import { checksHash, hash53, shellQuote } from './checks'
import { one } from './render'
import type { Check, CheckResult, Item, Tree, Verification, VerifyMode } from './types'
import { MAX_CHECK_TAIL_CHARS } from './types'

/** What a check's `exit` reads when the process could not run to completion (timeout, no such program). A real exit is never negative. */
export const CRASH_EXIT = -1

/** `Tree.head` for a directory with no commit to name (not a git repository, or no commits yet). */
export const NO_HEAD = 'none'

/**
 * The three git commands that identify a working tree, run in the check's cwd before the first check and after the last.
 * The directory is the caller's and its `.git/config` and `.gitattributes` are the repository's, so each command turns off
 * what could start a program from them: the fsmonitor hook (`-c core.fsmonitor=false`), external diff drivers and textconv
 * filters, and the index refresh a read would otherwise write (`--no-optional-locks`).
 */
export function treeArgvs(): { head: string[]; diff: string[]; status: string[] } {
  const git = ['git', '-c', 'core.fsmonitor=false', '--no-optional-locks']
  return {
    head: [...git, 'rev-parse', 'HEAD'],
    diff: [...git, 'diff', '--no-ext-diff', '--no-textconv', 'HEAD'],
    status: [...git, 'status', '--porcelain'],
  }
}

/**
 * A plain hash of the tracked-file content (`git diff HEAD`) and the file names (`git status --porcelain`). It detects an
 * accidental change of the tree during a run, not tampering: untracked file content is not part of it.
 */
export function fingerprint(diff: string, status: string): string {
  return hash53(`${diff.length}:${diff}${status}`)
}

/** The last `MAX_CHECK_TAIL_CHARS` characters of a command's output, stdout then stderr. */
export function outTail(stdout: unknown, stderr: unknown): string {
  const out = typeof stdout === 'string' ? stdout : ''
  const err = typeof stderr === 'string' ? stderr : ''
  return `${out}${out !== '' && err !== '' ? '\n' : ''}${err}`.slice(-MAX_CHECK_TAIL_CHARS)
}

/** The Bash command `$.tool.check` is asked about: the argv as a shell would read it. It is only ever asked, never run. */
export function commandFor(argv: string[]): string {
  return shellQuote(argv)
}

/** A `$.tool.check` verdict as a decision; anything that is not exactly `allow` or `deny` is an `ask`. */
export function verdictOf(v: unknown): 'allow' | 'ask' | 'deny' {
  const d = typeof v === 'object' && v !== null ? (v as { decision?: unknown }).decision : undefined
  return d === 'allow' || d === 'deny' ? d : 'ask'
}

/**
 * The question the person answers before a check runs, one line ending in a question mark: the instruction first, then the
 * exact argv and directory, JSON-escaped so nothing is hidden. The label is a stored caller string, so it goes through `one`.
 */
export function gateQuestion(check: Check, cwd: string): string {
  return (
    `Run the plan check "${one(check.label).slice(0, 60)}" as argv ${JSON.stringify(check.argv)} in directory ${JSON.stringify(cwd)}, ` +
    'which the plan tool starts directly so installed command guards do not see it?'
  )
}

/**
 * The question for `verifyChecks: ask`: one approval for the whole run, listing every check's exact argv and the directory,
 * JSON-escaped so nothing is hidden. Labels are stored caller strings, so they go through `one`.
 */
export function approveQuestion(itemId: string, checks: Check[], cwd: string): string {
  const list = checks.map((c) => `"${one(c.label).slice(0, 60)}" ${JSON.stringify(c.argv)}`).join('; ')
  return (
    `Run the ${checks.length} recorded check${checks.length === 1 ? '' : 's'} of plan item ${one(itemId).slice(0, 10)} in directory ${JSON.stringify(cwd)}: ${list}. ` +
    'The plan tool starts them directly, so installed command guards do not see them. Run them?'
  )
}

/** The `verifyChecks` option: `auto`, `ask` or `off`; anything else is `auto`. */
export function verifyModeOption(raw: unknown): VerifyMode {
  return raw === 'ask' || raw === 'off' ? raw : 'auto'
}

/** The note stored when checks are skipped, with the caller's own words after it. */
export function skippedNote(count: number, note: unknown): string {
  const why = `verifyChecks is off: ${count} recorded check${count === 1 ? ' was' : 's were'} not run.`
  const extra = typeof note === 'string' ? one(note).slice(0, 500) : ''
  return extra === '' ? why : `${why} ${extra}`
}

const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x)

const sameTree = (a: Tree, b: Tree): boolean => a.head === b.head && a.fingerprint === b.fingerprint

export type JudgeMeta = {
  cwd?: string
  /** ISO time of the verification. */
  at?: string
  /** `checksHash` of the checks the mod actually executed; when given it must equal the item's. */
  ranHash?: string
  /** The `verifyChecks` mode the run happened under, recorded on the verification. */
  mode?: VerifyMode
}

export type Judged = { ok: true; verification: Verification } | { ok: false; why: string }

/**
 * Turns the results of a check run into the verification `apply` records, or says why no verification can be made.
 * `ok: false` means "do not record anything" (the results do not line up with the item's checks, or the tree moved while
 * they ran); a check that ran and failed is `ok: true` with `verification.ok === false`, which closes the attempt.
 * `apply` re-checks the same facts against the item as it is at commit time (`verificationProblem`).
 */
export function judge(item: Item, results: CheckResult[], before: Tree | null, after: Tree | null, meta: JudgeMeta = {}): Judged {
  if (item.checks.length === 0) return { ok: false, why: `${item.id} has no checks to run.` }
  if (!Array.isArray(results) || results.length !== item.checks.length) {
    const n = Array.isArray(results) ? results.length : 0
    return { ok: false, why: `There are ${n} results for ${item.checks.length} checks of ${item.id}, so nothing is recorded.` }
  }
  const hash = checksHash(item.checks)
  if (meta.ranHash !== undefined && meta.ranHash !== hash) {
    return { ok: false, why: `The checks that ran are not the checks ${item.id} has, so nothing is recorded.` }
  }
  const seen = new Set<string>()
  const clean: CheckResult[] = []
  for (let i = 0; i < item.checks.length; i++) {
    const c = item.checks[i]
    const r: unknown = results[i]
    if (typeof r !== 'object' || r === null) return { ok: false, why: `Result ${i + 1} is missing.` }
    const x = r as Record<string, unknown>
    if (x.label !== c.label || seen.has(c.label)) {
      return { ok: false, why: `Result ${i + 1} is not the result of check "${c.label}" (missing or duplicated).` }
    }
    seen.add(c.label)
    if (x.expectExit !== c.expectExit || !isInt(x.exit) || typeof x.outTail !== 'string') {
      return { ok: false, why: `Result ${i + 1} does not match check "${c.label}".` }
    }
    if (x.exit === CRASH_EXIT && c.expectExit === CRASH_EXIT) {
      return { ok: false, why: `Check "${c.label}" could not run, and it expects the code used for that, so nothing is recorded.` }
    }
    clean.push({ label: c.label, exit: x.exit, expectExit: c.expectExit, outTail: x.outTail.slice(-MAX_CHECK_TAIL_CHARS) })
  }
  if (before === null || after === null) return { ok: false, why: 'The working tree state could not be read, so nothing is recorded.' }
  if (before.head !== after.head) {
    return { ok: false, why: `HEAD moved from ${before.head.slice(0, 12)} to ${after.head.slice(0, 12)} while the checks ran, so the result says nothing about either commit. Run verify again once the commits stop.` }
  }
  if (!sameTree(before, after)) {
    return { ok: false, why: 'Tracked files or file names changed while the checks ran (or a check changed them), so the result is not about one state of the tree. Run verify again on a quiet tree.' }
  }
  const ok = clean.every((r) => r.exit === r.expectExit)
  return {
    ok: true,
    verification: {
      kind: 'checks',
      ...(meta.mode === undefined ? {} : { mode: meta.mode }),
      ok,
      gen: item.gen,
      cwd: meta.cwd ?? '',
      checksHash: hash,
      results: clean,
      before,
      after,
      note: null,
      at: meta.at ?? '',
    },
  }
}

/** One answer for the model: what ran, in which directory, at which commit (the line `/goal` can be worded against). */
export function summarize(itemId: string, v: Verification): string {
  const parts = v.results.map((r) =>
    r.exit === r.expectExit ? `${r.label} exit ${r.exit}` : `${r.label} exit ${r.exit} (expected ${r.expectExit}): ${r.outTail.slice(-200)}`,
  )
  const at = v.after === null ? '' : ` at ${v.after.head.slice(0, 12)}`
  return `${itemId} ${v.ok ? 'verified' : 'failed'} by command: ${parts.join('; ')}${at} in ${v.cwd}.`
}
