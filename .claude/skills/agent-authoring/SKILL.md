---
name: agent-authoring
description: Writes and reviews Claude Code subagent definitions, the `agents/*.md` files with YAML frontmatter that Claude delegates tasks to. It covers deciding whether a subagent is warranted at all, choosing a tool allowlist, writing a description that triggers delegation, structuring the system prompt around an output contract, setting model and permission fields, placing the file in a project, user, or plugin scope, and testing it. Use when creating or editing a file under `.claude/agents/`, `~/.claude/agents/`, or a plugin's `agents/` directory, or when asked to review one.
---

# Write a subagent

A subagent is a Markdown file: YAML frontmatter, then the system prompt. Claude sees only the `description` on every turn when deciding whether to delegate; the body loads when the subagent runs. The subagent starts with a fresh context: your body, the delegation message Claude writes, the CLAUDE.md files, and a git status snapshot. It never sees the conversation, the Claude Code system prompt, or the user. Everything it needs must be in the body or arrive in the delegation prompt.

Authoritative reference: https://code.claude.com/docs/en/sub-agents. Field table in `references/frontmatter.md`, prompting rules in `references/official-guidance.md`, three complete files in `references/examples.md`.

## 1. Decide whether a subagent is warranted

Pick the lightest mechanism that fits. A subagent costs a cold start, its own tokens, and a description that sits in context on every turn whether or not it runs.

| Want | Use |
| :- | :- |
| A reusable prompt or workflow that runs in the main conversation with its context | A skill (`SKILL.md`), not a subagent |
| Something that must happen every time, no exceptions | A hook, not a prompt |
| A side task that needs the conversation so far | A fork (`/subtask`), not a custom subagent |
| A lookup you can do in a few tool calls | Do it inline |
| Work that floods context (test output, logs, wide searches) and returns a summary | A subagent |
| A hard tool boundary (read-only review, no network, no MCP) | A subagent with `tools` |
| The same kind of worker spawned repeatedly with the same instructions | A custom subagent file |

Write the file only for the last three rows. The doc's own test: define a custom subagent when you keep spawning the same kind of worker with the same instructions.

## 2. Choose one job, then the tools it needs

One subagent does one job. Fix its inputs (what the delegation prompt hands it) and its output (what the parent needs back) before writing anything else.

Then list `tools` as an allowlist. Omitting `tools` inherits everything available to subagents, including every MCP tool.

- Read-only: `tools: Read, Grep, Glob`. Add `Bash` only when it must run commands such as `git diff` or a test suite; Bash can write.
- Worker: name exactly the tools the procedure uses, such as `Read, Edit, Bash, Grep, Glob`.
- Keep the inherited pool but block writes: `disallowedTools: Write, Edit`.
- Block MCP: `disallowedTools: mcp__*`, or one server with `mcp__github`.
- Prevent nesting: leave `Agent` out of `tools` or add it to `disallowedTools`. Subagents can otherwise spawn their own, three layers deep.

Rules from the doc that are easy to get wrong:

- A `disallowedTools` entry with a specifier such as `Bash(git push *)` removes all of Bash. For command-level blocks use a `permissions.deny` rule in settings or a `PreToolUse` hook. The only specifier the doc documents inside `tools` is `Agent(type, ...)`, and that list is honoured only for a `claude --agent` main thread.
- If nothing in `tools` resolves to a real tool (typos), the subagent fails to launch.
- Background subagents, the default in interactive sessions, get a reduced built-in tool set. `AskUserQuestion`, `EnterPlanMode`, and `ExitPlanMode` (unless `permissionMode: plan`) are removed from every subagent, so never write "ask the user" into a body.
- `memory` turns on Read, Write, and Edit automatically.

## 3. Write the description as the delegation trigger

The description is the only thing Claude reads before delegating. It must single out this subagent against every other one in the session.

- Say what it does and when to use it, third person, one to three sentences. Name the trigger: "Use after editing files under `src/auth/`", "Use when a test run fails".
- Add "use proactively" when Claude should reach for it unprompted.
- Say what it is not for when a sibling subagent overlaps.
- Keep it short. Detail belongs in the body, which loads only on use. Combined descriptions over 15,000 tokens produce a startup warning.
- Don't shout. "CRITICAL: You MUST use this" overtriggers on current models; "Use when..." routes correctly.

## 4. Write the system prompt body

The body replaces the Claude Code system prompt. Structure it in this order, one heading per part. Where a constraint isn't obvious, say why; Claude generalises from a reason better than from a bare rule.

1. **Role.** One or two sentences: "You are a code reviewer for this repository's Python services." Not a page of credentials.
2. **Inputs.** What the delegation prompt will contain and what to do when it's missing: "If no files are named, run `git diff --name-only` and review those."
3. **Procedure.** Numbered steps when order matters. Tell it to read before judging ("Never speculate about code you have not opened."). Give it a check it can run (tests, build, diff) and have it show the evidence rather than assert success.
4. **Output contract.** The exact shape of the final message: headings, fields, severity levels, a line format such as `file:line — issue — fix`. The parent reads this blind, so a report that fits one screen beats a transcript. State what to return when there is nothing to report.
5. **Boundaries.** What not to do, phrased as what to do instead where possible ("Report gaps that affect correctness; leave style to the linter."). Name scope limits: no edits outside the named files, no commits, no helper scripts left behind.
6. **Memory instructions**, only when `memory` is set: what to record and when to consult it.

