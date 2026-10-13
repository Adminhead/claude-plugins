# crew

The orchestrated-session crew. It ships the 15 agents that `claude-tmux` sessions run, the read-only Bash gates and orchestration hooks that guard them, and the system prompt file the launcher appends. It replaces the three `~/.claude` symlinks (`agents`, `hooks`, `prompts`) that used to point into this repo. The cutover that removes those links is slice 8 of [marketplace-native-config.md](../plans/marketplace-native-config.md).

Install it at user scope; `claude-tmux` refuses to start without it there, and the plugin is not meant for individual projects. The plugin ships no skills. Its agents preload skills from other plugins (see [Requirements](#requirements)).

## Agents

The orchestrator is `crew:orchestration`. It runs as the session itself and plans, routes and verifies. The other 14 are subagents it spawns.

| Agent | Bash | Role |
| --- | --- | --- |
| `crew:orchestration` | Session rules | Main-session orchestrator. Plans work, routes it to the other agents, and verifies what they return |
| `crew:coder` | Unrestricted | Default implementer for a bounded change with a clear approach, including mechanical multi-file edits |
| `crew:coder-high` | Unrestricted | Implementer for a bounded change that needs design judgment; the next rung after `coder` |
| `crew:coder-max` | Unrestricted | Last-resort implementer for work that needs deep reasoning |
| `crew:dba` | Unrestricted | Schema design, migrations, indexes and queries. No shared-database writes unless the brief allows them |
| `crew:devops` | Unrestricted | CI/CD, containers, Kubernetes, IaC and deploy config. No live infrastructure changes unless the brief allows them |
| `crew:scribe` | Unrestricted | Documentation writer and updater |
| `crew:architect` | Read-only gate | Sliced implementation plans for multi-slice, cross-cutting or unclear work, stress-tested by an outside critic |
| `crew:debugger` | Read-only gate | First-pass root-cause diagnosis for failures with an unknown cause. Never fixes |
| `crew:debugger-critical` | Read-only gate | Root-cause diagnosis for failures `debugger` couldn't confirm, and for high-stakes failures |
| `crew:review` | Read-only gate | Thorough review of large or risky changes and high-stakes plans |
| `crew:quick-review` | Read-only gate | Fast, focused review of small, task-scoped changes |
| `crew:security-auditor` | Read-only gate | Security review of a diff or code area |
| `crew:browser-tester` | Read-only gate | Checks a running web app in a real browser against acceptance criteria, using the efficient-web Playwright server |
| `crew:Explore` | None | Fast read-only navigator for locating code and mapping how a feature works |

"Read-only gate" means the agent is in the `READ_ONLY` set of the Bash gates described below. The gated agents are `quick-review` and the six others listed in the `.py` gate.

Rules for writing and changing these agents live in [writing-agents.md](../../plugins/crew/docs/writing-agents.md).

## Scoped names

Plugin agents register under the plugin name, so every agent is `crew:<name>`.

- Spawn with `subagent_type: crew:<name>`. The Agent tool rejects a bare name.
- The orchestrator's routing prose uses bare names. A bare name in `orchestration.md` means the same agent.
- The session starts as `claude --agent crew:orchestration`.
- `crew:Explore` sits beside the built-in `Explore`. See [Limits](#limits).

## Guards

### Read-only Bash gate

`hooks/hooks.json` holds two `PreToolUse` Bash entries. Each runs on every Bash call in a session with crew enabled:

- `scripts/readonly-gate.ts` (under bun) covers `crew:quick-review`.
- `scripts/readonly-gate.py` (under `python3 -I`) covers the other six read-only agents: `crew:architect`, `crew:security-auditor`, `crew:review`, `crew:browser-tester`, `crew:debugger` and `crew:debugger-critical`.

The gates key on `agent_type`. For a listed agent, the gate runs the read-only Bash check and denies anything that writes. For every other agent, and for the main thread, the gate exits 0 and the call goes ahead. The two gates use disjoint sets, so an agent is checked by one gate only. The split is temporary, and moving agents between the two is tracked in [hooks-typescript-ast-bash.md](../plans/hooks-typescript-ast-bash.md).

The gate fails closed:

- An agent that carries an `agent_id` but no `agent_type` is denied, because its identity was lost.
- If bun or python3 is missing, or a gate fails to start, every Bash call is blocked in every crew session, not only in the read-only agents. The failure is loud. Install the missing tool.

Each Bash call starts both gate processes. In a measurement run on 2026-10-12, the TypeScript check took 9 ms end to end, and `python3 -I` startup took 13 ms.

### Orchestration hooks

`orchestration-guard.py` holds four hooks. Each one does nothing unless the caller is `crew:orchestration` with no `agent_id`. Each one fails open, so a guard error never blocks the session.

| Hook | Event | Effect |
| --- | --- | --- |
| `ledger` | PostToolUse `TaskCreate` or `TaskUpdate` | Records tasks in a per-session state file |
| `stop` | Stop | Blocks the stop with R1 while tasks are open, or with R4 (a final audit of each requirement) once they are all completed. An unchanged state gets through, and blocking stops after a chain limit |
| `prompt` | UserPromptSubmit | Adds R2 when an agent returns: its report is a claim, so read any changed files |
| `edit` | PostToolUse `Edit`, `Write` or `NotebookEdit` | Adds R3 once the orchestrator has edited more than about 30 lines, or more than two files, directly |

## Launcher

`claude-tmux` starts orchestrated sessions. Link it at `~/.local/bin/claude-tmux`, pointing to `scripts/claude-tmux.sh`. Until `scripts/install.sh` does that, make the link by hand.

For a new session, the launcher:

- Runs `claude plugin list --json` from the directory it starts in. It stops with the fix if `crew@adminhead` isn't enabled at user scope, or is disabled at project or local scope for that directory. Attaching to an existing session skips this check.
- Starts `claude` with `--agent crew:orchestration`.
- Appends `prompts/system_override.md` with `--append-system-prompt-file`. It reads the plugin's folder from the same JSON: `readFromFolder` (the repo, for the directory marketplace) when set, else `installPath`.
- Sets `CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS=1`, which removes the built-in Explore and Plan agents for that session.

Plain `claude` gets the stock prompt and doesn't run as `crew:orchestration`. Only the launcher sets those.

## Dev loop

`adminhead` is a directory marketplace, so the installed plugin runs from `plugins/crew/` in this repo. Edits go live in every session at its next `/reload-plugins` or relaunch.

1. Edit files under `plugins/crew/`.
2. Run `bash plugins/crew/scripts/tests/check.sh`.
3. Optionally try a risky change in one session first with `claude --plugin-dir <copy of plugins/crew>`, which fully replaces the installed one for that session.
4. Run `/reload-plugins`, or relaunch.
5. Release with a version bump and `ship-plugin crew`, which matters for installs from a git source.

## Requirements

- bun and `python3` on `PATH`. Both gates run on every Bash call.
- Claude Code 2.1.296, the version the agent and hook behavior was checked against. Later versions are UNCONFIRMED.
- The plugins the agents preload or call. Install `efficient-core` (`coder`, `architect`, `review` and others preload its skills) and `code-search` and `coremods` (agent tools name them). `scribe` preloads `avoid-ai-writing:avoid-ai-writing`, and `browser-tester` needs the efficient-web Playwright server. A missing skill or server is skipped without an error. `browser-tester` reports every criterion blocked when its server is absent.

## Install

```
claude plugin install crew@adminhead --scope user
```

Uninstall with `claude plugin uninstall crew@adminhead`.

## Limits

- Teammate gating is unverified. The spike checked gates for foreground, background and resumed subagents, but not agent-team teammates. Never spawn a read-only agent as a teammate. `orchestration.md` says so.
- A plugin can't override the built-in `Explore`. A plugin agent registers as `crew:Explore` beside it. The launcher removes the built-in one in orchestrated sessions with `CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS=1`.
- Plugin agents ignore frontmatter `hooks`, `mcpServers`, `permissionMode` and `initialPrompt`, silently. The checker bans them.
- The plugin's hooks fire in every session where crew is enabled. In a plain session they exit at once, and the guard stays silent.
- Changes to `orchestration.md` take effect only when the session starts, because the session runs as that agent.
- The agent identity fields the gates read come from the harness. After a Claude Code upgrade, check them with a live probe, beside `scripts/prompt-drift.sh`.
