---
name: mod-authoring
description: Writes and reviews Claude Code mods, the TSX hooks modules (`hooks/register.tsx` named by `hooks/hooks.json` `"modules"`) that import the `claude-code` mods API and hook the engine through `on(event, matcher, ($, e, next) => ...)`. It covers choosing a mod over a classic hook or skill, scaffolding the plugin files, the `$` API surface (`$.ui`, `$.tool`, `$.command`, `$.process`, `$.fs`, `$.state`, `$.store`, `$.clock` and the rest), panes, the band above the prompt, status lines, toasts, slash commands, `tool.call` guards, prompt hooks, the sandbox limits and vendoring, this repo's house rules, security, and testing with `claude plugin validate` and `claude plugin test`. Use when creating or changing a hooks module or mod, a pane, band, status line, toast, slash command, registered tool, or `tool.call`/`prompt.submit` hook in a Claude Code plugin, or when asked to review one. Not for classic settings hooks (hook-authoring) or SKILL.md files (skill-authoring).
---

# Mod authoring

A mod is a plugin whose behaviour is a hooks module: one `register(on, options)` export whose hooks are functions `($, e, next)` run inside Claude Code. `$` is the engine interface (every call spelled `$.noun.method`), `e` the event's frozen input, `next(e)` the hooks beneath and then the engine. Returning without `next` answers the event; `next({ ...e, x })` rewrites it. The module runs in a sandbox with no DOM and no Node: everything outside it goes through `$`.

Sources of truth, in order: the d.ts the engine writes for the running build (`<mod>/.claude-plugin/types/claude-code/index.d.ts` after a load; the `plugin-authoring` skill lays a copy at its `types/claude-code.d.ts` when invoked), then https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts (may lag the installed build), then https://code.claude.com/docs/en/plugins/mods/reference. Check a `$` method or event shape there before relying on it; never invent one. `references/api.md` is the condensed catalogue. The repo's `CLAUDE.md` "## Mods" section is authoritative for house rules and is folded in below.

## Workflow

