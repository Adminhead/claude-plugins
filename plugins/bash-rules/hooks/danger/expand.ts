// Literal variable expansion for bash-rules. Nothing here touches `$`.
// `H="dotnet run --project x"; $H --ticks 5` hides nothing: the value is plain words. expandLiteralVars writes such values
// into the command text so the danger and hygiene rules check what really runs (`P="psql -c"; $P "DROP TABLE x"` is a
// db-drop). The walker has no source offsets, so a small lexer finds the `$NAME` and `${NAME}` sites; each site is first
// replaced by a marker word, and the rewrite counts only when it parses into the same shape as the marked text. Anything
// unclear leaves the command as written, so its old verdict stands.

import { baseName, viewsOf } from './danger'
import { parse } from '../shell/walk'
import type { ShellCommand, ShellParse } from '../shell/walk'

// A value made of plain words: no quotes, expansions, globs, braces, `~` or shell metacharacters.
export const LITERAL_VALUE = /^[\w./=:@,+%-]+(?: [\w./=:@,+%-]+)*$/

// Variables the shell sets or reads itself, whose value a plain assignment does not pin down.
const SPECIAL = new Set([
  'PATH', 'IFS', 'PWD', 'OLDPWD', 'HOME', 'RANDOM', 'SRANDOM', 'SECONDS', 'LINENO', 'REPLY', 'OPTARG', 'OPTIND', 'PPID', 'UID',
  'EUID', 'SHLVL', 'SHELLOPTS', 'BASHOPTS', 'BASHPID', 'GROUPS', 'FUNCNAME', 'HISTCMD', 'EPOCHSECONDS', 'EPOCHREALTIME',
  'COLUMNS', 'LINES', 'CDPATH', 'ENV', 'BASH_ENV', 'PS4', 'PROMPT_COMMAND', '_',
])

const DECLARERS = new Set(['export', 'declare', 'typeset', 'local', 'readonly'])
// Builtins that set a variable named in their words (`read X`, `printf -vX`, `getopts o X`, `unset X`).
const BINDERS = new Set(['read', 'mapfile', 'readarray', 'printf', 'getopts', 'wait', 'let', 'unset'])

// ---------------------------------------------------------------------------------------------------------------
// Lexer

type Site = { start: number; end: number; name: string }
// An assignment word (`NAME=`, `NAME[i]=`, `NAME+=`) at a word start outside quotes. `top` when it is in no subshell,
// substitution or backtick; `end` is where the word stops.
type AssignWord = { name: string; start: number; valueStart: number; end: number; top: boolean; plain: boolean }
// `tokens` holds every other identifier the text names (`read X`, `for X in`, `${X:-y}`, `'$X'`): such a name is left alone.
type Lexed = { sites: Site[]; assigns: AssignWord[]; tokens: Set<string>; seps: number[] }

type Kind = 'top' | 'paren' | 'subst' | 'bt' | 'dq' | 'brace' | 'arith'
type Frame = { kind: Kind; cases: number; depth: number }

const NAME = /[A-Za-z_]\w*/y
const WORD = /\w+/y
const ASSIGN = /([A-Za-z_]\w*)(\[[^\]\n]*\])?(\+?)=/y
const IDENT = /[A-Za-z_]\w*/g

const runAt = (re: RegExp, s: string, i: number) => {
  re.lastIndex = i
  return re.exec(s)
}

