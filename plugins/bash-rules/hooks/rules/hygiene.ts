// Tool-hygiene verdicts for bash-rules: Bash that reads files (Read, Grep, Glob do that), authors or edits files (Write,
// Edit do that), or hides a payload (encoded text or a variable run as a script). Each command gets `deny` (a clear hit),
// `pass` (no read, write or smuggle shape at all) or `unsure` (a shape the parser cannot settle, which the caller hands
// to a model). Like the danger rules these target model habits, not a determined adversary. Nothing here touches `$`.

import { baseName, dynamicProgram, invocation, stdinReader, viewsOf } from '../danger/danger'
import { fedBodies, prevStage } from '../danger/rules'
import type { ShellCommand } from '../shell/walk'

export type Category = 'read' | 'write' | 'smuggle'
export type Tool = 'Read' | 'Grep' | 'Glob' | 'Write' | 'Edit' | 'script'
export type Verdict =
  | { kind: 'deny'; category: Category; tool: Tool; message: string }
  | { kind: 'pass' }
  | { kind: 'unsure'; reasons: string[] }

type Argv = readonly (string | null)[]
type Finding = { category: Category; tool: Tool; what: string }

// What to use instead, per tool. Model verdicts reuse these (judge.ts).
export const INSTEAD: Record<Tool, string> = {
  Read: 'Use the Read tool instead (offset and limit for a line range).',
  Grep: 'Use the Grep tool instead (glob or type to pick files, -n and -A/-B/-C for context, output_mode for counts or file lists).',
  Glob: 'Use the Glob tool instead (a pattern such as "**/*.ts").',
  Write: 'Use the Write tool to create or overwrite the file.',
  Edit: 'Use the Edit tool instead (replace_all for every occurrence).',
  script: 'Write the script as plain text to a scratch file with the Write tool and run that, or use a built-in tool.',
}

const LEAD: Record<Tool, string> = {
  Read: 'reads a file through the shell',
  Grep: 'searches file contents through the shell',
  Glob: 'searches for files by name through the shell',
  Write: 'writes file content through the shell',
  Edit: 'edits a file in place through the shell',
  script: 'hides what it runs',
}

export const nudge = (tool: Tool, what: string) => `bash-rules: this ${LEAD[tool]} (${what}). ${INSTEAD[tool]}`

// More commands than this (after nested scripts) are left to the model rather than walked pairwise.
const MAX_COMMANDS = 400

// ---------------------------------------------------------------------------------------------------------------
// Words and redirects

// The words of a view (a wrapper-stripped slice of `c.argv`) as written, quotes removed and expansions kept.
function textOf(c: ShellCommand, v: Argv): string[] {
  for (let k = 0; k + v.length <= c.argv.length; k++) {
    if (v.every((a, i) => c.argv[k + i] === a)) return c.text.slice(k, k + v.length)
  }
  return v.map(a => a ?? '')
}

