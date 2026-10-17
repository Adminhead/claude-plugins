# Three complete mods

Written 2026-10-17. Each mod below was scaffolded, passed `claude plugin validate` and passed `claude plugin test` on Claude Code 2.1.302 before being written here. Patterns follow:

- The `plugin-authoring` skill's examples (`band.tsx`, `pane.tsx`, `tool-call.ts`, bundled with Claude Code 2.1.302)
- https://code.claude.com/docs/en/plugins/mods/create.md, https://code.claude.com/docs/en/plugins/mods/interface.md, https://code.claude.com/docs/en/plugins/mods/events.md, https://code.claude.com/docs/en/plugins/mods/test.md
- The built-in mods at https://github.com/anthropics/claude-code/tree/main/mods (`diff`, `agents-md`, `telemetry`, `sec-default`)
- Local real-world mods: `/home/buck/Projects/adminhead/claude-plugins/archive/plugins/coremods/` (one `register.tsx` hosting four mods, classic hooks beside it, `hooks/vendor/unbash.js`), `/home/buck/Projects/adminhead/claude-plugins/3rd-party/ponytail/hooks/band/register.tsx` (an `AbovePrompt` band on `$.state`), `/home/buck/Projects/adminhead/claude-plugins/3rd-party/claude-seo/plugins/seo-cockpit/hooks/register.ts` (a spend guard with `$.ui.ask`, a pane, `userConfig`)

Every mod needs the same two files. `plugin.json`:

```json
{ "name": "<mod-name>", "version": "0.1.0", "description": "<one line>", "author": { "name": "<you>" } }
```

`hooks/hooks.json` (one module path, relative to this file; classic `"hooks"` may sit beside it):

```json
{ "modules": ["./register.tsx"] }
```

## 1. A band above the prompt: last turn's duration and tool calls

Module variables plus `$.ui.invalidate`. Keeps other mods' band content beneath its own. Layout: `hooks/format.ts` (pure), `hooks/register.tsx`, `tests/register.test.tsx`.

```ts
// hooks/format.ts: pure formatting, nothing here touches `$`.
export type Turn = { seconds: number; tools: number }
export const bandText = (t: Turn) => `last turn ${t.seconds}s · ${t.tools} tool ${t.tools === 1 ? 'call' : 'calls'}`
```

```tsx
// hooks/register.tsx
import type { Register } from 'claude-code'
import { bandText, type Turn } from './format'

export const register: Register = on => {
  let startedAt = 0
  let tools = 0
  let last: Turn | null = null

  on('prompt.submit', async ($, e, next) => {
    startedAt = await $.clock.now()
    tools = 0
    return next(e)
  })

  on('tool.call', ($, e, next) => {
    tools += 1
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      last = { seconds: Math.round(((await $.clock.now()) - startedAt) / 1000), tools }
      if (last.seconds > 120) $.ui.toast(`That turn took ${last.seconds}s`)
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || last === null) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    // Other mods share the band: draw theirs below ours. next(e) rejects only when nothing answers beneath.
    const below = await next(e).catch(() => undefined)
    return (
      <Box flexDirection="column">
        <Text dimColor wrap="truncate-end">{bandText(last)}</Text>
        {below}
      </Box>
    )
  })
}
```

```tsx
// tests/register.test.tsx
import { describe, expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'turn-band',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 100, scroll: { offset: 0, bodyRows: 8 }, view: {} },
} as const

describe('register', () => {
  test('the band shows the last turn once one completed', async ($, on) => {
    const clock = mock.clock(on)
    on('prompt.submit', ($, e) => ({ text: e.text }))
    on('tool.call', () => ({ result: 'ok' }))
    on('turn.complete', () => ({ text: '' }))
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', props: {}, children: ['engine'] }))

    const ui = await $.ui.mount(BAND)
    expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()

    await $.prompt.submit({ text: 'hi', origin: { kind: 'composer' } })
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    await clock.advance(3000)
    await $.turn.complete({ turnId: 't1', answer: 'done', durationMs: 3000, isAborted: false, usage: null, reason: 'answer' } as never)

    expect(await ui.find({ type: 'Text', text: /last turn 3s · 1 tool call/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
  })
})
```

`validate` prints `hooks: prompt.submit, tool.call, turn.complete, ui.render{component=AbovePrompt}`, two `gating hook without .catch:` facts (fine: these hooks never deny, so a failure should fall through) and `calls: $.clock.now, $.ui.invalidate, $.ui.resolve, $.ui.toast`. A status-line variant replaces the band with `$.ui.status(bandText(last))` from `turn.complete` (one pinned line per plugin; `undefined` clears it).

## 2. A `tool.call` guard that denies with a reason, fails closed, and pins a status line

Pure verdict in a side file, bounded input length, `.catch` so a crash denies instead of letting the command through. Layout: `hooks/guard.ts`, `hooks/register.tsx`, `tests/register.test.tsx`.

