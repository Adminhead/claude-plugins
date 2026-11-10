// plan-ledger: the pure half of the directory guard. No `$`, no I/O. The guard keeps a model from editing the plan
// files by hand (an accident guard, not a security boundary: a shell can still spell the path in ways no pattern
// catches, and disk files are unauthenticated). The `$` half, which resolves symlinks, is in register.tsx.

/** Longest Bash command the pattern runs on; a longer one is denied when it names the directory at all. */
export const MAX_GUARD_COMMAND = 8192

export const GUARD_REASON = 'The plan files are changed only through the plan tool.'

/** `<home>/.claude/adminhead-plans`, the directory the guard protects. */
export function plansRoot(home: string): string {
  return `${home.replace(/\/+$/, '')}/.claude/adminhead-plans`
}

/**
 * An absolute path with `.` and `..` folded and repeated slashes collapsed. A relative path is taken from `cwd` and a
 * leading `~` from `home`, so the spelling check sees where the path lands without touching the file system.
 */
export function normalizePath(path: string, cwd: string, home: string): string {
  let p = path
  if (p === '~' || p.startsWith('~/')) p = `${home}${p.slice(1)}`
  if (!p.startsWith('/')) p = `${cwd}/${p}`
  const out: string[] = []
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return `/${out.join('/')}`
}

/** True when `path` (normalized) is `root` or inside it. */
export const isUnder = (path: string, root: string): boolean => path === root || path.startsWith(`${root}/`)

// `.claude/adminhead-plans`, allowing repeated slashes and `./` segments between the two names.
const NAMES_DIR = /\.claude\/+(?:\.\/+)*adminhead-plans/

/**
 * Whether a Bash command names the plans directory. Input over `MAX_GUARD_COMMAND` characters is not matched against
 * the pattern (the command is model-controlled text); it is refused when it contains the directory name anywhere.
 */
export function commandNamesPlans(command: string): boolean {
  if (command.length > MAX_GUARD_COMMAND) return command.includes('adminhead-plans')
  return NAMES_DIR.test(command)
}

/** The path a file tool writes: `file_path` for Write and Edit, `notebook_path` for NotebookEdit, else null. */
export function writtenPath(e: { tool?: unknown; file_path?: unknown; notebook_path?: unknown }): string | null {
  const p = e.tool === 'NotebookEdit' ? e.notebook_path : e.file_path
  return typeof p === 'string' && p !== '' ? p : null
}
