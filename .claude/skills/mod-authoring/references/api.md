# The `$` API, condensed

Catalogued 2026-10-17 from:

- https://raw.githubusercontent.com/anthropics/claude-code/main/mods/types/claude-code.d.ts (written by Claude Code 2.1.277; 13,440 lines)
- The copy this build writes, `// Written by Claude Code 2.1.302` (22,262 lines), which the `plugin-authoring` skill lays at `<skill dir>/types/claude-code.d.ts` and the engine lays beside a loaded mod at `<mod>/.claude-plugin/types/claude-code/index.d.ts`
- https://code.claude.com/docs/en/plugins/mods/reference.md and https://code.claude.com/docs/en/plugins/mods/api.md

The GitHub copy can be older than the installed build (the docs say so). Where the two disagree, trust the copy the engine writes for the running version; `grep` it for the name at hand (`'tool.call'`, `Pane: {`, `export type ToolCallResult`). Items marked **(2.1.302)** are absent from the GitHub 2.1.277 copy.

## Shape of every hook

```ts
import type { Register } from 'claude-code'
export const register: Register = (on, options) => {
  on('<event>', { ...matcher }, async ($, e, next) => { ... }).catch(($, e, next) => { ... })
}
```

- `on(pattern, matcher?, hook)`: `pattern` is an event name, a glob (`'*'`, `'classic.*'`, `'ui.*'`) or a negation (`'!tool.describe'`). A matcher is plain data compared field by field; a field may be a literal, a list of literals, or a RegExp. Registering one event twice with no matcher fails the load (`on("session.start") is registered twice without a matcher`).
- `$`: the engine interface below, frozen. Spell every call literally as `$.noun.method(...)`; `claude plugin validate` reads the calls off the source, and a module that spells `on`, `$` or `$.env` other than literally does not load.
- `e`: the event's input, deeply frozen. Rewrite with `next({ ...e, field })`.
- `next(e)`: the hooks beneath, then the engine. Returning without `next` answers the event. `next.signal` (AbortSignal), `next.origin` (`{ plugin, tier }`), `next.budget` (`{ ms, remainingMs }`), `next.event`, `next.is(pattern, e)`, `next.trace`, `next.to(e, tier)` (managed tiers only). In a `.catch` handler: `next.called`, `next.error` (`{ kind: 'throw' | 'timeout' | 're-entry', message?, budget }`).
- `.catch(handler)`: one per registration; the handler's answer stands for the hook when it throws, overruns its budget or returns a wrong shape. Guard pattern: `next.called ? next(e) : { deny: 'why' }` (`next(e)` replays the settled result, nothing runs twice).
- Budget (`HookBudget`): 10,000 ms per dispatch counting only the hook's own code (not `next` or `$` calls in flight, but `$.clock.sleep` counts); `.catch` gets 1,000 ms; 5,000 ms linger after abort; `prompt.edit` hooks get 50 ms.
- `options`: the manifest's `userConfig` values with defaults filled in (`PluginOptions`: string, number, boolean or string list).
- Streaming events (`turn.step`, and `process.spawn` as a hook) take an async generator: `async function* ($, e, next) { const result = yield* next(e); return result }`.

## Nouns on `$` (CoreEngineInterface)

21 namespaces in 2.1.302: `plugin ui model audio mcp session turn prompt tool command config telemetry agent fs store state clock http process settings env`. The GitHub 2.1.277 copy lacks `telemetry` and `state`.

