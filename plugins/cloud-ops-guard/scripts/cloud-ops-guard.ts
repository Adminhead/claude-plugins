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
const EXEC_CALL = /subprocess|\bos\.(?:system|popen|exec|spawn)|\bPopen|\bsystem\b|\bexec\w*|\bspawn\w*|\bpopen|child_process|Open3|%x|`/
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
function collectVars(commands: readonly ShellCommand[]): Vars {
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
  return vars
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
    return rest.some(a => /^--?(?:json|raw)$/.test(a)) ? ['sensitive', `${sub} -json or -raw prints sensitive values.`] : ['gate', SUBAGENT_REASON]
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
  '--cli-read-timeout', '--cli-connect-timeout', '--color'])

// The service and operation words of an aws command ('' when absent), skipping global options.
function awsOp(args: readonly string[]): [string, string] {
  const pos: string[] = []
  for (let i = 0; i < args.length && pos.length < 2; i++) {
    const a = args[i]
    if (a.startsWith('-')) {
      if (AWS_VALUE_FLAGS.has(a)) i++
    } else if (!/^\$\{?\w+\}?$/.test(a)) pos.push(a) // a bare variable may hold options, as in aws $P lambda list-functions
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
  'field-selector', 'replicas', 'p', 'patch', 'patch-file', 'e', 'endpoints', 'nodes', 'talosconfig', 'omniconfig'])
const KUBECTL_READ: ReadonlySet<string> = new Set(['get', 'describe', 'logs', 'top', 'explain', 'api-resources', 'api-versions', 'version',
  'cluster-info', 'diff', 'events', 'wait', 'port-forward', 'proxy', 'auth', 'config', 'completion', 'kustomize', 'options', 'plugin', 'help'])
const HELM_READ: ReadonlySet<string> = new Set(['list', 'ls', 'get', 'status', 'history', 'show', 'search', 'repo', 'template', 'lint',
  'version', 'env', 'dependency', 'dep', 'pull', 'package', 'verify', 'plugin', 'completion', 'help', 'diff'])
// talosctl and omnictl subcommands that change or restart nodes and clusters, asked in any context.
const TALOS_ASK: ReadonlySet<string> = new Set(['reset', 'upgrade', 'apply-config', 'reboot', 'shutdown', 'remove-member'])
const OMNI_ASK: ReadonlySet<string> = new Set(['delete', 'apply'])
// kubectl delete targets that are denied on production.
const PROTECTED_KINDS: ReadonlySet<string> = new Set(['pv', 'pvs', 'persistentvolume', 'persistentvolumes', 'pvc', 'pvcs',
  'persistentvolumeclaim', 'persistentvolumeclaims', 'crd', 'crds', 'customresourcedefinition', 'customresourcedefinitions',
  'no', 'node', 'nodes'])
const K8S_DENY = 'Deleting persistent volumes, claims, CRDs or nodes on a production cluster needs the user.'
const MAX_KUBECONFIG = 1 << 20 // bytes of a kubeconfig the guard reads
const UNKNOWN_ENV = '\0'

// KUBECONFIG as the script sets it with NAME=value or export, every value joined by ':' (UNKNOWN_ENV when an expansion hides one).
function collectEnv(commands: readonly ShellCommand[]): Vars {
  const seen: string[] = []
  for (const c of commands) {
    if (c.argv.length === 0) {
      for (const a of c.assigns) if (a.name === 'KUBECONFIG') seen.push(a.value ?? UNKNOWN_ENV)
    } else if (['export', 'declare', 'typeset', 'local', 'readonly'].includes(c.text[0])) {
      for (const w of c.text) if (w.startsWith('KUBECONFIG=')) seen.push(w.slice('KUBECONFIG='.length))
    }
  }
  return new Map(seen.length ? [['KUBECONFIG', seen.join(':')]] : [])
}

// Whether a context name or kubeconfig path is production: true, false, or 'unknown' when an expansion hides it.
function prodValue(v: string, vars: Vars): boolean | 'unknown' {
  if (v.includes(UNKNOWN_ENV)) return PROD_RE.test(v) ? true : 'unknown'
  const e = expandVars([v], vars)[0]
  if (PROD_RE.test(v) || PROD_RE.test(e)) return true
  return e === UNKNOWN || SUBST.test(e) || /^\$\{?\w+\}?$/.test(e) ? 'unknown' : false
}

// The value of the last `--name value` or `--name=value` among args, or undefined.
function flagValue(args: readonly string[], names: readonly string[]): string | undefined {
  let out: string | undefined
  for (const [i, a] of args.entries()) {
    for (const n of names) {
      if (a === n) out = args[i + 1] ?? ''
      else if (a.startsWith(`${n}=`)) out = a.slice(n.length + 1)
    }
  }
  return out
}

// The current-context name from the kubeconfig the environment selects: the first $KUBECONFIG file, else ~/.kube/config.
function currentContext(): string | null {
  const kc = process.env.KUBECONFIG
  const path = kc ? kc.split(':')[0] : join(homedir(), '.kube', 'config')
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
function k8sWords(args: readonly string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a.startsWith('-') && a !== '-') {
      if (!a.includes('=') && K8S_VALUE_FLAGS.has(a.replace(/^-+/, ''))) i++
    } else out.push(a)
  }
  return out
}

// Whether the command targets production: --context or --kube-context, else --kubeconfig, else a
// KUBECONFIG= prefix or export, else the current-context of the kubeconfig in use (read only when asked).
function prodTarget(pre: readonly string[], args: readonly string[], vars: Vars, env: Vars): boolean | 'unknown' {
  const ctx = flagValue(args, ['--context', '--kube-context'])
  if (ctx !== undefined) return prodValue(ctx, vars)
  const kc = flagValue(args, ['--kubeconfig']) ?? pre.findLast(w => w.startsWith('KUBECONFIG='))?.slice('KUBECONFIG='.length) ?? env.get('KUBECONFIG')
  if (kc !== undefined && kc !== null) return prodValue(kc, vars)
  const cur = currentContext()
  return cur !== null && PROD_RE.test(cur)
}

// Findings for kubectl, helm, talosctl and omnictl. On a production cluster a mutation asks, and a
// subagent needs the brief token. Deleting volumes, claims, CRDs or nodes there is denied.
function k8sFindings(tool: string, pre: readonly string[], args: readonly string[], vars: Vars, env: Vars): Finding[] {
  if (args.some(a => a === '--help' || a === '-h')) return [] // help text changes nothing
  const pos = k8sWords(args)
  const gated = (reason: string): Finding[] => [['ask', reason], ['gate', SUBAGENT_REASON]]
  if (tool === 'talosctl') return pos.some(w => TALOS_ASK.has(w)) ? gated('This talosctl command resets, upgrades, reconfigures or restarts nodes.') : []
  if (tool === 'omnictl') return pos.some(w => OMNI_ASK.has(w)) ? gated('This omnictl command deletes or applies Omni resources.') : []
  const verb = pos[0] ?? ''
  if (!verb || (tool === 'kubectl' ? KUBECTL_READ : HELM_READ).has(verb)) return []
  if (verb === 'rollout' && ['status', 'history'].includes(pos[1])) return []
  const prod = prodTarget(pre, args, vars, env)
  if (prod === false) return []
  if (prod === true && tool === 'kubectl' && verb === 'delete') {
    const targets = pos.slice(1)
    const typed = targets[0]?.includes('/') ? targets : targets.slice(0, 1)
    if (typed.some(w => w.split('/')[0].split(',').some(k => PROTECTED_KINDS.has(k.toLowerCase().split('.')[0])))) return [['deny', K8S_DENY]]
  }
  return gated(prod === 'unknown' ? 'Cannot tell which cluster this changes.' : 'This changes a production cluster.')
}

// Commands whose arguments are usually data, so a tool name among them is not a wrapped call.
const DATA_CMDS: ReadonlySet<string> = new Set(['echo', 'printf', 'cat', 'grep', 'egrep', 'fgrep', 'rg', 'sed', 'awk', 'head', 'tail',
  'tee', 'git', 'gh', 'jq', 'yq', 'man', 'which', 'whereis', 'type', 'ls', 'diff', 'wc', 'sort', 'uniq', 'cut', 'tr', 'fd', 'find',
  'rm', 'cp', 'mv', 'mkdir', 'touch', 'chmod', 'cd', 'test', '[', '[['])

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
  const pathLike = words[k].includes('/')
  // A bare variable may be any command. A path with a variable (`$S/locked.sh`) is a script the wrapped-tool check below sees through.
  if (/[$`]/.test(words[k]) && !pathLike) return k8sOnly ? [] : [['ask', 'A variable or substitution names the command.']]
  if (SHELLS.has(cmd) || INTERP.test(cmd)) {
    const script = nestedScript(argv.slice(k))
    const out = script === null ? [] : nestedFindings(script, depth + 1, k8sOnly)
    if (k8sOnly) return out
    const hidden = ANY_DOLLAR.has(cmd) ? args.some(a => a.includes('$')) : operandHidden(cmd, argv.slice(k))
    if (hidden || args.some(a => TOOL_RE.test(a))) {
      out.push(['ask', 'A shell, eval, or xargs wraps a guarded tool and cannot be checked.'])
    }
    return out
  }
  if (TF.has(cmd)) {
    const out = classifyTf(args, cmd, vars)
    if (nesting > 0) out.push(['ask', NESTED_REASON])
    return out
  }
  if (K8S.has(cmd)) return k8sFindings(cmd, [...prefix, ...words.slice(0, k)], args, vars, env)
  if (k8sOnly) return []
  if (cmd === 'aws') {
    if (awsHelp(args)) return []
    const out: Finding[] = [['gate', SUBAGENT_REASON]]
    const op = awsOp(args)
    if (op.some(w => SUBST.test(w))) out.push(['ask', 'A substitution as the aws service or operation cannot be checked.'])
    else if (awsDestructive(op, args)) out.push(['ask', 'This aws command deletes, stops, or loosens access to resources.'])
    else if (nesting > 0 && !awsReadOnly(op[1])) out.push(['ask', NESTED_REASON])
    return out
  }
  // A guarded tool after a command the guard does not know may be a wrapped call. A script path
  // gets the wrapped tool's own findings; other commands only matter when the wrapped call is denied.
  const i = args.findIndex(a => TF.has(basename(a)))
  if (i < 0) return []
  const wrapped = classifyTf(args.slice(i + 1), basename(args[i]), vars)
  const denied = wrapped.some(([kind]) => kind === 'deny')
  if (DATA_CMDS.has(cmd)) return denied ? [['ask', 'An unrecognized command wraps a guarded tool.']] : []
  return pathLike || denied ? wrapped : []
}

