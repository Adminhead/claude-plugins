---
name: trigger-interop-libraryimport
description: "Converting DllImport to LibraryImport for Native AOT should load dotnet-native-interop."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

We're turning on PublishAot for our CLI and the build flags SYSLIB1054 on every [DllImport] in NativeMethods.cs (about 30 of them, some with CharSet.Auto and SetLastError = true). Convert them to LibraryImport correctly.
