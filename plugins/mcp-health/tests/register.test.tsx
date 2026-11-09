import { describe, expect, test } from 'claude-code/testing'
import { register } from '../hooks/register'
import { EMPTY, ignoredServers, MAX_TOOL_NAME, outcomeOf, record, segment, serverOf, toastEnabled } from '../hooks/health'

describe('serverOf', () => {
  test('parses the server from mcp__<server>__<tool>', async () => {
    expect(serverOf('mcp__github__create_issue')).toBe('github')
    expect(serverOf('mcp__claude_ai_Gmail__send_message')).toBe('claude_ai_Gmail')
    expect(serverOf('mcp__plugin_x_y__do__thing')).toBe('plugin_x_y')
  })

  test('rejects non-MCP, malformed and overlong names', async () => {
    expect(serverOf('Bash')).toBeNull()
    expect(serverOf('mcp__github')).toBeNull()
    expect(serverOf('mcp____tool')).toBeNull()
    expect(serverOf('mcp__github__')).toBeNull()
    expect(serverOf(42)).toBeNull()
    expect(serverOf(`mcp__s__${'x'.repeat(MAX_TOOL_NAME)}`)).toBeNull()
  })
})

describe('outcomeOf', () => {
  test('error, ok and deny', async () => {
    expect(outcomeOf({ isError: true, result: 'boom' })).toBe('error')
    expect(outcomeOf({ result: {}, text: 'ok' })).toBe('ok')
    expect(outcomeOf({ deny: 'no' })).toBe('skip')
    expect(outcomeOf(undefined)).toBe('skip')
  })
})

describe('record and segment', () => {
  test('an error marks the server, a success clears it, the first error is flagged once', async () => {
    let r = record(EMPTY, 'github', 'error')
    expect(r).toMatchObject({ changed: true, firstError: true })
    expect(segment(r.health)).toBe('mcp: github ✗')
    r = record(r.health, 'github', 'error')
    expect(r).toMatchObject({ changed: false, firstError: false })
    r = record(r.health, 'github', 'ok')
    expect(r.changed).toBe(true)
    expect(segment(r.health)).toBeNull()
    r = record(r.health, 'github', 'error')
    expect(r).toMatchObject({ changed: true, firstError: false })
  })

  test('a skip changes nothing; many servers collapse to +N', async () => {
    expect(record(EMPTY, 'a', 'skip').changed).toBe(false)
    let h = EMPTY
    for (const s of ['a', 'b', 'c', 'd', 'e']) h = record(h, s, 'error').health
    expect(segment(h)).toBe('mcp: a ✗ b ✗ c ✗ +2')
  })

  test('toast defaults on', async () => {
    expect(toastEnabled({})).toBe(true)
    expect(toastEnabled({ toast_on_first_error: false })).toBe(false)
  })
})

describe('ignoredServers', () => {
  test('splits on commas and spaces and drops invalid names', async () => {
    expect([...ignoredServers({ ignore_servers: 'github, sentry  claude_ai_Gmail,,a@b.c' })]).toEqual(['github', 'sentry', 'claude_ai_Gmail', 'a@b.c'])
    expect([...ignoredServers({ ignore_servers: 'ok bad/name $x ' + 'x'.repeat(65) })]).toEqual(['ok'])
  })

  test('an over-long list, a non-string and no options give an empty set', async () => {
    expect(ignoredServers({ ignore_servers: 'a '.repeat(2049) }).size).toBe(0)
    for (const v of [undefined, 42, true, ['github'], { github: 1 }, null]) expect(ignoredServers({ ignore_servers: v }).size).toBe(0)
    expect(ignoredServers(undefined).size).toBe(0)
  })
})

// Mounts the hint with a tool beneath the mod that errors while `failing()` is true.
async function setup($: any, on: any, failing: () => boolean, toasts: string[]) {
  on('tool.call', async (_$: any, e: any) =>
    failing() ? { isError: true, result: `${e.tool} failed`, text: 'failed' } : { result: 'ok', text: 'ok' },
  )
  on('ui.toast', async (_$: any, e: any) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.render', { component: 'PromptHint' }, async ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>{e.props.hint}</Text>
  })
  return $.ui.mount({
    plugin: 'mcp-health',
    surface: 'terminal',
    component: 'PromptHint',
    props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
  })
}

const rows = async (ui: any) => {
  const root = await ui.drawn()
  const walk = (n: any): string => (typeof n === 'string' ? n : (n.children ?? []).map(walk).join(''))
  return root.props?.flexDirection === 'column' ? root.children.map(walk) : [walk(root)]
}

describe('register', () => {
  test('hidden while fine, shown after an error, toasts once, cleared by a success', async ($, on) => {
    let failing = false
    const toasts: string[] = []
    const ui = await setup($, on, () => failing, toasts)
    const props = { isDraft: false, isWorking: false, hint: '? for shortcuts' }

    await $.tool.call({ tool: 'mcp__github__get_issue', number: 1 } as never)
    await ui.redraw(props)
    expect(await rows(ui)).toEqual(['? for shortcuts'])

    failing = true
    const out: any = await $.tool.call({ tool: 'mcp__github__get_issue', number: 1 } as never)
    expect(out.isError).toBe(true)
    await $.tool.call({ tool: 'mcp__github__get_issue', number: 2 } as never)
    await ui.redraw(props)
    expect(await rows(ui)).toEqual(['? for shortcuts', 'mcp: github ✗'])
    expect(toasts).toEqual(['MCP server github returned an error'])

    failing = false
    await $.tool.call({ tool: 'mcp__github__get_issue', number: 3 } as never)
    await ui.redraw(props)
    expect(await rows(ui)).toEqual(['? for shortcuts'])
  })

  test('non-MCP tools pass through untouched', async ($, on) => {
    const toasts: string[] = []
    const ui = await setup($, on, () => true, toasts)
    const out: any = await $.tool.call({ tool: 'Bash', command: 'false' } as never)
    expect(out.isError).toBe(true)
    await ui.redraw({ isDraft: false, isWorking: false, hint: '? for shortcuts' })
    expect(await rows(ui)).toEqual(['? for shortcuts'])
    expect(toasts).toEqual([])
  })

  test('an ignored server never shows or toasts', { options: { ignore_servers: 'github' } }, async ($, on) => {
    const toasts: string[] = []
    const ui = await setup($, on, () => true, toasts)
    const props = { isDraft: false, isWorking: false, hint: '? for shortcuts' }

    await $.tool.call({ tool: 'mcp__github__get_issue', number: 1 } as never)
    await ui.redraw(props)
    expect(await rows(ui)).toEqual(['? for shortcuts'])
    expect(toasts).toEqual([])

    await $.tool.call({ tool: 'mcp__sentry__get_issue', number: 1 } as never)
    await ui.redraw(props)
    expect(await rows(ui)).toEqual(['? for shortcuts', 'mcp: sentry ✗'])
    expect(toasts).toEqual(['MCP server sentry returned an error'])
  })

  test('enabled: false registers nothing; anything else keeps the mod on', () => {
    const events = (opts: Record<string, unknown>) => {
      const seen: string[] = []
      register(((e: string) => { seen.push(e); return { catch() {} } }) as any, opts as any)
      return seen
    }
    expect(events({ enabled: false })).toEqual([])
    for (const o of [{}, { enabled: true }, { enabled: 'false' }, { enabled: 0 }, { enabled: '' }]) expect(events(o).length).toBeGreaterThan(0)
  })
})
