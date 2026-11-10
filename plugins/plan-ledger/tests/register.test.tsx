import { describe, expect, test } from 'claude-code/testing'
import { dirOf, listPlans, mutate, readPlan } from '../hooks/register'
import { parseLedger } from '../hooks/plan/replay'
import { appendArgv, lockAcquireArgv, lockReleaseArgv, mkdirArgv, publishArgv, tailArgv } from '../hooks/plan/store'
import { MAX_LEDGER_BYTES } from '../hooks/plan/types'

// The transaction and the directory guard through the engine's `$`, with everything beneath it faked: `process.run`
// interprets the argv builders of store.ts by their constant scripts (the real shell is covered by store.spec.ts), and
// `fs.*`, `env.get`, `session.*` and `clock.*` read and write an in-memory world. Every test gets its own HOME, so the
// module's cached project directory cannot carry over between tests.

const SCRIPT = {
  mkdir: mkdirArgv('d')[2],
  acquire: lockAcquireArgv('l', 't')[2],
  release: lockReleaseArgv('l', 't')[2],
  append: appendArgv('f')[2],
  tail: tailArgv('f')[2],
  publish: publishArgv('x.tmp.t', 'x')[2],
}

type World = {
  home: string
  files: Map<string, string>
  dirs: Set<string>
  locks: Map<string, string>
  /** Every side effect in order: acquire, append, write-tmp, mv, release, rm, ... */
  log: string[]
  inits: Record<string, any>[]
  now: number
  stuck: boolean
  failAppend: boolean
  failMv: boolean
  failWrite: ((path: string) => boolean) | null
  trimTail: boolean
  /** Pretend the ledger file has this size. */
  ledgerSize: number | null
  /** path -> where a symlink leads, for `fs.stat(..., { resolve: true })` */
  links: Map<string, string>
  cwdThrows: boolean
}

let homes = 0
const bytes = (s: string) => new TextEncoder().encode(s).length
const dirname = (p: string) => p.slice(0, p.lastIndexOf('/'))
const res = (exitCode: number, stdout = '') => ({ exitCode, stdout, stderr: '' })

/**
 * The test body's `$` raises only events (`$.tool.call`, `$.command.run`, ...), not the interface a hook calls, so a
 * helper that takes `$` (`mutate`, `readPlan`, `dirOf`) gets `w.$`: a plain object with the same calls (`$.fs.stat(path,
 * { resolve })`, `$.process.run(argv, init)`, ...) over the same in-memory world. The hook under test, the directory
 * guard, runs on the engine's own `$` and reaches the same world through the stubs registered with `on`.
 */