// A process substitution operand (`cat <(cmd)`) reads as /dev/fd, never as a file.
const argvOf = (c: ShellCommand): Argv => c.argv.map((a, i) => (a === null && /^[<>]\(/.test(c.text[i] ?? '') ? '/dev/fd/63' : a))

// Paths the built-in tools are no substitute for: stdin, devices, /proc and /sys.
const special = (t: string | null) => t !== null && (t === '-' || /^\/(?:dev|proc|sys)\//.test(t))

const OUT_OPS = new Set(['>', '>>', '>|', '&>', '&>>'])
const SINKS = /^\/dev\/(?:null|stdout|stderr|tty|fd\/\d+)$/

const stdoutRedirects = (c: ShellCommand) => c.redirects.filter(r => OUT_OPS.has(r.op) && (r.fd === null || r.fd === 1 || r.op[0] === '&'))

// Standard output goes to a file (not a sink such as /dev/null).
const toFile = (c: ShellCommand) => stdoutRedirects(c).some(r => r.target === null || !SINKS.test(r.target))
// Standard output goes anywhere but the terminal.
const redirected = (c: ShellCommand) => stdoutRedirects(c).length > 0

// stdin comes from a file: `< file` with a literal or expanded target that is no process substitution.
const fileStdin = (c: ShellCommand) => c.redirects.some(r => r.op === '<' && !/^[<>]\(/.test(r.text) && !special(r.target))
// stdin comes from text the command line carries.
const textStdin = (c: ShellCommand) => c.heredocs.length > 0 || c.redirects.some(r => r.op === '<<<')

// Options and operands. `short` lists the letters that take a value (attached, or the next word when last in a cluster),
// `long` the long options that take the next word. GNU tools permute, so options after operands still count.
type Split = { flags: string[]; operands: (string | null)[]; values: Map<string, (string | null)[]> }

function split(v: Argv, short = '', long: readonly string[] = []): Split {
  const out: Split = { flags: [], operands: [], values: new Map() }
  const put = (k: string, val: string | null) => out.values.set(k, [...(out.values.get(k) ?? []), val])
  for (let i = 1; i < v.length; i++) {
    const a = v[i]
    if (a === null || a === '-' || a[0] !== '-') {
      out.operands.push(a)
      continue
    }
    if (a === '--') {
      out.operands.push(...v.slice(i + 1))
      break
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      const name = eq < 0 ? a : a.slice(0, eq)
      out.flags.push(name)
      if (eq >= 0) put(name, a.slice(eq + 1))
      else if (long.includes(name)) put(name, v[++i] ?? null)
      continue
    }
    for (let k = 1; k < a.length; k++) {
      const ch = a[k]!
      out.flags.push(`-${ch}`)
      if (!short.includes(ch)) continue
      put(`-${ch}`, k < a.length - 1 ? a.slice(k + 1) : (v[++i] ?? null))
      break
    }
  }
  return out
}

const has = (s: Split, ...names: string[]) => names.some(n => s.flags.includes(n))
const files = (ops: readonly (string | null)[]) => ops.filter(a => !special(a))

// ---------------------------------------------------------------------------------------------------------------
// Pipelines

// The commands in later stages of `c`'s pipeline at its own nesting level.
function downstream(c: ShellCommand, all: readonly ShellCommand[]): ShellCommand[] {
  if (!c.pipeline) return []
  return all.filter(d => d !== c && d.pipeline !== null && d.nesting === c.nesting && d.pipeline.earlier.includes(c))
}

// Programs that pass file text on for display: a file read piped through them is still a read.
const VIEW_FILTERS = new Set(['cat', 'head', 'tail', 'grep', 'egrep', 'fgrep', 'rg', 'sed', 'awk', 'gawk', 'nl', 'less', 'more', 'cut', 'column', 'sort', 'tac', 'fold', 'bat', 'batcat'])

// Programs that consume text rather than show it: a file read piped into them is not a read.
const CONSUMERS = new Set([
  'wc', 'xargs', 'jq', 'yq', 'uniq', 'tee', 'read', 'while', 'md5sum', 'sha1sum', 'sha256sum', 'sha512sum', 'cksum', 'b2sum',
  'base64', 'gzip', 'xz', 'zstd', 'bzip2', 'xclip', 'xsel', 'pbcopy', 'wl-copy', 'ssh', 'scp', 'docker', 'podman', 'kubectl',
  'git', 'patch', 'diff', 'comm', 'psql', 'mysql', 'sqlite3', 'sh', 'bash', 'zsh', 'dash', 'python', 'python3', 'node', 'bun',
  'deno', 'perl', 'ruby', 'php', 'curl', 'gpg', 'age', 'openssl', 'nc', 'socat', 'envsubst', 'true', 'parallel', 'mapfile',
  'readarray', 'cmp', 'file', 'gh', 'aws', 'gcloud', 'az',
])

const programOf = (c: ShellCommand) => {
  const vs = viewsOf(c.argv)
  return baseName(vs[vs.length - 1]?.[0] ?? null)
}

// Where a file read's output ends up: the terminal (a read), a file or another program (not a read), or a program the
// parser does not know (unsure).
function readOutput(c: ShellCommand, all: readonly ShellCommand[]): 'shown' | 'consumed' | { unknown: string } {
  if (redirected(c)) return 'consumed'
  const ds = downstream(c, all)
  if (ds.some(redirected)) return 'consumed'
  for (const d of ds) {
    const name = baseName(d.argv[0] ?? null)
    if (d.argv.length === 0 || VIEW_FILTERS.has(name)) continue
    if (CONSUMERS.has(name) || CONSUMERS.has(programOf(d))) return 'consumed'
    return { unknown: name || 'a computed command' }
  }
  return 'shown'
}

// ---------------------------------------------------------------------------------------------------------------
// Reads

type ReadHit = Finding | { unsure: string } | null

// A sed script made only of print, delete and quit commands with line or regex addresses: it shows lines as they are.
function sedPrintOnly(script: string): boolean {
  const addr = String.raw`(?:\d+|\$|\/(?:[^\/\\]|\\.)*\/I?)(?:\s*,\s*(?:\d+|\$|\/(?:[^\/\\]|\\.)*\/I?|[+~]\d+))?|\d+~\d+`
  const cmd = new RegExp(String.raw`^\s*(?:${addr})?\s*!?\s*(?:[pdnlqQ=]\s*\d*)\s*$`)
  const parts = script.split(/[;\n]/).filter(p => p.trim() !== '')
  return parts.length > 0 && parts.every(p => cmd.test(p))
}

// An awk program that prints lines as they are: a pattern alone, `{print}` or `{print $0}`, or NR ranges.
function awkRawPrint(prog: string): boolean {
  const cond = String.raw`(?:NR\s*[<>=!]=?\s*\d+(?:\s*&&\s*NR\s*[<>=!]=?\s*\d+)?|\/(?:[^\/\\]|\\.)*\/|\$0\s*~\s*\/(?:[^\/\\]|\\.)*\/)`
  const action = String.raw`\{\s*print(?:\s+\$0)?\s*;?\s*\}`
  return new RegExp(String.raw`^\s*(?:${cond}\s*(?:${action})?|${action})\s*$`).test(prog) && prog.trim() !== ''
}

const SHOW = new Set(['cat', 'tac', 'nl', 'bat', 'batcat', 'less', 'more', 'most'])
const GREPS = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'ugrep'])
const FIND_GLOBBABLE = new Set(['-name', '-iname', '-path', '-ipath', '-wholename', '-iwholename', '-regex', '-iregex', '-type', '-maxdepth', '-mindepth', '-not', '!', '-o', '-or', '-a', '-and', '(', ')', '-print', '-print0', '-follow', '-regextype', '-xtype'])
const FIND_VALUED = new Set(['-name', '-iname', '-path', '-ipath', '-wholename', '-iwholename', '-regex', '-iregex', '-type', '-maxdepth', '-mindepth', '-regextype', '-xtype'])
const FIND_NAMES = new Set(['-name', '-iname', '-path', '-ipath', '-wholename', '-iwholename', '-regex', '-iregex'])

function findSearch(v: Argv): boolean {
  let i = 1
  for (; i < v.length; i++) {
    const a = v[i]
    if (a === null) continue
    if (a === '-D') i++
    else if (!/^-[HLPO]/.test(a)) break
  }
  while (i < v.length && v[i] !== null && !/^[-(!]/.test(v[i]!)) i++
  let named = false
  for (; i < v.length; i++) {
    const a = v[i]
    if (a === null || !FIND_GLOBBABLE.has(a)) return false
    if (FIND_NAMES.has(a)) named = true
    if (a === '-type' || a === '-xtype') {
      if (v[i + 1] !== 'f') return false
      named = true
    }
    if (FIND_VALUED.has(a)) i++
  }
  return named
}

// Whether a viewer program reads a file for display, and which built-in does that. `xargs` hands it file operands.
function readOf(v: Argv, c: ShellCommand, viaXargs: boolean): ReadHit {
  const name = baseName(v[0])
  const fromFile = viaXargs || fileStdin(c)
  if (SHOW.has(name)) {
    const s = split(v, name === 'nl' ? 'bdfhilnsvw' : name === 'bat' || name === 'batcat' ? 'lrHm' : '', ['--line-range', '--language'])
    // cat -A/-v/-e/-t show what Read cannot (control characters, line ends).
    if (name === 'cat' && has(s, '-A', '-v', '-e', '-t', '-E', '-T', '--show-all', '--show-nonprinting')) return null
    return files(s.operands).length > 0 || fromFile ? { category: 'read', tool: 'Read', what: `${name} of a file` } : null
  }
  if (name === 'head' || name === 'tail') {
    const s = split(v, 'nc', ['--lines', '--bytes', '--pid', '--sleep-interval'])
    if (has(s, '-f', '-F', '--follow', '--retry')) return null
    return files(s.operands).length > 0 || fromFile ? { category: 'read', tool: 'Read', what: `${name} of a file` } : null
  }
  if (name === 'sed' || name === 'gsed') {
    const s = split(v, 'efl', ['--expression', '--file', '--line-length'])
    if (has(s, '-i', '--in-place')) return null
    const scripts = [...(s.values.get('-e') ?? []), ...(s.values.get('--expression') ?? [])]
    const byFile = has(s, '-f', '--file')
    const ops = scripts.length > 0 || byFile ? s.operands : s.operands.slice(1)
    if (scripts.length === 0 && !byFile) scripts.push(s.operands[0] ?? null)
    if (files(ops).length === 0 && !fromFile) return null
    if (!byFile && scripts.every(t => t !== null && sedPrintOnly(t))) return { category: 'read', tool: 'Read', what: 'sed printing lines of a file' }
    return { unsure: 'sed transforms a file and prints the result' }
  }
  if (/^(?:g|m|n)?awk$/.test(name)) {
    const s = split(v, 'Fvfi', ['--field-separator', '--assign', '--file', '--include'])
    if ((s.values.get('-i') ?? []).includes('inplace')) return null
    const byFile = has(s, '-f', '--file')
    const prog = byFile ? null : (s.operands[0] ?? null)
    const ops = (byFile ? s.operands : s.operands.slice(1)).filter(a => a === null || !/^[A-Za-z_]\w*=/.test(a))
    if (files(ops).length === 0 && !fromFile) return null
    if (prog !== null && awkRawPrint(prog)) return { category: 'read', tool: 'Read', what: 'awk printing lines of a file' }
    return { unsure: 'awk program run over a file' }
  }
  if (GREPS.has(name)) {
    const rg = name !== 'grep' && name !== 'egrep' && name !== 'fgrep'
    const s = rg
      ? split(v, 'efgtTmABCjMrE', ['--regexp', '--file', '--glob', '--iglob', '--type', '--type-not', '--max-count', '--context', '--after-context', '--before-context', '--threads', '--max-columns', '--replace', '--encoding', '--max-depth', '--ignore-file', '--sort', '--sortr', '--color', '--colors'])
      : split(v, 'efmABCdD', ['--regexp', '--file', '--max-count', '--after-context', '--before-context', '--context', '--include', '--exclude', '--exclude-dir', '--exclude-from', '--label', '--devices', '--directories', '--binary-files', '--group-separator'])
    if (has(s, '-q', '--quiet', '--silent')) return null
    if (rg && has(s, '--files')) return { category: 'read', tool: 'Glob', what: `${name} --files` }
    const patterned = has(s, '-e', '-f', '--regexp', '--file')
    const ops = files(patterned ? s.operands : s.operands.slice(1))
    const recursive = rg ? !c.pipeline?.stage && !textStdin(c) && !fileStdin(c) : has(s, '-r', '-R', '--recursive', '--dereference-recursive')
    if (ops.length > 0 || fromFile || recursive) return { category: 'read', tool: 'Grep', what: `${name} over files` }
    return null
  }
  if (name === 'find') return findSearch(v) ? { category: 'read', tool: 'Glob', what: 'find by name' } : null
  if (name === 'fd' || name === 'fdfind') {
    const s = split(v, 'tedxXEcjS', ['--type', '--extension', '--exec', '--exec-batch', '--exclude', '--max-depth', '--changed-within', '--size'])
    if (has(s, '-x', '-X', '--exec', '--exec-batch')) return null
    if ([...(s.values.get('-t') ?? []), ...(s.values.get('--type') ?? [])].some(t => t !== null && /^d/.test(t))) return null
    return { category: 'read', tool: 'Glob', what: `${name} by name` }
  }
  if (name === 'ls') {
    const s = split(v, 'IwT', ['--ignore', '--hide', '--width', '--format', '--sort', '--time', '--color', '--time-style', '--block-size'])
    if (has(s, '-d', '--directory')) return null
    if (has(s, '-R', '--recursive') || s.operands.some(a => a !== null && /[*?[]/.test(a))) return { category: 'read', tool: 'Glob', what: 'ls searching for files' }
    return null
  }
  return null
}

// ---------------------------------------------------------------------------------------------------------------
// Writes and smuggling

const TEXT_MAKERS = new Set(['echo', 'printf'])
const DECLARERS = new Set(['export', 'declare', 'typeset', 'local', 'readonly'])

// Text the command line itself authors on stdout: echo/printf words, or a heredoc or here-string to cat (with no file
// operand) or to no command at all. 'literal' when some of it is literal text, 'expansion' when it is only expansions.
function authored(v: Argv, words: string[], c: ShellCommand): 'literal' | 'expansion' | null {
  const name = baseName(v[0])
  if (v.length === 0 || c.argv.length === 0) return c.heredocs.length > 0 ? 'literal' : null
  if (name === 'cat') return textStdin(c) && files(split(v).operands).length === 0 ? 'literal' : null
  if (!TEXT_MAKERS.has(name)) return null
  const content = v.slice(1).map((a, i) => ({ a, t: words[i + 1] ?? '' })).filter(({ a }) => !(a !== null && /^-[neE]+$/.test(a) && name === 'echo'))
  const alnum = (a: string) => /\S/.test(a.replace(/%[-#0 +]*\d*(?:\.\d+)?[sdifxXobceEgGq%]|\\[nt]/g, ''))
  if (content.some(({ a }) => a !== null && alnum(a))) return 'literal'
  // `echo "" > f` and `printf '' > f` only truncate.
  if (content.every(({ a }) => a !== null)) return null
  const stripped = content.map(({ t }) => t.replace(/\$\{[^}]*\}|\$\([^)]*\)|\$\w+|`[^`]*`/g, '')).join(' ')
  return /[A-Za-z0-9].*[A-Za-z0-9].*[A-Za-z0-9]/.test(stripped) ? 'literal' : 'expansion'
}

// A stage feeding text the command line authored (echo, printf, a heredoc to cat).
const textSource = (e: ShellCommand) => {
  const v = viewsOf(argvOf(e))
  const last = v[v.length - 1] ?? []
  return authored(last, textOf(e, last), e) !== null
}

const WRITE_CODE =
  /\bopen\s*\([^;\n]*?,\s*(?:mode\s*=\s*)?['"][rbtU]*[wax+]|\.write_(?:text|bytes)\s*\(|\b(?:writeFile|appendFile)(?:Sync)?\s*\(|createWriteStream\s*\(|\bFile\.(?:write|open\s*\([^)]*['"][wa])|\bopen\s*\(?\s*(?:my\s+)?\$?\w+\s*,\s*['"]\s*(?:>|\+<)|\bopen\s*\(?\s*\w+\s*,\s*['"]>|\bfile_put_contents\s*\(|\bshutil\.(?:copy|move)|\bos\.(?:rename|replace)\s*\(/
const READ_CODE = /\bopen\s*\(|\bread_text\s*\(|\breadFile(?:Sync)?\s*\(|\bFile\.read|\bIO\.read|\bfile_get_contents\s*\(|<\$?\w*>|\bslurp\b/
const EXEC_CODE = /\b(?:exec|eval|compile|Function|instance_eval|class_eval|system|popen|execSync|spawnSync)\s*\(|\bnew\s+Function\b|\beval\b/
const ENCODED =
  /b64decode|\bbase64\b|decode_base64|\batob\s*\(|fromCharCode|\bfromhex\b|unhexlify|codecs\.decode|zlib\.decompress|marshal\.loads|\bpack\s*\(?\s*['"][Hhu]|Buffer\.from\s*\([^)]*['"](?:base64|hex)['"]|(?:\\x[0-9a-fA-F]{2}){4,}|(?:\\[0-7]{3}){4,}|['"][A-Za-z0-9+/]{120,}={0,2}['"]/

// Decodes base64, hex or uuencoded text.
function decoder(v: Argv): boolean {
  const name = baseName(v[0])
  if (name === 'base64' || name === 'basenc' || name === 'base32') return split(v).flags.some(f => f === '-d' || f === '-D' || f === '--decode')
  if (name === 'xxd') return split(v).flags.includes('-r')
  if (name === 'uudecode') return true
  if (name === 'openssl') {
    const words = v.slice(1)
    return (words[0] === 'base64' || words[0] === 'enc') && words.includes('-d')
  }
  return false
}

// The inline program of an interpreter (`python -c`, `node -e`, `perl -e`, `ruby -e`, `php -r`), as written, with whether
// it is literal. Null for a shell (its script is reparsed by the scan), a module run (`python -m`) or no inline program.
function inlineProgram(v: Argv, words: string[]): { code: string; literal: boolean } | null {
  const inv = invocation(v)
  if (!inv || inv.shell || inv.code < 0 || inv.code >= v.length) return null
  if (/^python/.test(baseName(v[0])) && v.slice(1, inv.code + 1).some(a => a !== null && /^-[A-Za-z]*m/.test(a))) return null
  // An attached program (`-cCODE`, `-neCODE`, `--eval=CODE`) shares its word with the option.
  const raw = words[inv.code] ?? ''
  const code = /^--[\w-]+=/.test(raw) ? raw.slice(raw.indexOf('=') + 1) : raw.startsWith('-') ? raw.replace(/^-[A-Za-z]*?[cepEr]/, '') : raw
  return { code, literal: v[inv.code] !== null }
}

// The program text of an interpreter whose program is an expansion, as written.
const inlineText = (v: Argv, words: string[]) => {
  const t = words[invocation(v)?.code ?? -1] ?? ''
  return /^--[\w-]+=/.test(t) ? t.slice(t.indexOf('=') + 1) : t
}

// `perl -pi`, `perl -i.bak -e`, `ruby -pi`: the in-place flag in an option cluster before the program.
function inPlaceInterpreter(v: Argv): boolean {
  const name = baseName(v[0])
  if (name !== 'perl' && name !== 'ruby') return false
  for (let i = 1; i < v.length; i++) {
    const a = v[i]
    if (a === null || a[0] !== '-' || a === '--') return false
    for (let k = 1; k < a.length; k++) {
      const ch = a[k]!
      if (ch === 'i') return true
      if ('eEIMxCdDl0'.includes(ch)) break
    }
    if (/^-[A-Za-z]*[eE]$/.test(a)) i++
  }
  return false
}

// Variables a command line assigns (`X=...` prefixes and bare assignments, `export X=...` and its kin) with their values,
// null when computed (`X=$(...)`).
function assignments(commands: readonly ShellCommand[]): Map<string, string | null> {
  const out = new Map<string, string | null>()
  for (const c of commands) {
    for (const a of c.assigns) if (a.name) out.set(a.name.replace(/\[.*$/, ''), a.value)
    if (DECLARERS.has(baseName(c.argv[0] ?? null))) {
      for (const [i, t] of c.text.slice(1).entries()) {
        const m = /^([A-Za-z_]\w*)\+?=/.exec(t)
        if (m) out.set(m[1]!, c.argv[i + 1] === null ? null : t.slice(m[0].length))
      }
    }
  }
  return out
}

// Whether program text starts with an assigned variable (`"$X"`, `${X} args`): the variable holds the script.
const VAR_LEAD = /^\s*\$\{?([A-Za-z_]\w*)\}?(?:\s|;|$)/
const leadsWithVar = (text: string, vars: ReadonlyMap<string, string | null>) => vars.has(VAR_LEAD.exec(text)?.[1] ?? '')

// A variable run as a command name holds a script when its value is computed or has more than a program name in it
// (`PY=python3; $PY x` is just indirection).
const scriptVar = (text: string, vars: ReadonlyMap<string, string | null>) => {
  const name = VAR_LEAD.exec(text)?.[1]
  if (name === undefined || !vars.has(name)) return false
  const value = vars.get(name)
  return value === null || value === undefined || /[\s;|&<>`$()]/.test(value)
}

// Programs whose output an `eval "$(...)"` conventionally runs: shell setup, not a hidden payload.
const EVAL_OK = new Set([
  'ssh-agent', 'direnv', 'pyenv', 'rbenv', 'nodenv', 'goenv', 'jenv', 'fnm', 'zoxide', 'starship', 'brew', 'conda', 'mamba',
  'micromamba', 'mise', 'rtx', 'asdf', 'opam', 'dircolors', 'keychain', 'gpg-agent', 'luarocks', 'thefuck', 'atuin', 'nvm',
  'register-python-argcomplete', 'kubectl', 'helm', 'gh', 'docker-machine', 'minikube', 'aws-vault', 'pipx', 'uv', 'rustup',
])

// ---------------------------------------------------------------------------------------------------------------
// The verdict

export function hygiene(commands: readonly ShellCommand[]): Verdict {
  if (commands.length > MAX_COMMANDS) return { kind: 'unsure', reasons: ['too many commands to check one by one'] }
  const unsure: string[] = []
  const hits: Finding[] = []
  const vars = assignments(commands)

  // Whether a decoder sits upstream of each pipeline stage (transitively, as remote-exec builds it).
  const decoded = new Map<object, boolean>()
  const decodes = (c: ShellCommand) => viewsOf(c.argv).some(decoder)
  for (const c of commands) {
    const p = c.pipeline
    if (p && !decoded.has(p)) decoded.set(p, p.prev.some(e => decodes(e) || (e.pipeline !== null && decoded.get(e.pipeline) === true)))
  }

  for (const c of commands) {
    const argv = argvOf(c)
    const vs = viewsOf(argv)
    let viaXargs = false
    for (const v of vs) {
      const words = textOf(c, v)
      const name = baseName(v[0] ?? null)

      // read
      if (c.nesting === 0) {
        const r = readOf(v, c, viaXargs)
        if (r) {
          const out = readOutput(c, commands)
          if ('unsure' in r) {
            if (out !== 'consumed') unsure.push(r.unsure)
          } else if (out === 'shown') {
            // `cat f | grep x` is a search.
            const grepped = r.tool === 'Read' && downstream(c, commands).some(d => GREPS.has(baseName(d.argv[0] ?? null)))
            hits.push(grepped ? { ...r, tool: 'Grep' } : r)
          }
          else if (out !== 'consumed') unsure.push(`${r.what} piped into ${out.unknown}`)
        }
      }

      // write: in-place edits
      if ((name === 'sed' || name === 'gsed') && has(split(v, 'efl', ['--expression', '--file', '--line-length']), '-i', '--in-place')) {
        hits.push({ category: 'write', tool: 'Edit', what: 'sed -i' })
      }
      if (/^(?:g|m|n)?awk$/.test(name) && (split(v, 'Fvfi').values.get('-i') ?? []).includes('inplace')) hits.push({ category: 'write', tool: 'Edit', what: 'awk -i inplace' })
      if (inPlaceInterpreter(v)) hits.push({ category: 'write', tool: 'Edit', what: `${name} -i` })

      // write: authored text redirected into a file, or piped or fed into tee
      const made = authored(v, words, c)
      if (made && toFile(c)) {
        if (made === 'literal') hits.push({ category: 'write', tool: 'Write', what: `${name || 'a heredoc'} redirected into a file` })
        else unsure.push(`${name} of a variable redirected into a file`)
      }
      if (name === 'tee' && files(split(v, '', []).operands).length > 0) {
        if (textStdin(c) || prevStage(c).some(textSource)) hits.push({ category: 'write', tool: 'Write', what: 'text fed to tee' })
      }

      // interpreter one-liners
      const inline = inlineProgram(v, words)
      if (inline?.literal) {
        if (EXEC_CODE.test(inline.code) && ENCODED.test(inline.code)) hits.push({ category: 'smuggle', tool: 'script', what: `${name} running decoded or encoded code` })
        else if (WRITE_CODE.test(inline.code)) hits.push({ category: 'write', tool: 'Write', what: `${name} one-liner that writes a file` })
        else if (EXEC_CODE.test(inline.code)) unsure.push(`${name} one-liner that evaluates code`)
        else if (READ_CODE.test(inline.code)) unsure.push(`${name} one-liner that reads a file`)
      } else if (inline && !inline.literal) {
        if (leadsWithVar(inlineText(v, words), vars)) hits.push({ category: 'smuggle', tool: 'script', what: `${name} running code stored in a variable` })
        else if (c.subs.some(decodes)) hits.push({ category: 'smuggle', tool: 'script', what: `${name} running decoded text` })
        else unsure.push(`${name} running a program built from an expansion`)
      }

      // scripts fed on stdin
      const reader = stdinReader(v)
      if (reader) {
        if (c.pipeline && decoded.get(c.pipeline) === true) hits.push({ category: 'smuggle', tool: 'script', what: 'decoded text piped into a shell or interpreter' })
        else if (prevStage(c).some(e => TEXT_MAKERS.has(baseName(e.argv[0] ?? null)))) {
          const escaped = prevStage(c).some(e => e.text.slice(1).some(t => /(?:\\x[0-9a-fA-F]{2}|\\[0-7]{3}){2,}/.test(t)))
          if (escaped) hits.push({ category: 'smuggle', tool: 'script', what: 'escaped text piped into a shell' })
          else unsure.push('echo or printf piped into a shell or interpreter')
        }
        if (reader === 'script') {
          for (const body of fedBodies(c)) {
            if (EXEC_CODE.test(body) && ENCODED.test(body)) hits.push({ category: 'smuggle', tool: 'script', what: `${name} script running decoded or encoded code` })
            else if (WRITE_CODE.test(body)) unsure.push(`${name} script on stdin that writes files`)
          }
        }
      }

      // programs run from expansions: `$X`, `eval "$X"`, `bash -c "$X"`, `source <(...)`
      if (v.length > 0 && v[0] === null && words[0] !== undefined && scriptVar(words[0], vars)) {
        hits.push({ category: 'smuggle', tool: 'script', what: 'a script stored in a variable run as a command' })
      } else if (v.length > 0 && v[0] !== null && !inline && dynamicProgram(v, c)) {
        // Only `eval` and `sh -c` run text; `source "$dir/x.sh"`, `bash "$script"` and a heredoc to a shell (whose body the
        // scan reparses) run a file or literal text, unless the text comes from a decoder or an assigned variable.
        const inv = invocation(v)
        const texts = [
          name === 'eval' ? words.slice(1).join(' ') : inv && inv.code >= 0 ? (words[inv.code] ?? '') : (words[inv?.ops ?? 1] ?? ''),
          ...c.redirects.filter(r => r.op === '<<<').map(r => r.text),
        ]
        const runsText = name === 'eval' || (inv?.shell === true && inv.code >= 0)
        const evalOk = c.subs.length > 0 && c.subs.every(s => EVAL_OK.has(programOf(s)) || EVAL_OK.has(baseName(s.argv[0] ?? null)))
        if (c.subs.some(decodes)) hits.push({ category: 'smuggle', tool: 'script', what: `${name} running decoded text` })
        else if (texts.some(t => leadsWithVar(t, vars))) hits.push({ category: 'smuggle', tool: 'script', what: `${name} running a script stored in a variable` })
        else if (runsText && !evalOk) unsure.push(`${name} running a program built from an expansion`)
      }

      // decoded text written to a file: a decoder fed by inline text whose output lands in a file
      if (decoder(v)) {
        const fed = textStdin(c) || prevStage(c).some(textSource)
        const ds = downstream(c, commands)
        const landsInFile = toFile(c) || ds.some(toFile) || ds.some(d => baseName(d.argv[0] ?? null) === 'tee' && files(split(d.argv).operands).length > 0)
        if (fed && landsInFile) hits.push({ category: 'smuggle', tool: 'script', what: 'decoded text written to a file' })
      }

      if (name === 'xargs') viaXargs = true
    }
  }

  const order: Category[] = ['smuggle', 'write', 'read']
  for (const cat of order) {
    const h = hits.find(x => x.category === cat)
    if (h) return { kind: 'deny', category: h.category, tool: h.tool, message: nudge(h.tool, h.what) }
  }
  return unsure.length > 0 ? { kind: 'unsure', reasons: [...new Set(unsure)].slice(0, 6) } : { kind: 'pass' }
}
