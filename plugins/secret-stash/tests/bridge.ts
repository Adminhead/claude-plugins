import type { Io } from '../hooks/io.ts'

// Inline plugin that relays `$.store` calls made by a test into the engine, so `mock.store`
// answers them. The test's own `$` has no store noun, and a plugin closes over nothing of the
// test file, so the call travels as JSON through a `skill.prompt` hook that never calls next.
// (`prompt.submit` would run the plugin under test's own outbound hook first.)
export const storeBridge = {
  name: 'store-bridge',
  register(on: any) {
    on('skill.prompt', async ($: any, e: any) => {
      const { op, key, value } = JSON.parse(e.text)
      let out: unknown
      try {
        out = { ok: op === 'get' ? await $.store.get(key) : await $.store.set(key, value) }
      } catch (err) {
        out = { err: String(err) }
      }
      return { text: JSON.stringify(out) }
    })
  },
}

export function storeIo($: any): Pick<Io, 'storeGet' | 'storeSet'> {
  const call = async (body: object) => {
    const r = JSON.parse((await $.skill.prompt({ skill: 'bridge', text: JSON.stringify(body) })).text)
    if (r.err) throw new Error(r.err)
    return r.ok
  }
  return {
    storeGet: key => call({ op: 'get', key }),
    storeSet: async (key, value) => void (await call({ op: 'set', key, value })),
  }
}
