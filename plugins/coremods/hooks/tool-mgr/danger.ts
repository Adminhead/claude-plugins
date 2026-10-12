// Danger rules for tool-mgr: commands that destroy a system or escalate privilege (deny), and commands that
// run downloaded code or rewrite git history (ask). They target model accidents, not a determined adversary,
// so variable indirection, download-then-run and `cd / && rm -rf *` are out of scope. Nothing here touches `$`.

import type { ShellCommand } from '../shell/walk'

export type DangerRule = 'priv-escalation' | 'rm-root' | 'disk-wipe' | 'system-perms'
export type AskRule = 'remote-exec' | 'git-rewrite'

type Argv = readonly (string | null)[]

export const DANGER_MESSAGES: Record<DangerRule, string> = {
  'priv-escalation': 'tool-mgr: do not run commands as another user (sudo, doas, su, pkexec, run0). Hand the command to the user to run.',
  'rm-root': 'tool-mgr: refusing a recursive rm of /, a system directory or a home directory. Name the subdirectory you mean.',
  'disk-wipe': 'tool-mgr: refusing a command that can wipe or reformat a disk. Hand it to the user to run.',
  'system-perms': 'tool-mgr: refusing a recursive chmod, chown or chgrp on / or a system directory. Name the subdirectory you mean.',
}

export const ASK_MESSAGES: Record<AskRule, string> = {
  'remote-exec': 'tool-mgr: this runs downloaded or decoded code in a shell or interpreter.',
  'git-rewrite': 'tool-mgr: this force-pushes or hard-resets, which can discard commits or work.',
}

const baseName = (t: string | null) => (t ?? '').slice((t ?? '').lastIndexOf('/') + 1)

// Wrappers whose operands end at the command they run. `short` lists the option letters that take a value
// (attached or as the next word), `long` the long options that take one as the next word, `operands` the
// positional words before the command, and `assigns` whether NAME=value words come before it.
type Wrapper = { short: string; long?: readonly string[]; operands?: number; assigns?: boolean; lookup?: string }

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
}

// The command a wrapper runs, or null when it runs none, is only a lookup (`command -v`), or its words are unknown.
function unwrap(argv: Argv): Argv | null {
  const w = WRAPPERS[baseName(argv[0])]
  if (!w) return null
  let i = 1
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

// The non-option words (a lone `-` counts, a null word may be a path), including all after `--`.
const operands = (v: Argv) => {
  const rest = args(v)
  const end = rest.indexOf('--')
  return [...(end < 0 ? rest : rest.slice(0, end)).filter(a => a === null || a === '-' || a[0] !== '-'), ...(end < 0 ? [] : rest.slice(end + 1))]
}

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

const SYSTEM_DIRS = ['bin', 'boot', 'dev', 'etc', 'home', 'lib', 'lib64', 'opt', 'root', 'sbin', 'srv', 'usr', 'var']

// null stands for any one name.
const SYSTEM_PATHS: (string | null)[][] = [[], ...SYSTEM_DIRS.map(d => [d])]
const HOME_PATHS: (string | null)[][] = [['home', null], ['Users', null]]

const matches = (comps: string[], paths: (string | null)[][]) =>
  paths.some(p => p.length === comps.length && comps.every((c, i) => p[i] === null || (hasGlob(c) ? globMatches(c, p[i]!) : c === p[i])))

const ALL = /^\*+$/

// Whether a literal path names the root or a top-level system directory, or with `home` also a home directory
// (`~`, `~user`, `/home/<name>`, `/Users/<name>`) or everything in one (`~/*`). The path is normalized first (`//`, `/.`,
// `/..`, a trailing slash), and a glob component counts when it can match a protected name (`/*`, `/e*`, `/[b]in`).
// Relative paths are never protected.
function protectedPath(t: string, home: boolean): boolean {
  const parts = t.split('/')
  const tilde = home && /^~([^/+-][^/]*)?$/.test(parts[0])
  if (!tilde && parts[0] !== '') return false
  const comps: string[] = []
  for (const p of parts.slice(1)) {
    if (p === '' || p === '.') continue
    if (p === '..') {
      if (comps.length > 0) comps.pop()
      else if (tilde) return true
      continue
    }
    comps.push(p)
  }
  if (tilde) return comps.length === 0 || (comps.length === 1 && ALL.test(comps[0]))
  if (matches(comps, SYSTEM_PATHS)) return true
  return home && (matches(comps, HOME_PATHS) || (comps.length === 3 && /^(?:home|Users)$/.test(comps[0]) && ALL.test(comps[2])))
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
    return v.includes('-delete') || findExecs(v).some(g => viewsOf(g).some(x => baseName(x[0]) === 'rm'))
  }
  return false
}

const BLOCK_DEV = /^\/dev\/(?:sd|hd|vd|xvd|nvme|mmcblk|loop|md\d|dm-|mapper\/|disk\/|sr\d|nbd|ram|zd|rbd|mtd|mem$|kmem$)/
const WRITE_OPS = new Set(['>', '>>', '>|', '&>', '&>>', '>&', '<>'])