function world(on: any): World & { $: any } {
  const w: World = {
    home: `/home/u${++homes}`,
    files: new Map(),
    dirs: new Set(),
    locks: new Map(),
    log: [],
    inits: [],
    now: Date.UTC(2026, 10, 9, 12, 0, 0),
    stuck: false,
    failAppend: false,
    failMv: false,
    failWrite: null,
    trimTail: false,
    ledgerSize: null,
    links: new Map(),
    cwdThrows: false,
  }
  const h: Record<string, (e: any) => any> = {
    'env.get': () => w.home,
    'session.repo': () => ({ root: '/work/repo', remote: null, internal: false, name: null }),
    'session.cwd': () => {
      if (w.cwdThrows) throw new Error('boom')
      return '/work/repo'
    },
    'clock.now': () => (w.now += 1000),
    'clock.sleep': () => undefined,
    'ui.log': () => undefined,
    'fs.exists': (e) => w.files.has(e.path) || w.dirs.has(e.path),
    'fs.read': (e) => {
      const text = w.files.get(e.path)
      if (text === undefined) throw new Error(`ENOENT ${e.path}`)
      return text
    },
    'fs.write': (e) => {
      if (w.failWrite?.(e.path)) throw new Error('disk full')
      if (e.path.includes('.json.tmp.')) w.log.push('write-tmp')
      w.files.set(e.path, e.text)
    },
    'fs.list': (e) =>
      [...w.files.keys()]
        .filter((p) => dirname(p) === e.path)
        .map((p) => ({ name: p.slice(e.path.length + 1), kind: 'file', size: bytes(w.files.get(p) as string), isLink: false })),
    'fs.stat': (e) => {
      const exists = w.files.has(e.path) || w.dirs.has(e.path) || w.links.has(e.path)
      if (!exists) throw new Error(`ENOENT ${e.path}`)
      const size = e.path.endsWith('.jsonl') && w.ledgerSize !== null ? w.ledgerSize : bytes(w.files.get(e.path) ?? '')
      return {
        kind: w.files.has(e.path) ? 'file' : 'dir',
        size,
        mtimeMs: 0,
        isLink: w.links.has(e.path),
        ...(e.resolve ? { realPath: w.links.get(e.path) ?? e.path } : {}),
      }
    },
    'process.run': (e) => {
      const [a0, a1, script, , ...a] = e.argv as string[]
      if (a0 === 'rm') {
        w.log.push('rm')
        w.files.delete(e.argv[3])
        return res(0)
      }
      if (a0 === 'mv') {
        w.log.push('mv-corrupt')
        w.files.set(e.argv[4], w.files.get(e.argv[3]) as string)
        w.files.delete(e.argv[3])
        return res(0)
      }
      if (a0 !== 'sh' || a1 !== '-c') throw new Error(`unexpected argv ${JSON.stringify(e.argv)}`)
      switch (script) {
        case SCRIPT.mkdir:
          w.log.push('mkdir')
          w.dirs.add(a[0])
          return res(0)
        case SCRIPT.acquire: {
          w.log.push('acquire')
          w.inits.push({ kind: 'acquire', ...e.init })
          const [lock, token] = a
          if (!w.dirs.has(dirname(lock))) return res(1)
          if (w.stuck || w.locks.has(lock)) return res(75)
          w.locks.set(lock, token)
          return res(0)
        }
        case SCRIPT.release: {
          w.log.push('release')
          const [lock, token] = a
          if (w.locks.get(lock) !== token) return res(1)
          w.locks.delete(lock)
          return res(0)
        }
        case SCRIPT.append:
          w.log.push('append')
          if (w.locks.size === 0) throw new Error('append outside the lock')
          if (w.failAppend) return res(1)
          w.files.set(a[0], (w.files.get(a[0]) ?? '') + e.init.stdin)
          return res(0)
        case SCRIPT.tail: {
          const text = w.files.get(a[0])
          if (text === undefined) return res(1)
          const lines = text.split('\n')
          let last = text.endsWith('\n') ? `${lines[lines.length - 2]}\n` : lines[lines.length - 1]
          if (w.trimTail) last = last.trim()
          return res(0, last)
        }
        case SCRIPT.publish: {
          if (w.locks.size === 0) throw new Error('publish outside the lock')
          if (w.failMv) return res(1)
          w.log.push('mv')
          w.files.set(a[1], w.files.get(a[0]) as string)
          w.files.delete(a[0])
          return res(0)
        }
      }
      throw new Error(`unknown script ${String(script).slice(0, 60)}`)
    },
  }
  for (const name of Object.keys(h)) on(name, (_$: any, e: any) => ({ value: h[name](e) }))

  const $ = {
    env: { get: async (name: string) => h['env.get']({ name }) },
    session: { repo: async () => h['session.repo']({}), cwd: async () => h['session.cwd']({}) },
    clock: { now: async () => h['clock.now']({}), sleep: async (ms: number) => h['clock.sleep']({ ms }) },
    ui: { log: (text: string) => h['ui.log']({ text }) },
    fs: {
      exists: async (path: string) => h['fs.exists']({ path }),
      read: async (path: string) => h['fs.read']({ path }),
      write: async (path: string, text: string) => h['fs.write']({ path, text }),
      list: async (path: string) => h['fs.list']({ path }),
      stat: async (path: string, o?: { resolve?: boolean }) => h['fs.stat']({ path, resolve: o?.resolve === true }),
    },
    process: { run: async (argv: string[], init?: Record<string, unknown>) => h['process.run']({ argv, init }) },
  }
  return Object.assign(w, { $ })
}

