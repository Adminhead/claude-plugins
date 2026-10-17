// bun test entry for the guard: runs the offline decision table and fuzz in tests/check.sh.
import { expect, test } from 'bun:test'
import { join } from 'node:path'

test('cloud-ops-guard decision table and fuzz', () => {
  const r = Bun.spawnSync(['bash', join(import.meta.dir, 'tests', 'check.sh')], { stdout: 'pipe', stderr: 'pipe' })
  const out = r.stdout.toString()
  if (r.exitCode !== 0) console.log(out.split('\n').filter(l => l.startsWith('FAIL')).join('\n'), r.stderr.toString())
  expect(out).toContain('failed=0')
  expect(r.exitCode).toBe(0)
}, 300_000)
