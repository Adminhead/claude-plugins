---
name: value-readme-claims-invoked
description: Value case. Same repo and graders as value-readme-claims, but the prompt types the skill's slash command so the with arm loads it. Run with --ablation none; the bare arm cannot run the command.
tags: [value]
runs: 3
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

/fact-check:fact-check these four lines from README.md, against the repo, before I tag 1.4.0:

- Python 3.9 or newer.
- Exits with status 3 when there is nothing to do.
- Scans at most 10,000 files per run.
- A typical 20,000-file scan finishes in under a second.
