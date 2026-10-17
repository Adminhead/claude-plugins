---
name: aspire-vs-docker
description: "Dockerfile hardening for an ASP.NET Core API does not load aspire (docker owns it)."
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our Dockerfile for the ASP.NET Core API runs as root and the image is 900 MB. Can you rewrite it as a multi-stage build on the chiseled runtime image with a non-root user?
