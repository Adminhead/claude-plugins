// The codex app-server protocol, pure: request checks, socket and config asserts, JSON-RPC params, server-request
// answers, notification matching, the turn reducer and the client's one-line result. No `$`, no `node:` and no
// `process`, so the mod (through consult.ts) and the hook-side client (scripts/codex-app-server.ts) share it.
// Method and field names follow the codex-cli 0.162.1 app-server JSON schema (stable surface).

export const MAX_REPLY = 60_000
export const MAX_TIMEOUT_SEC = 540
export const CODEX_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
export const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/

export const MIN_CODEX = '0.162.0'
export const TESTED_CODEX = '0.162.1'
export const CONNECT_MS = 2000
export const INIT_MS = 5000
export const TURN_ID_WAIT_MS = 2000
export const INTERRUPT_GRACE_SEC = 5
export const CLOSE_MS = 2000
// Under the mod's MAX_REPLY, so the client's line survives process.run's output cut.
export const MAX_LINE_BYTES = 48_000
export const MAX_REQUEST_BYTES = 1_000_000
export const MAX_FRAME_BYTES = 8 * 1024 * 1024
export const LOG_CHARS = 4000
export const LOCKED_FEATURES = ['plugins', 'hooks', 'apps', 'browser_use', 'computer_use', 'code_mode_host', 'multi_agent', 'image_generation']
export const PROJECT_KEYS_ALLOWED = ['model', 'model_reasoning_effort']
export const DEFAULT_SOCKET_NAME = 'codex-consult.sock'
export const UNIT_NAME = 'codex-consult'
const README_UNIT = 'the consult README, section "Run the codex app server"'

export const KINDS = ['input', 'no-server', 'socket-unsafe', 'too-old', 'auth', 'not-locked', 'lockdown', 'sandbox', 'timeout', 'limit', 'context', 'failed', 'protocol', 'empty'] as const
export type Kind = (typeof KINDS)[number]
// Every check returns null when it passes.
export type Fail = { kind: Kind; message: string }
const fail = (kind: Kind, message: string): Fail => ({ kind, message })

// Model-controlled or server-controlled text that ends up in a message: one line, bounded.
export function snippet(v: unknown, max = 200): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v) ?? String(v)
  const flat = s.slice(0, max * 2).replace(/[\u0000-\u001f\u007f]+/g, ' ')
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}
const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v)

// --- socket -------------------------------------------------------------------------------------------------

// bun's ws+unix:// parsing treats `?` as a query, percent-encodes a space and throws on `#`; the charset rules all out.
export const SOCKET_CHARS = /^\/[A-Za-z0-9._/-]+$/
export const MAX_SOCKET_BYTES = 100

export function checkSocketPath(p: unknown): Fail | null {
  if (typeof p !== 'string' || p === '') return fail('input', 'the socket path must be a non-empty string')
  if (p.length > MAX_SOCKET_BYTES) return fail('input', `the socket path is longer than ${MAX_SOCKET_BYTES} bytes`)
  if (!SOCKET_CHARS.test(p)) return fail('input', `the socket path ${snippet(p, 100)} must be absolute and match ${SOCKET_CHARS}`)
  if (p.split('/').includes('..')) return fail('input', 'the socket path must not contain a .. segment')
  return null
}

// Resolves the socket: the codexSocket option, else $XDG_RUNTIME_DIR/codex-consult.sock.
export function resolveSocket(option: string | undefined, xdg: string | undefined): { socket: string } | Fail {
  let socket: string
  if (option !== undefined && option !== '') socket = option
  else if (xdg !== undefined && xdg !== '') socket = `${xdg.replace(/\/+$/, '')}/${DEFAULT_SOCKET_NAME}`
  else return fail('no-server', 'XDG_RUNTIME_DIR is not set, so consult cannot find the codex app server socket; set the consult `codexSocket` option')
  return checkSocketPath(socket) ?? { socket }
}

export function socketDir(p: string): string {
  const i = p.lastIndexOf('/')
  return i <= 0 ? '/' : p.slice(0, i)
}

// The fields of an lstat result this check reads; `mode` carries the file-type bits.
export type PlainStat = { mode: number; uid: number }
const S_IFMT = 0o170000
const S_IFSOCK = 0o140000
const S_IFLNK = 0o120000
const S_IFDIR = 0o040000

export const socketUnsafe = (path: string, why: string): Fail =>
  fail('socket-unsafe', `${why} (${snippet(path, 100)}); consult refuses sockets it cannot trust`)

