import type { Register } from 'claude-code'
import { fileToolDeny, mayTouchCredentials } from './danger/credfile'
import type { PathContext } from './danger/credfile'
import { DANGER_MESSAGES } from './danger/danger'
import { analyze, withAsk } from './danger/rules'
import { MAX_SQL_FILE, MAX_SQL_FILES, destroysData, sqlFiles, sqlPath, uncheckedMessage } from './danger/sqlfile'
import { PRIMER, hygiene } from './rules/hygiene'
import { laterDeny } from './rules/outcome'
import {
  Lru, SYSTEM, apiFor, backoffMs, completionText, modelNudge, ollamaRequest, ollamaStands, parseModelText, parseOllama, parseOptions, parseSystemone,
  systemoneRequest, userPrompt, wantsSystemone,
} from './rules/judge'
import type { JudgeOptions, ModelVerdict, OllamaApi } from './rules/judge'
import { appendArgv, line, logFile } from './log/usagelog'

// All `$` code for bash-rules lives here. The verdicts are pure: danger/ (destructive, ask), rules/hygiene.ts (read,
// write, smuggle) and rules/judge.ts (the model stages' prompt, replies and cache).

// Denies that classic hooks below bash-rules issued, per tool_use_id, so tool.call can log them as `denied-later`.
const hookDenies = new Lru<string, string>(256)

// The last error logged per source, so a repeat stays quiet until that source succeeds again.
const lastError: Record<string, string | null> = {}

function report($: any, key: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  if (message !== lastError[key]) $.ui.log(`bash-rules: ${message}`, { to: 'debug' })
  lastError[key] = message
}

// One debug line per model verdict, without the command text.
const trace = ($: any, stage: string, v: ModelVerdict, ms: number) =>
  $.ui.log(`bash-rules: ${stage} answered ${v.category} (${v.confidence.toFixed(2)}) in ${Math.round(ms)} ms`, { to: 'debug' })

const ok = (key: string) => {
  lastError[key] = null
}

// Model verdicts per exact command, so a retry does not call a model again.
const cache = new Lru<string, ModelVerdict>(256)

// The Ollama stage is skipped until this time after a failure.
let ollamaDownUntil = 0

// The endpoint each Ollama model answers, once a refusal has shown it differs from apiFor's guess.
const apis = new Map<string, OllamaApi>()

