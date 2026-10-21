import { describe, expect, test } from 'claude-code/testing'
import {
  answerServerRequest, checkAccount, checkClientRequest, checkDaemonLink, checkCwd, checkLockdown, checkProbeRequest, checkProjectLayers, checkProvider,
  checkReadOnly, checkServerLocked, checkSocketPath, checkSocketStat, checkVersion, classifyTurnError, clientErrorText, finalReply, fitLine,
  initializeParams, LOCKED_FEATURES, MAX_LINE_BYTES, Matcher, mcpServerNames, newTurnState, observedModel, parseClientResult,
  parseServerVersion, projectLayers, reduce, requestThreadId, resolveSocket, reviewStartParams, threadStartParams, timeoutMessage,
  turnOutcome, turnStartParams, utf8Bytes, versionAtLeast, type ClientOk, type Msg,
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
    expect((checkVersion('consult/0.161.0') as any).kind).toBe('too-old')
    expect((checkVersion('nothing') as any).kind).toBe('protocol')
    expect(checkVersion('consult/0.162.1')).toEqual({ version: '0.162.1', untested: false })
    expect(checkVersion('consult/0.163.0')).toEqual({ version: '0.163.0', untested: true })
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

describe('stage 1 asserts', () => {
  test('checkServerLocked accepts the probed config', () => {
    expect(checkServerLocked(LOCKED)).toBeNull()
    expect(checkServerLocked({ ...LOCKED, tools: undefined })).toBeNull()
    expect(checkServerLocked({ ...LOCKED, tools: { web_search: null } })).toBeNull()
  })

  test('checkServerLocked refuses each lock key wrong or missing, naming it', () => {
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
      const r = checkServerLocked({ ...LOCKED, ...over })
      expect(r?.kind, JSON.stringify(over)).toBe('not-locked')
      expect(r?.message, JSON.stringify(over)).toMatch(msg)
    }
    for (const f of LOCKED_FEATURES) {
      expect(checkServerLocked({ ...LOCKED, features: { ...LOCKED.features, [f]: true } })?.message).toContain(`features.${f} is true`)
      const { [f]: _, ...rest } = LOCKED.features
      expect(checkServerLocked({ ...LOCKED, features: rest })?.message).toContain(`features.${f} is missing`)
    }
    expect(checkServerLocked(null)?.kind).toBe('not-locked')
    expect(checkServerLocked(LOCKED.features)?.message).toContain('README')
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
