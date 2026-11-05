// Settled variables for bash-rules. Nothing here touches `$`.
// expandLiteralVars (expand.ts) writes in what a flat script settles, and the danger rules always read that. This pass
// goes further for the hygiene check: a plain value or an exact tool lookup assigned at a script's top level holds in the
// loops, branches and functions after it, so `$X` there is that value. Each write-in is a claim that the rules see what
// will run, so everything here says no by default. It reads the top-level script only, makes one pass, and decides from the
// AST and parsed words. Reach is worked out again on the rewritten text, at every depth, because a write-in can reveal a
// command the text did not show (`D=declare; $D IFS=,`). When anything is unclear it returns null, and an assigned variable
// left in a command word is denied (hygiene.ts).

import { baseName, invocation, isWrapper, stdinReader, viewsOf } from './danger'
import { BINDERS, DECLARERS, MARK, MARKER, MARKER_WORD, SPECIAL, lex, marker, quietRedirects, sameShape, splice } from './expand'
import type { Site } from './expand'
import { parse } from '../shell/walk'
import type { ShellCommand } from '../shell/walk'
import { parse as unbash } from '../vendor/unbash.js'
import type { ArrayValue, Word } from '../vendor/unbash.js'

// What `settle` reads a text with: its commands and the text of each script it hands over, or null when it cannot.
export type Read = (text: string) => { commands: readonly ShellCommand[]; scripts: readonly string[] } | null

// ---------------------------------------------------------------------------------------------------------------
// What a command can change

type Node = { type: string; [key: string]: unknown }
const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null && typeof (v as Node).type === 'string'
// unbash builds these fields on first read, so `Object.keys` does not list them.
const LAZY_FIELDS = ['parts', 'elements', 'value', 'initialize', 'test', 'update', 'expression', 'index']

function visit(v: unknown, f: (n: Node) => void): void {
  if (Array.isArray(v)) {
    for (const x of v) visit(x, f)
  } else if (isNode(v)) {
    f(v)
    const own = Object.keys(v)
    for (const k of own) visit(v[k], f)
    for (const k of LAZY_FIELDS) if (!own.includes(k)) visit(v[k], f)
  }
}

const IDENT = /[A-Za-z_]\w*/g
const wordValue = (w: unknown) => (isNode(w) && typeof w.value === 'string' ? w.value : '')

// The parser's view of one script: where each name is assigned, every other name it can bind, the names a bare assignment
// sets for what follows (`NAME=x cmd` sets NAME only for cmd), the functions it defines, and whether it reads a variable
// named by another (`${!N:=x}`).
type Facts = { assigns: Map<string, number[]>; bound: Set<string>; sets: Set<string>; functions: Set<string>; indirect: boolean }

function factsOf(script: string): Facts {
  const out: Facts = { assigns: new Map(), bound: new Set(), sets: new Set(), functions: new Set(), indirect: false }
  visit(unbash(script), n => {
    if (n.type === 'Assignment') {
      const name = n.name as string
      const at = out.assigns.get(name)
      if (at) at.push(n.pos as number)
      else out.assigns.set(name, [n.pos as number])
      out.bound.add(name)
    } else if (n.type === 'Command' && n.name === undefined) {
      for (const a of n.prefix as Node[]) if (a.type === 'Assignment') out.sets.add(a.name as string)
    } else if (n.type === 'For' || n.type === 'Select' || n.type === 'Coproc') out.bound.add(wordValue(n.name))
    else if (n.type === 'Function') out.functions.add(wordValue(n.name))
    else if (n.type === 'FileDescriptorVariable') out.bound.add(n.name as string)
    else if (n.type === 'ParameterExpansion') {
      if (n.prefix === '!') out.indirect = true
      const op = (n.operation as { operator?: string } | undefined)?.operator
      if (op === '=' || op === ':=') out.bound.add(n.parameter as string)
    } else if (n.type.startsWith('Arithmetic') && typeof n.text === 'string') {
      for (const m of n.text.matchAll(IDENT)) out.bound.add(m[0])
    }
  })
  return out
}

