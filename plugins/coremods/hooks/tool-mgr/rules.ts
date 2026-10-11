// Pure rules and formatting for tool-mgr. Nothing here touches `$`.

export type Rule = 'sed-read' | 'heredoc-write'
export type Hit = { rule: Rule; message: string }

const MESSAGES: Record<Rule, string> = {
  'sed-read':
    'tool-mgr: do not read files with sed. Use the built-in Read tool; pass offset and limit for a line range.',
  'heredoc-write':
    'tool-mgr: do not write files with a heredoc in Bash. Use the built-in Write tool for a new file or Edit to change one.',
}

// A heredoc body is data, not commands: drop it so its lines are not read as shell.
// shortcut: the terminator must sit alone on its line and quoting is not parsed, so odd shell can slip by or false-hit. Fail-open is the intended direction.
function stripHeredocBodies(command: string): string {
  return command.replace(/(?<!<)<<(?!<)-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n[ \t]*\2(?=\n|$)/g, m => m.slice(0, m.indexOf('\n')))
}

// The shell-level text: heredoc bodies dropped and quoted spans emptied, so `>`, `;` or `|` inside quotes is not read as shell.
// shortcut: no nesting ($(...) inside quotes, escaped quotes in '...'); move to a real shell tokenizer if that bites.
const shellText = (command: string) => stripHeredocBodies(command).replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, "''")

const IN_PLACE = /(^|\s)(--in-place\S*|-[A-Za-z]*i\S*)(\s|$)/

// A pipeline segment that starts with sed, edits nothing in place, and is not fed by a pipe reads a file.
function sedRead(command: string): boolean {
  const parts = shellText(command).split(/(\|\||&&|\||;|\n)/)
  for (let i = 0; i < parts.length; i += 2) {
    const seg = parts[i].trim()
    const fedByPipe = i > 0 && parts[i - 1] === '|'
    if (/^sed(\s|$)/.test(seg) && !fedByPipe && !IN_PLACE.test(seg)) return true
  }
  return false
}

const INTERPRETER_HEREDOC = /\b(python3?|node|bun|deno|ruby|perl)\b[^\n]*(?<!<)<<(?!<)/
const BODY_WRITES =
  /\bopen\s*\([^)]*,\s*(?:mode\s*=\s*)?['"][rwaxbt+]*[wax][rwaxbt+]*['"]|\.write_text\(|\.write_bytes\(|writeFileSync|writeFile\(|appendFile/
const TEE_FILE = /\btee\b(\s+-\S+)*\s+[^\s|;&<>-]/

// Heredoc (not <<<) together with a redirect to a real file, tee to a file, or an interpreter body that writes files.
// Skipped on purpose: `python -c` and `node -e` with no heredoc.
function heredocWrite(command: string): boolean {
  const header = shellText(command)
  if (!/(?<!<)<<(?!<)/.test(header)) return false
  for (const m of header.matchAll(/\d*>>?(?![>&])\s*([^\s;&|<>]+)/g)) if (m[1] !== '/dev/null') return true
  if (TEE_FILE.test(header)) return true
  return INTERPRETER_HEREDOC.test(command) && BODY_WRITES.test(command)
}

export function classify(command: string): Hit | null {
  const rule: Rule | null = sedRead(command) ? 'sed-read' : heredocWrite(command) ? 'heredoc-write' : null
  return rule && { rule, message: MESSAGES[rule] }
}

export const MAX_COMMAND = 4000
const MAX_SUMMARY = 500
const MAX_PART = 64

// A value that becomes one path component: only [A-Za-z0-9._-], capped, never empty, never `.`/`..`, never a leading dot.
export function safeName(raw: unknown, fallback: string): string {
  const s = String(raw ?? '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^\.+/, m => '_'.repeat(m.length))
    .slice(0, MAX_PART)
  return s === '' ? fallback : s
}

// Path of a call's log, relative to ~/.claude/tool-mgr/logs. The main thread is `main`.
export const logPath = (session: unknown, agent: unknown) => `${safeName(session, 'unknown')}/${safeName(agent, 'main')}.jsonl`

const SUMMARY_KEYS = ['file_path', 'notebook_path', 'path', 'pattern', 'glob', 'url', 'query', 'description', 'subagent_type', 'skill', 'name']

// A small capped summary of a non-Bash tool's input: only well-known short fields, never Write/Edit contents.
export function summarize(input: Record<string, unknown>): string | undefined {
  const parts = SUMMARY_KEYS.filter(k => typeof input[k] === 'string').map(k => `${k}=${String(input[k]).slice(0, 200)}`)
  return parts.length ? parts.join(' ').slice(0, MAX_SUMMARY) : undefined
}

export type Fields = {
  id: string
  ts: string
  session?: string
  agent?: string
  agent_type?: string
  permission_mode?: string
  tool: string
  tool_use_id?: string
  cwd?: string
  command?: string
  summary?: string
  blocked: Rule | null
  isError: boolean
}

// The JSONL record in a fixed key order; fields the event did not carry stay undefined and JSON.stringify drops them.
export const buildRecord = (f: Fields): Fields => ({
  id: f.id,
  ts: f.ts,
  session: f.session,
  agent: f.agent,
  agent_type: f.agent_type,
  permission_mode: f.permission_mode,
  tool: f.tool,
  tool_use_id: f.tool_use_id,
  cwd: f.cwd,
  command: f.command?.slice(0, MAX_COMMAND),
  summary: f.summary?.slice(0, MAX_SUMMARY),
  blocked: f.blocked,
  isError: f.isError,
})

// A mod's env has no CLAUDE_PLUGIN_DATA, so find the data dir the SessionStart hook made for this install: the `coremods-*`
// dir whose `plugin-root` file equals the mod's own root ($.plugin.root, passed as $1). No match means not ready yet.
// shortcut: assumes data dirs live at `~/.claude/plugins/data/coremods-*`; if that layout changes, the deny log and /tool-mgr go quiet.
export const DATA_DIR_SH =
  'ROOT="$1"; d=""; for c in "$HOME"/.claude/plugins/data/coremods-*; do if [ -f "$c/plugin-root" ] && [ "$(cat "$c/plugin-root")" = "$ROOT" ]; then d="$c"; break; fi; done'

// $1 is the plugin root and $2 the log path (argv); the script never interpolates either. Callers pass only safeName parts for $2.
export const APPEND_SCRIPT = `umask 077; ${DATA_DIR_SH}; [ -n "$d" ] || exit 0; f="$d/logs/$2"; mkdir -p -m 700 "$d/logs" "$(dirname "$f")" && cat >> "$f"`
