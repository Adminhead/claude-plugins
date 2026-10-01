import { describe, test, expect } from 'claude-code/testing'
import { ConfigInvalid, loadConfig, parseOptions, parseProjectFile } from '../hooks/config.ts'
import { fakeIo } from './fakeio.ts'

// The errors of a bad config, as [path, message fragment] pairs.
function errorsOf(fn: () => unknown): string[] {
  try {
    fn()
  } catch (e) {
    if (e instanceof ConfigInvalid) return e.errors.map(x => `${x.path}: ${x.message}`)
    throw e
  }
  throw new Error('expected ConfigInvalid')
}

const FULL = {
  env: ['DATABASE_URL', 'STRIPE_KEY'],
  pass: ['pass://Work/stripe/api-key'],
  openredaction: {
    patterns: ['AWS_ACCESS_KEY', 'GITHUB_TOKEN'],
    categories: [],
    preset: null,
    whitelist: ['AKIAIOSFODNN7EXAMPLE'],
    customPatterns: [{ type: 'INTERNAL_TOKEN', regex: 'itk_[A-Za-z0-9]{32}' }],
  },
  envKeyRule: true,
}

describe('parseOptions', () => {
  test('defaults', () => {
    expect(parseOptions({})).toEqual({ envVars: [], projectFile: '.secret-stash.json' })
  })

  test('reads a list of names and a path', () => {
    expect(parseOptions({ envVars: ['A_B', 'c'], projectFile: 'conf/ss.json' })).toEqual({ envVars: ['A_B', 'c'], projectFile: 'conf/ss.json' })
  })

  test("unset fields arrive as '' and mean the defaults", () => {
    expect(parseOptions({ envVars: '', projectFile: '' })).toEqual({ envVars: [], projectFile: '.secret-stash.json' })
    expect(parseOptions({ envVars: '', projectFile: '.secret-stash.json' }).envVars).toEqual([])
  })

  test('entries are trimmed and blanks dropped', () => {
    expect(parseOptions({ envVars: [' A_SECRET ', '  ', '', 'B_TOKEN'] }).envVars).toEqual(['A_SECRET', 'B_TOKEN'])
    expect(parseOptions({ envVars: '  ' }).envVars).toEqual([])
    expect(parseOptions({ envVars: ' A_SECRET ' }).envVars).toEqual(['A_SECRET'])
  })

  test('a whitespace-only projectFile means the default', () => {
    expect(parseOptions({ projectFile: '   ' }).projectFile).toBe('.secret-stash.json')
    expect(parseOptions({ projectFile: ' conf/x.json ' }).projectFile).toBe('conf/x.json')
  })

  test('a single string is one name, not a list to split', () => {
    expect(parseOptions({ envVars: 'A_SECRET' }).envVars).toEqual(['A_SECRET'])
    expect(errorsOf(() => parseOptions({ envVars: 'A,B' }))).toEqual(['envVars[0]: not a valid environment variable name'])
  })

  test('wrong types and bad names are path-level errors', () => {
    expect(errorsOf(() => parseOptions({ envVars: 5, projectFile: 3 }))).toEqual([
      'envVars: expected a list of strings',
      'projectFile: expected a path',
    ])
    expect(errorsOf(() => parseOptions({ envVars: ['OK', '-x', 'a b'] }))).toEqual([
      'envVars[1]: not a valid environment variable name',
      'envVars[2]: not a valid environment variable name',
    ])
  })
})

