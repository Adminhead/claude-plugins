// The consult tool's pure logic: input validation, prompts, argv and output clipping. No `$` here, so
// `claude plugin test` can exercise it directly; register.tsx runs what this builds.
import { CODEX_EFFORTS, MAX_REPLY, MAX_TIMEOUT_SEC, MODEL } from './appserver'

export { MAX_REPLY, MAX_TIMEOUT_SEC }

// The engine names a registered tool mcp__<plugin>__<name>.
export const TOOL_NAME = 'mcp__consult__consult'
export const MAX_NOTES = 150_000
export const MAX_DIFF = 500_000
export const DEFAULT_TIMEOUT_SEC = 480
// How long after SIGTERM `timeout` waits before SIGKILL.
export const KILL_GRACE_SEC = 5

const LOG_LINES = 20
const LOG_CHARS = 4000
const AGY_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const REV = /^[A-Za-z0-9_][A-Za-z0-9_./@^~-]{0,199}$/
const SECRET = /(^|\/)(\.env(\.[^/]*)?|id_(rsa|ed25519|ecdsa)[^/]*|[^/]*\.(pem|key|p12|pfx)|[^/]*(secret|credential)[^/]*)$/i
const SECRET_OK = /(^|\/)\.env\.(example|sample|template)$/i
// Longer than any real path; refused unread so the regexes never run on huge names.
const MAX_PATH = 4096

export const TOOL = {
  name: 'consult',
  description:
    'Ask codex (OpenAI) or agy (Google Gemini) for a read-only second opinion on a diff or a plan. Sends code or plan text to that vendor. One call is one focused pass and must finish within timeoutSec (default 480, max 540); split larger reviews into several calls. The second-opinion skill, if installed, covers choosing model, effort and pass size.',
  inputSchema: {
    type: 'object',
    properties: {
      // Not `tool`: that key carries the tool name in a tool.call event and cannot be overridden.
      cli: { type: 'string', enum: ['codex', 'agy'], description: 'The reviewer CLI.' },
      mode: { type: 'string', enum: ['diff', 'plan'], description: 'diff reviews changes in a git repo; plan critiques the plan given in notes.' },
      model: { type: 'string', description: 'codex: e.g. gpt-6-astra (list: codex debug models). agy: a gemini-* model, e.g. gemini-4-argon-high (list: agy models).' },
      effort: { type: 'string', enum: CODEX_EFFORTS, description: 'low|medium|high|xhigh|max for both CLIs.' },
      notes: { type: 'string', maxLength: MAX_NOTES, description: 'Plan mode: the plan and what to scrutinize (required). Diff mode: optional focus, such as the dimension or file group for this pass.' },
      repo: { type: 'string', description: 'Directory to review. Default: the session directory.' },
      base: { type: 'string', description: 'Diff mode: review changes relative to this ref (git diff base...HEAD). Excludes commit.' },
      commit: { type: 'string', description: 'Diff mode: review the changes of this commit. Excludes base.' },
      timeoutSec: { type: 'integer', minimum: 1, maximum: MAX_TIMEOUT_SEC, description: `Default ${DEFAULT_TIMEOUT_SEC}.` },
    },
    required: ['cli', 'mode', 'model', 'effort'],
  },
}

export type Consult = {
  cli: 'codex' | 'agy'
  mode: 'diff' | 'plan'
  model: string
  effort: string
  notes: string
  repo?: string
  base?: string
  commit?: string
  timeoutSec: number
}
export type Checked = { ok: Consult } | { error: string }

function optional(v: unknown, name: string, max: number): string | undefined | { error: string } {
  if (v === undefined) return undefined
  if (typeof v !== 'string' || v === '' || v.length > max || v.includes('\0')) return { error: `${name} must be a non-empty string of at most ${max} characters` }
  return v
}

