# Marketplace-native agents, hooks and prompt

Status: Planned, 2026-10-12. Not started. Reverses docs/plans/system-prompt.md Q9 once Q1 is approved. Depends on hooks-typescript-ast-bash.md slice 7c. Q1–Q5 resolved (see Resolved questions).
Engine: Claude Code 2.1.296. Facts from code.claude.com/docs (plugins-reference, sub-agents, hooks, output-styles, plugin-marketplaces, fetched 2026-10-12), `claude --help`, `claude plugin --help`, and live `claude -p --plugin-dir` probes run 2026-10-12.

## Status

- In progress since 2026-10-12.
- 7c soak not finished (about 11 h of quick-review on the `.ts` hook, no real `internal error`), so S2 takes the documented fallback: two `hooks.json` gate entries over disjoint agent sets, `.ts` for quick-review and `.py` for the other six. 7c later moves names between them.
- S9: `example` dropped from the catalog and README (not installed anywhere, so no `renames`). Worktree removal and the `plugins/ripgrep` move were blocked by the permission classifier and are left for the operator.
- S0: running.

## Goal

- `~/.claude/agents`, `~/.claude/hooks` and `~/.claude/prompts` are no longer symlinks into the repo. Agents, guard hooks and the prompt file ship in one marketplace plugin installed at user scope.
- Orchestrated sessions (`claude-tmux`) behave as today: same agents, same read-only Bash guard, same orchestration nudges, byte-identical prompt file.
- Plain `claude` keeps the stock prompt (system-prompt.md Q3).

Done when:

- `bash plugins/crew/scripts/tests/check.sh` passes.
- `claude plugin validate --strict plugins/crew` and `claude plugin validate --strict .` pass.
- The S6 live checks pass in a disposable repo.
- After S8, `ls -la ~/.claude | rg 'agents|hooks|prompts'` shows nothing, and a new `claude-tmux` session passes the S6 checks again.

## Layout review

| Path | What it is | Verdict |
| --- | --- | --- |
| `.claude-plugin/marketplace.json` | Catalog of 33 plugins, `renames`, cross-marketplace allowlist | Sound. `example` shouldn't be listed (gap 7) |
| `plugins/<name>/` | One plugin each, explicit semver | Sound. All 33 pass `validate --strict` |
| `docs/plugins/`, `docs/plans/`, `docs/research/` | Per-plugin pages, plans, research | Sound. Only `example` lacks a page |
| `agents/` (15 agents plus `CLAUDE.md`) | User-scope agents through a symlink | Moves into `plugins/crew` |
| `hooks/` | Two guards, a walker copy, tests, ignored `__pycache__` and stale `*.log` | Moves into `plugins/crew/scripts` |
| `prompts/system_override.md` | Appended by the launcher | Moves into `plugins/crew/prompts` |
| `scripts/` | Checks, launcher, replay tool | Stays. Launcher and checks change paths |
| `.claude/skills/ship-plugin` | Repo-local release skill | Sound. Runs `tests/check.sh` (S4 adds one) |
| `.claude/worktrees/` | Two locked worktrees, dead lock pid, commits patch-equivalent on `main` | Stale (S9) |
| `plugins/ripgrep/` | Ignored leftover holding only `.claude-plugin/types` | Stale, fails `validate` (S9) |

## Findings

