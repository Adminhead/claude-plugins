---
name: worktree-routing
description: Managing worktrees routes to git:worktree.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

I have three git worktrees under ../wt and two are for merged branches. List them and clean up the finished ones, keeping the branches.
