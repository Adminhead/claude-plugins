// consult's codex client: one review against the user's running, locked `codex app-server` (systemd user unit
// codex-consult), over JSON-RPC on a WebSocket on a unix socket. It never starts codex and spawns nothing.
//
//   bun --no-env-file --config=/dev/null scripts/codex-app-server.ts            request JSON on stdin
//   bun --no-env-file --config=/dev/null scripts/codex-app-server.ts --probe    stages 0-2 only, no turn
//
// Prints one JSON line on stdout and exits 0. The protocol logic lives in ../hooks/consult/appserver.ts; this file
// does the I/O: stdin, lstat/realpath, the WebSocket, timers and signals.
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync, statSync } from 'node:fs'
import {
  answerServerRequest, checkAccount, checkDaemonLink, checkSocketPath, isSymlink, checkClientRequest, checkCwd, checkLockdown, checkProbeRequest, checkProjectLayers, checkProvider,
  checkReadOnly, checkServerRequired, checkSocketStat, checkThreadLocks, checkVersion, CLOSE_MS, CONNECT_MS, effectivePolicy, FEATURE_PAGE_LIMIT, INIT_MS, initializeParams,
  INTERRUPT_GRACE_SEC, LOG_CHARS, Matcher, MAX_FEATURE_PAGES, MAX_FRAME_BYTES, MAX_LINE_BYTES, MAX_REQUEST_BYTES, mcpServerNames, mergeServerLocks, newTurnState,
  noServerMessage, observedModel, projectLayers, reduce, resolveSocket, reviewStartParams, SIGNAL_MESSAGE, snippet, socketDir, socketUnsafe, threadStartParams,
  timeoutMessage, TURN_ID_WAIT_MS, turnOutcome, turnStartParams, UNIT_NAME, untestedHint, utf8Bytes, fitLine, type ClientRequest, type ClientResult,
  type Fail, type FeatureRead, type Items, type LockPolicy, type LockPolicyOption, type Msg, type ServerLocks,
} from '../hooks/consult/appserver'

const PROBE_SEC = 60
const MAX_MCP_PAGES = 20
const MARKER = '.claude/no-external-review'

class Stop extends Error {
  constructor(readonly fail: Fail) {
    super(fail.message)
  }
}
// The server answered a call with a JSON-RPC error.
class Refused extends Stop {}
class CallTimeout extends Error {}
const stop = (kind: Fail['kind'], message: string): never => {
  throw new Stop({ kind, message })
}

const started = Date.now()
let deadline = started + PROBE_SEC * 1000
let version = ''
const lines: string[] = []
const log = (s: string) => {
  lines.push(snippet(s, 300))
  if (lines.length > 100) lines.shift()
}
const logText = () => lines.join('\n').slice(-LOG_CHARS)

// --- events: one poke wakes every waiter, which re-checks its condition ---------------------------------------

