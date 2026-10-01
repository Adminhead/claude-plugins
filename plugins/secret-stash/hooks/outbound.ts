import { update } from 'claude-code'
import type { ApiContentBlock, EngineInterface, NextBudget, On, PluginOptions } from 'claude-code'
import { ConfigInvalid } from './config.ts'
import { loadCtx } from './context.ts'
import { DROPPED, clearFailures, deadlineOf, markStale, markerized, reportCaught, reportDropped, reportFailure, type CachedEvent, type Reporter } from './failclosed.ts'
import type { Io } from './io.ts'
import { redactBlocks, redactText, type RedactCtx } from './redact.ts'
import type { Found } from './types.ts'
import { putAll } from './vault.ts'

// `$` can't cross an import and the state ref must be a literal beside its `$.state` call, so this
// file builds its own Io and Reporter.
const VAULT = { plugin: 'secret-stash', key: 'vault' } as const
const makeIo = ($: EngineInterface): Io => ({
  sessionId: () => $.session.id(),
  getVault: async () => (await $.state.get(VAULT)).value,
  updateVault: change => update($, VAULT, change),
  storeGet: key => $.store.get(key),
  storeSet: (key, value) => $.store.set(key, value),
  run: argv => $.process.run(argv),
  root: () => $.session.root(),
  exists: path => $.fs.exists(path),
  read: path => $.fs.read(path),
})
const reporterOf = ($: EngineInterface): Reporter => ({ toast: t => $.ui.toast(t), status: t => $.ui.status(t), invalidate: e => $.ui.invalidate(e) })

type Redact = { text(t: string): Promise<string>; blocks(b: ApiContentBlock[]): Promise<ApiContentBlock[]> }
type Next<E, R> = { (e: E): Promise<R>; readonly budget: NextBudget }

// Runs `body` with a redactor, then stashes every secret it found. The deadline is set after the
// vault and config load, which cost the hook no budget.
async function redacting<T>($: EngineInterface, options: PluginOptions, budget: NextBudget, body: (r: Redact) => Promise<T>): Promise<T> {
  const io = makeIo($)
  const c = await loadCtx(io, options)
  const rc = { detectors: c.detectors, key: c.key, idFor: c.vault.idFor, deadline: deadlineOf(budget) }
  const found: Found[] = []
  let dropped = false
  const out = await body({
    text: async t => {
      const r = await redactText(t, rc)
      found.push(...r.found)
      return r.text
    },
    blocks: async b => {
      const kept = await dropSecretDocs(b, rc, () => (dropped = true))
      const r = await redactBlocks(kept, rc)
      found.push(...r.found)
      return r.blocks
    },
  })
  await putAll(io, found)
  if (dropped) reportDropped(reporterOf($))
  clearFailures(reporterOf($))
  return out
}

// A text-source document can't be rewritten, only dropped, so one that holds a secret goes.
async function dropSecretDocs(blocks: ApiContentBlock[], rc: RedactCtx, onDrop: () => void): Promise<ApiContentBlock[]> {
  const out: ApiContentBlock[] = []
  for (const b of blocks) {
    const src = b.source as { type?: string; data?: unknown } | undefined
    if (b.type === 'document' && src?.type === 'text' && typeof src.data === 'string') {
      if ((await redactText(src.data, rc)).text !== src.data) onDrop()
      else out.push(b)
    } else if (b.type === 'tool_result' && Array.isArray(b.content)) {
      out.push({ ...b, content: await dropSecretDocs(b.content as ApiContentBlock[], rc, onDrop) })
    } else {
      out.push(b)
    }
  }
  return out.length === 0 && blocks.length > 0 ? [{ type: 'text', text: DROPPED }] : out
}

async function each<T>(xs: readonly T[], f: (x: T) => Promise<T>): Promise<T[]> {
  const out: T[] = []
  for (const x of xs) out.push(await f(x))
  return out
}

// Redacts the event, then passes it down. Any failure answers with `fail` at once, so a thrown
// detector or an overrun never lets the raw event through.
async function forward<E, R>(
  $: EngineInterface,
  options: PluginOptions,
  next: Next<E, R>,
  e: E,
  rewrite: (e: E, r: Redact) => Promise<E>,
  fail: (e: E, err: unknown) => R | Promise<R>,
): Promise<R> {
  let out: E
  try {
    out = await redacting($, options, next.budget, r => rewrite(e, r))
  } catch (err) {
    reportFailure(reporterOf($), err)
    return fail(e, err)
  }
  return next(out)
}

// For hooks that rewrite what comes back up.
async function afterNext<E, R>(
  event: CachedEvent,
  $: EngineInterface,
  options: PluginOptions,
  next: Next<E, R>,
  e: E,
  rewrite: (res: R, r: Redact) => Promise<R>,
  fail: () => R,
): Promise<R> {
  const res = await next(e)
  try {
    return await redacting($, options, next.budget, r => rewrite(res, r))
  } catch (err) {
    reportFailure(reporterOf($), err)
    markStale(event)
    return fail()
  }
}

