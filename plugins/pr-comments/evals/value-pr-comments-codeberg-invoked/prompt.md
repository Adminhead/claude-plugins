---
name: value-pr-comments-codeberg-invoked
description: Value case. Manual-only skill, so the prompt types the slash command and run with --ablation none; the bare arm cannot run it. A codeberg.org remote with the review comments pasted inline (no network). Run with --scaffold --allow-tools Bash.
tags: [value]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill, Bash]
---

/pr-comments:pr-comments

I copied these review comments from PR 7 on the web page, so triage them from this text. Also tell me which command you would use to fetch the comments yourself and which one would post a reply, but run neither.

@alice on src/stats.py line 2: total raises an error on an empty list. Please guard it.

@bob on src/stats.py line 6: average divides by the length of items, so an empty list raises ZeroDivisionError. Please handle it.

@carol on the whole PR: this module feels fragile, please make it better.
