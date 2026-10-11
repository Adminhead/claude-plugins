// Read-only git tools for subagents: argv building and input validation. Pure, so it can be tested
// without `$`; the hook in register.tsx runs the argv.

export const TOOL_PREFIX = 'mcp__coremods__'
export const MAX_COUNT = 100
export const DEFAULT_COUNT = 20
export const MAX_BYTES = 100_000

export type GitTool = 'git_log' | 'git_blame' | 'git_show'
export type Built = { argv: string[]; env: Record<string, string> } | { error: string }

// Config and env that stop a repo's or user's git config from running a program. No shell is involved.
const HARDEN = ['-c', 'core.fsmonitor=false', '-c', 'core.pager=cat', '-c', 'diff.external=']
const ENV = { GIT_CONFIG_NOSYSTEM: '1', GIT_PAGER: 'cat' }
// Blame defaults to HEAD: without a rev it blames the worktree, which runs clean filters and follows symlinks.
const REV = /^[A-Za-z0-9_][A-Za-z0-9_./@^~-]*$/

const rev = { type: 'string', description: 'Commit, branch, tag, or range such as HEAD~3 or main..HEAD. Must not start with "-".' }
const path = { type: 'string', description: 'File or directory inside the working directory.' }

export const TOOLS = [
  {
    name: 'git_log',
    description: `Read-only git log: short hash, date, author, and subject per commit. At most ${MAX_COUNT} commits.`,
    inputSchema: {
      type: 'object',
      properties: { rev, path, max_count: { type: 'integer', minimum: 1, maximum: MAX_COUNT, description: `Default ${DEFAULT_COUNT}.` } },
    },
  },
  {
    name: 'git_blame',
    description: 'Read-only git blame of one file, optionally limited to a line range.',
    inputSchema: {
      type: 'object',
      properties: {
        path,
        rev,
        start_line: { type: 'integer', minimum: 1 },
        end_line: { type: 'integer', minimum: 1, description: 'Needs start_line.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'git_show',
    description: 'Read-only git show of one commit: message and patch, optionally limited to one path.',
    inputSchema: { type: 'object', properties: { rev, path }, required: ['rev'] },
  },
]

function checkRev(v: unknown, name = 'rev'): string | null {
  if (typeof v !== 'string' || !REV.test(v)) return `${name} must match ${REV} and not start with "-"`
  return null
}

// Lexical containment: the path, resolved against cwd, must stay at or below cwd. Returns it relative to cwd.
function inside(cwd: string, p: unknown): string | { error: string } {
  if (typeof p !== 'string' || p === '' || p.includes('\0')) return { error: 'path must be a non-empty string' }
  const base = cwd.replace(/\/+$/, '')
  let rel = p
  if (p.startsWith('/')) {
    if (p !== base && !p.startsWith(base + '/')) return { error: `path is outside ${cwd}` }
    rel = p.slice(base.length)
  }
  const parts: string[] = []
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg !== '..') parts.push(seg)
    else if (!parts.pop()) return { error: `path is outside ${cwd}` }
  }
  return parts.join('/') || '.'
}

function int(v: unknown, name: string, max = Infinity): number | { error: string } {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > max) return { error: `${name} must be an integer from 1 to ${max}` }
  return v
}

export function buildGit(tool: string, input: Record<string, any>, cwd: string): Built {
  const name = tool.startsWith(TOOL_PREFIX) ? tool.slice(TOOL_PREFIX.length) : tool
  const head = ['git', '-C', cwd, '--no-pager', '--no-lazy-fetch', '--literal-pathspecs', ...HARDEN]
  const flags = ['--no-ext-diff', '--no-textconv']
  const fail = (error: string): Built => ({ error })
  let revErr: string | null = null
  let rel: string | { error: string } | undefined
  if (input.rev !== undefined) revErr = checkRev(input.rev)
  if (revErr) return fail(revErr)
  if (input.path !== undefined) {
    rel = inside(cwd, input.path)
    if (typeof rel !== 'string') return fail(rel.error)
  }
  const tail = rel === undefined ? [] : ['--', rel]
  const ok = (a: string[]): Built => ({ argv: [...head, ...a], env: ENV })

  switch (name) {
    case 'git_log': {
      const n = input.max_count === undefined ? DEFAULT_COUNT : int(input.max_count, 'max_count', MAX_COUNT)
      if (typeof n !== 'number') return fail(n.error)
      return ok(['log', ...flags, '--no-color', '--no-show-signature', `--max-count=${n}`, '--date=short', '--format=%h %ad %an  %s', ...(input.rev ? [input.rev] : []), ...tail])
    }
    case 'git_blame': {
      if (rel === undefined) return fail('path is required')
      const range: string[] = []
      if (input.start_line !== undefined || input.end_line !== undefined) {
        const s = int(input.start_line, 'start_line')
        if (typeof s !== 'number') return fail(s.error)
        const e = input.end_line === undefined ? s : int(input.end_line, 'end_line')
        if (typeof e !== 'number') return fail(e.error)
        if (e < s) return fail('end_line must be at least start_line')
        range.push('-L', `${s},${e}`)
      }
      return ok(['blame', '--no-textconv', ...range, input.rev ?? 'HEAD', ...tail])
    }
    case 'git_show': {
      if (input.rev === undefined) return fail('rev is required')
      return ok(['show', ...flags, '--no-color', '--no-show-signature', input.rev, ...tail])
    }
    default:
      return fail(`unknown tool ${tool}`)
  }
}

export function truncate(text: string): string {
  return text.length <= MAX_BYTES ? text : `${text.slice(0, MAX_BYTES)}\n[truncated at ${MAX_BYTES} characters]`
}
