#!/usr/bin/env -S bun --no-env-file --config=/dev/null
// PreToolUse hook for read-only subagents: blocks Bash commands that mutate files.
//
// This is an ACCIDENT GUARD, not a sandbox. It parses the command with the shell AST walker
// and pattern-matches known mutating commands. It is easy to evade on purpose (`python -c`,
// `curl -o`, variable indirection like `$CMD`, scripts that write), and exists to stop a
// read-only agent from mutating files by mistake.
//
// Contract (https://code.claude.com/docs/en/hooks): hook JSON arrives on stdin with the command
// at .tool_input.command. Exit 2 blocks the tool call and stderr is shown to Claude; exit 0
// allows. Every error path also exits 2, because any other nonzero exit (such as 1) lets the
// command run. Run it as `bun --no-env-file --config=/dev/null <path> || exit 2`, so a load
// failure or a missing bun also blocks.
//
// The policy is a 1:1 port of readonly-bash.py. Only the tokenizer is replaced by the walker.

import { readFileSync, writeSync } from 'node:fs'
import { parse, reparse } from './shell/walk.ts'
import type { ShellCommand } from './shell/walk.ts'

const SCRATCH_MSG = 'This agent is read-only; write scratch files under /tmp only.'

// Stands for an expanded assignment name or value, which the walker reports as null without its
// source text. It never matches a name, is never empty or `cat`, and is not a scratch path.
const EXPANDED = '$EXPANDED'

class Block extends Error {
  segment: string | null = null
  constructor(readonly reason: string) {
    super(reason)
  }
}

class ParseFailure extends Error {}

const block = (reason: string): never => {
  throw new Block(reason)
}

type Words = readonly string[]
const set = (...xs: string[]): ReadonlySet<string> => new Set(xs)
const NONE = set()

// ---------------------------------------------------------------- helpers

// posixpath.normpath: collapses `.`, `..` and repeated slashes, keeping a leading `//`.
function normpath(p: string): string {
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

const basename = (p: string): string => p.slice(p.lastIndexOf('/') + 1)

// str.partition: [head, separator or '', tail].
function partition(s: string, sep: string): [string, string, string] {
  const k = s.indexOf(sep)
  return k < 0 ? [s, '', ''] : [s.slice(0, k), sep, s.slice(k + sep.length)]
}

const tmpdir = (): string => (process.env.TMPDIR ?? '').replace(/\/+$/, '')

function isScratch(path: string): boolean {
  if (['/dev/null', '/dev/stdout', '/dev/stderr', '/dev/tty'].includes(path)) return true
  const norm = normpath(path)
  if (/^\/tmp(\/.+)?$/.test(norm)) return true
  const t = tmpdir()
  return t.startsWith('/') && (norm === t || norm.startsWith(`${t}/`))
}

// The scratch directory itself, after normalizing `..`.
function isScratchRoot(path: string): boolean {
  const norm = normpath(path)
  const t = tmpdir()
  return norm === '/tmp' || (t.startsWith('/') && norm === t)
}

// [index, word] of the first non-option word, skipping values of `valued` options.
function firstPositional(args: Words, valued: ReadonlySet<string> = NONE): [number, string] | [null, null] {
  let i = 0
  while (i < args.length) {
    const a = args[i]
    if (a === '--') return i + 1 < args.length ? [i + 1, args[i + 1]] : [null, null]
    if (a.startsWith('-') && a.length > 1) i += valued.has(a) ? 2 : 1
    else return [i, a]
  }
  return [null, null]
}

// Letters of a bundled short option like -rf, or '' for other words.
const shortFlags = (a: string): string => (/^-[A-Za-z]+$/.test(a) ? a.slice(1) : '')

const anyIn = (chars: string, letters: string): boolean => [...chars].some(c => letters.includes(c))

// ---------------------------------------------------------------- command checks

const FS_CMDS = set('rm', 'rmdir', 'mv', 'cp', 'ln', 'touch', 'mkdir', 'chmod', 'chown', 'chgrp',
  'truncate', 'dd', 'install', 'tee', 'patch', 'unlink')
const FS_VALUED: Record<string, ReadonlySet<string>> = {
  mkdir: set('-m', '--mode'),
  touch: set('-d', '-r', '-t', '--date', '--reference'),
  truncate: set('-s', '-r', '--size', '--reference'),
  install: set('-m', '-o', '-g', '-S', '--mode', '--owner', '--group', '--suffix'),
  cp: set('-S', '--suffix'), mv: set('-S', '--suffix'), ln: set('-S', '--suffix'),
  patch: set('-p', '-d', '-i', '-r', '-V', '-F', '--strip', '--directory', '--input'),
}
// Options whose value is a written path: [short letter, long name].
const FS_PATH_OPTS: Record<string, [string, string]> = {
  cp: ['t', '--target-directory'], mv: ['t', '--target-directory'],
  ln: ['t', '--target-directory'], install: ['t', '--target-directory'],
  patch: ['o', '--output'],
}

// If args[i] is cmd's written-path option, return [value, extra words consumed].
function pathOption(cmd: string, a: string, args: Words, i: number): [string, number] | null {
  const opt = FS_PATH_OPTS[cmd]
  if (!opt || !a.startsWith('-')) return null
  const [letter, longName] = opt
  if (a === longName) return i + 1 < args.length ? [args[i + 1], 1] : ['', 0]
  if (a.startsWith(`${longName}=`)) return [partition(a, '=')[2], 0]
  const flags = shortFlags(a)
  if (flags.includes(letter)) {   // -t DIR, -tDIR, or a bundle like -rt DIR
    const after = flags.slice(flags.indexOf(letter) + 1)
    if (after) return [after, 0]
    return i + 1 < args.length ? [args[i + 1], 1] : ['', 0]
  }
  return null
}

// Filesystem commands are fine only when every written path is scratch.
function checkFs(cmd: string, args: Words): void {
  const valued = FS_VALUED[cmd] ?? NONE
  let paths: string[] = []
  const targets: string[] = []
  let pastDashes = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    const opt = pastDashes ? null : pathOption(cmd, a, args, i)
    if (a === '--' && !pastDashes) pastDashes = true
    else if (opt !== null) {
      targets.push(opt[0])
      i += opt[1]
    } else if (!pastDashes && a.startsWith('-') && a.length > 1) {
      if (valued.has(a)) i++
    } else if (cmd === 'dd') {
      if (a.startsWith('of=')) paths.push(a.slice(3))
    } else paths.push(a)
  }
  if (['chmod', 'chown', 'chgrp'].includes(cmd) && paths.length && !args.some(a => a.startsWith('--reference'))) {
    paths = paths.slice(1)   // the mode or owner
  }
  if (cmd === 'patch' && !(paths.length || targets.length) && !args.includes('--dry-run')) {
    block('patch edits the files named in the diff')
  }
  if (cmd === 'ln' && paths.length === 1 && !targets.length) block('one-argument ln creates a link in the current directory')
  if (['cp', 'ln', 'install'].includes(cmd)) paths = targets.length ? [] : paths.slice(-1)   // only the destination is written
  for (const p of [...paths, ...targets]) {
    if (!isScratch(p)) block(`'${cmd}' on non-scratch path '${p}'`)
    if (['rm', 'rmdir', 'mv'].includes(cmd) && isScratchRoot(p)) block(`'${cmd}' on the scratch root itself`)
  }
}

const ARCHIVERS = set('gzip', 'gunzip', 'bzip2', 'bunzip2', 'xz', 'unxz', 'zstd')

// Value of `-X v`, `-Xv`, `--long v` or `--long=v`, or null.
function optionValue(args: Words, short: string, longName: string): string | null {
  for (const [i, a] of args.entries()) {
    if (a === short || a === longName) return i + 1 < args.length ? args[i + 1] : ''
    if (a.startsWith(`${longName}=`)) return partition(a, '=')[2]
    if (short && a.startsWith(short) && !a.startsWith('--') && a.length > 2) return a.slice(2)
  }
  return null
}

function checkTar(args: Words): void {
  let flags = args.map(shortFlags).join('')
  if (args.length && !args[0].startsWith('-')) flags += args[0]   // old style: tar xzf a.tgz
  if (!flags.includes('x') && !args.includes('--extract') && !args.includes('--get')) return
  const dest = optionValue(args, '-C', '--directory')
  if (dest === null || !isScratch(dest)) block('tar extraction needs -C <scratch dir>')
}

