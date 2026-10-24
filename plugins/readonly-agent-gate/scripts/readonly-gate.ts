// PreToolUse gate for Bash and the file-writing tools: runs the read-only Bash check, or the
// scratch-path check for Write/Edit/MultiEdit/NotebookEdit, for the read-only agent types and
// allows every other agent, including the main thread (no agent_type, no agent_id). A plan
// writer's Write/Edit/MultiEdit that fails the scratch check may still pass the plan-directory
// check in plans.ts.
//
// hooks.json runs it as `bun --no-env-file --config=/dev/null <path> || exit 2`, so a load
// failure or a missing bun also blocks. readonly-bash.ts, scratch.ts and plans.ts are imported
// only for a read-only agent, so a broken checker never blocks a writer.
//
// The read-only set is DEFAULT_AGENTS in agents.ts plus the plugin's `extra_agents` option, and
// the plan writers are DEFAULT_PLAN_WRITERS plus `plan_writers`. Claude Code exports the options
// to hooks as CLAUDE_PLUGIN_OPTION_<KEY>, and the project root as CLAUDE_PROJECT_DIR. An option
// longer than 4096 characters is not cut: extra_agents then blocks every subagent, and
// plan_writers and plan_dirs add nothing.
//
// Ported from the archived crew plugin's readonly-gate.ts.

import { isPlanWriter, isReadOnly, parseExtra } from './agents.ts'

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
  const extra = parseExtra(process.env.CLAUDE_PLUGIN_OPTION_EXTRA_AGENTS)
  // A cut list could drop a gated agent, so an over-long option blocks every subagent.
  if (extra === null) deny('the extra_agents option is longer than 4096 characters, so the read-only agents are unknown')
  if (!isReadOnly(type, extra)) process.exit(0)
  const planWriter = isPlanWriter(type, parseExtra(process.env.CLAUDE_PLUGIN_OPTION_PLAN_WRITERS) ?? [])
  const plans = planWriter ? await import('./plans.ts') : null
  const area = plans?.planArea(plans.parsePlanDirs(process.env.CLAUDE_PLUGIN_OPTION_PLAN_DIRS), process.env.CLAUDE_PROJECT_DIR, h.cwd) ?? null
  if (h.tool_name === 'Bash') {
    const { run } = await import('./readonly-bash.ts')
    process.exit(run(input, plans && area ? plans.planHint(area) : ''))
  }
  // Write, Edit, MultiEdit and NotebookEdit: allowed only on scratch paths, or for a plan writer
  // on a plan file. Any other tool reaching a read-only agent through this hook is blocked.
  const { checkFileWrite, SCRATCH_MSG } = await import('./scratch.ts')
  const reason = checkFileWrite(h)
  if (reason === null) process.exit(0)
  if (plans === null || area === null) deny(`${reason}. ${SCRATCH_MSG}`)
  const why = plans.checkPlanWrite(h, area)
  if (why === null) process.exit(0)
  deny(`${reason}, and not a plan file: ${why}. ${plans.planMsg(area)}`)
} catch (e) {
  deny(`internal error (${e instanceof Error ? `${e.name}: ${e.message}` : String(e)})`)
}
