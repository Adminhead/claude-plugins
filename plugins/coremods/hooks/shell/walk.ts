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
  // `NAME=value` prefixes. The name carries its subscript (`a[1]`), and is null when the
  // subscript holds an expansion. The value is null when it holds an expansion.
  assigns: { name: string | null; value: string | null }[]
  // The command's own redirects, then those of every compound command around it.
  redirects: ShellRedirect[]
  heredocs: ShellHeredoc[]
  // Set when the command sits in a pipeline stage (including inside a subshell or group in it).
  // `earlier` holds every command emitted by the stages before it.
  pipeline: { stage: number; readonly earlier: ShellCommand[] } | null
  // 0 for the parsed text, +1 per `reparse` level.
  depth: number
}

export type ShellParse = { commands: ShellCommand[]; errors: ParseError[] }

type Ctx = {
  pipeline: ShellCommand['pipeline']
  redirects: ShellRedirect[]
  heredocs: ShellHeredoc[]
}

type Node = { type: string; [key: string]: unknown }

const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null && typeof (v as Node).type === 'string'

// unbash 5.0.0 builds these node fields on first read, so `Object.keys` doesn't list them.
const LAZY_FIELDS = ['parts', 'elements', 'value', 'initialize', 'test', 'update', 'expression', 'index']

const isHome = (p: Node): boolean =>
  p.type === 'SimpleExpansion'
    ? p.text === '$HOME'
    : p.type === 'ParameterExpansion' && p.parameter === 'HOME' && !p.operation && !p.prefix && !p.index

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
      redirects.push({ op: r.operator, fd: fdOf(r), target: literal(r.target) })
    }
  }
  return { redirects, heredocs }
}

function parseAt(text: string, depth: number): ShellParse {
  const commands: ShellCommand[] = []
  const errors: ParseError[] = []

  const emit = (c: Command, ctx: Ctx) => {
    const own = convert(c.redirects)
    const argv: (string | null)[] = []
    if (c.name) argv.push(literal(c.name))
    for (const a of c.args) {
      if (a.type === 'Word') argv.push(literal(a))
      else {
        const n = assignName(a)
        const v = a.value.type === 'Word' ? literal(a.value) : null
        argv.push(n === null || v === null ? null : `${n}${a.append ? '+' : ''}=${v}`)
      }
    }
    commands.push({
      argv,
      assigns: c.prefix.flatMap(p =>
        p.type === 'Assignment' ? [{ name: assignName(p), value: p.value.type === 'Word' ? literal(p.value) : null }] : [],
      ),
      redirects: [...own.redirects, ...ctx.redirects],
      heredocs: [...own.heredocs, ...ctx.heredocs],
      pipeline: ctx.pipeline,
      depth,
    })
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
    }
    switch (node.type) {
      case 'Script':
        // A substitution runs apart from the redirects and pipeline around it.
        if (node.errors) errors.push(...(node.errors as ParseError[]))
        visit(node.commands, { pipeline: null, redirects: [], heredocs: [] })
        return
      case 'Command': {
        const c = node as unknown as Command
        emit(c, ctx)
        visit(c.prefix, ctx)
        visit(c.name, ctx)
        visit(c.suffix, ctx)
        return
      }
      case 'Pipeline': {
        // A pipeline inside a stage of an outer one still has the outer stage's predecessors upstream.
        const outer = ctx.pipeline
        const members: ShellCommand[] = []
        for (const [stage, c] of (node.commands as unknown[]).entries()) {
          const count = members.length
          const start = commands.length
          visit(c, {
            ...ctx,
            pipeline: {
              stage,
              get earlier() {
                return [...(outer?.earlier ?? []), ...members.slice(0, count)]
              },
            },
          })
          members.push(...commands.slice(start))
        }
        return
      }
      case 'Redirected': {
        const r = convert(node.redirects as Redirection[])
        visit(node.redirects, ctx)
        visit(node.command, {
          ...ctx,
          redirects: [...r.redirects, ...ctx.redirects],
          heredocs: [...r.heredocs, ...ctx.heredocs],
        })
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
    visit(unbash(text), { pipeline: null, redirects: [], heredocs: [] })
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

const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash'])

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
