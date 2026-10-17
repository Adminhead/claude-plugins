// Run with: bun test plugins/coremods/scripts/tests   (from the repo root)
// Every `bun` hook must ignore the cwd project's bunfig.toml preload and .env.
import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PLUGIN = join(import.meta.dir, '..', '..')
const dirs: string[] = []
afterAll(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })))

type Hook = { command: string; args?: string[] }
const config = JSON.parse(readFileSync(join(PLUGIN, 'hooks', 'hooks.json'), 'utf8'))
const bunHooks: string[][] = Object.values(config.hooks as Record<string, { hooks: Hook[] }[]>)
  .flatMap(groups => groups.flatMap(group => group.hooks))
  .filter(hook => hook.command === 'bun')
  .map(hook => [hook.command, ...(hook.args ?? [])])

const isScriptArg = (arg: string) => arg.includes('${CLAUDE_PLUGIN_ROOT}')

describe('bun hooks ignore the project bunfig and .env', () => {
  test('hooks.json has bun hooks to check', () => {
    expect(bunHooks.length).toBeGreaterThanOrEqual(2)
  })

  for (const argv of bunHooks) {
    test(argv.join(' '), async () => {
      const work = mkdtempSync(join(tmpdir(), 'bun-isolation-'))
      dirs.push(work)
      const marker = join(work, 'marker.txt')
      const envMarker = join(work, 'env-marker.txt')
      const probe = join(work, 'env-probe.js')
      writeFileSync(join(work, 'bunfig.toml'), 'preload = ["./preload.js"]\n')
      writeFileSync(
        join(work, 'preload.js'),
        `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(marker)}, 'probe=' + (process.env.BUN_ISO_PROBE ?? 'unset'))\n`,
      )
      writeFileSync(
        probe,
        `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(envMarker)}, process.env.BUN_ISO_PROBE ?? 'unset')\n`,
      )
      writeFileSync(join(work, '.env'), 'BUN_ISO_PROBE=from-dotenv\n')

      const run = async (args: string[]) => {
        const p = Bun.spawn(['bun', ...args], {
          cwd: work,
          stdin: 'pipe',
          stdout: 'pipe',
          stderr: 'pipe',
          env: { PATH: process.env.PATH!, CLAUDE_PLUGIN_DATA: join(work, 'data') },
        })
        p.stdin.write('{}')
        p.stdin.end()
        return p.exited
      }

      const hookArgs = argv.slice(1).map(arg => arg.replaceAll('${CLAUDE_PLUGIN_ROOT}', PLUGIN))
      expect(await run(hookArgs)).toBe(0)
      expect(existsSync(marker) ? readFileSync(marker, 'utf8') : null).toBeNull()

      // The preload can hide a .env leak when the flags only stop the preload, so also run a probe that reads .env directly.
      const probeArgs = argv.slice(1).map(arg => (isScriptArg(arg) ? probe : arg))
      expect(await run(probeArgs)).toBe(0)
      expect(readFileSync(envMarker, 'utf8')).toBe('unset')
    })
  }
})