| Namespace | Methods (signature → result) | Notes |
| --- | --- | --- |
| `$.plugin` | `name: string`, `root: string` | Values, not calls. `root` is the directory holding `plugin.json`, absolute: the only legitimate source of a script path. |
| `$.ui` | `status(text \| undefined)` pins one line per plugin under the prompt; `toast(text, { timeoutMs? })` (default 4000 ms); `log(text, { to?: 'transcript' \| 'debug' })` dim transcript line the model never reads; `notice(tool_use_id, text \| undefined)` line under an open tool dialog; `ask(question, options \| { options, header, multiSelect }) → Promise<string>` (rejects when dismissed or in `-p`); `open(PaneOpenArgs) → Promise<UiOpenResult>` (`{ isPlaced: true } \| { isPlaced: false, reason }` in 2.1.302; `Promise<void>` in 2.1.277); `close({ id })`; `panes() → UiPane[]` (`{ id, title, isShown, isFocused, isPlaced }`); `resolve(e) → Elements[e.surface]`; `invalidate('ui.render' \| 'prompt.section' \| 'prompt.context' \| 'prompt.attachment' \| 'tool.describe' \| 'command.describe' \| 'config.describe')`; `blit({ requestId, key, cells \| source, columns, rows })`; `scroll({ to, in, block })`; `focus({ requestId, key })`; **(2.1.302)** `copy({ text, surface? }) → { isCopied } \| { isCopied: false, reason }`, `selection() → { text, requestId? } \| undefined`, `view({ agentId? }) → {} \| { deny }`, `notify(text, { title? }) → { isSent, channel } \| { isSent: false, reason }` | `open` args: `id` (1-64 of `[A-Za-z0-9_-]`), `title?`, `focus?: true`, `closeOnEscape?: true`, `holdToasts?: true`, `rows?`, `columns?` (booleans accept only `true`; omit to leave off). An unasked pane waits undrawn below 144 columns (110 once the person opened it). Redraws throttle to 10/s (30/s for the shown pane, band and hint). Status/toast/log draw their first 2,000 chars on the terminal. |
| `$.model` | `complete({ model, prompt, system?, maxTokens?, effort?, timeoutMs? })`; `fork({ prompt })`; `classify(text, labels, { model? }) → string \| undefined` | In 2.1.302 `complete` resolves `ModelCompleteResult`: `{ isAnswered: true, text, usage }` or `{ isAnswered: false, reason: 'api-error' \| 'empty-reply' \| 'aborted', ... }`, never a bare string (2.1.277 typed it `Promise<string>`). `prompt`/`system` take a string or `{ text, cache? }[]` blocks. `maxTokens` default 1024, max 64,000. Bills to the session's credentials. |
| `$.audio` | `play(clip, { shouldLoop?, gain?, signal? })`, `speak(text, { voice? })` | `clip` is `{ asset }` (the plugin's own file), a URL, or base64 bytes. |
| `$.mcp` | `call(server, tool, args?) → { content, isError }`; **(2.1.302)** `connect(server) → { isConnected, server } \| { reason, message }` | No permission prompt: the call is the grant. `connect` names a server in this plugin's own manifest. |
| `$.session` | `messages() → SessionMessage[]` (`{ role, text, toolUses }`, newest 4,096); `cwd()`, `root()`, `model()`, `turns()`, `id()`, `repo() → SessionRepo \| null`, `surfaces() → RenderSurface[]`, `surface()` (deprecated), `usage({ breakdown?, columns? }) → { startedAt, context, rateLimits, cost }`, `version() → { version, base, builtAt }`, `compact({ instructions? }) → { messages } \| { skip }`, `append({ message, agentId? })`, `authorize() → { handle, kind } \| null`; **(2.1.302)** `send({ to, text }) → { isDelivered } \| { isDelivered: false, reason }`, `identity()` (managed mods only) | `usage()` is what the status line shows: `context.percent`, `rateLimits[]` of `{ kind, percentUsed, resetsAt }`, `cost.usd`. |
| `$.turn` | `abort({ turnId })` | `turnId` from a `turn.start` hook. |
| `$.prompt` | `submit({ text, asUser? })` (queues a turn; resolves when it starts); `read() → { text, cursor }`; `fill({ text, mode?: 'replace' \| 'append' \| 'insert' }) → { isFilled }`; `suggest({ text }) → { isShown }`; `compose(facts?) → { sections }`; **(2.1.302)** `media({ id })` (managed mods only) | Don't `await` `submit` from a hook that runs while a turn is in flight. |
| `$.tool` | `list() → ToolInfo[]`; `call({ tool, ...args }) → ToolCallResult`; `check({ tool, input }) → { decision, reason?, ... }`; `register({ name, description, inputSchema?, isDeferred? }) → { tool }` | A registered tool is `mcp__<plugin>__<name>`; serve it with `on('tool.call', { tool: 'mcp__<plugin>__<name>' }, ...)` returning `{ result }`. `register` rejects until `session.start`. `isDeferred: false` puts the schema in the prompt (2.1.293+). |
| `$.command` | `list() → CommandInfo[]`; `run({ command, args? }) → { text?, context? }`; `register({ name, description, argumentHint?, immediate?: true }) → { command }` | Serve with `on('command.run', { command: '<name>' }, ...)` returning `{ text }` or `{}`. A built-in name is refused (throws); register last in `session.start` or wrap in try/catch. `immediate` lets `/name` run mid-turn. |
| `$.config` | `list() → ConfigRow[]`; `set({ key, value }) → { value } \| { deny }` | The `/config` rows, including other plugins' `userConfig` fields. |
| `$.telemetry` **(2.1.302)** | `log({ to: 'anthropic' \| 'collector', event, props })`, `mark({ feature, kind: 'ok' \| 'sad' \| 'bad', reason?, props? })` | Rows are sent only for Claude Code and built-in mods. An installed mod hooking `telemetry.*` must give the matcher `{ to: 'collector' }` or validation fails. |
| `$.agent` | `spawn({ prompt, description?, subagentType?, model?, name?, cwd? }) → { model, agentId } \| { deny }`; `list() → AgentInfo[]` (`status`: pending, running, waiting, idle, completed, failed, killed); `register(spec) → { agent }` | A registered type is `<plugin>:<name>`; hide it from the model with `on('agent.offer', { agent }, () => ({ isOffered: false }))`. |
| `$.fs` | `read(path, { as?: 'text' \| 'bytes' })` (4 MiB cap); `write(path, text)` (creates dirs; not atomic); `list(path?) → { name, kind, size, isLink }[]`; `exists(path)`; `stat(path, { resolve?: true }) → { kind, size, mtimeMs, isLink, realPath? }`; `ancestors({ names, of?, below? })` | Relative paths resolve against the session's (or the subagent's) cwd. A guard allow-lists `realPath` under a resolved root; a deny-list on spellings is best effort. |
| `$.store` | `get(key) → unknown`; `set(key, jsonValue)`; `delete(key)`; `keys()` | One JSON file per plugin under the user's config dir (`~/.claude/plugins/store/`), 4 MiB total, shared by every session on the machine, kept across reloads and sessions. `get` then `set` is not atomic. |
| `$.state` **(2.1.302)** | `get(ref) → { value, version }`; `set(ref, value, { ifVersion? }) → { isSet, version }` | Session-scoped reactive state, reset by `/clear`, `/resume`, `/branch`, kept across a hot reload. A `ui.render` hook that reads a value subscribes; a write redraws the readers (no `invalidate` needed). Writes are refused while drawing. `ref` is `{ plugin, key }` with both literals, declared in the contract (`interface PluginState`). Helpers imported from `'claude-code'`: `atom(ref, initial)`, `read($, source)`, `update($, atom, fn)`, `derive(sources, fn)`, `memberOf(family, e)`. Hold each `atom` in a `const`. |
| `$.clock` | `now() → number`; `sleep(ms, { signal? })`; `after(ms, fn) → { cancel }`; `every(ms, fn) → { cancel }` | The only timers (no `setTimeout`). A reload drops pending timers. Start long-lived work in `session.start`. |
| `$.http` | `fetch(url, { method?, headers?, body?, auth?, socketPath? }) → { status, ok, headers, text }` | Through the host, never the module's own network. 30 s, 5 redirects, 4 MiB body each way; cross-origin redirects drop all but `accept`, `accept-language`, `content-type`, `user-agent`. |
| `$.process` | `run(argv, { cwd?, env?, stdin?, timeoutMs? }) → { exitCode, stdout, stderr }` (30 s default, 10 min max; rejects if it cannot start or is still running at timeout); **(2.1.302)** `spawn({ argv, cwd?, env?, input? })` streams `{ stream, text }` chunks then `{ code, signal }` | No shell: `argv[0]` is the executable. `CLAUDE_PLUGIN_DATA` is not in the child's env (it is for classic hook commands). Git runs with repo hooks off. |
| `$.settings` | `read({ source?: 'user' \| 'project' \| 'local' \| 'flag' \| 'policy' }) → Settings` | Read only; the merge, or one source. |
| `$.env` | `get(name) → string \| undefined`; `set(name, value \| undefined)` | `name` must be a string literal in source; validate lists reads and writes. Affects this process and everything it starts after. |

