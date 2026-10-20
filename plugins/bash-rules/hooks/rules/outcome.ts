// Classifies how a Bash call ended after `next(e)` returned, for the usage log. Pure: nothing here touches `$`.
//
// A hook below bash-rules (a classic PreToolUse command such as cloud-ops-guard's) that denies does not return `{deny}`
// from `next`: the engine turns it into a tool error whose text starts `PreToolUse:Bash hook error:`. Without this,
// those calls were logged as `allow` with `isError: true`.

const HOOK_ERROR = /^PreToolUse:\S+ hook error/

// What the engine reports for a failed call: the first text found on the result.
function textOf(out: unknown): string | null {
  if (typeof out === 'string') return out
  if (out === null || typeof out !== 'object') return null
  const o = out as Record<string, unknown>
  for (const k of ['text', 'error', 'message', 'result', 'content']) {
    const v = o[k]
    if (typeof v === 'string') return v
    if (Array.isArray(v)) {
      const t = v.map(p => (typeof p === 'string' ? p : typeof (p as any)?.text === 'string' ? (p as any).text : '')).join('')
      if (t !== '') return t
    }
  }
  return null
}

export const MAX_LATER_DENY = 300

// The message of a deny a hook below issued, or null when the call was not denied later. `stored` is the deny the
// classic.PreToolUse hook saw for this call (keyed by tool_use_id); otherwise a hook-error tool result counts.
export function laterDeny(out: unknown, stored: string | undefined): string | null {
  const cut = (s: string) => s.slice(0, MAX_LATER_DENY)
  if (stored !== undefined && stored !== '') return cut(stored)
  if (out === null || typeof out !== 'object' || (out as { isError?: unknown }).isError !== true) return null
  const text = textOf(out)
  return text !== null && HOOK_ERROR.test(text.trimStart()) ? cut(text.trimStart()) : null
}
