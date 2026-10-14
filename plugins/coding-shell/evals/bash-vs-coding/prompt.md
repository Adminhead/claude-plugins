---
name: bash-vs-coding
description: Writing a defensive shell script routes to bash.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Write a Bash script, `rotate-logs.sh`, that takes a directory and a number of days, compresses `*.log` files older than that, and deletes archives older than 30 days. It runs from cron on filenames that may contain spaces, and I want it to be safe if it fails halfway.
