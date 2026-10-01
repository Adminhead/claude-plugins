import { describe, test, expect, mock } from 'claude-code/testing'
import { parseProjectFile, type Config } from '../hooks/config.ts'
import { makeId } from '../hooks/ids.ts'
import { ensureLoaded, loadKey, putAll, vaultOf } from '../hooks/vault.ts'
import { storeBridge, storeIo } from './bridge.ts'
import { fakeIo, runner } from './fakeio.ts'
import { KEY } from './helpers.ts'

const cfg = (envVars: string[] = []): Config => ({ envVars, projectFile: 'x', project: parseProjectFile('{}') })
const found = async (value: string, category = 'X') => ({ id: await makeId(KEY, category, value), value, category })

describe('HMAC key', () => {
  test('is generated once, kept in the store as hex and read back on every load', { plugins: [storeBridge] }, async ($, on) => {
    mock.store(on, {})
    const io = storeIo($)
    const first = await loadKey(io as never)
    expect(first).toHaveLength(32)
    const stored = await io.storeGet('hmacKey')
    expect(stored).toMatch(/^[0-9a-f]{64}$/)
    expect(Array.from(first, b => b.toString(16).padStart(2, '0')).join('')).toBe(stored)
    expect(await loadKey(io as never)).toEqual(first)
  })

  test('an existing stored key is used as is', { plugins: [storeBridge] }, async ($, on) => {
    mock.store(on, { hmacKey: '07'.repeat(32) })
    expect(await loadKey(storeIo($) as never)).toEqual(KEY)
  })

  test('a corrupt stored key throws rather than being replaced', async () => {
    const io = fakeIo()
    await io.storeSet('hmacKey', 'not-hex')
    await expect(loadKey(io)).rejects.toThrow('not 64 hex digits')
    expect(await io.storeGet('hmacKey')).toBe('not-hex')
  })

  test('concurrent first loads agree on one key', async () => {
    const io = fakeIo()
    const [a, b, c] = await Promise.all([loadKey(io), loadKey(io), loadKey(io)])
    expect(b).toEqual(a)
    expect(c).toEqual(a)
  })
})

describe('ensureLoaded', () => {
  const env = { A_SECRET: 'value-aaaaaaaa', B_TOKEN: 'value-bbbbbbbb' }

  test('resolves registered sources into REG_ entries on the first call for a session', async () => {
    const io = fakeIo(runner(env))
    const vault = await ensureLoaded(io, cfg(['A_SECRET']))
    expect(vault.literals()).toEqual([{ value: 'value-aaaaaaaa', category: 'REG_A_SECRET' }])
    const id = vault.idFor('value-aaaaaaaa')!
    expect(id).toMatch(/^__SS_REG_A_SECRET_[0-9a-f]{16}__$/)
    expect(vault.get(id)).toBe('value-aaaaaaaa')
    expect(io.vault()!.loadedFor).toBe('sess-1')
  })

  test('the same session id does not resolve again or reset entries', async () => {
    const io = fakeIo(runner(env))
    await ensureLoaded(io, cfg(['A_SECRET']))
    await putAll(io, [await found('detected-value-1')])
    const before = io.calls.length
    const vault = await ensureLoaded(io, cfg(['A_SECRET']))
    expect(io.calls).toHaveLength(before)
    expect(vault.literals().map(e => e.value).sort()).toEqual(['detected-value-1', 'value-aaaaaaaa'])
  })

  test('a new session id merges freshly resolved sources into what the vault holds', async () => {
    const io = fakeIo(runner(env))
    await ensureLoaded(io, cfg(['A_SECRET']))
    await putAll(io, [await found('detected-value-1')])
    io.setSession('sess-2')
    const vault = await ensureLoaded(io, cfg(['A_SECRET', 'B_TOKEN']))
    expect(vault.literals().map(e => e.value).sort()).toEqual(['detected-value-1', 'value-aaaaaaaa', 'value-bbbbbbbb'])
    expect(io.vault()!.loadedFor).toBe('sess-2')
  })

  test('registered values keep a stable ID across sessions', async () => {
    const io = fakeIo(runner(env))
    const a = (await ensureLoaded(io, cfg(['A_SECRET']))).idFor('value-aaaaaaaa')
    io.setSession('sess-2')
    expect((await ensureLoaded(io, cfg(['A_SECRET']))).idFor('value-aaaaaaaa')).toBe(a)
  })

  test('concurrent callers on a new id resolve sources once', async () => {
    const io = fakeIo(runner(env))
    await Promise.all([ensureLoaded(io, cfg(['A_SECRET'])), ensureLoaded(io, cfg(['A_SECRET'])), ensureLoaded(io, cfg(['A_SECRET']))])
    expect(io.calls.filter(c => c[0] === 'printenv')).toHaveLength(1)
  })

  test('a failed source load throws and stays retryable', async () => {
    const io = fakeIo(runner({}))
    await expect(ensureLoaded(io, cfg(['GONE_SECRET']))).rejects.toThrow('not set')
    io.run = async () => ({ exitCode: 0, stdout: 'value-cccccccc\n', stderr: '' })
    expect((await ensureLoaded(io, cfg(['GONE_SECRET']))).literals()).toHaveLength(1)
  })
})

describe('putAll', () => {
  test('concurrent calls lose nothing', async () => {
    const io = fakeIo()
    const all = await Promise.all(Array.from({ length: 25 }, (_, i) => found(`secret-value-${i}`)))
    await Promise.all(all.map(f => putAll(io, [f])))
    const entries = io.vault()!.entries
    expect(Object.keys(entries).sort()).toEqual(all.map(f => f.id).sort())
  })

  test('accepts a value under the minimum, and its ID restores', async () => {
    const io = fakeIo()
    const frag = await found('my_')
    await putAll(io, [frag, await found('long-enough-1')])
    const vault = vaultOf(io.vault()!.entries)
    expect(vault.get(frag.id)).toBe('my_')
    expect(vault.idFor('my_')).toBe(frag.id)
  })

  test('an empty list writes nothing', async () => {
    const io = fakeIo()
    await putAll(io, [])
    expect(io.vault()).toBeUndefined()
  })
})

describe('vaultOf', () => {
  test('literals() leaves out values under the minimum', () => {
    const v = vaultOf({
      __SS_X_aaaaaaaaaaaaaaaa__: { value: 'my_', category: 'X' },
      __SS_X_bbbbbbbbbbbbbbbb__: { value: 'long-enough-1', category: 'X' },
    })
    expect(v.literals().map(e => e.value)).toEqual(['long-enough-1'])
  })

  test('looks up by id and by value', () => {
    const v = vaultOf({ __SS_X_aaaaaaaaaaaaaaaa__: { value: 'v-value-1', category: 'X' } })
    expect(v.get('__SS_X_aaaaaaaaaaaaaaaa__')).toBe('v-value-1')
    expect(v.get('__SS_X_bbbbbbbbbbbbbbbb__')).toBeUndefined()
    expect(v.idFor('v-value-1')).toBe('__SS_X_aaaaaaaaaaaaaaaa__')
    expect(v.idFor('other')).toBeUndefined()
  })
})