export function checkSocketStat(sock: PlainStat, parent: PlainStat, uid: number, path = 'the socket'): Fail | null {
  const type = (s: PlainStat) => s.mode & S_IFMT
  if (type(sock) === S_IFLNK) return socketUnsafe(path, 'the socket is a symlink')
  if (type(sock) !== S_IFSOCK) return socketUnsafe(path, 'the path is not a socket')
  if (sock.uid !== uid) return socketUnsafe(path, `the socket is owned by uid ${sock.uid}, not ${uid}`)
  if (type(parent) === S_IFLNK) return socketUnsafe(path, 'the socket directory is a symlink')
  if (type(parent) !== S_IFDIR) return socketUnsafe(path, 'the socket directory is not a directory')
  if (parent.uid !== uid) return socketUnsafe(path, `the socket directory is owned by uid ${parent.uid}, not ${uid}`)
  if ((parent.mode & 0o022) !== 0) return socketUnsafe(path, `the socket directory is group- or world-writable (mode ${(parent.mode & 0o777).toString(8)})`)
  return null
}

export function noServerMessage(path: string, why: 'missing' | 'refused' | 'no answer in 5s'): string {
  return `no codex app server at ${snippet(path, 100)} (${why}). Start it with systemctl --user start ${UNIT_NAME}; check it with systemctl --user status ${UNIT_NAME}. Setup: ${README_UNIT}.`
}

// --- version ------------------------------------------------------------------------------------------------

export function parseServerVersion(userAgent: unknown): string | null {
  if (typeof userAgent !== 'string') return null
  return /^[^/]{1,200}\/(\d{1,6}\.\d{1,6}\.\d{1,6})/.exec(userAgent.slice(0, 300))?.[1] ?? null
}

export function versionAtLeast(v: string, min: string): boolean {
  const a = v.split('.').map(Number)
  const b = min.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  return true
}

// From `initialize`'s userAgent: the server version, and whether it is newer than the one consult was tested with.
export function checkVersion(userAgent: unknown): { version: string; untested: boolean } | Fail {
  const version = parseServerVersion(userAgent)
  if (version === null) return fail('protocol', `the codex app server sent no version in its userAgent (${snippet(userAgent, 80)})`)
  if (!versionAtLeast(version, MIN_CODEX)) return fail('too-old', `the consult server runs codex ${version}; consult needs ${MIN_CODEX} or newer. Upgrade codex, then systemctl --user restart ${UNIT_NAME}`)
  return { version, untested: !versionAtLeast(TESTED_CODEX, version) }
}

// Appended to protocol errors from a server newer than TESTED_CODEX.
export const untestedHint = (version: string) =>
  versionAtLeast(TESTED_CODEX, version) ? '' : ` (consult was tested with codex ${TESTED_CODEX}; this server runs ${version})`

// --- client request -----------------------------------------------------------------------------------------

export type ClientRequest = {
  mode: 'diff' | 'plan'
  cwd: string
  prompt: string
  model?: string
  effort?: string
  timeoutSec: number
  socket?: string
}
export type ProbeRequest = { cwd?: string; socket?: string }

function checkCwdField(cwd: unknown): Fail | null {
  if (typeof cwd !== 'string' || !cwd.startsWith('/') || cwd.length > 1024 || /[\0\r\n]/.test(cwd)) return fail('input', 'cwd must be an absolute path of at most 1024 characters without NUL or newlines')
  return null
}

export function checkClientRequest(raw: unknown): { ok: ClientRequest } | Fail {
  if (!isObj(raw)) return fail('input', 'the request must be a JSON object')
  const { mode, cwd, prompt, model, effort, timeoutSec, socket } = raw
  if (mode !== 'diff' && mode !== 'plan') return fail('input', 'mode must be diff or plan')
  const badCwd = checkCwdField(cwd)
  if (badCwd) return badCwd
  if (typeof prompt !== 'string' || prompt.trim() === '' || prompt.length > MAX_REQUEST_BYTES) return fail('input', 'prompt must be a non-empty string')
  if (model !== undefined && (typeof model !== 'string' || !MODEL.test(model.slice(0, 101)))) return fail('input', 'model must look like a model id')
  if (effort !== undefined && !CODEX_EFFORTS.includes(effort)) return fail('input', `effort must be one of ${CODEX_EFFORTS.join('|')}`)
  if (typeof timeoutSec !== 'number' || !Number.isInteger(timeoutSec) || timeoutSec < 1 || timeoutSec > MAX_TIMEOUT_SEC) return fail('input', `timeoutSec must be an integer from 1 to ${MAX_TIMEOUT_SEC}`)
  if (socket !== undefined) {
    const bad = checkSocketPath(socket)
    if (bad) return bad
  }
  const ok: ClientRequest = { mode, cwd, prompt, timeoutSec }
  if (model !== undefined) ok.model = model
  if (effort !== undefined) ok.effort = effort
  if (socket !== undefined) ok.socket = socket
  return { ok }
}

