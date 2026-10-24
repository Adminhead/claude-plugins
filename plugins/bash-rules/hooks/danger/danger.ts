// Danger rules for bash-rules: commands that destroy a system, infrastructure or data, escalate privilege, kill processes by
// name or touch Claude's credentials file (deny),
// and commands that run downloaded code, rewrite git history or delete ignored files (ask). Ported from
// bash-danger-guard, plus the infra-destroy, container-prune, db-drop and git-clean rules. They target model
// accidents, not a determined adversary, so variable indirection, download-then-run and `cd / && rm -rf *` are out of scope. Nothing here touches `$`.

import { nestedScript, reparse } from '../shell/walk'
import type { ShellCommand } from '../shell/walk'

export type DangerRule = 'priv-escalation' | 'rm-root' | 'rm-critical' | 'disk-wipe' | 'system-perms' | 'infra-destroy' | 'container-prune' | 'db-drop' | 'kill-by-name' | 'credentials-read'
export type AskRule = 'remote-exec' | 'git-rewrite' | 'git-clean' | 'sql-unchecked'

type Argv = readonly (string | null)[]

export const DANGER_MESSAGES: Record<DangerRule, string> = {
  'priv-escalation': 'bash-rules: do not run commands as another user (sudo, doas, su, pkexec, run0). Hand the command to the user to run.',
  'rm-root': 'bash-rules: refusing a recursive rm of /, a system directory or a home directory. Name the subdirectory you mean.',
  'rm-critical': 'bash-rules: refusing to delete a system file or directory, a credential directory (~/.ssh, ~/.gnupg, ~/.aws, ~/.kube) or a shell startup file. Hand it to the user to run.',
  'disk-wipe': 'bash-rules: refusing a command that can wipe or reformat a disk. Hand it to the user to run.',
  'system-perms': 'bash-rules: refusing a recursive chmod, chown or chgrp on / or a system directory. Name the subdirectory you mean.',
  'infra-destroy': 'bash-rules: refusing a command that destroys infrastructure (terraform/tofu destroy, apply -destroy, kubectl delete of a namespace or --all, helm uninstall). Hand it to the user to run.',
  'container-prune': 'bash-rules: refusing a docker or podman command that removes all images or volumes (system prune -a, volume prune, volume rm of every volume, compose down -v). Hand it to the user to run.',
  'db-drop': 'bash-rules: refusing a command that drops or truncates a database or table, or resets one (dropdb, dropuser, DROP DATABASE/SCHEMA/TABLE, TRUNCATE, FLUSHALL, prisma migrate reset, rails db:drop, manage.py flush, a mongosh drop()). Hand it to the user to run.',
  'kill-by-name': 'bash-rules: refusing to kill processes by name or pattern (pkill, killall, kill $(pgrep ...), pgrep | xargs kill, kill -1). It can end work that other sessions and agents run on this machine. Find the PID with pgrep -a <name> or ps, then kill <pid> the one you started; hand a broad kill to the user.',
  'credentials-read': "bash-rules: refusing a command that touches ~/.claude/.credentials.json, Claude Code's OAuth token cache. Reading it exposes the token, and outside an interactive session it is often stale. For usage or rate-limit numbers, read the JSON Claude Code passes to a statusline command (rate_limits.five_hour / seven_day: used_percentage, resets_at).",
}

export const ASK_MESSAGES: Record<AskRule, string> = {
  'remote-exec': 'bash-rules: this runs downloaded or decoded code in a shell or interpreter.',
  'git-rewrite': 'bash-rules: this force-pushes, mirrors, deletes a remote branch, hard-resets or discards every uncommitted change, which can lose commits or work.',
  'git-clean': 'bash-rules: this git clean deletes ignored files (.env, build caches, local config) as well as untracked ones.',
  'sql-unchecked': "bash-rules: couldn't check a SQL script file for DROP/TRUNCATE; confirm it's safe.",
}

export const baseName = (t: string | null) => (t ?? '').slice((t ?? '').lastIndexOf('/') + 1)

