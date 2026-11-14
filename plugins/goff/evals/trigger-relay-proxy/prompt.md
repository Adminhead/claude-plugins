---
name: trigger-relay-proxy
description: Configuring and deploying the GO Feature Flag relay proxy routes to goff without the prompt naming the skill.
tags: [routing]
max_turns: 5
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

our go-feature-flag relay proxy pod in k8s crashloops on startup since we switched its flags to a github retriever, and when it did run, anyone inside the cluster could call it without a key. fix the goff-proxy.yaml and give me the helm install command, please