const MAIN = { kind: 'main' } as const
const item = {
  title: 'item',
  instructions: 'do it',
  acceptance: ['works'],
  files: ['a.ts'],
  deps: [],
  agent: 'coder',
  model: 'sonnet',
  checks: [],
}
const createAction = (title = 'Plan') => ({ action: 'create' as const, title, items: [item] })

const fileEnding = (w: World, suffix: string) => [...w.files.keys()].find((k) => k.endsWith(suffix)) as string
const jsonOf = (w: World) => JSON.parse(w.files.get(fileEnding(w, '.json')) as string)
const ledgerOf = (w: World) => parseLedger(w.files.get(fileEnding(w, '.jsonl')) as string)
const revsOf = (w: World) => ledgerOf(w).changes.filter((c) => c.denied === null).map((c) => c.rev)

async function created($: any) {
  const r = await mutate($, null, createAction(), MAIN)
  expect(r.ok).toBe(true)
  return r.planId as string
}

describe('transaction', () => {
  test('the store is absent: the directory is made before the lock, and create writes the ledger then the plan', async ($: any, on: any) => {
    const w = world(on)
    const r = await mutate(w.$, null, createAction(), MAIN)
    expect(r).toMatchObject({ ok: true, code: 'applied' })
    expect(w.log.slice(0, 2)).toEqual(['mkdir', 'acquire'])
    // the ledger line is appended before the JSON is written, and the lock is released last
    expect(w.log.filter((l) => l !== 'mkdir')).toEqual(['acquire', 'append', 'write-tmp', 'mv', 'release'])
    expect(w.locks.size).toBe(0)
    expect(jsonOf(w)).toMatchObject({ id: r.planId, rev: 1, status: 'draft', project: '/work/repo' })
    expect(ledgerOf(w).changes).toHaveLength(1)
    expect(ledgerOf(w).changes[0]).toMatchObject({ rev: 1, action: 'create', plan: r.planId })
    expect(w.files.size).toBe(2) // no tmp file left
  })

  test('the lock wait is shorter than the process timeout, so the engine never kills a polling acquire', async ($: any, on: any) => {
    const w = world(on)
    await created(w.$)
    expect(w.inits[0].timeoutMs).toBeGreaterThan(5000)
  })

  test('a stuck lock returns the busy error and writes nothing', async ($: any, on: any) => {
    const w = world(on)
    w.stuck = true
    const r = await mutate(w.$, null, createAction(), MAIN)
    expect(r).toMatchObject({ ok: false, code: 'busy' })
    expect((r as any).message).toContain('/plans unlock')
    expect([...w.files.keys()]).toEqual([])
    expect(w.log).not.toContain('append')
  })

  test('a failed append writes no JSON and leaves the old plan', async ($: any, on: any) => {
    const w = world(on)
    const id = await created(w.$)
    const before = w.files.get(fileEnding(w, '.json'))
    w.failAppend = true
    const r = await mutate(w.$, id, { action: 'activate', plan: id }, MAIN)
    expect(r).toMatchObject({ ok: false, code: 'error' })
    expect((r as any).recorded).toBeUndefined()
    expect(w.files.get(fileEnding(w, '.json'))).toBe(before)
    expect(w.log.filter((l) => l === 'write-tmp')).toHaveLength(1) // the create's only
    expect(w.locks.size).toBe(0)
    w.failAppend = false
    const again = await mutate(w.$, id, { action: 'activate', plan: id }, MAIN)
    expect(again).toMatchObject({ ok: true })
    expect(revsOf(w)).toEqual([1, 2])
  })

  for (const [name, arm] of [
    ['the tmp write fails', (w: World) => (w.failWrite = (p) => p.includes('.json.tmp.'))],
    ['the mv fails', (w: World) => (w.failMv = true)],
  ] as const) {
    test(`append succeeds, then ${name}: the next mutate reconciles from the ledger, revs stay consecutive, nothing duplicates`, async ($: any, on: any) => {
      const w = world(on)
      const id = await created(w.$)
      const jsonBefore = w.files.get(fileEnding(w, '.json'))
      arm(w)
      const failed = await mutate(w.$, id, { action: 'activate', plan: id }, MAIN)
      expect(failed).toMatchObject({ ok: false, code: 'error', recorded: true })
      expect(w.files.get(fileEnding(w, '.json'))).toBe(jsonBefore) // the old JSON is intact
      expect(jsonOf(w).rev).toBe(1)
      expect(revsOf(w)).toEqual([1, 2]) // but the ledger has the change
      expect([...w.files.keys()].some((k) => k.includes('.json.tmp.'))).toBe(false)

      w.failWrite = null
      w.failMv = false
      const next = await mutate(w.$, id, { action: 'amend', plan: id, planTitle: 'Renamed' }, MAIN)
      expect(next).toMatchObject({ ok: true, code: 'applied' })
      expect(revsOf(w)).toEqual([1, 2, 3]) // consecutive, no second rev 2
      expect(jsonOf(w)).toMatchObject({ rev: 3, status: 'active', title: 'Renamed' }) // the lost activation is kept
    })
  }

  test('the same op is not applied twice', async ($: any, on: any) => {
    const w = world(on)
    const id = await created(w.$)
    const first = await mutate(w.$, id, { action: 'activate', plan: id }, MAIN, { op: 'op-1' })
    expect(first).toMatchObject({ ok: true, code: 'applied' })
    const again = await mutate(w.$, id, { action: 'activate', plan: id }, MAIN, { op: 'op-1' })
    expect(again).toMatchObject({ ok: true, code: 'duplicate' })
    expect(revsOf(w)).toEqual([1, 2])
    expect(jsonOf(w).rev).toBe(2)
  })

  test('a retry after a failed publish reports applied and repairs the plan file', async ($: any, on: any) => {
    const w = world(on)
    const id = await created(w.$)
    w.failMv = true
    const failed = await mutate(w.$, id, { action: 'activate', plan: id }, MAIN, { op: 'op-2' })
    expect(failed).toMatchObject({ ok: false, recorded: true, op: 'op-2' })
    w.failMv = false
    const again = await mutate(w.$, id, { action: 'activate', plan: id }, MAIN, { op: 'op-2' })
    expect(again).toMatchObject({ ok: true, code: 'duplicate' })
    expect(jsonOf(w)).toMatchObject({ rev: 2, status: 'active' })
    expect(revsOf(w)).toEqual([1, 2])
  })

  test('a create retried with its op and plan id does not make a second plan', async ($: any, on: any) => {
    const w = world(on)
    w.failMv = true
    const failed = await mutate(w.$, null, createAction(), MAIN)
    expect(failed).toMatchObject({ ok: false, recorded: true })
    w.failMv = false
    const again = await mutate(w.$, null, createAction(), MAIN, { op: (failed as any).op, planId: (failed as any).planId })
    expect(again).toMatchObject({ ok: true, code: 'duplicate' })
    expect(w.files.size).toBe(2)
    expect(jsonOf(w).id).toBe((failed as any).planId)
  })

  test('a corrupt plan file is renamed, never deleted, and rebuilt from the ledger', async ($: any, on: any) => {
    const w = world(on)
    const id = await created(w.$)
    const jsonPath = fileEnding(w, '.json')
    w.files.set(jsonPath, '{"v":1,"id":')
    const r = await mutate(w.$, id, { action: 'activate', plan: id }, MAIN)
    expect(r).toMatchObject({ ok: true })
    const quarantined = [...w.files.keys()].filter((k) => k.includes('.json.corrupt-'))
    expect(quarantined).toHaveLength(1)
    expect(w.files.get(quarantined[0])).toBe('{"v":1,"id":')
    expect(jsonOf(w)).toMatchObject({ id, rev: 2, status: 'active' })
    expect(revsOf(w)).toEqual([1, 2])
  })

  test('a missing plan file is rebuilt from the ledger', async ($: any, on: any) => {
    const w = world(on)
    const id = await created(w.$)
    w.files.delete(fileEnding(w, '.json'))
    const r = await mutate(w.$, id, { action: 'activate', plan: id }, MAIN)
    expect(r).toMatchObject({ ok: true })
    expect(jsonOf(w)).toMatchObject({ rev: 2, status: 'active' })
  })

  test('a stale tmp file left by a crash is removed on the next mutation', async ($: any, on: any) => {
    const w = world(on)
    const id = await created(w.$)
    const stale = `${fileEnding(w, '.json')}.tmp.dead-token`
    const other = `${w.home}/.claude/other.json.tmp.keep`
    w.files.set(stale, '{"half"')
    w.files.set(other, 'x')
    await mutate(w.$, id, { action: 'activate', plan: id }, MAIN)
    expect(w.files.has(stale)).toBe(false)
    expect(w.files.has(other)).toBe(true)
  })

  test('a plan file ahead of its ledger refuses the mutation and appends nothing', async ($: any, on: any) => {
    const w = world(on)
    const id = await created(w.$)
    await mutate(w.$, id, { action: 'activate', plan: id }, MAIN)
    const ledgerPath = fileEnding(w, '.jsonl')
    const firstLine = (w.files.get(ledgerPath) as string).split('\n')[0] + '\n'
    w.files.set(ledgerPath, firstLine) // the ledger lost its tail
    const jsonBefore = w.files.get(fileEnding(w, '.json'))
    const r = await mutate(w.$, id, { action: 'amend', plan: id, planTitle: 'X' }, MAIN)
    expect(r).toMatchObject({ ok: false, code: 'repair' })
    expect((r as any).message).toContain('/plans repair')
    expect(w.files.get(ledgerPath)).toBe(firstLine)
    expect(w.files.get(fileEnding(w, '.json'))).toBe(jsonBefore)
    expect(w.locks.size).toBe(0)
  })

  test('a plan file that carries another plan id is refused, not mutated', async ($: any, on: any) => {
    const w = world(on)
    const id = await created(w.$)
    const jsonPath = fileEnding(w, '.json')
    w.files.set(jsonPath, (w.files.get(jsonPath) as string).replace(id, 'p-0aaaaaaaa-aaaaaa'))
    const before = w.files.get(fileEnding(w, '.jsonl'))
    const r = await mutate(w.$, id, { action: 'activate', plan: id }, MAIN)
    expect(r).toMatchObject({ ok: false, code: 'repair' })
    expect(w.files.get(fileEnding(w, '.jsonl'))).toBe(before)
  })

  test('a ledger that cannot be replayed refuses the mutation', async ($: any, on: any) => {
    const w = world(on)
    const id = await created(w.$)
    await mutate(w.$, id, { action: 'activate', plan: id }, MAIN)
    // drop the plan file and the first ledger line: a rev gap
    const ledgerPath = fileEnding(w, '.jsonl')
    const lines = (w.files.get(ledgerPath) as string).split('\n')
    w.files.set(ledgerPath, `${lines[1]}\n`)
    w.files.delete(fileEnding(w, '.json'))
    const r = await mutate(w.$, id, { action: 'amend', plan: id, planTitle: 'X' }, MAIN)
    expect(r).toMatchObject({ ok: false, code: 'repair' })
    expect(w.files.get(ledgerPath)).toBe(`${lines[1]}\n`)
  })

  test('a torn ledger tail gets a newline before the next line, so the new line stands alone', async ($: any, on: any) => {
    const w = world(on)
    const id = await created(w.$)
    const ledgerPath = fileEnding(w, '.jsonl')
    w.files.set(ledgerPath, `${w.files.get(ledgerPath)}{"v":1,"rev":2,"ts":"2026`)
    const r = await mutate(w.$, id, { action: 'activate', plan: id }, MAIN)
    expect(r).toMatchObject({ ok: true })
    const parsed = ledgerOf(w)
    expect(parsed.torn).toBe(false)
    expect(parsed.bad).toBe(1) // the torn fragment, now a line of its own
    expect(parsed.changes.map((c) => c.rev)).toEqual([1, 2])
    expect(jsonOf(w).rev).toBe(2)
  })

  test('a tail whose newline the engine trimmed still reconciles correctly', async ($: any, on: any) => {
    const w = world(on)
    w.trimTail = true
    const id = await created(w.$)
    await mutate(w.$, id, { action: 'activate', plan: id }, MAIN)
    await mutate(w.$, id, { action: 'amend', plan: id, planTitle: 'T' }, MAIN)
    expect(revsOf(w)).toEqual([1, 2, 3])
    expect(jsonOf(w)).toMatchObject({ rev: 3, title: 'T' })
  })

  test('the lock is released when the publish fails after a quarantine', async ($: any, on: any) => {
    const w = world(on)
    const id = await created(w.$)
    const jsonPath = fileEnding(w, '.json')
    w.failWrite = () => true
    w.files.delete(jsonPath)
    w.files.set(jsonPath, 'junk') // forces a quarantine path, then a failed write
    const r = await mutate(w.$, id, { action: 'activate', plan: id }, MAIN)
    expect(r.ok).toBe(false)
    expect(w.locks.size).toBe(0)
  })

  test('a denial is logged, changes no rev and leaves the plan file alone', async ($: any, on: any) => {
    const w = world(on)
    const id = await created(w.$)
    const jsonBefore = w.files.get(fileEnding(w, '.json'))
    const stranger = { kind: 'agent', agentId: 'ghost', agentType: null, session: 's1' } as const
    const r = await mutate(w.$, id, { action: 'claim', plan: id, item: 's1' }, stranger)
    expect(r).toMatchObject({ ok: false, code: 'denied' })
    expect(w.files.get(fileEnding(w, '.json'))).toBe(jsonBefore)
    const changes = ledgerOf(w).changes
    expect(changes).toHaveLength(2)
    expect(changes[1]).toMatchObject({ denied: expect.any(String), rev: 1, actor: stranger })
    expect(revsOf(w)).toEqual([1])
    // the next real change is rev 2 and replays past the denied line
    const ok = await mutate(w.$, id, { action: 'activate', plan: id }, MAIN)
    expect(ok).toMatchObject({ ok: true })
    expect(revsOf(w)).toEqual([1, 2])
  })

  test('a denial for a plan that does not exist is not logged', async ($: any, on: any) => {
    const w = world(on)
    await created(w.$)
    const r = await mutate(w.$, 'p-0zzzzzzzz-zzzzzz', { action: 'activate', plan: 'p-0zzzzzzzz-zzzzzz' }, MAIN)
    expect(r).toMatchObject({ ok: false, code: 'denied' })
    expect([...w.files.keys()].filter((k) => k.includes('zzzzzz'))).toEqual([])
  })

  test('only the first 50 denials are logged; the next entry counts the rest', async ($: any, on: any) => {
    const w = world(on)
    const id = await created(w.$)
    const stranger = { kind: 'agent', agentId: 'ghost', agentType: null, session: 's1' } as const
    for (let i = 0; i < 53; i++) await mutate(w.$, id, { action: 'claim', plan: id, item: 's1' }, stranger)
    expect(ledgerOf(w).changes.filter((c) => c.denied !== null)).toHaveLength(50)
    await mutate(w.$, id, { action: 'activate', plan: id }, MAIN)
    const last = ledgerOf(w).changes.at(-1)
    expect(last).toMatchObject({ action: 'activate', suppressedDenials: 3 })
  })

  test('a full ledger refuses non-terminal changes but still takes abandon', async ($: any, on: any) => {
    const w = world(on)
    const id = await created(w.$)
    w.ledgerSize = MAX_LEDGER_BYTES - 10
    const refused = await mutate(w.$, id, { action: 'amend', plan: id, planTitle: 'X' }, MAIN)
    expect(refused).toMatchObject({ ok: false, code: 'error' })
    expect((refused as any).message).toContain('full')
    expect(revsOf(w)).toEqual([1])
    const closed = await mutate(w.$, id, { action: 'abandon', plan: id }, MAIN)
    expect(closed).toMatchObject({ ok: true })
    expect(jsonOf(w).status).toBe('abandoned')
  })

  test('a create cannot overwrite an existing plan, and an action must name its own plan', async ($: any, on: any) => {
    const w = world(on)
    const id = await created(w.$)
    const clash = await mutate(w.$, null, createAction('Other'), MAIN, { planId: id })
    expect(clash).toMatchObject({ ok: false, code: 'error' })
    expect(jsonOf(w).title).toBe('Plan')
    const wrong = await mutate(w.$, id, { action: 'activate', plan: 'p-0aaaaaaaa-aaaaaa' }, MAIN)
    expect(wrong).toMatchObject({ ok: false, code: 'error' })
    const noId = await mutate(w.$, null, { action: 'activate', plan: id }, MAIN)
    expect(noId).toMatchObject({ ok: false, code: 'error' })
  })

  test('the replayed state equals the live state', async ($: any, on: any) => {
    const w = world(on)
    const id = await created(w.$)
    const live = await mutate(w.$, id, { action: 'activate', plan: id }, MAIN)
    expect(live.ok && live.plan.status).toBe('active')
    w.files.delete(fileEnding(w, '.json'))
    const rebuilt = await readPlan(w.$, id)
    expect(rebuilt.ok && rebuilt.plan).toEqual(live.ok && live.plan)
  })
})

