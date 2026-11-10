// plan-ledger: text for the model. Pure: no `$`, no clock. `renderItem` is what a subagent reads with
// `plan get`; `renderBlock` is the orchestrator's re-injected status (decision 8 in
// docs/plans/goal-ledger.md, about 200 tokens at the default budget); `renderDelta` is the one-line
// change notice between two blocks. Every function here is bounded: output never exceeds its limit.
import { shellQuote } from './checks'
import type { Item, ItemStatus, Plan } from './types'

/** Default size of the injected block: about 200 tokens. */
export const DEFAULT_BLOCK_CHARS = 800
export const MAX_DELTA_CHARS = 200

const PREFIX = '[plan-ledger] '
const STATUSES: ItemStatus[] = ['pending', 'in_progress', 'blocked', 'claimed_done', 'verified', 'failed', 'abandoned']

// ---------------------------------------------------------------- helpers

/**
 * Free text on one line: every run of whitespace and control characters (newlines included) becomes a
 * single space. Everything stored by a caller goes through this before it is placed in a line, so a title
 * or note cannot start a new line and forge an item line or a plan header (`renderDelta` reads those).
 */
function one(s: unknown): string {
  return String(s ?? '')
    .replace(/[\s\u0000-\u001f\u007f-\u009f]+/g, ' ')
    .trim()
}

/** `s.slice(0, n)` that does not end in half a surrogate pair. */
function cut(s: string, n: number): string {
  if (n <= 0) return ''
  if (s.length <= n) return s
  const c = s.charCodeAt(n - 1)
  return s.slice(0, c >= 0xd800 && c <= 0xdbff ? n - 1 : n)
}

/** Output never exceeds `max` characters; `marker` replaces the tail when something was cut. */
function clamp(s: string, max: number, marker = '...'): string {
  if (s.length <= max) return s
  if (max <= marker.length) return cut(s, max)
  return cut(s, max - marker.length) + marker
}

function itemOf(plan: Plan, id: string): Item | undefined {
  return plan.items.find((i) => i.id === id)
}

/** Derived: every item verified or abandoned (and there is at least one). */
function isDone(plan: Plan): boolean {
  return plan.items.length > 0 && plan.items.every((i) => i.status === 'verified' || i.status === 'abandoned')
}

function isTerminal(plan: Plan): boolean {
  return plan.status === 'abandoned' || plan.status === 'done' || isDone(plan)
}

const isManual = (i: Item): boolean => i.status === 'verified' && (i.verification === null || i.verification.kind === 'manual')

// ---------------------------------------------------------------- renderItem

/**
 * What the assigned agent reads: the task, the acceptance criteria, the checks, files, dependencies
 * with their statuses, attempts and the last failure. When the text would pass `maxChars`, the
 * instructions are cut first (with a marker). Only when even that is not enough are the other
 * parts dropped, last the acceptance criteria and checks (lowest value first: failure, note, files,
 * dependencies). The result never passes `maxChars`.
 */
