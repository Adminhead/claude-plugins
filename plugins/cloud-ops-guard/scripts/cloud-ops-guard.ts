#!/usr/bin/env -S bun --no-env-file --config=/dev/null
// PreToolUse hook on Bash: guard OpenTofu, Terraform, Terragrunt, and AWS CLI calls, and the
// kubectl, helm, talosctl and omnictl calls that change a production cluster.
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
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { nestedScript, parse, reparse } from './shell/walk.ts'
import type { ShellCommand, ShellHeredoc } from './shell/walk.ts'

const TOKEN_LINE = 'ALLOW: cloud-ops'
const TF: ReadonlySet<string> = new Set(['tofu', 'terraform', 'terragrunt'])
const TOOLS: ReadonlySet<string> = new Set([...TF, 'aws'])
const TOOL_RE = /(?<![\w.-])(?:tofu|terraform|terragrunt|aws)(?![\w-])/
// Kubernetes tools, checked on their own path (k8sFindings) and never by the Terraform asks above.
const K8S: ReadonlySet<string> = new Set(['kubectl', 'helm', 'talosctl', 'omnictl'])
const K8S_RE = /(?<![\w.-])(?:kubectl|helm|talosctl|omnictl)(?![\w-])/
const PROD_RE = /(?:^|[^a-z0-9])prod(?:uction)?(?:[^a-z0-9]|$)/i

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
const SHELLS: ReadonlySet<string> = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'eval', 'xargs', 'source', '.', 'su', 'ssh'])
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
const QUIET_SUBS: ReadonlySet<string> = new Set(['validate', 'fmt', 'init', 'version', '-version', '--version', '-v',
  'help', '-help', '--help', '-h', 'graph', 'metadata'])
const ASK_SUBS: ReadonlySet<string> = new Set(['taint', 'untaint', 'force-unlock', 'workspace', 'get', 'login', 'logout', 'test',
  'push', 'modules'])
const SUBCMDS: ReadonlySet<string> = new Set([...QUIET_SUBS, ...ASK_SUBS, 'apply', 'destroy', 'import', 'state', 'plan', 'show',
  'providers', 'output', 'console', 'refresh'])
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
const SUBAGENT_REASON = `Subagents may not run credentialed aws, plan, or apply. Have the main session run it, or put the line '${TOKEN_LINE}' in the brief.`
const BRIEF_REASON = `Cannot read the subagent brief to check for ${TOKEN_LINE}.`
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
  return sub === 'plan' || sub === 'state show' ? 'gate' : 'safe'
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
      if (['which', 'where', 'ls'].includes(rest[0])) return words.length // a lookup, not a run
      const j = rest.findIndex(a => TOOLS.has(a) || K8S.has(a))
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

