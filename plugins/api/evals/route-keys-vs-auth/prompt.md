---
name: route-keys-vs-auth
description: Issuing and storing customer API keys goes to api:keys, not auth:auth, if installed.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

We are building API-key issuance for our public API so customers can call it from their servers. Design the key format, how we store and look up keys, scopes, and how customers rotate and revoke them.
