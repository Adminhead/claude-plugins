// Pure rules and formatting for tool-mgr. Nothing here touches `$`.

export type Rule = 'sed-read' | 'heredoc-write' | 'echo-write'
export type Hit = { rule: Rule; message: string }

const MESSAGES: Record<Rule, string> = {
  'sed-read':
    'tool-mgr: do not read files with sed. Use the built-in Read tool; pass offset and limit for a line range.',
  'heredoc-write':
    'tool-mgr: do not write files with a heredoc in Bash. Use the built-in Write tool for a new file or Edit to change one.',
  'echo-write':
    'tool-mgr: do not write files with printf or echo in Bash. Use the built-in Write tool for a new file or Edit to change one.',
}

// Source of the heredoc pattern; group 3 is the body. Built per use so a global flag never carries lastIndex.
const HEREDOC = String.raw`(?<!<)<<(?!<)-?\s*(['"]?)(\w+)\1[^\n]*\n([\s\S]*?)\n[ \t]*\2(?=\n|$)`
const HEREDOC_OPEN = /(?<!<)<<(?!<)/

// A heredoc body is data, not commands: drop it so its lines are not read as shell.
// shortcut: the terminator must sit alone on its line and quoting is not parsed, so odd shell can slip by or false-hit. Fail-open is the intended direction.
function stripHeredocBodies(command: string): string {
  return command.replace(new RegExp(HEREDOC, 'g'), m => m.slice(0, m.indexOf('\n')))
}

// The shell-level text: heredoc bodies dropped and quoted spans emptied, so `>`, `;` or `|` inside quotes is not read as shell. `>|` becomes `>`.
// shortcut: no nesting ($(...) inside quotes, escaped quotes in '...'); move to a real shell tokenizer if that bites.
const shellText = (command: string) => stripHeredocBodies(command).replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, "''").replace(/>\|/g, '>')

const SEGMENT_SPLIT = /(\|\||&&|\||;|\n)/
const IN_PLACE = /(^|\s)(--in-place\S*|-[A-Za-z]*i\S*)(\s|$)/

// A pipeline segment that starts with sed, edits nothing in place, and is not fed by a pipe reads a file.
function sedRead(command: string): boolean {
  const parts = shellText(command).split(SEGMENT_SPLIT)
  for (let i = 0; i < parts.length; i += 2) {
    const seg = parts[i].trim()
    const fedByPipe = i > 0 && parts[i - 1] === '|'
    if (/^sed(\s|$)/.test(seg) && !fedByPipe && !IN_PLACE.test(seg)) return true
  }
  return false
}

const DEV_OK = /^\/dev\/(null|stderr|stdout|tty)$/

// `$((...))`, `((...))` and `[[...]]` use `>` as an operator, not a redirect.
const OPERATOR_SPANS = /\$?\(\((?:[^)]|\)(?!\)))*\)\)|\[\[[^\]]*\]\]/g

// An output redirect (`>`, `>>`, `N>`, `&>`) to anything but a harmless device. fd dups like `>&2` are skipped.
function redirectsToFile(text: string): boolean {
  for (const m of text.replace(OPERATOR_SPANS, '').matchAll(/\d*>>?(?![>&])\s*([^\s;&|<>]+)/g)) if (!DEV_OK.test(m[1])) return true
  return false
}

// A `tee` segment with a file argument (every non-flag argument is checked), not `tee /dev/null`.
const teeTargetsFile = (seg: string) => /^tee(\s|$)/.test(seg) && seg.split(/\s+/).slice(1).some(a => !a.startsWith('-') && !DEV_OK.test(a))

const teeFile = (text: string) => text.split(SEGMENT_SPLIT).some(seg => teeTargetsFile(seg.trim()))