export function checkProbeRequest(raw: unknown): { ok: ProbeRequest } | Fail {
  if (!isObj(raw)) return fail('input', 'the request must be a JSON object')
  const ok: ProbeRequest = {}
  if (raw.cwd !== undefined) {
    const bad = checkCwdField(raw.cwd)
    if (bad) return bad
    ok.cwd = raw.cwd
  }
  if (raw.socket !== undefined) {
    const bad = checkSocketPath(raw.socket)
    if (bad) return bad
    ok.socket = raw.socket
  }
  return { ok }
}

// --- JSON-RPC params ----------------------------------------------------------------------------------------

export function initializeParams(version: string) {
  return { clientInfo: { name: 'consult', title: 'consult', version } }
}

// The MCP servers config/read {cwd} knows (user and project layers), all disabled per thread.
export function mcpServerNames(config: unknown): string[] {
  const servers = isObj(config) ? config.mcp_servers : undefined
  return isObj(servers) ? Object.keys(servers) : []
}

export function threadStartParams(req: Pick<ClientRequest, 'cwd' | 'model' | 'effort'>, mcpNames: string[]) {
  const config: Record<string, unknown> = {
    web_search: 'disabled',
    features: Object.fromEntries(LOCKED_FEATURES.map(f => [f, false])),
    mcp_servers: Object.fromEntries(mcpNames.map(n => [n, { enabled: false }])),
  }
  if (req.model !== undefined) {
    config.model = req.model
    config.review_model = req.model
  }
  if (req.effort !== undefined) config.model_reasoning_effort = req.effort
  const params: Record<string, unknown> = {
    cwd: req.cwd,
    sandbox: 'read-only',
    approvalPolicy: 'never',
    approvalsReviewer: 'user',
    ephemeral: true,
    modelProvider: 'openai',
    config,
  }
  if (req.model !== undefined) params.model = req.model
  return params
}

export function turnStartParams(req: Pick<ClientRequest, 'cwd' | 'prompt' | 'model' | 'effort'>, threadId: string) {
  const params: Record<string, unknown> = {
    threadId,
    input: [{ type: 'text', text: req.prompt }],
    cwd: req.cwd,
    approvalPolicy: 'never',
    approvalsReviewer: 'user',
    sandboxPolicy: { type: 'readOnly', networkAccess: false },
  }
  if (req.model !== undefined) params.model = req.model
  if (req.effort !== undefined) params.effort = req.effort
  return params
}

export function reviewStartParams(req: Pick<ClientRequest, 'prompt'>, threadId: string) {
  return { threadId, target: { type: 'custom', instructions: req.prompt }, delivery: 'inline' }
}

// --- asserts ------------------------------------------------------------------------------------------------

const show = (v: unknown) => (v === undefined ? 'missing' : snippet(JSON.stringify(v) ?? String(v), 40))

// Stage 1, on both config/read {} and config/read {cwd, includeLayers}: the server runs with the README unit's flags.
export function checkServerLocked(config: unknown): Fail | null {
  const c = isObj(config) ? config : {}
  const bad: string[] = []
  const want = (key: string, value: string) => {
    if (c[key] !== value) bad.push(`${key} is ${show(c[key])} (want "${value}")`)
  }
  want('web_search', 'disabled')
  want('sandbox_mode', 'read-only')
  want('approval_policy', 'never')
  want('approvals_reviewer', 'user')
  // tools.web_search configures a web search tool; any value at all fails closed.
  const tools = c.tools
  if (tools !== undefined && tools !== null && (!isObj(tools) || (tools.web_search !== undefined && tools.web_search !== null))) {
    bad.push(`tools.web_search is ${show(isObj(tools) ? tools.web_search : tools)} (want absent)`)
  }
  // features is not a declared Config field; it arrives through additionalProperties.
  const features = isObj(c.features) ? c.features : {}
  for (const f of LOCKED_FEATURES) if (features[f] !== false) bad.push(`features.${f} is ${show(features[f])} (want false)`)
  if (bad.length === 0) return null
  return fail('not-locked', `the codex app server is not locked down: ${bad.join(', ')}. consult refuses a server started without the flags of the example unit in ${README_UNIT}`)
}

