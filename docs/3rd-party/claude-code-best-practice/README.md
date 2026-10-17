# claude-code-best-practice

Source: https://github.com/shanraisshan/claude-code-best-practice · License: MIT (Shayan Rais, 2025-2026) · Last commit: 2026-10-17 06:45 UTC (`chore(docs): update claude-subagents badge to v2.1.302`) · Catalog: [catalog.md](catalog.md)

## Purpose

A documentation-first course on Claude Code. It is not a plugin or a marketplace entry. It collects "best practice" guides for each Claude Code primitive (subagents, commands, skills, MCP, memory, settings), implementation demos of those primitives, curated tips attributed to Claude team members and the community, and a few orchestration examples (a command that calls an agent that calls a skill). Each guide carries a "Last Updated" and "Claude Code vX" badge, so the content is version-stamped.

## Layout

| Path | What it holds |
|---|---|
| `best-practice/` | Reference guides, one per topic (`claude-*.md`) |
| `implementation/` | Working demos of each primitive, linked from the guides |
| `reports/` | Deeper write-ups (agents vs commands vs skills, global vs project settings, usage limits) |
| `tips/` | Dated transcripts of tip lists (Boris Cherny, Thariq) |
| `changelog/` | Per-guide changelogs tracking Claude Code version drift |
| `orchestration-workflow/` | The `/weather-orchestrator` command -> agent -> skill example |
| `development-workflows/` | RPI and cross-model workflows, each with its own `.claude/` |
| `agent-teams/` | Agent-teams prompt and a time-card example |
| `presentation/`, `videos/`, `tutorial/`, `assets/` | Slide decks, video notes, day-0 setup guides, images |
| `.claude/` | The repo's own agents, commands, skills, hooks, rules, settings |
| `.codex/` | A parallel hooks setup for Codex (`hooks.json` plus scripts) |

## Counts

From `catalog.md` (generated): 9 skills, 20 agents, 14 commands/prompts, 1 `hooks.json` (the Codex one, see below). Also 122 markdown files and about 454 files in total, and 2,456 commits in git history. The Claude hook config is `hooks-config.json`, not `hooks.json`, so the catalog's "1" hides the Claude-side hook setup.

## Guide topics

| Topic | Path(s) | Note |
|---|---|---|
| Hooks | `.claude/hooks/HOOKS-README.md`, `.claude/hooks/config/hooks-config.json`, `.claude/hooks/scripts/hooks.py`, `.codex/hooks.json` | Event table (30 events, marked official) and disable flags; the sounds are per-event assets |
| Subagents / agents | `best-practice/claude-subagents.md`, `implementation/claude-subagents-implementation.md`, `reports/claude-agent-command-skill.md` | 16 frontmatter fields (5 marked official); agent-vs-command-vs-skill decision table |
| Skills | `best-practice/claude-skills.md`, `implementation/claude-skills-implementation.md`, `changelog/best-practice/claude-skills/changelog.md` | 20 frontmatter fields; the 1,344-line changelog is the drift record |
| Commands | `best-practice/claude-commands.md`, `implementation/claude-commands-implementation.md` | 20 frontmatter fields (94 marked official) |
| Plugins | `best-practice/claude-power-ups.md`, `reports/claude-global-vs-project-settings.md` | No dedicated plugin-authoring guide; "power-ups" is the closest |
| MCP | `best-practice/claude-mcp.md` | Daily-use servers and config; short (132 lines) |
| Memory / CLAUDE.md | `best-practice/claude-memory.md`, `.claude/rules/markdown-docs.md`, `reports/claude-agent-memory.md` | Mostly links out (Humanlayer); monorepo loading section |
| Settings | `best-practice/claude-settings.md` (1,451 lines), `reports/claude-global-vs-project-settings.md`, `.claude/settings.json` | Largest guide; hierarchy, permissions, spinner overrides |
| CLI startup flags | `best-practice/claude-cli-startup-flags.md` | Flag reference for `claude` invocations |
| Agent teams | `implementation/claude-agent-teams-implementation.md`, `agent-teams/agent-teams-prompt.md` | Experimental; teammate and task hooks are listed |
| Scheduled tasks / loops | `implementation/claude-scheduled-tasks-implementation.md` | `/loop` demo |
| Goals | `implementation/claude-goal-implementation.md` | Goal-setting patterns from community tips |
| Tips | `README.md` (section "Tips and Tricks (83)"), `tips/*.md` | Sourced tips, grouped by Prompting, Planning, Context, CLAUDE.md, Agents, Commands |
| Workflows | `development-workflows/rpi/`, `development-workflows/cross-model-workflow/` | Multi-agent research-plan-implement flows |

