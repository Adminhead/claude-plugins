import { describe, test, expect } from 'claude-code/testing'
import { detect } from '../hooks/detect.ts'
import { redactText } from '../hooks/redact.ts'
import { envRuleDetector } from '../hooks/detectors/envrule.ts'
import { ctx } from './helpers.ts'
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

describe('openredaction adapter: prose is not a secret', () => {
  // Words seen stashed in a live session: the value after "secret" or "password" in prose.
  const PROSE = [
    'Not for other password managers.',
    'See the secret [references](references/secret-references.md) page.',
    'Use the secret management docs.',
    'Fail safe on any secret mechanism.',
    'a secret settings page',
    'password protection is on',
    'secret z.string().min(8)',
    'password writer.encrypt works',
  ]
  for (const text of PROSE) {
    test(`no match in: ${text}`, () => {
      expect(slice(text)).toEqual([])
    })
  }

  test('keyword patterns that take 20+ characters skip prose too', () => {
    expect(slice('the api key authentication-flow-handbook is here')).toEqual([])
    expect(slice('access token verification_and_rotation_policy')).toEqual([])
    expect(slice('Bearer authentication-schemes-overview')).toEqual([])
    expect(slice('client secret management-and-rotation-guide')).toEqual([])
  })

  test('a prose word is never stashed, so the vault cannot spread it', async () => {
    const text = 'Not for other password managers. Use secret management for managers.'
    const r = await redactText(text, ctx([openredactionDetector(cfg())]))
    expect(r.found).toEqual([])
    expect(r.text).toBe(text)
  })

  test('a vault that already holds the word still redacts it everywhere, by design', async () => {
    const { literalDetector } = await import('../hooks/detect.ts')
    const d = literalDetector([{ value: 'managers', category: 'GENERIC_SECRET' }])
    const r = await redactText('password managers and backmanagers', ctx([d]))
    expect(r.found.map(f => f.value)).toEqual(['managers'])
  })

  test('an assignment keeps the library match, whatever the value looks like', () => {
    expect(slice('mysql -u root --password=hyphenated-passphrase db')).toEqual([['GENERIC_SECRET', 'hyphenated-passphrase']])
    expect(slice('password=lowercasewordsonly')).toEqual([['GENERIC_SECRET', 'lowercasewordsonly']])
    expect(slice('password=build.thing()x')).toEqual([['GENERIC_SECRET', 'build.thing()x']])
  })

  test('a word after "secret:" or "password:" in an error message or table is not stashed', () => {
    expect(slice('failed to load secret: credentials denied')).toEqual([])
    expect(slice('Invalid password: must be 8 characters')).toEqual([])
    expect(slice('| password: description | yes |')).toEqual([])
  })

  test('key: value lines the prose check skips are still stashed by the key rule', () => {
    const full = (t: string) => detect(t, [envRuleDetector(), openredactionDetector(cfg())]).map(m => t.slice(m.start, m.end))
    expect(full('password: hyphenated passphrase>')).toEqual(['hyphenated passphrase>'])
    expect(full('password: lowercasewordsonly>')).toEqual(['lowercasewordsonly>'])
    expect(full('secret: lowercasewordsonly')).toEqual(['lowercasewordsonly'])
  })

  test('a prose word with a digit or symbol is still stashed (accepted)', () => {
    expect(slice('the password utf8mb4_bin collation')).toEqual([['GENERIC_SECRET', 'utf8mb4_bin']])
  })

  test('real generic secrets are still caught', () => {
    expect(slice('password: Tr0ub4dor&3xyz')).toEqual([['GENERIC_SECRET', 'Tr0ub4dor&3xyz']])
    expect(slice('secret hunter2hunter2')).toEqual([['GENERIC_SECRET', 'hunter2hunter2']])
    expect(slice('password = correct-horse-9battery')).toEqual([['GENERIC_SECRET', 'correct-horse-9battery']])
    const token = 'aB3dE6gH9jK2mN5pQ8sT1vW4yZ'
    expect(slice(`api_key: ${token}`)).toEqual([['GENERIC_API_KEY', token]])
    expect(slice(`Bearer ${token}`)).toEqual([['BEARER_TOKEN', token]])
    const letters = 'aBcDeFgHiJkLmNoPqRsTuV'
    expect(slice(`Bearer ${letters}`)).toEqual([['BEARER_TOKEN', letters]])
  })
})

