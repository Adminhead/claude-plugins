import { afterEach, describe, expect, test } from 'bun:test'
import { lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { STREAMS, logFile, pruneArgv } from './usagelog.ts'

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
