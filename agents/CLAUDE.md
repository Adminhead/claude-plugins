# Agents

Rules for building and updating the subagent definitions in this directory. Source: the Claude Code subagents reference (https://code.claude.com/docs/en/sub-agents), checked against Claude Code 2.1.296.

## How these files load

- `~/.claude/agents` is a symlink to this directory, so every file here is a user-scope agent in every session. Run `git status agents/` before editing, in case another session has work in progress.
- Claude Code watches the directory. An edit applies to the next delegation within seconds, with no restart. `orchestration.md` is the exception, because it runs as the session itself (`claude --agent orchestration`, launched by `scripts/claude-tmux.sh`), so its changes apply at the next launch.
- Scope precedence on a name clash: managed, then `--agents`, then project `.claude/agents/`, then user `~/.claude/agents/` (this directory), then plugin `agents/`.
- The directory is scanned recursively. Identity comes only from the `name` field, never the filename or subfolder. When two files share a `name`, only one loads, picked by filesystem read order, so keep names unique.
- Claude Code skips a file with no warning in the session in these cases:
  - The opening `---` isn't line 1, or there's no `name`. The file counts as documentation, which is why this file is safe here. `scripts/agent-tools.py` exempts it by name.
  - `name` starts with `-`, contains `:`, or runs past 256 characters.
  - `name` has no `description`.
  - The YAML doesn't parse.

  Only the last three cases are written to the debug log, so run `claude --debug` when an agent goes missing.
- A subagent's system prompt is its body plus environment details, not the Claude Code system prompt. It also loads the CLAUDE.md hierarchy, git status, its preloaded skills, and the brief. It never sees the parent conversation.

## File layout

Use this shape and field order. Name the file after `name`.

```markdown
---
name: <kebab-case>
description: <Role in one clause>. Use proactively <when>. Not for <x> (<agent>), <y> (<agent>). Returns <report shape>.
model: haiku | sonnet | opus
effort: low | medium | high | xhigh | max
tools: <allowlist, read-only agents only>
disallowedTools: <writers only: Agent, mcp__claude-in-chrome, mcp__plugin_github_github>
skills:
  - <plugin>:<skill>
hooks:                             # read-only agents with Bash only
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: 'python3 -I "$HOME/.claude/hooks/readonly-bash.py" || exit 2'
color: <one of the eight>
---

<One sentence: what this agent does and its main limit.>

1. <Numbered procedure, cheapest step first.>
2. ...
N. <Stop rule: three materially different failed attempts, then hand back.>

Report: <exact contents of the final message>. End with `escalate: <agent> — <reason>` where a ladder applies.

## Ground rules

<Shared paragraphs, copied verbatim. See "Body" below.>
```

## Agent classes

| Class | Tool fields | Bash | Members |
| --- | --- | --- | --- |
| Read-only | `tools:` allowlist with none of Edit, Write, NotebookEdit | Only with the readonly-bash hook above | Explore, architect, debugger, debugger-critical, review, quick-review, security-auditor, browser-tester |
| Writer | No `tools:`; `disallowedTools: Agent, mcp__claude-in-chrome, mcp__plugin_github_github`. For public GitHub code search they keep grep-app, and `gh` via Bash covers reads | Unrestricted | coder, coder-high, coder-max, devops, dba, scribe |
| Main thread | No `tools:` (it would narrow the whole session) | Session rules | orchestration |

`scripts/agent-tools.py` enforces these. A read-only agent may not have:

- a `memory` key, which silently enables Read, Write and Edit
- Skill, SendMessage, Monitor, Artifact or EnterWorktree
- a server-level MCP grant (`mcp__<server>` or `mcp__<server>__*`) of a server not marked read-only
- an MCP tool whose name contains a write verb
- Bash without the readonly-bash hook, or the hook without Bash

A read-only agent that only disallows the writers still inherits everything else, so it must use an allowlist.

## Frontmatter rules

| Field | Rule |
| --- | --- |
| `name`, `description` | Required. `name` is also the `agent_type` hooks receive, and what orchestration routes by. |
| `tools`, `disallowedTools` | One-line comma-separated string, never YAML list form (agent-tools rule). `disallowedTools` applies first. An entry with a specifier, such as `Bash(git push *)`, removes the whole tool, so block commands with a hook or `permissions.deny` instead. Every name must be a known built-in or an MCP entry on a known server (`MCP_SERVERS` in `scripts/agent-tools.py`, a map from server id to a read-only flag; add the server there before using it). Prefer the server-level form `mcp__<server>`, which grants or removes every tool of the server, so new tools need no edit. Name a single tool only when a server mixes read and write tools, as with playwright for browser-tester. `Workflow` is removed from every subagent, so it needn't be denied. |
| `model` | Use an alias: `haiku`, `sonnet` or `opus`. A family alias resolves to the main conversation's exact model when it belongs to the same family. A per-call `model` parameter overrides the frontmatter. |
| `effort` | Set it explicitly. A per-call `effort` overrides it, and `CLAUDE_CODE_EFFORT_LEVEL` overrides both. Available levels depend on the model, so check before using `xhigh` or `max`. |
| `skills` | Preload only what the agent needs on every run, at most 32. The full skill text is injected, which costs context on each spawn. A missing or disabled skill is skipped with only a debug-log warning, so preload only skills from user-scope plugins. Skills with `disable-model-invocation: true` can't be preloaded. |
| `hooks` | Frontmatter hooks in this directory run without a trust prompt. A `Stop` hook becomes `SubagentStop`. Session hooks from settings and plugins also fire inside subagents. |
| `color` | One of `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan`. There are more agents than colors, so share a color within a family: red for debuggers and coder-max, orange for reviewers and security-auditor, and one color each for the other agents, reused across unrelated roles (yellow for Explore and devops, cyan for browser-tester and scribe). |

Fields this roster doesn't use, and why:

- `permissionMode`: ignored when the parent runs in auto, acceptEdits or bypass mode, which is how these sessions run.
- `isolation`: the orchestrator passes `isolation: "worktree"` per call. Set in frontmatter, it doesn't stop a named spawn from becoming a teammate when agent teams are on, and that teammate runs in the main checkout.
- `memory`: banned for read-only agents, and no writer needs memory across sessions.
- `background`, `maxTurns`, `initialPrompt`, `omitClaudeMd`, `experimental`: add one only with a concrete current use.
- Unknown or misspelled fields are ignored without an error, so match the camelCase exactly.

`mcpServers` has one use. browser-tester declares its own playwright server so the browser stays scoped to that agent.

## Tools at runtime

- Every subagent loses AskUserQuestion, EnterPlanMode, ScheduleWakeup, WaitForMcpServers, Workflow and EndConversation. It also loses ExitPlanMode unless its `permissionMode` is `plan`, and Agent at the nesting depth limit. A body must never tell the agent to ask the user. It stops and reports the question in its final message.
- Background subagents, the default in interactive sessions, keep every MCP tool but only these built-ins: Read, Grep, Glob, LSP, Bash, PowerShell, Edit, Write, NotebookEdit, WebFetch, WebSearch, TodoWrite, Skill, ToolSearch, EnterWorktree, ExitWorktree, Monitor, TaskStop, SendMessage, Artifact and SubagentHandback. Don't write a procedure that depends on any other tool.
- In a worktree-isolated agent, Claude Code refuses a Bash command when it can't prove that the git it runs stays inside the worktree. Name `git` directly. Running it through a wrapper or launcher, or with a computed command name, gets the command refused.
- Worktrees branch from the base set by `worktree.baseRef` in user settings. Keep it `"head"`, which branches from the current local `HEAD`. The default, `"fresh"`, branches from the remote default branch (`origin/HEAD`), so a worktree agent misses every unpushed commit. In this repo, which commits to local `main` and pushes only on request, that means parallel slices build on stale code and the merge back diverges. Uncommitted changes never reach a worktree under either setting, so commit before spawning a worktree agent that needs them.

## Description

The description is the router's only signal, for both the orchestrator and automatic delegation.

- Order: role, then "Use proactively ..." triggers, then "Not for ... (agent)" pointers, then "Returns ...".
- Each "Not for" pointer names an existing agent on the correct ladder rung. Rename or remove an agent, and every pointer to it must change.
- Keep it to a few sentences and leave procedure for the body. Claude Code warns when all descriptions together pass 15,000 tokens.

## Body

- Open with one sentence that states the job and its main limit ("You diagnose and never implement the fix.").
- Then a numbered procedure, a stop rule, and a `Report:` line that fixes the shape of the final message. The final message is all the caller sees.
- Ladders end with an `escalate:` line naming the next rung, so the next agent starts warm. A terminal rung (devops, dba) ends with `escalate: caller — <blocker>`. debugger-critical ends with `escalate: user — <artifact or decision needed>` when the cause stays unconfirmed.
- Every writer carries the commit-policy line from `coder.md` ("Commit your change as small, grouped Conventional Commits ... Never push.") and starts its `Report:` with the branch and commit hashes.
- Ground rules are copied verbatim, never paraphrased:
  - Writers carry the three paragraphs under `## Ground rules` in `coder.md`.
  - Read-only agents carry the one paragraph in `debugger.md`. `security-auditor.md` adds a second paragraph that refuses destructive and evasion work.
  - To change a ground rule, change every copy in the same commit (`rg -n '<phrase>' agents`).
- Write in the user's prose style (short declaratives, no announcing, no colon before a clause). Keep a body under about 40 lines. Move reference material to a preloaded skill instead.

## Roster and ladders

| Agent | Model / effort | Class | Role |
| --- | --- | --- | --- |
| Explore | haiku / low | read-only | Locate and map code |
| architect | opus / high | read-only | Sliced plans for multi-slice or unclear work |
| coder | haiku / medium | writer | Default implementer: clear, bounded, including mechanical edits |
| coder-high | sonnet / medium | writer | Bounded work needing design judgment; next rung after coder |
| coder-max | opus / medium | writer | Last resort after coder-high, or work marked high-complexity |
| debugger | sonnet / high | read-only | First-pass root cause |
| debugger-critical | opus / high | read-only | Unconfirmed or high-stakes failures (concurrency, data loss, security, production) |
| devops | opus / medium | writer | CI/CD, containers, Kubernetes, IaC; no live changes without brief authorization |
| dba | opus / medium | writer | Schema, migrations, queries; no shared-database writes without authorization |
| scribe | haiku / medium | writer | Docs |
| quick-review | sonnet / medium | read-only | Reviewer for small coder diffs |
| review | opus / high | read-only | Reviewer for large, risky, devops and dba changes |
| security-auditor | opus / high | read-only | Security review alongside `review` |
| browser-tester | sonnet / medium | read-only | Acceptance checks in a real browser |
| orchestration | session | main thread | Routes work to the agents above |

Ladders:

- Implementers: coder, then coder-high, then coder-max, one rung at a time.
- Debugging: debugger, then debugger-critical. Each ends by naming the coder rung for the fix.
- A coder-high failure with a known cause goes to coder-max, and one with no known cause goes to debugger.
- devops and dba are terminal. quick-review may hand a change up to review.

## Changing the roster

1. Run `git status agents/` and read the files you will touch.
2. Write or edit the file to the layout above.
3. Update every reference: `rg -n '<name>' agents hooks scripts plugins README.md CLAUDE.md docs/plugins`. Leave `docs/plans/` and `docs/research/` alone, since they are history.
4. In `orchestration.md`, update the routing entry (delegate when, don't when, rule of thumb), the review rules, and the read-only list.
5. When the agent implements or owns fixes, update the agent lists in `architect.md` and `security-auditor.md`.
6. After a rename or removal, check `permissions.deny` entries such as `Agent(<name>)` in settings.
7. Run the checks below, then a `quick-review` pass on the diff.
8. Commit with `feat(agents): ...` or `refactor(agents): ...`, staging explicit paths.

## Checks

Run from the repo root.

- `python3 scripts/agent-tools.py`: the tool and read-only rules.
- `bash scripts/agent-tools.test.sh`: tests for that checker.
- `claude plugin validate agents`: frontmatter parses. It doesn't flag a missing `name`.
- `bash hooks/tests/orchestration-guard.test.sh`: run it when `orchestration.md` or the guard changes.
- After a model or effort change, spawn the agent once and confirm the model in `/tasks`.