export type ProjectLayer = { folder: string; enabled: boolean; keys: string[] }

// The project layers of config/read {cwd, includeLayers: true}. A layer is disabled only when the server gives a
// disabledReason; anything else counts as enabled.
export function projectLayers(layers: unknown): ProjectLayer[] {
  if (!Array.isArray(layers)) return []
  return layers
    .filter(l => isObj(l) && isObj(l.name) && l.name.type === 'project')
    .map(l => ({
      folder: typeof l.name.dotCodexFolder === 'string' ? l.name.dotCodexFolder : '(unknown .codex folder)',
      enabled: !(typeof l.disabledReason === 'string' && l.disabledReason !== ''),
      keys: isObj(l.config) ? Object.keys(l.config) : l.config === null || l.config === undefined ? [] : ['(non-table config)'],
    }))
}

export function checkProjectLayers(layers: unknown): Fail | null {
  if (!Array.isArray(layers)) return fail('not-locked', 'config/read returned no layers, so consult cannot check the repo\'s codex config')
  for (const l of projectLayers(layers)) {
    if (!l.enabled) continue
    const extra = l.keys.filter(k => !PROJECT_KEYS_ALLOWED.includes(k))
    if (extra.length > 0) {
      return fail('not-locked', `${snippet(l.folder, 300)} sets ${extra.slice(0, 20).map(k => snippet(k, 60)).join(', ')}; consult refuses trusted repos with codex config beyond model/effort. Review it with agy, or remove the trust entry`)
    }
  }
  return null
}

// Stage 1 (config/read {}) and stage 2 (the thread/start response): code goes to OpenAI only.
export function checkProvider(config: unknown, threadStart?: unknown): Fail | null {
  const p = isObj(config) ? config.model_provider : undefined
  if (p !== undefined && p !== null && p !== 'openai') return fail('not-locked', `the codex config sets model_provider ${show(p)}; consult sends code to OpenAI only`)
  if (threadStart !== undefined) {
    const got = isObj(threadStart) ? threadStart.modelProvider : undefined
    if (got !== 'openai') return fail('not-locked', `the thread runs on model provider ${show(got)}; consult sends code to OpenAI only`)
  }
  return null
}

// Stage 2: the thread/start response. `sandbox` is the legacy policy; the stable surface has no other.
export function checkReadOnly(threadStart: unknown): Fail | null {
  const t = isObj(threadStart) ? threadStart : {}
  const bad: string[] = []
  const sb = t.sandbox
  if (!isObj(sb) || sb.type !== 'readOnly') bad.push(`sandbox is ${show(isObj(sb) ? sb.type : sb)} (want readOnly)`)
  else if (sb.networkAccess === true) bad.push('sandbox.networkAccess is true')
  if (t.approvalPolicy !== 'never') bad.push(`approvalPolicy is ${show(t.approvalPolicy)} (want "never")`)
  if (t.approvalsReviewer !== 'user') bad.push(`approvalsReviewer is ${show(t.approvalsReviewer)} (want "user")`)
  return bad.length === 0 ? null : fail('sandbox', `the codex thread is not read-only: ${bad.join(', ')}`)
}

export function checkCwd(threadStart: unknown, repo: string): Fail | null {
  const cwd = isObj(threadStart) ? threadStart.cwd : undefined
  return cwd === repo ? null : fail('protocol', `the codex thread runs in ${show(cwd)}, not ${snippet(repo, 300)}`)
}

// Stage 2, after thread/start: every pages' MCP server is disabled for the thread, and no hook is loaded.
export function checkLockdown(mcpPages: unknown[], hooks: unknown): Fail | null {
  const bad: string[] = []
  for (const page of mcpPages) {
    if (!isObj(page) || !Array.isArray(page.data)) {
      bad.push('mcpServerStatus/list returned no data')
      continue
    }
    for (const s of page.data) {
      const status = isObj(s) ? s.runtimeStatus : undefined
      if (status !== 'disabled') bad.push(`MCP server ${snippet(isObj(s) ? s.name : s, 60)} is ${show(status)}`)
    }
  }
  if (mcpPages.length === 0) bad.push('mcpServerStatus/list was not read')
  if (!isObj(hooks) || !Array.isArray(hooks.data)) bad.push('hooks/list returned no data')
  else {
    const n = hooks.data.reduce((sum: number, e: unknown) => sum + (isObj(e) && Array.isArray(e.hooks) ? e.hooks.length : 1), 0)
    if (n > 0) bad.push(`${n} hook${n === 1 ? '' : 's'} loaded`)
  }
  return bad.length === 0 ? null : fail('lockdown', `the codex thread is not locked down: ${bad.slice(0, 10).join(', ')}`)
}

