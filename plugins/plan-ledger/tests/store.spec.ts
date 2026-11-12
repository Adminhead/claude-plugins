import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  appendArgv,
  isLockLeftover,
  isPlanId,
  lineFor,
  lockAcquireArgv,
  lockReleaseArgv,
  mkdirArgv,
  newPlanId,
  OWNERLESS_LOCK_SEC,
  planPaths,
  projectDir,
  projectKey,
  publishArgv,
  REAP_SUFFIX,
  STALE_LOCK_SEC,
  STALE_SUFFIX,
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

  test('projectDir is the directory planPaths builds into and refuses an unsafe key', () => {
    expect(projectDir('/home/u/', 'app-ab12cd34ef56')).toBe('/home/u/.claude/adminhead-plans/app-ab12cd34ef56')
    expect(projectDir('/home/u', 'k')).toBe(planPaths('/home/u', 'k', PLAN_ID).dir)
    expect(() => projectDir('/home/u', '../evil')).toThrow()
    expect(() => projectDir('/home/u', '.')).toThrow()
  })

  test('isLockLeftover names only a recovery leftover of this plan', () => {
    expect(isLockLeftover(PLAN_ID, `${PLAN_ID}.lock${REAP_SUFFIX}`)).toBe(true)
    expect(isLockLeftover(PLAN_ID, `${PLAN_ID}.lock${STALE_SUFFIX}12345`)).toBe(true)
    for (const name of [
      `${PLAN_ID}.lock`,
      `${PLAN_ID}.lock${STALE_SUFFIX}`,
      `${PLAN_ID}.lock${STALE_SUFFIX}12x`,
      `${PLAN_ID}.lock${STALE_SUFFIX}1/..`,
      `${PLAN_ID}.lock${REAP_SUFFIX}x`,
      `${PLAN_ID}.json`,
      `p-000000000-000000.lock${REAP_SUFFIX}`,
    ]) {
      expect(isLockLeftover(PLAN_ID, name)).toBe(false)
    }
    expect(isLockLeftover('../x', `../x.lock${REAP_SUFFIX}`)).toBe(false)
  })

  test('tmpPath and lineFor', () => {
    expect(tmpPath('/d/p.json', 'tok')).toBe('/d/p.json.tmp.tok')
    expect(tmpPath('/d/p.json', 'A-b_c.9')).toBe('/d/p.json.tmp.A-b_c.9')
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

describe('the tmp token is a plain name', () => {
  test('tmpPath refuses a token outside [A-Za-z0-9._-]', () => {
    for (const bad of ['', 'a b', 'a/b', '../x', 'a\nb', "a'b", '$(x)', 'a;b', 'é']) {
      expect(() => tmpPath('/d/p.json', bad)).toThrow()
    }
  })

  test('publishArgv takes only tmpPath(json, token) of a valid token', () => {
    const json = '/d/p.json'
    expect(publishArgv(tmpPath(json, 'tok-1'), json).slice(4)).toEqual([`${json}.tmp.tok-1`, json])
    for (const bad of [`${json}.tmp.a b`, `${json}.tmp.a/b`, `${json}.tmp.`, `${json}.tmp.$(x)`, `${json}.tmp.a\nb`, '/elsewhere/x', json]) {
      expect(() => publishArgv(bad, json)).toThrow()
    }
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
      publishArgv(tmpPath(hostile, 'tok'), hostile),
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

  const nowSec = () => Math.floor(Date.now() / 1000)
  /** A lock directory as a holder left it: owner `<token> <epoch>`, mtimes `ageSec` in the past. */
  const plant = (lock: string, token: string, ageSec: number) => {
    mkdirSync(lock)
    writeFileSync(join(lock, 'owner'), `${token} ${nowSec() - ageSec}`)
    const when = new Date((nowSec() - ageSec) * 1000)
    utimesSync(join(lock, 'owner'), when, when)
    utimesSync(lock, when, when)
  }
  /** A lock directory whose holder died before writing the owner. */
  const plantOwnerless = (lock: string, ageSec: number) => {
    mkdirSync(lock)
    const when = new Date((nowSec() - ageSec) * 1000)
    utimesSync(lock, when, when)
  }
  const leftovers = () => readdirSync(tmp).filter((n) => n.includes(STALE_SUFFIX) || n.endsWith(REAP_SUFFIX))
  /** A recovery mutex beside `lock`, as a reaper left it `ageSec` ago: empty, or holding its pid entry. */
  const plantReap = (lock: string, ageSec: number, holderPid?: number) => {
    mkdirSync(`${lock}${REAP_SUFFIX}`)
    if (holderPid !== undefined) writeFileSync(join(`${lock}${REAP_SUFFIX}`, String(holderPid)), '')
    const when = new Date((nowSec() - ageSec) * 1000)
    utimesSync(`${lock}${REAP_SUFFIX}`, when, when)
  }

  test('a lock whose owner is older than the stale threshold is taken over, and the aside directory is removed', async () => {
    const lock = join(tmp, 'p.lock')
    plant(lock, 'crashed', STALE_LOCK_SEC + 5)
    expect((await acquire(lock, 'newcomer', 1)).code).toBe(0)
    expect(readFileSync(join(lock, 'owner'), 'utf8')).toMatch(/^newcomer \d+$/)
    expect(leftovers()).toEqual([])
    // The crashed holder's late release no longer matches; the newcomer's does.
    expect((await release(lock, 'crashed')).code).toBe(1)
    expect((await release(lock, 'newcomer')).code).toBe(0)
  })

  test('a fresh lock is not stolen, and neither is one just under the threshold', async () => {
    const lock = join(tmp, 'p.lock')
    plant(lock, 'holder', STALE_LOCK_SEC - 30)
    expect((await acquire(lock, 'other', 1)).code).toBe(75)
    expect(readFileSync(join(lock, 'owner'), 'utf8')).toMatch(/^holder \d+$/)
    expect(leftovers()).toEqual([])
  })

  test('an ownerless lock directory is recovered once old enough, and left alone while fresh', async () => {
    const fresh = join(tmp, 'fresh.lock')
    plantOwnerless(fresh, 2)
    expect((await acquire(fresh, 'a', 0)).code).toBe(75)
    expect(readdirSync(fresh)).toEqual([])
    const old = join(tmp, 'old.lock')
    plantOwnerless(old, OWNERLESS_LOCK_SEC + 5)
    expect((await acquire(old, 'b', 1)).code).toBe(0)
    expect(readFileSync(join(old, 'owner'), 'utf8')).toMatch(/^b \d+$/)
    expect(leftovers()).toEqual([])
  })

  test('an empty owner file counts as ownerless', async () => {
    const lock = join(tmp, 'p.lock')
    plantOwnerless(lock, OWNERLESS_LOCK_SEC + 5)
    writeFileSync(join(lock, 'owner'), '')
    const when = new Date((nowSec() - OWNERLESS_LOCK_SEC - 5) * 1000)
    utimesSync(lock, when, when)
    expect((await acquire(lock, 'b', 1)).code).toBe(0)
  })

  test('simultaneous takeovers of one dead lock yield exactly one winner and leave nothing behind', async () => {
    // Without the recovery mutex this load produced rounds with two winners and leaked aside directories.
    const contenders = 16
    for (let round = 0; round < 300; round++) {
      const lock = join(tmp, `p${round}.lock`)
      if (round % 2 === 0) plant(lock, 'crashed', STALE_LOCK_SEC + 5)
      else plantOwnerless(lock, OWNERLESS_LOCK_SEC + 5)
      const codes = await Promise.all(Array.from({ length: contenders }, (_, i) => acquire(lock, `c${i}`, 0).then((r) => r.code)))
      expect({ round, winners: codes.filter((c) => c === 0).length, busy: codes.filter((c) => c === 75).length }).toEqual({
        round,
        winners: 1,
        busy: contenders - 1,
      })
      expect(readFileSync(join(lock, 'owner'), 'utf8')).toMatch(/^c\d+ \d+$/)
    }
    expect(leftovers()).toEqual([])
  }, 60_000)

  test('a fresh recovery mutex holds off a takeover; an old one is broken and the dead lock recovered', async () => {
    const lock = join(tmp, 'p.lock')
    plant(lock, 'crashed', STALE_LOCK_SEC + 5)
    plantReap(lock, 1)
    expect((await acquire(lock, 'a', 0)).code).toBe(75)
    expect(readFileSync(join(lock, 'owner'), 'utf8')).toMatch(/^crashed \d+$/)
    expect(existsSync(`${lock}${REAP_SUFFIX}`)).toBe(true)
    rmSync(`${lock}${REAP_SUFFIX}`, { recursive: true })
    plantReap(lock, OWNERLESS_LOCK_SEC + 5)
    expect((await acquire(lock, 'b', 1)).code).toBe(0)
    expect(readFileSync(join(lock, 'owner'), 'utf8')).toMatch(/^b \d+$/)
    expect(leftovers()).toEqual([])
    // A holder that died after recording its entry: the entry goes with the mutex.
    const other = join(tmp, 'q.lock')
    plant(other, 'crashed', STALE_LOCK_SEC + 5)
    plantReap(other, OWNERLESS_LOCK_SEC + 5, 4242)
    expect((await acquire(other, 'c', 1)).code).toBe(0)
    expect(readFileSync(join(other, 'owner'), 'utf8')).toMatch(/^c \d+$/)
    expect(leftovers()).toEqual([])
  })

  test('release removes an ownerless lock only when it is old; with an owner the token must still match', async () => {
    const fresh = join(tmp, 'fresh.lock')
    plantOwnerless(fresh, 1)
    expect((await release(fresh, 'anyone')).code).toBe(1)
    expect(existsSync(fresh)).toBe(true)
    const old = join(tmp, 'old.lock')
    plantOwnerless(old, OWNERLESS_LOCK_SEC + 5)
    // The removal goes through the recovery mutex: while another recovery holds it, the lock is left.
    plantReap(old, 1)
    expect((await release(old, 'anyone')).code).toBe(1)
    expect(existsSync(old)).toBe(true)
    rmSync(`${old}${REAP_SUFFIX}`, { recursive: true })
    expect((await release(old, 'anyone')).code).toBe(0)
    expect(existsSync(old)).toBe(false)
    expect(leftovers()).toEqual([])
    // An owner exists: age is irrelevant to release, only the token.
    const held = join(tmp, 'held.lock')
    plant(held, 'holder', STALE_LOCK_SEC + 50)
    expect((await release(held, 'other')).code).toBe(1)
    expect(existsSync(held)).toBe(true)
    expect((await release(held, 'holder')).code).toBe(0)
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

  test('a holder that releases between our mkdir and our test is a retry, not an error', async () => {
    // Deterministic form of the race: the first `mkdir` reports "exists" while leaving no directory behind, which
    // is what a holder releasing in the gap looks like. The old script tested the lock directory and exited 1.
    const shim = join(tmp, 'shim')
    mkdirSync(shim)
    const marker = join(tmp, 'seen')
    writeFileSync(
      join(shim, 'mkdir'),
      `#!/bin/sh\nif [ ! -e '${marker}' ]; then : > '${marker}'; exit 1; fi\nexec /bin/mkdir "$@"\n`,
      { mode: 0o755 },
    )
    const lock = join(tmp, 'p.lock')
    const p = Bun.spawn(lockAcquireArgv(lock, 'tok', 5), {
      cwd: tmp,
      env: { ...process.env, PATH: `${shim}:${process.env.PATH}` },
      stdout: 'ignore',
      stderr: 'ignore',
    })
    expect(await p.exited).toBe(0)
    expect(existsSync(marker)).toBe(true)
    expect(readFileSync(join(lock, 'owner'), 'utf8').startsWith('tok ')).toBe(true)
  })

  test('contended acquire and release cycles never exit with an error: only 0 (held) or 75 (busy)', async () => {
    const lock = join(tmp, 'p.lock')
    const codes: Record<number, number> = {}
    let inside = 0
    let maxInside = 0
    await Promise.all(
      Array.from({ length: 8 }, async (_, w) => {
        for (let k = 0; k < 15; k++) {
          const token = `w${w}-${k}`
          const got = await acquire(lock, token, 1)
          codes[got.code] = (codes[got.code] ?? 0) + 1
          if (got.code !== 0) continue
          inside++
          maxInside = Math.max(maxInside, inside)
          await Bun.sleep(1)
          inside--
          expect((await release(lock, token)).code).toBe(0)
        }
      }),
    )
    expect(Object.keys(codes).every((c) => c === '0' || c === '75')).toBe(true)
    expect(maxInside).toBe(1)
    expect(existsSync(lock)).toBe(false)
  }, 120_000)

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
    const tmpFile = tmpPath(json, 'tok.1') // a tmp token is restricted to [A-Za-z0-9._-]; paths and lock tokens are not

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
