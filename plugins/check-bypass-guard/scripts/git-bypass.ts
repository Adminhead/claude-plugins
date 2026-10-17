// Finds git commands that skip or redirect git hooks or signing. Pure: no I/O.
//
// Adapted from ECC's scripts/hooks/block-no-verify.js (MIT, (c) 2026 Affaan Mustafa) and wshobson's
// block-no-verify plugin (MIT, (c) 2024 Seth Hobson), rewritten on the shell AST walker so words inside
// quotes (a commit message that mentions --no-verify) are never read as flags. It targets model habits,
// not a determined adversary: variable indirection, aliases and script files are out of scope.

import { nestedScript, parse, reparse } from './shell/walk.ts'
import type { ShellCommand } from './shell/walk.ts'

export type GitHit = { rule: 'no-verify' | 'no-gpg-sign' | 'hooks-path' | 'skip-env'; message: string }
export type GitVerdict = GitHit | { rule: 'unparsed'; message: string } | null

export const MAX_COMMAND = 64 * 1024
const MAX_REPARSE = 256 * 1024

const FIX = 'Fix what the hook reports and commit again; if a hook itself is broken, tell the user.'
const MESSAGES: Record<GitHit['rule'], string> = {
  'no-verify': `check-bypass-guard: --no-verify (or commit -n) skips the git hooks. ${FIX}`,
  'no-gpg-sign': `check-bypass-guard: --no-gpg-sign or a gpgsign=false override skips commit signing. Sign the commit, or ask the user.`,
  'hooks-path': `check-bypass-guard: overriding core.hooksPath or include paths on the command line redirects the git hooks. ${FIX}`,
  'skip-env': `check-bypass-guard: SKIP, HUSKY=0 and LEFTHOOK=0 turn off pre-commit, husky or lefthook hooks. ${FIX}`,
}
const UNPARSED = 'check-bypass-guard: this git command could not be checked for hook bypasses (too long or not plain bash). Confirm it skips no hooks.'

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

type View = { argv: Argv; env: { name: string; value: string | null }[] }

// The command and what its wrappers run, each with the NAME=value words in front of it (env's included).
function views(c: ShellCommand): View[] {
  const env = c.assigns.filter(a => a.name !== null).map(a => ({ name: a.name!, value: a.value }))
  const out: View[] = [{ argv: c.argv, env }]
  let argv = c.argv
  for (let level = 0; level < 8; level++) {
    const w = WRAPPERS[base(argv[0])]
    if (!w) break
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
const isSignOff = (k: string, v: string) => /^(?:commit|tag|push|rebase)\.gpgsign$/.test(k.toLowerCase()) && /^(?:false|no|off|0|)$/i.test(v.trim())

function configHit(setting: string): GitHit['rule'] | null {
  const eq = setting.indexOf('=')
  const key = eq < 0 ? setting : setting.slice(0, eq)
  if (isHookKey(key)) return 'hooks-path'
  // `-c key` with no value means true, which never turns signing off.
  return eq >= 0 && isSignOff(key, setting.slice(eq + 1)) ? 'no-gpg-sign' : null
}

// Environment that turns hook managers off, or feeds git config through the environment.
function envHit(env: View['env']): GitHit['rule'] | null {
  for (const { name, value } of env) {
    if (name === 'SKIP' && value !== '') return 'skip-env'
    if ((name === 'HUSKY' || name === 'LEFTHOOK') && (value === null || value === '0' || value === 'false')) return 'skip-env'
    if ((name === 'HUSKY_SKIP_HOOKS' || name === 'LEFTHOOK_EXCLUDE') && value !== '') return 'skip-env'
    if (name === 'GIT_CONFIG_PARAMETERS' && (value === null || /hookspath|include|gpgsign/i.test(value))) return 'hooks-path'
    if (/^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(name) && (value === null || /hookspath|include|gpgsign|^(?:false|no|off|0)$/i.test(value))) return 'hooks-path'
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

function gitHit(v: View): GitHit['rule'] | null {
  const argv = v.argv
  if (base(argv[0]) !== 'git') return null
  const fromEnv = envHit(v.env)
  if (fromEnv) return fromEnv
  let i = 1
  let sub: string | null = null
  for (; i < argv.length; i++) {
    const a = argv[i]
    if (a === null) return null
    if (a === '-c') {
      const s = argv[++i]
      const hit = s ? configHit(s) : null
      if (hit) return hit
    } else if (a.startsWith('-c') && a.length > 2) {
      const hit = configHit(a.slice(2))
      if (hit) return hit
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
  if (sub === null) return null
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
  return null
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

// Parses a command and the scripts it hands to `sh -c` or `eval`, behind wrappers too.
function scan(command: string): { commands: ShellCommand[]; ok: boolean } {
  const commands: ShellCommand[] = []
  let ok = true
  let reparsed = 0
  const add = (r: ReturnType<typeof parse>) => {
    if (r.errors.length > 0) ok = false
    for (const c of r.commands) {
      commands.push(c)
      for (const v of views(c)) {
        const script = nestedScript(v.argv)
        if (script === null) continue
        reparsed += script.length
        if (reparsed > MAX_REPARSE) ok = false
        else add(reparse(script, c.depth + 1))
      }
    }
  }
  add(parse(command))
  return { commands, ok }
}

const MENTIONS_GIT = /\bgit\b/

// The verdict for a Bash command: a hit (deny), `unparsed` (ask) for a git command that could not be checked, or null.
export function checkGit(command: string): GitVerdict {
  // The regex is linear, so it may run on the whole text; the parser only runs on bounded input.
  if (!MENTIONS_GIT.test(command)) return null
  if (command.length > MAX_COMMAND) return { rule: 'unparsed', message: UNPARSED }
  const { commands, ok } = scan(command)
  const gits = commands.flatMap(c => views(c)).filter(v => base(v.argv[0]) === 'git')
  for (const v of gits) {
    const rule = gitHit(v)
    if (rule) return { rule, message: MESSAGES[rule] }
  }
  if (gits.length > 0 && exportedSkip(commands)) return { rule: 'skip-env', message: MESSAGES['skip-env'] }
  if (!ok) return { rule: 'unparsed', message: UNPARSED }
  return null
}
