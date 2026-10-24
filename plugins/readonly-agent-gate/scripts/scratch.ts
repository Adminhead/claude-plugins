// Scratch-path rules shared by the Bash check (readonly-bash.ts) and the file-tool check in
// readonly-gate.ts.
//
// `isScratch` is a string check. `scratchDest` adds a filesystem check for a path that is about
// to be written: it resolves symlinks (including `..` after a symlink and a dangling final link),
// refuses a `..` after a part that is missing or not a directory, and refuses a regular file with
// more than one hard link, so a pre-created /tmp link to a repo file is not scratch. A file tool's
// path must also pass with its `..` normalized away, as a writer that normalizes would read it.
//
// Like the Bash check this is an accident guard, not a sandbox. The filesystem is read when the
// hook runs, so a link created between the check and the write (a race, or another command in the
// same Bash call that the check allowed), and links made by programs this check does not know,
// are not covered.

import { lstatSync, readlinkSync, realpathSync, statSync } from 'node:fs'

export const SCRATCH_MSG = 'This agent is read-only; write scratch files under /tmp or the session scratchpad only.'

// posixpath.normpath: collapses `.`, `..` and repeated slashes, keeping a leading `//`.
export function normpath(p: string): string {
  if (p === '') return '.'
  const initial = p.startsWith('//') && !p.startsWith('///') ? 2 : p.startsWith('/') ? 1 : 0
  const out: string[] = []
  for (const c of p.split('/')) {
    if (c === '' || c === '.') continue
    if (c !== '..' || (!initial && !out.length) || out.at(-1) === '..') out.push(c)
    else if (out.length) out.pop()
  }
  return '/'.repeat(initial) + out.join('/') || '.'
}

export const joinPath = (a: string, b: string): string => (b.startsWith('/') ? b : a === '' || a.endsWith('/') ? a + b : `${a}/${b}`)

// Extra scratch roots: $TMPDIR and the session scratchpad (the payload's `scratchpad_dir`, set by
// the harness, not the model). Each must be absolute and at least two levels deep, so a bad value
// can never make `/` or `/home` scratch.
let scratchRoots: string[] = []
// The roots (/tmp included) with symlinks resolved, e.g. /private/tmp on macOS.
let canonRoots: string[] = []
const destCache = new Map<string, string | null>()

function scratchRoot(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096 || !value.startsWith('/')) return null
  const norm = normpath(value)
  return norm.split('/').filter(Boolean).length >= 2 ? norm : null
}

export function setScratchRoots(scratchpad: unknown): void {
  scratchRoots = [scratchRoot(process.env.TMPDIR), scratchRoot(scratchpad)].filter((r): r is string => r !== null)
  destCache.clear()
  canonRoots = []
  for (const r of ['/tmp', ...scratchRoots]) {
    const real = resolve(r)
    // A root that cannot be resolved counts as written; one that resolves to / is dropped.
    const canon = typeof real === 'string' ? real : r
    if (canon !== '/') canonRoots.push(canon)
  }
}

const DEVICES = ['/dev/null', '/dev/stdout', '/dev/stderr', '/dev/tty']

export function isScratch(path: string): boolean {
  if (DEVICES.includes(path)) return true
  const norm = normpath(path)
  if (/^\/tmp(\/[^\n]+)?$/.test(norm)) return true
  return scratchRoots.some(t => norm === t || norm.startsWith(`${t}/`))
}

// A scratch directory itself, after normalizing `..` or after resolving links.
export function isScratchRoot(path: string): boolean {
  const norm = normpath(path)
  if (norm === '/tmp' || scratchRoots.includes(norm)) return true
  if (!path.startsWith('/') || path.length > 4096) return false
  const real = resolve(path)
  return typeof real === 'string' && canonRoots.includes(real)
}

const MAX_LINKS = 40

const errno = (e: unknown): string => (e as NodeJS.ErrnoException)?.code ?? String(e)

