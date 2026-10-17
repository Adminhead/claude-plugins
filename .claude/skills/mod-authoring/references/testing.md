# Validating and testing a mod

Written 2026-10-17 from:

- `claude plugin --help`, `claude plugin test --help`, `claude plugin validate --help` run locally on Claude Code 2.1.302 (output below)
- https://code.claude.com/docs/en/plugins/cli-reference.md ("plugin test", "plugin validate", "Flags that load a plugin for one session")
- https://code.claude.com/docs/en/plugins/mods/test.md and https://code.claude.com/docs/en/plugins/mods/troubleshoot.md
- The `plugin-authoring` skill (bundled with Claude Code 2.1.302): its `reference.md` and the `'claude-code/testing'` declarations in its `types/claude-code.d.ts`
- https://github.com/anthropics/claude-code/blob/main/mods/README.md ("Testing") and the built-in mods' `tests/`
- Local examples: `/home/buck/Projects/adminhead/claude-plugins/archive/plugins/coremods/tests/*.test.tsx` (mod tests), `archive/plugins/coremods/scripts/tests/*.spec.ts` (hook-side specs), `3rd-party/claude-seo/plugins/seo-cockpit/tests/` (a `fixtures/world.ts` that stubs the whole world beneath the mod)
- `/home/buck/Projects/adminhead/claude-plugins/CLAUDE.md` ("## Mods")

## The commands and their real flags

```
claude plugin validate [options] <path>
  --json      Output the validation report as JSON (same exit codes)
  --strict    Treat warnings as errors (exit 1)

claude plugin test [dir]
  dir         The mod's folder (default: the current folder)
  (no other flags)
```

`claude plugin test` "runs every `*.test.ts` and `*.test.tsx` under dir, each file in a child of this binary, in an environment like the one the mod's hooks run in. A test file imports its kit from `'claude-code/testing'`. Exits 1 when a test fails." `claude plugin eval` is a different tool (prompt-and-grader evals of a whole plugin, see the `skill-evals` skill), not a mod test runner. In this repo: `claude plugin validate plugins/<name>` and `claude plugin test plugins/<name>`.

## What `validate` prints for a mod

Real output for the guard example in `examples.md`:

```
Validating plugin manifest: .../sample-mod/.claude-plugin/plugin.json

⚠ Found 1 warning:

  ❯ author: No author information provided. Consider adding author details for plugin attribution

Validating hooks: .../sample-mod/hooks/hooks.json

  ❯ ./register.tsx hooks: tool.call{tool=Bash}
  ❯ ./register.tsx gating hook with .catch: tool.call{tool=Bash}
  ❯ ./register.tsx calls: $.ui.status

✔ Validation passed with warnings
```

Lines to expect under `Validating hooks`:

- `hooks: <event>{matcher}, ...`: every `on(...)` pattern, in registration order. A pattern missing here means the scan could not read it (a non-literal event name, `on` aliased).
- `calls: $.noun.method, ...`: every `$` call, sorted. A call missing here means `$` was aliased or stored; the module still loads only if the engine's own scan agrees, so write calls literally.
- `gating hook with .catch:` / `gating hook without .catch:`: a fact, not a warning, for each hook at a site whose answer can refuse (`tool.call`, `tool.check`, `prompt.submit`, `config.set`, `plugin.register`, `command.run`, any `$` call event). A guard that denies wants a `.catch`; an observer that only counts does not.
- `answers its own command: command.run{command=x}`: the hook serves a command the module registers by literal name and never reads `next`; not a gate.
- `env reads:` / `env writes:`: the literal names given to `$.env.get`/`set`.
- `types ./types/index.d.ts declares state: <plugin>.<key>` and `declares on $: ...`, then `state reads:` / `state writes:` per module.
- Under the manifest: `types ... declares on $: nothing (no EngineInterface member)` is normal for a mod that only declares `PluginState`.

