// Pure rules and formatting for tool-mgr. Nothing here touches `$`.

import { askHit, dangerHit, viewsOf } from './danger'
import type { AskRule, DangerRule } from './danger'
import { nestedScript, parse, reparse } from '../shell/walk'
import type { ShellCommand, ShellParse, ShellRedirect } from '../shell/walk'

export type Rule = DangerRule | 'sed-read' | 'heredoc-write' | 'echo-write' | 'parse-error' | 'too-long'
export type Hit = { rule: Rule; message: string }

const MESSAGES = {
  'sed-read': 'tool-mgr: do not read files with sed. Use the built-in Read tool; pass offset and limit for a line range.',
  'heredoc-write':
    'tool-mgr: do not write files with a heredoc in Bash. Use the built-in Write tool for a new file or Edit to change one.',
  'echo-write':
    'tool-mgr: do not write files with printf or echo in Bash. Use the built-in Write tool for a new file or Edit to change one.',
  'too-long': 'tool-mgr: this command is over 64 KB. Write it to a script file and run that.',
} as const

// Commands longer than this are denied unparsed.
const MAX_PARSE = 64 * 1024

const DEV_OK = /^\/dev\/(?:(?:null|stderr|stdout|tty)|(?:tcp|udp)\/[^/]+\/\d+)$/
const OUTPUT_OPS = new Set(['>', '>>', '>|', '&>', '&>>', '>&', '<>'])

// An output redirect to anything but a harmless device. An fd dup (`>&2`, `>&-`) is not a file, and
// `>&$fd` is unknown, so both pass. A target with an expansion counts as a file.
const writesFile = (r: ShellRedirect) => {
  if (!OUTPUT_OPS.has(r.op)) return false
  if (r.target === null) return r.op !== '>&'
  return !DEV_OK.test(r.target) && !(r.op === '>&' && /^(\d+-?|-)$/.test(r.target))
}
const redirectsToFile = (c: ShellCommand) => c.redirects.some(writesFile)

// `tee` with a file argument (every non-flag argument is checked), not `tee /dev/null`.
const teeFile = (c: ShellCommand) => c.argv[0] === 'tee' && c.argv.slice(1).some(a => a === null || (!a.startsWith('-') && !DEV_OK.test(a)))

const IN_PLACE = /^(--in-place|-[A-Za-z]*i)/
const PERL_IN_PLACE = /^(--in-place|-[plna]*i)/
const hasArg = (c: ShellCommand, re: RegExp) => c.argv.slice(1).some(a => a !== null && re.test(a))

const fedByPipe = (c: ShellCommand) => c.pipeline !== null && c.pipeline.stage > 0

// The commands of the previous pipeline stage. `prev` also holds commands from substitutions, which have no stage.
const prevStage = (c: ShellCommand) => {
  const p = c.pipeline
  return p ? p.prev.filter(e => e.pipeline?.stage === p.stage - 1) : []
}

// How many file operands a sed has: its non-option words, less the script when no -e/-f supplies it. `-` is stdin.
// shortcut: a cluster like `-ne` is read for its first e/f/l only; move to a real option parser if that bites.
function sedFileOperands(c: ShellCommand): number {
  let words = 0
  let scripted = false
  const args = c.argv.slice(1)
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--') {
      words += args.slice(i + 1).length
      break
    }
    if (a === null || a === '-' || !a.startsWith('-')) {
      if (a !== '-') words++
    } else if (a.startsWith('--')) {
      if (/^--(expression|file)\b/.test(a)) scripted = true
      if (/^--(expression|file|line-length)$/.test(a)) i++
    } else {
      const at = a.search(/[efl]/)
      if (at >= 0 && a[at] !== 'l') scripted = true
      if (at === a.length - 1) i++
    }
  }
  return words - (scripted ? 0 : 1)
}

// A sed that edits nothing in place reads a file, unless it is fed by a pipe, or by a here-string or heredoc and has no file operand.
const sedRead = (c: ShellCommand) =>
  c.argv[0] === 'sed' &&
  !fedByPipe(c) &&
  !hasArg(c, IN_PLACE) &&
  !((c.heredocs.length > 0 || c.redirects.some(r => r.op === '<<<')) && sedFileOperands(c) <= 0)

const isEcho = (c: ShellCommand | undefined) => {
  const name = c?.argv[0] === 'builtin' || c?.argv[0] === 'command' ? c.argv[1] : c?.argv[0]
  return name === 'printf' || name === 'echo'
}