// account/read {refreshToken: false}. Only the account type is kept: the response carries the user's email.
export function checkAccount(resp: unknown): { signedIn: boolean; accountType: string | null } | Fail {
  const r = isObj(resp) ? resp : {}
  const account = isObj(r.account) ? r.account : null
  if (r.requiresOpenaiAuth === true && account === null) {
    return fail('auth', `the ${UNIT_NAME} server is not signed in; run codex login, then systemctl --user restart ${UNIT_NAME}`)
  }
  return { signedIn: account !== null, accountType: account && typeof account.type === 'string' ? snippet(account.type, 40) : null }
}

// --- server requests ----------------------------------------------------------------------------------------

const LEGACY_APPROVALS = ['execCommandApproval', 'applyPatchApproval']

// v2 requests carry threadId; the legacy approvals carry conversationId instead.
export function requestThreadId(method: string, params: unknown): string | undefined {
  if (!isObj(params)) return undefined
  const id = LEGACY_APPROVALS.includes(method) ? params.conversationId : params.threadId
  return typeof id === 'string' ? id : undefined
}

export type ServerAnswer = { result: unknown; fail?: Fail; notice?: string } | { error: { code: number; message: string } }

function commandText(params: Record<string, any>): string {
  const c = params.command
  if (Array.isArray(c)) return snippet(c.map(String).join(' '))
  if (typeof c === 'string' && c !== '') return snippet(c)
  return '(no command given)'
}

const sandboxFail = (what: string) => fail('sandbox', `codex asked to ${what} outside the read-only sandbox`)

// The answer to a server request, or null for another thread's request, which this client leaves alone.
export function answerServerRequest(method: string, params: unknown, threadId: string): ServerAnswer | null {
  const tid = requestThreadId(method, params)
  if (tid !== undefined && tid !== threadId) return null
  const p = isObj(params) ? params : {}
  if (tid === threadId) {
    switch (method) {
      case 'item/commandExecution/requestApproval':
        return { result: { decision: 'cancel' }, fail: sandboxFail(`run \`${commandText(p)}\``) }
      case 'item/fileChange/requestApproval':
        return { result: { decision: 'cancel' }, fail: sandboxFail('change files') }
      case 'item/permissions/requestApproval':
        return { result: { permissions: {}, scope: 'turn' }, fail: sandboxFail('get more permissions') }
      case 'execCommandApproval':
        return { result: { decision: 'abort' }, fail: sandboxFail(`run \`${commandText(p)}\``) }
      case 'applyPatchApproval':
        return { result: { decision: 'abort' }, fail: sandboxFail('change files') }
      case 'mcpServer/elicitation/request':
        return { result: { action: 'decline', content: null }, notice: `declined an input request from MCP server ${snippet(p.serverName, 60)}` }
      case 'item/tool/requestUserInput':
        return { result: { answers: {} }, notice: 'codex asked for user input; answered with none' }
      case 'item/tool/call':
        return { result: { success: false, contentItems: [] } }
    }
  }
  return { error: { code: -32601, message: 'not supported by consult' } }
}

// --- notification matching ---------------------------------------------------------------------------------

export type Msg = { method: string; params?: any }

export const msgThreadId = (m: Msg): string | undefined => {
  const p = m.params
  if (!isObj(p)) return undefined
  if (typeof p.threadId === 'string') return p.threadId
  return isObj(p.thread) && typeof p.thread.id === 'string' ? p.thread.id : undefined
}
export const msgTurnId = (m: Msg): string | undefined => {
  const p = m.params
  if (!isObj(p)) return undefined
  if (typeof p.turnId === 'string') return p.turnId
  return isObj(p.turn) && typeof p.turn.id === 'string' ? p.turn.id : undefined
}

