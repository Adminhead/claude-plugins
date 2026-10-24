#!/usr/bin/env -S bun --no-env-file --config=/dev/null
// PreToolUse hook on Bash: guard OpenTofu, Terraform, Terragrunt, and AWS CLI calls, and the
// kubectl, helm, talosctl and omnictl calls that change a production cluster.
//
// Allow comes only from a strict allowlist, and only when the user turns on the
// autoAllowReadOnly option: the whole command must be one of a few exact read-only forms,
// spelled in characters a shell treats as plain text. plan and init run code from the repo
// (providers, modules, mise tasks), so by default the guard has no opinion on them and the
// user's own permission rules decide. A subagent still needs the brief token for them.
// Everything else goes to a best-effort check on the shell AST walker that denies unsafe
// applies, destroys, imports, and state surgery, asks when it cannot tell, and otherwise
// prints nothing so the normal permission flow decides.
//
// Options arrive as CLAUDE_PLUGIN_OPTION_<KEY>: AUTOALLOWREADONLY ('true' turns the allowlist
// on) and PRODPATTERN (the regex source that names a production context, stack or environment).
//
// Any exception or malformed input prints `ask` and exits 0, because Claude Code runs the
// tool call on any other exit code. Reasons are static: the command and environment are
// never printed. This is a guardrail, not a sandbox: encoded payloads, script files, and
// wrappers it does not know can evade the deny check.

import { closeSync, constants, fstatSync, openSync, readFileSync, readSync, statSync, writeSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { nestedScript, parse, reparse } from './shell/walk.ts'
import type { ShellCommand, ShellHeredoc, ShellRedirect } from './shell/walk.ts'

const TOKEN_LINE = 'ALLOW: cloud-ops'
const TF: ReadonlySet<string> = new Set(['tofu', 'terraform', 'terragrunt'])
const TOOLS: ReadonlySet<string> = new Set([...TF, 'aws', 'pulumi'])
// Kubernetes tools, checked on their own path (k8sFindings) and never by the Terraform asks above.
const K8S: ReadonlySet<string> = new Set(['kubectl', 'helm', 'talosctl', 'omnictl', 'helmfile'])
// Common aliases and drop-in replacements, read as the tool they stand for. The one- and two-letter
// names count only as a command word: as an argument they are far more often data than a wrapped call.
const ALIASES = new Map([['tf', 'terraform'], ['tg', 'terragrunt'], ['k', 'kubectl'], ['kubecolor', 'kubectl'], ['oc', 'kubectl']])
const SHORT_ALIASES: ReadonlySet<string> = new Set(['tf', 'tg', 'k', 'oc'])
// nixpkgs attribute names whose program has another name (nix run nixpkgs#opentofu runs tofu).
const NIX_PROGRAMS = new Map([['opentofu', 'tofu'], ['awscli2', 'aws'], ['awscli', 'aws'], ['kubernetes-helm', 'helm'],
  ['pulumi-bin', 'pulumi'], ['openshift', 'kubectl']])
// A version or wrapper suffix on a nixpkgs attribute: terraform_1, terraform_1_5, kubernetes-helm-wrapped.
const NIX_SUFFIX = '(?:_\\d+(?:_\\d+)*|-(?:wrapped|unwrapped|bin))'
// A tool name as a word, or as the last part of a nix installable (nixpkgs#legacyPackages.x86_64-linux.terraform).
const nameRe = (names: readonly string[], nix: readonly string[]): RegExp =>
  new RegExp(`(?<![\\w.-])(?:${names.join('|')})(?![\\w-])|#(?:[\\w-]+\\.)*(?:${[...names, ...nix].join('|')})${NIX_SUFFIX}?(?![\\w-])`)
// awscli is the module of python -m awscli, also spelled -mawscli or -Imawscli.
const TOOL_RE = new RegExp(`${nameRe(['tofu', 'terraform', 'terragrunt', 'tf', 'tg', 'aws', 'awscli', 'pulumi'],
  ['opentofu', 'awscli2', 'pulumi-bin']).source}|(?<=(?:^|\\s)-[A-Za-z]*m)awscli(?![\\w-])`)
const K8S_RE = nameRe(['kubectl', 'helm', 'talosctl', 'omnictl', 'helmfile', 'kubecolor', 'k', 'oc'], ['kubernetes-helm', 'openshift'])
// The tool a command word names: its basename, with an alias resolved.
const toolName = (w: string): string => {
  const b = basename(w)
  return ALIASES.get(b) ?? b
}
// The tool an argument names, for an unknown command that may wrap it: short aliases are not commands there.
const argTool = (w: string): string => (SHORT_ALIASES.has(basename(w)) ? basename(w) : toolName(w))

// Production: the prodPattern option, matched as a whole word, case-insensitively. Null when the
// option is too long or not a valid regex, which makes every production check unknown, so it asks.
const DEFAULT_PROD = 'prod(uction)?\\d*|prd|live'
const MAX_PROD_PATTERN = 200
function prodRegex(src: string | undefined): RegExp | null {
  const s = src ? src : DEFAULT_PROD
  if (s.length > MAX_PROD_PATTERN) return null
  try {
    new RegExp(s) // alone first, so an unbalanced group cannot pair with the frame's
    return new RegExp(`(?:^|[^a-z0-9])(?:${s})(?:[^a-z0-9]|$)`, 'i')
  } catch {
    return null
  }
}
const PROD_RE = prodRegex(process.env.CLAUDE_PLUGIN_OPTION_PRODPATTERN)
const isProd = (s: string): boolean => PROD_RE !== null && PROD_RE.test(s)

// gate: a subagent needs the brief token. sensitive: the same, and the main session is asked too.
type Kind = 'safe' | 'gate' | 'sensitive' | 'ask' | 'deny' | 'neutral'
type Finding = readonly [Kind, string | null]
type Decision = readonly ['allow' | 'ask' | 'deny', string]

// Allowlist. Every character must be plain text to a shell, and words are split on single spaces.
const PLAIN = /^[A-Za-z0-9_./=:@,+-]+(?: [A-Za-z0-9_./=:@,+-]+)*$/
const FLAG = /^--?([a-z][a-z0-9-]*)(?:=(.*))?$/
const NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/
const ENV_NAME = /^[a-z0-9][a-z0-9_-]*$/
const PLANFILE = /^(?!-)[\w./-]*(?<![\w-])tfplan$/ // tfplan or <name>.tfplan, as the terraform skill saves
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
  'busybox', 'toybox'])
