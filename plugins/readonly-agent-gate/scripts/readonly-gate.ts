// PreToolUse Bash gate: runs the read-only Bash check for the read-only agent types and allows
// every other agent, including the main thread (no agent_type, no agent_id).
//
// hooks.json runs it as `bun --no-env-file --config=/dev/null <path> || exit 2`, so a load
// failure or a missing bun also blocks. readonly-bash.ts is imported only for a read-only agent,
// so a broken checker never blocks a writer.
//
// The read-only set is DEFAULT_AGENTS in agents.ts plus the plugin's `extra_agents` option,
// which Claude Code exports to hooks as CLAUDE_PLUGIN_OPTION_EXTRA_AGENTS.
//
// Ported from the archived crew plugin's readonly-gate.ts.

import { isReadOnly, parseExtra } from './agents.ts'

function deny(reason: string): never {
  console.error(`readonly-gate: ${reason}; blocking.`)
  process.exit(2)
}

try {
  const input = await Bun.stdin.text()
  let h: any
  try {
    h = JSON.parse(input)
  } catch (e) {
    deny(`parse error: ${(e as Error).message}`)
  }
  if (typeof h !== 'object' || h === null || Array.isArray(h)) deny('payload is not an object')
  const type: unknown = h.agent_type
  if (typeof type !== 'string' || type === '') {
    // A subagent always carries agent_type; agent_id alone means the identity was lost.
    if ('agent_id' in h) deny('agent_id without agent_type, so the agent cannot be classified')
    process.exit(0)
  }
  if (!isReadOnly(type, parseExtra(process.env.CLAUDE_PLUGIN_OPTION_EXTRA_AGENTS))) process.exit(0)
  const { run } = await import('./readonly-bash.ts')
  process.exit(run(input))
} catch (e) {
  deny(`internal error (${e instanceof Error ? `${e.name}: ${e.message}` : String(e)})`)
}
