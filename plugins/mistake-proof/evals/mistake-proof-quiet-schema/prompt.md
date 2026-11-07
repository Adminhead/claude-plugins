---
name: mistake-proof-quiet-schema
description: "Near miss: schema constraints alone belong to a schema skill, not mistake-proof."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Write the CREATE TABLE statement for a users table with id, email (unique) and created_at in Postgres.
