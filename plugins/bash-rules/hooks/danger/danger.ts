// Danger rules for bash-rules: commands that destroy a system, infrastructure or data, or escalate privilege (deny),
// and commands that run downloaded code, rewrite git history or delete ignored files (ask). Ported from
// bash-danger-guard, plus the infra-destroy, container-prune, db-drop and git-clean rules. They target model
// accidents, not a determined adversary, so variable indirection, download-then-run and `cd / && rm -rf *` are out of scope. Nothing here touches `$`.

import { nestedScript, reparse } from '../shell/walk'
import type { ShellCommand } from '../shell/walk'

export type DangerRule = 'priv-escalation' | 'rm-root' | 'rm-critical' | 'disk-wipe' | 'system-perms' | 'infra-destroy' | 'container-prune' | 'db-drop'
export type AskRule = 'remote-exec' | 'git-rewrite' | 'git-clean' | 'sql-unchecked'

type Argv = readonly (string | null)[]

export const DANGER_MESSAGES: Record<DangerRule, string> = {
  'priv-escalation': 'bash-rules: do not run commands as another user (sudo, doas, su, pkexec, run0). Hand the command to the user to run.',
  'rm-root': 'bash-rules: refusing a recursive rm of /, a system directory or a home directory. Name the subdirectory you mean.',
  'rm-critical': 'bash-rules: refusing to delete a system file or directory, a credential directory (~/.ssh, ~/.gnupg, ~/.aws, ~/.kube) or a shell startup file. Hand it to the user to run.',
  'disk-wipe': 'bash-rules: refusing a command that can wipe or reformat a disk. Hand it to the user to run.',
  'system-perms': 'bash-rules: refusing a recursive chmod, chown or chgrp on / or a system directory. Name the subdirectory you mean.',
  'infra-destroy': 'bash-rules: refusing a command that destroys infrastructure (terraform/tofu destroy, apply -destroy, kubectl delete of a namespace or --all, helm uninstall). Hand it to the user to run.',
  'container-prune': 'bash-rules: refusing a docker or podman command that removes all images or volumes (system prune -a, volume prune, compose down -v). Hand it to the user to run.',
  'db-drop': 'bash-rules: refusing a command that drops or truncates a database or table (dropdb, DROP DATABASE/SCHEMA/TABLE, TRUNCATE, FLUSHALL). Hand it to the user to run.',
}

export const ASK_MESSAGES: Record<AskRule, string> = {
  'remote-exec': 'bash-rules: this runs downloaded or decoded code in a shell or interpreter.',
  'git-rewrite': 'bash-rules: this force-pushes, mirrors or hard-resets, which can discard commits or work.',
  'git-clean': 'bash-rules: this git clean deletes ignored files (.env, build caches, local config) as well as untracked ones.',
  'sql-unchecked': "bash-rules: couldn't check a SQL script file for DROP/TRUNCATE; confirm it's safe.",
}

export const baseName = (t: string | null) => (t ?? '').slice((t ?? '').lastIndexOf('/') + 1)

// Wrappers whose operands end at the command they run. `short` lists the option letters that take a value
// (attached or as the next word), `long` the long options that take one as the next word, `operands` the
// positional words before the command, `assigns` whether NAME=value words come before it, `lookup` the letters
// that make it a lookup instead of a run, and `sub` a subcommand word that must come first (`uv run`).
type Wrapper = { short: string; long?: readonly string[]; operands?: number; assigns?: boolean; lookup?: string; sub?: string }

const WRAPPERS: Record<string, Wrapper> = {
  sudo: {
    short: 'ugChprtUDRT',
    long: ['user', 'group', 'host', 'prompt', 'chdir', 'role', 'type', 'close-from', 'other-user', 'command-timeout', 'chroot'],
    assigns: true,
  },
  doas: { short: 'uC' },
  env: { short: 'uCS', long: ['unset', 'chdir', 'split-string'], assigns: true },
  nice: { short: 'n', long: ['adjustment'] },
  nohup: { short: '' },
  time: { short: 'fo', long: ['format', 'output'] },
  timeout: { short: 'sk', long: ['signal', 'kill-after'], operands: 1 },
  stdbuf: { short: 'ioe', long: ['input', 'output', 'error'] },
  command: { short: '', lookup: 'vV' },
  builtin: { short: '' },
  exec: { short: 'a' },
  setsid: { short: '' },
  xargs: { short: 'adEILnPs', long: ['arg-file', 'delimiter', 'eof', 'max-lines', 'max-args', 'max-procs', 'max-chars', 'replace'] },
  uv: {
    short: 'p',
    long: ['with', 'python', 'project', 'directory', 'env-file', 'extra', 'group', 'package', 'with-requirements', 'with-editable', 'index', 'default-index'],
    sub: 'run',
  },
}

