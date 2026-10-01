import { describe, test, expect } from 'claude-code/testing'
import { detect } from '../hooks/detect.ts'
import { DEFAULT_PATTERNS, knownPatternNames, openredactionDetector } from '../hooks/detectors/openredaction.ts'

const cfg = (over = {}) => ({ categories: [], preset: null, whitelist: [], customPatterns: [], ...over })
const run = (text: string, over = {}) => detect(text, [openredactionDetector(cfg(over))])
const slice = (text: string, over = {}) => run(text, over).map(m => [m.category, text.slice(m.start, m.end)])

const PEM = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAu1SU1LfVLPHCozMxH2Mo4lgOEePzNm0tRgeLezV6ffAt0gun
VTLw7onLRnrq0/IzW7yWR7QjrlBfLGNbSZEW8MZFpQd0WqW6gXo5s5DRWJHl4wbr
-----END RSA PRIVATE KEY-----`

const SAMPLES: [string, string, string][] = [
  ['AWS_ACCESS_KEY', 'aws_access_key_id = ', 'AKIAJ5K2L9M3N7P4Q8R6'],
  ['GITHUB_TOKEN', 'token: ', 'ghp_' + 'aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0hJ3kL6'],
  ['JWT_TOKEN', 'Authorization: ', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'],
  ['PRIVATE_KEY', 'key:\n', PEM],
  ['ANTHROPIC_API_KEY', 'export ANTHROPIC=', 'sk-ant-api03-' + 'Xy7Qp2Lm9Vb4Nc8Rt1Wk5Zd3Fg6Hj0As-Uv_E2Ow'],
]

describe('openredaction adapter', () => {
  test('every default pattern name exists in the bundle', () => {
    const known = knownPatternNames()
    expect(DEFAULT_PATTERNS.filter(n => !known.has(n))).toEqual([])
  })

  for (const [name, prefix, secret] of SAMPLES) {
    test(`detects ${name} sample whole`, () => {
      const text = `before\n${prefix}${secret}\nafter`
      expect(slice(text)).toEqual([[name, secret]])
    })
  }

  test('reports the openredaction type as the category', () => {
    const [cat] = slice('x ghp_aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0hJ3kL6 y')[0]
    expect(cat).toBe('GITHUB_TOKEN')
  })

  test('an explicit patterns list replaces the default credential list', () => {
    const text = 'ghp_aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0hJ3kL6 sk-ant-api03-Xy7Qp2Lm9Vb4Nc8Rt1Wk5Zd3Fg6Hj0As-Uv_E2Ow'
    expect(slice(text, { patterns: ['ANTHROPIC_API_KEY'] }).map(x => x[0])).toEqual(['ANTHROPIC_API_KEY'])
  })

  test('whitelist skips an exact value only', () => {
    const a = 'AKIAJ5K2L9M3N7P4Q8R6'
    const b = 'AKIAJ5K2L9M3N7P4Q8R7'
    const text = `${a} ${b}`
    expect(slice(text, { whitelist: [a] }).map(x => x[1])).toEqual([b])
    expect(slice(text, { whitelist: ['AKIAJ5K2L9M3'] })).toHaveLength(2)
  })

  test('categories add to the credential list', () => {
    const text = 'ghp_aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0hJ3kL6 4111111111111111'
    expect(slice(text).map(x => x[0])).toEqual(['GITHUB_TOKEN'])
    expect(slice(text, { categories: ['financial'] }).map(x => x[0])).toContain('GITHUB_TOKEN')
  })

  test('scans 200 KB in under a second', () => {
    const filler = 'const total = items.map(i => i.price * i.qty).reduce((a, b) => a + b, 0) // sum\n'
    let text = filler.repeat(Math.ceil(200_000 / filler.length))
    text = text.slice(0, 100_000) + SAMPLES[1][2] + '\n' + text.slice(100_000)
    const d = openredactionDetector(cfg())
    const t0 = Date.now()
    const m = detect(text, [d])
    expect(Date.now() - t0).toBeLessThan(1000)
    expect(m).toHaveLength(1)
  })
})