Exit codes: `0` passed (with or without warnings), `1` failed (or a warning under `--strict`), `2` the validator itself failed. `--json` gives `{ success, strict, target, manifest, contents[], advice }`, each `contents` entry with `errors`, `warnings`, `notes` and `gatingHooks: [{ module, pattern, hook, hasCatch }]`.

Validation errors specific to mods (from the troubleshoot page and the interface page): `on("session.start") is registered twice without a matcher`; `takes a source the scan can read` (an `atom` not held in a `const`, or a non-literal `plugin`/`key`); `<plugin>.<key> is not declared` (missing from `PluginState`); `code nested too deep to scan: more than 2000 scopes`; a `telemetry.*` hook in an installed mod without `{ to: 'collector' }`.

## What `test` prints

```
tests/register.test.tsx:
(pass) register > verdict is pure [1.44ms]
(pass) register > a force push is denied before the tool runs [17.43ms]
(pass) register > a failed command pins a status line [8.38ms]

 3 pass
 0 fail
Ran 3 tests across 1 file. [0.09s]
```

A failing test prints its assertion and a block headed `the engine reported:` listing every hook the engine skipped meanwhile and why (`hook skipped: threw ...`, `no implementation for store.get`, `returned neither { value } nor { deny }`). A file with no `test()` fails with `declares no test(): nothing ran`. Where mods cannot load in that shell the run prints `claude plugin test: hooks modules are turned off` and exits 1.

## How a mod test is structured

```ts
import { describe, expect, mock, test, tier } from 'claude-code/testing'
import Hooks from '../hooks'          // optional: the mod's own pure exports
import Fixtures from './fixtures'     // optional: shared stubs, one export a file

tier('user') // where the mod under test loads: prepend | user (default) | append | builtin

describe('register', () => {
  test('what it does', { timeoutMs: 5000, plugins: [] }, async ($, on) => {
    // 1. stubs first (every `on` before the first call on `$`)
    // 2. fire events through `$`
    // 3. assert
  })
})
```

