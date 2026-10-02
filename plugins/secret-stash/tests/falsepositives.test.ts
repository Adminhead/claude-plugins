import { describe, test, expect } from 'claude-code/testing'
import { detect } from '../hooks/detect.ts'
import { redactText } from '../hooks/redact.ts'
import { envRuleDetector } from '../hooks/detectors/envrule.ts'
import { openredactionDetector } from '../hooks/detectors/openredaction.ts'
import { ctx } from './helpers.ts'

const cfg = { categories: [], preset: null, whitelist: [], customPatterns: [] }
const detectors = () => [envRuleDetector(), openredactionDetector(cfg)]
const stashed = (text: string) => detect(text, detectors()).map(m => [m.category, text.slice(m.start, m.end)])

// Names, paths and ids seen redacted in real session output. Each is built from parts so the
// redaction hooks do not rewrite this file when it is read back.
const UUID = '5d77c749' + '-c32a-4ca2-82f1-' + '897a6bd63516'
const SAMPLES: [string, string, string][] = [
  ['pass-cli tool name', 'pass' + '-cli', 'pass' + '-cli:pass' + '-cli'],
  ['pass-cli in install output', 'pass' + '-cli', 'pass-cli: Installing plugin "pass-cli@adminhead"...\n- pass-cli:pass-cli\n  "pass-cli:pass-cli",'],
  ['session id in a path', UUID, `/tmp/claude-1000/-home-buck-Projects-adminhead-claude-plugins/${UUID}/scratchpad`],
  ['session id beside "auth" in a path', UUID, `/home/buck/.claude/projects/-home-buck-Projects-auth-service/${UUID}.jsonl`],
  ['emailAndPassword directory', 'email' + 'AndPassword', 'better-auth-skills/better-auth/emailAndPassword/SKILL.md\nbetter-auth:emailAndPassword\nauth: emailAndPassword'],
  ['k8s skill directory', 'k8s-manifest' + '-generator', 'skills/\nsecret\nk8s-manifest-generator\nk8s-security-policies\n'],
]

describe('false positives seen in session output', () => {
  for (const [name, value, surround] of SAMPLES) {
    test(`${name}: alone`, () => {
      expect(stashed(value)).toEqual([])
    })

    test(`${name}: in its surrounding text`, () => {
      expect(stashed(surround)).toEqual([])
    })

    test(`${name}: nothing reaches the vault, so nothing spreads`, async () => {
      const r = await redactText(`${surround}\nlater: ${value}`, ctx(detectors()))
      expect(r.found).toEqual([])
    })
  }
})

describe('real secrets in the same shapes are still caught', () => {
  test('key=value with a PASS key', () => {
    expect(stashed('PASS=hunter2-real-value')).toEqual([['ENV', 'hunter2-real-value']])
    expect(stashed('pass-cli=hunter2-real-value')).toEqual([['ENV', 'hunter2-real-value']])
  })

  test('colon form with a secret-shaped value', () => {
    expect(stashed('password: Tr0ub4dor&3xyz')).toContainEqual(['ENV', 'Tr0ub4dor&3xyz'])
    expect(stashed('emailAndPassword: Tr0ub4dor&3xyz')).toContainEqual(['ENV', 'Tr0ub4dor&3xyz'])
    expect(stashed('pass: ab12cd34ef56')).toEqual([['ENV', 'ab12cd34ef56']])
    expect(stashed('auth: ' + 'aB3dE6gH9jK2mN5pQ8sT1vW4yZ')).toEqual([['ENV', 'aB3dE6gH9jK2mN5pQ8sT1vW4yZ']])
  })

  test('a strong key keeps even a plain word', () => {
    expect(stashed('password: lowercasewordsonly')).toContainEqual(['ENV', 'lowercasewordsonly'])
  })

  test('a quoted value is stashed whatever it looks like', () => {
    expect(stashed('"emailAndPassword": "plainwordvalue"')).toEqual([['ENV', 'plainwordvalue']])
  })

  test('a UUID beside a Heroku or API key word', () => {
    const heroku = (t: string) => detect(t, [openredactionDetector(cfg)]).map(m => [m.category, t.slice(m.start, m.end)])
    expect(heroku(`HEROKU_API_KEY=${UUID}`)).toEqual([['HEROKU_API_KEY', UUID]])
    expect(heroku(`heroku token ${UUID}`)).toEqual([['HEROKU_API_KEY', UUID]])
    expect(heroku(`the api key is ${UUID}`)).toEqual([['HEROKU_API_KEY', UUID]])
    expect(stashed(`HEROKU_API_KEY=${UUID}`)).toEqual([['ENV', UUID]])
  })

  test('a token after "secret" in prose that has random-looking segments', () => {
    expect(stashed('secret a3f9-kd92-x7q1')).toContainEqual(['GENERIC_SECRET', 'a3f9-kd92-x7q1'])
  })
})