1. **Confirm a mod is the right tool.** A mod is for drawing (a pane, the band above the prompt, a status line, a toast, redrawing an engine site), holding or answering a tool call or prompt in-process, a zero-token `/command`, or state shared between hooks. A script that blocks, allows or logs an event is a classic hook (`hook-authoring`); instructions are a skill (`skill-authoring`); an external system is an MCP server. Both kinds can live in one plugin: `hooks/hooks.json` holds `"modules"` and classic `"hooks"` side by side (coremods does).
2. **Scaffold.** `.claude-plugin/plugin.json` (`name`, `version`, `description`, `author`; add `"types": "./types/index.d.ts"` when using `$.state`), `hooks/hooks.json` with `{ "modules": ["./register.tsx"] }` (one path, relative to that file), `hooks/register.tsx`, `tests/`. Validate first: `claude plugin validate plugins/<name>`.
3. **Write `register.tsx`.** `import type { Register } from 'claude-code'`; `export const register: Register = (on, options) => { ... }`. One module per plugin: the engine refuses a plugin that registers the same event twice without a matcher, so every mod in a plugin shares this one `register.tsx` and branches inside its hooks (`on('tool.call', ...)` once, `if (e.tool === ...)` inside). Put all `$` code here.
4. **Keep pure logic in side files** that never touch `$` (`hooks/<mod>/*.ts`): parsing, formatting, verdicts, tree builders that take the element table as an argument. They are unit-tested without the engine and reusable from hook-side scripts.
5. **Add UI through `$.ui.*` and `ui.render`.** `const { Box, Text, Button, Input } = $.ui.resolve(e)` then JSX (the globals `h`/`Fragment` are provided: never declare or import them). Match the site: `{ component: 'Pane', requestId: ID }`, `{ component: 'AbovePrompt' }`, `{ component: 'PromptHint' }`. Size to `e.props.bodyColumns`. Return a tree, `next(e)` to draw nothing, or `next({ ...e, props })` to tweak the engine's drawing; keep other mods' band content with `{await next(e)}` as a child. Open a pane with `await $.ui.open({ id, title, focus: true, closeOnEscape: true })` from a command or press (an unasked pane waits below 144 columns; read `isPlaced`). Redraw with `$.ui.invalidate('ui.render')` after module state changes, or keep drawing state in `$.state` (`atom`/`read`/`update` from `'claude-code'`, declared in `types/index.d.ts`) so writes redraw by themselves and survive a hot reload.
6. **Handle events.** Observe with `return next(e)`; act after with `const out = await next(e); ...; return out`; rewrite with `next({ ...e, text })`; answer with `{ deny }`, `{ result }`, `{ text }`, `{ drop }` per event (table in `references/api.md`). Register commands and tools in `session.start` (awaited before turn one), serve them with `on('command.run', { command }, ...)` and `on('tool.call', { tool: 'mcp__<plugin>__<name>' }, ...)`. Start timers there with `$.clock.every`/`after`; a reload drops them. `/clear` fires `session.end` with `reason: 'clear'` and no `session.start`, and resets `$.state`: reset module state in `session.end`, reload persisted values on `classic.SessionStart` with `{ source: ['clear', 'resume', 'fork'] }`. `turn.step` hooks are async generators (`yield* next(e)`).
7. **Guards fail closed.** Any hook that can refuse (`tool.call`, `tool.check`, `prompt.submit`, `config.set`, `plugin.register`) gets `.catch(($, e, next) => next.called ? next(e) : { deny: 'why' })`. Without it a thrown or timed-out guard is skipped and the call goes through. Budget: 10 s of the hook's own code per dispatch (`next` and `$` calls in flight don't count; `$.clock.sleep` does), 1 s for the handler.
8. **Vendor a dependency only as a relative bundle** (`bun build entry.js --format=esm --target=browser --outfile=hooks/vendor/<name>.js`, provenance header, `grep` it for `WebAssembly|new Function|eval|process\.|require\(|node:`). Anything needing Node, WASM or native code goes to a hook-side script instead. Recipe in `references/sandbox.md`.
9. **Validate, test, iterate.** `claude plugin validate plugins/<name>` (`--strict` in CI, `--json` for the `gatingHooks` list) then `claude plugin test plugins/<name>`. Read validate's `hooks:` and `calls:` lines: a missing call means `$` was aliased. Try it live with `claude --plugin-dir plugins/<name>` (hot reload on save; `claude --debug` for the log) or, for an installed copy from this marketplace, edit and `/reload-plugins`.

## API surface (details and signatures in `references/api.md`)

| Namespace | Key methods | Notes |
| --- | --- | --- |
| `$.plugin` | `name`, `root` | `root` is the only source of a script path |
| `$.ui` | `status`, `toast`, `log`, `notice`, `ask`, `open`, `close`, `panes`, `resolve`, `invalidate`, `blit`, `scroll`, `focus`, `copy`, `selection`, `view`, `notify` | `status` is one pinned line per plugin, `undefined` clears; `log(text, { to: 'debug' })` keeps it off screen; `ask` rejects in `-p` |
| `$.command` / `$.tool` | `register`, `run`/`call`, `list`, `check` | Register in `session.start`; a built-in command name throws (register last or try/catch) |
| `$.agent` | `spawn`, `list`, `register` | Hide a type from the model with `agent.offer` → `{ isOffered: false }` |
| `$.model` | `complete`, `fork`, `classify` | `complete` resolves `{ isAnswered, text, usage }` or `{ isAnswered: false, reason }` (2.1.302); bills the session |
| `$.prompt` | `submit`, `read`, `fill`, `suggest`, `compose` | `submit` queues a turn; don't await it mid-turn |
| `$.session` | `messages`, `cwd`, `root`, `id`, `repo`, `usage`, `surfaces`, `version`, `compact`, `append`, `send` | `usage()` is the status line's figures |
| `$.fs` | `read`, `write`, `list`, `exists`, `stat`, `ancestors` | 4 MiB per read/write; `stat(p, { resolve: true }).realPath` for path guards |
| `$.store` / `$.state` | `get`, `set`, `delete`, `keys` / `get`, `set` (+ `atom`, `read`, `update`, `derive`, `memberOf`) | store: JSON, 4 MiB, shared by all sessions, persistent; state: per session, reactive, reset by `/clear` |
| `$.clock` | `now`, `sleep`, `after`, `every` | The only timers; `mock.clock` drives them in tests |
| `$.http` / `$.process` | `fetch` / `run(argv, { cwd, env, stdin, timeoutMs })`, `spawn` | No shell; `CLAUDE_PLUGIN_DATA` is not in the env |
| `$.settings` / `$.env` / `$.mcp` / `$.config` / `$.audio` / `$.telemetry` / `$.turn` | `read` / `get`, `set` / `call`, `connect` / `list`, `set` / `play`, `speak` / `log`, `mark` / `abort` | `$.env` names must be string literals |