// The variables a script assigns by plain `NAME=value` commands. A prefix assignment, an
// append, or a value with an expansion or odd characters makes the name unknown.
function collectVars(commands: readonly ShellCommand[], script: string): Vars {
  const vars = new Map<string, string | null>()
  const set = (name: string, value: string | null): void => {
    const ok = value !== null && LITERAL_VALUE.test(value)
    vars.set(name, ok && (!vars.has(name) || vars.get(name) === value) ? value : null)
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
  // A name that a loop, read, arithmetic or other binding also sets is unknown, whatever its assignments say.
  for (const [name, v] of vars) if (typeof v === 'string' && bindsElsewhere(script, name)) vars.set(name, null)
  return vars
}

// Whether the script binds the variable other than by `NAME=value`: for/select, read, mapfile,
// getopts, printf -v, declare -n, let or arithmetic assignment, ${NAME:=x}, unset.
function bindsElsewhere(script: string, name: string): boolean {
  if (script.length > MAX_CMD) return true
  const n = `\\b${name}\\b`
  const stop = '[^;&|\\n]{0,200}' // bounded: the script is model-controlled text
  return [
    `\\b(?:for|select)\\s+${n}`,
    `\\b(?:read|mapfile|readarray|unset|let)\\b${stop}${n}`,
    `\\bgetopts\\s+\\S+\\s+${n}`,
    `\\bprintf\\s+-v\\s*${n}`,
    `\\b(?:declare|typeset|local)\\b${stop}-\\w*n\\w*${stop}${n}`,
    `\\(\\([^\\n)]{0,200}?${n}\\s*[-+*/%&|^<>]*=(?!=)`,
    `\\$\\{${name}:?[=]`,
  ].some(p => new RegExp(p).test(script))
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
  if (sub === 'plan') return ['gate', SUBAGENT_REASON]
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
const AWS_DESTRUCTIVE = /^(?:delete-|terminate-|remove-|deregister-|revoke-|detach-|disassociate-|disable-|stop-|put-[\w-]*-policy$)/
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

// Whether a context name or kubeconfig path is production: true, false, or 'unknown' when an expansion hides it.
function prodValue(v: string, vars: Vars): boolean | 'unknown' {
  if (v.includes(UNKNOWN_ENV)) return PROD_RE.test(v) ? true : 'unknown'
  const e = expandVars([v], vars)[0]
  if (PROD_RE.test(v) || PROD_RE.test(e)) return true
  return e === UNKNOWN || SUBST.test(e) || /^\$\{?\w+\}?$/.test(e) ? 'unknown' : false
}

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

// The current-context name from a kubeconfig: the given path, else the first $KUBECONFIG file, else ~/.kube/config.
function currentContext(file?: string): string | null {
  const kc = process.env.KUBECONFIG
  const path = file ?? (kc ? kc.split(':')[0] : join(homedir(), '.kube', 'config'))
  let fd: number | null = null
  try {
    fd = openSync(path, 'r')
    const buf = Buffer.alloc(MAX_KUBECONFIG)
    const n = readSync(fd, buf, 0, buf.length, 0)
    return /^current-context:[ \t]*["']?([^\s"']+)/m.exec(buf.subarray(0, n).toString('utf8'))?.[1] ?? null
  } catch {
    return null // an unreadable kubeconfig is not production
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

// Words that are neither flags nor values of the flags in K8S_VALUE_FLAGS.
// help is set when -h or --help stands where a flag does, not as the value of the flag before it.
function k8sWords(args: readonly string[]): { pos: string[]; help: boolean } {
  const pos: string[] = []
  let help = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a.startsWith('-') && a !== '-') {
      if (a === '-h' || a === '--help') help = true
      else if (!a.includes('=') && K8S_VALUE_FLAGS.has(a.replace(/^-+/, ''))) i++
    } else pos.push(a)
  }
  return { pos, help }
}

// Whether the command targets production: --context or --kube-context, else --kubeconfig, else a
// KUBECONFIG= prefix or export, else the current-context of the kubeconfig in use (read only when asked).
function prodTarget(tool: string, pre: readonly string[], args: readonly string[], vars: Vars, env: Vars): boolean | 'unknown' {
  const prefixed = (name: string): string | undefined => pre.findLast(w => w.startsWith(`${name}=`))?.slice(name.length + 1) || undefined
  const cluster = flagValue(args, ['--cluster'])
  if (cluster !== undefined && prodValue(cluster, vars) === true) return true
  const ctx = flagValue(args, ['--context', '--kube-context']) ?? (tool === 'helm' ? prefixed('HELM_KUBECONTEXT') : undefined)
  if (ctx !== undefined) return prodValue(ctx, vars)
  const helmEnv = tool === 'helm' ? env.get('HELM_KUBECONTEXT') : undefined
  if (helmEnv) {
    // An earlier export may sit in a subshell, so the process's own context still weighs in.
    const r = prodValue(helmEnv, vars)
    return r === true || processProd() ? true : r
  }
  const flagKc = flagValue(args, ['--kubeconfig'])
  if (flagKc !== undefined) {
    const r = prodValue(flagKc, vars)
    if (r !== false || /[~$`]/.test(flagKc)) return r
    const cur = currentContext(flagKc) // a file not named prod can still select a prod context
    return cur !== null && PROD_RE.test(cur)
  }
  const preKc = prefixed('KUBECONFIG')
  if (preKc !== undefined) return prodValue(preKc, vars)
  const envKc = env.get('KUBECONFIG')
  if (envKc) {
    const r = prodValue(envKc, vars)
    return r === true || processProd() ? true : r
  }
  return processProd()
}

const processProd = (): boolean => {
  const cur = currentContext()
  return cur !== null && PROD_RE.test(cur)
}

// Findings for kubectl, helm, talosctl and omnictl. On a production cluster a mutation asks, and a
// subagent needs the brief token. Deleting volumes, claims, CRDs or nodes there is denied.
function k8sFindings(tool: string, pre: readonly string[], args: readonly string[], vars: Vars, env: Vars): Finding[] {
  const { pos, help } = k8sWords(args)
  if (help) return [] // help text changes nothing
  const gated = (reason: string): Finding[] => [['ask', reason], ['gate', SUBAGENT_REASON]]
  if (tool === 'talosctl') {
    const hit = pos.some(w => TALOS_ASK.has(w)) || (pos.includes('etcd') && pos.includes('leave')) ||
      ((pos[0] === 'patch' || pos[0] === 'edit') && pos.some(w => /^(?:mc|machineconfigs?)$/.test(w)))
    return hit ? gated('This talosctl command resets, upgrades, reconfigures or restarts nodes.') : []
  }
  if (tool === 'omnictl') return pos.some(w => OMNI_ASK.has(w)) ? gated('This omnictl command deletes or applies Omni resources.') : []
  // Any positional word naming a mutating verb is the verb, so a flag whose value the table misses cannot hide it.
  const vi = pos.findIndex(w => K8S_MUTATING.has(w))
  const verb = vi >= 0 ? pos[vi] : (pos[0] ?? '')
  const rest = vi >= 0 ? pos.slice(vi + 1) : pos.slice(1)
  if (!verb || (vi < 0 && (tool === 'kubectl' ? KUBECTL_READ : HELM_READ).has(verb))) return []
  if (verb === 'rollout' && ['status', 'history'].includes(rest[0])) return []
  if (tool === 'kubectl' && pos[0] === 'auth' && ['can-i', 'whoami'].includes(pos[1])) return []
  const prod = prodTarget(tool, pre, args, vars, env)
  if (prod === false) return []
  // After delete, any word naming a protected kind (alone, as kind/name, or in a comma list) is denied.
  if (prod === true && tool === 'kubectl' && verb === 'delete' &&
    rest.some(w => w.split('/')[0].split(',').some(k => PROTECTED_KINDS.has(k.toLowerCase().split('.')[0])))) {
    return [['deny', K8S_DENY]]
  }
  return gated(prod === 'unknown' ? 'Cannot tell which cluster this changes.' : 'This changes a production cluster.')
}

// Commands whose arguments are usually data, so a tool name among them is not a wrapped call.
const DATA_CMDS: ReadonlySet<string> = new Set(['echo', 'printf', 'cat', 'grep', 'egrep', 'fgrep', 'rg', 'sed', 'awk', 'head', 'tail',
  'tee', 'git', 'gh', 'jq', 'yq', 'man', 'which', 'whereis', 'type', 'ls', 'diff', 'wc', 'sort', 'uniq', 'cut', 'tr', 'fd', 'find',
  'rm', 'cp', 'mv', 'mkdir', 'touch', 'chmod', 'cd', 'test', '[', '[[', 'brew', 'apt', 'apt-get', 'dnf', 'yum', 'pacman', 'yay', 'pip',
  'pip3', 'npm', 'pnpm', 'cargo', 'go', 'gem'])

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

// Findings for the script text of sh -c or eval, parsed one level deeper.
function nestedFindings(script: string, depth: number, k8sOnly: boolean): Finding[] {
  const r = reparse(script, depth)
  if (r.errors.length) throw new ParseFailure(r.errors[0].message)
  return scriptFindings(r.commands, script, depth, k8sOnly)
}

// Findings for one task: a word list in which expansions stay as written (`text`) and `argv` keeps
// the literal value, or null, for nestedScript. With k8sOnly the script names no Terraform or aws
// tool, so only the Kubernetes tools are checked, and none of the generic asks apply.
function classify(argv: readonly (string | null)[], words: readonly string[], depth: number, nesting: number, vars: Vars, env: Vars,
  prefix: readonly string[], k8sOnly: boolean): Finding[] {
  const k = stripWrappers(words)
  if (k === null) return [['ask', 'A wrapper option such as env -S or mise exec -c hides the command.']]
  if (k >= words.length) return []
  const cmd = basename(words[k])
  const args = words.slice(k + 1)
  // A path whose last part is literal (`$S/locked.sh`) is a script the wrapped-tool check below sees through.
  // A variable or substitution in the last part (`$D/$T`, `$(echo /usr/bin/tofu)`) may name any command.
  const pathLike = words[k].includes('/') && !SUBST.test(words[k]) && !basename(words[k]).includes('$')
  // A variable that holds a Kubernetes command is read as that command, so `K="kubectl --context prod"; $K delete pv x` is judged.
  const bare = /^\$(\w+)$|^\$\{(\w+)\}$/.exec(words[k])
  const held = bare ? vars.get(bare[1] ?? bare[2]) : undefined
  if (typeof held === 'string' && K8S.has(basename(held.split(' ')[0]))) {
    const parts = held.split(' ')
    return classify([...argv.slice(0, k), ...parts, ...argv.slice(k + 1)], [...words.slice(0, k), ...parts, ...words.slice(k + 1)],
      depth, nesting, vars, env, prefix, k8sOnly)
  }
  if (/[$`]/.test(words[k]) && !pathLike) return k8sOnly ? [] : [['ask', 'A variable or substitution names the command.']]
  if (SHELLS.has(cmd) || INTERP.test(cmd)) {
    const script = nestedScript(argv.slice(k))
    const out = script === null ? [] : nestedFindings(script, depth + 1, k8sOnly)
    // Kubernetes tools named among the arguments of a command that re-runs them (xargs, eval, ssh) or of a script file.
    const k8sArg = INTERP.test(cmd)
      ? args.some(a => K8S_RE.test(a) && (EXEC_CALL.test(a) || (/^(?:perl|ruby)$/.test(cmd) && SHELL_OUT.test(a))))
      : args.some(a => K8S_RE.test(a)) && (ANY_DOLLAR.has(cmd) || script === null)
    if (k8sOnly) {
      if (k8sArg) out.push(['ask', 'A shell, eval, or xargs wraps a guarded tool and cannot be checked.'])
      return out
    }
    const hidden = ANY_DOLLAR.has(cmd) ? args.some(a => a.includes('$')) : operandHidden(cmd, argv.slice(k))
    if (hidden || k8sArg || args.some(a => TOOL_RE.test(a))) {
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
  if (K8S.has(cmd)) return k8sFindings(cmd, [...prefix, ...words.slice(0, k)], args, vars, env)
  if (cmd === 'aws' && !k8sOnly) {
    if (awsHelp(args)) return []
    const out: Finding[] = [['gate', SUBAGENT_REASON]]
    const op = awsOp(args, vars)
    if (SUBST.test(op[0]) || /[$`]/.test(op[1])) out.push(['ask', 'A variable or substitution as the aws operation cannot be checked.'])
    else if (awsDestructive(op, args)) out.push(['ask', 'This aws command deletes, stops, or loosens access to resources.'])
    else if (nesting > 0 && !awsReadOnly(op[1])) out.push(['ask', NESTED_REASON])
    return out
  }
  // A guarded tool after a command the guard does not know may be a wrapped call. A script path
  // gets the wrapped tool's own findings; other commands only matter when the wrapped call is denied.
  const i = args.findIndex(a => (!k8sOnly && TF.has(basename(a))) || K8S.has(basename(a)))
  if (i < 0) return []
  const tool = basename(args[i])
  const wrapped = K8S.has(tool)
    ? k8sFindings(tool, [...prefix, ...words.slice(0, k)], args.slice(i + 1), vars, env)
    : classifyTf(args.slice(i + 1), tool, vars)
  const denied = wrapped.some(([kind]) => kind === 'deny')
  if (DATA_CMDS.has(cmd)) return denied && !K8S.has(tool) ? [['ask', 'An unrecognized command wraps a guarded tool.']] : []
  return pathLike || denied || K8S.has(tool) ? wrapped : []
}

// A heredoc body that is read as commands rather than data: one whose delimiter never comes (it
// runs to the end of the script), or an unquoted one that holds a substitution. The guard parses
// such a body whole, so a tool call beside the substitution is seen too.
const runs = (script: string, h: ShellHeredoc): boolean =>
  (h.body !== '' && script.endsWith(h.body)) || (!h.quoted && SUBST.test(h.body))

// Findings for the commands of one parsed script, then for each heredoc body it runs. Commands
// under one compound share their heredoc objects, so each body is parsed once.
function scriptFindings(commands: readonly ShellCommand[], script: string, depth: number, k8sOnly: boolean): Finding[] {
  const vars = collectVars(commands, script)
  const envSeen = collectEnv(commands)
  const out = commands.flatMap((c, i) => {
    // NAME=value prefixes are not among the command's words.
    const prefix = c.argv.length ? c.assigns.map(a => `${a.name}=${a.value ?? UNKNOWN_ENV}`) : []
    const env = envBefore(envSeen, i)
    return splitTasks(c).flatMap(([argv, words]) => classify(argv, words, depth, c.nesting, vars, env, prefix, k8sOnly))
  })
  for (const h of new Set(commands.flatMap(c => c.heredocs))) {
    if (runs(script, h)) out.push(...nestedFindings(h.body, depth + 1, k8sOnly))
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
// also behind wrappers, `xargs` or `busybox`.
function readsShellFromStdin(c: ShellCommand): boolean {
  const k = stripWrappers(c.text)
  if (k === null || k >= c.text.length) return false
  let i = k
  if (['xargs', 'busybox'].includes(basename(c.text[k]))) i = c.text.findIndex((w, j) => j > k && !w.startsWith('-'))
  return i >= 0 && SHELL_NAMES.has(basename(c.text[i])) && nestedScript(c.argv.slice(i)) === null
}

// Whether a shell reads text from earlier pipeline stages that names a guarded tool
// (`echo '$(tofu destroy)' | sh`). A guarded tool run in an earlier stage is classified itself.
const pipedToShell = (c: ShellCommand): boolean =>
  !!c.pipeline && c.pipeline.stage > 0 && readsShellFromStdin(c) &&
  c.pipeline.earlier.some(p => {
    const first = basename(p.text[0] ?? '')
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
      results = scriptFindings(commands, cmd, 0, !tf)
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