- `$` in a test is the engine's own: each call fires the event of the same name through every loaded mod, then reaches the test's hooks. `$.tool.call({ tool: 'Bash', command: 'ls' })`, `$.command.run({ command, args })`, `$.prompt.submit({ text, origin })`, `$.session.start({ cwd, surface, isInteractive })`, `$.turn.complete({...})`, `$.session.measure({...})`, `$.classic.SessionStart({ source: 'clear' })`, `$.turn.step(...)` (a stream to read to its end).
- `on` in a test registers stubs beneath the mod, standing for the engine. Nothing is beneath them: an unanswered call throws, naming its event (`no implementation for command.register`). The kit answers `$.ui.invalidate`, `$.state` and `$.session.append` itself.
- A stub for a `$` call returns `{ value }` or `{ deny: reason }` (`on('store.get', ($, e) => ({ value: saved.get(e.key) }))`, `on('ui.open', () => ({ value: { isPlaced: true } }))`, `on('process.run', ($, e) => ({ value: { exitCode: 0, stdout: '', stderr: '' } }))`). A stub for an engine event returns that event's own result (`tool.call` → `{ result }`, `session.start` → `{ cwd }`, `prompt.submit` → `{ text }`, `turn.complete` → `{ text: '' }`, `ui.render` → `{ type: 'Text', props: {}, children: ['...'] }`, `command.register` → `{ value: { command } }`).
- `session.start` does not fire by itself: fire it when a hook depends on what it registered, with stubs for `session.start` and `command.register`/`tool.register`.
- Ready mocks: `mock.clock(on, { now? })` returns `{ now, advance(ms), set(ms), settle(), sleep(ms) }` and answers `$.clock.*` so timers run only when the test moves time; `mock.store(on, entries)`; `mock.env(on, vars)`; `mock.session(on)` (2.1.293+) with `appended()`.
- `$.ui.mount({ plugin, surface, component, requestId?, props, viewport? })` draws a render site through the mod and returns a handle: `find({ key } | { type, text })`, `findAll`, `press({ key })`, `input({ key, text, kind? })`, `select({ key, value })`, `drawn()`, `redraw(props)`, `unmount()`. Each act resolves after the handler and any unawaited work settled, so assert on the next line. Loop the body over `['terminal', 'desktop'] as const` so the tree is checked under each surface's element table. A hook that returns `next(e)` at a render site needs a `ui.render` stub or the mount fails with `no implementation for ui.render`. `$.ui.press({ plugin, key })` presses a button in a tree drawn through `$.ui.render`.
- `test(name, { plugins: [{ name, tier?, register }] }, body)` loads inline mods beside the one under test (a policy-mod test, or a provider for a noun another mod adds in `engine.create`). Default timeout 5,000 ms; `timeoutMs` overrides.
- `expect` has `toBe`, `toEqual`, `toMatch`, `toMatchObject`, `toContain`, `toBeDefined`, `toBeUndefined`, `toBeNull`, `toThrow`, `.not`, `.resolves`/`.rejects`, and `expect.any`, `expect.objectContaining`, `expect.anything`.
- Pure side files are tested directly, with no `$`: `import { verdict } from '../hooks/guard'` and a plain `test('...', () => { ... })`. Most of the archived coremods tests are of this kind (`shell.test.tsx` runs the parser over hundreds of commands).
- File naming (built-in mods' convention): `tests/<file>.test.ts(x)` named for what it covers under `hooks/` (`register.test.tsx` for `hooks/register.tsx`); shared fixtures under `tests/fixtures/`, one export per file. The seo-cockpit `tests/fixtures/world.ts` is a good shape: one `worldOf(on, setup)` that stubs `session.start`, `fs.exists`, `fs.list`, `process.run`, `tool.call` and records what the mod asked for.
- An MCP tool a test names that the local machine lacks is cast: `{ tool: 'mcp__server__tool' } as never`.

## Hook-side scripts: `*.spec.ts` with `bun test`

Classic hook scripts under `scripts/` run as real processes and may use real libraries. Their tests are `scripts/tests/*.spec.ts`, run with `bun test plugins/<name>/scripts/tests` from the repo root, never `*.test.*` (which `claude plugin test` would load as a mod test and fail). They spawn the script as the engine would (`Bun.spawn(['bun', '--no-env-file', '--config=/dev/null', SCRIPT], { stdin: 'pipe', env: { PATH, CLAUDE_PLUGIN_DATA: tmpDir } })`), feed the hook JSON on stdin, and read the files it wrote under a `mkdtempSync` data dir. `archive/plugins/coremods/scripts/tests/log-call.spec.ts`, `append-script.spec.ts` (runs the mod's `APPEND_SCRIPT` string with `sh -c` and a fake `$HOME/.claude/plugins/data/<name>/plugin-root`), `session-start.spec.ts` (a stub `npm` on `PATH` in `ok | fail | hang` modes) and `bun-isolation.spec.ts` (every `bun` hook in `hooks.json` ignores the project's `bunfig.toml` and `.env`) show the shapes. Skip a spec that needs an uninstalled library (`const t = haveLib ? test : test.skip`).

## Running it for real

- `claude --plugin-dir <folder>` loads the mod for one session and hot-reloads on save; `claude --debug` for the debug log. `/plugin` shows `N mods active · <name>`.
- A session that hot-reloads a plugin folder prints one dim transcript line per failure: `<plugin>: <event> hook skipped: <reason>`, `<plugin>: ui.render (<Component>) refused: <reason>; the engine drew its own`, `hooks module <name> not loaded: <reason>`. Any other session writes them to the debug log only, so a mod that "does nothing" has usually been told why there.
- `/reload-plugins` re-reads an installed plugin; one whose marketplace source is a relative folder (this repo) is read from the folder itself (`claude plugin list` shows `Read from:`).
- `tsc -p <mod folder>` type-checks once the engine has laid `<mod>/.claude-plugin/types/` (it does so on each load from a folder it hot-reloads); otherwise use the `tsconfig.json` from the d.ts header, kept outside the mod folder.
