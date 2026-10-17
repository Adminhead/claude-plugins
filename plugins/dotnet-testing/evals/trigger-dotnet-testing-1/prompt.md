---
name: trigger-dotnet-testing-1
description: Running one xUnit v3 class on MTP should load dotnet-testing.
tags: [trigger]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Our solution is on the .NET 10 SDK and global.json has `"test": { "runner": "Microsoft.Testing.Platform" }`. The test project tests/Billing.Tests references xunit.v3. What is the exact command to run only the InvoiceCalculatorTests class and write a TRX file? Do not run anything.
