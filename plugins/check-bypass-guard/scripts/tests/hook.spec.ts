import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = join(import.meta.dir, '..', 'check-bypass-guard.ts')
const dir = mkdtempSync(join(tmpdir(), 'cbg-'))
writeFileSync(join(dir, '.eslintrc.json'), '{}')
mkdirSync(join(dir, '.husky'))
writeFileSync(join(dir, '.husky', 'commit-msg'), 'npx commitlint --edit "$1"\n')
mkdirSync(join(dir, '.git', 'hooks'), { recursive: true })
writeFileSync(join(dir, '.git', 'config'), '[core]\n')
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

  test('a persistent hooksPath change is denied; a Bash write to a protected config asks; ordinary Bash passes', () => {
    expect(hook('Bash', { command: 'git config core.hooksPath /dev/null' }).out?.permissionDecision).toBe('deny')
    expect(hook('Bash', { command: 'git config --edit' }).out?.permissionDecision).toBe('ask')
    expect(hook('Bash', { command: 'echo x >> .eslintignore' }).out?.permissionDecision).toBe('ask')
    expect(hook('Bash', { command: 'rm build/out.js' }).out).toBeNull()
  })

  test('hook scripts and .git/config ask whether or not they exist', () => {
    expect(hook('Write', { file_path: join(dir, '.husky', 'pre-commit'), content: 'exit 0' }).out?.permissionDecision).toBe('ask')
    expect(hook('Write', { file_path: '.husky/pre-push', content: 'exit 0' }).out?.permissionDecision).toBe('ask')
    expect(hook('Write', { file_path: join(dir, '.husky', 'commit-msg'), content: 'exit 0' }).out?.permissionDecision).toBe('ask')
    expect(hook('Write', { file_path: join(dir, '.git', 'hooks', 'pre-commit'), content: 'exit 0' }).out?.permissionDecision).toBe('ask')
    expect(hook('Edit', { file_path: join(dir, '.git', 'config'), old_string: '[core]', new_string: '[core]\n\thooksPath = /dev/null' }).out?.permissionDecision).toBe('ask')
    expect(hook('MultiEdit', { file_path: '.git/config', edits: [] }).out?.permissionDecision).toBe('ask')
  })

  test('malformed input asks', () => {
    expect(run('{not json').out?.permissionDecision).toBe('ask')
  })
})