function checkUnzip(args: Words): void {
  if (anyIn(args.map(shortFlags).join(''), 'ltpZ')) return
  const dest = optionValue(args, '-d', '--none')
  if (dest === null || !isScratch(dest)) block('unzip extraction needs -d <scratch dir>')
}

function checkArchiver(cmd: string, args: Words): void {
  const flags = args.map(shortFlags).join('')
  if (anyIn(flags, 'clt') || args.some(a => ['--stdout', '--list', '--test', '--to-stdout'].includes(a))) return
  for (const a of args) {
    if (!a.startsWith('-') && !isScratch(a)) block(`'${cmd}' rewrites non-scratch file '${a}'`)
  }
}

function checkSort(args: Words): void {
  const out = optionValue(args, '-o', '--output')
  if (out !== null && !isScratch(out)) block('sort -o writes a non-scratch file')
}

function checkRsync(args: Words): void {
  if (args.some(a => ['-n', '--dry-run', '--list-only'].includes(a))) return
  const words = args.filter(a => !a.startsWith('-'))
  if (!words.length || !isScratch(words[words.length - 1])) block('rsync destination is not scratch')
}

function checkShell(cmd: string, args: Words): void {
  for (const a of args) {
    const flags = shortFlags(a)
    if (flags.includes('c')) block(`'${cmd} -c' runs arbitrary code`)
    if (flags.includes('s')) block(`'${cmd} -s' reads commands from stdin`)
  }
  if (!args.some(a => !a.startsWith('-'))) block(`'${cmd}' reads commands from stdin`)
}

function checkSed(args: Words): void {
  for (const a of args) {
    if (a.startsWith('--in-place')) block('sed in-place edit')
    if (/^-[A-Za-z]+.*$/.test(a) && !a.startsWith('--')) {
      for (const ch of a.slice(1)) {
        if (ch === 'i') block('sed in-place edit')
        if ('efl'.includes(ch)) break   // the rest of the word is this option's value
      }
    }
  }
}

function checkPerl(args: Words): void {
  let expectValue = false
  for (const a of args) {
    if (expectValue) {
      expectValue = false
      continue
    }
    if (!a.startsWith('-') || a === '-') break   // script name: the rest belongs to the script
    const cs = [...a]
    for (let pos = 1; pos < cs.length; pos++) {
      if (cs[pos] === 'i') block('perl in-place edit')
      if ('IMmeE'.includes(cs[pos])) {   // the rest of the word (or the next word) is its value
        expectValue = pos === cs.length - 1
        break
      }
    }
  }
}

function checkFind(args: Words): void {
  const starts: string[] = []
  for (const a of args) {
    if (a.startsWith('-') || a === '(' || a === '!') break
    starts.push(a)
  }
  const overScratch = starts.length > 0 && starts.every(isScratch)
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-delete' && (!overScratch || starts.some(isScratchRoot))) block('find -delete outside a scratch subdirectory')
    if (['-fprint', '-fprint0', '-fprintf', '-fls'].includes(a) && (i + 1 >= args.length || !isScratch(args[i + 1]))) {
      block(`${a} writes a file`)
    }
    if (['-exec', '-execdir', '-ok', '-okdir'].includes(a)) {
      let j = i + 1
      while (j < args.length && args[j] !== ';' && args[j] !== '+') j++
      let nested = args.slice(i + 1, j)
      if (overScratch) nested = nested.map(w => w.replaceAll('{}', '/tmp/_found'))   // {} stays inside the scratch tree
      checkArgv(nested)
      i = j
    }
  }
}

const XARGS_VALUED = set('-I', '-n', '-P', '-L', '-d', '-E', '-s', '-a', '-J', '-R', '-S',
  '--max-args', '--max-procs', '--max-lines', '--max-chars',
  '--delimiter', '--arg-file', '--eof', '--process-slot-var')

function checkXargs(args: Words): void {
  const [i] = firstPositional(args, XARGS_VALUED)
  if (i === null) return
  const rest = stripWrappers(args.slice(i))
  if (!rest.length) block('xargs wrapper runs a command that cannot be checked')
  // xargs supplies the paths from stdin, which cannot be checked.
  if (FS_CMDS.has(basename(rest[0]))) block(`xargs ${rest[0]} modifies the filesystem`)
  checkArgv(rest)
}

const GIT_VALUED = set('-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env')
const GIT_READ = set('status', 'diff', 'log', 'show', 'blame', 'grep', 'rev-parse', 'rev-list',
  'ls-files', 'ls-tree', 'cat-file', 'describe', 'shortlog', 'merge-base',
  'name-rev', 'for-each-ref', 'show-ref', 'whatchanged', 'diff-tree', 'check-ignore',
  'ls-remote', 'range-diff', 'cherry', 'show-branch', 'help', 'version')
const GIT_CONFIG_WRITE = set('--unset', '--unset-all', '--add', '--replace-all', '--edit', '-e',
  '--remove-section', '--rename-section')
const GIT_CONFIG_READ = set('--get', '--get-all', '--get-regexp', '--get-urlmatch', '--list', '-l')

// Shared rule for `git branch` / `git tag`: only listing forms pass.
function gitListing(rest: Words, mutatingShort: string, mutatingLong: ReadonlySet<string>, valued: ReadonlySet<string>): void {
  for (const a of rest) {
    if (anyIn(shortFlags(a), mutatingShort) || mutatingLong.has(a)) block(`git branch/tag modification '${a}'`)
    if (a.startsWith('--set-upstream-to')) block(`git branch modification '${a}'`)
  }
  const listing = rest.includes('--list') || rest.some(a => shortFlags(a).includes('l'))
  const [, positional] = firstPositional(rest, valued)
  if (positional !== null && !listing) block('git branch/tag with a name creates one')
}

const GIT_CONFIG_SAFE = /^(?:color\..*|core\.quotepath|log\..*|diff\.renames|diff\.algorithm|blame\..*|core\.abbrev)$/i

function gitConfigOk(key: string, value: string): boolean {
  key = key.toLowerCase()
  if (GIT_CONFIG_SAFE.test(key)) return true
  if (key.startsWith('pager.')) return value === 'false'
  return key === 'core.pager' && (value === '' || value === 'cat')
}

// posixpath.join for two parts.
const joinPath = (a: string, b: string): string => (b.startsWith('/') ? b : a === '' || a.endsWith('/') ? a + b : `${a}/${b}`)

