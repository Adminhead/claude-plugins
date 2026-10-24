// Finds git commands that skip or redirect git hooks or signing, for one command (`-c`, `--config-env`, the
// environment, `--no-verify`) or for good (`git config` setting, unsetting or dropping the keys and sections, or
// defining an alias that skips them). Pure: no I/O.
//
// Adapted from ECC's scripts/hooks/block-no-verify.js (MIT, (c) 2026 Affaan Mustafa) and wshobson's
// block-no-verify plugin (MIT, (c) 2024 Seth Hobson), rewritten on the shell AST walker so words inside
// quotes (a commit message that mentions --no-verify) are never read as flags. It targets model habits,
// not a determined adversary: variable indirection, aliases already in a config file and script files are out of scope.

import { nestedScript, parse, reparse } from './shell/walk.ts'
import type { ShellCommand } from './shell/walk.ts'

// Hits are denied. `config-edit` (a git config change the guard cannot read) and `unparsed` ask.
export type GitHit = { rule: 'no-verify' | 'no-gpg-sign' | 'hooks-path' | 'skip-env'; message: string }
export type GitAsk = { rule: 'config-edit' | 'unparsed'; message: string }
export type GitVerdict = GitHit | GitAsk | null
type Rule = GitHit['rule'] | 'config-edit'

export const isAsk = (v: NonNullable<GitVerdict>): v is GitAsk => v.rule === 'config-edit' || v.rule === 'unparsed'

export const MAX_COMMAND = 64 * 1024
const MAX_REPARSE = 256 * 1024

const FIX = 'Fix what the hook reports and commit again; if a hook itself is broken, tell the user.'
const MESSAGES: Record<Rule, string> = {
  'no-verify': `check-bypass-guard: --no-verify (or commit -n), also inside a git alias, skips the git hooks. ${FIX}`,
  'no-gpg-sign': `check-bypass-guard: --no-gpg-sign, or setting gpgsign to false or removing it (with -c or git config), skips commit signing. Sign the commit, or ask the user.`,
  'hooks-path': `check-bypass-guard: setting, overriding or removing core.hooksPath or an include path (with -c, the environment or git config) redirects the git hooks. ${FIX}`,
  'skip-env': `check-bypass-guard: SKIP, HUSKY=0 and LEFTHOOK=0 turn off pre-commit, husky or lefthook hooks. ${FIX}`,
  'config-edit': 'check-bypass-guard: this git config change opens an editor, has a key or value that could not be read (a gpgsign value that is not plainly true or false, a shell alias that names a bypass), or uses an option the guard does not know, so it may change core.hooksPath, include paths, signing or an alias that skips them. Confirm it leaves the hooks and signing on.',
}
const UNPARSED = 'check-bypass-guard: this git command could not be checked for hook bypasses (too long, not plain bash, or behind too many wrappers). Confirm it skips no hooks.'

type Argv = readonly (string | null)[]
const base = (t: string | null) => (t ?? '').slice((t ?? '').lastIndexOf('/') + 1)

// Wrappers that run the rest of their words as a command, with the short and long options that take a value.
const WRAPPERS: Record<string, { short: string; long?: string[]; operands?: number }> = {
  env: { short: 'uC', long: ['--unset', '--chdir'] },
  command: { short: '' },
  builtin: { short: '' },
  exec: { short: 'a' },
  nice: { short: 'n', long: ['--adjustment'] },
  nohup: { short: '' },
  time: { short: 'fo', long: ['--format', '--output'] },
  timeout: { short: 'sk', long: ['--signal', '--kill-after'], operands: 1 },
  stdbuf: { short: 'ioe', long: ['--input', '--output', '--error'] },
  sudo: { short: 'ugChprtUDRT', long: ['--user', '--group', '--host', '--prompt', '--chdir'] },
  doas: { short: 'uC' },
  xargs: { short: 'adEILnPs', long: ['--arg-file', '--delimiter', '--eof', '--max-lines', '--max-args', '--max-procs', '--max-chars', '--replace'] },
}

