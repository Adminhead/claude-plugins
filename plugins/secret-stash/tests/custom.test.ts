import { describe, test, expect } from 'claude-code/testing'
import { customDetector, regexProblem } from '../hooks/detectors/custom.ts'
import { ScanOverrun, scanPatterns } from '../hooks/detectors/scan.ts'
import { detect } from '../hooks/detect.ts'

describe('customDetector', () => {
  const itk = { type: 'INTERNAL_TOKEN', regex: 'itk_[A-Za-z0-9]{32}' }
  const token = 'itk_' + 'a1B2c3D4'.repeat(4)

  test('detects a match under the pattern type', () => {
    const text = `x ${token} y`
    const m = detect(text, [customDetector([itk], [])])
    expect(m.map(x => [x.category, x.source, text.slice(x.start, x.end)])).toEqual([['INTERNAL_TOKEN', 'custom', token]])
  })

  test('group 1 is the secret when the pattern captures', () => {
    const text = 'password: hunter2hunter2 end'
    const m = detect(text, [customDetector([{ type: 'PW', regex: 'password: ([^ ]{8,64})' }], [])])
    expect(text.slice(m[0].start, m[0].end)).toBe('hunter2hunter2')
  })

  test('whitelist skips an exact value', () => {
    expect(detect(token, [customDetector([itk], [token])])).toEqual([])
  })

  test('an overrun throws instead of skipping the pattern', () => {
    const slow = [{ type: 'SLOW', regex: /a/g }]
    expect(() => scanPatterns('aaaaaaaa', slow, 'custom', new Set(), Date.now() - 1)).toThrow(ScanOverrun)
  })

  test('whitelisted matches do not count toward the cap', () => {
    const many = [{ type: 'MANY', regex: /a/g }]
    const text = 'a'.repeat(10_001)
    expect(scanPatterns(text, many, 'custom', new Set(['a']), Date.now() + 60_000)).toEqual([])
  })

  test('a pattern with too many matches throws', () => {
    const many = [{ type: 'MANY', regex: /a/g }]
    expect(() => scanPatterns('a'.repeat(10_001), many, 'custom', new Set(), Date.now() + 60_000)).toThrow(ScanOverrun)
  })
})

describe('regexProblem', () => {
  test('accepts patterns in the safe subset', () => {
    for (const ok of [
      'itk_[A-Za-z0-9]{32}', '\\bsk_live_[0-9a-zA-Z]{24,99}', 'ghp_[A-Za-z0-9]{36}', 'password: ([^ ]{8,64})',
      'abc(?:de){3}', 'abc(\\d{3}){2}-x', 'x\\.y\\.z[a-z]{4}', 'abc(?<id>[0-9]{4})', 'abc(?:x|y)z{2}',
    ]) {
      expect(regexProblem(ok)).toBeUndefined()
    }
  })

  test('rejects unbounded quantifiers and says how to fix them', () => {
    expect(regexProblem('abc[a-z]+')).toContain('use {1,512} instead of +')
    expect(regexProblem('abc[a-z]*')).toContain('use {0,512} instead of *')
    expect(regexProblem('abc[a-z]?')).toContain('use {0,1} instead of ?')
    expect(regexProblem('abc[a-z]{1,}')).toContain('give {1,} an upper bound')
    expect(regexProblem('abc[a-z]{1,513}')).toContain('exceeds the 512 limit')
  })

  test('rejects the pathological shapes', () => {
    for (const bad of ['a*a*a*b', '\\w+\\s?\\w+$', '(\\w?\\w)+x', '[a-z]{1,}', '(a+)+', '(.*)*', '(?:\\w\\w?)+x']) {
      expect(regexProblem(bad)).toContain('bounded quantifiers')
    }
  })

  test('rejects more than one variable-length quantifier', () => {
    for (const bad of ['abc\\w{1,512}\\w{1,512}x', 'abc\\w{1,512}\\w{1,512}\\w{1,512}x', 'abc[a-z]{2,3}-[0-9]{1,4}']) {
      expect(regexProblem(bad)).toContain('only one variable-length element allowed')
    }
    expect(regexProblem('abc' + '(?:a|aa)'.repeat(40) + 'x')).toContain('only one variable-length element allowed')
    expect(regexProblem('abc(?:_live|_test)_[A-Za-z0-9]{1,24}')).toContain('split alternatives into one pattern each')
    expect(regexProblem('abc(?:_live|_test)(?:x|y)')).toContain('only one variable-length element allowed')
    expect(regexProblem('abc[a-z]{3}-[0-9]{1,4}-[a-f]{8}')).toBeUndefined()
    expect(regexProblem('sk_(?:live|test)_[A-Za-z0-9]{24}')).toBeUndefined()
    expect(regexProblem('abc(?:_live|_test)_[A-Za-z0-9]{24}')).toBeUndefined()
    expect(regexProblem('sk_(?:live|test)_[A-Za-z0-9]{24,99}')).toContain('only one variable-length element allowed')
  })

  test('the widest allowed pattern scans 200 KB in under a second', () => {
    expect(regexProblem('abc\\w{1,512}x')).toBeUndefined()
    const d = customDetector([{ type: 'T', regex: 'abc\\w{1,512}x' }], [])
    const text = 'abc'.repeat(66_700)
    const t0 = Date.now()
    d.detect(text)
    expect(Date.now() - t0).toBeLessThan(1000)
  })

  test('rejects a missing or short literal prefix', () => {
    expect(regexProblem('[A-Z]{20}')).toContain('literal prefix')
    expect(regexProblem('ab[0-9]{8}')).toContain('found 2')
    expect(regexProblem('\\d{8}abc')).toContain('literal prefix')
    expect(regexProblem('abc{8}')).toContain('found 2')
    expect(regexProblem('(abc)[0-9]{8}')).toContain('literal prefix')
  })

  test('rejects a repeated group holding a variable quantifier or an alternation', () => {
    for (const bad of ['abc(\\w{1,5}){2}', 'abc(?:x{1,3}y){2}', 'abc(?:ab|cd){3}', 'abc((a|b)c){2}']) {
      expect(regexProblem(bad)).toContain('nested quantifier')
    }
  })

  test('rejects top-level alternation', () => {
    expect(regexProblem('abc_[0-9]{4}|def_[0-9]{4}')).toContain('top-level alternation')
  })

  test('rejects backreferences but not an escaped backslash before a digit', () => {
    expect(regexProblem('abc(a)\\1')).toContain('backreference')
    expect(regexProblem('abc(?<n>a)\\k<n>')).toContain('backreference')
    expect(regexProblem('abc\\\\1b')).toBeUndefined()
  })

  test('rejects a pattern over 500 characters', () => {
    expect(regexProblem('a'.repeat(501))).toContain('501 characters')
    expect(regexProblem('a'.repeat(500))).toBeUndefined()
  })

  test('rejects an invalid regex', () => {
    expect(regexProblem('abc(unclosed')).toContain('invalid regex')
  })
})
