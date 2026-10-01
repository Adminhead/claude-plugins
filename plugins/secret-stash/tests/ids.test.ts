import { describe, test, expect } from 'claude-code/testing'
import { ID_RE, couldBeIdPrefix, hmacSha256, makeId, newKey, sanitizeCategory } from '../hooks/ids.ts'
import { KEY, bytes, hex, rep } from './helpers.ts'

describe('hmacSha256 (RFC 4231)', () => {
  const cases: [string, Uint8Array, Uint8Array, string][] = [
    ['case 1', rep(20, 0x0b), bytes('Hi There'),
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'],
    ['case 2', bytes('Jefe'), bytes('what do ya want for nothing?'),
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'],
    ['case 3', rep(20, 0xaa), rep(50, 0xdd),
      '773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe'],
    ['case 4', Uint8Array.from({ length: 25 }, (_, i) => i + 1), rep(50, 0xcd),
      '82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b'],
    ['case 6 (key > block)', rep(131, 0xaa), bytes('Test Using Larger Than Block-Size Key - Hash Key First'),
      '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54'],
    ['case 7 (key and data > block)', rep(131, 0xaa),
      bytes('This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm.'),
      '9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2'],
  ]
  for (const [name, key, msg, want] of cases) {
    test(name, async () => {
      expect(hex(await hmacSha256(key, msg))).toBe(want)
    })
  }
})

describe('makeId', () => {
  test('is stable, well formed, and keyed', async () => {
    const a = await makeId(KEY, 'AWS_ACCESS_KEY', 'AKIAIOSFODNN7EXAMPLE')
    expect(await makeId(KEY, 'AWS_ACCESS_KEY', 'AKIAIOSFODNN7EXAMPLE')).toBe(a)
    expect(a).toMatch(/^__SS_AWS_ACCESS_KEY_[0-9a-f]{16}__$/)
    expect(a.match(ID_RE)).toEqual([a])
    expect(await makeId(rep(32, 8), 'AWS_ACCESS_KEY', 'AKIAIOSFODNN7EXAMPLE')).not.toBe(a)
    expect(await makeId(KEY, 'AWS_ACCESS_KEY', 'AKIAIOSFODNN7EXAMPLF')).not.toBe(a)
  })

  test('sanitizes and caps the category; ID fits ID_MAX_LEN', async () => {
    const id = await makeId(KEY, 'x'.repeat(50), 'v'.repeat(8))
    expect(id).toHaveLength(56)
    expect(id.match(ID_RE)).toEqual([id])
    expect(await makeId(KEY, 'reg db-url', 'v'.repeat(8))).toMatch(/^__SS_REG_DB_URL_[0-9a-f]{16}__$/)
  })
})

test('sanitizeCategory', () => {
  expect(sanitizeCategory('aws key!')).toBe('AWS_KEY')
  expect(sanitizeCategory('a---b')).toBe('A_B')
  expect(sanitizeCategory('__x__')).toBe('X')
  expect(sanitizeCategory('')).toBe('SECRET')
  expect(sanitizeCategory('!!!')).toBe('SECRET')
  expect(sanitizeCategory('a'.repeat(40))).toHaveLength(32)
  expect(sanitizeCategory('a'.repeat(31) + '-b')).toBe('A'.repeat(31))
})

test('couldBeIdPrefix accepts every proper prefix of an ID and rejects others', async () => {
  const id = await makeId(KEY, 'AWS_KEY', 'AKIAIOSFODNN7EXAMPLE')
  for (let n = 1; n < id.length; n++) expect(couldBeIdPrefix(id.slice(0, n))).toBe(true)
  expect(couldBeIdPrefix(id)).toBe(false)
  expect(couldBeIdPrefix('__SS_PW_0000000000000000__')).toBe(false)
  expect(couldBeIdPrefix('__SS_A_B_0000')).toBe(true)
  for (const s of ['', 'a', '_a', '__X', '__SS_a', '__SS_AB_0123456789abcdeg', '__SS__xyz', id + '_']) {
    expect(couldBeIdPrefix(s)).toBe(false)
  }
})

test('newKey returns 32 fresh bytes', () => {
  const a = newKey()
  expect(a).toHaveLength(32)
  expect(hex(a)).not.toBe(hex(newKey()))
})
