---
name: tilt-not-helm-chart
description: A Helm values or Dockerfile edit does not fire tilt, even in a repo that has a Tiltfile.
tags: [routing, negative]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

This repo has a Tiltfile for local dev, but I am not touching it. In the Helm chart `charts/web`, give `values.yaml` a `resources` block (100m CPU and 128Mi memory requests, a memory limit only) that `templates/deployment.yaml` renders, and add a `values.schema.json` rule so a wrong type is rejected at install time. Also change `docker/web.Dockerfile` to run as a non-root user.
