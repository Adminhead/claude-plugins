# Batch `mods` (round 2) report

## Plugins created

| Name | Type | Description (exactly as in plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `agent-status` | mod (hooks/register.tsx) | A mod that adds a live-agent count by status and task done/total above the prompt, with an `agents` pane giving each agent's model, time in status and time since spawn, which the built-in agent panel lacks. | archive/plugins/coremods/hooks/agent-status/line.tsx + its wiring in archive coremods/hooks/register.tsx; docs/research/claude-hud.md section 3 | none |
| `cache-clock` | mod | A mod that shows when the prompt cache likely expires (`cache warm → ~14:32`) under the prompt, turning to a cold warning past a configured TTL. Approximate: last main-loop turn plus the TTL. | new (plan decision 8; claude-hud idea, no code) | none |
| `turn-stats` | mod | A mod that shows a toast after long main-loop turns with the duration, output tokens and cache hit rate (`turn 3m12s · 41k out · cache 92%`). | new (plan decision 8; claude-hud idea, no code) | none |

All three are direct installs (plan: "Direct installs (no meta)" → Mods). Each has `.claude-plugin/plugin.json`, `hooks/hooks.json` (`"modules": ["./register.tsx"]`), `hooks/register.tsx` (only `$` code), pure side files, `tests/register.test.ts(x)` and a README with the `/plugin install <name> --marketplace Adminhead/claude-plugins` line.

Files:
- plugins/agent-status/hooks/{register.tsx,line.tsx}, tests/register.test.tsx
- plugins/cache-clock/hooks/{register.tsx,clock.ts}, tests/register.test.tsx; userConfig `ttl` (`5m`|`1h`, default `5m`), `display` (`hint`|`status`, default `hint`)
- plugins/turn-stats/hooks/{register.tsx,stats.ts}, tests/register.test.ts; userConfig `thresholdSeconds` (default 60), `includeAborted` (default false)

## Validation and tests

| Command | Result |
| --- | --- |
| `claude plugin validate --strict plugins/agent-status` | passed |
| `claude plugin test plugins/agent-status` | 29 pass, 0 fail |
| `claude plugin validate --strict plugins/cache-clock` | passed |
| `claude plugin test plugins/cache-clock` | 6 pass, 0 fail |
| `claude plugin validate --strict plugins/turn-stats` | passed |
| `claude plugin test plugins/turn-stats` | 5 pass, 0 fail |
| grep for codegraph / claude-mem / coding-core: / github: / Efficient / coremods: | no hits |

API surfaces I checked in scratchpad cc.d.ts: `turn.complete` (`TurnCompleteInput`: `durationMs`, `isAborted`, `reason`, `agentId?`, `usage?: TurnUsage` = `ModelForkUsage` + `model`; result `{ text, usage? }`), `agent.spawn` (`AgentSpawnInput`: `model?`, `parentModel`, `background`, …; result `{ model, agentId? } | { deny }`), `AgentInfo` (no model or start time, confirmed), `$.agent.list`, `$.ui.toast(text, { timeoutMs })`, `$.ui.status(text|undefined)`, `$.ui.open(PaneOpenArgs: id/title/closeOnEscape/rows/columns)`, `$.ui.close`, `$.ui.panes` (`UiPane`), `ui.close` (`PaneCloseInput.id`), `PromptHint`/`AbovePrompt` props, Button props (`plain`, `dimColor`, `label`, `hotkey`, `onPress`), `$.clock.now/every`, `SessionEndResult { sessionId }`.

## Decisions and deviations

- **agent-status vs the built-in agent panel.** Docs (code.claude.com/docs/en/agent-teams, fetched 2026-10-17): the panel below the prompt lists every subagent and teammate, arrow keys select one, Enter opens its transcript, idle rows hide after 30 s, and more than 3 idle rows collapse. Kept, because the panel lacks them: the count-by-status line (stays steady while idle rows hide), task done/total, time in status. Added: model and time since spawn, cached from the `agent.spawn` result (`out.model || e.model || e.parentModel`, `out.agentId`) in a map capped at 128 and pruned once an agent is no longer live, with a 2 min grace for spawns not listed yet. Dropped: the per-agent description line in the pane, because the panel shows descriptions. Pane rows are now one line per agent and the pane is 48 columns wide. Not added: a background flag, because the panel already lists background agents. Without a seen spawn (teammates started elsewhere, or after a reload) the age counts from first sight and shows `~`, and the model is left out.
- **Sharing AbovePrompt with usage-band:** agent-status renders `[await next(e).catch(() => undefined), line]`, and usage-band renders `[band, next(e)]`. Either load order gives the band first and the agent line under it. A test loads an inline band plugin to cover this.
- **cache-clock** uses a PromptHint segment by default, not the plan's `$.ui.status`, because `$.ui.status` is plain text and can't show the dim-to-warning change. `display: status` is an option. Labels: `cache warm → ~HH:MM` (dim) and `cache cold since ~HH:MM` (warning); `~` marks the estimate, and the README explains it. It refreshes on a main-loop `turn.complete` with `usage` present (a turn with no API response doesn't count), rechecks every 15 s, and resets on session.end.
- turn-stats leaves out interrupted turns by default (option `includeAborted`) and marks error or refusal endings. The hit rate is cache_read / (input + cache_read + cache_creation).
- The timers start in session.start and also on the first turn, spawn or Task call, because a hot reload drops them and session.start doesn't fire again.
- agent-status hard-codes `requestId: 'agents'` in the Pane matcher (with a comment that it is PANE_ID) so validate can read it. It printed `requestId=?` with the imported constant.

## Unverified or TODO

- `TaskCreate`/`TaskUpdate`/`TaskList` input and result shapes aren't in this cc.d.ts, because built-in tool inputs are generated per build. They are carried over unchanged from the archived mod and its tests.
- The panel's per-row contents beyond what the docs state (elapsed time, token counts) are known from observation, not docs. The docs don't mention a model column, and I believe the panel has none.
- I couldn't unit-test cache-clock's `display: status` mode or the userConfig wiring through the engine, because the test kit gives no clean way to pass options to the plugin under test. Option parsing is tested as pure code.
- Not run live in a `claude --plugin-dir` session.

## Follow-ups

- The coordinator registers the three plugins in marketplace.json and the README catalog (direct installs, no meta).
- Optional: cache-clock could toast once on going cold, with an estimate of the tokens to re-cache from `SessionContextUsage.tokens` (claude-hud idea, not built).
