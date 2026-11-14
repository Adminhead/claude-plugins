---
name: value-readme-claims
description: Value case. Four README statements against a small repo, one true but odd-sounding, two wrong, one that no file can settle; baseline for a manual skill, no slash command.
tags: [value]
runs: 3
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

before I tag 1.4.0, can you check these four lines from our README against the repo? tell me which are right and which I need to fix.

- Python 3.9 or newer.
- Exits with status 3 when there is nothing to do.
- Scans at most 10,000 files per run.
- A typical 20,000-file scan finishes in under a second.