// Programs that can change what a later word means in ways no parse shows. Any of these seals the command.
const SEALS = new Set(['source', '.', 'trap', 'alias', 'unalias', 'hash', 'enable', 'shopt'])
const LOOKUP_TOOLS = ['which', 'command', 'mise', 'cd']

// `sealed`: nothing may be written in. `bound`: names the shell can set, from the AST and from binder commands' words.
// `nested`: those set in a handed script. `sets`: those that stay set for later commands. `functions`: functions defined.
// `blind`: a command runs whose name is an expansion.
type Reach = { sealed: boolean; bound: Set<string>; nested: Set<string>; sets: Set<string>; functions: Set<string>; blind: boolean }

// Whether a lookup's own program, or what it prints, can change: a function of its name, another PATH finding a local
// `which`, a CDPATH making `cd` print the directory too.
const lookupsMove = (r: Reach) => r.sets.has('PATH') || r.sets.has('CDPATH') || LOOKUP_TOOLS.some(t => r.functions.has(t))

// The names a binder's parsed word can set. An attached name (`printf -vX`, `read -raX`) counts, so each short tail does.
function namesIn(word: string, into: Set<string>) {
  for (const m of word.matchAll(/\w+/g)) {
    into.add(m[0])
    if (word[0] === '-') for (let k = 1; k < Math.min(m[0].length, 64); k++) into.add(m[0].slice(k))
  }
}