```ts
// hooks/guard.ts: pure logic, nothing here touches `$`.
export const MAX_COMMAND = 64 * 1024
const FORCE_PUSH = /\bgit\s+push\b[^|;&]*(--force\b|-f\b)/
export function verdict(command: string): string | null {
  // The command is model-controlled text: bound it before any regex runs on it.
  if (command.length > MAX_COMMAND) return 'sample-mod: command over 64 KB; write it to a script and run that.'
  if (FORCE_PUSH.test(command)) return 'sample-mod: force pushes are refused here. Push to a new branch instead.'
  return null
}
```

```tsx
// hooks/register.tsx
import type { Register } from 'claude-code'
import { verdict } from './guard'

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const deny = verdict(e.command)
    if (deny !== null) return { deny } // the model reads this text: write it as an instruction
    const ran = await next(e)
    $.ui.status(ran.isError ? `last Bash failed: ${e.command.slice(0, 40)}` : undefined)
    return ran
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'sample-mod: the guard failed, so the command was not run.' }))
}
```

```tsx
// tests/register.test.tsx
import { describe, expect, test } from 'claude-code/testing'
import { verdict } from '../hooks/guard'

describe('register', () => {
  test('verdict is pure', () => {
    expect(verdict('ls')).toBeNull()
    expect(verdict('git push --force')).toContain('refused')
  })
  test('a force push is denied before the tool runs', async ($, on) => {
    const ran: string[] = []
    on('tool.call', ($, e) => { ran.push(e.tool); return { result: 'ok' } })
    const out = await $.tool.call({ tool: 'Bash', command: 'git push --force origin main' })
    expect(out.deny).toContain('force pushes')
    expect(ran).toEqual([])
  })
  test('a failed command pins a status line', async ($, on) => {
    const status: unknown[] = []
    on('tool.call', () => ({ result: 'boom', isError: true, text: 'boom' }) as never)
    on('ui.status', ($, e) => { status.push(e.text); return { value: undefined } })
    await $.tool.call({ tool: 'Bash', command: 'false' })
    expect(status).toEqual(['last Bash failed: false'])
  })
})
```

`validate` prints `gating hook with .catch: tool.call{tool=Bash}` and, with `--json`, `gatingHooks: [{ module, pattern, hook, hasCatch: true }]`. Variants from the sources: ask the person first with `let answer = 'Refuse'; try { answer = await $.ui.ask('Run this? ' + e.command, ['Run it', 'Refuse']) } catch {}` (the wait inside `$.ui.ask` does not count against the budget; it rejects in `-p`); decide at `tool.check` instead when a rule depends on live state (`const decided = await next(e); ... return { decision: 'deny', reason }`); for a path guard use `$.fs.stat(path, { resolve: true })` and allow-list `realPath` under a resolved root. Remember a classic `PostToolUse` hook never fires for a call the mod denied: log denies from the mod (coremods writes a JSONL line through `sh -c APPEND_SCRIPT` with the root and path as argv and the record on stdin).

## 3. A slash command that opens a pane, with `$.state`

`/notes [note]` registers at `session.start`, opens a focused pane, and the pane takes typed notes. State lives in `$.state` through `atom`/`read`/`update` so a hot reload keeps it and writes redraw the pane without `invalidate`. Layout: `types/index.d.ts` (the contract), `hooks/notes.ts` (pure), `hooks/register.tsx`, `tests/register.test.tsx`. `plugin.json` adds `"types": "./types/index.d.ts"`.

```ts
// types/index.d.ts: the contract; no imports.
export type Note = { id: string; text: string }

declare module 'claude-code' {
  interface PluginState {
    'notes-pane': { notes: Note[] }
  }
}
```

```ts
// hooks/notes.ts: pure logic, nothing here touches `$`.
import type { Note } from '../types'
export const MAX_NOTES = 200
export const MAX_TEXT = 500
export function addNote(list: Note[], id: string, text: string): Note[] {
  const clean = text.trim().slice(0, MAX_TEXT)
  return clean === '' ? list : [...list, { id, text: clean }].slice(-MAX_NOTES)
}
export const dropNote = (list: Note[], id: string) => list.filter(n => n.id !== id)
```

