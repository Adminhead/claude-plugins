# Plan: configurable options for every plugin that ships hooks

Status: draft, 2026-11-09. Reference commit: `d821c6b` (`check-bypass-guard` got `enabled`).

## Goal

Every plugin under `plugins/` that ships a `hooks/hooks.json` or a mod `hooks/register.tsx` can be switched off and tuned from `/config` (`userConfig`), with defaults that reproduce today's behaviour exactly. An invalid value never weakens a guard.

Done when:

- each of the 17 plugins below has the options listed for it, each with a `default`, none `required`;
- each option has a test of its behaviour (not of copy or labels);
- `python3 scripts/plugins.py check`, `uv run --with pytest --with pyyaml pytest scripts/test_plugins.py` and `claude plugin validate plugins/<name>` pass for each touched plugin;
- plugin.json and marketplace.json versions are bumped together.

## How options reach a hook

Checked against the code and https://code.claude.com/docs/en/plugins-reference (User configuration).

| Kind | Where the value comes from | Value shape |
| --- | --- | --- |
| Classic command hook | env `CLAUDE_PLUGIN_OPTION_<KEY>`, key uppercased with underscores kept: `autoAllowReadOnly` is `CLAUDE_PLUGIN_OPTION_AUTOALLOWREADONLY`, `extra_agents` is `CLAUDE_PLUGIN_OPTION_EXTRA_AGENTS` (`plugins/cloud-ops-guard/scripts/cloud-ops-guard.ts:1320`, `plugins/readonly-agent-gate/scripts/readonly-gate.ts:41`) | always a string: `'true'`, `'false'`, `'60'` |
| Classic hook, exec form | the same env, or `${user_config.KEY}` in `args` | string |
| Classic hook, shell form | env only; `${user_config.*}` in a shell-form `command` is an error | string |
| Mod (`register.tsx`) | second argument `register(on, options)`, defaults filled in (`.claude/skills/mod-authoring/references/api.md:26`); see `plugins/cache-clock/hooks/register.tsx:37` | typed: boolean, number, string |

Consequences used throughout:

- `claude plugin validate` checks `min`, `max` and `options` in the manifest only. Code must still validate what it reads.
- A mod test through the engine takes the plugin's option values as `test(name, { options: { ... } }, async ($, on) => ...)` (`TestOptions.options`, `plugins/git-statusline/.claude-plugin/types/claude-code/index.d.ts:16660`; unlisted values get manifest defaults and are validated against the manifest). The comment at `plugins/bash-rules/tests/register.test.tsx:7-11` saying a test cannot pass options is out of date and is corrected in slice 9. So:
  - behaviour of each option is tested through the engine with `{ options }`, copying the existing engine test named in the slice;
  - value parsing (blank, garbage, over-long, out of range) is tested on the pure parser, because the engine rejects out-of-range values before the mod sees them;
  - the string `"false"` for `enabled` can only reach `register` directly, so the uniform `enabled` check (recipe B) calls `register` with a spy `on` (verified: importing `register.tsx` works under `claude plugin test`).
- `Number('')` is `0`. Every number parser below treats an empty or blank value as unset.
- A mod reads options once at register, so a change takes effect after a reload or a new session. Say so in each option description that this applies to.

## Inventory

17 plugins. "Opts" is what already exists in `userConfig`.

