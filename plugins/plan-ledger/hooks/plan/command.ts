// plan-ledger: the `/plans` command's pure half. Argument parsing and the text it prints. Pure: no `$`, no I/O. Every
// value that came from a model or a file (titles, notes, ledger fields) goes through `one` before it is printed, so a
// stored control character or escape sequence cannot reach the person's terminal or start a forged line.
// See decision 5 in docs/plans/goal-ledger.md.
import { clamp, one } from './render'
import { isPlanId } from './store'
import { planLine } from './tool'
import type { Change, Item, Plan } from './types'

export const COMMAND_NAME = 'plans'
export const MAX_ARGS_CHARS = 200
export const DEFAULT_LOG_LINES = 10
export const MAX_LOG_LINES = 50

export type Sub = 'status' | 'show' | 'log' | 'repair' | 'unlock' | 'abandon' | 'goal-text'
export type Parsed = { sub: Sub; plan?: string; n?: number } | { error: string }

const SUBS: readonly Sub[] = ['status', 'show', 'log', 'repair', 'unlock', 'abandon', 'goal-text']
export const USAGE =
  'Usage: /plans [status [plan]] | show <plan> | log <plan> [n] | repair <plan> | unlock <plan> | abandon <plan> | goal-text <plan>'

/** `/plans` arguments, bounded before anything else looks at them. */
export function parseArgs(args: unknown): Parsed {
  const text = typeof args === 'string' ? args : ''
  if (text.length > MAX_ARGS_CHARS) return { error: USAGE }
  const words = text.trim() === '' ? [] : text.trim().split(/\s+/)
  const sub = (words[0] ?? 'status') as Sub
  if (!SUBS.includes(sub)) return { error: USAGE }
  const rest = words.slice(1)
  const plan = rest[0]
  if (plan !== undefined && !isPlanId(plan)) return { error: `"${one(plan).slice(0, 40)}" is not a plan id (p-...). ${USAGE}` }
  if (sub !== 'status' && plan === undefined) return { error: `${sub} needs a plan id. ${USAGE}` }
  if (sub === 'log') {
    if (rest.length > 2) return { error: USAGE }
    let n = DEFAULT_LOG_LINES
    if (rest[1] !== undefined) {
      if (!/^[0-9]{1,3}$/.test(rest[1]) || Number(rest[1]) < 1) return { error: `log takes a number of lines from 1 to ${MAX_LOG_LINES}. ${USAGE}` }
      n = Math.min(Number(rest[1]), MAX_LOG_LINES)
    }
    return { sub, plan, n }
  }
  if (rest.length > 1) return { error: USAGE }
  return plan === undefined ? { sub } : { sub, plan }
}

// ---------------------------------------------------------------- show

function itemLine(i: Item): string {
  const parts = [`${one(i.id)} ${one(i.status)}: ${clamp(one(i.title), 80)}`]
  const facts = [`agent ${one(i.agent)}`, one(i.model) === '' ? '' : `model ${one(i.model)}`, `gen ${i.gen}`, `attempts ${i.attempts}`]
  if (i.boundAgent !== null) facts.push(`bound ${clamp(one(i.boundAgent.agentId), 20)}`)
  if (i.deps.length > 0) facts.push(`needs ${i.deps.map(one).join(',')}`)
  if (i.checks.length > 0) facts.push(`${i.checks.length} check${i.checks.length === 1 ? '' : 's'}`)
  parts.push(`  ${facts.filter((f) => f !== '').join(', ')}`)
  if (i.claimed !== null) parts.push(`  claimed (self-reported): ${clamp(one(i.claimed.summary), 140)}`)
  if (i.verification !== null) {
    const v = i.verification
    const how = v.kind === 'manual' ? `manually, no command run${v.note ? `: ${clamp(one(v.note), 100)}` : ''}` : `${v.results.length} check${v.results.length === 1 ? '' : 's'} run`
    parts.push(`  verification ${v.ok ? 'passed' : 'failed'} (${how}) at ${one(v.at)}`)
  }
  if (i.note !== null) parts.push(`  note: ${clamp(one(i.note), 140)}`)
  if (i.failure !== null) parts.push(`  failure: ${clamp(one(i.failure), 160)}`)
  return parts.join('\n')
}

/** The whole plan for the person: header, then every item with its binding, evidence and verification. */
export function renderShow(plan: Plan, maxChars = 6000): string {
  const head = `${planLine(plan)} (created ${one(plan.created)}, project ${clamp(one(plan.project), 80)})`
  return clamp([head, ...plan.items.map(itemLine)].join('\n'), maxChars)
}

