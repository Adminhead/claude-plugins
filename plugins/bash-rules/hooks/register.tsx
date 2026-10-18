import type { Register } from 'claude-code'
import { DANGER_MESSAGES } from './danger/danger'
import { analyze, withAsk } from './danger/rules'
import { MAX_SQL_FILE, MAX_SQL_FILES, destroysData, sqlFiles, sqlPath, uncheckedMessage } from './danger/sqlfile'
import { hygiene } from './rules/hygiene'
import {
  Lru, SYSTEM, apiFor, backoffMs, completionText, modelNudge, ollamaRequest, ollamaStands, parseModelText, parseOllama, parseOptions, parseSystemone,
  systemoneRequest, userPrompt, wantsSystemone,
} from './rules/judge'
import type { JudgeOptions, ModelVerdict, OllamaApi } from './rules/judge'

// All `$` code for bash-rules lives here. The verdicts are pure: danger/ (destructive, ask), rules/hygiene.ts (read,
// write, smuggle) and rules/judge.ts (the model stages' prompt, replies and cache).

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
  if (!o.ollamaUrl || !o.ollamaModel || (await $.clock.now()) < ollamaDownUntil) return null
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

export const register: Register = (on, options) => {
  const o = parseOptions(options)

  // Denies destructive Bash, Bash that reads or writes files the built-in tools should, and smuggled payloads.
  // analyze() bounds the input length before parsing; the model stages bound what they send.
  on('tool.call', { tool: 'Bash' }, async ($, e: any, next) => {
    if (typeof e.command !== 'string') return next(e)
    const { hit, scan } = analyze(e.command)
    if (hit) return { deny: hit.message }
    if (!scan) return next(e)
    // A script file that cannot be read is left to the classic.PreToolUse ask, never to a model.
    if ((await checkSqlFiles($, sqlFiles(scan.commands))).status === 'destroys') return { deny: DANGER_MESSAGES['db-drop'] }
    const v = hygiene(scan.commands)
    if (v.kind === 'deny') return { deny: v.message }
    if (v.kind === 'pass' || !o.models) return next(e)

    let verdict = cache.get(e.command)
    if (!verdict) {
      const found = (await askOllama($, o, e.command, v.reasons)) ?? (await askFallback($, o, e.command, v.reasons))
      // Both stages unavailable: fail open, already logged.
      if (!found) return next(e)
      verdict = found
      cache.set(e.command, verdict)
    }
    const deny = modelNudge(verdict)
    return deny ? { deny } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'bash-rules: the safety check failed on this command. Rewrite it in plain bash, or hand it to the user to run.' }))

  // Asks before Bash that pipes a download into a shell, rewrites git history, git-cleans ignored files outside a
  // linked worktree, or feeds a database client a script file that could not be checked. A deny from a hook below stands.
  on('classic.PreToolUse', async ($, e: any, next) => {
    if (e.tool !== 'Bash' || typeof e.command !== 'string') return next(e)
    return withAsk(
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
  })
}