describe('reads', () => {
  test('dirOf keys on the repo root and is stable across calls', async ($: any, on: any) => {
    const w = world(on)
    const a = await dirOf(w.$)
    const b = await dirOf(w.$)
    expect(a).toEqual(b)
    expect(a.dir.startsWith(`${w.home}/.claude/adminhead-plans/repo-`)).toBe(true)
    expect(w.log.filter((l) => l === 'mkdir')).toHaveLength(1)
  })

  test('readPlan returns a plan, a missing plan, and rejects a bad id', async ($: any, on: any) => {
    const w = world(on)
    const id = await created(w.$)
    const ok = await readPlan(w.$, id)
    expect(ok.ok && ok.plan.id).toBe(id)
    expect(await readPlan(w.$, 'p-0zzzzzzzz-zzzzzz')).toMatchObject({ ok: false, code: 'missing' })
    expect(await readPlan(w.$, '../etc/passwd')).toMatchObject({ ok: false, code: 'error' })
  })

  test('readPlan on a damaged plan file rebuilds in memory from the ledger and writes nothing', async ($: any, on: any) => {
    const w = world(on)
    const id = await created(w.$)
    const jsonPath = fileEnding(w, '.json')
    w.files.set(jsonPath, 'not json')
    const writesBefore = w.log.filter((l) => l === 'write-tmp').length
    const r = await readPlan(w.$, id)
    expect(r.ok && r.plan.id).toBe(id)
    expect(w.files.get(jsonPath)).toBe('not json')
    expect(w.log.filter((l) => l === 'write-tmp').length).toBe(writesBefore)
    expect(w.locks.size).toBe(0)
  })

  test('listPlans names plan files only, newest first', async ($: any, on: any) => {
    const w = world(on)
    const a = await created(w.$)
    const b = await created(w.$)
    w.files.set(`${fileEnding(w, '.jsonl').replace(/[^/]+$/, '')}notes.json`, '{}')
    const ids = await listPlans(w.$)
    expect(ids).toEqual([a, b].sort().reverse())
  })
})

