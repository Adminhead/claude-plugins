import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = join(import.meta.dir, '..', 'check-bypass-guard.ts')
const dir = mkdtempSync(join(tmpdir(), 'cbg-'))
writeFileSync(join(dir, '.eslintrc.json'), '{}')
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function run(stdin: string): { code: number; out: any } {
  const p = Bun.spawnSync(['bun', '--no-env-file', '--config=/dev/null', SCRIPT], { stdin: Buffer.from(stdin), env: { PATH: process.env.PATH ?? '' }, cwd: dir })
  const text = p.stdout.toString().trim()
  return { code: p.exitCode ?? -1, out: text ? JSON.parse(text).hookSpecificOutput : null }
}

const hook = (tool_name: string, tool_input: object) => run(JSON.stringify({ hook_event_name: 'PreToolUse', cwd: dir, tool_name, tool_input }))

describe('the hook as Claude Code runs it', () => {
  test('a --no-verify commit is denied', () => {
    const r = hook('Bash', { command: 'git commit --no-verify -m x' })
    expect(r.code).toBe(0)
    expect(r.out).toMatchObject({ hookEventName: 'PreToolUse', permissionDecision: 'deny' })
  })

  test('an ordinary command prints nothing', () => {
    expect(hook('Bash', { command: 'git commit -m "skip --no-verify"' })).toEqual({ code: 0, out: null })
  })

  test('an edit of an existing config asks, by relative path too; a new one passes', () => {
    expect(hook('Edit', { file_path: join(dir, '.eslintrc.json'), old_string: '{}', new_string: '{"rules":{}}' }).out?.permissionDecision).toBe('ask')
    expect(hook('Write', { file_path: '.eslintrc.json', content: '{}' }).out?.permissionDecision).toBe('ask')
    expect(hook('Write', { file_path: join(dir, '.prettierrc'), content: '{}' }).out).toBeNull()
  })

  test('malformed input asks', () => {
    expect(run('{not json').out?.permissionDecision).toBe('ask')
  })
})