// The command a wrapper runs, or null when it runs none, is only a lookup (`command -v`), or its words are unknown.
function unwrap(argv: Argv): Argv | null {
  const w = WRAPPERS[baseName(argv[0])]
  if (!w) return null
  let i = 1
  if (w.sub) {
    while (i < argv.length && argv[i]?.startsWith('-')) i++
    if (argv[i] !== w.sub) return null
    i++
  }
  for (; i < argv.length; i++) {
    const a = argv[i]
    if (a === null) return null
    if (a === '--') {
      i++
      break
    }
    if (w.assigns && /^[A-Za-z_][A-Za-z0-9_]*=/.test(a)) continue
    if (a[0] !== '-' || a === '-') break
    if (a.startsWith('--')) {
      if (!a.includes('=') && w.long?.includes(a.slice(2))) i++
      continue
    }
    if (w.lookup && [...a.slice(1)].some(ch => w.lookup!.includes(ch))) return null
    for (let k = 1; k < a.length; k++) {
      if (!w.short.includes(a[k])) continue
      if (k === a.length - 1) i++
      break
    }
  }
  i += w.operands ?? 0
  return i < argv.length && argv[i] !== null ? argv.slice(i) : null
}

// The script of `env -S STR`, `env -S"STR"` and `env --split-string=STR`: a command line env splits and runs.
export function envSplit(argv: Argv): string | null {
  if (baseName(argv[0]) !== 'env') return null
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === null || a === '--' || a[0] !== '-' || a === '-') return null
    if (a.startsWith('--')) {
      if (a === '--split-string') return argv[i + 1] ?? null
      if (a.startsWith('--split-string=')) return a.slice('--split-string='.length)
      if (!a.includes('=') && ['unset', 'chdir'].includes(a.slice(2))) i++
      continue
    }
    const at = a.indexOf('S')
    if (at > 0) return at < a.length - 1 ? a.slice(at + 1) : (argv[i + 1] ?? null)
    if (/[uC]$/.test(a)) i++
  }
  return null
}

const FIND_EXEC = new Set(['-exec', '-execdir', '-ok', '-okdir'])

// The commands a `find` runs with -exec, -execdir, -ok and -okdir: the words up to a `;` or `+` terminator.
function findExecs(argv: Argv): Argv[] {
  if (baseName(argv[0]) !== 'find') return []
  const out: Argv[] = []
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === null || !FIND_EXEC.has(a)) continue
    let j = i + 1
    while (j < argv.length && argv[j] !== ';' && argv[j] !== '+') j++
    if (j > i + 1) out.push(argv.slice(i + 1, j))
    i = j
  }
  return out
}

const MAX_VIEW = 8

// A command and, one level at a time, what its wrappers and `find -exec` run. Every name in the chain is a command that
// executes (`sudo env X=1 rm` yields all three). `sh -c` and `eval` bodies are scanned apart, by the caller.
function* views(argv: Argv, level = 0): Generator<Argv> {
  yield argv
  if (level >= MAX_VIEW) return
  const inner = unwrap(argv)
  if (inner) yield* views(inner, level + 1)
  for (const g of findExecs(argv)) yield* views(g, level + 1)
}

export const viewsOf = (argv: Argv): Argv[] => [...views(argv)]

// Whether a command, or a script it hands to a shell (`sh -c`, `eval`, `env -S`), runs one of `names`.
function runs(argv: Argv, names: readonly string[], depth = 0): boolean {
  for (const v of views(argv)) {
    if (names.includes(baseName(v[0]))) return true
    const script = nestedScript(v) ?? envSplit(v)
    if (script === null) continue
    for (const c of reparse(script, depth + 1).commands) if (runs(c.argv, names, depth + 1)) return true
  }
  return false
}

const args = (v: Argv) => v.slice(1)

// The words before `--`, or all of them when there is none.
const options = (v: Argv) => {
  const rest = args(v)
  const end = rest.indexOf('--')
  return end < 0 ? rest : rest.slice(0, end)
}

const isShortFlag = (a: string | null) => a !== null && /^-[^-]/.test(a)

// Whether a short-option letter appears in any cluster, or one of the long options does.
const hasFlag = (v: Argv, short: string, long: readonly string[] = []) =>
  options(v).some(a => a !== null && (long.includes(a) || (isShortFlag(a) && [...a.slice(1)].some(ch => short.includes(ch)))))

