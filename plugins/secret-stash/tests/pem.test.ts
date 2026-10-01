import { describe, test, expect } from 'claude-code/testing'
import { pemDetector } from '../hooks/detectors/pem.ts'
import { detect } from '../hooks/detect.ts'

const body = (n: number) => Array.from({ length: n }, (_, i) => `MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC${String(i).padStart(4, '0')}`)
const pem = (kind: string, lines: string[], end = true) =>
  [`-----BEGIN ${kind}PRIVATE KEY-----`, ...lines, ...(end ? [`-----END ${kind}PRIVATE KEY-----`] : [])]

const KINDS = ['', 'RSA ', 'ENCRYPTED ', 'EC ', 'OPENSSH ']
const VIEWS: [string, (l: string, i: number) => string][] = [
  ['plain', l => l],
  ['Read', (l, i) => `${String(i + 1).padStart(6)}→${l}`],
  ['cat -n', (l, i) => `${String(i + 1).padStart(6)}\t${l}`],
  ['grep -n', (l, i) => `app/key.pem:${i + 1}:${l}`],
]

const covered = (text: string) => detect(text, [pemDetector()]).map(m => text.slice(m.start, m.end))

describe('pemDetector', () => {
  for (const kind of KINDS) {
    for (const [view, fmt] of VIEWS) {
      test(`${kind || 'PKCS#8 '}key, ${view} view, is covered from BEGIN to END`, () => {
        const lines = pem(kind, body(5))
        const text = 'before\n' + lines.map(fmt).join('\n') + '\nafter'
        const [hit] = covered(text)
        expect(hit.startsWith('-----BEGIN')).toBe(true)
        expect(hit.endsWith('PRIVATE KEY-----')).toBe(true)
        expect(hit).toContain(body(5)[4])
        expect(covered(text)).toHaveLength(1)
      })
    }
  }

  test('a PGP private key block, plain and Read views, and truncated', () => {
    const lines = [
      '-----BEGIN PGP PRIVATE KEY BLOCK-----', 'Version: GnuPG v2', '', ...body(4), '-----END PGP PRIVATE KEY BLOCK-----',
    ]
    for (const fmt of [(l: string) => l, (l: string, i: number) => `${String(i + 1).padStart(6)}→${l}`]) {
      const text = 'x\n' + lines.map(fmt).join('\n') + '\nafter'
      const hits = covered(text)
      expect(hits).toHaveLength(1)
      expect(hits[0].endsWith('PRIVATE KEY BLOCK-----')).toBe(true)
      expect(hits[0]).toContain(body(4)[3])
      const cut = 'x\n' + lines.slice(0, -1).map(fmt).join('\n')
      expect(covered(cut).join('')).toBe(cut.slice(cut.indexOf('-----BEGIN')))
    }
  })

  test('a truncated read with no END covers the rest of the text', () => {
    const text = 'x\n' + pem('RSA ', body(5), false).join('\n')
    const hits = covered(text)
    expect(hits.join('')).toBe(text.slice(2))
    expect(hits.join('')).toContain(body(5)[4])
  })

  test('a key over 16 KB is covered in full, in chunks', () => {
    const text = pem('RSA ', body(600)).join('\n') + '\ntail'
    const hits = covered(text)
    expect(hits.length).toBeGreaterThan(1)
    expect(hits.join('')).toBe(text.slice(0, text.length - '\ntail'.length))
    expect(hits.at(-1)!.endsWith('PRIVATE KEY-----')).toBe(true)
  })

  test('an END straddling a chunk boundary still closes the key', () => {
    for (let pad = 16_300; pad < 16_500; pad += 7) {
      const text = `-----BEGIN RSA PRIVATE KEY-----\n${'A'.repeat(pad)}\n-----END RSA PRIVATE KEY-----\nTAILTEXT-after`
      const hits = covered(text)
      expect(hits.join('')).toBe(text.slice(0, text.indexOf('\nTAILTEXT')))
    }
  })

  test('text with no key is left alone, and other PEM kinds are not keys', () => {
    expect(covered('hello world')).toEqual([])
    expect(covered('-----BEGIN CERTIFICATE-----\nMIIDdzCCAl+gAwIBAgIE\n-----END CERTIFICATE-----')).toEqual([])
  })

  test('200 KB of BEGIN lines with no END finishes in under a second', () => {
    const text = '-----BEGIN RSA PRIVATE KEY-----\n'.repeat(Math.ceil(200_000 / 32))
    const t0 = Date.now()
    const hits = covered(text)
    expect(Date.now() - t0).toBeLessThan(1000)
    expect(hits.join('')).toBe(text)
  })

  test('200 KB of BEGIN, END and filler stays fast', () => {
    const text = (pem('', body(2)).join('\n') + '\nfiller filler filler\n').repeat(900)
    const t0 = Date.now()
    expect(covered(text)).toHaveLength(900)
    expect(Date.now() - t0).toBeLessThan(1000)
  })
})
