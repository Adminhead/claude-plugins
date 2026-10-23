import { describe, expect, test } from 'claude-code/testing'
import {
  answerServerRequest, checkAccount, checkClientRequest, checkDaemonLink, checkCwd, checkLockdown, checkProbeRequest, checkProjectLayers, checkProvider,
  checkReadOnly, checkServerRequired, checkSocketPath, checkSocketStat, checkThreadLocks, checkVersion, classifyTurnError, clientErrorText, effectivePolicy,
  finalReply, fitLine, initializeParams, LOCK_CLASSES, LOCKED_FEATURES, MAX_FEATURE_PAGES, MAX_LINE_BYTES, Matcher, mcpServerNames, mergeServerLocks, MIN_CODEX,
  newTurnState, O_VERIFIED_ON, observedModel, originOf, parseClientResult, parseServerVersion, projectLayers, reduce, requestThreadId, resolveSocket,
  reviewStartParams, TESTED_CODEX, threadStartParams, timeoutMessage, turnOutcome, turnStartParams, utf8Bytes, versionAtLeast, type ClientOk, type Fail,
  type LockPolicy, type Msg, type ServerLocks,
} from '../hooks/consult/appserver'
import { MAX_REPLY, MAX_TIMEOUT_SEC } from '../hooks/consult/consult'

const UID = 1000
const SOCK = 0o140600
const DIR = 0o040700
const LINK = 0o120777
const FILE = 0o100600
const REPO = '/home/u/repo'
const T = 'thr-ours'
const OTHER = 'thr-other'

// config/read {} from the probed unit (revision 2 transport probes).
const LOCKED = {
  web_search: 'disabled',
  sandbox_mode: 'read-only',
  approval_policy: 'never',
  approvals_reviewer: 'user',
  model_provider: null,
  tools: null,
  features: Object.fromEntries(LOCKED_FEATURES.map(f => [f, false])),
  mcp_servers: { a: {}, b: {} },
}
const START = { sandbox: { type: 'readOnly', networkAccess: false }, approvalPolicy: 'never', approvalsReviewer: 'user', cwd: REPO, modelProvider: 'openai', model: 'gpt-6-sol', reasoningEffort: 'high' }

describe('moved constants', () => {
  test('consult.ts re-exports them from appserver.ts', () => {
    expect(MAX_REPLY).toBe(60_000)
    expect(MAX_TIMEOUT_SEC).toBe(540)
  })
})

describe('socket', () => {
  test('checkSocketPath refuses relative, control, ws+unix-breaking, long and .. paths', () => {
    for (const bad of ['run/x.sock', 'a\nb', '/a\nb', '/run/user/1000/x?y.sock', '/tmp/a b.sock', '/tmp/a#b.sock', '/' + 'x'.repeat(100), '/run/user/1000/../x.sock', '', 3]) {
      expect(checkSocketPath(bad)?.kind, String(bad)).toBe('input')
    }
    expect(checkSocketPath('/' + 'x'.repeat(99))).toBeNull()
    expect(checkSocketPath('/run/user/1000/codex-consult.sock')).toBeNull()
  })

  test('resolveSocket prefers the option, falls back to XDG_RUNTIME_DIR, else no-server', () => {
    expect(resolveSocket('/tmp/s/c.sock', '/run/user/1000')).toEqual({ socket: '/tmp/s/c.sock' })
    expect(resolveSocket('', '/run/user/1000/')).toEqual({ socket: '/run/user/1000/codex-consult.sock' })
    expect(resolveSocket(undefined, '/run/user/1000')).toEqual({ socket: '/run/user/1000/codex-consult.sock' })
    const none: any = resolveSocket('', undefined)
    expect(none.kind).toBe('no-server')
    expect(none.message).toContain('codexSocket')
    expect((resolveSocket('/tmp/a b.sock', '/run/user/1000') as any).kind).toBe('input')
  })

  test('checkSocketStat refuses a symlink, a foreign or non-socket socket', () => {
    const parent = { mode: DIR, uid: UID }
    expect(checkSocketStat({ mode: LINK, uid: UID }, parent, UID)?.message).toMatch(/socket is a symlink/)
    expect(checkSocketStat({ mode: SOCK, uid: 0 }, parent, UID)?.message).toMatch(/owned by uid 0/)
    expect(checkSocketStat({ mode: FILE, uid: UID }, parent, UID)?.message).toMatch(/not a socket/)
    expect(checkSocketStat({ mode: FILE, uid: UID }, parent, UID)?.kind).toBe('socket-unsafe')
  })

  test('checkSocketStat refuses a symlinked, foreign or writable parent and accepts 0700 owned by us', () => {
    const sock = { mode: SOCK, uid: UID }
    expect(checkSocketStat(sock, { mode: LINK, uid: UID }, UID)?.message).toMatch(/directory is a symlink/)
    expect(checkSocketStat(sock, { mode: DIR, uid: 0 }, UID)?.message).toMatch(/directory is owned by uid 0/)
    expect(checkSocketStat(sock, { mode: 0o040777, uid: UID }, UID)?.message).toMatch(/writable \(mode 777\)/)
    expect(checkSocketStat(sock, { mode: 0o040775, uid: UID }, UID)?.message).toMatch(/writable \(mode 775\)/)
    expect(checkSocketStat(sock, { mode: FILE, uid: UID }, UID)?.kind).toBe('socket-unsafe')
    expect(checkSocketStat(sock, { mode: DIR, uid: UID }, UID)).toBeNull()
    expect(checkSocketStat(sock, { mode: 0o040755, uid: UID }, UID)).toBeNull()
  })
})

describe('codex daemon socket link', () => {
  const H = 'a'.repeat(64)
  const P = '/run/user/1000/codex-consult.sock'
  const link = { mode: LINK, uid: UID }
  const parent = { mode: DIR, uid: UID }
  test("checkDaemonLink accepts only codex's own link: ours, in a safe dir, to codex-daemon-<uid>/<sha256 of the path>", () => {
    expect(checkDaemonLink(link, parent, UID, P, `/tmp/codex-daemon-1000/${H}`, H)).toBeNull()
    expect(checkDaemonLink(link, parent, UID, P, `/tmp/codex-daemon-1001/${H}`, H)?.kind).toBe('socket-unsafe')
    expect(checkDaemonLink(link, parent, UID, P, `/tmp/codex-daemon-1000/${'b'.repeat(64)}`, H)?.kind).toBe('socket-unsafe')
    expect(checkDaemonLink(link, parent, UID, P, `codex-daemon-1000/${H}`, H)?.kind).toBe('socket-unsafe')
    expect(checkDaemonLink(link, parent, UID, P, `/tmp/x/../codex-daemon-1000/${H}`, H)?.kind).toBe('socket-unsafe')
    expect(checkDaemonLink(link, parent, UID, P, '/tmp/other.sock', H)?.message).toMatch(/symlink to \/tmp\/other\.sock/)
    expect(checkDaemonLink({ mode: LINK, uid: 0 }, parent, UID, P, `/tmp/codex-daemon-1000/${H}`, H)?.message).toMatch(/link is owned by uid 0/)
    expect(checkDaemonLink(link, { mode: 0o040777, uid: UID }, UID, P, `/tmp/codex-daemon-1000/${H}`, H)?.message).toMatch(/writable/)
    expect(checkDaemonLink({ mode: SOCK, uid: UID }, parent, UID, P, `/tmp/codex-daemon-1000/${H}`, H)?.kind).toBe('socket-unsafe')
  })
})