export function validate(input: Record<string, any>): Checked {
  const { cli, mode, model, effort } = input
  if (cli !== 'codex' && cli !== 'agy') return { error: 'cli must be codex or agy' }
  if (mode !== 'diff' && mode !== 'plan') return { error: 'mode must be diff or plan' }
  if (typeof model !== 'string' || !MODEL.test(model.slice(0, 101))) return { error: 'model is required and must look like a model id (see the matrix in the second-opinion skill)' }
  if (typeof effort !== 'string' || effort === '') return { error: 'effort is required (see the matrix in the second-opinion skill)' }
  if (cli === 'codex' && !CODEX_EFFORTS.includes(effort)) return { error: 'codex effort must be low|medium|high|xhigh|max (ultra is not allowed)' }
  if (cli === 'agy') {
    if (!AGY_EFFORTS.includes(effort)) return { error: 'agy effort must be low|medium|high|xhigh|max' }
    if (!model.startsWith('gemini-')) return { error: 'agy model must be a gemini-* model (a different family from Claude)' }
  }
  const notes = input.notes ?? ''
  if (typeof notes !== 'string') return { error: 'notes must be a string' }
  if (notes.length > MAX_NOTES) return { error: `notes is ${notes.length} characters; the limit is ${MAX_NOTES}. Split the review into smaller passes.` }
  if (mode === 'plan' && notes.trim() === '') return { error: 'plan mode needs the plan in notes' }
  const repo = optional(input.repo, 'repo', 1024)
  if (typeof repo === 'string' && /[\r\n]/.test(repo)) return { error: 'repo must not contain a newline' }
  const base = optional(input.base, 'base', 200)
  const commit = optional(input.commit, 'commit', 200)
  for (const v of [repo, base, commit]) if (typeof v === 'object') return v
  if (base !== undefined && commit !== undefined) return { error: 'base and commit are mutually exclusive' }
  if ((base !== undefined || commit !== undefined) && mode !== 'diff') return { error: 'base and commit apply to diff mode only' }
  for (const [name, v] of [['base', base], ['commit', commit]] as const) {
    if (typeof v === 'string' && !REV.test(v)) return { error: `${name} must match ${REV} and not start with "-"` }
  }
  const t = input.timeoutSec ?? DEFAULT_TIMEOUT_SEC
  if (typeof t !== 'number' || !Number.isInteger(t) || t < 1 || t > MAX_TIMEOUT_SEC) return { error: `timeoutSec must be an integer from 1 to ${MAX_TIMEOUT_SEC}` }
  return { ok: { cli, mode, model, effort, notes, repo: repo as string | undefined, base: base as string | undefined, commit: commit as string | undefined, timeoutSec: t } }
}

// Hardened git: the repo's config cannot run a pager, fsmonitor, external diff, textconv or signature
// check. Clean/smudge filter drivers can still run, since the diff reads the worktree.
const HARDEN = ['-c', 'core.fsmonitor=false', '-c', 'core.pager=cat', '-c', 'diff.external=', '-c', 'log.showSignature=false', '-c', 'core.quotePath=false']
const git = (repo: string, ...a: string[]) => ['git', '-C', repo, '--no-pager', '--literal-pathspecs', ...HARDEN, ...a]
const NO_EXT = ['--no-ext-diff', '--no-textconv']

export function target(c: Consult): string {
  if (c.base) return `the changes on this branch relative to ${c.base} (git diff ${c.base}...HEAD)`
  if (c.commit) return `the changes introduced by commit ${c.commit}`
  return 'the uncommitted changes (git diff HEAD plus untracked files)'
}

// Commands whose combined stdout lists, NUL-separated, the files a diff-mode review would send.
// `repo` is the git toplevel, so the untracked listing covers the whole repo.
export function fileListArgvs(c: Consult, repo: string): string[][] {
  if (c.base) return [git(repo, 'diff', '--name-only', '-z', `${c.base}...HEAD`)]
  if (c.commit) return [git(repo, 'show', '--name-only', '-z', '--format=', c.commit)]
  return [git(repo, 'diff', '--name-only', '-z', 'HEAD'), git(repo, 'ls-files', '-z', '--others', '--exclude-standard')]
}

// The tracked part of the diff, for agy's input file. In the default mode untracked files follow (UNTRACKED_DIFF).
export function diffArgv(c: Consult, repo: string): string[] {
  if (c.base) return git(repo, 'diff', ...NO_EXT, `${c.base}...HEAD`)
  if (c.commit) return git(repo, 'show', ...NO_EXT, c.commit)
  return git(repo, 'diff', ...NO_EXT, 'HEAD')
}

// Takes the git toplevel as $1. `diff --no-index` exits 1 when files differ, so the pipeline's status is ignored.
const GIT_SH = 'git -c core.fsmonitor=false -c core.pager=cat -c diff.external= -c log.showSignature=false -c core.quotePath=false --no-pager --literal-pathspecs'
export const UNTRACKED_DIFF = `cd -- "$1" && ${GIT_SH} ls-files -z --others --exclude-standard | xargs -0 -n1 ${GIT_SH} diff --no-index --no-ext-diff --no-textconv -- /dev/null || true`

// $1: the repo to review ('' for the default), $2: the session directory. Prints the resolved repo, then its
// git toplevel (an empty line outside git). Exit 2: no such directory, or outside the session's repo.
// Exit 3: a .claude/no-external-review marker in the repo, an ancestor up to the session's toplevel, or the main checkout.
export const PREFLIGHT = [
  'cd -- "$2" 2>/dev/null || { echo "no such directory: $2" >&2; exit 2; }',
  'root=$(git rev-parse --show-toplevel 2>/dev/null) || root=$PWD',
  'root=$(cd -- "$root" && pwd -P)',
  'dir=${1:-$root}',
  'cd -- "$dir" 2>/dev/null || { echo "no such directory: $dir" >&2; exit 2; }',
  'dir=$(pwd -P)',
  'case "$dir/" in "$root"/*) ;; *) echo "repo $dir is outside $root" >&2; exit 2 ;; esac',
  'blocked() { if [ -e "$1/.claude/no-external-review" ]; then echo "external review disabled for this repo ($1/.claude/no-external-review)" >&2; exit 3; fi; }',
  'd=$dir; while :; do blocked "$d"; [ "$d" = "$root" ] && break; d=$(dirname "$d"); done',
  'top=$(git rev-parse --show-toplevel 2>/dev/null) && top=$(cd -- "$top" && pwd -P) || top=',
  '[ -z "$top" ] || blocked "$top"',
  'common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && blocked "$(dirname "$common")"',
  'printf "%s\\n%s\\n" "$dir" "$top"',
].join('\n')

