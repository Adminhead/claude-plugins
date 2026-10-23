// An in-process fake of `codex app-server --listen unix://…` (codex-cli 0.163.0) for codex-app-server.spec.ts:
// JSON-RPC objects, one per WebSocket text frame, no `jsonrpc` field. Every notification is broadcast to every
// connection, as the real server does, and server requests go to every connection too. Each scenario overrides
// the parts it needs; every frame in both directions is recorded. Not a *.test.* file: `claude plugin test`
// would load it as a mod test.
import type { Server, ServerWebSocket } from 'bun'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export const LOCKED_FEATURES = ['plugins', 'hooks', 'apps', 'browser_use', 'computer_use', 'multi_agent', 'image_generation']
// experimentalFeature/list had 175 entries on 0.163.0 (S1 probes); the rest are fillers here.
export const FEATURE_COUNT = 175
export const FEATURE_PAGE_DEFAULT = 50

// config/read's `origins`: dotted key -> {name: {type: <layer>}, version}.
export const originsOf = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([k, type]) => [k, { name: { type }, version: '1' }]))

// The default origins: every lock key the served config sets came from the unit's flags (sessionFlags).
function defaultOrigins(config: any): Record<string, string> {
  const o: Record<string, string> = {}
  for (const k of ['web_search', 'sandbox_mode', 'approval_policy', 'approvals_reviewer']) if (config?.[k] != null) o[k] = 'sessionFlags'
  for (const f of LOCKED_FEATURES) if (config?.features?.[f] != null) o[`features.${f}`] = 'sessionFlags'
  const ws = config?.tools?.web_search
  if (ws && typeof ws === 'object') for (const [k, v] of Object.entries(ws)) if (v != null) o[`tools.web_search.${k}`] = 'sessionFlags'
  return o
}

export type Feature = { name: string; enabled: unknown; defaultEnabled: boolean; stage: string }

// One page of experimentalFeature/list, as the server pages it: `cursor` is an offset, `limit` the page size.
export function featurePage(all: Feature[], p: any) {
  const offset = typeof p.cursor === 'string' ? Number(p.cursor) : 0
  const limit = typeof p.limit === 'number' ? p.limit : FEATURE_PAGE_DEFAULT
  const end = offset + limit
  return { data: all.slice(offset, end), nextCursor: end < all.length ? String(end) : null }
}
export const lockedConfig = (over: Record<string, unknown> = {}) => ({
  model: 'cfg-model',
  review_model: null,
  model_reasoning_effort: 'medium',
  model_provider: null,
  web_search: 'disabled',
  sandbox_mode: 'read-only',
  approval_policy: 'never',
  approvals_reviewer: 'user',
  tools: null,
  features: Object.fromEntries(LOCKED_FEATURES.map(f => [f, false])),
  mcp_servers: { github: { command: 'x' }, notes: { url: 'http://x' } },
  ...over,
})

type Data = { conn: number }
type WS = ServerWebSocket<Data>
export type Frame = { conn: number; dir: 'in' | 'out'; msg: any }

export type Turn = {
  conn: number
  threadId: string
  turnId: string
  method: 'turn/start' | 'review/start'
  params: any
  // Sends the turn/start or review/start response (once). `over` replaces fields of the response.
  respond: (over?: Record<string, unknown>) => void
  emit: (method: string, params: Record<string, unknown>) => void
  started: () => void
  agent: (text: string, phase?: string | null) => void
  item: (item: Record<string, unknown>) => void
  complete: (status?: string, error?: unknown) => void
  // A server request to every connection; resolves with the answers that came back within `ms`.
  request: (method: string, params: Record<string, unknown>, ms?: number) => Promise<Frame[]>
  interrupted: Promise<void>
}

export type Scenario = {
  userAgent?: string
  config?: Record<string, unknown>
  configCwd?: Record<string, unknown>
  // Layer type per dotted key, for both config/read views (default: sessionFlags for every lock key set).
  origins?: Record<string, string>
  layers?: unknown[]
  account?: unknown
  threadStart?: (params: any, threadId: string) => Record<string, unknown>
  mcpPages?: (threadId: string, names: string[]) => unknown[]
  hooks?: unknown
  // experimentalFeature/list: the thread's whole feature list (default: the thread's features overrides, else the
  // server's, else on, plus fillers), and the answer to one call (default: featurePage; throw for an error).
  features?: (threadConfig: any, serverConfig: any) => Feature[]
  featureList?: (params: any, all: Feature[]) => unknown
  // Runs the turn. Default: respond, started, one final answer, completed.
  turn?: (t: Turn) => Promise<void> | void
  // Default true: turn/interrupt completes the turn as interrupted.
  confirmInterrupt?: boolean
  // Default false: initialize never answers.
  silentInit?: boolean
}

export const REPLY = 'No significant findings.'

