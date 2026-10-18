---
name: mise-not-devenv
description: Pinning node or python in devenv.nix does not fire mise.
tags: [routing, negative]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our shell comes from `devenv.nix`. Pin Node to 22 with `languages.javascript` and Python to 3.12 with `languages.python`, add a Postgres 16 service with a `dev` database, and add a `processes.api` entry that runs `uvicorn app:app`. Keep the existing packages as they are.
