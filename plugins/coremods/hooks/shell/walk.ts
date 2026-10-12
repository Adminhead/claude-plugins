// Shell AST walker over the vendored unbash parser. It turns a script into a flat list of
// simple commands and carries no policy: wrapper tables and rules belong to the consumers.
// It must not use `$`, so the same file can run under bun and in other hook hosts.

import { parse as unbash } from '../vendor/unbash.js'
import type { Command, ParseError, Redirection, Word } from '../vendor/unbash.js'

// Same cap as readonly-bash's MAX_DEPTH.
export const MAX_DEPTH = 8

export type ShellRedirect = {
  op: string
  // A descriptor number, a `{name}` variable name, or null when unwritten.
  fd: number | string | null
  // The literal target, or null when it holds an expansion.
  target: string | null
  // The target read like `ShellCommand.text` ('' when there is none).
  text: string
}

export type ShellHeredoc = { op: '<<' | '<<-'; fd: number | string | null; body: string; quoted: boolean }

export type ShellCommand = {
  // Each word's literal value, or null when it holds an expansion.
  // - `$HOME` and `${HOME}` resolve to `~` when they are the whole word or come before a `/`
  //   (`"$HOME"x` is null). A quoted or escaped `~` is a file name, not home, so it reads `./~`.
  // - `~user` stays as written. Glob characters (* ? [) stay as written too: a consumer that
  //   cares must treat them itself.
  // - An ANSI-C string ends at its first NUL, as in bash.
  argv: (string | null)[]
  // Each word parallel to `argv` with its quotes removed and its escapes and ANSI-C strings decoded,
  // but every expansion kept as written: `--out="$f"` reads `--out=$f`, `$'-i'$x` reads `-i$x`.
  // A consumer that needs the literal parts of an expanded word reads them here.
  text: string[]
  // Whether a word or assignment of the command itself (not its substitutions) holds a `$"…"`
  // string, which bash reads as `…` and zsh as `$…`.
  locale: boolean
  // `NAME=value` prefixes. The name carries its subscript (`a[1]`), and is null when the
  // subscript holds an expansion. The value is null when it holds an expansion. `append` marks `+=`.
  assigns: { name: string | null; value: string | null; append: boolean }[]
  // The command's own redirects, then those of every compound command around it. A compound
  // command with no simple command under its redirects (`(( x )) > f`, `[[ -n $(y) ]] > f`, whose
  // substitution runs apart from them) yields one command with empty `argv` and `text` that carries
  // them, as a bare `> f` does. Commands under one compound share its arrays: treat them as read-only,
  // and compare redirect objects by identity to check each once.
  redirects: ShellRedirect[]
  heredocs: ShellHeredoc[]
  // Set when the command sits in a pipeline stage (including inside a subshell or group in it).
  // `earlier` holds every command emitted by the stages before it (rebuilt on each read, so O(n)).
  // `prev` holds the commands emitted by the previous stage, substitution commands (pipeline null) included.
  pipeline: { stage: number; readonly prev: readonly ShellCommand[]; readonly earlier: ShellCommand[] } | null
  // How many command or process substitutions (`$(…)`, backticks, `<(…)`) enclose the command, 0 outside any.
  nesting: number
  // 0 for the parsed text, +1 per `reparse` level.
  depth: number
  // The commands emitted inside this command's own words and redirects (`$(...)`, backticks, `<(...)`), nested ones included.
  subs: ShellCommand[]
}

export type ShellParse = { commands: ShellCommand[]; errors: ParseError[] }

type Ctx = {
  pipeline: ShellCommand['pipeline']
  redirects: ShellRedirect[]
  heredocs: ShellHeredoc[]
  nesting: number
  // One flag per enclosing redirected compound, set when a command under it carries its redirects.
  carriers: { hit: boolean }[]
}

type Node = { type: string; [key: string]: unknown }

const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null && typeof (v as Node).type === 'string'

// unbash 5.0.0 builds these node fields on first read, so `Object.keys` doesn't list them.
const LAZY_FIELDS = ['parts', 'elements', 'value', 'initialize', 'test', 'update', 'expression', 'index']

// Operations that leave HOME as it was or strip some of its tail: `${HOME:?}`, `${HOME:-x}`, `${HOME%/}`. They read as home.
const HOME_OPS = new Set(['?', ':?', '-', ':-', '=', ':=', '%', '%%'])