// Multicall binaries whose first argument is the applet: busybox sh -c, toybox sh -c.
const MULTICALL: ReadonlySet<string> = new Set(['busybox', 'toybox'])
// Commands for which any `$` in an argument is enough to ask: they join or re-parse their arguments.
const ANY_DOLLAR: ReadonlySet<string> = new Set(['eval', 'xargs', 'source', '.', 'su', 'ssh'])
const INTERP = /^(?:python[\d.]*|perl|ruby|node)$/
// A heredoc body that runs a command from an interpreter.
const EXEC_CALL = /subprocess|\bos\.(?:system|popen|exec|spawn)|\bPopen|\bsystem\b|\bexec\w*|_exec|spawn|\bpopen|child_process|Open3|\bopen\s*\([^)\n]*(?:["']\s*\||\|\s*["'])[^)\n]*\)|\bopen\s+\w+\s*,\s*["'][^"'\n]*\|/
// Backticks, %x and qx run a command in perl and ruby only; in python or a doc they are text.
const SHELL_OUT = /%x|\bqx\b|`/
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
const QUIET_SUBS: ReadonlySet<string> = new Set(['validate', 'fmt', 'version', '-version', '--version', '-v',
  'help', '-help', '--help', '-h', 'graph', 'metadata'])
const ASK_SUBS: ReadonlySet<string> = new Set(['taint', 'untaint', 'force-unlock', 'workspace', 'get', 'login', 'logout', 'test',
  'push', 'modules'])
const SUBCMDS: ReadonlySet<string> = new Set([...QUIET_SUBS, ...ASK_SUBS, 'apply', 'destroy', 'import', 'state', 'plan', 'init',
  'show', 'providers', 'output', 'console', 'refresh'])
// terragrunt commands that only read or format configuration, found as the first non-flag word.
const TG_READ_ONLY: ReadonlySet<string> = new Set(['hclfmt', 'list', 'find', 'dag', 'info', 'render'])
const VALUE_FLAGS: ReadonlySet<string> = new Set(['var', 'var-file', 'target', 'target-file', 'exclude', 'exclude-file', 'replace',
  'lock-timeout', 'parallelism', 'state', 'state-out', 'backup', 'working-dir', 'terragrunt-working-dir', 'log-level',
  'terragrunt-log-level', 'config', 'terragrunt-config', 'download-dir', 'tf-path', 'iam-assume-role', 'queue-include-dir',
  'queue-exclude-dir', 'log-format'])
// Saved plan files for apply: tfplan, <name>.tfplan, <name>.plan, plan.bin. The allowlist's PLANFILE stays strict.
const SAVED_PLAN = /^(?!-)[\w./-]*(?:(?<![\w-])tfplan|\.tfplan|\.plan|(?<![\w-])plan\.bin)$/
const MAX_LINE = 1 << 20 // bytes read per transcript line
const MAX_CMD = 1 << 16 // longest command the guard parses; longer ones that name a tool ask
const LINE_BREAK = /\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/ // ASCII and Unicode line boundaries

const ALLOW_REASON = 'Read-only infrastructure command.'
const APPLY_REASON = 'Save a plan with -out=tfplan, review it, then run apply tfplan without -auto-approve or -destroy.'
// The token is the user's approval, so the reason never tells the model to add it.
const SUBAGENT_REASON = 'A subagent cannot run this credentialed infrastructure command. Have the main session run it, or ask the user ' +
  "whether to approve adding the cloud-ops token to the subagent's brief."
const BRIEF_REASON = 'Cannot read the subagent brief to check for the cloud-ops token. Have the main session run this credentialed ' +
  'infrastructure command, or ask the user whether to approve it.'
const PARSE_REASON = 'Cannot parse this command that mentions a guarded tool.'
const FLAGS_AFTER_REASON = 'Put flags before the plan file: apply -no-color tfplan.'
const NESTED_REASON = 'Command substitution around a guarded tool cannot be checked.'
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
  return sub === 'plan' || sub === 'init' || sub === 'state show' ? 'gate' : 'safe'
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
      // Options after the first -- belong to the command mise runs (mise exec -- bash -c '…').
      const dd = rest.indexOf('--')
      if (rest.slice(0, dd < 0 ? undefined : dd).some(a => a === '-c' || a === '--command' || a.startsWith('--command='))) return null
      if (['which', 'where', 'ls'].includes(rest[0])) return words.length // a lookup, not a run
      // mise exec|x [tool@version...] -- <cmd> runs the command after the first --, whatever it is.
      if (dd >= 0 && rest.slice(0, dd).some(a => a === 'exec' || a === 'x')) {
        i += dd + 2
        continue
      }
      const j = rest.findIndex(a => { const t = argTool(a); return TOOLS.has(t) || K8S.has(t) })
      return j < 0 ? i : i + 1 + j
    } else if (w === 'nix' && ['shell', 'develop'].includes(nixSub(words, i)?.[0] ?? '')) {
      // nix shell <installables> -c <cmd> and nix develop -c <cmd> run the words after -c.
      const at = nixSub(words, i)![1]
      const j = words.findIndex((a, n) => n > at && (a === '-c' || a === '--command'))
      if (j < 0) break
      i = j + 1
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

// Literal shell variables of one script: a value, or null when it is unknown or assigned twice.
type Vars = ReadonlyMap<string, string | null>
const VAR_WORD = /^(--?[\w-]+=)?\$(?:(\w+)|\{(\w+)\})([\w./-]*)$/
const LITERAL_VALUE = /^[\w./=:@,+%-]+(?: [\w./=:@,+%-]+)*$/
const UNKNOWN = '\0' // stands for a variable word whose value is not known

// The words with `$NAME`, `${NAME}` and `$NAME/tail` replaced by the variable's literal value when
// the script assigns one, else UNKNOWN. Other words, flags with unknown values included, stay.
function expandVars(words: readonly string[], vars: Vars): string[] {
  return words.flatMap(a => {
    const m = VAR_WORD.exec(a)
    if (!m) return [a]
    const [, flag, n1, n2, tail] = m
    const v = vars.get(n1 ?? n2)
    if (typeof v !== 'string') return [flag ? a : UNKNOWN]
    return flag ? [flag + v + tail] : (v + tail).split(' ')
  })
}

// The variables a script assigns once by a plain `NAME=value` command. A prefix assignment, an
// append, a second assignment, a shell-maintained name such as `_`, or a value with an expansion or
// odd characters makes the name unknown. A script that can bind a variable any other way trusts none.
function collectVars(commands: readonly ShellCommand[], script: string): Vars {
  const vars = new Map<string, string | null>()
  const set = (name: string, value: string | null): void => {
    const ok = value !== null && LITERAL_VALUE.test(value) && !vars.has(name) && !SHELL_VARS.test(name)
    vars.set(name, ok ? value : null)
  }
  for (const c of commands) {
    const bare = c.argv.length === 0
    for (const a of c.assigns) {
      if (a.name !== null && /^\w+$/.test(a.name)) set(a.name, bare && !a.append ? a.value : null)
    }
    if (['export', 'declare', 'typeset', 'local', 'readonly'].includes(c.text[0])) {
      for (const [i, w] of c.text.entries()) {
        const m = /^(\w+)=/.exec(w)
        if (m) set(m[1], c.argv[i] === null ? null : c.argv[i]!.slice(m[0].length))
      }
    }
  }
  if (rebinds(commands, script, vars)) {
    // Every name the script uses is unknown, so a variable command word asks even in k8sOnly.
    for (const m of plainText(script).matchAll(/\$\{?(\w+)/g)) vars.set(m[1], null)
    for (const name of vars.keys()) vars.set(name, null)
  }
  return vars
}

// Names the shell sets itself: `$_` is the last argument of the previous command, IFS changes splitting.
const SHELL_VARS = /^(?:_\w*|IFS|BASH\w*|RANDOM|SRANDOM|SECONDS|LINENO|PWD|OLDPWD|REPLY|OPTARG|OPTIND|HISTCMD|EPOCH\w+|MATCH|MBEGIN|MEND|match|mbegin|mend|status|argv)$/
// Builtins that bind a variable or run code in the current shell, in bash or zsh. Any command word
// naming one counts: the walker's words are unquoted and decoded, so `"read"`, `\read` and `$'\x72ead'` match.
const REBIND_WORDS: ReadonlySet<string> = new Set(['eval', 'source', 'read', 'mapfile', 'readarray', 'getopts', 'printf', 'print',
  'vared', 'zparseopts', 'declare', 'typeset', 'local', 'integer', 'float', 'private', 'let', 'unset', 'trap', 'alias', 'autoload',
  'emulate', 'enable', 'zmodload', 'sched'])
// Loops, arithmetic, `${NAME:=x}`, IFS, and zsh glob qualifiers that run code (`*(e:'P=x':)`, `*(+f)`)
// anywhere in the script text, quotes and escapes removed.
const REBIND_RE = /(?<![\w./-])(?:for|select|foreach|IFS)(?![\w./-])|\(\(|\$\{[^}]*=|\([^()\s]{0,16}e[^\w\s()]|\(\+\w/

// Whether the script can bind a variable other than by a plain `NAME=value`: a loop, arithmetic,
// `${NAME:=x}` or IFS anywhere; a word naming a binding builtin; an element assignment; `export` with
// a flag or a computed name; zsh's `set -A`; or a command named by `.`, a brace or glob pattern, a
// substitution, or a variable that is unknown or holds a binding word.
function rebinds(commands: readonly ShellCommand[], script: string, vars: Vars): boolean {
  if (script.length > MAX_CMD || REBIND_RE.test(plainText(script))) return true
  return commands.some(c => {
    if (c.assigns.some(a => a.name === null || !/^\w+$/.test(a.name))) return true
    if (c.text.some(w => REBIND_WORDS.has(w))) return true
    for (const [i, w] of c.text.entries()) {
      if ((w === 'export' || w === 'readonly') && c.text.slice(i + 1).some(a => !/^[A-Za-z_]\w*(?:=|$)/.test(a))) return true
    }
    const k = stripWrappers(c.text)
    if (k === null) return true
    if (k >= c.text.length) return false
    const w = c.text[k]
    if (w === '.' || w === '-') return true // source, and zsh's precommand modifier
    if (w !== '[' && w !== '[[' && /[{}*?[\]]/.test(w)) return true // `{rea,}d` and `rea?` can expand to read
    if (w === 'set' && c.text.slice(k + 1).some(a => /^[-+]\w*A|[$`]/.test(a))) return true
    if (!/[$`]/.test(w)) return false
    // A variable the script never sets comes from the user's environment.
    const bare = /^\$(\w+)$|^\$\{(\w+)\}$/.exec(w)
    if (bare) {
      const held = vars.get(bare[1] ?? bare[2])
      return held === null || (held !== undefined && held.split(' ').some(x => x === '.' || x === '-' || REBIND_WORDS.has(x)))
    }
    // A word with a slash outside its expansions names a file, never a builtin.
    const rest = w.replace(/\$(?:\w+|\{\w+\})/g, '')
    return /[$`]/.test(rest) || !rest.includes('/')
  })
}

// The finding for apply's arguments: a gate when they are flags and one trailing saved plan file,
// else a deny, or an ask when the one plan word is a variable the script does not set.
function applyFinding(rest: readonly string[], vars: Vars): Finding {
  const words = expandVars(rest, vars)
  const pos: number[] = []
  let skip = false
  for (const [i, a] of words.entries()) {
    if (skip) skip = false
    else if (a.startsWith('-') && a !== '-') {
      const name = a.replace(/^-+/, '').split('=')[0]
      if (name === 'auto-approve' || name === 'destroy') return ['deny', APPLY_REASON]
      skip = !a.includes('=') && VALUE_FLAGS.has(name)
    } else pos.push(i)
  }
  if (pos.length !== 1) return ['deny', APPLY_REASON]
  const plan = words[pos[0]]
  if (plan === UNKNOWN) return ['ask', 'Cannot tell whether this variable is a saved plan file.']
  if (!SAVED_PLAN.test(plan)) return ['deny', APPLY_REASON]
  return pos[0] === words.length - 1 ? ['gate', SUBAGENT_REASON] : ['deny', FLAGS_AFTER_REASON]
}

// True for a non-flag word whose value is only known at run time.
const dynamic = (word: string): boolean => !word.startsWith('-') && (word.includes('$') || word.includes('`'))