// A heredoc body that is read as commands rather than data: one whose delimiter never comes (it
// runs to the end of the script), or an unquoted one that holds a substitution. The guard parses
// such a body whole, so a tool call beside the substitution is seen too.
const runs = (script: string, h: ShellHeredoc): boolean =>
  (h.body !== '' && script.endsWith(h.body)) || (!h.quoted && SUBST.test(h.body))

// Findings for the commands of one parsed script, then for each heredoc body it runs. Commands
// under one compound share their heredoc objects, so each body is parsed once.
function scriptFindings(commands: readonly ShellCommand[], script: string, depth: number, k8sOnly: boolean): Finding[] {
  const vars = collectVars(commands)
  const env = collectEnv(commands)
  const out = commands.flatMap(c => {
    // NAME=value prefixes are not among the command's words.
    const prefix = c.argv.length ? c.assigns.map(a => `${a.name}=${a.value ?? UNKNOWN_ENV}`) : []
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
  c.pipeline.earlier.some(p => !TOOLS.has(basename(p.text[0] ?? '')) && mentions(p.text.join(' ')) > 0)

// What a command runs, after its wrappers: a shell (or eval, xargs, ssh), an interpreter, or neither.
function runner(c: ShellCommand): 'shell' | 'interp' | null {
  const words = c.text[0]?.startsWith('-') ? ['time', ...c.text] : c.text // unbash reads a leading `time` as a keyword
  const k = stripWrappers(words)
  if (k === null) return 'shell'
  if (k >= words.length) return null
  const kindOf = (w: string | undefined): 'shell' | 'interp' | null => {
    const n = basename(w ?? '')
    return INTERP.test(n) ? 'interp' : SHELLS.has(n) ? 'shell' : null
  }
  const name = basename(words[k])
  if (name === 'mise') return words.slice(k + 1).map(kindOf).find(x => x) ?? null
  if (name === 'busybox') return kindOf(words.slice(k + 1).find(w => !w.startsWith('-')))
  return kindOf(words[k])
}

// Best-effort deny or ask for a command outside the allowlist. Null means no opinion.
function check(cmd: string, d: Record<string, unknown>): Decision | null {
  const parsed = parse(cmd)
  if (parsed.errors.length) return ['ask', PARSE_REASON]
  const commands = parsed.commands
  // Commands under one compound share its heredoc objects.
  const data = [...new Set(commands.flatMap(c => c.heredocs))].filter(h => !runs(cmd, h)).map(h => h.body)
  const asks: string[] = []
  const named = data.filter(b => TOOL_RE.test(b))
  if (named.length) {
    const kinds = commands.map(runner)
    if (kinds.includes('shell') || (kinds.includes('interp') && named.some(b => EXEC_CALL.test(b)))) {
      asks.push('A heredoc that mentions a guarded tool feeds a shell.')
    }
  }
  let results: Finding[] = []
  const tf = mentionedOutsideData(cmd, data)
  if (tf || mentionedOutsideData(cmd, data, K8S_RE)) {
    try {
      results = scriptFindings(commands, cmd, 0, !tf)
    } catch (e) {
      if (e instanceof ParseFailure) return ['ask', PARSE_REASON]
      throw e
    }
  }
  if (tf) {
    if (commands.some(c => c.redirects.some(r => r.op === '>|'))) asks.push('A redirect or operator next to a guarded tool cannot be checked.')
    if (commands.some(pipedToShell)) asks.push('Text that mentions a guarded tool is piped to a shell.')
  }
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