// Options before the subcommand: -c may only set display keys, repos must be under cwd.
function checkGitGlobals(pre: Words): void {
  let j = 0
  while (j < pre.length) {
    const a = pre[j]
    j++
    let [name, eq, val] = partition(a, '=')
    if (name === '--exec-path') block('git --exec-path picks the helpers git runs')
    if (name === '-C' || name === '--git-dir' || name === '--work-tree') {
      if (!eq) {
        val = j < pre.length ? pre[j] : ''
        j++
      }
      const cwd = process.cwd()
      const full = normpath(joinPath(cwd, val))
      if (/[$`~]/.test(val) || !(full === cwd || full.startsWith(`${cwd.replace(/\/+$/, '')}/`))) {
        block(`git ${name} '${val}' points outside the working directory`)
      }
    } else if (a === '-c' || name === '--config-env') {
      if (a === '-c' || !eq) {
        val = j < pre.length ? pre[j] : ''
        j++
      }
      let [key, hasValue, value] = partition(val, '=')
      if (name === '--config-env') value = 'env'   // the value comes from the environment: unknown
      else if (!hasValue) value = 'true'
      if (!gitConfigOk(key, value)) block(`git config override '${key}' is not a display setting`)
    }
  }
}

function checkGit(args: Words): void {
  const [i, sub] = firstPositional(args, GIT_VALUED)
  checkGitGlobals(i !== null ? args.slice(0, i) : args)
  if (sub === null) return
  const rest = args.slice(i + 1)
  const listingValued = set('--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--sort', '--format')
  const [, first] = firstPositional(rest)
  if (sub === 'grep') {
    for (const a of rest) {
      if (a.startsWith('--open-files-in-pager') || shortFlags(a).includes('O')) block('git grep -O launches a program')
    }
  }
  if (GIT_READ.has(sub)) {
    for (const [j, a] of rest.entries()) {
      if (a === '--output' || a.startsWith('--output=')) {
        const target = a.includes('=') ? partition(a, '=')[2] : j + 1 < rest.length ? rest[j + 1] : ''
        if (!isScratch(target)) block(`git ${sub} --output writes a file`)
      }
    }
  } else if (sub === 'bisect') {
    if (rest[0] === 'run') checkArgv(rest.slice(1))
  } else if (sub === 'branch') {
    gitListing(rest, 'dDmMcCu', set('--delete', '--move', '--copy', '--unset-upstream', '--edit-description'), listingValued)
  } else if (sub === 'tag') {
    gitListing(rest, 'dasufmFe', set('--delete', '--annotate', '--sign', '--local-user', '--force', '--edit', '--message', '--file'),
      listingValued)
  } else if (sub === 'reflog') {
    if (first !== null && first !== 'show') block(`git reflog ${first}`)
  } else if (sub === 'stash') {
    if (first !== 'list' && first !== 'show') block('git stash modifies the stash')
  } else if (sub === 'notes') {
    const n = firstPositional(rest, set('--ref'))[1]
    if (n !== null && n !== 'list' && n !== 'show') block('git notes modifies notes')
  } else if (sub === 'config') {
    const keys = rest.filter(a => !a.startsWith('-'))
    const reading = rest.some(a => GIT_CONFIG_READ.has(a)) || first === 'get' || first === 'list' || keys.length === 1
    if (rest.some(a => GIT_CONFIG_WRITE.has(a)) || !reading) block('git config writes')
  } else if (sub === 'remote') {
    if (first !== null && first !== 'show' && first !== 'get-url') block(`git remote ${first}`)
  } else if (sub === 'worktree') {
    if (first !== 'list') block('git worktree modifies worktrees')
  } else if (sub === 'submodule') {
    if (first !== null && first !== 'status' && first !== 'summary') block(`git submodule ${first}`)
  } else if (sub === 'apply') {
    if (rest.includes('--apply') || !rest.some(a => ['--check', '--stat', '--numstat', '--summary'].includes(a))) {
      block('git apply writes files')
    }
  } else block(`git subcommand '${sub}' is not on the read-only list`)
}

const GH_VALUED = set('-R', '--repo', '--hostname')
// Read subcommands per `gh` group; any other subcommand is blocked.
const GH_READ: Record<string, ReadonlySet<string>> = {
  search: set('issues', 'prs', 'repos', 'code', 'commits'),
  pr: set('view', 'list', 'diff', 'checks', 'status'),
  issue: set('view', 'list', 'status'),
  run: set('view', 'list'),
  workflow: set('view', 'list'),
  release: set('view', 'list'),
  repo: set('view', 'list'),
  label: set('list'),
  gist: set('view', 'list'),
  secret: set('list'),
  variable: set('list', 'get'),
  auth: set('status'),
  config: set('get', 'list'),
  cache: set('list'),
  ruleset: set('list', 'view', 'check'),
  project: set('list', 'view', 'field-list', 'item-list'),
}
const GH_ANY = set('status', 'help', 'version', 'completion')   // read-only at every depth

// Index of the first non-flag word at or after start. Only -R/--repo/--hostname and
// --help/--version may precede a gh group or subcommand.
function ghFlagEnd(args: Words, start: number): number {
  let i = start
  while (i < args.length && args[i].startsWith('-')) {
    const a = args[i]
    if (GH_VALUED.has(a)) i++
    else if (!(a === '--help' || a === '--version' || /^(-R.|--(repo|hostname)=)/.test(a))) block(`gh flag '${a}' before the subcommand`)
    i++
  }
  return i
}

const GH_API_VALUED = set('--cache', '--hostname', '--jq', '--template', '--preview', '--method', '--header')
const GH_API_BOOL = set('--allow-escape-sequences', '--include', '--paginate', '--silent', '--slurp', '--verbose', '--help')

// Block any non-GET method, request fields, --input, graphql and method-override headers.
function checkGhApi(args: Words): void {
  let i = 0
  while (i < args.length) {
    const a = args[i]
    i++
    let kind: string | null = null
    let value = ''
    if (a.startsWith('--')) {
      const [name, eq, v] = partition(a, '=')
      value = v
      if (['--field', '--raw-field', '--input'].includes(name)) block('gh api with request fields or --input implies POST')
      if (GH_API_VALUED.has(name)) {
        if (!eq) {
          value = i < args.length ? args[i] : ''
          i++
        }
        kind = name === '--method' ? 'X' : name === '--header' ? 'H' : null
      } else if (!GH_API_BOOL.has(name)) block(`unknown gh api flag '${name}'`)
    } else if (/^-[A-Za-z]+.*$/.test(a)) {
      const cs = [...a]
      for (let pos = 1; pos < cs.length; pos++) {
        const ch = cs[pos]
        if ('fF'.includes(ch)) block('gh api with request fields implies POST')
        if ('XHptq'.includes(ch)) {
          value = cs.slice(pos + 1).join('')
          if (!value) {
            value = i < args.length ? args[i] : ''
            i++
          } else if (value.startsWith('=')) value = value.slice(1)
          kind = ch
          break
        }
        if (!'ih'.includes(ch)) block(`unknown gh api flag '-${ch}'`)
      }
    } else if (a.replace(/^\/+/, '').split('?')[0].trim().replace(/\/+$/, '') === 'graphql') block('gh api graphql can mutate')
    if (kind === 'X' && value.toUpperCase() !== 'GET') block(`gh api -X ${value} mutates`)
    if (kind === 'H' && value.toLowerCase().includes('method')) block('gh api header overrides the method')
  }
}

function checkGh(args: Words): void {
  const i = ghFlagEnd(args, 0)
  const group = i < args.length ? args[i] : null
  if (group === null || GH_ANY.has(group)) return
  if (group === 'api') checkGhApi(args.slice(i + 1))
  else if (Object.hasOwn(GH_READ, group)) {
    if (group === 'auth' && (args.includes('--show-token') || args.some(a => shortFlags(a).includes('t')))) {
      block('gh auth status would print the token')
    }
    const j = ghFlagEnd(args, i + 1)
    if (j < args.length && !GH_READ[group].has(args[j])) block(`gh ${group} ${args[j]} is not on the read-only list`)
  } else block(`gh ${group} is not on the read-only list`)
}

const JS_MUT = set('install', 'i', 'in', 'ins', 'inst', 'install-test', 'it', 'add', 'remove', 'rm',
  'r', 'un', 'uninstall', 'unlink', 'up', 'update', 'upgrade', 'ci', 'link', 'ln',
  'dedupe', 'ddp', 'prune', 'rebuild', 'rb', 'init', 'publish', 'version')
const JS_VALUED = set('--prefix', '-C', '--dir', '--cwd', '--filter', '-w', '--workspace',
  '--registry', '--userconfig', '--cache')
const LAUNCH_VALUED = set(...JS_VALUED, '-p', '--package', '--call', '--with', '--with-editable',
  '--with-requirements', '--python', '--project', '--directory',
  '--extra', '--group', '--env-file', '--index', '-s', '--from')

// npx / pnpm exec / uv run / poetry run: check the command being launched.
function checkLauncher(args: Words): void {
  const [i] = firstPositional(args, LAUNCH_VALUED)
  const head = i === null ? args : args.slice(0, i)
  if (head.includes('-c') || head.includes('--call')) block('launcher runs a shell string')   // only before the launched command
  if (i !== null) checkArgv(args.slice(i))
}

function checkJs(cmd: string, args: Words): void {
  const [i, sub] = firstPositional(args, JS_VALUED)
  if (sub === null) {
    if (cmd === 'yarn') block('bare yarn installs')
    return
  }
  const rest = args.slice(i + 1)
  if (JS_MUT.has(sub)) block(`${cmd} ${sub} modifies packages`)
  if (sub === 'pkg' && ['set', 'delete', 'fix'].includes(firstPositional(rest)[1] ?? '')) block(`${cmd} pkg modifies package.json`)
  if (sub === 'audit' && rest.includes('fix')) block(`${cmd} audit fix modifies packages`)
  if (['run', 'run-script', 'exec', 'dlx', 'x'].includes(sub)) checkLauncher(rest)
  else if (cmd === 'yarn' || cmd === 'pnpm') checkArgv(args.slice(i))
}

function checkPip(args: Words): void {
  const [, sub] = firstPositional(args)
  if (sub === 'install' || sub === 'uninstall' || sub === 'sync') block(`pip ${sub} modifies packages`)
}

function checkUv(args: Words): void {
  const [i, sub] = firstPositional(args, LAUNCH_VALUED)
  const rest = sub !== null ? args.slice(i + 1) : []
  const [, subsub] = firstPositional(rest)
  if (sub === 'pip') checkPip(rest)
  else if (['add', 'remove', 'sync', 'lock', 'init', 'venv'].includes(sub ?? '')) block(`uv ${sub} modifies the project`)
  else if ((sub === 'tool' || sub === 'python') && ['install', 'uninstall', 'upgrade'].includes(subsub ?? '')) {
    block(`uv ${sub} ${subsub} modifies the system`)
  } else if (sub === 'run' || (sub === 'tool' && subsub === 'run')) checkLauncher(sub === 'tool' ? rest.slice(1) : rest)
}

function checkPython(args: Words): void {
  const j = args.indexOf('-m')
  if (j >= 0 && j + 1 < args.length) {
    if (args[j + 1] === 'venv' || args[j + 1] === 'ensurepip') block(`python -m ${args[j + 1]} creates files`)
    checkArgv(args.slice(j + 1))
  }
}

function checkCargo(args: Words): void {
  let k = 0
  while (k < args.length && args[k].startsWith('+')) k++
  args = args.slice(k)
  const [, sub] = firstPositional(args)
  if (['install', 'uninstall', 'add', 'remove', 'update', 'new', 'init', 'publish', 'clean', 'fix', 'generate-lockfile'].includes(sub ?? '')) {
    block(`cargo ${sub} modifies files`)
  }
  if (sub === 'fmt' && !args.includes('--check')) block('cargo fmt rewrites files')
  if (sub === 'clippy' && args.includes('--fix')) block('cargo clippy --fix rewrites files')
}

function checkGo(args: Words): void {
  const [i, sub] = firstPositional(args)
  if (['install', 'get', 'fmt', 'fix', 'generate', 'clean'].includes(sub ?? '')) block(`go ${sub} modifies files`)
  if (sub === 'mod' && ['tidy', 'vendor', 'edit', 'init'].includes(firstPositional(args.slice(i + 1))[1] ?? '')) {
    block('go mod modifies files')
  }
}

const SUB_BLOCK: Record<string, ReadonlySet<string>> = {
  gem: set('install', 'uninstall', 'update', 'push'),
  mise: set('install', 'use', 'uninstall', 'upgrade', 'up'),
  poetry: set('add', 'remove', 'install', 'update', 'lock', 'init', 'publish'),
  pipx: set('install', 'uninstall', 'upgrade', 'upgrade-all', 'inject', 'reinstall', 'reinstall-all', 'uninstall-all', 'ensurepath'),
  bundle: set('install', 'update', 'add', 'remove', 'init', 'lock', 'pristine'),
  composer: set('install', 'require', 'update', 'remove', 'create-project', 'init', 'self-update'),
  pipenv: set('install', 'uninstall', 'lock', 'update', 'sync', 'clean'),
  conda: set('install', 'remove', 'update', 'create', 'uninstall', 'upgrade', 'clean'),
}
const PRIVILEGE = set('sudo', 'doas', 'su', 'pkexec')
const SYSTEM_PKG = set('apt', 'apt-get', 'pacman', 'paru', 'yay', 'brew', 'dpkg')
// Formatters: block when a write flag is present.
const WRITE_FLAGS: Record<string, ReadonlySet<string>> = {
  prettier: set('--write', '-w'), eslint: set('--fix'), gofmt: set('-w'),
  goimports: set('-w'), shfmt: set('-w'), 'clang-format': set('-i'),
  autopep8: set('-i', '--in-place'), yapf: set('-i', '--in-place'),
  biome: set('--write', '--apply', '--fix'), stylelint: set('--fix'),
  rubocop: set('-a', '-A', '--autocorrect', '--autocorrect-all', '--auto-correct', '--auto-correct-all'),
}
// Formatters that write unless a dry-run flag is present.
const CHECK_FLAGS: Record<string, ReadonlySet<string>> = {
  black: set('--check', '--diff'), isort: set('--check-only', '--check', '--diff', '-c'), rustfmt: set('--check'),
}
// `<tool> <subcommand>` pairs that write unless a dry-run flag is present.
const FMT_SUBCOMMANDS: Record<string, [string, ReadonlySet<string>]> = { deno: ['fmt', set('--check')] }

// System package managers: only read-only queries pass.
function checkSystemPkg(cmd: string, args: Words): void {
  const [, sub] = firstPositional(args)
  const flags = args.join(' ')
  if (['pacman', 'paru', 'yay'].includes(cmd) && args.some(a => a.startsWith('-Q'))) return
  if ((cmd === 'apt' || cmd === 'apt-get') && ['list', 'show', 'search', 'policy', 'depends', 'rdepends'].includes(sub ?? '')) return
  if (cmd === 'brew' && ['list', 'ls', 'info', 'search', 'deps', 'leaves'].includes(sub ?? '')) return
  if (cmd === 'dpkg' && /(^| )(-l|-L|-s|-S|-p|--list|--listfiles|--status|--search)( |$)/.test(flags)) return
  block(`system package manager '${cmd}'`)
}

const has = (args: Words, flags: ReadonlySet<string>): boolean => args.some(a => flags.has(a))

function checkFormatter(cmd: string, args: Words): void {
  if (Object.hasOwn(WRITE_FLAGS, cmd) && has(args, WRITE_FLAGS[cmd])) block(`${cmd} rewrites files`)
  if (Object.hasOwn(CHECK_FLAGS, cmd) && !has(args, CHECK_FLAGS[cmd])) block(`${cmd} rewrites files unless --check/--diff`)
  if (Object.hasOwn(FMT_SUBCOMMANDS, cmd)) {
    const [sub, dry] = FMT_SUBCOMMANDS[cmd]
    if (firstPositional(args)[1] === sub && !has(args, dry)) block(`${cmd} ${sub} rewrites files`)
  }
  if (cmd === 'ruff' && !args.includes('--diff')) {
    const [, sub] = firstPositional(args)
    if (sub === 'format' && !args.includes('--check')) block('ruff format rewrites files')
    if (args.some(a => a.startsWith('--fix'))) block('ruff --fix rewrites files')
  }
}

// ---------------------------------------------------------------- live systems
//
// Tools that change a cluster, cloud account, service or database. Each is
// allowlisted by verb, so a verb that is not listed (including a new one) blocks.

// tool -> [options that take a value, {read verb: null, or the sub-verbs that read}].
type Verbs = Record<string, ReadonlySet<string> | null>
const reads = (...vs: string[]): Verbs => Object.fromEntries(vs.map(v => [v, null]))

const TF_READ: [ReadonlySet<string>, Verbs] = [
  set('-chdir', '--terragrunt-working-dir', '--terragrunt-config', '--terragrunt-tfpath'),
  {
    ...reads('validate', 'fmt', 'show', 'plan', 'version', 'output', 'graph'),
    providers: set('schema'), state: set('list', 'show', 'pull'), workspace: set('list', 'show'),
  },
]
const DOCKER_COMPOSE = set('ps', 'ls', 'logs', 'config', 'images', 'top', 'version', 'port', 'events')
const DOCKER_VALUED = set('-H', '--host', '-c', '--context', '--config', '-l', '--log-level',
  '-f', '--file', '-p', '--project-name', '--profile', '--env-file', '--project-directory',
  '--tlscacert', '--tlscert', '--tlskey')
const LIVE_READ: Record<string, [ReadonlySet<string>, Verbs]> = {
  kubectl: [
    set('-n', '--namespace', '--context', '--cluster', '--user', '--kubeconfig', '-s',
      '--server', '--token', '--as', '--as-group', '--request-timeout', '-v',
      '--cache-dir', '--certificate-authority', '--client-certificate', '--client-key',
      '--tls-server-name', '--username', '--password', '--profile', '--profile-output'),
    {
      ...reads('get', 'describe', 'logs', 'top', 'events', 'diff', 'explain', 'wait',
        'api-resources', 'api-versions', 'cluster-info', 'version'),
      rollout: set('status', 'history'),
      config: set('view', 'get-contexts', 'current-context', 'get-clusters', 'get-users'),
      auth: set('can-i', 'whoami'),
    },
  ],
  helm: [
    set('-n', '--namespace', '--kube-context', '--kubeconfig', '--kube-apiserver',
      '--kube-token', '--kube-as-user', '--kube-as-group', '--registry-config',
      '--repository-cache', '--repository-config'),
    {
      ...reads('template', 'lint', 'list', 'ls', 'status', 'get', 'show', 'search', 'history', 'version', 'env'),
      dependency: set('list'), dep: set('list'), repo: set('list'),
    },
  ],
  docker: [
    DOCKER_VALUED,
    {
      ...reads('ps', 'logs', 'inspect', 'images', 'top', 'stats', 'port', 'diff', 'history', 'info', 'version', 'events', 'search'),
      image: set('ls', 'list', 'inspect', 'history'),
      container: set('ls', 'list', 'ps', 'inspect', 'logs', 'top', 'stats', 'diff', 'port'),
      network: set('ls', 'inspect'), volume: set('ls', 'inspect'),
      context: set('ls', 'show', 'inspect'), system: set('df', 'info', 'events'),
      compose: DOCKER_COMPOSE,
    },
  ],
  'docker-compose': [DOCKER_VALUED, reads(...DOCKER_COMPOSE)],
  systemctl: [
    set('-H', '--host', '-M', '--machine', '-t', '--type', '-p', '--property', '-s',
      '--signal', '-n', '--lines', '-o', '--output', '--state', '--root', '--message', '--drop-in',
      '--job-mode', '--what', '--kill-whom', '--kill-value', '--timestamp', '--when',
      '--image', '--reboot-argument'),
    reads('status', 'show', 'cat', 'list-units', 'list-unit-files', 'list-timers',
      'list-sockets', 'list-dependencies', 'list-jobs', 'is-active',
      'is-enabled', 'is-failed', 'is-system-running', 'show-environment', 'get-default'),
  ],
  pulumi: [
    set('--cwd', '-C', '-s', '--stack'),
    { ...reads('preview', 'version', 'whoami', 'about', 'logs'), stack: set('ls', 'output', 'history'), config: set('get') },
  ],
  alembic: [set('-c', '--config', '-n', '--name', '-x'), reads('current', 'history', 'heads', 'branches', 'show', 'check', 'list_templates')],
  prisma: [set('--schema'), { ...reads('validate', 'version'), migrate: set('status', 'diff') }],
  flyway: [NONE, reads('info', 'validate', 'version')],
  dbmate: [
    set('-u', '--url', '-d', '--migrations-dir', '-e', '--env', '-s', '--schema-file', '--migrations-table', '--env-file', '--wait-timeout'),
    reads('status', 'wait', 'version'),
  ],
  terraform: TF_READ,
  tofu: TF_READ,
  terragrunt: TF_READ,
}

function checkLive(cmd: string, args: Words): void {
  const [valued, verbs] = LIVE_READ[cmd]
  const [i, sub] = firstPositional(args, valued)
  if (sub === null) return
  if (!Object.hasOwn(verbs, sub)) block(`${cmd} ${sub} may change a live system and is not on the read-only list`)
  const rest = args.slice(i + 1)
  const subs = verbs[sub]
  if (subs !== null) {
    const second = firstPositional(rest, valued)[1]
    if (second !== null && !subs.has(second)) block(`${cmd} ${sub} ${second} may change a live system`)
  }
  if (sub === 'fmt' && !args.some(a => a === '-check' || a === '-check=true')) block(`${cmd} fmt rewrites files`)
  if (cmd === 'helm' && rest.some(a => partition(a, '=')[0] === '--dependency-update' && a !== '--dependency-update=false')) {
    block('helm --dependency-update writes the chart')
  }
  for (const [short, long] of liveOutputs(cmd, sub, rest, valued)) {
    const out = optionValue(rest, short, long)
    if (out !== null && !isScratch(out)) block(`${cmd} ${sub} writes '${out}'`)
  }
}

// [short, long] option pairs that write a local file for this read verb.
function liveOutputs(cmd: string, sub: string, rest: Words, valued: ReadonlySet<string>): [string, string][] {
  if (sub === 'plan') return ['-out', '--out', '-generate-config-out', '--generate-config-out'].map(n => ['', n])
  if (cmd === 'helm' && sub === 'template') return [['', '--output-dir']]
  if (cmd === 'kubectl' && sub === 'cluster-info') return [['', '--output-directory']]
  if (cmd === 'pulumi' && sub === 'preview') return [['', '--save-plan']]
  if ((cmd === 'docker-compose' && sub === 'config') || (sub === 'compose' && firstPositional(rest, valued)[1] === 'config')) {
    return [['-o', '--output']]
  }
  return []
}

const AWS_VALUED = set('--profile', '--region', '--output', '--endpoint-url', '--query', '--color',
  '--cli-read-timeout', '--cli-connect-timeout', '--ca-bundle', '--cli-binary-format')
const AWS_READ_PREFIXES = ['describe-', 'get-', 'list-', 'head-', 'batch-get-', 'filter-', 'lookup-']
const AWS_READ_PAIRS = set('s3 ls', 'logs tail', 'dynamodb query', 'dynamodb scan', 'configure list')
// The last argument is a local file.
const AWS_OUTFILE_VERBS = set('get-object', 'get-object-torrent', 'get-export', 'get-job-output', 'get-sdk', 'get-snapshot-block')

// Only read verbs (describe-*, get-*, list-* and kin) and a few read pairs pass.
function checkAws(args: Words): void {
  const words: string[] = []
  let i = 0
  while (i < args.length && words.length < 2) {
    if (args[i].startsWith('-')) i += AWS_VALUED.has(args[i]) ? 1 : 0
    else words.push(args[i])
    i++
  }
  if (words.length < 2) return
  if (!AWS_READ_PAIRS.has(`${words[0]} ${words[1]}`) && !AWS_READ_PREFIXES.some(p => words[1].startsWith(p))) {
    block(`aws ${words[0]} ${words[1]} may change an account and is not on the read-only list`)
  }
  const last = args[args.length - 1]
  if (AWS_OUTFILE_VERBS.has(words[1]) && !(isScratch(last) || last === '-')) block(`aws ${words[1]} writes a non-scratch file`)
}

const REDIS_VALUED = set('-h', '-p', '-a', '-n', '-u', '-s', '-r', '-i', '-d', '-D', '-t', '--user', '--pass',
  '--sni', '--cacert', '--capath', '--cert', '--key', '--pattern', '--count', '--quoted-pattern', '--cluster')
const REDIS_MODES = set('--scan', '--bigkeys', '--memkeys', '--stat', '--latency', '--latency-history',
  '--latency-dist', '--keystats', '--hotkeys')
const REDIS_READ: Verbs = {
  ...reads('get', 'mget', 'exists', 'ttl', 'pttl', 'type', 'keys', 'scan', 'sscan', 'hscan',
    'zscan', 'hget', 'hgetall', 'hmget', 'hkeys', 'hvals', 'hlen', 'hexists', 'llen',
    'lrange', 'lindex', 'scard', 'smembers', 'sismember', 'srandmember', 'zcard',
    'zrange', 'zrangebyscore', 'zrevrange', 'zscore', 'zrank', 'zcount', 'strlen',
    'getrange', 'info', 'ping', 'dbsize', 'time', 'xlen', 'xrange', 'xrevrange',
    'randomkey', 'dump', 'bitcount', 'echo', 'monitor'),
  config: set('get'), client: set('list', 'info', 'getname'), slowlog: set('get', 'len'),
  memory: set('usage', 'stats'), object: set('encoding', 'freq', 'idletime', 'refcount'),
  xinfo: set('stream', 'groups', 'consumers'), pubsub: set('channels', 'numsub', 'numpat'),
}

// Only read commands pass; bare redis-cli takes commands from stdin.
function checkRedis(args: Words): void {
  if (args.some(a => ['--pipe', '--rdb', '--functions-rdb'].includes(a))) block('redis-cli bulk write or dump option')
  const [i, word] = firstPositional(args, REDIS_VALUED)
  if (word === null) {
    if (!has(args, REDIS_MODES)) block('redis-cli without a command reads commands from stdin')
    return
  }
  const sub = word.toLowerCase()
  if (!Object.hasOwn(REDIS_READ, sub)) block(`redis-cli ${sub} may write or flush`)
  const subs = REDIS_READ[sub]
  if (subs !== null) {
    const second = firstPositional(args.slice(i + 1))[1]
    if (second === null || !subs.has(second.toLowerCase())) block(`redis-cli ${sub} ${second ?? ''} may write`)
  }
}

// client -> [-c/-e letter, its long option, short options whose value is the rest of the word]
const SQL_CLIENTS: Record<string, [string, string, string]> = {
  psql: ['c', '--command', 'dhpUoLFRPTv'],
  mysql: ['e', '--execute', 'hPuDSp'],
  mariadb: ['e', '--execute', 'hPuDSp'],
}
const SQL_EXPLAIN = /^explain\b\s*(\([^)]*\)|(?:(?:analy[sz]e|verbose|format(?:\s*=\s*|\s+)\w+)\s+)*)/i
const SQL_READ = /^\(?\s*(select|show|table|describe|desc|values|with|use)\b/i
const SQL_DML = /\b(insert|update|delete|merge)\b/i
// SELECT forms that write: new tables, files, sequences, sessions, replication, large objects.
// Best effort: user-defined functions can still have side effects.
const SQL_SIDE_EFFECT = new RegExp(
  '\\binto\\b|\\b(nextval|setval|pg_terminate_backend|pg_cancel_backend|' +
    'pg_reload_conf|pg_promote|pg_\\w*replication_slot\\w*|pg_stat\\w*reset\\w*|' +
    'pg_switch_wal|pg_create_restore_point|pg_logical_emit_message|' +
    'pg_rotate_logfile|lo_\\w+|dblink\\w*)\\s*\\(',
  'i',
)
// Long options that write a local file (psql -o and -L have short forms, handled below).
const SQL_OUT_LONG: Record<string, string[]> = { psql: ['--output', '--log-file'], mysql: ['--tee'], mariadb: ['--tee'] }

// The SQL strings given with -c/-e. Files and stdin cannot be checked, so they block.
function sqlCommands(cmd: string, args: Words): string[] {
  const [letter, longName, valued] = SQL_CLIENTS[cmd]
  const found: string[] = []
  let i = 0
  // An option's value: the rest of its word, else the next word.
  const take = (val: string): string => {
    if (!val) {
      val = i < args.length ? args[i] : ''
      i++
    }
    return val
  }
  while (i < args.length) {
    const a = args[i]
    i++
    if (a.startsWith('--')) {
      const [name, eq, val] = partition(a, '=')
      if (name === '--file') block(`${cmd} --file runs SQL that cannot be checked`)
      if (name === longName) found.push(eq ? val : take(''))
      else if (SQL_OUT_LONG[cmd].includes(name)) {
        if (!isScratch(eq ? val : take(''))) block(`${cmd} ${name} writes a non-scratch file`)
      }
    } else if (a.startsWith('-') && a.length > 1) {
      const cs = [...a]
      for (let pos = 1; pos < cs.length; pos++) {
        const ch = cs[pos]
        const restOfWord = cs.slice(pos + 1).join('')
        if (ch === letter) {
          found.push(take(restOfWord))
          break
        }
        if (cmd === 'psql' && ch === 'f') block('psql -f runs SQL that cannot be checked')
        if (cmd === 'psql' && 'oL'.includes(ch)) {
          if (!isScratch(take(restOfWord))) block(`psql -${ch} writes a non-scratch file`)
          break
        }
        if (valued.includes(ch)) break
      }
    }
  }
  return found
}

// Statements of text, split on ; outside quotes, with comments dropped and quoted text emptied
// so that keywords inside literals and comments are not read as SQL.
function splitSql(cmd: string, text: string): string[] {
  const mysql = cmd !== 'psql'
  const stmts: string[] = []
  let out = ''
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i]
    if ('\'"`'.includes(c)) {
      let j = text.indexOf(c, i + 1)
      while (j >= 0 && text.startsWith(c, j + 1)) j = text.indexOf(c, j + 2)   // a doubled quote is an escape
      if (j < 0) block(`${cmd} statement has an unterminated quote`)
      // Backslash escapes differ by server settings, so the span is unreadable.
      if (text.slice(i + 1, j).includes('\\')) block(`${cmd} statement has a backslash inside quotes`)
      out += c + c
      i = j + 1
    } else if (!mysql && /^\$[\p{L}\p{N}\p{M}_]*\$/u.test(text.slice(i, i + 64))) {
      block('psql dollar quote hides text from this check')
    } else if (text.startsWith('/*', i)) {
      if (mysql && (text.startsWith('/*!', i) || text.startsWith('/*M!', i))) block(`${cmd} executable comment`)
      const j = text.indexOf('*/', i + 2)
      if (j < 0) block(`${cmd} statement has an unterminated comment`)
      out += ' '
      i = j + 2
    } else if ((text.startsWith('--', i) && (!mysql || i + 2 >= n || /\s/.test(text[i + 2]))) || (mysql && c === '#')) {
      const j = text.indexOf('\n', i)
      i = j < 0 ? n : j
    } else if (c === ';') {
      stmts.push(out)
      out = ''
      i++
    } else {
      out += c
      i++
    }
  }
  stmts.push(out)
  return stmts.map(s => s.trim()).filter(s => s)
}

function checkSqlStatement(cmd: string, stmt: string): void {
  stmt = stmt.replace(/\\G\s*$/, '')   // mysql's vertical-output terminator
  const explain = SQL_EXPLAIN.exec(stmt)
  if (explain) {   // plain EXPLAIN only plans; ANALYZE runs the statement, so it must read
    if (!/analy[sz]e/i.test(explain[0])) return
    stmt = stmt.slice(explain[0].length)
  }
  const meta = /^\\(d\w*|l)\+?(\s+[^\\\s]+)?$/.test(stmt)
  if (!meta && (!SQL_READ.test(stmt) || stmt.includes('\\') || SQL_SIDE_EFFECT.test(stmt) || (/\bwith\b/i.test(stmt) && SQL_DML.test(stmt)))) {
    block(`${cmd} statement is not a plain read (SELECT, EXPLAIN, SHOW, \\d ...): ${stmt.slice(0, 40)}`)
  }
}

function checkSqlClient(cmd: string, args: Words): void {
  const commands = sqlCommands(cmd, args)
  if (!commands.length) {
    if (cmd === 'psql' && (args.includes('-l') || args.includes('--list'))) return
    block(`${cmd} without -c/-e reads SQL from stdin`)
  }
  for (const text of commands) for (const stmt of splitSql(cmd, text)) checkSqlStatement(cmd, stmt)
}

const LIQUIBASE_VALUED = set('--changelog-file', '--url', '--username', '--password', '--defaults-file',
  '--driver', '--classpath', '--log-level', '--log-file', '--search-path', '--output-file')
const LIQUIBASE_READ = set('status', 'history', 'validate', 'diff', 'snapshot', 'tagexists', 'unexpectedchangesets', 'help')
const KNEX_READ = set('migrate:list', 'migrate:status', 'migrate:currentVersion')

// The command is the first word that is not an option or its value; only reads pass.
function checkLiquibase(args: Words): void {
  const words: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('-')) i += LIQUIBASE_VALUED.has(args[i]) ? 1 : 0
    else words.push(args[i].toLowerCase().replaceAll('-', ''))
  }
  if (!words.length) block('liquibase has no command')
  const out = optionValue(args, '', '--output-file')
  if (out !== null && !isScratch(out)) block(`liquibase --output-file writes '${out}'`)
  const ok = words[0] === 'checks'
    ? words[1] === 'show'
    : LIQUIBASE_READ.has(words[0]) || (words[0].endsWith('sql') && words[0] !== 'executesql')
  if (!ok) block(`liquibase ${words[0]} may change the database`)
}

