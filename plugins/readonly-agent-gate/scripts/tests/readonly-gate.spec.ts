// bun test plugins/readonly-agent-gate/scripts/tests
import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { DEFAULT_AGENTS, isReadOnly, parseExtra } from '../agents.ts'

describe('agents', () => {
  test('defaults gate the scoped and bare general read-only agents only', () => {
    for (const t of ['architect', 'architect:architect', 'reviewer:reviewer', 'debugger:debugger', 'debugger']) {
      expect(isReadOnly(t)).toBe(true)
    }
    for (const t of ['coder:coder', 'security:reviewer', 'reviewer:other', 'quick-review', 'Explore', '']) {
      expect(isReadOnly(t)).toBe(false)
    }
    expect(DEFAULT_AGENTS.length).toBe(6)
  })

  test('a bare extra matches any plugin agent of that name, a scoped one only itself', () => {
    const extra = parseExtra('security-auditor, web:browser-tester')
    expect(isReadOnly('security-auditor', extra)).toBe(true)
    expect(isReadOnly('security-auditor:security-auditor', extra)).toBe(true)
    expect(isReadOnly('a:b:security-auditor', extra)).toBe(true)
    expect(isReadOnly('web:browser-tester', extra)).toBe(true)
    expect(isReadOnly('other:browser-tester', extra)).toBe(false)
    expect(isReadOnly('browser-tester', extra)).toBe(false)
  })

  test('parseExtra splits on commas and whitespace, reads a JSON list, drops invalid names', () => {
    expect(parseExtra(undefined)).toEqual([])
    expect(parseExtra('')).toEqual([])
    expect(parseExtra(' a ,b\tc\nd ')).toEqual(['a', 'b', 'c', 'd'])
    expect(parseExtra('["x", "y:z", 3]')).toEqual(['x', 'y:z'])
    expect(parseExtra('ok, $bad, a:, :b, ' + 'n'.repeat(200))).toEqual(['ok'])
  })
})

describe('gate', () => {
  test('every allow/block case in readonly-bash.cases.sh passes', () => {
    const r = Bun.spawnSync(['bash', join(import.meta.dir, 'readonly-bash.cases.sh')], { stdout: 'pipe', stderr: 'pipe' })
    const out = `${r.stdout.toString()}${r.stderr.toString()}`
    if (r.exitCode !== 0) console.error(out)
    expect(out).toMatch(/\d+ passed, 0 failed/)
    expect(r.exitCode).toBe(0)
  }, 120_000)
})