| Topic | Fact | Evidence |
| --- | --- | --- |
| Plugin agent fields | Supported: name, description, model, effort, maxTurns, tools, disallowedTools, skills, memory, background, isolation. Ignored: `hooks`, `mcpServers`, `permissionMode`, `initialPrompt`. `color` unlisted (UNCONFIRMED, cosmetic) | plugins-reference "Agents"; sub-agents frontmatter table |
| Hooks ignored, silently | A plugin agent with frontmatter `PreToolUse Bash: exit 2` ran `true` unblocked; `validate --strict` didn't warn | Probe 2026-10-12 |
| Scoped names | The Agent tool rejects a bare name ("Agent type 'alphaprobe' not found ...") and accepts `probe:alphaprobe`. `--agent` accepts a scoped name | Probe; sub-agents docs |
| Hook identity | `--agent probe:pmain` main thread: `agent_type: "probe:pmain"`, no `agent_id`. Plugin subagent: `agent_type: "probe:alphaprobe"` plus `agent_id` | Probe log; hooks reference |
| Main-thread prompt | With `--agent` and `--append-system-prompt-file`, the agent body replaces the stock body and the append follows it, after the WebSearch hint | Probe |
| Explore | Only a user or project agent named `Explore` overrides the built-in. A plugin agent registers as `<plugin>:Explore` alongside it. `CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS=1` removes built-in Explore and Plan | sub-agents "Built-in subagents" |
| Plugin settings.json | Only `agent` and `subagentStatusLine`. `agent` applies to every session where the plugin is enabled | plugins-reference "File locations" |
| Output styles | Plugins can ship them; `force-for-plugin` applies one to every session | output-styles |
| Install copies | Installs copy to `~/.claude/plugins/cache/adminhead/<plugin>/<version>`; old versions deleted 14 days after an update; running sessions keep old hook paths until `/reload-plugins` | plugins-reference "Plugin caching" |
| Versioning | `plugin.json` version, then marketplace version, then git SHA. SHA for a `directory` marketplace in git UNCONFIRMED | plugins-reference "Version management" |
| Path variables | `${CLAUDE_PLUGIN_ROOT}` resolves in hook commands. Plugin `bin/` reaches only the Bash tool's PATH | plugins-reference |
| Agent docs file | A plugin agent file with no `name` still loads under its filename, so `agents/CLAUDE.md` would load as an agent | sub-agents "Subagent files Claude Code skips" |
| Today's wiring | `~/.claude/{agents,hooks,prompts}` and `~/.local/bin/claude-tmux` are hand-made symlinks. chezmoi manages `~/.claude/CLAUDE.md` and `settings.json`; `settings.json` has no `hooks`; `permissions.deny` holds `Agent(general-purpose)`, `Agent(Plan)` | `ls -la ~/.claude`, `chezmoi managed` |
| Guard wiring | 7 read-only agents carry a frontmatter readonly-bash hook (quick-review `.ts` canary, rest `.py`). `orchestration.md` carries 4 guard hooks. The guard no-ops unless `agent_type == "orchestration"` and no `agent_id` | `agents/*.md`; `hooks/orchestration-guard.py:193` |
| browser-tester | Declares inline pinned `@playwright/mcp@0.0.83`, dropped for plugin agents. efficient-web ships `@playwright/mcp@latest` without `--output-dir` | `agents/browser-tester.md:8-12`; `plugins/efficient-web/.mcp.json` |
| Hook cost | `readonly-bash.ts` end to end 9 ms; bun start 3 ms; `python3 -I` 13 ms; `claude plugin list --json` 450 ms | `time` runs |
| Checker gaps | `agent-tools.py` derives read-only from the tools list, so dropping an allowlist or adding `Edit` reclassifies silently. `Agent` and `PowerShell` aren't banned for read-only agents | `scripts/agent-tools.py:165-190` |
| Release tests | ship-plugin runs `**/tests/check.sh`, pytest and mod tests only | `.claude/skills/ship-plugin/SKILL.md:24-30` |

## Decisions

- **New plugin `crew`, not coremods.** coremods is a TSX mods host needing 2.1.289; agents change far more often. Names: `crew:<agent>`, main thread `crew:orchestration` (Q2: user chose `crew`).
- **Guards become plugin hooks gated on `agent_type`.**
  - `hooks/hooks.json` runs `orchestration-guard.py` on Stop, UserPromptSubmit and PostToolUse (TaskCreate|TaskUpdate, Edit|Write|NotebookEdit). The gate constant becomes `crew:orchestration`, `agent_id` still absent.
  - A PreToolUse `Bash` entry runs `bun --no-env-file --config=/dev/null "${CLAUDE_PLUGIN_ROOT}/scripts/readonly-gate.ts" || exit 2`.
  - `readonly-gate.ts` has no static imports, reads stdin, holds `READ_ONLY` (the 7 scoped read-only names with Bash). For a type in the set it dynamically imports `readonly-bash.ts` and runs the check; any error exits 2. `agent_id` present and `agent_type` missing exits 2 with a named reason. Everything else exits 0.
  - `|| exit 2` keeps fail-closed. A missing bun blocks Bash everywhere: loud, not silent.
