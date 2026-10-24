// Finds Bash commands that write, move, remove or re-mode a protected lint, format or hook config, a git hook or a git
// config file, or that uninstall a hook manager's hooks. Pure: no I/O.
//
// It reads redirect targets and the operands of rm, mv, cp (destination), ln, chmod, truncate, tee and in-place sed and
// perl, through the same wrappers and nested shells as the git check. Like that check it targets model habits, not a
// determined adversary: an operand that is an expansion (`rm "$f"`), a glob that hides a name (`rm .eslint*`), a path
// reached through `cd`, and other writers (python, dd, install, find -delete, git rm) are out of scope.

import { MAX_COMMAND, scan, views } from './git-bypass.ts'
import { protectedPath } from './protect-path.ts'
import type { ProtectedPath } from './protect-path.ts'

type Argv = readonly (string | null)[]
const base = (t: string | null | undefined) => (t ?? '').slice((t ?? '').lastIndexOf('/') + 1)

// Redirects that open their target for writing. `>&` with a descriptor target (`2>&1`) names no protected path.
const WRITE_OPS = new Set(['>', '>>', '>|', '&>', '&>>', '<>', '>&'])
// Commands where any operand may be the protected path: what they remove, move, link, truncate, re-mode or write.
const ANY_OPERAND = new Set(['rm', 'mv', 'ln', 'chmod', 'truncate', 'tee'])

// sed's in-place flag, also in a cluster (`-Ei`, `-i.bak`, BSD `-I`), and GNU's `--in-place` or a prefix of it.
const sedInPlace = (w: string) => /^-[A-Za-z]*[iI]/.test(w) || w.startsWith('--in')
// perl's `-i`, also in a cluster (`-pi`, `-pie`), stopping where a switch takes the rest of the word or the next word.
function perlInPlace(w: string): boolean {
  if (w[0] !== '-' || w.startsWith('--')) return false
  for (let k = 1; k < w.length; k++) {
    const ch = w[k]
    if (ch === 'i') return true
    if (ch === 'l' || ch === '0') {
      // An optional octal value, after which the cluster goes on (`-lne`, `-0777pi`).
      while (k + 1 < w.length && /[0-9]/.test(w[k + 1])) k++
    } else if ('eECdDFImMx'.includes(ch)) return false
  }
  return false
}
const IN_PLACE: Record<string, (w: string) => boolean> = { sed: sedInPlace, gsed: sedInPlace, perl: perlInPlace }

// A word read as a path: `--opt=value` gives its value, any other option word gives nothing.
const operand = (w: string): string | null => (w[0] !== '-' ? w : w.startsWith('--') && w.includes('=') ? w.slice(w.indexOf('=') + 1) : null)

// cp's destination: the `-t` directory, or the last operand. A directory destination (`-t`, a trailing `/`, `.`, `..`)
// also yields where each source lands in it.
function cpTargets(argv: Argv): string[] {
  const words: string[] = []
  let dir: string | null = null
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === null) continue
    if (a === '--target-directory') dir = argv[++i] ?? null
    else if (a.startsWith('--target-directory=')) dir = a.slice('--target-directory='.length)
    else if (/^-[A-Za-z]*t/.test(a)) {
      // `-t DIR`, `-rt DIR`, `-tDIR`.
      const at = a.indexOf('t')
      dir = at === a.length - 1 ? (argv[++i] ?? null) : a.slice(at + 1)
    } else if (a[0] !== '-') words.push(a)
  }
  const dest = dir ?? words.pop()
  if (dest === undefined || dest === null) return []
  const isDir = dir !== null || /(?:^|\/)\.{0,2}$/.test(dest) || dest === '~'
  return isDir ? [dest, ...words.map(s => `${dest.replace(/\/+$/, '')}/${base(s.replace(/\/+$/, ''))}`)] : [dest]
}

// The paths a command writes, as far as its name and words tell. `creates` marks a write that makes the file when it is
// not there (a cp destination), as opposed to one that removes, moves or edits what is there.
function writtenPaths(argv: Argv): { paths: string[]; creates: boolean } {
  const name = base(argv[0])
  if (name === 'cp') return { paths: cpTargets(argv), creates: true }
  const inPlace = IN_PLACE[name]
  if (!ANY_OPERAND.has(name) && !(inPlace && argv.some(a => a !== null && inPlace(a)))) return { paths: [], creates: false }
  return { paths: argv.slice(1).flatMap(a => (a === null ? [] : (operand(a) ?? []))), creates: false }
}

const HOOK_MANAGERS = new Set(['pre-commit', 'prek', 'husky', 'lefthook'])
// Package runners, the subcommand words they take before the package, and whether one is required.
const RUNNERS: Record<string, { subs: string[]; needSub?: boolean }> = {
  npx: { subs: [] },
  bunx: { subs: [] },
  uvx: { subs: [] },
  pnpm: { subs: ['dlx', 'exec'] },
  yarn: { subs: ['dlx', 'exec'] },
  npm: { subs: ['exec', 'x'], needSub: true },
  bun: { subs: ['x'], needSub: true },
  pipx: { subs: ['run'], needSub: true },
  uv: { subs: ['tool', 'run'], needSub: true },
}
const RUNNER_VALUED = new Set(['-p', '--package', '--from', '--with', '--python', '--spec'])

