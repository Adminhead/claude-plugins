import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

const SCRIPT = join(import.meta.dir, '..', 'cloud-ops-guard.ts')

function run(stdin: string, env: Record<string, string> = {}): { code: number; out: any } {
  const p = Bun.spawnSync(['bun', '--no-env-file', '--config=/dev/null', SCRIPT], { stdin: Buffer.from(stdin), env: { PATH: process.env.PATH ?? '', ...env } })
  const text = p.stdout.toString().trim()
  return { code: p.exitCode ?? -1, out: text ? JSON.parse(text).hookSpecificOutput : null }
}

const destroy = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'terraform destroy' } })

describe('the enabled option', () => {
  test("'false' turns the guard off, also for malformed input", () => {
    const env = { CLAUDE_PLUGIN_OPTION_ENABLED: 'false' }
    expect(run(destroy, env)).toEqual({ code: 0, out: null })
    expect(run('{not json', env)).toEqual({ code: 0, out: null })
  })

  test.each([['unset', undefined], ['true', 'true'], ['FALSE', 'FALSE'], ['0', '0'], ['empty', '']])('%s keeps the guard on', (_name, value) => {
    const r = run(destroy, value === undefined ? {} : { CLAUDE_PLUGIN_OPTION_ENABLED: value })
    expect(r.out?.permissionDecision).toBe('deny')
  })
})
