// Shell AST walker over the vendored unbash parser. It turns a script into a flat list of
// simple commands and carries no policy: wrapper tables and rules belong to the consumers.
// It must not use `$`, so the same file can run under bun and in other hook hosts.

import { parse as unbash } from '../vendor/unbash.js'
import type { Command, ParseError, Redirection, Word, WordPart } from '../vendor/unbash.js'

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
  // Each word's literal value, or null when it holds an expansion. `$HOME` and `${HOME}` at the
  // start of a word resolve to `~`.
  argv: (string | null)[]
  // `NAME=value` prefixes, with null for a value that holds an expansion.
  assigns: { name: string; value: string | null }[]
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

const isHome =(p: WordPart | { type: string; [key: string]: unknown }): boolean =>
  p.type === 'SimpleExpansion'
    ? p.text === '$HOME'
    : p.type === 'ParameterExpansion' && p.parameter === 'HOME' && !p.operation && !p.prefix && !p.index

// A part's literal text, or null when it expands to something unknown. `first` marks the start
// of the word, the only place `$HOME` is the same as `~`.
function partText(p: WordPart | { type: string; [key: string]: unknown }, first: boolean): string | null {
  switch (p.type) {
    case 'Literal':
    case 'SingleQuoted':
    case 'AnsiCQuoted':
      return p.value as string
    case 'SimpleExpansion':
    case 'ParameterExpansion':
      return first && isHome(p) ? '~' : null
    case 'DoubleQuoted': {
      let s = ''
      for (const [i, c] of (p.parts as Node[]).entries()) {
        const t = partText(c, first && i === 0)
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
  if (!w.parts) return w.value
  let s = ''
  for (const [i, p] of w.parts.entries()) {
    const t = partText(p, i === 0)
    if (t === null) return null
    s += t
  }
  return s
}

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
        const v = a.value.type === 'Word' ? literal(a.value) : null
        argv.push(v === null ? null : `${a.name}${a.append ? '+' : ''}=${v}`)
      }
    }
    commands.push({
      argv,
      assigns: c.prefix.flatMap(p =>
        p.type === 'Assignment' ? [{ name: p.name, value: p.value.type === 'Word' ? literal(p.value) : null }] : [],
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
        const members: ShellCommand[] = []
        for (const [stage, c] of (node.commands as unknown[]).entries()) {
          const count = members.length
          const start = commands.length
          visit(c, { ...ctx, pipeline: { stage, get earlier() { return members.slice(0, count) } } })
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

  visit(unbash(text), { pipeline: null, redirects: [], heredocs: [] })
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
  if (name === 'eval') return argv.length > 1 && argv.slice(1).every(a => a !== null) ? argv.slice(1).join(' ') : null
  if (!name || !SHELLS.has(name)) return null
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === null || a === '--' || !/^[-+]/.test(a)) return null
    if (/^-[A-Za-z]*c/.test(a)) return argv[i + 1] ?? null
    if (a === '-o' || a === '+o') i++
  }
  return null
}
