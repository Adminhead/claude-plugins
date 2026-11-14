---
name: value-earlier-answer-recheck-invoked
description: Value case. Same repo and graders as value-earlier-answer-recheck, but the prompt types the skill's slash command so the with arm loads it. Run with --ablation none; the bare arm cannot run the command.
tags: [value]
runs: 3
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

/fact-check:fact-check yesterday you told me this about our job runner, and I'm about to delete it. source? did you make that up?

> The `legacy_retry` helper in src/jobs/retry.py has been dead code since v2.3. Nothing imports it, so it's safe to delete it together with the `RETRY_LEGACY` setting.