const ASSIGN = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s

export type View = { argv: Argv; env: { name: string; value: string | null }[] }

const MAX_WRAPPERS = 8

// The command and what its wrappers run, each with the NAME=value words in front of it (env's included). `deep` is set
// when a wrapper is still in front after MAX_WRAPPERS levels, so what it runs was not read.
export function views(c: ShellCommand): View[] & { deep?: boolean } {
  const env = c.assigns.filter(a => a.name !== null).map(a => ({ name: a.name!, value: a.value }))
  const out: View[] & { deep?: boolean } = [{ argv: c.argv, env }]
  let argv = c.argv
  for (let level = 0; ; level++) {
    const w = WRAPPERS[base(argv[0])]
    if (!w) break
    if (level === MAX_WRAPPERS) {
      out.deep = true
      break
    }
    let i = 1
    const extra: View['env'] = []
    for (; i < argv.length; i++) {
      const a = argv[i]
      if (a === null) return out
      if (a === '--') {
        i++
        break
      }
      const m = ASSIGN.exec(a)
      if (m && (base(argv[0]) === 'env' || base(argv[0]) === 'sudo')) {
        extra.push({ name: m[1], value: m[2] })
        continue
      }
      if (a[0] !== '-' || a === '-') break
      if (a.startsWith('--')) {
        if (!a.includes('=') && w.long?.includes(a)) i++
        continue
      }
      for (let k = 1; k < a.length; k++) {
        if (!w.short.includes(a[k])) continue
        if (k === a.length - 1) i++
        break
      }
    }
    i += w.operands ?? 0
    if (i >= argv.length) break
    argv = argv.slice(i)
    out.push({ argv, env: [...out[out.length - 1].env, ...extra] })
  }
  return out
}

// git config keys that move or drop the hooks, or turn signing off.
const isHookKey = (k: string) => /^(?:core\.hookspath|include\.path|includeif\..*\.path)$/.test(k.toLowerCase())
const isSignKey = (k: string) => /^(?:commit|tag|push|rebase)\.gpgsign$/.test(k.toLowerCase())
const isAliasKey = (k: string) => /^alias\../i.test(k)
// git reads a boolean as true, yes, on, false, no, off or the empty string (any case), or as an integer with an optional
// k, m or g unit, where any spelling of zero (`00`, `0x0`, `0k`, ` 0`) is false.
const isTrue = (v: string) => /^(?:true|yes|on|1)$/i.test(v.trim())
const isFalse = (v: string) => /^(?:false|no|off|)$/i.test(v.trim()) || /^[+-]?(?:0x0+|0+)[kmg]?$/i.test(v.trim())

// The verdict for setting a signing key to a value: off denies, on passes, and anything else (`2`, `if-asked`) asks.
const signValueRule = (v: string): Rule | null => (isFalse(v) ? 'no-gpg-sign' : isTrue(v) ? null : 'config-edit')

// `-c key=value`: the verdict for one setting.
function configHit(setting: string): Rule | null {
  const eq = setting.indexOf('=')
  const key = eq < 0 ? setting : setting.slice(0, eq)
  if (isHookKey(key)) return 'hooks-path'
  // `-c key` with no value means true, which never turns signing off or defines an alias.
  if (eq < 0) return null
  if (isSignKey(key)) return signValueRule(setting.slice(eq + 1))
  return isAliasKey(key) ? aliasRule(setting.slice(eq + 1)) : null
}

// A shell alias (`!…`) that names a bypass asks, since what it runs is shell, not one git command.
const SHELL_ALIAS_BYPASS = /--no-verify|--no-gpg-sign|hookspath|gpgsign|\bcommit\b[^\n;&|]{0,200}?\s-[A-Za-z]*n/i