const waiters = new Set<() => void>()
const poke = () => {
  for (const w of [...waiters]) w()
}
function waitFor(cond: () => boolean, ms: number): Promise<boolean> {
  if (cond()) return Promise.resolve(true)
  return new Promise(res => {
    const done = (v: boolean) => {
      clearTimeout(timer)
      waiters.delete(check)
      res(v)
    }
    const check = () => {
      if (cond()) done(true)
    }
    const timer = setTimeout(() => done(cond()), Math.max(0, ms))
    waiters.add(check)
  })
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// --- the connection -----------------------------------------------------------------------------------------

type Pending = { method: string; resolve: (v: any) => void; reject: (e: Error) => void; timer?: ReturnType<typeof setTimeout> }

class Conn {
  private next = 1
  private pending = new Map<number, Pending>()
  lost: Fail | undefined
  onNotification: (m: Msg) => void = () => {}
  onRequest: (id: unknown, method: string, params: unknown) => void = (id, method, params) => answerRequest(this, id, method, params)

  private constructor(private ws: WebSocket) {
    ws.onmessage = ev => this.receive(ev.data)
    ws.onclose = () => this.die({ kind: 'protocol', message: `the ${UNIT_NAME} server closed the connection; check journalctl --user -u ${UNIT_NAME}${untestedHint(version || '0.0.0')}` })
    ws.onerror = () => this.die({ kind: 'protocol', message: `the connection to the ${UNIT_NAME} server failed; check journalctl --user -u ${UNIT_NAME}` })
  }

  // `path` is what the messages name; `connectTo` is the checked socket behind it.
  static open(connectTo: string, path: string): Promise<Conn> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket
      try {
        ws = new WebSocket(`ws+unix://${connectTo}`)
      } catch {
        return reject(new Stop({ kind: 'no-server', message: noServerMessage(path, 'refused') }))
      }
      const timer = setTimeout(() => {
        ws.onopen = ws.onerror = ws.onclose = null
        try {
          ws.close()
        } catch {}
        reject(new Stop({ kind: 'no-server', message: noServerMessage(path, 'no answer in 2s') }))
      }, CONNECT_MS)
      ws.onopen = () => {
        clearTimeout(timer)
        resolve(new Conn(ws))
      }
      ws.onerror = ws.onclose = () => {
        clearTimeout(timer)
        reject(new Stop({ kind: 'no-server', message: noServerMessage(path, 'refused') }))
      }
    })
  }

  private die(f: Fail) {
    if (this.lost) return
    this.lost = f
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(new Stop(f))
    }
    this.pending.clear()
    try {
      this.ws.close()
    } catch {}
    poke()
  }

  private receive(data: unknown) {
    if (typeof data !== 'string') return this.die({ kind: 'protocol', message: 'the codex app server sent a binary frame' })
    if (data.length > MAX_FRAME_BYTES) return this.die({ kind: 'protocol', message: `the codex app server sent a frame over ${MAX_FRAME_BYTES} bytes` })
    let m: any
    try {
      m = JSON.parse(data)
    } catch {
      return this.die({ kind: 'protocol', message: 'the codex app server sent a frame that is not JSON' })
    }
    if (typeof m !== 'object' || m === null) return
    if (typeof m.method === 'string' && m.id !== undefined) this.onRequest(m.id, m.method, m.params)
    else if (typeof m.method === 'string') this.onNotification(m)
    else if (typeof m.id === 'number') {
      const p = this.pending.get(m.id)
      if (!p) return
      this.pending.delete(m.id)
      clearTimeout(p.timer)
      if (m.error !== undefined) {
        const msg = snippet(typeof m.error === 'object' && m.error !== null ? m.error.message : m.error, 300)
        p.reject(new Refused({ kind: 'protocol', message: `codex refused ${p.method}: ${msg}${untestedHint(version || '0.0.0')}` }))
      } else p.resolve(m.result)
    }
    poke()
  }

  private send(msg: object) {
    if (this.lost) throw new Stop(this.lost)
    this.ws.send(JSON.stringify(msg))
  }

  call(method: string, params: unknown, ms = Infinity): Promise<any> {
    return new Promise((resolve, reject) => {
      if (this.lost) return reject(new Stop(this.lost))
      const id = this.next++
      const p: Pending = { method, resolve, reject }
      if (Number.isFinite(ms)) {
        p.timer = setTimeout(() => {
          this.pending.delete(id)
          reject(new CallTimeout(method))
        }, Math.max(0, ms))
      }
      this.pending.set(id, p)
      log(`-> ${method}`)
      this.send({ id, method, params })
    })
  }

  notify(method: string, params?: unknown) {
    this.send(params === undefined ? { method } : { method, params })
  }

  reply(id: unknown, result: unknown) {
    if (!this.lost) this.ws.send(JSON.stringify({ id, result }))
  }

  replyError(id: unknown, code: number, message: string) {
    if (!this.lost) this.ws.send(JSON.stringify({ id, error: { code, message } }))
  }

  close() {
    try {
      this.ws.close()
    } catch {}
  }
}