// A file write that only printf/echo feed: every command under the redirect (its own, or a group's or loop's around it)
// is printf/echo, or every command of the previous stage of a pipe into `tee <file>` is. A mixed group or pipe passes.
function echoWrite(commands: ShellCommand[]): boolean {
  const under = new Map<ShellRedirect, ShellCommand[]>()
  for (const c of commands) {
    for (const r of c.redirects) {
      if (!writesFile(r)) continue
      const members = under.get(r) ?? []
      members.push(c)
      under.set(r, members)
    }
  }
  if ([...under.values()].some(cs => cs.every(isEcho))) return true
  return commands.some(c => {
    if (!teeFile(c)) return false
    const prev = prevStage(c)
    return prev.length > 0 && prev.every(isEcho)
  })
}

const SCRIPT_INTERP = /^(?:python[\d.]*|node|bun|deno|ruby|perl)$/
const SHELL_INTERP = /^(?:sh|bash|zsh)$/
const WRAPPERS = new Set(['sudo', 'doas', 'env', 'timeout', 'nice', 'nohup', 'exec', 'time', 'command', 'builtin', 'stdbuf', 'setsid', 'xargs', 'uv'])
const baseName = (t: string | null) => (t ?? '').slice((t ?? '').lastIndexOf('/') + 1)
const kindOf = (t: string | null) => (SCRIPT_INTERP.test(baseName(t)) ? 'script' : SHELL_INTERP.test(baseName(t)) ? 'shell' : null)

// What interpreter a command runs as a script reader: its command word, possibly path-qualified or behind wrappers
// (sudo, env, timeout, nice, uv run, ...), and with no script file, only `-`, `/dev/stdin` or `run`. `node tool.js <<EOF` gets the heredoc as data.
// shortcut: after a wrapper the first interpreter-named word is taken, even if it is really an option argument.
function interpreterOf(c: ShellCommand): 'script' | 'shell' | null {
  const i = WRAPPERS.has(baseName(c.argv[0])) ? c.argv.findIndex((t, j) => j > 0 && kindOf(t)) : 0
  const kind = i < 0 ? null : kindOf(c.argv[i])
  const positional = c.argv.slice(i + 1).filter(a => a === null || a === '-' || !a.startsWith('-'))
  return kind && positional.every(a => a === '-' || a === '/dev/stdin' || a === 'run') ? kind : null
}

// The heredoc bodies an interpreter command reads: its own, and those of the command piped into it.
const fedBodies = (c: ShellCommand) => [
  ...c.heredocs,
  ...prevStage(c).flatMap(e => e.heredocs),
].map(h => h.body)

const BODY_WRITES = new RegExp(
  [
    String.raw`\bopen\s*\([^,)]{0,500},\s*(?:mode\s*=\s*)?['"][rwaxbt+]{0,3}[wax][rwaxbt+]{0,3}['"]|\bopen\s*\([^)]{0,500}\bmode\s*=\s*['"][rwaxbt+]{0,3}[wax][rwaxbt+]{0,3}['"]`, // python open(p, 'w'), ruby File.open(p, 'w')
    String.raw`\.open\s*\(\s*(?:mode\s*=\s*)?['"][rwaxbt+]{0,3}[wax][rwaxbt+]{0,3}['"]`, // python Path(p).open('w')
    String.raw`\bopen\b\s*\(?[^,)\n]{0,500},\s*['"]\+?>`, // perl open(my $fh, '>', f), open(FH, ">f")
    String.raw`\.write_text\(|\.write_bytes\(`,
    String.raw`\bshutil\.(?:copy\w*|move)\(|\bos\.replace\(|\bfileinput\.(?:input|FileInput)\([^)]{0,500}inplace\s*=\s*True`,
    String.raw`\b(?:fs\.(?:promises\.)?|os\.|File\.|Path\([^)]{0,500}\)\.)rename(?:Sync)?\(`,
    String.raw`\b(?:writeFile|appendFile|copyFile)(?:Sync)?\(|\bcreateWriteStream\(`, // node fs, fs.promises
    String.raw`\bBun\.write\(|\bDeno\.write(?:Text)?File(?:Sync)?\(`,
    String.raw`\b(?:File|IO)\.(?:bin)?write\b`,
  ].join('|'),
)

// A command in a script that a shell reads from a heredoc: a redirect to a file, tee to a file, or an in-place sed/perl edit writes files.
const shellBodyWrites = (c: ShellCommand) =>
  redirectsToFile(c) || teeFile(c) || (c.argv[0] === 'sed' && hasArg(c, IN_PLACE)) || (c.argv[0] === 'perl' && hasArg(c, PERL_IN_PLACE))

const hasHeredoc = (c: ShellCommand) => c.heredocs.length > 0

