import type { Register } from 'claude-code'
import { classify, withAsk } from './danger/rules'

// All `$` code for bash-danger-guard lives here; the verdicts are pure (danger/rules.ts).

// The last error logged per source, so a repeat stays quiet until that source succeeds again.
const lastError: Record<string, string | null> = {}

function report($: any, key: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  if (message !== lastError[key]) $.ui.log(`bash-danger-guard: ${message}`, { to: 'debug' })
  lastError[key] = message
}

export const register: Register = on => {
  // Denies Bash that would destroy a system or escalate privilege, and Bash it cannot parse or that is too long.
  // classify() bounds the input length before parsing.
  on('tool.call', { tool: 'Bash' }, async ($, e: any, next) => {
    if (typeof e.command !== 'string') return next(e)
    const hit = classify(e.command)
    if (hit) return { deny: hit.message }
    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'bash-danger-guard: the safety check failed on this command. Rewrite it in plain bash, or hand it to the user to run.' }))

  // Asks before Bash that pipes a download into a shell or rewrites git history. A deny from a hook below stands.
  on('classic.PreToolUse', async ($, e: any, next) => {
    if (e.tool !== 'Bash' || typeof e.command !== 'string') return next(e)
    return withAsk(e.command, () => next(e), err => report($, 'ask', err))
  })
}