const isHome = (p: Node): boolean =>
  p.type === 'SimpleExpansion'
    ? p.text === '$HOME'
    : p.type === 'ParameterExpansion' &&
      p.parameter === 'HOME' &&
      (!p.operation || HOME_OPS.has((p.operation as { operator: string }).operator)) &&
      !p.prefix &&
      !p.index

// Stands for a leading $HOME until the whole word is known.
const HOME = '\u0000'

// A part's literal text, or null when it expands to something unknown. `first` marks the start
// of the word, the only place `$HOME` can stand for `~`. `bare` is false inside double quotes.
// A quoted or escaped `~` at the start becomes `./~`, the same file, so it never reads as home.
function partText(p: Node, first: boolean, bare = true): string | null {
  switch (p.type) {
    case 'Literal': {
      const v = p.value as string
      return first && v[0] === '~' && !(bare && (p.text as string)[0] === '~') ? `./${v}` : v
    }
    case 'SingleQuoted':
    case 'AnsiCQuoted': {
      // bash ends an ANSI-C string at the first NUL.
      const v = (p.value as string).split('\u0000')[0]
      return first && v[0] === '~' ? `./${v}` : v
    }
    case 'SimpleExpansion':
    case 'ParameterExpansion':
      return first && isHome(p) ? HOME : null
    case 'DoubleQuoted': {
      let s = ''
      for (const [i, c] of (p.parts as Node[]).entries()) {
        const t = partText(c, first && i === 0, false)
        if (t === null) return null
        s += t
      }
      return s
    }
    default:
      return null
  }
}

// A part as a tokenizer that keeps expansions as written reads it: quotes removed, escapes and ANSI-C
// strings decoded, `$"…"` read as bash reads it (zsh keeps the `$`), and each expansion (`$x`, `$(…)`,
// `{a,b}`) kept as its source text.
function partSource(p: Node): string {
  switch (p.type) {
    case 'Literal':
    case 'SingleQuoted':
      return p.value as string
    case 'AnsiCQuoted':
      return (p.value as string).split('\u0000')[0]
    case 'DoubleQuoted':
    case 'LocaleString':
      return (p.parts as Node[]).map(partSource).join('')
    default:
      return p.text as string
  }
}

const source = (w: Word | undefined): string =>
  !w ? '' : w.parts ? w.parts.map(p => partSource(p as unknown as Node)).join('') : w.value

// Whether a word holds a `$"…"` string outside its substitutions.
const hasLocale = (w: Word | undefined): boolean => !!w?.parts?.some(p => p.type === 'LocaleString')

function literal(w: Word | undefined): string | null {
  if (!w) return null
  let s = ''
  if (!w.parts) s = w.value[0] === '~' && w.text[0] !== '~' ? `./${w.value}` : w.value
  else {
    for (const [i, p] of w.parts.entries()) {
      const t = partText(p as unknown as Node, i === 0)
      if (t === null) return null
      s += t
    }
  }
  // $HOME is `~` only as the whole word or before a `/`; `"$HOME"x` is some other path.
  if (!s.startsWith(HOME)) return s
  const rest = s.slice(1)
  return rest === '' || rest[0] === '/' ? `~${rest}` : null
}

// An assignment's name with its subscript, or null when the subscript holds an expansion.
function assignName(a: { name: string; index: Word | undefined }): string | null {
  if (!a.index) return a.name
  const i = literal(a.index)
  return i === null ? null : `${a.name}[${i}]`
}

