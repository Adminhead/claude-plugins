// Run with: bun test plugins/coremods/scripts/tests   (from the repo root)
// scripts/session-start.sh with a stub `npm` on PATH.
import { afterAll, describe, expect, test } from 'bun:test'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = join(import.meta.dir, '..', 'session-start.sh')
const dirs: string[] = []
afterAll(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })))

// The stub records its argv; STUB_MODE picks ok | fail | hang (records its pid, then sleeps).
function setup() {
  const base = mkdtempSync(join(tmpdir(), 'sstart-'))
  dirs.push(base)
  const bin = join(base, 'bin')
  const root = join(base, 'root')
  const data = join(base, 'data', 'coremods-x')
  mkdirSync(bin)
  mkdirSync(root)
  writeFileSync(join(root, 'package.json'), '{"name":"x","version":"1.0.0"}')
  writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3}')
  writeFileSync(
    join(bin, 'npm'),
    `#!/bin/sh
echo "$*" >> "${base}/npm.calls"
case "$STUB_MODE" in
  fail) echo "boom" >&2; exit 1 ;;
  hang) echo $$ > "${base}/npm.pid"; exec sleep 30 ;;
  *) mkdir -p node_modules/@duckdb/node-api ;;
esac
`,
  )
  chmodSync(join(bin, 'npm'), 0o755)
  const run = (mode: string, extra: Record<string, string> = {}) =>
    Bun.spawn(['sh', SCRIPT], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { PATH: `${bin}:${process.env.PATH}`, CLAUDE_PLUGIN_DATA: data, CLAUDE_PLUGIN_ROOT: root, STUB_MODE: mode, ...extra },
    })
  const done = async (p: ReturnType<typeof run>) => ({ code: await p.exited, err: await new Response(p.stderr).text() })
  const calls = () => (existsSync(join(base, 'npm.calls')) ? readFileSync(join(base, 'npm.calls'), 'utf8').trim().split('\n') : [])
  return { base, root, data, run, done, calls, stamp: join(data, 'installed.stamp'), lock: join(data, 'install.lock') }
}

describe('session-start.sh', () => {
  test('a successful install writes the stamp and root, uses --ignore-scripts, and locks the data dir down', async () => {
    const s = setup()
    const r = await s.done(s.run('ok'))
    expect(r.code).toBe(0)
    expect(existsSync(s.stamp)).toBe(true)
    expect(readFileSync(join(s.data, 'plugin-root'), 'utf8')).toBe(s.root)
    expect(s.calls()).toEqual(['ci --omit=dev --ignore-scripts --no-audit --no-fund'])
    expect(existsSync(s.lock)).toBe(false)
    expect(statSync(s.data).mode & 0o777).toBe(0o700)
    expect(statSync(join(s.data, 'install.log')).mode & 0o777).toBe(0o600)
  })

  test('an installed, unchanged package does not run npm again; a changed one does', async () => {
    const s = setup()
    await s.done(s.run('ok'))
    await s.done(s.run('ok'))
    expect(s.calls()).toHaveLength(1)
    writeFileSync(join(s.root, 'package-lock.json'), '{"lockfileVersion":3,"changed":true}')
    await s.done(s.run('ok'))
    expect(s.calls()).toHaveLength(2)
  })

  test('a failed install leaves no stamp, reports on stderr, exits 0, and is retried', async () => {
    const s = setup()
    const r = await s.done(s.run('fail'))
    expect(r.code).toBe(0)
    expect(r.err).toMatch(/installing @duckdb\/node-api failed/)
    expect(existsSync(s.stamp)).toBe(false)
    expect(existsSync(s.lock)).toBe(false)
    await s.done(s.run('ok'))
    expect(existsSync(s.stamp)).toBe(true)
    expect(s.calls()).toHaveLength(2)
  })

  test('a killed install leaves no stamp; its stale lock is taken over and the install retried', async () => {
    const s = setup()
    const p = s.run('hang')
    for (let i = 0; i < 100 && !existsSync(join(s.base, 'npm.pid')); i++) await Bun.sleep(50)
    process.kill(Number(readFileSync(join(s.base, 'npm.pid'), 'utf8')), 'SIGKILL')
    p.kill('SIGKILL')
    await p.exited
    expect(existsSync(s.stamp)).toBe(false)
    expect(existsSync(s.lock)).toBe(true) // SIGKILL cannot clean up

    // Still fresh: another session leaves it alone.
    expect((await s.done(s.run('ok'))).code).toBe(0)
    expect(existsSync(s.stamp)).toBe(false)

    // Stale: taken over.
    const old = new Date(Date.now() - 20 * 60_000)
    utimesSync(s.lock, old, old)
    await s.done(s.run('ok'))
    expect(existsSync(s.stamp)).toBe(true)
    expect(existsSync(s.lock)).toBe(false)
  })

  test('a held (fresh) lock skips the install without error', async () => {
    const s = setup()
    mkdirSync(s.data, { recursive: true })
    mkdirSync(s.lock)
    const r = await s.done(s.run('ok'))
    expect(r.code).toBe(0)
    expect(r.err).toBe('')
    expect(s.calls()).toEqual([])
    expect(existsSync(s.stamp)).toBe(false)
    expect(existsSync(s.lock)).toBe(true) // not ours to remove
  })

  test('npm dying mid-install releases the lock', async () => {
    const s = setup()
    const p = s.run('hang')
    for (let i = 0; i < 100 && !existsSync(join(s.base, 'npm.pid')); i++) await Bun.sleep(50)
    process.kill(Number(readFileSync(join(s.base, 'npm.pid'), 'utf8')), 'SIGKILL') // npm dies, script continues to its failure branch
    expect((await s.done(p)).code).toBe(0)
    expect(existsSync(s.stamp)).toBe(false)
    expect(existsSync(s.lock)).toBe(false)
  })

  test('without the plugin env vars it does nothing and exits 0', async () => {
    const s = setup()
    const p = Bun.spawn(['sh', SCRIPT], { stdout: 'pipe', stderr: 'pipe', env: { PATH: process.env.PATH! } })
    expect(await p.exited).toBe(0)
  })
})
