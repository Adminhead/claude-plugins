// Literal variable expansion for bash-rules. Nothing here touches `$`.
// `H="dotnet run --project x"; $H --ticks 5` hides nothing: the value is plain words. expandLiteralVars writes such values
// into the command text so the danger and hygiene rules check what really runs (`P="psql -c"; $P "DROP TABLE x"` is a
// db-drop). A tool lookup (`S=$(mise which sops)`) is written in as the tool's name. The walker has no source offsets, so a
// small lexer finds the `$NAME` and `${NAME}` sites; each site is first replaced by a marker word, and the rewrite counts
// only when it parses into the same shape as the marked text. Anything unclear leaves the variable as written, and an
// assigned variable left in a command word is denied (hygiene.ts): the rewrite must be what bash runs, never a guess.

import { baseName, dynamicProgram, invocation, stdinReader, viewsOf } from './danger'
import { parse } from '../shell/walk'
import type { ShellCommand, ShellParse } from '../shell/walk'
import { parse as unbash } from '../vendor/unbash.js'

// A value made of plain words: no quotes, expansions, globs, braces or shell metacharacters. A leading `~` (or `$HOME`,
// which the walker reads as `~`) is the home directory, as bash resolves it in an assignment.
const LITERAL_VALUE = /^(?:~(?:\/[\w./=:@,+%-]*)?|[\w./=:@,+%-]+)(?: [\w./=:@,+%-]+)*$/

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
// An assignment word (`NAME=`, `NAME[i]=`, `NAME+=`) at a command start, or among a declaration's words. `end` is where the
// word stops, and `outer` says it is in no substitution or subshell, so it can bind in the script's own shell.
type AssignWord = { name: string; start: number; valueStart: number; end: number; plain: boolean; outer: boolean }
// `tokens` holds every other identifier the text names (`read X`, `${X:-y}`, `'$X'`): such a name is left alone. `seps` holds
// where each top-level command ends.
type Lexed = { sites: Site[]; assigns: AssignWord[]; tokens: Set<string>; seps: number[] }

type Kind = 'top' | 'paren' | 'subst' | 'bt' | 'dq' | 'brace' | 'arith'
type Frame = { kind: Kind; depth: number }

const NAME = /[A-Za-z_]\w*/y
const WORD = /\w+/y
const ASSIGN = /([A-Za-z_]\w*)(\[[^\]\n]*\])?(\+?)=/y
const IDENT = /[A-Za-z_]\w*/g
const LIST_OPS = ['&&', '||', ';;', '|&', '&', '|', ';']

const runAt = (re: RegExp, s: string, i: number) => {
  re.lastIndex = i
  return re.exec(s)
}