// Server requests in every stage. Another thread's request gets no answer: before our thread exists every
// thread-scoped request is another's. A thread-less or unknown one gets -32601. Ours get the answer table; a
// failure is kept in `requestFailure` (stage 3 interrupts on it, earlier stages stop on it).
const NO_THREAD = '\u0000no thread yet'
let requestFailure: Fail | undefined
const requestNotices: string[] = []
function answerRequest(c: Conn, id: unknown, method: string, params: unknown) {
  const a = answerServerRequest(method, params, threadId ?? NO_THREAD)
  if (a === null) return log(`left ${snippet(method, 60)} for another thread`)
  if ('error' in a) return c.replyError(id, a.error.code, a.error.message)
  c.reply(id, a.result)
  log(`answered ${snippet(method, 60)}`)
  if (a.notice && requestNotices.length < 20) requestNotices.push(a.notice)
  if (a.fail && !requestFailure) requestFailure = a.fail
  poke()
}

// --- local checks -------------------------------------------------------------------------------------------

function checkRepo(cwd: string) {
  let real: string
  try {
    real = realpathSync(cwd)
    if (!statSync(real).isDirectory()) stop('input', `cwd is not a directory: ${snippet(cwd, 300)}`)
  } catch (e) {
    if (e instanceof Stop) throw e
    return stop('input', `no such directory: ${snippet(cwd, 300)}`)
  }
  if (real !== cwd) stop('input', `cwd must be a resolved path (${snippet(cwd, 300)} resolves to ${snippet(real, 300)})`)
  const blocked = (dir: string) => {
    if (existsSync(`${dir}/${MARKER}`)) stop('input', `external review disabled for this repo (${snippet(dir, 300)}/${MARKER})`)
  }
  // From cwd up to the git toplevel (or / outside git), as PREFLIGHT does; a worktree also checks its main checkout.
  for (let dir = cwd; ; dir = socketDir(dir)) {
    blocked(dir)
    const git = `${dir}/.git`
    if (existsSync(git)) {
      try {
        if (lstatSync(git).isFile()) {
          const gitdir = /^gitdir: (.+)$/m.exec(readFileSync(git, 'utf8').slice(0, 4096))?.[1]?.trim()
          if (gitdir) {
            const abs = gitdir.startsWith('/') ? gitdir : `${dir}/${gitdir}`
            const common = existsSync(`${abs}/commondir`) ? readFileSync(`${abs}/commondir`, 'utf8').trim() : ''
            if (common) blocked(socketDir(realpathSync(common.startsWith('/') ? common : `${abs}/${common}`)))
          }
        }
      } catch (e) {
        if (e instanceof Stop) throw e
      }
      break
    }
    if (dir === '/') break
  }
}

const lstatOr = (p: string, path: string, what: string) => {
  try {
    return lstatSync(p)
  } catch (e: any) {
    if (e?.code === 'ENOENT' || e?.code === 'ENOTDIR') stop('no-server', noServerMessage(path, 'missing'))
    throw new Stop(socketUnsafe(path, `cannot stat ${what} (${snippet(e?.code ?? e, 40)})`))
  }
}

// Checks the socket and its directory and returns the path to connect to: the socket itself, or the target of
// codex's own codex-daemon symlink.
function checkSocketFile(path: string): string {
  const uid = process.getuid!()
  const sock = lstatOr(path, path, 'the socket')
  const dir = socketDir(path)
  const parent = lstatOr(dir, path, 'the socket directory')
  if (realpathSync(dir) !== dir) throw new Stop(socketUnsafe(path, 'the socket directory has a symlinked ancestor'))
  if (!isSymlink(sock)) {
    const bad = checkSocketStat(sock, parent, uid, path)
    if (bad) throw new Stop(bad)
    return path
  }
  const target = readlinkSync(path)
  const link = checkDaemonLink(sock, parent, uid, path, target, new Bun.CryptoHasher('sha256').update(path).digest('hex')) ?? checkSocketPath(target)
  if (link) throw new Stop(link.kind === 'input' ? socketUnsafe(path, link.message) : link)
  const tdir = socketDir(target)
  const bad = checkSocketStat(lstatOr(target, path, 'the socket target'), lstatOr(tdir, path, 'the socket target directory'), uid, target)
  if (bad) throw new Stop(bad)
  if (realpathSync(tdir) !== tdir) throw new Stop(socketUnsafe(path, 'the socket target directory has a symlinked ancestor'))
  return target
}