## Events (EngineEventOf) and what a hook returns

Every `$` call is also an event named without the `$.` (`fs.read`, `ui.open`, `model.complete`, `state.set`); a hook on one sees calls from mods beneath it and returns `next(e)`, `{ value }` or `{ deny: reason }`. Classic settings-hook events are `classic.<Event>` (`classic.Stop`, `classic.SessionStart`, `classic.PreToolUse`, ...), `e` being the hook's stdin JSON (`classic.PreToolUse`'s `e` is the `ToolCallEnvelope`).

| Event | Fires when | Return |
| --- | --- | --- |
| `tool.call` | A tool is about to run (subagents and MCP tools included). `e.tool`, `e.tool_use_id`, `e.agentId?`, the tool's arguments spread on `e` (`e.command` for Bash, `e.file_path` for Read/Edit). | `next(e)`; `{ deny: reason }` (the model reads it); `{ result, context? }`. `next(e)` resolves `{ ref, result, text }` or `{ ..., isError: true }` or `{ deny }`. A deny after `next` withholds the result. |
| `tool.check` | The permission decision, after `tool.call` and `PreToolUse` hooks. `e.tool`, `e.input`, `e.agentId?`, `e.ceiling?` | `{ decision: 'allow' \| 'ask' \| 'deny', reason? }`; `next(e)` reads the engine's verdict and runs nothing. |
| `tool.describe` | Once per tool when its description is first sent. | `{ description, isDeferred? }` |
| `ui.render` | A render site is about to be drawn. `e.component`, `e.surface`, `e.requestId`, `e.props`, `e.viewport?` | A tree; `next(e)`; `next({ ...e, props })`. An invalid tree makes the engine draw its own. |
| `ui.resolve` | At load, per surface and component. | The element table. |
| `ui.press`, `ui.input`, `ui.select` | A Button/Input/Select a mod drew is used; `e.plugin`, `e.element` (the key), `e.value` | `next(e)` or an answer that takes it. |
| `ui.message`, `ui.fault` **(2.1.302 for fault)** | A `Client` posts data; a `Client` failed (`e.phase`, `e.reason`). | `next(e)` |
| `ui.scroll`, `ui.focus`, `ui.close` | A site's window or focus ring moves; a pane is about to close (`e.id`, `e.origin.kind`: `plugin`, `person`, `unload`). | `next(e)`, `{}`, `{ deny }` |
| `agent.offer` | A subagent type is offered to the model. | `{ isOffered: false }` to hide. |
| `agent.spawn` | A subagent or teammate (`e.isTeammate`) is about to start. | `next({ ...e, model })` or `{ deny }` |
| `prompt.submit` | A prompt is submitted. `e.text`, `e.origin.kind`, `e.command?` | `next({ ...e, text })`, `next({ ...e, context: [...] })`, `{ drop: reason }` |
| `prompt.fill`, `prompt.suggest`, `prompt.edit` | Draft or suggestion text is about to go in the box; the person edits it. | `next(e)` with changed text; `{ isFilled: false }`; `{ isShown: false }` |
| `prompt.change`, `prompt.autocomplete`, `prompt.mention` **(2.1.302)** | The box changed; a word ends at the cursor (`e.token`); a file is about to be @-read. | `{ suggestions }`; `next({ ...e, path })` or `{ deny }` |
| `prompt.compose`, `prompt.section`, `prompt.context`, `prompt.attachment` | The system prompt is rendered; one named section; the first message's context blocks; an injected message. | `{ sections }`; `{ text }` or `{ text: null }`; `{ blocks }`. Cached per session until `$.ui.invalidate(<event>)`; unstable answers spend the prompt cache. |
| `skill.prompt`, `attribution.text` | A skill's text is expanded (`e.skill`, `e.source`, `e.pluginName`, `e.path`, `e.frontmatter`); a commit/PR text is composed (`e.kind`). | `{ text }` |
| `command.run` | `/name args` typed or `$.command.run`. `e.command`, `e.args`, `e.origin`, `e.presentation` | `{ text }`, `{}`, `next(e)` |
| `command.describe`, `config.describe`, `config.set` | Listing a command or `/config` row; a row changes. | `{ description, argumentHint, isHidden }`; `{ label, description, isHidden }`; `next({ ...e, value })` or `{ deny }` |
| `telemetry.log`, `telemetry.mark` **(2.1.302)** | A record or feature mark is logged. | `next(e)` or `{ deny }`; matcher `{ to: 'collector' }` required for installed mods. |
| `session.start` | Once per loaded mod before the first prompt, and after each reload. Not after `/clear`. `e.cwd`, `e.surface`, `e.isInteractive` | `next(e)`. Register commands/tools and start timers here. |
| `session.end` | Exit, `/clear`, `/resume`, `/branch`, logout. `e.reason`: `clear`, `resume`, `logout`, `prompt_input_exit`, `other` | `next(e)` |
| `session.receive`, `session.send` **(2.1.302 for send)** | A message arrives for / leaves this session. | `{ consumed: reason }`; `{ isDelivered: false, reason }` |
| `session.append` | Each row the conversation stores, before it is stored (`e.door`, `e.origin`, `e.message`). | `next({ ...e, message })` with changed `content` only. |
| `session.compact`, `session.attach`, `session.detach`, `session.measure` | Compaction; a client joins/leaves; usage moved (`e.context`, `e.rateLimits`, `e.changed`). | `{ skip }`; `next(e)` |
| `plugin.register` | A hooks module is about to load (`e.name`, `e.tier`, `e.root`, `e.provenance`, `e.uses: { events, calls, env? }`). | `{ refuse: reason }` |
| `turn.start`, `turn.step`, `turn.complete` | A turn begins (`e.turnId`); one model request (streams; `e.agentId?`, `e.model`); a turn ended (`e.answer`, `e.durationMs`, `e.usage`, `e.isAborted`, `e.agentId?`). | `next(e)`; `yield* next(e)` or `next({ ...e, model \| effort })`; `{ text }` for a line under the answer. |
| `engine.create` | `$` is being built for this mod. | `$` with a noun added (ships a `types/index.d.ts` contract declaring it on `EngineInterface`). |

