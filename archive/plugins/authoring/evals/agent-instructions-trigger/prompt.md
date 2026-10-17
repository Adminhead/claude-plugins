---
name: agent-instructions-trigger
description: Reorganizing CLAUDE.md into rules routes to authoring:manage-agent-instructions, not create-skill.
tags: [routing]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

My repo has a single 600-line root CLAUDE.md that mixes build commands, frontend conventions, and backend API rules. Reorganize it into a lean root CLAUDE.md plus nested CLAUDE.md files and path-scoped .claude/rules/ files, and make AGENTS.md coexist with it.
