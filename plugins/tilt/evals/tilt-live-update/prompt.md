---
name: tilt-live-update
description: A live_update question about a Tiltfile fires tilt.
tags: [routing]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our Tiltfile has `docker_build('api', './api')` and `k8s_yaml('k8s/api.yaml')`, and every edit to a Go file rebuilds the whole image, which takes about two minutes. I want edits under `api/` to sync into the running container and restart the server without a rebuild, but changes to `go.mod` should still rebuild. Show me the Tiltfile change.
