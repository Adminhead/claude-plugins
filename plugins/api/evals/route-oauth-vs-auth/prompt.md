---
name: route-oauth-vs-auth
description: Building an authorization server goes to api:oauth-provider, not efficient:auth.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

Third-party apps want to access our users' data. We need to build our own OAuth authorization server so users can grant those apps scoped access. Design the grants, PKCE, token lifetimes, refresh tokens, scopes, and consent screen.
