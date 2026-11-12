// plan-ledger: where a plan lives on disk, and the argv for every shell step that touches it. Pure: no `$`, no I/O,
// no clock. The caller runs each argv through `$.process.run`. Every script string below is a constant and every value
// (path, token) reaches the shell as a positional argument, never interpolated into the script (decision 3 in
// docs/plans/goal-ledger.md), so a hostile path or token cannot inject a command.
import type { Change } from './types'

const PLAN_ID = /^p-[0-9a-z]{9}-[0-9a-z]{6}$/
const KEY_CHARS = /^[A-Za-z0-9._-]+$/

/** True for a plan id as the tool accepts it. Every path is built only from an id that passes this. */
export const isPlanId = (s: string): boolean => PLAN_ID.test(s)

/**
 * The directory name for a project: the sanitized basename of its root (at most 40 chars of `[A-Za-z0-9._-]`), then `-`
 * and the first 12 hex digits of the root's SHA-256, which the caller computes. A worktree and its main tree share a
 * key only when the caller passes the same root for both.
 */
export function projectKey(root: string, sha256hex: string): string {
  if (!/^[0-9a-f]{12,}$/.test(sha256hex)) throw new Error('projectKey: expected a lowercase hex digest')
  const base = root.split('/').filter((p) => p !== '').pop() ?? ''
  const name = base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 40) || 'root'
  return `${name}-${sha256hex.slice(0, 12)}`
}

/** `p-` + the time in base 36 (nine digits) + `-` + six random base-36 characters the caller supplies. */
export function newPlanId(nowMs: number, rand6: string): string {
  const t = Math.floor(nowMs).toString(36)
  if (!Number.isSafeInteger(Math.floor(nowMs)) || nowMs < 0 || t.length > 9) throw new Error('newPlanId: bad time')
  if (!/^[0-9a-z]{6}$/.test(rand6)) throw new Error('newPlanId: rand6 must be six characters of [0-9a-z]')
  return `p-${t.padStart(9, '0')}-${rand6}`
}

export type PlanPaths = { dir: string; json: string; ledger: string; lock: string }

/** `<home>/.claude/adminhead-plans/<key>`. Throws on a key that is not a path-safe name. */
export function projectDir(home: string, key: string): string {
  if (!KEY_CHARS.test(key) || key === '.' || key === '..') throw new Error('planPaths: bad project key')
  return `${home.replace(/\/+$/, '')}/.claude/adminhead-plans/${key}`
}

/** `<home>/.claude/adminhead-plans/<key>/<planId>.{json,jsonl,lock}`. Throws on a key or id that is not a path-safe name. */
export function planPaths(home: string, key: string, planId: string): PlanPaths {
  const dir = projectDir(home, key)
  if (!isPlanId(planId)) throw new Error('planPaths: bad plan id')
  return { dir, json: `${dir}/${planId}.json`, ledger: `${dir}/${planId}.jsonl`, lock: `${dir}/${planId}.lock` }
}

/** Creates the project directory, private to the user. Run before any lock (the lock lives inside it). */
export const mkdirArgv = (dir: string): string[] => ['sh', '-c', 'umask 077; mkdir -p -- "$1"', 'sh', dir]

/** A held lock whose owner file is older than this many seconds is treated as dead. A critical section lasts milliseconds. */
export const STALE_LOCK_SEC = 120
/** A lock directory with no owner file (its holder died between `mkdir` and the owner write) is dead after this many seconds. */
export const OWNERLESS_LOCK_SEC = 10

// `ownerless_dead DIR`: DIR exists and its mtime is at least OWNERLESS_LOCK_SEC old. The mtime comes from GNU `stat -c`,
// falling back to BSD `stat -f`; when neither gives a number the answer is no (never dead on a guess).
const OWNERLESS_DEAD = [
  'ownerless_dead() {',
  '  m=$(stat -c %Y -- "$1" 2>/dev/null || stat -f %m -- "$1" 2>/dev/null)',
  '  case $m in ""|*[!0-9]*) return 1 ;; esac',
  `  [ $(( $(date +%s) - m )) -ge ${OWNERLESS_LOCK_SEC} ]`,
  '}',
].join('\n')

// `dead LOCK`: the lock's owner epoch is at least STALE_LOCK_SEC old, or it has no owner (empty or unreadable file) and
// `ownerless_dead` holds for its directory.
const DEAD = [
  'dead() {',
  '  o=$(cat -- "$1/owner" 2>/dev/null); t=${o##* }',
  '  case $t in ""|*[!0-9]*) t= ;; esac',
  '  if [ -n "$t" ] && [ "$t" != "$o" ]; then',
  `    [ $(( $(date +%s) - t )) -ge ${STALE_LOCK_SEC} ]; return`,
  '  fi',
  '  ownerless_dead "$1"',
  '}',
].join('\n')
/** The suffix of the recovery mutex beside a lock: `<lock>.reap`, a directory held for a few commands (see `reap`). */
export const REAP_SUFFIX = '.reap'
/** The prefix of a dead lock renamed aside for removal: `<lock>.stale.<pid>`. */
export const STALE_SUFFIX = '.stale.'