// `.catch` bodies. A hook that never reached `next` answers with its marker; one that did
// replays, since it only calls `next` with redacted content. An after-next hook never replays,
// because what `next` returned is raw.
type Caught = { readonly called: boolean; readonly error: { kind: 'throw' | 'timeout' } }

function caughtMarker<E>($: EngineInterface, e: E, next: Next<E, unknown> & Caught, marker: (e: E) => E) {
  reportCaught(reporterOf($), next.error)
  return next.called ? next(e) : next(marker(e))
}

function caughtAnswer<E, R>($: EngineInterface, e: E, next: Next<E, R> & Caught, answer: () => R) {
  reportCaught(reporterOf($), next.error)
  return next.called ? next(e) : answer()
}

function caughtResult<R>(event: CachedEvent, $: EngineInterface, next: Caught, answer: () => R) {
  reportCaught(reporterOf($), next.error)
  markStale(event)
  return answer()
}

export function registerOutbound(on: On, options: PluginOptions): void {
  on('prompt.submit', ($, e, next) =>
    forward($, options, next, e,
      async (e, r) => ({ ...e, text: await r.text(e.text), ...(e.context && { context: await each(e.context, r.text) }) }),
      (e, err) => (err instanceof ConfigInvalid ? { drop: err.message } : next(markerized.submit(e))),
    ),
  ).catch(($, e, next) => caughtMarker($, e, next, markerized.submit))

  on('session.append', ($, e, next) =>
    forward($, options, next, e,
      async (e, r) => ({ ...e, message: { ...e.message, content: await r.blocks(e.message.content) } }),
      e => next(markerized.append(e)),
    ),
  ).catch(($, e, next) => caughtMarker($, e, next, markerized.append))

  on('prompt.section', ($, e, next) =>
    afterNext('prompt.section', $, options, next, e, async (res, r) => (res.text === null ? res : { text: await r.text(res.text) }), markerized.section),
  ).catch(($, _e, next) => caughtResult('prompt.section', $, next, markerized.section))

  on('prompt.context', ($, e, next) =>
    afterNext('prompt.context', $, options, next, e, async (res, r) => {
      let changed = false
      const blocks = await each(res.blocks, async b => {
        const text = await r.text(b.text)
        if (text === b.text) return b
        changed = true
        return { ...b, text }
      })
      // The files behind a rewritten claudeMd no longer match it, so they go.
      return changed ? { blocks } : res
    }, markerized.context),
  ).catch(($, _e, next) => caughtResult('prompt.context', $, next, markerized.context))

  on('prompt.attachment', ($, e, next) =>
    afterNext('prompt.attachment', $, options, next, e, async (res, r) => (res.text === null ? res : { text: await r.text(res.text) }), markerized.attachment),
  ).catch(($, _e, next) => caughtResult('prompt.attachment', $, next, markerized.attachment))

  on('tool.describe', ($, e, next) =>
    afterNext('tool.describe', $, options, next, e, async (res, r) => ({ ...res, description: await r.text(res.description) }), markerized.describe),
  ).catch(($, _e, next) => caughtResult('tool.describe', $, next, markerized.describe))

  on('agent.spawn', ($, e, next) =>
    forward($, options, next, e,
      async (e, r) => ({ ...e, prompt: await r.text(e.prompt), description: await r.text(e.description) }),
      markerized.deny,
    ),
  ).catch(($, e, next) => caughtAnswer($, e, next, markerized.deny))

  on('session.send', ($, e, next) =>
    forward($, options, next, e, async (e, r) => ({ ...e, text: await r.text(e.text) }), markerized.send),
  ).catch(($, e, next) => caughtAnswer($, e, next, markerized.send))

  on('session.compact', ($, e, next) =>
    forward($, options, next, e,
      async (e, r) => (e.instructions === undefined ? e : { ...e, instructions: await r.text(e.instructions) }),
      markerized.compact,
    ),
  ).catch(($, e, next) => caughtAnswer($, e, next, markerized.compact))

  on('model.complete', ($, e, next) =>
    forward($, options, next, e,
      async (e, r) => ({ ...e, prompt: await r.text(e.prompt), ...(e.system !== undefined && { system: await r.text(e.system) }) }),
      markerized.deny,
    ),
  ).catch(($, e, next) => caughtAnswer($, e, next, markerized.deny))

  on('model.fork', ($, e, next) =>
    forward($, options, next, e, async (e, r) => ({ ...e, prompt: await r.text(e.prompt) }), markerized.deny),
  ).catch(($, e, next) => caughtAnswer($, e, next, markerized.deny))

  on('model.classify', ($, e, next) =>
    forward($, options, next, e, async (e, r) => ({ ...e, text: await r.text(e.text) }), markerized.deny),
  ).catch(($, e, next) => caughtAnswer($, e, next, markerized.deny))
}
