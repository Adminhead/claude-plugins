---
name: forgejo-readme-routing
description: "Rewriting a README for a Codeberg-hosted repo routes to forgejo-readme:forgejo-readme."
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our project lives on Codeberg (https://codeberg.org/example/logslice, a Rust CLI) and the README is just a one-liner. Rewrite the README so the landing page looks good there: what it does, how to install it with cargo, and a couple of example commands.