```tsx
// hooks/register.tsx
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import { addNote, dropNote } from './notes'

const PANE = 'notes'
const notes = atom({ plugin: 'notes-pane', key: 'notes' } as const, [])

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({ name: 'notes', description: 'Open the notes pane', argumentHint: '[note]' })
    } catch (err) {
      // A taken name throws; an uncaught throw would skip the rest of this hook.
      $.ui.log(`notes-pane: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
    }
    return next(e)
  })

  on('command.run', { command: 'notes' }, async ($, e) => {
    if (e.args.trim() !== '') await update($, notes, list => addNote(list, crypto.randomUUID(), e.args))
    const opened = await $.ui.open({ id: PANE, title: 'Notes', focus: true, closeOnEscape: true, rows: 12 })
    return opened.isPlaced ? {} : { text: `Notes pane is waiting: ${opened.reason}` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const list = await read($, notes) // subscribes this drawing; a later update redraws it
    return (
      <Box flexDirection="column">
        <Input
          key="new"
          label="Note"
          placeholder="Type a note and press Enter"
          value=""
          submitLabel="add"
          autoFocus
          onSubmit={text => update($, notes, l => addNote(l, crypto.randomUUID(), text))}
        />
        {list.length === 0 && <Text dimColor>No notes yet.</Text>}
        {list.map(n => (
          <Box key={n.id} flexDirection="row" columnGap={1}>
            <Button key={`drop-${n.id}`} plain label="x" onPress={() => update($, notes, l => dropNote(l, n.id))} />
            <Text wrap="truncate-end">{n.text}</Text>
          </Box>
        ))}
      </Box>
    )
  })
}
```

```tsx
// tests/register.test.tsx
import { describe, expect, test } from 'claude-code/testing'
import { addNote, MAX_NOTES } from '../hooks/notes'

const PANE = {
  plugin: 'notes-pane',
  component: 'Pane',
  requestId: 'notes',
  viewport: { columns: 120, rows: 40 },
  props: { title: 'Notes', isFocused: true, bodyColumns: 60, placement: 'inline', scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const

describe('register', () => {
  test('addNote trims, drops empties and caps the list', () => {
    expect(addNote([], 'a', '  ')).toEqual([])
    const full = Array.from({ length: MAX_NOTES }, (_, i) => ({ id: String(i), text: 'n' }))
    expect(addNote(full, 'x', 'new').length).toBe(MAX_NOTES)
  })

  test('/notes registers, opens the pane and the pane takes a note', async ($, on) => {
    const opened: string[] = []
    on('session.start', () => ({ cwd: '/work' }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('ui.open', ($, e) => { opened.push(e.id); return { value: { isPlaced: true } } })

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    const answer = await $.command.run({ command: 'notes', args: '', origin: { kind: 'composer' } } as never)
    expect(answer).toEqual({})
    expect(opened).toEqual(['notes'])

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.input({ key: 'new', text: 'buy milk' })
      expect(await ui.find({ type: 'Text', text: 'buy milk' })).toBeDefined()
      await ui.unmount()
    }
  })
})
```

`validate` prints `types ./types/index.d.ts declares state: notes-pane.notes`, `answers its own command: command.run{command=notes}` (not a gate: the matcher names a command the module registers and the hook never reads `next`), `calls: $.command.register, $.state.get, $.state.set, $.ui.log, $.ui.open, $.ui.resolve`, and `state writes` / `state reads: notes-pane.notes`. To keep notes past the session, also write them to `$.store` from the handler and copy them back in `session.start` and in `on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, ...)`, since `/clear` resets `$.state` without a new `session.start`.

## Patterns worth copying from the real-world mods

- **One `register.tsx`, many mods** (`archive/plugins/coremods/hooks/register.tsx`): a comment at the top states why ("The engine refuses a plugin that registers an event twice, and it follows `$` only through functions in this file"); each mod's pure logic lives in `hooks/<mod>/*.ts`; one `tool.call` hook branches on `e.tool` for all of them; a `report($, mod, err)` helper logs an error once until the next success so a repeating failure stays quiet.
- **Shared band** (coremods, ponytail): draw `await next(e)` beneath your rows; pass `e.props.hasSurvey` through; collapse to a short form while `e.props.isWorking`; size rows to `e.props.bodyColumns` and test every row width at several `bodyColumns`.
- **Pane toggled from a band button** (coremods agent-status): track `paneOpen`, hook `ui.close` to notice the person's Esc, re-`open` the same id to resize (`rows`), check `$.ui.panes()` before reopening.
- **Long-lived polling** (coremods): a `$.clock.every` started once in `session.start` behind an `if (!polling)` guard; reset module state in `session.end` (`/clear` fires it with `reason: 'clear'` and no `session.start` follows).
- **A guard that holds for a human** (seo-cockpit): `$.ui.ask` with an "Allow until reload" label kept in a module `Set`; a failed check holds the call (`deny`) rather than letting it through; every `.catch` handler fails closed.
- **Reading settings without trusting the project** (coremods systemone): `$.settings.read({ source: 'user' })`, because a project's `settings.json` `env` could point the mod at an attacker's server.
- **Hook-side helpers** (coremods `scripts/`): `bun --no-env-file --config=/dev/null`, `node` for the DuckDB script, installs into `${CLAUDE_PLUGIN_DATA}` by an async `SessionStart` classic hook; specs under `scripts/tests/*.spec.ts`.