// Wrappers whose operands end at the command they run. `short` lists the option letters that take a value
// (attached or as the next word), `long` the long options that take one as the next word, `operands` the
// positional words before the command, `assigns` whether NAME=value words come before it, `lookup` the letters
// that make it a lookup instead of a run, and `sub` the subcommand words, one of which must come first (`uv run`).
type Wrapper = { short: string; long?: readonly string[]; operands?: number; assigns?: boolean; lookup?: string; sub?: readonly string[] }

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
    sub: ['run'],
  },
  // Multi-call binaries run their applet: `busybox rm -rf /`. Their `sh -c` script is the walker's (nestedScript).
  busybox: { short: '' },
  toybox: { short: '' },
  // Scheduling, locking and namespace wrappers. `-p` makes ionice, chrt and taskset act on a PID instead.
  ionice: { short: 'cn', long: ['class', 'classdata'], lookup: 'p' },
  chrt: { short: 'TPD', long: ['sched-runtime', 'sched-period', 'sched-deadline'], operands: 1, lookup: 'p' },
  taskset: { short: '', operands: 1, lookup: 'p' },
  flock: { short: 'wE', long: ['timeout', 'conflict-exit-code'], operands: 1 },
  unshare: { short: 'SGRw', long: ['setuid', 'setgid', 'root', 'wd', 'map-user', 'map-group', 'map-users', 'map-groups', 'propagation', 'setgroups', 'monotonic', 'boottime'] },
  'systemd-run': {
    short: 'upEMH',
    long: ['unit', 'property', 'setenv', 'description', 'slice', 'service-type', 'uid', 'gid', 'nice', 'working-directory', 'machine', 'host'],
  },
  watch: { short: 'nq', long: ['interval', 'equexit'] },
  parallel: { short: 'jaSdEINnPsL', long: ['jobs', 'arg-file', 'sshlogin', 'delimiter', 'colsep', 'max-args', 'joblog', 'results', 'tmpdir', 'workdir'] },
  // Package runners: `npx rimraf ~`, `pnpm dlx prisma migrate reset`, `bundle exec rails db:drop`.
  npx: { short: 'pc', long: ['package', 'call', 'shell', 'node-options'] },
  bunx: { short: 'p', long: ['package'] },
  pnpm: { short: '', long: ['package', 'filter', 'dir'], sub: ['dlx', 'exec'] },
  yarn: { short: 'p', long: ['package'], sub: ['dlx', 'exec'] },
  npm: { short: 'pc', long: ['package', 'call', 'workspace'], sub: ['exec', 'x'] },
  bun: { short: 'p', long: ['package'], sub: ['x'] },
  bundle: { short: '', sub: ['exec'] },
}

