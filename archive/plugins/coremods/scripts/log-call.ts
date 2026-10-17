// Classic PostToolUse / PostToolUseFailure hook: appends one JSONL record per tool call to
// ${CLAUDE_PLUGIN_DATA}/logs/<session_id>/<agent>.jsonl. A plain append, no DuckDB, run by bun for its start-up time.
// Fails open: it always exits 0 and prints nothing, so it can never block or noise up a call.
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { buildRecord, logPath, summarize } from '../hooks/tool-mgr/rules'

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined)

// The log path (relative to logs/) and JSONL line for one hook input, or null when the input is not a tool call.
export function toRecord(input: any, now: Date = new Date()): { path: string; line: string } | null {
  if (!input || typeof input !== 'object' || typeof input.tool_name !== 'string') return null
  const toolInput = input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {}
  const tool_use_id = str(input.tool_use_id)
  const agent_type = str(input.agent_type)
  const agent_id = str(input.agent_id)
  // A subagent keys on its type (else its id); the main thread is `main` even under --agent, so the mod's deny records can agree.
  const agent = agent_id ? (agent_type ?? agent_id) : undefined
  const session = str(input.session_id)
  const isBash = input.tool_name === 'Bash'
  const failed = input.hook_event_name === 'PostToolUseFailure' || input.tool_response?.is_error === true
  const record = buildRecord({
    id: tool_use_id ?? `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    ts: now.toISOString(),
    session,
    agent,
    agent_type,
    permission_mode: str(input.permission_mode),
    tool: input.tool_name,
    tool_use_id,
    cwd: str(input.cwd),
    command: isBash ? str(toolInput.command) : undefined,
    summary: isBash ? undefined : summarize(toolInput),
    blocked: null,
    isError: failed,
  })
  return { path: logPath(session, agent), line: JSON.stringify(record) }
}

async function main() {
  try {
    const data = process.env.CLAUDE_PLUGIN_DATA
    if (!data) return
    const rec = toRecord(JSON.parse(await Bun.stdin.text()))
    if (!rec) return
    const file = join(data, 'logs', rec.path)
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
    appendFileSync(file, rec.line + '\n', { mode: 0o600 })
  } catch {
    // fail open
  }
}

if (import.meta.main) {
  await main()
  process.exit(0)
}
