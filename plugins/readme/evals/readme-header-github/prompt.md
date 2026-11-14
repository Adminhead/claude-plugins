---
name: readme-header-github
description: "On a repo with a GitHub remote the header uses a theme-aware picture element and a GitHub CI badge."
tags: [outcome, forge]
runs: 3
max_turns: 8
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

The top of README.md in this repo is just a title. Write me the header block to paste in: a centred logo (assets/logo-light.svg is for light backgrounds and assets/logo-dark.svg for dark ones, so it has to follow the viewer's theme), the project name, a one-line description, and a badge for the CI workflow. Reply with just the block, don't edit any files.