// As 0.163.0 computes it for a thread: the thread's features override wins, then the server's value; unset is on.
export function defaultFeatures(threadConfig: any, serverConfig: any): Feature[] {
  const enabled = (name: string) => {
    const t = threadConfig?.features?.[name]
    if (typeof t === 'boolean') return t
    return serverConfig?.features?.[name] !== false
  }
  // The lock features spread over the list (every 25th entry), so they land on several pages.
  const names = Array.from({ length: FEATURE_COUNT - LOCKED_FEATURES.length }, (_, i) => `filler_${i}`)
  LOCKED_FEATURES.forEach((f, k) => names.splice(k * 25 + 10, 0, f))
  return names.map(name => ({ name, enabled: enabled(name), defaultEnabled: false, stage: 'stable' }))
}

const defaultTurn = (t: Turn) => {
  t.respond()
  t.started()
  t.agent('thinking about it', 'commentary')
  t.agent(REPLY, 'final_answer')
  t.complete()
}

export class FakeAppServer {
  readonly dir: string
  readonly socket: string
  frames: Frame[] = []
  turns: Turn[] = []
  private server: Server
  private conns = new Map<number, WS>()
  private nextConn = 1
  private nextThread = 1
  private nextReq = 1000
  private initialized = new Set<number>()
  private waiting = new Map<unknown, (f: Frame) => void>()
  private interrupts = new Map<string, () => void>()
  private turnDone = new Set<string>()

  // `place` picks the socket path inside the fake's private directory (default <dir>/s.sock).
  constructor(public scenario: Scenario = {}, place?: (dir: string) => string) {
    this.dir = mkdtempSync(join(tmpdir(), 'cas-'))
    this.socket = place ? place(this.dir) : join(this.dir, 's.sock')
    mkdirSync(dirname(this.socket), { recursive: true, mode: 0o700 })
    this.server = Bun.serve<Data, {}>({
      unix: this.socket,
      fetch: (req, server) => (server.upgrade(req, { data: { conn: this.nextConn++ } }) ? undefined : new Response('upgrade required', { status: 426 })),
      websocket: {
        open: ws => {
          this.conns.set(ws.data.conn, ws)
        },
        close: ws => {
          this.conns.delete(ws.data.conn)
        },
        message: (ws, data) => this.receive(ws, String(data)),
      },
    })
  }

  stop() {
    this.server.stop(true)
    rmSync(this.dir, { recursive: true, force: true })
  }

  // Drops every connection, as a crashing server would.
  dropAll() {
    for (const ws of this.conns.values()) ws.terminate()
  }

  get connections() {
    return this.conns.size
  }

  sent(method: string) {
    return this.frames.filter(f => f.dir === 'in' && f.msg.method === method)
  }

  // The clients' answers to the server requests of `method`, as they arrived.
  answersTo(method: string) {
    const ids = new Set(this.frames.filter(f => f.dir === 'out' && f.msg.method === method && f.msg.id !== undefined).map(f => `${f.conn}:${f.msg.id}`))
    return this.frames.filter(f => f.dir === 'in' && f.msg.method === undefined && ids.has(`${f.conn}:${f.msg.id}`))
  }

  private out(ws: WS, msg: object) {
    this.frames.push({ conn: ws.data.conn, dir: 'out', msg })
    ws.send(JSON.stringify(msg))
  }

  broadcast(method: string, params: Record<string, unknown>) {
    for (const ws of this.conns.values()) this.out(ws, { method, params })
  }

  // A server request to every connection; collects the answers that arrive within `ms`.
  request(method: string, params: Record<string, unknown>, ms = 500): Promise<Frame[]> {
    const got: Frame[] = []
    const ids: number[] = []
    for (const ws of this.conns.values()) {
      const id = this.nextReq++
      ids.push(id)
      this.waiting.set(id, f => got.push(f))
      this.out(ws, { id, method, params })
    }
    return new Promise(res =>
      setTimeout(() => {
        for (const id of ids) this.waiting.delete(id)
        res(got)
      }, ms),
    )
  }

  private receive(ws: WS, text: string) {
    const msg = JSON.parse(text)
    const frame: Frame = { conn: ws.data.conn, dir: 'in', msg }
    this.frames.push(frame)
    if (msg.method === undefined) {
      this.waiting.get(msg.id)?.(frame)
      return
    }
    if (msg.id === undefined) return
    try {
      const result = this.handle(ws, msg.method, msg.params ?? {}, msg.id)
      if (result !== undefined) this.out(ws, { id: msg.id, result })
    } catch (e: any) {
      this.out(ws, { id: msg.id, error: { code: e.code ?? -32600, message: e.message } })
    }
  }

