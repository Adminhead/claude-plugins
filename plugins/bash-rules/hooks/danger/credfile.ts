// The file-tool side of the credentials rule: Read, Grep, Edit, MultiEdit, Write and NotebookEdit calls that would touch
// Claude Code's OAuth token cache, `${CLAUDE_CONFIG_DIR:-~/.claude}/.credentials.json`. danger.ts covers Bash. The check is
// on the path as given, resolved against cwd and home; it does not follow symlinks. register.tsx lists the same tools in
// its tool.call matcher. Nothing here touches `$`.

export const FILE_TOOLS = ['Read', 'Grep', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit'] as const

// A path or glob longer than this is not checked: it is refused instead (no real path is that long).
export const MAX_TOOL_PATH = 4096
export const MAX_GLOB = 1024

export const CRED_TOOL_MESSAGE =
  "bash-rules: refusing to read, search or change ~/.claude/.credentials.json, Claude Code's OAuth token cache. Reading it exposes the token, and outside an interactive session it is often stale. For usage or rate-limit numbers, read the JSON Claude Code passes to a statusline command (rate_limits.five_hour / seven_day: used_percentage, resets_at)."

export const TOO_LONG_MESSAGE = `bash-rules: this path (over ${MAX_TOOL_PATH} characters) or glob (over ${MAX_GLOB}) is too long to check. Use a shorter one.`

export type PathContext = { cwd: string | null; home: string | null; configDir: string | null }

const CRED_FILE = '.credentials.json'

// An absolute path with `.`, `..` and empty components removed, lowercased (macOS volumes ignore case), or null when a
// relative or `~` path has nothing to resolve against.
function place(p: string, ctx: PathContext): string | null {
  let abs: string
  if (p === '~' || p.startsWith('~/')) {
    if (!ctx.home) return null
    abs = `${ctx.home}/${p.slice(1)}`
  } else if (p[0] === '/') abs = p
  else {
    if (!ctx.cwd) return null
    abs = `${ctx.cwd}/${p}`
  }
  const out: string[] = []
  for (const s of abs.split('/')) {
    if (s === '' || s === '.') continue
    if (s === '..') out.pop()
    else out.push(s)
  }
  return `/${out.join('/')}`.toLowerCase()
}

// Whether a path ends in `.claude/.credentials.json`, as the Bash rule reads it: any `.claude` directory counts.
const endsInCred = (p: string) => /(?:^|\/)\.claude\/+\.credentials\.json\/*$/i.test(p)

// The credentials files this session can reach: under $CLAUDE_CONFIG_DIR and under ~/.claude.
function credFiles(ctx: PathContext): string[] {
  const dirs = [ctx.configDir, ctx.home ? `${ctx.home}/.claude` : null].filter((d): d is string => !!d && d[0] === '/')
  return [...new Set(dirs.map(d => place(`${d}/${CRED_FILE}`, ctx)!))]
}

const isCred = (p: string, ctx: PathContext) => {
  if (endsInCred(p)) return true
  const placed = place(p, ctx)
  return placed !== null && (endsInCred(placed) || credFiles(ctx).includes(placed))
}

const MAX_BRACES = 64

// A brace list expanded (`*.{json,ts}`), innermost first, up to MAX_BRACES patterns; null past that.
function expandBraces(pat: string): string[] | null {
  const out: string[] = []
  const todo = [pat]
  while (todo.length > 0) {
    const p = todo.pop()!
    const m = /\{([^{}]*)\}/.exec(p)
    if (!m) out.push(p)
    else for (const alt of m[1].split(',')) todo.push(p.slice(0, m.index) + alt + p.slice(m.index + m[0].length))
    if (out.length + todo.length > MAX_BRACES) return null
  }
  return out
}

// A ripgrep-style glob as a regex: `**` spans directories, `*` and `?` stay within one, `[...]` is a class.
function globRegex(pat: string): RegExp | null {
  let re = ''
  for (let i = 0; i < pat.length; i++) {
    const ch = pat[i]
    if (ch === '*' && pat[i + 1] === '*') {
      re += pat[i + 2] === '/' ? '(?:.*/)?' : '.*'
      i += pat[i + 2] === '/' ? 2 : 1
    } else if (ch === '*') re += '[^/]*'
    else if (ch === '?') re += '[^/]'
    else if (ch === '[') {
      const end = pat.indexOf(']', i + 2)
      if (end < 0) re += '\\['
      else {
        const body = pat.slice(i + 1, end).replace(/\\/g, '\\\\')
        re += `[${/^[!^]/.test(body) ? '^' + body.slice(1) : body}]`
        i = end
      }
    } else re += ch.replace(/[.+^$()|\\\]{}]/g, '\\$&')
  }
  try {
    return new RegExp(`^(?:${re})$`, 'i')
  } catch {
    return null
  }
}

