---
name: tilt-ci-agent
description: Verifying a Tilt setup without the TUI fires tilt, with no Tiltfile named.
tags: [routing]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

I need to check in a script that our local dev stack still comes up. We start it with `tilt up` today, but that opens an interactive terminal UI. How do I run it headless so the script gets a pass or fail, and how do I pull the logs for one failing service afterwards?