  private handle(ws: WS, method: string, p: any, id: unknown): unknown {
    const s = this.scenario
    const conn = ws.data.conn
    switch (method) {
      case 'initialize':
        if (s.silentInit) return undefined
        if (this.initialized.has(conn)) throw Object.assign(new Error('Already initialized'), { code: -32600 })
        this.initialized.add(conn)
        return { userAgent: s.userAgent ?? `${p.clientInfo?.name}/0.163.0 (Linux; x86_64) fake`, codexHome: '/home/u/.codex', platformFamily: 'unix', platformOs: 'linux' }
      case 'config/read': {
        const config = p.cwd ? (s.configCwd ?? s.config ?? lockedConfig()) : (s.config ?? lockedConfig())
        const origins = originsOf(s.origins ?? defaultOrigins(config))
        if (p.cwd) return { config, layers: p.includeLayers ? (s.layers ?? [{ name: { type: 'user', file: '/home/u/.codex/config.toml' }, config: {}, version: '1' }]) : null, origins }
        return { config, origins }
      }
      case 'account/read':
        return s.account ?? { account: { type: 'chatgpt', email: 'secret-user@example.com', planType: 'pro' }, requiresOpenaiAuth: true }
      case 'thread/start': {
        const threadId = `thr-${conn}-${this.nextThread++}`
        const base = {
          thread: { id: threadId, cwd: p.cwd, ephemeral: true, modelProvider: 'openai', status: { type: 'idle' }, turns: [] },
          model: p.model ?? p.config?.model ?? 'cfg-model',
          modelProvider: p.modelProvider ?? 'openai',
          reasoningEffort: p.config?.model_reasoning_effort ?? 'medium',
          cwd: p.cwd,
          approvalPolicy: p.approvalPolicy,
          approvalsReviewer: p.approvalsReviewer,
          sandbox: { type: 'readOnly', networkAccess: false },
          instructionSources: ['/home/u/.codex/AGENTS.md'],
        }
        const result = s.threadStart ? { ...base, ...s.threadStart(p, threadId) } : base
        this.out(ws, { id, result })
        this.broadcast('thread/started', { thread: { id: threadId } })
        return undefined
      }
      case 'mcpServerStatus/list': {
        const names = Object.keys(this.lastThreadConfig(conn)?.mcp_servers ?? {})
        const pages = s.mcpPages?.(p.threadId, names) ?? [{ data: names.map(name => ({ name, runtimeStatus: 'disabled', tools: {}, resources: [], resourceTemplates: [], authStatus: 'unsupported' })), nextCursor: null }]
        const i = typeof p.cursor === 'string' ? Number(p.cursor) : 0
        return pages[i]
      }
      case 'hooks/list':
        return s.hooks ?? { data: (p.cwds ?? []).map((cwd: string) => ({ cwd, hooks: [], errors: [], warnings: [] })) }
      case 'experimentalFeature/list': {
        const server = s.configCwd ?? s.config ?? lockedConfig()
        const all = (s.features ?? defaultFeatures)(this.lastThreadConfig(conn), server)
        return s.featureList ? s.featureList(p, all) : featurePage(all, p)
      }
      case 'turn/start':
      case 'review/start':
        this.startTurn(ws, method, p, id)
        return undefined
      case 'turn/interrupt': {
        this.interrupts.get(p.turnId)?.()
        if (s.confirmInterrupt !== false && !this.turnDone.has(p.turnId)) {
          this.turnDone.add(p.turnId)
          setTimeout(() => this.broadcast('turn/completed', { threadId: p.threadId, turn: { id: p.turnId, items: [], status: 'interrupted', error: null } }), 50)
        }
        return {}
      }
      case 'thread/unsubscribe':
        return { status: 'unsubscribed' }
      default:
        throw Object.assign(new Error(`unknown method ${method}`), { code: -32601 })
    }
  }

  private lastThreadConfig(conn: number) {
    return this.frames.filter(f => f.conn === conn && f.dir === 'in' && f.msg.method === 'thread/start').at(-1)?.msg.params?.config
  }

  private startTurn(ws: WS, method: 'turn/start' | 'review/start', p: any, id: unknown) {
    const threadId = p.threadId
    const turnId = `turn-${this.turns.length + 1}`
    let responded = false
    let item = 0
    let markInterrupted = () => {}
    const interrupted = new Promise<void>(r => (markInterrupted = r))
    this.interrupts.set(turnId, markInterrupted)
    const turnObj = (status: string, error: unknown = null) => ({ id: turnId, items: [], status, error })
    const t: Turn = {
      conn: ws.data.conn,
      threadId,
      turnId,
      method,
      params: p,
      respond: over => {
        if (responded) return
        responded = true
        const result = method === 'turn/start' ? { turn: turnObj('inProgress') } : { turn: turnObj('inProgress'), reviewThreadId: threadId }
        this.out(ws, { id, result: { ...result, ...over } })
      },
      emit: (m, params) => this.broadcast(m, params),
      started: () => this.broadcast('turn/started', { threadId, turn: turnObj('inProgress') }),
      item: it => this.broadcast('item/completed', { threadId, turnId, completedAtMs: Date.now(), item: { id: `${turnId}-item-${++item}`, ...it } }),
      agent: (text, phase = null) => t.item({ type: 'agentMessage', text, phase }),
      complete: (status = 'completed', error = null) => {
        if (this.turnDone.has(turnId)) return
        this.turnDone.add(turnId)
        this.broadcast('turn/completed', { threadId, turn: turnObj(status, error) })
      },
      request: (m, params, ms) => this.request(m, params, ms),
      interrupted,
    }
    this.turns.push(t)
    Promise.resolve((this.scenario.turn ?? defaultTurn)(t)).catch(() => {})
  }
}
