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

/** `<home>/.claude/adminhead-plans/<key>/<planId>.{json,jsonl,lock}`. Throws on a key or id that is not a path-safe name. */
export function planPaths(home: string, key: string, planId: string): PlanPaths {
  if (!KEY_CHARS.test(key) || key === '.' || key === '..') throw new Error('planPaths: bad project key')
  if (!isPlanId(planId)) throw new Error('planPaths: bad plan id')
  const dir = `${home.replace(/\/+$/, '')}/.claude/adminhead-plans/${key}`
  return { dir, json: `${dir}/${planId}.json`, ledger: `${dir}/${planId}.jsonl`, lock: `${dir}/${planId}.lock` }
}

/** Creates the project directory, private to the user. Run before any lock (the lock lives inside it). */
export const mkdirArgv = (dir: string): string[] => ['sh', '-c', 'umask 077; mkdir -p -- "$1"', 'sh', dir]

// Acquire: `mkdir` is the atomic primitive. On success the owner is recorded as `<token> <epoch>` (no trailing newline)
// and the script exits 0. While the directory exists it polls every 0.1 s, and after `$3 * 10` polls exits 75 (busy)
// without touching the lock: a lock is never stolen, however old. A `mkdir` that fails while the parent directory is
// missing exits 1 at once instead of waiting out the timeout. When the parent exists the failure is a held lock, or a
// holder that released between our `mkdir` and our test: both retry (so the lock directory itself is never the test, or
// a release in that gap would read as an error). A failure with an existing parent and no lock, such as no permission,
// ends in 75 after the timeout.
const ACQUIRE = [
  'umask 077',
  'i=0; max=$(($3 * 10))',
  'while :; do',
  '  if mkdir -- "$1" 2>/dev/null; then',
  '    printf "%s %s" "$2" "$(date +%s)" > "$1/owner" || { rm -rf -- "$1"; exit 1; }',
  '    exit 0',
  '  fi',
  '  [ -d "${1%/*}" ] || exit 1',
  '  [ "$i" -ge "$max" ] && exit 75',
  '  i=$((i + 1)); sleep 0.1',
  'done',
].join('\n')

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

// Release: removes the lock only when the stored token (the owner file minus its trailing ` <epoch>`) equals ours, so
// a late release after `/plans unlock` and a new holder cannot remove the new holder's lock. Exit 0 removed, 1 left alone.
const RELEASE = 'o=$(cat -- "$1/owner" 2>/dev/null) || exit 1; [ "${o% *}" = "$2" ] || exit 1; rm -rf -- "$1"'

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
