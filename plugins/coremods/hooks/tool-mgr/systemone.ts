// Pure logic for the systemone model check on Bash commands. Nothing here touches `$`: fetch, sleep, now and the log
// line come in as `Deps`. The model can add an ask or a bypass deny to a verdict; it never relaxes one.

import { HAND_OVER } from './rules'
import type { Verdict } from './rules'

export const DEFAULT_MODEL = 'ggml-org/Kev-4B-GGUF:Q8_0'
export const PROMPT_VERSION = 1

const TIMEOUT_MS = 1000
const MAX_MODEL_INPUT = 4000
const MAX_REPLY = 64 * 1024
const MAX_PENDING = 4
const BREAKER_FAILURES = 3
const BREAKER_MS = 60_000
const MEMO_SIZE = 256

export type Cal = { allowBelow: number; bypassAtLeast?: number }

// Only Kev is calibrated. Another model gets the ask path with `allowBelow` 0.5 and no bypass question.
export const CALIBRATED: Record<string, Cal> = { [DEFAULT_MODEL]: { allowBelow: 0.5, bypassAtLeast: 0.6 } }
export const calFor = (model: string): Cal => CALIBRATED[model] ?? { allowBelow: 0.5 }

// --- config ---

export type Config = { url: string; model: string }

const LOOPBACK = new Set(['127.0.0.1', '[::1]', 'localhost'])

// `<url>|<model>` from the user-settings env. Unset or blank means off; a bad value is an error and also off.
export function parseConfig(raw: string | undefined): { config: Config | null; error?: string } {
  if (raw === undefined || raw.trim() === '') return { config: null }
  const bar = raw.indexOf('|')
  const url = (bar < 0 ? raw : raw.slice(0, bar)).trim()
  const model = bar < 0 ? DEFAULT_MODEL : raw.slice(bar + 1).trim()
  const bad = (why: string) => ({ config: null, error: `TOOL_MGR_SYSTEMONE: ${why}` })
  if (model === '') return bad('the model after "|" is empty')
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return bad('the URL does not parse')
  }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && LOOPBACK.has(u.hostname))) return bad('the URL must be https, or http on 127.0.0.1, [::1] or localhost')
  if (u.username !== '' || u.password !== '' || url.includes('#')) return bad('the URL must have no userinfo or fragment')
  return { config: { url: u.href, model } }
}

// --- questions ---

const CTX =
  "A coding agent wants to run this bash command on the developer's machine. Edits and reads of project files must go through the Edit/Read tools, not through shell tricks."

const DECISION = {
  type: 'choice',
  instructions: CTX + ' Decide what the guard should do.',
  criteria: {
    allow: 'Safe, read-only or ordinary build/test/inspect command with no destructive or exfiltrating effect.',
    ask: 'Writes or reads project files through the shell (sed -i, tee, redirects, heredocs, cat of source) bypassing Edit/Read, or is risky but not clearly destructive.',
    deny: 'Destructive, irreversible, privilege-escalating, remote-code-executing, or credential-exfiltrating, including obfuscated forms (eval, base64, variable indirection, nested bash -c, aliases).',
  },
} as const

const BYPASS = {
  type: 'noul',
  instructions:
    CTX +
    ' Does this command read or modify source/project files via the shell (sed -i, perl -pi, tee, > or >> redirect, heredoc, cat file, head/tail/sed -n on a file, python/node file write) instead of the Edit/Read tools?',
} as const

export const buildRequest = (state: string, model: string, withBypass: boolean) => ({
  state,
  questions: withBypass ? { decision: DECISION, bypass: BYPASS } : { decision: DECISION },
  model,
})

// --- reply ---

export type Answer = { model: string; choice: 'allow' | 'ask' | 'deny'; allow: number; ask: number; deny: number; bypass: number | null }