function reachOf(read: NonNullable<ReturnType<Read>>): Reach {
  const out: Reach = { sealed: false, bound: new Set(), nested: new Set(), sets: new Set(), functions: new Set(), blind: false }
  for (const [k, script] of read.scripts.entries()) {
    const f = factsOf(script)
    out.sealed ||= f.indirect
    for (const n of f.bound) (k === 0 ? out.bound : out.nested).add(n)
    for (const n of f.sets) out.sets.add(n)
    for (const n of f.functions) out.functions.add(n)
  }
  for (const n of out.nested) out.bound.add(n)
  for (const c of read.commands) {
    for (const v of viewsOf(c.argv)) {
      const name = baseName(v[0] ?? null)
      if (v[0] === null) out.blind = true
      if (SEALS.has(name) || (name === 'eval' && v.includes(null))) out.sealed = true
      if (name === 'env') for (const t of c.text) namesIn(t, out.bound)
      if (!DECLARERS.has(name) && !BINDERS.has(name)) continue
      const opts = c.text.slice(1).filter(t => /^-/.test(t))
      if (name === 'printf' && !opts.some(t => /^-[A-Za-z]*v/.test(t))) continue
      if (name === 'wait' && !opts.some(t => /^-[A-Za-z]*p/.test(t))) continue
      for (const t of c.text.slice(1)) {
        namesIn(t, out.bound)
        namesIn(t, out.sets)
      }
      // A name given by an expansion, or a nameref, can set any name. `export A=$B` names A.
      const named = (k: number) => DECLARERS.has(name) && /^[A-Za-z_]\w*\+?=/.test(c.text[k] ?? '')
      if (c.argv.some((a, k) => a === null && !named(k))) out.sealed = true
      if (DECLARERS.has(name) && opts.some(t => /^-[A-Za-z]*n/.test(t))) out.sealed = true
    }
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// Which variables settle

// Plain words, with `~` (or `$HOME`, which the walker reads as `~`) only at the start.
const LITERAL_VALUE = /^(?:~(?:\/[\w./=:@,+%-]*)?|[\w./=:@,+%-]+)(?: [\w./=:@,+%-]+)*$/
const TOOL_NAME = /^[A-Za-z0-9_][\w.+-]*$/

// `unset` is where the variable may start to hold nothing: anywhere for a lookup, which may come back empty, and past its
// list for an assignment after `&&` or `||`, which may not run. Infinity when the value always holds.
type Value = { text: string; finder: boolean; home: boolean; unset: number; from: number }

type Top = { from: number; to: number; until: number }

function soleSubstitution(value: Word | ArrayValue): boolean {
  const parts = value.type === 'Word' ? (value.parts ?? []) : []
  const only = parts.length === 1 ? parts[0]! : null
  const inner = only?.type === 'DoubleQuoted' && only.parts.length === 1 ? only.parts[0]! : only
  return inner?.type === 'CommandExpansion'
}

// The assignment-only commands at a script's top level, in order, each with `until`, where what it assigns stops being
// certain. A statement, or the first of a `&&` or `||` list, runs whenever the script gets that far. The rest of a list may
// not run: the end of an all-`&&` list, since what follows in it runs only after them, else their own end. Whatever sits in
// a compound or a function, in a pipeline or in the background is left out. `sole` holds where each assignment whose value
// is one command substitution starts.
function topLevel(script: string): { tops: Top[]; sole: Set<number> } {
  const out = { tops: [] as Top[], sole: new Set<number>() }
  for (const st of unbash(script).commands) {
    if (st.background) continue
    const cmd = st.command
    const list = cmd.type === 'AndOr' ? cmd.commands : [cmd]
    const chained = cmd.type === 'AndOr' && cmd.operators.every(op => op === '&&')
    for (const [k, c] of list.entries()) {
      if (c.type !== 'Command' || c.name !== undefined || c.suffix.length > 0) continue
      out.tops.push({ from: c.pos, to: c.end, until: k === 0 ? Infinity : chained ? cmd.end : c.end })
      for (const a of c.prefix) if (a.type === 'Assignment' && soleSubstitution(a.value)) out.sole.add(a.pos)
    }
  }
  return out
}

const topAt = (tops: readonly Top[], at: number) => {
  let lo = 0
  let hi = tops.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const t = tops[mid]!
    if (at < t.from) hi = mid - 1
    else if (at >= t.to) lo = mid + 1
    else return t
  }
  return null
}

// The tool `which X`, `command -v X` or `mise which X` (with `--cd DIR` or `-C DIR`) prints the path of, by bare name.
function toolOf(c: ShellCommand): string | null {
  if (c.assigns.length > 0 || c.pipeline !== null || !quietRedirects(c)) return null
  const a = c.argv
  const name = (w: string | null | undefined) => (typeof w === 'string' && TOOL_NAME.test(w) ? w : null)
  if (a[0] === 'which') return a.length === 2 ? name(a[1]) : null
  if (a[0] === 'command') return a.length === 3 && a[1] === '-v' ? name(a[2]) : null
  if (a[0] !== 'mise') return null
  const rest: (string | null)[] = []
  for (let i = 1; i < a.length; i++) {
    if (a[i] === '--cd' || a[i] === '-C') i++
    else rest.push(a[i]!)
  }
  return rest.length === 2 && rest[0] === 'which' ? name(rest[1]) : null
}

// The tool an assignment's one substitution looks up, also as `cd DIR && mise which X`. Nothing may be nested in it.
function lookedUp(c: ShellCommand): string | null {
  if (c.subs.some(s => s.nesting !== c.nesting + 1)) return null
  if (c.subs.length === 1) return toolOf(c.subs[0]!)
  const [cd, mise] = c.subs
  if (c.subs.length !== 2 || cd!.argv[0] !== 'cd' || cd!.argv.length !== 2 || cd!.pipeline !== null || cd!.assigns.length > 0 || !quietRedirects(cd!)) return null
  return mise!.argv[0] === 'mise' ? toolOf(mise!) : null
}

function settledVars(script: string, commands: readonly ShellCommand[], lx: NonNullable<ReturnType<typeof lex>>, r: Reach): Map<string, Value> {
  const out = new Map<string, Value>()
  const binds = new Map<string, { value: string | null; c: ShellCommand }[]>()
  for (const c of commands) {
    if (c.depth > 0 || c.nesting > 0 || c.pipeline !== null || c.argv.length > 0) continue
    for (const a of c.assigns) {
      if (a.name === null) continue
      const list = binds.get(a.name)
      if (list) list.push({ value: a.value, c })
      else binds.set(a.name, [{ value: a.value, c }])
    }
  }
  const { tops, sole } = topLevel(script)
  const { assigns } = factsOf(script)
  // The lexer reads an assignment in `((X=1))` too, which the AST holds as arithmetic.
  const lexed = new Map<string, number>()
  for (const a of lx.assigns) lexed.set(a.name, (lexed.get(a.name) ?? 0) + 1)
  const lookups = !lookupsMove(r)
  const home = !r.bound.has('HOME')
  for (const [name, list] of binds) {
    if (lx.named.has(name) || SPECIAL.has(name) || r.nested.has(name)) continue
    const at = assigns.get(name) ?? []
    const where = at.map(p => topAt(tops, p))
    if (at.length !== list.length || lexed.get(name) !== list.length || where.includes(null)) continue
    const unset = Math.min(...where.map(t => t!.until))
    const from = Math.min(...where.map(t => t!.to))
    const values = list.map((b, k): Value | null => {
      if (b.value !== null) {
        if (!LITERAL_VALUE.test(b.value) || /^[-+]/.test(b.value) || (b.value[0] === '~' && !home)) return null
        return { text: b.value.replace(/^~/, '$HOME'), finder: false, home: b.value[0] === '~', unset, from }
      }
      if (!lookups || !sole.has(at[k]!)) return null
      const tool = lookedUp(b.c)
      return tool === null ? null : { text: tool, finder: true, home: false, unset: 0, from }
    })
    const first = values[0]
    if (first && values.every(v => v !== null && v.text === first.text && v.finder === first.finder)) out.set(name, first)
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// The rewrite

// What a rewrite leaves: `text` has each value written in, and `empty`, when a variable may hold nothing, has it vanish
// instead. Either can be what bash runs, so the caller checks both.
export type Written = { text: string; empty: string | null }

// Programs that run code from their arguments in ways `invocation` does not read.
const RUNS_ARGUMENTS =
  /^(?:[gmn]?awk|g?sed|lua(?:jit)?|fish|tclsh|expect|osascript|R|Rscript|julia|pwsh|busybox|toybox|vim?|nvim|deno|bun|php|ruby|perl|script|su|runuser|doas|pkexec|ssh|docker|podman|strace|ltrace|gdb|nsenter|chroot|unshare|\.|source|trap|eval)$/

// Whether these words run a program the rules cannot see: the program they finally reach, past any wrappers, gets an
// expansion among its options or where its script goes, on a pipe, in a redirect, or for a wrapper to run
// (`bash -c "$payload"`, `echo "$p" | bash`, `timeout 5 "$p"`). That is a hidden script whoever found the program. A script
// file run by name (`python3 script.py "$arg"`) and a quoted heredoc are not.
function runsExpansion(words: readonly (string | null)[], c: ShellCommand): boolean {
  const views = viewsOf(words)
  const w = views[views.length - 1] ?? words
  const tool = baseName(w[0] ?? null)
  const dynamicInput = c.redirects.some(r => (r.op === '<' || r.op === '<<<') && r.target === null) || c.heredocs.some(h => !h.quoted)
  if ((isWrapper(tool) || RUNS_ARGUMENTS.test(tool)) && (w.includes(null) || dynamicInput)) return true
  const inv = invocation(w)
  if (!inv) return false
  return dynamicInput || w.slice(1, inv.ops + 1).includes(null) || (stdinReader(w) !== null && (c.pipeline?.stage ?? 0) > 0)
}

const markers = (word: string | null | undefined) => [...(word ?? '').matchAll(MARKER)].map(m => Number(m[1]))

// The text with its settled variables written in, or null when none can be. A literal is written in at every use after the
// command that assigns it, a lookup only where it is the program a command runs. An unquoted variable that may hold nothing
// vanishes, and its arguments run. `empty` shows that, but it shows all of what can run only when what follows is known, so
// the variable is written in only when: the next word is an option of a command it heads, which no program answers to,
// or every word after it is known. A lookup of a wrapper is never written in, nor a value inside an interpreter's inline
// program, which the rules do not read as code.
export function settle(text: string, read: Read, max: number): Written | null {
  if (text.includes(MARK)) return null
  const before = read(text)
  if (!before) return null
  const r = reachOf(before)
  if (r.sealed || r.bound.has('IFS')) return null
  const lx = lex(text)
  if (!lx || lx.assigns.length === 0) return null
  const vars = settledVars(text, before.commands, lx, r)
  if (vars.size === 0) return null
  const all = lx.sites.filter(s => vars.has(s.name) && s.start >= vars.get(s.name)!.from)
  if (all.length === 0) return null
  const value = (s: Site) => vars.get(s.name)!
  const mayVanish = (s: Site) => s.start >= value(s).unset
  const unknown = (w: string | null) => w === null || markers(w).some(k => value(all[k]!).finder || mayVanish(all[k]!))
  const probe = parse(splice(text, all, marker))
  const runs = new Set<Site>()
  const stuck = new Set<string>()
  for (const c of probe.commands) {
    for (const [i, v] of viewsOf(c.argv).entries()) {
      // A value inside an interpreter's program, inline or on stdin, is code the rules do not read as code.
      const inv = invocation(v)
      if (inv && !inv.shell && inv.code >= 0) for (const k of markers(v[inv.code])) stuck.add(all[k]!.name)
      if (stdinReader(v) === 'script') {
        const fed = [...c.redirects.filter(r => r.op === '<<<').map(r => r.text), ...c.heredocs.map(h => h.body)]
        for (const k of fed.flatMap(markers)) stuck.add(all[k]!.name)
      }
      const k = MARKER_WORD.exec(v[0] ?? '')
      const site = k ? all[Number(k[1])] : undefined
      if (!site) continue
      runs.add(site)
      const rest = v.slice(1)
      const next = rest[0]
      if (mayVanish(site) && !site.quoted && next !== undefined) {
        const option = i === 0 && next !== null && next[0] === '-'
        if (unknown(next) || (!option && rest.some(unknown))) stuck.add(site.name)
        if (next !== null && runsExpansion(rest, c)) stuck.add(site.name)
      }
      if (value(site).finder && isWrapper(value(site).text)) stuck.add(site.name)
      if (runsExpansion([...value(site).text.split(' '), ...rest], c)) stuck.add(site.name)
    }
  }
  const sites = all.filter(s => !stuck.has(s.name) && (!value(s).finder || runs.has(s)))
  if (sites.length === 0) return null
  const values = sites.map(s => value(s).text)
  // Bound the rewrite before parsing it: a long value used many times would otherwise build a huge text.
  let length = text.length
  for (const [k, s] of sites.entries()) length += values[k]!.length - (s.end - s.start)
  if (length > max) return null
  const rewritten = splice(text, sites, k => values[k]!)
  const fill = (t: string) => t.replace(MARKER, (_, k: string) => values[Number(k)] ?? '')
  if (!sameShape(parse(splice(text, sites, marker)), parse(rewritten), fill)) return null

  // What a write-in revealed, or a vanished word left behind. A literal can be a program (`D=declare`), and the arguments of
  // a word that vanishes are a command (`$Z source f`), so each text is asked the same questions again.
  const names = new Set(sites.map(s => s.name))
  const refused = (view: string) => {
    const got = read(view)
    if (!got) return true
    const a = reachOf(got)
    if (a.sealed || a.bound.has('IFS') || [...names].some(n => a.nested.has(n))) return true
    if (sites.some(s => value(s).finder) && (a.blind || lookupsMove(a))) return true
    if (sites.some(s => value(s).home) && a.bound.has('HOME')) return true
    // A binder that names a written variable shows up only once it is a command.
    return got.commands.some(c =>
      viewsOf(c.argv).some(v => {
        const name = baseName(v[0] ?? null)
        if (!DECLARERS.has(name) && !BINDERS.has(name)) return false
        const words = new Set<string>()
        for (const t of c.text.slice(1)) namesIn(t, words)
        return [...names].some(n => words.has(n))
      }),
    )
  }
  if (refused(rewritten)) return null

  if (!all.some(s => !stuck.has(s.name) && mayVanish(s))) return { text: rewritten, empty: null }
  // A site that is a whole command leaves `:`, so the text still parses.
  const alone = new Set(probe.commands.filter(c => c.argv.length === 1).map(c => c.argv[0]))
  const kept = new Map(sites.map((s, k) => [s, values[k]!]))
  const empty = splice(text, all, k => {
    const s = all[k]!
    if (!stuck.has(s.name) && mayVanish(s)) return alone.has(marker(k)) ? ':' : ''
    return kept.get(s) ?? text.slice(s.start, s.end)
  })
  return refused(empty) ? null : { text: rewritten, empty }
}
