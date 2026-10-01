import { mock } from 'claude-code/testing'

export const AWS = 'AKIAIOSFODNN7EXAMPLE'
export const AWS2 = 'AKIAI44QH8DHBEXAMPLE'
export const ID_AWS = /^__SS_AWS_ACCESS_KEY_[0-9a-f]{16}__$/
export const CONFIG = '/repo/.secret-stash.json'

export type Env = {
  files: Map<string, string>
  seen: Record<string, any[]>
  toasts: string[]
  invalidated: string[]
  broken: Set<string>
  status: (string | undefined)[]
  session: { id: string }
}

// Answers beneath the plugin under test, standing in for the engine: each event's bottom hook
// records what reached it and returns it unchanged.
export function boot(on: any, o: { config?: string; store?: Record<string, unknown>; broken?: string[]; uiThrows?: boolean } = {}): Env {
  const env: Env = { files: new Map(), seen: {}, toasts: [], invalidated: [], broken: new Set(o.broken), status: [], session: { id: 's1' } }
  if (o.config !== undefined) env.files.set(CONFIG, o.config)
  mock.store(on, o.store ?? {})
  const answer = (ev: string, reply: (e: any) => unknown) =>
    on(ev, async (_$: any, e: any) => {
      ;(env.seen[ev] ??= []).push(e)
      if (env.broken.has(ev)) throw new Error(`beneath ${ev} failed`)
      return reply(e)
    })
  answer('session.root', () => ({ value: '/repo' }))
  answer('session.id', () => ({ value: env.session.id }))
  answer('fs.exists', e => ({ value: env.files.has(e.path) }))
  answer('fs.read', e => ({ value: env.files.get(e.path) }))
  on('ui.toast', async (_$: any, e: any) => {
    if (o.uiThrows) throw new Error('toast broke')
    return (env.toasts.push(e.text), { value: undefined })
  })
  on('ui.status', async (_$: any, e: any) => {
    if (o.uiThrows) throw new Error('status broke')
    return (env.status.push(e.text), { value: undefined })
  })
  on('ui.invalidate', async (_$: any, e: any) => (env.invalidated.push(e.event), { value: undefined }))
  answer('prompt.submit', e => ({ text: e.text, context: e.context }))
  // Only a plugin's own append (door `note`) can be refused, so the tests append that way and the
  // bottom records the row and refuses it.
  answer('session.append', () => ({ deny: 'recorded' }))
  answer('prompt.section', e => ({ text: e.text }))
  answer('prompt.context', e => ({ blocks: e.blocks, instructionFiles: e.instructionFiles }))
  answer('prompt.attachment', e => ({ text: e.text }))
  answer('tool.describe', e => ({ description: e.description }))
  answer('agent.spawn', () => ({ model: 'm', agentId: 'a1' }))
  answer('session.send', () => ({ isDelivered: true }))
  answer('session.compact', () => ({ messages: [{ role: 'user', text: 'summary', toolUses: [] }] }))
  answer('model.complete', () => ({ value: { isAnswered: true, text: 'ok', usage: {} } }))
  answer('model.fork', () => ({ value: { isAnswered: true, text: 'ok', usage: {} } }))
  answer('model.classify', () => ({ value: 'a' }))
  return env
}

// The test's `$` has no model noun, so an inline plugin calls `$.model` and relays the result.
export const modelBridge = {
  name: 'model-bridge',
  register(on: any) {
    on('skill.prompt', async ($: any, e: any) => {
      const { op, args } = JSON.parse(e.text)
      const call = op === 'classify' ? () => $.model.classify(args.text, ['a', 'b']) : op === 'fork' ? () => $.model.fork(args) : () => $.model.complete(args)
      const out = await call().catch((err: any) => ({ threw: String(err) }))
      return { text: JSON.stringify(out ?? null) }
    })
  },
}
export const model = async ($: any, op: string, args: object) => JSON.parse((await $.skill.prompt({ skill: 'x', text: JSON.stringify({ op, args }) })).text)

// The state the vault keeps, read through an inline plugin.
export const vaultReader = {
  name: 'vault-reader',
  register(on: any) {
    on('skill.prompt', async ($: any) => ({ text: JSON.stringify((await $.state.get({ plugin: 'secret-stash', key: 'vault' })).value ?? null) }))
  },
}

export const row = (content: any[], over: object = {}) => ({
  message: { type: 'user', role: 'user', content },
  door: 'note',
  origin: { kind: 'plugin', name: 'p' },
  uuid: 'u1',
  ...over,
})
export const toolResult = (content: unknown) => ({ type: 'tool_result', tool_use_id: 't1', content })
export const appended = (env: Env, i = 0) => env.seen['session.append'][i].message.content