// The command a wrapper runs, or null when it runs none, is only a lookup (`command -v`), or its words are unknown.
function unwrap(argv: Argv): Argv | null {
  const w = WRAPPERS[baseName(argv[0])]
  if (!w) return null
  let i = 1
  if (w.sub) {
    while (i < argv.length && argv[i]?.startsWith('-')) i++
    if (!w.sub.includes(argv[i] ?? '')) return null
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

const SYSTEM_DIRS = [
  'bin', 'boot', 'dev', 'etc', 'home', 'lib', 'lib64', 'opt', 'root', 'run', 'sbin', 'srv', 'usr', 'var', 'Users',
  'private', 'Applications', 'mnt', 'media', 'proc', 'sys',
]

// macOS keeps /etc, /var and /tmp under /private: `/private/<dir>` stands for `/<dir>`.
const unprivate = (comps: string[]) => (comps.length >= 2 && comps[0] === 'private' ? comps.slice(1) : comps)

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
  const resolved = resolve(parts.slice(1), tilde)
  if (resolved === null) return true
  if (tilde) return resolved.length === 0 || (resolved.length === 1 && wipesAll(resolved[0]))
  const comps = unprivate(resolved)
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

// rimraf deletes recursively whatever it is given; `npx rimraf@5 ~` names it with a version.
const RIMRAF = /^rimraf(?:@|$)/

// The `find` commands whose output a view takes as its operands: the previous pipeline stage when xargs or parallel runs
// it (`find /etc | xargs rm -f`), and its own substitutions when an operand is an expansion (`rm $(find /etc)`).
function findFeeds(v: Argv, c: ShellCommand): Argv[] {
  const from: ShellCommand[] = []
  const p = c.pipeline
  if (p && viaXargs(v, c)) from.push(...p.prev.filter(e => e.pipeline?.stage === p.stage - 1))
  if (operands(v).includes(null)) from.push(...c.subs)
  return from.flatMap(e => viewsOf(e.argv)).filter(w => baseName(w[0]) === 'find')
}

const fedFrom = (v: Argv, c: ShellCommand, test: (path: string) => boolean) => findFeeds(v, c).some(f => findStarts(f).some(test))

const rmRoot = (v: Argv, c: ShellCommand) => {
  const name = baseName(v[0])
  if (name === 'rm') {
    if (options(v).includes('--no-preserve-root')) return true
    if (hasFlag(v, 'rR', ['--recursive']) && anyProtected(v, true)) return true
    return fedFrom(v, c, s => protectedPath(s, true))
  }
  if (RIMRAF.test(name)) return anyProtected(v, true) || fedFrom(v, c, s => protectedPath(s, true))
  if (name === 'find') {
    if (!findStarts(v).some(s => protectedPath(s, true))) return false
    return v.includes('-delete') || findExecs(v).some(g => runs(g, ['rm']))
  }
  return false
}

// Top-level directories whose contents are the system: deleting anything under them breaks the machine. /var counts only
// for its state directories, so /var/tmp, /var/log and /var/cache stay deletable.
const CRITICAL_ROOTS = new Set(['etc', 'boot', 'usr', 'bin', 'sbin', 'lib', 'lib32', 'lib64', 'libx32', 'root', 'System', 'Library', 'proc', 'sys'])
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
  const resolved = resolve(parts.slice(1), tilde)
  if (resolved === null) return true
  const comps = tilde ? resolved : unprivate(resolved)
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
// rm, rimraf or shred fed by a `find` from a critical path (`find ~/.ssh | xargs rm`) too.
const rmCritical = (v: Argv, c: ShellCommand) => {
  const name = baseName(v[0])
  if (name === 'rm' || name === 'unlink' || RIMRAF.test(name) || (name === 'shred' && hasFlag(v, 'u', ['--remove']))) {
    return operands(v).some(a => a !== null && criticalPath(a)) || fedFrom(v, c, criticalPath)
  }
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

// A `docker|podman volume ls`, whose output names every volume.
const listsVolumes = (w: Argv) => ['docker', 'podman'].includes(baseName(w[0])) && w[1] === 'volume' && (w[2] === 'ls' || w[2] === 'list')

const containerPrune = (v: Argv, c: ShellCommand) => {
  const name = baseName(v[0])
  if (name === 'docker-compose' || name === 'podman-compose') return composeDownVolumes(v)
  if (name !== 'docker' && name !== 'podman') return false
  const words = args(v).filter((a): a is string => a !== null && a[0] !== '-')
  const flags = args(v).filter((a): a is string => a !== null && a[0] === '-')
  if (words[0] === 'volume' && words[1] === 'prune') return true
  // `docker volume rm $(docker volume ls -q)` and `docker volume ls -q | xargs docker volume rm`: every volume.
  if (words[0] === 'volume' && (words[1] === 'rm' || words[1] === 'remove')) {
    const sources = [...(args(v).includes(null) ? c.subs : []), ...(c.pipeline && viaXargs(v, c) ? c.pipeline.prev : [])]
    return sources.some(e => viewsOf(e.argv).some(listsVolumes))
  }
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

// MongoDB shell code that drops a collection or a database (`db.users.drop()`, `db.dropDatabase()`). Only mongosh and
// mongo read it: DESTROY_SQL also checks SQL script files, where these words mean nothing.
const MONGO_DROP = /\.drop\s*\(|\bdrop(?:Database|Collection)\s*\(/

// Framework tasks that drop, reset or reload a database: rails/rake `db:drop`, `db:reset`, `db:schema:load` (and their
// `:all`/`purge` kin), and Django's `flush`.
const RAILS_TASK = /^db:(?:drop|reset|purge|schema:load|migrate:reset|truncate_all)(?::all)?$/

// The first word after a Django entry point, `manage.py <task>` or `django-admin <task>`, behind python when it runs the script.
function djangoTask(v: Argv): string | null {
  const name = baseName(v[0])
  if (name === 'manage.py' || name === 'django-admin') return operands(v)[0] ?? null
  const inv = /^python[\d.]*$/.test(name) ? invocation(v) : null
  if (!inv || inv.code >= 0 || baseName(v[inv.ops] ?? null) !== 'manage.py') return null
  return v.slice(inv.ops + 1).find(a => a === null || a[0] !== '-') ?? null
}

// `prisma migrate reset` drops the database; `prisma db push --force-reset` drops it before pushing.
function prismaDrop(v: Argv): boolean {
  if (baseName(v[0]) !== 'prisma') return false
  const words = operands(v)
  if (words[0] === 'migrate' && words[1] === 'reset') return true
  return words[0] === 'db' && words[1] === 'push' && options(v).includes('--force-reset')
}

const dbDrop = (v: Argv, c: ShellCommand): boolean => {
  if (REMOTE.has(baseName(v[0]))) {
    const at = v.findIndex((a, i) => i > 0 && a !== null && (SQL_CLIENTS.has(baseName(a)) || ['dropdb', 'dropuser', 'mysqladmin', 'redis-cli', 'valkey-cli'].includes(baseName(a))))
    if (at > 0) return dbDrop(v.slice(at), c)
    // ssh takes the remote command as one string.
    return baseName(v[0]) === 'ssh' && c.text.slice(1).some(t => (/\b(?:psql|mysql|sqlite3|mongosh)\b/.test(t) && DESTROY_SQL.test(t)) || /\bdrop(?:db|user)\s/.test(t))
  }
  const name = baseName(v[0])
  if (name === 'dropdb' || name === 'dropuser') return true
  if (name === 'mysqladmin') return args(v).some(a => a === 'drop')
  if (name === 'redis-cli' || name === 'valkey-cli') return args(v).some(a => a !== null && /^flush(?:all|db)$/i.test(a))
  if (prismaDrop(v)) return true
  if (name === 'rails' || name === 'rake') return operands(v).some(a => a !== null && RAILS_TASK.test(a))
  const task = djangoTask(v)
  if (task === 'flush' || task === 'reset_db') return true
  if (!SQL_CLIENTS.has(name)) return false
  // Only the client's own command reads its text: a view from a wrapper (`timeout 5 psql ...`) shares the same `c`.
  const text = clientText(v, c)
  if ((name === 'mongosh' || name === 'mongo') && text.some(t => MONGO_DROP.test(t))) return true
  return text.some(t => DESTROY_SQL.test(t))
}

const PID_FINDERS = ['pgrep', 'pidof', 'ps']

// Whether any command in the list, or what its wrappers run, is one of `names`.
const runsAny = (cs: readonly ShellCommand[], names: readonly string[]) => cs.some(x => viewsOf(x.argv).some(w => names.includes(baseName(w[0]))))

// Whether a view is what `xargs` or `parallel` (anywhere before it in the wrapper chain) runs, so its operands come from stdin.
function viaXargs(v: Argv, c: ShellCommand): boolean {
  const vs = viewsOf(c.argv)
  const at = vs.findIndex(w => w.length === v.length && w.every((a, i) => a === v[i]))
  return vs.slice(0, Math.max(at, 0)).some(w => ['xargs', 'parallel'].includes(baseName(w[0])))
}

// The targets of a `kill`: its operands, plus any option-looking word after the signal (`kill -9 -1`). The first
// option word is the signal; `-s SIG` and `-n NUM` name it in the next word. Null for a listing (`kill -l`, `--help`).
function killTargets(v: Argv): (string | null)[] | null {
  const out: (string | null)[] = []
  const rest = args(v)
  let signal = false
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a === null || a === '-' || a[0] !== '-') out.push(a)
    else if (a === '--') {
      out.push(...rest.slice(i + 1))
      break
    } else if (a === '-l' || a === '-L' || /^--(?:list|table|help|version)$/.test(a)) return null
    else if (a === '-s' || a === '-n' || a === '--signal') {
      signal = true
      i++
    } else if (a.startsWith('--') || !signal) signal = true
    else out.push(a)
  }
  return out
}

// Kills by name or pattern, and kills of a PID list that a search produced: other sessions and agents run on this machine.
// `pkill`, `killall`, `kill -1` (every process the user may signal), and `kill` whose targets are unknown (an expansion, or
// what xargs feeds it) while a PID finder is reachable: in its own substitutions or earlier pipeline stages, or a `pgrep`
// or `pidof` anywhere in the scan (`for p in $(pgrep x); do kill $p; done`). `ps` stays out of the scan-wide check, so
// `ps -p "$PID" >/dev/null && kill "$PID"` passes.
const killByName = (v: Argv, c: ShellCommand, all: readonly ShellCommand[]): boolean => {
  const name = baseName(v[0])
  if (name === 'pkill' || name === 'killall') {
    if (hasFlag(v, 'V', ['--version', '--help'])) return false
    return !(name === 'killall' && hasFlag(v, 'l', ['--list']))
  }
  if (name !== 'kill') return false
  const targets = killTargets(v)
  if (targets === null) return false
  if (targets.includes('-1')) return true
  if (!targets.includes(null) && !viaXargs(v, c)) return false
  return runsAny(c.subs, PID_FINDERS) || (c.pipeline !== null && runsAny(c.pipeline.earlier, PID_FINDERS)) || runsAny(all, ['pgrep', 'pidof'])
}

// The view's words as written (quotes removed, expansions kept): the slice of `c.text` that `v` came from.
function viewText(c: ShellCommand, v: Argv): string[] {
  for (let k = 0; k + v.length <= c.argv.length; k++) {
    if (v.every((a, i) => c.argv[k + i] === a)) return c.text.slice(k, k + v.length)
  }
  return v.map(a => a ?? '')
}

const METADATA = new Set(['ls', 'stat', 'test', '[', 'file', 'du', 'realpath', 'readlink', 'basename', 'dirname'])
const GREP_FAMILY = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'ugrep'])
const CRED_FILE = '.credentials.json'

// The indexes of a search command's pattern words: the first operand when no -e/-f/--regexp/--file is given, and the
// values of those options.
function patternWords(v: Argv): Set<number> {
  const skip = new Set<number>()
  let given = false
  let first = -1
  for (let i = 1; i < v.length; i++) {
    const a = v[i]
    if (a === null || a === '-' || a[0] !== '-') {
      if (first < 0) first = i
    } else if (a === '--') {
      if (first < 0 && i + 1 < v.length) first = i + 1
      break
    } else if (a.startsWith('--')) {
      const name = a.split('=')[0]
      if (name === '--regexp' || name === '--file') {
        given = true
        if (a.includes('=')) skip.add(i)
        else skip.add(++i)
      } else if (['--exclude', '--exclude-dir', '--include', '--include-dir'].includes(name)) {
        if (a.includes('=')) skip.add(i)
        else skip.add(++i)
      }
    } else {
      for (let k = 1; k < a.length; k++) {
        if ('ef'.includes(a[k])) {
          given = true
          if (k === a.length - 1) skip.add(++i)
          else skip.add(i)
          break
        }
        if ('mABCdD'.includes(a[k])) {
          if (k === a.length - 1) i++
          break
        }
      }
    }
  }
  if (!given && first >= 0) skip.add(first)
  return skip
}

// Whether a path component names the credentials file: the name, or a glob that starts with a dot and can match it.
const credName = (s: string) => s === CRED_FILE || (s[0] === '.' && hasGlob(s) && globMatches(s, CRED_FILE))

// Whether a path component names a `.claude` directory: the name, or a glob that starts with a dot and can match it
// (`.cla*`, `.c?aude`). A glob without the leading dot (`*`) skips dot directories in the shell.
const claudeName = (s: string) => s === '.claude' || (s[0] === '.' && hasGlob(s) && globMatches(s, '.claude'))

// Whether a literal path is the file under a `.claude` directory (`~/.claude/...`, `/home/x/.claude/...`, a relative `.claude/...`).
function credPath(t: string): boolean {
  // A word with spaces is prose (a commit message), unless it starts like a path (`/Users/John Smith/...`).
  if (/\s/.test(t) && !/^(?:[/~$]|\.\/)/.test(t)) return false
  const comps = resolve(t.split('/'), t[0] === '~')
  return comps !== null && comps.length >= 2 && claudeName(comps[comps.length - 2]) && credName(comps[comps.length - 1])
}

// The value of a `key=VALUE` or `--option=VALUE` word, or the word.
const valueOf = (w: string) => /^(?:--?[\w-]+|[A-Za-z_][\w.]*)=(.*)$/s.exec(w)?.[1] ?? w

// A word as a path candidate: the `key=` or `--opt=` prefix and a curl-style `@` dropped, a leading $HOME read as `~`.
function pathOf(w: string): string {
  const s = valueOf(w)
  return (s[0] === '@' ? s.slice(1) : s).replace(/^\$\{?HOME\}?(?=\/)/, '~')
}

// Commands that only take a path as a name: metadata readers, text printers, and git subcommands that do not read contents.
const NAME_ONLY_GIT = new Set(['check-ignore', 'ls-files', 'log', 'status'])
function namesOnly(v: Argv, c: ShellCommand, all: readonly ShellCommand[]): boolean {
  const name = baseName(v[0])
  if (name === 'echo' || name === 'printf') {
    // A later stage that takes file names from stdin (`echo path | xargs cat`) reads the file.
    return !all.some(d => d.pipeline !== null && d.nesting === c.nesting && d.pipeline.earlier.includes(c) && runsAny([d], ['xargs', 'parallel']))
  }
  if (name === 'du') return !v.some(a => a !== null && a.startsWith('--files0-from'))
  if (name === 'file') return !hasFlag(v, 'f', ['--files-from'])
  if (METADATA.has(name)) return true
  const call = gitCall(v)
  if (call?.sub === 'log' && hasFlag(['git', ...call.rest], 'pu', ['--patch'])) return false
  return call !== null && (NAME_ONLY_GIT.has(call.sub) || (call.sub === 'rm' && call.rest.includes('--cached')))
}

// A directory change into a `.claude` directory (or $CLAUDE_CONFIG_DIR).
const entersClaudeDir = (c: ShellCommand) => {
  const name = baseName(c.argv[0] ?? null)
  if (name !== 'cd' && name !== 'pushd') return false
  const t = c.text.slice(1).find(w => w[0] !== '-')
  if (t === undefined) return false
  if (/^\$\{?CLAUDE_CONFIG_DIR\}?\/*$/.test(t)) return true
  const comps = resolve(t.split('/'), t[0] === '~')
  return comps !== null && comps.length > 0 && claudeName(comps[comps.length - 1])
}

// Any touch of ~/.claude/.credentials.json, Claude Code's OAuth token cache, outside commands that only read metadata.
// A word counts when it is the path (or the value of `key=PATH`), an assignment or literal redirect target holds it, a
// word names `$CLAUDE_CONFIG_DIR/.credentials.json`, a bare `.credentials.json` follows a `cd` into a `.claude` directory,
// or interpreter code (inline, heredoc, here-string) mentions both `.claude` and `.credentials.json`. Search patterns
// are skipped, their file operands count.
const credentialsRead = (v: Argv, c: ShellCommand, all: readonly ShellCommand[]): boolean => {
  const name = baseName(v[0])
  const exempt = namesOnly(v, c, all)
  if (c.redirects.some(r => r.op !== '<<' && r.op !== '<<<' && r.target !== null && credPath(r.target))) return true
  if (exempt) return false
  const words = viewText(c, v)
  const skip = GREP_FAMILY.has(name) ? patternWords(v) : new Set<number>()
  const git = name === 'git'
  let claudeDir: boolean | undefined
  for (let i = 0; i < v.length; i++) {
    if (skip.has(i)) continue
    const a = v[i]
    const cands = [a, words[i]].filter((w): w is string => !!w).map(pathOf)
    // `git show REV:path` names a file at a revision.
    if (git) for (const p of [...cands]) if (/^[^/\s:]+:./.test(p)) cands.push(p.slice(p.indexOf(':') + 1))
    for (const p of cands) {
      if (credPath(p)) return true
      const m = /^\$\{?CLAUDE_CONFIG_DIR\}?\/(.*)$/s.exec(p)
      if (m && credPath(`.claude/${m[1]}`)) return true
    }
    if (a !== null && /^(?:\.\/)*\.credentials\.json$/.test(valueOf(a)) && (claudeDir ??= all.some(entersClaudeDir))) return true
  }
  if (c.assigns.some(a => a.value !== null && credPath(a.value))) return true
  const inv = invocation(v)
  const code: string[] = []
  if (inv && !inv.shell && inv.code >= 0) code.push(words[inv.code] ?? '')
  if (stdinReader(v) === 'script') {
    code.push(...c.heredocs.map(h => h.body), ...c.redirects.filter(r => r.op === '<<<').map(r => r.text))
    const p = c.pipeline
    if (p) for (const e of p.prev) if (e.pipeline?.stage === p.stage - 1) code.push(...e.heredocs.map(h => h.body))
  }
  return code.some(t => t.includes('.claude') && t.includes(CRED_FILE))
}

const DANGER: [DangerRule, (v: Argv, c: ShellCommand, all: readonly ShellCommand[]) => boolean][] = [
  ['priv-escalation', privEscalation],
  ['rm-root', rmRoot],
  ['rm-critical', rmCritical],
  ['disk-wipe', diskWipe],
  ['system-perms', systemPerms],
  ['infra-destroy', infraDestroy],
  ['container-prune', containerPrune],
  ['db-drop', dbDrop],
  ['kill-by-name', killByName],
  ['credentials-read', credentialsRead],
]

// The first danger rule that any command, or anything its wrappers and `find -exec` run, trips. Rules are tried in
// order, so `sudo rm -rf /` reports priv-escalation.
export function dangerHit(commands: readonly ShellCommand[]): { rule: DangerRule; message: string } | null {
  const all = commands.map(c => ({ c, vs: viewsOf(c.argv) }))
  for (const [rule, test] of DANGER) {
    if (all.some(({ c, vs }) => vs.some(v => test(v, c, commands)))) return { rule, message: DANGER_MESSAGES[rule] }
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

// Branch names that are usually shared or protected; an expansion (null) might be one.
const PROTECTED_BRANCH = /^(?:refs\/heads\/)?(?:main|master|trunk|develop|development|dev|staging|stable|prod|production|live|release(?:[/-].*)?)$/

// A push that deletes a remote branch: `--delete`/`-d` with a protected-ish branch (or an expansion) among the refs after
// the remote, or a `:<branch>` refspec, which deletes whatever it names.
function deletePush(rest: Argv): boolean {
  let del = false
  let positional = false
  const words: (string | null)[] = []
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a !== null && !positional && a === '--') positional = true
    else if (a !== null && !positional && a[0] === '-') {
      if (a === '--delete' || (/^-[^-]/.test(a) && a.includes('d'))) del = true
      if (PUSH_VALUED.has(a)) i++
    } else words.push(a)
  }
  const refs = words.slice(1)
  if (refs.some(r => r !== null && /^:./.test(r))) return true
  return del && refs.some(r => r === null || PROTECTED_BRANCH.test(r))
}

// `git checkout -- .` (or `checkout .`): it discards every uncommitted change under the current directory.
const DISCARD_ALL = new Set(['.', './', ':/', '*', ':/*'])
function checkoutAll(rest: Argv): boolean {
  const end = rest.indexOf('--')
  const paths = end >= 0 ? rest.slice(end + 1) : rest.filter(a => a !== null && a[0] !== '-')
  return paths.some(a => a !== null && DISCARD_ALL.has(a))
}

const gitRewrite = (v: Argv) => {
  const call = gitCall(v)
  if (!call) return false
  if (call.sub === 'reset') return call.rest.slice(0, call.rest.includes('--') ? call.rest.indexOf('--') : undefined).includes('--hard')
  if (call.sub === 'checkout') return checkoutAll(call.rest)
  return call.sub === 'push' && (forcePush(call.rest) || deletePush(call.rest))
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