const LABELS = ['allow', 'ask', 'deny'] as const
const isScore = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// Strict: a choice with exactly allow/ask/deny, finite scores in [0,1] summing to 1±0.05, and, when `bypass` was
// asked, a noul score in [0,1]. Anything else is null (malformed).
export function parseReply(text: string, withBypass: boolean): Answer | null {
  if (text.length > MAX_REPLY) return null
  let reply: unknown
  try {
    reply = JSON.parse(text)
  } catch {
    return null
  }
  if (!isObj(reply) || typeof reply.model !== 'string' || !isObj(reply.answers)) return null
  const d = reply.answers.decision
  if (!isObj(d) || d.type !== 'choice' || !LABELS.includes(d.choice as never) || !isObj(d.probabilities)) return null
  const p = d.probabilities
  if (Object.keys(p).length !== 3 || !LABELS.every(l => isScore(p[l]))) return null
  const [allow, ask, deny] = LABELS.map(l => p[l] as number)
  if (Math.abs(allow + ask + deny - 1) > 0.05) return null
  let bypass: number | null = null
  if (withBypass) {
    const b = reply.answers.bypass
    if (!isObj(b) || b.type !== 'noul' || !isScore(b.noul)) return null
    bypass = b.noul
  }
  return { model: reply.model, choice: d.choice as Answer['choice'], allow, ask, deny, bypass }
}

// --- decision ---

const f2 = (n: number) => n.toFixed(2)

// `inner` is withAsk()'s verdict. The model never touches a deny, never turns a danger ask into a deny, and never
// removes an ask. `rule` names a deny the model made, for the deny log. The first matching row wins.
export function merge(inner: Verdict, answer: Answer | null, askTier: 'ask' | 'deny', cal: Cal): { verdict: Verdict; rule: 'systemone' | 'systemone-bypass' | null } {
  const same = { verdict: inner, rule: null }
  if (answer === null || inner.deny !== undefined) return same
  const { allow: _allow, ask: _ask, ...rest } = inner
  if (cal.bypassAtLeast !== undefined && answer.bypass !== null && answer.bypass >= cal.bypassAtLeast) {
    const b = f2(answer.bypass)
    const message =
      answer.choice === 'deny'
        ? `tool-mgr: the systemone model scores this as reading or editing files through the shell (bypass ${b}) and as dangerous (allow ${f2(answer.allow)}, ask ${f2(answer.ask)}, deny ${f2(answer.deny)}).${HAND_OVER}`
        : `tool-mgr: the systemone model scores this as reading or editing files through the shell (bypass ${b}). Use Read to read a file, Edit or Write to change one, and Grep or Glob to search. If no built-in tool fits, hand the command to the user. Do not reword it to get past this check.`
    return { verdict: { ...rest, deny: message }, rule: 'systemone-bypass' }
  }
  if (inner.ask !== undefined || !(answer.allow < cal.allowBelow)) return same
  const unsure = `tool-mgr: the systemone model is unsure this command is safe (allow ${f2(answer.allow)}, ask ${f2(answer.ask)}, deny ${f2(answer.deny)}).`
  return askTier === 'deny' ? { verdict: { ...rest, deny: unsure + HAND_OVER }, rule: 'systemone' } : { verdict: { ...rest, ask: unsure }, rule: null }
}

// --- judge ---

export type Deps = {
  fetch: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; text: string }>
  sleep: (ms: number, opts: { signal: AbortSignal }) => Promise<unknown>
  now: () => Promise<number>
  report: (message: string) => void // one log line; never carries the command
  fresh?: () => void // a request just came back good (not a memo hit)
}

type Outcome = { answer: Answer } | { fail: string }

