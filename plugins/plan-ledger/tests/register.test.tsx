import { describe, expect, test } from 'claude-code/testing'
import { dirOf, listPlans, mutate, planTool, plansCommand, readPlan, register, verifyItem } from '../hooks/register'
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
  /** `$.tool.check` for a Bash command; may throw. */
  verdict: (command: string) => { decision: string; reason?: string }
  /** What `$.ui.ask` answers; 'reject' makes it reject (dismissed, or `-p`). */
  answer: string
  asked: { question: string; options: unknown }[]
  checked: string[]
  /** Every check argv the mod ran (anything that is not store plumbing or git), with its cwd. */
  checkRuns: { argv: string[]; cwd: unknown; timeoutMs: unknown }[]
  /** Runs one check; may throw (a timeout). Default: exit 0. */
  checkImpl: (argv: string[], cwd: unknown) => Promise<{ exit: number; out?: string }> | { exit: number; out?: string }
  git: { head: string; diff: string; status: string }
  gitCalls: { argv: string[]; cwd: unknown }[]
  /** What `$.agent.list()` returns. */
  agents: { id: string; type: string; status: string }[]
  agentListThrows: boolean
  sessionId: string
  /** Texts handed to `$.prompt.fill`, and whether the prompt box takes them. */
  filled: string[]
  fillOk: boolean
  /** Called by `$.clock.sleep`: lets a test change the world between a call and its retry. */
  onSleep: (() => void) | null
  /** Called by `$.ui.ask` before it answers. */
  onAsk: (() => void) | null
  /** How many seconds old a held lock's owner file says it is. */
  lockAge: number
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
    verdict: () => ({ decision: 'allow' }),
    answer: 'Run it',
    asked: [],
    checked: [],
    checkRuns: [],
    checkImpl: () => ({ exit: 0, out: 'ok' }),
    git: { head: 'a'.repeat(40), diff: '', status: '' },
    gitCalls: [],
    agents: [],
    agentListThrows: false,
    sessionId: 'sess-1',
    filled: [],
    fillOk: true,
    onSleep: null,
    onAsk: null,
    lockAge: 0,
  }
  const h: Record<string, (e: any) => any> = {
    'env.get': () => w.home,
    'session.repo': () => ({ root: '/work/repo', remote: null, internal: false, name: null }),
    'session.cwd': () => {
      if (w.cwdThrows) throw new Error('boom')
      return '/work/repo'
    },
    'clock.now': () => (w.now += 1000),
    'clock.sleep': () => w.onSleep?.(),
    'session.id': () => w.sessionId,
    'agent.list': () => {
      if (w.agentListThrows) throw new Error('boom')
      return w.agents
    },
    'prompt.fill': (e) => {
      w.filled.push(e.text)
      return { isFilled: w.fillOk, text: e.text, cursor: e.text.length }
    },
    'ui.log': () => undefined,
    'fs.exists': (e) => w.files.has(e.path) || w.dirs.has(e.path) || w.locks.has(e.path),
    'fs.read': (e) => {
      if (e.path.endsWith('/owner') && w.locks.has(e.path.slice(0, -'/owner'.length))) {
        return `${w.locks.get(e.path.slice(0, -'/owner'.length))} ${Math.floor(w.now / 1000) - w.lockAge}`
      }
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
    'tool.check': (e) => {
      w.log.push('tool.check')
      w.checked.push(e.input.command)
      return w.verdict(e.input.command)
    },
    'ui.ask': (e) => {
      w.log.push('ask')
      w.asked.push({ question: e.question, options: e.options })
      w.onAsk?.()
      if (w.answer === 'reject') throw new Error('dismissed')
      return w.answer
    },
    'process.run': (e) => {
      const [a0, a1, script, , ...a] = e.argv as string[]
      if (a0 === 'git') {
        w.log.push('git')
        w.gitCalls.push({ argv: e.argv, cwd: e.init?.cwd })
        if (a1 === 'rev-parse') return res(0, `${w.git.head}\n`)
        return res(0, a1 === 'diff' ? w.git.diff : w.git.status)
      }
      if (a0 !== 'sh' && a0 !== 'rm' && a0 !== 'mv') {
        w.log.push('check')
        w.checkRuns.push({ argv: e.argv, cwd: e.init?.cwd, timeoutMs: e.init?.timeoutMs })
        return Promise.resolve(w.checkImpl(e.argv, e.init?.cwd)).then((r) => res(r.exit, r.out ?? ''))
      }
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
  // `tool.check` and `ui.ask` are called only through the fake `$` below: stubbing them on the engine would change what
  // the stub's `{ value }` wrapper means for an event.
  for (const name of Object.keys(h)) if (name !== 'tool.check' && name !== 'ui.ask') on(name, (_$: any, e: any) => ({ value: h[name](e) }))

  const $ = {
    env: { get: async (name: string) => h['env.get']({ name }) },
    session: { repo: async () => h['session.repo']({}), cwd: async () => h['session.cwd']({}), id: async () => h['session.id']({}) },
    agent: { list: async () => h['agent.list']({}) },
    prompt: { fill: async (input: { text: string }) => h['prompt.fill'](input) },
    clock: { now: async () => h['clock.now']({}), sleep: async (ms: number) => h['clock.sleep']({ ms }) },
    ui: { log: (text: string) => h['ui.log']({ text }), ask: async (question: string, options?: unknown) => h['ui.ask']({ question, options }) },
    tool: { check: async (input: unknown) => h['tool.check'](input) },
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

describe('verification', () => {
  const A1 = { kind: 'agent', agentId: 'a1', agentType: 'coder', session: 's1' } as const
  const unit = { label: 'unit', argv: ['bun', 'test', 'x'], expectExit: 0 }
  const lint = { label: 'lint', argv: ['bun', 'lint'], expectExit: 1 }

  /** A plan whose only item `s1` is `claimed_done` by the bound agent `a1`. */
  async function claimed(w: World & { $: any }, checks: unknown[] = [unit]) {
    w.dirs.add('/work/repo')
    w.dirs.add('/work/other')
    w.links.set('/work/link', '/work/other')
    const made = await mutate(w.$, null, { action: 'create', title: 'Plan', items: [{ ...item, checks }] } as any, MAIN)
    expect(made.ok).toBe(true)
    const id = made.planId as string
    const steps: [any, any][] = [
      [{ action: 'activate', plan: id }, MAIN],
      [{ action: 'claim', plan: id, item: 's1' }, A1],
      [{ action: 'claim_done', plan: id, item: 's1', summary: 'done', commands: [], commits: [], files: [] }, A1],
    ]
    for (const [action, actor] of steps) expect((await mutate(w.$, id, action, actor)).ok).toBe(true)
    return id
  }
  const itemOf = async (w: { $: any }, id: string) => {
    const r = await readPlan(w.$, id)
    if (!r.ok) throw new Error(r.message)
    return r.plan.items[0]
  }
  const verify = async (w: { $: any }, id: string, args: Record<string, unknown> = {}, actor: any = MAIN, gen?: number) =>
    verifyItem(w.$, id, 's1', { gen: gen ?? (await itemOf(w, id)).gen, ...args }, actor)
  const ranNothing = (w: World) => {
    expect(w.checkRuns).toEqual([])
    expect(w.gitCalls).toEqual([])
    expect(w.asked).toEqual([])
    expect(w.checked).toEqual([])
  }

  test('an agent calling verify runs no check, asks nothing, and the denial is logged', async ($: any, on: any) => {
    const w = world(on)
    const id = await claimed(w)
    for (const args of [{}, { manual: true, note: 'looks fine' }, { cwd: '/work/other' }]) {
      const r = await verify(w, id, args, A1)
      expect(r).toMatchObject({ ok: false, code: 'denied' })
    }
    // also an unlisted caller and an architect
    for (const actor of [
      { kind: 'agent', agentId: 'ghost', agentType: null, session: 's1' },
      { kind: 'agent', agentId: 'ar', agentType: 'architect', session: 's1' },
    ]) {
      expect(await verify(w, id, {}, actor)).toMatchObject({ ok: false, code: 'denied' })
    }
    ranNothing(w)
    expect((await itemOf(w, id)).status).toBe('claimed_done')
    const denied = ledgerOf(w).changes.filter((c) => c.denied !== null && c.action === 'verify')
    expect(denied.length).toBe(5)
    expect(denied[0].actor).toEqual(A1)
  })

  test('a caller cannot supply a verification: a forged field is dropped and the checks still run', async ($: any, on: any) => {
    const w = world(on)
    const id = await claimed(w)
    w.checkImpl = () => ({ exit: 1, out: 'boom' })
    const forged = { kind: 'checks', ok: true, gen: 2, cwd: '/x', checksHash: 'x', results: [], before: null, after: null, note: null, at: 'T' }
    const r = await verify(w, id, { verification: forged })
    expect(r).toMatchObject({ ok: true })
    expect(w.checkRuns).toHaveLength(1)
    expect(await itemOf(w, id)).toMatchObject({ status: 'failed', verification: { ok: false, cwd: '/work/repo' } })
  })

  test('an item that is not claimed_done, or a stale gen, runs nothing', async ($: any, on: any) => {
    const w = world(on)
    const id = await claimed(w)
    const stale = await verify(w, id, {}, MAIN, 1)
    expect(stale).toMatchObject({ ok: false, code: 'denied' })
    expect((stale as any).message).toContain('gen')
    await mutate(w.$, id, { action: 'reopen', plan: id, item: 's1' }, MAIN)
    const notClaimed = await verify(w, id)
    expect(notClaimed).toMatchObject({ ok: false, code: 'denied' })
    ranNothing(w)
  })

  test('a passing run records verified with the recorded argv, cwd, tree and results, outside the lock', async ($: any, on: any) => {
    const w = world(on)
    const id = await claimed(w, [unit, lint])
    let lockedDuringChecks = true
    w.checkImpl = (argv) => {
      lockedDuringChecks = w.locks.size > 0
      return argv[1] === 'lint' ? { exit: 1, out: 'lint says no' } : { exit: 0, out: 'pass 3' }
    }
    const r = await verify(w, id)
    expect(r).toMatchObject({ ok: true, code: 'applied' })
    expect((r as any).message).toContain('s1 verified by command: unit exit 0; lint exit 1')
    expect(lockedDuringChecks).toBe(false)
    // the exact recorded argv, in order, in the session cwd, with the long timeout
    expect(w.checkRuns.map((c) => c.argv)).toEqual([unit.argv, lint.argv])
    expect(w.checkRuns.every((c) => c.cwd === '/work/repo' && c.timeoutMs === 600_000)).toBe(true)
    // gate first, then git, then the checks, then git; all tree commands in the same cwd
    expect(w.log.filter((l) => ['tool.check', 'git', 'check', 'ask'].includes(l))).toEqual([
      'tool.check',
      'tool.check',
      'git', 'git', 'git',
      'check', 'check',
      'git', 'git', 'git',
    ])
    expect(w.gitCalls.every((g) => g.cwd === '/work/repo')).toBe(true)
    expect(w.checked).toEqual([`'bun' 'test' 'x'`, `'bun' 'lint'`])
    const it = await itemOf(w, id)
    expect(it.status).toBe('verified')
    expect(it.verification).toMatchObject({
      kind: 'checks',
      ok: true,
      gen: it.gen,
      cwd: '/work/repo',
      before: { head: 'a'.repeat(40) },
      after: { head: 'a'.repeat(40) },
      results: [
        { label: 'unit', exit: 0, expectExit: 0, outTail: 'pass 3' },
        { label: 'lint', exit: 1, expectExit: 1, outTail: 'lint says no' },
      ],
    })
    const last = ledgerOf(w).changes.at(-1)
    expect(last).toMatchObject({ action: 'verify', from: 'claimed_done', to: 'verified', actor: MAIN })
    expect(w.locks.size).toBe(0)
  })

  test('a failing check sets failed and closes the cycle; the agent must claim again', async ($: any, on: any) => {
    const w = world(on)
    const id = await claimed(w)
    w.checkImpl = () => ({ exit: 2, out: 'assertion failed' })
    const r = await verify(w, id)
    expect(r).toMatchObject({ ok: true })
    expect((r as any).message).toContain('s1 failed by command: unit exit 2 (expected 0): assertion failed')
    const it = await itemOf(w, id)
    expect(it).toMatchObject({ status: 'failed', attempts: 1, failure: expect.stringContaining('assertion failed') })
    // the cycle is closed: the same agent claims again, attempts 2
    expect((await mutate(w.$, id, { action: 'claim', plan: id, item: 's1' }, A1)).ok).toBe(true)
    expect((await itemOf(w, id)).attempts).toBe(2)
  })

  test('a check that cannot run (timeout, no such program) counts as failed, not skipped', async ($: any, on: any) => {
    const w = world(on)
    const id = await claimed(w, [unit, lint])
    w.checkImpl = (argv) => {
      if (argv[1] === 'test') throw new Error('timed out')
      return { exit: 1 }
    }
    const r = await verify(w, id)
    expect(r).toMatchObject({ ok: true })
    const it = await itemOf(w, id)
    expect(it.status).toBe('failed')
    expect(it.verification?.results).toHaveLength(2)
    expect(it.verification?.results[0]).toMatchObject({ label: 'unit', exit: -1 })
    expect(it.verification?.results[0].outTail).toContain('timed out')
  })

  describe('the execution gate', () => {
    test('tool.check deny refuses without running anything, git included', async ($: any, on: any) => {
      const w = world(on)
      const id = await claimed(w)
      w.verdict = () => ({ decision: 'deny', reason: 'no' })
      const r = await verify(w, id)
      expect(r).toMatchObject({ ok: false, code: 'denied' })
      expect((r as any).message).toContain('denied by the user')
      expect(w.checkRuns).toEqual([])
      expect(w.gitCalls).toEqual([])
      expect(w.asked).toEqual([])
      expect((await itemOf(w, id)).status).toBe('claimed_done')
    })

    test('every check is gated before the first one runs', async ($: any, on: any) => {
      const w = world(on)
      const id = await claimed(w, [unit, lint])
      w.verdict = (command) => (command.includes('lint') ? { decision: 'deny' } : { decision: 'allow' })
      expect(await verify(w, id)).toMatchObject({ ok: false, code: 'denied' })
      expect(w.checked).toHaveLength(2)
      expect(w.checkRuns).toEqual([])
      expect(w.gitCalls).toEqual([])
    })

    test('ask goes to the person with the exact argv and cwd; "Run it" runs, anything else refuses', async ($: any, on: any) => {
      const w = world(on)
      const id = await claimed(w)
      w.verdict = () => ({ decision: 'ask', reason: 'needs approval' })
      w.answer = 'Run it'
      expect(await verify(w, id)).toMatchObject({ ok: true })
      expect(w.asked).toHaveLength(1)
      expect(w.asked[0].question).toContain(JSON.stringify(unit.argv))
      expect(w.asked[0].question).toContain('"/work/repo"')
      expect(w.asked[0].options).toMatchObject({ options: ['Run it', 'Refuse'] })
      expect(w.checkRuns).toHaveLength(1)

      for (const answer of ['Refuse', 'reject', 'Run it please', '', 'run it']) {
        const w2 = world(on)
        const id2 = await claimed(w2)
        w2.verdict = () => ({ decision: 'ask' })
        w2.answer = answer
        const r = await verify(w2, id2)
        expect([answer, r.ok]).toEqual([answer, false])
        expect(w2.asked).toHaveLength(1)
        expect(w2.checkRuns).toEqual([])
        expect(w2.gitCalls).toEqual([])
        expect((await itemOf(w2, id2)).status).toBe('claimed_done')
      }
    })

    test('an unavailable or unrecognised verdict is an ask, never a run', async ($: any, on: any) => {
      const w = world(on)
      const id = await claimed(w)
      w.verdict = () => {
        throw new Error('no engine')
      }
      w.answer = 'Refuse'
      expect(await verify(w, id)).toMatchObject({ ok: false })
      expect(w.asked).toHaveLength(1)
      w.verdict = () => ({ decision: 'maybe' })
      expect(await verify(w, id)).toMatchObject({ ok: false })
      expect(w.asked).toHaveLength(2)
      expect(w.checkRuns).toEqual([])
    })

    test('allow runs without asking', async ($: any, on: any) => {
      const w = world(on)
      const id = await claimed(w)
      expect(await verify(w, id)).toMatchObject({ ok: true })
      expect(w.asked).toEqual([])
    })
  })

  describe('cwd', () => {
    test('the named cwd is canonicalized, recorded, shown to the person, and used for every command', async ($: any, on: any) => {
      const w = world(on)
      const id = await claimed(w)
      w.verdict = () => ({ decision: 'ask' })
      const r = await verify(w, id, { cwd: '/work/link' })
      expect(r).toMatchObject({ ok: true })
      expect(w.asked[0].question).toContain('"/work/other"')
      expect(w.checkRuns[0].cwd).toBe('/work/other')
      expect(w.gitCalls.every((g) => g.cwd === '/work/other')).toBe(true)
      expect((await itemOf(w, id)).verification?.cwd).toBe('/work/other')
    })

    test('a relative, missing or non-directory cwd is refused before anything runs', async ($: any, on: any) => {
      const w = world(on)
      const id = await claimed(w)
      w.files.set('/work/file.txt', 'x')
      for (const cwd of ['work/repo', '/work/missing', '/work/file.txt', '/work/repo\nx', '', '/' + 'a'.repeat(2000)]) {
        const r = await verify(w, id, { cwd })
        expect([cwd.slice(0, 20), r.ok]).toEqual([cwd.slice(0, 20), false])
      }
      ranNothing(w)
    })
  })

  describe('a moving tree', () => {
    test('HEAD changing during the run refuses verified and records nothing', async ($: any, on: any) => {
      const w = world(on)
      const id = await claimed(w)
      const revBefore = (await itemOf(w, id)).status
      w.checkImpl = () => {
        w.git.head = 'b'.repeat(40)
        return { exit: 0 }
      }
      const r = await verify(w, id)
      expect(r).toMatchObject({ ok: false, code: 'denied' })
      expect((r as any).message).toContain('HEAD moved')
      const it = await itemOf(w, id)
      expect(it.status).toBe(revBefore)
      expect(it.verification).toBeNull()
      expect(ledgerOf(w).changes.some((c) => c.action === 'verify')).toBe(false)
    })

    test('a changed diff or status refuses, a quiet tree does not', async ($: any, on: any) => {
      for (const [field, ok] of [['diff', false], ['status', false], [null, true]] as const) {
        const w = world(on)
        const id = await claimed(w)
        w.checkImpl = () => {
          if (field !== null) w.git[field] = 'changed'
          return { exit: 0 }
        }
        expect([field, (await verify(w, id)).ok]).toEqual([field, ok])
        expect((await itemOf(w, id)).status).toBe(ok ? 'verified' : 'claimed_done')
      }
    })

    test('a directory with no git is fingerprinted as none and can still be verified', async ($: any, on: any) => {
      const w = world(on)
      const id = await claimed(w)
      const run = w.$.process.run
      w.$.process.run = async (argv: string[], init?: any) => (argv[0] === 'git' ? { exitCode: 128, stdout: '', stderr: 'fatal' } : run(argv, init))
      expect(await verify(w, id)).toMatchObject({ ok: true })
      expect((await itemOf(w, id)).verification?.before?.head).toBe('none')
    })
  })

  describe('commit only if the item is unchanged', () => {
    test('an item reopened during the run is not marked verified', async ($: any, on: any) => {
      const w = world(on)
      const id = await claimed(w)
      w.checkImpl = async () => {
        await mutate(w.$, id, { action: 'reopen', plan: id, item: 's1' }, MAIN)
        return { exit: 0 }
      }
      const r = await verify(w, id)
      expect(r).toMatchObject({ ok: false, code: 'denied' })
      expect((r as any).message).toContain('not recorded')
      expect(await itemOf(w, id)).toMatchObject({ status: 'pending', verification: null })
    })

    test('an item that went through reopen, claim and claim_done again (a new gen) is not verified by the old run', async ($: any, on: any) => {
      const w = world(on)
      const id = await claimed(w)
      const gen0 = (await itemOf(w, id)).gen
      w.checkImpl = async () => {
        w.checkImpl = () => ({ exit: 0 })
        for (const [action, actor] of [
          [{ action: 'reopen', plan: id, item: 's1' }, MAIN],
          [{ action: 'claim', plan: id, item: 's1' }, A1],
          [{ action: 'claim_done', plan: id, item: 's1', summary: 'again', commands: [], commits: [], files: [] }, A1],
        ] as const) {
          expect((await mutate(w.$, id, action as any, actor as any)).ok).toBe(true)
        }
        return { exit: 0 }
      }
      const r = await verify(w, id)
      expect(r).toMatchObject({ ok: false, code: 'denied' })
      const it = await itemOf(w, id)
      expect(it.gen).toBeGreaterThan(gen0)
      expect(it).toMatchObject({ status: 'claimed_done', verification: null })
    })

    test('other items changing during the run do not block the commit', async ($: any, on: any) => {
      const w = world(on)
      const id = await claimed(w)
      w.checkImpl = async () => {
        await mutate(w.$, id, { action: 'amend', plan: id, planTitle: 'Renamed meanwhile' }, MAIN)
        return { exit: 0 }
      }
      expect(await verify(w, id)).toMatchObject({ ok: true })
      expect((await itemOf(w, id)).status).toBe('verified')
    })

    test('a verify retried with its op is not applied twice', async ($: any, on: any) => {
      const w = world(on)
      const id = await claimed(w)
      const gen = (await itemOf(w, id)).gen
      const first = await verifyItem(w.$, id, 's1', { gen }, MAIN, { op: 'op-v1' })
      expect(first).toMatchObject({ ok: true, code: 'applied' })
      const runs = w.checkRuns.length
      // the item is no longer claimed_done, so the retry runs nothing and the ledger's op id answers it
      const again = await verifyItem(w.$, id, 's1', { gen }, MAIN, { op: 'op-v1' })
      expect(again).toMatchObject({ ok: true, code: 'duplicate' })
      expect(w.checkRuns.length).toBe(runs)
      expect(ledgerOf(w).changes.filter((c) => c.action === 'verify' && c.denied === null)).toHaveLength(1)
    })
  })

  describe('a retried verify tells the model what is persisted and never repeats the prompt or the checks', () => {
    const viaTool = (w: World & { $: any }, id: string, gen: number) =>
      planTool(w.$, { tool: 'mcp__plan-ledger__plan', tool_use_id: 'tu', action: 'verify', plan: id, item: 's1', gen }, 3) as Promise<any>

    test('the ledger has a failing verification but the publish failed: the retry reports that one, runs nothing, asks nothing', async ($: any, on: any) => {
      const w = world(on)
      const id = await claimed(w)
      const gen = (await itemOf(w, id)).gen
      w.verdict = () => ({ decision: 'ask' })
      let runs = 0
      w.checkImpl = () => ({ exit: ++runs === 1 ? 1 : 0, out: runs === 1 ? 'first run fails' : 'second run passes' })
      w.failMv = true
      w.onSleep = () => {
        w.failMv = false
      }
      const r = await viaTool(w, id, gen)
      expect(r.result).toContain('s1 failed by command: unit exit 1 (expected 0): first run fails')
      expect(r.result).toContain('already applied')
      expect(r.result).not.toContain('verified')
      expect(runs).toBe(1)
      expect(w.asked).toHaveLength(1)
      expect(await itemOf(w, id)).toMatchObject({ status: 'failed', verification: { ok: false } })
      expect(ledgerOf(w).changes.filter((c) => c.action === 'verify' && c.denied === null)).toHaveLength(1)
    })

    test('the commit finds the lock busy: the retry commits the same judged result without a second prompt or run', async ($: any, on: any) => {
      const w = world(on)
      const id = await claimed(w)
      const gen = (await itemOf(w, id)).gen
      w.verdict = () => ({ decision: 'ask' })
      w.checkImpl = () => {
        w.stuck = true // the lock is held from the moment the checks finish until the retry's sleep
        return { exit: 0, out: 'pass' }
      }
      w.onSleep = () => {
        w.stuck = false
      }
      const r = await viaTool(w, id, gen)
      expect(r.result).toContain('s1 verified by command: unit exit 0')
      expect(w.checkRuns).toHaveLength(1)
      expect(w.asked).toHaveLength(1)
      expect(w.gitCalls).toHaveLength(6)
      expect((await itemOf(w, id)).status).toBe('verified')
      expect(ledgerOf(w).changes.filter((c) => c.action === 'verify' && c.denied === null)).toHaveLength(1)
    })

    for (const [name, failing] of [['before the checks', 0], ['after the checks', 3]] as const) {
      test(`git cannot be read ${name}: the retry re-reads the tree only, not the prompt or the checks`, async ($: any, on: any) => {
        const w = world(on)
        const id = await claimed(w)
        const gen = (await itemOf(w, id)).gen
        w.verdict = () => ({ decision: 'ask' })
        const run = w.$.process.run
        let gitSeen = 0
        w.$.process.run = async (argv: string[], init?: any) => {
          if (argv[0] === 'git' && gitSeen++ === failing) throw new Error('git is not available')
          return run(argv, init)
        }
        const r = await viaTool(w, id, gen)
        expect(r.result).toContain('s1 verified by command')
        expect(w.checkRuns).toHaveLength(1)
        expect(w.asked).toHaveLength(1)
        expect((await itemOf(w, id)).status).toBe('verified')
      })
    }
  })

  describe('ifRev', () => {
    test('a stale ifRev refuses before anything is asked or run, and the refusal is logged', async ($: any, on: any) => {
      const w = world(on)
      const id = await claimed(w)
      w.verdict = () => ({ decision: 'ask' })
      const rev = jsonOf(w).rev
      const r = await verify(w, id, { ifRev: rev - 1 })
      expect(r).toMatchObject({ ok: false, code: 'denied' })
      expect((r as any).message).toContain('rev')
      ranNothing(w)
      expect((await itemOf(w, id)).status).toBe('claimed_done')
      expect(ledgerOf(w).changes.at(-1)).toMatchObject({ action: 'verify', denied: expect.stringContaining('rev') })
    })

    test('a matching ifRev runs the checks, and the plan moving during the run does not block the commit', async ($: any, on: any) => {
      const w = world(on)
      const id = await claimed(w)
      w.checkImpl = async () => {
        await mutate(w.$, id, { action: 'amend', plan: id, planTitle: 'Renamed meanwhile' }, MAIN)
        return { exit: 0 }
      }
      expect(await verify(w, id, { ifRev: jsonOf(w).rev })).toMatchObject({ ok: true, code: 'applied' })
      expect(w.checkRuns).toHaveLength(1)
    })

    test('a manual verify with a stale ifRev is refused too', async ($: any, on: any) => {
      const w = world(on)
      const id = await claimed(w, [])
      expect(await verify(w, id, { manual: true, note: 'read it', ifRev: 1 })).toMatchObject({ ok: false, code: 'denied' })
      expect((await itemOf(w, id)).status).toBe('claimed_done')
    })

    test('the tool passes ifRev through to verify', async ($: any, on: any) => {
      const w = world(on)
      const id = await claimed(w)
      const gen = (await itemOf(w, id)).gen
      const r = await planTool(w.$, { tool: 'mcp__plan-ledger__plan', tool_use_id: 'tu', action: 'verify', plan: id, item: 's1', gen, ifRev: 1 }, 3)
      expect((r as any).deny).toContain('rev')
      ranNothing(w)
    })
  })

  describe('manual', () => {
    test('an item with no checks is verified by hand with a note, running nothing, counted as manual', async ($: any, on: any) => {
      const w = world(on)
      const id = await claimed(w, [])
      const r = await verify(w, id, { manual: true, note: 'read the diff' })
      expect(r).toMatchObject({ ok: true })
      ranNothing(w)
      expect((await itemOf(w, id)).verification).toMatchObject({ kind: 'manual', ok: true, note: 'read the diff', results: [] })
    })

    test('manual needs a note, and is refused for an item that has checks', async ($: any, on: any) => {
      const w = world(on)
      const none = await claimed(w, [])
      expect(await verify(w, none, { manual: true })).toMatchObject({ ok: false, code: 'denied' })
      expect(await verify(w, none, { manual: true, note: '   ' })).toMatchObject({ ok: false })
      const some = await claimed(w, [unit])
      expect(await verify(w, some, { manual: true, note: 'trust me' })).toMatchObject({ ok: false, code: 'denied' })
      ranNothing(w)
      expect((await itemOf(w, some)).status).toBe('claimed_done')
    })

    test('an item with no checks and no manual flag is refused without running anything', async ($: any, on: any) => {
      const w = world(on)
      const id = await claimed(w, [])
      const r = await verify(w, id)
      expect(r).toMatchObject({ ok: false, code: 'denied' })
      expect((r as any).message).toContain('manual')
      ranNothing(w)
    })
  })

  test('an unknown plan or item is an error without a run', async ($: any, on: any) => {
    const w = world(on)
    const id = await claimed(w)
    expect(await verifyItem(w.$, 'p-0zzzzzzzz-zzzzzz', 's1', { gen: 1 }, MAIN)).toMatchObject({ ok: false })
    expect(await verifyItem(w.$, id, 's9', { gen: 1 }, MAIN)).toMatchObject({ ok: false })
    expect(await verifyItem(w.$, '../x', 's1', { gen: 1 }, MAIN)).toMatchObject({ ok: false })
    ranNothing(w)
  })
})

// ---------------------------------------------------------------- the plan tool (slice 8)

const PLAN_TOOL = 'mcp__plan-ledger__plan'
const RUNNING = (id: string, type: string) => ({ id, type, status: 'running' })
const twoItems = [
  { title: 'First', instructions: 'Do the first thing.', acceptance: ['it works'], agent: 'coder' },
  { title: 'Second', instructions: 'Do the second thing.', agent: 'coder' },
]
/** A call of the tool from the main loop (no agentId) or from the agent loop `agentId`, served by `planTool` on the fake `$`. */
const callTool = (w: World & { $: any }, args: Record<string, unknown>, agentId?: string) =>
  planTool(w.$, { tool: PLAN_TOOL, tool_use_id: 'tu', ...(agentId === undefined ? {} : { agentId }), ...args }, 3) as Promise<any>
const idIn = (text: string) => /p-[0-9a-z]{9}-[0-9a-z]{6}/.exec(text)?.[0] as string

async function activePlan(w: World & { $: any }) {
  const made = await callTool(w, { action: 'create', title: 'Two items', items: twoItems })
  const id = idIn(made.result)
  expect((await callTool(w, { action: 'activate', plan: id })).result).toContain('active')
  return id
}
const entries = (w: World) => ledgerOf(w).changes

describe('plan tool', () => {
  test('a main-loop create and activate through the engine write a draft, then an active plan', async ($: any, on: any) => {
    const w = world(on)
    const made = await $.tool.call({ tool: PLAN_TOOL, action: 'create', title: 'Plan', items: twoItems })
    expect(made.result).toContain('draft')
    const id = idIn(made.result)
    expect(jsonOf(w)).toMatchObject({ id, status: 'draft', rev: 1 })
    expect(jsonOf(w).items.map((i: any) => i.id)).toEqual(['s1', 's2'])
    const activated = await $.tool.call({ tool: PLAN_TOOL, action: 'activate', plan: id })
    expect(activated.result).toContain('active')
    expect(jsonOf(w)).toMatchObject({ status: 'active', rev: 2 })
    expect(entries(w).map((c) => [c.action, c.actor.kind])).toEqual([['create', 'main'], ['activate', 'main']])
  })

  test('a subagent gets, claims and claims done its own item, each entry carrying its agent id', async ($: any, on: any) => {
    const w = world(on)
    const id = await activePlan(w)
    w.agents = [RUNNING('agent-1', 'coder')]
    const got = await callTool(w, { action: 'get', plan: id, item: 's1' }, 'agent-1')
    expect(got.result).toContain('Do the first thing.')
    expect(got.result).toContain('it works')
    expect((await callTool(w, { action: 'claim', plan: id, item: 's1' }, 'agent-1')).result).toContain('s1')
    expect(jsonOf(w).items[0]).toMatchObject({ status: 'in_progress', boundAgent: { agentId: 'agent-1', session: 'sess-1' } })
    const done = await callTool(w, { action: 'claim_done', plan: id, item: 's1', summary: 'did it', commits: ['abc123'] }, 'agent-1')
    expect(done.result).toContain('claimed done')
    expect(jsonOf(w).items[0]).toMatchObject({ status: 'claimed_done', claimed: { summary: 'did it', commits: ['abc123'] } })
    const mine = entries(w).filter((c) => c.actor.kind === 'agent')
    expect(mine.map((c) => c.action)).toEqual(['claim', 'claim_done'])
    for (const c of mine) expect(c.actor).toMatchObject({ kind: 'agent', agentId: 'agent-1', agentType: 'coder' })
  })

  test('the same agent on another agent\'s item is denied and the denial is in the ledger with its agent id', async ($: any, on: any) => {
    const w = world(on)
    const id = await activePlan(w)
    w.agents = [RUNNING('agent-1', 'coder'), RUNNING('agent-2', 'coder')]
    expect((await callTool(w, { action: 'claim', plan: id, item: 's2' }, 'agent-2')).result).toBeDefined()
    const stolen = await callTool(w, { action: 'claim', plan: id, item: 's2' }, 'agent-1')
    expect(stolen.deny).toContain('another agent')
    const read = await callTool(w, { action: 'get', plan: id, item: 's2' }, 'agent-1')
    expect(read.deny).toContain('another agent')
    const progress = await callTool(w, { action: 'progress', plan: id, item: 's2', note: 'sneaky' }, 'agent-1')
    expect(progress.deny).toBeDefined()
    expect(jsonOf(w).items[1]).toMatchObject({ boundAgent: { agentId: 'agent-2' }, status: 'in_progress', note: null })
    const denials = entries(w).filter((c) => c.denied !== null)
    expect(denials.map((c) => c.action)).toEqual(['claim', 'get', 'progress'])
    for (const c of denials) expect(c.actor).toMatchObject({ agentId: 'agent-1', agentType: 'coder' })
    expect(revsOf(w)).toEqual([1, 2, 3]) // a denial never moves the rev
  })

  test('an agent cannot verify, amend, assign or activate, and verify runs no check', async ($: any, on: any) => {
    const w = world(on)
    const id = await activePlan(w)
    w.agents = [RUNNING('agent-1', 'coder')]
    for (const args of [
      { action: 'verify', plan: id, item: 's1', gen: 1, manual: true, note: 'trust me' },
      { action: 'amend', plan: id, planTitle: 'mine' },
      { action: 'assign', plan: id, item: 's1', assignee: 'agent-1' },
      { action: 'activate', plan: id },
      { action: 'abandon', plan: id },
    ]) {
      expect([args.action, (await callTool(w, args, 'agent-1')).deny]).toEqual([args.action, expect.stringContaining('orchestrator')])
    }
    expect(w.checkRuns).toEqual([])
    expect(w.asked).toEqual([])
    expect(jsonOf(w)).toMatchObject({ title: 'Two items', status: 'active' })
  })

  test('verify with a verification or results field is refused before any state is read', async ($: any, on: any) => {
    const w = world(on)
    const id = await activePlan(w)
    const logBefore = w.log.length
    const r = await callTool(w, { action: 'verify', plan: id, item: 's1', gen: 1, verification: { kind: 'checks', ok: true, results: [] } })
    expect(r.deny).toContain('runs the checks itself')
    expect((await callTool(w, { action: 'verify', plan: id, item: 's1', gen: 1, results: [] })).deny).toBeDefined()
    expect(w.log.length).toBe(logBefore)
    expect(entries(w)).toHaveLength(2)
  })

  test('an id the agent list does not name, and a listed agent that is not running, are untrusted', async ($: any, on: any) => {
    const w = world(on)
    const id = await activePlan(w)
    w.agents = [{ id: 'agent-idle', type: 'coder', status: 'idle' }, { id: 'agent-done', type: 'coder', status: 'completed' }]
    for (const agentId of ['agent-unlisted', 'agent-idle', 'agent-done']) {
      const r = await callTool(w, { action: 'claim', plan: id, item: 's1' }, agentId)
      expect([agentId, r.deny]).toEqual([agentId, expect.stringContaining('not available')])
      expect((await callTool(w, { action: 'list' }, agentId)).deny).toContain('not available')
    }
    const denials = entries(w).filter((c) => c.denied !== null)
    expect(denials).toHaveLength(3)
    for (const c of denials) expect(c.actor).toMatchObject({ kind: 'agent', agentType: null })
    expect(jsonOf(w).items[0].status).toBe('pending')
  })

  test('a failing agent list makes the caller untrusted, never the main loop', async ($: any, on: any) => {
    const w = world(on)
    const id = await activePlan(w)
    w.agentListThrows = true
    expect((await callTool(w, { action: 'claim', plan: id, item: 's1' }, 'agent-1')).deny).toContain('not available')
  })

  test('a plugin-prefixed agent type matches the item agent type', async ($: any, on: any) => {
    const w = world(on)
    const id = await activePlan(w)
    w.agents = [RUNNING('agent-1', 'coder:coder')]
    expect((await callTool(w, { action: 'claim', plan: id, item: 's1' }, 'agent-1')).deny).toBeUndefined()
  })

  test('an architect creates a draft plan no agent can claim until the orchestrator activates it', async ($: any, on: any) => {
    const w = world(on)
    w.agents = [RUNNING('arch-1', 'architect'), RUNNING('agent-1', 'coder')]
    const made = await callTool(w, { action: 'create', title: 'Drafted', items: twoItems }, 'arch-1')
    expect(made.result).toContain('draft')
    const id = idIn(made.result)
    expect(jsonOf(w)).toMatchObject({ status: 'draft', creator: { kind: 'agent', agentId: 'arch-1' } })
    expect((await callTool(w, { action: 'claim', plan: id, item: 's1' }, 'agent-1')).deny).toContain('activate')
    expect((await callTool(w, { action: 'activate', plan: id }, 'arch-1')).deny).toContain('orchestrator')
    expect((await callTool(w, { action: 'activate', plan: id })).result).toContain('active')
    expect((await callTool(w, { action: 'claim', plan: id, item: 's1' }, 'agent-1')).deny).toBeUndefined()
  })

  test('list and status show a caller only the plans it may see', async ($: any, on: any) => {
    const w = world(on)
    w.agents = [RUNNING('arch-1', 'architect'), RUNNING('arch-2', 'architect'), RUNNING('agent-1', 'coder')]
    const mine = idIn((await callTool(w, { action: 'create', title: 'Mine', items: twoItems }, 'arch-1')).result)
    const other = idIn((await callTool(w, { action: 'create', title: 'Other', items: twoItems }, 'arch-2')).result)
    const orch = idIn((await callTool(w, { action: 'create', title: 'Orchestrator', items: twoItems })).result)
    const seen = async (agentId?: string) => (await callTool(w, { action: 'list' }, agentId)).result as string
    const asArch = await seen('arch-1')
    expect(asArch).toContain(mine)
    expect(asArch).not.toContain(other)
    expect(asArch).not.toContain(orch)
    for (const id of [mine, other, orch]) expect(await seen()).toContain(id)
    expect(await seen('agent-1')).toContain(orch)
    expect((await callTool(w, { action: 'status', plan: other }, 'arch-1')).deny).toBeDefined()
    expect((await callTool(w, { action: 'status', plan: mine }, 'arch-1')).result).toContain('s1 pending')
    const open = (await callTool(w, { action: 'status' }, 'arch-1')).result as string
    expect(open).toContain(mine)
    expect(open).not.toContain(other)
  })

  test('bad input is refused with an instruction and touches nothing', async ($: any, on: any) => {
    const w = world(on)
    const id = await activePlan(w)
    const before = w.log.length
    for (const args of [
      { action: 'claim', plan: '../etc', item: 's1' },
      { action: 'bind', plan: id, item: 's1' },
      { action: 'create', title: 'x', items: [{ title: 't', instructions: 'x'.repeat(9000), agent: 'coder' }] },
    ]) expect((await callTool(w, args)).deny).toBeDefined()
    expect(w.log.length).toBe(before)
  })

  test('a failure after the change was recorded is retried with its op and applies once', async ($: any, on: any) => {
    const w = world(on)
    const id = await activePlan(w)
    w.failMv = true
    w.onSleep = () => {
      w.failMv = false
    }
    const r = await callTool(w, { action: 'amend', plan: id, planTitle: 'Renamed' })
    expect(r.result).toContain('already applied')
    expect(jsonOf(w)).toMatchObject({ title: 'Renamed', rev: 3 })
    expect(revsOf(w)).toEqual([1, 2, 3])
    expect(entries(w).filter((c) => c.action === 'amend')).toHaveLength(1)
  })

  test('a create that was recorded but not published is retried with its plan id and makes one plan', async ($: any, on: any) => {
    const w = world(on)
    w.failMv = true
    w.onSleep = () => {
      w.failMv = false
    }
    const r = await callTool(w, { action: 'create', title: 'Once', items: twoItems })
    expect(r.result).toContain('already applied')
    expect(entries(w).filter((c) => c.action === 'create')).toHaveLength(1)
    expect([...w.files.keys()].filter((k) => k.endsWith('.jsonl'))).toHaveLength(1)
  })

  test('a lock that clears between attempts is retried; a lock that stays held ends in the busy instruction', async ($: any, on: any) => {
    const w = world(on)
    const id = await activePlan(w)
    w.stuck = true
    w.onSleep = () => {
      w.stuck = false
    }
    expect((await callTool(w, { action: 'amend', plan: id, planTitle: 'After wait' })).result).toBeDefined()
    expect(jsonOf(w).title).toBe('After wait')
    w.stuck = true
    w.onSleep = null
    const acquires = w.log.filter((l) => l === 'acquire').length
    const busy = await callTool(w, { action: 'amend', plan: id, planTitle: 'Never' })
    expect(busy.deny).toContain('/plans unlock')
    expect(w.log.filter((l) => l === 'acquire').length - acquires).toBe(3)
    expect(jsonOf(w).title).toBe('After wait')
  })

  test('a denial is final: it is not retried and is logged once', async ($: any, on: any) => {
    const w = world(on)
    const id = await activePlan(w)
    const acquires = w.log.filter((l) => l === 'acquire').length
    const r = await callTool(w, { action: 'claim_done', plan: id, item: 's1', summary: 'x' })
    expect(r.deny).toBeDefined()
    expect(w.log.filter((l) => l === 'acquire').length - acquires).toBe(1)
  })

  test('registers the tool and command at session start, tolerating a taken name', async ($: any, on: any) => {
    const registered: unknown[] = []
    on('session.start', () => ({ cwd: '/work/repo' }))
    on('ui.log', () => ({ value: undefined }))
    on('tool.register', (_$: any, e: any) => {
      registered.push(['tool', e.name])
      return { value: { tool: PLAN_TOOL } }
    })
    on('command.register', (_$: any, e: any) => {
      registered.push(['command', e.name])
      return { deny: 'name taken' }
    })
    await $.session.start({ cwd: '/work/repo', surface: 'terminal', isInteractive: true })
    expect(registered).toEqual([['tool', 'plan'], ['command', 'plans']])
  })

  test('registerTool: false serves no tool calls and registers no tool', async ($: any, on: any) => {
    const seen = (options: Record<string, unknown> | undefined) => {
      const hooks: { event: string; matcher: any }[] = []
      const chain: any = { catch: () => chain }
      register(((event: string, matcher: any) => (hooks.push({ event, matcher }), chain)) as any, options as any)
      return hooks.filter((h) => h.event === 'tool.call' && JSON.stringify(h.matcher).includes('plan-ledger'))
    }
    expect(seen(undefined)).toHaveLength(1)
    expect(seen({ registerTool: true })).toHaveLength(1)
    expect(seen({ registerTool: false })).toHaveLength(0)
  })
})

// ---------------------------------------------------------------- /plans (slice 8)

const plans = (w: World & { $: any }, args: string) => plansCommand(w.$, { command: 'plans', args }, 3)

describe('/plans', () => {
  test('status through the engine lists open plans, and says so when there are none', async ($: any, on: any) => {
    const w = world(on)
    expect((await $.command.run({ command: 'plans', args: '' })).text).toBe('No open plans.')
    const id = await activePlan(w)
    const out = await $.command.run({ command: 'plans', args: 'status' })
    expect(out.text).toContain(id)
    expect(out.text).toContain('0/2 verified')
    expect((await $.command.run({ command: 'plans', args: `status ${id}` })).text).toContain('s2 pending')
  })

  test('bad arguments print the usage and read nothing', async ($: any, on: any) => {
    const w = world(on)
    const before = w.log.length
    for (const args of ['nuke', 'show ../../x', 'show', 'x'.repeat(300)]) expect((await plans(w, args)).text).toContain('Usage')
    expect(w.log.length).toBe(before)
  })

  test('show prints every item with its evidence', async ($: any, on: any) => {
    const w = world(on)
    const id = await activePlan(w)
    w.agents = [RUNNING('agent-1', 'coder')]
    await callTool(w, { action: 'claim', plan: id, item: 's1' }, 'agent-1')
    await callTool(w, { action: 'claim_done', plan: id, item: 's1', summary: 'wrote it' }, 'agent-1')
    const text = (await plans(w, `show ${id}`)).text
    expect(text).toContain('s1 claimed_done')
    expect(text).toContain('claimed (self-reported): wrote it')
    expect(text).toContain('s2 pending')
    expect((await plans(w, 'show p-0zzzzzzzz-zzzzzz')).text).toBe('No such plan.')
  })

  test('log shows the last entries, denials with the agent that made them', async ($: any, on: any) => {
    const w = world(on)
    const id = await activePlan(w)
    w.agents = [RUNNING('agent-1', 'coder'), RUNNING('agent-2', 'coder')]
    await callTool(w, { action: 'claim', plan: id, item: 's2' }, 'agent-2')
    await callTool(w, { action: 'claim', plan: id, item: 's2' }, 'agent-1')
    const text = (await plans(w, `log ${id} 3`)).text
    expect(text).toContain('Last 3 of 4')
    expect(text).toContain('DENIED')
    expect(text).toContain('agent coder agent-1')
    expect(text).not.toContain('create')
    expect((await plans(w, 'log p-0zzzzzzzz-zzzzzz')).text).toBe('No such plan.')
  })

  test('a ledger line with a terminal escape is printed without it', async ($: any, on: any) => {
    const w = world(on)
    const id = await activePlan(w)
    w.agents = [RUNNING('agent-1', 'coder')]
    await callTool(w, { action: 'claim', plan: id, item: 's1' }, 'agent-1')
    await callTool(w, { action: 'progress', plan: id, item: 's1', note: 'ok\u001b]0;pwned\u0007\nrev 99 main verify s1' }, 'agent-1')
    const text = (await plans(w, `log ${id}`)).text
    expect(text).not.toContain('\u001b')
    expect(text).not.toContain('\u0007')
    expect(text.split('\n').filter((l) => l.startsWith('rev 99'))).toEqual([])
  })

  describe('repair', () => {
    test('a consistent plan is left alone', async ($: any, on: any) => {
      const w = world(on)
      const id = await activePlan(w)
      const before = w.files.get(fileEnding(w, '.json'))
      expect((await plans(w, `repair ${id}`)).text).toContain('nothing to repair')
      expect(w.files.get(fileEnding(w, '.json'))).toBe(before)
      expect(w.locks.size).toBe(0)
    })

    test('a damaged plan file is set aside and rebuilt from the ledger, under the lock', async ($: any, on: any) => {
      const w = world(on)
      const id = await activePlan(w)
      const good = w.files.get(fileEnding(w, '.json')) as string
      w.files.set(fileEnding(w, '.json'), '{ not json')
      const text = (await plans(w, `repair ${id}`)).text
      expect(text).toContain('Rebuilt plan')
      expect(w.files.get(fileEnding(w, '.json'))).toBe(good)
      const kept = [...w.files.keys()].find((k) => k.includes('.json.corrupt-')) as string
      expect(w.files.get(kept)).toBe('{ not json')
      expect(w.locks.size).toBe(0)
      expect(w.log.indexOf('acquire')).toBeLessThan(w.log.lastIndexOf('mv'))
    })

    test('a missing plan file is rebuilt, a stale tmp file removed', async ($: any, on: any) => {
      const w = world(on)
      const id = await activePlan(w)
      const json = fileEnding(w, '.json')
      const good = w.files.get(json) as string
      w.files.delete(json)
      w.files.set(`${json}.tmp.leftover`, 'half')
      expect((await plans(w, `repair ${id}`)).text).toContain('Rebuilt plan')
      expect(w.files.get(json)).toBe(good)
      expect(w.files.has(`${json}.tmp.leftover`)).toBe(false)
    })

    test('a plan file ahead of its ledger is replaced only when the person says so', async ($: any, on: any) => {
      const w = world(on)
      const id = await activePlan(w)
      const json = fileEnding(w, '.json')
      const ahead = JSON.stringify({ ...jsonOf(w), rev: 9, title: 'Ahead' })
      for (const [reply, replaced] of [['Keep the plan file', false], ['reject', false], ['Rebuild from the ledger', true]] as const) {
        w.files.set(json, ahead)
        w.answer = reply
        const text = (await plans(w, `repair ${id}`)).text
        expect([reply, w.files.get(json) === ahead]).toEqual([reply, !replaced])
        expect(text.length).toBeGreaterThan(0)
      }
      expect(w.asked).toHaveLength(3)
      expect(w.asked[0].question).toContain('rev 9')
      expect(jsonOf(w).rev).toBe(2)
    })

    test('a ledger that cannot be replayed leaves the plan file alone', async ($: any, on: any) => {
      const w = world(on)
      const id = await activePlan(w)
      const ledger = fileEnding(w, '.jsonl')
      const lines = (w.files.get(ledger) as string).split('\n')
      w.files.set(ledger, `${lines[1]}\n`) // the create line is gone: a rev gap
      const json = w.files.get(fileEnding(w, '.json'))
      expect((await plans(w, `repair ${id}`)).text).toContain('cannot be replayed')
      expect(w.files.get(fileEnding(w, '.json'))).toBe(json)
    })

    test('an unknown plan and a busy lock are reported', async ($: any, on: any) => {
      const w = world(on)
      await activePlan(w)
      expect((await plans(w, 'repair p-0zzzzzzzz-zzzzzz')).text).toContain('no change ledger')
      w.stuck = true
      expect((await plans(w, `repair ${idIn([...w.files.keys()].find((k) => k.endsWith('.json')) as string)}`)).text).toContain('busy')
    })
  })

  describe('unlock', () => {
    const held = (w: World & { $: any }, id: string, token = 'tok-123456789') => {
      w.locks.set(`${dirname(fileEnding(w, '.json'))}/${id}.lock`, token)
      return `${dirname(fileEnding(w, '.json'))}/${id}.lock`
    }

    test('a plan that is not locked says so and asks nothing', async ($: any, on: any) => {
      const w = world(on)
      const id = await activePlan(w)
      expect((await plans(w, `unlock ${id}`)).text).toContain('not locked')
      expect(w.asked).toEqual([])
    })

    test('the question shows the holder and its age; removing releases only that holder\'s lock', async ($: any, on: any) => {
      const w = world(on)
      const id = await activePlan(w)
      const lock = held(w, id)
      w.lockAge = 125
      w.answer = 'Remove the lock'
      expect((await plans(w, `unlock ${id}`)).text).toContain('Removed')
      expect(w.locks.has(lock)).toBe(false)
      expect(w.asked[0].question).toContain('tok-1234')
      expect(w.asked[0].question).toMatch(/held for 12[5-9] s/)
    })

    test('keeping it, dismissing the question and a lock that changed hands all leave the lock', async ($: any, on: any) => {
      const w = world(on)
      const id = await activePlan(w)
      const lock = held(w, id)
      w.answer = 'Keep the lock'
      expect((await plans(w, `unlock ${id}`)).text).toContain('left')
      w.answer = 'reject'
      expect((await plans(w, `unlock ${id}`)).text).toContain('Nobody could be asked')
      expect(w.locks.has(lock)).toBe(true)
      w.answer = 'Remove the lock'
      w.onAsk = () => w.locks.set(lock, 'someone-else') // a new holder took it while the question was open
      expect((await plans(w, `unlock ${id}`)).text).toContain('changed hands')
      expect(w.locks.get(lock)).toBe('someone-else')
    })
  })

  describe('abandon', () => {
    test('abandons the plan as the main actor and records it', async ($: any, on: any) => {
      const w = world(on)
      const id = await activePlan(w)
      expect((await plans(w, `abandon ${id}`)).text).toContain('abandoned')
      expect(jsonOf(w).status).toBe('abandoned')
      expect(entries(w).at(-1)).toMatchObject({ action: 'abandon', actor: { kind: 'main' } })
      expect((await plans(w, `abandon ${id}`)).text).toContain('abandoned') // a second one is refused with the reason
    })
  })

  describe('goal-text', () => {
    test('fills the prompt with a /goal condition naming the counts, and submits nothing', async ($: any, on: any) => {
      const w = world(on)
      const id = await activePlan(w)
      const out = (await plans(w, `goal-text ${id}`)).text
      expect(w.filled).toHaveLength(1)
      expect(w.filled[0]).toContain(`/goal Every item of plan ${id}`)
      expect(w.filled[0]).toContain('0 verified by command, 0 manually, 2 open')
      expect(out).toContain('nothing was submitted')
    })

    test('when the prompt cannot be filled the text is printed', async ($: any, on: any) => {
      const w = world(on)
      const id = await activePlan(w)
      w.fillOk = false
      expect((await plans(w, `goal-text ${id}`)).text).toContain(`/goal Every item of plan ${id}`)
    })
  })
})
