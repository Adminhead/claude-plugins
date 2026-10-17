# Claude Code settings examples

Starting points for the three settings scopes. They are checked against the [settings reference](https://code.claude.com/docs/en/settings-reference) and [environment variables](https://code.claude.com/docs/en/env-vars) as of Claude Code 2.1.302.

| File | Copy to | Holds |
| --- | --- | --- |
| `settings.global.json` | `~/.claude/settings.json` | Personal defaults for every project |
| `settings.project.json` | `<repo>/.claude/settings.json` | Marketplaces and plugins the team shares, committed |
| `settings.local.json` | `<repo>/.claude/settings.local.json` | Your overrides for one checkout, gitignored |

Merge the global example into `~/.claude/settings.json`. Do not overwrite that file. The codebase-memory-mcp installer writes its hooks there (`PreToolUse`, `PostToolUse`, `SessionStart`, `SubagentStart`), and this example leaves them out on purpose.

Placeholders in angle brackets (`<plugin>`, `<option>`) need real values. Settings files are plain JSON, so the notes live here, not in the files. Keep secrets such as tokens out of settings files.

## Settings

### Model and context

| Setting | Value | Why |
| --- | --- | --- |
| `model` | `fable` | Default model |
| `advisorModel` | `fable` | Model for the advisor tool |
| `effortLevel` | `medium` | Persists effort across sessions. Raise it per session for hard work |
| `autoCompactWindow` | `450000` | Compacts at 450k tokens instead of the model's tuned window |
| `skillListingBudgetFraction` | `0.03` | 3% of context for the skill listing instead of 1%, so descriptions of the many installed skills are not cut and Claude still picks them |
| `bashOutputMaxChars` | `10000` | Lowers inline Bash output from 30,000 characters. Longer output goes to a file Claude can open, which keeps noisy builds out of context |
| `subagentPromptCacheTtl` | `5m` | Keeps subagent and helper requests on the cheaper 5-minute cache write |

### Agents and notifications

| Setting | Value | Why |
| --- | --- | --- |
| `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | `1` | Turns on agent teams |
| `teammateMode` | `tmux` | Teammates get tmux panes. Default is `in-process` |
| `env.CLAUDE_AUTO_BACKGROUND_TASKS` | `1` | Long-running subagents move to the background |
| `env.CLAUDE_CODE_WORKER_CHECKIN_SCHEDULE` | `120` | Reminds Claude to check on background subagents every 2 minutes. Without it there are no reminders |
| `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` | `1` | Task-tracking tools on every model |
| `remoteControlAtStartup` | `true` | Connects Remote Control in each session |
| `inputNeededNotifEnabled` | `true` | Phone push when a prompt waits for input |
| `agentPushNotifEnabled` | `true` | Lets Claude push when a long task finishes |
| `theme` | `auto` | Follows the terminal's light or dark mode. Default is `dark` |

### Tools, git and permissions

| Setting | Value | Why |
| --- | --- | --- |
| `env.USE_BUILTIN_RIPGREP` | `0` | Uses the system `rg`. Needs `rg` on `PATH` |
| `env.MCP_DISCOVERY_CACHE` | `1` | Remote MCP servers connect on first use, not at startup |
| `env.ENABLE_CLAUDEAI_MCP_SERVERS` | `false` | No claude.ai connectors. Add a server such as Context7 on its own when a project needs it |
| `env.CLAUDE_CODE_SEND_FEEDBACK` | `0` | No Claude-drafted feedback reports |
| `attribution` | empty `commit` and `pr`, `sessionUrl: false` | No Claude trailers or session links in commits and PRs. This form also works on versions before 2.1.281, which reject `"attribution": false` |
| `permissions.defaultMode` | `auto` | Auto mode with the background classifier |
| `permissions.allow` | codebase-memory-mcp tools | Query and indexing tools only. `delete_project`, `manage_adr` and `ingest_traces` still prompt |
| `worktree.baseRef` | `head` | New worktrees branch from local `HEAD`, unpushed commits included. Default is `fresh` |
| `worktree.symlinkDirectories` | `node_modules`, `.venv` | Worktrees share these directories instead of copying them |

### Plugins

| Setting | Why |
| --- | --- |
| `extraKnownMarketplaces` | `adminhead`, `claude-code-lsps` (LSP servers that some adminhead plugins install across marketplaces) and `conorbronsdon-skills` |
| `cc-plugin-telemetry@builtin: false` | Plugin telemetry off |
| `cc-plugin-agents-md@builtin` with `instructionFiles: claude-md-and-agents-md` | Reads `AGENTS.md` beside `CLAUDE.md` |
| `cc-plugin-diff@builtin` | Diff viewer |
| `design@synced: false` | Turns off Anthropic's design plugin synced from claude.ai. The adminhead `design-core` and `design-meta` plugins port its skills, so leaving both on doubles the triggers |
| `avoid-ai-writing@conorbronsdon-skills` | Writing-style skill |
