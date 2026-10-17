---
name: trigger-godot-export-1
description: A Godot web build failing with SharedArrayBuffer should load godot-export.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I exported my Godot 4 game for the web and uploaded the folder to my own nginx server. The page loads but stays black and the browser console says "SharedArrayBuffer is not defined". Locally I just double-clicked index.html and that didn't work either. What do I need to change in the export preset or on the server?
