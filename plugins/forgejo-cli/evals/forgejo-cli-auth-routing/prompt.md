---
name: forgejo-cli-auth-routing
description: A fj login problem routes to forgejo-cli:forgejo-cli.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

fj keeps saying I'm not logged in when I run `fj issue search` in our repo on git.example.org. Get fj working against our instance.
