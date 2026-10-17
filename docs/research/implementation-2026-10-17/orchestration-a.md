# Batch orchestration-a: report

## Plugins created

| Name | Type | Description (exactly as plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `orchestration` | agent (`agents/orchestration.md`) | Main-session orchestrator agent that plans, routes work to the installed agents and verifies their results. Start it with `claude --agent orchestration:orchestration` or the `agent` setting. | archive/plugins/crew/agents/orchestration.md, archive/docs/plugins/crew.md | none |
| `agent-router` | mod (`hooks/hooks.json` modules -> `register.tsx`) | Mod that lists the installed agent types, each with when to use it, in the Agent tool's description when the main thread runs the orchestration agent, so new agents get routes without editing it. | new (plan decision 6) | none |
| `readonly-agent-gate` | classic hooks (PreToolUse Bash) | PreToolUse hook that limits the read-only agents (architect, reviewer, debugger, devops, plus any you list) to Bash commands that don't write outside /tmp and the session scratchpad. Needs bun. | archive/plugins/crew/hooks/hooks.json, scripts/readonly-gate.ts, readonly-bash.ts, shell/walk.ts, vendor/unbash.*, tests/readonly-bash.test.sh | none (needs `bun` on PATH) |

## Validation and tests

- `claude plugin validate --strict plugins/orchestration`: passed.
- `claude plugin validate --strict plugins/agent-router`: passed. Hooks: `classic.SessionStart, classic.UserPromptSubmit, agent.offer, tool.describe{tool=Agent}`; calls `$.settings.read, $.ui.invalidate`.
- `claude plugin test plugins/agent-router`: 11 pass, 0 fail (6 pure-logic tests in `tests/routes.test.ts`, 5 through `$` in `tests/register.test.ts`).
- `claude plugin validate --strict plugins/readonly-agent-gate`: passed.
- `bun test plugins/readonly-agent-gate/scripts/tests`: 4 pass. The spec runs `readonly-bash.cases.sh`, the ported case suite: 870+ allow/block cases, 0 failed.
- Live end-to-end, Claude Code 2.1.302: `claude -p --plugin-dir plugins/orchestration --plugin-dir plugins/agent-router --plugin-dir plugins/reviewer --agent orchestration:orchestration --model haiku`. The model quoted the "Installed agent routes (agent-router)" section from the Agent tool description, listing Explore, general-purpose, the codebase-memory agents, `reviewer:reviewer`, and others. The orchestrator itself was excluded.
- Grep for codegraph, claude-mem, coding-core:, github:, "Efficient ", crew:, codex and agy: no matches.

## Deviations and their reasons

1. **agent-router puts the table in the Agent tool's description (`tool.describe{tool:'Agent'}`), not in `prompt.section` or `prompt.context`.** I checked this with a probe mod running live under `claude -p --agent probe:boss`:
   - Event order is classic.SessionStart (`agent_type` set, no `agent_id`) -> session.start -> prompt.context -> agent.offer for every listed type -> prompt.section -> classic.UserPromptSubmit -> turn.start -> tool.describe{Agent}. All offers arrive before both prompt.section and tool.describe, so no `$.fs` scan fallback is needed.
   - Under `--agent`, the only engine section that fires is `env_info_model`, and `prompt.compose` doesn't fire. Sections are cached per session and reused in subagents' system prompts: a marker I appended to `env_info_model` showed up in a general-purpose subagent. prompt.context also fires only once per session (before the offers), so subagents most likely reuse it too, which means the same leak. A marker added to the Agent tool description reached the main thread but not an Explore subagent. That description only reaches agents that can spawn, which is where routing belongs.
   - Caveat: a subagent that has the Agent tool (such as general-purpose) also sees the table. The table's text addresses "the orchestrating main thread".
2. **How agent-router knows the main thread's agent.** It reads `agent_type` from `classic.SessionStart` and `classic.UserPromptSubmit` when there is no `agent_id`. The d.ts documents this: `agent_type` is present on the main thread of an `--agent` session. When neither hook has set it, the mod falls back to the merged `agent` setting via `$.settings.read()`. It matches `orchestration` or any `<plugin>:orchestration`.
   - If an agent type is installed or removed mid-session, `$.ui.invalidate('tool.describe')` runs once, and only when the table text changes.
   - Bounds: 30 rows, 220-char one-line summaries, names restricted to `[A-Za-z0-9_.:@-]`, rows sorted by name so the prompt cache stays stable, and `statusline-setup` excluded.
3. **readonly-agent-gate defaults, per the coordinator's messages.** The default list is `architect`, `architect:architect`, `reviewer`, `reviewer:reviewer`, `debugger`, `debugger:debugger`, `devops` and `devops:devops`, all matched exactly.
   - The `extra_agents` userConfig string (commas or spaces; a JSON list also works) adds more agents through `CLAUDE_PLUGIN_OPTION_EXTRA_AGENTS`. A bare extra name matches any `<plugin>:<name>`; a scoped name matches only itself.
   - I used a plain string instead of `multiple: true` because the docs don't say how a list option is encoded in the env var.
4. **Scratch writes for debugger repro scripts.** `/tmp/**` (which includes `/tmp/claude-*`) and `$TMPDIR` were already allowed. I added the payload's `scratchpad_dir`, which the harness sets and the model doesn't control. A root is accepted only if it is absolute and at least two levels deep. Writes elsewhere, `..` escapes and `rm` of a scratch root stay blocked, and there are cases for each. The block message now says "under /tmp or the session scratchpad only".
5. **The gate covers Bash only.** For `devops`, read-only by default is enforced for Bash only. Its Edit and Write tools are untouched, as the archive gate also left them; only its prompt limits those.
6. **Dropped from the port:**
   - The Python checker and readonly-gate.py, plus the cases specific to them (the .py branches and the shadowed `json.py` checks).
   - The orchestration-guard hooks and the system_override prompt (plan decision: they drift with each release).
   - The crew roster, the `crew:<name>` spawn rule and codegraph mentions in the agent.
   - The byte-compare of the walker against the coremods copy.
7. **Test layout.** The bash case suite is now `scripts/tests/readonly-bash.cases.sh`, not `*.test.sh`, so that `claude plugin test` never picks it up. `readonly-gate.spec.ts` runs it under `bun test` and also unit-tests `agents.ts`.
8. **Licence file.** I added `scripts/vendor/LICENSE-unbash` (ISC, Lars Kappert) beside the vendored unbash bundle, which is unchanged.

## Launching orchestration

There's nothing in the plugin to keep the old flow working. Start it with `claude --agent orchestration:orchestration`, or set `"agent": "orchestration:orchestration"` in settings. I didn't use plugin.json `settings.agent`, because that would force every session that enables the plugin into the orchestrator. The old `claude-tmux` / `claude-crew` launchers would need `--agent orchestration:orchestration` in place of `crew:orchestration`, and they also check `crew@adminhead`. Those scripts live outside my plugins, so I didn't touch them.

## Unverified or TODO

- agent-router's `classic.*` hooks don't run in an org-managed install, as `validate` warns. There, only the `agent` setting fallback detects the orchestrator, so an `--agent` flag alone shows no table.
- I didn't run the gate in a live session with real `architect:architect`-style subagents. The payload shape comes from the coordinator's note and the d.ts, and the gate script is exercised end to end by the case suite.
- Gating for agent-team teammates is still unverified, as it was in the archive. The orchestrator prompt keeps "never spawn read-only agents as teammates".
- In the live run the `Plan` built-in didn't appear in the table, although earlier probe runs offered it. Most likely it wasn't offered in that session. Not investigated.

## Suggested follow-ups

- Plan item: `bash-danger-guard`, `cloud-ops-guard` and `readonly-agent-gate` vendor byte-identical copies of `shell/walk.ts` and `vendor/unbash.{js,d.ts}`. Add a sync/check script in `scripts/`.
- Update the launcher scripts and docs for `orchestration:orchestration` and the new plugin names.
- Consider an `exclude_agents` option for agent-router if the table gets noisy (for example the `claude` catch-all).