export const WRITE_FILE = 'mkdir -p "$(dirname "$1")" && cat > "$1"'

// `names` is NUL-separated, as `git ... -z` prints it.
export function blockedFiles(names: string): string[] {
  return names
    .split('\0')
    .filter(n => n !== '' && (n.length > MAX_PATH || (SECRET.test(n) && !SECRET_OK.test(n))))
}

export function preamble(c: Consult, repo: string, canRead = true): string {
  if (c.mode === 'diff') {
    return `You are an independent code reviewer from a different model family than the author. Review ${target(c)} in the repository at ${repo}. Report only real defects: correctness, security, data loss, concurrency, broken contracts, missing error handling. For each, give file:line, severity (high/medium/low), and a concrete failure scenario. Skip style nits. Do not modify any files. If you find nothing significant, say so.`
  }
  return `You are an adversarial reviewer from a different model family than the author. Critique the plan below. Find flaws, wrong assumptions, missing risks, unverified claims, and cheaper or simpler alternatives. ${canRead ? `You may read files in ${repo} to check claims, but do not modify anything.` : 'Do not modify anything.'} Output a numbered list; each item gives severity (high/medium/low), the problem, evidence, and the change you recommend. If the plan is sound, say so and name its weakest point.`
}

const withNotes = (p: string, notes: string) => (notes === '' ? p : `${p}\n\n--- Notes from the requester ---\n${notes}`)

// `timeout` kills the CLI itself; a SIGTERM that is ignored becomes SIGKILL after the grace.
const guarded = (c: Consult, argv: string[]) => ['timeout', '-k', String(KILL_GRACE_SEC), String(c.timeoutSec), ...argv]

// The prompt goes on stdin. Diff mode runs in the repo; plan mode points codex at it.
export function codexCall(c: Consult, repo: string): { argv: string[]; cwd?: string; stdin: string } {
  const common = ['-m', c.model, '-c', `model_reasoning_effort="${c.effort}"`, '--ephemeral']
  const stdin = withNotes(preamble(c, repo), c.notes)
  if (c.mode === 'diff') return { argv: guarded(c, ['codex', 'exec', 'review', '-', '-c', 'sandbox_mode="read-only"', ...common]), cwd: repo, stdin }
  return { argv: guarded(c, ['codex', 'exec', '-', '-s', 'read-only', '--skip-git-repo-check', '-C', repo, ...common]), stdin }
}

// agy has no read-only mode and ignores stdin in print mode. It runs in an empty workspace whose
// PreToolUse hook allows only file-reading tools, and the notes and diff go in a file there.
export const AGY_INPUT = 'review-input.md'

export function agyHooksJson(gate: string): string {
  return JSON.stringify({ 'second-opinion-readonly': { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: gate, timeout: 10 }] }] } })
}

export function agyInputText(c: Consult, diff: string): string {
  const parts: string[] = []
  if (c.notes !== '') parts.push(`--- Notes from the requester ---\n\n${c.notes}`)
  if (c.mode === 'diff') parts.push(`--- Diff under review ---\n${clip(diff, MAX_DIFF, 'diff')}`)
  return parts.join('\n\n') + '\n'
}

export function agyCall(c: Consult, repo: string, ws: string): { argv: string[]; cwd: string } {
  const prompt = `${preamble(c, repo, false)}\n\nBefore anything else, read ${ws}/${AGY_INPUT} in full (use as many view_file calls as it takes). It holds the requester's notes and any diff under review. Shell commands are disabled. The repository itself is not in your workspace, so judge from that file alone.`
  return { argv: guarded(c, ['agy', '--model', c.model, '--effort', c.effort, '-p', prompt]), cwd: ws }
}

export function clip(text: string, max: number, what: string): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n[${what} truncated at ${max} characters]`
}

export function header(c: Consult, repo: string): string {
  return `second-opinion: ${c.cli} ${c.model}/${c.effort} mode=${c.mode} repo=${repo}`
}

export function tail(...logs: string[]): string {
  return logs.join('\n').trim().split('\n').slice(-LOG_LINES).join('\n').slice(-LOG_CHARS)
}

// The tool-error text for a CLI that exited non-zero, or exited 0 with nothing to say.
export function failure(c: Consult, exitCode: number, stdout: string, stderr: string): string {
  const log = tail(stderr, stdout)
  if (exitCode === 124 || exitCode === 137) {
    return `consult timed out: ${c.cli} did not finish within ${c.timeoutSec}s (exit ${exitCode}). Split the review into smaller passes instead of retrying at a higher effort.\n${log}`
  }
  if (exitCode === 0) return `consult failed: ${c.cli} exited 0 with an empty reply.\n${log}`
  return `consult failed: ${c.cli} exited ${exitCode}.\n${log}`
}