// Notifications are broadcast to every connection, and our turn's can arrive before the turn/start or
// review/start response names the turn. The Matcher keeps our thread's messages, buffers them until the turn id is
// known, then passes those of our turn (or of no turn). `done` is our turn/completed.
export class Matcher {
  readonly threadId: string
  turnId: string | undefined
  done = false
  private buffer: Msg[] = []

  constructor(threadId: string) {
    this.threadId = threadId
  }

  // The messages to act on now: [] for another thread's, another turn's, or a buffered one.
  push(msg: Msg): Msg[] {
    if (msgThreadId(msg) !== this.threadId) return []
    if (this.turnId === undefined) {
      this.buffer.push(msg)
      return []
    }
    return this.pass([msg])
  }

  // Sets our turn id and returns the buffered messages that belong to it, in arrival order.
  setTurn(id: string): Msg[] {
    this.turnId = id
    const buffered = this.buffer
    this.buffer = []
    return this.pass(buffered)
  }

  private pass(msgs: Msg[]): Msg[] {
    const ours = msgs.filter(m => {
      const t = msgTurnId(m)
      return t === undefined || t === this.turnId
    })
    if (ours.some(m => m.method === 'turn/completed')) this.done = true
    return ours
  }
}

// --- the turn reducer ---------------------------------------------------------------------------------------

export type Counts = { completed: number; failed: number; declined: number }
export type Items = { commandExecution: Counts; fileChange: Counts }
export type TurnError = { message?: string; codexErrorInfo?: unknown; additionalDetails?: string | null }

export type TurnState = {
  messages: { text: string; phase: string | null }[]
  reviews: string[]
  items: Items
  seen: Set<string>
  violation?: Fail
  lastError?: TurnError
  retries: number
  notices: string[]
  completed?: { status: string; error?: TurnError }
}

const counts = (): Counts => ({ completed: 0, failed: 0, declined: 0 })
export const newTurnState = (): TurnState => ({ messages: [], reviews: [], items: { commandExecution: counts(), fileChange: counts() }, seen: new Set(), retries: 0, notices: [] })

function addItem(s: TurnState, item: unknown) {
  if (!isObj(item)) return
  if (typeof item.id === 'string') {
    if (s.seen.has(item.id)) return
    s.seen.add(item.id)
  }
  if (item.type === 'agentMessage' && typeof item.text === 'string') s.messages.push({ text: item.text, phase: typeof item.phase === 'string' ? item.phase : null })
  else if (item.type === 'exitedReviewMode' && typeof item.review === 'string') s.reviews.push(item.review)
  else if (item.type === 'commandExecution' || item.type === 'fileChange') {
    const c = s.items[item.type as keyof Items]
    if (item.status === 'completed' || item.status === 'failed' || item.status === 'declined') c[item.status as keyof Counts]++
    if (item.type === 'fileChange' && item.status === 'completed' && !s.violation) s.violation = sandboxFail('change files, and a change completed')
  }
}

// Folds one of our turn's messages (as the Matcher passes them) into the state.
export function reduce(s: TurnState, m: Msg): TurnState {
  const p = isObj(m.params) ? m.params : {}
  switch (m.method) {
    case 'item/completed':
      addItem(s, p.item)
      break
    case 'error':
      if (p.willRetry === true) {
        s.retries++
        if (s.notices.length < 20) s.notices.push(`codex retried after: ${snippet(isObj(p.error) ? p.error.message : p.error)}`)
      } else if (isObj(p.error)) s.lastError = p.error
      break
    case 'turn/completed': {
      const turn = isObj(p.turn) ? p.turn : {}
      // Items the stream did not deliver on their own.
      if (Array.isArray(turn.items)) for (const item of turn.items) addItem(s, item)
      s.completed = { status: typeof turn.status === 'string' ? turn.status : 'unknown', error: isObj(turn.error) ? turn.error : undefined }
      break
    }
  }
  return s
}

// The reviewer's text. Review: the last non-empty exitedReviewMode.review, else the agent messages. Plan: the
// final_answer messages, else every non-commentary one.
export function finalReply(s: TurnState, mode: 'diff' | 'plan'): string {
  const join = (ms: { text: string }[]) => ms.map(m => m.text.trim()).filter(t => t !== '').join('\n\n')
  if (mode === 'diff') {
    const review = s.reviews.map(r => r.trim()).filter(r => r !== '').at(-1)
    if (review !== undefined) return review
    return join(s.messages.filter(m => m.phase !== 'commentary'))
  }
  const finals = s.messages.filter(m => m.phase === 'final_answer')
  return join(finals.length > 0 ? finals : s.messages.filter(m => m.phase !== 'commentary'))
}