function pluginVersion(): string {
  try {
    const v = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8')).version
    return typeof v === 'string' ? v : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

// --- stages 0-2 ---------------------------------------------------------------------------------------------

type Ready = {
  conn: Conn
  socket: string
  untested: boolean
  locks: ServerLocks
  account: { signedIn: boolean; accountType: string | null }
  layers: ReturnType<typeof projectLayers>
  cfgCwd: any
  threadStart: any
  threadId: string
  matcher: Matcher
  mcp: { name: string; runtimeStatus: unknown }[]
  hooks: number
  notices: string[]
}

let conn: Conn | undefined
let threadId: string | undefined
// Set once the thread exists, so notifications buffered from then on reach the matcher.
let onOurs: (m: Msg) => void = () => {}

async function rpc(method: string, params: unknown, cap = Infinity): Promise<any> {
  const rem = deadline - Date.now()
  try {
    return await conn!.call(method, params, Math.min(cap, rem))
  } catch (e) {
    if (e instanceof CallTimeout && rem <= cap) stop('timeout', `codex did not answer ${method} before the deadline; no review was started`)
    if (e instanceof CallTimeout) stop('protocol', `codex did not answer ${method} within ${Math.round(cap / 1000)}s${untestedHint(version || '0.0.0')}`)
    throw e
  }
}

// experimentalFeature/list {threadId}, paged to the end or to MAX_FEATURE_PAGES. A JSON-RPC error is kept for
// checkThreadLocks, which fails closed on it; a lost connection or a timeout stops the call as usual.
async function readFeatures(threadId: string): Promise<FeatureRead> {
  const pages: unknown[] = []
  let cursor: string | undefined
  for (let i = 0; i < MAX_FEATURE_PAGES; i++) {
    let page: any
    try {
      page = await rpc('experimentalFeature/list', { threadId, limit: FEATURE_PAGE_LIMIT, ...(cursor ? { cursor } : {}) })
    } catch (e) {
      if (e instanceof Refused) return { pages, ended: false, error: e.fail.message }
      throw e
    }
    pages.push(page)
    cursor = typeof page?.nextCursor === 'string' && page.nextCursor !== '' ? page.nextCursor : undefined
    if (!cursor) return { pages, ended: true }
  }
  return { pages, ended: false }
}

async function prepare(cwd: string, socketOption: string | undefined, o: { probe: boolean; policy?: LockPolicyOption; model?: string; effort?: string }): Promise<Ready> {
  const policy: LockPolicy = effectivePolicy(o.policy)
  checkRepo(cwd)
  const resolved = resolveSocket(socketOption, process.env.XDG_RUNTIME_DIR)
  if ('kind' in resolved) throw new Stop(resolved)
  const socket = resolved.socket
  const connectTo = checkSocketFile(socket)

  // Stage 0: connect and handshake.
  conn = await Conn.open(connectTo, socket)
  conn.onNotification = m => onOurs(m)
  let init: any
  try {
    init = await conn.call('initialize', initializeParams(pluginVersion()), INIT_MS)
  } catch (e) {
    if (e instanceof CallTimeout) stop('no-server', noServerMessage(socket, 'no answer in 5s'))
    throw e
  }
  const v = checkVersion(init?.userAgent)
  if ('kind' in v) throw new Stop(v)
  version = v.version
  conn.notify('initialized')

  // Stage 1: config only; nothing has gone to OpenAI yet.
  const read0 = await rpc('config/read', {})
  const cfg0 = read0?.config
  const locks0 = checkServerRequired(cfg0, read0?.origins, policy, version)
  if ('kind' in locks0) throw new Stop(locks0)
  const provider0 = checkProvider(cfg0)
  if (provider0) throw new Stop(provider0)
  const withCwd = await rpc('config/read', { cwd, includeLayers: true })
  const locksCwd = checkServerRequired(withCwd?.config, withCwd?.origins, policy, version)
  if ('kind' in locksCwd) throw new Stop(locksCwd)
  const lockedCwd = checkProjectLayers(withCwd?.layers) ?? checkProvider(withCwd?.config)
  if (lockedCwd) throw new Stop(lockedCwd)
  const locks = mergeServerLocks(locks0, locksCwd)
  const acct = checkAccount(await rpc('account/read', { refreshToken: false }))
  let account: Ready['account']
  if ('kind' in acct) {
    if (!o.probe) throw new Stop(acct)
    account = { signedIn: false, accountType: null }
  } else account = acct

  // Stage 2: the thread (codex may open its warmup connection here), then the asserts.
  const ts = await rpc('thread/start', threadStartParams({ cwd, model: o.model, effort: o.effort }, mcpServerNames(withCwd?.config)))
  const id = ts?.thread?.id
  if (typeof id !== 'string' || id === '') stop('protocol', 'thread/start returned no thread id')
  threadId = id
  const matcher = new Matcher(id)
  onOurs = m => matcher.push(m)
  const asserted = checkReadOnly(ts) ?? checkCwd(ts, cwd) ?? checkProvider(cfg0, ts)
  if (asserted) throw new Stop(asserted)
  // The T keys of the feature list, read back for this thread; strict requires them of the server instead.
  if (policy === 'thread') {
    const threadLocks = checkThreadLocks(await readFeatures(id), locks.trusted)
    if (threadLocks) throw new Stop(threadLocks)
  }
  const pages: any[] = []
  let cursor: string | undefined
  for (let i = 0; i < MAX_MCP_PAGES; i++) {
    const page = await rpc('mcpServerStatus/list', { threadId: id, detail: 'toolsAndAuthOnly', ...(cursor ? { cursor } : {}) })
    pages.push(page)
    cursor = typeof page?.nextCursor === 'string' && page.nextCursor !== '' ? page.nextCursor : undefined
    if (!cursor) break
  }
  if (cursor) stop('lockdown', `mcpServerStatus/list did not end within ${MAX_MCP_PAGES} pages`)
  const hooks = await rpc('hooks/list', { cwds: [cwd] })
  const lockdown = checkLockdown(pages, hooks)
  if (lockdown) throw new Stop(lockdown)
  if (requestFailure) throw new Stop(requestFailure)

  const notices: string[] = []
  const sources = Array.isArray(ts.instructionSources) ? ts.instructionSources.filter((s: unknown) => typeof s === 'string') : []
  if (sources.length > 0) notices.push(`AGENTS.md loaded: ${snippet(sources.join(', '), 600)}`)
  return {
    conn,
    socket,
    untested: v.untested,
    locks,
    account,
    layers: projectLayers(withCwd?.layers),
    cfgCwd: withCwd?.config,
    threadStart: ts,
    threadId: id,
    matcher,
    mcp: pages.flatMap(p => (Array.isArray(p?.data) ? p.data : [])).slice(0, 50).map((s: any) => ({ name: snippet(s?.name, 60), runtimeStatus: s?.runtimeStatus ?? null })),
    hooks: Array.isArray(hooks?.data) ? hooks.data.reduce((n: number, e: any) => n + (Array.isArray(e?.hooks) ? e.hooks.length : 0), 0) : 0,
    notices,
  }
}

// --- stage 3: the turn --------------------------------------------------------------------------------------

let turnId: string | undefined
// The thread the turn runs on when review/start detached it from ours.
let turnThread: string | undefined
let turnDone = () => false
const MIN_TURN_MS = 2000

async function review(req: ClientRequest, r: Ready): Promise<ClientResult> {
  const state = newTurnState()
  const observed: Msg[] = []
  let failure: Fail | undefined
  const handle = (msgs: Msg[]) => {
    for (const m of msgs) {
      reduce(state, m)
      if (m.method === 'model/rerouted' || m.method === 'thread/settings/updated') observed.push(m)
    }
    if (state.violation && !failure) failure = state.violation
  }
  onOurs = m => handle(r.matcher.push(m))
  turnDone = () => r.matcher.done
  if (requestFailure) throw new Stop(requestFailure)
  // The prompt leaves only with time for the turn to start and be interrupted cleanly.
  if (deadline - Date.now() < MIN_TURN_MS) stop('timeout', `codex took the whole deadline to get ready (under ${MIN_TURN_MS / 1000}s left of ${req.timeoutSec}s); no review was started`)
  // Notifications buffered since thread/start are in the matcher; it replays them at setTurn.
  const method = req.mode === 'plan' ? 'turn/start' : 'review/start'
  const params = req.mode === 'plan' ? turnStartParams(req, r.threadId) : reviewStartParams(req, r.threadId)
  let startError: Fail | undefined
  r.conn
    .call(method, params)
    .then(resp => {
      const id = resp?.turn?.id
      if (typeof id !== 'string' || id === '') startError = { kind: 'protocol', message: `${method} returned no turn id` }
      else {
        if (req.mode === 'diff' && resp.reviewThreadId !== r.threadId) {
          const other = typeof resp.reviewThreadId === 'string' && resp.reviewThreadId !== '' ? resp.reviewThreadId : undefined
          if (other) turnThread = other
          failure ??= { kind: 'protocol', message: `review/start ran the review on detached thread ${snippet(resp.reviewThreadId, 80)}, not on our thread ${r.threadId}; consult expects an inline review` }
        }
        turnId = id
        handle(r.matcher.setTurn(id))
      }
      poke()
    })
    .catch(e => {
      startError = e instanceof Stop ? e.fail : { kind: 'protocol', message: String(e) }
      poke()
    })

  const finished = await waitFor(() => r.matcher.done || !!failure || !!requestFailure || !!startError || !!r.conn.lost, deadline - Date.now())
  const items: Items = state.items
  const fails = (f: Fail): ClientResult => ({ ok: false, kind: f.kind, message: f.message, log: logText(), items })
  failure ??= requestFailure

  if (r.conn.lost) return fails(r.conn.lost)
  if (startError) return fails(startError)
  if (failure) {
    const i = await interrupt(r)
    return fails(i.confirmed ? failure : { ...failure, message: `${failure.message}; the server did not confirm the interrupt` })
  }
  if (finished && r.matcher.done) {
    const out = turnOutcome(state, req.mode)
    if ('kind' in out) return fails(out)
    const m = observedModel(observed, { threadId: r.threadId, mode: req.mode, requested: { model: req.model, effort: req.effort }, config: r.cfgCwd, threadStart: r.threadStart })
    return {
      ok: true,
      reply: out.reply,
      model: m.model,
      effort: m.effort,
      modelSource: m.modelSource,
      provider: String(r.threadStart.modelProvider),
      version,
      durationMs: Date.now() - started,
      notices: [...r.notices, ...requestNotices, ...state.notices].slice(0, 30),
      items,
    }
  }
  const i = await interrupt(r)
  return fails({ kind: 'timeout', message: timeoutMessage(req.timeoutSec, i) })
}

// Interrupts our turn and waits for its turn/completed. Never kills the server. A turn on a detached review
// thread is interrupted there; its completion is not ours to watch, so the interrupt's answer confirms it.
async function interrupt(r: Ready): Promise<{ turnKnown: boolean; confirmed: boolean }> {
  if (turnId === undefined) await waitFor(() => turnId !== undefined || !!r.conn.lost, TURN_ID_WAIT_MS)
  if (turnId === undefined || r.conn.lost) return { turnKnown: turnId !== undefined, confirmed: false }
  const sent = r.conn.call('turn/interrupt', { threadId: turnThread ?? r.threadId, turnId }, INTERRUPT_GRACE_SEC * 1000).then(
    () => true,
    () => false,
  )
  if (turnThread !== undefined && turnThread !== r.threadId) return { turnKnown: true, confirmed: await sent }
  const confirmed = await waitFor(() => r.matcher.done || !!r.conn.lost, INTERRUPT_GRACE_SEC * 1000)
  return { turnKnown: true, confirmed: confirmed && r.matcher.done }
}

// Unsubscribes and closes, bounded at CLOSE_MS in total.
async function close() {
  const c = conn
  if (!c) return
  if (threadId !== undefined && !c.lost) await Promise.race([c.call('thread/unsubscribe', { threadId }, CLOSE_MS).catch(() => {}), sleep(CLOSE_MS)])
  c.close()
}

// --- main ---------------------------------------------------------------------------------------------------

let printed = false
async function print(line: string) {
  if (printed) return
  printed = true
  await Bun.write(Bun.stdout, line + '\n')
}

let stopping = false
async function onSignal() {
  if (stopping) return
  stopping = true
  const c = conn
  if (c && !c.lost && threadId !== undefined && turnId !== undefined && !turnDone()) {
    await Promise.race([c.call('turn/interrupt', { threadId: turnThread ?? threadId, turnId }, 2000).catch(() => {}), sleep(2000)])
  }
  if (c && !c.lost && threadId !== undefined) c.call('thread/unsubscribe', { threadId }, 500).catch(() => {})
  c?.close()
  await print(fitLine({ ok: false, kind: 'timeout', message: SIGNAL_MESSAGE, log: logText() }))
  process.exit(0)
}

async function readRequest(): Promise<unknown> {
  const text = await Bun.stdin.text()
  if (utf8Bytes(text) > MAX_REQUEST_BYTES) stop('input', `the request is over ${MAX_REQUEST_BYTES} bytes`)
  try {
    return JSON.parse(text.trim() === '' ? '{}' : text)
  } catch {
    return stop('input', 'the request on stdin is not JSON')
  }
}

async function main(): Promise<string> {
  const probe = process.argv.slice(2).includes('--probe')
  const raw = await readRequest()
  if (probe) {
    const checked = checkProbeRequest(raw)
    if ('kind' in checked) throw new Stop(checked)
    const r = await prepare(checked.ok.cwd ?? process.cwd(), checked.ok.socket, { probe: true, policy: checked.ok.policy })
    // Server-supplied values are bounded one by one; the asserts already pinned the ones that matter.
    const ts = r.threadStart
    const sb = ts.sandbox
    const line = JSON.stringify({
      ok: true,
      socket: r.socket,
      version,
      untested: r.untested,
      signedIn: r.account.signedIn,
      accountType: r.account.accountType,
      policy: r.locks.policy,
      classes: r.locks.classes,
      projectLayers: r.layers.slice(0, 20).map(l => ({ folder: snippet(l.folder, 300), enabled: l.enabled, keys: l.keys.slice(0, 30).map(k => snippet(k, 60)) })),
      sandbox: { type: snippet(sb.type, 40), networkAccess: sb.networkAccess === true },
      approvalPolicy: snippet(ts.approvalPolicy, 40),
      approvalsReviewer: snippet(ts.approvalsReviewer, 40),
      modelProvider: snippet(ts.modelProvider, 40),
      cwd: snippet(ts.cwd, 1024),
      instructionSources: Array.isArray(ts.instructionSources) ? ts.instructionSources.slice(0, 20).map((s: unknown) => snippet(s, 300)) : [],
      mcp: r.mcp,
      hooks: r.hooks,
      notices: requestNotices.slice(0, 10),
    })
    if (utf8Bytes(line) > MAX_LINE_BYTES) stop('protocol', 'the probe result did not fit the consult output limit')
    return line
  }
  const checked = checkClientRequest(raw)
  if ('kind' in checked) throw new Stop(checked)
  deadline = started + checked.ok.timeoutSec * 1000
  const r = await prepare(checked.ok.cwd, checked.ok.socket, { probe: false, policy: checked.ok.policy, model: checked.ok.model, effort: checked.ok.effort })
  return fitLine(await review(checked.ok, r))
}

process.on('SIGTERM', onSignal)
process.on('SIGINT', onSignal)

main()
  .then(
    line => line,
    e => {
      const f: Fail = e instanceof Stop ? e.fail : { kind: 'protocol', message: `consult client error: ${snippet(e instanceof Error ? e.message : e, 300)}` }
      return fitLine({ ok: false, kind: f.kind, message: f.message, log: logText() })
    },
  )
  .then(async line => {
    if (stopping) return
    await close()
    await print(line)
    process.exit(0)
  })
