---
name: gh-readme-write
description: "Writing a README for a new CLI repo routes to gh-readme:gh-readme."
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I just pushed my Rust CLI `logslice` to GitHub and the repo only has a one-line README.md. Can you write a proper README for it? It should explain what it does, how to install it with cargo, and show a couple of example commands.