export function renderItem(plan: Plan, itemId: string, maxChars = 8000): string {
  const item = itemOf(plan, itemId)
  if (item === undefined) return clamp(`No item ${one(itemId)} in plan ${one(plan.id)}. Check the item id.`, maxChars)

  const head = `plan ${one(plan.id)} "${one(plan.title)}" (${one(plan.status)}), item ${one(item.id)} "${one(item.title)}": ${one(item.status)}, gen ${item.gen}, attempts ${item.attempts}.`
  // Display order; `rank` is the order they survive a cut (1 survives longest).
  const parts: { rank: number; text: string }[] = [
    { rank: 0, text: `Agent: ${one(item.agent)} (model ${one(item.model) || 'unset'})` },
  ]
  if (item.acceptance.length > 0) parts.push({ rank: 1, text: `Acceptance:\n${item.acceptance.map((a) => `- ${one(a)}`).join('\n')}` })
  if (item.checks.length > 0) {
    parts.push({
      rank: 2,
      text: `Checks (the orchestrator runs these at verify):\n${item.checks
        .map((c) => `- ${one(c.label)}: ${shellQuote(c.argv)} (expect exit ${c.expectExit})`)
        .join('\n')}`,
    })
  }
  if (item.files.length > 0) parts.push({ rank: 4, text: `Files: ${item.files.map(one).join(', ')}` })
  if (item.deps.length > 0) {
    parts.push({ rank: 3, text: `Depends on: ${item.deps.map((d) => `${one(d)} (${one(itemOf(plan, d)?.status ?? 'missing')})`).join(', ')}` })
  }
  if (item.note !== null) parts.push({ rank: 5, text: `Latest note: ${one(item.note)}` })
  if (item.failure !== null) parts.push({ rank: 6, text: `Last failure:\n${item.failure}` })

  const join = (ps: { text: string }[]) => (ps.length > 0 ? `\n\n${ps.map((p) => p.text).join('\n\n')}` : '')
  const before = `${head}\n\nInstructions:\n`
  const after = join(parts)
  const whole = before + item.instructions + after
  if (whole.length <= maxChars) return whole

  const marker = '\n[instructions cut here: ask the orchestrator for the rest]'
  const room = maxChars - before.length - after.length - marker.length
  if (room > 0) return before + cut(item.instructions, room) + marker + after

  // The fixed parts alone are over budget: drop the instructions, then keep parts in rank order while they fit.
  let used = before.length + marker.trimStart().length
  const kept = new Map<{ rank: number; text: string }, string>()
  for (const part of [...parts].sort((x, y) => x.rank - y.rank)) {
    const left = maxChars - used - 2
    if (left >= part.text.length) {
      kept.set(part, part.text)
      used += 2 + part.text.length
    } else {
      if (left >= 30) kept.set(part, clamp(part.text, left))
      break
    }
  }
  const shown = parts.filter((p) => kept.has(p)).map((p) => ({ text: kept.get(p) as string }))
  return clamp(before + marker.trimStart() + join(shown), maxChars, '\n[cut]')
}

// ---------------------------------------------------------------- renderBlock

type Token = { text: string; verified: boolean }

function itemToken(plan: Plan, item: Item): Token {
  let note = ''
  if (item.status === 'verified' && isManual(item)) note = ' (manual)'
  else if (item.status === 'in_progress') note = ` (${one(item.agent)})`
  else if (item.status === 'claimed_done') note = ` (${one(item.agent)}, awaiting verify)`
  else if (item.status === 'pending') {
    const unmet = item.deps.filter((d) => itemOf(plan, d)?.status !== 'verified')
    const abandoned = unmet.filter((d) => itemOf(plan, d)?.status === 'abandoned')
    const waiting = unmet.filter((d) => !abandoned.includes(d))
    const parts: string[] = []
    if (waiting.length > 0) parts.push(`needs ${waiting.map(one).join(', ')}`)
    if (abandoned.length > 0) parts.push(`blocked by abandoned ${abandoned.map(one).join(', ')}`)
    if (parts.length > 0) note = ` (${parts.join('; ')})`
  }
  return { text: `${one(item.id)} ${one(item.status)}${note}`, verified: item.status === 'verified' }
}

function headerOf(plan: Plan, first: boolean, titleMax: number): string {
  const verified = plan.items.filter((i) => i.status === 'verified')
  const manual = verified.filter(isManual).length
  const byCommand = verified.length - manual
  let how = ''
  if (verified.length > 0) {
    const parts = [`${byCommand} by command`]
    if (manual > 0) parts.push(`${manual} manually`)
    how = ` (${parts.join(', ')})`
  }
  const state = plan.status === 'active' ? '' : ` ${plan.status}`
  const title = clamp(one(plan.title), titleMax)
  return `${first ? PREFIX : ''}${one(plan.id)} "${title}" rev ${plan.rev}${state}: ${verified.length}/${plan.items.length} verified${how}`
}