## Install / use

This is a reference repo, not a plugin. Nothing installs from it. Use it three ways:

- Read the guides directly: start at `best-practice/` and follow the back-links.
- Run the demo: `/weather-orchestrator` (`.claude/commands/weather-orchestrator.md`) walks command -> agent -> skill; `/time-command` is the smallest example.
- Copy patterns: the `.claude/` tree is a working example of agents, commands and skills in one project.

The repo's own `CLAUDE.md`-style rules live in `.claude/rules/` (`markdown-docs.md`, `presentation.md`).

## Highlights

- `.codex/hooks.json` - the only `hooks.json` in the repo; wires SessionStart, PreToolUse, PermissionRequest, PostToolUse, Stop, UserPromptSubmit, PreCompact and more to `python3 .codex/hooks/scripts/hooks.py`, with 10s timeouts on the entries shown.
- `.claude/hooks/config/hooks-config.json` - Claude-side hook toggles (one `disable*Hook` flag per event, `disableLogging: true`).
- `.claude/hooks/HOOKS-README.md` - the 30-event table with each event's input fields and async/timeout options.
- `best-practice/claude-subagents.md` - 16 agent frontmatter fields, five marked official.
- `best-practice/claude-skills.md` - 20 skill frontmatter fields, 25 marked official; includes `when_to_use` and the 1,536-char listing cap.
- `best-practice/claude-commands.md` - command frontmatter reference (20 fields) with official markers.
- `best-practice/claude-settings.md` - the largest guide (1,451 lines), covering the settings hierarchy and permission rules.
- `reports/claude-agent-command-skill.md` - decision table for when to use an agent vs a command vs a skill.
- `.claude/agents/workflows/best-practice/workflow-claude-commands-agent.md` - an Opus drift-detector agent that diffs docs against the changelog; read-only by design.
- `.claude/agents/development-workflows-research-agent.md` - Sonnet research agent that counts agents/skills/commands across repos.
- `.claude/commands/weather-orchestrator.md` - Haiku command with an explicit non-negotiable execution contract, delegating to agent and skill.
- `.claude/skills/agent-browser/` - a browser-automation skill for agents (a SKILL.md plus its CLI guidance).

## Quality notes

- Accuracy vs official docs: spot-checked the skills frontmatter against code.claude.com/docs/en/skills. The official table lists 20 fields, which matches the guide's count of 20. The field sets were not fully diffed. The official list includes `background`, `metadata`, `license` and `compatibility`, which the guide may not cover. Verify before relying on the guide's field list.
- Official markers ("(94)", "(25)", "(5)") are the guide's own tags. They show what the guide claims is official, not a verified check.
- Dates: the skills guide was updated 2026-10-17 (Claude Code v2.1.302); the MCP guide's badge reads 2026-03-02. Check the badge on each guide, since they differ. Treat the dated badges as the freshness signal.
- Maintenance: very active (2,456 commits). Many files are generated or auto-updated by the repo's own agents, so expect churn and drift in changelogs.
- Mixed scope: the repo mixes Claude Code guidance with Codex hooks, presentations and marketing (sponsors, subscribe sections). Filter for the `best-practice/` and `implementation/` trees when citing.
- Some tips are attributed to people (Boris Cherny, Thariq) and are dated transcripts, not official statements.

## Relevance to adminhead

- Hooks authoring: use `.claude/hooks/HOOKS-README.md` as the event-table reference, but verify each event's input fields against the official hooks docs, since it is a snapshot. Note `.codex/hooks.json` is Codex-oriented, not a Claude plugin hooks file.
- Skill authoring: `best-practice/claude-skills.md` is the best condensed frontmatter list here. Cross-check it with the official skills page before publishing guidance.
- Agent vs command vs skill: `reports/claude-agent-command-skill.md` is the clearest decision aid for when adminhead should write which primitive.
- Settings and permissions: `best-practice/claude-settings.md` covers the hierarchy and permission rules in depth. Use it as a checklist, not a source of truth.
- Example command -> agent -> skill chain: `orchestration-workflow/orchestration-workflow.md` plus `.claude/commands/weather-orchestrator.md` is a concrete template for an adminhead workflow.
