import { describe, test, expect } from 'claude-code/testing'
import { detect, literalDetector } from '../hooks/detect.ts'
import { makeId } from '../hooks/ids.ts'
import { KEY, regexDetector } from './helpers.ts'

describe('detect', () => {
  test('longer match wins an overlap', () => {
    const ds = [regexDetector(/secret-[a-z]{4}/g, 'SHORT'), regexDetector(/secret-[a-z]{4}-[a-z]{4}/g, 'LONG')]
    const m = detect('x secret-abcd-efgh y', ds)
    expect(m).toHaveLength(1)
    expect(m[0].category).toBe('LONG')
  })

  test('equal length falls to source priority, whatever the detector order', () => {
    const a = regexDetector(/tokenvalue1/g, 'OPEN', 'openredaction')
    const b = regexDetector(/tokenvalue1/g, 'REG', 'registered')
    for (const ds of [[a, b], [b, a]]) {
      const m = detect('tokenvalue1', ds)
      expect(m.map(x => x.category)).toEqual(['REG'])
    }
    const c = regexDetector(/tokenvalue1/g, 'ENV', 'env')
    const d = regexDetector(/tokenvalue1/g, 'CUS', 'custom')
    expect(detect('tokenvalue1', [d, c]).map(x => x.category)).toEqual(['ENV'])
  })

  test('drops matches shorter than 8', () => {
    expect(detect('abcdefg abcdefgh', [regexDetector(/[a-z]+/g, 'X')])).toEqual([
      { start: 8, end: 16, category: 'X', source: 'openredaction' },
    ])
  })

  test('drops matches overlapping an existing ID, so redaction is idempotent', async () => {
    const id = await makeId(KEY, 'AWS_KEY', 'AKIAIOSFODNN7EXAMPLE')
    const hexRun = regexDetector(/[0-9a-f]{16}/g, 'HEX')
    expect(detect(`key ${id} end`, [hexRun])).toEqual([])
    const partial = regexDetector(/SS_AWS_KEY_[0-9a-f]{4}/g, 'PART')
    expect(detect(id, [partial])).toEqual([])
  })

  test('overlapping matches merge into one span with the best category', () => {
    const ds = [literalDetector([{ value: 'SECRETPART1234', category: 'LIT' }], 'registered'), regexDetector(/PART1234[a-z]+/g, 'RX')]
    expect(detect('v=SECRETPART1234abc', ds)).toEqual([{ start: 2, end: 19, category: 'LIT', source: 'registered' }])
  })

  test('cuts an ID out of a match and keeps the pieces, however short', async () => {
    const id = await makeId(KEY, 'AWS_KEY', 'AKIAIOSFODNN7EXAMPLE')
    const text = `tok=${id}zz`
    const m = detect(text, [regexDetector(/tok=[A-Za-z0-9_]+/g, 'TOK')])
    expect(m.map(x => text.slice(x.start, x.end))).toEqual(['tok=', 'zz'])
  })

  test('partial overlap on either side merges into one span', () => {
    const text = 'aaaaaaaa1111 bbbbbbbb2222'
    const left = regexDetector(/aaaaaaaa1111/g, 'L')
    const right = regexDetector(/1111 bbbbbbbb/g, 'R')
    for (const ds of [[left, right], [right, left]]) {
      expect(detect(text, ds)).toEqual([{ start: 0, end: 21, category: 'R', source: 'openredaction' }])
    }
  })

  test('a chain of three overlapping matches merges into one span', () => {
    const ds = [regexDetector(/aaaaaaaabbbb/g, 'A'), regexDetector(/bbbbccccdddd/g, 'B'), regexDetector(/ddddeeeeeeee/g, 'C')]
    const m = detect('--aaaaaaaabbbbccccddddeeeeeeee--', ds)
    expect(m).toHaveLength(1)
    expect([m[0].start, m[0].end]).toEqual([2, 30])
  })

  test('an ID cut from a match leaves the left, right and middle pieces', async () => {
    const id = await makeId(KEY, 'AWS_KEY', 'AKIAIOSFODNN7EXAMPLE')
    const any = regexDetector(/[A-Za-z0-9_=]+/g, 'ANY')
    const pieces = (text: string, m = detect(text, [any])) => m.map(x => text.slice(x.start, x.end))
    const left = `zzzzzzzz${id}`
    const right = `${id}zzzzzzzz`
    const mid = `aaaaaaaa${id}bbbbbbbb`
    // the ID alone matches ANY but is cut away entirely
    expect(pieces(id)).toEqual([])
    expect(pieces(left)).toEqual(['zzzzzzzz'])
    expect(pieces(right)).toEqual(['zzzzzzzz'])
    expect(pieces(mid)).toEqual(['aaaaaaaa', 'bbbbbbbb'])
  })

  test('a single match over 64 KB and a multi-line match are found whole', () => {
    const big = 'k'.repeat(100_000)
    const text = `head ${big} tail`
    expect(detect(text, [regexDetector(/k+/g, 'BIG')]).map(m => [m.start, m.end])).toEqual([[5, 100_005]])
    const pem = '-----BEGIN KEY-----\nabc\ndef\n-----END KEY-----'
    const m = detect(`x\n${pem}\ny`, [regexDetector(/-----BEGIN KEY-----[\s\S]+?-----END KEY-----/g, 'PEM')])
    expect([m[0].start, m[0].end]).toEqual([2, 2 + pem.length])
  })

  test('returns matches sorted by start', () => {
    const ds = [regexDetector(/bbbbbbbb/g, 'B'), regexDetector(/aaaaaaaa/g, 'A')]
    expect(detect('aaaaaaaa bbbbbbbb aaaaaaaa', ds).map(m => m.start)).toEqual([0, 9, 18])
  })
})

describe('literalDetector', () => {
  test('finds every occurrence, skips empty values, tags the source', () => {
    const d = literalDetector([{ value: 'hunter2hunter2', category: 'PW' }, { value: '', category: 'NONE' }], 'registered')
    expect(d.source).toBe('registered')
    expect(d.detect('a hunter2hunter2 b hunter2hunter2')).toEqual([
      { start: 2, end: 16, category: 'PW', source: 'registered' },
      { start: 19, end: 33, category: 'PW', source: 'registered' },
    ])
  })
})