const diskWipe = (v: Argv, c: ShellCommand) => {
  const name = baseName(v[0])
  if (c.redirects.some(r => WRITE_OPS.has(r.op) && r.target !== null && BLOCK_DEV.test(r.target))) return true
  // A literal image file (`mkfs.ext4 disk.img`) is no disk; a device path or an unknown operand (`$DEV`) is.
  if (/^mkfs/.test(name) || name === 'wipefs' || name === 'blkdiscard') return operands(v).some(a => a === null || BLOCK_DEV.test(a))
  if (name === 'sgdisk') return options(v).some(a => a !== null && (a === '--zap-all' || /^-[A-Za-z0-9]*Z/.test(a)))
  if (name === 'dd') return args(v).some(a => a !== null && a.startsWith('of=') && BLOCK_DEV.test(a.slice(3)))
  if (name === 'shred') return operands(v).some(a => a !== null && BLOCK_DEV.test(a))
  return false
}

const systemPerms = (v: Argv) =>
  ['chmod', 'chown', 'chgrp'].includes(baseName(v[0])) && hasFlag(v, 'R', ['--recursive']) && anyProtected(v, false)

const PRIV = new Set(['sudo', 'doas', 'su', 'pkexec', 'run0'])
const privEscalation = (v: Argv) => PRIV.has(baseName(v[0]))

const DANGER: [DangerRule, (v: Argv, c: ShellCommand) => boolean][] = [
  ['priv-escalation', privEscalation],
  ['rm-root', rmRoot],
  ['disk-wipe', diskWipe],
  ['system-perms', systemPerms],
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

const gitRewrite = (v: Argv) => {
  const call = gitCall(v)
  if (!call) return false
  const { rest } = call
  const end = rest.indexOf('--')
  const opts = end < 0 ? rest : rest.slice(0, end)
  if (call.sub === 'reset') return opts.includes('--hard')
  if (call.sub !== 'push') return false
  return (
    opts.some(a => a !== null && (/^--force(?:-with-lease)?(?:=|$)/.test(a) || (/^-[^-]/.test(a) && a.includes('f')))) ||
    rest.some(a => a !== null && /^\+./.test(a))
  )
}

const DOWNLOADERS = new Set(['curl', 'wget'])
const isDownloader = (v: Argv) => {
  const name = baseName(v[0])
  return DOWNLOADERS.has(name) || (name === 'base64' && hasFlag(v, 'dD', ['--decode'])) || (name === 'xxd' && hasFlag(v, 'r'))
}

const SHELL_NAME = /^(?:sh|bash|zsh|dash|ksh)$/
const SCRIPT_NAME = /^(?:python[\d.]*|node|nodejs|bun|deno|ruby|perl|php)$/
const STDIN_WORDS = new Set(['-', '/dev/stdin', 'run'])

// A shell or interpreter that takes its program from stdin: no `-c` script and no program file.
function readsStdin(v: Argv): boolean {
  const name = baseName(v[0])
  const ops = operands(v)
  if (SHELL_NAME.test(name)) return !hasFlag(v, 'c') && (hasFlag(v, 's') || ops.every(a => a !== null && STDIN_WORDS.has(a)))
  if (SCRIPT_NAME.test(name)) return ops.every(a => a !== null && STDIN_WORDS.has(a))
  if (name === 'source' || name === '.') return ops.some(a => a === '-' || a === '/dev/stdin')
  return false
}

// Runs a script it was handed: a shell, `source`, `.`, or `eval`.
const runsScript = (v: Argv) => SHELL_NAME.test(baseName(v[0])) || ['source', '.', 'eval'].includes(baseName(v[0]))

const downloads = (c: ShellCommand) => viewsOf(c.argv).some(isDownloader)

// remote-exec:
// - a downloader or decoder in an earlier stage of a pipeline that feeds a stdin-reading shell or interpreter;
// - a script runner with an expansion operand that holds a downloader (`bash <(curl x)`, `eval "$(curl x)"`, `bash <<< "$(curl x)"`).
function remoteExec(commands: readonly ShellCommand[]): boolean {
  return commands.some(c => {
    const vs = viewsOf(c.argv)
    if (c.pipeline && c.pipeline.stage > 0 && vs.some(readsStdin) && c.pipeline.earlier.some(downloads)) return true
    const dynamic = c.argv.slice(1).includes(null) || c.redirects.some(r => (r.op === '<' || r.op === '<<<') && r.target === null)
    return dynamic && vs.some(runsScript) && c.subs.some(downloads)
  })
}

const ASK: [AskRule, (commands: readonly ShellCommand[]) => boolean][] = [
  ['remote-exec', remoteExec],
  ['git-rewrite', commands => commands.some(c => viewsOf(c.argv).some(gitRewrite))],
]

export function askHit(commands: readonly ShellCommand[]): { rule: AskRule; message: string } | null {
  for (const [rule, test] of ASK) if (test(commands)) return { rule, message: ASK_MESSAGES[rule] }
  return null
}