const LIMIT_ERRORS = ['usageLimitExceeded', 'rateLimitExceeded', 'sessionBudgetExceeded', 'serverOverloaded', 'flexUnavailable']

export function classifyTurnError(err: TurnError | undefined): Fail {
  const info = err?.codexErrorInfo
  const text = snippet(err?.message ?? 'the turn failed', 500) + (err?.additionalDetails ? ` (${snippet(err.additionalDetails, 300)})` : '')
  let code: string | undefined
  let http: number | undefined
  if (typeof info === 'string') code = info
  else if (isObj(info)) {
    code = Object.keys(info)[0]
    const inner = code !== undefined ? info[code] : undefined
    if (isObj(inner) && typeof inner.httpStatusCode === 'number') http = inner.httpStatusCode
  }
  if (code === 'unauthorized' || http === 401) return fail('auth', `codex is not authorized: ${text}. Run codex login, then systemctl --user restart ${UNIT_NAME}`)
  if ((code !== undefined && LIMIT_ERRORS.includes(code)) || http === 429) return fail('limit', `codex hit a usage or rate limit (${code}): ${text}`)
  if (code === 'contextWindowExceeded') return fail('context', `the review did not fit codex's context window: ${text}. Split the review into smaller passes`)
  if (code === 'sandboxError' || code === 'tooManyDenials') return fail('sandbox', `codex hit the read-only sandbox (${code}): ${text}`)
  return fail('failed', `codex failed${code ? ` (${snippet(code, 60)}${http !== undefined ? ` ${http}` : ''})` : ''}: ${text}`)
}

// The outcome once our turn/completed arrived and no timeout or approval failure came first.
export function turnOutcome(s: TurnState, mode: 'diff' | 'plan'): { reply: string } | Fail {
  if (s.violation) return s.violation
  const done = s.completed
  if (!done) return fail('protocol', 'the turn ended without turn/completed')
  if (done.status === 'failed') return classifyTurnError(done.error ?? s.lastError)
  if (done.status !== 'completed') return fail('failed', `the turn ended ${snippet(done.status, 40)}${done.error?.message ? `: ${snippet(done.error.message, 300)}` : ''}`)
  const reply = finalReply(s, mode)
  return reply === '' ? fail('empty', 'codex finished with an empty reply') : { reply }
}

export type ModelSource = 'observed' | 'requested' | 'config'
export type ModelInfo = { model: string | null; effort: string | null; modelSource: ModelSource }

// The model and effort to report. A model/rerouted or thread/settings/updated for our thread wins; plan mode also
// counts the thread/start response as observed, since the turn runs on it. Otherwise the requested values, else
// the config's review_model ?? model (diff) or model (plan).
export function observedModel(
  notifications: Msg[],
  o: { threadId: string; mode: 'diff' | 'plan'; requested: { model?: string; effort?: string }; config?: unknown; threadStart?: unknown },
): ModelInfo {
  const str = (v: unknown) => (typeof v === 'string' && v !== '' ? snippet(v, 100) : null)
  let model: string | null = null
  let effort: string | null = null
  for (const n of notifications) {
    if (msgThreadId(n) !== o.threadId || !isObj(n.params)) continue
    if (n.method === 'model/rerouted') model = str(n.params.toModel) ?? model
    else if (n.method === 'thread/settings/updated' && isObj(n.params.threadSettings)) {
      model = str(n.params.threadSettings.model) ?? model
      effort = str(n.params.threadSettings.effort) ?? effort
    }
  }
  const req = { model: str(o.requested.model), effort: str(o.requested.effort) }
  const cfg = isObj(o.config) ? o.config : {}
  const cfgEffort = str(cfg.model_reasoning_effort)
  if (model !== null) return { model, effort: effort ?? req.effort ?? cfgEffort, modelSource: 'observed' }
  if (o.mode === 'plan' && isObj(o.threadStart) && str(o.threadStart.model) !== null) {
    return { model: str(o.threadStart.model), effort: str(o.threadStart.reasoningEffort) ?? req.effort ?? cfgEffort, modelSource: 'observed' }
  }
  if (req.model !== null) return { model: req.model, effort: req.effort ?? cfgEffort, modelSource: 'requested' }
  const cfgModel = o.mode === 'diff' ? str(cfg.review_model) ?? str(cfg.model) : str(cfg.model)
  return { model: cfgModel, effort: req.effort ?? cfgEffort, modelSource: 'config' }
}

