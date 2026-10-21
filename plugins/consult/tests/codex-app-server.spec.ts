// Runs the codex client (scripts/codex-app-server.ts) as a subprocess against the in-process fake app server.
// Run: bun test plugins/consult/tests/codex-app-server.spec.ts (not *.test.*: `claude plugin test` loads those).
// Case numbers follow S2 of docs/plans/consult-codex-app-server.md.
import { afterAll, afterEach, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server as NetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DEFAULT_SOCKET_NAME, LOCKED_FEATURES as CLIENT_LOCKED_FEATURES, MAX_LINE_BYTES, SIGNAL_MESSAGE, utf8Bytes } from '../hooks/consult/appserver'
import { FakeAppServer, lockedConfig, LOCKED_FEATURES, REPLY, type Scenario, type Turn } from './fixtures/fake-app-server'

const ROOT = resolve(import.meta.dir, '..')
const CLIENT = join(ROOT, 'scripts', 'codex-app-server.ts')
const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'cas-spec-')))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

let n = 0
function newRepo(): string {
  const dir = join(tmp, `repo${n++}`)
  mkdirSync(join(dir, '.git'), { recursive: true })
  mkdirSync(join(dir, 'sub'))
  return dir
}
const REPO = newRepo()

const fakes: FakeAppServer[] = []
const fake = (s: Scenario = {}, place?: (dir: string) => string) => {
  const f = new FakeAppServer(s, place)
  fakes.push(f)
  return f
}
afterEach(() => {
  for (const f of fakes.splice(0)) f.stop()
})