describe('parseProjectFile', () => {
  test('parses the documented example', () => {
    const c = parseProjectFile(JSON.stringify(FULL))
    expect(c.env).toEqual(FULL.env)
    expect(c.pass).toEqual(FULL.pass)
    expect(c.openredaction.patterns).toEqual(['AWS_ACCESS_KEY', 'GITHUB_TOKEN'])
    expect(c.openredaction.customPatterns).toEqual(FULL.openredaction.customPatterns)
    expect(c.envKeyRule).toBe(true)
  })

  test('an empty object takes defaults, with patterns left unset', () => {
    expect(parseProjectFile('{}')).toEqual({
      env: [], pass: [], envKeyRule: true, skipRestore: [],
      openredaction: { categories: [], preset: null, whitelist: [], customPatterns: [] },
    })
  })

  test('unparseable JSON', () => {
    const secret = errorsOf(() => parseProjectFile('{ hunter2-hunter2'))[0]
    expect(secret).toContain('not valid JSON')
    expect(secret).not.toContain('hunter2')
    expect(errorsOf(() => parseProjectFile('[]'))).toEqual([': expected a JSON object'])
  })

  test('a bad regex, with its path', () => {
    const p = (regex: string) => JSON.stringify({ openredaction: { customPatterns: [{ type: 'X', regex }] } })
    expect(errorsOf(() => parseProjectFile(p('abc(unclosed')))[0]).toMatch(/^openredaction\.customPatterns\[0\]\.regex: invalid regex/)
    expect(errorsOf(() => parseProjectFile(p('abc(\\w{1,5}){2}')))[0]).toContain('nested quantifier')
    expect(errorsOf(() => parseProjectFile(p('abc[a-z]+')))[0]).toContain('use {1,512} instead of +')
    expect(errorsOf(() => parseProjectFile(p('a'.repeat(501))))[0]).toContain('over the 500 limit')
  })

  test('an unknown openredaction pattern, category or preset', () => {
    expect(errorsOf(() => parseProjectFile(JSON.stringify({ openredaction: { patterns: ['GITHUB_TOKEN', 'NOPE_TOKEN'] } })))).toEqual([
      'openredaction.patterns[1]: unknown openredaction pattern',
    ])
    expect(errorsOf(() => parseProjectFile(JSON.stringify({ openredaction: { categories: ['nonsense'] } })))).toEqual([
      'openredaction.categories[0]: unknown openredaction category',
    ])
    expect(errorsOf(() => parseProjectFile(JSON.stringify({ openredaction: { preset: 'nope' } })))[0]).toContain('openredaction.preset: unknown preset')
  })

  test('skipRestore: exact names, prefixes and optional fields', () => {
    const c = parseProjectFile(JSON.stringify({ skipRestore: [{ tool: 'WebFetch', fields: ['prompt'] }, { tool: 'mcp__acme_*' }] }))
    expect(c.skipRestore).toEqual([{ tool: 'WebFetch', fields: ['prompt'] }, { tool: 'mcp__acme_*' }])
  })

  test('skipRestore bad shapes', () => {
    const bad = (v: unknown) => errorsOf(() => parseProjectFile(JSON.stringify({ skipRestore: v })))
    expect(bad('x')).toEqual(['skipRestore: expected a list'])
    expect(bad(['x'])).toEqual(['skipRestore[0]: expected an object with tool and optional fields'])
    expect(bad([{}])).toEqual(['skipRestore[0].tool: expected a non-empty string'])
    expect(bad([{ tool: '' }])).toEqual(['skipRestore[0].tool: expected a non-empty string'])
    expect(bad([{ tool: 'a*b' }])).toEqual(['skipRestore[0].tool: * may only appear at the end, as in mcp__acme_*'])
    expect(bad([{ tool: '*a*' }])[0]).toContain('may only appear at the end')
    expect(bad([{ tool: 'A', fields: [] }])).toEqual(['skipRestore[0].fields: expected at least one field; omit fields to skip all'])
    expect(bad([{ tool: 'A', fields: ['ok', ''] }])).toEqual(['skipRestore[0].fields[1]: expected a non-empty string'])
    expect(bad([{ tool: 'A', fields: 'prompt' }])).toEqual(['skipRestore[0].fields: expected a list of strings'])
    expect(bad([{ tool: 'A', field: ['x'] }])[0]).toContain('unknown key')
  })

  test('pass refs need vault, item and field', () => {
    for (const ref of ['pass://vault/item', 'pass://vault/item/', 'pass://a/b/c/d', 'pass://']) {
      expect(errorsOf(() => parseProjectFile(JSON.stringify({ pass: [ref] })))).toHaveLength(1)
    }
  })

  test('the Anthropic pattern is a known name', () => {
    expect(parseProjectFile(JSON.stringify({ openredaction: { patterns: ['ANTHROPIC_API_KEY'] } })).openredaction.patterns).toEqual(['ANTHROPIC_API_KEY'])
  })

  test('wrong types', () => {
    const bad = {
      env: 'A', pass: ['nope'], envKeyRule: 'yes',
      openredaction: { whitelist: [1], customPatterns: [{ type: '', regex: 5 }, 'x'], preset: 3 },
    }
    expect(errorsOf(() => parseProjectFile(JSON.stringify(bad)))).toEqual([
      'openredaction.preset: expected a string or null',
      'openredaction.whitelist[0]: expected a string',
      'openredaction.customPatterns[0].type: expected a non-empty string',
      'openredaction.customPatterns[0].regex: expected a string',
      'openredaction.customPatterns[1]: expected an object with type and regex',
      'env: expected a list of strings',
      'pass[0]: expected pass://<vault>/<item>/<field>',
      'envKeyRule: expected a boolean',
    ])
  })

  test('unknown keys are errors, so a typo cannot silently disable protection, and are not echoed', () => {
    expect(errorsOf(() => parseProjectFile('{"envs":[],"openredaction":{"pattern":[]}}'))).toEqual([
      ': unknown key #1; allowed: env, pass, envKeyRule, skipRestore, openredaction',
      'openredaction: unknown key #1; allowed: patterns, categories, preset, whitelist, customPatterns',
    ])
  })
})

