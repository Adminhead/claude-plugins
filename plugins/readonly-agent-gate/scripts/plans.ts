// Plan-directory rules for the plan-writing agents (DEFAULT_PLAN_WRITERS in agents.ts plus the
// `plan_writers` option). Besides scratch, their Write, Edit and MultiEdit calls may land on a
// Markdown file under a plan directory: the `plan_dirs` option, relative to the project root,
// default docs/plans. NotebookEdit and Bash get nothing extra.
//
// The project root is CLAUDE_PROJECT_DIR, which Claude Code sets for every command hook. Without
// it there is no plan allowance. The payload cwd adds a second root only when it sits in a git
// worktree of that project: the worktree's `.git` file points into `<root>/.git/worktrees/<name>`,
// and that directory's `gitdir` file points back. A subagent in a worktree then saves plans in
// the worktree's own plan directories.
//
// A path passes when, as given and with its `..` normalized away, it resolves through scratch.ts's
// `resolve` (links followed, no `..` after a missing part) to a file inside `<real root>/<plan
// dir>/`, names the plan directory by the root's own path (as given or resolved), ends in `.md`
// before and after resolving, has no dot-directory or dotfile below the plan directory either way
// (.claude, .git, .github, .agents and .cursor hold skills, rules, agents and other instructions
// that tools load by themselves), is not an instruction file (CLAUDE.md, AGENTS.md) and is not a
// hard link. A plan directory reached through a symlink below its root is not used.
//
// Like scratch.ts this is an accident guard, not a sandbox: links created after the hook reads
// the filesystem are not covered.

import { lstatSync, readFileSync, statSync } from 'node:fs'
import { hardLinkCheck, joinPath, normpath, resolve, SCRATCH_MSG, targetPath } from './scratch.ts'

export const DEFAULT_PLAN_DIRS: readonly string[] = ['docs/plans']

