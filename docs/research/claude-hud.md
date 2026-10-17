# claude-hud vs. our usage-band / git-line / agent-status mods

## 0. Which repo, and the facts

- **The repo:** `jarrodwatts/claude-hud`, about 28.6k stars and MIT. It was cloned to `scratchpad/claude-hud-src/` and read only; none of its scripts were run. The last commit is `5621429` on 2026-10-17, "release: prepare v0.11.3 (#811)". The repo is very active, with an auto-built `dist/` from a GitHub Action.
- **Similarly named repos (not this one):**
  - `GaoSSR/best-claude-hud`: a Rust status line, Apache-2.0, 1.1k stars.
  - `Louayzouaoui1/claude-hud`: a native macOS and Windows overlay, MIT, 7 stars.
  - Several small "*-hud" clones: claude-ultimate-hud, tail-claude-hud, claude-statusline-hud, and codex-hud (a port to the Codex CLI).
- **How it is packaged:**
  - It is a Claude Code plugin with its own marketplace (`.claude-plugin/plugin.json` and `marketplace.json`, v0.11.3).
  - It ships no hooks, mods or MCP servers, only two slash commands: `commands/setup.md` and `commands/configure.md`.
  - `/claude-hud:setup` runs `scripts/setup.mjs`. That script backs up `~/.claude/settings.json`, copies a launcher to `~/.claude/plugins/claude-hud/statusline.mjs` and writes the **`statusLine` command**. The launcher picks the newest installed version under `plugins/cache/*/claude-hud/<semver>/` and runs `dist/index.js` on Node, or `src/index.ts` on Bun.
  - So it is a **classic statusLine command**: it re-runs on every status-line refresh and prints ANSI lines below the prompt.
- **Where its data comes from:**
  1. The status-line **stdin JSON**: model, context_window, cost, rate_limits, prompt_cache, effort, workspace, worktree, session_name, version and output_style.
  2. **Transcript JSONL parsing** (`src/transcript.ts`): tools, agents, todos, skills, MCP, token totals, compactions, advisor, ultracode and model.
  3. **Files:** `~/.claude.json`, settings.json, `.mcp.json`, `rules/` and `/proc/meminfo`.
  4. **Child processes:** `git` or `jj`, plus an opt-in `--extra-cmd` shell command.
  5. **Its own state files:** a speed cache and a daily-cost ledger.
- **Configuration:** `~/.claude/plugins/claude-hud/config.json`, with an optional `$CLAUDE_CONFIG_DIR/claude-hud.json` overlay. There are about 90 options; the README table lists them all. They fall into these groups:
  - Layout: `lineLayout` (expanded or compact), `elementOrder`, `mergeGroups`, `rightAlign` and `pathLevels`.
  - Per-element `display.show*` toggles.
  - Context format: `contextValue`, `autoCompactWindow` and the warning/critical thresholds.
  - Usage format: `usageValue`, `usageCompact`, `usagePace`, `timeFormat`, `sevenDayThreshold` and `usageThreshold`.
  - `gitStatus.*` (dirty, ahead/behind, file stats, worktree, push thresholds) and `jjStatus.*`.
  - Colours and bar characters, `language` (en, zh-Hans, zh-Hant), `customLine`, external usage snapshot read/write paths, and the `CLAUDE_HUD_DISABLE` env var.

## 1. What claude-hud shows

Key for the third column: "statusline stdin" means the statusLine JSON payload, and "transcript" means it parses the session JSONL file.

