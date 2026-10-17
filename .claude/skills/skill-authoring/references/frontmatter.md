# SKILL.md frontmatter reference

Condensed on 2026-10-17 from:

- https://code.claude.com/docs/en/skills (Claude Code "Extend Claude with skills", frontmatter reference, string substitutions, dynamic context, subagent skills, troubleshooting)
- https://agentskills.io/specification (Agent Skills open spec)
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices (claude.ai and API validation rules)

## Contents

- Parsing rules
- Agent Skills spec fields (portable)
- Claude Code extension fields
- Invocation control matrix
- String substitutions
- Dynamic context injection
- Name and description limits
- Where skills load and how names resolve
- Validation and tooling

## Parsing rules

- Frontmatter is YAML between `---` markers. Claude Code reads it only when the opening `---` is the first line of the file; otherwise the whole file is treated as body.
- If the YAML does not parse, Claude Code still loads the skill with no fields set: `/name` works but Claude cannot match the description. `claude --debug` shows the parse error.
- Field names are lowercase words joined by hyphens, except `when_to_use`. An unrecognized field is ignored without an error in Claude Code.
- Boolean fields accept `true`/`false` and also `yes`/`no`, `on`/`off`, `1`/`0` in any case (v2.1.218+).
- In Claude Code every field is optional; only `description` is recommended. The Agent Skills spec requires `name` and `description`.

## Agent Skills spec fields (portable)

These six fields are the only ones accepted by claude.ai skill uploads, the Skills API and `package_skill.py`. Any other key there fails with `Unexpected key(s) in SKILL.md frontmatter`.

| Field | Required (spec) | Constraints |
| :- | :- | :- |
| `name` | Yes | 1-64 chars; lowercase `a-z`, `0-9`, hyphens; no leading, trailing or consecutive hyphen; must match the parent directory name. claude.ai/API additionally reject XML tags and the reserved words `anthropic` and `claude`. |
| `description` | Yes | 1-1,024 chars, non-empty, no XML tags. What the skill does and when to use it, with the keywords a user would say. |
| `license` | No | License name or the name of a bundled license file. Claude Code accepts it but does not act on it. |
| `compatibility` | No | 1-500 chars. Environment requirements (product, system packages, network). Most skills do not need it. Claude Code accepts it but does not act on it. |
| `metadata` | No | Map of string keys to string values for your own tooling. Claude Code drops a value that is not a map. Do not reuse frontmatter field names such as `paths` as keys. |
| `allowed-tools` | No | Spec: space-separated string of pre-approved tools, marked experimental. Claude Code: see below. |

## Claude Code extension fields

Accepted at every Claude Code location (enterprise, personal, project, nested, `--add-dir`, plugin). A `.claude/commands/*.md` file accepts the same set except `name` and `paths`.

| Field | Default | What it does |
| :- | :- | :- |
| `name` | directory name | Command shown in the `/` menu. In a plugin it replaces the last segment: `name: fancy` in `my-plugin/skills/review/` gives `/my-plugin:fancy`. |
| `description` | first non-empty body line | What and when. Combined with `when_to_use`, truncated at 1,536 chars in the skill listing (configurable with `skillListingMaxDescChars`). Put the key use case first. |
| `when_to_use` | none | Extra trigger context (phrases, example requests), appended to `description` in the listing and counted in the 1,536 cap. |
| `argument-hint` | none | Autocomplete hint such as `[issue-number]` or `[filename] [format]`. |
| `arguments` | none | Named positional arguments for `$name` substitution. Space-separated string or YAML list; names map to positions in order. |
| `disable-model-invocation` | `false` | Claude cannot invoke the skill; only `/name` runs it. The description is removed from Claude's context. Also stops preloading into subagents and running as a scheduled-task prompt. If Claude tries anyway, Claude Code blocks the call and tells it not to reproduce the steps another way. |
| `user-invocable` | `true` | `false` hides the skill from the `/` menu and `/name` does nothing; only Claude invokes it. For background knowledge that is not an action. |
| `allowed-tools` | none | Tools Claude may use without a permission prompt during the turn that invokes the skill. Clears on the next user message; invoking again re-applies it. Does not restrict other tools. Space- or comma-separated string, or YAML list, in permission-rule syntax such as `Bash(git add *)`. Not gated by workspace trust, so it applies in a `-p` run in an untrusted folder. Ignored when managed settings set `allowManagedPermissionRulesOnly` (v2.1.282+). |
| `disallowed-tools` | none | Tools removed from Claude's pool while the skill is active; clears on the next message. Cannot remove `EndConversation` while other tools remain. Same syntax as `allowed-tools`. |
| `model` | session model | Model for the rest of the turn; same values as `/model`, or `inherit`. A value excluded by `availableModels`, or unsupported in auto mode, is skipped. With `context: fork` it sets the subagent's model instead. |
| `effort` | session effort | `low`, `medium`, `high`, `xhigh` or `max`; levels depend on the model. |
| `context` | inline | `fork` runs the body as the prompt of a new subagent. The subagent does not see the conversation, so the body must stand alone. Not a fork of the conversation. |
| `agent` | `general-purpose` | Subagent type for `context: fork`: `Explore`, `Plan`, `general-purpose`, or a custom agent from `.claude/agents/`. Explore and Plan start without CLAUDE.md and git status. |
| `background` | `true` | With `context: fork`, `false` waits for the subagent's result in the invoking turn. Background forks get the narrower background-subagent tool set and their edits sit outside `/rewind` checkpoints. Always waits in `-p`, the Agent SDK, scheduled tasks, or when the same skill is already running. v2.1.218+. |
| `hooks` | none | Hooks registered when the skill is invoked and kept for the rest of the session. Format and the `once` option are in the hooks docs. Use for rules that must hold every time. |
| `paths` | none | Glob patterns (comma-separated string or YAML list). Claude auto-loads the skill only when working with matching files. Same format as path-specific rules in memory docs. |
| `shell` | `bash` | Shell for dynamic-context commands: `bash` or `powershell`. `powershell` needs the PowerShell tool enabled. |
| `license`, `compatibility`, `metadata` | none | Accepted for spec compatibility; see above. |

