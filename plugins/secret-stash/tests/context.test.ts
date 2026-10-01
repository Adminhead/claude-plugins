import { describe, test, expect } from 'claude-code/testing'
import { ConfigInvalid } from '../hooks/config.ts'
import { loadCtx } from '../hooks/context.ts'
import { detect } from '../hooks/detect.ts'
import { redactText } from '../hooks/redact.ts'
import { putAll } from '../hooks/vault.ts'
import { ctx as redactCtx } from './helpers.ts'
import { fakeIo, runner } from './fakeio.ts'

const GH = 'ghp_aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0hJ3kL6'

describe('loadCtx', () => {
  test('builds detectors for vault literals, the env rule, custom patterns and openredaction', async () => {
    const io = fakeIo(runner({ STRIPE_KEY: 'registered-value-1' }))
    io.files.set('/repo/.secret-stash.json', JSON.stringify({
      env: ['STRIPE_KEY'],
      openredaction: { customPatterns: [{ type: 'INTERNAL_TOKEN', regex: 'itk_[A-Za-z0-9]{32}' }] },
    }))
    const c = await loadCtx(io, {})
    const itk = 'itk_' + 'a1B2c3D4'.repeat(4)
    const text = `reg registered-value-1\nDB_PASSWORD=hunter2-hunter2\ngh ${GH}\ninternal ${itk}\nport=8080`
    const hits = detect(text, c.detectors).map(m => [m.category, m.source, text.slice(m.start, m.end)])
    expect(hits).toEqual([
      ['REG_STRIPE_KEY', 'vault', 'registered-value-1'],
      ['ENV', 'env', 'hunter2-hunter2'],
      ['GITHUB_TOKEN', 'openredaction', GH],
      ['INTERNAL_TOKEN', 'custom', itk],
    ])
  })

  test('a value stashed earlier is detected by literal match afterwards', async () => {
    const io = fakeIo()
    await putAll(io, [{ id: '__SS_X_0123456789abcdef__', value: 'plain-old-secret', category: 'X' }])
    const c = await loadCtx(io, {})
    const r = await redactText('say plain-old-secret now', redactCtx(c.detectors, { key: c.key, idFor: c.vault.idFor }))
    expect(r.text).toBe('say __SS_X_0123456789abcdef__ now')
  })

  test('envKeyRule false drops the env rule', async () => {
    const io = fakeIo()
    io.files.set('/repo/.secret-stash.json', '{"envKeyRule": false}')
    const c = await loadCtx(io, {})
    expect(detect('DB_PASSWORD=hunter2-hunter2', c.detectors)).toEqual([])
  })

  test('the HMAC key is stable across calls', async () => {
    const io = fakeIo()
    const a = await loadCtx(io, {})
    expect((await loadCtx(io, {})).key).toEqual(a.key)
  })

  test('an invalid config throws ConfigInvalid', async () => {
    const io = fakeIo()
    io.files.set('/repo/.secret-stash.json', '{"openredaction":{"patterns":["NOPE"]}}')
    await expect(loadCtx(io, {})).rejects.toBeInstanceOf(ConfigInvalid)
  })

  test('a registered source failure throws ConfigInvalid', async () => {
    const io = fakeIo(runner({}))
    await expect(loadCtx(io, { envVars: ['GONE_SECRET'] })).rejects.toBeInstanceOf(ConfigInvalid)
  })
})
