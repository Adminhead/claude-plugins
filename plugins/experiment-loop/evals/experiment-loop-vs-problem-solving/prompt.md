---
name: experiment-loop-vs-problem-solving
description: An unattended measured optimization loop routes to experiment-loop.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our `make bench` reports the p50 time of the parser in ns/op. I want to get it under 400 ns/op. Set up a loop that tries one optimization idea at a time on a dedicated branch, runs `make bench` after each, commits the ones that improve the number and reverts the ones that do not, and keeps a results log. Run up to 15 experiments without asking me between them.