// Stage 1: the local Ollama model. Null when it is off, down, too slow, unsure or wrong-shaped; the caller falls back.
async function askOllama($: any, o: JudgeOptions, command: string, notes: readonly string[]): Promise<ModelVerdict | null> {
  if (!o.ollamaUrl || !o.ollamaModel) return null
  // A cloud model or a remote server sends the command off this machine: only with ollamaCloud on.
  if (o.ollamaSkip) return (report($, 'ollama', `ollama skipped: ${o.ollamaSkip}`), null)
  if ((await $.clock.now()) < ollamaDownUntil) return null
  const fail = async (error: string, missingModel = false) => {
    ollamaDownUntil = (await $.clock.now()) + backoffMs(missingModel)
    report($, 'ollama', error)
    return null
  }
  // `$.http.fetch` takes no timeout or signal: race it against a `$.clock.sleep` that is aborted once the race settles.
  const started = await $.clock.now()
  const timer = new AbortController()
  const sleep = $.clock.sleep(o.ollamaTimeoutMs, { signal: timer.signal }).then(
    () => ({ timeout: true as const }),
    () => ({ timeout: true as const }),
  )
  const post = (api: OllamaApi) =>
    $.http
      .fetch(`${o.ollamaUrl}${api === 'chat' ? '/api/chat' : '/v1/systemone'}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: api === 'chat' ? ollamaRequest(o.ollamaModel, command, notes) : systemoneRequest(o.ollamaModel, command, notes),
      })
      .then(
        (res: { status: number; text: string }) => ({ api, res }),
        (err: unknown) => ({ api, err }),
      )
  const api = apis.get(o.ollamaModel) ?? apiFor(o.ollamaModel)
  // A chat refusal that names /v1/systemone (a decision model) switches this model's endpoint and retries once.
  const call = post(api).then((r: any) => {
    if (api !== 'chat' || !r.res || !wantsSystemone(r.res.status, r.res.text)) return r
    apis.set(o.ollamaModel, 'systemone')
    return post('systemone')
  })
  const first: any = await Promise.race([call, sleep])
  timer.abort()
  if (first.timeout) return await fail(`ollama: no answer within ${o.ollamaTimeoutMs} ms`)
  if (first.err !== undefined) return await fail(`ollama: ${first.err instanceof Error ? first.err.message : String(first.err)}`)
  const out = first.api === 'chat' ? parseOllama(first.res.status, first.res.text) : parseSystemone(first.res.status, first.res.text)
  if (!out.ok) return out.missingModel ? await fail(out.error, true) : (report($, 'ollama', out.error), null)
  ok('ollama')
  trace($, `ollama ${o.ollamaModel}`, out.verdict, (await $.clock.now()) - started)
  return ollamaStands(out.verdict, o.confidence) ? out.verdict : null
}

// Stage 2: one completion on the fallback model. Its answer is final; null when it is off or fails.
async function askFallback($: any, o: JudgeOptions, command: string, notes: readonly string[]): Promise<ModelVerdict | null> {
  if (!o.fallbackModel) return null
  const started = await $.clock.now()
  try {
    const reply = await $.model.complete({ model: o.fallbackModel, system: SYSTEM, prompt: userPrompt(command, notes), maxTokens: 200 })
    const got = completionText(reply)
    if ('error' in got) return (report($, 'fallback', got.error), null)
    const verdict = parseModelText(got.text)
    if (!verdict) return (report($, 'fallback', `${o.fallbackModel}: reply is not a verdict`), null)
    ok('fallback')
    trace($, o.fallbackModel, verdict, (await $.clock.now()) - started)
    return verdict
  } catch (err) {
    report($, 'fallback', err)
    return null
  }
}

// The script files a command feeds to database clients, read from the session's directory: 'destroys' when one drops,
// truncates or flushes; 'unread' (with the file) when one cannot be read: an expansion, `~`, missing, over 256 KB, or past
// the file cap; else 'clean'. tool.call denies 'destroys'; classic.PreToolUse asks on 'unread'.
type SqlCheck = { status: 'destroys' } | { status: 'unread'; file: string | null } | { status: 'clean' }

async function checkSqlFiles($: any, files: readonly (string | null)[]): Promise<SqlCheck> {
  if (files.length === 0) return { status: 'clean' }
  if (files.length > MAX_SQL_FILES) return { status: 'unread', file: `${files.length} script files` }
  const cwd = await $.session.cwd()
  let unread: SqlCheck | null = null
  for (const f of files) {
    const path = sqlPath(f, cwd)
    try {
      if (path === null) throw new Error('unplaceable')
      const st = await $.fs.stat(path)
      if (st.kind !== 'file' || st.size > MAX_SQL_FILE) throw new Error('not a small file')
      const text = await $.fs.read(path)
      if (typeof text !== 'string') throw new Error('not text')
      if (destroysData(text)) return { status: 'destroys' }
    } catch {
      unread ??= { status: 'unread', file: f }
    }
  }
  return unread ?? { status: 'clean' }
}

// git-clean asks only outside a linked worktree, whose git dir differs from the common one.
async function inLinkedWorktree($: any): Promise<boolean> {
  try {
    const r = await $.process.run(['git', 'rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir'], { timeoutMs: 3000 })
    const [dir, common] = r.stdout.trim().split('\n')
    return r.exitCode === 0 && !!dir && !!common && dir !== common
  } catch {
    return false
  }
}

// Where a file tool's relative and `~` paths point, and where the credentials file lives. A value that cannot be read
// is null; fileToolDeny then checks the path as written.
async function pathContext($: any): Promise<PathContext> {
  const get = async (f: () => Promise<unknown> | unknown) => {
    try {
      const v = await f()
      return typeof v === 'string' && v !== '' ? v : null
    } catch {
      return null
    }
  }
  return {
    cwd: await get(() => $.session.cwd()),
    home: await get(() => $.env.get('HOME')),
    configDir: await get(() => $.env.get('CLAUDE_CONFIG_DIR')),
  }
}

// What the usage log records for one Bash call: which stage settled it and how. `judge` fills it in.
type BashEntry = {
  stage?: 'danger' | 'sql' | 'hygiene' | 'model'
  rule?: string
  category?: string
  tool?: string
  reasons?: string[]
  model?: { source: 'ollama' | 'fallback' | 'cache' | 'off' | 'unavailable'; category?: string; confidence?: number; ms?: number }
}

// The deny text for a command, or null to let it run, with how it was decided recorded in `entry`.
async function judge($: any, o: JudgeOptions, command: string, entry: BashEntry): Promise<string | null> {
  const { hit, scan } = analyze(command)
  if (hit) return (Object.assign(entry, { stage: 'danger', rule: hit.rule }), hit.message)
  if (!scan) return null
  // A script file that cannot be read is left to the classic.PreToolUse ask, never to a model.
  if ((await checkSqlFiles($, sqlFiles(scan.commands))).status === 'destroys') {
    return (Object.assign(entry, { stage: 'sql', rule: 'db-drop' }), DANGER_MESSAGES['db-drop'])
  }
  const v = hygiene(scan.commands)
  entry.stage = 'hygiene'
  if (v.kind === 'deny') return (Object.assign(entry, { category: v.category, tool: v.tool }), v.message)
  if (v.kind === 'pass') return null
  Object.assign(entry, { stage: 'model', reasons: v.reasons })
  if (!o.models) return ((entry.model = { source: 'off' }), null)

  let verdict = cache.get(command)
  if (verdict) entry.model = { source: 'cache', category: verdict.category, confidence: verdict.confidence }
  else {
    const started = await $.clock.now()
    let source: 'ollama' | 'fallback' = 'ollama'
    let found = await askOllama($, o, command, v.reasons)
    if (!found) {
      source = 'fallback'
      found = await askFallback($, o, command, v.reasons)
    }
    // Both stages unavailable: fail open, already logged.
    if (!found) return ((entry.model = { source: 'unavailable' }), null)
    verdict = found
    cache.set(command, verdict)
    entry.model = { source, category: verdict.category, confidence: verdict.confidence, ms: Math.round((await $.clock.now()) - started) }
  }
  return modelNudge(verdict)
}

// Appends one line to today's bash-rules usage log. Never throws: logging must not change a verdict.
async function logLine($: any, kind: string, fields: Record<string, unknown>) {
  try {
    const now = await $.clock.now()
    const r = await $.process.run(appendArgv(logFile('bash-rules', now)), { stdin: line(kind, { session: await $.session.id(), ...fields }, now), timeoutMs: 5000 })
    if (r.exitCode !== 0) report($, 'log', `usage log: ${r.stderr.trim() || `exit ${r.exitCode}`}`)
    else ok('log')
  } catch (err) {
    report($, 'log', err)
  }
}

export const register: Register = (on, options) => {
  const o = parseOptions(options)
  const logging = options?.usageLog !== false

  // Tells the model the read and write rules in the Bash tool's description, which subagents see too. Off with `primer: false`.
  if (options?.primer !== false) on('tool.describe', { tool: 'Bash' }, async ($, e: any, next) => {
    const out: any = await next(e)
    return { ...out, description: `${out?.description ?? e.description}\n\n${PRIMER}` }
  })

  // Denies destructive Bash, Bash that reads or writes files the built-in tools should, and smuggled payloads, and logs
  // each decision with the command's outcome. analyze() bounds the input length before parsing; the model stages bound
  // what they send. The file tools are checked here too (one tool.call hook per plugin): none may touch the
  // credentials file; fileToolDeny bounds each path before matching.
  on('tool.call', { tool: ['Bash', 'Read', 'Grep', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit'] }, async ($, e: any, next) => {
    if (e.tool !== 'Bash') {
      const deny = mayTouchCredentials(e.tool, e) ? fileToolDeny(e.tool, e, await pathContext($)) : null
      return deny !== null ? { deny } : next(e)
    }
    if (typeof e.command !== 'string') return next(e)
    const entry: BashEntry = {}
    const deny = await judge($, o, e.command, entry)
    const fields = { agentId: e.agentId, command: e.command, ...entry }
    if (deny !== null) {
      if (logging) await logLine($, 'bash', { ...fields, decision: 'deny', message: deny })
      return { deny }
    }
    const started = await $.clock.now()
    const out: any = await next(e)
    if (logging) {
      const later = out?.deny !== undefined ? String(out.deny) : laterDeny(out, hookDenies.get(e.tool_use_id))
      const ran = later !== null ? { decision: 'denied-later', message: later } : { decision: 'allow', isError: out?.isError === true }
      await logLine($, 'bash', { ...fields, ...ran, ms: Math.round((await $.clock.now()) - started) })
    }
    return out
  }).catch(($, e: any, next) => {
    if (next.called) return next(e)
    if (e.tool !== 'Bash') return { deny: 'bash-rules: the credentials-file check failed on this call. Retry it, or hand it to the user.' }
    return { deny: 'bash-rules: the safety check failed on this command. Rewrite it in plain bash, or hand it to the user to run.' }
  })

  // Asks before Bash that pipes a download into a shell, rewrites git history, git-cleans ignored files outside a
  // linked worktree, or feeds a database client a script file that could not be checked. A deny from a hook below stands.
  on('classic.PreToolUse', async ($, e: any, next) => {
    if (e.tool !== 'Bash' || typeof e.command !== 'string') return next(e)
    const v = await withAsk(
      e.command,
      () => next(e),
      err => report($, 'ask', err),
      async h => h.rule === 'git-clean' && (await inLinkedWorktree($)),
      async () => {
        const { hit, scan } = analyze(e.command)
        if (hit || !scan) return null
        const sql = await checkSqlFiles($, sqlFiles(scan.commands))
        return sql.status === 'unread' ? { rule: 'sql-unchecked', message: uncheckedMessage(sql.file) } : null
      },
    )
    // A deny from a classic hook below comes back to tool.call as a tool error: keep its text for the log line there.
    if (typeof v.deny === 'string' && typeof e.tool_use_id === 'string') hookDenies.set(e.tool_use_id, v.deny)
    // The tool.call line that follows records whether the command then ran.
    if (logging && typeof v.ask === 'string') await logLine($, 'bash-ask', { agentId: e.agentId, command: e.command, message: v.ask })
    return v
  })
}
