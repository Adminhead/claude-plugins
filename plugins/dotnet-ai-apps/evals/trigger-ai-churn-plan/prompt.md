---
name: trigger-ai-churn-plan
description: "Choosing ML.NET over an LLM for tabular prediction should load dotnet-ai-apps."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Product wants GPT to predict customer churn from our customers table (tenure, plan, monthly spend, support tickets) inside our .NET 8 backend. Don't write code yet, just recommend the approach.