// The verdict for defining an alias with this value: the alias's own command read as `git <value>`, so an alias that
// skips hooks or signing (`commit --no-verify`, `-c core.hooksPath=x commit`) is denied like the command it runs.
function aliasRule(value: string): Rule | null {
  const v = value.trimStart()
  if (v.startsWith('!')) {
    const script = v.slice(1)
    return SHELL_ALIAS_BYPASS.test(script) || checkGit(script) !== null ? 'config-edit' : null
  }
  const r = parse(v)
  if (r.errors.length > 0) return 'config-edit'
  let ask = false
  for (const c of r.commands) {
    if (c.depth !== 0 || c.nesting !== 0) continue
    const rule = gitHit({ argv: ['git', ...c.argv], env: [] })
    if (rule === 'config-edit') ask = true
    else if (rule) return rule
  }
  return ask ? 'config-edit' : null
}

// Environment that turns hook managers off, or feeds git config through the environment.
function envHit(env: View['env']): GitHit['rule'] | null {
  for (const { name, value } of env) {
    if (name === 'SKIP' && value !== '') return 'skip-env'
    if ((name === 'HUSKY' || name === 'LEFTHOOK') && (value === null || value === '0' || value === 'false')) return 'skip-env'
    if ((name === 'HUSKY_SKIP_HOOKS' || name === 'LEFTHOOK_EXCLUDE') && value !== '') return 'skip-env'
    // An alias that skips hooks or signing names the option in its value.
    if (name === 'GIT_CONFIG_PARAMETERS' && (value === null || /hookspath|include|gpgsign|no-verify|no-gpg-sign/i.test(value))) return 'hooks-path'
    if (/^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(name) && (value === null || /hookspath|include|gpgsign|no-verify|no-gpg-sign|^(?:false|no|off|0)$/i.test(value))) return 'hooks-path'
  }
  return null
}

