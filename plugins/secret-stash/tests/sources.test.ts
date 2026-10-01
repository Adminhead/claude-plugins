import { describe, test, expect } from 'claude-code/testing'
import { ConfigInvalid, parseProjectFile, type Config } from '../hooks/config.ts'
import { resolveRegistered } from '../hooks/sources.ts'
import { fail, fakeIo, ok, runner } from './fakeio.ts'

const cfg = (envVars: string[], project: object = {}): Config => ({ envVars, projectFile: 'x', project: parseProjectFile(JSON.stringify(project)) })
const errors = async (p: Promise<unknown>) => ((await p.catch(e => e)) as ConfigInvalid).errors

describe('resolveRegistered', () => {
  test('resolves userConfig and project env names, deduplicated', async () => {
    const io = fakeIo(runner({ A_SECRET: 'value-aaaaaaaa', B_TOKEN: 'value-bbbbbbbb' }))
    const got = await resolveRegistered(io, cfg(['A_SECRET', 'B_TOKEN'], { env: ['B_TOKEN'] }))
    expect(got).toEqual([{ name: 'A_SECRET', value: 'value-aaaaaaaa' }, { name: 'B_TOKEN', value: 'value-bbbbbbbb' }])
    expect(io.calls).toEqual([['printenv', 'A_SECRET'], ['printenv', 'B_TOKEN']])
  })

  test("strips printenv's one trailing newline, keeping any the value itself ends with", async () => {
    const io = fakeIo(runner({ A_SECRET: 'value\nwith-lines\n' }))
    expect((await resolveRegistered(io, cfg(['A_SECRET'])))[0].value).toBe('value\nwith-lines\n')
  })

  test('a missing env var is a ConfigError', async () => {
    const io = fakeIo(runner({}))
    expect(await errors(resolveRegistered(io, cfg(['GONE_SECRET'])))).toEqual([
      { path: 'env GONE_SECRET', message: 'environment variable is not set' },
    ])
  })

  test('a value under the minimum length is a ConfigError that does not echo it', async () => {
    const io = fakeIo(runner({ SHORT_ONE: 'abc1234' }))
    const errs = await errors(resolveRegistered(io, cfg(['SHORT_ONE'])))
    expect(errs).toEqual([{ path: 'env SHORT_ONE', message: 'value is 7 characters, under the 8 minimum' }])
    expect(JSON.stringify(errs)).not.toContain('abc1234')
  })

  test('pass-cli resolves a ref, named after its last segment', async () => {
    const ref = 'pass://Work/stripe/api-key'
    const io = fakeIo(runner({}, { [ref]: ok('sk_live_abcdef123\n') }))
    expect(await resolveRegistered(io, cfg([], { pass: [ref] }))).toEqual([{ name: 'api-key', value: 'sk_live_abcdef123' }])
    expect(io.calls).toEqual([['pass-cli', 'item', 'view', ref]])
  })

  test('a pass-cli failure is a ConfigError naming the ref and exit code, never its stderr', async () => {
    const ref = 'pass://Work/stripe/api-key'
    const io = fakeIo(runner({}, { [ref]: fail(3, 'bad field value sk_live_abcdef1234567890') }))
    const errs = await errors(resolveRegistered(io, cfg([], { pass: [ref] })))
    expect(errs).toEqual([{ path: `pass ${ref}`, message: 'pass-cli failed (exit 3)' }])
    expect(JSON.stringify(errs)).not.toContain('sk_live')
  })

  test('a short pass value is a ConfigError', async () => {
    const ref = 'pass://Work/x/pin'
    const io = fakeIo(runner({}, { [ref]: ok('1234\n') }))
    expect((await errors(resolveRegistered(io, cfg([], { pass: [ref] }))))[0].message).toContain('under the 8 minimum')
  })

  test('a process that cannot start is a ConfigError, not a crash', async () => {
    const io = fakeIo(() => {
      throw new Error('spawn pass-cli ENOENT')
    })
    expect(await errors(resolveRegistered(io, cfg([], { pass: ['pass://a/b/c'] })))).toEqual([
      { path: 'pass pass://a/b/c', message: 'could not run pass-cli: spawn pass-cli ENOENT' },
    ])
  })

  test('every failure is reported together', async () => {
    const io = fakeIo(runner({ OK_SECRET: 'value-aaaaaaaa' }, { 'pass://a/b/c': fail(1, 'no') }))
    const errs = await errors(resolveRegistered(io, cfg(['GONE_ONE', 'OK_SECRET'], { pass: ['pass://a/b/c'] })))
    expect(errs.map(e => e.path)).toEqual(['env GONE_ONE', 'pass pass://a/b/c'])
  })
})
