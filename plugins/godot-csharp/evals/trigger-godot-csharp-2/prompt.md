---
name: trigger-godot-csharp-2
description: A Godot C# runtime error that should load godot-csharp.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In our Godot game (C#), after the pause menu is closed and freed, pressing Escape again crashes with:

System.ObjectDisposedException: Cannot access a disposed object. Object name: 'PauseMenu'.
   at PauseMenu.OnGamePaused(Boolean paused) in scripts/ui/PauseMenu.cs:line 41

PauseMenu.cs does `GameState.Instance.PausedChanged += OnGamePaused;` in _Ready, and GameState is an autoload with `[Signal] public delegate void PausedChangedEventHandler(bool paused);`. What is wrong and how do I fix it?