Keep the body under about 150 lines. Use XML tags only when the body mixes instructions with examples or data (`<example>`, `<output_format>`). Prefer "think thoroughly" to a hand-written reasoning script. Add "Before you finish, check the result against ..." for models other than Opus 5, which over-verifies when told to.

## 5. Set the remaining fields

| Decision | Field | Guidance |
| :- | :- | :- |
| Model | `model` | `haiku` for search and formatting, `sonnet` for review and routine edits, `inherit` to match the session. Omit it and the subagent model order applies. |
| Permissions | `permissionMode` | Usually omit. `plan` for research that must stay read-only. Ignored in plugin agents, and ignored whenever the main conversation is in `bypassPermissions`, `acceptEdits`, or `auto`. |
| Runaway guard | `maxTurns` | Set for unattended workers. Output is marked partial at the limit and the subagent can be resumed. |
| Domain knowledge | `skills` | Preload skills it needs on every run instead of pasting their text into the body. |
| Cross-session learning | `memory` | `project` is the recommended default. Pair it with body instructions. |
| Lean start | `omitClaudeMd` | `true` for an agent that takes everything from the delegation prompt. |
| Parallel edits | `isolation: worktree` | Workers that edit files while the main session also edits. |
| Cost | `effort` | Lower for mechanical work. |
| Context budget | `autoCompactWindow` | Always set it in this repo: `100000` for haiku agents, `200000` for light focused agents, `300000` for agents that read a lot or run long. It can only lower the window the subagent inherits (the session's, 300k in the settings example), so a larger value does nothing; it has no effect on an agent run as the main session. Plain integer only. |
| UI | `color` | Cosmetic. |

Field names are camelCase and must match the table exactly. An unknown field is ignored without any error. `allowedTools` and `allowed-tools` are not agent fields (the second is a skill field): an agent using them inherits every tool.

## 6. Place the file

| Location | Scope | Notes |
| :- | :- | :- |
| `.claude/agents/<name>.md` | This project | Check it in. Nested `.claude/agents/` dirs are walked up to the repo root; subfolders are allowed and don't change the name. |
| `~/.claude/agents/<name>.md` | All your projects | Personal. |
| `plugins/<plugin>/agents/<name>.md` | Wherever the plugin is enabled | Registers as `<plugin>:<name>`; a subfolder joins the name (`agents/review/x.md` becomes `plugin:review:x`). `permissionMode`, `hooks`, `mcpServers`, and `initialPrompt` are ignored; ship hooks in `hooks/hooks.json` and servers in `.mcp.json`. |

On a name clash the higher scope wins: managed settings, `--agents` JSON, project, user, plugin. A `name` can't contain `:` or start with `-`, and must be unique across the tree. Don't prefix a plugin agent's name with the plugin name; the namespace already does that.

## 7. Test it

1. `claude plugin validate .claude/agents` (or the plugin directory) catches frontmatter that doesn't parse. It doesn't flag a missing `name`.
2. Edits to an existing `agents/` directory are picked up within seconds. A brand-new `agents/` directory needs a restart.
3. Invoke it directly: `@agent-<name> <task>` guarantees the run; "Use the <name> subagent to ..." usually does. For a plugin agent, `@agent-<plugin>:<name>`.
4. Run a whole session as it with `claude --agent <name>` to exercise the body at length.
5. Read the transcript: `/tasks` within 30 seconds of it finishing, or `~/.claude/projects/<project>/<session>/subagents/agent-*.jsonl`.
6. For a plugin agent, `claude plugin eval` measures how reliably Claude routes to it. It costs money; run it when the user asks.
7. `claude --debug`, then search `~/.claude/debug/<session>.txt` for `does not recognize or apply` to catch misspelled fields.

## 8. Iterate

Compare the transcript against the output contract. If the parent had to re-read files the subagent already read, the report is too thin. If it wandered, tighten the procedure or add `maxTurns`. If Claude never delegates to it, the description doesn't name the trigger. If Claude delegates when it shouldn't, drop "proactively" or narrow the trigger.

## Quality checklist

- `name` is lowercase-hyphen, unique, no `:`. `description` says what and when, third person, three sentences or fewer.
- `tools` is an allowlist you can justify line by line. `Agent` is absent unless nesting is intended.
- Body has role, inputs, procedure, output contract, boundaries, in that order, under about 150 lines.
- The output contract says what to return when there is nothing to report.
- Nothing in the body asks the user a question or depends on conversation history.
- Any main-conversation rule the subagent needs is restated in the body or planned for the delegation prompt.
- Every field is in the official table, camelCase, and valid for the placement.
- Invoked once explicitly; transcript checked against the contract.

## Anti-patterns

- **The do-everything agent.** A 300-line catalogue of "capabilities" with no procedure or output shape. Claude can't route to it and the parent gets a transcript instead of a result. Split by job.
- **Duplicating the skill mechanism.** Pasting a skill's text into the body, or a subagent whose only purpose is to hold reusable instructions. Use `skills:` to preload, or write a skill.
- **Unbounded tools.** No `tools` on a reviewer, or `Agent` left in so it spawns its own fleet.
- **Vague description.** "Helps with backend tasks." Nothing to match against, so it never fires or always fires.
- **No output format.** The parent has to read the whole transcript to find the answer.
- **Undocumented fields.** `allowedTools`, `effort: ultra`, `permissionMode` on a plugin agent. All ignored silently.
- **Bribes and threats.** "I'll tip you $200", "prove me wrong". Not in any official guidance; current models respond to plain, specific instructions.
