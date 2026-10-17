// Run with: bun test plugins/coremods/scripts/tests   (from the repo root)
// The mod's deny log goes through APPEND_SCRIPT, so test it as the shell script it is.
import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { APPEND_SCRIPT } from '../../hooks/tool-mgr/rules'

const dirs: string[] = []
afterAll(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })))

function home(installs: Record<string, string>) {
  const h = mkdtempSync(join(tmpdir(), 'append-'))
  dirs.push(h)
  for (const [name, root] of Object.entries(installs)) {
    const d = join(h, '.claude', 'plugins', 'data', name)
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, 'plugin-root'), root)
  }
  return h
}

async function append(h: string, root: string, path: string, line: string) {
  const p = Bun.spawn(['sh', '-c', APPEND_SCRIPT, 'sh', root, path], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe', env: { PATH: process.env.PATH!, HOME: h } })
  p.stdin.write(line + '\n')
  p.stdin.end()
  return p.exited
}

const data = (h: string, name: string) => join(h, '.claude', 'plugins', 'data', name)

describe('APPEND_SCRIPT', () => {
  test('writes to the data dir whose plugin-root is exactly this install, not a dev or other install', async () => {
    const h = home({ 'coremods-inline': '/dev/checkout', 'coremods-adminhead': '/cache/coremods/0.3.0', 'coremods-extra': '/cache/coremods/0.3.0-other' })
    expect(await append(h, '/cache/coremods/0.3.0', 's1/main.jsonl', '{"a":1}')).toBe(0)
    expect(readFileSync(join(data(h, 'coremods-adminhead'), 'logs/s1/main.jsonl'), 'utf8')).toBe('{"a":1}\n')
    expect(existsSync(join(data(h, 'coremods-inline'), 'logs'))).toBe(false)
    expect(existsSync(join(data(h, 'coremods-extra'), 'logs'))).toBe(false)
  })

  test('with no matching install it writes nothing and still exits 0', async () => {
    const h = home({ 'coremods-inline': '/dev/checkout' })
    expect(await append(h, '/cache/coremods/0.3.0', 's1/main.jsonl', '{}')).toBe(0)
    expect(existsSync(join(data(h, 'coremods-inline'), 'logs'))).toBe(false)
    expect(await append(h, '', 's1/main.jsonl', '{}')).toBe(0)
  })

  test('files are 0600 and dirs 0700 even under a permissive umask', async () => {
    const h = home({ 'coremods-adminhead': '/r' })
    const p = Bun.spawn(['sh', '-c', `umask 000; ${'exec sh -c "$0" sh "$1" "$2"'}`, APPEND_SCRIPT, '/r', 's1/main.jsonl'], { stdin: 'pipe', env: { PATH: process.env.PATH!, HOME: h } })
    p.stdin.write('x\n')
    p.stdin.end()
    expect(await p.exited).toBe(0)
    const mode = (rel: string) => statSync(join(data(h, 'coremods-adminhead'), rel)).mode & 0o777
    expect(mode('logs')).toBe(0o700)
    expect(mode('logs/s1')).toBe(0o700)
    expect(mode('logs/s1/main.jsonl')).toBe(0o600)
  })
})