// Finds the expansion sites, assignment words, other identifiers and top-level command separators of a command. Null when
// the quoting does not balance, so the lexer lost track.
function lex(s: string): Lexed | null {
  const out: Lexed = { sites: [], assigns: [], tokens: new Set(), seps: [] }
  const frames: Frame[] = [{ kind: 'top', depth: 0 }]
  const heredocs: { delim: string; strip: boolean; quoted: boolean }[] = []
  const top = () => frames[frames.length - 1]!
  const push = (kind: Kind) => frames.push({ kind, depth: 0 })
  const taint = (text: string) => {
    for (const m of text.matchAll(IDENT)) out.tokens.add(m[0])
  }
  let word: AssignWord | null = null
  let wordStart = true
  // Top level only: at a command start, and inside a declaration's words.
  let cmdStart = true
  let declaring = false
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
    // The plain text of a top-level assignment's value binds nothing (`nm=/opt/bin/elf-nm`); a frame in it (`$((X=1))`) can.
    if (/^[A-Za-z_]/.test(m) && (word === null || frames.length > 1)) out.tokens.add(m)
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
  // Heredoc bodies start after the newline that ends their command line. A quoted delimiter's body is literal text, so it
  // has no sites, but the names it mentions still count.
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
      if (h.quoted) taint(s.slice(i, end))
      else {
        while (i < end) {
          const ch = s[i]!
          if (ch === '\\') i += 2
          else if (ch === '$') dollar('body')
          else if (/\w/.test(ch)) ident()
          else i++
        }
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
    let quoted = false
    while (j < s.length && !/[\s;&|<>()]/.test(s[j]!)) {
      const ch = s[j]!
      if (ch === "'" || ch === '"') {
        const close = s.indexOf(ch, j + 1)
        if (close < 0) return false
        delim += s.slice(j + 1, close)
        quoted = true
        j = close + 1
      } else if (ch === '\\') {
        delim += s[j + 1] ?? ''
        quoted = true
        j += 2
      } else {
        delim += ch
        j++
      }
    }
    if (delim === '') return false
    heredocs.push({ delim, strip, quoted })
    i = j
    return true
  }
  // A top-level separator: list operators end the command and start the next.
  const separator = (op: string) => {
    if (frames.length === 1) {
      out.seps.push(i)
      cmdStart = true
      declaring = false
    }
    i += op.length
    wordStart = true
  }
  // A word at the top level: the first one of a command names it.
  const topWord = (w: string) => {
    if (frames.length !== 1) return
    if (cmdStart) declaring = DECLARERS.has(w)
    cmdStart = false
  }
  // Whether the word that starts at i ends there plus `n` characters (a whole word, not `{a,b}` or `done.txt`).
  const whole = (n: number) => /^$|[\s;&|()<>]/.test(s[i + n] ?? '')

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
      separator('\n')
      if (heredocs.length > 0) bodies()
    } else if (ch === '#' && wordStart) {
      const nl = s.indexOf('\n', i)
      i = nl < 0 ? s.length : nl
    } else if (ch === '\\') {
      if (s[i + 1] !== '\n') topWord('\\')
      i += 2
      wordStart = false
    } else if (ch === "'") {
      if (!singleQuoted()) return null
      topWord("'")
      wordStart = false
    } else if (ch === '"') {
      if (wordStart) topWord('"')
      push('dq')
      i++
      wordStart = false
    } else if (ch === '`') {
      if (f.kind === 'bt') frames.pop()
      else {
        if (wordStart) topWord('`')
        push('bt')
      }
      i++
      wordStart = f.kind !== 'bt'
    } else if (ch === '$') {
      if (wordStart) topWord('$')
      dollar('cmd')
      wordStart = false
    } else if (ch === '&' && s[i + 1] === '>') {
      // `&>` and `&>>` redirect.
      endWord()
      i += s[i + 2] === '>' ? 3 : 2
      wordStart = false
    } else if (ch === ';' || ch === '&' || ch === '|') {
      endWord()
      separator(LIST_OPS.find(op => s.startsWith(op, i))!)
    } else if (ch === '(') {
      endWord()
      push('paren')
      i++
      wordStart = true
    } else if (ch === ')') {
      endWord()
      if (f.kind === 'paren' || f.kind === 'subst') frames.pop()
      i++
      wordStart = true
    } else if ((ch === '<' || ch === '>') && s[i + 1] === '(') {
      // Process substitution.
      endWord()
      push('subst')
      i += 2
      wordStart = true
    } else if (ch === '<' || ch === '>') {
      endWord()
      if (ch === '<' && s[i + 1] === '<' && s[i + 2] !== '<') {
        if (!heredoc()) return null
      } else if (ch === '<' && s[i + 1] === '<') i += 3
      else {
        // `>`, `>>`, `<>`, `>|`, `>&`, `<&`, with any target after.
        i++
        if (s[i] === '>' || s[i] === '<') i++
        if (s[i] === '&' || s[i] === '|') i++
      }
      wordStart = false
    } else if (wordStart && ((ch === '{' || ch === '}' || ch === '!') && whole(1) || (ch === '[' && s[i + 1] === '[' && whole(2)))) {
      // A `{ }` group, `!` negation or `[[ ]]` test: the next word still starts a command.
      i++
      wordStart = false
    } else if (/\w/.test(ch)) {
      const m = wordStart && (cmdStart || declaring) ? runAt(ASSIGN, s, i) : null
      if (m) {
        const a: AssignWord = { name: m[1]!, start: i, valueStart: i + m[0].length, end: s.length, plain: !m[2] && !m[3], outer: frames.length === 1 }
        out.assigns.push(a)
        if (frames.length === 1) word = a
        i += m[0].length
      } else {
        const at = wordStart
        const w = ident()
        if (at) topWord(w)
      }
      wordStart = false
    } else {
      if (wordStart) topWord(ch)
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

// `mise which X`, with `--cd DIR` or `-C DIR` on either side of it. Only DIR may be an expansion: it picks the tool version,
// not the tool's name. Any other option (`--version`) prints something other than a path.
function miseTool(a: readonly (string | null)[]): string | null {
  const rest: (string | null)[] = []
  for (let i = 1; i < a.length; i++) {
    if (a[i] === '--cd' || a[i] === '-C') i++
    else if (!a[i]?.startsWith('--cd=')) rest.push(a[i]!)
  }
  return rest.length === 2 && rest[0] === 'which' ? programName(rest[1] ?? undefined) : null
}

// The program a lookup prints the path of: `which X`, `command -v X`, `type -P X`, `mise which X`, `find ... -name X`.
// Null for anything else. (realpath and readlink print a path whose basename can differ from the operand's, and `which -a`
// prints several paths.)
function foundProgram(c: ShellCommand): string | null {
  if (c.assigns.length > 0 || !quietRedirects(c)) return null
  if (baseName(c.argv[0] ?? null) === 'mise') return miseTool(c.argv)
  if (c.argv.some(a => a === null)) return null
  const a = c.argv as string[]
  switch (baseName(a[0] ?? null)) {
    case 'which':
      return a.length === 2 ? programName(a[1]) : null
    case 'command':
      return a.length === 3 && a[1] === '-v' ? programName(a[2]) : null
    case 'type':
      return a.length === 3 && (a[1] === '-P' || a[1] === '-p') ? programName(a[2]) : null
    case 'find': {
      if (a.some(w => NO_FIND.has(w))) return null
      const at = a.indexOf('-name')
      return at > 0 && a.indexOf('-name', at + 1) < 0 ? programName(a[at + 1]) : null
    }
    default:
      return null
  }
}

// A filter that keeps some of a lookup's lines: `head -1`, `tail -n 1`, `sort -V`.
const lineFilter = (c: ShellCommand) =>
  FILTERS.has(baseName(c.argv[0] ?? null)) && c.argv.slice(1).every(w => w !== null && /^(?:-[\w-]*|\d+)$/.test(w)) && c.assigns.length === 0 && quietRedirects(c)

// `cd DIR` before a `mise which`, whose answer depends on the directory.
const cdFirst = (c: ShellCommand) => c.argv[0] === 'cd' && c.argv.length === 2 && c.pipeline === null && c.assigns.length === 0 && quietRedirects(c)

// For an assignment command whose value is one substitution, the program that substitution looks up: a path finder,
// optionally piped through head, tail or sort, or `cd DIR && mise which X`, with nothing nested in it. Null otherwise.
function finderProgram(c: ShellCommand): string | null {
  if (c.subs.length === 0 || c.subs.some(s => s.nesting !== c.nesting + 1)) return null
  const entered = c.subs.length === 2 && cdFirst(c.subs[0]!) && baseName(c.subs[1]!.argv[0] ?? null) === 'mise'
  const subs = entered ? c.subs.slice(1) : c.subs
  if (subs.length === 1 ? subs[0]!.pipeline !== null : !subs.every((s, i) => s.pipeline?.stage === i)) return null
  if (!subs.slice(1).every(lineFilter)) return null
  return foundProgram(subs[0]!)
}

// ---------------------------------------------------------------------------------------------------------------
// Which variables expand

// `unset` is where the variable may start to hold nothing: anywhere for a lookup, which may come back empty, and past its
// list for an assignment after `&&` or `||`, which may not run. Infinity when the value always holds.
type Value = { text: string; finder: boolean; unset: number }
type Bind = { value: string | null; c: ShellCommand }

type Top = { from: number; to: number; until: number }

// The simple commands at a script's top level, in order, each in the script's own shell, with `until`, where what they
// assign stops being certain. A statement, or the first of a `&&` or `||` list, runs whenever the script gets that far, so
// never. The rest of a list may not run: the end of an all-`&&` list, since what follows in it runs only after them, else
// their own end. Whatever sits in a compound or a function, in a pipeline or in the background is left out, and so is every
// assignment in it.
function topLevel(script: string): Top[] {
  const out: Top[] = []
  for (const st of unbash(script).commands) {
    if (st.background) continue
    const cmd = st.command
    const list = cmd.type === 'AndOr' ? cmd.commands : [cmd]
    const chained = cmd.type === 'AndOr' && cmd.operators.every(op => op === '&&')
    for (const [k, c] of list.entries()) {
      if (c.type === 'Command') out.push({ from: c.pos, to: c.end, until: k === 0 ? Infinity : chained ? cmd.end : c.end })
    }
  }
  return out
}

// The top-level command at a position, by binary search.
function topAt(top: readonly Top[], at: number): Top | null {
  let lo = 0
  let hi = top.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const t = top[mid]!
    if (at < t.from) hi = mid - 1
    else if (at >= t.to) lo = mid + 1
    else return t
  }
  return null
}