| Plugin (version) | Kind | Events and matchers | Behaviour | Opts today |
| --- | --- | --- | --- | --- |
| `agent-router` 0.2.2 | mod | `classic.SessionStart`, `classic.UserPromptSubmit`, `agent.offer`, `tool.describe{Agent}` | injects a routing table of installed agent types into the Agent tool description, orchestration sessions only | none |
| `agent-status` 0.1.0 | mod | `session.start/end`, `tool.call` (Task*), `agent.spawn`, `ui.render` (AbovePrompt, Pane `agents`), `ui.close` | count line and `agents` pane; observes only | none |
| `atlassian-docs` 0.1.0 | classic | `SessionStart`: `cat hooks/session-context.md` | injects Confluence and Jira guidance | none |
| `bash-rules` 0.6.1 | mod | `tool.describe{Bash}`, `tool.call` (Bash and file tools), `classic.PreToolUse` | denies destructive, smuggling, credential-file and (opt-in) read/write Bash; asks on remote-exec, git rewrite, git clean, unread SQL; model stages | `modelStages`, `ollamaUrl`, `ollamaModel`, `ollamaCloud`, `ollamaTimeoutMs`, `confidence`, `fallbackModel`, `toolSteering`, `primer`, `usageLog` |
| `cache-clock` 0.1.0 | mod | `session.start`, `turn.complete`, `session.end`, `ui.render{PromptHint}` | shows when the prompt cache likely expires; observes only | `ttl`, `display` |
| `check-bypass-guard` 0.3.0 | classic | `PreToolUse` `Bash\|Edit\|Write\|MultiEdit` | denies hook and signing bypasses; asks on lint, format and hook config edits | `enabled` (done) |
| `cloud-ops-guard` 0.3.1 | classic | `PreToolUse` `Bash` | denies unsafe tofu, terraform, terragrunt, aws, pulumi, kubectl, helm changes; brief-token gate for subagents; opt-in allow of read-only forms | `autoAllowReadOnly`, `prodPattern` |
| `consult` 0.3.1 | mod | `session.start` (registers the tool), `tool.call{mcp__consult__consult}` | read-only review through codex or agy; asks before sending code out; secret-file block | `codexSocket`, `codexLockPolicy` |
| `docs-sync` 0.1.1 | classic | `SessionStart`, `PostToolUse` `Edit\|Write\|MultiEdit\|NotebookEdit`, `Stop` | records edits, then once per change set injects docs that mention changed files; fails open | none |
| `git-statusline` 0.1.0 | mod | `session.start`, `session.measure`, `ui.render{PromptHint}` | git line under the prompt; runs up to 4 git commands per refresh | `push_warning_threshold`, `push_critical_threshold` |
| `mcp-health` 0.1.0 | mod | `tool.call`, `session.end`, `ui.render{PromptHint}` | `mcp: <server> ✗` while a server's latest call errored | `toast_on_first_error` |
| `orchestration` 0.3.10 | classic | `SessionStart` `startup`: `sh scripts/link-launcher.sh` | symlinks `~/.local/bin/claude-orchestrate` | none |
| `outline-docs` 0.1.1 | classic | `SessionStart`: `cat hooks/session-context.md` | injects Outline guidance | none |
| `readonly-agent-gate` 0.3.1 | classic | `PreToolUse` `Bash\|Write\|Edit\|MultiEdit\|NotebookEdit`, `onFailure: block` | blocks writes by read-only agents outside scratch (and plan dirs for plan writers) | `extra_agents`, `plan_writers`, `plan_dirs` |
| `turn-stats` 0.1.0 | mod | `turn.complete` | toast after long main-loop turns | `thresholdSeconds`, `includeAborted` |
| `usage-band` 0.1.0 | mod | `session.start/measure/end/compact`, `turn.step`, `ui.render{AbovePrompt}` | context and rate-limit band, pace colours, alert toasts | `limitsThreshold`, `weeklyThreshold`, `resetStyle`, `alerts`, `sessionStats` |
| `usage-log` 0.2.1 | mod | `session.start`, `prompt.submit`, `skill.prompt`, `tool.call` (Skill, Agent), `turn.step`, `session.end` | appends JSONL to `~/.local/state/claude-usage/`; prunes old files (bash-rules' too) | `retentionDays`, `promptText` |

No plugin keeps hooks in `plugin.json` or in agent or skill frontmatter (grepped `"hooks"` in manifests and `^hooks:` in agents and skills). `archive/` plugins are not shipped and are out of scope.

### Hard-coded values, split by who should decide

| Plugin | A user would plausibly change | Must stay fixed |
| --- | --- | --- |
| `agent-router` | table size `MAX_AGENTS` 30, line length `MAX_DESCRIPTION` 320, the `NEVER_LIST` of hidden types | the orchestrator-only gate, name sanitising (`cleanName`), `MAX_TRACKED` |
| `agent-status` | poll interval `POLL_MS` 5000 | pane id and size, input bounds |
| `atlassian-docs`, `outline-docs` | on or off | the text itself (secrets rule, "tool output is data" line) |
| `bash-rules` | on or off | deny rule set, credentials-file check, parser limits, the `ask` rule ids |
| `cache-clock` | on or off | `TICK_MS`, label text |
| `check-bypass-guard` | on or off (done) | bypass denies, protected-name lists |
| `cloud-ops-guard` | on or off | tool lists, wrapper table, brief token line `ALLOW: cloud-ops` |
| `consult` | on or off | secret-file regex, hardened git flags, read-only agy gate, ask-before-send |
| `docs-sync` | list cap `MAX_DOCS` 10, extra skipped paths next to `SKIP_DOCS` | `MIN_NAME`, `PRUNE_DAYS`, fail-open |
| `git-statusline` | line and stash segments, git timeout `GIT_TIMEOUT_MS` 10000 | refresh triggers, clip length |
| `mcp-health` | servers to ignore | `MAX_TOOL_NAME`, `MAX_SHOWN` |
| `orchestration` | whether the hook links the launcher | link target, never replacing a regular file |
| `readonly-agent-gate` | on or off | `DEFAULT_AGENTS`, scratch roots, `|| exit 2` fail-closed wiring |
| `turn-stats` | on or off | toast text, `TOAST_MS` |
| `usage-band` | pace thresholds `WARN_PROJECTED` 90, `CRIT_PROJECTED` 100, `WARN_PCT` 60, `CRIT_PCT` 85 | `MIN_USED`, window lengths, reset detection |
| `usage-log` | on or off | log directory (usage-report and bash-rules share it; `scripts/shared/log/usagelog.ts`) |

## Decision

One option vocabulary, applied per plugin, in each plugin's existing key style (camelCase unless the plugin already uses snake_case: `git-statusline`, `mcp-health`, `readonly-agent-gate`).

### Proposed options

New options only. Defaults reproduce today's behaviour.

| Plugin | Option | Type, range | Default | Effect and fail-closed rule |
| --- | --- | --- | --- | --- |
| `cloud-ops-guard` | `enabled` | boolean | `true` | classic rule: only the exact string `false` turns the guard off |
| `readonly-agent-gate` | `enabled` | boolean | `true` | same; the check runs before stdin is read |
| `bash-rules` | `enabled` | boolean | `true` | mod rule: only boolean `false` registers nothing; a string `"false"` keeps it on |
| `docs-sync` | `enabled` | boolean | `true` | only `false` skips all three modes; no state is written while off |
| `docs-sync` | `maxDocs` | number 1 to 50 | `10` | blank or non-numeric gives 10; out of range clamps |
| `docs-sync` | `skipPaths` | string, comma or space list | `""` | repo-relative path prefixes excluded from doc matching, added to `SKIP_DOCS`. Accepts only `^[A-Za-z0-9_][A-Za-z0-9_./-]*$` without `..`; other entries are dropped; a value over 4096 characters adds nothing |
| `atlassian-docs` | `enabled` | boolean | `true` | only `false` stops the injection |
| `outline-docs` | `enabled` | boolean | `true` | same |
| `orchestration` | `linkLauncher` | boolean | `true` | only `false` skips the symlink; an existing link is left as is |
| `cache-clock` | `enabled` | boolean | `true` | mod rule |
| `turn-stats` | `enabled` | boolean | `true` | mod rule |
| `mcp-health` | `enabled` | boolean | `true` | mod rule |
| `mcp-health` | `ignore_servers` | string, comma or space list | `""` | MCP server names never tracked. Names must match `^[A-Za-z0-9_.@-]{1,64}$`; a value over 4096 characters ignores nothing |
| `git-statusline` | `enabled` | boolean | `true` | mod rule |
| `git-statusline` | `show_changed_lines` | boolean | `true` | `false` skips `git diff HEAD --numstat` |
| `git-statusline` | `show_stashes` | boolean | `true` | `false` skips `git stash list` |
| `git-statusline` | `git_timeout_seconds` | number 1 to 60 | `10` | per git command; non-numeric gives 10, out of range clamps |
| `usage-band` | `enabled` | boolean | `true` | mod rule |
| `usage-band` | `warnPace`, `critPace` | number 1 to 200 | `90`, `100` | projected percent at reset that turns the window amber and red. Colour only: the run-out marker and its alert text keep the fixed condition `projected > 100` |
| `usage-band` | `warnPercent`, `critPercent` | number 1 to 100 | `60`, `85` | fallback percent when pace cannot be read. If a pair is not strictly `warn < crit`, that pair reverts to its defaults |
| `agent-status` | `enabled` | boolean | `true` | mod rule |
| `agent-status` | `pollSeconds` | number 1 to 60 | `5` | non-numeric gives 5, out of range clamps |
| `agent-router` | `enabled` | boolean | `true` | mod rule |
| `agent-router` | `maxAgents` | number 1 to 100 | `30` | rows in the table |
| `agent-router` | `descriptionChars` | number 40 to 1000 | `320` | characters per row |
| `agent-router` | `hideAgents` | string, comma or space list | `""` | more types to omit, added to `NEVER_LIST`; names pass `cleanName`; over 4096 characters hides nothing |
| `usage-log` | `enabled` | boolean | `true` | mod rule; off also skips the retention prune |
| `consult` | `enabled` | boolean | `true` | mod rule; off means the tool is never registered |

`check-bypass-guard` keeps `enabled` only. `cache-clock`, `turn-stats`, `usage-log` and the two injectors get only the on/off: their remaining knobs already exist or would only retune display text.

### Rejected alternatives

- A `display: 'off'` value on `cache-clock` instead of `enabled`: a second switch name for the same thing, and the tests and docs would differ per plugin.
- Exposing the guards' rule lists (disable a bash-rules rule, remove a default read-only agent, add scratch roots, change the cloud-ops tool lists): see "Options not exposed".
- `consult` `defaultTimeoutSec`: `timeoutSec` is already a per-call argument, and the registered tool description states the default, so a changed default would need a second description path for no gain.
- `userConfig` `multiple: true` lists: classic hooks would receive an unspecified env shape, and `/config` does not show them. Comma or space strings match `readonly-agent-gate` (`plugins/readonly-agent-gate/scripts/agents.ts:35`).
- Per-project `outlineCollection`, `confluenceSpace`, `jiraProject` hints: the injected text already says to use the keys CLAUDE.md names, and `userConfig` is per user.
- A new shared options helper in `scripts/shared/`: each plugin needs a three-line parser; vendoring it would add a `sync-shared` target and a drift check for no reuse beyond a few lines.

## Options not exposed, and why

- **Any list or switch that removes a deny rule** in `bash-rules`, `cloud-ops-guard`, `check-bypass-guard`, `readonly-agent-gate`. They exist because a model can be wrong in exactly that place. `enabled` is the only way to weaken them, and it is all-or-nothing and explicit.
- **`bash-rules` ask-tier rules** (`git-rewrite`, `git-clean`, `remote-exec`): the likely wish is quieter asks on `git rebase`. Your own permission rules already decide an ask whenever the guard stays silent, so the cleaner lever is a per-rule `quietAsks` list. Deferred; see open question 2.
- **Scratch roots and `DEFAULT_AGENTS` removal** in `readonly-agent-gate`: widening them lets a reviewer write where it should not.
- **The `ALLOW: cloud-ops` token**, consult's secret-file regex and ask-before-send, `agy-gate.sh`: part of the safety contract and referenced from skills.
- **A usage-log directory option**: `usage-report`, `bash-rules` and `usage-log` must agree on it; it would mean editing `scripts/shared/log/usagelog.ts` and running `sync-shared`.

## Risks

1. **`enabled` off weakens a guard.** Intended and explicit. For `bash-rules` it also drops the credentials-file check and the smuggled-payload deny; the option text must say so (open question 1).
2. **A model that can edit user settings can flip `enabled`.** The value lives in `settings.json` (`pluginConfigs`), as for `d821c6b`. Mitigation is outside this plan: settings edits already prompt, and `readonly-agent-gate` blocks writes by read-only agents. Do not add an environment override, which a Bash call could not reach but which would give a second path.
3. **Blank numbers.** `Number('')` is 0. Each parser treats blank as unset; each has a test for `''`.
4. **A mod `enabled` only applies at load.** Documented in the option text.
5. **Regex or pathspec input.** `docs-sync` `skipPaths` is the only option that reaches `git grep`; it is whitelisted to plain path characters and prefixed with `:(exclude)`.
6. **Config dialog noise.** Every option has a `default` and none is `required`, so enabling a plugin pulled in by `baseline` does not need input. `claude plugin validate` must pass for each.
7. **`sh` for the injectors.** `atlassian-docs` and `outline-docs` move from `cat` to `sh -c`, both found on `PATH` by exec form. `cat` already needed a POSIX userland, `orchestration` already runs `sh`, and the hooks of this marketplace already assume it, so the prerequisite does not change.
8. **`marketplace.json` is edited by every slice.** Each slice changes one `version` line per plugin, so slices merge cleanly, but run them one at a time on `main` and commit per slice.

Rollback: each slice is one commit that adds options with defaults equal to today's behaviour. Reverting a commit removes the options; stored `pluginConfigs` values for a removed key are ignored.

## Reuse analysis

- Reviewed: `d821c6b` (classic `enabled`), `plugins/cloud-ops-guard/scripts/cloud-ops-guard.ts:58-73` (string option with fallback), `plugins/readonly-agent-gate/scripts/agents.ts:35-47` (list option with length cap), `plugins/turn-stats/hooks/stats.ts:12-18` and `plugins/usage-log/hooks/events.ts:13-17` (number parse and clamp), `plugins/mcp-health/hooks/health.ts:74` and `plugins/bash-rules/hooks/register.tsx:185` (boolean in a mod), `plugins/git-statusline/hooks/line.tsx:110-116` (`thresholdsOf`).
- Chosen: reuse these patterns, extend the plugin's existing options module where one exists (`usage-band/hooks/options.ts`, `cache-clock/hooks/clock.ts`, `turn-stats/hooks/stats.ts`, `usage-log/hooks/events.ts`, `git-statusline/hooks/line.tsx`, `mcp-health/hooks/health.ts`), and add one small pure file where none exists (`agent-router/hooks/routes.ts` and `agent-status/hooks/line.tsx` already hold the pure logic).
- Duplication risk: low to medium. The number parser is copied into five plugins (about four lines each) on purpose: mods may import only their own files, and the shared-vendoring rule would be heavier than the copies.

## Shared recipes

Slices point at these by name. A step that says "recipe A" means apply exactly that.

**Recipe A: classic bun hook `enabled`.**

1. In `.claude-plugin/plugin.json` add to `userConfig` (copy `plugins/check-bypass-guard/.claude-plugin/plugin.json` `userConfig.enabled`, changing only the description so it names what off removes for this plugin and ends with "Only an exact false turns it off."):
   ```json
   "enabled": { "type": "boolean", "title": "Enable the guard", "description": "...", "default": true }
   ```
2. In the script's entry point, before stdin is read, add `if (process.env.CLAUDE_PLUGIN_OPTION_ENABLED === 'false') return` (inside `main()`) or `process.exit(0)` (top level). Copy `plugins/check-bypass-guard/scripts/check-bypass-guard.ts:72`.
3. Test with the env param pattern of `plugins/check-bypass-guard/scripts/tests/hook.spec.ts:67-83`: `'false'` prints nothing and exits as a pass (also for malformed stdin), and each of unset, `'true'`, `'FALSE'`, `'0'`, `''` keeps the denial.

**Recipe B: mod `enabled`.** Every "keeps the mod on" test loop includes `undefined`, `true`, `'false'`, `0` and `''` (reviews of slices 4 and 5 caught loops that omitted `0` and `''`, which let a loosened `== false` guard pass). In the engine test config, options go in `{ options }`; a `process.run` event carries its timeout at `e.init.timeoutMs`.

1. Add the same boolean to `userConfig`, title "Enable the mod", description ending "Takes effect after a reload or in a new session." and a first clause naming what off removes.
2. Make the first statement of `register` `if (options?.enabled === false) return` (the argument is named `rawOptions` in `cache-clock`, `turn-stats` and `usage-band`; put the guard before the line that assigns the module-level `options`).
3. In the plugin's existing test file add a test that does not use `$` (precedent: `plugins/git-statusline/tests/register.test.tsx:146`). Import `register` from `../hooks/register`, then:
   ```ts
   const events = (opts: Record<string, unknown>) => { const seen: string[] = []; register(((e: string) => { seen.push(e); return { catch() {} } }) as any, opts as any); return seen }
   expect(events({ enabled: false })).toEqual([])
   for (const o of [{}, { enabled: true }, { enabled: 'false' }]) expect(events(o).length).toBeGreaterThan(0)
   ```
4. Verify with `claude plugin test plugins/<name>`.

**Recipe C: number parser** (add to the plugin's pure options file; copy `plugins/usage-log/hooks/events.ts:15`):
```ts
export const intIn = (v: unknown, min: number, max: number, d: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isNaN(n) ? d : Math.min(max, Math.max(min, Math.floor(n)))
}
```
Tests: undefined, `''`, `'abc'`, `NaN` give the default; below min and above max clamp (`'1e400'` is Infinity and clamps to max, which `Number.isFinite` would have sent to the default, found in the slice 5 review); a fractional value floors.

**Recipe D: name-list parser** (copy `plugins/readonly-agent-gate/scripts/agents.ts:27-47`, minus the JSON branch): split on `/[\s,]+/`, keep entries matching the plugin's name regex, return an empty list when the raw value is over 4096 characters. Tests: split on commas and spaces, drop invalid names, over-long gives empty.

**Version bumps.** Per touched plugin: raise `version` in `plugins/<name>/.claude-plugin/plugin.json` and in the matching entry of `.claude-plugin/marketplace.json` to the same value (minor bump, as in `d821c6b`). Do not bump `baseline` or `orchestration-meta`: their `dependencies` do not change. Do not hand-edit the README catalog; versions are not in it, and `python3 scripts/plugins.py catalog --check` confirms.

**Shared code.** None of these slices edits a vendored file. Vendored copies stay untouched: `shell/walk.ts` and `vendor/unbash.*` (in `cloud-ops-guard`, `check-bypass-guard`, `readonly-agent-gate`, `bash-rules`) and `hooks/log/usagelog.ts` (in `bash-rules`, `usage-log`). If a step seems to need one, stop: edit `scripts/shared/` only, then run `python3 scripts/plugins.py sync-shared`.

## Slices

Order: guards first, injectors and the classic non-guard, then mods from simple to involved, `bash-rules` last. Slices touch disjoint plugin directories; run them one at a time (see risk 8). Every slice ends with its own acceptance commands plus `python3 scripts/plugins.py check`; "Final check" runs the repo-wide suites once after the last slice.

### 1. Classic guards: `cloud-ops-guard` and `readonly-agent-gate` `enabled`

- Goal: both guards can be switched off.
- Files: `plugins/cloud-ops-guard/.claude-plugin/plugin.json`, `plugins/cloud-ops-guard/scripts/cloud-ops-guard.ts`, `plugins/cloud-ops-guard/scripts/tests/enabled.spec.ts` (new), `plugins/cloud-ops-guard/README.md`, `plugins/readonly-agent-gate/.claude-plugin/plugin.json`, `plugins/readonly-agent-gate/scripts/readonly-gate.ts`, `plugins/readonly-agent-gate/scripts/tests/readonly-gate.spec.ts`, `.claude-plugin/marketplace.json`.
- Depends on: nothing. Agent: sonnet.
- Steps:
  1. Apply recipe A step 1 to `plugins/cloud-ops-guard/.claude-plugin/plugin.json`. Description: "Off removes the guard: tofu, terraform, terragrunt, aws, pulumi, kubectl, helm, talosctl and omnictl calls are no longer denied or asked about, and subagents no longer need the brief token, so your permission rules decide."
  2. Add `if (process.env.CLAUDE_PLUGIN_OPTION_ENABLED === 'false') return` as the first line of `main()` in `plugins/cloud-ops-guard/scripts/cloud-ops-guard.ts` (currently line 1322), and add `ENABLED` to the options sentence in the header comment (lines 14-15).
  3. Create `plugins/cloud-ops-guard/scripts/tests/enabled.spec.ts` by recipe A step 3. Spawn `bun --no-env-file --config=/dev/null ../cloud-ops-guard.ts` with env `{ PATH }` plus the option, stdin `{"tool_name":"Bash","tool_input":{"command":"terraform destroy"}}`. Expect `permissionDecision` `deny` when the option is unset, `'true'`, `'FALSE'`, `'0'` or `''`, and empty stdout with exit 0 for `'false'` (also for stdin `{not json`).
  4. Add an `enabled` row to the Settings table in `plugins/cloud-ops-guard/README.md` (line 34 area): default `true`, "Off removes the guard. Only an exact `false` turns it off."
  5. Apply recipe A step 1 to `plugins/readonly-agent-gate/.claude-plugin/plugin.json`. Description: "Off removes the gate: read-only agents may then run any Bash and write anywhere their permissions allow."
  6. In `plugins/readonly-agent-gate/scripts/readonly-gate.ts` add `if (process.env.CLAUDE_PLUGIN_OPTION_ENABLED === 'false') process.exit(0)` immediately before `try {` (line 28 area), and add one sentence to the header comment (lines 12-15).
  7. In `plugins/readonly-agent-gate/scripts/tests/readonly-gate.spec.ts` add `CLAUDE_PLUGIN_OPTION_ENABLED: ''` to `BASE_ENV` (line 95) so the shell's value never leaks in, then add `describe('the enabled option')` using `gate()` (line 100): a `reviewer` `Write` to `/home/u/repo/a.ts` exits 2 when the option is unset, `'true'`, `'FALSE'`, `'0'`, `''`, and exits 0 with `'false'`.
  8. Bump both plugins to `0.4.0` in plugin.json and marketplace.json.
- Acceptance: `bun test plugins/cloud-ops-guard/scripts plugins/readonly-agent-gate/scripts/tests` passes (the cloud-ops spec runs `check.sh` and takes a few minutes), `claude plugin validate plugins/cloud-ops-guard` and `plugins/readonly-agent-gate` pass.

### 2. `docs-sync`: `enabled`, `maxDocs`, `skipPaths`

- Goal: switch the nudge off, cap its list, exclude more paths.
- Files: `plugins/docs-sync/.claude-plugin/plugin.json`, `plugins/docs-sync/scripts/docs-sync-nudge.ts`, `plugins/docs-sync/scripts/tests/check-docs-sync.sh`, `.claude-plugin/marketplace.json`.
- Depends on: nothing. Agent: sonnet.
- Steps:
  1. Add `enabled` (recipe A step 1 shape, title "Enable the nudge", description "Off: nothing is recorded and no docs nudge appears. Only an exact false turns it off."), `maxDocs` (`type: number`, `min: 1`, `max: 50`, `default: 10`, title "Docs listed per nudge") and `skipPaths` (`type: string`, `default: ""`, title "Extra paths to skip", description "Repo-relative path prefixes, separated by commas or spaces, that never count as docs to check, in addition to docs/plans, docs/research, docs/adr, .agents, .claude/plans and CHANGELOG files. Entries with anything but letters, digits, `_ . / -`, or containing `..`, are ignored.") to `userConfig` in `plugins/docs-sync/.claude-plugin/plugin.json`.
  2. In `plugins/docs-sync/scripts/docs-sync-nudge.ts` rename nothing; keep `MAX_DOCS = 10` as the default and add, after the constants (line 25), `maxDocs(raw: string | undefined): number` (recipe C with min 1, max 50, default `MAX_DOCS`, reading the env string) and `extraSkips(raw: string | undefined): string[]` (recipe D with the regex `^[A-Za-z0-9_][A-Za-z0-9_./-]*$`, rejecting entries that contain `..`, capped at 50 entries, each mapped to `` `:(exclude)${entry}` ``).
  3. In `docHits` (line 136) append `...extraSkips(process.env.CLAUDE_PLUGIN_OPTION_SKIPPATHS)` after `...SKIP_DOCS`. In `stop` (lines 192-194) replace `MAX_DOCS` with `const cap = maxDocs(process.env.CLAUDE_PLUGIN_OPTION_MAXDOCS)`.
  4. Before the final `try {` (line 208) add `if (process.env.CLAUDE_PLUGIN_OPTION_ENABLED === 'false') process.exit(0)`.
  5. In `plugins/docs-sync/scripts/tests/check-docs-sync.sh` add cases before the final `echo` (copy the `many` case and the `historic` case for fixtures; prefix a call with `VAR=value hook ...`, which reaches the child because `hook` is a shell function):
     The variable names are the full ones, with the `CLAUDE_PLUGIN_OPTION_` prefix:
     - `CLAUDE_PLUGIN_OPTION_ENABLED=false`: `hook start`, `edit`, `hook stop` on a repo with a mentioning doc are silent and leave no `$root/data/docs-sync/<id>.edited` file; the same sequence with `CLAUDE_PLUGIN_OPTION_ENABLED=''` and `=0` still nudges.
     - `CLAUDE_PLUGIN_OPTION_MAXDOCS=3` on the 15-doc repo lists exactly 3 `.md:` rows; `=''` and `=abc` list 10; `=0` lists 1 (clamped).
     - `CLAUDE_PLUGIN_OPTION_SKIPPATHS=vendor-docs` with a mention only in `vendor-docs/x.md` is silent, and the same repo without the option nudges; `CLAUDE_PLUGIN_OPTION_SKIPPATHS=':(top)*,../x,/etc'` on a repo whose only mention is in `docs/guide.md` still nudges (invalid entries are dropped, nothing is excluded).
  6. Bump `docs-sync` to `0.2.0`.
- Acceptance: `bash plugins/docs-sync/scripts/tests/check-docs-sync.sh` ends with `N passed, 0 failed`; `claude plugin validate plugins/docs-sync` passes.

### 3. Injectors and launcher: `atlassian-docs`, `outline-docs`, `orchestration`

- Goal: stop the SessionStart injections; stop the launcher symlink.
- Files: `plugins/atlassian-docs/{.claude-plugin/plugin.json,hooks/hooks.json,tests/hook.spec.ts (new)}`, `plugins/outline-docs/{.claude-plugin/plugin.json,hooks/hooks.json,tests/hook.spec.ts (new)}`, `plugins/orchestration/{.claude-plugin/plugin.json,scripts/link-launcher.sh,tests/link-launcher.spec.ts (new),README.md}`, `.claude-plugin/marketplace.json`.
- Depends on: nothing. Agent: sonnet.
- Steps:
  1. In `plugins/atlassian-docs/.claude-plugin/plugin.json` add `userConfig.enabled` (boolean, default true, title "Inject Confluence and Jira guidance", description "Off: the SessionStart note is not added. Only an exact false turns it off.").
  2. In `plugins/atlassian-docs/hooks/hooks.json` replace the hook's `"command": "cat"` and its `args` with exec form `"command": "sh"` and `"args": ["-c", "[ \"$CLAUDE_PLUGIN_OPTION_ENABLED\" = false ] || cat \"$1\"", "sh", "${CLAUDE_PLUGIN_ROOT}/hooks/session-context.md"]`. Keep `timeout: 10`.
  3. Create `plugins/atlassian-docs/tests/hook.spec.ts` (bun): read `../hooks/hooks.json`, take the `SessionStart` hook, replace `${CLAUDE_PLUGIN_ROOT}` in `args` with the plugin directory, run it with `Bun.spawnSync([command, ...args], { env: { PATH, ...opt } })`. Expect empty stdout and exit 0 for `{ CLAUDE_PLUGIN_OPTION_ENABLED: 'false' }`; stdout equal to `readFileSync('../hooks/session-context.md')` for unset, `'true'`, `'FALSE'`, `'0'` and `''`.
  4. Repeat steps 1-3 for `plugins/outline-docs` (title "Inject Outline guidance").
  5. In `plugins/orchestration/.claude-plugin/plugin.json` add `userConfig.linkLauncher` (boolean, default true, title "Link the claude-orchestrate launcher", description "Off: the SessionStart hook leaves ~/.local/bin/claude-orchestrate alone. An existing link keeps pointing at the install it was made from. Only an exact false turns it off.").
  6. In `plugins/orchestration/scripts/link-launcher.sh` add, before the `src=` line: `[ "${CLAUDE_PLUGIN_OPTION_LINKLAUNCHER:-}" = false ] && exit 0`.
  7. Create `plugins/orchestration/tests/link-launcher.spec.ts` (bun): in a `mkdtempSync` HOME, run `sh scripts/link-launcher.sh` with `CLAUDE_PLUGIN_ROOT` set to the plugin directory. With the option `'false'` no `$HOME/.local/bin/claude-orchestrate` exists; with unset, `'true'`, `'FALSE'`, `''` it is a symlink to `scripts/claude-orchestrate`. Remove the HOME in `afterAll`.
  8. Add one sentence to the paragraph at `plugins/orchestration/README.md:25` naming `linkLauncher`.
  9. Bump `atlassian-docs` to `0.2.0`, `outline-docs` to `0.2.0`, `orchestration` to `0.4.0`.
- Acceptance: `bun test plugins/atlassian-docs/tests plugins/outline-docs/tests plugins/orchestration/tests` passes; `claude plugin validate` passes for the three; `python3 scripts/plugins.py check` passes (the new `tests/` dirs add no component).

### 4. Observer mods: `cache-clock`, `turn-stats`, `mcp-health`

- Goal: switch each off; `mcp-health` can ignore chosen servers.
- Files: `plugins/cache-clock/{.claude-plugin/plugin.json,hooks/register.tsx,tests/register.test.tsx,README.md}`, `plugins/turn-stats/{.claude-plugin/plugin.json,hooks/register.tsx,tests/register.test.ts,README.md}`, `plugins/mcp-health/{.claude-plugin/plugin.json,hooks/register.tsx,hooks/health.ts,tests/register.test.tsx,README.md}`, `.claude-plugin/marketplace.json`.
- Depends on: nothing. Agent: sonnet.
- Steps:
  1. Apply recipe B to `cache-clock` (guard goes above `options = parseOptions(rawOptions)` at `hooks/register.tsx:38`; the description names "the cache warm and cold line under the prompt"), then add an `enabled` row to the Options list in its README (line 16 area).
  2. Apply recipe B to `turn-stats` (guard above line 11; description names "the long-turn toast"); test file is `.ts`, so keep the spy typed with `as any` and no JSX. Add `enabled` to the README Options list (line 21 area).
  3. Apply recipe B to `mcp-health` (guard above line 10; description names "the failing-server segment and its toast").
  4. In `plugins/mcp-health/hooks/health.ts` add `ignoredServers(options): ReadonlySet<string>` by recipe D reading `options?.ignore_servers` (must be a string; any other type gives an empty set), name regex `^[A-Za-z0-9_.@-]{1,64}$`. Export it.
  5. In `plugins/mcp-health/hooks/register.tsx` compute `const ignored = ignoredServers(options)` next to `toast` (line 10) and change line 14 to `if (server === null || ignored.has(server)) return next(e)`.
  6. Add `ignore_servers` to `plugins/mcp-health/.claude-plugin/plugin.json` (string, default `""`, title "Ignored MCP servers", description "MCP server names to leave out of the failing-server line and toast, separated by commas or spaces. Use the name as it appears in the tool name, mcp__<server>__<tool>.") and to the README (line 13 area).
  7. Add tests in `plugins/mcp-health/tests/register.test.tsx`: `ignoredServers` per recipe D (including a non-string value giving an empty set); and an engine test `test('an ignored server never shows or toasts', { options: { ignore_servers: 'github' } }, ...)` copied from `'hidden while fine, shown after an error, toasts once, cleared by a success'` that makes `mcp__github__get_issue` error (no segment row, no toast) and then `mcp__sentry__get_issue` error (the `mcp: sentry` row and one toast appear).
  8. Bump the three plugins to `0.2.0`.
- Acceptance: `claude plugin test plugins/cache-clock`, `plugins/turn-stats`, `plugins/mcp-health` pass; `claude plugin validate` passes for each.

### 5. `git-statusline`: `enabled`, `show_changed_lines`, `show_stashes`, `git_timeout_seconds`

- Goal: switch off, skip costly git calls, tune the timeout.
- Files: `plugins/git-statusline/{.claude-plugin/plugin.json,hooks/register.tsx,hooks/line.tsx,tests/register.test.tsx,README.md}`, `.claude-plugin/marketplace.json`.
- Depends on: nothing. Agent: sonnet.
- Steps:
  1. In `hooks/line.tsx` after `thresholdsOf` (line 116) add `export type RefreshOptions = { lines: boolean; stashes: boolean; timeoutMs: number }` and `refreshOptionsOf(options)`: `lines` is `options?.show_changed_lines !== false`, `stashes` is `options?.show_stashes !== false`, `timeoutMs` is `intIn(options?.git_timeout_seconds, 1, 60, 10) * 1000` with `intIn` from recipe C added in the same file.
  2. In `hooks/register.tsx` replace the `GIT_TIMEOUT_MS` constant (line 7) with a parameter: change `refresh($)` to `refresh($, o: RefreshOptions)` and use `o.timeoutMs` in the four `$.process.run` calls (lines 23, 29, 34, 35).
  3. In `refresh`, skip the diff when `!o.lines` (treat like `unborn`: `diff` is `null` so `lines` becomes `{ added: 0, deleted: 0 }`) and skip `git stash list` when `!o.stashes` (`stashes` is 0). `renderLine` already hides zero values, so it does not change.
  4. In `register` apply recipe B step 2, then `const refreshOptions = refreshOptionsOf(options)` beside `thresholds` and pass it to both `refresh($, refreshOptions)` calls.
  5. Add the four options to `plugin.json` (`show_changed_lines` and `show_stashes` boolean true; `git_timeout_seconds` number, `min: 1`, `max: 60`, `default: 10`; plus `enabled`). Describe each effect, not the colours.
  6. Tests in `tests/register.test.tsx`: recipe B; pure: `refreshOptionsOf({})` equals `{ lines: true, stashes: true, timeoutMs: 10000 }`, `refreshOptionsOf({ show_changed_lines: false, git_timeout_seconds: '' })` gives `lines: false, timeoutMs: 10000`, and `git_timeout_seconds` 0 and 999 clamp to 1000 and 60000 ms. Engine: extend `mountLine` (line 49) to take an `options` object and a `runs: { argv: string[]; timeoutMs?: number }[]` recorder, filled in the `process.run` stub; then (a) copy `'draws under the engine hint...'` (line 154) with `{ options: { show_changed_lines: false, show_stashes: false, git_timeout_seconds: 3 } }` and assert no recorded argv has `diff` or `stash` as `argv[1]`, no `lines` or `stash` text in the drawn row, and every recorded `timeoutMs` is 3000; (b) the same with default options asserts the `diff` and `stash` runs happen with `timeoutMs` 10000; (c) call `$.session.measure(...)` after the mount (the second refresh trigger) and assert its runs also carry 3000.
  7. Document the options in `README.md` next to the threshold line (line 19). Bump to `0.2.0`.
- Acceptance: `claude plugin test plugins/git-statusline` passes; `claude plugin validate plugins/git-statusline` passes.

### 6. `usage-band`: `enabled` and pace thresholds

- Goal: switch off; set when a window turns amber or red.
- Files: `plugins/usage-band/{.claude-plugin/plugin.json,hooks/options.ts,hooks/pace.ts,hooks/band.tsx,hooks/register.tsx,tests/pace.test.ts,tests/band.test.tsx,README.md}`, `.claude-plugin/marketplace.json`.
- Depends on: nothing. Agent: sonnet.
- Steps:
  1. In `hooks/pace.ts` export `type PaceThresholds = { warnPace: number; critPace: number; warnPercent: number; critPercent: number }` and `DEFAULT_PACE: PaceThresholds = { warnPace: 90, critPace: 100, warnPercent: 60, critPercent: 85 }`; delete `WARN_PROJECTED`, `CRIT_PROJECTED`, `WARN_PCT`, `CRIT_PCT` (lines 30-33).
  2. Change `grade(l, now)` (line 37) to `grade(l, now, t: PaceThresholds = DEFAULT_PACE)` and rewrite the paced branch so colour comes from the thresholds but `ahead` stays the physical fact `projected > 100`:
     ```ts
     const level: Level = projected > t.critPace ? 'crit' : projected >= t.warnPace ? 'warn' : 'ok'
     if (projected > 100) return { level, ahead: true, projected, runsOutAt: now + ((100 - pct) / pct) * elapsed }
     return { level, ahead: false, projected }
     ```
     and the fallback line becomes `level: pct >= t.critPercent ? 'crit' : pct >= t.warnPercent ? 'warn' : 'ok'`. With the defaults this returns exactly what it returned before (`projected > 100` was `crit` and `ahead`).
  3. In `alertText` (line 94 area) change the condition `g.level === 'warn' && g.projected !== undefined` to `!g.ahead && g.projected !== undefined`, so a custom critical pace at or below 100 still says "on pace for ~N%" rather than falling through. (Alerts fire only above `ok`, so with the defaults this is the same branch as before.)
  4. Add a last parameter `t: PaceThresholds = DEFAULT_PACE` to `checkAlerts` (line 108) and pass it to its `grade(l, now, t)` call (line 113).
  5. In `hooks/options.ts` leave `BandOptions` and `parseOptions` alone (an existing test compares `parseOptions(undefined)` exactly, `tests/pace.test.ts:154`). Add `export function paceOf(raw: Readonly<Record<string, unknown>> | undefined): PaceThresholds` using recipe C (`warnPace`, `critPace` 1 to 200; `warnPercent`, `critPercent` 1 to 100). If `warnPace >= critPace`, both `*Pace` values revert to the defaults; if `warnPercent >= critPercent`, both `*Percent` values revert.
  6. In `hooks/band.tsx` add `pace?: PaceThresholds` to `BandInput` (line 21); give `gradeLimits` (line 137) a third parameter `t: PaceThresholds = DEFAULT_PACE` passed to `grade`; in `renderBand` (line 181) call `gradeLimits(usage.rateLimits ?? [], now, input.pace)`.
  7. In `hooks/register.tsx` add a module-level `let pace: PaceThresholds = DEFAULT_PACE`; in `register`, apply recipe B step 2 above `options = parseOptions(rawOptions)` (line 57), then `pace = paceOf(rawOptions)`; pass `pace` to `checkAlerts` in `alert()` (line 35) and `pace` in the `renderBand({...})` argument (line 108).
  8. Add the five options to `plugin.json` (`enabled` boolean; four numbers with `min`, `max` and defaults 90, 100, 60, 85). Describe them as changing colours and alerts only.
  9. Tests. `tests/pace.test.ts`, with a `five_hour` window whose `resetsAt` is `now + 4h` (so one hour of five has elapsed and the projection is five times the percent used): defaults grade 12 percent `ok`, 18 percent `warn` and 24 percent `crit` with `ahead: true` (unchanged results; existing tests pass unchanged); with `{ warnPace: 50, critPace: 80, warnPercent: 60, critPercent: 85 }` 12 percent (projection 60) grades `warn`, 18 percent (projection 90, not above 100) grades `crit` with `ahead: false`; with `critPace: 150` 24 percent (projection 120) grades `warn` with `ahead: true` and a `runsOutAt`. `checkAlerts` with the custom pair toasts at 12 percent where the defaults stay quiet. `paceOf({})` equals `DEFAULT_PACE`; `paceOf({ warnPace: 100, critPace: 90 })` returns the default pace pair; `paceOf({ warnPercent: '' })` returns defaults. `tests/band.test.tsx`: recipe B, and an engine test copied from `'a window pacing to run out is red with ▲, ...'` (in `describe('pace, windows and stats')`) that mounts `{ kind: 'five_hour', percentUsed: 30, resetsAt: at(2.5) }` (projection 60): with `{ options: { warnPace: 50, critPace: 80 } }` the `━` bar has `color` `warning`; with the default options it is `success`.
  10. Add the options to the README table (line 53 area). Bump to `0.2.0`.
- Acceptance: `claude plugin test plugins/usage-band` passes; `claude plugin validate plugins/usage-band` passes.

### 7. `agent-status` and `agent-router`

- Goal: switch off; poll interval; table size, row length and hidden types.
- Files: `plugins/agent-status/{.claude-plugin/plugin.json,hooks/register.tsx,hooks/line.tsx,tests/register.test.tsx,README.md}`, `plugins/agent-router/{.claude-plugin/plugin.json,hooks/register.tsx,hooks/routes.ts,tests/register.test.ts,tests/routes.test.ts,README.md}`, `.claude-plugin/marketplace.json`.
- Depends on: nothing. Agent: sonnet.
- Steps:
  1. `agent-status`: in `hooks/line.tsx` add `pollMsOf(options): number` using recipe C (`pollSeconds`, 1 to 60, default 5, times 1000).
  2. In `hooks/register.tsx` replace `POLL_MS` (line 22) with `let pollMs = 5000`; change `export const register: Register = on =>` (line 93) to `(on, options) =>`, apply recipe B step 2, then set `pollMs = pollMsOf(options)`; use `pollMs` in `startPolling` (line 90).
  3. Add `enabled` and `pollSeconds` (number, 1 to 60, default 5) to its `plugin.json`; document them in the README; tests in `tests/register.test.tsx`: recipe B; `pollMsOf` cases from recipe C; and an engine test copied from `'polls without redrawing while nothing changed'` (line 207) with `{ options: { pollSeconds: 2 } }` that advances the mock clock by 2000 ms and asserts the `agent.list` count (`lists.n`) rose, where the same advance with default options does not.
  4. `agent-router`: in `hooks/routes.ts` add `export type RouteLimits = { maxAgents: number; descriptionChars: number; hidden: ReadonlySet<string> }`, `DEFAULT_LIMITS = { maxAgents: MAX_AGENTS, descriptionChars: MAX_DESCRIPTION, hidden: new Set() }`, and `limitsOf(options): RouteLimits` (recipe C for `maxAgents` 1 to 100 and `descriptionChars` 40 to 1000; recipe D with `cleanName` for `hideAgents`).
  5. Give `selectRows(offers, limits = DEFAULT_LIMITS)` and `renderTable(offers, limits = DEFAULT_LIMITS)` the extra parameter: skip names in `limits.hidden` next to `NEVER_LIST`, `summarize(o.description, limits.descriptionChars)`, `slice(0, limits.maxAgents)` and the `omitted` count from the same value. `HEADING`, `withTable` and the tracking caps stay as they are.
  6. In `hooks/register.tsx` change `register` (line 19, now `(on) =>`) to `(on, options) =>`, apply recipe B step 2 first, compute `const limits = limitsOf(options)`, and pass `limits` to both `renderTable` calls (lines 58 and 79).
  7. Add `enabled`, `maxAgents`, `descriptionChars`, `hideAgents` to its `plugin.json` and README. Tests in `tests/routes.test.ts`: defaults give output identical to the one-argument call; `maxAgents: 2` lists two rows and reports the rest as omitted; `hidden: new Set(['reviewer'])` drops that type; `limitsOf({ maxAgents: '' })` gives 30; `limitsOf({ hideAgents: 'a'.repeat(5000) })` hides nothing. In `tests/register.test.ts`: recipe B, and an engine test copied from the existing `tool.describe` test in that file with `{ options: { maxAgents: 1, hideAgents: 'reviewer' } }` that offers three agent types and asserts the Agent description lists one row, not `reviewer`, plus the omitted-count line.
  8. Bump `agent-status` to `0.2.0` and `agent-router` to `0.3.0`.
- Acceptance: `claude plugin test plugins/agent-status` and `plugins/agent-router` pass; `claude plugin validate` passes for both.

### 8. `usage-log` and `consult`: `enabled`

- Goal: switch off logging and the consult tool.
- Files: `plugins/usage-log/{.claude-plugin/plugin.json,hooks/register.tsx,tests/register.test.tsx,README.md}`, `plugins/consult/{.claude-plugin/plugin.json,hooks/register.tsx,tests/consult.test.ts,README.md}`, `.claude-plugin/marketplace.json`.
- Depends on: nothing. Agent: sonnet.
- Steps:
  1. Apply recipe B to `usage-log`: guard as the first statement of `register` (line 49, above `const o = parseOptions(options)`); description "Off: nothing is logged, and old usage log files, bash-rules' included, are no longer pruned." In `plugins/usage-log/tests/register.test.tsx` add recipe B in `describe('register')`, and an engine test copied from `'a prompt, the listing, a Skill call and its expansion are logged and joined by prompt number'` (line 60) with `{ options: { enabled: false } }` that runs the same session start, prompt and Skill call and asserts the test's `process.run` stub received no append and no prune. Add `enabled` to the README.
  2. Apply recipe B to `consult`: guard as the first statement of `register` (line 108); description "Off: the consult tool is not registered, so no code or plan text can be sent to codex or agy." Add recipe B's spy test to `plugins/consult/tests/consult.test.ts` (it has no engine tests, and the spy test proves the tool is never registered because `session.start` is never hooked); note in the README under the codex options (line 109 area).
  3. Bump `usage-log` to `0.3.0` and `consult` to `0.4.0`.
- Acceptance: `claude plugin test plugins/usage-log` and `plugins/consult` pass; `bun test plugins/consult/tests/consult.spec.ts` still passes; `claude plugin validate` passes for both.

### 9. `bash-rules`: `enabled`

- Goal: switch the guard off. Last, because it is the broadest guard.
- Files: `plugins/bash-rules/{.claude-plugin/plugin.json,hooks/register.tsx,tests/register.test.tsx,README.md}`, `.claude-plugin/marketplace.json`.
- Depends on: open question 1 settled. Agent: sonnet.
- Steps:
  1. Apply recipe B to `plugins/bash-rules`: guard is the first statement of `register` (line 183, above `const o = parseOptions(options)`). Description: "Off removes every bash-rules check: destructive and smuggled commands, the credentials-file check on Bash and the file tools, the asks, the model stages and the usage log. Takes effect after a reload or in a new session." Add it to the existing table at `README.md` line 67 area. Do not touch `hooks/log/usagelog.ts`, `hooks/shell/walk.ts` or `hooks/vendor/`.
  2. In `plugins/bash-rules/tests/register.test.tsx` replace the comment at lines 7-11 that says a test cannot pass options with one saying tests pass them as `{ options }` (other tests in that file keep the manifest defaults). Add recipe B's spy test (the spy returns `{ catch() {} }` because `on('tool.call', ...)` is followed by `.catch(...)` in this plugin), and an engine test `test('enabled false: nothing is denied', { options: { enabled: false } }, ...)` using `world()` (line 15) that sends `rm -rf ~`, a base64-to-shell smuggle (take the command from the existing smuggle test in that file) and a `Read` of the credentials file (take the path from the existing credentials-file test in that file), and asserts each reaches the stub (`w.ran` lists all three, no `.deny`) with no model call.
  3. Bump to `0.7.0`.
- Acceptance: `claude plugin test plugins/bash-rules` passes; `claude plugin validate plugins/bash-rules` passes; `python3 scripts/plugins.py check` reports no drifted vendored copy.

## Final check

Run once after the last slice, from the repo root:

- `python3 scripts/plugins.py check --since d821c6b` passes (every touched plugin has a higher version in plugin.json and marketplace.json).
- `python3 scripts/plugins.py catalog --check` passes.
- `uv run --with pytest --with pyyaml pytest scripts/test_plugins.py` passes.
- Spot-check that no `baseline` or `orchestration-meta` file changed (`git diff --stat d821c6b..HEAD -- plugins/baseline plugins/orchestration-meta` is empty).

## Decisions

Settled by the user on 2026-11-09.

1. `bash-rules` `enabled=false` also drops the credentials-file check on Claude's own `.credentials.json`. The option text says so.
2. No `bash-rules` `quietAsks` list for now. Ship `enabled` first and wait for a real complaint.
3. No `check-bypass-guard` `protectConfigs`. The asks are cheap, and a split would need a second code path in `decide()` (`scripts/check-bypass-guard.ts:56-67`).

## Critique log

One adversarial pass (codex, `gpt-6.1-sol`, high). Every point was checked against the code.

| # | Point | Verdict |
| --- | --- | --- |
| 1 | The plan said engine tests cannot pass options; `TestOptions.options` exists | adopted: tests now use `{ options }`; the stale comment is fixed in slice 9 |
| 2 | usage-band wiring: `band.tsx:143` is inside `gradeLimits`, which has no `options`; `renderBand` is the caller | adopted: slice 6 threads `pace` through `BandInput`, `gradeLimits` and `grade` |
| 3 | A configurable critical pace would corrupt `ahead`, `runsOutAt` and the alert text | adopted: colour comes from the thresholds, `ahead` stays `projected > 100`; `alertText` branch generalised; tests on both sides of 100 |
| 4 | Several tests only covered parsers, so disconnected wiring would pass | adopted: engine tests for `git-statusline` (skipped commands, timeouts on both refresh triggers), `mcp-health`, `agent-status`, `agent-router`, `usage-band`, `usage-log`, `bash-rules` |
| 5 | docs-sync tests used short env names | adopted: full `CLAUDE_PLUGIN_OPTION_*` names |
| 6 | Adding `pace` to `parseOptions` breaks the exact assertion at `tests/pace.test.ts:154` | adopted: `BandOptions` and `parseOptions` stay as they are; `paceOf` is separate |
| 7 | Slice 8 named `tests/*.test.ts`; the file is `tests/register.test.tsx` | adopted |
| 8 | "Final check" was required per slice and once at the end | adopted: per-slice acceptance plus `scripts/plugins.py check`; repo-wide suites once |
| 9 | `sh` portability for the injectors unverified | rejected as a change, recorded as risk 7: `cat` already required a POSIX userland and `orchestration` runs `sh` today. The six value cases for both injectors were run by the reviewer on Linux and behaved correctly |