describe('directory guard', () => {
  function guardWorld(on: any) {
    const w = world(on)
    const root = `${w.home}/.claude/adminhead-plans`
    w.dirs.add(root)
    w.dirs.add(`${root}/proj`)
    w.dirs.add('/work/repo')
    w.links.set('/work/repo/link', root)
    on('tool.call', () => ({ result: 'ran' }))
    return { w, root }
  }
  const call = ($: any, e: Record<string, unknown>) => $.tool.call(e as never) as Promise<any>

  test('Write, Edit and NotebookEdit into the directory are denied', async ($: any, on: any) => {
    const { root } = guardWorld(on)
    for (const e of [
      { tool: 'Write', file_path: `${root}/proj/p-x.json`, content: '{}' },
      { tool: 'Edit', file_path: `${root}/proj/p-x.jsonl`, old_string: 'a', new_string: 'b' },
      { tool: 'NotebookEdit', notebook_path: `${root}/proj/n.ipynb`, new_source: 'x' },
    ]) {
      expect((await call($, e)).deny).toBe('The plan files are changed only through the plan tool.')
    }
  })

  test('a spelling that folds into the directory, a relative path and a symlink are all denied', async ($: any, on: any) => {
    const { w, root } = guardWorld(on)
    const tries = [
      `${w.home}/work/../.claude/./adminhead-plans//proj/new.json`,
      '~/.claude/adminhead-plans/proj/new.json',
      '../../home/' + w.home.split('/').pop() + '/.claude/adminhead-plans/proj/new.json',
      '/work/repo/link/proj/not-yet.json', // a symlink to the directory, the file does not exist yet
      '/work/repo/link',
    ]
    for (const file_path of tries) {
      expect([file_path, (await call($, { tool: 'Write', file_path, content: 'x' })).deny]).toEqual([
        file_path,
        'The plan files are changed only through the plan tool.',
      ])
    }
    expect(root).toContain('adminhead-plans')
  })

  test('Bash commands naming the directory are denied, long ones when they name it at all', async ($: any, on: any) => {
    const { w } = guardWorld(on)
    for (const command of [
      `cat ${w.home}/.claude/adminhead-plans/proj/p.json`,
      'rm -rf ~/.claude/adminhead-plans',
      'echo x > "$HOME/.claude//adminhead-plans/proj/p.jsonl"',
      `${'echo hi; '.repeat(1100)}ls ~/.claude/adminhead-plans`,
    ]) {
      expect([command.slice(0, 40), (await call($, { tool: 'Bash', command })).deny]).toEqual([
        command.slice(0, 40),
        'The plan files are changed only through the plan tool.',
      ])
    }
  })

  test('unrelated calls pass', async ($: any, on: any) => {
    const { w } = guardWorld(on)
    for (const e of [
      { tool: 'Write', file_path: '/work/repo/src/a.ts', content: 'x' },
      { tool: 'Write', file_path: `${w.home}/.claude/adminhead-plans-notes/a.md`, content: 'x' },
      { tool: 'Edit', file_path: 'src/a.ts', old_string: 'a', new_string: 'b' },
      { tool: 'Bash', command: 'git status && ls ~/.claude' },
      { tool: 'Bash', command: `${'echo hi; '.repeat(1100)}ls` },
    ]) {
      const r = await call($, e)
      expect([e.tool, r.deny, r.result]).toEqual([e.tool, undefined, 'ran'])
    }
  })

  test('a call the guard could not check is denied, not passed', async ($: any, on: any) => {
    const w = world(on)
    w.cwdThrows = true
    on('tool.call', () => ({ result: 'ran' }))
    const r = await call($, { tool: 'Write', file_path: `${w.home}/x.txt`, content: 'x' })
    expect(r.deny).toBe('plan-ledger: could not check this call. Retry.')
  })
})