function checkMigration(cmd: string, args: Words): void {
  for (const a of args) {
    if (((cmd === 'rails' || cmd === 'rake') && a.startsWith('db:')) ||
      (cmd === 'knex' && (a === 'init' || a.startsWith('migrate') || a.startsWith('seed')) && !KNEX_READ.has(a))) {
      block(`${cmd} ${a} changes the database`)
    }
  }
}

// ---------------------------------------------------------------- runners

// Tools that run another command: [verbs that run one, positionals before it, options
// that take a value, whether `--` ends their options, options that run a shell string].
const RUNNERS: Record<string, [ReadonlySet<string> | null, number, ReadonlySet<string>, boolean, string[]]> = {
  'aws-vault': [set('exec'), 1, set('-d', '--duration', '--region', '--mfa-token', '-t', '--prompt',
    '--backend', '--keychain', '--session-ttl', '--assume-role-ttl'), true, []],
  pipenv: [set('run'), 0, NONE, false, []],
  pdm: [set('run'), 0, set('-p', '--project'), false, []],
  hatch: [set('run'), 0, set('-e', '--env'), false, []],
  conda: [set('run'), 0, set('-n', '--name', '-p', '--prefix', '--cwd'), false, []],
  mise: [set('exec', 'x'), 0, set('-C', '--cd', '-E', '--env', '-j', '--jobs'), true, ['-c', '--command']],
  direnv: [set('exec'), 1, NONE, false, []],
  // doppler -c is --config; only --command takes a shell string.
  doppler: [set('run'), 0, set('-c', '--config', '-p', '--project', '-t', '--token', '--fallback',
    '--passphrase', '--mount', '--mount-template', '--mount-format', '--mount-max-reads'), true, ['--command']],
  op: [set('run'), 0, set('--env-file', '--account', '--session'), true, []],
  dotenv: [null, 0, set('-e', '-v', '-p'), true, []],
}
// Flags without a value that the runners accept. Any other option before the inner
// command could take a value that would be mistaken for it, so it blocks.
const RUNNER_FLAGS = set('--no-capture-output', '--live-stream', '--no-masking', '--no-session',
  '--preserve-env', '--forward-signals', '--no-cache', '--no-fallback', '--silent')

