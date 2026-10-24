// Decides whether a path is a protected lint, format or hook config, a git hook, or a git config file. Pure: no I/O.
// Both the file-tool branch and the Bash branch use it.
//
// - `config`: a lint, format or hook-manager config by base name (`isProtectedName`). Callers keep the rule that
//   creating a new one passes.
// - `hooks`: `.husky` or `.git/hooks`, the directories themselves or anything under them. Linked worktrees read hooks
//   from the common `.git/hooks`; `.git/worktrees/<name>/hooks` is matched too as a cheap extra.
// - `git-config`: `.git/config`, `.git/config.worktree`, or a linked worktree's `.git/worktrees/<name>/config.worktree`.
//
// The path is read lexically (`.` and `..` folded, `\` read as `/`, case ignored), so `sub/../.husky/x` matches. Bare
// repositories, a `GIT_DIR` elsewhere and a custom `core.hooksPath` directory are out of scope.

import { isProtectedName } from './config-protect.ts'

export type ProtectedPath = { kind: 'config' | 'hooks' | 'git-config'; shown: string }

function segments(path: string): string[] {
  const out: string[] = []
  for (const s of path.replace(/\\/g, '/').split('/')) {
    if (s === '' || s === '.') continue
    if (s === '..' && out.length > 0 && out[out.length - 1] !== '..') out.pop()
    else out.push(s)
  }
  return out
}

const SHOWN_MAX = 80
const show = (segs: string[]) => segs.join('/').slice(0, SHOWN_MAX)

export function protectedPath(path: string): ProtectedPath | null {
  const segs = segments(path)
  if (segs.length === 0) return null
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i].toLowerCase()
    if (s === '.husky') return { kind: 'hooks', shown: show(segs.slice(i)) }
    if (s !== '.git') continue
    let rest = segs.slice(i + 1).map(r => r.toLowerCase())
    if (rest[0] === 'worktrees' && rest.length > 2) rest = rest.slice(2)
    if (rest[0] === 'hooks') return { kind: 'hooks', shown: show(segs.slice(i)) }
    if (rest.length === 1 && (rest[0] === 'config' || rest[0] === 'config.worktree')) return { kind: 'git-config', shown: show(segs.slice(i)) }
  }
  const name = segs[segs.length - 1]
  return isProtectedName(name) ? { kind: 'config', shown: name.slice(0, SHOWN_MAX) } : null
}
