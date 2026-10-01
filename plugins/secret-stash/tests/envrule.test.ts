import { describe, test, expect } from 'claude-code/testing'
import { envRuleDetector } from '../hooks/detectors/envrule.ts'
import { detect } from '../hooks/detect.ts'
import { redactText } from '../hooks/redact.ts'
import { restoreText } from '../hooks/restore.ts'
import { ctx as redactCtx } from './helpers.ts'

const stashed = (text: string) => detect(text, [envRuleDetector()]).map(m => [m.category, text.slice(m.start, m.end)])

describe('env rule: key coverage and YAML', () => {
  test('run-together, plural and alternate spellings', () => {
    for (const k of ['APIKEY', 'apikey', 'DB_PASSWD', 'MYSQLPWD', 'SSH_PASSPHRASE', 'CLIENT_SECRETS']) {
      expect(stashed(`${k}=value-12345678`)).toEqual([['ENV', 'value-12345678']])
    }
    expect(stashed('apikey: value-12345678')).toEqual([['ENV', 'value-12345678']])
  })

  test('docker-compose list form', () => {
    expect(stashed('environment:\n  - POSTGRES_PASSWORD=compose-pw-12345\n  - TZ=UTC')).toEqual([['ENV', 'compose-pw-12345']])
  })

  test('a block scalar takes its indented body', () => {
    const text = 'private_key: |\n  -----BEGIN KEY-----\n  abcdef\n\n  -----END KEY-----\nnext: 1'
    expect(stashed(text)).toEqual([['ENV', '-----BEGIN KEY-----'], ['ENV', '-----END KEY-----']])
    expect(stashed('  secret: >-\n    folded-one\n    folded-two\n  other: x')).toEqual([['ENV', 'folded-one'], ['ENV', 'folded-two']])
    expect(stashed('secret: |\nnext: 1')).toEqual([])
  })

  test('code expressions and references are not stashed, quoted literals are', () => {
    expect(stashed('token = os.environ.get("TOKEN_X")')).toEqual([])
    expect(stashed('apiKey: process.env.API_KEY,')).toEqual([])
    expect(stashed('DB_PASSWORD=${DB_PASSWORD}')).toEqual([])
    expect(stashed('DB_PASSWORD=$OTHER_VAR')).toEqual([])
    expect(stashed('apiKey: "literal-value-12"')).toEqual([['ENV', 'literal-value-12']])
    expect(stashed('DB_PASSWORD=pa(ss)word-123')).toEqual([['ENV', 'pa(ss)word-123']])
  })
})

describe('env rule: other forms', () => {
  test('JSON, with escaped quotes in the value', () => {
    expect(stashed('{\n  "apiKey": "abc123def456",\n  "port": 3000\n}')).toEqual([['ENV', 'abc123def456']])
    expect(stashed('{"client_secret":"ab\\"cd-efghij","x":1}')).toEqual([['ENV', 'ab\\"cd-efghij']])
  })

  test('YAML, plain and quoted', () => {
    expect(stashed('db:\n  password: hunter2-hunter2\n  user: app')).toEqual([['ENV', 'hunter2-hunter2']])
    expect(stashed('client-secret: "quoted yaml value"')).toEqual([['ENV', 'quoted yaml value']])
  })

  test('quoted assignments in code', () => {
    expect(stashed("const apiToken = 'tok-abcdef123456'")).toEqual([['ENV', 'tok-abcdef123456']])
    expect(stashed('x = {auth_key="abcdefgh1234", n=1}')).toEqual([['ENV', 'abcdefgh1234']])
    expect(stashed('headers: { privateKey: "pk-abcdef123456" }')).toEqual([['ENV', 'pk-abcdef123456']])
  })

  test('key parts split on _ - . and camelCase, not on substrings', () => {
    for (const k of ['apiKey', 'client_secret', 'db.password', 'githubToken', 'AWS_SECRET_ACCESS_KEY', 'DBPASSWORD', 'sshPrivateKey']) {
      expect(stashed(`${k}: "value-12345678"`)).toEqual([['ENV', 'value-12345678']])
    }
  })

  test('negatives', () => {
    expect(stashed('"keyboard": "layout-qwerty-1"')).toEqual([])
    expect(stashed('PORT: 3000')).toEqual([])
    expect(stashed('author: "someone-long-name"')).toEqual([])
    expect(stashed('if (token == "abcdefgh1234") {}')).toEqual([])
  })

  test('the same value is reported once', () => {
    expect(stashed('API_KEY="abcdefgh1234"')).toHaveLength(1)
  })
})