// words after the leading options; an option that is neither valued nor a known flag blocks.
function innerCommand(cmd: string, words: Words, valued: ReadonlySet<string>): Words {
  let i = 0
  while (i < words.length && words[i].startsWith('-') && words[i] !== '-') {
    const a = words[i]
    if (a === '--') return words.slice(i + 1)
    if (valued.has(a)) i++
    else if (!RUNNER_FLAGS.has(a) && !a.includes('=')) {
      block(`${cmd} option '${a}' is unknown, so its value could be mistaken for the command`)
    }
    i++
  }
  return words.slice(i)
}

function checkRunner(cmd: string, args: Words): void {
  const [verbs, skip, valued, dashes, shell] = RUNNERS[cmd]
  let rest = args
  if (verbs) {
    const head = dashes && args.includes('--') ? args.slice(0, args.indexOf('--')) : args
    const [i, sub] = firstPositional(head, valued)
    if (sub === null || !verbs.has(sub)) {
      // The verb follows an option this check cannot parse.
      if (head.some(a => verbs.has(a))) block(`${cmd} runs a command after an option that is not understood`)
      return
    }
    rest = args.slice(i + 1)
  }
  let before: Words
  let inner: Words
  if (dashes && rest.includes('--')) {
    before = rest.slice(0, rest.indexOf('--'))
    inner = rest.slice(rest.indexOf('--') + 1)
  } else {
    before = rest
    inner = innerCommand(cmd, rest, valued)
    for (let k = 0; k < skip; k++) inner = innerCommand(cmd, inner.slice(1), valued)
  }
  if (before.some(a => shell.some(s => a === s || a.startsWith(`${s}=`)))) block(`${cmd} runs a shell string`)
  if (cmd === 'hatch' && inner.length) {   // `hatch run env:command`
    const k = inner[0].indexOf(':')
    inner = [k < 0 ? inner[0] : inner[0].slice(k + 1), ...inner.slice(1)]
  }
  checkArgv(inner)
}