- **Prompt parity.** `system_override.md` moves to `plugins/crew/prompts/`. The launcher resolves the user-scope `installPath` via `claude plugin list --json` and keeps `--append-system-prompt-file`. Merging into the agent body is a follow-up gated on a rendered-prompt diff.
- **Routing prose keeps bare names.** `orchestration.md` gains one rule: spawn with `subagent_type: crew:<name>`; bare names elsewhere mean the same agent. If S6 shows misroutes, switch to scoped names everywhere.
- **`agents/CLAUDE.md` becomes `plugins/crew/CLAUDE.md`**, since inside `agents/` it would load as an agent.
- **No `dependencies` in `plugin.json`.** Declaring efficient-core, code-search and coremods would make disabling coremods fail; install.sh installs all three.
- **readonly-bash is TypeScript only.** hooks-typescript slice 7c lands before S1. Fallback if 7c slips: two hooks.json entries with disjoint agent sets (`.py` and `.ts`).
- **The walker stays a cmp-checked copy** (`plugins/crew/scripts/{shell,vendor}`), matching infra. Collapsing copies is gap 5.

Rejected:

| Option | Why it lost |
| --- | --- |
| Plugin `settings.json` `"agent": "crew:orchestration"` | Makes every session orchestration (contradicts system-prompt.md Q3); can't pass the append file or env |
| `force-for-plugin` output style for the prompt | Applies to every session; behavior under `--agent` UNCONFIRMED |
| Merge the prompt into the agent body now | Not equivalent: moves the text before the WebSearch hint |
| Skills-dir plugin (`~/.claude/skills/orchestration`) | Needs a symlink into the repo |
| `readonly-bash.ts` in coremods | coremods would hard-code the orchestration roster |
| In-marketplace symlink for the walker | Skipped under `--plugin-dir`; directory-source dereference UNCONFIRMED |
| Keep the symlinks | The user asked for a true marketplace install |

## Slices

| # | Slice | Agent | Depends on |
| --- | --- | --- | --- |
| 0 | Spike: remaining unknowns | coder-high | none |
| 1 | Freeze live config | devops (user-authorized) | 0 go, TS 7c |
| 2 | Plugin scaffold, moves, gate | coder-high | 1 |
| 3 | Agent definitions | coder-high | 2 |
| 4 | Checker and `check.sh` | coder | 2 (parallel with 3) |
| 5 | Docs and plan amendments | scribe | 3, 4 |
| 6 | Release, install, live checks | orchestrator with ship-plugin; operator steps | 5 |
| 7 | Launcher | coder | 6 |
| 8 | Cutover | devops (user-authorized) | 7, drained |
| 9 | Housekeeping | coder | none |

Nothing edits a live agent between S1 and S8. Subagents run from the frozen copy, so an agent fix in that window reaches sessions only after S6/S8.

### 0. Spike

Scratch only: `/tmp`, a throwaway plugin, `CLAUDE_CONFIG_DIR=/tmp/<run>` for installs. Already confirmed: scoped names, hook identity, ignored frontmatter hooks, body replacement plus append.

- H5: with `probe@<scratch-mkt>` installed, run `claude --plugin-dir <probe copy>`. Record which agents load, whether both copies' hooks fire, and what `/reload-plugins` does to a running subagent.
- H7: `CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS=1` removes `Explore` from the Agent tool's list, and `probe:Explore` still spawns.
- H9: the gate holds in every execution mode. With a logging hook plus an `exit 2` PreToolUse Bash hook gated on `probe:ro`, spawn `probe:ro` as a background subagent, a resumed subagent (SendMessage), and an agent-team teammate (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). Record `agent_type`, `agent_id`, and whether Bash was denied with the hook's reason.