describe('version', () => {
  test('parseServerVersion reads the userAgent and versionAtLeast compares numerically', () => {
    expect(parseServerVersion('consult/0.162.1 (Linux 7.2; x86_64)')).toBe('0.162.1')
    expect(parseServerVersion('codex_cli_rs')).toBeNull()
    expect(versionAtLeast('0.162.10', '0.162.9')).toBe(true)
    expect(versionAtLeast('0.161.9', '0.162.0')).toBe(false)
    expect(versionAtLeast('0.162.0', '0.162.0')).toBe(true)
  })

  test('checkVersion gives too-old, protocol, or the version with an untested flag', () => {
    expect(MIN_CODEX).toBe('0.162.0')
    expect(TESTED_CODEX).toBe('0.163.0')
    expect((checkVersion('consult/0.161.0') as any).kind).toBe('too-old')
    expect((checkVersion('nothing') as any).kind).toBe('protocol')
    expect(checkVersion('consult/0.162.1')).toEqual({ version: '0.162.1', untested: false })
    expect(checkVersion('consult/0.163.0')).toEqual({ version: '0.163.0', untested: false })
    expect(checkVersion('consult/0.164.0')).toEqual({ version: '0.164.0', untested: true })
  })
})

describe('client request', () => {
  const req = { mode: 'plan', cwd: REPO, prompt: 'p', timeoutSec: 60 }
  test('a valid request passes and keeps only known fields', () => {
    expect(checkClientRequest({ ...req, model: 'gpt-6-sol', effort: 'high', socket: '/tmp/s.sock', extra: 1 })).toEqual({ ok: { ...req, model: 'gpt-6-sol', effort: 'high', socket: '/tmp/s.sock' } as any })
  })
  test('bad fields are input errors', () => {
    for (const over of [{ mode: 'x' }, { cwd: 'rel' }, { cwd: '/a\nb' }, { prompt: ' ' }, { model: '--x' }, { effort: 'ultra' }, { timeoutSec: 999 }, { timeoutSec: 1.5 }, { socket: 'rel.sock' }, { socket: '/tmp/a?b' }, { socket: '/tmp/a b' }, { socket: '/tmp/a#b' }, { socket: '/' + 'x'.repeat(200) }, { socket: '/tmp/a\nb' }]) {
      expect((checkClientRequest({ ...req, ...over }) as any).kind, JSON.stringify(over)).toBe('input')
    }
    expect((checkClientRequest('x') as any).kind).toBe('input')
  })
  test('a probe request may be empty', () => {
    expect(checkProbeRequest({})).toEqual({ ok: {} })
    expect(checkProbeRequest({ cwd: REPO, socket: '/tmp/s.sock' })).toEqual({ ok: { cwd: REPO, socket: '/tmp/s.sock' } })
    expect((checkProbeRequest({ socket: '/tmp/a b' }) as any).kind).toBe('input')
  })
  test('policy is "", thread or strict on both requests; anything else is an input error', () => {
    for (const policy of ['', 'thread', 'strict']) {
      expect(checkClientRequest({ ...req, policy })).toEqual({ ok: { ...req, policy } as any })
      expect(checkProbeRequest({ policy })).toEqual({ ok: { policy } as any })
    }
    for (const policy of ['off', 'Strict', 'thread ', null, 0, true, {}, ['strict']]) {
      const c = checkClientRequest({ ...req, policy }) as Fail
      expect(c.kind, JSON.stringify(policy)).toBe('input')
      expect(c.message).toBe('policy must be "", "thread" or "strict"')
      expect((checkProbeRequest({ policy }) as Fail).kind, JSON.stringify(policy)).toBe('input')
    }
    expect(effectivePolicy(undefined)).toBe('thread')
    expect(effectivePolicy('')).toBe('thread')
    expect(effectivePolicy('thread')).toBe('thread')
    expect(effectivePolicy('strict')).toBe('strict')
  })
})

describe('params', () => {
  test('initialize names consult with the plugin version and no capabilities', () => {
    expect(initializeParams('0.2.0')).toEqual({ clientInfo: { name: 'consult', title: 'consult', version: '0.2.0' } })
  })

  test('thread/start carries cwd, read-only, the lock keys, the MCP disables and the openai provider', () => {
    const p: any = threadStartParams({ cwd: REPO, model: 'gpt-6-sol', effort: 'high' }, mcpServerNames(LOCKED))
    expect(p).toMatchObject({ cwd: REPO, sandbox: 'read-only', approvalPolicy: 'never', approvalsReviewer: 'user', ephemeral: true, modelProvider: 'openai', model: 'gpt-6-sol' })
    expect(p.config.web_search).toBe('disabled')
    for (const f of LOCKED_FEATURES) expect(p.config.features[f]).toBe(false)
    expect(p.config.mcp_servers).toEqual({ a: { enabled: false }, b: { enabled: false } })
    expect(p.config).toMatchObject({ model: 'gpt-6-sol', review_model: 'gpt-6-sol', model_reasoning_effort: 'high' })
  })

  test('omitted model and effort leave the config to decide', () => {
    const p: any = threadStartParams({ cwd: REPO }, [])
    expect(p.model).toBeUndefined()
    expect(Object.keys(p.config).sort()).toEqual(['features', 'mcp_servers', 'web_search'])
    const t: any = turnStartParams({ cwd: REPO, prompt: 'x' }, T)
    expect(t.model).toBeUndefined()
    expect(t.effort).toBeUndefined()
  })

  test('turn/start is read-only in the repo; review/start uses a custom inline target', () => {
    expect(turnStartParams({ cwd: REPO, prompt: 'plan', model: 'm', effort: 'low' }, T)).toEqual({
      threadId: T, input: [{ type: 'text', text: 'plan' }], cwd: REPO, approvalPolicy: 'never', approvalsReviewer: 'user', sandboxPolicy: { type: 'readOnly', networkAccess: false }, model: 'm', effort: 'low',
    })
    expect(reviewStartParams({ prompt: 'review this' }, T)).toEqual({ threadId: T, target: { type: 'custom', instructions: 'review this' }, delivery: 'inline' })
  })
})