// ---------------------------------------------------------------- dispatch

const KEYWORDS = set('then', 'do', 'else', 'elif', 'if', 'while', 'until', 'for', '!', '{', '}')

const RTK_BLOCKED = set('init', 'trust', 'untrust', 'telemetry', 'hook')
const ENV_OK = new RegExp(
  '^(?:LANG|LC_\\w+|TERM|TZ|NO_COLOR|CLICOLOR\\w*|FORCE_COLOR|COLUMNS|LINES|CI|' +
    'GH_REPO|GH_HOST|GH_FORCE_TTY|AWS_PROFILE|AWS_REGION|' +
    // Code-free test settings. NODE_OPTIONS, GOFLAGS, PYTHONPATH and LD_PRELOAD load code.
    'RUST_BACKTRACE|RUST_LOG|RUST_TEST_THREADS|PYTHONHASHSEED|PYTHONFAULTHANDLER|' +
    'PYTHONDONTWRITEBYTECODE|GOMAXPROCS|GOTRACEBACK|NODE_ENV|DEBUG)$',
)
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)(\+?)=/
// `read` only assigns stdin, so it is judged by what the name could launch or load.
const READ_RISKY = /^(?:\w*PAGER|\w*BROWSER|\w*EDITOR|VISUAL|PATH|IFS|ENV|BASH_ENV|PROMPT_COMMAND|LD_\w+|LESS\w*|\w*ASKPASS|GIT_\w+|SSH_\w+|path|fpath|cdpath|manpath|module_path)$/i
const ENV_BUILTINS = set('export', 'declare', 'typeset', 'readonly', 'local')

