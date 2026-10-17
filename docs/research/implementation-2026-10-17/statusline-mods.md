# Batch statusline-mods

## Plugins created

| Name | Type | Description (plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `git-statusline` | mod (`hooks/hooks.json` modules) | A mod that draws a git line under the prompt: repo path, branch, linked-worktree marker, ahead/behind with colour past unpushed-commit thresholds, staged/modified/new/conflict counts, changed lines and stash count. | `archive/plugins/coremods/hooks/git-line/line.tsx` + its wiring in `archive/plugins/coremods/hooks/register.tsx`; tests from `archive/plugins/coremods/tests/git-line.test.tsx`; ideas from claude-hud (`docs/research/claude-hud.md` section 3, claude-hud `src/render/vcs.ts` thresholds) | none |
| `mcp-health` | mod (`hooks/hooks.json` modules) | A mod that shows `mcp: <server> ✗` under the prompt while an MCP server's latest tool call errored, hidden while all are fine, with an optional toast on each server's first error. | new; idea from claude-hud (`docs/research/claude-hud.md` section 3) | none |

Files:
- `plugins/git-statusline/`: `.claude-plugin/plugin.json` (with `userConfig` `push_warning_threshold` default 5, `push_critical_threshold` default 20), `hooks/hooks.json`, `hooks/register.tsx` ($ code), `hooks/line.tsx` (pure: parsers, `parseRevParse`, `countStashes`, `aheadColor`, `thresholdsOf`, `renderLine`), `tests/register.test.tsx`, `README.md`.
- `plugins/mcp-health/`: `.claude-plugin/plugin.json` (with `userConfig` `toast_on_first_error` default true), `hooks/hooks.json`, `hooks/register.tsx`, `hooks/health.ts` (pure: `serverOf` with 256-char bound, `outcomeOf`, `record`, `segment`, `toastText`, `toastEnabled`), `tests/register.test.tsx`, `README.md`.

Both render into `ui.render { component: 'PromptHint' }` as a column Box with `{await next(e)}` first and their own line beneath, and return `next(e)` when they have nothing to show, so they compose with each other, the engine hint and any other plugin.

## API surfaces checked in cc.d.ts

- `ToolCallResult` (line ~10047): core's errored result is `{ isError: true, result, text?, ref? }`; deny is `{ deny }`. `McpToolName` = `mcp__${string}__${string}`.
- `PromptHint` render props (`isDraft`, `isWorking`, `hint`), terminal surface only; hook may draw its own tree.
- `$.ui.toast(text, { timeoutMs })`, `$.ui.log(text, { to: 'debug' })` (`UiLogSink`), `$.ui.status`, `$.session.cwd()`, `$.process.run(argv, { timeoutMs, cwd, env, stdin })`.
- `Register = (on, options: PluginOptions)`; `PluginOptions` are the manifest `userConfig` values with defaults filled in.

## Validation and tests

- `claude plugin validate --strict plugins/git-statusline`: passed. Hooks: session.start, session.measure, ui.render{component=PromptHint}.
- `claude plugin validate --strict plugins/mcp-health`: passed. Hooks: tool.call, session.end, ui.render{component=PromptHint}. It reports `gating hook without .catch: tool.call`, which is expected: the hook only observes and never denies, so a throw skips it and the call goes through. A `.catch` returning `next(e)` after next was called risked re-running the tool, so it was left out on purpose.
- `claude plugin test plugins/git-statusline`: 19 pass, 0 fail (parsers, worktree parsing, stash count, thresholds, mounted line incl. worktree marker, error colour at 25 ahead, logs-once on failure).
- `claude plugin test plugins/mcp-health`: 8 pass, 0 fail (parser bounds, outcome, record/segment, mounted PromptHint through real `$.tool.call` with a stub tool beneath: hidden, shown, toast once, cleared; non-MCP passthrough).
- Grep for `codegraph`, `claude-mem`, `coding-core:`, `github:`, `Efficient `, `coremods:`: none.
- `git rev-parse --path-format=absolute --show-toplevel --git-dir --git-common-dir` checked on git 2.56 in this repo (three absolute lines).

## Deviations from the plan

- git-statusline: errors go to the debug log (`{ to: 'debug' }`) instead of the transcript, per mod-authoring's checklist. The archive's separate `git rev-parse --show-toplevel` call is folded into one `rev-parse` that also yields the worktree dirs.
- Unpushed thresholds default to 5 / 20 (claude-hud defaults to 0 = off); configurable via `userConfig`. Below the warning threshold `↑N` stays green as before.
- Worktree marker is drawn as `⎇ wt:<name> <branch>` in theme colour `suggestion`; `$.session.repo()` was not needed.
- mcp-health uses PromptHint (shareable via `next()` composition), not `$.ui.status`.

## Unverified / TODO

- Theme key `suggestion` for the worktree marker is not listed in cc.d.ts (Text colours are "a theme key or a raw color"); it's a standard Claude Code theme key but wasn't verified live.
- Not run live in a real session (`claude --plugin-dir`); only through `claude plugin test`.
- `--path-format=absolute` needs git 2.31+; on older git the rev-parse output is unparsable and the line falls back to the cwd only (no crash).
- mcp-health: a user-interrupted MCP call also returns `isError`, so it marks the server until the next good call (documented in README).
- `userConfig` with `type: "number"` passed `validate --strict` but the `/config` editor for it wasn't tried.

## Suggested follow-ups

- Coordinator: register both in the marketplace and add them to `baseline` per the plan.
- Consider a test that loads both mods together (`test(..., { plugins: [...] })`) to pin the stacking order at PromptHint once usage-band/other PromptHint mods land.