describe('env rule', () => {
  test('stashes only the value, never the key', () => {
    expect(stashed('API_TOKEN=abc12345xyz')).toEqual([['ENV', 'abc12345xyz']])
  })

  for (const key of ['MY_SECRET', 'GH_TOKEN', 'API_KEY', 'DB_PASSWORD', 'ROOT_PASS', 'SVC_PWD', 'AWS_CREDENTIAL', 'BASIC_AUTH', 'PRIVATE_THING', 'SENTRY_DSN']) {
    test(`${key} is sensitive`, () => {
      expect(stashed(`${key}=value-12345`)).toEqual([['ENV', 'value-12345']])
    })
  }

  test('key matching is case-insensitive', () => {
    expect(stashed('db_password=hunter22-long')).toEqual([['ENV', 'hunter22-long']])
  })

  test('a non-sensitive key is left alone', () => {
    expect(stashed('NODE_ENV=production-build\nLOG_LEVEL=debug-verbose')).toEqual([])
  })

  test('export, spaces and quotes', () => {
    expect(stashed('export API_KEY = "quoted value 1"')).toEqual([['ENV', 'quoted value 1']])
    expect(stashed("  export  DB_PASSWORD='single-quoted-1' # note")).toEqual([['ENV', 'single-quoted-1']])
    expect(stashed('API_KEY=plain-value-1   # trailing comment')).toEqual([['ENV', 'plain-value-1']])
  })

  test('an unquoted value takes the rest of the line, so nothing after a space leaks', () => {
    expect(stashed('DB_PASSWORD=hunter two words')).toEqual([['ENV', 'hunter two words']])
  })

  test('a # inside a value without a leading space stays part of it', () => {
    expect(stashed('API_KEY=abc#def12345')).toEqual([['ENV', 'abc#def12345']])
  })

  test('works per line in a larger file', () => {
    const text = 'A=1\nAPI_KEY=first-secret-1\nPORT=8080\nDB_PASSWORD=second-secret-2\n'
    expect(stashed(text)).toEqual([['ENV', 'first-secret-1'], ['ENV', 'second-secret-2']])
  })

  test('*_URL with userinfo stashes the whole URL', () => {
    expect(stashed('DATABASE_URL=postgres://app:pw1@db.internal:5432/app')).toEqual([['ENV', 'postgres://app:pw1@db.internal:5432/app']])
    expect(stashed('REPO_URL=https://ghp_token123456@github.com/o/r.git')).toEqual([['ENV', 'https://ghp_token123456@github.com/o/r.git']])
  })

  test('*_URL without userinfo is left alone', () => {
    expect(stashed('HOMEPAGE_URL=https://example.com/path?a=b@c')).toEqual([])
    expect(stashed('DATABASE_URL=postgres://db.internal:5432/app')).toEqual([])
  })

  test('an empty value yields no match', () => {
    expect(stashed('API_KEY=')).toEqual([])
    expect(stashed('API_KEY=\n')).toEqual([])
    expect(stashed('API_KEY=""')).toEqual([])
  })

  test('an unclosed quote stashes the rest of the line', () => {
    expect(stashed('API_KEY="unclosed-secret-value\nNODE_ENV=x')).toEqual([['ENV', 'unclosed-secret-value']])
    expect(stashed("API_KEY='unclosed-secret-value")).toEqual([['ENV', 'unclosed-secret-value']])
  })

  test('an escaped quote does not end a double-quoted value', () => {
    expect(stashed('API_KEY="abc\\"defghijklmnop" # c')).toEqual([['ENV', 'abc\\"defghijklmnop']])
  })

  test('a double-quoted value may span lines', () => {
    expect(stashed('SECRET="line-one\nline-two"\nNODE_ENV=x')).toEqual([['ENV', 'line-one\nline-two']])
  })

  test('a long line of spaces scans in linear time', () => {
    const text = ' '.repeat(60_000) + 'x\n' + 'A'.repeat(60_000)
    const t0 = Date.now()
    stashed(text)
    expect(Date.now() - t0).toBeLessThan(500)
  })
})

describe('env rule: tool output prefixes', () => {
  const lines = ['DB_PASSWORD=CNRYjXq92pLm', '"apiKey": "CNRYjXq92pLm",', 'client_secret: CNRYjXq92pLm', 'db_password: "CNRYjXq92pLm"']
  const prefixes: [string, string][] = [
    ['Read tab', '2\t'], ['Read arrow', '12→'], ['cat -n', '     3  '], ['grep -n', 'src/app/.env:14:'],
    ['grep context', 'src/app/.env-15-'], ['grep without -n', 'config/prod.yml:'], ['diff add', '+'], ['diff remove', '-'], ['diff add indented', '+  '],
  ]
  for (const [name, prefix] of prefixes) {
    test(`${name} prefix`, () => {
      for (const l of lines) expect(stashed(`${prefix}${l}`)).toEqual([['ENV', 'CNRYjXq92pLm']])
    })
  }

  test('a prefix on a whole file view', () => {
    const view = '1\tPORT=8080\n2\tDB_PASSWORD=CNRYjXq92pLm\n3\tLOG=debug'
    expect(stashed(view)).toEqual([['ENV', 'CNRYjXq92pLm']])
  })

  test('a long prefix-like run scans in linear time', () => {
    const t0 = Date.now()
    stashed(('a-1' + '-'.repeat(300) + '\n').repeat(300) + 'x'.repeat(60_000))
    expect(Date.now() - t0).toBeLessThan(500)
  })
})

