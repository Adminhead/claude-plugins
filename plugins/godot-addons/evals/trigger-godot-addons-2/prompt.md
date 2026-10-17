---
name: trigger-godot-addons-2
description: A Beehave behavior tree bug that should load godot-addons.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Enemies in my Godot game use Beehave (addons/beehave). The ChaseAction leaf extends ActionLeaf and keeps `var elapsed := 0.0` as a member; when a SelectorReactiveComposite switches to the flee branch and back, the chase resumes with the old elapsed time and the enemy stops early. How should the leaf be written so an interrupted run starts clean?