function tfSub(sub: string, rest: readonly string[], vars: Vars): Finding {
  if (sub === 'apply') return applyFinding(rest, vars)
  if (sub === 'providers') {
    const verb = rest.find(a => !a.startsWith('-'))
    return verb === undefined || ['schema', 'lock', 'mirror'].includes(verb) ? ['neutral', null] : ['ask', 'Cannot classify this providers command.']
  }
  if (sub === 'show' || sub === 'output') {
    return rest.some(a => /^--?(?:json|raw)(?:=.*)?$/.test(a)) ? ['sensitive', `${sub} -json or -raw prints sensitive values.`] : ['gate', SUBAGENT_REASON]
  }
  if (sub === 'console' || sub === 'refresh') return ['sensitive', `${sub} reads state and credentials.`]
  if (sub === 'destroy') return ['deny', 'Run plan -destroy -out=tfplan, review it, then apply that file.']
  if (sub === 'import') return ['deny', 'Add an import block and apply it through a saved plan.']
  if (sub === 'state') {
    const verb = rest.find(a => !a.startsWith('-')) ?? ''
    if (dynamic(verb)) return ['deny', DYNAMIC_REASON]
    if (verb === 'list') return ['neutral', null]
    if (verb === 'show') return ['gate', SUBAGENT_REASON]
    if (verb === 'pull') return ['sensitive', 'state pull prints the whole state, secrets included.']
    if (['rm', 'mv', 'push', 'replace-provider'].includes(verb)) {
      return ['deny', 'Use moved/removed blocks and a saved plan; manual state surgery needs the user.']
    }
    return ['ask', 'Cannot classify this state command.']
  }
  if (sub === 'plan' || sub === 'init') return ['gate', SUBAGENT_REASON]
  if (QUIET_SUBS.has(sub)) return ['neutral', null]
  return ['ask', 'Cannot classify this infrastructure subcommand.']
}

// aws options that take a separate value, which may precede the service.
const AWS_VALUE_FLAGS: ReadonlySet<string> = new Set(['--profile', '--region', '--output', '--endpoint-url', '--query', '--ca-bundle',
  '--cli-read-timeout', '--cli-connect-timeout', '--color', '--cli-binary-format', '--cli-error-format'])

// The service and operation words of an aws command ('' when absent), skipping global options and
// expanding variables the script sets literally. An unknown bare variable before the service may hold
// options (`aws $P lambda list-functions`); in the operation position it is the operation.
function awsOp(args: readonly string[], vars: Vars): [string, string] {
  const pos: string[] = []
  const words = args.flatMap(a => {
    const m = VAR_WORD.exec(a)
    const v = m && !m[1] ? vars.get(m[2] ?? m[3]) : undefined
    return typeof v === 'string' ? (v + m![4]).split(' ') : [a]
  })
  for (let i = 0; i < words.length && pos.length < 2; i++) {
    const a = words[i]
    if (a.startsWith('-')) {
      if (AWS_VALUE_FLAGS.has(a)) i++
    } else if (pos.length > 0 || !/^\$\{?\w+\}?$/.test(a)) pos.push(a)
  }
  return [pos[0] ?? '', pos[1] ?? '']
}

const awsReadOnly = (op: string): boolean => /^(?:describe-|list-|get-)/.test(op) || op === 'filter-log-events'

// aws operations that delete, stop, or loosen access, as the main session should confirm.
const AWS_DESTRUCTIVE = /^(?:delete-|terminate-|remove-|deregister-|revoke-|detach-|disassociate-|disable-|stop-|put-[\w-]*-policy$|schedule-key-deletion$)/
function awsDestructive([service, op]: readonly [string, string], args: readonly string[]): boolean {
  if (AWS_DESTRUCTIVE.test(op)) return true
  return service === 's3' && (['rm', 'rb', 'mv'].includes(op) || (op === 'sync' && args.includes('--delete')))
}

// Kubernetes. Only the command word after the wrappers counts, so kubectl as an argument is data.
// Production is judged by the whole-word PROD_RE on the context name, or on a kubeconfig path.
const K8S_VALUE_FLAGS: ReadonlySet<string> = new Set(['n', 'namespace', 'context', 'kube-context', 'cluster', 'user', 'kubeconfig', 's',
  'server', 'token', 'as', 'as-group', 'request-timeout', 'cache-dir', 'certificate-authority', 'client-certificate', 'client-key',
  'tls-server-name', 'username', 'password', 'v', 'f', 'filename', 'k', 'kustomize', 'l', 'selector', 'o', 'output', 'c', 'container',
  'field-selector', 'replicas', 'p', 'patch', 'patch-file', 'e', 'endpoints', 'nodes', 'talosconfig', 'omniconfig', 'profile-output',
  'grace-period', 'timeout', 'cascade', 'field-manager', 'sort-by', 'since', 'tail', 'chunk-size', 'template', 'log-flush-frequency',
  'kube-apiserver', 'kube-token', 'kube-as-user', 'kube-as-group', 'kube-ca-file', 'values', 'version', 'namespace-selector'])
const KUBECTL_READ: ReadonlySet<string> = new Set(['get', 'describe', 'logs', 'top', 'explain', 'api-resources', 'api-versions', 'version',
  'cluster-info', 'diff', 'events', 'wait', 'port-forward', 'proxy', 'config', 'completion', 'kustomize', 'options', 'plugin', 'help'])
const HELM_READ: ReadonlySet<string> = new Set(['list', 'ls', 'get', 'status', 'history', 'show', 'search', 'repo', 'template', 'lint',
  'version', 'env', 'dependency', 'dep', 'pull', 'package', 'verify', 'plugin', 'completion', 'help', 'diff'])
// Verbs that change a cluster. Any positional word naming one is taken as the verb, so an unknown flag's value cannot hide it.
const K8S_MUTATING: ReadonlySet<string> = new Set(['apply', 'create', 'replace', 'patch', 'edit', 'delete', 'scale', 'drain', 'cordon',
  'uncordon', 'taint', 'label', 'annotate', 'set', 'exec', 'cp', 'debug', 'run', 'expose', 'autoscale', 'rollout', 'certificate', 'attach',
  'install', 'upgrade', 'rollback', 'uninstall'])
// talosctl and omnictl subcommands that change or restart nodes and clusters, asked in any context.
const TALOS_ASK: ReadonlySet<string> = new Set(['reset', 'upgrade', 'upgrade-k8s', 'apply-config', 'reboot', 'shutdown', 'remove-member',
  'wipe', 'rollback'])
const OMNI_ASK: ReadonlySet<string> = new Set(['delete', 'apply'])
// kubectl delete targets that are denied on production.
const PROTECTED_KINDS: ReadonlySet<string> = new Set(['pv', 'pvs', 'persistentvolume', 'persistentvolumes', 'pvc', 'pvcs',
  'persistentvolumeclaim', 'persistentvolumeclaims', 'crd', 'crds', 'customresourcedefinition', 'customresourcedefinitions',
  'no', 'node', 'nodes'])
const K8S_DENY = 'Deleting persistent volumes, claims, CRDs or nodes on a production cluster needs the user.'
const MAX_KUBECONFIG = 1 << 20 // bytes of a kubeconfig the guard reads
const UNKNOWN_ENV = '\0'

// Cluster selectors the script sets with NAME=value or export, in command order: the command index, name and value.
// The value is UNKNOWN_ENV when an expansion hides it. A command sees only those set before it; the
// walker does not say which sit in a subshell, so callers also weigh the process environment.
const ENV_NAMES: ReadonlySet<string> = new Set(['KUBECONFIG', 'HELM_KUBECONTEXT'])
function collectEnv(commands: readonly ShellCommand[]): [number, string, string][] {
  const seen: [number, string, string][] = []
  for (const [i, c] of commands.entries()) {
    if (c.argv.length === 0) {
      for (const a of c.assigns) if (a.name !== null && ENV_NAMES.has(a.name)) seen.push([i, a.name, a.value ?? UNKNOWN_ENV])
    } else if (['export', 'declare', 'typeset', 'local', 'readonly'].includes(c.text[0])) {
      for (const w of c.text) {
        const m = /^(\w+)=/.exec(w)
        if (m && ENV_NAMES.has(m[1])) seen.push([i, m[1], w.slice(m[0].length)])
      }
    }
  }
  return seen
}

// The selectors in effect for the command at index i, each value joined by ':' across every earlier setting.
function envBefore(seen: readonly [number, string, string][], i: number): Vars {
  const out = new Map<string, string>()
  for (const [at, name, value] of seen) if (at < i) out.set(name, out.has(name) ? `${out.get(name)}:${value}` : value)
  return out
}

// Whether a context name or kubeconfig path is production: true, false, or 'unknown' when an
// expansion hides it or the prodPattern option is invalid.
function prodValue(v: string, vars: Vars): boolean | 'unknown' {
  if (PROD_RE === null) return 'unknown'
  if (v.includes(UNKNOWN_ENV)) return isProd(v) ? true : 'unknown'
  const e = expandVars([v], vars)[0]
  if (isProd(v) || isProd(e)) return true
  return e === UNKNOWN || SUBST.test(e) || /^\$\{?\w+\}?$/.test(e) ? 'unknown' : false
}

// Two production verdicts weighed together: true wins, then 'unknown'.
const either = (a: boolean | 'unknown', b: boolean | 'unknown'): boolean | 'unknown' =>
  a === true || b === true ? true : a === 'unknown' || b === 'unknown' ? 'unknown' : false