describe('openredaction adapter: AWS secret key needs context and shape', () => {
  const KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'

  test('a path of 40 characters is not a key, with or without a nearby key word', () => {
    expect(KEY).toHaveLength(40)
    const path = '/home/buck/.claude/skills/chezmoi/references/secrets-encryption.md'
    expect(slice(`${path}\nsecrets are age-encrypted`)).toEqual([])
    expect(slice(`secret store at claude/skills/chezmoi/references/secrets`)).toEqual([])
  })

  test('a 40-character run with no key word near it is not a key', () => {
    expect(slice(`checksum ${KEY} done`)).toEqual([])
  })

  test('a path run is not a key even with key words around it', () => {
    const path = 'claude/skills/chezmoi/references/secrets'
    expect(slice(`${path}\nthe secret store and aws access key notes`)).toEqual([])
  })

  test('a git SHA-1, a package-lock integrity hash and a path cut from a longer run are not keys', () => {
    const sha = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
    expect(slice(`commit ${sha}\nAuthor: Buck\n\n    feat(secret-stash): redact secrets`)).toEqual([])
    const sri = 'sha512-' + 'Ab3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0hJ3kL6' + 'Ab3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0hJ3kL6' + 'Ab3dE6gH9jK2mN5p+/=='
    expect(slice(`"node_modules/@aws-sdk/client-s3": {\n  "integrity": "${sri}"`)).toEqual([])
    expect(slice('secrets live in /Users/Buck/Library/Application/Support/ClaudeCode/Plugins/Cache/x')).toEqual([])
    expect(slice(`aws ${KEY}Z`)).toEqual([])
    expect(slice(`aws Z${KEY}`)).toEqual([])
  })

  test('a key with two character classes is caught', () => {
    const noDigit = KEY.replace(/[0-9]/g, 'q')
    expect(slice(`aws_secret_access_key = ${noDigit}`)).toContainEqual(['AWS_SECRET_KEY', noDigit])
  })

  test('the key word may be on another line or after the value', () => {
    const akid = 'AKIAIOSFODNN7EXAMPLE'
    const forms = [
      `Access key ID,Secret access key\n${akid},${KEY}\n`,
      `User name,Password,Access key ID,Secret access key,Console login link\nbob,,${akid},${KEY},https://x.signin.aws.amazon.com/console\n`,
      `aws_secret_access_key:\n  ${KEY}`,
      `[default]\naws_secret_access_key =\n    ${KEY}`,
      `${KEY}  # aws secret key for prod`,
    ]
    for (const t of forms) expect(slice(t)).toContainEqual(['AWS_SECRET_KEY', KEY])
  })

  test('a key named on the same line is caught, in assignment, JSON and bare forms', () => {
    expect(slice(`aws_secret_access_key = ${KEY}`).map(x => x[0])).toContain('AWS_SECRET_KEY')
    expect(slice(`{"SecretAccessKey": "${KEY}"}`).map(x => x[0])).toContain('AWS_SECRET_KEY')
    expect(slice(`AWS secret ${KEY}`).map(x => x[0])).toContain('AWS_SECRET_KEY')
    expect(slice(`aws_secret_access_key = ${KEY}`)).toContainEqual(['AWS_SECRET_KEY', KEY])
    expect(slice(`aws_secret_access_key=${KEY}`)).toContainEqual(['AWS_SECRET_KEY', KEY])
  })
})

