// Run with: bun test plugins/coremods/scripts/tests   (from the repo root; needs `npm ci` in plugins/coremods first)
import { afterAll, describe, expect, test } from 'bun:test'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = join(import.meta.dir, '..', 'metrics.mjs')
const MODULES = join(import.meta.dir, '..', '..', 'node_modules')
const dirs: string[] = []
afterAll(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })))

const haveLib = existsSync(join(MODULES, '@duckdb', 'node-api'))
const t = haveLib ? test : test.skip

function dataDir() {
  const d = mkdtempSync(join(tmpdir(), 'metrics-'))
  dirs.push(d)
  symlinkSync(MODULES, join(d, 'node_modules'))
  return d
}

const rec = (o: Record<string, unknown>) => JSON.stringify({ ts: '2026-10-11T00:00:00.000Z', session: 's1', tool: 'Bash', blocked: null, isError: false, ...o })
function log(d: string, file: string, ...lines: string[]) {
  mkdirSync(join(d, 'logs', file.split('/')[0]), { recursive: true })
  appendFileSync(join(d, 'logs', file), lines.join('\n') + '\n')
}

async function run(d: string, stdin: unknown) {
  const p = Bun.spawn(['node', SCRIPT], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe', env: { PATH: process.env.PATH!, CLAUDE_PLUGIN_DATA: d } })
  p.stdin.write(typeof stdin === 'string' ? stdin : JSON.stringify(stdin))
  p.stdin.end()
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited])
  return { out, err, code }
}