// The non-option words (a lone `-` counts, a null word may be a path), including all after `--`. `valued` lists
// short-option letters whose value is the next word, so that value is not taken for an operand.
function operandsSkipping(v: Argv, valued = ''): (string | null)[] {
  const out: (string | null)[] = []
  const rest = args(v)
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a === '--') {
      out.push(...rest.slice(i + 1))
      break
    }
    if (a === null || a === '-' || a[0] !== '-') out.push(a)
    else if (!a.startsWith('--')) {
      for (let k = 1; k < a.length; k++) {
        if (!valued.includes(a[k])) continue
        if (k === a.length - 1) i++
        break
      }
    }
  }
  return out
}

const operands = (v: Argv) => operandsSkipping(v)

// A glob pattern (* ? [..]) against one name. A pattern this cannot read counts as a match.
// A brace list (`/{bin,etc}`) never gets here: the walker reads it as an expansion (a null word).
function globMatches(pat: string, name: string): boolean {
  let re = ''
  for (let i = 0; i < pat.length; i++) {
    const ch = pat[i]
    if (ch === '*') re += '[^/]*'
    else if (ch === '?') re += '[^/]'
    else if (ch === '[') {
      const end = pat.indexOf(']', i + 2)
      if (end < 0) re += '\\['
      else {
        const body = pat.slice(i + 1, end)
        re += `[${/^[!^]/.test(body) ? '^' + body.slice(1) : body}]`.replace(/\\/g, '\\\\')
        i = end
      }
    } else re += ch.replace(/[.+^$()|\\\]{}]/g, '\\$&')
  }
  try {
    return new RegExp(`^(?:${re})$`).test(name)
  } catch {
    return true
  }
}