describe('loadConfig', () => {
  const opts = {}

  test('a missing project file is fine', async () => {
    const io = fakeIo()
    const c = await loadConfig(io, opts)
    expect(c.project.env).toEqual([])
    expect(c.projectFile).toBe('.secret-stash.json')
  })

  test('reads the file under the session root', async () => {
    const io = fakeIo(undefined, '/work/app/')
    io.files.set('/work/app/.secret-stash.json', JSON.stringify({ env: ['X_TOKEN'] }))
    expect((await loadConfig(io, opts)).project.env).toEqual(['X_TOKEN'])
  })

  test('honors a custom relative and an absolute path', async () => {
    const io = fakeIo(undefined, '/work/app')
    io.files.set('/work/app/conf/ss.json', '{"env":["A_B"]}')
    io.files.set('/etc/ss.json', '{"env":["C_D"]}')
    expect((await loadConfig(io, { projectFile: 'conf/ss.json' })).project.env).toEqual(['A_B'])
    expect((await loadConfig(io, { projectFile: '/etc/ss.json' })).project.env).toEqual(['C_D'])
  })

  test('an unparseable or invalid file throws ConfigInvalid naming the file', async () => {
    const io = fakeIo()
    io.files.set('/repo/.secret-stash.json', '{ broken')
    await expect(loadConfig(io, opts)).rejects.toBeInstanceOf(ConfigInvalid)
    io.files.set('/repo/.secret-stash.json', '{"envKeyRule": 1}')
    const err = await loadConfig(io, opts).catch(e => e)
    expect(err.errors).toEqual([{ path: '.secret-stash.json#envKeyRule', message: 'expected a boolean' }])
  })

  test('a missing file at a chosen path is an error, unlike the default', async () => {
    const io = fakeIo()
    const err = await loadConfig(io, { projectFile: 'conf/typo.json' }).catch(e => e)
    expect(err.errors).toEqual([{ path: 'projectFile', message: 'file not found: /repo/conf/typo.json' }])
  })

  test('bad options throw before the file is read', async () => {
    const io = fakeIo()
    await expect(loadConfig(io, { envVars: 7 as never })).rejects.toBeInstanceOf(ConfigInvalid)
  })

  test('an error other than a missing file propagates', async () => {
    const io = fakeIo()
    io.files.set('/repo/.secret-stash.json', '{}')
    io.read = async () => {
      throw new Error('EACCES')
    }
    await expect(loadConfig(io, opts)).rejects.toThrow('EACCES')
  })
})