const ECHO_CMD = /^[({\s]*(?:(?:then|do|else)\s+)?(?:(?:builtin|command)\s+)?(?:printf|echo)(?:\s|$)/

// A printf/echo segment with an output redirect to a file, or piped into `tee <file>`.
function echoWrite(command: string): boolean {
  const parts = shellText(command).split(SEGMENT_SPLIT)
  for (let i = 0; i < parts.length; i += 2) {
    const seg = parts[i].trim()
    if (ECHO_CMD.test(seg) && redirectsToFile(seg)) return true
    const fedByEcho = i > 1 && parts[i - 1] === '|' && ECHO_CMD.test(parts[i - 2].trim())
    if (fedByEcho && teeTargetsFile(seg)) return true
  }
  return false
}

const SCRIPT_INTERP = /^(?:python[\d.]*|node|bun|deno|ruby|perl)$/
const SHELL_INTERP = /^(?:sh|bash|zsh)$/
const WRAPPERS = new Set(['sudo', 'env', 'timeout', 'nice', 'nohup', 'exec', 'time', 'command', 'uv'])
const LEADING_WORDS = new Set(['then', 'do', 'else', '!', '{'])
const baseName = (t: string) => t.slice(t.lastIndexOf('/') + 1)

// What interpreter a pipeline segment runs as a script reader: its command word, possibly path-qualified or behind wrappers
// (sudo, env, timeout, nice, uv run, ...), and with no script file, only `-`, `/dev/stdin` or `run`. `node tool.js <<EOF` gets the heredoc as data.
// shortcut: after a wrapper the first interpreter-named word is taken, even if it is really an option argument.
function interpreterOf(seg: string): 'script' | 'shell' | null {
  const toks = seg.trim().split(/\s+/)
  let i = 0
  while (i < toks.length && (/^\w+=/.test(toks[i]) || LEADING_WORDS.has(toks[i]))) i++
  if (WRAPPERS.has(baseName(toks[i] ?? ''))) i = toks.findIndex((t, j) => j > i && (SCRIPT_INTERP.test(baseName(t)) || SHELL_INTERP.test(baseName(t))))
  if (i < 0 || i >= toks.length) return null
  const word = baseName(toks[i])
  const kind = SCRIPT_INTERP.test(word) ? 'script' : SHELL_INTERP.test(word) ? 'shell' : null
  const positional = toks.slice(i + 1).filter(a => a !== '' && (a === '-' || !/^-|^\d*[<>&]/.test(a)))
  return kind && positional.every(a => a === '-' || a === '/dev/stdin' || a === 'run') ? kind : null
}

// The interpreters that consume the heredoc whose `<<` sits at `at` in `line`: the segment holding it, and the next segment when a pipe follows.
function consumers(line: string, at: number): ('script' | 'shell')[] {
  const parts = line.split(/(\|\||&&|\||;|\(|`)/)
  const found: ('script' | 'shell' | null)[] = []
  let pos = 0
  for (let i = 0; i < parts.length; i += 2) {
    const end = pos + parts[i].length
    if (at >= pos && at < end) {
      found.push(interpreterOf(parts[i].slice(0, at - pos)))
      if (parts[i + 1] === '|' && i + 2 < parts.length) found.push(interpreterOf(parts[i + 2]))
      break
    }
    pos = end + (parts[i + 1]?.length ?? 0)
  }
  return found.filter(k => k !== null)
}

const BODY_WRITES = new RegExp(
  [
    String.raw`\bopen\s*\([^,)]*,\s*(?:mode\s*=\s*)?['"][rwaxbt+]*[wax][rwaxbt+]*['"]|\bopen\s*\([^)]*\bmode\s*=\s*['"][rwaxbt+]*[wax][rwaxbt+]*['"]`, // python open(p, 'w'), ruby File.open(p, 'w')
    String.raw`\.open\s*\(\s*(?:mode\s*=\s*)?['"][rwaxbt+]*[wax][rwaxbt+]*['"]`, // python Path(p).open('w')
    String.raw`\bopen\b\s*\(?[^,)\n]*,\s*['"]\+?>`, // perl open(my $fh, '>', f), open(FH, ">f")
    String.raw`\.write_text\(|\.write_bytes\(`,
    String.raw`\bshutil\.(?:copy\w*|move)\(|\bos\.replace\(|\bfileinput\.(?:input|FileInput)\([^)]*inplace\s*=\s*True`,
    String.raw`\b(?:fs\.(?:promises\.)?|os\.|File\.|Path\([^)]*\)\.)rename(?:Sync)?\(`,
    String.raw`\b(?:writeFile|appendFile|copyFile)(?:Sync)?\(|\bcreateWriteStream\(`, // node fs, fs.promises
    String.raw`\bBun\.write\(|\bDeno\.write(?:Text)?File(?:Sync)?\(`,
    String.raw`\b(?:File|IO)\.(?:bin)?write\b`,
  ].join('|'),
)
const PERL_IN_PLACE = /(^|\s)(--in-place\S*|-[plna]*i\S*)(\s|$)/

// A shell fed a heredoc runs its body: a redirect to a file, tee to a file, or an in-place sed/perl edit writes files.
function shellBodyWrites(body: string): boolean {
  const text = shellText(body)
  if (redirectsToFile(text) || teeFile(text)) return true
  return text.split(SEGMENT_SPLIT).some(s => (/^sed\s/.test(s.trim()) && IN_PLACE.test(s)) || (/^perl\s/.test(s.trim()) && PERL_IN_PLACE.test(s)))
}

// Heredoc (not <<<) together with a redirect to a real file, tee to a file, or a body that writes files and is read by an interpreter
// (the heredoc's own command, or the command it is piped to). Each heredoc is judged by its own body.
// Skipped on purpose: `python -c` and `node -e` with no heredoc.
function heredocWrite(command: string): boolean {
  const header = shellText(command)
  if (!HEREDOC_OPEN.test(header)) return false
  if (redirectsToFile(header) || teeFile(header)) return true
  for (const m of command.matchAll(new RegExp(HEREDOC, 'g'))) {
    const lineStart = command.lastIndexOf('\n', m.index) + 1
    const line = command.slice(lineStart, m.index + m[0].indexOf('\n'))
    for (const kind of consumers(line, m.index - lineStart)) {
      if (kind === 'script' ? BODY_WRITES.test(m[3]) : shellBodyWrites(m[3])) return true
    }
  }
  return false
}

export function classify(command: string): Hit | null {
  const rule: Rule | null = sedRead(command) ? 'sed-read' : heredocWrite(command) ? 'heredoc-write' : echoWrite(command) ? 'echo-write' : null
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
