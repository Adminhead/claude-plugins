import type { EngineInterface, On, PluginOptions } from 'claude-code'
import { update } from 'claude-code'
import { loadConfig, type Config } from './config.ts'
import { MIN_SECRET_LEN } from './ids.ts'
import type { Io } from './io.ts'
import { StreamRestorer, restoreDeep } from './restore.ts'
import type { Lookup } from './types.ts'
import { ensureLoaded, type Vault } from './vault.ts'

// Tool fields that feed a model or a peer keep their IDs. `tool` is an exact name or a prefix
// ending in `*`; no `fields` means every field. The project file's `skipRestore` adds to these.
//
// WebFetch.url is restored, so a page that echoes the URL hands the value to WebFetch's
// summarizer, which no hook covers.
export type SkipRule = { tool: string; fields?: readonly string[] }
export const RESTORE_SKIP: readonly SkipRule[] = [
  { tool: 'WebFetch', fields: ['prompt'] },
  { tool: 'WebSearch', fields: ['query'] },
  { tool: 'Agent', fields: ['prompt', 'description'] },
  { tool: 'SendMessage' },
  { tool: 'SendFeedback' },
  { tool: 'RemoteTrigger', fields: ['body'] },
  { tool: 'Artifact' },
  { tool: 'ArtifactData' },
  { tool: 'ArtifactComments' },
  { tool: 'mcp__claude_ai_*' },
]

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

// The fields of `tool` to skip: the union over every matching rule, so a user rule only adds.
function skipFor(tool: string, rules: readonly SkipRule[]): ReadonlySet<string> | 'all' {
  const hits = rules.filter(r => (r.tool.endsWith('*') ? tool.startsWith(r.tool.slice(0, -1)) : r.tool === tool))
  if (hits.some(r => !r.fields)) return 'all'
  return new Set(hits.flatMap(r => r.fields ?? []))
}

// The vault may be empty right after /clear, so it loads through ensureLoaded.
async function load($: EngineInterface, options: PluginOptions): Promise<{ config: Config; vault: Vault }> {
  const io = makeIo($)
  const config = await loadConfig(io, options)
  return { config, vault: await ensureLoaded(io, config) }
}

// Restored text reaches storage (a stored stream, a tool's result), and session.append re-redacts
// it only through vault literals, which leave out values under MIN_SECRET_LEN. Those IDs stay.
const longValues = (vault: Vault): Lookup => id => {
  const v = vault.get(id)
  return v !== undefined && v.length >= MIN_SECRET_LEN ? v : undefined
}

export function registerInbound(on: On, options: PluginOptions): void {
  // The result is left as is: session.append redacts what the model reads.
  on('tool.call', async ($, e, next) => {
    const { config, vault } = await load($, options)
    const rules = [...RESTORE_SKIP, ...config.project.skipRestore]
    return next(restoreDeep(e, longValues(vault), skipFor(e.tool, rules)))
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'secret-stash: restore failed' }))

  // Main loop and subagents alike. Returning nothing lets next's result stand, so its `answer`
  // keeps its IDs: it reaches only the hooks above, never the screen or the transcript.
  //
  // No yield sits in a `finally`. On abort the generator is closed at a yield, or the stream
  // beneath ends or throws with the signal aborted; either way the held tail (under ID_MAX_LEN
  // characters, never yet shown or recorded) is dropped.
  on('turn.step', async function* ($, e, next) {
    const { vault } = await load($, options)
    const r = new StreamRestorer(longValues(vault))
    try {
      for await (const c of next(e)) yield* r.push(c)
    } catch (err) {
      if (next.signal.aborted) return
      throw err
    }
    if (!next.signal.aborted) yield* r.flush()
  }).catch(async function* ($, e, next) {
    // After next was called, replaying would open the stream again and repeat chunks already
    // shown, so the step ends where it stood. Before, the raw stream runs.
    if (next.called) return
    return yield* next(e)
  })
}