// A command with a heredoc (not <<<), or one piped from a heredoc, that redirects to a real file or runs tee <file>, or an interpreter that reads
// a heredoc body (its own, or the one piped into it) that writes files. Each heredoc is judged by its own command and body.
// `bodyCommands` are the commands of every heredoc script a shell reads. Skipped on purpose: `python -c` and `node -e` with no heredoc.
function heredocWrite(commands: ShellCommand[], bodyCommands: ShellCommand[]): boolean {
  // Whether a heredoc sits upstream of each pipeline stage, built in one pass: commands come in emission order, so a stage's
  // previous stage is already in the map.
  const up = new Map<object, boolean>()
  for (const c of commands) {
    const p = c.pipeline
    if (p && !up.has(p)) up.set(p, p.prev.some(e => e.pipeline !== null && (hasHeredoc(e) || up.get(e.pipeline) === true)))
  }
  return (
    commands.some(c => {
      if ((redirectsToFile(c) || teeFile(c)) && (hasHeredoc(c) || (c.pipeline !== null && up.get(c.pipeline) === true))) return true
      return interpreterOf(c) === 'script' && fedBodies(c).some(b => BODY_WRITES.test(b))
    }) || bodyCommands.some(shellBodyWrites)
  )
}

type Scan = { commands: ShellCommand[]; bodyCommands: ShellCommand[]; errors: ShellParse['errors'] }

// Parses a command and the scripts it hands to a shell: `sh -c STR` and `eval` bodies (also behind wrappers) join `commands` (they are
// checked like top-level commands), and heredoc bodies read by a shell join `bodyCommands` (checked for writes only).
function scan(command: string): Scan {
  const out: Scan = { commands: [], bodyCommands: [], errors: [] }
  const add = (r: ShellParse, sink: ShellCommand[]) => {
    out.errors.push(...r.errors)
    for (const c of r.commands) {
      sink.push(c)
      // A script handed to a shell behind a wrapper (`timeout 5 sh -c STR`) or `find -exec` is checked too.
      for (const v of viewsOf(c.argv)) {
        const script = nestedScript(v)
        if (script !== null) add(reparse(script, c.depth + 1), sink)
      }
    }
  }
  add(parse(command), out.commands)
  for (const c of out.commands) {
    if (interpreterOf(c) !== 'shell') continue
    for (const body of fedBodies(c)) add(reparse(body, c.depth + 1), out.bodyCommands)
  }
  return out
}

export function classify(command: string): Hit | null {
  if (command.length > MAX_PARSE) return { rule: 'too-long', message: MESSAGES['too-long'] }
  const { commands, bodyCommands, errors } = scan(command)
  if (errors.length > 0) {
    // Deep inputs cascade into hundreds of errors; the first one names the cause.
    return { rule: 'parse-error', message: `tool-mgr: could not parse this command (${errors[0].message}). Rewrite it in plain bash, or write a script file and run it.` }
  }
  const danger = dangerHit([...commands, ...bodyCommands])
  if (danger) return danger
  const rule = commands.some(sedRead) ? 'sed-read' : heredocWrite(commands, bodyCommands) ? 'heredoc-write' : echoWrite(commands) ? 'echo-write' : null
  return rule && { rule, message: MESSAGES[rule] }
}

export type AskHit = { rule: AskRule; message: string }

// The ask-tier rules (remote-exec, git-rewrite) for a command. A command classify() denies never reaches them, so a parse error has no ask.
export function askRule(command: string): AskHit | null {
  if (command.length > MAX_PARSE) return null
  const { commands, bodyCommands, errors } = scan(command)
  return errors.length > 0 ? null : askHit([...commands, ...bodyCommands])
}

// What the ask-tier rules answer. Set this to 'deny' if `ask` does not prompt in a session; the deny then hands the command to the person.
export const ASK_TIER: 'ask' | 'deny' = 'ask'

export type Verdict = { allow?: true; ask?: string; deny?: string; [key: string]: unknown }

const ownVerdict = (hit: AskHit): Verdict =>
  ASK_TIER === 'ask' ? { ask: hit.message } : { deny: `${hit.message} Hand this command to the user to run.` }

// The stricter of a lower hook's verdict and our own: deny beats ask, and ask beats allow or no answer.
function stricter(inner: Verdict, own: Verdict): Verdict {
  if (inner.deny !== undefined || (inner.ask !== undefined && own.deny === undefined)) return inner
  const { allow: _allow, ask: _ask, ...rest } = inner
  return { ...rest, ...own }
}

// The classic.PreToolUse body for Bash: the hooks below run first, then the ask-tier rules add theirs. A deny from below
// always wins, so readonly-bash and cloud-ops-guard keep their say. A throw in our rules leaves the verdict from below
// alone and goes to `onError`.
export async function withAsk(command: string, next: () => Promise<Verdict | undefined>, onError: (err: unknown) => void): Promise<Verdict> {
  const inner = (await next()) ?? {}
  try {
    const hit = askRule(command)
    return hit ? stricter(inner, ownVerdict(hit)) : inner
  } catch (err) {
    onError(err)
    return inner
  }
}

// The log keeps at most this many characters of a command.
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
