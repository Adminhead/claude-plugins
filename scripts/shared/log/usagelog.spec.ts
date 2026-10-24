import { afterEach, describe, expect, test } from 'bun:test'
import { lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { STREAMS, logFile, pruneArgv, redact } from './usagelog.ts'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

// The `-name` patterns of the prune's find, as regexes. They hold only literals, `.` and `[0-9]`.
const patterns = (): RegExp[] =>
  [...pruneArgv(30)[2].matchAll(/-name '([^']*)'/g)].map(m => new RegExp(`^${m[1].replace(/\./g, '\\.')}$`))

// Whether the path itself exists, a link counted as the link.
const there = (p: string): boolean => {
  try {
    lstatSync(p)
    return true
  } catch {
    return false
  }
}

describe('redaction', () => {
  test('password options, curl users, Stripe and npm tokens and credential headers are masked', () => {
    const cases: [string, string][] = [
      ['mysql -u root -pS3cretPw app', 'mysql -u root -p<redacted> app'],
      ["mysqldump --single-transaction -p'pa ss' app > d.sql", 'mysqldump --single-transaction -p<redacted> app > d.sql'],
      ['ssh db "mariadb -uapp -phunter2 -e \'select 1\'"', 'ssh db "mariadb -uapp -p<redacted> -e \'select 1\'"'],
      ['mysql --password hunter2 app', 'mysql --password <redacted> app'],
      ['docker login -u bob --password hunter2 ghcr.io', 'docker login -u bob --password <redacted> ghcr.io'],
      ['mysql --password=hunter2 app', 'mysql --password=<redacted> app'],
      ['curl -u bob:hunter2 https://x/api', 'curl -u bob:<redacted> https://x/api'],
      ['curl -ubob:hunter2 https://x', 'curl -ubob:<redacted> https://x'],
      ['curl -fsS --user "bob:hunter2" https://x', 'curl -fsS --user "bob:<redacted>" https://x'],
      ['curl --user=bob:hunter2 https://x', 'curl --user=bob:<redacted> https://x'],
      ['stripe charges list --api-key sk_live_51Habcdefghijklmnop', 'stripe charges list --api-key <stripe-key>'],
      ['export K=sk_test_4eC39HqLyjWDarjtT1zdp7dc', 'export K=<stripe-key>'],
      ['echo rk_live_abcdefghij0123456789', 'echo <stripe-key>'],
      ['npm config set //registry.npmjs.org/:_authToken npm_abcdefghijklmnopqrstuvwxyz0123456789', 'npm config set //registry.npmjs.org/:_authToken <npm-token>'],
      ['curl -H "X-Api-Key: abc123def" https://x', 'curl -H "X-Api-Key: <redacted>" https://x'],
      ["curl -H 'x-api-key:abc123' https://x", "curl -H 'x-api-key:<redacted>' https://x"],
      ['curl -H "Authorization: raw-token-value" https://x', 'curl -H "Authorization: <redacted>" https://x'],
      ['curl -H "Authorization: Bearer abcdefghijklmnop123"', 'curl -H "Authorization: Bearer <token>"'],
      ['curl -H "Authorization: Digest abc"', 'curl -H "Authorization: Digest abc"'],
      ['curl -H "X-Auth-Token: t0k3n" https://x', 'curl -H "X-Auth-Token: <redacted>" https://x'],
    ]
    for (const [input, want] of cases) expect([input, redact(input)]).toEqual([input, want])
  })

  test('look-alikes stay as written', () => {
    for (const s of [
      'psql -p5432 -h db app',
      'ssh -p22 host',
      'mkdir -p build/out',
      'git log -p -- src',
      'mysql -p app',
      'mysql -h db -P3306 -p app',
      'sudo -u root ls',
      'git push -u origin main',
      'docker run -u 1000:1000 img',
      'curl -u bob https://x:8443/',
      'npm_config_registry=https://r npm i',
      'echo npm_test',
      'docker login --password-stdin',
      'mysql --password --host db',
      'grep -rn Authorization src',
      'curl -H "Content-Type: application/json" https://x',
      'tar -pxf a.tar',
      'sk_live_short',
    ]) {
      expect([s, redact(s)]).toEqual([s, s])
    }
  })

  test('long inputs are masked in linear time', () => {
    const t0 = performance.now()
    redact('mysql '.repeat(20000))
    redact('curl -u '.repeat(10000))
    redact('Authorization: '.repeat(10000))
    redact('--password '.repeat(10000))
    expect(performance.now() - t0).toBeLessThan(1000)
  })
})

describe('usage log prune', () => {
  test('logFile takes only the known streams', () => {
    expect(logFile('usage-log', Date.UTC(2026, 0, 2))).toBe('usage-log-2026-01-02.jsonl')
    for (const s of ['../x', 'other', 'usage-log/..', '']) expect(() => logFile(s, 0)).toThrow()
  })

  test('the prune matches only dated stream files', () => {
    const argv = pruneArgv(30)
    expect(argv[2]).not.toContain("'*.jsonl'")
    expect(argv[2]).toContain('-maxdepth 1 -type f')
    const res = patterns()
    expect(res).toHaveLength(STREAMS.length)
    const hit = (f: string) => res.some(r => r.test(f))
    for (const s of STREAMS) expect(hit(logFile(s, Date.UTC(2020, 0, 1)))).toBe(true)
    for (const f of ['abc.jsonl', 'x.jsonl', '0b6f3c1e-5d2a-4f8e-9c7b-1a2b3c4d5e6f.jsonl', 'usage-log-2020-01-01.jsonl.bak',
      'other-2020-01-01.jsonl', 'usage-log-2020-1-1.jsonl', 'usage-log-x020-01-01.jsonl']) {
      expect(hit(f)).toBe(false)
    }
  })

  test('a run deletes only old stream files at the top of the directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'usagelog-spec-'))
    dirs.push(dir)
    const old = (Date.now() - 400 * 86_400_000) / 1000
    const uuid = '0b6f3c1e-5d2a-4f8e-9c7b-1a2b3c4d5e6f.jsonl'
    mkdirSync(join(dir, 'sub'))
    const kept = ['x.jsonl', 'abc.jsonl', uuid, 'sub/usage-log-2020-01-01.jsonl', 'usage-log-2020-01-01.jsonl.bak']
    const gone = ['usage-log-2020-01-01.jsonl', 'bash-rules-2020-01-01.jsonl']
    for (const f of [...kept, ...gone]) {
      writeFileSync(join(dir, f), '{}\n')
      utimesSync(join(dir, f), old, old)
    }
    // A fresh stream file, and a link named like an old one: neither is deleted.
    const fresh = logFile('usage-log', Date.now())
    writeFileSync(join(dir, fresh), '{}\n')
    symlinkSync(join(dir, 'x.jsonl'), join(dir, 'bash-rules-2019-01-01.jsonl'))
    const r = Bun.spawnSync(pruneArgv(30), { env: { ...process.env, CLAUDE_USAGE_LOG_DIR: dir } })
    expect(r.exitCode).toBe(0)
    for (const f of [...kept, fresh, 'bash-rules-2019-01-01.jsonl']) expect(there(join(dir, f))).toBe(true)
    for (const f of gone) expect(there(join(dir, f))).toBe(false)
  })
})