Go/no-go:
- No-go when a background or resumed read-only agent runs Bash unguarded. Stop and keep the symlinks.
- Teammate-only failure: continue; S3 adds "never spawn read-only agents as teammates" to `orchestration.md`, S5 records the limit.
- H5 sets the dev loop. If both copies' hooks fire, iterate with the installed plugin disabled.

Check: the spike report holds the raw payload lines.

### 1. Freeze live config

Precondition: TS 7c committed; `git status --short agents hooks prompts` empty.

For each `n` in agents, hooks, prompts:
1. `cp -a ~/Projects/adminhead/claude-plugins/$n ~/.claude/.adminhead-frozen/$n`
2. `diff -r` against the repo
3. `ln -s ~/.claude/.adminhead-frozen/$n ~/.claude/$n.new`
4. `mv -T ~/.claude/$n.new ~/.claude/$n` (atomic symlink swap)

Record old link targets in `~/.claude/.adminhead-frozen/LINKS`. Relaunch each live orchestrated session with `claude-tmux -c`.

Acceptance: `readlink ~/.claude/{agents,hooks,prompts}` points under `.adminhead-frozen`; in a relaunched session `quick-review` blocks `touch <repo>/sentinel` and allows `git status`.

Rollback: `ln -s <old target> ~/.claude/$n.new && mv -T ~/.claude/$n.new ~/.claude/$n`, then relaunch.

### 2. Plugin scaffold, moves, gate

Files:
- `git mv agents/CLAUDE.md plugins/crew/CLAUDE.md` first, then `git mv agents/*.md plugins/crew/agents/`.
- `git mv hooks/{orchestration-guard.py,readonly-bash.ts,shell,vendor} plugins/crew/scripts/`; `git mv hooks/tests plugins/crew/scripts/tests`. `readonly-bash.py` moves only if 7d hasn't run (it's the rollback).
- `git mv prompts/system_override.md plugins/crew/prompts/`.
- New: `plugins/crew/.claude-plugin/plugin.json` (0.1.0), `plugins/crew/hooks/hooks.json`, `plugins/crew/scripts/readonly-gate.ts`.
- Edit: `.claude-plugin/marketplace.json` entry, the guard constant, `.gitignore` (drop `hooks/*.log`).

Tests:
- `readonly-bash.test.sh` defaults `HOOK` to `readonly-gate.ts`; payloads gain `agent_type: "crew:review"` and an `agent_id`; the `cmp` path becomes `$hooks/../../coremods/hooks/$f`.
- New dispatch cases:

  | Payload | Expected |
  | --- | --- |
  | writer type, `touch <repo>/x` | allow |
  | each READ_ONLY type, `touch <repo>/x` | block |
  | bare `architect` | allow |
  | `agent_id` without `agent_type` | block |
  | no identity (plain main thread) | allow |
  | `readonly-bash.ts` renamed away | read-only blocks, writer allows |

- `scripts/bash-replay.ts` payloads gain a read-only `agent_type`.
- `orchestration-guard.test.sh` uses the scoped name and asserts a bare `orchestration` is silent.

Acceptance: guard test and both readonly-bash runs green; table passes; `cmp` checks pass; `validate --strict` passes for the plugin and the marketplace.

Checks: `bash plugins/crew/scripts/tests/readonly-bash.test.sh`, `bash plugins/crew/scripts/tests/orchestration-guard.test.sh`, `bun scripts/bash-replay.ts` (zero changes toward allow), the two validates.

### 3. Agent definitions

Files: `plugins/crew/agents/*.md`, `scripts/prompt-drift.sh` (comment path only).

- Remove `hooks:` from the 7 read-only agents and `orchestration.md`.
- Add the scoped-spawn rule to `orchestration.md`, plus the teammate rule if H9 required it.
- browser-tester follows Q4. Under option b: `tools: Read, Bash, mcp__plugin_efficient-web_playwright`, `disallowedTools` names `browser_run_code_unsafe`, the body reports blocked when the server is absent, and efficient-web pins `@playwright/mcp@0.0.83 --headless --isolated --output-dir /tmp/playwright-mcp`.

