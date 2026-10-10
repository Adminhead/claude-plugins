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

export type Snapshot = {
  // Repo-relative (`repo/sub/dir`) inside a repository, else the absolute cwd.
  place: string
  git: (GitStatus & DiffLines) | null
}

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
    if (line.startsWith('# branch.head ')) s.branch = f[2]!
    else if (line.startsWith('# branch.oid ')) oid = f[2]!
    else if (line.startsWith('# branch.ab ')) {
      s.ahead = Number(f[2]!.slice(1))
      s.behind = Number(f[3]!.slice(1))
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const xy = f[1]!
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
    if (a && a !== '-') d.added += Number(a)
    if (r && r !== '-') d.deleted += Number(r)
  }
  return d
}

export function placeOf(cwd: string, top: string | null): string {
  if (!top || (cwd !== top && !cwd.startsWith(`${top}/`))) return cwd
  const name = top.split('/').pop() || top
  return cwd === top ? name : name + cwd.slice(top.length)
}

export function renderLine(Text: any, snap: Snapshot) {
  const g = snap.git
  const parts: any[] = [<Text color="permission">{snap.place}</Text>]
  if (g) {
    parts.push(<Text dimColor>{'  ⎇ '}</Text>, <Text color="claude">{g.branch}</Text>)
    if (g.ahead) parts.push(<Text color="success">{` ↑${g.ahead}`}</Text>)
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
  }
  return <Text wrap="truncate-end">{parts}</Text>
}