// What bash leaves literal in a word without parts but something else would expand: an unescaped
// backtick, `$(`, `${`, or a zsh modifier such as `$=name`. A lone `$` (`^a$|^b$`, `$/`) is literal.
const hasExpansion = (text: string): boolean => /(?:^|[^\\])(?:\\\\)*(?:`|\$[({]|\$[=~^+][A-Za-z_{(])/.test(text)

const fdOf = (r: Redirection): number | string | null =>
  r.descriptor ? (r.descriptor.type === 'FileDescriptor' ? r.descriptor.value : r.descriptor.name) : null

// Splits redirections into plain redirects and heredocs.
function convert(rs: readonly Redirection[]): { redirects: ShellRedirect[]; heredocs: ShellHeredoc[] } {
  const redirects: ShellRedirect[] = []
  const heredocs: ShellHeredoc[] = []
  for (const r of rs) {
    if (r.type === 'HereDoc') {
      heredocs.push({ op: r.operator, fd: fdOf(r), body: r.body.text, quoted: r.delimiter?.quoted ?? false })
    } else {
      redirects.push({ op: r.operator, fd: fdOf(r), target: literal(r.target), text: source(r.target) })
    }
  }
  return { redirects, heredocs }
}

function parseAt(text: string, depth: number): ShellParse {
  const commands: ShellCommand[] = []
  const errors: ParseError[] = []

  const emit = (c: Command, ctx: Ctx): ShellCommand => {
    for (const m of ctx.carriers) m.hit = true
    const own = convert(c.redirects)
    const argv: (string | null)[] = []
    const text: string[] = []
    if (c.name) {
      argv.push(literal(c.name))
      text.push(source(c.name))
    }
    for (const a of c.args) {
      if (a.type === 'Word') {
        argv.push(literal(a))
        text.push(source(a))
      } else {
        const n = assignName(a)
        const v = a.value.type === 'Word' ? literal(a.value) : null
        argv.push(n === null || v === null ? null : `${n}${a.append ? '+' : ''}=${v}`)
        const value = a.value.type === 'Word' ? source(a.value) : `(${a.value.elements.map(source).join(' ')})`
        text.push(`${a.name}${a.index ? `[${source(a.index)}]` : ''}${a.append ? '+' : ''}=${value}`)
      }
    }
    const words = [c.name, ...c.args, ...c.prefix].flatMap(a =>
      !a ? [] : a.type === 'Word' ? [a] : a.type === 'Assignment' ? (a.value.type === 'Word' ? [a.value] : [...a.value.elements]) : [])
    const emitted: ShellCommand = {
      argv,
      text,
      locale: words.some(hasLocale),
      assigns: c.prefix.flatMap(p =>
        p.type === 'Assignment'
          ? [{ name: assignName(p), value: p.value.type === 'Word' ? literal(p.value) : null, append: p.append ?? false }]
          : [],
      ),
      redirects: own.redirects.length ? [...own.redirects, ...ctx.redirects] : ctx.redirects,
      heredocs: own.heredocs.length ? [...own.heredocs, ...ctx.heredocs] : ctx.heredocs,
      pipeline: ctx.pipeline,
      nesting: ctx.nesting,
      depth,
      subs: [],
    }
    commands.push(emitted)
    return emitted
  }

  const visit = (node: unknown, ctx: Ctx): void => {
    if (Array.isArray(node)) {
      for (const n of node) visit(n, ctx)
      return
    }
    if (!isNode(node)) return
    // unbash drops the errors of a word it fails to expand (very deep quoting), leaving a Word
    // without parts or a substitution without a script. Report both rather than read them as literal.
    if (node.type === 'Word' && !(node as unknown as Word).parts && hasExpansion((node as unknown as Word).text)) {
      errors.push({ message: 'unsupported or zsh-only expansion in word; rewrite in plain bash', pos: node.pos as number })
    } else if (
      (node.type === 'CommandExpansion' || node.type === 'ProcessSubstitution' || node.type === 'ArithmeticCommandExpansion') &&
      !node.script
    ) {
      errors.push({ message: 'unsupported substitution (nested too deep?); rewrite in plain bash or use a script file', pos: node.pos as number })
    } else if (
      node.type === 'ParameterExpansion' &&
      (node.operation as { type?: string } | undefined)?.type === 'Replace' &&
      /\$\(|`|[<>]\(/.test(node.text as string)
    ) {
      // unbash splits `${x/pattern/repl}` at the first `/` without regard to nesting, so a substitution
      // in it would be walked as the wrong command.
      errors.push({ message: 'substitution inside ${var/pattern/replacement}; rewrite in plain bash', pos: node.pos as number })
    }
    switch (node.type) {
      case 'Script':
        // A substitution runs apart from the redirects and pipeline around it. The top-level script
        // enters at nesting -1, so its commands sit at 0.
        if (node.errors) errors.push(...(node.errors as ParseError[]))
        visit(node.commands, { pipeline: null, redirects: [], heredocs: [], nesting: ctx.nesting + 1, carriers: [] })
        return
      case 'Command': {
        const c = node as unknown as Command
        const emitted = emit(c, ctx)
        const from = commands.length
        visit(c.prefix, ctx)
        visit(c.name, ctx)
        visit(c.suffix, ctx)
        emitted.subs = commands.slice(from)
        return
      }
      case 'Pipeline': {
        // A pipeline inside a stage of an outer one still has the outer stage's predecessors upstream.
        const outer = ctx.pipeline
        const members: ShellCommand[] = []
        let last: ShellCommand[] = []
        for (const [stage, c] of (node.commands as unknown[]).entries()) {
          const count = members.length
          const start = commands.length
          visit(c, {
            ...ctx,
            pipeline: {
              stage,
              prev: stage === 0 ? (outer?.prev ?? []) : last,
              get earlier() {
                return [...(outer?.earlier ?? []), ...members.slice(0, count)]
              },
            },
          })
          last = commands.slice(start)
          members.push(...last)
        }
        return
      }
      case 'Redirected': {
        const r = convert(node.redirects as Redirection[])
        visit(node.redirects, ctx)
        const carried = { hit: false }
        const inner: Ctx = {
          ...ctx,
          redirects: r.redirects.length ? [...r.redirects, ...ctx.redirects] : ctx.redirects,
          heredocs: r.heredocs.length ? [...r.heredocs, ...ctx.heredocs] : ctx.heredocs,
          carriers: [...ctx.carriers, carried],
        }
        visit(node.command, inner)
        // `(( x )) > f` and `[[ -n $(y) ]] > f` hold no simple command under the redirect (a substitution's
        // commands don't carry it), so its redirects would otherwise vanish.
        if (!carried.hit) {
          for (const m of ctx.carriers) m.hit = true
          commands.push({
            argv: [], text: [], locale: false, assigns: [], redirects: inner.redirects, heredocs: inner.heredocs,
            pipeline: ctx.pipeline, nesting: ctx.nesting, depth, subs: [],
          })
        }
        return
      }
      default: {
        const own = Object.keys(node)
        for (const k of own) visit(node[k], ctx)
        for (const k of LAZY_FIELDS) if (!own.includes(k)) visit(node[k], ctx)
      }
    }
  }

  try {
    visit(unbash(text), { pipeline: null, redirects: [], heredocs: [], nesting: -1, carriers: [] })
  } catch (err) {
    // unbash's arithmetic parser (and this walk) recurse without a limit. Match on the name, since a realm may differ.
    if ((err as Error)?.name !== 'RangeError') throw err
    errors.push({ message: 'input nested too deep; rewrite in plain bash or use a script file', pos: 0 })
  }
  return { commands, errors }
}