## Invocation control matrix

| Frontmatter | User can invoke | Claude can invoke | Description in context |
| :- | :- | :- | :- |
| (default) | Yes | Yes | Always; body loads on invocation |
| `disable-model-invocation: true` | Yes | No | No; body loads on invocation |
| `user-invocable: false` | No | Yes | Always; body loads on invocation |

`skillOverrides` in settings (`"on"`, `"name-only"`, `"user-invocable-only"`, `"off"`) changes visibility without editing the file. It does not apply to plugin skills. Permission rules `Skill(name)` and `Skill(name *)` allow or deny Claude's invocations; denying `Skill` blocks every skill.

Typing `/name` at the start of a message runs the skill. `/name` after plain text does not run it; it only grants Claude permission to run it in that message.

## String substitutions

Substituted in the body before Claude sees it. `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` are also substituted inside `Bash(...)` rules in `allowed-tools`, which is how a bundled script runs without a prompt.

| Variable | Meaning |
| :- | :- |
| `$ARGUMENTS` | Everything after the skill name. If no placeholder receives arguments, Claude Code appends `ARGUMENTS: <value>` to the body. |
| `$ARGUMENTS[N]`, `$N` | Argument N, 0-based, shell-style quoting (`/s "hello world" b` gives `$0` = `hello world`). An unfilled indexed placeholder stays as literal text. |
| `$name` | Named argument declared in `arguments`. Unfilled expands to empty string. |
| `${CLAUDE_SESSION_ID}` | Current session ID. |
| `${CLAUDE_EFFORT}` | Current effort level. |
| `${CLAUDE_SKILL_DIR}` | Directory holding this SKILL.md (the skill's subdirectory in a plugin). Use for bundled scripts and files. |
| `${CLAUDE_PROJECT_DIR}` | Project root, as hooks receive it. |
| `${CLAUDE_PLUGIN_ROOT}` | Plugin install dir. Plugin skills only. |
| `${CLAUDE_PLUGIN_DATA}` | Plugin persistent data dir that survives updates. Plugin skills only. |

Escape a literal `$` before a digit, `ARGUMENTS` or a declared name with one backslash: `\$1.00`. A backslash does not stop a `${CLAUDE_*}` substitution. Argument values are inserted literally and not re-expanded.

Example that runs a bundled script without a prompt:

```yaml
---
name: render-chart
description: Render a chart from a CSV file
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/render.sh *)
---

Run `${CLAUDE_SKILL_DIR}/scripts/render.sh <csv-file>` to render the chart.
```

## Dynamic context injection

- Inline form: `` !`command` `` with `!` at the start of a line or after whitespace. `KEY=!`cmd`` is left as text. The command runs before Claude sees the body and its output replaces the placeholder.
- Multi-line form: a fenced block opened with ```` ```! ```` containing one command per line.
- Substitution runs once; output is not re-scanned for placeholders.
- Commands run through the Bash tool (or PowerShell per `shell`), in the session shell's current working directory, with the Bash tool's 2-minute timeout and output ceiling, stderr merged into stdout. Use `${CLAUDE_SKILL_DIR}` or `${CLAUDE_PROJECT_DIR}` for stable paths.
- Any non-zero exit aborts the whole invocation (`Shell command failed for pattern "..."`), except exit 1 from the search and comparison commands the Bash tool treats as normal (grep, diff and the like). Append `|| true` to anything else that may exit non-zero.
- Permission: injected commands never prompt. A deny rule aborts the invocation; outside auto mode so does any rule that would ask. Pre-approve with `allowed-tools`. In auto mode an unapproved command is left for Claude to run itself.
- A raw control character in any `!` command disables all of them (`No shell command in <name> was run`).
- Disabled everywhere by `"disableSkillShellExecution": true` in settings, which replaces each command with `[shell command execution disabled by policy]`. Never runs for skills synced from claude.ai (v2.1.228+).
- Claude Code-only: these commands, `@` file references and `${CLAUDE_*}` placeholders do not function in claude.ai chat or through the API.

## Name and description limits

- Name: see the spec row above. Claude Code also refuses a name containing a zero-width space, control, private-use or bidi character, `<`, `>`, or any blank other than a single space; such a skill does not load (`claude --debug`, search `[names]`).
- Reserved: `synced` (any case) and `anthropic-skills` or anything starting `anthropic-skills:` do not load outside a plugin. Non-interactive sessions free `help` and `feedback`; every other terminal built-in name stays reserved.
- Description: spec limit 1,024 chars. Listing shows `description` + `when_to_use` truncated at 1,536 chars. The whole skill listing has a budget of 1% of the model's context window (`skillListingBudgetFraction`, or `SLASH_COMMAND_TOOL_CHAR_BUDGET` for a fixed count); when it overflows, descriptions of the least-invoked skills are dropped first. `/context` shows the listing size; `/doctor` estimates its cost.
- Body: keep under 500 lines and about 5,000 tokens (spec recommendation). After compaction, Claude Code re-attaches each invoked skill's first 5,000 tokens within a shared 25,000-token budget, most recent first.
- Rendered body persists in the conversation and is not re-read; re-invoking with identical rendered content adds a short "already loaded" note instead of a second copy.

## Where skills load and how names resolve

| Location | Path | Command |
| :- | :- | :- |
| Enterprise | `.claude/skills/<name>/SKILL.md` in the managed settings dir | `/name` |
| Personal | `~/.claude/skills/<name>/SKILL.md` | `/name` |
| Project | `.claude/skills/<name>/SKILL.md`, found in the start dir and every parent up to the repo root | `/name` |
| Nested | `<subdir>/.claude/skills/<name>/SKILL.md`; loads once Claude works on files there | `/name`, or `/<subdir>:name` on a clash |
| Additional dir | `.claude/skills/` in an `--add-dir` directory | `/name` |
| Plugin | `<plugin>/skills/<name>/SKILL.md`, or a single `SKILL.md` at the plugin root | `/plugin:name` |
| claude.ai sync | downloaded to `~/.claude/skills/synced/` | `/name`, or `/anthropic-skills:name` on a clash |
| Legacy command | `.claude/commands/<name>.md` (subdirs become `:` segments) | `/name` |

Clash resolution: enterprise over personal over project; a local skill replaces a bundled or built-in command of the same name but not its aliases; a skill beats a `.claude/commands/` file; plugin skills never clash. Skill directories are watched live (except in bare mode); a new top-level skills dir needs `/reload-skills`. Cowork and cloud sessions do not read `~/.claude/skills/`; they load account skills and, for cloud, the repo's committed `.claude/skills/`.

## Validation and tooling

- `claude plugin validate [--strict] [--json] <path>`: validates a plugin or marketplace manifest, or the skills, agents and commands in a directory, for example `claude plugin validate .claude/skills` or `~/.claude/skills` (v2.1.233+). `<path>` must be a components directory (one that is, or contains, `skills/`); a single skill directory is treated as a plugin and fails for want of a manifest. Checked on 2026-10-17 with v2.1.302: it reports frontmatter YAML that fails to parse, and `--strict` passed a skill with an uppercase name, an unknown field, an invalid `context` value and a broken relative link, so it is not a content check.
- `scripts/validate_skill.py <skill-dir> [--json]` in this skill: stdlib-only; checks name shape and directory match, known Claude Code fields, booleans and enums, description and listing limits, `compatibility` length, and that local Markdown links resolve inside the skill root. It does not see paths written only in backticks; `ls` those by hand.
- `claude plugin eval <target>`: runs `evals/**/case.yaml` cases against a plugin with a no-plugin baseline arm; a `tool_used: Skill` grader measures triggering. For plugin skills only; `skillOverrides` is the baseline switch for personal and project skills.
- `claude plugin init <name>`: scaffolds a plugin at `~/.claude/skills/<name>/` that loads as `<name>@skills-dir`.
- `/skill-doctor` (v2.1.252+): per-skill context cost and invocation count, with where to turn off unused ones. `/skills`: lists skills and writes `skillOverrides`. `/doctor prompt-audit`: flags outdated or conflicting instructions in CLAUDE.md and skills.
- `skills-ref validate ./my-skill` (https://github.com/agentskills/agentskills/tree/main/skills-ref): the spec's reference validator for the portable fields.
- There is no `claude skill` subcommand; skills are managed through the paths above and the `/skills` menu.