| Item | How claude-hud gets it | Useful to us? |
|---|---|---|
| Model name, provider label (Bedrock/Vertex/MiniMax), model override | stdin `model.display_name`/`id`; optionally the transcript `message.model` (proxy detection) | Low. The built-in UI shows the model, and `$.session.model()` exists if wanted |
| Effort level / ultracode | stdin `effort.level`; transcript `/effort` output and `ultra_effort_*` attachments | Maybe. `turn.step` carries `effort` |
| Project path, `/add-dir` dirs, worktree name | stdin `workspace.*`, `worktree` | Partly. git-line already shows repo/sub; worktree is a nice add |
| Git branch, dirty `*`, ahead/behind, file counts `!M +A ✘D ?U`, push-warning colouring; jj status | `git status`/`jj` child processes | Mostly covered by git-line. Worktree marker and unpushed-count colouring are new |
| Context % bar, tokens, remaining, token breakdown at 85%+ | stdin `context_window` (used_percentage, current_usage) | Covered, and better: usage-band has per-category bars |
| Context against the auto-compact window instead of the full window | config `autoCompactWindow` | Covered. usage-band uses breakdown `rawMaxTokens` and marks `autoCompactThreshold` |
| 5h and 7d usage %, reset countdown, wall-clock reset, % of window elapsed | stdin `rate_limits.five_hour/seven_day` | Covered (5h + weekly), but see the gaps below |
| **Usage pace** (▲ amber/red when on track to run out before reset) | Linear projection: used% / elapsed fraction of the 5h or 7d window (`src/usage-pace.ts`) | **Yes**, the best idea in the repo |
| `spend_limit` window (gateway) | stdin `rate_limits.spend_limit` | Yes if we use a gateway; cheap to add |
| Per-model weekly windows (`model_scoped`, e.g. Fable), `balance_label` | An external JSON snapshot file the user maintains | No. Not in stdin either, and a hand-fed file |
| Session cost; cost for routed (Bedrock/Vertex) sessions | stdin `cost.total_cost_usd` | Yes, as an optional segment |
| Today's / this week's cost across sessions | A ledger file it writes from cost deltas per render | Maybe. Needs cross-session storage |
| Session duration | stdin `cost.total_duration_ms` | Low |
| Output speed (tok/s) | Delta of output tokens between renders, cached in a file | Low/maybe |
| Prompt cache expiry clock ("Cache ⏱ until 14:30"), cache hit rate | stdin `prompt_cache.expires_at`/`hit_ratio` | **Yes**: cache-cold awareness matters for cost. Mods have no direct field, see §2 |
| Session token totals (in/out/cache) | Transcript, per-message-id max of `usage` | Maybe |
| Compaction count | Transcript `system/compact_boundary` entries | Maybe |
| Tools line: running tool + target, completed ×N | Transcript tool_use/tool_result pairing | Low. The built-in transcript shows this live |
| Skills used, MCP servers used, MCP servers erroring | Transcript `Skill` input, `mcp__server__tool` names, `is_error` | **MCP error marker: yes**. Skills/MCP lists: low |
| Agents line: type, model, description, elapsed, running/completed | Transcript `Task`/`Agent` tool_use + task-notifications | Covered by agent-status. **Model + elapsed-since-spawn are new** |
| Todos line: current in-progress item + done/total | Transcript `TodoWrite`/`TaskCreate`/`TaskUpdate` | Partly covered (agent-status shows done/total); current item name is new. The built-in task list overlaps |
| Config counts: CLAUDE.md, rules, MCPs, hooks | Reads `~/.claude/settings.json`, project `.claude/*`, `.mcp.json`, `rules/` | Low. `/context` and `/doctor` cover it |
| Auth plan / account (e.g. "Claude Max 20x", email local part) | Reads `oauthAccount` in `~/.claude.json` | No |
| Advisor model | Transcript `advisorModel` | No |
| Output style, session name, CC version, session start, last response age | stdin and transcript | Low |
| System RAM usage | `/proc/meminfo` / `os` | No |
| Custom text, `--extra-cmd` output | Config / shell exec (opt-in env var) | No |

## 2. Gaps in usage-band that claude-hud covers, and enhancements

How usage-band works today, from `archive/plugins/coremods/hooks/usage-band/band.tsx` and `register.tsx`:

- It refreshes on `session.start` and `session.measure` via `$.session.usage({ breakdown: 'summary' })`.
- It draws in `ui.render { component: 'AbovePrompt' }`:
  - Collapsed: a context bar by category, `N free`, and 5h % with a reset countdown.
  - Expanded: the context bar, a legend, a compaction marker, and 5h + weekly rows.
- Limit colour is fixed at 60/85% (`limitColor`).

