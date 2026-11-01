---
name: not-jetpack-compose-docker
description: Hard negative. A docker compose question should not load the jetpack-compose skill.
tags: [trigger]
model: claude-sonnet-5-5
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

When I run `docker compose up`, the api service exits with "service \"api\" depends on undefined service \"db\"". My docker-compose.yml has an api and a worker service. What do I need to change?