// `reap LOCK`: removes LOCK when it is dead, one recovery at a time. The mutex is `mkdir LOCK.reap`, and its holder at
// once puts an entry named by its pid in it, so a held mutex is not empty. Inside it LOCK is judged dead again, and only
// that judgment leads to the rename to `LOCK.stale.<pid>`: a judgment made outside the mutex may be out of date
// (another reaper may since have replaced the dead lock with a live one). While the mutex is held nobody else can remove
// LOCK (other reapers wait for the mutex, acquirers only `mkdir` a missing LOCK, and a dead lock's holder is gone), so
// the directory renamed is the one judged dead. The mutex is released (entry, then `rmdir`) and the aside directory
// removed. Returns 0 when it moved LOCK aside.
//
// `unreap MUTEX`: breaks a mutex whose holder died inside its few-command critical section. It must be at least
// OWNERLESS_LOCK_SEC old both before and after its entries are listed, so the list is that dead instance's (a newer
// instance is never that old). Only those entries are removed, by name, and then the directory with `rmdir`, which only
// removes an empty one: when a newer mutex has replaced the dead one meanwhile, its holder's entry has another name, so
// nothing of it is removed and the `rmdir` fails. The caller tries again on its next poll.
const REAP = [
  'unreap() {',
  '  ownerless_dead "$1" || return 1',
  '  u=$1; set -- "$1"/*',
  '  ownerless_dead "$u" || return 1',
  '  for e in "$@"; do',
  '    case ${e##*/} in ""|*[!0-9]*) ;; *) rm -f -- "$e" ;; esac',
  '  done',
  '  rmdir -- "$u" 2>/dev/null',
  '}',
  'reap() {',
  `  r="$1${REAP_SUFFIX}"`,
  '  mkdir -- "$r" 2>/dev/null || { unreap "$r"; return 1; }',
  '  printf "" 2>/dev/null > "$r/$$"',
  `  a="$1${STALE_SUFFIX}$$"; ok=1`,
  '  dead "$1" && mv -- "$1" "$a" 2>/dev/null && ok=0',
  '  rm -f -- "$r/$$"; rmdir -- "$r" 2>/dev/null',
  '  [ "$ok" -eq 0 ] && rm -rf -- "$a"',
  '  return "$ok"',
  '}',
].join('\n')

// Acquire: `mkdir` is the atomic primitive. On success the owner is recorded as `<token> <epoch>` (no trailing newline)
// and the script exits 0. While the directory exists it polls every 0.1 s, and after `$3 * 10` polls exits 75 (busy);
// every pass, a recovery included, goes through that deadline check. A fresh lock is never touched. A dead lock (see
// `dead`) goes through `reap`, and after a recovery the contender tries the `mkdir` again at once, which only one
// contender wins. A `mkdir` that fails while the parent directory is missing exits 1 at once instead of waiting out the
// timeout. When the parent exists the failure is a held lock, or a holder that released between our `mkdir` and our
// test: both retry (so the lock directory itself is never the test, or a release in that gap would read as an error).
// A failure with an existing parent and no lock, such as no permission, ends in 75 after the timeout.
const ACQUIRE = [
  'umask 077',
  OWNERLESS_DEAD,
  DEAD,
  REAP,
  'take() {',
  '  mkdir -- "$1" 2>/dev/null || return 1',
  '  printf "%s %s" "$2" "$(date +%s)" > "$1/owner" || { rm -rf -- "$1"; exit 1; }',
  '  exit 0',
  '}',
  'i=0; max=$(($3 * 10))',
  'while :; do',
  '  take "$1" "$2"',
  '  [ -d "${1%/*}" ] || exit 1',
  '  dead "$1" && reap "$1" && take "$1" "$2"',
  '  [ "$i" -ge "$max" ] && exit 75',
  '  i=$((i + 1)); sleep 0.1',
  'done',
].join('\n')

/**
 * True for a recovery's leftover beside a plan's lock: `<planId>.lock.stale.<pid>` (a dead lock renamed aside whose
 * remover died) or `<planId>.lock.reap` (a recovery mutex whose holder died). Removing either is safe while the caller
 * holds the plan's lock: a held, live lock is never judged dead, so no recovery that the mutex guards is in progress.
 */
