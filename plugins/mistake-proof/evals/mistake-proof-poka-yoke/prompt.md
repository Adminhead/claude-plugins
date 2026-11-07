---
name: mistake-proof-poka-yoke
description: "A poka-yoke phrasing for closing a recurring bug class should load mistake-proof."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

We keep deploying to prod by accident from the staging shell. Can you poka-yoke our deploy.sh? Here it is: #!/bin/sh
ENV=${1:-prod}
kubectl --context $ENV apply -f k8s/
