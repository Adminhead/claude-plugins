import type { ApiContentBlock } from 'claude-code'
import { literalDetector, resolve } from './detect.ts'
import { MIN_SECRET_LEN, makeId } from './ids.ts'
import { isPlain } from './plain.ts'
import type { Detector, Found, Match } from './types.ts'

export type RedactCtx = {
  detectors: readonly Detector[]
  key: Uint8Array
  idFor(value: string): string | undefined
  // Absolute Date.now() ms; the caller picks it, and redaction throws past it.
  deadline: number
}

export class DeadlineExceeded extends Error {
  constructor() {
    super('secret-stash: redaction deadline exceeded')
  }
}

function checkDeadline(c: RedactCtx) {
  if (Date.now() > c.deadline) throw new DeadlineExceeded()
}

function addFound(into: Found[], more: Found[]) {
  for (const f of more) if (!into.some(g => g.id === f.id)) into.push(f)
}

// The deadline is checked before every detector. A single detector.detect call cannot be
// interrupted, so a catastrophic regex still holds the thread; detectors must be vetted
// for that when they are built. The await only yields to the microtask queue.
async function collect(text: string, c: RedactCtx): Promise<Match[]> {
  const out: Match[] = []
  for (const d of c.detectors) {
    checkDeadline(c)
    out.push(...d.detect(text))
    await Promise.resolve()
  }
  checkDeadline(c)
  return out
}

// Context-bound detectors (a `KEY=` rule) match only one occurrence, so look for every other
// occurrence of each value found and let resolve() merge them all.
function sweep(t: string, detected: Match[]): Match[] {
  const lits = new Map<string, string>()
  for (const m of resolve(t, detected)) {
    const value = t.slice(m.start, m.end)
    if (value.length >= MIN_SECRET_LEN && !lits.has(value)) lits.set(value, m.category)
  }
  return literalDetector([...lits].map(([value, category]) => ({ value, category }))).detect(t)
}

export async function redactText(t: string, c: RedactCtx): Promise<{ text: string; found: Found[] }> {
  const detected = await collect(t, c)
  const matches = resolve(t, [...detected, ...sweep(t, detected)])
  const ids = new Map<string, string>()
  const found: Found[] = []
  let text = ''
  let at = 0
  for (const m of matches) {
    const value = t.slice(m.start, m.end)
    let id = ids.get(value)
    if (!id) {
      id = c.idFor(value) ?? (await makeId(c.key, m.category, value))
      ids.set(value, id)
      found.push({ id, value, category: m.category })
    }
    text += t.slice(at, m.start) + id
    at = m.end
  }
  return { text: text + t.slice(at), found }
}

// Rewrites text blocks and tool_result content; every other block passes unchanged.
export async function redactBlocks(
  blocks: ApiContentBlock[],
  c: RedactCtx,
): Promise<{ blocks: ApiContentBlock[]; found: Found[] }> {
  const found: Found[] = []
  const out: ApiContentBlock[] = []
  for (const b of blocks) {
    if (b.type === 'text' && typeof b.text === 'string') {
      const r = await redactText(b.text, c)
      addFound(found, r.found)
      out.push({ ...b, text: r.text })
    } else if (b.type === 'tool_result' && typeof b.content === 'string') {
      const r = await redactText(b.content, c)
      addFound(found, r.found)
      out.push({ ...b, content: r.text })
    } else if (b.type === 'tool_result' && Array.isArray(b.content)) {
      const r = await redactBlocks(b.content as ApiContentBlock[], c)
      addFound(found, r.found)
      out.push({ ...b, content: r.blocks })
    } else {
      out.push(b)
    }
  }
  return { blocks: out, found }
}

// Redacts every string value in nested arrays and plain objects. Keys are left alone.
export async function redactDeep<T>(v: T, c: RedactCtx): Promise<{ value: T; found: Found[] }> {
  const found: Found[] = []
  const walk = async (x: unknown): Promise<unknown> => {
    if (typeof x === 'string') {
      const r = await redactText(x, c)
      addFound(found, r.found)
      return r.text
    }
    if (Array.isArray(x)) {
      const out: unknown[] = []
      for (const item of x) out.push(await walk(item))
      return out
    }
    if (isPlain(x)) {
      const out: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(x)) out[k] = await walk(val)
      return out
    }
    return x
  }
  return { value: (await walk(v)) as T, found }
}
