---
name: dotnet-diagnostics-k8s-memory
description: A memory-growth report for a .NET 8 service in Kubernetes routes to dotnet-diagnostics.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our ASP.NET Core API on .NET 8 runs in Kubernetes on Linux, and its memory climbs steadily until the pod gets OOM-killed every few hours. There's no SDK in the image and I can't easily exec in. What should I capture, with which tool, and how do I get it out of the pod?