const MAX_OPTION = 4096
const MAX_DIRS = 16
const MAX_DIR = 512
const MAX_PATH = 4096
const MAX_DEPTH = 64
const MAX_GIT_FILE = 4096
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
// blank means the default. Invalid entries are ignored, so a value with none left allows none,
// and so does a value longer than MAX_OPTION (cutting it could turn docs/plans/x into docs/plans).
export function parsePlanDirs(raw: string | undefined): string[] {
  if ((raw ?? '').length > MAX_OPTION) return []
  const text = (raw ?? '').trim()
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

// CLAUDE_PROJECT_DIR, normalized, or null when it is unset or unusable.
export function projectRoot(envDir: string | undefined): string | null {
  return envDir ? validRoot(envDir) : null
}

// A small regular file's text, or null. Never follows a symlink.
function readSmall(path: string): string | null {
  try {
    const st = lstatSync(path)
    if (!st.isFile() || st.size > MAX_GIT_FILE) return null
    return readFileSync(path, 'utf8').slice(0, MAX_GIT_FILE)
  } catch {
    return null
  }
}

// Whether `dir`, a real path holding a `.git` file, is a worktree registered in realRoot's repo.
function isWorktreeOf(dir: string, realRoot: string): boolean {
  const m = /^gitdir: ?([^\r\n]+)/.exec(readSmall(`${dir}/.git`) ?? '')
  const pointer = m?.[1].trim()
  if (!pointer || pointer.includes('\0')) return false
  const gitdir = resolve(joinPath(dir, pointer))
  const base = `${realRoot}/.git/worktrees/`
  if (typeof gitdir !== 'string' || !gitdir.startsWith(base) || gitdir.slice(base.length).includes('/')) return false
  try {
    if (!statSync(gitdir).isDirectory()) return false
  } catch {
    return false
  }
  const back = readSmall(`${gitdir}/gitdir`)?.trim()
  if (!back || back.includes('\0')) return false
  return resolve(joinPath(gitdir, back)) === `${dir}/.git`
}

interface Root { real: string; lex: string[] }

// The worktree of realRoot's repo that holds cwd, found through the nearest `.git` above it, or
// null. `lex` adds the worktree as cwd names it, when cwd goes through a symlink.
function worktreeRoot(cwd: unknown, realRoot: string): Root | null {
  const lexCwd = typeof cwd === 'string' ? validRoot(cwd) : null
  if (lexCwd === null) return null
  const realCwd = resolve(lexCwd)
  if (typeof realCwd !== 'string') return null
  let dir = realCwd
  for (let i = 0; i < MAX_DEPTH && dir !== '/' && dir !== realRoot; i++) {
    let st
    try {
      st = lstatSync(`${dir}/.git`)
    } catch {
      dir = dir.slice(0, dir.lastIndexOf('/')) || '/'
      continue
    }
    // A .git directory or link: the nearest repo is not a worktree.
    if (!st.isFile() || !isWorktreeOf(dir, realRoot)) return null
    const rest = realCwd.slice(dir.length)
    const lex = lexCwd.endsWith(rest) ? lexCwd.slice(0, lexCwd.length - rest.length) : ''
    return { real: dir, lex: lex !== '' && lex !== dir ? [lex] : [] }
  }
  return null
}

interface PlanDir { canon: string; lex: string[] }
export type PlanArea = { dirs: PlanDir[] } | { error: string }

// The plan directories this call may write: each `plan_dirs` entry under the project root and
// under a worktree of it that holds cwd, as absolute paths.
export function planArea(dirs: readonly string[], envDir: string | undefined, cwd: unknown): PlanArea {
  if (!dirs.length) return { error: 'no plan directories are configured' }
  const root = projectRoot(envDir)
  if (root === null) return { error: envDir ? 'CLAUDE_PROJECT_DIR is not a usable project root' : 'CLAUDE_PROJECT_DIR is not set, so the project root is unknown' }
  const realRoot = resolve(root)
  if (typeof realRoot !== 'string') return { error: `the project root '${root}' cannot be resolved (${realRoot.error})` }
  if (realRoot === '/') return { error: `the project root '${root}' resolves to /` }
  const roots: Root[] = [{ real: realRoot, lex: root === realRoot ? [] : [root] }]
  const wt = worktreeRoot(cwd, realRoot)
  if (wt !== null) roots.push(wt)
  const out: PlanDir[] = []
  for (const r of roots) {
    for (const d of dirs) {
      // A plan directory must sit at its own path below the real root, with no symlink on the way.
      const canon = joinPath(r.real, d)
      if (resolve(canon) === canon) out.push({ canon, lex: [canon, ...r.lex.map(l => joinPath(l, d))] })
    }
  }
  if (!out.length) return { error: `the plan directories (${listDirs(dirs)}) go through a symlink or cannot be read` }
  return { dirs: out }
}

const listDirs = (dirs: readonly string[]): string => dirs.map(d => `${d}/`).join(', ')
const listArea = (area: PlanArea): string => ('error' in area ? '' : listDirs(area.dirs.map(d => d.canon)))

// The block message for a plan writer's file-tool call.
export function planMsg(area: PlanArea): string {
  if ('error' in area) return SCRATCH_MSG
  return `This agent is read-only apart from plans: write scratch files under /tmp or the session scratchpad, and save plans with Write or Edit as .md files under ${listArea(area)} (no dot-directories, CLAUDE.md or AGENTS.md).`
}

// Appended to a plan writer's Bash block message.
export function planHint(area: PlanArea): string {
  return 'error' in area ? '' : ` To save a plan, use Write or Edit on a .md file under ${listArea(area)}; Bash cannot write there.`
}

const base = (p: string): string => p.slice(p.lastIndexOf('/') + 1)
const isMarkdown = (p: string): boolean => /^[^/]+\.md$/.test(base(p))

// The part of `path` below the first of `prefixes` it sits in, or null.
function below(path: string, prefixes: readonly string[]): string | null {
  const hit = prefixes.find(d => path.startsWith(`${d}/`))
  return hit === undefined ? null : path.slice(hit.length + 1)
}

function badPart(path: string, rest: string): string | null {
  if (rest.split('/').some(c => c.startsWith('.'))) return `'${path}' has a dot-directory or dotfile below the plan directory`
  if (INSTRUCTION_FILES.has(base(path).toLowerCase())) return `'${path}' is an instruction file that Claude loads by itself`
  return null
}

function planDest(path: string, dirs: readonly PlanDir[]): string | null {
  if (!isMarkdown(path)) return `'${path}' is not a .md file`
  const real = resolve(path)
  if (typeof real !== 'string') return `'${path}' cannot be resolved (${real.error})`
  const rest = below(real, dirs.map(d => d.canon))
  if (rest === null) return `'${path}' resolves to '${real}', outside the plan directories`
  if (!isMarkdown(real)) return `'${path}' resolves to '${real}', which is not a .md file`
  return badPart(real, rest) ?? hardLinkCheck(path, real, 'the plan directories')
}

// Checks a plan writer's file-tool call against the plan area. Returns null to allow, or why the
// path is not a plan file.
export function checkPlanWrite(h: Record<string, unknown>, area: PlanArea): string | null {
  const t = targetPath(h)
  if ('error' in t) return t.error
  if (!PLAN_TOOLS.includes(t.tool)) return `${t.tool} cannot write plans`
  if ('error' in area) return area.error
  const norm = normpath(t.full)
  // As written, the path must name a plan directory by its root's own path, so a dot part above
  // the target (a .claude link to a plain directory) is seen.
  const rest = below(norm, area.dirs.flatMap(d => d.lex))
  if (rest === null) return `'${norm}' does not name a plan directory by its project path`
  const why = badPart(norm, rest)
  if (why !== null) return why
  for (const p of norm === t.full ? [t.full] : [t.full, norm]) {
    const why = planDest(p, area.dirs)
    if (why !== null) return why
  }
  return null
}
