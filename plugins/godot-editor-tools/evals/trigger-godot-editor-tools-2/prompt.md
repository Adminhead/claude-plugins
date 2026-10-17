---
name: trigger-godot-editor-tools-2
description: An in-editor server addon question that should load godot-editor-tools.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

My Godot addon's plugin.gd starts a TCPServer in _enter_tree and polls it in _process to accept JSON commands that add nodes to the edited scene. Requests feel slow when I'm in the terminal, nodes I add disappear when I save, and Ctrl+Z doesn't undo them. How do I fix all three?
