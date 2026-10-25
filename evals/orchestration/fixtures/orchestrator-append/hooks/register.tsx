// Test fixture. `claude plugin eval` only lets a case set EVAL_* variables, so this mod sets
// CLAUDE_ORCHESTRATE=1 itself, which is what the claude-orchestrate launcher exports. agent-router
// reads it when the Agent tool is described, after session.start.
import type { Register } from 'claude-code'

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.env.set("CLAUDE_ORCHESTRATE", "1")
    return next(e)
  })
}
