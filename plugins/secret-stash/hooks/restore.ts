import type { TurnStepChunk } from 'claude-code'
import { ID_MAX_LEN, ID_RE, couldBeIdPrefix } from './ids.ts'
import { isPlain } from './plain.ts'
import type { Lookup } from './types.ts'

// Envelope keys that are never tool input.
const RESERVED = new Set(['tool', 'tool_use_id', 'agentId', 'consent'])

// Unknown IDs stay verbatim.
export function restoreText(t: string, get: Lookup): string {
  return t.replace(ID_RE, id => get(id) ?? id)
}

function walk(x: unknown, get: Lookup): unknown {
  if (typeof x === 'string') return restoreText(x, get)
  if (Array.isArray(x)) return x.map(item => walk(item, get))
  if (isPlain(x)) return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, walk(v, get)]))
  return x
}

// Restores IDs in every string of `input` without mutating it. `skip` names top-level
// keys to leave alone, or 'all' to leave the whole input alone.
export function restoreDeep<T extends object>(input: T, get: Lookup, skip: ReadonlySet<string> | 'all'): T {
  if (skip === 'all') return input
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    out[k] = RESERVED.has(k) || skip.has(k) ? v : walk(v, get)
  }
  return out as T
}

// Restores IDs in a response's text chunks. A text chunk's trailing characters that could
// begin an ID wait in `tail` until the next chunk settles them.
export class StreamRestorer {
  private tail = ''
  private index = 0

  constructor(private readonly get: Lookup) {}

  push(c: TurnStepChunk): TurnStepChunk[] {
    if (c.kind !== 'text') return [...this.flush(), c]
    const out = c.index === this.index ? [] : this.flush()
    const buf = this.tail + c.text
    const cut = this.tailStart(buf)
    this.tail = buf.slice(cut)
    this.index = c.index
    const head = buf.slice(0, cut)
    if (head) out.push({ ...c, text: restoreText(head, this.get) })
    return out
  }

  // Emits the held tail unrestored. Call when the stream ends: a stream with no stop
  // chunk otherwise loses its last, under 56 characters.
  flush(): TurnStepChunk[] {
    if (!this.tail) return []
    const chunk: TurnStepChunk = { kind: 'text', index: this.index, text: this.tail }
    this.tail = ''
    return [chunk]
  }

  // Start of the longest suffix that could still grow into an ID, never inside a whole one.
  private tailStart(buf: string): number {
    const spans = [...buf.matchAll(ID_RE)].map(m => [m.index, m.index + m[0].length])
    for (let i = Math.max(0, buf.length - ID_MAX_LEN + 1); i < buf.length; i++) {
      if (buf[i] !== '_' || spans.some(([s, e]) => i > s && i < e)) continue
      if (couldBeIdPrefix(buf.slice(i))) return i
    }
    return buf.length
  }
}
