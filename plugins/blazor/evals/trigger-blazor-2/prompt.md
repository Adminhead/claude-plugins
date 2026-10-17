---
name: trigger-blazor-2
description: "Writing a Blazor component without naming Blazor loads blazor."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I need a reusable component `<TagPicker>` for our .NET 9 web app: it shows the selected tags as chips, has a text box that filters suggestions as you type (debounced, the suggestions come from an injected ITagService), and tells the parent when the selection changes. The parent should be able to pass the initial selection. Can you write TagPicker.razor and TagPicker.razor.cs?
