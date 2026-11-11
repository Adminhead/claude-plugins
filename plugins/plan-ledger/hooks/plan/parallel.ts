// plan-ledger: which items may run beside each other. Pure: no `$`, no I/O. `parallelSafe` is the author's declaration that
// an item shares no files or state with other ready items; nothing here changes who may claim what.
import type { Item, Plan } from './types'

const GLOB = /[*?[{]/

/** An item's `files` entry as a directory-aware path: `./` and trailing `/` dropped; a glob keeps its literal directory. */
function base(entry: string): string {
  let p = entry.trim().replace(/^(\.\/)+/, '')
  const g = p.search(GLOB)
  if (g >= 0) p = p.slice(0, Math.max(0, p.lastIndexOf('/', g)))
  return p.replace(/\/+$/, '')
}

const within = (inner: string, outer: string): boolean => outer === '' || inner === outer || inner.startsWith(`${outer}/`)

/** A glob with no literal directory (`*.md`, `**\/*.ts`): where it lands is unknown, so it is never reported as an overlap. */
const rootGlob = (entry: string): boolean => GLOB.test(entry) && base(entry) === ''

/** The first pair of entries of two `files` lists that name the same path, or one inside the other (a directory, or a glob's directory). A glob with no directory part is unknown and skipped. */
export function filesOverlap(a: string[], b: string[]): string | null {
  for (const x of a) {
    for (const y of b) {
      if (x.trim() === '' || y.trim() === '' || rootGlob(x) || rootGlob(y)) continue
      const bx = base(x)
      const by = base(y)
      if (within(bx, by) || within(by, bx)) return bx.length >= by.length ? x : y
    }
  }
  return null
}

const isSafe = (i: Item): boolean => i.parallelSafe === true

type Pair = { a: string; b: string; hit: string }

/** Each pair of parallel-safe items whose files overlap. Terminal items are left out: they will not run again. */
function overlapPairs(items: Item[]): Pair[] {
  const live = items.filter((i) => isSafe(i) && i.status !== 'verified' && i.status !== 'abandoned')
  const out: Pair[] = []
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const hit = filesOverlap(live[i].files, live[j].files)
      if (hit !== null) out.push({ a: live[i].id, b: live[j].id, hit })
    }
  }
  return out
}

/** One sentence per overlapping pair; `create` and `amend` append these to their answer, never refuse for them. */
export const overlapWarnings = (items: Item[]): string[] =>
  overlapPairs(items).map((p) => `${p.a} and ${p.b} are both parallelSafe but both list "${p.hit.slice(0, 80)}"; run one first or split the files.`)

export type Ready = { parallel: Item[]; alone: Item[] }

/**
 * The items a subagent could claim right now: `pending` with every dep `verified`, in an `active` plan. `parallel` are the
 * ones declared parallelSafe (launch together); `alone` the rest (launch one at a time, or in sequence).
 */
export function readyItems(plan: Plan): Ready {
  if (plan.status !== 'active') return { parallel: [], alone: [] }
  const byId = new Map(plan.items.map((i) => [i.id, i]))
  const ready = plan.items.filter((i) => i.status === 'pending' && i.deps.every((d) => byId.get(d)?.status === 'verified'))
  return { parallel: ready.filter(isSafe), alone: ready.filter((i) => !isSafe(i)) }
}

/** The `Ready:` line of a plan status, or null when nothing is ready. Ready parallel-safe items that share files are named, not grouped. */
export function readyLine(plan: Plan): string | null {
  const { parallel, alone } = readyItems(plan)
  if (parallel.length === 0 && alone.length === 0) return null
  const parts: string[] = []
  if (parallel.length > 0) parts.push(`parallel-safe (launch together): ${parallel.map((i) => i.id).join(', ')}`)
  if (alone.length > 0) parts.push(`alone or in sequence: ${alone.map((i) => i.id).join(', ')}`)
  const clash = overlapPairs(parallel)
  return `Ready: ${parts.join('; ')}.${clash.length > 0 ? ` Overlapping files: ${clash.map((p) => `${p.a}+${p.b}`).join(', ')}.` : ''}`
}