// The value of the last non-empty `--name value` or `--name=value` among args, or undefined. An
// empty value counts as absent, as kubectl treats it.
function flagValue(args: readonly string[], names: readonly string[]): string | undefined {
  let out: string | undefined
  for (const [i, a] of args.entries()) {
    for (const n of names) {
      const v = a === n ? args[i + 1] : a.startsWith(`${n}=`) ? a.slice(n.length + 1) : undefined
      if (v) out = v
    }
  }
  return out
}

// The current-context name of a kubeconfig file ('' when it names none), or null when the path is not
// a regular file or cannot be read. A FIFO or device would block the read past the hook's timeout, so
// the path is checked before the open, opened without blocking, and checked again on the descriptor.
function kubeContext(path: string): string | null {
  let fd: number | null = null
  try {
    if (!statSync(path).isFile()) return null
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK)
    if (!fstatSync(fd).isFile()) return null
    const buf = Buffer.alloc(MAX_KUBECONFIG)
    const n = readSync(fd, buf, 0, buf.length, 0)
    return /^current-context:[ \t]*["']?([^\s"']+)/m.exec(buf.subarray(0, n).toString('utf8'))?.[1] ?? ''
  } catch {
    return null
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

// Whether a kubeconfig file may be read for a command: true when no command that runs before it can
// write one (see filesFor). Called only when a check needs a file, so the scan stays lazy.
type Files = () => boolean

// Whether a kubeconfig path or KUBECONFIG list the command names is production: by its name, else by
// the current-context of its files. A file is read only when files() holds and its path is absolute
// (the shell's directory may differ from the hook's); otherwise, or when a file is missing, not a
// regular file or unreadable, it is 'unknown'.
function kubeconfigProd(value: string, vars: Vars, files: Files): boolean | 'unknown' {
  const r = prodValue(value, vars)
  if (r !== false) return r
  const list = expandVars([value], vars)[0]
  if (/[$`]/.test(list)) return 'unknown'
  let unknown = false
  for (const p of list.split(':')) {
    if (!p) continue
    const path = p.startsWith('~/') ? join(homedir(), p.slice(2)) : p
    const ctx = path.startsWith('/') && files() ? kubeContext(path) : null
    if (ctx === null) unknown = true
    else if (isProd(ctx)) return true
  }
  return unknown ? 'unknown' : false
}

// Words that are neither flags nor values of the flags in valueFlags (K8S_VALUE_FLAGS by default).
// help is set when -h or --help stands where a flag does, not as the value of a known flag before it.
// An unknown flag may still take it as its value (pflag reads the next word for a string flag), so
// callers honor help only when no positional word is an ask verb.
function k8sWords(args: readonly string[], valueFlags: ReadonlySet<string> = K8S_VALUE_FLAGS): { pos: string[]; help: boolean } {
  const pos: string[] = []
  let help = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a.startsWith('-') && a !== '-') {
      if (a === '-h' || a === '--help') help = true
      else if (!a.includes('=') && valueFlags.has(a.replace(/^-+/, ''))) i++
    } else pos.push(a)
  }
  return { pos, help }
}

// Whether the command targets production: --context or --kube-context, else --kubeconfig, else a
// KUBECONFIG= prefix or export, else the current-context of the kubeconfig in use (read only when asked).
// A selector taken from a variable may be empty at run time (its assignment sat in a subshell), which
// falls back to the process's kubeconfig, so that kubeconfig weighs in too.
function prodTarget(tool: string, pre: readonly string[], args: readonly string[], vars: Vars, env: Vars, files: Files): boolean | 'unknown' {
  const prefixed = (name: string): string | undefined => pre.findLast(w => w.startsWith(`${name}=`))?.slice(name.length + 1) || undefined
  const orProcess = (v: string, r: boolean | 'unknown'): boolean | 'unknown' => (r === false && v.includes('$') ? processProd(files) : r)
  const cluster = flagValue(args, ['--cluster'])
  if (cluster !== undefined && prodValue(cluster, vars) === true) return true
  const ctx = flagValue(args, ['--context', '--kube-context']) ?? (tool === 'helm' ? prefixed('HELM_KUBECONTEXT') : undefined)
  if (ctx !== undefined) return orProcess(ctx, prodValue(ctx, vars))
  const helmEnv = tool === 'helm' ? env.get('HELM_KUBECONTEXT') : undefined
  // An earlier export may sit in a subshell, so the process's own context still weighs in.
  if (helmEnv) return either(prodValue(helmEnv, vars), processProd(files))
  // A file not named prod can still select a prod context, so the file is read.
  const flagKc = flagValue(args, ['--kubeconfig'])
  if (flagKc !== undefined) return orProcess(flagKc, kubeconfigProd(flagKc, vars, files))
  const preKc = prefixed('KUBECONFIG')
  if (preKc !== undefined) return orProcess(preKc, kubeconfigProd(preKc, vars, files))
  const envKc = env.get('KUBECONFIG')
  if (envKc) return either(kubeconfigProd(envKc, vars, files), processProd(files))
  return processProd(files)
}

// Whether the hook's own kubeconfig (the first $KUBECONFIG file, else ~/.kube/config) selects a
// production context. 'unknown' when it cannot be read, or when files() is false: a command that runs
// first may switch its context (kubectl config use-context), or the command runs in another environment.
function processProd(files: Files): boolean | 'unknown' {
  if (PROD_RE === null || !files()) return 'unknown'
  const kc = process.env.KUBECONFIG
  const cur = kubeContext(kc ? kc.split(':')[0] : join(homedir(), '.kube', 'config'))
  return cur === null ? 'unknown' : isProd(cur)
}

// Commands that write no local file, and kubectl verbs that write or run one (cp, edit's editor, diff's
// differ, plugins) or rewrite the kubeconfig (config set and use-context).
const NO_WRITE: ReadonlySet<string> = new Set(['export', 'declare', 'typeset', 'local', 'readonly', '[', 'test', 'echo', 'printf', 'true',
  'false', ':', 'set', 'sleep', 'exit', 'date', 'head', 'tail', 'grep', 'wc', 'cut', 'tr', 'jq', 'cat', 'cd', 'ls', 'mkdir'])
const KUBECTL_LOCAL: ReadonlySet<string> = new Set(['cp', 'edit', 'diff', 'kustomize', 'plugin', 'config', 'cluster-info'])
const KUBECONFIG_READS: ReadonlySet<string> = new Set(['view', 'current-context', 'get-contexts', 'get-clusters', 'get-users'])
// helm, talosctl and omnictl verbs that never write a kubeconfig. helm's plugin, repo and registry,
// and helm plugins such as diff, run or install other programs; talosctl and omnictl kubeconfig write
// one, and cp, edit, gen, cluster, support, pcap and download write local files or run an editor.
const HELM_KEEPS: ReadonlySet<string> = new Set(['list', 'ls', 'get', 'status', 'history', 'show', 'inspect', 'search', 'template',
  'lint', 'version', 'env', 'dependency', 'dep', 'pull', 'fetch', 'package', 'verify', 'completion', 'help', 'install', 'upgrade',
  'rollback', 'uninstall', 'delete', 'del', 'un', 'test'])
const HELM_RUNS: ReadonlySet<string> = new Set(['plugin', 'repo', 'registry'])
const TALOS_KEEPS: ReadonlySet<string> = new Set(['get', 'logs', 'dmesg', 'services', 'service', 'health', 'version', 'read', 'list', 'ls',
  'containers', 'stats', 'processes', 'ps', 'memory', 'mounts', 'netstat', 'events', 'time', 'usage', 'du', 'disks', 'restart', 'bootstrap',
  'patch', 'reset', 'upgrade', 'upgrade-k8s', 'apply-config', 'apply', 'reboot', 'shutdown', 'wipe', 'rollback', 'inspect', 'image', 'meta',
  'cgroups'])
const OMNI_KEEPS: ReadonlySet<string> = new Set(['get', 'delete', 'apply', 'version', 'machine-logs', 'audit-log'])

// Whether a command can write no file: no output redirect other than to /dev/null or a descriptor
// copy, and a plain assignment, a command from NO_WRITE, a kubectl, helm, talosctl or omnictl verb
// that keeps to the cluster, or kustomize build to stdout. Anything else may create or rewrite the
// kubeconfig a later kubectl reads, so the guard cannot read it.
function writesNothing(c: ShellCommand): boolean {
  const writes = (r: ShellRedirect): boolean =>
    r.op.includes('>') && r.target !== '/dev/null' && !(r.op === '>&' && /^(?:\d+|-)$/.test(r.target ?? ''))
  if (c.redirects.some(writes)) return false
  const k = stripWrappers(c.text)
  if (k === null) return false
  if (k >= c.text.length || NO_WRITE.has(c.text[k])) return true
  const tool = toolName(c.text[k])
  const args = c.text.slice(k + 1)
  if (tool === 'kustomize') {
    // build writes stdout unless -o names a file; exec and alpha plugins run other programs.
    return args.find(a => !a.startsWith('-')) === 'build' && !args.some(a => /^(?:-o|--output(?:=|$)|--enable-(?:exec|alpha-plugins|star))/.test(a))
  }
  const { pos } = k8sWords(args)
  if (tool === 'helm') return HELM_KEEPS.has(pos[0]) && !pos.some(w => HELM_RUNS.has(w)) && !args.some(a => a.startsWith('--post-renderer'))
  if (tool === 'talosctl' || tool === 'omnictl') {
    return (tool === 'talosctl' ? TALOS_KEEPS : OMNI_KEEPS).has(pos[0]) && !pos.includes('kubeconfig')
  }
  if (tool !== 'kubectl') return false
  if (pos[0] === 'config') return KUBECONFIG_READS.has(pos[1])
  if (pos[0] === 'cluster-info') return !pos.includes('dump')
  return (KUBECTL_READ.has(pos[0]) || K8S_MUTATING.has(pos[0])) && !KUBECTL_LOCAL.has(pos[0])
}

// Findings for kubectl, helm, talosctl and omnictl. On a production cluster a mutation asks, and a
// subagent needs the brief token. Deleting volumes, claims, CRDs or nodes there is denied.
function k8sFindings(tool: string, pre: readonly string[], args: readonly string[], vars: Vars, env: Vars, files: Files): Finding[] {
  if (tool === 'helmfile') return helmfileFindings(pre, args, vars, env, files)
  // Verbs are read with the script's literal variables expanded, so `V=delete; kubectl $V` is a delete.
  // Help text changes nothing, but -h may be an unknown flag's value, so it counts only beside no ask verb.
  const { pos, help } = k8sWords(expandVars(args, vars))
  const gated = (reason: string): Finding[] => [['ask', reason], ['gate', SUBAGENT_REASON]]
  if (tool === 'talosctl') {
    const hit = pos.some(w => TALOS_ASK.has(w)) || (pos.includes('etcd') && pos.includes('leave')) ||
      ((pos[0] === 'patch' || pos[0] === 'edit') && pos.some(w => /^(?:mc|machineconfigs?)$/.test(w)))
    return hit ? gated('This talosctl command resets, upgrades, reconfigures or restarts nodes.') : []
  }
  if (tool === 'omnictl') return pos.some(w => OMNI_ASK.has(w)) ? gated('This omnictl command deletes or applies Omni resources.') : []
  // Any positional word naming a mutating verb is the verb, so a flag whose value the table misses cannot hide it.
  const vi = pos.findIndex(w => K8S_MUTATING.has(w))
  if (help && vi < 0) return []
  const verb = vi >= 0 ? pos[vi] : (pos[0] ?? '')
  const rest = vi >= 0 ? pos.slice(vi + 1) : pos.slice(1)
  if (!verb || (vi < 0 && (tool === 'kubectl' ? KUBECTL_READ : HELM_READ).has(verb))) return []
  if (verb === 'rollout' && ['status', 'history'].includes(rest[0])) return []
  if (tool === 'kubectl' && pos[0] === 'auth' && ['can-i', 'whoami'].includes(pos[1])) return []
  const prod = prodTarget(tool, pre, args, vars, env, files)
  if (prod === false) return []
  // After delete, any word naming a protected kind (alone, as kind/name, or in a comma list) is denied.
  if (prod === true && tool === 'kubectl' && verb === 'delete' &&
    rest.some(w => w.split('/')[0].split(',').some(k => PROTECTED_KINDS.has(k.toLowerCase().split('.')[0])))) {
    return [['deny', K8S_DENY]]
  }
  return gated(prod === 'unknown' ? 'Cannot tell which cluster this changes.' : 'This changes a production cluster.')
}

// helmfile verbs that install, upgrade or delete releases, asked in any environment: the state
// file picks the cluster, so the guard cannot tell a production run apart.
const HELMFILE_ASK: ReadonlySet<string> = new Set(['destroy', 'delete', 'sync', 'apply'])
const HELMFILE_VALUE_FLAGS: ReadonlySet<string> = new Set(['e', 'environment', 'f', 'file', 'l', 'selector', 'kube-context', 'n',
  'namespace', 'b', 'helm-binary', 'state-values-set', 'state-values-set-string', 'state-values-file', 'log-level', 'args', 'set',
  'values', 'concurrency', 'output-dir', 'context', 'kubeconfig', 'c', 'chart'])

// helmfile's commands. A variable or substitution among the words with none of these literal may be destroy.
const HELMFILE_CMDS: ReadonlySet<string> = new Set([...HELMFILE_ASK, 'build', 'cache', 'charts', 'completion', 'deps', 'diff', 'fetch',
  'help', 'init', 'lint', 'list', 'repos', 'show-dag', 'status', 'template', 'test', 'version', 'write-values'])
const VERB_REASON = 'A variable or substitution as the command verb may hide destroy or up; write it literally.'

// True for a word whose value is only known at run time, after expandVars.
const unknownWord = (w: string): boolean => w === UNKNOWN || dynamic(w)

function helmfileFindings(pre: readonly string[], args: readonly string[], vars: Vars, env: Vars, files: Files): Finding[] {
  // An ask verb is asked whatever help flag sits beside it: -h may be an unknown flag's value.
  const { pos } = k8sWords(expandVars(args, vars), HELMFILE_VALUE_FLAGS)
  const hidden = pos.some(unknownWord) && !pos.some(w => HELMFILE_CMDS.has(w))
  if (!hidden && !pos.some(w => HELMFILE_ASK.has(w))) return []
  const name = flagValue(args, ['-e', '--environment']) ?? pre.findLast(w => w.startsWith('HELMFILE_ENVIRONMENT='))?.slice(21)
  const prod = (name !== undefined && prodValue(name, vars) === true) || prodTarget('helm', pre, args, vars, env, files) === true
  const reason = hidden ? VERB_REASON
    : prod ? 'This helmfile command changes releases on production.' : 'This helmfile command installs, upgrades or deletes releases.'
  return [['ask', reason], ['gate', SUBAGENT_REASON]]
}

// pulumi verbs that change or delete a stack's resources or state, with their aliases (watch deploys
// on every file change). Asked on any stack.
const PULUMI_ASK: ReadonlySet<string> = new Set(['destroy', 'down', 'dn', 'up', 'update', 'refresh', 'import', 'watch'])
const PULUMI_VALUE_FLAGS: ReadonlySet<string> = new Set(['s', 'stack', 'C', 'cwd', 'config-file', 'c', 'config', 't', 'target', 'exclude',
  'replace', 'p', 'parallel', 'm', 'message', 'color', 'policy-pack', 'policy-pack-config', 'secrets-provider', 'tracing', 'plan',
  'v', 'verbose', 'target-replace', 'import-file', 'from', 'profiling', 'suppress-permalink'])
// pulumi's commands. A variable or substitution among the words with none of these literal may be destroy.
const PULUMI_CMDS: ReadonlySet<string> = new Set([...PULUMI_ASK, 'about', 'ai', 'cancel', 'completion', 'config', 'console', 'convert',
  'deployment', 'env', 'gen-completion', 'help', 'install', 'login', 'logout', 'logs', 'new', 'org', 'package', 'plugin', 'policy',
  'preview', 'pre', 'schema', 'stack', 'state', 'template', 'version', 'watch', 'whoami'])

function pulumiFindings(args: readonly string[], vars: Vars): Finding[] {
  const { pos, help } = k8sWords(expandVars(args, vars), PULUMI_VALUE_FLAGS)
  const hit = pos.some(w => PULUMI_ASK.has(w)) || (pos[0] === 'stack' && ['rm', 'remove'].includes(pos[1])) ||
    (pos[0] === 'state' && ['delete', 'edit', 'move', 'rename', 'repair', 'unprotect'].includes(pos[1]))
  const hidden = (pos.some(unknownWord) && !pos.some(w => PULUMI_CMDS.has(w))) ||
    ((pos[0] === 'stack' || pos[0] === 'state') && pos[1] !== undefined && unknownWord(pos[1]))
  // An ask verb is asked whatever help flag sits beside it: -h may be an unknown flag's value.
  if (hit || hidden) {
    const stack = flagValue(args, ['--stack', '-s'])
    const prod = stack !== undefined && prodValue(stack, vars) === true
    const reason = hidden && !hit ? VERB_REASON
      : prod ? 'This pulumi command changes a production stack.' : 'This pulumi command changes or deletes a stack\'s resources or state.'
    return [['ask', reason], ['gate', SUBAGENT_REASON]]
  }
  if (help) return []
  // Like terraform output -json: these print decrypted secrets or the whole state.
  if (args.some(a => /^--show-secrets(?:=.*)?$/.test(a)) || (pos[0] === 'stack' && pos[1] === 'export')) {
    return [['sensitive', 'pulumi --show-secrets and stack export print secrets.']]
  }
  // preview runs the program with the stack's credentials, as terraform plan does.
  if (pos.some(w => w === 'preview' || w === 'pre')) return [['gate', SUBAGENT_REASON]]
  return []
}

// Commands whose arguments are usually data, so a tool name among them is not a wrapped call.
const DATA_CMDS: ReadonlySet<string> = new Set(['echo', 'printf', 'cat', 'grep', 'egrep', 'fgrep', 'rg', 'sed', 'awk', 'head', 'tail',
  'tee', 'git', 'gh', 'jq', 'yq', 'man', 'which', 'whereis', 'type', 'ls', 'diff', 'wc', 'sort', 'uniq', 'cut', 'tr', 'fd', 'find',
  'rm', 'cp', 'mv', 'mkdir', 'touch', 'chmod', 'cd', 'test', '[', '[[', 'brew', 'apt', 'apt-get', 'dnf', 'yum', 'pacman', 'yay', 'pip',
  'pip3', 'npm', 'pnpm', 'cargo', 'go', 'gem'])

// Where the command a package runner or find action runs starts among its arguments, or null when the
// command is not one: npm, pnpm, yarn or bun exec, dlx or x; npx, bunx, pnpx; gem, bundle or brew
// bundle exec; uv or pipx run; find -exec, -execdir, -ok or -okdir. Options before the command are skipped.
function execStart(cmd: string, args: readonly string[]): number | null {
  const after = (verbs: readonly string[]): number => {
    const j = args.findIndex(a => verbs.includes(a))
    return j < 0 ? -1 : j + 1
  }
  let i: number
  if (['npx', 'bunx', 'pnpx'].includes(cmd)) i = 0
  else if (['npm', 'pnpm', 'yarn', 'bun'].includes(cmd)) i = after(['exec', 'dlx', 'x'])
  else if (cmd === 'gem' || cmd === 'bundle') i = after(['exec'])
  else if (cmd === 'brew') i = args[after(['bundle'])] === 'exec' ? after(['bundle']) + 1 : -1
  else if (cmd === 'uv' || cmd === 'pipx') i = after(['run'])
  else if (cmd === 'find') i = after(['-exec', '-execdir', '-ok', '-okdir'])
  else return null
  if (i < 0) return null
  while (i < args.length && args[i].startsWith('-')) i++
  return i
}

// True when the script or code operand of a shell or interpreter holds an expansion, or an option
// hides it: `bash -c "$X"`, `bash $S`, `python3 -c "$X"`. A literal operand with expansions among
// the arguments after it is fine, since the script itself is then checked.
function operandHidden(name: string, argv: readonly (string | null)[]): boolean {
  const kind = INTERP.test(name) ? name.replace(/[\d.]+$/, '') : 'sh'
  const codeCh = { sh: 'c', python: 'cm', perl: 'eE', ruby: 'e', node: 'pe' }[kind] ?? ''
  const valCh = { sh: 'oO', python: 'WX', perl: 'IM', ruby: 'rI', node: 'r' }[kind] ?? ''
  const codeLong = ['--eval', '--print']
  const valLong = ['--rcfile', '--init-file', '--require', '--import', '--loader']
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === null) return true
    if (a === '--') return argv[i + 1] === null
    if (a === '-' || !/^[-+]./.test(a)) return false
    if (a.startsWith('--')) {
      if (a.includes('=')) continue
      if (codeLong.includes(a)) return argv[i + 1] === null
      if (valLong.includes(a)) {
        i++
        if (argv[i] === null) return true
      }
      continue
    }
    for (let j = 1; j < a.length; j++) {
      const attached = j < a.length - 1
      if (a[0] === '-' && codeCh.includes(a[j])) return attached ? false : argv[i + 1] === null
      if (valCh.includes(a[j])) {
        if (!attached) {
          i++
          if (argv[i] === null) return true
        }
        break
      }
    }
  }
  return false
}

// The first n words that are neither flags nor the values of the flags in VALUE_FLAGS ('' pads).
function firstWords(args: readonly string[], n: number): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length && out.length < n; i++) {
    const a = args[i]
    if (a.startsWith('-')) {
      if (!a.includes('=') && VALUE_FLAGS.has(a.replace(/^-+/, ''))) i++
    } else out.push(a)
  }
  while (out.length < n) out.push('')
  return out
}

// Findings for the arguments of tofu, terraform, or terragrunt.
function classifyTf(args: readonly string[], tool: string, vars: Vars): Finding[] {
  // Every word that names a subcommand counts, so a flag value cannot hide the real one.
  // The word after state is its verb (state show), which tfSub reads from there.
  const found: Finding[] = []
  for (const [i, a] of args.entries()) {
    if (SUBCMDS.has(a) && args[i - 1] !== 'state') found.push(tfSub(a, args.slice(i + 1), vars))
  }
  if (tool === 'terragrunt') {
    const pos = firstWords(args, 2)
    if (TG_READ_ONLY.has(pos[0]) || (pos[0] === 'hcl' && ['fmt', 'validate'].includes(pos[1]))) found.push(['neutral', null])
  }
  if (!found.length) {
    // With no literal subcommand, a variable word may be destroy.
    found.push(args.some(dynamic) ? ['deny', DYNAMIC_REASON] : ['ask', 'Cannot classify this infrastructure command.'])
  }
  if (args.some(a => a.startsWith('-') && NEVER_FLAGS.has(a.replace(/^-+/, '').split('=')[0]))) {
    found.push(['ask', 'This flag migrates state, writes generated files, or prints secrets.'])
  }
  if (args.some(a => TOOLS.has(a))) found.push(['ask', 'A second guarded tool in one command cannot be checked.'])
  if (args.some(a => !a.startsWith('-') && SUBST.test(a))) found.push(['ask', 'A substitution in the arguments cannot be checked.'])
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

// Findings for the script text of sh -c or eval, parsed one level deeper. outer says whether the
// nested script may read a kubeconfig file at all.
function nestedFindings(script: string, depth: number, k8sOnly: boolean, outer: Files): Finding[] {
  const r = reparse(script, depth)
  if (r.errors.length) throw new ParseFailure(r.errors[0].message)
  return scriptFindings(r.commands, script, depth, k8sOnly, outer)
}

// Shells that run a -c script in the caller's environment and read no startup file first: bash, sh,
// dash and ksh with no login or interactive option, and eval, with no prefix or wrapper (env, sudo)
// before them that sets a cluster selector, BASH_ENV or ENV, or changes the environment. zsh reads
// .zshenv and fish its config even for -c, ssh and su run elsewhere or as someone else, and busybox
// is left out with them, so the kubeconfig such a script reads is unknown.
const SAME_ENV_SHELLS: ReadonlySet<string> = new Set(['bash', 'sh', 'dash', 'ksh'])
const ENV_CHANGERS: ReadonlySet<string> = new Set(['env', 'sudo', 'doas', 'su', 'run0', 'pkexec'])
function sameEnvShell(cmd: string, argv: readonly (string | null)[], pre: readonly string[]): boolean {
  if (pre.some(w => ENV_CHANGERS.has(basename(w)) || /^(?:KUBECONFIG|HELM_KUBECONTEXT|BASH_ENV|ENV)=/.test(w))) return false
  if (cmd === 'eval') return true
  if (!SAME_ENV_SHELLS.has(cmd) || process.env.BASH_ENV) return false
  for (const a of argv.slice(1)) {
    if (a === null) return false
    if (a === '--' || !/^[-+]./.test(a)) break
    if (a.startsWith('--') ? /^--(?:login|interactive|rcfile|init-file)/.test(a) : /[li]/.test(a.slice(1))) return false
  }
  return true
}

// Findings for one task: a word list in which expansions stay as written (`text`) and `argv` keeps
// the literal value, or null, for nestedScript. With k8sOnly the script names no Terraform or aws
// tool, so only the Kubernetes tools are checked, and none of the generic asks apply. files says
// whether a kubeconfig the command names may be read (see kubeconfigProd).
function classify(argv: readonly (string | null)[], words: readonly string[], depth: number, nesting: number, vars: Vars, env: Vars,
  prefix: readonly string[], k8sOnly: boolean, files: Files): Finding[] {
  const k = stripWrappers(words)
  if (k === null) return [['ask', 'A wrapper option such as env -S or mise exec -c hides the command.']]
  if (k >= words.length) return []
  const cmd = toolName(words[k])
  const args = words.slice(k + 1)
  // A path whose last part is literal (`$S/locked.sh`) is a script the wrapped-tool check below sees through.
  // A variable or substitution in the last part (`$D/$T`, `$(echo /usr/bin/tofu)`) may name any command.
  const pathLike = words[k].includes('/') && !SUBST.test(words[k]) && !basename(words[k]).includes('$')
  // A variable that holds a Kubernetes command, behind wrappers or not, is read as that command, so
  // `K="sudo kubectl --context prod"; $K delete pv x` is judged.
  const bare = /^\$(\w+)$|^\$\{(\w+)\}$/.exec(words[k])
  const name = bare ? (bare[1] ?? bare[2]) : null
  const held = name === null ? undefined : vars.get(name)
  if (typeof held === 'string' && held.split(' ').some(w => K8S.has(toolName(w)))) {
    const parts = held.split(' ')
    return classify([...argv.slice(0, k), ...parts, ...argv.slice(k + 1)], [...words.slice(0, k), ...parts, ...words.slice(k + 1)],
      depth, nesting, vars, env, prefix, k8sOnly, files)
  }
  // With only Kubernetes tools named, a variable the script never sets is some other command; one it
  // sets to an unknown value, or a substitution, may be kubectl.
  if (/[$`]/.test(words[k]) && !pathLike) {
    return k8sOnly && name !== null && !vars.has(name) ? [] : [['ask', 'A variable or substitution names the command.']]
  }
  // nix run <installable> runs the installable's program: classify it as that command.
  const nix = cmd === 'nix' ? nixRun(words, k) : null
  if (nix) {
    const [program, from] = nix
    return classify([...argv.slice(0, k), program, ...argv.slice(from)], [...words.slice(0, k), program, ...words.slice(from)],
      depth, nesting, vars, env, prefix, k8sOnly, files)
  }
  // python -m awscli is the aws CLI.
  const awscli = !k8sOnly && /^python/.test(cmd) && INTERP.test(cmd) ? awscliStart(args) : null
  if (awscli !== null) return awsFindings(args.slice(awscli), vars, nesting)
  if (SHELLS.has(cmd) || INTERP.test(cmd)) {
    const script = nestedScript(argv.slice(k))
    // A selector the outer script sets reaches the nested script, which reads only its own, so it is unknown there.
    const same = (): boolean => files() && env.size === 0 && sameEnvShell(cmd, argv.slice(k), [...prefix, ...words.slice(0, k)])
    const out = script === null ? [] : nestedFindings(script, depth + 1, k8sOnly, same)
    // Kubernetes tools named among the arguments of a command that re-runs them (xargs, eval, ssh) or of a script file.
    const k8sArg = INTERP.test(cmd)
      ? args.some(a => K8S_RE.test(a) && (EXEC_CALL.test(a) || (/^(?:perl|ruby)$/.test(cmd) && SHELL_OUT.test(a))))
      : args.some(a => K8S_RE.test(a)) && (ANY_DOLLAR.has(cmd) || script === null)
    if (k8sOnly) {
      if (k8sArg) out.push(['ask', 'A shell, eval, or xargs wraps a guarded tool and cannot be checked.'])
      return out
    }
    // A multicall binary's options start after its applet (busybox sh -c "$X"), and a hidden applet hides them all.
    const multicall = MULTICALL.has(cmd)
    const hidden = ANY_DOLLAR.has(cmd) ? args.some(a => a.includes('$'))
      : (multicall && argv[k + 1] === null) || operandHidden(cmd, argv.slice(multicall ? k + 1 : k))
    // awscli after pip install is a package name (python3 -m pip install awscli==1.32), not a call;
    // anywhere else (ssh host python3 -m awscli …) it may be one.
    if (hidden || k8sArg || args.some((a, n) => TOOL_RE.test(a) && !(AWSCLI_PACKAGE.test(a) && pipInstall(args, n)))) {
      out.push(['ask', 'A shell, eval, or xargs wraps a guarded tool and cannot be checked.'])
    }
    return out
  }
  // awk can run a command: system("...") or a pipe, so a program naming a guarded tool asks.
  if (/^(?:[gmn]?awk)$/.test(cmd) && args.some(a => (TOOL_RE.test(a) || K8S_RE.test(a)) && /system\s*\(|\|\s*getline|\|&|\|\s*["(]/.test(a))) {
    return [['ask', 'An awk program runs a guarded tool.']]
  }
  if (TF.has(cmd)) {
    const out = classifyTf(args, cmd, vars)
    if (nesting > 0) out.push(['ask', NESTED_REASON])
    return out
  }
  if (K8S.has(cmd)) return k8sFindings(cmd, [...prefix, ...words.slice(0, k)], args, vars, env, files)
  if (cmd === 'pulumi' && !k8sOnly) return pulumiFindings(args, vars)
  if (cmd === 'aws' && !k8sOnly) return awsFindings(args, vars, nesting)
  // A package runner or find action runs its arguments as a command, which is classified as one.
  const start = execStart(cmd, args)
  if (start !== null) {
    const j = k + 1 + start
    const out = classify(argv.slice(j), words.slice(j), depth, nesting, vars, env, [...prefix, ...words.slice(0, k)], k8sOnly, files)
    // npm exec -c and the like run a shell string.
    if (args.some(a => /\s/.test(a) && (TOOL_RE.test(a) || K8S_RE.test(a)))) {
      out.push(['ask', 'A package runner or find action runs a command string that names a guarded tool.'])
    }
    return out
  }
  // A guarded tool after a command the guard does not know may be a wrapped call. A script path
  // gets the wrapped tool's own findings; other commands only matter when the wrapped call is denied.
  // Kubernetes and pulumi calls never deny there, so their asks count too.
  const i = args.findIndex(a => {
    const t = argTool(a)
    return (!k8sOnly && (TF.has(t) || t === 'pulumi')) || K8S.has(t)
  })
  if (i < 0) return []
  const tool = argTool(args[i])
  const wrapped = K8S.has(tool)
    ? k8sFindings(tool, [...prefix, ...words.slice(0, k)], args.slice(i + 1), vars, env, files)
    : tool === 'pulumi' ? pulumiFindings(args.slice(i + 1), vars) : classifyTf(args.slice(i + 1), tool, vars)
  const denied = wrapped.some(([kind]) => kind === 'deny')
  if (DATA_CMDS.has(cmd)) return denied && TF.has(tool) ? [['ask', 'An unrecognized command wraps a guarded tool.']] : []
  return pathLike || denied || K8S.has(tool) || tool === 'pulumi' ? wrapped : []
}

// Findings for the arguments of aws, or of python -m awscli.
function awsFindings(args: readonly string[], vars: Vars, nesting: number): Finding[] {
  if (awsHelp(args)) return []
  const out: Finding[] = [['gate', SUBAGENT_REASON]]
  const op = awsOp(args, vars)
  if (SUBST.test(op[0]) || /[$`]/.test(op[1])) out.push(['ask', 'A variable or substitution as the aws operation cannot be checked.'])
  else if (awsDestructive(op, args)) out.push(['ask', 'This aws command deletes, stops, or loosens access to resources.'])
  else if (nesting > 0 && !awsReadOnly(op[1])) out.push(['ask', NESTED_REASON])
  return out
}

// The awscli package as pip names it, with a version or extras spec.
const AWSCLI_PACKAGE = /^awscli(?:[=<>~!\[;@].*)?$/
// Whether the word at n comes after pip, pip3, pipx or uv and then install or add.
function pipInstall(args: readonly string[], n: number): boolean {
  const p = args.findIndex(a => /^(?:pip[\d.]*|pipx|uv)$/.test(basename(a)))
  return p >= 0 && args.some((a, i) => i > p && i < n && (a === 'install' || a === 'add'))
}

// Where the aws arguments start after python's `-m awscli` (its own options before it skipped,
// bundled ones such as -Im included), or null when python runs a script, code or another module.
function awscliStart(args: readonly string[]): number | null {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--check-hash-based-pycs') i++ // python's one long option with a separate value
    if (a.startsWith('--') && a !== '--') continue
    if (!a.startsWith('-') || a === '-' || a === '--') return null
    for (let j = 1; j < a.length; j++) {
      const ch = a[j]
      if (ch === 'c') return null
      if (ch === 'm' || ch === 'W' || ch === 'X') {
        const value = j + 1 < a.length ? a.slice(j + 1) : args[++i]
        if (ch === 'm') return value === 'awscli' ? i + 1 : null
        break
      }
    }
  }
  return null
}

// nix options that take one or two separate values.
const NIX_VALUE_1: ReadonlySet<string> = new Set(['-I', '--include', '--store', '--eval-store', '--log-format',
  '--extra-experimental-features', '--experimental-features', '--inputs-from', '--expr', '--file', '-f', '--profile', '--keep', '-k',
  '--unset', '-u', '--max-jobs', '-j', '--cores', '--system', '--builders', '--substituters', '--extra-substituters', '--update-input',
  '--reference-lock-file', '--output-lock-file', '--out-link', '-o', '--priority', '--arg-from-stdin'])
const NIX_VALUE_2: ReadonlySet<string> = new Set(['--option', '--arg', '--argstr', '--override-input', '--override-flake', '--arg-from-file'])
const NIX_SUBCMDS: ReadonlySet<string> = new Set(['run', 'shell', 'develop', 'build', 'eval', 'flake', 'profile', 'search', 'repl',
  'bundle', 'copy', 'edit', 'fmt', 'formatter', 'log', 'path-info', 'print-dev-env', 'why-depends', 'registry', 'store', 'hash', 'key',
  'nar', 'realisation', 'upgrade-nix', 'config', 'daemon', 'derivation', 'env', 'help', 'doctor', 'show-config'])
// The index after the nix option at n and its values.
const nixSkip = (words: readonly string[], n: number): number =>
  n + 1 + (NIX_VALUE_2.has(words[n]) ? 2 : NIX_VALUE_1.has(words[n]) ? 1 : 0)

// The nix subcommand after the nix word at k and its index: the first word, past options and their
// values, that names one, so a later `shell` among a program's arguments is not it. `nix env shell` is shell.
function nixSub(words: readonly string[], k: number): [string, number] | null {
  for (let n = k + 1; n < words.length;) {
    const w = words[n]
    if (w === '--') return null
    if (w.startsWith('-')) n = nixSkip(words, n)
    else if (!NIX_SUBCMDS.has(w)) n++
    else return w === 'env' && words[n + 1] === 'shell' ? ['shell', n + 1] : [w, n]
  }
  return null
}

// The program an installable's last attribute names: through NIX_PROGRAMS, with a version or
// wrapper suffix dropped when what is left names a guarded tool (terraform_1, kubernetes-helm-wrapped).
function nixProgram(attr: string): string {
  const known = (a: string): string | undefined => NIX_PROGRAMS.get(a) ?? (TOOLS.has(a) || K8S.has(a) ? a : undefined)
  const bare = new RegExp(`^(.+?)${NIX_SUFFIX}$`).exec(attr)?.[1]
  return known(attr) ?? (bare === undefined ? undefined : known(bare)) ?? attr
}

// nix run <installable> [--] <args>: the program, named by the installable's attribute, and the index
// of its first argument; null when no installable names an attribute. The installable is the first word
// with a `#` past nix's options and their values, or the word right after a `--` that comes before it,
// whose arguments then start right after it. Otherwise its arguments start after the first `--` when
// only options come before it, else at the first word that is not an option.
function nixRun(words: readonly string[], k: number): [string, number] | null {
  const sub = nixSub(words, k)
  if (sub?.[0] !== 'run') return null
  let at = -1
  let ended = false
  for (let n = sub[1] + 1; n < words.length && at < 0;) {
    const w = words[n]
    if (w === '--') {
      if (n + 1 >= words.length) return null
      at = n + 1
      ended = true
    } else if (w.startsWith('-')) n = nixSkip(words, n)
    else if (w.includes('#')) at = n
    else n++
  }
  if (at < 0 || !words[at].includes('#')) return null
  const attr = words[at].slice(words[at].indexOf('#') + 1).split('.').at(-1) ?? ''
  if (!/^[\w+-]+$/.test(attr)) return null
  let from = at + 1
  while (!ended && from < words.length && words[from].startsWith('-')) {
    if (words[from] === '--') {
      from++
      break
    }
    from = nixSkip(words, from)
  }
  return [nixProgram(attr), Math.min(from, words.length)]
}

// A heredoc body that is read as commands rather than data: one whose delimiter never comes (it
// runs to the end of the script), or an unquoted one that holds a substitution. The guard parses
// such a body whole, so a tool call beside the substitution is seen too.
const runs = (script: string, h: ShellHeredoc): boolean =>
  (h.body !== '' && script.endsWith(h.body)) || (!h.quoted && SUBST.test(h.body))

// Findings for the commands of one parsed script, then for each heredoc body it runs. Commands
// under one compound share their heredoc objects, so each body is parsed once.
// Loops, functions, traps and watch run commands out of their written order, and a background job
// (a lone `&`, not `&&`, `|&`, `;&` or a redirect's `>&`, `<&`, `&>`) runs beside the commands after
// it, so in such a script any command may run first.
const UNORDERED_RE = /(?<![\w./-])(?:for|while|until|select|foreach|repeat|function|trap|coproc|watch)(?![\w./-])|\(\s*\)|(?<![&|;<>])&(?![&>])/

function scriptFindings(commands: readonly ShellCommand[], script: string, depth: number, k8sOnly: boolean, outer: Files): Finding[] {
  const vars = collectVars(commands, script)
  const envSeen = collectEnv(commands)
  // A kubeconfig is read for a command only when outer allows it and no command that runs before it
  // can write one: an earlier command, one of its own substitutions (they run first), or, for a
  // command in a pipeline (its stages run at once) or in an unordered script, any other command.
  // Later commands cannot change what it has already read. Each is checked once, and only when a
  // check needs a file.
  const writes: (boolean | undefined)[] = []
  const writer = (j: number): boolean => (writes[j] ??= !writesNothing(commands[j]))
  const unordered = UNORDERED_RE.test(plainText(script))
  const filesFor = (i: number): Files => {
    let memo: boolean | undefined
    return () => {
      if (memo === undefined) {
        const own = new Set(commands[i].subs)
        const any = unordered || commands[i].pipeline !== null
        memo = outer() && !commands.some((c, j) => j !== i && (j < i || any || own.has(c)) && writer(j))
      }
      return memo
    }
  }
  const out = commands.flatMap((c, i) => {
    // NAME=value prefixes are not among the command's words.
    const prefix = c.argv.length ? c.assigns.map(a => `${a.name}=${a.value ?? UNKNOWN_ENV}`) : []
    const env = envBefore(envSeen, i)
    const files = filesFor(i)
    return splitTasks(c).flatMap(([argv, words]) => classify(argv, words, depth, c.nesting, vars, env, prefix, k8sOnly, files))
  })
  for (const h of new Set(commands.flatMap(c => c.heredocs))) {
    if (runs(script, h)) out.push(...nestedFindings(h.body, depth + 1, k8sOnly, () => false))
  }
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

// How many times the script names a guarded tool, with quotes and line continuations joined.
const mentions = (s: string, re: RegExp = TOOL_RE): number => plainText(s).match(new RegExp(re, 'g'))?.length ?? 0

// Whether the script names a tool outside its data heredoc bodies. The bodies sit inside the
// script, so the script's count never falls below theirs; no text is cut.
const mentionedOutsideData = (script: string, data: readonly string[], re: RegExp = TOOL_RE): boolean =>
  mentions(script, re) > data.reduce((n, body) => n + mentions(body, re), 0)

const SHELL_NAMES: ReadonlySet<string> = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh'])

// Whether a command is a shell reading its program from stdin: bash, sh and the like with no -c,
// also behind wrappers, `xargs`, `busybox` or `toybox`.
function readsShellFromStdin(c: ShellCommand): boolean {
  const k = stripWrappers(c.text)
  if (k === null || k >= c.text.length) return false
  let i = k
  const head = basename(c.text[k])
  if (head === 'xargs' || MULTICALL.has(head)) i = c.text.findIndex((w, j) => j > k && !w.startsWith('-'))
  return i >= 0 && SHELL_NAMES.has(basename(c.text[i])) && nestedScript(c.argv.slice(i)) === null
}

// Whether a shell reads text from earlier pipeline stages that names a guarded tool
// (`echo '$(tofu destroy)' | sh`). A guarded tool run in an earlier stage is classified itself.
const pipedToShell = (c: ShellCommand): boolean =>
  !!c.pipeline && c.pipeline.stage > 0 && readsShellFromStdin(c) &&
  c.pipeline.earlier.some(p => {
    const first = toolName(p.text[0] ?? '')
    const text = p.text.join(' ')
    return !TOOLS.has(first) && !K8S.has(first) && (mentions(text) > 0 || mentions(text, K8S_RE) > 0)
  })

// What a command runs, after its wrappers: a shell (or eval, xargs, ssh), an interpreter, or neither.
function runner(c: ShellCommand): 'shell' | 'interp' | 'backtick' | null {
  const words = c.text[0]?.startsWith('-') ? ['time', ...c.text] : c.text // unbash reads a leading `time` as a keyword
  const k = stripWrappers(words)
  if (k === null) return 'shell'
  if (k >= words.length) return null
  const kindOf = (w: string | undefined): 'shell' | 'interp' | 'backtick' | null => {
    const n = basename(w ?? '')
    return /^(?:perl|ruby)$/.test(n) ? 'backtick' : INTERP.test(n) ? 'interp' : SHELLS.has(n) ? 'shell' : null
  }
  const direct = kindOf(words[k])
  if (direct) return direct
  // An unknown command may run a shell or interpreter named later (flock l bash, docker exec c sh). `.` and
  // `source` are left out: as arguments they are far more often paths and verbs than scripts to run.
  const later = words.slice(k + 1).filter(w => w !== '.' && basename(w) !== 'source').map(kindOf).find(x => x)
  return later ?? null
}

// Best-effort deny or ask for a command outside the allowlist. Null means no opinion.
function check(cmd: string, d: Record<string, unknown>): Decision | null {
  const parsed = parse(cmd)
  if (parsed.errors.length) return ['ask', PARSE_REASON]
  const commands = parsed.commands
  // Commands under one compound share its heredoc objects.
  const data = [...new Set(commands.flatMap(c => c.heredocs))].filter(h => !runs(cmd, h)).map(h => h.body)
  const asks: string[] = []
  const named = data.filter(b => TOOL_RE.test(b) || K8S_RE.test(b))
  if (named.length) {
    const kinds = commands.map(runner)
    const execs = (re: RegExp): boolean => named.some(b => re.test(b))
    if (kinds.includes('shell') || ((kinds.includes('interp') || kinds.includes('backtick')) && execs(EXEC_CALL)) ||
      (kinds.includes('backtick') && execs(SHELL_OUT))) {
      asks.push('A heredoc that mentions a guarded tool feeds a shell.')
    }
  }
  let results: Finding[] = []
  const tf = mentionedOutsideData(cmd, data)
  const k8s = mentionedOutsideData(cmd, data, K8S_RE)
  if (tf || k8s) {
    try {
      results = scriptFindings(commands, cmd, 0, !tf, () => true)
    } catch (e) {
      if (e instanceof ParseFailure) return ['ask', PARSE_REASON]
      throw e
    }
  }
  if (tf && commands.some(c => c.redirects.some(r => r.op === '>|'))) asks.push('A redirect or operator next to a guarded tool cannot be checked.')
  if ((tf || k8s) && commands.some(pipedToShell)) asks.push('Text that mentions a guarded tool is piped to a shell.')
  const denies = results.flatMap(([kind, reason]) => (kind === 'deny' ? [reason!] : []))
  if (denies.length) return ['deny', [...new Set(denies)].join(' ')]
  asks.push(...results.flatMap(([kind, reason]) => (kind === 'ask' || (kind === 'sensitive' && !d.agent_id) ? [reason!] : [])))
  if (d.agent_id && results.some(([kind]) => kind === 'gate' || kind === 'sensitive')) {
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
  const plain = plainText(cmd)
  if (!TOOL_RE.test(plain) && !K8S_RE.test(plain)) return null
  if (cmd.length > MAX_CMD) return ['ask', 'Command is too long to check.']
  const kind = allowlisted(cmd)
  if (kind === null) return check(cmd, input)
  // The subagent gate comes first and holds whatever the option says.
  if (kind === 'gate' && input.agent_id) {
    const ok = briefAllows(input)
    if (ok === null) return ['ask', BRIEF_REASON]
    if (!ok) return ['deny', SUBAGENT_REASON]
  }
  return autoAllow() ? ['allow', ALLOW_REASON] : null
}

// The autoAllowReadOnly option, which Claude Code passes as the string 'true' or 'false'.
const autoAllow = (): boolean => process.env.CLAUDE_PLUGIN_OPTION_AUTOALLOWREADONLY === 'true'

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