describe('metrics.mjs against a real DuckDB file', () => {
  t('a fresh machine with no logs answers with empty tables, not an error', async () => {
    const d = dataDir()
    const r = await run(d, { kind: 'summary' })
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/Calls per tool/)
    expect(existsSync(join(d, 'metrics.duckdb'))).toBe(true)
  })

  t('ingest dedupes by id across runs and across files', async () => {
    const d = dataDir()
    log(d, 's1/main.jsonl', rec({ id: 'a', command: 'ls' }), rec({ id: 'b', tool: 'Read', summary: 'file_path=/x' }), 'not json at all')
    log(d, 's1/scout.jsonl', rec({ id: 'b', tool: 'Read' }), rec({ id: 'c', agent: 'scout', blocked: 'sed-read', command: "sed -n 1p f\nnext" }))
    const q = { kind: 'query', sql: 'select count(*) as n, count(distinct id) as d from calls' }
    expect((await run(d, q)).out).toMatch(/3\s+3/)
    log(d, 's1/main.jsonl', rec({ id: 'd' }))
    expect((await run(d, q)).out).toMatch(/4\s+4/)
    expect((await run(d, q)).out).toMatch(/4\s+4/)
  })

  t('summary, blocked and query print plain tables', async () => {
    const d = dataDir()
    log(d, 's1/main.jsonl', rec({ id: 'a' }), rec({ id: 'c', blocked: 'sed-read', command: "sed -n 1p f\nnext" }))
    const s = await run(d, { kind: 'summary' })
    expect(s.out).toMatch(/Calls per tool[\s\S]*Bash\s+2/)
    expect(s.out).toMatch(/Blocked calls per rule[\s\S]*sed-read\s+1/)
    expect(s.out).toMatch(/Calls per session and agent[\s\S]*s1\s+main\s+2/)
    const b = await run(d, { kind: 'blocked', n: 5 })
    expect(b.out).toMatch(/sed-read\s+sed -n 1p f next/)
    const q = await run(d, { kind: 'query', sql: "select 1 + 1 as two" })
    expect(q.out).toMatch(/two\n-+\n2/)
  })

  t('query is read-only and cannot reach files or change settings', async () => {
    const d = dataDir()
    log(d, 's1/main.jsonl', rec({ id: 'a' }))
    const target = join(d, 'out.csv')
    for (const sql of [
      `copy calls to '${target}'`,
      "select * from read_csv('/etc/hostname')",
      'drop table calls',
      "attach '/tmp/x.duckdb' as x",
      'set enable_external_access=true',
      'install httpfs',
    ]) {
      const r = await run(d, { kind: 'query', sql })
      expect(r.code).toBe(1)
      expect(r.err.length).toBeGreaterThan(0)
    }
    expect(existsSync(target)).toBe(false)
    expect((await run(d, { kind: 'query', sql: 'select count(*) as n from calls' })).out).toMatch(/1/)
  })

  t('as a hook (hook JSON on stdin) it ingests quietly and exits 0, even on bad input', async () => {
    const d = dataDir()
    log(d, 's1/main.jsonl', rec({ id: 'a' }))
    for (const input of [{ hook_event_name: 'Stop', session_id: 's1' }, 'garbage', '']) {
      const r = await run(d, input)
      expect(r.code).toBe(0)
      expect(r.out + r.err).toBe('')
    }
    expect((await run(d, { kind: 'query', sql: 'select count(*) as n from calls' })).out).toMatch(/1/)
  })

  t('a database locked by another process is skipped quietly in hook mode and reported in command mode', async () => {
    const d = dataDir()
    log(d, 's1/main.jsonl', rec({ id: 'a' }))
    expect((await run(d, { hook_event_name: 'Stop' })).code).toBe(0)
    // Hold the write lock from a second process.
    const holder = Bun.spawn(['node', '-e', `const {DuckDBInstance}=require('@duckdb/node-api');DuckDBInstance.create(process.argv[1]).then(()=>{console.log('held');setTimeout(()=>{},20000)})`, join(d, 'metrics.duckdb')], {
      cwd: join(import.meta.dir, '..', '..'),
      stdout: 'pipe',
    })
    await holder.stdout.getReader().read()
    try {
      const hook = await run(d, { hook_event_name: 'Stop' })
      expect(hook.code).toBe(0)
      expect(hook.out + hook.err).toBe('')
      const cmd = await run(d, { kind: 'summary' })
      expect(cmd.code).toBe(1)
      expect(cmd.err).toMatch(/locked by another session/)
    } finally {
      holder.kill()
    }
  })

  t('query takes one statement and caps very large results', async () => {
    const d = dataDir()
    log(d, 's1/main.jsonl', rec({ id: 'a' }))
    const two = await run(d, { kind: 'query', sql: 'select 1; select 2' })
    expect(two.code).toBe(1)
    expect(two.err).toMatch(/one statement/)
    const big = await run(d, { kind: 'query', sql: 'select * from range(300000)' })
    expect(big.code).toBe(0)
    expect(big.out.trim().split('\n').length).toBeLessThan(510)
    expect(big.out).toMatch(/showing the first 500 rows/)
  })

  t('lines with a bad timestamp are skipped, and a deny record beats a hook record with the same id', async () => {
    const d = dataDir()
    log(d, 's1/main.jsonl', rec({ id: 'bad', ts: 'yesterday' }), rec({ id: 'x', ts: '2026-10-11T00:00:01.000Z', blocked: null }))
    log(d, 's1/deny.jsonl', rec({ id: 'x', ts: '2026-10-11T00:00:02.000Z', blocked: 'sed-read' }))
    const r = await run(d, { kind: 'query', sql: 'select id, blocked from calls order by id' })
    expect(r.out).toMatch(/x\s+sed-read/)
    expect(r.out).not.toMatch(/bad/)
  })

  t('the database is owner-only', async () => {
    const d = dataDir()
    log(d, 's1/main.jsonl', rec({ id: 'a' }))
    await run(d, { kind: 'summary' })
    expect(statSync(join(d, 'metrics.duckdb')).mode & 0o777).toBe(0o600)
  })

  t('a missing library is an error for a command and still exit 0 for a hook', async () => {
    const d = mkdtempSync(join(tmpdir(), 'metrics-nolib-'))
    dirs.push(d)
    // No node_modules here, and the script's own tree is not searched when it is copied away.
    const copy = join(d, 'metrics.mjs')
    writeFileSync(copy, await Bun.file(SCRIPT).text())
    const go = async (stdin: unknown) => {
      const p = Bun.spawn(['node', copy], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe', env: { PATH: process.env.PATH!, CLAUDE_PLUGIN_DATA: d } })
      p.stdin.write(JSON.stringify(stdin))
      p.stdin.end()
      return { err: await new Response(p.stderr).text(), code: await p.exited }
    }
    const cmd = await go({ kind: 'summary' })
    expect(cmd.code).toBe(1)
    expect(cmd.err).toMatch(/not installed/)
    expect((await go({ hook_event_name: 'Stop' })).code).toBe(0)
  })
})
