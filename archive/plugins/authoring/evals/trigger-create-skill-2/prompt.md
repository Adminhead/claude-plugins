---
name: trigger-create-skill-2
description: A realistic request that should load authoring:create-skill.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I wrote a skill at .claude/skills/db-migrate/SKILL.md but Claude never picks it up when I ask it to write a migration. Its frontmatter has `description: Database migrations`. Why isn't it triggering and what should I change?
