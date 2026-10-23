---
name: v0-rewrite-drift
description: "A request to refresh a stale doc as if written fresh routes to v0-rewrite."
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

The setup guide below still describes the old flow and the notes around it are stale. Bring it up to date as if it were written fresh today.

```
# Setup

1. Install the CLI with `npm install -g acme-cli`.
2. Run `acme login` and paste the token from the old dashboard.
3. Run `acme init` to create `config.json`.

Note (2024): the token step is skipped on the new dashboard.
Note: `acme init` used to create `config.json`; it now writes `acme.yml`.
```
