// Plan-directory rules for the plan-writing agents (DEFAULT_PLAN_WRITERS in agents.ts plus the
// `plan_writers` option). Besides scratch, their Write, Edit and MultiEdit calls may land on a
// Markdown file under a plan directory: the `plan_dirs` option, relative to the project root,
// default docs/plans. NotebookEdit and Bash get nothing extra.
//
// The project root is CLAUDE_PROJECT_DIR, which Claude Code sets for hook commands, else the
// payload's cwd. A path passes when, as given and with its `..` normalized away, it resolves
// through scratch.ts's `resolve` (links followed, no `..` after a missing part) to a file inside
// `<real root>/<plan dir>/`, ends in `.md` before and after resolving, is not an instruction file
// that Claude loads by itself (CLAUDE.md, AGENTS.md) and is not a hard link. A plan directory
// reached through a symlink below the project root is not used.
//
// Like scratch.ts this is an accident guard, not a sandbox: links created after the hook reads
// the filesystem are not covered.

import { hardLinkCheck, joinPath, normpath, resolve, SCRATCH_MSG, targetPath } from './scratch.ts'

export const DEFAULT_PLAN_DIRS: readonly string[] = ['docs/plans']

const MAX_OPTION = 4096
const MAX_DIRS = 16
const MAX_DIR = 512
const MAX_PATH = 4096
const PLAN_TOOLS = ['Write', 'Edit', 'MultiEdit']
// Directories whose Markdown files configure git or Claude Code (agents, commands, skills).
const CONFIG_PARTS = new Set(['.git', '.claude'])
// Markdown files Claude Code reads as instructions when it works in their directory.
const INSTRUCTION_FILES = new Set(['claude.md', 'claude.local.md', 'agents.md'])

// One `plan_dirs` entry, normalized, or null when it is empty, absolute, starts with ~, has a
// `..` part or a control character, names the project root itself, or enters .git or .claude.
function planDir(raw: string): string | null {
  const s = raw.trim()
  if (s === '' || s.length > MAX_DIR || /[\0-\x1f\x7f]/.test(s) || s.startsWith('/') || s.startsWith('~')) return null
  if (s.split('/').includes('..')) return null
  const norm = normpath(s)
  if (norm === '.' || norm.split('/').some(c => CONFIG_PARTS.has(c.toLowerCase()))) return null
  return norm
}

// The `plan_dirs` option: directories separated by commas, or a JSON list of strings. Unset or
// blank means the default. Invalid entries are ignored, so a value with none left allows none.
export function parsePlanDirs(raw: string | undefined): string[] {
  const text = (raw ?? '').slice(0, MAX_OPTION).trim()
  if (text === '') return [...DEFAULT_PLAN_DIRS]
  let parts: unknown[] = text.split(',')
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) parts = parsed
    } catch {}
  }
  const dirs: string[] = []
  for (const p of parts) {
    const dir = typeof p === 'string' ? planDir(p) : null
    if (dir !== null && !dirs.includes(dir)) dirs.push(dir)
    if (dirs.length >= MAX_DIRS) break
  }
  return dirs
}

const validRoot = (v: string): string | null => {
  if (!v.startsWith('/') || v.length > MAX_PATH || v.includes('\0')) return null
  const norm = normpath(v)
  return norm === '/' || norm.startsWith('//') ? null : norm
}

// CLAUDE_PROJECT_DIR when set (and null when it is set but unusable), else the payload's cwd.
export function projectRoot(envDir: string | undefined, cwd: unknown): string | null {
  if (envDir) return validRoot(envDir)
  return typeof cwd === 'string' ? validRoot(cwd) : null
}

const listDirs = (dirs: readonly string[]): string => dirs.map(d => `${d}/`).join(', ')

// The block message for a plan writer's file-tool call.
export function planMsg(dirs: readonly string[]): string {
  if (!dirs.length) return SCRATCH_MSG
  return `This agent is read-only apart from plans: write scratch files under /tmp or the session scratchpad, and save plans with Write or Edit as .md files under the project's ${listDirs(dirs)}.`
}

// Appended to a plan writer's Bash block message.
export function planHint(dirs: readonly string[]): string {
  return dirs.length ? ` To save a plan, use Write or Edit on a .md file under ${listDirs(dirs)}; Bash cannot write there.` : ''
}

const base = (p: string): string => p.slice(p.lastIndexOf('/') + 1)
const isMarkdown = (p: string): boolean => /^[^/]+\.md$/.test(base(p))

function planDest(path: string, canonDirs: readonly string[]): string | null {
  if (!isMarkdown(path)) return `'${path}' is not a .md file`
  const real = resolve(path)
  if (typeof real !== 'string') return `'${path}' cannot be resolved (${real.error})`
  if (!canonDirs.some(d => real.startsWith(`${d}/`))) return `'${path}' resolves to '${real}', outside the plan directories`
  if (!isMarkdown(real)) return `'${path}' resolves to '${real}', which is not a .md file`
  for (const p of [path, real]) {
    if (INSTRUCTION_FILES.has(base(p).toLowerCase())) return `'${p}' is an instruction file that Claude loads by itself`
  }
  return hardLinkCheck(path, real, 'the plan directories')
}

// Checks a plan writer's file-tool call against the plan directories. Returns null to allow, or
// why the path is not a plan file.
export function checkPlanWrite(h: Record<string, unknown>, dirs: readonly string[], root: string | null): string | null {
  const t = targetPath(h)
  if ('error' in t) return t.error
  if (!PLAN_TOOLS.includes(t.tool)) return `${t.tool} cannot write plans`
  if (!dirs.length) return 'no plan directories are configured'
  if (root === null) return 'the project root is unknown'
  const realRoot = resolve(root)
  if (typeof realRoot !== 'string') return `the project root '${root}' cannot be resolved (${realRoot.error})`
  if (realRoot === '/') return `the project root '${root}' resolves to /`
  // A plan directory must sit at its own path below the real root, with no symlink on the way.
  const canonDirs = dirs.map(d => joinPath(realRoot, d)).filter(p => resolve(p) === p)
  if (!canonDirs.length) return `the plan directories (${listDirs(dirs)}) go through a symlink or cannot be read`
  const norm = normpath(t.full)
  for (const p of norm === t.full ? [t.full] : [t.full, norm]) {
    const why = planDest(p, canonDirs)
    if (why !== null) return why
  }
  return null
}
