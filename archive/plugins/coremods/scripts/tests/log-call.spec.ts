// Run with: bun test plugins/coremods/scripts/tests   (from the repo root)
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = join(import.meta.dir, '..', 'log-call.ts')
const dirs: string[] = []
afterAll(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })))

async function hook(input: unknown, env: Record<string, string> = {}) {
  const data = mkdtempSync(join(tmpdir(), 'logcall-'))
  dirs.push(data)
  const p = Bun.spawn(['bun', SCRIPT], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe', env: { PATH: process.env.PATH!, CLAUDE_PLUGIN_DATA: data, ...env } })
  p.stdin.write(typeof input === 'string' ? input : JSON.stringify(input))
  p.stdin.end()
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited])
  const files = existsSync(join(data, 'logs')) ? readdirSync(join(data, 'logs'), { recursive: true }).map(String).filter(f => f.endsWith('.jsonl')) : []
  const lines = (f: string) => readFileSync(join(data, 'logs', f), 'utf8').trim().split('\n').map(l => JSON.parse(l))
  return { out, err, code, files, lines, data }
}

const base = { session_id: 's1', cwd: '/w', permission_mode: 'default', hook_event_name: 'PostToolUse', tool_use_id: 'tu1' }

describe('log-call hook', () => {
  test('a main-thread Bash call goes to <session>/main.jsonl with its command', async () => {
    const r = await hook({ ...base, tool_name: 'Bash', tool_input: { command: 'ls -la', description: 'x' }, tool_response: { stdout: '' } })
    expect(r.code).toBe(0)
    expect(r.out + r.err).toBe('')
    expect(r.files).toEqual(['s1/main.jsonl'])
    expect(r.lines('s1/main.jsonl')[0]).toMatchObject({ id: 'tu1', tool: 'Bash', command: 'ls -la', session: 's1', cwd: '/w', permission_mode: 'default', blocked: null, isError: false })
  })

  test('a subagent call goes to its agent_type file', async () => {
    const r = await hook({ ...base, agent_id: 'a123', agent_type: 'Explore', tool_name: 'Read', tool_input: { file_path: '/a.ts' } })
    expect(r.files).toEqual(['s1/Explore.jsonl'])
    expect(r.lines('s1/Explore.jsonl')[0]).toMatchObject({ agent: 'Explore', agent_type: 'Explore', tool: 'Read', summary: 'file_path=/a.ts' })
  })

  test('agent_id is used when there is no agent_type', async () => {
    const r = await hook({ ...base, agent_id: 'a123', tool_name: 'Read', tool_input: {} })
    expect(r.files).toEqual(['s1/a123.jsonl'])
  })

  test('session and agent names cannot escape the logs dir', async () => {
    const r = await hook({ ...base, session_id: '../../etc', agent_type: 'a/../b', tool_name: 'Read', tool_input: {} })
    expect(r.code).toBe(0)
    expect(r.files).toHaveLength(1)
    expect(r.files[0]).toMatch(/^[A-Za-z0-9_][A-Za-z0-9._-]*\/[A-Za-z0-9_][A-Za-z0-9._-]*\.jsonl$/)
  })

  test('a non-Bash call keeps a short summary and never file contents', async () => {
    const r = await hook({ ...base, tool_name: 'Write', tool_input: { file_path: '/a.txt', content: 'SECRET' } })
    const rec = r.lines('s1/main.jsonl')[0]
    expect(rec).toMatchObject({ tool: 'Write', summary: 'file_path=/a.txt' })
    expect(rec.command).toBeUndefined()
    expect(JSON.stringify(rec)).not.toContain('SECRET')
  })

  test('a failure event is logged as an error', async () => {
    const r = await hook({ ...base, hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: 'false' }, error: 'exit 1' })
    expect(r.lines('s1/main.jsonl')[0].isError).toBe(true)
  })

  test('a long command is capped', async () => {
    const r = await hook({ ...base, tool_name: 'Bash', tool_input: { command: 'x'.repeat(9000) } })
    expect(r.lines('s1/main.jsonl')[0].command).toHaveLength(4000)
  })

  test('the main thread is `main` even under --agent, so the mod can use the same key', async () => {
    const r = await hook({ ...base, agent_type: 'orchestration', tool_name: 'Read', tool_input: {} })
    expect(r.files).toEqual(['s1/main.jsonl'])
    expect(r.lines('s1/main.jsonl')[0].agent_type).toBe('orchestration')
  })

  test('logs are owner-only: 0700 dirs, 0600 files', async () => {
    const r = await hook({ ...base, tool_name: 'Bash', tool_input: { command: 'ls' } })
    const mode = (p: string) => statSync(join(r.data, p)).mode & 0o777
    expect(mode('logs')).toBe(0o700)
    expect(mode('logs/s1')).toBe(0o700)
    expect(mode('logs/s1/main.jsonl')).toBe(0o600)
  })

  test('bad input, no input, and a missing data dir fail open with no output', async () => {
    for (const input of ['not json', '', '[]', '{"tool_name":5}']) {
      const r = await hook(input)
      expect(r.code).toBe(0)
      expect(r.out + r.err).toBe('')
      expect(r.files).toEqual([])
    }
    const r = await hook({ ...base, tool_name: 'Bash', tool_input: { command: 'ls' } }, { CLAUDE_PLUGIN_DATA: '' })
    expect(r.code).toBe(0)
    expect(r.out + r.err).toBe('')
  })
});