// Finds the expansion sites, assignment words, other identifiers and top-level command separators of a command. Null when
// the quoting does not balance, so the lexer lost track.
function lex(s: string): Lexed | null {
  const out: Lexed = { sites: [], assigns: [], tokens: new Set(), seps: [] }
  const frames: Frame[] = [{ kind: 'top', cases: 0, depth: 0 }]
  const heredocs: { delim: string; strip: boolean }[] = []
  const top = () => frames[frames.length - 1]!
  const push = (kind: Kind) => frames.push({ kind, cases: 0, depth: 0 })
  const taint = (text: string) => {
    for (const m of text.matchAll(IDENT)) out.tokens.add(m[0])
  }
  let word: AssignWord | null = null
  let wordStart = true
  let i = 0
  const endWord = () => {
    if (word && frames.length === 1) {
      word.end = i
      word = null
    }
  }
  // `$NAME` and `${NAME}` are sites; other expansions open a frame (or, in a heredoc body, are read as text).
  const dollar = (ctx: 'cmd' | 'dq' | 'body') => {
    const n = s[i + 1]
    if (n === '{') {
      const m = runAt(NAME, s, i + 2)
      if (m && s[i + 2 + m[0].length] === '}') {
        out.sites.push({ start: i, end: i + 3 + m[0].length, name: m[0] })
        i += 3 + m[0].length
      } else if (ctx === 'body') i += 2
      else {
        push('brace')
        i += 2
      }
      return
    }
    if (n !== undefined && /[A-Za-z_]/.test(n)) {
      const m = runAt(NAME, s, i + 1)!
      out.sites.push({ start: i, end: i + 1 + m[0].length, name: m[0] })
      i += 1 + m[0].length
      return
    }
    if (ctx === 'body') return void i++
    if (n === '(' && s[i + 2] === '(') {
      push('arith')
      i += 3
    } else if (n === '(') {
      push('subst')
      i += 2
    } else if (n === "'" && ctx === 'cmd') {
      // ANSI-C string: backslash escapes, no expansions.
      let j = i + 2
      while (j < s.length && s[j] !== "'") j += s[j] === '\\' ? 2 : 1
      taint(s.slice(i + 2, j))
      i = j + 1
    } else if (n === '"' && ctx === 'cmd') {
      push('dq')
      i += 2
    } else i += n !== undefined && /[0-9$?#@*!-]/.test(n) ? 2 : 1
  }
  const ident = () => {
    const m = runAt(WORD, s, i)![0]
    if (/^[A-Za-z_]/.test(m)) out.tokens.add(m)
    i += m.length
    return m
  }
  const singleQuoted = (): boolean => {
    const close = s.indexOf("'", i + 1)
    if (close < 0) return false
    taint(s.slice(i + 1, close))
    i = close + 1
    return true
  }
  // Heredoc bodies start after the newline that ends their command line.
  const bodies = () => {
    for (const h of heredocs) {
      let at = i
      let end = s.length
      let next = s.length
      for (;;) {
        const nl = s.indexOf('\n', at)
        const line = s.slice(at, nl < 0 ? s.length : nl)
        if ((h.strip ? line.replace(/^\t+/, '') : line) === h.delim) {
          end = at
          next = nl < 0 ? s.length : nl + 1
          break
        }
        if (nl < 0) break
        at = nl + 1
      }
      while (i < end) {
        const ch = s[i]!
        if (ch === '\\') i += 2
        else if (ch === '$') dollar('body')
        else if (/\w/.test(ch)) ident()
        else i++
      }
      i = next
    }
    heredocs.length = 0
  }
  // The delimiter of a heredoc whose `<<` starts at i; leaves i after it.
  const heredoc = (): boolean => {
    let j = i + 2
    const strip = s[j] === '-'
    if (strip) j++
    while (s[j] === ' ' || s[j] === '\t') j++
    let delim = ''
    while (j < s.length && !/[\s;&|<>()]/.test(s[j]!)) {
      const ch = s[j]!
      if (ch === "'" || ch === '"') {
        const close = s.indexOf(ch, j + 1)
        if (close < 0) return false
        delim += s.slice(j + 1, close)
        j = close + 1
      } else if (ch === '\\') {
        delim += s[j + 1] ?? ''
        j += 2
      } else {
        delim += ch
        j++
      }
    }
    if (delim === '') return false
    heredocs.push({ delim, strip })
    i = j
    return true
  }

  while (i < s.length) {
    const f = top()
    const ch = s[i]!
    if (f.kind === 'dq') {
      if (ch === '"') {
        frames.pop()
        i++
      } else if (ch === '\\') i += 2
      else if (ch === '$') dollar('dq')
      else if (ch === '`') {
        push('bt')
        i++
        wordStart = true
      } else if (/\w/.test(ch)) ident()
      else i++
      continue
    }
    if (f.kind === 'brace' || f.kind === 'arith') {
      if (ch === '\\') i += 2
      else if (ch === '$') dollar('dq')
      else if (ch === '"') {
        push('dq')
        i++
      } else if (ch === "'") {
        if (frames[frames.length - 2]?.kind === 'dq') i++
        else if (!singleQuoted()) return null
      } else if (ch === '`') {
        push('bt')
        i++
      } else if (f.kind === 'brace' && ch === '{') {
        f.depth++
        i++
      } else if (f.kind === 'brace' && ch === '}') {
        if (f.depth > 0) f.depth--
        else frames.pop()
        i++
      } else if (f.kind === 'arith' && ch === '(') {
        f.depth++
        i++
      } else if (f.kind === 'arith' && ch === ')') {
        if (f.depth > 0) {
          f.depth--
          i++
        } else {
          frames.pop()
          i += s[i + 1] === ')' ? 2 : 1
        }
      } else if (/\w/.test(ch)) ident()
      else i++
      continue
    }
    // Command context: top, (...), $(...), `...`.
    if (ch === ' ' || ch === '\t') {
      endWord()
      wordStart = true
      i++
    } else if (ch === '\n') {
      endWord()
      if (frames.length === 1) out.seps.push(i)
      i++
      wordStart = true
      if (heredocs.length > 0) bodies()
    } else if (ch === '#' && wordStart) {
      const nl = s.indexOf('\n', i)
      i = nl < 0 ? s.length : nl
    } else if (ch === '\\') {
      i += 2
      wordStart = false
    } else if (ch === "'") {
      if (!singleQuoted()) return null
      wordStart = false
    } else if (ch === '"') {
      push('dq')
      i++
      wordStart = false
    } else if (ch === '`') {
      if (f.kind === 'bt') frames.pop()
      else push('bt')
      i++
      wordStart = f.kind !== 'bt'
    } else if (ch === '$') {
      dollar('cmd')
      wordStart = false
    } else if (ch === ';' || ch === '&' || ch === '|') {
      endWord()
      if (frames.length === 1) out.seps.push(i)
      i++
      wordStart = true
    } else if (ch === '(') {
      endWord()
      push('paren')
      i++
      wordStart = true
    } else if (ch === ')') {
      endWord()
      // A case pattern ends in `)` too.
      if (f.cases === 0 && (f.kind === 'paren' || f.kind === 'subst')) frames.pop()
      i++
      wordStart = true
    } else if (ch === '<' || ch === '>') {
      endWord()
      if (ch === '<' && s[i + 1] === '<' && s[i + 2] !== '<') {
        if (!heredoc()) return null
      } else i += ch === '<' && s[i + 1] === '<' ? 3 : 1
      wordStart = false
    } else if (/\w/.test(ch)) {
      const m = wordStart ? runAt(ASSIGN, s, i) : null
      if (m) {
        const a: AssignWord = { name: m[1]!, start: i, valueStart: i + m[0].length, end: s.length, top: frames.length === 1, plain: !m[2] && !m[3] }
        out.assigns.push(a)
        if (a.top) word = a
        i += m[0].length
      } else {
        const at = wordStart
        const w = ident()
        if (at && w === 'case' && /\s/.test(s[i] ?? '')) f.cases++
        if (at && w === 'esac') f.cases = Math.max(0, f.cases - 1)
      }
      wordStart = false
    } else {
      i++
      wordStart = false
    }
  }
  endWord()
  return frames.length === 1 && heredocs.length === 0 ? out : null
}

// ---------------------------------------------------------------------------------------------------------------
// Path finders

const NO_FIND = new Set(['-exec', '-execdir', '-ok', '-okdir', '-printf', '-fprintf', '-fprint', '-fprint0', '-fls', '-ls', '-delete', '-o', '-or', '-not', '!', ',', '-iname'])
const FILTERS = new Set(['head', 'tail', 'sort'])
const programName = (n: string | undefined) => (n !== undefined && /^[\w.+-]+$/.test(n) && !/^[-+]/.test(n) ? n : null)
const quietRedirects = (c: ShellCommand) => c.heredocs.length === 0 && c.redirects.every(r => r.target === '/dev/null' || (r.op === '>&' && /^[12]$/.test(r.target ?? '')))

// The program a lookup prints the path of: `which X`, `command -v X`, `type -P X`, `mise which X`, `find ... -name X`,
// `realpath X`, `readlink -f X`. Null for anything else.
function foundProgram(c: ShellCommand): string | null {
  if (c.argv.some(a => a === null) || c.assigns.length > 0 || !quietRedirects(c)) return null
  const a = c.argv as string[]
  const ops = a.slice(1).filter(w => w[0] !== '-')
  switch (baseName(a[0] ?? null)) {
    case 'which':
      return ops.length === 1 ? programName(ops[0]) : null
    case 'command':
      return a.length === 3 && a[1] === '-v' ? programName(a[2]) : null
    case 'type':
      return a.length === 3 && (a[1] === '-P' || a[1] === '-p') ? programName(a[2]) : null
    case 'mise':
      return a.length === 3 && a[1] === 'which' ? programName(a[2]) : null
    case 'find': {
      if (a.some(w => NO_FIND.has(w))) return null
      const at = a.indexOf('-name')
      return at > 0 && a.indexOf('-name', at + 1) < 0 ? programName(a[at + 1]) : null
    }
    case 'realpath':
    case 'readlink':
      return ops.length === 1 ? programName(baseName(ops[0]!)) : null
    default:
      return null
  }
}

// A filter that keeps some of a lookup's lines: `head -1`, `tail -n 1`, `sort -V`.
const lineFilter = (c: ShellCommand) =>
  FILTERS.has(baseName(c.argv[0] ?? null)) && c.argv.slice(1).every(w => w !== null && /^(?:-[\w-]*|\d+)$/.test(w)) && c.assigns.length === 0 && quietRedirects(c)

// For an assignment command whose value is one substitution, the program that substitution looks up: a path finder,
// optionally piped through head, tail or sort, with nothing nested in it. Null otherwise.
function finderProgram(c: ShellCommand): string | null {
  if (c.subs.length === 0 || c.subs.some(s => s.nesting !== c.nesting + 1)) return null
  const subs = c.subs
  if (subs.length === 1 ? subs[0]!.pipeline !== null : !subs.every((s, i) => s.pipeline?.stage === i)) return null
  if (!subs.slice(1).every(lineFilter)) return null
  return foundProgram(subs[0]!)
}

// ---------------------------------------------------------------------------------------------------------------
// Which variables expand

type Value = { text: string; finder: boolean }
type Bind = { value: string | null; c: ShellCommand }

// The value each variable can be written in as, or none. A variable qualifies when every assignment of it is a plain
// `NAME=value` (or `export NAME=value` and its kin, without options) at the top level of the command (no subshell,
// substitution, pipeline, nested script or command prefix), they all give the same literal value or the same path finder,
// and nothing else in the text names it.
function expandable(command: string, commands: readonly ShellCommand[], lx: Lexed): Map<string, Value> {
  const out = new Map<string, Value>()
  const binds = new Map<string, Bind[]>()
  const tainted = new Set<string>(lx.tokens)
  const bind = (name: string, value: string | null, c: ShellCommand) => binds.set(name, [...(binds.get(name) ?? []), { value, c }])
  for (const c of commands) {
    const name = baseName(c.argv[0] ?? null)
    // `source` and `.` can set anything (so can `eval` of an expansion, which expandLiteralVars checks after the rewrite).
    if (name === 'source' || name === '.') return out
    const nested = c.depth > 0 || c.nesting > 0 || c.pipeline !== null
    for (const a of c.assigns) {
      if (a.name === null) continue
      const base = a.name.replace(/\[.*$/, '')
      if (base !== a.name || a.append || nested || c.argv.length > 0) tainted.add(base)
      else bind(base, a.value, c)
    }
    if (DECLARERS.has(name)) {
      const flagged = c.text.slice(1).some(t => /^[-+]/.test(t))
      for (const [k, t] of c.text.entries()) {
        const m = k > 0 ? /^([A-Za-z_]\w*)(\[[^\]]*\])?(\+?)=/.exec(t) : null
        if (!m) continue
        if (flagged || nested || m[2] || m[3]) tainted.add(m[1]!)
        else bind(m[1]!, c.argv[k] === null ? null : c.argv[k]!.slice(m[0].length), c)
      }
    }
    // Every tail of every name-like run, so an attached name (`printf -vX`, `read -raX`) counts too.
    if (BINDERS.has(name)) {
      for (const t of c.text.slice(1)) for (const m of t.matchAll(/\w+/g)) for (let k = 0; k < m[0].length; k++) tainted.add(m[0].slice(k))
    }
  }
  if (lx.assigns.some(a => a.name === 'IFS') || binds.has('IFS')) return out
  for (const [name, list] of binds) {
    if (tainted.has(name) || SPECIAL.has(name)) continue
    const words = lx.assigns.filter(a => a.name === name)
    if (words.length !== list.length || words.some(w => !w.top || !w.plain)) continue
    const values = list.map((b, k): Value | null => {
      if (b.value !== null) return LITERAL_VALUE.test(b.value) && !/^[-+]/.test(b.value) ? { text: b.value, finder: false } : null
      // A computed value counts only when it is exactly one substitution.
      const raw = command.slice(words[k]!.valueStart, words[k]!.end)
      if (!/^(?:"\$\([^]*\)"|\$\([^]*\)|"`[^`]*`"|`[^`]*`)$/.test(raw)) return null
      const program = b.c.argv.length === 0 || DECLARERS.has(baseName(b.c.argv[0] ?? null)) ? finderProgram(b.c) : null
      return program === null ? null : { text: program, finder: true }
    })
    const first = values[0]
    if (first && values.every(v => v !== null && v.text === first.text && v.finder === first.finder)) out.set(name, first)
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// The rewrite and its check

const MARK = 'bRxV'
const marker = (k: number) => `${MARK}${k}Q`
const MARKER = /bRxV(\d+)Q/g
const ASSIGN_WORD = /^[A-Za-z_]\w*(?:\[[^\]]*\])?\+?=/

const splice = (s: string, sites: readonly Site[], put: (k: number) => string) => {
  let out = ''
  let at = 0
  for (const [k, site] of sites.entries()) {
    out += s.slice(at, site.start) + put(k)
    at = site.end
  }
  return out + s.slice(at)
}

// Whether the rewritten text parses into the same commands as the marked one: the same count, nesting, pipeline stages,
// assignments, redirects and heredocs, and the same words with each marker filled in. A marker word may split into its
// value's words where bash splits it (an unquoted argument), but not in a declaration's assignment, a redirect target, an
// assignment value or a brace word.
function sameShape(marked: ShellParse, rewritten: ShellParse, fill: (t: string) => string): boolean {
  if (rewritten.errors.length > 0 || marked.commands.length !== rewritten.commands.length) return false
  const has = (t: string) => t.includes(MARK)
  return marked.commands.every((x, n) => {
    const y = rewritten.commands[n]!
    if (x.nesting !== y.nesting || (x.pipeline?.stage ?? -1) !== (y.pipeline?.stage ?? -1) || x.heredocs.length !== y.heredocs.length) return false
    if (x.assigns.length !== y.assigns.length || x.redirects.length !== y.redirects.length) return false
    const sameAssigns = x.assigns.every((a, k) => {
      const b = y.assigns[k]!
      return (a.name === null ? b.name === null : fill(a.name) === b.name) && a.append === b.append && (a.value === null || fill(a.value) === b.value)
    })
    if (!sameAssigns || !x.redirects.every((r, k) => r.op === y.redirects[k]!.op && fill(r.text) === y.redirects[k]!.text)) return false
    const declares = DECLARERS.has(baseName(x.argv[0] ?? null))
    let j = 0
    for (const t of x.text) {
      const want = fill(t)
      let got = y.text[j]
      let used = 1
      const splits = has(t) && !(declares && ASSIGN_WORD.test(t)) && !t.includes('{')
      while (splits && got !== undefined && got !== want && want.startsWith(`${got} `) && y.text[j + used] !== undefined) {
        got = `${got} ${y.text[j + used]}`
        used++
      }
      if (got !== want) return false
      j += used
    }
    return j === y.text.length
  })
}

// The command with its literal variables written in, or null when there are none to write or the rewrite does not keep
// the command's shape. `commands` is the command's scan; `rescan` scans a text the same way (nested scripts included), or
// returns null when it cannot. A literal variable is written in at every use after the command that assigns it; a path
// finder only where it is the program a command runs (`Z=$(which zizmor); "$Z" .` reads `"zizmor" .`), since its value
// is a path.
export function expandLiteralVars(command: string, commands: readonly ShellCommand[], rescan: (text: string) => readonly ShellCommand[] | null): string | null {
  if (command.includes(MARK)) return null
  const lx = lex(command)
  if (!lx) return null
  const vars = expandable(command, commands, lx)
  if (vars.size === 0) return null
  // Uses count once the assigning command is over: after the first top-level separator past its first assignment.
  const from = new Map<string, number>()
  for (const name of vars.keys()) {
    const at = lx.assigns.find(a => a.name === name)!.start
    const sep = lx.seps.find(p => p > at)
    if (sep !== undefined) from.set(name, sep)
  }
  let sites = lx.sites.filter(s => from.has(s.name) && s.start > from.get(s.name)!)
  if (sites.some(s => vars.get(s.name)!.finder)) {
    const scanned = rescan(splice(command, sites, marker))
    if (!scanned) return null
    const runs = new Set<string>()
    for (const c of scanned) for (const v of viewsOf(c.argv)) if (v[0] !== null && v[0] !== undefined) runs.add(v[0])
    sites = sites.filter((s, k) => !vars.get(s.name)!.finder || runs.has(marker(k)))
  }
  if (sites.length === 0) return null
  const values = sites.map(s => vars.get(s.name)!.text)
  const marked = splice(command, sites, marker)
  const rewritten = splice(command, sites, k => values[k]!)
  const fill = (t: string) => t.replace(MARKER, (_, k: string) => values[Number(k)] ?? '')
  if (!sameShape(parse(marked), parse(rewritten), fill)) return null
  // The rewrite may turn `eval "$X"` into a literal script; that script, and every other one, must not assign a written-in
  // variable again, and no `eval` of an expansion may remain to do so unseen.
  const after = rescan(rewritten)
  if (!after) return null
  const names = new Set(sites.map(s => s.name))
  for (const c of after) {
    const name = baseName(c.argv[0] ?? null)
    if (name === 'eval' && c.argv.includes(null)) return null
    const assigned = [
      ...c.assigns.map(a => a.name?.replace(/\[.*$/, '')),
      ...(DECLARERS.has(name) ? c.text.slice(1).map(t => /^([A-Za-z_]\w*)/.exec(t)?.[1]) : []),
    ]
    if (assigned.some(n => n !== undefined && names.has(n)) && (c.depth > 0 || c.nesting > 0)) return null
  }
  return rewritten
}
