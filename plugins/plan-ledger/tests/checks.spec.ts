import { describe, expect, test } from 'bun:test'
import { apply } from '../hooks/plan/apply'
import { checksHash, hash53, shellQuote, validateChecks } from '../hooks/plan/checks'
import type { Check, ItemInput } from '../hooks/plan/types'

const err = (r: unknown): string => {
  if (typeof r !== 'object' || r === null || !('error' in r)) throw new Error('expected an error')
  return (r as { error: string }).error
}
const good = (r: unknown): Check[] => {
  if (!Array.isArray(r)) throw new Error(`expected checks, got ${JSON.stringify(r)}`)
  return r as Check[]
}

describe('validateChecks', () => {
  test('accepts a list, copies it, and defaults expectExit to 0', () => {
    const raw = [{ label: 'unit', argv: ['bun', 'test'] }, { label: 'lint', argv: ['eslint', '.'], expectExit: 1 }]
    const out = good(validateChecks(raw))
    expect(out).toEqual([
      { label: 'unit', argv: ['bun', 'test'], expectExit: 0 },
      { label: 'lint', argv: ['eslint', '.'], expectExit: 1 },
    ])
    expect(out[0].argv).not.toBe((raw[0] as { argv: string[] }).argv)
  })

  test('an empty list is valid (an item verified by hand)', () => {
    expect(validateChecks([])).toEqual([])
  })

  test('rejects what is not a list of checks', () => {
    for (const bad of [undefined, null, 'x', {}, [null], ['x'], [[]]]) expect(err(validateChecks(bad))).toBeTruthy()
  })

  test('rejects an empty or missing argv and non-string or empty arguments', () => {
    expect(err(validateChecks([{ label: 'a', argv: [] }]))).toMatch(/argv/)
    expect(err(validateChecks([{ label: 'a' }]))).toMatch(/argv/)
    expect(err(validateChecks([{ label: 'a', argv: ['ok', 3] }]))).toMatch(/argv/)
    expect(err(validateChecks([{ label: 'a', argv: ['ok', ''] }]))).toMatch(/argv/)
    expect(err(validateChecks([{ label: 'a', argv: 'bun test' }]))).toMatch(/argv/)
  })

  test('rejects a missing or empty label and duplicate labels', () => {
    expect(err(validateChecks([{ argv: ['x'] }]))).toMatch(/label/)
    expect(err(validateChecks([{ label: ' ', argv: ['x'] }]))).toMatch(/label/)
    expect(err(validateChecks([{ label: 'a', argv: ['x'] }, { label: 'a', argv: ['y'] }]))).toMatch(/Duplicate/)
  })

  test('at most 8 checks', () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `c${i}`, argv: ['x'] }))
    expect(good(validateChecks(mk(8)))).toHaveLength(8)
    expect(err(validateChecks(mk(9)))).toMatch(/At most 8/)
  })

  test('argv is at most 600 bytes in total, counted in UTF-8', () => {
    expect(good(validateChecks([{ label: 'a', argv: ['x'.repeat(600)] }]))).toHaveLength(1)
    expect(err(validateChecks([{ label: 'a', argv: ['x'.repeat(601)] }]))).toMatch(/600/)
    expect(err(validateChecks([{ label: 'a', argv: ['é'.repeat(301)] }]))).toMatch(/600/)
    expect(err(validateChecks([{ label: 'a', argv: ['x'.repeat(300), 'y'.repeat(301)] }]))).toMatch(/600/)
  })

  test('expectExit must be an integer when given', () => {
    for (const bad of ['0', 1.5, null, NaN]) {
      expect(err(validateChecks([{ label: 'a', argv: ['x'], expectExit: bad }]))).toMatch(/expectExit/)
    }
    expect(good(validateChecks([{ label: 'a', argv: ['x'], expectExit: -1 }]))[0].expectExit).toBe(-1)
  })

  test('a misspelled field is an error, not a silent default', () => {
    expect(err(validateChecks([{ label: 'a', argv: ['x'], expect_exit: 1 }]))).toMatch(/expect_exit/)
  })

  test('what it accepts, apply accepts at create (the two validators agree)', () => {
    const checks = good(validateChecks([{ label: 'unit', argv: ['bun', 'test'] }]))
    const item: ItemInput = { title: 't', instructions: 'i', acceptance: [], files: [], deps: [], agent: 'coder', model: 'm', checks }
    const r = apply(null, { action: 'create', title: 'p', items: [item] }, {
      actor: { kind: 'main' },
      nowMs: 0,
      attemptCap: 3,
      newPlanId: 'p-0abcdefgh-abc123',
      op: 'o',
      project: '/r',
    })
    expect('denied' in r).toBe(false)
  })
})

describe('checksHash', () => {
  const a: Check = { label: 'unit', argv: ['bun', 'test'], expectExit: 0 }
  const b: Check = { label: 'lint', argv: ['eslint', '.'], expectExit: 0 }

  test('is stable across key order', () => {
    const reordered = { expectExit: 0, argv: ['bun', 'test'], label: 'unit' } as Check
    expect(checksHash([a])).toBe(checksHash([reordered]))
    expect(checksHash([a, b])).toBe(checksHash([a, b].map((c) => ({ ...c }))))
  })

  test('changes when a label, an argument or the expected exit changes, or the order does', () => {
    const base = checksHash([a, b])
    expect(checksHash([{ ...a, label: 'u' }, b])).not.toBe(base)
    expect(checksHash([{ ...a, argv: ['bun', 'test', 'x'] }, b])).not.toBe(base)
    expect(checksHash([{ ...a, expectExit: 1 }, b])).not.toBe(base)
    expect(checksHash([b, a])).not.toBe(base)
    expect(checksHash([a])).not.toBe(checksHash([]))
  })

  test('argument boundaries matter: ["a b"] differs from ["a","b"]', () => {
    expect(checksHash([{ ...a, argv: ['a b'] }])).not.toBe(checksHash([{ ...a, argv: ['a', 'b'] }]))
  })

  test('is a fixed-width hex string, and a 53-bit one', () => {
    expect(checksHash([a])).toMatch(/^[0-9a-f]{14}$/)
    for (let i = 0; i < 200; i++) {
      const h = hash53(`input ${i}`)
      expect(Number.parseInt(h, 16)).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER)
    }
  })

  test('hash53 is deterministic and spreads small changes', () => {
    expect(hash53('abc')).toBe(hash53('abc'))
    const seen = new Set(Array.from({ length: 1000 }, (_, i) => hash53(String(i))))
    expect(seen.size).toBe(1000)
  })
})

describe('shellQuote', () => {
  test('wraps each argument in single quotes and escapes an embedded quote', () => {
    expect(shellQuote(['echo', 'a b'])).toBe(`'echo' 'a b'`)
    expect(shellQuote(["a'b"])).toBe(`'a'\\''b'`)
    expect(shellQuote([])).toBe('')
  })

  test('a shell reads every argument back exactly, whatever it contains', () => {
    const argv = ["a'b", 'a b', '$HOME', '`id`', '"q"', '\\', '*', '', 'new\nline', "'", "''", '; rm -rf /', '--flag=x y']
    const script = `for a in ${shellQuote(argv)}; do printf '%s\\0' "$a"; done`
    const out = Bun.spawnSync(['sh', '-c', script]).stdout.toString()
    expect(out.split('\0').slice(0, -1)).toEqual(argv)
  })
})
