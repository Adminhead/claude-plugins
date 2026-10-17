// Pure logic for the git status line: parsers and the drawing, no `$`.

export type GitStatus = {
  branch: string
  ahead: number
  behind: number
  staged: number
  modified: number
  untracked: number
  conflicts: number
}

export type DiffLines = {
  added: number
  deleted: number
}

export type Extras = {
  // The linked worktree's name, or null in the main worktree.
  worktree: string | null
  stashes: number
}

export type Snapshot = {
  // Repo-relative (`repo/sub/dir`) inside a repository, else the absolute cwd.
  place: string
  git: (GitStatus & DiffLines & Extras) | null
}

// Unpushed-commit thresholds; 0 turns a level off.
export type PushThresholds = {
  warning: number
  critical: number
}

export const DEFAULT_THRESHOLDS: PushThresholds = { warning: 5, critical: 20 }

// Parses `git status --porcelain=v2 --branch`.
export function parseStatus(out: string): GitStatus {
  const s: GitStatus = {
    branch: '',
    ahead: 0,
    behind: 0,
    staged: 0,
    modified: 0,
    untracked: 0,
    conflicts: 0,
  }
  let oid = ''
  for (const line of out.split('\n')) {
    const f = line.split(' ')
    if (line.startsWith('# branch.head ')) s.branch = f[2] ?? ''
    else if (line.startsWith('# branch.oid ')) oid = f[2] ?? ''
    else if (line.startsWith('# branch.ab ')) {
      s.ahead = Number((f[2] ?? '+0').slice(1)) || 0
      s.behind = Number((f[3] ?? '-0').slice(1)) || 0
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const xy = f[1] ?? '..'
      if (xy[0] !== '.') s.staged++
      if (xy[1] !== '.') s.modified++
    } else if (line.startsWith('u ')) s.conflicts++
    else if (line.startsWith('? ')) s.untracked++
  }
  if (s.branch === '(detached)') s.branch = oid === '(initial)' ? oid : `(${oid.slice(0, 7)})`
  return s
}

// Sums `git diff --numstat`; binary files (`-\t-`) count as zero.
export function parseNumstat(out: string): DiffLines {
  const d: DiffLines = { added: 0, deleted: 0 }
  for (const line of out.split('\n')) {
    const [a, r] = line.split('\t')
    if (a && a !== '-') d.added += Number(a) || 0
    if (r && r !== '-') d.deleted += Number(r) || 0
  }
  return d
}

export type RepoDirs = {
  top: string
  // The linked worktree's name, or null in the main worktree.
  worktree: string | null
}

// Parses `git rev-parse --path-format=absolute --show-toplevel --git-dir --git-common-dir`
// (three lines). A linked worktree's git dir (`<common>/worktrees/<name>`) differs from the
// common dir; the main worktree's and a submodule's do not.
export function parseRevParse(out: string): RepoDirs | null {
  const [top, gitDir, commonDir] = out.split('\n').map(l => l.trim())
  if (!top || !gitDir || !commonDir || !top.startsWith('/')) return null
  const strip = (p: string) => p.replace(/\/+$/, '')
  const g = strip(gitDir)
  const c = strip(commonDir)
  if (g === c) return { top, worktree: null }
  return { top, worktree: g.split('/').pop() || top.split('/').pop() || top }
}

// Counts the entries `git stash list` printed.
export function countStashes(out: string): number {
  return out.split('\n').filter(l => l.trim() !== '').length
}

export function placeOf(cwd: string, top: string | null): string {
  if (!top || (cwd !== top && !cwd.startsWith(`${top}/`))) return cwd
  const name = top.split('/').pop() || top
  return cwd === top ? name : name + cwd.slice(top.length)
}

// Reads the thresholds from the plugin's options, falling back to the defaults.
export function thresholdsOf(options: Readonly<Record<string, unknown>> | undefined): PushThresholds {
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : d)
  return {
    warning: num(options?.push_warning_threshold, DEFAULT_THRESHOLDS.warning),
    critical: num(options?.push_critical_threshold, DEFAULT_THRESHOLDS.critical),
  }
}

// The theme colour for `ahead` unpushed commits.
export function aheadColor(ahead: number, t: PushThresholds): 'success' | 'warning' | 'error' {
  if (t.critical > 0 && ahead >= t.critical) return 'error'
  if (t.warning > 0 && ahead >= t.warning) return 'warning'
  return 'success'
}

const MAX_NAME = 40

function clip(s: string): string {
  return s.length > MAX_NAME ? `${s.slice(0, MAX_NAME - 1)}…` : s
}

export function renderLine(Text: any, snap: Snapshot, t: PushThresholds = DEFAULT_THRESHOLDS) {
  const g = snap.git
  const parts: any[] = [<Text color="permission">{snap.place}</Text>]
  if (g) {
    parts.push(<Text dimColor>{'  ⎇ '}</Text>)
    if (g.worktree) parts.push(<Text dimColor>{`wt:${clip(g.worktree)} `}</Text>)
    parts.push(<Text color="claude">{clip(g.branch)}</Text>)
    if (g.ahead) parts.push(<Text color={aheadColor(g.ahead, t)}>{` ↑${g.ahead}`}</Text>)
    if (g.behind) parts.push(<Text color="warning">{` ↓${g.behind}`}</Text>)
    const counts: [number, string, string][] = [
      [g.conflicts, 'conflict', 'error'],
      [g.staged, 'staged', 'success'],
      [g.modified, 'mod', 'warning'],
      [g.untracked, 'new', 'inactive'],
    ]
    const dirty = counts.filter(([n]) => n > 0)
    parts.push(<Text>{'  '}</Text>)
    if (dirty.length === 0) parts.push(<Text color="success">✓</Text>)
    dirty.forEach(([n, label, color], i) =>
      parts.push(<Text dimColor>{`${i ? ' ' : ''}${label} `}</Text>, <Text color={color}>{String(n)}</Text>),
    )
    if (g.added || g.deleted) {
      parts.push(
        <Text dimColor>{'  lines '}</Text>,
        <Text color="success">{`+${g.added}`}</Text>,
        <Text color="error">{` -${g.deleted}`}</Text>,
      )
    }
    if (g.stashes) parts.push(<Text dimColor>{'  stash '}</Text>, <Text color="inactive">{String(g.stashes)}</Text>)
  }
  return <Text wrap="truncate-end">{parts}</Text>
}