// Whether a Grep `glob` can let through the file at `rel` below the searched directory. A negated glob only excludes
// others, and an unreadable glob counts as a match. A glob with no `/` matches the base name, as in ripgrep.
function globCanMatch(glob: string, rel: string): boolean {
  for (const part of glob.split(/[\s,]+(?![^{]*\})/).filter(Boolean)) {
    if (part[0] === '!') return true
    const pats = expandBraces(part)
    if (pats === null) return true
    for (const p of pats) {
      const re = globRegex(p.replace(/^\/+/, ''))
      if (re === null) return true
      const target = p.includes('/') ? rel : rel.slice(rel.lastIndexOf('/') + 1)
      if (re.test(target) || (p.includes('/') && !p.startsWith('/') && re.test(rel.slice(rel.indexOf('/') + 1)))) return true
    }
  }
  return false
}

// Whether a Grep call searches the credentials file: its path is the file, or its path is the directory that holds it
// (any glob that can match, or none), or a directory above that with a glob that can match it. A `type` other than json
// leaves the file out.
function grepHits(input: Readonly<Record<string, unknown>>, ctx: PathContext): boolean {
  const path = typeof input.path === 'string' && input.path !== '' ? input.path : '.'
  if (isCred(path, ctx)) return true
  if (typeof input.type === 'string' && input.type !== '' && !/^json/i.test(input.type)) return false
  const dir = place(path, ctx)
  if (dir === null) return false
  const glob = typeof input.glob === 'string' && input.glob.trim() !== '' ? input.glob : null
  for (const file of credFiles(ctx)) {
    const prefix = dir === '/' ? '/' : `${dir}/`
    if (!file.startsWith(prefix)) continue
    const rel = file.slice(prefix.length)
    if (glob === null ? !rel.includes('/') : globCanMatch(glob, rel)) return true
  }
  return false
}

// Whether a file-tool call needs the path context at all. Read, Edit, Write and NotebookEdit take a literal path, so
// one that never spells the file name cannot be it; every Grep is checked, since a directory and a glob can reach it.
export function mayTouchCredentials(tool: string, input: Readonly<Record<string, unknown>>): boolean {
  if (!(FILE_TOOLS as readonly string[]).includes(tool)) return false
  if (tool === 'Grep') return true
  const p = input[tool === 'NotebookEdit' ? 'notebook_path' : 'file_path']
  return typeof p === 'string' && (p.length > MAX_TOOL_PATH || p.toLowerCase().includes(CRED_FILE))
}

// The deny text for a file-tool call, or null to let it run. Input is model-controlled: every path and glob is bounded
// before any regex runs on it.
export function fileToolDeny(tool: string, input: Readonly<Record<string, unknown>>, ctx: PathContext): string | null {
  if (!(FILE_TOOLS as readonly string[]).includes(tool)) return null
  const fields = tool === 'Grep' ? ['path', 'glob'] : tool === 'NotebookEdit' ? ['notebook_path'] : ['file_path']
  for (const f of fields) {
    const v = input[f]
    if (typeof v === 'string' && v.length > (f === 'glob' ? MAX_GLOB : MAX_TOOL_PATH)) return TOO_LONG_MESSAGE
  }
  if (tool === 'Grep') return grepHits(input, ctx) ? CRED_TOOL_MESSAGE : null
  const p = input[fields[0]]
  return typeof p === 'string' && isCred(p, ctx) ? CRED_TOOL_MESSAGE : null
}
