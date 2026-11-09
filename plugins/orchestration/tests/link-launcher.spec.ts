import { afterAll, expect, test } from 'bun:test'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const dir = join(dirname(import.meta.path), '..')
const homes: string[] = []
afterAll(() => homes.forEach((h) => rmSync(h, { recursive: true, force: true })))

const link = (opt: Record<string, string>) => {
  const home = mkdtempSync(join(tmpdir(), 'orch-'))
  homes.push(home)
  const r = Bun.spawnSync(['sh', join(dir, 'scripts/link-launcher.sh')], {
    env: { PATH: process.env.PATH ?? '', HOME: home, CLAUDE_PLUGIN_ROOT: dir, ...opt },
  })
  return { code: r.exitCode, dest: join(home, '.local/bin/claude-orchestrate') }
}

test('only an exact false skips the launcher link', () => {
  const off = link({ CLAUDE_PLUGIN_OPTION_LINKLAUNCHER: 'false' })
  expect(off.code).toBe(0)
  expect(existsSync(off.dest)).toBe(false)
  for (const v of [undefined, 'true', 'FALSE', '']) {
    const r = link(v === undefined ? {} : { CLAUDE_PLUGIN_OPTION_LINKLAUNCHER: v })
    expect(lstatSync(r.dest).isSymbolicLink()).toBe(true)
    expect(readlinkSync(r.dest)).toBe(join(dir, 'scripts/claude-orchestrate'))
  }
})

test('false leaves an existing link pointing at its original target', () => {
  const home = mkdtempSync(join(tmpdir(), 'orch-'))
  homes.push(home)
  const dest = join(home, '.local/bin/claude-orchestrate')
  mkdirSync(dirname(dest), { recursive: true })
  symlinkSync('/old/install/claude-orchestrate', dest)
  const r = Bun.spawnSync(['sh', join(dir, 'scripts/link-launcher.sh')], {
    env: { PATH: process.env.PATH ?? '', HOME: home, CLAUDE_PLUGIN_ROOT: dir, CLAUDE_PLUGIN_OPTION_LINKLAUNCHER: 'false' },
  })
  expect(r.exitCode).toBe(0)
  expect(readlinkSync(dest)).toBe('/old/install/claude-orchestrate')
})