describe('review round: real secrets the first fix let through', () => {
  const B64 = 'cGFzc3dvcmQx' + 'MjM0NTY='
  const heroku = (t: string) => detect(t, [openredactionDetector(cfg)]).map(m => [m.category, t.slice(m.start, m.end)])
  const values = (t: string) => stashed(t).map(x => x[1])
  const HYPH = 'horse-battery7' + '-staple'
  const TOK = 'ab1c-defg' + '-hijk-lmno'
  const U2 = '5d77c749' + '-abcd-4ca2-face-' + '897a6bd63516'

  test('a digit-bearing segment over 3 characters is not a slug', () => {
    expect(values(`mysql --password ${HYPH}`)).toContain(HYPH)
    expect(values(`password ${HYPH}`)).toContain(HYPH)
    expect(values(`secret ${TOK}`)).toContain(TOK)
    expect(values(`token: ${TOK}`)).toEqual([TOK])
    expect(values(`Authorization: Bearer ${U2}`)).toContain(U2)
    expect(values(`access_token: ${U2}`)).toContain(U2)
    expect(values('k8s-manifest' + '-generator')).toEqual([])
  })

  test('a key ending in PASS or CREDENTIAL(S) keeps plain words', () => {
    expect(values('pass: Sunshinedays')).toEqual(['Sunshinedays'])
    expect(values('mail:\n  pass: letmeinplease')).toEqual(['letmeinplease'])
    expect(values('credentials: Sunshinedays')).toEqual(['Sunshinedays'])
    expect(values('smtp_pass: abcdefghijklmnop')).toEqual(['abcdefghijklmnop'])
    expect(values('db_pass: correct-horse-battery-staple')).toEqual(['correct-horse-battery-staple'])
    expect(values('mail.pass: Sunshinedays')).toEqual(['Sunshinedays'])
    expect(values('aws_credentials: Sunshinedays')).toEqual(['Sunshinedays'])
    expect(values('pass' + '-cli:pass' + '-cli')).toEqual([])
  })

  test('accepted gap: plain words under non-strong colon keys, but not = or quoted', () => {
    expect(values('token: correct-horse-battery-staple')).toEqual([])
    expect(values('auth_token: abcd-efgh-ijkl-mnop')).toEqual([])
    expect(values('token=correct-horse-battery-staple')).toEqual(['correct-horse-battery-staple'])
    expect(values('token: "correct-horse-battery-staple"')).toEqual(['correct-horse-battery-staple'])
  })

  test('Heroku pattern accepts an auth key word directly before the value', () => {
    expect(heroku(`curl -H "X-Auth-Token: ${UUID}" https://x`)).toEqual([['HEROKU_API_KEY', UUID]])
    expect(heroku(`Authorization: ${UUID}`)).toEqual([['HEROKU_API_KEY', UUID]])
    expect(heroku(`mycli login --auth-token ${UUID}`)).toEqual([['HEROKU_API_KEY', UUID]])
    expect(heroku(`/home/buck/.claude/projects/-home-buck-Projects-auth-service/${UUID}.jsonl`)).toEqual([])
  })

  test('a base64 value ending in = is stashed in full after a colon key', () => {
    expect(values(`token: ${B64}`)).toEqual([B64])
    expect(values(`api_key: ${B64}`)).toEqual([B64])
    expect(values(`data:\n  token: ${B64}`)).toEqual([B64])
  })
})

describe('review round 2', () => {
  const heroku = (t: string) => detect(t, [openredactionDetector(cfg)]).map(m => [m.category, t.slice(m.start, m.end)])
  const values = (t: string) => stashed(t).map(x => x[1])
  const B64 = 'cGFzc3dvcmQx' + 'MjM0NTY='

  test('Heroku auth rule takes a scheme word and skips author', () => {
    for (const scheme of ['Token', 'token', 'Basic']) {
      expect(heroku(`Authorization: ${scheme} ${UUID}`)).toEqual([['HEROKU_API_KEY', UUID]])
    }
    expect(heroku(`"author_id": "${UUID}"`)).toEqual([])
    expect(heroku(`author: ${UUID}`)).toEqual([])
    expect(heroku(`/home/buck/Projects/auth-service/${UUID}.jsonl`)).toEqual([])
    expect(heroku(`my auth token: ${UUID}`)).toEqual([])
  })

  test('a PASS or CREDENTIAL tail skips prose but keeps a plain word', () => {
    expect(values('Pass: 12, Fail: 0, Skip: 3')).toEqual([])
    expect(values('Credentials: stored in 1Password')).toEqual([])
    expect(values('pass: Sunshinedays')).toEqual(['Sunshinedays'])
    expect(values('mail:\n  pass: letmeinplease')).toEqual(['letmeinplease'])
    expect(values('credentials: Sunshinedays')).toEqual(['Sunshinedays'])
    expect(values('smtp_pass: abcdefghijklmnop')).toEqual(['abcdefghijklmnop'])
  })

  test('a short slug segment needs a letter', () => {
    expect(values('mysql --password correct-horse-7' + '-staple')).toContain('correct-horse-7-staple')
    expect(values('token: correct-horse-7' + '-staple')).toEqual(['correct-horse-7-staple'])
    for (const name of ['k8s-manifest' + '-generator', 'ec2-instance' + '-profile', 's3-bucket' + '-policy']) {
      expect(values(name)).toEqual([])
      expect(values(`secret ${name}`)).toEqual([])
    }
  })

  test('a bare name: is a grep prefix only with no space after the colon', () => {
    expect(values('Makefile:API_KEY=abc123def456')).toEqual(['abc123def456'])
    expect(values('README:TOKEN=abc123def456')).toEqual(['abc123def456'])
    expect(values('k8s:token: abc123def456')).toEqual(['abc123def456'])
    // accepted gap: a space after the colon reads as YAML, so the name is the key
    expect(values('Procfile:  token: abc123def456')).toEqual([])
    expect(values('api.key: v' + 'alue12345=')).toEqual(['value12345='])
    expect(values(`mail.pass: ${B64}`)).toEqual([B64])
    expect(values('app.token: abc=' + '123xyz789')).toEqual(['abc=123xyz789'])
  })
})
