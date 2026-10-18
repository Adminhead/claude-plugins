---
name: mise-agent-shell
description: A tool missing in a non-interactive shell under mise fires mise, with no config file named.
tags: [routing]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

I use mise to manage node, and `node -v` works in my terminal. But when a script or an automation tool runs commands through a non-interactive bash, it says `node: command not found`, and an env var I set for the project is also empty there. What is going on and what should the script call instead?