// Assignment prefixes may only set display variables; a pager only to empty or cat.
// A standalone lowercase assignment passes unless the name is risky, because zsh
// ties lowercase arrays such as `path` to exported variables.
function checkAssignment(word: string, standalone = false): void {
  const m = ASSIGNMENT.exec(word)
  if (!m) return block(`assignment '${word}' names no variable this check can read`)
  const [, name, plus] = m
  const value = partition(word, '=')[2]
  if (ENV_OK.test(name)) return
  if (standalone && name === name.toLowerCase() && !READ_RISKY.test(name)) return
  if (name.endsWith('PAGER') && !plus && (value === '' || value === 'cat')) return
  block(`assignment to ${name} is not on the display-variable list`)
}

function checkEnvBuiltin(cmd: string, args: Words): void {
  if (cmd === 'set') {
    if (args.some(a => shortFlags(a).includes('a')) || args.includes('allexport')) block('set -a exports every assignment')
  } else if (cmd === 'read') {
    let i = 0
    while (i < args.length) {
      const a = args[i]
      i++
      if (a.startsWith('-') && a.length > 1) i += 'adinNptu'.includes(a[a.length - 1]) ? 1 : 0   // a trailing valued option takes the next word
      else if (READ_RISKY.test(a)) block(`read into ${a}`)
    }
  } else {
    for (const a of args) if (!a.startsWith('-')) checkAssignment(a.includes('=') ? a : `${a}=x`)
  }
}

// The command after `env`'s options and NAME=value words.
function envCommand(words: Words): Words {
  let i = 0
  while (i < words.length && words[i].startsWith('-') && words[i].length > 1) {
    const a = words[i]
    i++
    if (a === '--') break
    if (a.startsWith('--')) {
      const name = a.split('=')[0]
      if (name === '--split-string') block('env --split-string runs a shell-like string')
      if (!a.includes('=') && ['--unset', '--chdir', '--argv0'].includes(name)) i++
      continue
    }
    const cs = [...a]
    for (let pos = 1; pos < cs.length; pos++) {
      if (cs[pos] === 'S') block('env -S runs a shell-like string')
      if ('uCa'.includes(cs[pos])) {
        i += pos === cs.length - 1 ? 1 : 0
        break
      }
    }
  }
  while (i < words.length && ASSIGNMENT.test(words[i])) {
    checkAssignment(words[i])
    i++
  }
  return words.slice(i)
}

function dropFlags(words: Words, valued: ReadonlySet<string> = NONE): Words {
  const [i] = firstPositional(words, valued)
  return i !== null ? words.slice(i) : []
}

// Drop VAR=val assignments and transparent wrappers to reach the real command.
function stripWrappers(words: Words): Words {
  while (words.length) {
    const name = basename(words[0])
    let rest = words.slice(1)
    if (ASSIGNMENT.test(words[0])) {
      checkAssignment(words[0], words.every(w => ASSIGNMENT.test(w)))
      words = rest
    } else if (KEYWORDS.has(name)) words = rest
    else if (name === 'command' && rest.some(a => a === '-v' || a === '-V')) return []
    else if (['command', 'builtin', 'exec', 'nohup', 'setsid'].includes(name)) words = dropFlags(rest)
    else if (name === 'time') words = dropFlags(rest, set('-o', '--output', '-f', '--format'))
    else if (name === 'xvfb-run') {
      words = dropFlags(rest, set('-s', '-n', '-e', '-f', '-w', '--server-args', '--server-num', '--error-file', '--auth-file', '--wait'))
    } else if (name === 'strace') {
      const out = optionValue(rest, '-o', '--output')
      if (out !== null && !isScratch(out)) block('strace -o writes a non-scratch file')
      words = dropFlags(rest, set('-o', '-e', '-p', '-s', '-u', '-E', '-I', '-a', '-b', '-O', '-P', '-S', '-X', '-U'))
    } else if (name === 'flock') {
      rest = dropFlags(rest, set('-w', '-E', '--timeout', '--conflict-exit-code'))
      if (words.slice(1).some(a => a === '-c' || a === '--command')) block('flock -c runs a shell string')
      if (rest.length && !/^[0-9]+$/.test(rest[0]) && !isScratch(rest[0])) block(`flock creates its lock file '${rest[0]}'`)
      words = rest.slice(1)
    } else if (name === 'watch') {
      rest = dropFlags(rest, set('-n', '--interval'))
      checkScript(rest.join(' '), 1)   // watch runs its arguments through a shell
      return []
    } else if (name === 'env') words = envCommand(rest)
    else if (name === 'nice') words = dropFlags(rest, set('-n'))
    else if (name === 'stdbuf') words = dropFlags(rest, set('-i', '-o', '-e'))
    else if (name === 'rtk') {   // token-saving proxy: judge what it runs
      rest = dropFlags(rest)
      const sub = rest.length ? rest[0] : null
      const args = rest.slice(1)
      if (sub !== null && RTK_BLOCKED.has(sub)) block(`rtk ${sub} changes settings or runs hooks`)
      if (sub === 'learn' && (args.includes('--write-rules') || args.some(a => shortFlags(a).includes('w')))) block('rtk learn -w writes rules')
      if (sub === 'config' && (firstPositional(args)[1] !== null || args.some(a => a.startsWith('--create')))) block('rtk config writes settings')
      if (sub === 'run') {   // runs a shell string: the -c value and the folded positionals
        const line = optionValue(args, '-c', '--command')
        if (line !== null) checkScript(line, 1)
        checkScript(dropFlags(args, set('-c', '--command')).join(' '), 1)
        return []
      }
      if (sub === 'lint') {
        checkFormatter('eslint', args)
        words = dropFlags(args)
      } else if (sub === 'err' || sub === 'test' || sub === 'summary') {   // args are joined into a `sh -c` string
        checkScript(dropFlags(args).join(' '), 1)
        return []
      } else if (sub === 'proxy') {
        words = dropFlags(args)
        if (words.length === 1) {   // a single word is run through a shell
          checkScript(words[0], 1)
          return []
        }
      } else words = rest
    } else if (name === 'timeout') {
      rest = dropFlags(rest, set('-s', '-k', '--signal', '--kill-after'))
      words = rest.slice(1)   // the DURATION
    } else break
  }
  return words
}