export function isLockLeftover(planId: string, name: string): boolean {
  if (!isPlanId(planId)) return false
  const lock = `${planId}.lock`
  return name === `${lock}${REAP_SUFFIX}` || (name.startsWith(`${lock}${STALE_SUFFIX}`) && /^[0-9]+$/.test(name.slice(lock.length + STALE_SUFFIX.length)))
}

/** Exit 0 holds the lock, 75 means it stayed busy for `timeoutSec`, anything else is an error. */
export const lockAcquireArgv = (lock: string, token: string, timeoutSec = 5): string[] => [
  'sh',
  '-c',
  ACQUIRE,
  'sh',
  lock,
  token,
  String(Math.max(0, Math.floor(timeoutSec))),
]

/** Most characters of an error message or stderr quoted in a refused lock's message. */
const LOCK_DIAG_CHARS = 300

/** One line of at most LOCK_DIAG_CHARS, control characters gone; for stderr the end is kept (the failure is last). */
function diagnostic(text: string, keep: 'start' | 'end'): string {
  // eslint-disable-next-line no-control-regex
  const one = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/ {2,}/g, ' ').trim()
  if (one.length <= LOCK_DIAG_CHARS) return one
  return keep === 'end' ? `...${one.slice(-LOCK_DIAG_CHARS)}` : `${one.slice(0, LOCK_DIAG_CHARS)}...`
}

/**
 * The refusal text for an acquire that neither won the lock nor reported it busy. `ran: false`: the process could not be
 * run (the engine rejected the call: spawn failure, a missing working directory, the timeout). `ran: true`: the script
 * exited with something other than 0 (acquired) or 75 (busy).
 */
export function lockFailureMessage(
  cause: { ran: false; error: unknown } | { ran: true; exitCode: number; stderr: unknown },
): string {
  const head = 'Could not take the plan lock. Retry.'
  if (!cause.ran) {
    const msg = cause.error instanceof Error ? cause.error.message : String(cause.error)
    return `${head} (error: could not run the lock script: ${diagnostic(msg, 'start') || 'no message'})`
  }
  const err = typeof cause.stderr === 'string' ? diagnostic(cause.stderr, 'end') : ''
  return `${head} (exit ${cause.exitCode}: the lock script ended unexpectedly; stderr: ${err || 'empty'})`
}

// Release: removes the lock only when the stored token (the owner file minus its trailing ` <epoch>`) equals ours, so
// a late release after `/plans unlock` or a takeover and a new holder cannot remove the new holder's lock. A lock with
// no owner (empty or missing file) is removed only when it is older than OWNERLESS_LOCK_SEC, whoever asks, and then
// through `reap` like any dead lock, so it cannot race a recovery in an acquire. Exit 0 removed, 1 left alone.
const RELEASE = [
  'umask 077',
  OWNERLESS_DEAD,
  DEAD,
  REAP,
  'o=$(cat -- "$1/owner" 2>/dev/null)',
  'if [ -z "$o" ]; then ownerless_dead "$1" || exit 1; reap "$1"; exit; fi',
  '[ "${o% *}" = "$2" ] || exit 1',
  'rm -rf -- "$1"',
].join('\n')

export const lockReleaseArgv = (lock: string, token: string): string[] => ['sh', '-c', RELEASE, 'sh', lock, token]

/** Appends stdin to a file, private to the user. Run inside the lock; the directory exists (`mkdirArgv`). */
export const appendArgv = (file: string): string[] => ['sh', '-c', 'umask 077; cat >> "$1"', 'sh', file]

/** Prints the last line of a file (the ledger's newest entry; an unterminated torn line still prints, the caller parses). */
export const tailArgv = (file: string): string[] => ['sh', '-c', 'tail -n 1 -- "$1"', 'sh', file]

/** Renames the tmp file over the JSON. Same directory, so the rename is atomic: readers see the old file or the new one. */
export function publishArgv(tmp: string, json: string): string[] {
  const prefix = `${json}.tmp.`
  if (!tmp.startsWith(prefix) || !KEY_CHARS.test(tmp.slice(prefix.length))) {
    throw new Error('publishArgv: tmp must be tmpPath(json, token) with a token of [A-Za-z0-9._-]')
  }
  return ['sh', '-c', 'mv -f -- "$1" "$2"', 'sh', tmp, json]
}

/** The tmp name for a publish; it carries the lock token so only the lock holder can have written it. Throws on a token outside `[A-Za-z0-9._-]`. */
export function tmpPath(json: string, token: string): string {
  if (!KEY_CHARS.test(token)) throw new Error('tmpPath: token must be [A-Za-z0-9._-]')
  return `${json}.tmp.${token}`
}

/** One ledger line: the change as JSON, newline-terminated. */
export const lineFor = (change: Change): string => `${JSON.stringify(change)}\n`
