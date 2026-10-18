// SQL script files fed to a database client: `psql -f FILE`, `mysql < FILE`, `sqlite3 db < FILE`, `\i FILE`,
// `source FILE`, `.read FILE`, and `cat FILE | psql`. register.tsx reads each one (bounded) and checks its text here, so
// the db-drop rule covers what the command line alone does not show. Nothing here touches `$`.

import { DESTROY_SQL, SQL_CLIENTS, baseName, viewsOf } from './danger'
import { prevStage } from './rules'
import type { ShellCommand } from '../shell/walk'

// Files larger than this are not read; the command counts as unsure.
export const MAX_SQL_FILE = 256 * 1024
// More script files than this in one command are not read; the command counts as unsure.
export const MAX_SQL_FILES = 8

const CLIENTS = new Set([...SQL_CLIENTS, 'redis-cli', 'valkey-cli'])

// psql's `\i`, `\ir`, `\include`, `\include_relative`; mysql's `source` and `\.`; sqlite3's `.read`.
const INCLUDE = /(?:\\i(?:r|nclude(?:_relative)?)?|\\\.|(?:^|;)\s*source|(?:^|;)\s*\.read)\s+(['"]?)([^\s;'"]+)\1/gim

const isProcSub = (text: string) => /^[<>]\(/.test(text)

// The script files a command line feeds to database clients: a literal path, or null for one built from an expansion
// (which cannot be read). Duplicates are dropped.
export function sqlFiles(commands: readonly ShellCommand[]): (string | null)[] {
  const out: (string | null)[] = []
  const add = (p: string | null) => {
    if (!out.includes(p)) out.push(p)
  }
  for (const c of commands) {
    for (const v of viewsOf(c.argv)) {
      const name = baseName(v[0] ?? null)
      if (!CLIENTS.has(name)) continue
      // psql -f FILE, -fFILE, --file=FILE, --file FILE.
      if (name === 'psql') {
        for (let i = 1; i < v.length; i++) {
          const a = v[i]
          if (a === '-f' || a === '--file') add(v[i + 1] ?? null)
          else if (a !== null && a !== undefined && /^-f./.test(a)) add(a.slice(2))
          else if (a !== null && a !== undefined && a.startsWith('--file=')) add(a.slice('--file='.length))
        }
      }
      for (const r of c.redirects) if (r.op === '<' && !isProcSub(r.text)) add(r.target)
      const texts = [...c.text.slice(1), ...c.heredocs.map(h => h.body), ...c.redirects.filter(r => r.op === '<<<').map(r => r.text)]
      for (const t of texts) for (const m of t.matchAll(INCLUDE)) add(m[2]!)
      // cat FILE | psql
      for (const e of prevStage(c)) {
        if (baseName(e.argv[0] ?? null) !== 'cat') continue
        for (const a of e.argv.slice(1)) if (a === null || !a.startsWith('-')) add(a)
      }
    }
  }
  return out
}

// Whether a script's text drops or truncates a database or table, or flushes a key-value store.
export const destroysData = (text: string) => DESTROY_SQL.test(text) || /\bFLUSH(?:ALL|DB)\b/i.test(text)

// The ask for a script file that could not be checked, naming it (one line, capped: the path is model-controlled).
export function uncheckedMessage(file: string | null): string {
  const name = file === null ? 'a SQL script file built from an expansion' : file.replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, 80)
  return `bash-rules: couldn't check ${name} for DROP/TRUNCATE; confirm it's safe.`
}

// Where to read a script path from: absolute as written, relative to the session's directory, or null for one the
// mod cannot place (`~`, an expansion).
export function sqlPath(path: string | null, cwd: string): string | null {
  if (path === null || path === '' || path === '-' || path.startsWith('~')) return null
  if (path.startsWith('/')) return path
  return `${cwd.replace(/\/+$/, '')}/${path}`
}