| # | Gap / enhancement | Mods API surface (cc.d.ts) |
|---|---|---|
| 1 | **Pace colouring.** Grade each window by `percentUsed / elapsedFraction`, where elapsed = (window − (resetsAt − now)) / window, with 5h = 18e6 ms and 7d = 604.8e6 ms. Amber at a projection of 90% or more, red above 100%, nothing below 10% used. Use it instead of the fixed 60/85 thresholds and add a `▲` marker. Pure logic, so it goes in a side file such as `usage-band/pace.ts`. | `SessionRateLimit { kind, percentUsed, resetsAt? }` from `$.session.usage()` / `SessionMeasureInput.rateLimits`; `$.clock.now()` |
| 2 | **Show weekly in the collapsed row when it matters.** Collapsed only shows 5h now. Swap it for, or add, weekly when the weekly window is ≥ the threshold (claude-hud defaults to 80) or its pace is amber/red. | Same as #1 |
| 3 | **`spend_limit` window.** The band ignores `kind === 'spend_limit'`. Render it like the others. It can exceed 100, so clamp the bar but print the real %. | `SessionRateLimit.kind` ("a Claude gateway's `spend_limit`") |
| 4 | **Reset as a wall-clock time** (`↻ 14:30` / `Thu 09:00`) as an option, or alongside the countdown. This matters because the band only repaints on measure/invalidate, so a countdown can go stale while idle. Either use a clock time or re-render on a slow `$.clock.every`. | `SessionRateLimit.resetsAt` (ISO); `$.clock.every` (already used by agent-status) |
| 5 | **Session cost segment** (`$1.23`) on the expanded context row, or the collapsed row when wide. | `SessionUsage.cost?: SessionCost { usd }`; `SessionMeasureInput.changed` includes `'cost'` |
| 6 | **Prompt-cache cold marker.** Show `cache warm until 14:32` / `cache cold`. There is no cache-expiry field for mods (`grep prompt_cache` finds nothing in cc.d.ts), so approximate it: record `$.clock.now()` at each `turn.complete` on the main loop (`agentId` absent) and add the TTL (5 min default; 1 h when the account uses extended caching, which mods can't detect, so make it a config value). Label it approximate. | `turn.complete` (`TurnCompleteInput`, `durationMs`, `usage?: TurnUsage`, `agentId?`); stdin `prompt_cache` is **not available to mods** |
| 7 | **Cache hit rate of the last response** (`cache 94%`) = cache_read / (input + cache_read + cache_creation). | `SessionContextBreakdown.apiUsage: ContextApiUsage` (input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens), already fetched with `breakdown: 'summary'`; or `TurnUsage` on `turn.complete` |
| 8 | **Token breakdown when nearly full.** claude-hud shows input/cache numbers at 85%+. Our expanded view already shows the legend with tokens when wide; a cheap win is to auto-expand, or force tokens in the legend, once `percentage ≥ 85`. | `SessionContextBreakdown.percentage`, `categories` |
| 9 | **Compaction count / "just compacted" hint** (e.g. `compacted ×2`). Count `session.compact` with trigger `manual` or `auto` and no `agentId`, after `next(e)` resolves without `skip`. | `session.compact` event, `SessionCompactInput.trigger: 'manual' \| 'auto' \| 'plugin' \| 'precompute'`, `agentId?`; `SessionCompactResult` |
| 10 | **Hide-until-threshold option** (claude-hud's `usageThreshold`), so the limits rows only appear past N% or on a pace alert, keeping the band to one row most of the time. | Pure logic over `SessionRateLimit` |
| 11 | **Per-model weekly windows (`model_scoped`) / balance label.** | **Not available to mods.** `SessionUsage.rateLimits` lists only what the last response reported. claude-hud itself needs a hand-fed external file for these |
| 12 | Effort badge (e.g. `◑ high`) beside the context bar. | `turn.step` → `TurnStepInput.effort?: 'low'…'max' \| number`, `model` |

Things claude-hud does that usage-band already does better: the per-category context bar (from `breakdown.categories`), the auto-compact marker (`autoCompactThreshold`), and `free` tokens. Keep those.

## 3. Other focused helper mods (one mod per plugin)

Repo rule: the engine refuses a plugin that registers the same event twice, so each idea below is its own plugin with its own `register.tsx`. If more than one ends up in the same plugin, it must share one `register.tsx`.

| Mod (plugin) | What it shows | Where | API surface |
|---|---|---|---|
| **`limit-pace`** (or fold into usage-band, §2 #1) | One toast when a 5h or weekly window first turns amber or red pace ("5h on pace to run out ~13:40, resets 15:00"), and again when a window resets. Fires once per window per state change, stored per session. | Toast | `session.measure` (`changed` includes `'rateLimits'`), `SessionRateLimit`, `$.ui.toast(text, { timeoutMs })`, `$.state`/`$.store` for de-dup |
| **`cache-clock`** | After each main-loop turn: `cache warm → 14:32`. Turns `cold` (dim/warning) once past the TTL. It can toast "prompt cache expired, next prompt re-caches ~N k tokens", using the context token count. | `$.ui.status` (pinned line under the prompt), or a PromptHint segment | `turn.complete` (`agentId` absent = main loop), `$.clock.every`/`$.clock.now`, `SessionContextUsage.tokens`, `$.ui.status(text)`. The TTL is a config guess; the real expiry is **not available to mods** |
| **`mcp-health`** | `mcp: github ✗` when an MCP server's latest call errored; hidden while all are fine. Optionally a toast on the first error per server. | PromptHint segment (beside git-line) or `$.ui.status` | `tool.call` (`McpToolCallInput`, server in the tool name `mcp__<server>__*`; `await next(e)` → `ToolCallResult.isError`); `$.ui.toast` |
| **agent-status enhancement** (same plugin as agent-status) | Per agent: **model** and **time since spawn**, not just time in the current status; background flag. | Existing AbovePrompt line + `agents` pane | `agent.spawn` → `AgentSpawnInput { model?, parentModel, subagentType, background, description }`, keyed by `tool_use_id`/the result's id; `AgentInfo` has **no model or start time**, so cache them from `agent.spawn` |
| **todo-focus** (agent-status enhancement) | `▸ <current in_progress task> (2/5)`. agent-status already tracks status per task id; also keep `subject` from TaskCreate/TaskUpdate input. Check first whether the built-in task list already shows this before adding it. | AbovePrompt line | `tool.call` for `TaskCreate`/`TaskUpdate`/`TaskList` with `await next(e)` results (as `applyTask` does now) |
| **git-line enhancements** (same plugin as git-line) | Worktree marker `⎇ wt:<name>`; colour `↑N` when unpushed commits pass a threshold (claude-hud's `pushWarningThreshold`/`pushCriticalThreshold`); stash count. | PromptHint (existing) | `$.process.run(['git', 'rev-parse', '--git-dir', '--git-common-dir'])` (worktree when they differ), `git stash list`; `$.session.repo()` → `SessionRepo.root` (main worktree root) |
| **`turn-stats`** (optional, low priority) | Toast after long turns (`turn 3m12s · 41k out · cache 92%`), or a one-line `/turn-stats` command. Covers claude-hud's speed, session-tokens and duration ideas without a permanent line. | Toast or slash command | `turn.complete` (`durationMs`, `usage: TurnUsage` with input/output/cache tokens and `model`, `isAborted`), `$.command.register` + `command.run` |

Where these overlap built-in Claude Code UI, so we don't duplicate:

- **Status line (`statusLine` command):** this is where claude-hud lives. A mod can't draw into it; our mods use AbovePrompt, PromptHint, `$.ui.status`, toasts and panes. Don't build a statusLine command that repeats what usage-band and git-line already draw. If the user also runs a status line, keep it for something else, or none.
- **`/context`:** shows the full category grid and memory, MCP-tool and skill token lists. usage-band's band is the at-a-glance version; don't rebuild the grid. A config-counts mod would duplicate `/context`, which already lists memory files, MCP tools, skills and agents (`SessionContextBreakdown.memoryFiles`/`mcpTools`/`skills`/`agents`).
- **`/usage` and `/cost`:** show limits and cost in full. The band's job is the glance plus pace.
- **The engine's "context left" notice** (`$.ui.toast` says it mimics it): the band already shows fill; don't add another context-low toast.
- **The teammate / background-agents view and the built-in task list:** agent-status's pane overlaps with the built-in agents/teammate view. Keep only what it adds (live count above the prompt, time-in-status, task done/total) and check the built-in view before adding more columns.
- **Transcript tool rows:** a "running tool + recent tools" line (claude-hud's tools line) repeats the live transcript, so skip it.

## 4. What to skip from claude-hud, and why

- **The statusLine-command architecture itself:** it means one Node process per refresh, plus rewriting `settings.json` via `setup.mjs` and a launcher that loads whatever is newest under `plugins/cache`. Mods get the same data in-process (`$.session.usage`, events) and redraw on `$.ui.invalidate`.
- **Transcript JSONL parsing:** fragile, and it depends on undocumented record shapes (`compact_boundary`, `advisorModel`, `ultra_effort_*`, `<local-command-stdout>`). Mods get the same facts from typed events: `tool.call`, `agent.spawn`, `turn.step`, `turn.complete`, `session.compact` and `$.session.messages()`.
- **Auth/account display** (reads `oauthAccount` from `~/.claude.json`, shows an email prefix): privacy-sensitive and of little use. Mods only have `$.session.authorize()` (`kind`/`type`), not the plan name.
- **`--extra-cmd`:** arbitrary shell execution on every refresh.
- **System RAM line:** unrelated to Claude, and `/proc/meminfo` needs file or process access.
- **External usage snapshot read/write and the `model_scoped`/`balance_label` windows:** hand-fed JSON files with no source of truth for mods.
- **Cross-session daily/weekly cost ledger:** writes a ledger file and double-counts easily across forks and resumes. `/cost` and `/usage` cover it. Revisit only with `$.store` if there is real demand.
- **Model/provider badge, output style, CC version, session name, session start time, advisor:** already visible in Claude Code or rarely useful. Session name is not exposed to mods anyway, and output style only via `prompt.compose`'s `outputStyle`.
- **i18n, about 90 layout options, colour themes, jj support:** scope creep for a personal marketplace. Use the engine's theme colour names (`success`/`warning`/`error`/`inactive`) as usage-band already does.
- **Config counts (CLAUDE.md/rules/MCP/hooks):** `/context` covers it.