const hasGlob = (s: string) => /[*?[]/.test(s)

const SYSTEM_DIRS = ['bin', 'boot', 'dev', 'etc', 'home', 'lib', 'lib64', 'opt', 'root', 'run', 'sbin', 'srv', 'usr', 'var', 'Users']

// null stands for any one name.
const SYSTEM_PATHS: (string | null)[][] = [[], ...SYSTEM_DIRS.map(d => [d])]
const HOME_PATHS: (string | null)[][] = [['home', null], ['Users', null]]

const matches = (comps: string[], paths: (string | null)[][]) =>
  paths.some(p => p.length === comps.length && comps.every((c, i) => p[i] === null || (hasGlob(c) ? globMatches(c, p[i]!) : c === p[i])))

const ALL = /^\*+$/

// A component that takes everything in a directory: `*`, or a glob over dotfiles (`.*`, `.[!.]*`, `.??*`).
const wipesAll = (c: string) => ALL.test(c) || (c[0] === '.' && hasGlob(c) && globMatches(c, '.bashrc') && globMatches(c, '.ssh'))

// Resolves path components (`.`, `..`, empty words). Null when `..` climbs out of a home directory.
function resolve(parts: string[], tilde: boolean): string[] | null {
  const comps: string[] = []
  for (const p of parts) {
    if (p === '' || p === '.') continue
    if (p === '..') {
      if (comps.length > 0) comps.pop()
      else if (tilde) return null
      continue
    }
    comps.push(p)
  }
  return comps
}

// Whether a literal path names the root or a top-level system directory, everything in one (`/usr/*`), or with `home` also
// a home directory (`~`, `~user`, `/home/<name>`, `/Users/<name>`) or everything in one (`~/*`, `~/.*`). The path is
// normalized first (`//`, `/.`, `/..`, a trailing slash), and a glob component counts when it can match a protected name
// (`/*`, `/e*`, `/[b]in`). Relative paths are never protected.
function protectedPath(t: string, home: boolean): boolean {
  const parts = t.split('/')
  const tilde = home && /^~([^/+-][^/]*)?$/.test(parts[0])
  if (!tilde && parts[0] !== '') return false
  const comps = resolve(parts.slice(1), tilde)
  if (comps === null) return true
  if (tilde) return comps.length === 0 || (comps.length === 1 && wipesAll(comps[0]))
  if (matches(comps, SYSTEM_PATHS) || (comps.length === 2 && wipesAll(comps[1]) && matches([comps[0]], SYSTEM_PATHS))) return true
  return home && (matches(comps, HOME_PATHS) || (comps.length === 3 && /^(?:home|Users)$/.test(comps[0]) && wipesAll(comps[2])))
}

const anyProtected = (v: Argv, home: boolean) => operands(v).some(a => a !== null && protectedPath(a, home))

// find's start points: the words after its leading options and before the first expression.
function findStarts(v: Argv): string[] {
  const out: string[] = []
  let i = 1
  for (; i < v.length; i++) {
    const a = v[i]
    if (a === null) continue
    if (a === '-D') i++
    else if (!/^-[HLPO]/.test(a)) break
  }
  for (; i < v.length; i++) {
    const a = v[i]
    if (a === null || a[0] === '-' || a === '(' || a === '!' || a === ',') break
    out.push(a)
  }
  return out
}

const rmRoot = (v: Argv) => {
  const name = baseName(v[0])
  if (name === 'rm') {
    if (options(v).includes('--no-preserve-root')) return true
    return hasFlag(v, 'rR', ['--recursive']) && anyProtected(v, true)
  }
  if (name === 'find') {
    if (!findStarts(v).some(s => protectedPath(s, true))) return false
    return v.includes('-delete') || findExecs(v).some(g => runs(g, ['rm']))
  }
  return false
}

// Top-level directories whose contents are the system: deleting anything under them breaks the machine. /var counts only
// for its state directories, so /var/tmp, /var/log and /var/cache stay deletable.
const CRITICAL_ROOTS = new Set(['etc', 'boot', 'usr', 'bin', 'sbin', 'lib', 'lib32', 'lib64', 'libx32', 'root', 'System', 'Library'])
const CRITICAL_VAR = new Set(['lib', 'spool', 'mail', 'db', 'backups'])
// Under a home directory: credentials and startup files.
const HOME_CRITICAL = /^(?:\.ssh|\.gnupg|\.aws|\.kube|\.docker|\.config|\.local|\.(?:bash|zsh|ksh)rc|\.profile|\.bash_profile|\.bash_login|\.bash_logout|\.zprofile|\.zshenv|\.zlogin|\.zlogout|\.inputrc|\.gitconfig|\.netrc|\.npmrc|\.pypirc)$/
const HOME_CRITICAL_DIRS = /^(?:\.ssh|\.gnupg|\.aws|\.kube)$/

// Whether a path names a system file or directory, or a home credential or startup file (anything inside the credential
// directories too). The path is normalized first; globs count when they can match (`/etc/*`, `~/.ssh/*`, `~/.*rc`).
function criticalPath(t: string): boolean {
  const parts = t.split('/')
  const tilde = /^~([^/+-][^/]*)?$/.test(parts[0]!)
  if (!tilde && parts[0] !== '') return false
  const comps = resolve(parts.slice(1), tilde)
  if (comps === null) return true
  let home: string[] | null = tilde ? comps : null
  if (!tilde && comps.length >= 2 && (comps[0] === 'home' || comps[0] === 'Users')) home = comps.slice(2)
  if (!tilde && comps[0] === 'root') home = comps.slice(1)
  if (home !== null) {
    const first = home[0]
    if (first === undefined) return false
    const hit = (re: RegExp) => (hasGlob(first) ? ['.ssh', '.bashrc', '.zshrc', '.profile', '.aws'].some(n => re.test(n) && globMatches(first, n)) : re.test(first))
    return home.length === 1 ? hit(HOME_CRITICAL) : hit(HOME_CRITICAL_DIRS)
  }
  if (comps.length === 0) return true
  const top = comps[0]!
  // /usr/local holds what the user installed, not the system.
  if (top === 'usr' && comps[1] === 'local') return false
  const topHit = hasGlob(top) ? [...CRITICAL_ROOTS].some(d => globMatches(top, d)) : CRITICAL_ROOTS.has(top)
  if (topHit) return true
  if (top === 'var' && comps.length >= 2) return hasGlob(comps[1]!) ? [...CRITICAL_VAR].some(d => globMatches(comps[1]!, d)) : CRITICAL_VAR.has(comps[1]!)
  return false
}

// rm (recursive or not), shred -u and unlink of a critical path. rm-root takes the recursive top-level cases first.
const rmCritical = (v: Argv) => {
  const name = baseName(v[0])
  if (name === 'rm' || name === 'unlink' || (name === 'shred' && hasFlag(v, 'u', ['--remove']))) return operands(v).some(a => a !== null && criticalPath(a))
  return false
}

const BLOCK_DEV = /^\/dev\/(?:sd|hd|vd|xvd|nvme|mmcblk|loop|md\d|dm-|mapper\/|disk\/|r?disk\d|sr\d|nbd|ram|zd|rbd|mtd|mem$|kmem$)/
const WRITE_OPS = new Set(['>', '>>', '>|', '&>', '&>>', '>&', '<>'])

// A device path, normalized first (`/dev/./sda`, `//dev/sda`).
const blockDev = (t: string) => BLOCK_DEV.test(t[0] === '/' ? '/' + resolve(t.split('/').slice(1), false)!.join('/') : t)

// A device or an unknown operand (`$DEV`). A literal image file is no disk.
const deviceOperand = (v: Argv, valued = '') => operandsSkipping(v, valued).some(a => a === null || blockDev(a))

const diskWipe = (v: Argv, c: ShellCommand) => {
  const name = baseName(v[0])
  if (c.redirects.some(r => WRITE_OPS.has(r.op) && r.target !== null && blockDev(r.target))) return true
  if (/^(?:mkfs|mke2fs|mkswap)/.test(name)) return deviceOperand(v, 'LnEbtTUNmiIOdp')
  if (name === 'wipefs') return deviceOperand(v, 'otO')
  if (name === 'blkdiscard') return deviceOperand(v, 'ols')
  if (name === 'cryptsetup') return operands(v).includes('luksFormat') && deviceOperand(v)
  if (name === 'sgdisk') {
    if (options(v).some(a => a !== null && (a === '--zap-all' || /^-[A-Za-z0-9]*Z/.test(a)))) return true
    return options(v).includes('--clear') && deviceOperand(v)
  }
  if (name === 'dd') return args(v).some(a => a !== null && a.startsWith('of=') && blockDev(a.slice(3)))
  if (name === 'shred' || name === 'tee') return operands(v).some(a => a !== null && blockDev(a))
  return false
}

const systemPerms = (v: Argv) => {
  const name = baseName(v[0])
  if (['chmod', 'chown', 'chgrp'].includes(name)) return hasFlag(v, 'R', ['--recursive']) && anyProtected(v, false)
  // find applies a mode or owner to everything under its start points.
  return name === 'find' && findStarts(v).some(s => protectedPath(s, false)) && findExecs(v).some(g => runs(g, ['chmod', 'chown', 'chgrp']))
}

const PRIV = new Set(['sudo', 'sudoedit', 'doas', 'su', 'pkexec', 'run0'])
const privEscalation = (v: Argv) => PRIV.has(baseName(v[0]))


// The first word that is not an option, skipping the values of `valued` options (`-n ns`, `--context x`), and what follows.
function subcommand(v: Argv, valued: ReadonlySet<string>): { sub: string; rest: Argv } | null {
  for (let i = 1; i < v.length; i++) {
    const a = v[i]
    if (a === null) return null
    if (a[0] !== '-') return { sub: a, rest: v.slice(i + 1) }
    if (!a.includes('=') && valued.has(a)) i++
  }
  return null
}

const TF = new Set(['terraform', 'tofu', 'terragrunt'])
const KUBECTL = new Set(['kubectl', 'oc', 'kubecolor'])
const KUBE_VALUED = new Set(['-n', '--namespace', '--context', '--cluster', '--kubeconfig', '-s', '--server', '--user', '--token', '--as', '--as-group', '--request-timeout', '-v'])
const NAMESPACE = /^(?:namespaces?|ns)(?:$|[/,.])/

const infraDestroy = (v: Argv) => {
  const name = baseName(v[0])
  if (TF.has(name)) {
    // `-chdir=dir` and other global options come before the subcommand; terragrunt also has `run-all destroy`.
    const words = args(v).filter((a): a is string => a !== null && a[0] !== '-')
    const sub = words[0] === 'run-all' || words[0] === 'run' ? words[1] : words[0]
    if (sub === 'destroy') return true
    return sub === 'apply' && args(v).some(a => a === '-destroy' || a === '--destroy')
  }
  if (name === 'pulumi' || name === 'cdk' || name === 'cdktf') return subcommand(v, new Set(['--cwd', '-C', '-s', '--stack']))?.sub === 'destroy'
  if (KUBECTL.has(name)) {
    const call = subcommand(v, KUBE_VALUED)
    if (call?.sub !== 'delete') return false
    return call.rest.some(a => a !== null && (NAMESPACE.test(a) || a === '--all' || a === '-A' || a === '--all-namespaces' || /^-[a-zA-Z]*A/.test(a)))
  }
  if (name === 'helm') {
    const call = subcommand(v, new Set(['-n', '--namespace', '--kube-context', '--kubeconfig']))
    return call !== null && ['uninstall', 'delete', 'del', 'un'].includes(call.sub)
  }
  return false
}

// `docker compose down -v` and `docker-compose down --volumes`: the flags after `down`.
function composeDownVolumes(v: Argv): boolean {
  const at = v.indexOf('down')
  if (at < 0) return false
  return v.slice(at + 1).some(a => a !== null && (a === '--volumes' || /^-[a-zA-Z]*v/.test(a)))
}

const containerPrune = (v: Argv) => {
  const name = baseName(v[0])
  if (name === 'docker-compose' || name === 'podman-compose') return composeDownVolumes(v)
  if (name !== 'docker' && name !== 'podman') return false
  const words = args(v).filter((a): a is string => a !== null && a[0] !== '-')
  const flags = args(v).filter((a): a is string => a !== null && a[0] === '-')
  if (words[0] === 'volume' && words[1] === 'prune') return true
  if (words.includes('compose')) return composeDownVolumes(v)
  if (!(words[0] === 'system' && words[1] === 'prune')) return false
  return flags.some(a => a === '--all' || a === '--volumes' || /^-[a-zA-Z]*a/.test(a))
}

export const SQL_CLIENTS = new Set(['psql', 'mysql', 'mariadb', 'sqlite3', 'duckdb', 'clickhouse-client', 'clickhouse', 'cockroach', 'sqlcmd', 'mongosh', 'mongo', 'cqlsh', 'usql', 'pgcli', 'mycli', 'litecli'])
export const DESTROY_SQL = /\b(?:DROP\s+(?:DATABASE|SCHEMA|TABLE|KEYSPACE)|TRUNCATE\s+(?:TABLE\s+)?[\w"`.[]|dropDatabase\s*\()/i
const TEXT_SOURCES = new Set(['echo', 'printf', 'cat'])

// The text a database client reads: its own words (`-c`, `-e`, `--execute`, sqlite3's SQL operand), the heredoc and
// here-string it reads, and the words of an echo, printf or cat in the stage before it.
function clientText(v: Argv, c: ShellCommand): string[] {
  const out = c.text.slice(1)
  out.push(...c.heredocs.map(h => h.body))
  out.push(...c.redirects.filter(r => r.op === '<<<').map(r => r.text))
  const p = c.pipeline
  if (p) {
    for (const e of p.prev) {
      if (e.pipeline?.stage !== p.stage - 1) continue
      if (TEXT_SOURCES.has(baseName(e.argv[0] ?? ''))) out.push(...e.text.slice(1))
      out.push(...e.heredocs.map(h => h.body))
    }
  }
  return out
}

// Commands that run another on a container, pod or host: `docker compose exec db psql -c ...`, `ssh host "dropdb x"`.
const REMOTE = new Set(['docker', 'podman', 'kubectl', 'oc', 'ssh'])

const dbDrop = (v: Argv, c: ShellCommand): boolean => {
  if (REMOTE.has(baseName(v[0]))) {
    const at = v.findIndex((a, i) => i > 0 && a !== null && (SQL_CLIENTS.has(baseName(a)) || ['dropdb', 'mysqladmin', 'redis-cli', 'valkey-cli'].includes(baseName(a))))
    if (at > 0) return dbDrop(v.slice(at), c)
    // ssh takes the remote command as one string.
    return baseName(v[0]) === 'ssh' && c.text.slice(1).some(t => (/\b(?:psql|mysql|sqlite3|mongosh)\b/.test(t) && DESTROY_SQL.test(t)) || /\bdropdb\s/.test(t))
  }
  const name = baseName(v[0])
  if (name === 'dropdb') return true
  if (name === 'mysqladmin') return args(v).some(a => a === 'drop')
  if (name === 'redis-cli' || name === 'valkey-cli') return args(v).some(a => a !== null && /^flush(?:all|db)$/i.test(a))
  if (!SQL_CLIENTS.has(name)) return false
  // Only the client's own command reads its text: a view from a wrapper (`timeout 5 psql ...`) shares the same `c`.
  return clientText(v, c).some(t => DESTROY_SQL.test(t))
}

const DANGER: [DangerRule, (v: Argv, c: ShellCommand) => boolean][] = [
  ['priv-escalation', privEscalation],
  ['rm-root', rmRoot],
  ['rm-critical', rmCritical],
  ['disk-wipe', diskWipe],
  ['system-perms', systemPerms],
  ['infra-destroy', infraDestroy],
  ['container-prune', containerPrune],
  ['db-drop', dbDrop],
]

// The first danger rule that any command, or anything its wrappers and `find -exec` run, trips. Rules are tried in
// order, so `sudo rm -rf /` reports priv-escalation.
export function dangerHit(commands: readonly ShellCommand[]): { rule: DangerRule; message: string } | null {
  const all = commands.map(c => ({ c, vs: viewsOf(c.argv) }))
  for (const [rule, test] of DANGER) {
    if (all.some(({ c, vs }) => vs.some(v => test(v, c)))) return { rule, message: DANGER_MESSAGES[rule] }
  }
  return null
}

const GIT_LONG_VALUED = new Set(['git-dir', 'work-tree', 'namespace', 'super-prefix', 'config-env', 'attr-source'])

// git's subcommand and its words, past the global options (-C dir, -c k=v, --git-dir X, ...).
function gitCall(v: Argv): { sub: string; rest: Argv } | null {
  if (baseName(v[0]) !== 'git') return null
  for (let i = 1; i < v.length; i++) {
    const a = v[i]
    if (a === null) return null
    if (a === '-C' || a === '-c') i++
    else if (a.startsWith('--')) {
      if (!a.includes('=') && GIT_LONG_VALUED.has(a.slice(2))) i++
    } else if (a[0] !== '-') return { sub: a, rest: v.slice(i + 1) }
  }
  return null
}

const PUSH_VALUED = new Set(['-o', '--push-option', '--receive-pack', '--exec', '--repo'])

// A push that can overwrite the remote: a force flag, --mirror, or a `+refspec` among the positional words.
function forcePush(rest: Argv): boolean {
  let positional = false
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a === null) continue
    if (!positional && a === '--') positional = true
    else if (!positional && a[0] === '-') {
      if (/^--force(?:-with-lease)?(?:=|$)/.test(a) || a === '--mirror' || (/^-[^-]/.test(a) && a.includes('f'))) return true
      if (PUSH_VALUED.has(a)) i++
    } else if (/^\+./.test(a)) return true
  }
  return false
}

const gitRewrite = (v: Argv) => {
  const call = gitCall(v)
  if (!call) return false
  if (call.sub === 'reset') return call.rest.slice(0, call.rest.includes('--') ? call.rest.indexOf('--') : undefined).includes('--hard')
  return call.sub === 'push' && forcePush(call.rest)
}

// `git clean` with a force flag and -x/-X: it deletes ignored files too (.env, caches, local config). The caller exempts a
// linked worktree, which is disposable.
const gitCleanIgnored = (v: Argv) => {
  const call = gitCall(v)
  if (!call || call.sub !== 'clean') return false
  const opts = call.rest.slice(0, call.rest.includes('--') ? call.rest.indexOf('--') : undefined).filter((a): a is string => a !== null)
  const short = opts.filter(a => /^-[^-]/.test(a)).join('')
  const force = short.includes('f') || opts.includes('--force')
  return force && (short.includes('x') || short.includes('X'))
}

const DOWNLOADERS = new Set(['curl', 'wget'])
const isDownloader = (v: Argv) => {
  const name = baseName(v[0])
  return DOWNLOADERS.has(name) || (name === 'base64' && hasFlag(v, 'dD', ['--decode'])) || (name === 'xxd' && hasFlag(v, 'r'))
}

// One table of the shells and interpreters that run a program, and how to read their options.
// `valued` are option letters that take a value (attached, or as the next word when last in the cluster; shells take
// the next word for every `o`/`O`), `inline` the letters whose value is the program itself.
type Spec = { shell: boolean; valued: string; inline: string; longValued?: readonly string[]; longInline?: readonly string[] }

const SPECS: [RegExp, Spec][] = [
  [/^(?:sh|bash|zsh|dash|ksh)$/, { shell: true, valued: 'oO', inline: 'c', longValued: ['--rcfile', '--init-file'] }],
  [/^python[\d.]*$/, { shell: false, valued: 'WXQ', inline: 'cm' }],
  [/^(?:node|nodejs|bun)$/, { shell: false, valued: 'r', inline: 'ep', longValued: ['--require', '--import', '--loader'], longInline: ['--eval', '--print'] }],
  [/^deno$/, { shell: false, valued: '', inline: '' }],
  [/^ruby$/, { shell: false, valued: 'IrCx', inline: 'e' }],
  [/^perl$/, { shell: false, valued: 'IM', inline: 'eE' }],
  [/^php$/, { shell: false, valued: '', inline: 'r' }],
]

export type Invocation = {
  shell: boolean
  // Where the program text is, when an option carries it (`-c STR`, `-e STR`, `-cSTR`), else -1.
  code: number
  // Index of the first operand (a script file, or arguments).
  ops: number
  // `-s`: a shell reads its program from stdin.
  sFlag: boolean
}

export function invocation(v: Argv): Invocation | null {
  const spec = SPECS.find(([re]) => re.test(baseName(v[0])))?.[1]
  if (!spec) return null
  let inline = false
  let code = -1
  let sFlag = false
  let i = 1
  for (; i < v.length; i++) {
    const a = v[i]
    if (a === null) break
    if (a === '--') {
      i++
      break
    }
    if (!/^[-+]./.test(a)) break
    if (a.startsWith('--')) {
      const name = a.split('=')[0]
      if (spec.longInline?.includes(name)) {
        inline = true
        code = a.includes('=') ? i : i + 1
        if (!a.includes('=')) i++
      } else if (!a.includes('=') && spec.longValued?.includes(name)) i++
      continue
    }
    for (let k = 1; k < a.length; k++) {
      const ch = a[k]
      if (a[0] === '-' && spec.inline.includes(ch)) {
        inline = true
        if (!spec.shell) {
          code = k === a.length - 1 ? i + 1 : i
          if (k === a.length - 1) i++
        }
        break
      }
      if (spec.shell) {
        if (ch === 'o' || ch === 'O') i++
        else if (ch === 's' && a[0] === '-') sFlag = true
      } else if (spec.valued.includes(ch)) {
        if (k === a.length - 1) i++
        break
      }
    }
  }
  if (spec.shell && inline) code = i
  return { shell: spec.shell, code, ops: i, sFlag }
}

const STDIN_WORDS = new Set(['-', '/dev/stdin', 'run'])

// The kind of program a command reads from stdin, if it does: a shell (no `-c` script and no program file, or `-s`, or
// `-`), an interpreter with no inline code and no script file, or `source`/`.` of `/dev/stdin`. This is the one place that
// reads shell and interpreter options; the heredoc body scan and remote-exec both use it.
export function stdinReader(v: Argv): 'shell' | 'script' | null {
  const name = baseName(v[0])
  if (name === 'source' || name === '.') return operands(v).some(a => a === '-' || a === '/dev/stdin') ? 'shell' : null
  const inv = invocation(v)
  if (!inv || inv.code >= 0) return null
  const rest = v.slice(inv.ops)
  if (inv.shell) return inv.sFlag || rest.length === 0 || rest[0] === '-' || rest[0] === '/dev/stdin' ? 'shell' : null
  return rest.every(a => a !== null && STDIN_WORDS.has(a)) ? 'script' : null
}

// Whether a script runner's program text is an expansion: the `-c` value or first operand of a shell or interpreter, the
// first operand of `source` and `.`, any argument of `eval`, or its stdin (`< <(...)`, `<<<`, an unquoted heredoc).
// Script arguments (`bash run.sh "$(curl x)"`) are not the program.
export function dynamicProgram(v: Argv, c: ShellCommand): boolean {
  const name = baseName(v[0])
  if (name === 'eval') return args(v).includes(null)
  if (name === 'source' || name === '.') return operands(v)[0] === null
  const inv = invocation(v)
  if (!inv) return false
  if (stdinReader(v)) return c.redirects.some(r => (r.op === '<' || r.op === '<<<') && r.target === null) || c.heredocs.some(h => !h.quoted)
  const at = inv.code >= 0 ? inv.code : inv.ops
  return at < v.length && v[at] === null
}

const downloads = (c: ShellCommand) => viewsOf(c.argv).some(isDownloader)

// remote-exec:
// - a downloader or decoder in an earlier stage of a pipeline that feeds a stdin-reading shell or interpreter;
// - a script runner whose program text is an expansion that holds a downloader (`bash <(curl x)`, `eval "$(curl x)"`).
function remoteExec(commands: readonly ShellCommand[]): boolean {
  // Whether a downloader sits upstream of each pipeline stage, built in one pass: commands come in emission order, so a
  // stage's previous stage is already in the map. Substitution commands in the previous stage count as part of it.
  const up = new Map<object, boolean>()
  for (const c of commands) {
    const p = c.pipeline
    if (p && !up.has(p)) up.set(p, p.prev.some(e => downloads(e) || (e.pipeline !== null && up.get(e.pipeline) === true)))
  }
  return commands.some(c => {
    const vs = viewsOf(c.argv)
    if (c.pipeline && up.get(c.pipeline) === true && vs.some(v => stdinReader(v))) return true
    return c.subs.some(downloads) && vs.some(v => dynamicProgram(v, c))
  })
}

const ASK: [AskRule, (commands: readonly ShellCommand[]) => boolean][] = [
  ['remote-exec', remoteExec],
  ['git-rewrite', commands => commands.some(c => viewsOf(c.argv).some(gitRewrite))],
  ['git-clean', commands => commands.some(c => viewsOf(c.argv).some(gitCleanIgnored))],
]

export function askHit(commands: readonly ShellCommand[]): { rule: AskRule; message: string } | null {
  for (const [rule, test] of ASK) if (test(commands)) return { rule, message: ASK_MESSAGES[rule] }
  return null
}
