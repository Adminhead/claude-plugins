import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  appendArgv,
  isPlanId,
  lineFor,
  lockAcquireArgv,
  lockReleaseArgv,
  mkdirArgv,
  newPlanId,
  planPaths,
  projectKey,
  publishArgv,
  tailArgv,
  tmpPath,
} from '../hooks/plan/store'
import type { Change } from '../hooks/plan/types'

const HASH = 'ab12cd34ef56a1b2c3d4e5f6a7b8c9d0'
const PLAN_ID = 'p-0abcdefgh-abc123'

let tmp = ''
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'plan-store-'))
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

type Out = { code: number; out: string; err: string }
async function run(argv: string[], stdin?: string): Promise<Out> {
  // cwd is the test's temp directory, so a command that did get injected would leave its mark there.
  const p = Bun.spawn(argv, { cwd: tmp, stdin: stdin === undefined ? 'ignore' : new Blob([stdin]), stdout: 'pipe', stderr: 'pipe' })
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited])
  return { code, out, err }
}

describe('ids and paths (pure)', () => {
  test('projectKey depends only on the root and hash it is given', () => {
    // A worktree and its main tree share a key only because the caller passes the same root.
    expect(projectKey('/home/u/src/app', HASH)).toBe(projectKey('/home/u/src/app', HASH))
    expect(projectKey('/home/u/src/app', HASH)).toBe('app-ab12cd34ef56')
    expect(projectKey('/home/u/src/app', HASH)).not.toBe(projectKey('/home/u/src/app-wt', HASH))
    expect(projectKey('/home/u/src/app', HASH)).not.toBe(projectKey('/home/u/src/app', 'ffffffffffff' + HASH))
  })

  test('projectKey sanitizes and bounds the basename', () => {
    const k = projectKey(`/x/${'a b/c'.repeat(30)}`, HASH)
    expect(k).toMatch(/^[A-Za-z0-9._-]{1,40}-ab12cd34ef56$/)
    expect(projectKey('/x/we ird$(id)\n', HASH)).toBe('we_ird__id__-ab12cd34ef56')
    expect(projectKey('/', HASH)).toBe('root-ab12cd34ef56')
    expect(projectKey('/x/app/', HASH)).toBe('app-ab12cd34ef56')
    expect(() => projectKey('/x/app', 'not-hex')).toThrow()
  })

  test('isPlanId accepts valid ids and rejects traversal and malformed ids', () => {
    expect(isPlanId(PLAN_ID)).toBe(true)
    expect(isPlanId('p-000000000-000000')).toBe(true)
    for (const bad of ['../x', 'p-0abcdefgh-abc12', 'p-0abcdefgh-abc1234', 'P-0abcdefgh-abc123', `${PLAN_ID}\n`, `${PLAN_ID}/../x`, '']) {
      expect(isPlanId(bad)).toBe(false)
    }
  })

  test('newPlanId makes a valid id and rejects bad input', () => {
    const id = newPlanId(Date.UTC(2026, 10, 9), 'a1b2c3')
    expect(isPlanId(id)).toBe(true)
    expect(newPlanId(0, 'zzzzzz')).toBe('p-000000000-zzzzzz')
    expect(newPlanId(1, 'aaaaaa')).not.toBe(newPlanId(2, 'aaaaaa'))
    expect(() => newPlanId(1, 'A1b2c3')).toThrow()
    expect(() => newPlanId(1, 'abc')).toThrow()
    expect(() => newPlanId(-1, 'abcdef')).toThrow()
  })

  test('planPaths builds paths under the plans directory and refuses unsafe parts', () => {
    const p = planPaths('/home/u', 'app-ab12cd34ef56', PLAN_ID)
    expect(p).toEqual({
      dir: '/home/u/.claude/adminhead-plans/app-ab12cd34ef56',
      json: `/home/u/.claude/adminhead-plans/app-ab12cd34ef56/${PLAN_ID}.json`,
      ledger: `/home/u/.claude/adminhead-plans/app-ab12cd34ef56/${PLAN_ID}.jsonl`,
      lock: `/home/u/.claude/adminhead-plans/app-ab12cd34ef56/${PLAN_ID}.lock`,
    })
    expect(() => planPaths('/home/u', '../evil', PLAN_ID)).toThrow()
    expect(() => planPaths('/home/u', '..', PLAN_ID)).toThrow()
    expect(() => planPaths('/home/u', 'k', '../x')).toThrow()
  })

  test('tmpPath and lineFor', () => {
    expect(tmpPath('/d/p.json', 'tok')).toBe('/d/p.json.tmp.tok')
    const change: Change = {
      v: 1, rev: 1, ts: '2026-11-09T00:00:00.000Z', plan: PLAN_ID, item: null, actor: { kind: 'main' },
      action: 'create', from: null, to: 'draft', data: { note: 'multi\nline' }, denied: null, op: 'op1',
    }
    const line = lineFor(change)
    expect(line.endsWith('\n')).toBe(true)
    expect(line.slice(0, -1)).not.toContain('\n')
    expect(JSON.parse(line)).toEqual(change)
  })
})

