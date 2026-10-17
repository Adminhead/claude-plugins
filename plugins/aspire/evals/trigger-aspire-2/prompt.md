---
name: trigger-aspire-2
description: "Moving Compose orchestration to Aspire loads aspire."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

We have a docker-compose.yml with an ASP.NET Core API, a Python FastAPI service, Redis and RabbitMQ. I'd like to move local dev orchestration to Aspire with a C# AppHost and get integration tests that spin the whole thing up. Where do I start?