// ---------------------------------------------------------------- log

const who = (c: Change): string =>
  c.actor.kind === 'main'
    ? 'main'
    : `agent ${one(c.actor.agentType ?? 'unlisted')} ${clamp(one(c.actor.agentId), 20)}`

/** What a ledger entry's payload adds to its line: a note or summary, never raw data. */
function detail(c: Change): string {
  const d = c.data as Record<string, unknown>
  for (const k of ['note', 'summary', 'planTitle']) {
    if (typeof d[k] === 'string' && d[k] !== '') return `: ${clamp(one(d[k]), 100)}`
  }
  return ''
}

/** One ledger entry on one line. A denied attempt shows its reason; the rev is the plan's, unchanged. */
export function logLine(c: Change): string {
  const move = c.from !== null || c.to !== null ? ` ${one(c.from ?? '-')}>${one(c.to ?? '-')}` : ''
  const item = c.item === null ? '' : ` ${one(c.item)}`
  if (c.denied !== null) return `rev ${c.rev} ${one(c.ts)} ${who(c)} ${one(c.action)}${item} DENIED: ${clamp(one(c.denied), 140)}`
  return `rev ${c.rev} ${one(c.ts)} ${who(c)} ${one(c.action)}${item}${move}${detail(c)}`
}

/** The last `n` entries, oldest first, with a count of what the file could not show. */
export function renderLog(changes: Change[], n: number, bad: number, torn: boolean): string {
  const shown = changes.slice(-n)
  const lines = shown.map(logLine)
  const notes: string[] = []
  if (bad > 0) notes.push(`${bad} damaged line${bad === 1 ? '' : 's'} skipped`)
  if (torn) notes.push('the last line was cut off and is ignored')
  if (lines.length === 0) return notes.length === 0 ? 'The ledger has no entries.' : `The ledger has no readable entries (${notes.join('; ')}).`
  const head = `Last ${shown.length} of ${changes.length} ledger entries${notes.length === 0 ? '' : ` (${notes.join('; ')})`}:`
  return [head, ...lines].join('\n')
}

// ---------------------------------------------------------------- goal-text

export type GoalCounts = { total: number; byCommand: number; manual: number; open: number }

export function goalCounts(plan: Plan): GoalCounts {
  const verified = plan.items.filter((i) => i.status === 'verified')
  const manual = verified.filter((i) => i.verification === null || i.verification.kind === 'manual').length
  const settled = plan.items.filter((i) => i.status === 'abandoned').length
  return { total: plan.items.length, byCommand: verified.length - manual, manual, open: plan.items.length - verified.length - settled }
}

/**
 * The condition for `/goal`: worded so the evaluator can judge it from the `[plan-ledger]` text the mod puts in the
 * transcript, and so a manual verification is named apart from a command-checked one. The mod never submits it.
 */
export function goalText(plan: Plan): string {
  const c = goalCounts(plan)
  const now = `now ${c.byCommand} verified by command, ${c.manual} manually, ${c.open} open`
  return (
    `/goal Every item of plan ${one(plan.id)} ("${clamp(one(plan.title), 60)}", ${c.total} items) shows verified in the ` +
    `plan-ledger status, counting those verified by command apart from those verified manually (${now}).`
  )
}

// ---------------------------------------------------------------- unlock

/** Reads a lock's `owner` file (`<token> <epoch seconds>`). Null when it does not look like one. */
export function lockOwner(text: string, nowMs: number): { token: string; ageSec: number } | null {
  const m = /^([A-Za-z0-9._-]{1,80}) ([0-9]{1,12})$/.exec(text.trim())
  if (m === null) return null
  return { token: m[1], ageSec: Math.max(0, Math.floor(nowMs / 1000) - Number(m[2])) }
}

/** The question before a lock is removed: who holds it and for how long, ending in a question mark. */
export function unlockQuestion(planId: string, owner: { token: string; ageSec: number } | null): string {
  const who = owner === null ? 'an unreadable owner' : `holder ${owner.token.slice(0, 8)}, held for ${owner.ageSec} s`
  return `Remove the lock of plan ${planId} (${who}) although a live holder would then write at the same time as the next caller?`
}

// ---------------------------------------------------------------- abandon

/** The question before a plan is abandoned: which plan and what it stops, ending in a question mark. */
export function abandonQuestion(plan: Plan): string {
  const open = plan.items.filter((i) => i.status !== 'verified' && i.status !== 'abandoned').length
  return `Abandon plan ${one(plan.id)} ("${clamp(one(plan.title), 60)}"), closing its ${open} open item${open === 1 ? '' : 's'} for good?`
}
