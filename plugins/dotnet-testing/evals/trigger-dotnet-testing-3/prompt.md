---
name: trigger-dotnet-testing-3
description: A dotnet test filter that silently matches nothing should load dotnet-testing.
tags: [trigger]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

`dotnet test -- --filter "ClassName=Orders.Tests.CheckoutTests"` exits 0 but reports zero tests. The project uses xunit.v3 with UseMicrosoftTestingPlatformRunner and TestingPlatformDotnetTestSupport set in Directory.Build.props, on the .NET 9 SDK. Why, and what should the command be?