Events: `tool.call`, `tool.check`, `tool.describe`, `ui.render`, `ui.press`/`input`/`select`, `ui.close`, `prompt.submit`, `prompt.compose`/`section`/`context`/`attachment`, `command.run`, `config.set`, `session.start`/`end`/`measure`/`append`/`compact`/`receive`, `turn.start`/`step`/`complete`, `agent.offer`/`spawn`, `plugin.register`, `engine.create`, `classic.<Event>`, and every `$` call as `<noun>.<method>`.

## Sandbox constraints (full list in `references/sandbox.md`)

- Imports: only the plugin's own files by relative path (`.ts .tsx .jsx .js .mjs .cjs .mts .cts`, ES modules) and `'claude-code'`. No bare npm imports, no `require`, no dynamic `import()`.
- Not present: `node:` modules, `process`, `Buffer`, `fetch`, `setTimeout`/`setInterval`, DOM, `console` (in hooks modules), `WebAssembly`, `eval`/`new Function`. A vendored bundle that needs any of these fails to load. Present: `URL`, `TextEncoder`/`Decoder`, `AbortController`, `crypto.subtle`/`randomUUID`, `atob`/`btoa`, `structuredClone`, `performance.now`.
- `$` must be spelled literally at every call so `claude plugin validate` can list what the module calls; never store or alias `$` or `on`. Hold each `atom` in a `const` with literal `plugin`/`key`.
- `CLAUDE_PLUGIN_DATA` is not in a mod's `$.process.run` env; it is set for classic hook commands. A mod knows its install only as `$.plugin.root`.
- Limits: hook 10 s own time; `process.run` 30 s default/10 min max; `http.fetch` 30 s and 4 MiB; `store` 4 MiB; redraws throttled to 10/s; command, tool and pane names `[A-Za-z0-9_-]{1,64}`.
- A reload (every save while developing) re-runs `register` in a fresh environment: module variables and timers start over, `$.state` and `$.store` stay.

## Testing (details in `references/testing.md`)

- Mod tests are `*.test.ts`/`*.test.tsx` anywhere in the plugin, run by `claude plugin test plugins/<name>`; `import { describe, expect, mock, test, tier } from 'claude-code/testing'`. The body gets the engine's `$` (each call fires that event through the mod) and `on` (stubs beneath the mod, registered before the first `$` call). A `$`-call stub returns `{ value }` or `{ deny }`; an event stub returns that event's result. `session.start` doesn't fire by itself. `mock.clock(on)` drives timers; `$.ui.mount({ plugin, surface, component, requestId, props })` draws a site and returns `find`/`press`/`input`/`select`/`unmount`; loop surfaces `['terminal', 'desktop'] as const`.
- Hook-side scripts (`scripts/`) are tested by `scripts/tests/*.spec.ts` with `bun test`, never `*.test.*`, because `claude plugin test` loads every `*.test.*` as a mod test.
- Test pure side files directly; test hooks through `$`; test a drawing through `$.ui.mount`.

## Security rules