// --- the client's result line -------------------------------------------------------------------------------

export type ClientOk = {
  ok: true
  reply: string
  model: string | null
  effort: string | null
  modelSource: ModelSource
  provider: string
  version: string
  durationMs: number
  notices: string[]
  items: Items
}
export type ClientFail = { ok: false; kind: Kind; message: string; log: string; items?: Items }
export type ClientResult = ClientOk | ClientFail

export function timeoutMessage(timeoutSec: number, o: { turnKnown: boolean; confirmed: boolean }): string {
  let m = `codex did not finish within ${timeoutSec}s`
  if (!o.turnKnown) m += '; no turn id arrived, so the turn may still start on the server'
  else if (o.confirmed) m += '; consult interrupted the turn'
  else m += `; the server did not confirm the interrupt; if it stays busy, run systemctl --user restart ${UNIT_NAME}`
  return m
}
export const SIGNAL_MESSAGE = 'consult client stopped by signal'

// UTF-8 bytes of a string, without TextEncoder (mods run in a sandbox).
export function utf8Bytes(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x80) n += 1
    else if (c < 0x800) n += 2
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      n += 4
      i++
    } else n += 3
  }
  return n
}

// A prefix of `s` at most `k` code units long that does not end inside a surrogate pair.
function prefix(s: string, k: number): string {
  if (k > 0 && k < s.length && (s.charCodeAt(k - 1) & 0xfc00) === 0xd800) k--
  return s.slice(0, k)
}

const truncNote = (k: number) => `\n[reply truncated at ${k} characters to fit the consult output limit]`

// The result as one JSON line of at most maxBytes UTF-8 bytes. A long reply is cut (with a note); a failure's log
// and message are cut if they alone overflow.
export function fitLine(result: ClientResult, maxBytes = MAX_LINE_BYTES): string {
  const size = (r: unknown) => utf8Bytes(JSON.stringify(r))
  if (size(result) <= maxBytes) return JSON.stringify(result)
  if (result.ok) {
    const at = (k: number) => {
      const head = prefix(result.reply, k)
      return { ...result, reply: head + truncNote(head.length) }
    }
    let lo = 0
    let hi = result.reply.length
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (size(at(mid)) <= maxBytes) lo = mid
      else hi = mid - 1
    }
    const fitted = at(lo)
    if (size(fitted) <= maxBytes) return JSON.stringify(fitted)
  } else {
    const trimmed = { ...result, log: result.log.slice(-LOG_CHARS), message: snippet(result.message, 2000) }
    if (size(trimmed) <= maxBytes) return JSON.stringify(trimmed)
  }
  const overflow: ClientFail = { ok: false, kind: 'protocol', message: 'the consult client result did not fit its output limit', log: '' }
  return JSON.stringify(overflow)
}

export type Parsed = { result: ClientResult } | { problem: 'cut' | 'crash'; message: string }

// Reads the client's stdout line. A line that starts like a result but does not parse was cut by the output limit.
export function parseClientResult(stdout: string): Parsed {
  const line = stdout.trim().split('\n').at(-1) ?? ''
  let v: unknown
  try {
    v = JSON.parse(line)
  } catch {
    if (line.startsWith('{"ok":')) return { problem: 'cut', message: 'consult client output was cut; the reply was too long' }
    return { problem: 'crash', message: 'the consult codex client crashed (its output was not JSON)' }
  }
  if (isObj(v) && v.ok === true && typeof v.reply === 'string') return { result: v as ClientOk }
  if (isObj(v) && v.ok === false && (KINDS as readonly unknown[]).includes(v.kind) && typeof v.message === 'string') {
    return { result: { ...v, log: typeof v.log === 'string' ? v.log : '' } as ClientFail }
  }
  return { problem: 'crash', message: 'the consult codex client printed an unexpected result' }
}

// The tool-error text for a failed client result.
export function clientErrorText(r: ClientFail): string {
  const log = r.log.trim() === '' ? '' : `\n${r.log.trim().slice(-LOG_CHARS)}`
  if (r.kind === 'no-server') return `consult: ${r.message}${log}`
  if (r.kind === 'timeout') return `consult timed out: ${r.message}. Split the review into smaller passes instead of retrying at a higher effort.${log}`
  return `consult failed (${r.kind}): ${r.message}${log}`
}
