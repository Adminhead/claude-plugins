# Claude Code settings examples

Starting points for the three settings scopes. They are checked against the [settings reference](https://code.claude.com/docs/en/settings-reference) and [environment variables](https://code.claude.com/docs/en/env-vars) as of Claude Code 2.1.302.

| File | Copy to | Holds |
| --- | --- | --- |
| `settings.global.json` | `~/.claude/settings.json` | Personal defaults for every project |
| `settings.project.json` | `<repo>/.claude/settings.json` | Marketplaces and plugins the team shares, committed |
| `settings.local.json` | `<repo>/.claude/settings.local.json` | Your overrides for one checkout, gitignored |

Merge the global example into `~/.claude/settings.json`. Do not overwrite that file. The codebase-memory-mcp installer writes its hooks there (`PreToolUse`, `PostToolUse`, `SessionStart`, `SubagentStart`), and this example leaves them out on purpose.

Placeholders in angle brackets (`<plugin>`, `<option>`) need real values. Settings files are plain JSON, so the notes live here, not in the files. Keep secrets such as tokens out of settings files.

The tables below cover `settings.global.json` unless a section names another file. Some keys, such as `promptCacheTtl`, `bashOutputMaxChars` and `feedbackDrafts`, are newer than the published JSON schema. The schema allows unknown keys, so the files still validate, but your editor may not autocomplete them.

## Settings

### Model and context

| Setting | Value | Why |
| --- | --- | --- |
| `model` | `opus` | Default model for the main conversation |
| `advisorModel` | `fable` | Model the advisor tool consults, while `opus` runs the conversation |
| `effortLevel` | `medium` | Persists effort across sessions. Raise it per session for hard work |
| `autoCompactWindow` | `300000` | Compacts at 300k tokens instead of the model's tuned window, so a session's context stays around 300k. There is no setting that caps a recognized model's context window itself: `CLAUDE_CODE_MAX_CONTEXT_TOKENS` applies to a recognized model only together with `DISABLE_COMPACT`, which turns off all compaction |
| `skillListingBudgetFraction` | `0.03` | 3% of context for the skill listing instead of 1%, so descriptions of the many installed skills are not cut and Claude still picks them |
| `bashOutputMaxChars` | `10000` | Lowers inline Bash output from 30,000 characters. Longer output goes to a file Claude can open, which keeps noisy builds out of context |
| `promptCacheTtl` | `1h` | Keeps the main conversation's prompt cache for an hour, so the first message after a break reads the cache instead of reprocessing the whole context. A subscription gets the hour by default only within plan usage and drops to 5 minutes on usage credits or an API key; this keeps it there too, at a higher cache-write rate. Idle compaction (on by default) also needs the one-hour cache |
| `subagentPromptCacheTtl` | `5m` | Keeps subagent and helper requests on the cheaper 5-minute cache write |
| `promptSuggestionEnabled` | `false` | No grayed-out next-prompt predictions, which cost an extra model request after every response |

### Agents and notifications

| Setting | Value | Why |
| --- | --- | --- |
| `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | `1` | Turns on agent teams |
| `teammateMode` | `auto` | Teammates get split panes when running inside tmux or iTerm2, and run in-process otherwise. Default is `in-process` |
| `subagentStatusLine` | `jq` command | Rewrites each subagent row in the agent panel to `name · model · progress · tokens` (the model without its `claude-` prefix), so you can see which model each agent runs on. Needs `jq` on `PATH`; a row whose model isn't resolved yet shows without it |
| `env.CLAUDE_AUTO_BACKGROUND_TASKS` | `1` | Long-running subagents move to the background |
| `env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` | `2` | Caps nesting at one layer below your subagents (the default allows three). Third-party agents built to fan out still work, but nothing nests deeper. The adminhead agents can't spawn at all: each blocks `Agent` and `Workflow` in its own definition, which `scripts/plugins.py check` enforces. `1` turns nesting off for every agent |
| `env.CLAUDE_CODE_WORKER_CHECKIN_SCHEDULE` | `120` | Reminds Claude to check on background subagents every 2 minutes. Without it there are no reminders |
| `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` | `1` | Task-tracking tools on every model |
| `remoteControlAtStartup` | `true` | Connects Remote Control in each session |
| `inputNeededNotifEnabled` | `true` | Phone push when a prompt waits for input |
| `agentPushNotifEnabled` | `true` | Lets Claude push when a long task finishes |
| `theme` | `auto` | Follows the terminal's light or dark mode. Default is `dark` |
| `spinnerTipsEnabled` | `false` | No feature tips in the spinner line |
| `feedbackSurveyRate` | `0` | No "How is Claude doing?" survey interrupting a session |

### Tools, git and permissions

| Setting | Value | Why |
| --- | --- | --- |
| `env.USE_BUILTIN_RIPGREP` | `0` | Uses the system `rg`. Needs `rg` on `PATH` |
| `env.MCP_DISCOVERY_CACHE` | `1` | Remote MCP servers connect on first use, not at startup |
| `env.ENABLE_CLAUDEAI_MCP_SERVERS` | `false` | No claude.ai connectors. Add a server such as Context7 on its own when a project needs it |
| `feedbackDrafts` | `off` | Removes the SendFeedback tool, so Claude drafts no feedback reports and its definition stays out of context. Replaces `env.CLAUDE_CODE_SEND_FEEDBACK=0`; the documented setting is the persistent switch and the variable a per-session override. User scope only: project and local files ignore it |
| `attribution` | empty `commit` and `pr`, `sessionUrl: false` | No Claude trailers or session links in commits and PRs. This form also works on versions before 2.1.281, which reject `"attribution": false` |
| `permissions.defaultMode` | `auto` | Auto mode with the background classifier |
| `permissions.allow` | codebase-memory-mcp tools | Query and indexing tools only. `delete_project`, `manage_adr` and `ingest_traces` still prompt |
| `worktree.baseRef` | `head` | New worktrees branch from local `HEAD`, unpushed commits included. Default is `fresh` |
| `worktree.symlinkDirectories` | `node_modules`, `.venv` | Worktrees share these directories instead of copying them |

Read-only Bash commands need no allow rules: `ls`, `cat`, `grep`, `find`, `diff`, `wc` and read-only `git` forms such as `git status`, `git log` and `git diff` are built in and run without a prompt in every mode, and auto mode approves them before the classifier. `rg` is left off on purpose, because `Bash(rg *)` would also approve `rg --pre <command>`, which runs an arbitrary program.

### Project file (`settings.project.json`)

| Setting | Value | Why |
| --- | --- | --- |
| `extraKnownMarketplaces.adminhead` | GitHub `Adminhead/claude-plugins` | Every teammate gets the marketplace |
| `enabledPlugins` | `<plugin>@adminhead: true` | Plugins the team shares |
| `env.CLAUDE_CODE_GLOB_NO_IGNORE` | `false` | The Glob tool skips files that match `.gitignore`, such as `node_modules`, build output and `.venv`, so file searches return fewer, relevant paths. By default Glob returns ignored files too. Claude can still read an ignored file by path. The `@` picker already respects `.gitignore` (`respectGitignore` defaults to `true`) |
| `worktree.symlinkDirectories` | `node_modules`, `.venv` | Worktrees share these directories instead of copying them |

### Local file (`settings.local.json`)

Per-checkout overrides only: turn a shared plugin off for this checkout or give it local options. Claude Code also writes your `.mcp.json` server approvals here.

### Plugins

| Setting | Why |
| --- | --- |
| `extraKnownMarketplaces` | `adminhead`, `claude-code-lsps` (LSP servers that some adminhead plugins install across marketplaces) and `conorbronsdon-skills` |
| `cc-plugin-telemetry@builtin: false` | Plugin telemetry off |
| `cc-plugin-agents-md@builtin` with `instructionFiles: claude-md-and-agents-md` | Reads `AGENTS.md` beside `CLAUDE.md` |
| `cc-plugin-diff@builtin` | Diff viewer |
| `design@synced: false` | Turns off Anthropic's design plugin synced from claude.ai. The adminhead `design-core` and `design-meta` plugins port its skills, so leaving both on doubles the triggers |
| `avoid-ai-writing@conorbronsdon-skills` | Writing-style skill |