// The Fail of a stage 1 check, or null when it passed.
const failOf = (r: ServerLocks | Fail): Fail | null => ('kind' in r ? r : null)
const required = (config: unknown, policy: LockPolicy = 'strict', o: { origins?: Record<string, string>; version?: string } = {}) =>
  checkServerRequired(config, Object.fromEntries(Object.entries(o.origins ?? {}).map(([k, type]) => [k, { name: { type }, version: '1' }])), policy, o.version ?? '0.163.0')
const strict = (config: unknown) => failOf(required(config))

describe('lock classes', () => {
  test('Decision 4: T, O and S keys, every feature locked, the O pairs and versions probed', () => {
    const cls = (c: string) => Object.keys(LOCK_CLASSES).filter(k => LOCK_CLASSES[k]!.class === c).sort()
    expect(cls('T')).toEqual(['approval_policy', 'approvals_reviewer', 'features.apps', 'features.browser_use', 'features.computer_use', 'features.hooks', 'features.image_generation', 'features.multi_agent', 'sandbox_mode'])
    expect(cls('O')).toEqual(['tools.web_search', 'web_search'])
    expect(cls('S')).toEqual(['features.plugins'])
    expect(Object.keys(LOCK_CLASSES).filter(k => k.startsWith('features.')).map(k => k.slice(9)).sort()).toEqual([...LOCKED_FEATURES].sort())
    expect(O_VERIFIED_ON).toEqual(['0.163.0'])
    expect(LOCK_CLASSES.web_search!.covered).toEqual([
      { value: null, origin: null }, { value: 'disabled', origin: 'sessionFlags' }, { value: 'cached', origin: 'sessionFlags' }, { value: 'cached', origin: 'user' },
      { value: 'live', origin: 'sessionFlags' }, { value: 'live', origin: 'user' },
    ])
    expect(LOCK_CLASSES['tools.web_search']!.covered).toEqual([{ value: null, origin: null }, { value: { context_size: 'high' }, origin: 'sessionFlags' }, { value: { context_size: 'high' }, origin: 'user' }])
    for (const [k, spec] of Object.entries(LOCK_CLASSES)) {
      expect(spec.guarantee, k).not.toBe('')
      expect(spec.fix, k).toMatch(/codex-consult unit/)
      expect(spec.fix, k).not.toMatch(/example unit|README/)
    }
  })

  test('originOf reads the layer type, counting sub-keys, and refuses mixed or malformed origins', () => {
    const meta = (type: unknown) => ({ name: { type }, version: '1' })
    expect(originOf({ web_search: meta('user') }, 'web_search')).toBe('user')
    expect(originOf({ web_search_x: meta('user') }, 'web_search')).toBeNull()
    expect(originOf({ 'tools.web_search.context_size': meta('sessionFlags') }, 'tools.web_search')).toBe('sessionFlags')
    expect(originOf({ 'tools.web_search.context_size': meta('sessionFlags'), 'tools.web_search.location': meta('user') }, 'tools.web_search')).toBe('(mixed)')
    expect(originOf({ web_search: { name: 'user' } }, 'web_search')).toBe('(unknown)')
    expect(originOf({ web_search: meta(3) }, 'web_search')).toBe('(unknown)')
    expect(originOf(null, 'web_search')).toBeNull()
    expect(originOf({}, 'web_search')).toBeNull()
  })
})