// The model check with its state: memo, in-flight sharing, breaker, and the cap on pending requests. Each call brings
// its own `deps`, so its request and timers run on that call's host. `judge` resolves to null when there is no answer
// (failed, too long, busy, breaker open) and the static verdict stands. `reset` is for session.end: it clears the state
// and voids replies still in flight.
export function createJudge() {
  const memo = new Map<string, Answer>()
  const shared = new Map<string, Promise<Answer | null>>()
  const waiters = new Set<() => void>()
  let generation = 0
  let pending = 0
  let failures = 0
  let openedAt = 0
  let probing = false

  const wake = () => {
    for (const w of [...waiters]) w()
  }

  const reset = () => {
    generation++
    memo.clear()
    shared.clear()
    failures = 0
    probing = false
    pending = 0
    wake() // calls waiting for a slot see the new generation and give up
  }

  // Synchronous, so concurrent outcomes cannot interleave. `t` is the time of the outcome.
  function record(deps: Deps, gen: number, fail: string | null, t: number) {
    if (gen !== generation) return
    if (fail === null) {
      if (failures >= BREAKER_FAILURES) deps.report('systemone: back after a good reply')
      failures = 0
      probing = false
      deps.fresh?.()
      return
    }
    deps.report(`systemone: ${fail}`)
    const wasOpen = failures >= BREAKER_FAILURES
    failures++
    if (!wasOpen && failures >= BREAKER_FAILURES) {
      openedAt = t
      deps.report(`systemone: ${BREAKER_FAILURES} failures in a row, skipping the model for ${BREAKER_MS / 1000} s`)
    } else if (probing) {
      openedAt = t // a failed probe reopens the window quietly
      probing = false
    }
  }

  // The request has `budget` ms of the call's deadline left.
  async function attempt(deps: Deps, cfg: Config, body: string, withBypass: boolean, gen: number, budget: number): Promise<Answer | null> {
    pending++
    const req: Promise<Outcome> = (async () => {
      try {
        const r = await deps.fetch(cfg.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
        if (r.status < 200 || r.status > 299) return { fail: `http ${r.status}` }
        const answer = parseReply(r.text, withBypass)
        if (answer === null) return { fail: 'malformed reply' }
        return answer.model === cfg.model ? { answer } : { fail: 'the reply came from a different model than configured' }
      } catch {
        return { fail: 'connection error' }
      }
    })()
    // A late reply is ignored: it only frees its slot, and only in the generation that took it. A timeout already counted as a failure.
    req.then(() => {
      if (gen !== generation) return
      pending--
      wake()
    })
    const signal = new AbortController()
    const timer = deps.sleep(budget, { signal: signal.signal }).then(
      () => 'timeout' as const,
      () => 'timeout' as const,
    )
    const first = await Promise.race([req, timer])
    signal.abort()
    const out: Outcome = first === 'timeout' ? { fail: `no reply within ${TIMEOUT_MS} ms` } : first
    record(deps, gen, 'fail' in out ? out.fail : null, await deps.now())
    return 'answer' in out ? out.answer : null
  }

  // The deadline is TIMEOUT_MS from the start of the call. A call at the cap waits for a slot within it, then gives up
  // with one busy line. After each `await` the breaker and cap checks and the claim of the slot (and the probe slot) run
  // without yielding, so concurrent calls past the window send a single probe, and a call the cap refuses never takes it.
  async function start(deps: Deps, cfg: Config, command: string): Promise<Answer | null> {
    const gen = generation
    let t = await deps.now()
    const deadline = t + TIMEOUT_MS
    for (;;) {
      if (gen !== generation) return null
      const open = failures >= BREAKER_FAILURES
      if (open && (probing || t < openedAt + BREAKER_MS)) return null
      if (pending < MAX_PENDING) {
        if (open) probing = true
        const withBypass = calFor(cfg.model).bypassAtLeast !== undefined
        return attempt(deps, cfg, JSON.stringify(buildRequest(command, cfg.model, withBypass)), withBypass, gen, deadline - t)
      }
      const ctl = new AbortController()
      let free!: () => void
      const slot = new Promise<'slot'>(res => waiters.add((free = () => res('slot'))))
      const timer = deps.sleep(Math.max(deadline - t, 0), { signal: ctl.signal }).then(
        () => 'timeout' as const,
        () => 'timeout' as const,
      )
      const won = await Promise.race([slot, timer])
      ctl.abort()
      waiters.delete(free)
      if (won === 'timeout') {
        deps.report('systemone busy: too many requests pending, not assessed')
        return null
      }
      t = await deps.now()
    }
  }

  // The in-flight entry is set before the first await, so a concurrent identical call joins it. The joiner waits on the
  // originator's request, so it runs on the originator's deps.
  function judge(cfg: Config, command: string, deps: Deps): Promise<Answer | null> {
    if (command.length > MAX_MODEL_INPUT) {
      deps.report(`systemone: command over ${MAX_MODEL_INPUT} chars, not assessed`)
      return Promise.resolve(null)
    }
    const key = `${cfg.model}\0${PROMPT_VERSION}\0${command}`
    const hit = memo.get(key)
    if (hit) return Promise.resolve(hit)
    const running = shared.get(key)
    if (running) return running
    const gen = generation
    const run = start(deps, cfg, command).then(
      answer => {
        if (gen === generation) {
          shared.delete(key)
          if (answer) {
            if (memo.size >= MEMO_SIZE) memo.delete(memo.keys().next().value as string)
            memo.set(key, answer)
          }
        }
        return answer
      },
      err => {
        if (gen === generation) shared.delete(key) // a rejection must not stay in the map
        throw err
      },
    )
    shared.set(key, run)
    return run
  }

  return { judge, reset }
}