Acceptance: `rg -n '^hooks:|^mcpServers:|\$HOME/\.claude' plugins/crew/agents` finds nothing.

Check: `python3 scripts/agent-tools.py` after S4, then a quick-review pass.

### 4. Checker and `check.sh`

Files: `scripts/agent-tools.py`, `scripts/agent-tools.test.sh`, `plugins/crew/scripts/tests/check.sh` (new).

- Default dir becomes `plugins/crew/agents`. Every `*.md` needs `name` and `description`; no `DOCS` exemption.
- Ban `hooks`, `mcpServers`, `permissionMode`, `initialPrompt`.
- Read-only rules: `READ_ONLY` is parsed from `readonly-gate.ts`; a member uses an allowlist without Edit, Write, NotebookEdit, Agent or PowerShell; Bash only for members; every member exists; allowlist agents without writers outside the set have no Bash.
- Replace the frontmatter-hook rule with a `hooks.json` check: a PreToolUse `Bash` entry with exactly the gate command, plus the four guard entries.
- `MCP_SERVERS` gains `plugin_efficient-web_playwright: False` under Q4 b.
- Negative fixtures for each new rule (dropped allowlist, `PowerShell`, `Agent`, wrong gate command, missing `hooks.json` entry).
- `check.sh` runs agent-tools, its tests, both hook suites and the replay.

Checks: `bash scripts/agent-tools.test.sh`, `bash plugins/crew/scripts/tests/check.sh`.

### 5. Docs and plan amendments

- `docs/plugins/crew.md` (new): agents, scoped names, guards, launcher, dev loop.
- `README.md`: `crew` row, layout fix.
- Root `CLAUDE.md`: layout bullet and Checks paths.
- `plugins/crew/CLAUDE.md` "How these files load": scoped names, cache copies, ignored fields, hooks in `hooks.json`, edit loop.
- `docs/plans/install-and-recommend.md`: amendments under Interaction.
- `docs/plans/hooks-typescript-ast-bash.md` Status: paths moved; 7d runs in the plugin.
- `docs/plans/system-prompt.md` Q9: "superseded by marketplace-native-config.md".

Acceptance: ship-plugin step 2 agrees for `crew`; `rg -n '~/.claude/(agents|hooks|prompts)|\$HOME/\.claude/(hooks|prompts)' README.md CLAUDE.md docs/plugins plugins scripts` returns only historical mentions.

### 6. Release, install, live checks

1. ship-plugin `crew` (0.1.0).
2. Operator: `claude plugin install crew@adminhead --scope user`, then `chezmoi re-add ~/.claude/settings.json`.
3. In a disposable git repo, `claude -p --agent crew:orchestration --append-system-prompt-file <installPath>/prompts/system_override.md`:
   - `claude plugin details crew@adminhead` lists 15 agents and 5 hook entries.
   - `crew:coder` runs `touch sentinel` successfully.
   - Each of the 7 read-only types gets it denied with a `readonly-bash:` reason and runs `git status`.
   - The prompt's first prose line is the orchestration body; `# Executing actions with care` follows.
   - Interactive operator check: create a task, end the turn; Stop blocks with R1.

Rollback: `claude plugin uninstall crew@adminhead --keep-data`.

### 7. Launcher

Files: `scripts/claude-tmux.sh`, `scripts/claude-tmux.test.sh`.

- New-session path only: run `claude plugin list --json` from `$dir`; require `crew@adminhead` enabled at user scope and not disabled at project or local scope for `$dir`; die naming the fix.
- Launch with `--agent crew:orchestration --append-system-prompt-file "$installPath/prompts/system_override.md"` and `-e CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS=1` (Q3), keeping the auto-memory env.
- Update help text.
- Stub `claude` tests: enabled, missing, disabled-at-project, attach-skips-preflight.

Checks: `bash scripts/claude-tmux.test.sh`, then a real `claude-tmux -s verify <scratch repo>` repeating the S6 probes.

### 8. Cutover

Precondition: `pgrep -af claude` shows no claude process started before S6 (`ps -o lstart`), background agents included.

`mv ~/.claude/{agents,hooks,prompts} ~/.claude/.adminhead-frozen/links-<ts>/` (the symlinks; frozen copies stay).