function checkArgv(words: Words): void {
  words = stripWrappers(words)
  if (!words.length) return
  // `npx prisma@5 ...` runs prisma: drop a trailing @version, keeping a leading @scope.
  let cmd = basename(words[0]).replace(/(?<=.)@[^/@]*$/, '')
  const args = words.slice(1)
  if (/^python[0-9.]*$/.test(cmd)) cmd = 'python'
  else if (/^pip[0-9.]*$/.test(cmd)) cmd = 'pip'

  if (PRIVILEGE.has(cmd)) block(`'${cmd}' escalates privileges`)
  else if (cmd === 'eval') block('eval runs arbitrary code')
  else if (ENV_BUILTINS.has(cmd) || cmd === 'set' || cmd === 'read') checkEnvBuiltin(cmd, args)
  else if (args.length === 1 && (args[0] === '--version' || args[0] === '--help')) return
  else if (SYSTEM_PKG.has(cmd)) checkSystemPkg(cmd, args)
  else if (FS_CMDS.has(cmd)) checkFs(cmd, args)
  else if (['bash', 'sh', 'zsh', 'dash'].includes(cmd)) checkShell(cmd, args)
  else if (cmd === 'tar') checkTar(args)
  else if (cmd === 'unzip') checkUnzip(args)
  else if (ARCHIVERS.has(cmd)) checkArchiver(cmd, args)
  else if (cmd === 'sort') checkSort(args)
  else if (cmd === 'rsync') checkRsync(args)
  else if (cmd === 'sed') checkSed(args)
  else if (cmd === 'perl') checkPerl(args)
  else if (cmd === 'find') checkFind(args)
  else if (cmd === 'xargs') checkXargs(args)
  else if (cmd === 'git') checkGit(args)
  else if (cmd === 'gh') checkGh(args)
  else if (['npm', 'pnpm', 'yarn', 'bun'].includes(cmd)) checkJs(cmd, args)
  else if (['npx', 'bunx', 'pnpx', 'uvx'].includes(cmd)) checkLauncher(args)
  else if (cmd === 'pip') checkPip(args)
  else if (cmd === 'uv') checkUv(args)
  else if (cmd === 'python') checkPython(args)
  else if (cmd === 'cargo') checkCargo(args)
  else if (cmd === 'go') checkGo(args)
  else if (Object.hasOwn(SUB_BLOCK, cmd)) {
    const [i, sub] = firstPositional(args)
    if (sub !== null && SUB_BLOCK[cmd].has(sub)) block(`${cmd} ${sub} modifies the system`)
    if (((cmd === 'poetry' || cmd === 'pipx') && sub === 'run') || (cmd === 'bundle' && sub === 'exec')) checkLauncher(args.slice(i! + 1))
    if (Object.hasOwn(RUNNERS, cmd)) checkRunner(cmd, args)
  } else if (Object.hasOwn(RUNNERS, cmd)) checkRunner(cmd, args)
  else if (Object.hasOwn(LIVE_READ, cmd)) checkLive(cmd, args)
  else if (cmd === 'aws') checkAws(args)
  else if (cmd === 'redis-cli') checkRedis(args)
  else if (Object.hasOwn(SQL_CLIENTS, cmd)) checkSqlClient(cmd, args)
  else if (['rails', 'rake', 'knex'].includes(cmd)) checkMigration(cmd, args)
  else if (cmd === 'liquibase') checkLiquibase(args)
  else checkFormatter(cmd, args)
}

const REDIR_OUT = set('>', '>>', '>|', '&>', '&>>', '>&', '<>')

// An expanded word as the tokenizer saw it: its source text with quotes and escapes removed and
// the expansions left as written, so `--out=$f` is still an option and `"/tmp/$d"` still scratch.
const unquoted = (text: string): string => text.replace(/\\([\s\S])|["']/g, (_, c: string | undefined) => c ?? '')

const word = (w: string | null, text: string | undefined): string => w ?? (text === undefined ? EXPANDED : unquoted(text))

// Check one simple command: its redirects first, then its assignments and words.
function checkCommand(c: ShellCommand): void {
  let argv = c.argv.map((w, i) => word(w, c.text[i]))
  // unbash reads a leading `time` as the keyword and leaves its options as the command words.
  if (argv[0]?.startsWith('-')) argv = ['time', ...argv]
  // A subscript is dropped from the name; an expanded subscript leaves the name unknown.
  const assigns = c.assigns.map(a =>
    `${a.name === null ? EXPANDED : a.name.replace(/\[[\s\S]*$/, '')}${a.append ? '+' : ''}=${a.value ?? EXPANDED}`)
  const targets = c.redirects.map(r => word(r.target, r.text))
  const redirects = c.redirects.map((r, i) => `${r.fd ?? ''}${r.op}${targets[i]}`)
  try {
    for (const [i, r] of c.redirects.entries()) {
      const fdDup = (r.op === '>&' || r.op === '<&') && /^(\d+-?|-)$/.test(targets[i])
      if (REDIR_OUT.has(r.op) && !fdDup && !isScratch(targets[i])) block(`redirect to non-scratch path '${targets[i]}'`)
    }
    for (const a of argv) {
      if (a.startsWith('-') && /[\n\r]/.test(a)) block('option word with an embedded newline')   // defeats the flag regexes
    }
    for (const a of assigns) checkAssignment(a, argv.length === 0)
    checkArgv(argv)
  } catch (e) {
    if (e instanceof Block && e.segment === null) e.segment = [...assigns, ...argv, ...redirects].join(' ')
    throw e
  }
}

// Parse a script and check every simple command in it, including those in substitutions.
function checkScript(text: string, depth: number): void {
  const r = depth === 0 ? parse(text) : reparse(text, depth)
  if (r.errors.length) throw new ParseFailure(r.errors[0].message)
  for (const c of r.commands) checkCommand(c)
}

function main(): void {
  if (process.env.READONLY_BASH_TEST_FAULT) throw new Error('injected fault')
  let data: unknown
  try {
    data = JSON.parse(readFileSync(0, 'utf8'))
  } catch (e) {
    if (e instanceof SyntaxError) throw new ParseFailure(e.message)
    throw e
  }
  const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
  const toolInput = isObject(data) ? data.tool_input : null
  const command = isObject(toolInput) ? toolInput.command : null
  if (typeof command !== 'string' || !command.trim()) throw new ParseFailure('input has no command string')
  checkScript(command, 0)
}

let status = 0
let message = ''
try {
  main()
} catch (e) {
  status = 2
  if (e instanceof Block) message = `readonly-bash: blocked${e.segment ? ` '${e.segment}'` : ''} (${e.reason}). ${SCRATCH_MSG}`
  else if (e instanceof ParseFailure) message = `readonly-bash: blocked (parse error: ${e.message}). ${SCRATCH_MSG}`
  else message = `readonly-bash: internal error (${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}); blocking.`
}
try {
  if (message) writeSync(2, `${message}\n`)
} finally {
  process.exit(status)
}
