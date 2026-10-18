---
name: mise-tool-pin
description: Migrating .tool-versions to mise.toml fires mise.
tags: [routing]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our repo has a `.tool-versions` with `nodejs 22.11.0`, `python 3.12.7` and `kubectl 1.31.2`, and new hires keep ending up with different versions. We already use mise locally. Move this to a `mise.toml` with the same pins, add a `test` task that runs `npm test` after a `lint` task, and tell me how to keep personal overrides out of git.
