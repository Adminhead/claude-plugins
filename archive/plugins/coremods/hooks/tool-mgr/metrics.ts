// Pure helpers for the /tool-mgr command in the mod: argument parsing, help, output capping, and the two shell scripts that
// reach the hook-side runtime. The SQL and DuckDB code live in scripts/metrics.mjs. Nothing here touches `$`.
import { DATA_DIR_SH } from './rules'

export const MAX_OUTPUT = 8000

// Exit 0 when the SessionStart hook has set up the data dir, installed the DuckDB library, and node is on PATH.
export const CHECK_SCRIPT = `${DATA_DIR_SH}; [ -n "$d" ] && [ -f "$d/installed.stamp" ] && command -v node >/dev/null`

// Runs this install's scripts/metrics.mjs ($1 is $.plugin.root; the script path is never read from the data dir). The request is on stdin, never argv.
export const RUN_SCRIPT = `${DATA_DIR_SH}; if [ -z "$d" ] || [ ! -f "$d/installed.stamp" ]; then echo "metrics not ready yet; the SessionStart hook is still setting up (or failed, see install.log in the plugin data dir)" >&2; exit 1; fi; CLAUDE_PLUGIN_DATA="$d" exec node "$ROOT/scripts/metrics.mjs"`

export const HELP = `tool-mgr commands
  /tool-mgr                  calls per tool, blocks per rule, calls per session and agent (last 7 days and all time)
  /tool-mgr blocked [n]      the last n blocked commands (default 10, at most 100)
  /tool-mgr query <sql>      run SQL against the calls table, read-only (output capped)
  /tool-mgr help             this text
calls columns: id, ts, session, agent, agent_type, permission_mode, tool, tool_use_id, cwd, command, summary, blocked, is_error`

export type Parsed =
  | { kind: 'summary' }
  | { kind: 'blocked'; n: number }
  | { kind: 'query'; sql: string }
  | { kind: 'help' }
  | { kind: 'error'; message: string }

export function parseCommand(args: unknown): Parsed {
  const text = typeof args === 'string' ? args.trim() : ''
  if (text === '') return { kind: 'summary' }
  const [word, ...rest] = text.split(/\s+/)
  const tail = text.slice(word.length).trim()
  if (word === 'help') return { kind: 'help' }
  if (word === 'blocked') {
    if (rest.length === 0) return { kind: 'blocked', n: 10 }
    const n = Number(rest[0])
    if (rest.length > 1 || !Number.isInteger(n) || n < 1 || n > 100) return { kind: 'error', message: 'blocked takes one number from 1 to 100' }
    return { kind: 'blocked', n }
  }
  if (word === 'query' && /(^|\n)\s*\./.test(tail)) return { kind: 'error', message: 'query takes SQL only; dot-commands are not allowed' }
  if (word === 'query') return tail === '' ? { kind: 'error', message: 'query needs SQL' } : { kind: 'query', sql: tail }
  return { kind: 'error', message: `unknown subcommand: ${word.slice(0, 40)}` }
}

export const cap = (text: string, max = MAX_OUTPUT) => (text.length > max ? `${text.slice(0, max)}\n[truncated at ${max} characters]` : text)
