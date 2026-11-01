---
name: not-kotlin-go
description: Hard negative. A Go goroutine leak should not load the kotlin skill.
tags: [trigger]
model: claude-sonnet-5-5
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our Go worker in pool.go starts a goroutine per job that blocks forever on an unbuffered channel send when the caller times out, and memory keeps growing. What is the usual way to stop these goroutines from leaking?
