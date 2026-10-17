---
name: trigger-ai-summarize-endpoint
description: "Adding an LLM summarization feature to a .NET service should load dotnet-ai-apps."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our ASP.NET Core minimal API (net10.0) needs a POST /summaries endpoint that summarizes uploaded support tickets with Azure OpenAI. Set up the client properly so we can swap providers later.