// Where the kernel would put an absolute path: the longest existing prefix through realpath
// (`realpathSync.native`, since the JS realpath folds `..` before reading links), a dangling
// symlink after it through its target, and the missing rest lexically. Returns the resolved
// path, or an error code when the path cannot be read (ELOOP, EACCES, ...).
function resolve(path: string, hops = 0): string | { error: string } {
  const comps = path.split('/').filter(c => c !== '' && c !== '.')
  let k = comps.length
  let real = ''
  for (; k >= 0; k--) {
    try {
      real = realpathSync.native(`/${comps.slice(0, k).join('/')}`)
      break
    } catch (e) {
      const code = errno(e)
      // A missing or non-directory component: try a shorter prefix. Anything else is unreadable.
      if (code !== 'ENOENT' && code !== 'ENOTDIR') return { error: code }
    }
  }
  if (k < 0) return { error: 'ENOENT' }
  const rest = comps.slice(k)
  if (!rest.length) return real
  const next = joinPath(real, rest[0])
  try {
    if (lstatSync(next).isSymbolicLink()) {   // dangling, or part of a loop
      if (hops >= MAX_LINKS) return { error: 'ELOOP' }
      return resolve([joinPath(real, readlinkSync(next)), ...rest.slice(1)].join('/'), hops + 1)
    }
  } catch (e) {
    const code = errno(e)
    if (code !== 'ENOENT' && code !== 'ENOTDIR') return { error: code }
  }
  // rest[0] is missing, or `real` is not a directory. A `..` past it has no answer on disk yet:
  // a command earlier in the line can create the part (`mkdir -p a && echo > a/../link`), and
  // where a writer that normalizes the path lands depends on the links beside it.
  if (rest.includes('..')) return { error: "'..' after a missing or non-directory part" }
  return normpath(joinPath(real, rest.join('/')))
}

const underRoots = (real: string): boolean => canonRoots.some(r => real === r || real.startsWith(`${r}/`))

// Whether an absolute path resolves inside a scratch root. For a link source, which a later
// write reaches through the link.
export function resolvesToScratch(path: string): boolean {
  if (!path.startsWith('/') || path.length > 4096) return false
  const real = resolve(path)
  return typeof real === 'string' && underRoots(real)
}

// Checks a path that is about to be written. Returns null when it is scratch, or why it is not.
export function scratchDest(path: string): string | null {
  if (!isScratch(path)) return `non-scratch path '${path}'`
  if (DEVICES.includes(path)) return null
  if (path.length > 4096) return `path '${path.slice(0, 64)}...' is too long`
  const hit = destCache.get(path)
  if (hit !== undefined) return hit
  const why = destCheck(path)
  destCache.set(path, why)
  return why
}

function destCheck(path: string): string | null {
  const real = resolve(path)
  if (typeof real !== 'string') return `'${path}' cannot be resolved (${real.error})`
  if (!underRoots(real)) return `'${path}' resolves to '${real}', outside scratch`
  try {
    const st = statSync(real)
    // Directories have nlink > 1 by design.
    if (st.isFile() && st.nlink > 1) return `'${path}' is a hard link (${st.nlink} links), which may share a file outside scratch`
  } catch (e) {
    const code = errno(e)
    if (code !== 'ENOENT' && code !== 'ENOTDIR') return `'${path}' cannot be read (${code})`
  }
  return null
}

const FILE_TOOLS: Record<string, string> = {
  Write: 'file_path',
  Edit: 'file_path',
  MultiEdit: 'file_path',
  NotebookEdit: 'notebook_path',
}

// Checks a file-writing tool call from a parsed hook payload. Returns null to allow, or the
// reason to block. A relative path resolves against the payload's `cwd`.
export function checkFileWrite(h: Record<string, unknown>): string | null {
  const tool = h.tool_name
  const key = typeof tool === 'string' && Object.hasOwn(FILE_TOOLS, tool) ? FILE_TOOLS[tool] : null
  if (key === null) return `tool '${String(tool)}' is not allowed for this agent`
  setScratchRoots(h.scratchpad_dir)
  const ti = h.tool_input
  const path = typeof ti === 'object' && ti !== null && !Array.isArray(ti) ? (ti as Record<string, unknown>)[key] : undefined
  if (typeof path !== 'string' || path === '' || path.length > 4096 || path.includes('\0')) return `${tool} input has no usable ${key}`
  if (path.startsWith('~')) return `${tool} path '${path}' starts with ~, which is not expanded; use an absolute scratch path`
  let full = path
  if (!path.startsWith('/')) {
    const cwd = h.cwd
    if (typeof cwd !== 'string' || !cwd.startsWith('/')) return `${tool} on relative path '${path}' without an absolute cwd`
    full = joinPath(cwd, path)
  }
  // The kernel reads `a/../b` through the link a may be; a writer that normalizes the path first
  // drops `a/..`. Both readings must stay in scratch.
  const norm = normpath(full)
  const why = scratchDest(full) ?? (norm === full ? null : scratchDest(norm))
  return why === null ? null : `${tool} on ${why}`
}