describe('stage 1 asserts', () => {
  test('checkServerRequired accepts the probed config under both policies', () => {
    for (const policy of ['strict', 'thread'] as const) {
      expect(failOf(required(LOCKED, policy, { origins: { web_search: 'sessionFlags' } }))).toBeNull()
      // The code-mode host stays on (the reviewer's tools run through it); config/read omits its key then.
      expect(failOf(required({ ...LOCKED, features: { ...LOCKED.features, code_mode_host: true } }, policy))).toBeNull()
      expect(failOf(required({ ...LOCKED, tools: undefined }, policy))).toBeNull()
      expect(failOf(required({ ...LOCKED, tools: { web_search: null } }, policy))).toBeNull()
    }
    expect(LOCKED_FEATURES).not.toContain('code_mode_host')
    expect((threadStartParams({ cwd: REPO }, []) as any).config.features.code_mode_host).toBeUndefined()
  })

  test('strict: checkServerRequired refuses each lock key wrong or missing, naming it, its guarantee and its flag', () => {
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ web_search: 'cached' }, /web_search is "cached"/],
      [{ web_search: undefined }, /web_search is missing/],
      [{ sandbox_mode: 'workspace-write' }, /sandbox_mode/],
      [{ sandbox_mode: undefined }, /sandbox_mode is missing/],
      [{ approval_policy: 'on-request' }, /approval_policy/],
      [{ approval_policy: { granular: { mcp_elicitations: false, rules: false, sandbox_approval: false } } }, /approval_policy/],
      [{ approval_policy: undefined }, /approval_policy is missing/],
      [{ approvals_reviewer: 'auto_review' }, /approvals_reviewer is "auto_review"/],
      [{ approvals_reviewer: 'guardian_subagent' }, /approvals_reviewer/],
      [{ approvals_reviewer: undefined }, /approvals_reviewer is missing/],
      [{ tools: { web_search: {} } }, /tools\.web_search/],
      [{ tools: { web_search: { context_size: 'low' } } }, /tools\.web_search/],
      [{ tools: 'on' }, /tools\.web_search/],
      [{ features: undefined }, /features\.plugins is missing.*features\.image_generation is missing/],
    ]
    for (const [over, msg] of cases) {
      const r = strict({ ...LOCKED, ...over })
      expect(r?.kind, JSON.stringify(over)).toBe('not-locked')
      expect(r?.message, JSON.stringify(over)).toMatch(msg)
      expect(r?.message, JSON.stringify(over)).toMatch(/codexLockPolicy is strict, so consult requires it of the server, and consult needs it so that .*\. Fix: /)
    }
    for (const f of LOCKED_FEATURES) {
      expect(strict({ ...LOCKED, features: { ...LOCKED.features, [f]: true } })?.message).toContain(`features.${f} is true (want false)`)
      const { [f]: _, ...rest } = LOCKED.features
      expect(strict({ ...LOCKED, features: rest })?.message).toContain(`features.${f} is missing (want false): codexLockPolicy is strict`)
      expect(strict({ ...LOCKED, features: rest })?.message).toContain(`Fix: add --disable ${f} to the codex-consult unit`)
    }
    expect(strict(null)?.kind).toBe('not-locked')
    // Every key wrong: one clause per key, each with its own fix, and no pointer at the example unit.
    const all = strict(LOCKED.features)!.message
    expect(all).toMatch(/^the codex app server is not locked down for consult: web_search is missing/)
    // tools.web_search is absent there, which is what it requires.
    expect(all.match(/Fix: /g)).toHaveLength(Object.keys(LOCK_CLASSES).length - 1)
    expect(all).toContain(`Fix: add -c 'sandbox_mode="read-only"' to the codex-consult unit`)
    expect(all).not.toMatch(/example unit|README/)
    // Strict never looks at the version or origins.
    expect(failOf(required(LOCKED, 'strict', { version: '0.164.0', origins: { web_search: 'project' } }))).toBeNull()
    expect(required(LOCKED, 'strict')).toEqual({ policy: 'strict', classes: Object.fromEntries(Object.keys(LOCK_CLASSES).map(k => [k, 'S'])), trusted: [] })
  })

  // The user's unit (S1, 2026-10-23): the README unit without --disable plugins and web_search="disabled".
  const { plugins: _plugins, ...noPlugins } = LOCKED.features
  const USER_UNIT = { ...LOCKED, web_search: null, features: noPlugins }

  test("thread: the user's unit fails only on features.plugins; T keys are not checked at the server", () => {
    const r = failOf(required(USER_UNIT, 'thread'))
    expect(r?.kind).toBe('not-locked')
    expect(r?.message).toBe('the codex app server is not locked down for consult: features.plugins is missing (want false): consult cannot override it per thread, and consult needs it so that no plugin adds tools, skills or hooks to the reviewer. Fix: add --disable plugins to the codex-consult unit.')
    const loose = { ...LOCKED, sandbox_mode: 'danger-full-access', approval_policy: 'on-request', approvals_reviewer: 'auto_review', features: { ...LOCKED.features, hooks: true, apps: true, browser_use: true, computer_use: true, multi_agent: true, image_generation: true } }
    const ok = required(loose, 'thread', { origins: { web_search: 'sessionFlags' } }) as ServerLocks
    expect(failOf(ok)).toBeNull()
    expect(ok.classes).toMatchObject({ sandbox_mode: 'T', approval_policy: 'T', approvals_reviewer: 'T', 'features.hooks': 'T', 'features.apps': 'T', 'features.plugins': 'S', web_search: 'O', 'tools.web_search': 'O' })
    expect(ok.trusted).toEqual([])
  })

  test('thread: O keys pass on covered pairs at 0.163.0 and are trusted on their override when not disabled', () => {
    const live = required({ ...LOCKED, web_search: 'live', tools: { web_search: { context_size: 'high', allowed_domains: null, location: null } } }, 'thread', { origins: { web_search: 'user', 'tools.web_search.context_size': 'user' } }) as ServerLocks
    expect(live.classes).toMatchObject({ web_search: 'O', 'tools.web_search': 'O' })
    expect(live.trusted).toEqual([{ key: 'web_search', got: '"live" (origin user)' }, { key: 'tools.web_search', got: '{"context_size":"high","allowed_domains":null,"location":null} (origin user)' }])
    const absent = required({ ...LOCKED, web_search: null }, 'thread') as ServerLocks
    expect(absent.classes.web_search).toBe('O')
    expect(absent.trusted.map(t => t.key)).toEqual(['web_search'])
    for (const [value, origin] of [['cached', 'sessionFlags'], ['cached', 'user'], ['live', 'sessionFlags']]) {
      expect(failOf(required({ ...LOCKED, web_search: value }, 'thread', { origins: { web_search: origin! } })), `${value} ${origin}`).toBeNull()
    }
  })

  test('thread: an O key outside the covered pairs, or on another version, behaves as S and names why', () => {
    const cases: [unknown, Record<string, string>, string, RegExp][] = [
      [{ web_search: 'indexed' }, { web_search: 'sessionFlags' }, '0.163.0', /web_search is "indexed" \(origin sessionFlags\) \(want "disabled"\): consult has not verified that its per-thread override beats that value from that origin/],
      [{ web_search: 'live' }, { web_search: 'project' }, '0.163.0', /web_search is "live" \(origin project\)/],
      [{ web_search: 'live' }, { web_search: 'enterpriseManaged' }, '0.163.0', /\(origin enterpriseManaged\)/],
      [{ web_search: 'disabled' }, { web_search: 'sessionFlags' }, '0.163.0', /^$/],
      [{ web_search: 'live' }, { web_search: 'sessionFlags' }, '0.162.1', /web_search is "live" \(origin sessionFlags\) \(want "disabled"\): consult verified its per-thread override only on codex 0\.163\.0, and this server runs 0\.162\.1/],
      [{ web_search: 'live' }, { web_search: 'sessionFlags' }, '0.164.0', /this server runs 0\.164\.0/],
      [{ web_search: null }, {}, '0.164.0', /web_search is null \(want "disabled"\): consult verified its per-thread override only on codex 0\.163\.0/],
      [{ tools: { web_search: { context_size: 'high' } } }, { 'tools.web_search.context_size': 'user' }, '0.162.1', /tools\.web_search is \{"context_size":"high"\} \(origin user\) \(want absent\): consult verified/],
      [{ tools: { web_search: { context_size: 'low' } } }, { 'tools.web_search.context_size': 'user' }, '0.163.0', /tools\.web_search is \{"context_size":"low"\}/],
      [{ tools: { web_search: {} } }, {}, '0.163.0', /tools\.web_search is \{\} \(want absent\)/],
      [{ tools: { web_search: { context_size: 'high', location: { country: 'US' } } } }, { 'tools.web_search.context_size': 'user' }, '0.163.0', /tools\.web_search is \{"context_size":"high","location":\{"country":"US"\}\} \(origin user\)/],
      [{ tools: { web_search: { context_size: 'high' } } }, { 'tools.web_search.context_size': 'sessionFlags', 'tools.web_search.location': 'user' }, '0.163.0', /\(origin \(mixed\)\)/],
      [{ tools: 'on' }, {}, '0.163.0', /tools\.web_search is "on" \(want absent\)/],
    ]
    for (const [over, origins, version, msg] of cases) {
      const r = failOf(required({ ...LOCKED, ...(over as object) }, 'thread', { origins, version }))
      const label = `${JSON.stringify(over)} ${JSON.stringify(origins)} ${version}`
      if (String(msg) === '/^$/') {
        expect(r, label).toBeNull()
        continue
      }
      expect(r?.kind, label).toBe('not-locked')
      expect(r?.message, label).toMatch(msg)
      expect(r?.message, label).toContain('Fix: ')
    }
    // Disabled at the server: S holds on any version and origin, and the class says so.
    for (const version of ['0.162.1', '0.164.0']) {
      const r = required(LOCKED, 'thread', { origins: { web_search: 'user' }, version }) as ServerLocks
      expect(r.classes).toMatchObject({ web_search: 'S', 'tools.web_search': 'S' })
      expect(r.trusted).toEqual([])
    }
  })

  test('mergeServerLocks keeps an O class and the trust of either view', () => {
    const a = required({ ...LOCKED, web_search: 'live' }, 'thread', { origins: { web_search: 'user' } }) as ServerLocks
    const b = required(LOCKED, 'thread', { origins: { web_search: 'user' } }) as ServerLocks
    const m = mergeServerLocks(a, b)
    expect(m.classes.web_search).toBe('O')
    expect(m.trusted.map(t => t.key)).toEqual(['web_search'])
    expect(mergeServerLocks(a, a).trusted).toHaveLength(1)
  })

  const layer = (keys: Record<string, unknown>, disabledReason?: string) => ({ name: { type: 'project', dotCodexFolder: '/r/.codex' }, config: keys, version: 'v', disabledReason })
  const user = { name: { type: 'user', file: '/home/u/.codex/config.toml' }, config: { web_search: 'live', mcp_servers: {} }, version: 'v' }

  test('checkProjectLayers accepts a disabled layer, a model/effort layer and no project layer', () => {
    expect(checkProjectLayers([user, layer({ web_search: 'live', mcp_servers: { x: {} }, sandbox_mode: 'workspace-write' }, 'add it as a trusted project')])).toBeNull()
    expect(checkProjectLayers([user, layer({ model: 'm', model_reasoning_effort: 'low' })])).toBeNull()
    expect(checkProjectLayers([user, { name: { type: 'sessionFlags' }, config: { web_search: 'disabled' }, version: 'v' }])).toBeNull()
    expect(checkProjectLayers([])).toBeNull()
  })

  test('checkProjectLayers refuses an enabled layer beyond model/effort, naming the folder and keys', () => {
    for (const key of ['web_search', 'mcp_servers', 'features', 'agents', 'persistent_instructions']) {
      const r = checkProjectLayers([user, layer({ model: 'm', [key]: {} })])
      expect(r?.kind).toBe('not-locked')
      expect(r?.message).toMatch(new RegExp(`^/r/\\.codex sets ${key}; .*agy`))
    }
    // An empty disabledReason does not disable a layer, and missing layers cannot be checked.
    expect(checkProjectLayers([layer({ notify: [] }, '')])?.kind).toBe('not-locked')
    expect(checkProjectLayers(null)?.kind).toBe('not-locked')
  })

  test('projectLayers summarizes for --probe', () => {
    expect(projectLayers([user, layer({ model: 'm' }), layer({ web_search: 'live' }, 'untrusted')])).toEqual([
      { folder: '/r/.codex', enabled: true, keys: ['model'] },
      { folder: '/r/.codex', enabled: false, keys: ['web_search'] },
    ])
  })

  test('checkProvider pins openai in the config and the thread', () => {
    expect(checkProvider({ model_provider: 'bedrock' })?.message).toMatch(/bedrock.*OpenAI only/)
    expect(checkProvider({ model_provider: 'bedrock' })?.kind).toBe('not-locked')
    expect(checkProvider({ model_provider: null })).toBeNull()
    expect(checkProvider({})).toBeNull()
    expect(checkProvider({ model_provider: 'openai' })).toBeNull()
    expect(checkProvider({}, { modelProvider: 'other' })?.message).toMatch(/"other".*OpenAI only/)
    expect(checkProvider({}, {})?.kind).toBe('not-locked')
    expect(checkProvider({ model_provider: null }, { modelProvider: 'openai' })).toBeNull()
  })

  test('checkAccount keeps only the account type and refuses a missing login', () => {
    expect(checkAccount({ requiresOpenaiAuth: true, account: { type: 'chatgpt', email: 'me@example.com', planType: 'pro' } })).toEqual({ signedIn: true, accountType: 'chatgpt' })
    expect((checkAccount({ requiresOpenaiAuth: true, account: null }) as any).kind).toBe('auth')
    expect(checkAccount({ requiresOpenaiAuth: false, account: null })).toEqual({ signedIn: false, accountType: null })
  })
})

