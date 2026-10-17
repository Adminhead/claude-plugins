---
name: route-rest-vs-web
description: Designing a public REST API goes to api:rest-design, not web:web-development, if installed.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

We are about to open our product to third-party developers with a public REST API. Before we write code, help us design the contract: resources and URLs, methods and status codes, pagination, one error format, and how we will keep it compatible as it evolves.
