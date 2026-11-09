import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const dir = join(dirname(import.meta.path), '..')
const hook = JSON.parse(readFileSync(join(dir, 'hooks/hooks.json'), 'utf8')).hooks.SessionStart[0].hooks[0]
const note = readFileSync(join(dir, 'hooks/session-context.md'), 'utf8')

const run = (opt: Record<string, string>) => {
  const args = (hook.args as string[]).map((a) => a.replace('${CLAUDE_PLUGIN_ROOT}', dir))
  const r = Bun.spawnSync([hook.command, ...args], { env: { PATH: process.env.PATH ?? '', ...opt } })
  return { out: r.stdout.toString(), code: r.exitCode }
}

test('only an exact false suppresses the note', () => {
  expect(run({ CLAUDE_PLUGIN_OPTION_ENABLED: 'false' })).toEqual({ out: '', code: 0 })
  for (const v of [undefined, 'true', 'FALSE', '0', '']) {
    const r = run(v === undefined ? {} : { CLAUDE_PLUGIN_OPTION_ENABLED: v })
    expect(r.code).toBe(0)
    expect(r.out).toBe(note)
  }
})