describe('stage 2 asserts', () => {
  test('checkReadOnly accepts the probed response and refuses each drift or absent field', () => {
    expect(checkReadOnly(START)).toBeNull()
    expect(checkReadOnly({ ...START, sandbox: { type: 'readOnly' } })).toBeNull()
    for (const over of [{ sandbox: { type: 'workspaceWrite' } }, { sandbox: { type: 'readOnly', networkAccess: true } }, { sandbox: undefined }, { approvalPolicy: 'on-request' }, { approvalPolicy: undefined }, { approvalsReviewer: 'auto_review' }, { approvalsReviewer: undefined }]) {
      expect(checkReadOnly({ ...START, ...over })?.kind, JSON.stringify(over)).toBe('sandbox')
    }
  })

  test('checkCwd refuses a mismatch', () => {
    expect(checkCwd(START, REPO)).toBeNull()
    expect(checkCwd({ ...START, cwd: '/home/u' }, REPO)?.kind).toBe('protocol')
    expect(checkCwd({}, REPO)?.message).toMatch(/missing/)
  })

  test('checkLockdown needs every MCP server disabled across pages and no hook', () => {
    const page = (...s: unknown[]) => ({ data: s, nextCursor: null })
    const off = (name: string) => ({ name, runtimeStatus: 'disabled', tools: {}, resources: [], resourceTemplates: [], authStatus: 'unsupported' })
    const noHooks = { data: [{ cwd: REPO, hooks: [], errors: [], warnings: [] }] }
    expect(checkLockdown([page(off('a')), page(off('b'))], noHooks)).toBeNull()
    expect(checkLockdown([page(off('a')), page({ name: 'b', runtimeStatus: null })], noHooks)?.message).toMatch(/b is null/)
    expect(checkLockdown([page({ name: 'c' })], noHooks)?.message).toMatch(/c is missing/)
    expect(checkLockdown([page({ name: 'd', runtimeStatus: 'connected' })], noHooks)?.kind).toBe('lockdown')
    expect(checkLockdown([page(off('a'))], { data: [{ cwd: REPO, hooks: [{}], errors: [], warnings: [] }] })?.message).toMatch(/1 hook loaded/)
    expect(checkLockdown([], noHooks)?.kind).toBe('lockdown')
    expect(checkLockdown([page(off('a'))], {})?.kind).toBe('lockdown')
  })

  const T_FEATURES = LOCKED_FEATURES.filter(f => f !== 'plugins')
  const feat = (name: string, enabled: unknown = false) => ({ name, enabled, defaultEnabled: false, stage: 'stable' })
  // The consult thread's list on 0.163.0: every lock feature false, among others, over two pages.
  const pagesWith = (over: Record<string, unknown> = {}) => {
    const all = [feat('skill_search', true), ...LOCKED_FEATURES.map(f => feat(f, f in over ? over[f] : false)), feat('tool_search_always_defer_mcp_tools', true)]
    return [{ data: all.slice(0, 4), nextCursor: '4' }, { data: all.slice(4), nextCursor: null }]
  }
  const ended = (pages: unknown[]) => ({ pages, ended: true })

  test('checkThreadLocks accepts every T feature false across pages, and ignores plugins and other features', () => {
    expect(checkThreadLocks(ended(pagesWith()))).toBeNull()
    expect(checkThreadLocks(ended(pagesWith({ plugins: true })))).toBeNull()
  })

  test('checkThreadLocks refuses a T feature on, not false, missing or listed twice with a true', () => {
    for (const f of T_FEATURES) {
      const on = checkThreadLocks(ended(pagesWith({ [f]: true })))
      expect(on?.kind, f).toBe('not-locked')
      expect(on?.message).toContain(`features.${f} is true on the consult thread (want false): codex did not apply consult's per-thread override`)
      expect(on?.message).toContain(`Fix: add --disable ${f} to the codex-consult unit`)
      expect(checkThreadLocks(ended(pagesWith({ [f]: null })))?.message).toContain(`features.${f} is null on the consult thread`)
      const missing = pagesWith().map(p => ({ ...p, data: p.data.filter(x => x.name !== f) }))
      expect(checkThreadLocks(ended(missing))?.message).toContain(`features.${f} is missing from the consult thread's feature list (want false)`)
    }
    const twice = [...pagesWith(), { data: [feat('apps', true)], nextCursor: null }]
    expect(checkThreadLocks(ended(twice))?.message).toMatch(/features\.apps is true/)
  })

  test('checkThreadLocks fails closed on an error, a page without data and paging that did not end', () => {
    const err = checkThreadLocks({ pages: [], ended: false, error: 'codex refused experimentalFeature/list: unknown method' })
    expect(err?.kind).toBe('not-locked')
    expect(err?.message).toMatch(/^the consult thread is not locked down: consult could not read back the consult thread's features \(codex refused experimentalFeature\/list: unknown method\), so it cannot confirm that features\.hooks, features\.apps, features\.browser_use, features\.computer_use, features\.multi_agent, features\.image_generation are off for the thread\. Fix: run codex 0\.163\.0, or set codexLockPolicy to strict/)
    expect(checkThreadLocks(ended([...pagesWith(), { nextCursor: null }]))?.message).toMatch(/returned a page with no data/)
    expect(checkThreadLocks(ended([...pagesWith(), 'x']))?.kind).toBe('not-locked')
    expect(checkThreadLocks({ pages: pagesWith(), ended: false })?.message).toMatch(new RegExp(`did not end within ${MAX_FEATURE_PAGES} pages`))
    expect(checkThreadLocks(ended([]))?.message).toMatch(/features\.hooks is missing/)
  })

  test('checkThreadLocks fails a trusted O key with apps, and only then', () => {
    const trusted = [{ key: 'web_search', got: '"live" (origin user)' }]
    expect(checkThreadLocks(ended(pagesWith()), trusted)).toBeNull()
    expect(checkThreadLocks(ended(pagesWith({ hooks: true })), trusted)?.message).not.toMatch(/web_search/)
    for (const read of [ended(pagesWith({ apps: true })), ended(pagesWith().map(p => ({ ...p, data: p.data.filter(x => x.name !== 'apps') }))), { pages: pagesWith(), ended: false }]) {
      const r = checkThreadLocks(read, trusted)
      expect(r?.kind).toBe('not-locked')
      expect(r?.message).toContain(`web_search is "live" (origin user) (want "disabled"): consult trusts its per-thread override only while features.apps reads back false on the consult thread, which it did not, and consult needs it so that the reviewer cannot search the web`)
      expect(r?.message).toContain(`Fix: add -c 'web_search="disabled"' to the codex-consult unit`)
    }
    expect(checkThreadLocks({ pages: [], ended: false, error: 'x' }, trusted)?.message).toMatch(/could not read back.*web_search is "live" \(origin user\)/)
  })
})

describe('server requests', () => {
  test('requestThreadId reads conversationId for the legacy approvals and threadId otherwise', () => {
    expect(requestThreadId('execCommandApproval', { conversationId: T, threadId: OTHER })).toBe(T)
    expect(requestThreadId('applyPatchApproval', { conversationId: T })).toBe(T)
    expect(requestThreadId('item/commandExecution/requestApproval', { threadId: T, conversationId: OTHER })).toBe(T)
    expect(requestThreadId('account/chatgptAuthTokens/refresh', { reason: 'x' })).toBeUndefined()
  })

  test('the answer table for our thread', () => {
    const ask = (method: string, params: Record<string, unknown> = {}) => answerServerRequest(method, { threadId: T, turnId: 'u', ...params }, T) as any
    const cmd = ask('item/commandExecution/requestApproval', { command: 'rm -rf /\nx' })
    expect(cmd.result).toEqual({ decision: 'cancel' })
    expect(cmd.fail).toMatchObject({ kind: 'sandbox' })
    expect(cmd.fail.message).toMatch(/^codex asked to run `rm -rf \/ x` outside the read-only sandbox$/)
    expect(ask('item/commandExecution/requestApproval', { command: 'y'.repeat(500) }).fail.message.length).toBeLessThan(300)
    expect(ask('item/fileChange/requestApproval')).toMatchObject({ result: { decision: 'cancel' }, fail: { kind: 'sandbox' } })
    expect(ask('item/permissions/requestApproval')).toMatchObject({ result: { permissions: {}, scope: 'turn' }, fail: { kind: 'sandbox' } })
    const elicit = ask('mcpServer/elicitation/request', { serverName: 's' })
    expect(elicit.result).toEqual({ action: 'decline', content: null })
    expect(elicit.fail).toBeUndefined()
    expect(elicit.notice).toMatch(/declined/)
    expect(ask('item/tool/requestUserInput')).toMatchObject({ result: { answers: {} } })
    expect(ask('item/tool/requestUserInput').fail).toBeUndefined()
    expect(ask('item/tool/call')).toEqual({ result: { success: false, contentItems: [] } })
    expect(ask('some/new/method')).toEqual({ error: { code: -32601, message: 'not supported by consult' } })
  })

  test('legacy approvals with our conversationId are aborted and fail the call', () => {
    const r: any = answerServerRequest('execCommandApproval', { conversationId: T, callId: 'c', command: ['git', 'push'], cwd: REPO, parsedCmd: [] }, T)
    expect(r.result).toEqual({ decision: 'abort' })
    expect(r.fail.message).toContain('`git push`')
    expect((answerServerRequest('applyPatchApproval', { conversationId: T, callId: 'c', fileChanges: {} }, T) as any).result).toEqual({ decision: 'abort' })
  })

  test('another thread gets no answer; no thread id gets -32601', () => {
    expect(answerServerRequest('item/commandExecution/requestApproval', { threadId: OTHER, turnId: 'u' }, T)).toBeNull()
    expect(answerServerRequest('execCommandApproval', { conversationId: OTHER }, T)).toBeNull()
    expect(answerServerRequest('execCommandApproval', { threadId: T, conversationId: OTHER }, T)).toBeNull()
    expect(answerServerRequest('some/new/method', { threadId: OTHER }, T)).toBeNull()
    for (const m of ['account/chatgptAuthTokens/refresh', 'attestation/generate']) expect((answerServerRequest(m, { reason: 'x' }, T) as any).error.code).toBe(-32601)
    expect((answerServerRequest('item/fileChange/requestApproval', {}, T) as any).error.code).toBe(-32601)
  })
})

const n = (method: string, params: Record<string, unknown>): Msg => ({ method, params })
const agent = (text: string, phase: string | null = null, threadId = T, turnId = 'u1', id = `i-${text}`) => n('item/completed', { threadId, turnId, completedAtMs: 1, item: { type: 'agentMessage', id, text, phase } })
const completed = (threadId = T, turnId = 'u1', status = 'completed', error: unknown = null) => n('turn/completed', { threadId, turn: { id: turnId, items: [], status, error } })

describe('Matcher', () => {
  test('notifications before setTurn are buffered and replayed, so a fast completion still finishes', () => {
    const m = new Matcher(T)
    const early = [n('turn/started', { threadId: T, turn: { id: 'u1', items: [], status: 'inProgress' } }), agent('hi'), completed()]
    for (const msg of early) expect(m.push(msg)).toEqual([])
    expect(m.done).toBe(false)
    expect(m.setTurn('u1')).toEqual(early)
    expect(m.done).toBe(true)
  })

  test("another thread's messages are dropped, before and after the turn id", () => {
    const m = new Matcher(T)
    expect(m.push(n('thread/started', { thread: { id: OTHER } }))).toEqual([])
    expect(m.push(agent('theirs', null, OTHER))).toEqual([])
    const mine = n('thread/started', { thread: { id: T } })
    m.push(mine)
    expect(m.setTurn('u1')).toEqual([mine])
    expect(m.push(completed(OTHER))).toEqual([])
    expect(m.done).toBe(false)
  })

  test('a turn/completed for another turn id is ignored; thread-level messages pass', () => {
    const m = new Matcher(T)
    m.push(completed(T, 'u0'))
    expect(m.setTurn('u1')).toEqual([])
    expect(m.push(completed(T, 'u9'))).toEqual([])
    expect(m.done).toBe(false)
    const settings = n('thread/settings/updated', { threadId: T, threadSettings: { model: 'x' } })
    expect(m.push(settings)).toEqual([settings])
    expect(m.push(completed())).toHaveLength(1)
    expect(m.done).toBe(true)
  })
})

describe('reducer', () => {
  const run = (msgs: Msg[]) => msgs.reduce(reduce, newTurnState())
  const cmd = (status: string, id: string) => n('item/completed', { threadId: T, turnId: 'u1', completedAtMs: 1, item: { type: 'commandExecution', id, status, command: 'rg x', commandActions: [], cwd: REPO } })

  test('collects messages and counts items by final status, once per item id', () => {
    const s = run([cmd('completed', 'c1'), cmd('failed', 'c2'), cmd('declined', 'c3'), cmd('completed', 'c1'), agent('answer', 'final_answer'), completed()])
    expect(s.items.commandExecution).toEqual({ completed: 1, failed: 1, declined: 1 })
    expect(turnOutcome(s, 'plan')).toEqual({ reply: 'answer' })
  })

  test('willRetry errors are notices; a failed turn is classified', () => {
    const err = n('error', { threadId: T, turnId: 'u1', willRetry: true, error: { message: 'reconnecting' } })
    const s = run([err, completed(T, 'u1', 'failed', { message: 'limit', codexErrorInfo: 'usageLimitExceeded' })])
    expect(s.notices[0]).toMatch(/reconnecting/)
    expect(turnOutcome(s, 'plan')).toMatchObject({ kind: 'limit' })
    const late = run([n('error', { threadId: T, turnId: 'u1', willRetry: false, error: { message: 'x', codexErrorInfo: 'contextWindowExceeded' } }), completed(T, 'u1', 'failed')])
    expect(turnOutcome(late, 'plan')).toMatchObject({ kind: 'context' })
  })

  test('a completed fileChange fails the call with sandbox', () => {
    const s = run([n('item/completed', { threadId: T, turnId: 'u1', completedAtMs: 1, item: { type: 'fileChange', id: 'f', status: 'completed', changes: [] } }), agent('done'), completed()])
    expect(s.items.fileChange.completed).toBe(1)
    expect(turnOutcome(s, 'plan')).toMatchObject({ kind: 'sandbox' })
  })

  test('items only in turn/completed still count', () => {
    const s = run([n('turn/completed', { threadId: T, turn: { id: 'u1', status: 'completed', items: [{ type: 'agentMessage', id: 'a', text: 'late', phase: null }] } })])
    expect(finalReply(s, 'plan')).toBe('late')
  })

  test('finalReply: review prefers exitedReviewMode; plan prefers final_answer, else non-commentary', () => {
    const review = (text: string, id: string) => n('item/completed', { threadId: T, turnId: 'u1', completedAtMs: 1, item: { type: 'exitedReviewMode', id, review: text } })
    expect(finalReply(run([agent('progress', 'commentary'), review('first', 'r1'), review('  ', 'r2'), agent('x')]), 'diff')).toBe('first')
    expect(finalReply(run([agent('a'), agent('b', 'commentary')]), 'diff')).toBe('a')
    expect(finalReply(run([agent('think', 'commentary'), agent('one', 'final_answer'), agent('mid'), agent('two', 'final_answer')]), 'plan')).toBe('one\n\ntwo')
    expect(finalReply(run([agent('a'), agent('thinking', 'commentary'), agent('b', 'partial_answer')]), 'plan')).toBe('a\n\nb')
    expect(turnOutcome(run([agent('only', 'commentary'), completed()]), 'plan')).toMatchObject({ kind: 'empty' })
  })

  test('classifyTurnError maps codexErrorInfo, including the object forms', () => {
    const k = (info: unknown) => classifyTurnError({ message: 'm', codexErrorInfo: info }).kind
    expect(k('unauthorized')).toBe('auth')
    for (const c of ['usageLimitExceeded', 'rateLimitExceeded', 'sessionBudgetExceeded', 'serverOverloaded']) expect(k(c)).toBe('limit')
    expect(k('contextWindowExceeded')).toBe('context')
    expect(k('sandboxError')).toBe('sandbox')
    expect(k('tooManyDenials')).toBe('sandbox')
    expect(k('internalServerError')).toBe('failed')
    expect(k({ httpConnectionFailed: { httpStatusCode: 502 } })).toBe('failed')
    expect(k({ responseStreamConnectionFailed: { httpStatusCode: 401 } })).toBe('auth')
    expect(k({ httpConnectionFailed: { httpStatusCode: 429 } })).toBe('limit')
    expect(classifyTurnError(undefined).kind).toBe('failed')
    expect(turnOutcome(run([completed(T, 'u1', 'interrupted')]), 'plan')).toMatchObject({ kind: 'failed' })
  })
})

describe('observedModel', () => {
  const base = { threadId: T, mode: 'diff' as const, requested: { model: 'gpt-6-sol', effort: 'high' }, config: { model: 'cfg-model', review_model: 'cfg-review', model_reasoning_effort: 'medium' } }
  test('a model/rerouted or thread/settings/updated for our thread is observed', () => {
    expect(observedModel([n('model/rerouted', { threadId: T, turnId: 'u1', fromModel: 'gpt-6-sol', toModel: 'gpt-6-mini', reason: 'highRiskCyberActivity' })], base)).toEqual({ model: 'gpt-6-mini', effort: 'high', modelSource: 'observed' })
    expect(observedModel([n('thread/settings/updated', { threadId: T, threadSettings: { model: 'gpt-6-luna', effort: 'low' } })], base)).toEqual({ model: 'gpt-6-luna', effort: 'low', modelSource: 'observed' })
  })

  test('otherwise the requested values, else the config', () => {
    const theirs = [n('thread/settings/updated', { threadId: OTHER, threadSettings: { model: 'theirs', effort: 'max' } })]
    expect(observedModel(theirs, base)).toEqual({ model: 'gpt-6-sol', effort: 'high', modelSource: 'requested' })
    expect(observedModel([], { ...base, requested: {} })).toEqual({ model: 'cfg-review', effort: 'medium', modelSource: 'config' })
    expect(observedModel([], { ...base, mode: 'plan', requested: {} })).toEqual({ model: 'cfg-model', effort: 'medium', modelSource: 'config' })
  })

  test('plan mode reads the thread/start response as observed', () => {
    expect(observedModel([], { ...base, mode: 'plan', requested: {}, threadStart: START })).toEqual({ model: 'gpt-6-sol', effort: 'high', modelSource: 'observed' })
  })
})

describe('result line', () => {
  const okResult = (reply: string): ClientOk => ({
    ok: true, reply, model: 'gpt-6-sol', effort: 'high', modelSource: 'requested', provider: 'openai', version: '0.162.1', durationMs: 5, notices: ['AGENTS.md loaded: /r/AGENTS.md'],
    items: { commandExecution: { completed: 1, failed: 0, declined: 0 }, fileChange: { completed: 0, failed: 0, declined: 0 } },
  })

  test('utf8Bytes counts multi-byte characters and surrogate pairs', () => {
    expect(utf8Bytes('a')).toBe(1)
    expect(utf8Bytes('é')).toBe(2)
    expect(utf8Bytes('€')).toBe(3)
    expect(utf8Bytes('😀')).toBe(4)
  })

  test('a short result is unchanged', () => {
    expect(JSON.parse(fitLine(okResult('fine')))).toEqual(okResult('fine'))
  })

  test('fitLine keeps a 200 KB reply of quotes, newlines and non-ASCII under 48,000 bytes, with the note', () => {
    const unit = '"\n\\é€😀\u0001x'
    const reply = unit.repeat(Math.ceil(200_000 / unit.length))
    const line = fitLine(okResult(reply))
    expect(utf8Bytes(line)).toBeLessThanOrEqual(MAX_LINE_BYTES)
    expect(utf8Bytes(line)).toBeGreaterThan(MAX_LINE_BYTES - 64)
    expect(line).not.toContain('\n')
    const back = JSON.parse(line)
    expect(back.reply).toMatch(/\n\[reply truncated at \d+ characters to fit the consult output limit\]$/)
    expect(reply.startsWith(back.reply.replace(/\n\[reply truncated[^\]]*\]$/, ''))).toBe(true)
    expect(back.notices).toEqual(okResult('').notices)
  })

  test('fitLine trims an oversized failure and never exceeds the bound', () => {
    const line = fitLine({ ok: false, kind: 'failed', message: 'm'.repeat(100_000), log: 'l'.repeat(100_000) })
    expect(utf8Bytes(line)).toBeLessThanOrEqual(MAX_LINE_BYTES)
    expect(JSON.parse(line).kind).toBe('failed')
    expect(utf8Bytes(fitLine({ ...okResult('x'), notices: ['n'.repeat(60_000)] }))).toBeLessThanOrEqual(MAX_LINE_BYTES)
  })

  test('parseClientResult reads a line, recognizes cut output, and calls garbage a crash', () => {
    expect(parseClientResult(fitLine(okResult('abc')) + '\n')).toEqual({ result: okResult('abc') })
    expect(parseClientResult('{"ok":true,"reply":"abc')).toMatchObject({ problem: 'cut', message: expect.stringMatching(/output was cut/) })
    expect(parseClientResult('garbage')).toMatchObject({ problem: 'crash' })
    expect(parseClientResult('')).toMatchObject({ problem: 'crash' })
    expect(parseClientResult('{"ok":false,"kind":"nope","message":"m"}')).toMatchObject({ problem: 'crash' })
    expect(parseClientResult('{"ok":false,"kind":"auth","message":"m"}')).toEqual({ result: { ok: false, kind: 'auth', message: 'm', log: '' } })
  })

  test('clientErrorText: no-server keeps its text, timeout says split, others name the kind', () => {
    expect(clientErrorText({ ok: false, kind: 'no-server', message: 'no codex app server at /s (missing). Start it', log: '' })).toBe('consult: no codex app server at /s (missing). Start it')
    const t = clientErrorText({ ok: false, kind: 'timeout', message: timeoutMessage(60, { turnKnown: true, confirmed: false }), log: 'tail' })
    expect(t).toMatch(/^consult timed out: codex did not finish within 60s.*restart codex-consult.*Split the review.*\ntail$/s)
    expect(timeoutMessage(9, { turnKnown: false, confirmed: false })).toMatch(/may still start/)
    expect(clientErrorText({ ok: false, kind: 'not-locked', message: 'web_search', log: '' })).toBe('consult failed (not-locked): web_search')
  })
})