type Run = { code: number; raw: string; out: any; ms: number; stderr: string }
async function client(req: unknown, o: { probe?: boolean; signal?: (proc: ReturnType<typeof Bun.spawn>) => Promise<void> } = {}): Promise<Run> {
  const t0 = Date.now()
  const proc = Bun.spawn(['bun', '--no-env-file', '--config=/dev/null', CLIENT, ...(o.probe ? ['--probe'] : [])], { cwd: ROOT, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' })
  proc.stdin.write(typeof req === 'string' ? req : JSON.stringify(req))
  proc.stdin.end()
  const signalled = o.signal?.(proc)
  const [raw, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  const code = await proc.exited
  await signalled
  let out: any
  try {
    out = JSON.parse(raw.trim())
  } catch {
    out = { unparsed: raw, stderr }
  }
  return { code, raw, out, ms: Date.now() - t0, stderr }
}
const plan = (f: FakeAppServer, over: Record<string, unknown> = {}) => ({ mode: 'plan', cwd: REPO, prompt: 'Critique: add 1+1.', timeoutSec: 30, socket: f.socket, ...over })
const diff = (f: FakeAppServer, over: Record<string, unknown> = {}) => plan(f, { mode: 'diff', prompt: 'Review the uncommitted changes. Focus: auth', ...over })
const methods = (f: FakeAppServer, conn?: number) => f.frames.filter(x => x.dir === 'in' && x.msg.method && x.msg.id !== undefined && (conn === undefined || x.conn === conn)).map(x => x.msg.method)
const until = async (cond: () => boolean, ms = 5000) => {
  for (const end = Date.now() + ms; Date.now() < end; await Bun.sleep(20)) if (cond()) return true
  return cond()
}
const noTurn = (f: FakeAppServer) => {
  expect(f.sent('turn/start')).toHaveLength(0)
  expect(f.sent('review/start')).toHaveLength(0)
}
const NO_ITEMS = { commandExecution: { completed: 0, failed: 0, declined: 0 }, fileChange: { completed: 0, failed: 0, declined: 0 } }

describe('1-2 happy paths', () => {
  test('1 plan-ok: the thread carries cwd, lock keys, MCP disables and openai; the turn runs in the repo', async () => {
    const f = fake({
      turn: t => {
        t.respond()
        t.started()
        t.item({ type: 'commandExecution', status: 'completed', command: 'rg x', commandActions: [], cwd: REPO })
        t.item({ type: 'commandExecution', status: 'failed', command: 'false', commandActions: [], cwd: REPO })
        t.agent(REPLY, 'final_answer')
        t.complete()
      },
    })
    const r = await client(plan(f, { model: 'gpt-6-sol', effort: 'high' }))
    expect(r.code).toBe(0)
    expect(r.out).toMatchObject({ ok: true, reply: REPLY, model: 'gpt-6-sol', effort: 'high', modelSource: 'observed', provider: 'openai', version: '0.162.1' })
    expect(r.out.items).toEqual({ ...NO_ITEMS, commandExecution: { completed: 1, failed: 1, declined: 0 } })
    expect(r.out.notices).toContain('AGENTS.md loaded: /home/u/.codex/AGENTS.md')
    const ts = f.sent('thread/start')[0]!.msg.params
    expect(ts).toMatchObject({ cwd: REPO, sandbox: 'read-only', approvalPolicy: 'never', approvalsReviewer: 'user', ephemeral: true, modelProvider: 'openai', model: 'gpt-6-sol' })
    expect(ts.config).toMatchObject({ web_search: 'disabled', model: 'gpt-6-sol', review_model: 'gpt-6-sol', model_reasoning_effort: 'high', mcp_servers: { github: { enabled: false }, notes: { enabled: false } } })
    for (const feat of LOCKED_FEATURES) expect(ts.config.features[feat]).toBe(false)
    const turn = f.sent('turn/start')[0]!.msg.params
    expect(turn).toMatchObject({ cwd: REPO, approvalPolicy: 'never', sandboxPolicy: { type: 'readOnly', networkAccess: false }, input: [{ type: 'text', text: 'Critique: add 1+1.' }], model: 'gpt-6-sol', effort: 'high' })
    expect(methods(f)).toEqual(['initialize', 'config/read', 'config/read', 'account/read', 'thread/start', 'mcpServerStatus/list', 'hooks/list', 'turn/start', 'thread/unsubscribe'])
    expect(f.sent('config/read')[1]!.msg.params).toEqual({ cwd: REPO, includeLayers: true })
    expect(f.sent('mcpServerStatus/list')[0]!.msg.params).toMatchObject({ detail: 'toolsAndAuthOnly', threadId: ts && f.sent('turn/start')[0]!.msg.params.threadId })
  }, 20000)

  test('1 plan-ok without model or effort leaves both to the config, and pages through MCP status', async () => {
    const off = (name: string) => ({ name, runtimeStatus: 'disabled', tools: {}, resources: [], resourceTemplates: [], authStatus: 'unsupported' })
    const f = fake({ mcpPages: () => [{ data: [off('github')], nextCursor: '1' }, { data: [off('notes')], nextCursor: null }] })
    const r = await client(plan(f))
    expect(r.out).toMatchObject({ ok: true, model: 'cfg-model', effort: 'medium', modelSource: 'observed' })
    const ts = f.sent('thread/start')[0]!.msg.params
    expect(ts.model).toBeUndefined()
    expect(Object.keys(ts.config).sort()).toEqual(['features', 'mcp_servers', 'web_search'])
    expect(f.sent('mcpServerStatus/list').map(x => x.msg.params.cursor)).toEqual([undefined, '1'])
    expect(f.sent('turn/start')[0]!.msg.params.model).toBeUndefined()
  }, 20000)

  const reviewTurn = (extra?: (t: Turn) => void) => (t: Turn) => {
    t.respond()
    t.started()
    extra?.(t)
    t.item({ type: 'enteredReviewMode', review: 'current changes' })
    t.agent('looking', 'commentary')
    t.item({ type: 'exitedReviewMode', review: 'a.py:3 off-by-one (high)' })
    t.complete()
  }

  test('2 review-ok: a custom inline target with the notes; requested model without a settings notification', async () => {
    const f = fake({ turn: reviewTurn() })
    const r = await client(diff(f, { model: 'gpt-6-luna', effort: 'low' }))
    expect(r.out).toMatchObject({ ok: true, reply: 'a.py:3 off-by-one (high)', model: 'gpt-6-luna', effort: 'low', modelSource: 'requested' })
    expect(f.sent('review/start')[0]!.msg.params).toEqual({ threadId: f.sent('review/start')[0]!.msg.params.threadId, target: { type: 'custom', instructions: 'Review the uncommitted changes. Focus: auth' }, delivery: 'inline' })
    expect(f.sent('turn/start')).toHaveLength(0)
  }, 20000)

  test('2 review-ok: a thread/settings/updated for our thread is observed', async () => {
    const f = fake({ turn: reviewTurn(t => t.emit('thread/settings/updated', { threadId: t.threadId, threadSettings: { model: 'gpt-6-sol', effort: 'xhigh', modelProvider: 'openai' } })) })
    const r = await client(diff(f, { model: 'gpt-6-luna' }))
    expect(r.out).toMatchObject({ ok: true, model: 'gpt-6-sol', effort: 'xhigh', modelSource: 'observed' })
  }, 20000)
})

describe('3 no server, unsafe sockets', () => {
  const noServer = (r: Run, path: string, why: string) => {
    expect(r.out.kind).toBe('no-server')
    expect(r.out.message).toContain(`no codex app server at ${path} (${why})`)
    expect(r.out.message).toContain('systemctl --user start codex-consult')
    expect(r.out.message).toContain('systemctl --user status codex-consult')
  }

  test('a missing socket', async () => {
    const path = join(tmp, 'missing.sock')
    noServer(await client(plan({ socket: path } as any, { socket: path })), path, 'missing')
  }, 20000)

  test('a stale socket file with no listener', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cas-'))
    const path = join(dir, 's.sock')
    try {
      expect(spawnSync('python3', ['-I', '-c', 'import socket,sys; s=socket.socket(socket.AF_UNIX); s.bind(sys.argv[1])', path]).status).toBe(0)
      noServer(await client(plan({ socket: path } as any, { socket: path })), path, 'refused')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 20000)

  test('a listener that never answers the upgrade, and a server that never answers initialize', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cas-'))
    const path = join(dir, 's.sock')
    const silent: NetServer = createServer(() => {})
    await new Promise<void>(res => silent.listen(path, res))
    try {
      const r = await client(plan({ socket: path } as any, { socket: path }))
      noServer(r, path, 'no answer in 2s')
      expect(r.ms).toBeLessThan(5000 + 3000)
    } finally {
      silent.close()
      rmSync(dir, { recursive: true, force: true })
    }
    const f = fake({ silentInit: true })
    const r = await client(plan(f))
    noServer(r, f.socket, 'no answer in 5s')
    expect(r.ms).toBeLessThan(5000 + 2000 + 3000)
  }, 30000)

  test('socket-unsafe: a regular file, a symlink to a socket, a world-writable parent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cas-'))
    try {
      const file = join(dir, 'file.sock')
      writeFileSync(file, '')
      const r1 = await client(plan({ socket: file } as any, { socket: file }))
      expect(r1.out).toMatchObject({ kind: 'socket-unsafe' })
      expect(r1.out.message).toMatch(/not a socket.*refuses sockets it cannot trust/)
      const f = fake()
      const link = join(dir, 'link.sock')
      symlinkSync(f.socket, link)
      const r2 = await client(plan(f, { socket: link }))
      expect(r2.out.kind).toBe('socket-unsafe')
      expect(r2.out.message).toMatch(/symlink to .*codex-daemon/)
      chmodSync(f.dir, 0o777)
      const r3 = await client(plan(f))
      expect(r3.out.kind).toBe('socket-unsafe')
      expect(r3.out.message).toMatch(/world-writable \(mode 777\)/)
      chmodSync(f.dir, 0o700)
      expect(f.connections).toBe(0)
      expect(f.frames).toHaveLength(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 20000)

  test("codex's own codex-daemon symlink is followed (0.162.1 binds the socket there)", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cas-'))
    try {
      const link = join(dir, 'c.sock')
      const hash = createHash('sha256').update(link).digest('hex')
      const f = fake({}, d => join(d, `codex-daemon-${process.getuid!()}`, hash))
      symlinkSync(f.socket, link)
      const r = await client(plan(f, { socket: link }))
      expect(r.out).toMatchObject({ ok: true, reply: REPLY })
      // The target's directory and the target itself get the same checks as a plain socket.
      const tdir = join(f.dir, `codex-daemon-${process.getuid!()}`)
      chmodSync(tdir, 0o777)
      const wide = await client(plan(f, { socket: link }))
      expect(wide.out.kind).toBe('socket-unsafe')
      expect(wide.out.message).toMatch(/world-writable \(mode 777\)/)
      chmodSync(tdir, 0o700)
      expect(f.connections).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 20000)

  test('a correctly named codex-daemon link whose target is a regular file is socket-unsafe', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cas-'))
    try {
      const link = join(dir, 'c.sock')
      const tdir = join(dir, `codex-daemon-${process.getuid!()}`)
      mkdirSync(tdir, { mode: 0o700 })
      const target = join(tdir, createHash('sha256').update(link).digest('hex'))
      writeFileSync(target, '')
      symlinkSync(target, link)
      const r = await client(plan({ socket: link } as any, { socket: link }))
      expect(r.out.kind).toBe('socket-unsafe')
      expect(r.out.message).toMatch(/not a socket/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 20000)
})

describe('4-5 refusals before any turn', () => {
  const layer = (keys: Record<string, unknown>, disabledReason: string | null = null) => ({ name: { type: 'project', dotCodexFolder: `${REPO}/.codex` }, config: keys, version: '1', disabledReason })

  test('4 not-locked: config/read {} drift, an enabled project layer, a foreign provider; never a thread/start', async () => {
    const feats = (over: Record<string, boolean>) => ({ ...Object.fromEntries(LOCKED_FEATURES.map(x => [x, false])), ...over })
    const cases: [Scenario, RegExp][] = [
      [{ config: lockedConfig({ features: feats({ plugins: true }) }) }, /features\.plugins is true/],
      [{ config: lockedConfig({ web_search: 'cached' }) }, /web_search is "cached"/],
      [{ config: lockedConfig({ approvals_reviewer: 'auto_review' }) }, /approvals_reviewer is "auto_review"/],
      [{ config: lockedConfig({ tools: { web_search: { context_size: 'low' } } }) }, /tools\.web_search/],
      [{ configCwd: lockedConfig({ web_search: 'live' }) }, /web_search is "live"/],
      [{ layers: [layer({ web_search: 'live' })] }, /\.codex sets web_search; consult refuses trusted repos/],
      [{ config: lockedConfig({ model_provider: 'bedrock' }) }, /bedrock.*OpenAI only/],
    ]
    for (const [s, msg] of cases) {
      const f = fake(s)
      const r = await client(plan(f))
      expect(r.out.kind, JSON.stringify(s)).toBe('not-locked')
      expect(r.out.message).toMatch(msg)
      expect(f.sent('thread/start')).toHaveLength(0)
      expect(f.sent('account/read')).toHaveLength(0)
    }
    // A disabled (untrusted) layer with the same keys passes.
    const ok = fake({ layers: [layer({ web_search: 'live', mcp_servers: { evil: {} } }, 'add it as a trusted project')] })
    expect((await client(plan(ok))).out.ok).toBe(true)
  }, 60000)

  test('5 sandbox, cwd, provider and lockdown mismatches after thread/start send no turn', async () => {
    const cases: [Scenario, string, RegExp][] = [
      [{ threadStart: () => ({ sandbox: { type: 'workspaceWrite', writableRoots: [] } }) }, 'sandbox', /not read-only.*workspaceWrite/],
      [{ threadStart: () => ({ approvalsReviewer: 'auto_review' }) }, 'sandbox', /approvalsReviewer/],
      [{ threadStart: () => ({ cwd: '/home/u' }) }, 'protocol', /runs in "\/home\/u"/],
      [{ threadStart: () => ({ modelProvider: 'other' }) }, 'not-locked', /"other".*OpenAI only/],
      [{ mcpPages: () => [{ data: [{ name: 'github', runtimeStatus: 'connected' }], nextCursor: null }] }, 'lockdown', /github is "connected"/],
      [{ hooks: { data: [{ cwd: REPO, hooks: [{ eventName: 'preToolUse' }], errors: [], warnings: [] }] } }, 'lockdown', /1 hook loaded/],
    ]
    for (const [s, kind, msg] of cases) {
      const f = fake(s)
      const r = await client(diff(f))
      expect(r.out.kind, JSON.stringify(s)).toBe(kind)
      expect(r.out.message).toMatch(msg)
      noTurn(f)
      expect(f.sent('thread/unsubscribe')).toHaveLength(1)
    }
  }, 60000)
})

describe('6-7 server requests', () => {
  const approval = (method: string, params: (t: Turn) => Record<string, unknown>): Scenario => ({
    turn: async t => {
      t.respond()
      t.started()
      await t.request(method, params(t), 1000)
    },
  })

  test('6 a v2 command approval for our thread is cancelled, the turn interrupted, kind sandbox', async () => {
    const f = fake(approval('item/commandExecution/requestApproval', t => ({ threadId: t.threadId, turnId: t.turnId, itemId: 'i1', startedAtMs: 1, command: 'touch pwned.txt' })))
    const r = await client(plan(f))
    expect(r.out).toMatchObject({ ok: false, kind: 'sandbox' })
    expect(r.out.message).toContain('codex asked to run `touch pwned.txt` outside the read-only sandbox')
    expect(f.answersTo('item/commandExecution/requestApproval').map(a => a.msg.result)).toEqual([{ decision: 'cancel' }])
    expect(f.sent('turn/interrupt')).toHaveLength(1)
    expect(f.sent('thread/unsubscribe')).toHaveLength(1)
  }, 20000)

  test('6 a legacy execCommandApproval with our conversationId is aborted', async () => {
    const f = fake(approval('execCommandApproval', t => ({ conversationId: t.threadId, callId: 'c1', command: ['git', 'push'], cwd: REPO, parsedCmd: [] })))
    const r = await client(plan(f))
    expect(r.out.kind).toBe('sandbox')
    expect(r.out.message).toContain('`git push`')
    expect(f.answersTo('execCommandApproval').map(a => a.msg.result)).toEqual([{ decision: 'abort' }])
    expect(f.sent('turn/interrupt')).toHaveLength(1)
  }, 20000)

  test("6 another thread's approvals get no answer and the call goes on", async () => {
    const answers: any[] = []
    const f = fake({
      turn: async t => {
        t.respond()
        t.started()
        answers.push(...(await t.request('item/commandExecution/requestApproval', { threadId: 'thr-someone-else', turnId: 'x', itemId: 'i', startedAtMs: 1, command: 'rm -rf /' }, 700)))
        answers.push(...(await t.request('applyPatchApproval', { conversationId: 'thr-someone-else', callId: 'c', fileChanges: {} }, 700)))
        t.agent(REPLY, 'final_answer')
        t.complete()
      },
    })
    const r = await client(plan(f))
    expect(r.out).toMatchObject({ ok: true, reply: REPLY })
    expect(answers).toHaveLength(0)
    expect(f.sent('turn/interrupt')).toHaveLength(0)
  }, 20000)

  const foreignApproval = { threadId: 'thr-someone-else', turnId: 'x', itemId: 'i', startedAtMs: 1, command: 'rm -rf /' }

  test("6 another thread's approval during stages 0-2 gets no answer, in a call and in --probe; a thread-less one gets -32601", async () => {
    let f: FakeAppServer
    const s: Scenario = {
      threadStart: () => {
        // Sent before the thread/start response, so the client cannot yet know its own thread.
        void f.request('item/commandExecution/requestApproval', foreignApproval, 300)
        return {}
      },
      // Sent before the first mcpServerStatus/list answer: the client knows its thread by then.
      mcpPages: (_t, names) => {
        void f.request('item/commandExecution/requestApproval', foreignApproval, 300)
        void f.request('attestation/generate', {}, 300)
        return [{ data: names.map(name => ({ name, runtimeStatus: 'disabled' })), nextCursor: null }]
      },
    }
    f = fake(s)
    const r = await client(plan(f))
    expect(r.out).toMatchObject({ ok: true, reply: REPLY })
    const p = await client({ cwd: REPO, socket: f.socket }, { probe: true })
    expect(p.out.ok).toBe(true)
    await Bun.sleep(350)
    expect(f.frames.filter(x => x.dir === 'out' && x.msg.method === 'item/commandExecution/requestApproval').length).toBeGreaterThan(2)
    expect(f.answersTo('item/commandExecution/requestApproval')).toHaveLength(0)
    expect(f.answersTo('attestation/generate').map(a => a.msg.error?.code)).toEqual([-32601, -32601])
  }, 20000)

  test('6 an approval for our thread during stage 2 is cancelled and stops the call before the prompt is sent', async () => {
    let f: FakeAppServer
    f = fake({
      mcpPages: (threadId, names) => {
        void f.request('item/fileChange/requestApproval', { threadId, turnId: 'x', itemId: 'i', startedAtMs: 1 }, 300)
        return [{ data: names.map(name => ({ name, runtimeStatus: 'disabled' })), nextCursor: null }]
      },
    })
    const r = await client(plan(f))
    expect(r.out.kind).toBe('sandbox')
    expect(f.answersTo('item/fileChange/requestApproval').map(a => a.msg.result)).toEqual([{ decision: 'cancel' }])
    noTurn(f)
  }, 20000)

  test('6 a completed fileChange fails the call with sandbox', async () => {
    const f = fake({
      turn: t => {
        t.respond()
        t.item({ type: 'fileChange', status: 'completed', changes: [] })
        t.agent(REPLY, 'final_answer')
        t.complete()
      },
    })
    const r = await client(plan(f))
    expect(r.out).toMatchObject({ ok: false, kind: 'sandbox' })
    expect(r.out.items.fileChange.completed).toBe(1)
  }, 20000)

  test('7 an elicitation is declined and the call ends ok with a notice', async () => {
    const answers: any[] = []
    const f = fake({
      turn: async t => {
        t.respond()
        answers.push(...(await t.request('mcpServer/elicitation/request', { threadId: t.threadId, turnId: t.turnId, serverName: 'github', mode: 'form', message: 'token?', requestedSchema: {} }, 700)))
        answers.push(...(await t.request('account/chatgptAuthTokens/refresh', { reason: 'unauthorized' }, 700)))
        t.agent(REPLY, 'final_answer')
        t.complete()
      },
    })
    const r = await client(plan(f))
    expect(r.out).toMatchObject({ ok: true, reply: REPLY })
    expect(r.out.notices.join('\n')).toMatch(/declined an input request from MCP server github/)
    expect(answers.map(a => a.msg.result ?? a.msg.error)).toEqual([{ action: 'decline', content: null }, { code: -32601, message: 'not supported by consult' }])
  }, 20000)

  test('7 not signed in gives auth and an old server gives too-old, before thread/start', async () => {
    const a = fake({ account: { account: null, requiresOpenaiAuth: true } })
    const r1 = await client(plan(a))
    expect(r1.out.kind).toBe('auth')
    expect(a.sent('thread/start')).toHaveLength(0)
    const b = fake({ userAgent: 'consult/0.161.3 (Linux)' })
    const r2 = await client(plan(b))
    expect(r2.out.kind).toBe('too-old')
    expect(r2.out.message).toContain('0.161.3')
    expect(b.sent('config/read')).toHaveLength(0)
  }, 20000)
})

describe('8 turn failures', () => {
  test('failed turns are classified from codexErrorInfo', async () => {
    for (const [info, kind] of [['usageLimitExceeded', 'limit'], ['contextWindowExceeded', 'context'], ['unauthorized', 'auth'], [{ httpConnectionFailed: { httpStatusCode: 502 } }, 'failed']] as const) {
      const f = fake({
        turn: t => {
          t.respond()
          t.complete('failed', { message: 'boom', codexErrorInfo: info })
        },
      })
      const r = await client(plan(f))
      expect(r.out.kind, JSON.stringify(info)).toBe(kind)
    }
  }, 30000)

  test('retry-then-ok: a willRetry error is a notice and the call waits', async () => {
    const f = fake({
      turn: async t => {
        t.respond()
        t.emit('error', { threadId: t.threadId, turnId: t.turnId, willRetry: true, error: { message: 'stream disconnected; retrying' } })
        await Bun.sleep(300)
        t.agent(REPLY, 'final_answer')
        t.complete()
      },
    })
    const r = await client(plan(f))
    expect(r.out).toMatchObject({ ok: true, reply: REPLY })
    expect(r.out.notices.join('\n')).toMatch(/retried after: stream disconnected/)
  }, 20000)

  test('the socket closing mid-turn gives protocol with a journalctl pointer', async () => {
    const f = fake({
      turn: async t => {
        t.respond()
        t.started()
        await Bun.sleep(200)
        f.dropAll()
      },
    })
    const r = await client(plan(f))
    expect(r.out.kind).toBe('protocol')
    expect(r.out.message).toContain('journalctl --user -u codex-consult')
  }, 20000)
})

describe('9 timeout', () => {
  test('the turn is interrupted at the deadline, the thread unsubscribed, and the server keeps serving', async () => {
    const f = fake({
      turn: async t => {
        t.respond()
        t.started()
        await t.interrupted
      },
    })
    const r = await client(plan(f, { timeoutSec: 3 }))
    expect(r.out).toMatchObject({ ok: false, kind: 'timeout' })
    expect(r.out.message).toBe('codex did not finish within 3s; consult interrupted the turn')
    expect(f.sent('turn/interrupt')[0]!.msg.params).toEqual({ threadId: f.turns[0]!.threadId, turnId: f.turns[0]!.turnId })
    expect(f.sent('thread/unsubscribe')).toHaveLength(1)
    expect(r.ms).toBeLessThan(3000 + 3000)
    f.scenario.turn = undefined
    expect((await client(plan(f))).out).toMatchObject({ ok: true, reply: REPLY })
  }, 20000)

  test('an unconfirmed interrupt still exits within timeoutSec + 2 + 5 + 2 s', async () => {
    const f = fake({ confirmInterrupt: false, turn: t => t.respond() })
    const r = await client(plan(f, { timeoutSec: 3 }))
    expect(r.out.kind).toBe('timeout')
    expect(r.out.message).toMatch(/did not confirm the interrupt; if it stays busy, run systemctl --user restart codex-consult/)
    expect(f.sent('turn/interrupt')).toHaveLength(1)
    expect(r.ms).toBeLessThan((3 + 2 + 5 + 2) * 1000 + 2000)
  }, 30000)

  test('a start response that never arrives: wait 2 s, then say the turn may still start', async () => {
    const f = fake({ turn: () => {} })
    const r = await client(plan(f, { timeoutSec: 3 }))
    expect(r.out.kind).toBe('timeout')
    expect(r.out.message).toMatch(/may still start on the server/)
    expect(f.sent('turn/interrupt')).toHaveLength(0)
    expect(r.ms).toBeGreaterThan(4900)
    expect(r.ms).toBeLessThan(3000 + 2000 + 2000 + 2000)
  }, 30000)

  test('under 2 s left before stage 3: timeout with no review started, and no prompt sent', async () => {
    const f = fake()
    const r = await client(plan(f, { timeoutSec: 1 }))
    expect(r.out.kind).toBe('timeout')
    expect(r.out.message).toMatch(/no review was started/)
    noTurn(f)
    expect(f.sent('thread/unsubscribe')).toHaveLength(1)
  }, 20000)
})

describe('10 concurrency', () => {
  test('two calls on one server each get only their own reply and answer only their own requests', async () => {
    const answered: { owner: number; answers: number[] }[] = []
    const f = fake({
      turn: async t => {
        t.respond()
        await until(() => f.turns.length === 2)
        t.started()
        await Bun.sleep(50)
        const a = await t.request('item/tool/call', { threadId: t.threadId, turnId: t.turnId, callId: `c-${t.turnId}`, tool: 'x', arguments: {} }, 700)
        answered.push({ owner: t.conn, answers: a.map(x => x.conn) })
        if (t.method === 'review/start') t.item({ type: 'exitedReviewMode', review: `review for ${t.turnId}` })
        else t.agent(`plan for ${t.turnId}`, 'final_answer')
        await Bun.sleep(50)
        t.complete()
      },
    })
    const [p, d] = await Promise.all([client(plan(f)), client(diff(f))])
    const planTurn = f.turns.find(t => t.method === 'turn/start')!
    const reviewTurn = f.turns.find(t => t.method === 'review/start')!
    expect(p.out).toMatchObject({ ok: true, reply: `plan for ${planTurn.turnId}` })
    expect(d.out).toMatchObject({ ok: true, reply: `review for ${reviewTurn.turnId}` })
    expect(answered).toHaveLength(2)
    for (const a of answered) expect(a.answers).toEqual([a.owner])
    expect(planTurn.threadId).not.toBe(reviewTurn.threadId)
  }, 30000)
})

describe('11 bounds and --probe', () => {
  test('a 200 KB reply keeps the line under 48,000 bytes and parseable', async () => {
    const unit = 'quote " newline \n tab \t é € 😀 '
    const f = fake({
      turn: t => {
        t.respond()
        t.agent(unit.repeat(Math.ceil(200_000 / unit.length)), 'final_answer')
        t.complete()
      },
    })
    const r = await client(plan(f))
    expect(utf8Bytes(r.raw.trimEnd())).toBeLessThanOrEqual(MAX_LINE_BYTES)
    expect(r.out.ok).toBe(true)
    expect(r.out.reply).toMatch(/\[reply truncated at \d+ characters to fit the consult output limit\]$/)
  }, 20000)

  test('--probe runs stages 0-2, starts no turn, and leaks no email', async () => {
    const f = fake()
    const r = await client({ cwd: REPO, socket: f.socket }, { probe: true })
    expect(r.out).toMatchObject({
      ok: true, socket: f.socket, version: '0.162.1', signedIn: true, accountType: 'chatgpt', locked: true, projectLayers: [],
      sandbox: { type: 'readOnly', networkAccess: false }, approvalPolicy: 'never', modelProvider: 'openai', cwd: REPO,
      instructionSources: ['/home/u/.codex/AGENTS.md'], mcp: [{ name: 'github', runtimeStatus: 'disabled' }, { name: 'notes', runtimeStatus: 'disabled' }], hooks: 0,
    })
    noTurn(f)
    expect(f.sent('thread/unsubscribe')).toHaveLength(1)
    expect(r.raw).not.toContain('secret-user@example.com')
    expect(r.stderr).not.toContain('secret-user@example.com')
  }, 20000)

  test('--probe without a login still reports, signed out', async () => {
    const f = fake({ account: { account: null, requiresOpenaiAuth: true } })
    const r = await client({ cwd: REPO, socket: f.socket }, { probe: true })
    expect(r.out).toMatchObject({ ok: true, signedIn: false, accountType: null })
  }, 20000)
})

describe('12 request validation and the opt-out marker', () => {
  test('bad requests are input errors before any connect', async () => {
    const f = fake()
    const bad: Record<string, unknown>[] = [
      { mode: 'review' }, { cwd: 'relative/dir' }, { model: '--x' }, { timeoutSec: 999 },
      { socket: 'relative.sock' }, { socket: '/' + 'x'.repeat(199) }, { socket: '/tmp/a\nb.sock' }, { socket: '/tmp/x?y.sock' }, { socket: '/tmp/a b.sock' }, { socket: '/tmp/a#b.sock' },
      { cwd: join(REPO, 'missing') },
    ]
    for (const over of bad) {
      const r = await client(plan(f, over))
      expect(r.out.kind, JSON.stringify(over)).toBe('input')
    }
    expect((await client('not json')).out.kind).toBe('input')
    expect(f.frames).toHaveLength(0)
  }, 60000)

  test('a symlinked cwd is refused: the client needs the resolved repo', async () => {
    const f = fake()
    const link = join(tmp, `link${n++}`)
    symlinkSync(REPO, link)
    const r = await client(plan(f, { cwd: link }))
    expect(r.out.kind).toBe('input')
    expect(r.out.message).toMatch(/resolved path/)
    expect(f.frames).toHaveLength(0)
  }, 20000)

  test('.claude/no-external-review at the toplevel stops a call and a probe from a subdirectory', async () => {
    const f = fake()
    const repo = newRepo()
    mkdirSync(join(repo, '.claude'))
    writeFileSync(join(repo, '.claude', 'no-external-review'), '')
    const r = await client(plan(f, { cwd: join(repo, 'sub') }))
    expect(r.out.kind).toBe('input')
    expect(r.out.message).toMatch(/external review disabled for this repo/)
    const p = await client({ cwd: join(repo, 'sub'), socket: f.socket }, { probe: true })
    expect(p.out.kind).toBe('input')
    expect(f.frames).toHaveLength(0)
  }, 20000)

  test("a worktree is stopped by its main checkout's marker", async () => {
    const f = fake()
    const main = newRepo()
    mkdirSync(join(main, '.git', 'worktrees', 'wt'), { recursive: true })
    writeFileSync(join(main, '.git', 'worktrees', 'wt', 'commondir'), '../..\n')
    const wt = join(tmp, `wt${n++}`)
    mkdirSync(wt)
    writeFileSync(join(wt, '.git'), `gitdir: ${join(main, '.git', 'worktrees', 'wt')}\n`)
    expect((await client(plan(f, { cwd: wt }))).out.ok).toBe(true)
    mkdirSync(join(main, '.claude'))
    writeFileSync(join(main, '.claude', 'no-external-review'), '')
    expect((await client(plan(f, { cwd: wt }))).out.kind).toBe('input')
  }, 20000)
})

describe('13 README unit drift', () => {
  test('the README example unit carries the flags, socket and settings that the client checks', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
    const section = readme.slice(readme.indexOf('## Run the codex app server'))
    const block = /```ini\n([\s\S]*?)```/.exec(section)?.[1]
    expect(block, 'an ini block under "Run the codex app server"').toBeDefined()
    const unit = block!.replace(/\\\n\s*/g, ' ')
    const exec = /^ExecStart=(.*)$/m.exec(unit)?.[1] ?? ''
    expect(exec).toContain(`codex app-server --listen unix://%t/${DEFAULT_SOCKET_NAME}`)
    const tokens = exec.split(/\s+/)
    const disabled = tokens.flatMap((t, i) => (t === '--disable' ? [tokens[i + 1]] : []))
    for (const f of CLIENT_LOCKED_FEATURES) expect(disabled, `--disable ${f}`).toContain(f)
    for (const [key, value] of [['web_search', 'disabled'], ['sandbox_mode', 'read-only'], ['approval_policy', 'never'], ['approvals_reviewer', 'user']]) {
      expect(exec, key).toContain(`-c '${key}="${value}"'`)
    }
    expect(unit).toContain(`ExecStopPost=-/usr/bin/rm -f %t/${DEFAULT_SOCKET_NAME}`)
    expect(unit).not.toMatch(/^\s*PrivateTmp\s*=\s*(yes|true|1)\s*$/im)
  })
})

describe('14 notifications before the response', () => {
  const early = (review: boolean, over?: Record<string, unknown>) => async (t: Turn) => {
    t.started()
    if (review) t.item({ type: 'exitedReviewMode', review: 'early review' })
    else t.agent('early answer', 'final_answer')
    t.complete()
    await Bun.sleep(150)
    t.respond(over)
  }

  test('turn/start: started, an item and turn/completed before the response still give the reply', async () => {
    const f = fake({ turn: early(false) })
    expect((await client(plan(f))).out).toMatchObject({ ok: true, reply: 'early answer' })
    expect(f.sent('turn/interrupt')).toHaveLength(0)
  }, 20000)

  test('review/start: the same', async () => {
    const f = fake({ turn: early(true) })
    expect((await client(diff(f))).out).toMatchObject({ ok: true, reply: 'early review' })
  }, 20000)

  test('review/start answering another reviewThreadId is a protocol error', async () => {
    const f = fake({ turn: early(true, { reviewThreadId: 'thr-detached' }) })
    const r = await client(diff(f))
    expect(r.out.kind).toBe('protocol')
    expect(r.out.message).toMatch(/detached thread thr-detached, not on our thread thr-/)
    expect(f.sent('turn/interrupt').map(x => x.msg.params)).toEqual([{ threadId: 'thr-detached', turnId: f.turns[0]!.turnId }])
  }, 20000)
})

describe('15 signals', () => {
  test('SIGTERM interrupts the turn, prints the signal result and exits within 3 s', async () => {
    const f = fake({
      confirmInterrupt: false,
      turn: t => {
        t.respond()
        t.started()
      },
    })
    let signalledAt = 0
    const r = await client(plan(f), {
      signal: async proc => {
        await until(() => f.turns.length === 1, 8000)
        await Bun.sleep(1000)
        signalledAt = Date.now()
        proc.kill('SIGTERM')
        await proc.exited
      },
    })
    const exitedAfter = Date.now() - signalledAt
    expect(r.out).toEqual({ ok: false, kind: 'timeout', message: SIGNAL_MESSAGE, log: expect.any(String) })
    expect(f.sent('turn/interrupt')).toHaveLength(1)
    expect(r.code).toBe(0)
    expect(exitedAfter).toBeLessThan(3000)
  }, 20000)
})
