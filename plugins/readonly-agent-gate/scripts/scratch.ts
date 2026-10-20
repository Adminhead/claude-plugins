// Scratch-path rules shared by the Bash check (readonly-bash.ts) and the file-tool check in
// readonly-gate.ts. String checks only: no filesystem access, so symlinks are not resolved.
// Like the Bash check this is an accident guard, not a sandbox.

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

function scratchRoot(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096 || !value.startsWith('/')) return null
  const norm = normpath(value)
  return norm.split('/').filter(Boolean).length >= 2 ? norm : null
}

export function setScratchRoots(scratchpad: unknown): void {
  scratchRoots = [scratchRoot(process.env.TMPDIR), scratchRoot(scratchpad)].filter((r): r is string => r !== null)
}

export function isScratch(path: string): boolean {
  if (['/dev/null', '/dev/stdout', '/dev/stderr', '/dev/tty'].includes(path)) return true
  const norm = normpath(path)
  if (/^\/tmp(\/[^\n]+)?$/.test(norm)) return true
  return scratchRoots.some(t => norm === t || norm.startsWith(`${t}/`))
}

// A scratch directory itself, after normalizing `..`.
export function isScratchRoot(path: string): boolean {
  const norm = normpath(path)
  return norm === '/tmp' || scratchRoots.includes(norm)
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
  return isScratch(full) ? null : `${tool} on non-scratch path '${path}'`
}