Acceptance: a new `claude-tmux` session passes the S6 probes; plain `claude` starts without agent warnings.

Rollback: move the links back, `git revert` S7, relaunch.

### 9. Housekeeping

- Worktrees: in each `.claude/worktrees/agent-*`, `git status --ignored --short` and copy anything listed to `/tmp`; then `git worktree unlock` and `git worktree remove` without `--force`. Branches stay as backup.
- `mv plugins/ripgrep /tmp/ripgrep-leftover-<ts>`.
- Drop `example` from `marketplace.json` and the README table; keep the directory as the template.

Checks: `git worktree list`, `claude plugin validate --strict .`.

## Interaction with install-and-recommend.md

- Step a: keep the `CLAUDE_CONFIG_DIR` refusal; ship-plugin and docs assume `~/.claude`.
- Step b: drop the `$repo/{agents,hooks,prompts}` check.
- Step d: one link, `~/.local/bin/claude-tmux` → `$repo/scripts/claude-tmux.sh`, same backup logic. Legacy `~/.claude/{agents,hooks,prompts}` symlinks: warn and point to S8; never touch them.
- Step f: add `crew@adminhead` after `efficient-core`, `code-search`, `coremods`.
- Tests: cases 1 and 3 assert the launcher link; case 5 keeps the refusal.
- Slice 2 (setup recommender) is unchanged; it never proposes `crew` per project.
- Order: this plan first, then install-and-recommend slice 1.

## Unavoidable symlinks and manual steps

| Item | Why | Workaround |
| --- | --- | --- |
| `~/.local/bin/claude-tmux` | Plugin `bin/` reaches only the Bash tool's PATH | install.sh links it (Q5) |
| Built-in Explore override | Only user or project agents named `Explore` override it | Launcher sets `CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS=1` |
| `settings.json` edits | `plugin install` writes `enabledPlugins` into the chezmoi-managed file | Operator runs `chezmoi re-add` |
| Per-agent hook scoping | Plugin agents drop `hooks` | Session-wide hooks gated on `agent_type` (probed); teammate coverage per H9 |

## Verification

| Condition | Evidence | Rerun when | If it fails |
| --- | --- | --- | --- |
| Read-only gate | Dispatch table, full suite and replay through the gate | gate, walker or agent set change | Diagnose payload vs policy before widening |
| Harness identity | S0 H9 payloads, S6 live denial | each Claude Code upgrade (beside prompt-drift) | Revert to S1 frozen links |
| Checker rules | agent-tools negative fixtures | `agent-tools.py` or roster change | Fix the rule, never the fixture |
| Prompt parity | `cmp` installed vs frozen prompt; `scripts/prompt-drift.sh` | prompt or engine change | Restore the frozen prompt path |
| Launcher | stub tests plus one real launch | launcher change | `git revert` S7 |

## Risks and rollback

| Risk | Mitigation | Rollback |
| --- | --- | --- |
| Hot-reload lost; edits need bump, ship, update, reload | `--plugin-dir` for iteration (H5) | n/a |
| Cache cleanup 14 days after a ship deletes the old hook path; an older session blocks every Bash | `/reload-plugins` or `claude-tmux -c` after each ship | Relaunch |
| Harness drops `agent_type` | Missing type with `agent_id` blocks; post-upgrade live probe | Frozen links |
| bun missing or broken | Gate blocks Bash everywhere (loud); install.sh preflight | Reinstall bun |
| Plugin hooks fire in every session | Gate exits 0 in about 9 ms; guard no-ops | n/a |
| Description budget doubles during S6–S8 | Keep the window short | n/a |
| coremods logs: `agent_type` values become scoped | Historical queries filter on both forms | n/a |
| A frozen agent fix doesn't reach live sessions until S8 | Stated in S1 | n/a |

## Gaps beyond this plan (ranked)