export const parse = (text: string): ShellParse => parseAt(text, 0)

// Parses a nested script at the depth the caller passes, which is the outer command's depth + 1.
// Past MAX_DEPTH it yields an error and no commands.
export function reparse(text: string, depth: number): ShellParse {
  if (depth > MAX_DEPTH) return { commands: [], errors: [{ message: `shell scripts nested deeper than ${MAX_DEPTH}`, pos: 0 }] }
  return parseAt(text, depth)
}

const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh'])

// The script text of `sh|bash|zsh|dash -c STR` (a bare name or a path; bundled flags such as
// `-lc` included) and of `eval` with all-literal arguments. Null for any other command, or when
// the script is not literal. A caller that wraps shells (sudo, env, ...) strips the wrapper first.
export function nestedScript(argv: readonly (string | null)[]): string | null {
  const name = argv[0]?.split('/').pop()
  if (name === 'eval') {
    const args = argv[1] === '--' ? argv.slice(2) : argv.slice(1)
    return args.length > 0 && args.every(a => a !== null) ? args.join(' ') : null
  }
  if (!name || !SHELLS.has(name)) return null
  // The script is the first word after the options, and `-c` may sit anywhere among them.
  let sawC = false
  let i = 1
  for (; i < argv.length; i++) {
    const a = argv[i]
    if (a === null) return null
    if (a === '--') {
      i++
      break
    }
    if (!/^[-+]./.test(a)) break
    if (a.startsWith('--')) {
      if (a === '--rcfile' || a === '--init-file') i++
      continue
    }
    for (const ch of a.slice(1)) {
      if (ch === 'c' && a[0] === '-') sawC = true
      else if (ch === 'o' || ch === 'O') i++
    }
  }
  return sawC ? (argv[i] ?? null) : null
}
