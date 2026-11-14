---
name: value-earlier-answer-recheck
description: Value case. The user doubts an earlier answer whose recommendation rests on a false claim the repo contradicts; baseline for a manual skill, no slash command.
tags: [value]
runs: 3
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

yesterday you told me this about our job runner:

> The `legacy_retry` helper in src/jobs/retry.py has been dead code since v2.3. Nothing imports it, so it's safe to delete it together with the `RETRY_LEGACY` setting.

source? did you make that up? I'm about to delete it.