// The value each variable can be written in as, or none. A variable qualifies when every assignment of it is a plain
// `NAME=value` (or `export NAME=value` and its kin, without options) in a top-level command (see topLevel), they all give
// the same literal value or the same path finder, and nothing else in the text names it. A compound command around a use
// changes nothing: the value is set by then, and any other binding of the name disqualifies it.
function expandable(command: string, commands: readonly ShellCommand[], lx: Lexed): Map<string, Value> {
  const out = new Map<string, Value>()
  const binds = new Map<string, Bind[]>()
  const tainted = new Set<string>(lx.tokens)
  const bind = (name: string, value: string | null, c: ShellCommand) => {
    const list = binds.get(name)
    if (list) list.push({ value, c })
    else binds.set(name, [{ value, c }])
  }
  for (const c of commands) {
    // `builtin read X`, `command . f`: the names a command runs through its wrappers.
    const names = viewsOf(c.argv).map(v => baseName(v[0] ?? null))
    // `source` and `.` can set anything (so can `eval` of an expansion, which expandLiteralVars checks after the rewrite).
    if (names.some(n => n === 'source' || n === '.')) return out
    // A declaration or binder that names its variable by an expansion, or declares a nameref, can set any name.
    const binder = names.find(n => DECLARERS.has(n) || BINDERS.has(n))
    if (binder !== undefined) {
      const opts = c.text.slice(1).filter(t => /^-/.test(t))
      const namesByOption = binder === 'printf' || binder === 'wait' ? opts.some(t => /^-[A-Za-z]*[vp]/.test(t)) : true
      // `export A=$B` names A; only the value is computed.
      const named = (k: number) => DECLARERS.has(binder) && /^[A-Za-z_]\w*\+?=/.test(c.text[k] ?? '')
      if (namesByOption && c.argv.some((a, k) => a === null && !named(k))) return out
      if (DECLARERS.has(binder) && opts.some(t => /^-[A-Za-z]*n/.test(t))) return out
    }
    const nested = c.depth > 0 || c.nesting > 0 || c.pipeline !== null
    for (const a of c.assigns) {
      if (a.name === null) continue
      const base = a.name.replace(/\[.*$/, '')
      if (base !== a.name || a.append || nested || c.argv.length > 0) tainted.add(base)
      else bind(base, a.value, c)
    }
    if (DECLARERS.has(names[0] ?? '')) {
      const flagged = c.text.slice(1).some(t => /^[-+]/.test(t))
      for (const [k, t] of c.text.entries()) {
        const m = k > 0 ? /^([A-Za-z_]\w*)(\[[^\]]*\])?(\+?)=/.exec(t) : null
        if (!m) continue
        if (flagged || nested || m[2] || m[3]) tainted.add(m[1]!)
        else bind(m[1]!, c.argv[k] === null ? null : c.argv[k]!.slice(m[0].length), c)
      }
    } else if (names.some(n => DECLARERS.has(n))) {
      // A declaration behind a wrapper (`builtin export X=1`): its names are not read here, so none expand.
      for (const t of c.text) for (const m of t.matchAll(IDENT)) tainted.add(m[0])
    }
    // Every tail of every name-like run, so an attached name (`printf -vX`, `read -raX`) counts too.
    if (binder !== undefined && BINDERS.has(binder)) {
      for (const t of c.text.slice(1)) for (const m of t.matchAll(/\w+/g)) for (let k = 0; k < m[0].length; k++) tainted.add(m[0].slice(k))
    }
  }
  if (tainted.has('IFS') || lx.assigns.some(a => a.name === 'IFS') || binds.has('IFS')) return out
  const top = topLevel(command)
  const assigned = new Map<string, AssignWord[]>()
  for (const a of lx.assigns) {
    const list = assigned.get(a.name)
    if (list) list.push(a)
    else assigned.set(a.name, [a])
  }
  for (const [name, list] of binds) {
    if (tainted.has(name) || SPECIAL.has(name)) continue
    const words = assigned.get(name) ?? []
    const tops = words.map(w => topAt(top, w.start))
    if (words.length !== list.length || words.some(w => !w.plain) || tops.includes(null)) continue
    const unset = Math.min(...tops.map(t => t!.until))
    const values = list.map((b, k): Value | null => {
      if (b.value !== null) {
        const homeMoves = b.value[0] === '~' && (assigned.get('HOME') ?? []).some(a => a.outer && a.start > words[k]!.start)
        if (!LITERAL_VALUE.test(b.value) || /^[-+]/.test(b.value) || homeMoves) return null
        return { text: b.value.replace(/^~/, '$HOME'), finder: false, unset }
      }
      // A computed value counts only when it is exactly one substitution.
      const raw = command.slice(words[k]!.valueStart, words[k]!.end)
      if (!/^(?:"\$\([^]*\)"|\$\([^]*\)|"`[^`]*`"|`[^`]*`)$/.test(raw)) return null
      const program = b.c.argv.length === 0 || finderDeclaration(b.c) ? finderProgram(b.c) : null
      return program === null ? null : { text: program, finder: true, unset: 0 }
    })
    const first = values[0]
    if (first && values.every(v => v !== null && v.text === first.text && v.finder === first.finder)) out.set(name, first)
  }
  return out
}

// `export Z=$(which x)` and its kin: a declaration of one computed variable, with no options.
const finderDeclaration = (c: ShellCommand) =>
  DECLARERS.has(baseName(c.argv[0] ?? null)) && c.argv.length === 2 && c.argv[1] === null && /^[A-Za-z_]\w*=/.test(c.text[1] ?? '')

// ---------------------------------------------------------------------------------------------------------------
// The rewrite and its check

const MARK = 'bRxV'
const marker = (k: number) => `${MARK}${k}Q`
const MARKER = /bRxV(\d+)Q/g
const MARKER_WORD = /^bRxV(\d+)Q$/
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

// How many of `words`, from `j`, joined by single spaces spell `want`; 0 when they do not. Linear in `want`.
function spells(words: readonly string[], j: number, want: string): number {
  let pos = 0
  for (let n = j; n < words.length; n++) {
    const w = words[n]!
    if (!want.startsWith(w, pos)) return 0
    pos += w.length
    if (pos === want.length) return n - j + 1
    if (want[pos] !== ' ') return 0
    pos++
  }
  return 0
}

// Whether the rewritten text parses into the same commands as the marked one: the same count, nesting, pipeline stages,
// assignments, redirects and heredocs, and the same words with each marker filled in. A marker word may split into its
// value's words where bash splits it (an unquoted argument), but not in a declaration's assignment, a redirect target, an
// assignment value or a brace word.
function sameShape(marked: ShellParse, rewritten: ShellParse, fill: (t: string) => string): boolean {
  if (rewritten.errors.length > 0 || marked.commands.length !== rewritten.commands.length) return false
  const has = (t: string) => t.includes(MARK)
  // The walker reads a leading `$HOME` in an assignment value as `~`.
  const home = (t: string) => t.replace(/^\$HOME(?=\/|$)/, '~')
  return marked.commands.every((x, n) => {
    const y = rewritten.commands[n]!
    if (x.nesting !== y.nesting || (x.pipeline?.stage ?? -1) !== (y.pipeline?.stage ?? -1) || x.heredocs.length !== y.heredocs.length) return false
    if (x.assigns.length !== y.assigns.length || x.redirects.length !== y.redirects.length) return false
    const sameAssigns = x.assigns.every((a, k) => {
      const b = y.assigns[k]!
      return (a.name === null ? b.name === null : fill(a.name) === b.name) && a.append === b.append && (a.value === null || home(fill(a.value)) === b.value)
    })
    if (!sameAssigns || !x.redirects.every((r, k) => r.op === y.redirects[k]!.op && fill(r.text) === y.redirects[k]!.text)) return false
    const declares = DECLARERS.has(baseName(x.argv[0] ?? null))
    let j = 0
    for (const t of x.text) {
      const want = fill(t)
      const splits = has(t) && !(declares && ASSIGN_WORD.test(t)) && !t.includes('{')
      const used = y.text[j] === want ? 1 : splits ? spells(y.text, j, want) : 0
      if (used === 0) return false
      j += used
    }
    return j === y.text.length
  })
}

// What a rewrite leaves: `text` has each value written in, and `empty`, when a variable may hold nothing, has it vanish
// instead. Either can be what bash runs, so the caller checks both.
export type Written = { text: string; empty: string | null }

// Whether a lookup run as `v[0]` is a shell or interpreter handed its program as an expansion or on a pipe
// (`$S -c "$payload"`, `echo "$p" | $S`), which is a hidden script whoever found the interpreter. A script file
// (`$PY script.py`, `$PY "$f"`) and a quoted heredoc are not.
const runsExpansion = (tool: string, v: readonly (string | null)[], c: ShellCommand) => {
  const w = [tool, ...v.slice(1)]
  const reads = stdinReader(w) !== null
  return (reads && (c.pipeline?.stage ?? 0) > 0) || (dynamicProgram(w, c) && ((invocation(w)?.code ?? -1) >= 0 || reads))
}

// The command with its literal variables written in, or null when there are none to write, the rewrite would be longer
// than `max`, or it does not keep the command's shape. `rescan` scans a text as the caller does (nested scripts included),
// or returns null when it cannot. A literal variable is written in at every use after the command that assigns it. A path
// finder is written in only where it is the program a command runs: `Z=$(which zizmor); "$Z" .` reads `"zizmor" .`. A
// variable that may be unset (see Value) is written in too, and `empty` shows what runs without it: a quoted lookup can
// only fail, but unquoted (`$Z rm -rf ~`) the word vanishes and its arguments run. A found path with spaces in it would
// split; lookups land in a PATH directory or under mise, so that is left out of reach of a model's habits, as elsewhere.
export function expandLiteralVars(command: string, rescan: (text: string) => readonly ShellCommand[] | null, max: number): Written | null {
  if (command.includes(MARK)) return null
  const lx = lex(command)
  if (!lx || lx.assigns.length === 0) return null
  const commands = rescan(command)
  if (!commands) return null
  const vars = expandable(command, commands, lx)
  if (vars.size === 0) return null
  // Uses count once the assigning command is over: after the first top-level separator past its first assignment.
  const from = new Map<string, number>()
  const firstAt = new Map<string, number>()
  for (const a of lx.assigns) if (!firstAt.has(a.name)) firstAt.set(a.name, a.start)
  let next = 0
  for (const [name, at] of [...firstAt].filter(([n]) => vars.has(n)).sort((a, b) => a[1] - b[1])) {
    while (next < lx.seps.length && lx.seps[next]! <= at) next++
    if (next < lx.seps.length) from.set(name, lx.seps[next]!)
  }
  let sites = lx.sites.filter(s => from.has(s.name) && s.start > from.get(s.name)!)
  if (sites.some(s => vars.get(s.name)!.finder)) {
    const all = sites
    const runs = new Set<string>()
    for (const c of parse(splice(command, all, marker)).commands) {
      for (const v of viewsOf(c.argv)) {
        const k = MARKER_WORD.exec(v[0] ?? '')
        const site = k ? all[Number(k[1])] : undefined
        if (site && !runsExpansion(vars.get(site.name)!.text, v, c)) runs.add(v[0]!)
      }
    }
    sites = all.filter((s, k) => !vars.get(s.name)!.finder || runs.has(marker(k)))
  }
  if (sites.length === 0) return null
  const values = sites.map(s => vars.get(s.name)!.text)
  // Bound the rewrite before parsing it: a long value used many times would otherwise build a huge text.
  let length = command.length
  for (const [k, s] of sites.entries()) length += values[k]!.length - (s.end - s.start)
  if (length > max) return null
  const marked = splice(command, sites, marker)
  const parsed = parse(marked)
  const rewritten = splice(command, sites, k => values[k]!)
  const fill = (t: string) => t.replace(MARKER, (_, k: string) => values[Number(k)] ?? '')
  if (!sameShape(parsed, parse(rewritten), fill)) return null
  // The rewrite may turn `eval "$X"` into a literal script; that script, and every other one, must not assign a written-in
  // variable again, and no `source`, `.` or `eval` of an expansion may remain to do so unseen.
  const after = rescan(rewritten)
  if (!after) return null
  const names = new Set(sites.map(s => s.name))
  for (const c of after) {
    for (const v of viewsOf(c.argv)) {
      const name = baseName(v[0] ?? null)
      if (name === 'source' || name === '.' || (name === 'eval' && v.includes(null))) return null
    }
    const assigned = [
      ...c.assigns.map(a => a.name?.replace(/\[.*$/, '')),
      ...(DECLARERS.has(baseName(c.argv[0] ?? null)) ? c.text.slice(1).map(t => /^([A-Za-z_]\w*)/.exec(t)?.[1]) : []),
    ]
    if (assigned.some(n => n !== undefined && names.has(n)) && (c.depth > 0 || c.nesting > 0)) return null
  }
  const vanishes = sites.map(s => s.start >= vars.get(s.name)!.unset)
  if (!vanishes.includes(true)) return { text: rewritten, empty: null }
  // A site that is a whole command leaves `:`, so the text still parses.
  const alone = new Set(parsed.commands.filter(c => c.argv.length === 1).map(c => c.argv[0]))
  return { text: rewritten, empty: splice(command, sites, k => (!vanishes[k] ? values[k]! : alone.has(marker(k)) ? ':' : '')) }
}