describe('argv builders keep scripts constant', () => {
  test('values never appear inside the script string', () => {
    const hostile = `$(touch PWNED) "q" 'q' \`id\`\n;`
    for (const argv of [
      mkdirArgv(hostile),
      lockAcquireArgv(hostile, hostile, 1),
      lockReleaseArgv(hostile, hostile),
      appendArgv(hostile),
      tailArgv(hostile),
      publishArgv(hostile, hostile),
    ]) {
      expect(argv.slice(0, 2)).toEqual(['sh', '-c'])
      expect(argv[2]).not.toContain('PWNED')
      expect(argv.slice(4)).toContain(hostile)
    }
  })
})

describe('lock (real shell)', () => {
  const acquire = (lock: string, token: string, sec = 5) => run(lockAcquireArgv(lock, token, sec))
  const release = (lock: string, token: string) => run(lockReleaseArgv(lock, token))

  test('eight concurrent acquirers are mutually exclusive: no lost update on a shared counter', async () => {
    const lock = join(tmp, 'p.lock')
    const counter = join(tmp, 'counter')
    writeFileSync(counter, '0')
    let inside = 0
    let maxInside = 0
    await Promise.all(
      Array.from({ length: 8 }, async (_, i) => {
        const token = `tok-${i}`
        const got = await acquire(lock, token, 60)
        expect(got.code).toBe(0)
        inside++
        maxInside = Math.max(maxInside, inside)
        // Deliberately non-atomic read-modify-write with a yield in the middle.
        const n = Number(readFileSync(counter, 'utf8'))
        await Bun.sleep(5)
        writeFileSync(counter, String(n + 1))
        inside--
        const rel = await release(lock, token)
        expect(rel.code).toBe(0)
      }),
    )
    expect(maxInside).toBe(1)
    expect(readFileSync(counter, 'utf8')).toBe('8')
    expect(existsSync(lock)).toBe(false)
  }, 60_000)

  test('a held lock makes a second acquirer exit 75 after its timeout, without stealing', async () => {
    const lock = join(tmp, 'p.lock')
    expect((await acquire(lock, 'holder')).code).toBe(0)
    const t0 = Date.now()
    const second = await acquire(lock, 'other', 1)
    const dt = Date.now() - t0
    expect(second.code).toBe(75)
    expect(dt).toBeGreaterThanOrEqual(900)
    expect(dt).toBeLessThan(5000)
    expect(readFileSync(join(lock, 'owner'), 'utf8')).toMatch(/^holder \d+$/)
    expect(readdirSync(lock)).toEqual(['owner'])
  })

  test('a zero timeout tries once and exits 75 when busy', async () => {
    const lock = join(tmp, 'p.lock')
    expect((await acquire(lock, 'a', 0)).code).toBe(0)
    expect((await acquire(lock, 'b', 0)).code).toBe(75)
  })

  test('a stale lock is never taken automatically', async () => {
    const lock = join(tmp, 'p.lock')
    expect((await acquire(lock, 'crashed')).code).toBe(0)
    writeFileSync(join(lock, 'owner'), 'crashed 1')
    const old = new Date(1_000_000)
    utimesSync(join(lock, 'owner'), old, old)
    utimesSync(lock, old, old)
    expect((await acquire(lock, 'newcomer', 1)).code).toBe(75)
    expect(readFileSync(join(lock, 'owner'), 'utf8')).toBe('crashed 1')
    // Only the explicit release by the owner clears it.
    expect((await release(lock, 'newcomer')).code).toBe(1)
    expect((await release(lock, 'crashed')).code).toBe(0)
    expect((await acquire(lock, 'newcomer', 1)).code).toBe(0)
  })

  test('release with a wrong token leaves the lock; the right token removes it', async () => {
    const lock = join(tmp, 'p.lock')
    expect((await acquire(lock, 'right')).code).toBe(0)
    expect((await release(lock, 'wrong')).code).toBe(1)
    expect((await release(lock, 'righ')).code).toBe(1)
    expect((await release(lock, 'right 1')).code).toBe(1)
    expect(existsSync(lock)).toBe(true)
    expect(readFileSync(join(lock, 'owner'), 'utf8')).toMatch(/^right \d+$/)
    expect((await release(lock, 'right')).code).toBe(0)
    expect(existsSync(lock)).toBe(false)
    // Releasing a lock that is not there is a clean no-op failure.
    expect((await release(lock, 'right')).code).toBe(1)
  })

  test('a missing parent directory fails fast instead of waiting out the timeout', async () => {
    const t0 = Date.now()
    const r = await acquire(join(tmp, 'no', 'such', 'p.lock'), 't', 5)
    expect(r.code).toBe(1)
    expect(Date.now() - t0).toBeLessThan(2000)
  })

  test('mkdirArgv creates a nested directory private to the user, idempotently', async () => {
    const dir = join(tmp, 'a', 'b')
    expect((await run(mkdirArgv(dir))).code).toBe(0)
    expect((await run(mkdirArgv(dir))).code).toBe(0)
    expect(statSync(dir).mode & 0o777).toBe(0o700)
  })
})