## Render sites (`RenderComponent`) and props

`Pane` (`title`, `isFocused`, `bodyColumns`, `placement: 'dock' \| 'inline'`, `scroll: { offset, bodyRows }`, `view`; `requestId` is the pane id), `AbovePrompt` (`hasSurvey`, `isWorking`, `maxRows`, `bodyColumns`, `scroll`, `view`; one instance; terminal and desktop), `PromptHint` (`isDraft`, `isWorking`, `hint`), `SessionMode` (`modes`), `Spinner` (`word`, `message`, `suffix`, `mode`), `TurnDuration`, `InfoNotice`, `ToolProgress`, `UserMessage`, `AssistantMessage`, `ToolUse`, `ToolResult`, `ToolGroup`, `CommandOutput`, `AskUserQuestion`. Size a tree to `e.props.bodyColumns`, never `e.viewport.columns`. `e.viewport` carries `columns`, `rows`, `isFullscreen` and is absent until the surface measured.

## Elements (`$.ui.resolve(e)`)

`Box` (flex layout, `gap`/`padding`/`margin` as cells or steps `xs`..`xl`, `borderStyle` in `single double round bold singleDouble doubleSingle classic arrow dashed quote`, `width`, `height`, `position`, `hover`, `key`), `Text` (`color`, `dimColor`, `bold`/`weight`, `italic`, `underline`, `inverse`, `wrap: 'wrap' \| 'truncate' \| 'truncate-start' \| 'truncate-middle' \| 'truncate-end'`), `Button` (`key`, `label`, `onPress(e)`, `hotkey` one digit or lowercase letter, `plain?: true`, `dimColor`, `variant: 'primary' \| 'secondary'`, `role: 'dismiss'`, `autoFocus?: true`, `action`), `Input` (`key`, `label`, `placeholder`, `value`, `submitLabel`, `onSubmit(value)`, `onInput(value)`, `autoFocus`), `Select` (`key`, `label`, `options: { value, label }[]`, `value`, `onSelect(value)`), `Link` (`href` ≤ 2,048 chars, `label`), `Code` (`source`, `language`, `path`, `startLine`, `format: 'diff'`, `wrap`), `Markdown` (`text`, `key`, `onLinkPress`, `pressableLinks`), `Svg` (desktop, vscode), `Client` (terminal, desktop), `Raster` and `Image` (terminal only). `mobile` has no `Input`, `Select` or `Client`. JSX compiles against the globals `h` and `Fragment`; never declare, import or shadow either, and never add a `@jsx` pragma.

## Globals in the module

`URL`, `URLSearchParams`, `TextEncoder`, `TextDecoder`, `AbortController`, `AbortSignal`, `atob`, `btoa`, `structuredClone`, `crypto.subtle.digest`, `crypto.randomUUID`, `crypto.getRandomValues`, `performance.now`, plus ES2023. Nothing else: see `sandbox.md`.