- Text in `e` for `tool.call`, `prompt.submit`, `command.run` args and `ui.input` is model- or person-controlled. Bound its length before any regex or parser runs on it (`if (command.length > MAX) return { deny }`), and cap what you echo back (`slice(0, 40)`).
- `$.process.run` takes argv, never a shell string built from input. When a shell is unavoidable, pass values as argv to `sh -c` (`['sh', '-c', SCRIPT, 'sh', $.plugin.root, path]`) and the payload on stdin; the script string is a constant.
- Script paths come from `$.plugin.root` only. Find the data dir by matching the `plugin-root` file the SessionStart hook wrote under `~/.claude/plugins/data/<name>-*`; never take a path from a file in the data dir or from settings.
- Classic hooks do not fire for a call a mod denied: a denying mod logs its own denies.
- A deny reason reaches the model: write it as an instruction (`"... Push to a new branch instead."`), never as a secret or an internal path.
- Read mod configuration from `$.settings.read({ source: 'user' })` or `options`, not a project's settings, whose `env` a repo could set to point the mod at a hostile server.
- A path guard allow-lists `realPath` under a resolved root; a deny-list on spellings is best effort. Don't key policy on `e.surface` or a sender's name.
- A guard that asks the person starts from the safe answer and treats a rejected `$.ui.ask` (dismissed, `-p`) as a refusal.

## Quality checklist

- `claude plugin validate` passes with no `--strict` failures; its `hooks:` and `calls:` lines match what you wrote; every denying hook shows `gating hook with .catch`.
- `claude plugin test` passes; at least one test fires the real event through `$` and one mounts each render site on two surfaces.
- `register.tsx` holds only `$` code and wiring; logic is in side files with their own tests.
- Every hook returns in every branch (`next(e)` or an answer); none awaits `$.prompt.submit`/`$.command.run` from inside a running turn's hook.
- `session.start` registers commands/tools, starts timers once (guarded), and tolerates a taken command name.
- Render hooks read `e.props.bodyColumns`, pass `e.props.hasSurvey` through, collapse while `e.props.isWorking`, and return `next(e)` when there is nothing to show.
- Errors are reported once (`$.ui.log(..., { to: 'debug' })` or a once-until-success logger), never thrown out of an observer.
- `plugin.json` has `author` and a version; `description` says what the mod does in one line.

## Anti-patterns

- Two `register` modules or two `on('<event>')` without matchers in one plugin (load refused).
- `const ui = $.ui`, passing `$.ui.toast` as a bare function, or `on` behind a wrapper (validate and the engine lose the scan).
- `import x from 'some-npm-package'`, `require`, `import()`, `setTimeout`, `fetch`, `process.env`, `Buffer` (module fails to load or throws).
- Declaring `h`/`Fragment`, adding a `@jsx` pragma, or using intrinsic tags (`<div>`); elements come only from `$.ui.resolve(e)`.
- Sizing to `e.viewport.columns` instead of `e.props.bodyColumns`; replacing the band without drawing `await next(e)`; writing `$.state` inside a `ui.render` hook.
- Opening a pane unasked from a timer and expecting it to show in a narrow terminal; passing `focus: false` (only `true` or omitted).
- A `tool.call` guard without `.catch`, or one whose regex runs on an unbounded command.
- Reading `CLAUDE_PLUGIN_DATA` in the mod, or taking a script path from a data-dir file.
- A hook-side spec named `*.test.ts`; a mod test that calls `on` after the first `$` call; a stub returning a bare value instead of `{ value }`.
- Expecting `session.start` after `/clear`, or module variables to survive a save.

## References

- `references/api.md`: every `$` namespace, method, event and result shape, with version notes (2.1.277 GitHub copy vs 2.1.302 local build).
- `references/sandbox.md`: what the module can and cannot reach, vendoring recipe, data-dir discovery, mod vs hook-side table, state lifetimes.
- `references/examples.md`: three complete, validated and tested mods (band, `tool.call` guard, slash command opening a pane with `$.state`) plus patterns from coremods, ponytail and seo-cockpit.
- `references/testing.md`: real `claude plugin test`/`validate` flags and output, test structure, stubs, `bun test` specs.
- Local sources: `archive/plugins/coremods/` (one `register.tsx` hosting several mods, classic hooks, vendored parser, hook-side specs), `3rd-party/ponytail/hooks/band/register.tsx`, `3rd-party/claude-seo/plugins/seo-cockpit/hooks/register.ts`. Invoke the bundled `plugin-authoring` skill for Anthropic's own guidance and this build's d.ts.
