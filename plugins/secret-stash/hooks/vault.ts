import type { PluginState } from 'claude-code'
import type { Config } from './config.ts'
import { MIN_SECRET_LEN, makeId, newKey } from './ids.ts'
import type { Io } from './io.ts'
import { resolveRegistered } from './sources.ts'
import type { Found, Lookup } from './types.ts'

// Declared in types/index.d.ts, where the engine's PluginState contract lives.
export type VaultState = PluginState['secret-stash']['vault']
export type VaultEntry = VaultState['entries'][string]
export type Vault = { get: Lookup; idFor(value: string): string | undefined; literals(): readonly VaultEntry[] }

const KEY_NAME = 'hmacKey'
const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
const unhex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], h => parseInt(h, 16))

// Concurrent callers of one load share its promise.
let keyLoad: Promise<Uint8Array> | undefined
const vaultLoads = new Map<string, Promise<Vault>>()

// The machine's HMAC key: 32 random bytes made once and kept in the store as hex. A stored value
// that is not 64 hex digits throws rather than being replaced, which would change every ID.
export function loadKey(io: Io): Promise<Uint8Array> {
  return (keyLoad ??= (async () => {
    const stored = await io.storeGet(KEY_NAME)
    if (stored === undefined) {
      const key = newKey()
      await io.storeSet(KEY_NAME, hex(key))
      return key
    }
    if (typeof stored !== 'string' || !/^[0-9a-f]{64}$/.test(stored)) {
      throw new Error(`secret-stash: stored ${KEY_NAME} is not 64 hex digits; fix or delete it`)
    }
    return unhex(stored)
  })().finally(() => {
    keyLoad = undefined
  }))
}

export function vaultOf(entries: Readonly<Record<string, VaultEntry>>): Vault {
  const byValue = new Map(Object.entries(entries).map(([id, e]) => [e.value, id]))
  return {
    get: id => entries[id]?.value,
    idFor: value => byValue.get(value),
    // Short values (fragments left where an ID was cut out of a match) restore but never detect.
    literals: () => Object.values(entries).filter(e => e.value.length >= MIN_SECRET_LEN),
  }
}

async function load(io: Io, cfg: Config, sessionId: string): Promise<Vault> {
  const key = await loadKey(io)
  const entries: Record<string, VaultEntry> = {}
  for (const { name, value } of await resolveRegistered(io, cfg)) {
    const category = `REG_${name}`
    entries[await makeId(key, category, value)] = { value, category }
  }
  const next = await io.updateVault(cur => ({ loadedFor: sessionId, entries: { ...cur?.entries, ...entries } }))
  return vaultOf(next.entries)
}

// The session's vault. State is wiped by /clear and resume, so a session id the state was not
// loaded for means registered sources are resolved again and merged in. Entries are never reset
// within an id.
export async function ensureLoaded(io: Io, cfg: Config): Promise<Vault> {
  const sessionId = await io.sessionId()
  const value = await io.getVault()
  if (value?.loadedFor === sessionId) return vaultOf(value.entries)
  let loading = vaultLoads.get(sessionId)
  if (!loading) {
    loading = load(io, cfg, sessionId).finally(() => vaultLoads.delete(sessionId))
    vaultLoads.set(sessionId, loading)
  }
  return loading
}

// Adds detected secrets to the vault, short fragments included so their IDs restore. The
// read-modify-write retries on a version miss, so concurrent calls lose nothing.
export async function putAll(io: Io, found: readonly Found[]): Promise<void> {
  if (!found.length) return
  await io.updateVault(cur => {
    const entries = { ...cur?.entries }
    for (const f of found) entries[f.id] = { value: f.value, category: f.category }
    return { loadedFor: cur?.loadedFor ?? '', entries }
  })
}
