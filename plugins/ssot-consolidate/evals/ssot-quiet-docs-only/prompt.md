---
name: ssot-quiet-docs-only
description: "Near miss: rollback steps duplicated across docs only belong to docs-audit, not ssot-consolidate."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---
The rollback steps are written out in docs/runbook.md, docs/deploy.md and the onboarding guide, and the wording has drifted between them. Clean up the documentation so each fact has one owner doc and the others link to it.