describe('hostile values reach the shell as plain data', () => {
  test('paths and tokens with spaces, quotes, command substitution and newlines', async () => {
    const sentinel = join(tmp, 'PWNED')
    const touch = 'touch PWNED'
    const hostile = (s: string) => `${s} a'b"c $(${touch}) \`${touch}\` ;${touch}; \n x\n`
    const dir = join(tmp, hostile('dir'))
    const lock = join(dir, hostile('lock'))
    const token = hostile('token')
    const file = join(dir, hostile('ledger'))
    const json = join(dir, hostile('json'))
    const tmpFile = tmpPath(json, token)

    expect((await run(mkdirArgv(dir))).code).toBe(0)
    expect(statSync(dir).isDirectory()).toBe(true)

    expect((await run(lockAcquireArgv(lock, token, 1))).code).toBe(0)
    expect(readFileSync(join(lock, 'owner'), 'utf8').startsWith(token + ' ')).toBe(true)
    expect((await run(lockAcquireArgv(lock, token, 0))).code).toBe(75)
    expect((await run(lockReleaseArgv(lock, token + 'x'))).code).toBe(1)
    expect(existsSync(lock)).toBe(true)

    expect((await run(appendArgv(file), 'one\ntwo\n')).code).toBe(0)
    expect((await run(appendArgv(file), 'three\n')).code).toBe(0)
    expect((await run(tailArgv(file))).out).toBe('three\n')

    writeFileSync(json, 'old')
    writeFileSync(tmpFile, 'new')
    expect((await run(publishArgv(tmpFile, json))).code).toBe(0)
    expect(readFileSync(json, 'utf8')).toBe('new')
    expect(existsSync(tmpFile)).toBe(false)

    expect((await run(lockReleaseArgv(lock, token))).code).toBe(0)
    expect(existsSync(lock)).toBe(false)
    expect(existsSync(sentinel)).toBe(false)
    expect(readdirSync(tmp)).toEqual([hostile('dir')])
  })

  test('a path starting with a dash is a path, not an option', async () => {
    expect((await run(mkdirArgv('-p'))).code).toBe(0)
    expect(statSync(join(tmp, '-p')).isDirectory()).toBe(true)
    expect((await run(lockAcquireArgv('-lock', 't', 0))).code).toBe(0)
    expect(existsSync(join(tmp, '-lock', 'owner'))).toBe(true)
    expect((await run(lockReleaseArgv('-lock', 't'))).code).toBe(0)
  })
})

