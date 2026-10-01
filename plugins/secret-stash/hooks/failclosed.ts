import type { ApiContentBlock, Args } from 'claude-code'
import { ConfigInvalid } from './config.ts'
import { ScanOverrun } from './detectors/scan.ts'
import { DeadlineExceeded } from './redact.ts'

// What a failed outbound hook sends in place of the content it could not redact.
export const MARKER = '[secret-stash: content withheld because redaction failed]'

// The hook's own budget is wall time minus this margin, so the handler still has room to answer.
const SAFETY_MS = 2000
// Used only where the engine meters no budget (`remainingMs` is Infinity).
const UNMETERED_MS = 7000

export function deadlineOf(budget: { remainingMs: number }, now = Date.now()): number {
  return Number.isFinite(budget.remainingMs) ? now + budget.remainingMs - SAFETY_MS : now + UNMETERED_MS
}

// Media the engine lets a hook drop but not change. Images are the one kind left through.
const DROPPED_MEDIA = new Set(['document', 'audio', 'video'])

// What stands where dropping documents would leave a row or tool_result with no content.
export const DROPPED = '[secret-stash: document dropped]'

function markBlocks(blocks: ApiContentBlock[]): ApiContentBlock[] {
  const kept = blocks.filter(b => !DROPPED_MEDIA.has(b.type))
  if (blocks.length > 0 && kept.length === 0) return [{ type: 'text', text: MARKER }]
  return kept.map(b => {
    if (b.type === 'text') return { ...b, text: MARKER }
    if (b.type !== 'tool_result') return b
    if (typeof b.content === 'string') return { ...b, content: MARKER }
    return Array.isArray(b.content) ? { ...b, content: markBlocks(b.content as ApiContentBlock[]) } : b
  })
}

// The event each hook passes on, or answers with, when redaction failed.
export const markerized = {
  submit: ({ context: _context, ...e }: Args<'prompt.submit'>) => ({ ...e, text: MARKER }),
  append: (e: Args<'session.append'>) => ({ ...e, message: { ...e.message, content: markBlocks(e.message.content) } }),
  section: () => ({ text: MARKER }),
  context: () => ({ blocks: [{ name: 'secret-stash', text: MARKER }] }),
  attachment: () => ({ text: MARKER }),
  describe: () => ({ description: MARKER }),
  deny: () => ({ deny: MARKER }),
  send: () => ({ isDelivered: false as const, reason: MARKER }),
  compact: () => ({ skip: MARKER }),
}

// Toasts and the status line, handed in so this file never touches `$`.
export type CachedEvent = 'prompt.section' | 'prompt.context' | 'prompt.attachment' | 'tool.describe'
export type Reporter = { toast(text: string): void; status(text: string | undefined): void; invalidate(event: CachedEvent): void }

const toasted = new Set<string>()
let statusShown = false

// A toast per failure kind for the life of the process; the status line carries what persists.
function toastOnce(r: Reporter, kind: string, text: string) {
  if (toasted.has(kind)) return
  toasted.add(kind)
  r.toast(text)
}

// The engine caches the answers of these events for the session, so a marker answered after a
// failure stays until the answer is invalidated.
const stale = new Set<CachedEvent>()

export function markStale(event: CachedEvent) {
  stale.add(event)
}

function show(r: Reporter, kind: string, text: string) {
  statusShown = true
  r.status(text)
  toastOnce(r, kind, text)
}

// Shown text is fixed per kind or built from ConfigError paths and messages, never from a
// detector's error or any content. The status line keeps the latest failure until a success.
export function reportFailure(r: Reporter, err: unknown) {
  if (err instanceof ConfigInvalid) return show(r, 'config', err.message)
  if (err instanceof ScanOverrun) return show(r, 'scan', 'secret-stash: a detector overran its limits; content withheld')
  if (err instanceof DeadlineExceeded) return show(r, 'deadline', 'secret-stash: redaction ran out of time; content withheld')
  show(r, 'error', 'secret-stash: redaction failed; content withheld')
}

export function reportCaught(r: Reporter, failure: { kind: 'throw' | 'timeout' }) {
  if (failure.kind === 'timeout') return show(r, 'timeout', 'secret-stash: a hook timed out; content withheld')
  show(r, 'error', 'secret-stash: redaction failed; content withheld')
}

export function reportDropped(r: Reporter) {
  toastOnce(r, 'document', 'secret-stash: a document holding a secret was dropped from the conversation')
}

// Called after a redaction succeeded: drops the failure status and re-asks every cached event
// that answered a marker.
export function clearFailures(r: Reporter) {
  if (statusShown) {
    statusShown = false
    r.status(undefined)
  }
  for (const event of stale) r.invalidate(event)
  stale.clear()
}