// One plan as a header plus, when it fits, a line of items. Null when not even a header fits.
function planChunk(plan: Plan, first: boolean, room: number): string | null {
  let header = headerOf(plan, first, Infinity)
  if (header.length > room) {
    const fixed = headerOf(plan, first, 0).length // header without title text
    const titleRoom = room - fixed
    if (titleRoom < 8) return null
    header = headerOf(plan, first, titleRoom)
  }
  const lineRoom = room - header.length - 1
  if (plan.items.length === 0 || lineRoom < 6) return header

  const tokens = plan.items.map((i) => itemToken(plan, i))
  const join = (ts: Token[]) => `  ${ts.map((t) => t.text).join('  ')}`
  let line = join(tokens)
  if (line.length <= lineRoom) return `${header}\n${line}`

  // The header already counts what is verified, so those items go first.
  const open = tokens.filter((t) => !t.verified)
  line = open.length > 0 ? join(open) : ''
  if (line !== '' && line.length <= lineRoom) return `${header}\n${line}`

  const kept: Token[] = []
  for (const t of open) {
    const trailer = `  ... +${open.length - kept.length - 1}`
    if (join([...kept, t]).length + trailer.length > lineRoom) break
    kept.push(t)
  }
  if (kept.length === 0) return header
  return `${header}\n${join(kept)}  ... +${open.length - kept.length}`
}

/**
 * The orchestrator's status block: non-terminal plans only (a plan whose items are all verified or
 * abandoned, or that is abandoned, is left out), active before draft, with verified items split into
 * by-command and manual. Never longer than `maxChars`; plans that do not fit are replaced by
 * `... +N more`. Empty when there is nothing to show.
 */
export function renderBlock(plans: Plan[], maxChars: number = DEFAULT_BLOCK_CHARS): string {
  if (maxChars <= 0) return ''
  const live = plans.filter((p) => !isTerminal(p))
  const ordered = [...live.filter((p) => p.status === 'active'), ...live.filter((p) => p.status !== 'active')]
  if (ordered.length === 0) return ''

  let out = ''
  let shown = 0
  for (let i = 0; i < ordered.length; i++) {
    const after = ordered.length - i - 1
    const reserve = after > 0 ? 1 + `... +${after} more`.length : 0
    const room = maxChars - out.length - (out === '' ? 0 : 1) - reserve
    const chunk = planChunk(ordered[i], i === 0, room)
    if (chunk === null) break
    out += (out === '' ? '' : '\n') + chunk
    shown++
  }
  if (shown === 0) return cut(headerOf(ordered[0], true, Infinity), maxChars)
  if (shown < ordered.length) out += `\n... +${ordered.length - shown} more`
  return out
}

// ---------------------------------------------------------------- renderDelta

type Summary = { draft: boolean; items: Map<string, string> }

const HEADER_RE = /^(?:\[plan-ledger\] )?(p-[0-9a-z-]+) .* rev \d+( draft)?: \d+\/\d+ verified/
const ITEM_RE = new RegExp(`\\b(s\\d{1,2}) (${STATUSES.join('|')})\\b`, 'g')

function parseBlock(text: string): Map<string, Summary> {
  const plans = new Map<string, Summary>()
  let current: Summary | null = null
  for (const line of text.split('\n')) {
    const h = HEADER_RE.exec(line)
    if (h !== null) {
      current = { draft: h[2] !== undefined, items: new Map() }
      plans.set(h[1], current)
    } else if (current !== null && line.startsWith('  ')) {
      for (const m of line.matchAll(ITEM_RE)) current.items.set(m[1], m[2])
    }
  }
  return plans
}

/**
 * One line naming what changed between two blocks as `renderBlock` made them: items whose status
 * changed, plans that appeared, left the block (ended, or pushed out by the budget) or were
 * activated. Empty when nothing a reader needs changed (a rev bump alone does not count). At most
 * 200 characters.
 */
export function renderDelta(prev: string, next: string): string {
  if (prev === next) return ''
  const before = parseBlock(prev)
  const after = parseBlock(next)
  const notes: string[] = []

  for (const [id, now] of after) {
    const was = before.get(id)
    if (was === undefined) {
      notes.push(`${id} new`)
      continue
    }
    const parts: string[] = []
    if (was.draft && !now.draft) parts.push('activated')
    for (const [item, status] of now.items) if (was.items.get(item) !== status) parts.push(`${item} ${status}`)
    for (const item of was.items.keys()) if (!now.items.has(item)) parts.push(`${item} no longer listed`)
    if (parts.length > 0) notes.push(`${id} ${parts.join(', ')}`)
  }
  for (const id of before.keys()) if (!after.has(id)) notes.push(`${id} no longer listed`)

  if (notes.length === 0) return ''
  return clamp(`${PREFIX}changed: ${notes.join('; ')}`, MAX_DELTA_CHARS)
}
