#!/usr/bin/env -S bun --no-env-file --config=/dev/null
// PreToolUse hook on Bash: guard OpenTofu, Terraform, Terragrunt, and AWS CLI calls.
//
// Allow comes only from a strict allowlist: the whole command must be one of a few exact
// read-only or saved-plan forms, spelled in characters a shell treats as plain text.
// Everything else goes to a best-effort check on the shell AST walker that denies unsafe
// applies, destroys, imports, and state surgery, asks when it cannot tell, and otherwise
// prints nothing so the normal permission flow decides.
//
// Any exception or malformed input prints `ask` and exits 0, because Claude Code runs the
// tool call on any other exit code. Reasons are static: the command and environment are
// never printed. This is a guardrail, not a sandbox: encoded payloads, script files, and
// wrappers it does not know can evade the deny check.

import { closeSync, openSync, readFileSync, readSync, writeSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { nestedScript, parse, reparse } from './shell/walk.ts'
import type { ShellCommand, ShellHeredoc } from './shell/walk.ts'

const TOKEN_LINE = 'ALLOW: cloud-ops'
const TF: ReadonlySet<string> = new Set(['tofu', 'terraform', 'terragrunt'])
const TOOLS: ReadonlySet<string> = new Set([...TF, 'aws'])
const TOOL_RE = /(?<![\w.-])(?:tofu|terraform|terragrunt|aws)(?![\w-])/

type Kind = 'safe' | 'gate' | 'ask' | 'deny' | 'neutral'
type Finding = readonly [Kind, string | null]
type Decision = readonly ['allow' | 'ask' | 'deny', string]

// Allowlist. Every character must be plain text to a shell, and words are split on single spaces.
const PLAIN = /^[A-Za-z0-9_./=:@,+-]+(?: [A-Za-z0-9_./=:@,+-]+)*$/
const FLAG = /^--?([a-z][a-z0-9-]*)(?:=(.*))?$/
const NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/
const ENV_NAME = /^[a-z0-9][a-z0-9_-]*$/
const PLANFILE = /^(?!-)[\w./-]*(?<![\w-])tfplan$/ // tfplan or <name>.tfplan, as infra:terraform saves
const AWS_WORD = /^[a-z0-9-]+$/
const NEVER_FLAGS: ReadonlySet<string> = new Set(['migrate-state', 'force-copy', 'from-module', 'generate-config-out', 'show-sensitive'])
// Allowlisted subcommands, with the fewest and most plain names each takes after its flags.
// apply and output are left out: apply changes infrastructure and output prints secrets, so
// both go through the normal permission prompt.
const FORMS = new Map<string, readonly [number, number]>([
  ['plan', [0, 0]], ['validate', [0, 0]], ['fmt', [0, 0]], ['init', [0, 0]], ['version', [0, 0]],
  ['-version', [0, 0]], ['--version', [0, 0]], ['state list', [0, 64]], ['state show', [1, 1]],
])

// Deny check.
const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/
const SUBST = /\$\(|`/
const ENV_SPLIT = /^(?:-[^-]*S|--s)/
const SHELLS: ReadonlySet<string> = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'eval', 'xargs', 'source', '.', 'su', 'ssh',
  'python', 'python3', 'perl', 'ruby', 'node'])
// Prefixes that run the rest of the words as a command, with their options that take a
// separate value. Claude Code strips time, timeout, nice, nohup, stdbuf, command, builtin,
// and noglob before matching allow rules, so the guard must see through each of them.
const WRAPPERS = new Map<string, ReadonlySet<string>>([
  ['time', new Set(['-o', '-f', '--output', '--format'])],
  ['timeout', new Set(['-k', '-s', '--kill-after', '--signal'])],
  ['nice', new Set(['-n', '--adjustment'])],
  ['stdbuf', new Set(['-i', '-o', '-e', '--input', '--output', '--error'])],
  ['exec', new Set(['-a'])],
  ['env', new Set(['-u', '--unset', '-C', '--chdir'])],
  ['sudo', new Set(['-u', '-g', '-h', '-p', '-U', '-C', '-D', '-R', '-T', '-r', '-t'])],
  ...['nohup', 'command', 'builtin', 'noglob'].map((w): [string, ReadonlySet<string>] => [w, new Set()]),
])
const QUIET_SUBS: ReadonlySet<string> = new Set(['validate', 'fmt', 'init', 'output', 'version', '-version', '--version', '-v',
  'help', '-help', '--help', '-h'])
const ASK_SUBS: ReadonlySet<string> = new Set(['show', 'refresh', 'taint', 'untaint', 'console', 'force-unlock', 'workspace',
  'providers', 'graph', 'get', 'login', 'logout', 'test', 'metadata', 'push', 'modules'])
const SUBCMDS: ReadonlySet<string> = new Set([...QUIET_SUBS, ...ASK_SUBS, 'apply', 'destroy', 'import', 'state', 'plan'])
const VALUE_FLAGS: ReadonlySet<string> = new Set(['var', 'var-file', 'target', 'target-file', 'exclude', 'exclude-file', 'replace',
  'lock-timeout', 'parallelism', 'state', 'state-out', 'backup'])
const MAX_LINE = 1 << 20 // bytes read per transcript line
const LINE_BREAK = /\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/ // ASCII and Unicode line boundaries

const ALLOW_REASON = 'Read-only infrastructure command.'
const APPLY_REASON = 'Save a plan with -out=tfplan, review it, then run apply tfplan without -auto-approve or -destroy.'
const SUBAGENT_REASON = `Subagents may not run credentialed aws, plan, or apply. Have the main session run it, or put the line '${TOKEN_LINE}' in the brief.`
const BRIEF_REASON = `Cannot read the subagent brief to check for ${TOKEN_LINE}.`
const PARSE_REASON = 'Cannot parse this command that mentions a guarded tool.'
const DYNAMIC_REASON = 'A variable or substitution as the subcommand or state verb may hide destroy or state rm; write it literally.'

class ParseFailure extends Error {}

const basename = (p: string): string => p.slice(p.lastIndexOf('/') + 1)

// The command without quotes, backslashes, or line continuations, for finding tool names.
const plainText = (cmd: string): string => cmd.replace(/\\\n|[\\'"]/g, '')

function flagOk(tok: string): boolean {
  const m = FLAG.exec(tok)
  if (!m || NEVER_FLAGS.has(m[1])) return false
  return m[1] !== 'out' || (!!m[2] && PLANFILE.test(m[2]))
}

// safe or gate when args are an allowlisted subcommand form, else null.
function tfForm(args: readonly string[]): Kind | null {
  if (!args.length) return null
  let sub = args[0]
  let rest = args.slice(1)
  if (sub === 'state' && (rest[0] === 'list' || rest[0] === 'show')) {
    sub = `state ${rest[0]}`
    rest = rest.slice(1)
  }
  let n = 0
  while (n < rest.length && rest[n].startsWith('-')) n++
  const flags = rest.slice(0, n)
  const names = rest.slice(n)
  const [lo, hi] = FORMS.get(sub) ?? [1, 0]
  if (!(lo <= names.length && names.length <= hi && flags.every(flagOk) && names.every(w => NAME.test(w)))) return null
  return sub === 'plan' ? 'gate' : 'safe'
}

// True for aws --version and aws [<service> [<operation>]] help, which call no API.
const awsHelp = (args: readonly string[]): boolean =>
  (args.length === 1 && args[0] === '--version') ||
  (args.length >= 1 && args.length <= 3 && args.at(-1) === 'help' && args.slice(0, -1).every(w => AWS_WORD.test(w)))

// safe or gate when the whole command is an allowlisted form, else null.
function allowlisted(cmd: string): Kind | null {
  if (!PLAIN.test(cmd) || cmd.includes(':::')) return null // mise runs the task after ::: as well
  let w = cmd.split(' ')
  if (w[0] === 'aws') return awsHelp(w.slice(1)) ? 'safe' : null
  if (w[0] === 'mise' && w[1] === 'run' && w[2] === 'tofu') {
    // The task's first argument is the environment, which it interpolates into a shell string.
    return w.length > 4 && ENV_NAME.test(w[3]) ? tfForm(w.slice(4)) : null
  }
  if (w[0] === 'mise' && w[1] === 'exec' && w[2] === '--') w = w.slice(3)
  if (!w.length || (w[0] !== 'tofu' && w[0] !== 'terraform')) return null
  let args = w.slice(1)
  if (args[0]?.startsWith('-chdir=')) args = args.slice(1)
  return tfForm(args)
}

// The index of the first word that is not a prefix running the rest as a command, words.length
// when none remains, or null when an option hides the command, as env -S and mise exec -c do.
function stripWrappers(words: readonly string[]): number | null {
  let i = 0
  while (i < words.length) {
    const w = basename(words[i])
    const wrapper = WRAPPERS.get(w)
    if (ASSIGN.test(words[i])) i++
    else if (w === 'command' && (words[i + 1] === '-v' || words[i + 1] === '-V')) return words.length // a lookup, not a run
    else if (w === 'mise') {
      const rest = words.slice(i + 1)
      if (rest.some(a => a === '-c' || a === '--command' || a.startsWith('--command='))) return null
      const j = rest.findIndex(a => TOOLS.has(a))
      return j < 0 ? i : i + 1 + j
    } else if (wrapper) {
      i++
      while (i < words.length && words[i].startsWith('-')) {
        if (w === 'env' && ENV_SPLIT.test(words[i])) return null
        i += wrapper.has(words[i]) ? 2 : 1
      }
      if (w === 'timeout') i++ // the duration
    } else break
  }
  return Math.min(i, words.length)
}

// True when apply's arguments are flags and one trailing literal plan file.
function savedPlan(rest: readonly string[]): boolean {
  const pos: string[] = []
  let skip = false
  for (const a of rest) {
    if (skip) skip = false
    else if (a.startsWith('-') && a !== '-') {
      const name = a.replace(/^-+/, '').split('=')[0]
      if (name === 'auto-approve' || name === 'destroy') return false
      skip = !a.includes('=') && VALUE_FLAGS.has(name)
    } else pos.push(a)
  }
  return pos.length === 1 && pos[0] === rest.at(-1) && PLANFILE.test(pos[0])
}

// True for a non-flag word whose value is only known at run time.
const dynamic = (word: string): boolean => !word.startsWith('-') && (word.includes('$') || word.includes('`'))

function tfSub(sub: string, rest: readonly string[]): Finding {
  if (sub === 'apply') return savedPlan(rest) ? ['gate', SUBAGENT_REASON] : ['deny', APPLY_REASON]
  if (sub === 'destroy') return ['deny', 'Run plan -destroy -out=tfplan, review it, then apply that file.']
  if (sub === 'import') return ['deny', 'Add an import block and apply it through a saved plan.']
  if (sub === 'state') {
    const verb = rest.find(a => !a.startsWith('-')) ?? ''
    if (dynamic(verb)) return ['deny', DYNAMIC_REASON]
    if (verb === 'list' || verb === 'show') return ['neutral', null]
    if (['rm', 'mv', 'push', 'replace-provider'].includes(verb)) {
      return ['deny', 'Use moved/removed blocks and a saved plan; manual state surgery needs the user.']
    }
    return ['ask', 'Cannot classify this state command.']
  }
  if (sub === 'plan') return ['gate', SUBAGENT_REASON]
  if (QUIET_SUBS.has(sub)) return ['neutral', null]
  return ['ask', 'Cannot classify this infrastructure subcommand.']
}

// Findings for the arguments of tofu, terraform, or terragrunt.
function classifyTf(args: readonly string[]): Finding[] {
  // Every word that names a subcommand counts, so a flag value cannot hide the real one.
  // The word after state is its verb (state show), which tfSub reads from there.
  const found: Finding[] = []
  for (const [i, a] of args.entries()) {
    if (SUBCMDS.has(a) && args[i - 1] !== 'state') found.push(tfSub(a, args.slice(i + 1)))
  }
  if (!found.length) {
    // With no literal subcommand, a variable word may be destroy.
    found.push(args.some(dynamic) ? ['deny', DYNAMIC_REASON] : ['ask', 'Cannot classify this infrastructure command.'])
  }
  if (args.some(a => a.startsWith('-') && NEVER_FLAGS.has(a.replace(/^-+/, '').split('=')[0]))) {
    found.push(['ask', 'This flag migrates state, writes generated files, or prints secrets.'])
  }
  if (args.some(a => TOOLS.has(a))) found.push(['ask', 'A second guarded tool in one command cannot be checked.'])
  return found
}

// A command's words split at the `:::` that chains mise tasks, as parallel argv and text.
function splitTasks(c: ShellCommand): [(string | null)[], string[]][] {
  // unbash reads a leading `time` as the keyword and leaves its options as the command words.
  const timed = c.text[0]?.startsWith('-')
  const argv = timed ? ['time', ...c.argv] : c.argv
  const text = timed ? ['time', ...c.text] : c.text
  const out: [(string | null)[], string[]][] = []
  let from = 0
  for (let i = 0; i <= text.length; i++) {
    if (i < text.length && text[i] !== ':::') continue
    if (i > from) out.push([argv.slice(from, i), text.slice(from, i)])
    from = i + 1
  }
  return out
}

// Findings for the script text of sh -c or eval, parsed one level deeper.
function nestedFindings(script: string, depth: number): Finding[] {
  const r = reparse(script, depth)
  if (r.errors.length) throw new ParseFailure(r.errors[0].message)
  return r.commands.flatMap(c => commandFindings(c, script))
}

// Findings for one task: a word list in which expansions stay as written (`text`) and `argv` keeps
// the literal value, or null, for nestedScript.
function classify(argv: readonly (string | null)[], words: readonly string[], depth: number): Finding[] {
  const k = stripWrappers(words)
  if (k === null) return [['ask', 'A wrapper option such as env -S or mise exec -c hides the command.']]
  if (k >= words.length) return []
  const cmd = basename(words[k])
  const args = words.slice(k + 1)
  if (/[$`]/.test(words[k])) return [['ask', 'A variable or substitution names the command.']]
  if (SHELLS.has(cmd)) {
    const script = nestedScript(argv.slice(k))
    const out = script === null ? [] : nestedFindings(script, depth + 1)
    if (args.some(a => TOOL_RE.test(a) || a.includes('$'))) {
      out.push(['ask', 'A shell, eval, or xargs wraps a guarded tool and cannot be checked.'])
    }
    return out
  }
  if (TF.has(cmd)) return classifyTf(args)
  if (cmd === 'aws') return awsHelp(args) ? [] : [['gate', SUBAGENT_REASON]]
  // A guarded tool after a command the guard does not know may be a wrapped call.
  const i = args.findIndex(a => TF.has(basename(a)))
  if (i >= 0 && classifyTf(args.slice(i + 1)).some(([kind]) => kind === 'deny')) {
    return [['ask', 'An unrecognized command wraps a guarded tool.']]
  }
  return []
}

// A heredoc body that is read as commands rather than data: one whose delimiter never comes (it
// runs to the end of the script), or an unquoted one that holds a substitution. The guard parses
// such a body whole, so a tool call beside the substitution is seen too.
const runs = (script: string, h: ShellHeredoc): boolean =>
  (h.body !== '' && script.endsWith(h.body)) || (!h.quoted && SUBST.test(h.body))

function commandFindings(c: ShellCommand, script: string): Finding[] {
  const out = splitTasks(c).flatMap(([argv, words]) => classify(argv, words, c.depth))
  for (const h of c.heredocs) if (runs(script, h)) out.push(...nestedFindings(h.body, c.depth + 1))
  return out
}

// True if the subagent's brief, its first user message that is neither meta nor a tool
// result, has a whole line 'ALLOW: cloud-ops'. False if not. Null if it cannot be read.
function briefAllows(d: Record<string, unknown>): boolean | null {
  const { session_id: sid, agent_id: aid, transcript_path: tp } = d
  if (![sid, aid, tp].every(x => typeof x === 'string' && x)) return null
  if (!/^[\w-]+$/.test(sid as string) || !/^[\w-]+$/.test(aid as string)) return null
  const path = join(dirname(tp as string), sid as string, 'subagents', `agent-${aid}.jsonl`)
  let fd: number | null = null
  try {
    fd = openSync(path, 'r')
    const chunk = Buffer.alloc(1 << 16)
    let buf = Buffer.alloc(0)
    let eof = false
    for (let n = 0; n < 20; n++) {
      let nl = buf.indexOf(10)
      while (nl < 0 && !eof && buf.length <= MAX_LINE) {
        const got = readSync(fd, chunk, 0, chunk.length, null)
        if (got === 0) eof = true
        else buf = Buffer.concat([buf, chunk.subarray(0, got)])
        nl = buf.indexOf(10)
      }
      const end = nl < 0 ? buf.length : nl + 1
      if (!end || end > MAX_LINE) return null
      const line = buf.subarray(0, end).toString('utf8')
      buf = buf.subarray(end)
      const msg = JSON.parse(line) as Record<string, unknown> | null
      if (typeof msg !== 'object' || msg === null || Array.isArray(msg) || msg.type !== 'user' || msg.isMeta) continue
      const message = msg.message
      let content: unknown = typeof message === 'object' && message !== null ? (message as Record<string, unknown>).content : null
      if (Array.isArray(content)) {
        const blocks = content.filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null && !Array.isArray(b))
        if (blocks.some(b => b.type === 'tool_result')) return null // the conversation moved on with no plain brief
        content = blocks.map(b => String(b.text ?? '')).join('\n')
      }
      return typeof content === 'string' && content.split(LINE_BREAK).some(ln => ln.trim() === TOKEN_LINE)
    }
    return null
  } catch (e) {
    // An unreadable file or a line that is not JSON leaves the brief unknown, which asks.
    if (e instanceof SyntaxError || typeof (e as NodeJS.ErrnoException)?.code === 'string') return null
    throw e
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

// The script without its data heredoc bodies, so a tool named only in data is not a mention.
// Each body is cut once, so a real command that repeats a body's text still counts.
const withoutData = (script: string, data: readonly string[]): string =>
  data.reduce((s, body) => {
    const i = s.indexOf(body)
    return i < 0 ? s : s.slice(0, i) + s.slice(i + body.length)
  }, script)

// Best-effort deny or ask for a command outside the allowlist. Null means no opinion.
function check(cmd: string, d: Record<string, unknown>): Decision | null {
  const parsed = parse(cmd)
  if (parsed.errors.length) return ['ask', PARSE_REASON]
  const commands = parsed.commands
  // Commands under one compound share its heredoc objects.
  const data = [...new Set(commands.flatMap(c => c.heredocs))].filter(h => !runs(cmd, h)).map(h => h.body)
  const asks: string[] = []
  if (data.some(b => TOOL_RE.test(b)) && commands.some(c => c.text.some(w => SHELLS.has(basename(w))))) {
    asks.push('A heredoc that mentions a guarded tool feeds a shell.')
  }
  let results: Finding[] = []
  if (TOOL_RE.test(plainText(withoutData(cmd, data)))) {
    try {
      results = commands.flatMap(c => commandFindings(c, cmd))
    } catch (e) {
      if (e instanceof ParseFailure) return ['ask', PARSE_REASON]
      throw e
    }
    if (commands.some(c => c.redirects.some(r => r.op === '>|'))) asks.push('A redirect or operator next to a guarded tool cannot be checked.')
    if (commands.some(c => c.nesting > 0)) asks.push('Command substitution around a guarded tool cannot be checked.')
  }
  const denies = results.flatMap(([kind, reason]) => (kind === 'deny' ? [reason!] : []))
  if (denies.length) return ['deny', [...new Set(denies)].join(' ')]
  asks.push(...results.flatMap(([kind, reason]) => (kind === 'ask' ? [reason!] : [])))
  if (d.agent_id && results.some(([kind]) => kind === 'gate')) {
    const ok = briefAllows(d)
    if (ok === false) return ['deny', SUBAGENT_REASON]
    if (ok === null) asks.push(BRIEF_REASON)
  }
  return asks.length ? ['ask', [...new Set(asks)].join(' ')] : null
}

export function decide(d: unknown): Decision | null {
  if (typeof d !== 'object' || d === null || Array.isArray(d)) throw new TypeError('input is not an object')
  const input = d as Record<string, unknown>
  if (input.tool_name !== 'Bash') return null
  const cmd = (input.tool_input as { command?: unknown }).command
  if (typeof cmd !== 'string') return ['ask', 'Command is not a string.']
  if (!TOOL_RE.test(plainText(cmd))) return null
  const kind = allowlisted(cmd)
  if (kind === 'safe' || (kind === 'gate' && !input.agent_id)) return ['allow', ALLOW_REASON]
  if (kind === 'gate') {
    const ok = briefAllows(input)
    if (ok === null) return ['ask', BRIEF_REASON]
    return ok ? ['allow', ALLOW_REASON] : ['deny', SUBAGENT_REASON]
  }
  return check(cmd, input)
}

function main(): void {
  let out: Decision | null
  try {
    out = decide(JSON.parse(readFileSync(0, 'utf8')))
  } catch {
    out = ['ask', 'cloud-ops-guard failed to check this command.'] // fail toward ask, never let the call run unchecked
  }
  if (out) {
    const [permissionDecision, permissionDecisionReason] = out
    writeSync(1, `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason } })}\n`)
  }
}

if (import.meta.main) main()