1. **Global config outside the plugin system.** This plan closes it.
2. **Read-only checker holes.** Class derived from tools; PowerShell and Agent not banned. S4 closes them.
3. **No CI or local gate.** Root suites aren't wired to anything. Change: `scripts/check-all.sh` run by a prek pre-commit hook. GitHub Actions optional (private repo; whether `validate` needs auth in CI is UNCONFIRMED).
4. **Unpinned third-party code.** `claude-code-lsps` is unpinned and runs shell at session start; efficient-web uses `@playwright/mcp@latest`. Change: pin Playwright (S3, Q4 b); constrain the five LSP dependencies (cross-marketplace constraint support UNCONFIRMED) or vendor five `.lsp.json` files and drop the marketplace.
5. **Walker in three cmp-checked copies** (coremods, crew, infra). Change: test in-marketplace relative symlinks under directory install and `--plugin-dir`; adopt if both work.
6. **No LICENSE or `license` fields.** Acknowledgements credit MIT sources without notices; better-auth/skills has no license. Low while private; must-fix before publishing.
7. **`example` in the public catalog.** S9.
8. **Stale state.** Locked worktrees, `plugins/ripgrep`, `hooks/__pycache__` and `*.log`. S9 and S2.
9. **No release tags or CHANGELOG** despite README's Release section. Change: ship-plugin runs `claude plugin tag`, or the section goes.
10. **Manifest polish.** Marketplace `$schema` URL unverified (UNCONFIRMED); plugins lack `repository` and `homepage`; README's layout block lists `hooks/register.ts` and `commands/`, which no plugin uses.

## Critique log

Codex (gpt-6-astra/xhigh), adversarial plan critique; each point checked against the repo.

| # | Point | Verdict |
| --- | --- | --- |
| 1 | No go/no-go for teammates, background or resumed agents | adopted: S0 H9 with no-go and teammate fallback |
| 2 | Cutover doesn't prove legacy consumers are gone | adopted: process start-time precondition; frozen copies kept; rollback reverts the launcher |
| 3 | Freeze has an outage window | adopted: copy, verify, atomic `mv -T` swap, relaunch |
| 4 | Checker can certify a writable "read-only" agent | adopted: membership-driven rules; ban Agent and PowerShell |
| 5 | Dropping the exact-hook rule loses install verification | adopted: exact-command check against `hooks.json` |
| 6 | Moved suites can test the wrong implementation | adopted: gate default, identity payloads, `cmp` path fix, replay payloads |
| 7 | ship-plugin skips `*.test.sh` | adopted: `scripts/tests/check.sh` entry point |
| 8 | `touch /tmp` can't detect overblocking | adopted: non-scratch sentinel in a disposable repo; reason checked |
| 9 | Static imports run before the gate | partly: no-import gate, startup-failure tests; hook-timeout tests rejected |
| 10 | Playwright swap changes pinning and output | adopted under Q4 b |
| 11 | Prompt merge isn't equivalent | adopted: parity now, merge deferred |
| 12 | H5 must cover hooks; keep the TS soak | adopted |
| 13 | Launcher preflight must match the launch context | partly: new sessions only, from `$dir`, with scope overrides |
| 14 | Bootstrap amendments incomplete; scribe preload | partly: full amendment list; avoid-ai-writing as a dependency rejected |
| 15 | `git mv` order; worktree inspection | adopted |

## Assumptions

- Probe results on 2.1.296 hold for marketplace installs, not just `--plugin-dir`. S6 confirms.
- `installed_plugins.json` is internal; only `claude plugin list --json` is used.
- One user, one machine; `adminhead` stays a `directory` marketplace here. Adding it from GitHub elsewhere needs git credentials for the private repo (UNCONFIRMED).

## Resolved questions

| # | Question | Answer |
| --- | --- | --- |
| Q1 | Reverse system-prompt.md Q9 and accept the dev-loop cost? | Yes: explicit versions, `--plugin-dir` for iteration |
| Q2 | Plugin name | `crew` |
| Q3 | Explore outside orchestrated sessions | Launcher-only `CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS=1` |
| Q4 | browser-tester's browser | efficient-web's Playwright, pinned to 0.0.83 with `--output-dir` |
| Q5 | Who owns `~/.local/bin/claude-tmux` | install.sh, with backup (default) |