describe('publish and append (real shell)', () => {
  test('publish replaces atomically: a looping reader never sees a partial or missing JSON', async () => {
    const json = join(tmp, `${PLAN_ID}.json`)
    const doc = (n: number) => JSON.stringify({ n, pad: 'x'.repeat(300_000) })
    writeFileSync(json, doc(0))
    let stop = false
    let reads = 0
    let bad: string | null = null
    let lastN = 0
    const reader = (async () => {
      while (!stop) {
        try {
          const o = JSON.parse(readFileSync(json, 'utf8'))
          if (typeof o.n !== 'number' || o.pad.length !== 300_000) bad = 'wrong shape'
          lastN = o.n
        } catch (e) {
          bad = String(e)
        }
        reads++
        await Bun.sleep(0)
      }
    })()
    for (let i = 1; i <= 200; i++) {
      const t = tmpPath(json, 'tok')
      writeFileSync(t, doc(i))
      const r = await run(publishArgv(t, json))
      expect(r.code).toBe(0)
    }
    stop = true
    await reader
    expect(bad).toBeNull()
    expect(reads).toBeGreaterThan(20)
    expect(lastN).toBeGreaterThan(0)
    expect(JSON.parse(readFileSync(json, 'utf8')).n).toBe(200)
    expect(readdirSync(tmp)).toEqual([`${PLAN_ID}.json`])
  }, 60_000)

  test('a writer that dies mid-write leaves the old JSON, and a later publish still works', async () => {
    const json = join(tmp, `${PLAN_ID}.json`)
    const old = JSON.stringify({ rev: 1 })
    writeFileSync(json, old)
    const t = tmpPath(json, 'dead')
    // The failing step: the writer writes half a document into the tmp file and exits before publishing.
    const dying = await run(['sh', '-c', 'printf "%s" "{\\"rev\\":2,\\"par" > "$1"; exit 9', 'sh', t])
    expect(dying.code).toBe(9)
    expect(readFileSync(json, 'utf8')).toBe(old)
    expect(JSON.parse(readFileSync(json, 'utf8'))).toEqual({ rev: 1 })
    expect(existsSync(t)).toBe(true)
    // Recovery removes the leftover tmp (slice 6); the next publish replaces the JSON whole.
    rmSync(t)
    const t2 = tmpPath(json, 'live')
    writeFileSync(t2, JSON.stringify({ rev: 2 }))
    expect((await run(publishArgv(t2, json))).code).toBe(0)
    expect(JSON.parse(readFileSync(json, 'utf8'))).toEqual({ rev: 2 })
  })

  test('a publish whose tmp file is missing fails and leaves the JSON untouched', async () => {
    const json = join(tmp, `${PLAN_ID}.json`)
    writeFileSync(json, '{"rev":1}')
    const r = await run(publishArgv(tmpPath(json, 'gone'), json))
    expect(r.code).not.toBe(0)
    expect(readFileSync(json, 'utf8')).toBe('{"rev":1}')
  })

  test('eight concurrent appends of 3000-byte lines under the lock leave every line parseable', async () => {
    const lock = join(tmp, 'p.lock')
    const ledger = join(tmp, 'p.jsonl')
    const line = (i: number) => `${JSON.stringify({ i, pad: String.fromCharCode(97 + i).repeat(3000) })}\n`
    await Promise.all(
      Array.from({ length: 8 }, async (_, i) => {
        const token = `t${i}`
        expect((await run(lockAcquireArgv(lock, token, 60))).code).toBe(0)
        try {
          expect((await run(appendArgv(ledger), line(i))).code).toBe(0)
        } finally {
          expect((await run(lockReleaseArgv(lock, token))).code).toBe(0)
        }
      }),
    )
    const lines = readFileSync(ledger, 'utf8').split('\n')
    expect(lines.pop()).toBe('')
    expect(lines).toHaveLength(8)
    const seen = lines.map((l) => JSON.parse(l) as { i: number; pad: string })
    expect(seen.map((s) => s.i).sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    for (const s of seen) expect(s.pad).toBe(String.fromCharCode(97 + s.i).repeat(3000))
    expect(statSync(ledger).mode & 0o777).toBe(0o600)
  }, 60_000)

  test('tailArgv prints the newest line, including an unterminated torn one', async () => {
    const f = join(tmp, 'p.jsonl')
    writeFileSync(f, '{"rev":1}\n{"rev":2}\n')
    expect((await run(tailArgv(f))).out).toBe('{"rev":2}\n')
    writeFileSync(f, '{"rev":1}\n{"rev":')
    expect((await run(tailArgv(f))).out).toBe('{"rev":')
  })
})