describe('env rule: prose values', () => {
  test('colon-form values with spaces are not stashed', () => {
    expect(stashed('efficient-auth: Application-side authentication and server-side authorization')).toEqual([])
    expect(stashed('pass-cli: Use the Proton Pass CLI without exposing secrets')).toEqual([])
  })

  test('a single-token colon value, quoted values and KEY=value still are', () => {
    expect(stashed('db_password: hunter2hunter2')).toEqual([['ENV', 'hunter2hunter2']])
    expect(stashed('db_password: "two words here"')).toEqual([['ENV', 'two words here']])
    expect(stashed('DB_PASSWORD=two words here')).toEqual([['ENV', 'two words here']])
  })
})

describe('env rule: prefix indentation, block scalars under prefixes, $ values, strong keys', () => {
  test('indentation after a tool prefix', () => {
    for (const l of ['    12→  password: yaml-pass-12345', 'cfg/app.yml:12:  password: yaml-pass-12345', 'cfg/app.yml-12-  password: yaml-pass-12345', '7\t    password: yaml-pass-12345']) {
      expect(stashed(l)).toEqual([['ENV', 'yaml-pass-12345']])
    }
  })

  test('a block scalar under a Read-style prefix', () => {
    const view = '     5→private_key: |\n     6→  MIIEvQabcdef\n     7→  ghijklmnop\n     8→next: 1'
    expect(stashed(view)).toEqual([['ENV', 'MIIEvQabcdef'], ['ENV', 'ghijklmnop']])
    const grep = 'a.yml:5:private_key: |\na.yml:6:  MIIEvQabcdef\na.yml:7:other: 1'
    expect(stashed(grep)).toEqual([['ENV', 'MIIEvQabcdef']])
  })

  test('a $ value is skipped only when it is a whole variable reference', () => {
    expect(stashed('PASSWORD=$ecretP4ss!xyz')).toEqual([['ENV', '$ecretP4ss!xyz']])
    expect(stashed('db_password: $3cretValue99')).toEqual([['ENV', '$3cretValue99']])
    expect(stashed('PASSWORD=${DB_PASSWORD}')).toEqual([])
    expect(stashed('PASSWORD=$DB_PASSWORD')).toEqual([])
  })

  test('strong keys are never dismissed as prose', () => {
    for (const k of ['password', 'db_passwd', 'ssh_passphrase', 'client_secret', 'mysql_pwd', 'private_key']) {
      expect(stashed(`${k}: correct horse battery staple`)).toEqual([['ENV', 'correct horse battery staple']])
    }
    expect(stashed('efficient-auth: Application-side authentication and server-side authorization')).toEqual([])
  })

  test('indentation after a long prefix-like run stays linear', () => {
    const t0 = Date.now()
    stashed('1' + ' '.repeat(60_000) + 'x')
    stashed(('a-1' + '-'.repeat(300) + '\n').repeat(300))
    expect(Date.now() - t0).toBeLessThan(500)
  })
})

describe('env rule: block scalar values redact the same with or without a tool prefix', () => {
  const body = ['MIIEvQIBADANBgkqhkiG9w0BAQEFAASC', 'KcwggSjAgEAAoIBAQC7VJTUt9Us8cKj', 'Lm9pQrStUvWx']
  const plain = `private_key: |\n${body.map(l => '  ' + l).join('\n')}\nnext: 1`
  const read = plain.split('\n').map((l, i) => `${String(i + 1).padStart(6)}→${l}`).join('\n')

  for (const [name, view] of [['unprefixed', plain], ['Read-prefixed', read]] as const) {
    test(`${name} view: every line is redacted and restores clean`, async () => {
      const found = new Map<string, string>()
      const ds = [envRuleDetector()]
      const r = await redactText(view, redactCtx(ds))
      for (const f of r.found) found.set(f.id, f.value)
      expect([...found.values()]).toEqual(body)
      for (const l of body) expect(r.text).not.toContain(l)
      const restored = restoreText(r.text, id => found.get(id))
      expect(restored).toBe(view)
      for (const v of found.values()) expect(v).not.toMatch(/→|\n/)
    })
  }

  test('both views give the same IDs', async () => {
    const a = await redactText(plain, redactCtx([envRuleDetector()]))
    const b = await redactText(read, redactCtx([envRuleDetector()]))
    expect(b.found.map(f => f.id)).toEqual(a.found.map(f => f.id))
  })
})