const GLOBAL_VALUED = new Set(['-C', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--exec-path', '--attr-source'])

// Subcommands whose hooks --no-verify skips.
const VERIFY_SUBS = new Set(['commit', 'push', 'merge', 'am', 'rebase', 'cherry-pick', 'revert', 'pull'])
// Long options that take the next word as their value, per subcommand family. Unlisted options are read as flags.
const LONG_VALUED = new Set([
  '--message', '--file', '--reuse-message', '--reedit-message', '--author', '--date', '--template', '--fixup', '--squash',
  '--pathspec-from-file', '--cleanup', '--trailer', '--push-option', '--receive-pack', '--exec', '--repo', '--strategy',
  '--strategy-option', '--onto', '--into-name', '--upstream',
])
// Short options that take a value: the rest of the cluster, or the next word when last.
const SHORT_VALUED: Record<string, string> = { commit: 'mFCct', merge: 'mFsX', push: 'o', rebase: 'sXx', pull: 'sX', 'cherry-pick': 'mX', revert: 'mX', am: 'pC' }
// Short options with an optional attached value (the rest of the cluster is the value).
const SHORT_OPTIONAL: Record<string, string> = { commit: 'uS', merge: 'S', rebase: 'S', 'cherry-pick': 'S', revert: 'S', am: 'S', pull: 'S' }

const prefixOf = (word: string, full: string, min: number) => word.length >= min && full.startsWith(word)

// git config's long options (git 2.56), in both the legacy and the subcommand forms. git takes any unambiguous prefix
// (`--repl`, `--unset-al`, `--glob`) and a `no-` form of most.
const CONFIG_LONG = [
  'global', 'system', 'local', 'worktree', 'file', 'blob', 'get', 'get-all', 'get-regexp', 'get-urlmatch', 'replace-all', 'add',
  'unset', 'unset-all', 'rename-section', 'remove-section', 'list', 'edit', 'get-color', 'get-colorbool', 'null', 'name-only',
  'show-origin', 'show-scope', 'show-names', 'type', 'bool', 'int', 'bool-or-int', 'bool-or-str', 'path', 'expiry-date', 'default',
  'comment', 'fixed-value', 'includes', 'all', 'value', 'regexp', 'url',
]
const CONFIG_VALUED = new Set(['file', 'blob', 'type', 'default', 'comment', 'value', 'url'])
const CONFIG_ACTIONS = new Set(['add', 'replace-all', 'unset', 'unset-all', 'rename-section', 'remove-section', 'edit'])
// Legacy read actions. `--get name value-pattern` has two operands, so with one of these no operand pair is a set.
const CONFIG_READS = new Set(['get', 'get-all', 'get-regexp', 'get-urlmatch', 'get-color', 'get-colorbool', 'list'])
const CONFIG_SUBS = new Set(['list', 'get', 'set', 'unset', 'rename-section', 'remove-section', 'edit'])
// Sections whose removal or renaming drops a hooks path, an include, or a signing setting. `[core "x"]` is another section.
const isGuardedSection = (s: string) => /^(?:core|commit|tag|push|include)$|^includeif(?:\..*)?$/i.test(s)
const isSignSection = (s: string) => /^(?:commit|tag|push)$/i.test(s)

// The option a long-option word names, `no-` forms as `!name`, or null when git would reject it as unknown or ambiguous.
function configLong(word: string): string | null {
  if (CONFIG_LONG.includes(word)) return word
  const neg = word.startsWith('no-') ? word.slice(3) : null
  if (neg !== null && CONFIG_LONG.includes(neg)) return `!${neg}`
  const hits = [
    ...CONFIG_LONG.filter(o => o.startsWith(word)),
    ...(neg === null ? [] : CONFIG_LONG.filter(o => o.startsWith(neg)).map(o => `!${o}`)),
  ]
  return word !== '' && hits.length === 1 ? hits[0] : null
}

type ConfigChange = { op: 'set' | 'unset' | 'section'; key: string | null; value?: string | null }

// A `git config` command's verdict, read from the word after `config` on: a deny rule, `config-edit` for an editor or a
// change whose key or value is an expansion, or null for a read or a change to other keys. Every scope and file option
// counts the same.
//
// git stops reading options at the first operand in both forms (git 2.56): after it every word is an operand, `--`
// and `--get` included, so `git config core.hooksPath x --get` sets the key with `--get` as its value-pattern. A
// leading subcommand word (`set`, `unset`) reads its own options up to its first operand.
function configRule(argv: Argv, start: number): Rule | null {
  const actions: string[] = []
  const ops: (string | null)[] = []
  let unknown = false
  let read = false
  let options = true
  for (let i = start; i < argv.length; i++) {
    const a = argv[i]
    if (!options || a === null || a === '-' || a[0] !== '-') {
      ops.push(a)
      const subWord = ops.length === 1 && actions.length === 0 && !read && a !== null && CONFIG_SUBS.has(a)
      if (!subWord) options = false
      continue
    }
    if (a === '--') {
      options = false
      continue
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      const opt = configLong(a.slice(2, eq < 0 ? undefined : eq))
      if (opt === null) unknown = true
      else if (CONFIG_VALUED.has(opt) && eq < 0) i++
      else if (CONFIG_ACTIONS.has(opt)) actions.push(opt)
      else if (CONFIG_READS.has(opt)) read = true
      continue
    }
    for (let k = 1; k < a.length; k++) {
      const ch = a[k]
      if (ch === 'e') actions.push('edit')
      else if (ch === 'l') read = true
      else if (ch === 'f' || ch === 't') {
        if (k === a.length - 1) i++
        break
      } else if (ch !== 'z') unknown = true
    }
  }
  const sub = actions.length === 0 && !read && typeof ops[0] === 'string' && CONFIG_SUBS.has(ops[0]) ? ops[0] : null
  const rest = sub === null ? ops : ops.slice(1)
  const kinds = sub === null ? actions : [sub]
  const changes: ConfigChange[] = []
  // Legacy `git config <name> <value>`; one operand is a read.
  if (kinds.length === 0 && !read && rest.length >= 2) changes.push({ op: 'set', key: rest[0], value: rest[1] })
  for (const kind of kinds) {
    if ((kind === 'set' || kind === 'add' || kind === 'replace-all') && rest.length >= 2) changes.push({ op: 'set', key: rest[0], value: rest[1] })
    else if ((kind === 'unset' || kind === 'unset-all') && rest.length >= 1) changes.push({ op: 'unset', key: rest[0] })
    else if (kind === 'remove-section' || kind === 'rename-section') {
      // Renaming into a guarded section can plant a key there, so both names count.
      for (const s of rest.slice(0, kind === 'rename-section' ? 2 : 1)) changes.push({ op: 'section', key: s })
    }
  }
  let ask = kinds.includes('edit')
  for (const c of changes) {
    if (c.key === null) ask = true
    else if (c.op === 'section') {
      if (isGuardedSection(c.key)) return isSignSection(c.key) ? 'no-gpg-sign' : 'hooks-path'
    } else if (isHookKey(c.key)) return 'hooks-path'
    else if (isSignKey(c.key) || (c.op === 'set' && isAliasKey(c.key))) {
      if (c.op === 'unset') return 'no-gpg-sign'
      const rule = c.value === null || c.value === undefined ? 'config-edit' : isSignKey(c.key) ? signValueRule(c.value) : aliasRule(c.value)
      if (rule === 'config-edit') ask = true
      else if (rule) return rule
    }
  }
  // An option this table does not know may be a newer action, so a guarded key among the operands asks.
  if (unknown && ops.some(o => o !== null && (isHookKey(o) || isSignKey(o) || isGuardedSection(o)))) ask = true
  return ask ? 'config-edit' : null
}

function gitHit(v: View): Rule | null {
  const argv = v.argv
  if (base(argv[0]) !== 'git') return null
  const fromEnv = envHit(v.env)
  if (fromEnv) return fromEnv
  let i = 1
  let sub: string | null = null
  // A `-c` value that asks; a deny later in the command still wins.
  let ask = false
  for (; i < argv.length; i++) {
    const a = argv[i]
    if (a === null) return ask ? 'config-edit' : null
    if (a === '-c' || (a.startsWith('-c') && a.length > 2)) {
      const s = a === '-c' ? argv[++i] : a.slice(2)
      const hit = s ? configHit(s) : null
      if (hit === 'config-edit') ask = true
      else if (hit) return hit
    } else if (a === '--config-env' || a.startsWith('--config-env=')) {
      const s = a === '--config-env' ? argv[++i] : a.slice('--config-env='.length)
      if (s && isHookKey(s.split('=')[0])) return 'hooks-path'
      if (s && /gpgsign/i.test(s.split('=')[0])) return 'no-gpg-sign'
    } else if (GLOBAL_VALUED.has(a)) i++
    else if (a[0] !== '-') {
      sub = a
      i++
      break
    }
  }
  const asked: Rule | null = ask ? 'config-edit' : null
  if (sub === null) return asked
  if (sub === 'config') return configRule(argv, i) ?? asked
  const valued = SHORT_VALUED[sub] ?? ''
  const optional = SHORT_OPTIONAL[sub] ?? ''
  for (; i < argv.length; i++) {
    const a = argv[i]
    if (a === null || a === '-' || a[0] !== '-') continue
    if (a === '--') break
    if (a.startsWith('--')) {
      const name = a.split('=')[0]
      // git takes any unambiguous prefix of a long option: --no-veri runs as --no-verify. am has no --verbose,
      // so there --no-v is already unambiguous (git 2.56).
      if (VERIFY_SUBS.has(sub) && prefixOf(name, '--no-verify', (sub === 'am' ? '--no-v' : '--no-veri').length)) return 'no-verify'
      if (prefixOf(name, '--no-gpg-sign', '--no-g'.length)) return 'no-gpg-sign'
      if (!a.includes('=') && LONG_VALUED.has(a)) i++
      continue
    }
    for (let k = 1; k < a.length; k++) {
      const ch = a[k]
      // -n is --no-verify only for commit; for push, merge and others it means something else.
      if (sub === 'commit' && ch === 'n') return 'no-verify'
      if (optional.includes(ch)) break
      if (valued.includes(ch)) {
        if (k === a.length - 1) i++
        break
      }
    }
  }
  return asked
}

// `export SKIP=x; git commit`: an exported or bare assignment of a hook-off variable earlier in the script.
function exportedSkip(commands: readonly ShellCommand[]): boolean {
  for (const c of commands) {
    if (c.argv.length === 0 && envHit(c.assigns.filter(a => a.name !== null).map(a => ({ name: a.name!, value: a.value })))) return true
    if (base(c.argv[0]) === 'export') {
      const env = c.argv.slice(1).flatMap(a => {
        const m = a === null ? null : ASSIGN.exec(a)
        return m ? [{ name: m[1], value: m[2] }] : []
      })
      if (envHit(env)) return true
    }
  }
  return false
}

// Parses a command and the scripts it hands to `sh -c` or `eval`, behind wrappers too. `deep` is set when a command
// sits behind more wrappers than `views` reads; `ok` is false then too, and on a parse error.
export function scan(command: string): { commands: ShellCommand[]; ok: boolean; deep: boolean } {
  const commands: ShellCommand[] = []
  let ok = true
  let deep = false
  let reparsed = 0
  const add = (r: ReturnType<typeof parse>) => {
    if (r.errors.length > 0) ok = false
    for (const c of r.commands) {
      commands.push(c)
      const vs = views(c)
      if (vs.deep) {
        ok = false
        deep = true
      }
      for (const v of vs) {
        const script = nestedScript(v.argv)
        if (script === null) continue
        reparsed += script.length
        if (reparsed > MAX_REPARSE) ok = false
        else add(reparse(script, c.depth + 1))
      }
    }
  }
  add(parse(command))
  return { commands, ok, deep }
}

// `git`, also with quotes or backslashes inside it (`g''it`, `"g"it`, `gi\t`). Linear, so it may run on the whole text.
const MENTIONS_GIT = /\bg["'\\]*i["'\\]*t\b/

// The verdict for a Bash command: a hit (deny); `config-edit` (ask) for a git config change that could not be read, or
// `unparsed` (ask) for a git command that could not be checked; or null. A deny anywhere wins over an ask.
//
// Every bounded command is parsed, since quotes can hide the name from a text match; git is found by the parsed command
// name. The text match only decides text the parser could not read (too long, a parse error). A command behind more
// wrappers than are read always asks, since what it runs is unknown.
export function checkGit(command: string): GitVerdict {
  if (command.length > MAX_COMMAND) return MENTIONS_GIT.test(command) ? { rule: 'unparsed', message: UNPARSED } : null
  const { commands, ok, deep } = scan(command)
  const gits = commands.flatMap(c => views(c)).filter(v => base(v.argv[0]) === 'git')
  let edit = false
  for (const v of gits) {
    const rule = gitHit(v)
    if (rule === 'config-edit') edit = true
    else if (rule) return { rule, message: MESSAGES[rule] }
  }
  if (gits.length > 0 && exportedSkip(commands)) return { rule: 'skip-env', message: MESSAGES['skip-env'] }
  if (edit) return { rule: 'config-edit', message: MESSAGES['config-edit'] }
  if (deep || (!ok && (gits.length > 0 || MENTIONS_GIT.test(command)))) return { rule: 'unparsed', message: UNPARSED }
  return null
}
