---
name: dotnet-performance-not-dump
description: Capturing a memory dump from a live .NET pod is diagnostics work, not dotnet-performance.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

A .NET 10 API pod in our Kubernetes cluster keeps growing in memory until it is OOM-killed. How do I capture a dump and a dotnet-counters view from the running container before it dies?
