---
name: trigger-roslyn-analyzers-2
description: "Fixing a non-incremental source generator loads roslyn-analyzers."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I wrote a source generator that emits ToString overrides for classes marked [AutoToString]. It works, but builds in Rider got really sluggish and the generator seems to rerun on every keystroke. The pipeline does `context.SyntaxProvider.CreateSyntaxProvider((n, _) => n is ClassDeclarationSyntax, (c, _) => (ClassDeclarationSyntax)c.Node).Combine(context.CompilationProvider).Collect()` and then builds everything in one RegisterSourceOutput. How should I restructure it, and how do I write a test that proves it caches?