const MAX_RUNNERS = 8
const DEEP_RUNNERS = 'check-bypass-guard: this command nests more package runners than the guard reads, so it could not be checked for a hook-manager uninstall. Confirm it leaves the git hooks installed.'

// The reason to ask about a hook-manager uninstall (`pre-commit uninstall`, `npx husky@9 uninstall`, `python -m
// pre_commit uninstall`), also when a runner is still in front after MAX_RUNNERS levels, or null.
function uninstalls(argv: Argv): string | null {
  let a = argv
  for (let level = 0; ; level++) {
    const name = base(a[0])
    if (/^python[0-9.]*$/.test(name) && a[1] === '-m' && a[2] === 'pre_commit') {
      a = ['pre-commit', ...a.slice(3)]
      break
    }
    const r = RUNNERS[name]
    if (!r) break
    if (level === MAX_RUNNERS) return DEEP_RUNNERS
    let i = 1
    while (i < a.length && r.subs.includes(a[i] ?? '')) i++
    if (r.needSub && i === 1) return null
    for (; i < a.length; i++) {
      const w = a[i]
      if (w === null) return null
      if (w === '--') {
        i++
        break
      }
      if (w[0] !== '-') break
      if (RUNNER_VALUED.has(w)) i++
    }
    a = a.slice(i)
  }
  // `husky@9`, `pre-commit==4.0`: the package name without its version.
  const tool = base(a[0]).replace(/(?<=.)[@=<>~!].*$/, '')
  if (!HOOK_MANAGERS.has(tool)) return null
  const sub = a.slice(1).find(w => w === null || w[0] !== '-')
  return sub === 'uninstall' ? uninstallReason(tool) : null
}

const writeReason = (p: ProtectedPath) =>
  p.kind === 'config'
    ? `check-bypass-guard: this command writes, moves or removes ${p.shown}, which configures a linter, formatter or git hook. Fix the code the check reports rather than loosening the check; change the config only if the user asked for it.`
    : `check-bypass-guard: this command changes ${p.shown}, a git hook or git config file, which can turn the hooks or signing off. Fix what the hook reports; change it only if the user asked for it.`
const uninstallReason = (tool: string) =>
  `check-bypass-guard: ${tool} uninstall removes the git hooks. Fix what the hook reports; run it only if the user asked for it.`

// For text the parser could not read: a word that names a protected path, or a hook-manager uninstall. Linear, so it
// may run on the whole input. Only words with a `.` or an `rc` ending can name one.
function tokenScan(text: string): string | null {
  for (const t of text.split(/[\s'"`;&|<>(){}=]+/)) {
    if (!t.includes('.') && !t.endsWith('rc')) continue
    const p = protectedPath(t)
    if (p) return writeReason(p)
  }
  const m = /\b(pre-commit|pre_commit|prek|husky|lefthook)\b[^\n;&|]{0,80}?\buninstall\b/.exec(text)
  return m ? uninstallReason(m[1] === 'pre_commit' ? 'pre-commit' : m[1]) : null
}

// Whether something is at a path, as the caller resolves it (against the session's cwd). It stays out of this module so
// the check is pure.
export type Exists = (path: string) => boolean

// The reason to ask about a Bash command, or null. A redirect or cp that would create a lint, format or hook-manager
// config that is not there yet passes, as a new file does for Edit and Write; hooks and git config files always ask, and
// so do rm, mv and the other operand writers. `~` paths count as present, since home is not resolved here, and so does
// a relative path in a command that changes directory, since it may resolve elsewhere.
export function checkBashWrites(command: string, exists: Exists = () => true): string | null {
  if (command.length > MAX_COMMAND) return tokenScan(command)
  const { commands, ok } = scan(command)
  const moves = commands.some(c => base(c.argv[0]) === 'cd' || base(c.argv[0]) === 'pushd')
  const asks = (path: string, creates: boolean): string | null => {
    const p = protectedPath(path)
    if (!p) return null
    const known = path.startsWith('/') || (!moves && !path.startsWith('~'))
    if (p.kind === 'config' && creates && known && !exists(path)) return null
    return writeReason(p)
  }
  for (const c of commands) {
    for (const r of c.redirects) {
      const reason = WRITE_OPS.has(r.op) && r.target !== null ? asks(r.target, true) : null
      if (reason) return reason
    }
    for (const v of views(c)) {
      const { paths, creates } = writtenPaths(v.argv)
      for (const path of paths) {
        const reason = asks(path, creates)
        if (reason) return reason
      }
      const reason = uninstalls(v.argv)
      if (reason) return reason
    }
  }
  return ok ? null : tokenScan(command)
}
